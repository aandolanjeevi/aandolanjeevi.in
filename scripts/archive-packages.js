// Archival v2 (PLAN.md M8): durable WARC packages for every archivable entry.
//
// For each resource entry with an archivable kind, live status, and no
// archive.ia_item yet:
//   1. capture   scripts/capture.py -> WARC + primary file + hashed manifest
//   2. IA        upload the package as an Internet Archive item
//   3. Zenodo    mirror it to a restricted-access record (cold storage,
//                files released on approved request) and publish
//   4. write back ia_item, zenodo_doi, sha256, captured_at into the entry
//
// Zenodo publishes are PERMANENT — records cannot be deleted once published.
// Use --test for a full end-to-end dry run with no lasting side effects:
// IA goes to test_collection (auto-expires ~30 days), the Zenodo deposition
// stays a draft and is deleted, and nothing is written back.
//
// Env: IA_ACCESS_KEY, IA_SECRET_KEY, ZENODO_TOKEN, PYTHON (default python3).
// Usage: node --env-file=.env scripts/archive-packages.js
//        [--slug <slug>] [--limit N] [--test]

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";

const RESOURCES_DIR = path.join(process.cwd(), "resources");
const ARCHIVABLE_KINDS = new Set(["article", "pdf", "guide", "video", "post"]);
const IA_S3 = "https://s3.us.archive.org";
const ZENODO = "https://zenodo.org/api";
const PYTHON = process.env.PYTHON || "python3";

const args = process.argv.slice(2);
const TEST = args.includes("--test");
const slugArg = args.indexOf("--slug");
const onlySlug = slugArg !== -1 ? args[slugArg + 1] : null;
const limitArg = args.indexOf("--limit");
const limit = limitArg !== -1 ? Number(args[limitArg + 1]) : Infinity;

function need(name) {
  if (!process.env[name]) {
    console.error(`Missing env: ${name}`);
    process.exit(1);
  }
  return process.env[name];
}
const IA_KEY = need("IA_ACCESS_KEY");
const IA_SECRET = need("IA_SECRET_KEY");
const ZENODO_TOKEN = need("ZENODO_TOKEN");

const langText = (map, fallback = "") =>
  typeof map === "string" ? map : map ? Object.values(map)[0] : fallback;

