# aandolanjeevi.in — Plan

A resource repository for public protests: links to guides, news, and helpful
resources, plus links to interactive apps (maps, forms), with posts from
admins. Free hosting only. Links are archived so the site retains a copy even
if the source disappears.

## Locked decisions

- **Generator:** Eleventy (11ty). Chosen for simplicity, Node-only toolchain,
  and low barrier for future maintainers.
- **Content model:** every resource is a small data entry (YAML/JSON) —
  `url`, `title`, `description`, `category`, `kind`, `language`, `added`,
  archive metadata. Posts are plain markdown.
- **Taxonomy:** no free tags. Six fixed topical categories, orthogonal to
  `kind`: **Legal, Safety & Health, Digital Security, News & Media,
  Organizing, Aid & Support** — each with per-language labels in the locale
  files. Ceiling of 8; extending is a deliberate maintainer decision.
- **Entry text i18n:** `title`/`description` are language-keyed maps; partial
  translation is fine, templates fall back to available languages. Whenever
  text is shown in a language other than the entry's own, the UI clearly
  marks it — e.g. "(translated from Hindi)".
- **Classification:** human-set `kind` field at submission time
  (`article | pdf | guide | video | post | app | form | map`),
  script-assisted suggestions only. `article|pdf|guide|video|post` go through
  the full archive pipeline (video via yt-dlp — large captures accepted);
  `app|form|map` get link + screenshot.
- **Archival:** offload archive bytes to the Internet Archive; the repo keeps
  only the index and metadata. WARC capture packages (page + media + manifest)
  are uploaded as IA items. Backup custody (in case IA items are ever taken
  down): the same packages go to **Zenodo restricted-access records** — public
  metadata, files released on approved request — with each package's SHA-256
  published in the index so any surviving copy can be verified. No
  cryptographic timestamping (OpenTimestamps etc.) — out of scope.
- **Submissions:** anonymous from day one. An easy form on the website posts
  to a free Cloudflare Worker, which files a bot-authored GitHub issue — no
  GitHub account required, and submitter identity never appears in the public
  issue. Maintainers review relevance before anything is published. Later:
  approval + right label automatically adds the entry to the site.
- **Design:** extremely minimal and neutral. Semantic HTML, light CSS,
  `prefers-color-scheme` dark/light, accessible by default, near-zero JS.
  Typeface: self-hosted **Noto Sans** with per-script subsets — the one family
  with coverage across all Indian scripts (Devanagari, Bengali, Tamil, Telugu,
  Kannada, Malayalam, Gujarati, Gurmukhi, Odia, …); no font CDNs.
- **Multilingual from day one:** all UI strings live in per-language locale
  files (Hindi + English at launch, any Indian language addable without code
  changes). Entries and posts stay in their source language, tagged and
  filterable via the `language` field.
- **Hosting:** Cloudflare Pages — unlimited bandwidth on the free tier, and
  the submission Worker lives on the same platform. PR preview deploys
  included.

## Must-do

- **M1 (P1) — Scaffold the 11ty site. ✅ DONE.** Link index rendered from data
  files, grouped by category with kind/language badges. _Depends on: M2._
- **M2 (P1) — Taxonomy + schema. DECIDED.** Kinds:
  `article | pdf | guide | video | post | app | form | map`. Categories: the
  six above. Schema: one YAML file per entry (filename = slug) with `url`,
  language-keyed `title`/`description`, `language`, `category`, `kind`,
  `added`, `status` (`live|dead`), and an `archive` block (`wayback`,
  `ia_item`, `zenodo_doi`, `sha256`, `captured_at`, `screenshot`).
  _Depends on: —._
- **M3 (P1) — Deploy + domain. ✅ DONE.** Cloudflare Pages wired to
  `aandolanjeevi.in`, builds on merge to `main`, PR previews. _Depends on: M1._
- **M4 (P2) — Minimal neutral theme. ✅ DONE.** Self-hosted Noto Sans (Latin +
  Devanagari subsets, vendored by `scripts/fetch-fonts.js`), readable defaults,
  dark/light via `prefers-color-scheme`, semantic/accessible markup.
  _Depends on: M1._
- **M5 (P2) — Admin posts. ✅ DONE.** Markdown post collection + Atom feed.
  _Depends on: M1._
