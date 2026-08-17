#!/usr/bin/env python3
"""Generate the brand assets (see BRAND.md) from one master geometry.

The mark ("S4"): an assembly of people in a ring, one member carrying a
torch, the question at the centre. All type is converted to outlines here —
shaped with HarfBuzz, outlined with fontTools from the repo's own self-hosted
Noto Sans woff2 files — so the standalone SVGs (favicon included) render
identically everywhere with no font dependency.

Outputs (committed):
  img/logo.svg        standalone mark; adapts to light/dark via its own CSS
  img/seal.svg        ceremonial citizens' seal (large-format use only)
  _includes/logo.njk  inline header partial (currentColor + var(--flame))

Outputs (temporary, rasterised to PNG by scripts/brand-png.mjs):
  <tmpdir>/og-src.svg, touch-src.svg, fav-src.svg

Usage:
  python3 -m venv venv && venv/bin/pip install fonttools brotli uharfbuzz
  venv/bin/python scripts/build-brand.py [--tmp-out DIR]
"""

import argparse
import io
import math
import pathlib

import uharfbuzz as hb
from fontTools.misc.transform import Transform
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONTS = ROOT / "fonts"

# Palette (kept in sync with css/style.css and BRAND.md)
INK_LIGHT, INK_DARK = "#1a1a1a", "#e6e6e6"
FLAME_LIGHT, FLAME_DARK = "#C2401A", "#E06A45"
PAPER = "#F7F6F1"
OG_BG, OG_INK, OG_MUTED = "#131315", "#EDECE5", "#98978D"


class Face:
    """A woff2 font opened for both shaping (HarfBuzz) and outlining (fontTools)."""

    def __init__(self, path: pathlib.Path):
        self.tt = TTFont(path)
        self.upem = self.tt["head"].unitsPerEm
        self.glyph_order = self.tt.getGlyphOrder()
        self.glyph_set = self.tt.getGlyphSet()
        # HarfBuzz does not decompress woff2 — hand it raw sfnt bytes, from
        # the same table data fontTools outlines with (glyph ids stay aligned).
        raw = io.BytesIO()
        self.tt.flavor = None
        self.tt.save(raw, reorderTables=False)
        self.hb_font = hb.Font(hb.Face(raw.getvalue()))

    def shape(self, text: str):
        """Return (glyph_name, x_advance, x_offset, y_offset) in font units."""
        buf = hb.Buffer()
        buf.add_str(text)
        buf.guess_segment_properties()
        hb.shape(self.hb_font, buf, {})
        out = []
        for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
            out.append((self.glyph_order[info.codepoint],
                        pos.x_advance, pos.x_offset, pos.y_offset))
        return out

    def glyph_path(self, name: str, transform: Transform) -> str:
        pen = SVGPathPen(self.glyph_set)
        self.glyph_set[name].draw(TransformPen(pen, transform))
        return pen.getCommands()


def text_path(face: Face, text: str, size: float, x: float, y: float,
              anchor: str = "middle", tracking: float = 0.0) -> str:
    """One combined path for a run of text. (x, y) is the baseline anchor.

    SVG y grows downward, font y grows upward: hence the -s flip.
    """
    s = size / face.upem
    glyphs = face.shape(text)
    width = sum(adv * s + tracking for _, adv, _, _ in glyphs) - (tracking if glyphs else 0)
    cursor = {"middle": x - width / 2, "start": x, "end": x - width}[anchor]
    d = []
    for name, adv, xo, yo in glyphs:
        t = Transform(s, 0, 0, -s, cursor + xo * s, y - yo * s)
        cmds = face.glyph_path(name, t)
        if cmds:
            d.append(cmds)
        cursor += adv * s + tracking
    return " ".join(d)


def arc_text(face: Face, text: str, size: float, radius: float,
             stroke_fill: str) -> str:
    """Glyphs set along the top of a circle, baseline tangent, centred at 12
    o'clock — each glyph is rotated into place about the circle's centre."""
    s = size / face.upem
    glyphs = face.shape(text)
    width = sum(adv * s for _, adv, _, _ in glyphs)
    out = []
    cursor = -width / 2
    for name, adv, xo, yo in glyphs:
        mid = cursor + (adv * s) / 2
        angle = math.degrees(mid / radius)
        t = Transform(s, 0, 0, -s, -(adv * s) / 2 + xo * s, -yo * s)
        cmds = face.glyph_path(name, t)
        if cmds:
            out.append(f'<g transform="rotate({angle:.3f}) translate(0,{-radius})">'
                       f'<path class="i" d="{cmds}" fill="{stroke_fill}"/></g>')
        cursor += adv * s
    return "".join(out)


