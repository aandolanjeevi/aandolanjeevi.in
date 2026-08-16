import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import rssPlugin from "@11ty/eleventy-plugin-rss";

function loadLocales() {
  const dir = path.join(process.cwd(), "locales");
  const locales = {};
  for (const file of fs.readdirSync(dir)) {
    if (!/\.ya?ml$/.test(file)) continue;
    locales[file.replace(/\.ya?ml$/, "")] = yaml.load(
      fs.readFileSync(path.join(dir, file), "utf8"),
    );
  }
  return locales;
}

export default function (eleventyConfig) {
  const locales = loadLocales();

  eleventyConfig.addPlugin(rssPlugin);
  // Repo docs and non-site directories are not site pages.
  for (const f of ["README.md", "PLAN.md", "CONTRIBUTING.md", "CODE_OF_CONDUCT.md", "POLICY.md", "MAINTAINERS.md"]) {
    eleventyConfig.ignores.add(f);
  }
  eleventyConfig.ignores.add("workers");
  eleventyConfig.ignores.add("scripts");
  eleventyConfig.addDataExtension("yaml,yml", (contents) => yaml.load(contents));
  eleventyConfig.addPassthroughCopy("css");
  eleventyConfig.addPassthroughCopy("fonts");
  eleventyConfig.addGlobalData("locales", locales);

  // t: UI string lookup with English fallback. Usage: "nav.resources" | t(lang)
  eleventyConfig.addFilter("t", (key, lang) => {
    const lookup = (l) =>
      key.split(".").reduce((node, part) => node?.[part], locales[l]);
    return lookup(lang) ?? lookup("en") ?? key;
  });

  // ltext: pick a value from a language-keyed map ({en: "...", hi: "..."}).
  // Returns { value, lang } so templates can mark text shown outside the
  // entry's own language as translated.
  eleventyConfig.addFilter("ltext", (map, lang, entryLang) => {
    if (typeof map === "string") return { value: map, lang: entryLang };
    if (!map) return { value: "", lang: entryLang };
    const order = [lang, entryLang, "en", ...Object.keys(map)];
    for (const l of order) {
      if (map[l]) return { value: map[l], lang: l };
    }
    return { value: "", lang: entryLang };
  });

  eleventyConfig.addFilter("where", (arr, key, value) =>
    (arr || []).filter((item) => item[key] === value),
  );

  eleventyConfig.addFilter("readableDate", (date) => {
    const d = date instanceof Date ? date : new Date(date);
    return d.toISOString().slice(0, 10);
  });

  eleventyConfig.addCollection("posts", (api) =>
    api.getFilteredByGlob("posts/*.md").sort((a, b) => b.date - a.date),
  );

  return {
    dir: {
      input: ".",
      includes: "_includes",
      data: "_data",
      output: "_site",
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
