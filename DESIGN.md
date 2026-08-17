# Design

The design thought process behind aandolanjeevi.in — why the site looks the
way it does, and the full record of how the logo was arrived at. Companion to
PLAN.md (what we built) and MAINTAINERS.md (how to run it); this file is the
*why it looks like this*.

## Site

The site's design doctrine, set at M4 and unchanged since:

- **Extremely minimal and neutral.** The subject matter carries enough weight;
  the container must not editorialise. One column, `max-width: 44rem`, system
  spacing, no imagery except the resources themselves.
- **One typeface, both scripts.** Noto Sans, self-hosted
  (`scripts/fetch-fonts.js` → `fonts/`), chosen because the Noto project
  covers every Indian script — so adding a language never means adding a
  font decision. No CDN fonts, ever: every asset a visitor loads comes from
  this repo (privacy doctrine, see POLICY.md).
- **Token palette, automatic dark mode.** All colour flows through CSS custom
  properties in `css/style.css` (`--bg`, `--fg`, `--muted`, `--line`,
  `--link`, `--dead`, `--flame`); dark mode is a media-query redefinition of
  the same tokens, never per-element overrides.
- **Text is the interface.** Badges, dead-link failovers, and translated-from
  markers are typographic, not iconographic — with one deliberate exception,
  the logo below.

## Logo

The mark: **an assembly of people in a ring; one member carries a torch; at
the centre, the question.** Decided 2026-08 over three exploration rounds.

### The brief, distilled

The client brief asked the mark to hold four values, which translate to form
like this:

| Value | Visual translation |
|---|---|
| Republican values (the Republic, the Constitution) | constitutional geometry — circles, even weights, civic dignity |
| Democratic unity | many equal elements forming one shape; no one on top |
| Struggle, peacefully | energy without aggression; upward movement, open forms |
| Accountability from institutions | the act of *asking*; questions aimed at power |

Plus the name itself: *aandolanjeevi* ("one who lives for the movement") was
coined as an insult and is worn here as a badge — the mark should carry that
quiet defiance without shouting it.

### Hard constraints

- Must survive at 16 px (favicon) and in a single colour (stamps, print).
- Must sit beside Noto Sans in both Devanagari and Latin.
- **Legal:** the State Emblem of India (Lion Capital) is prohibited for
  private use; imitations of the national flag are restricted. We may echo
  constitutional forms (a wheel-like circle, Ashoka blue) but never copy them.
- **Non-partisan:** nothing that first-glance reads as any party's symbol.

### Directions explored and rejected

- **The raised fist** — excluded before sketching: globally claimed, reads
  militant rather than peaceful, and it is every protest project's default.
- **The mashaal (torch) as hero** — the most Indian of protest images, but a
  monumental flaming torch is an allotted ECI ballot symbol (most prominently
  Shiv Sena (UBT) since 2022). Too much partisan surface as the *dominant*
  element.
- **The open palm (abhaya mudra)** — the peaceful counter to the fist, but an
  open palm is the Indian National Congress's ballot symbol; unrescuable in a
  civic context regardless of drawing.
- **The question bubble over a row of people** — accountability as hero;
  original and conflict-free, but cerebral where the ring is warm.
- **The literal crest** (assembly ring + hand-held torch inside + question
  beside it) — the client's first combination instinct. Rejected as a primary
  mark: three competing focal points, everything dies together at 16 px, and
  a hand gripping a flaming torch is compositionally adjacent to the actual
  ECI mashaal glyph. The instinct (ring as container) survived; the collage
  did not.

### The mark that won (S4)

Merging the survivors under a hierarchy: the **assembly ring** (from the
strongest single direction) with **one member carrying the torch** at the
crown and **the question at the centre**. Everything sits on one vertical
axis — people → torchbearer → question — so the eye reads it in order rather
than ping-ponging. The name is in the picture: the aandolanjeevi is the one
standing *in* the circle holding the torch, among equals, not above them.