- **M6 (P2) — Anonymous submission path. 🔨 BUILT, awaiting deploy.** Static
  form (`pages/submit.njk`, fields: url, title, category, kind, why) posting to
  a Cloudflare Worker (`workers/submit-worker/`) that files a bot-authored
  GitHub issue — no GitHub account needed, no submitter identity recorded.
  Honeypot + optional Turnstile for spam; per-language thanks/error pages;
  falls back to a GitHub-issue link until `submitEndpoint` is set. GitHub Issue
  Forms template (`.github/ISSUE_TEMPLATE/`) is the secondary path. **Your
  steps:** create a bot token, `wrangler secret put GITHUB_TOKEN`,
  `wrangler deploy`, set `submitEndpoint` in `_data/site.yaml` — see the worker
  README. Maintainer converts approved issues to entries manually (automate in
  G1/G2). _Depends on: M1, M3._
- **M7 (P2) — Archival v1: Wayback save. ✅ DONE.** GitHub Action
  (`scripts/archive-wayback.js`) triggers Internet Archive Save Page Now for
  every new link on merge, weekly, and on demand; stores the snapshot URL in
  the entry. Uses an optional archive.org S3 key for higher limits.
  _Depends on: M1._
- **M8 (P2) — Archival v2: WARC packages. 🔨 BUILT, verified in test mode.**
  `scripts/capture.py` (page + assets → WARC + hashed manifest) +
  `scripts/archive-packages.js` (upload to IA, mirror to a restricted Zenodo
  record, write back ia_item / zenodo_doi / sha256 / captured_at). Weekly +
  on-demand workflow. End-to-end verified against the real APIs with `--test`
  (IA test_collection, Zenodo draft deleted). First real run is gated on the
  org "Actions may create PRs" toggle; note Zenodo publishes are permanent.
  _Depends on: M2, M7._
- **M9 (P3) — Dead-link failover. ✅ DONE.** Weekly link check
  (`scripts/check-links.js`, conservative: 404/410 or vanished domain only);
  a dead source flips `status` and the site promotes the archived copy to the
  primary link. _Depends on: M7 (better with M8)._
- **M10 (P2) — Multilingual UI.** Every interface string externalized to
  per-language locale files (JSON/YAML); Hindi + English ship at launch with a
  language toggle; adding another Indian language means adding one locale file,
  zero code. Translation-only collaboration is a first-class contribution
  path: locale files are editable standalone (GitHub web UI / PR), with a
  "contribute translations" section in CONTRIBUTING. Text displayed outside
  its source language carries a visible "(translated from …)" marker.
  _Depends on: M1, M4._
- **M11 (P3) — Policies + maintainer runbook.** Content inclusion policy, PII
  /minors rules, copyright posture (Wayback links for news articles;
  self-hosted/IA copies for guides and redistribution-friendly material),
  takedown request handling via a dedicated monitored mailbox
  (`takedown [at] aandolanjeevi.in`), and a "how to run this site" doc for
  future maintainers. _Depends on: —._

## Good-to-have

- **G1 (P1) — Submission automation.** Approved label on an issue triggers an
  Action that opens a PR adding the data entry; merge deploys it.
  _Depends on: M6._
- **G2 (P2) — Client-side search.** Pagefind — static, free, no backend.
  _Depends on: M1._
- **G3 (P2) — Hosted translation platform.** Weblate (free for libre
  projects) or similar wired to the locale files, so translators never need
  GitHub at all. _Depends on: M10._
- **G4 (P2) — Archive refresh.** Scheduled re-capture of changed pages;
  commit/update only on diff. _Depends on: M8._
- **G5 (P3) — Public index export.** Machine-readable JSON/CSV of the full
  index so others can mirror or build on it. _Depends on: M1._
- **G6 (P3) — Decap CMS.** Web editing UI for non-technical admins (posts and
  entries) committing straight to the repo. _Depends on: M1._
- **G7 (P3) — Screenshots for interactive apps.** Periodic screenshot capture
  for `app|form|map` entries as their archival stand-in. _Depends on: M2, M8._
- **G8 (P3) — Privacy-respecting analytics.** GoatCounter or none at all;
  never Google Analytics on a protest site. _Depends on: M3._
- **G9 (P3) — Repo mirror.** Automatic mirror to a second forge (e.g.
  Codeberg) so GitHub is not a single point of failure. _Depends on: —._

## Open questions

- **Governance** — second maintainer with org admin + 2FA; domain renewal
  ownership (registrar account is a single point of failure). Also: set up
  and monitor the two published mailboxes (`cpg.enforcement@` and
  `takedown@`) and the Zenodo account (a second maintainer needs access to
  approve file requests).

## Out of scope

- Cryptographic verification (hashing manifests for proof, OpenTimestamps,
  evidence packaging). This is an archive of resources, not an evidence
  record.
- Hosting user data of any kind; no accounts, no tracking.
