// CSV flavor of the public index export (PLAN.md G5). One row per entry;
// language-keyed text flattened to English (fall back to first available).
const COLUMNS = [
  "slug", "url", "title", "language", "category", "kind", "status",
  "paywalled", "added", "wayback", "ia_item", "zenodo_doi", "sha256",
  "captured_at",
];

const cell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

export default class {
  data() {
    return {
      permalink: "/index.csv",
      eleventyExcludeFromCollections: true,
    };
  }

  render({ resources }) {
    const rows = resources.map((e) => {
      const title =
        typeof e.title === "string"
          ? e.title
          : e.title?.en ?? Object.values(e.title ?? {})[0] ?? "";
      const flat = {
        ...e,
        added: e.added instanceof Date
          ? e.added.toISOString().slice(0, 10)
          : e.added,
        title,
        paywalled: e.paywalled === true,
        wayback: e.archive?.wayback,
        ia_item: e.archive?.ia_item,
        zenodo_doi: e.archive?.zenodo_doi,
        sha256: e.archive?.sha256,
        captured_at: e.archive?.captured_at,
      };
      return COLUMNS.map((c) => cell(flat[c])).join(",");
    });
    return [COLUMNS.join(","), ...rows].join("\n") + "\n";
  }
}