The ring quietly echoes a chakra (constitutional nod) without imitating the
24-spoke wheel. The question mark could render as क्यों at large sizes.

**Honest neutrality ledger:** a full torch (handle included) is a step closer
to the ECI mashaal glyph than a bare flame. It was accepted with eyes open
because here the torch is one small member among nine, embedded in a civic
ring — not a monumental ballot-style glyph. If a partisan read is ever
seriously contested, the documented fallback is the same composition with a
handle-less flame in the torch slot (design round 1.5, option "S2").

### Construction

- **Primary lockup:** horizontal — mark left, name right (site header:
  `_includes/logo.njk` + localized site title).
- **Favicon:** the **full S4 mark** (client's call, accepting some 16 px
  softening; the simplified "question-only" and "torch-only" cuts considered
  in round 2 were not adopted).
- **Stacked lockup:** mark above centred bilingual name — social card
  (`img/og.png`).
- **Ceremonial seal** (`img/seal.svg`): S4 inside a circular type ring with
  आंदोलनजीवी arced above. Large-format use only — About page, print, PDF.
  Never the favicon, never the header.

### Tone

**Civic and dignified**: even stroke weights, geometric drawing, no rough or
poster-bold treatment. Rationale: the mark is already dense with meaning; a
calm drawing keeps it from tipping into clutter, and "this is a public
record" is the register the archive needs. The reclaimed-insult defiance
stays implicit, carried by the name.

### Colour

**Vermilion flame on ink** — everything in the foreground colour except the
flame, the one living element. The smallest element carries the only warmth,
so the eye finds the torchbearer first: the accent does narrative work, not
decoration.

- Flame (light ground): `#C2401A` — vermilion / sindoor-red, chosen
  *deliberately instead of saffron* to stay clear of party palettes.
- Flame (dark ground): `#E06A45` (contrast-adjusted; `--flame` in
  `css/style.css`).
- Everything else: the page's `--fg` (mark inherits `currentColor` inline;
  standalone SVGs carry literal inks with a dark-mode style override).
- **One-colour fallback is always all-ink** — the flame simply joins the ink.
  The mark must never *depend* on colour.

Rejected: Ashoka-blue accent on the question (navy sits too close to ink to
survive small sizes); duotone flame+question (two accents tipped the dense
mark back toward crest energy); any tricolour treatment (flag-imitation risk
and party-colour readings).

### Usage rules

- Don't recolour the flame saffron, or the mark in any party palette.
- Don't add elements inside the ring, or put the mark inside another circle
  (that's what the seal is for).
- Don't use the seal at small sizes or in the header.
- One-colour contexts: all-ink (or all-paper on dark). Never outline-only.
- The mark is CC BY-NC-SA 4.0 like the rest of the repo; it identifies this
  project — don't use it to imply endorsement.

### Asset inventory and regeneration

Everything is generated from one master geometry in
`scripts/build-brand.py`; all type (the "?", the seal lettering, the social
card wordmark) is shaped with HarfBuzz and converted to outlines from the
repo's own Noto Sans woff2 files, so no asset depends on any viewer font.

| Asset | Role |
|---|---|
| `img/logo.svg` | standalone mark; favicon; adapts light/dark by itself |
| `_includes/logo.njk` | inline header partial; follows page `--fg`/`--flame` |
| `img/seal.svg` | ceremonial seal, large-format only |
| `img/og.png` | 1200×630 social card (dark, stacked lockup) |
| `img/apple-touch-icon.png` | 180×180, opaque paper ground |
| `img/favicon-32.png` | PNG fallback for non-SVG-favicon browsers |

Regenerate after any geometry or palette change:

```bash
python3 -m venv venv && venv/bin/pip install fonttools brotli uharfbuzz
venv/bin/python scripts/build-brand.py --tmp-out /tmp/brand
npm install --no-save sharp          # heavy native dep, deliberately not in package.json
node scripts/brand-png.mjs /tmp/brand
```

Edit `scripts/build-brand.py` only — the SVG outputs are build products and
say so in their headers.