# --- Master geometry -------------------------------------------------------
# viewBox -50 -50 100 100. Ring of 8 dots (ninth member is the torchbearer at
# the crown), torch at translate(0,-37) scale(0.3), outlined "?" at centre.

DOTS = [(-23.1, -27.6), (-35.4, -6.3), (-31.2, 18.0), (-12.3, 33.8),
        (12.3, 33.8), (31.2, 18.0), (35.4, -6.3), (23.1, -27.6)]
FLAME_OUTER = "M0,-40 C12,-25 15,-11 0,2 C-15,-11 -12,-25 0,-40 Z"
FLAME_INNER = "M0,-30 C6.5,-21 7.5,-12 0,-5 C-7.5,-12 -6.5,-21 0,-30 Z"
TORCH_CUP = "M-14,4 H14 L8.5,15 H-8.5 Z"


def mark(ink: str, flame: str, mask_id: str, question_d: str) -> str:
    """The S4 mark. Transparent-background safe: separation "halos" around the
    dots and the torch are punched out of the ring with a mask, and the
    flame's inner counter is a true evenodd hole.

    Colours are literal (or currentColor/var() for the inline partial) in the
    attributes; the classes i / i-s / f exist so standalone files can restyle
    for dark mode via <style>. Attributes stay authoritative in renderers
    without CSS support (librsvg etc.)."""
    dots_vis = "".join(f'<circle class="i" cx="{x}" cy="{y}" r="6" fill="{ink}"/>'
                       for x, y in DOTS)
    dots_mask = "".join(f'<circle cx="{x}" cy="{y}" r="7.6" fill="black"/>'
                        for x, y in DOTS)
    return f'''<mask id="{mask_id}">
    <rect x="-50" y="-50" width="100" height="100" fill="white"/>
    {dots_mask}
    <g transform="translate(0,-37) scale(0.3)" fill="black" stroke="black" stroke-width="10">
      <path d="{FLAME_OUTER}"/><path d="{TORCH_CUP}"/>
      <rect x="-4.5" y="15" width="9" height="27" rx="2.5"/>
    </g>
  </mask>
  <circle class="i-s" r="36" fill="none" stroke="{ink}" stroke-width="2.6" mask="url(#{mask_id})"/>
  {dots_vis}
  <g transform="translate(0,-37) scale(0.3)">
    <path class="f" d="{FLAME_OUTER} {FLAME_INNER}" fill-rule="evenodd" fill="{flame}"/>
    <path class="i" d="{TORCH_CUP}" fill="{ink}"/>
    <rect class="i" x="-4.5" y="15" width="9" height="27" rx="2.5" fill="{ink}"/>
  </g>
  <path class="i" d="{question_d}" fill="{ink}"/>'''


# Dark-mode restyle for the standalone SVGs. Light colours live in the
# attributes (authoritative for non-CSS renderers); this only flips dark.
DARK_STYLE = (f"@media(prefers-color-scheme:dark){{"
              f".i{{fill:{INK_DARK}}}.i-s{{stroke:{INK_DARK}}}.f{{fill:{FLAME_DARK}}}}}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tmp-out", default="/tmp", help="dir for PNG source SVGs")
    args = ap.parse_args()
    tmp = pathlib.Path(args.tmp_out)
    tmp.mkdir(parents=True, exist_ok=True)

    latin400 = Face(FONTS / "noto-sans-400-normal-latin.woff2")
    latin700 = Face(FONTS / "noto-sans-700-normal-latin.woff2")
    deva700 = Face(FONTS / "noto-sans-700-normal-devanagari.woff2")

    # The "?" — Noto Sans Bold, size 36, baseline y=13.5, optically centred.
    question_d = text_path(latin700, "?", 36, 0, 13.5)

    (ROOT / "img").mkdir(exist_ok=True)

    # --- img/logo.svg: standalone, adapts to the viewer's colour scheme ----
    logo = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 100 100">
  <!-- aandolanjeevi mark: the assembly, one member carrying the torch, the
       question at the centre. Generated by scripts/build-brand.py — edit
       there, not here. -->
  <style>{DARK_STYLE}</style>
  {mark(INK_LIGHT, FLAME_LIGHT, "halo", question_d)}
