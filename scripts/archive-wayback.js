// Save each resource link to the Internet Archive Wayback Machine and record
// the snapshot URL back into its YAML entry (PLAN.md M7).
//
// Strategy, per entry with no archive.wayback yet and status: live:
//   1. Ask the availability API whether a snapshot already exists.
//   2. If not, trigger Save Page Now (best effort) and poll availability.
//   3. Write archive.wayback + archive.captured_at when a snapshot is found;
//      otherwise leave the entry untouched so the next run retries it.
//
// Unauthenticated Save Page Now is heavily rate-limited (HTTP 429). Providing
// IA_ACCESS_KEY / IA_SECRET_KEY (an archive.org S3 key) raises the limits and
// is used automatically when present.
//
// Usage: node scripts/archive-wayback.js [--check-only] [--limit N]

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const RESOURCES_DIR = path.join(process.cwd(), "resources");
const ARCHIVABLE_STATUS = "live";
const POLL_ATTEMPTS = 6;
const POLL_DELAY_MS = 10_000;

const args = process.argv.slice(2);
const checkOnly = args.includes("--check-only");
const limitArg = args.indexOf("--limit");
const limit = limitArg !== -1 ? Number(args[limitArg + 1]) : Infinity;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function iaAuthHeaders() {
  const key = process.env.IA_ACCESS_KEY;
  const secret = process.env.IA_SECRET_KEY;
  return key && secret ? { Authorization: `LOW ${key}:${secret}` } : {};
}

// Returns { url, timestamp } for the closest snapshot, or null.
async function checkAvailability(target) {
  const api = `https://archive.org/wayback/available?url=${encodeURIComponent(target)}`;
  try {
    const res = await fetch(api, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    const data = await res.json();
    const snap = data?.archived_snapshots?.closest;
    if (snap?.available && snap.url) {
      return { url: snap.url.replace(/^http:/, "https:"), timestamp: snap.timestamp };
    }
  } catch {
    /* network error — treat as no snapshot, retry next run */
  }
  return null;
}

async function triggerSave(target) {
  try {
    await fetch(`https://web.archive.org/save/${target}`, {
      method: "GET",
      headers: iaAuthHeaders(),
      redirect: "manual",
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    /* best effort; availability polling decides the outcome */
  }
}

// YYYYMMDDhhmmss -> YYYY-MM-DD
function timestampToDate(ts) {
  return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
}

// Update a single top-level key inside the archive block, preserving the
// file's formatting and comments (js-yaml dump would discard both).
function setArchiveField(text, key, value) {
  const re = new RegExp(`^(\\s*)${key}:.*$`, "m");
  return text.replace(re, `$1${key}: "${value}"`);
}

async function archiveEntry(file) {
  const filePath = path.join(RESOURCES_DIR, file);
  let text = fs.readFileSync(filePath, "utf8");
  const entry = yaml.load(text);

  if (entry?.status !== ARCHIVABLE_STATUS) return { file, skipped: "not-live" };
  if (entry?.archive?.wayback) return { file, skipped: "already-archived" };
  if (!entry?.url) return { file, skipped: "no-url" };

  let snap = await checkAvailability(entry.url);
  if (!snap && !checkOnly) {
    await triggerSave(entry.url);
    for (let i = 0; i < POLL_ATTEMPTS && !snap; i++) {
      await sleep(POLL_DELAY_MS);
      snap = await checkAvailability(entry.url);
    }
  }
  if (!snap) return { file, skipped: "no-snapshot-yet" };

  text = setArchiveField(text, "wayback", snap.url);
  text = setArchiveField(text, "captured_at", timestampToDate(snap.timestamp));
  fs.writeFileSync(filePath, text);
  return { file, archived: snap.url };
}

async function main() {
  if (!fs.existsSync(RESOURCES_DIR)) {
    console.error("No resources/ directory.");
    process.exit(1);
  }
  const files = fs
    .readdirSync(RESOURCES_DIR)
    .filter((f) => /\.ya?ml$/.test(f));

  let processed = 0;
  const results = [];
  for (const file of files) {
    if (processed >= limit) break;
    const result = await archiveEntry(file);
    results.push(result);
    if (result.archived || result.skipped === "no-snapshot-yet") processed++;
  }

  const archived = results.filter((r) => r.archived);
  for (const r of archived) console.log(`archived  ${r.file} -> ${r.archived}`);
  for (const r of results.filter((r) => r.skipped === "no-snapshot-yet"))
    console.log(`pending   ${r.file} (no snapshot yet; will retry)`);
  console.log(
    `\n${archived.length} archived, ${files.length} entries total` +
      (checkOnly ? " (check-only: no saves triggered)" : ""),
  );
}

main();
