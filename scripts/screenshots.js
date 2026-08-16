// Capture screenshots for interactive entries (PLAN.md G7).
//
// For each live entry of an interactive kind (app | form | map | source)
// with no screenshot yet (or all of them with --refresh): run
// capture_screenshot.py, store the image at assets/screenshots/<slug>.webp,
// and write archive.screenshot into the entry.
//
// Requires Docker (browsertrix). Env: PYTHON (default python3).
// Usage: node scripts/screenshots.js [--slug s] [--limit N] [--refresh]

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const RESOURCES_DIR = path.join(process.cwd(), "resources");
const SHOTS_DIR = path.join("assets", "screenshots");
const INTERACTIVE_KINDS = new Set(["app", "form", "map", "source"]);
const PYTHON = process.env.PYTHON || "python3";

const args = process.argv.slice(2);
const refresh = args.includes("--refresh");
const argOf = (name, dflt) => {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : dflt;
};
const onlySlug = argOf("--slug", null);
const limit = Number(argOf("--limit", Infinity));

function setArchiveField(text, key, value) {
  const re = new RegExp(`^(\\s*)${key}:.*$`, "m");
  if (!re.test(text)) throw new Error(`write-back target missing: ${key}`);
  return text.replace(re, `$1${key}: "${value}"`);
}

function processEntry(file) {
  const filePath = path.join(RESOURCES_DIR, file);
  let text = fs.readFileSync(filePath, "utf8");
  const entry = yaml.load(text);
  const slug = file.replace(/\.ya?ml$/, "");

  if (onlySlug && slug !== onlySlug) return null;
  if (!INTERACTIVE_KINDS.has(entry.kind)) return { slug, skipped: "kind" };
  if (entry.status !== "live") return { slug, skipped: "not-live" };
  if (entry.archive?.screenshot && !refresh) return { slug, skipped: "has-screenshot" };
  if (!/^\s*screenshot:/m.test(text)) {
    console.error(`FAILED     ${slug}: missing archive block`);
    return { slug, failed: true };
  }

  const shotPath = path.join(SHOTS_DIR, `${slug}.webp`);
  try {
    console.log(`capturing  ${slug} <- ${entry.url}`);
    execFileSync(
      PYTHON,
      [path.join("scripts", "capture_screenshot.py"),
       "--url", entry.url, "--out", shotPath],
      { stdio: ["ignore", "inherit", "inherit"], timeout: 15 * 60 * 1000 },
    );
    fs.writeFileSync(filePath, setArchiveField(text, "screenshot", `/${shotPath.replaceAll(path.sep, "/")}`));
    return { slug, captured: shotPath };
  } catch (err) {
    console.error(`FAILED     ${slug}: ${err.message}`);
    return { slug, failed: true };
  }
}

const files = fs.readdirSync(RESOURCES_DIR).filter((f) => /\.ya?ml$/.test(f));
let done = 0;
const results = [];
for (const file of files) {
  if (done >= limit) break;
  const r = processEntry(file);
  if (!r) continue;
  results.push(r);
  if (r.captured || r.failed) done++;
}
for (const r of results.filter((r) => r.captured)) {
  console.log(`captured   ${r.slug} -> ${r.captured}`);
}
const failed = results.filter((r) => r.failed).length;
console.log(
  `\n${results.filter((r) => r.captured).length} captured, ${failed} failed, ` +
    `${results.filter((r) => r.skipped).length} skipped`,
);
if (failed) process.exitCode = 1;
