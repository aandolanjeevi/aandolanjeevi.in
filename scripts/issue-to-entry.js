// Turn an approved submission issue into a resource entry file (PLAN.md G1).
//
// Reads the issue from env (ISSUE_TITLE, ISSUE_BODY, ISSUE_NUMBER), parses
// both submission formats — the Worker's bot-authored body (**URL:** ...)
// and the GitHub issue-forms template (### Link (URL) ...) — validates
// category/kind against _data/site.yaml, and writes resources/<slug>.yaml.
//
// The entry is a REVIEWED DRAFT: language defaults to "en" and category may
// be null (entries without a valid category don't render), so the PR this
// feeds must be checked by a maintainer before merge.
//
// Prints the created path on stdout. Exit 1 on missing/invalid URL.

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const RESOURCES_DIR = path.join(process.cwd(), "resources");
const site = yaml.load(fs.readFileSync("_data/site.yaml", "utf8"));
const CATEGORIES = new Set(site.categories);
const KINDS = new Set([...site.kinds.archivable, ...site.kinds.interactive]);

const title = process.env.ISSUE_TITLE || "";
const body = process.env.ISSUE_BODY || "";
const issueNumber = process.env.ISSUE_NUMBER || "0";

const clean = (s) =>
  (s || "").trim() === "_No response_" ? "" : (s || "").trim();

// Worker format: "**URL:** https://... \n**Title:** ..." etc.
function parseBotFormat(text) {
  const grab = (key) =>
    clean((text.match(new RegExp(`\\*\\*${key}:\\*\\* *(.+)`)) || [])[1]);
  const why = (text.match(/\*\*Why it belongs:\*\*\n\n((?:> ?.*\n?)+)/) || [])[1];
  return {
    url: grab("URL"),
    title: grab("Title"),
    category: grab("Category"),
    kind: grab("Type"),
    why: clean((why || "").replace(/^> ?/gm, "")),
  };
}

// Issue-forms format: "### Link (URL)\n\nhttps://..." sections.
function parseFormsFormat(text) {
  const sections = {};
  const re = /^### (.+)$/gm;
  const headers = [...text.matchAll(re)];
  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].index + headers[i][0].length;
    const end = i + 1 < headers.length ? headers[i + 1].index : text.length;
    sections[headers[i][1].trim()] = clean(text.slice(start, end));
  }
  return {
    url: sections["Link (URL)"] || "",
    title: sections["Title"] || "",
    category: sections["Category"] || "",
    kind: sections["Type"] || "",
    why: sections["Why does this belong here?"] || "",
  };
}

function validUrl(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

function slugify(s) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || `entry-${issueNumber}`;
}

function uniqueSlug(base) {
  let slug = base;
  for (let n = 2; fs.existsSync(path.join(RESOURCES_DIR, `${slug}.yaml`)); n++) {
    slug = `${base}-${n}`;
  }
  return slug;
}

const parsed = body.includes("**URL:**")
  ? parseBotFormat(body)
  : parseFormsFormat(body);

const url = validUrl(parsed.url);
if (!url) {
  console.error(`No valid URL found in issue #${issueNumber}`);
  process.exit(1);
}

const entryTitle =
  parsed.title ||
  title.replace(/^Link submission:\s*/i, "").trim() ||
  new URL(url).hostname;
const category = CATEGORIES.has(parsed.category) ? parsed.category : null;
const kind = KINDS.has(parsed.kind) ? parsed.kind : "article";
const slug = uniqueSlug(slugify(entryTitle));
const today = new Date().toISOString().slice(0, 10);

const q = (s) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const descriptionBlock = parsed.why
  ? `description:\n  en: >-\n${parsed.why.split("\n").map((l) => `    ${l}`).join("\n")}\n`
  : "";

const entry = `# From submission issue #${issueNumber}. Review before merge:
# language correct? category set? title/description translations?
url: ${q(url)}
title:
  en: ${q(entryTitle)}
${descriptionBlock}language: en
category: ${category ?? "null # REQUIRED — entry will not render until set"}
kind: ${kind}
added: ${today}
status: live
archive:
  wayback: null
  ia_item: null
  zenodo_doi: null
  sha256: null
  captured_at: null
  screenshot: null
`;

const file = path.join(RESOURCES_DIR, `${slug}.yaml`);
fs.writeFileSync(file, entry);
yaml.load(entry); // self-check: must parse
console.log(`resources/${slug}.yaml`);
