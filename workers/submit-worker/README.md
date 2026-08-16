# Submission Worker

Receives the website's "Submit a link" form and files a GitHub issue authored
by a bot token, so submitters need no GitHub account and their identity is never
recorded. Part of PLAN.md M6.

## How it fits together

```
visitor → POST /submit form → this Worker → GitHub issue (label: submission)
                                   │
                                   └→ 303 redirect → site /{lang}/submit/thanks
```

A maintainer reviews the issue and, if relevant, adds the `approved` label —
automation then drafts the entry and opens a review PR (PLAN.md G1).

## One-time setup

1. **Create a bot token.** A GitHub fine-grained personal access token scoped to
   this repository with **Issues: Read and write** (nothing else). Ideally from a
   dedicated bot account, not a personal one.

2. **Store secrets** (from this directory):
   ```bash
   npm install
   npx wrangler secret put GITHUB_TOKEN       # paste the token
   npx wrangler secret put TURNSTILE_SECRET    # optional, see spam protection
   ```

3. **Deploy:**
   ```bash
   npx wrangler deploy
   ```
   Note the deployed URL (e.g. `https://aandolanjeevi-submit.<subdomain>.workers.dev`).

4. **Point the site at it.** Set `submitEndpoint` in `_data/site.yaml` to that
   URL and push. The submit page switches from the GitHub-issue fallback to the
   real form automatically.

## Spam protection (do this before publicizing the form)

The Worker always rejects a filled honeypot field. For real protection, enable
[Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) (free):

1. Create a Turnstile widget; note its **site key** and **secret key**.
2. `npx wrangler secret put TURNSTILE_SECRET` with the secret key.
3. Set `turnstileSiteKey` in `_data/site.yaml` to the site key and push.

When `TURNSTILE_SECRET` is set the Worker verifies every submission; when it is
not set, verification is skipped (honeypot only).

## Config

Non-secret values live in `wrangler.jsonc` under `vars` (repo owner/name, site
URL, allowed languages/categories/kinds, issue label). Keep the allowed lists in
sync with `_data/site.yaml`.
