import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

export default function () {
  const dir = path.join(process.cwd(), "resources");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((f) => {
      const entry = yaml.load(fs.readFileSync(path.join(dir, f), "utf8"));
      entry.slug = f.replace(/\.ya?ml$/, "");
      return entry;
    })
    .sort((a, b) => String(b.added).localeCompare(String(a.added)));
}
