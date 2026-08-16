// Refresh stale archive packages when the source has changed (PLAN.md G4).
//
// For each entry that already has a package (archive.ia_item set), is live,
// archivable, and whose capture is older than --min-age-days:
//   1. Re-capture (static or render path, same as archive-packages.js).
//   2. Compare the new primary file's SHA1 to the latest one stored on the
//      IA item (IA's metadata API serves per-file SHA1) — unchanged pages
//      cost one capture and nothing else.
//   3. If changed: upload date-stamped files into the SAME IA item (capture
//      history accumulates on one identifier) and publish a NEW VERSION of
//      the entry's existing Zenodo record (same concept DOI — no record
//      sprawl), then write back sha256 / captured_at / zenodo_doi.
//
// kind: video is excluded — media is effectively immutable and change
// detection would require re-downloading it every run.
//
// Zenodo versions are permanent, like all Zenodo publishes. The min-age gate
// (default 60 days) and monthly schedule bound worst-case growth for pages
// with dynamic HTML that always hash differently.
//
// Env: IA_ACCESS_KEY, IA_SECRET_KEY, ZENODO_TOKEN, PYTHON (default python3).
// Usage: node --env-file=.env scripts/archive-refresh.js
//        [--check-only] [--min-age-days N] [--slug s] [--limit N]

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";

const RESOURCES_DIR = path.join(process.cwd(), "resources");
const REFRESHABLE_KINDS = new Set(["article", "pdf", "guide", "post"]);
const IA_S3 = "https://s3.us.archive.org";
const ZENODO = "https://zenodo.org/api";
const PYTHON = process.env.PYTHON || "python3";

const args = process.argv.slice(2);
const checkOnly = args.includes("--check-only");
const argOf = (name, dflt) => {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : dflt;
};
const minAgeDays = Number(argOf("--min-age-days", 60));
const onlySlug = argOf("--slug", null);
const limit = Number(argOf("--limit", Infinity));

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

const sha1 = (buf) => crypto.createHash("sha1").update(buf).digest("hex");
const langText = (map, fallback = "") =>
  typeof map === "string" ? map : map ? Object.values(map)[0] : fallback;

function captureMode(entry) {
  return entry.render === true || entry.kind === "post" ? "render" : "static";
}

function capture(url, title, outDir, mode) {
  const script = mode === "render" ? "capture_render.py" : "capture.py";
  const result = execFileSync(
    PYTHON,
    [path.join("scripts", script), "--url", url, "--out", outDir,
     "--title", title],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
      timeout: (mode === "render" ? 15 : 3) * 60 * 1000,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  return JSON.parse(result);
}

async function iaFileSha1s(identifier) {
  const res = await fetch(`https://archive.org/metadata/${identifier}`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`IA metadata: HTTP ${res.status}`);
  const meta = await res.json();
  const map = new Map();
  for (const f of meta.files || []) {
    if (f.source === "original" && f.sha1) map.set(f.name, f.sha1);
  }
  return map;
}

// The stored hash to diff against: the newest uploaded variant of the
// primary file ("page.html" originally, "page-YYYYMMDD.html" after refreshes).
function latestPrimarySha1(iaFiles, primaryName) {
  const dot = primaryName.lastIndexOf(".");
  const stem = dot === -1 ? primaryName : primaryName.slice(0, dot);
  const ext = dot === -1 ? "" : primaryName.slice(dot);
  const re = new RegExp(
    `^${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(-\\d{8})?${ext.replace(".", "\\.")}$`,
  );
  const names = [...iaFiles.keys()].filter((n) => re.test(n)).sort();
  return names.length ? iaFiles.get(names.at(-1)) : null;
}

function datedName(name, datestamp) {
  const dot = name.lastIndexOf(".");
  // capture.warc.gz needs the stamp before the compound extension
  if (name.endsWith(".warc.gz")) return name.replace(/\.warc\.gz$/, `-${datestamp}.warc.gz`);
  return dot === -1 ? `${name}-${datestamp}` : `${name.slice(0, dot)}-${datestamp}${name.slice(dot)}`;
}

async function iaUploadDated(identifier, dir, files, datestamp) {
  for (const file of files) {
    const body = fs.readFileSync(path.join(dir, file));
    const res = await fetch(
      `${IA_S3}/${identifier}/${datedName(file, datestamp)}`,
      {
        method: "PUT",
        headers: { Authorization: `LOW ${IA_KEY}:${IA_SECRET}` },
        body,
      },
    );
    if (!res.ok) throw new Error(`IA upload ${file}: HTTP ${res.status}`);
  }
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

async function zenodoNewVersion(oldDoi, dir, files) {
  const oldId = (oldDoi.match(/zenodo\.(\d+)$/) || [])[1];
  if (!oldId) throw new Error(`cannot parse deposition id from DOI ${oldDoi}`);
  const nv = await zenodoJson(`/deposit/depositions/${oldId}/actions/newversion`, {
    method: "POST",
  });
  const draft = await zenodoJson(
    new URL(nv.links.latest_draft).pathname.replace(/^\/api/, ""),
  );
  try {
    // Replace inherited files with the fresh capture.
    const inherited = await zenodoJson(`/deposit/depositions/${draft.id}/files`);
    for (const f of inherited) {
      await zenodoJson(`/deposit/depositions/${draft.id}/files/${f.id}`, {
        method: "DELETE",
      });
    }
    for (const file of files) {
      const body = fs.readFileSync(path.join(dir, file));
      const res = await fetch(`${draft.links.bucket}/${file}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${ZENODO_TOKEN}`,
          "Content-Type": "application/octet-stream",
        },
        body,
      });
      if (!res.ok) throw new Error(`Zenodo file ${file}: HTTP ${res.status}`);
    }
    const pub = await zenodoJson(
      `/deposit/depositions/${draft.id}/actions/publish`,
      { method: "POST" },
    );
    return pub.doi;
  } catch (err) {
    await zenodoJson(`/deposit/depositions/${draft.id}`, { method: "DELETE" })
      .catch(() => {});
    throw err;
  }
}

