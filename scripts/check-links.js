// Check each resource link and flip its `status` between live and dead so the
// site can fail over to the archived copy (PLAN.md M9).
//
// Deliberately conservative to avoid flapping: a link is only marked dead on
// an unambiguous signal (HTTP 404/410, or a domain that no longer resolves).
// Transient trouble — timeouts, connection refused, 5xx — leaves the status
// unchanged so a brief outage never hides a live resource behind its archive.
//
// Usage: node scripts/check-links.js [--limit N]

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const RESOURCES_DIR = path.join(process.cwd(), "resources");
const ATTEMPTS = 3;
const RETRY_DELAY_MS = 3_000;
const TIMEOUT_MS = 20_000;
const UA =
  "Mozilla/5.0 (compatible; aandolanjeevi-linkcheck/1.0; +https://aandolanjeevi.in)";

// Statuses that mean "the page exists" even though it didn't return 200.
const ALIVE_STATUSES = new Set([401, 403, 405, 429]);

const args = process.argv.slice(2);
const limitArg = args.indexOf("--limit");
const limit = limitArg !== -1 ? Number(args[limitArg + 1]) : Infinity;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One probe -> "alive" | "dead" | "unknown".
async function probe(url) {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 404 || res.status === 410) return "dead";
    if (res.ok || res.status < 400 || ALIVE_STATUSES.has(res.status))
      return "alive";
    return "unknown"; // 5xx and other 4xx: ambiguous
  } catch (err) {
    // Domain no longer exists -> dead. Other network faults are ambiguous.
    if (err?.cause?.code === "ENOTFOUND") return "dead";
    return "unknown";
  }
}

// Classify over several attempts. "dead" only if every attempt agrees dead and
// none said alive; "alive" if any attempt said alive; otherwise "unknown".
async function classify(url) {
  let sawDead = false;
  for (let i = 0; i < ATTEMPTS; i++) {
    const r = await probe(url);
    if (r === "alive") return "alive";
    if (r === "dead") sawDead = true;
    if (i < ATTEMPTS - 1) await sleep(RETRY_DELAY_MS);
  }
  return sawDead ? "dead" : "unknown";
}

function setStatus(text, value) {
  return text.replace(/^(\s*)status:.*$/m, `$1status: ${value}`);
}

async function checkEntry(file) {
  const filePath = path.join(RESOURCES_DIR, file);
  let text = fs.readFileSync(filePath, "utf8");
  const entry = yaml.load(text);
  if (!entry?.url) return { file, result: "no-url" };

  const verdict = await classify(entry.url);
  if (verdict === "unknown") return { file, result: "unreachable-unchanged" };

  const current = entry.status ?? "live";
  const next = verdict === "dead" ? "dead" : "live";
  if (current === next) return { file, result: `unchanged-${next}` };

  fs.writeFileSync(filePath, setStatus(text, next));
  return { file, result: `${current}->${next}`, changed: true };
}

async function main() {
  if (!fs.existsSync(RESOURCES_DIR)) {
    console.error("No resources/ directory.");
    process.exit(1);
  }
  const files = fs
    .readdirSync(RESOURCES_DIR)
    .filter((f) => /\.ya?ml$/.test(f))
    .slice(0, limit);

  const results = [];
  for (const file of files) results.push(await checkEntry(file));

  for (const r of results) console.log(`${r.result.padEnd(22)} ${r.file}`);
  const changed = results.filter((r) => r.changed).length;
  console.log(`\n${changed} status change(s) across ${files.length} entries`);
}

main();