</svg>
'''
    (ROOT / "img/logo.svg").write_text(logo)

    # --- _includes/logo.njk: inline header partial --------------------------
    njk = f'''{{# The site mark, inlined so it follows the page's colours: people and
   question in currentColor (--fg), flame in --flame. Generated by
   scripts/build-brand.py — edit there, not here. #}}
<svg class="logo-mark" viewBox="-50 -50 100 100" aria-hidden="true" focusable="false">
  {mark("currentColor", "var(--flame, #C2401A)", "lm-halo", question_d)}
</svg>
'''
    (ROOT / "_includes/logo.njk").write_text(njk)

    # --- img/seal.svg: ceremonial citizens' seal ----------------------------
    # Arc baseline at r=45 keeps Devanagari ascenders/anusvara clear of the
    # r=56 outer ring; the bottom line must fit the chord at its baseline.
    arc = arc_text(deva700, "आंदोलनजीवी", 11, 45, INK_LIGHT)
    bottom_d = text_path(latin400, "AANDOLANJEEVI · IN", 5.2, 0, 41, tracking=0.55)
    seal = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="-60 -60 120 120">
  <!-- Ceremonial seal: large-format use only (About page, print, PDF).
       Never the favicon, never the header. Generated by
       scripts/build-brand.py — edit there, not here. -->
  <style>{DARK_STYLE}</style>
  <circle class="i-s" r="56" fill="none" stroke="{INK_LIGHT}" stroke-width="2.2"/>
  {arc}
  <circle class="i" cx="-52.5" cy="14" r="1.6" fill="{INK_LIGHT}"/>
  <circle class="i" cx="52.5" cy="14" r="1.6" fill="{INK_LIGHT}"/>
  <path class="i" d="{bottom_d}" fill="{INK_LIGHT}"/>
  <g transform="translate(0,2) scale(0.56)">
  {mark(INK_LIGHT, FLAME_LIGHT, "seal-halo", question_d)}
  </g>
</svg>
'''
    (ROOT / "img/seal.svg").write_text(seal)

    # --- PNG sources (rasterised by scripts/brand-png.mjs) ------------------
    # Social card: stacked lockup on dark, 1200x630.
    dev_d = text_path(deva700, "आंदोलनजीवी", 84, 600, 428)
    lat_d = text_path(latin400, "aandolanjeevi.in", 26, 600, 486, tracking=4)
    og = f'''<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="{OG_BG}"/>
  <g transform="translate(600,200) scale(2.1)">
  {mark(OG_INK, FLAME_DARK, "og-halo", question_d)}
  </g>
  <path d="{dev_d}" fill="{OG_INK}"/>
  <path d="{lat_d}" fill="{OG_MUTED}"/>
</svg>
'''
    (tmp / "og-src.svg").write_text(og)

    # Apple touch icon: opaque paper ground (iOS composites transparency onto
    # black), generous margin.
    touch = f'''<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">
  <rect width="180" height="180" fill="{PAPER}"/>
  <g transform="translate(90,90) scale(1.42)">
  {mark("#1C1C1E", FLAME_LIGHT, "touch-halo", question_d)}
  </g>
</svg>
'''
    (tmp / "touch-src.svg").write_text(touch)

    # 32px PNG favicon fallback (transparent, light-scheme inks).
    fav = f'''<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="-50 -50 100 100">
  {mark("#1C1C1E", FLAME_LIGHT, "fav-halo", question_d)}
</svg>
'''
    (tmp / "fav-src.svg").write_text(fav)

    # One-off GitHub uploads (rasterised to the tmp dir, not committed):
    # repo social-preview (1280x640, the mark) and org avatar (the seal on
    # paper — the seal is circular, so circle-cropping UIs frame it cleanly).
    social = f'''<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="640" viewBox="0 0 1280 640">
  <rect width="1280" height="640" fill="{OG_BG}"/>
  <g transform="translate(640,204) scale(2.15)">
  {mark(OG_INK, FLAME_DARK, "soc-halo", question_d)}
  </g>
  <path d="{text_path(deva700, "आंदोलनजीवी", 84, 640, 436)}" fill="{OG_INK}"/>
  <path d="{text_path(latin400, "aandolanjeevi.in", 26, 640, 494, tracking=4)}" fill="{OG_MUTED}"/>
</svg>
'''
    (tmp / "social-src.svg").write_text(social)

    seal_body = seal.split("\n", 1)[1]  # reuse the seal file minus its XML prolog line
    avatar = f'''<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="{PAPER}"/>
  <svg x="32" y="32" width="960" height="960" viewBox="-60 -60 120 120">
  {seal_body}
</svg>
'''
    (tmp / "avatar-src.svg").write_text(avatar)

    print("wrote img/logo.svg img/seal.svg _includes/logo.njk")
    print(f"png sources in {tmp}")


if __name__ == "__main__":
    main()
