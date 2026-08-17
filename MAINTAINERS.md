# Maintainer Runbook

How this site runs, and what to do when it doesn't. Assumes no prior context
— written for the maintainer who inherits this repo cold.

## The stack in one paragraph

Eleventy (11ty) static site, deployed by Cloudflare Pages on every merge to
`main` (build: `npm run build`, output: `_site`). `main` is protected —
every change lands through a pull request; CI bots open and auto-merge their
own PRs for mechanical metadata. Content is data: one YAML file per resource
in `resources/`, markdown posts in `posts/`, UI strings per language in
`locales/`. See README.md for the entry schema and CONTRIBUTING.md for
workflows including translations.

## The three bots (GitHub Actions)

| Workflow | When | What it does |
|---|---|---|
| `archive.yml` (Wayback) | resources push to main, Mondays, manual | Saves each new link to the Wayback Machine, writes the snapshot URL into the entry via auto-merged PR |
| `check-links.yml` | Wednesdays, manual | Flips `status: live/dead` (conservative: 404/410 or dead domain only); the site then serves the archived copy as primary |
| `archive-packages.yml` | Fridays, manual (`test` input for dry runs) | Captures each archivable entry (WARC package), uploads to an Internet Archive item + restricted Zenodo record, writes identifiers back via auto-merged PR |
| `submission-to-entry.yml` | `approved` label added to a `submission` issue | Drafts the entry file and opens a **review PR** (not auto-merged) with a checklist; comments the PR link on the issue |
| `archive-refresh.yml` | 1st of the month, manual (`check_only` input) | Re-captures packages older than 60 days; when the page changed, adds dated files to the same IA item and publishes a **new version** of the existing Zenodo record |
| `screenshots.yml` | 2nd of the month, manual (`refresh` input) | Viewport screenshots for interactive entries (app/form/map/source), stored in `assets/screenshots/` and linked from each entry |

Capture modes (automatic): `static` (default), `render` (headless browser in
Docker — entries with `render: true` or `kind: post`), `video` (yt-dlp —
`kind: video`).

**`render: true` decision rule:** set it on archivable entries whose content
only exists after JavaScript runs — verify with
`curl -sL <url> | sed 's/<[^>]*>/ /g'`: chrome-around-nothing means render.
`kind: post` renders automatically; on interactive kinds the flag is inert
(never packaged; screenshots always use the browser). Missing the flag
archives an empty shell permanently — the fix is the farmers-protest
procedure: set `render: true`, null the package fields (keep a comment noting
the superseded identifiers), let the next packages run re-capture.

**Known limits:** YouTube blocks CI runner IPs for video downloads — run
`npm run archive-packages` locally (needs `.env`, see below) for YouTube
entries. Never put account cookies into CI to work around this.

## Publishing a submission

1. Review the `submission` issue (see POLICY.md for inclusion criteria).
2. Add the **`approved`** label — automation drafts `resources/<slug>.yaml`
   and opens a review PR linked on the issue.
3. On the PR, work the checklist: set `language`, set `category` (unset
   entries don't render), check `kind` / `paywalled` / `render`, add
   translations if you can.
4. Merge. The issue closes automatically, the site deploys, and the Wayback
   bot archives the link within minutes.

To decline a submission, close the issue with a short comment instead.

## Credentials

| Secret | Where | Purpose |
|---|---|---|
| `IA_ACCESS_KEY` / `IA_SECRET_KEY` | Actions secrets + local `.env` | archive.org uploads and higher Wayback limits |
| `ZENODO_TOKEN` | Actions secrets + local `.env` | Zenodo cold-storage records |
| `GITHUB_TOKEN` (bot PAT) | Worker secret (wrangler) | Submission form files issues |
| `TURNSTILE_SECRET` | Worker secret (wrangler) | Form spam protection |

Local runs: `cp .env.example .env`, fill values, never commit it.

## Zenodo access requests

Cold-storage records are restricted: metadata public, files on approved
request. Requests arrive by email to the Zenodo account owner. Approve when
the requester states a reasonable purpose (research, journalism, legal,
restoration of a lost source) — the point of the archive is to be usable.

## When a packages run goes red

1. Read the run log: each entry line says `capturing/uploading/packaged` or
   `FAILED` with a reason.
2. A **failed capture** is safe — nothing was published; fix the cause (or
   the entry) and re-dispatch.
3. If something **published but wasn't recorded** (should be prevented by
   the precondition check, but if it ever happens): find the identifiers in
   the log, download `manifest.json` from the IA item, `sha256` it, and
   write all four archive fields into the entry by hand — see PR #14 for a
   worked example. Never leave a published package unrecorded: the next run
   would mint a duplicate permanent Zenodo record.

## Removing an entry

Delete its YAML file via PR — the site updates on merge. The IA item and
Zenodo record persist independently: IA items can be taken down via IA
support; Zenodo records are permanent but their files can be closed to new
access. See POLICY.md for when removal is warranted.

## Accounts and custody (bus-factor checklist)

- Two org admins on GitHub, both with 2FA.
- Domain registrar + Cloudflare account access documented for a second
  person; the domain expiring is the single fastest way to lose everything.
- The two published mailboxes (`cpg.enforcement@`, `takedown@`) forward to
  someone who actually reads them.
- A second person can access the Zenodo account (file-release requests must
  not dead-end).
