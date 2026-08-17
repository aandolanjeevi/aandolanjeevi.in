// Rasterise the brand PNG assets from the SVG sources emitted by
// scripts/build-brand.py. sharp is intentionally NOT a package.json
// dependency (heavy native module for a rare one-off):
//
//   node scripts/build-brand.py --tmp-out /tmp/brand  (via its venv)
//   npm install --no-save sharp
//   node scripts/brand-png.mjs /tmp/brand
//
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const srcDir = process.argv[2];
if (!srcDir) {
  console.error("usage: node scripts/brand-png.mjs <dir with *-src.svg>");
  process.exit(1);
}

const jobs = [
  { src: "og-src.svg", out: "img/og.png", width: 1200 },
  { src: "touch-src.svg", out: "img/apple-touch-icon.png", width: 180 },
  { src: "fav-src.svg", out: "img/favicon-32.png", width: 32 },
];

for (const { src, out, width } of jobs) {
  const svg = path.join(srcDir, src);
  if (!fs.existsSync(svg)) throw new Error(`missing ${svg} — run build-brand.py first`);
  await sharp(svg, { density: 300 }).resize({ width }).png().toFile(out);
  const kb = (fs.statSync(out).size / 1024).toFixed(1);
  console.log(`${out} (${kb} KB)`);
}