function setArchiveField(text, key, value) {
  const re = new RegExp(`^(\\s*)${key}:.*$`, "m");
  if (!re.test(text)) throw new Error(`write-back target missing: ${key}`);
  return text.replace(re, `$1${key}: "${value}"`);
}

function ageDays(dateStr) {
  return (Date.now() - new Date(dateStr).getTime()) / 86_400_000;
}

async function refreshEntry(file) {
  const filePath = path.join(RESOURCES_DIR, file);
  let text = fs.readFileSync(filePath, "utf8");
  const entry = yaml.load(text);
  const slug = file.replace(/\.ya?ml$/, "");

  if (onlySlug && slug !== onlySlug) return null;
  if (!REFRESHABLE_KINDS.has(entry.kind)) return { slug, skipped: "kind" };
  if (entry.status !== "live") return { slug, skipped: "not-live" };
  if (!entry.archive?.ia_item) return { slug, skipped: "no-package-yet" };
  if (entry.archive.captured_at && ageDays(entry.archive.captured_at) < minAgeDays) {
    return { slug, skipped: "fresh" };
  }

  const identifier = entry.archive.ia_item.split("/details/")[1];
  const title = langText(entry.title, slug);
  const mode = captureMode(entry);
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), `aj-refresh-${slug}-`));
  try {
    console.log(`capturing  ${slug} <- ${entry.url}${mode === "render" ? "  [render]" : ""}`);
    const cap = capture(entry.url, title, outDir, mode);

    const iaFiles = await iaFileSha1s(identifier);
    const prevSha1 = latestPrimarySha1(iaFiles, cap.primary_file);
    const newSha1 = sha1(fs.readFileSync(path.join(outDir, cap.primary_file)));
    if (prevSha1 && prevSha1 === newSha1) {
      return { slug, skipped: "unchanged" };
    }
    if (checkOnly) return { slug, wouldRefresh: true };

    const datestamp = cap.captured_at.slice(0, 10).replaceAll("-", "");
    const files = fs.readdirSync(outDir);
    console.log(`uploading  ${slug} -> IA ${identifier} (dated files)`);
    await iaUploadDated(identifier, outDir, files, datestamp);
    console.log(`uploading  ${slug} -> Zenodo (new version)`);
    const newDoi = await zenodoNewVersion(entry.archive.zenodo_doi, outDir, files);

    text = setArchiveField(text, "zenodo_doi", newDoi);
    text = setArchiveField(text, "sha256", cap.manifest_sha256);
    text = setArchiveField(text, "captured_at", cap.captured_at.slice(0, 10));
    fs.writeFileSync(filePath, text);
    return { slug, refreshed: newDoi };
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
    const r = await refreshEntry(file);
    if (!r) continue;
    results.push(r);
    if (r.refreshed || r.wouldRefresh || r.failed) done++;
  }
  for (const r of results) {
    if (r.refreshed) console.log(`refreshed  ${r.slug}  new DOI: ${r.refreshed}`);
    if (r.wouldRefresh) console.log(`would refresh  ${r.slug} (check-only)`);
  }
  const failed = results.filter((r) => r.failed).length;
  console.log(
    `\n${results.filter((r) => r.refreshed).length} refreshed, ` +
      `${results.filter((r) => r.wouldRefresh).length} would refresh, ` +
      `${failed} failed, ` +
      `${results.filter((r) => r.skipped).length} skipped` +
      (checkOnly ? "  [CHECK-ONLY]" : ""),
  );
  if (failed) process.exitCode = 1;
}

main();
