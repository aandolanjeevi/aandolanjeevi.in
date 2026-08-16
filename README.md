# aandolanjeevi.in

A resource repository for public protests — links to guides, news, tools, and
interactive apps, with every archivable link preserved so a copy survives even
if the source disappears. See [PLAN.md](./PLAN.md) for the full roadmap.

## Develop

```bash
npm install
npm run serve   # local dev server
npm run build   # output to _site/
```

Built with [Eleventy](https://www.11ty.dev/). No other runtime required.

## Structure

| Path | What it is |
|------|------------|
| `resources/*.yaml` | One file per listed resource (the link index) |
| `posts/*.md` | Admin posts |
| `locales/*.yaml` | UI strings per language — translation contributions welcome |
| `pages/` | Page templates (per-language via pagination) |
| `_includes/` | Layouts and partials |
| `_data/` | Site config and data loaders |

## Adding a resource

Create `resources/<slug>.yaml`:

```yaml
url: https://example.org/guide
title:
  en: Title in English
  hi: शीर्षक हिन्दी में
description:
  en: One-paragraph summary.
language: en            # language of the resource itself
category: legal         # legal | safety-health | digital-security | news-media | organizing | aid-support
kind: guide             # article | pdf | guide | video | post | app | form | map | source
added: 2026-07-25
status: live
# paywalled: true        # optional — labels entries behind a hard paywall
# render: true           # optional — archive via headless browser (for JS-only pages)
archive:
  wayback: null
  ia_item: null
  zenodo_doi: null
  sha256: null
  captured_at: null
  screenshot: null
```

`title`/`description` are language-keyed; add whichever languages you can.
Text shown outside its source language is automatically marked
"(translated from …)".

## Adding a language

Copy `locales/en.yaml` to `locales/<code>.yaml`, translate the values, and add
the code to `languages` in `_data/site.yaml`. That's the whole change for
Latin- or Devanagari-script languages (the vendored Noto Sans covers both).

For a language in another script (Tamil, Bengali, Telugu, …), also add its
Noto family/subset to `FAMILIES` in `scripts/fetch-fonts.js` and re-run
`npm run fonts` to vendor the glyphs.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). By participating you agree to the
[code of conduct](./CODE_OF_CONDUCT.md).

## License

[CC BY-NC-SA 4.0](./LICENSE)