function capture(url, title, outDir) {
  const result = execFileSync(
    PYTHON,
    [path.join("scripts", "capture.py"), "--url", url, "--out", outDir,
     "--title", title],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  return JSON.parse(result);
}

async function iaUpload(identifier, dir, files, meta) {
  for (const [i, file] of files.entries()) {
    const headers = {
      Authorization: `LOW ${IA_KEY}:${IA_SECRET}`,
      "x-amz-auto-make-bucket": "1",
    };
    // Item metadata rides on the first upload.
    if (i === 0) {
      headers["x-archive-meta01-collection"] = TEST ? "test_collection" : "opensource";
      headers["x-archive-meta-mediatype"] = "data";
      headers["x-archive-meta-title"] = meta.title;
      headers["x-archive-meta-originalurl"] = meta.url;
      headers["x-archive-meta-description"] = meta.description;
    }
    const body = fs.readFileSync(path.join(dir, file));
    const res = await fetch(`${IA_S3}/${identifier}/${file}`, {
      method: "PUT",
      headers,
      body,
    });
    if (!res.ok) {
      throw new Error(`IA upload ${file}: HTTP ${res.status} ${await res.text()}`);
    }
  }
  return `https://archive.org/details/${identifier}`;
}

async function zenodoJson(pathname, init = {}) {
  const res = await fetch(`${ZENODO}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${ZENODO_TOKEN}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`Zenodo ${pathname}: HTTP ${res.status} ${await res.text()}`);
  }
  return res.status === 204 ? null : res.json();
}

async function zenodoUpload(dir, files, meta) {
  const dep = await zenodoJson("/deposit/depositions", {
    method: "POST",
    body: "{}",
  });
  try {
    for (const file of files) {
      const body = fs.readFileSync(path.join(dir, file));
      const res = await fetch(`${dep.links.bucket}/${file}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${ZENODO_TOKEN}` },
        body,
      });
      if (!res.ok) throw new Error(`Zenodo file ${file}: HTTP ${res.status}`);
    }
    await zenodoJson(`/deposit/depositions/${dep.id}`, {
      method: "PUT",
      body: JSON.stringify({
        metadata: {
          title: meta.title,
          upload_type: "other",
          description:
            `Cold-storage archival package (WARC + manifest) of ` +
            `<a href="${meta.url}">${meta.url}</a>, captured for the ` +
            `aandolanjeevi.in resource archive. Files are restricted; ` +
            `access is granted on reasonable request.`,
          creators: [{ name: "aandolanjeevi.in archive" }],
          access_right: "restricted",
          access_conditions:
            "Backup copy held against source loss. State briefly why you " +
            "need the files and access will be granted.",
        },
      }),
    });

    if (TEST) {
      await zenodoJson(`/deposit/depositions/${dep.id}`, { method: "DELETE" });
      return { doi: "(test: draft deleted)", id: dep.id };
    }
    const pub = await zenodoJson(`/deposit/depositions/${dep.id}/actions/publish`, {
      method: "POST",
    });
    return { doi: pub.doi, id: pub.id };
  } catch (err) {
    // Never leave a stray draft behind.
    await zenodoJson(`/deposit/depositions/${dep.id}`, { method: "DELETE" }).catch(() => {});
    throw err;
  }
}

// Fields the write-back must be able to record. Checked BEFORE anything is
// published: a permanent Zenodo record with nowhere to write its DOI would be
// re-published as a duplicate on every later run (happened 2026-08-14).
const WRITEBACK_KEYS = ["ia_item", "zenodo_doi", "sha256", "captured_at"];

function hasWritebackKeys(text) {
  return WRITEBACK_KEYS.every((k) => new RegExp(`^\\s*${k}:`, "m").test(text));
}

// IA identifiers allow only [A-Za-z0-9._-]; a raw slug with spaces made the
// upload 400 on 2026-08-14.
function iaSafe(slug) {
  return slug.replace(/[^A-Za-z0-9._-]+/g, "-");
}

function setArchiveField(text, key, value) {
  const re = new RegExp(`^(\\s*)${key}:.*$`, "m");
  if (!re.test(text)) throw new Error(`write-back target missing: ${key}`);
  return text.replace(re, `$1${key}: "${value}"`);
}

async function processEntry(file) {
  const filePath = path.join(RESOURCES_DIR, file);
  let text = fs.readFileSync(filePath, "utf8");
  const entry = yaml.load(text);
  const slug = file.replace(/\.ya?ml$/, "");

  if (onlySlug && slug !== onlySlug) return null;
  if (!ARCHIVABLE_KINDS.has(entry.kind)) return { slug, skipped: "kind" };
  if (entry.status !== "live") return { slug, skipped: "not-live" };
  if (entry.archive?.ia_item) return { slug, skipped: "already-archived" };
  if (!hasWritebackKeys(text)) {
    console.error(
      `FAILED     ${slug}: missing archive block fields — add the archive: ` +
        `block before this entry can be packaged (nothing was published)`,
    );
    return { slug, failed: true };
  }

  const title = langText(entry.title, slug);
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), `aj-${slug}-`));
  try {
    console.log(`capturing  ${slug} <- ${entry.url}`);
    const cap = capture(entry.url, title, outDir);
    const files = fs.readdirSync(outDir);

    const datestamp = cap.captured_at.slice(0, 10).replaceAll("-", "");
    const identifier = `${TEST ? "test-" : ""}aandolanjeevi-${iaSafe(slug)}-${datestamp}`;
    console.log(`uploading  ${slug} -> IA ${identifier}`);
    const iaUrl = await iaUpload(identifier, outDir, files, {
      title,
      url: entry.url,
      description:
        `Archival package (WARC, manifest, page copy) of ${entry.url} ` +
        `for the aandolanjeevi.in resource archive.`,
    });

    console.log(`uploading  ${slug} -> Zenodo (restricted)`);
    const zen = await zenodoUpload(outDir, files, { title, url: entry.url });

    if (!TEST) {
      text = setArchiveField(text, "ia_item", iaUrl);
      text = setArchiveField(text, "zenodo_doi", zen.doi);
      text = setArchiveField(text, "sha256", cap.manifest_sha256);
      text = setArchiveField(text, "captured_at", cap.captured_at.slice(0, 10));
      fs.writeFileSync(filePath, text);
    }
    return { slug, ia: iaUrl, zenodo: zen.doi };
  } catch (err) {
    console.error(`FAILED     ${slug}: ${err.message}`);
    return { slug, failed: true };
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
}

async function main() {
  const files = fs.readdirSync(RESOURCES_DIR).filter((f) => /\.ya?ml$/.test(f));
  let done = 0;
  const results = [];
  for (const file of files) {
    if (done >= limit) break;
    const r = await processEntry(file);
    if (!r) continue;
    results.push(r);
    if (r.ia || r.failed) done++;
  }
  const ok = results.filter((r) => r.ia);
  const failed = results.filter((r) => r.failed);
  for (const r of ok) console.log(`packaged   ${r.slug}  ${r.ia}  DOI:${r.zenodo}`);
  console.log(
    `\n${ok.length} packaged, ${failed.length} failed, ` +
      `${results.filter((r) => r.skipped).length} skipped` +
      (TEST ? "  [TEST MODE: no publishes, no write-backs]" : ""),
  );
  if (failed.length) process.exitCode = 1;
}

main();
