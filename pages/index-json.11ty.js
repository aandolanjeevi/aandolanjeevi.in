// Machine-readable export of the full resource index (PLAN.md G5), built
// from the same data the site renders. Lets anyone mirror the index or
// verify archive copies against the published hashes.
export default class {
  data() {
    return {
      permalink: "/index.json",
      eleventyExcludeFromCollections: true,
    };
  }

  render({ site, resources }) {
    // js-yaml parses bare dates (added: 2026-08-05) into Date objects, which
    // JSON-serialize timezone-shifted; normalize to date-only strings.
    const dateOnly = (v) =>
      v instanceof Date ? v.toISOString().slice(0, 10) : v;
    const entries = resources.map((e) => ({ ...e, added: dateOnly(e.added) }));
    return JSON.stringify(
      {
        site: site.url,
        license: "CC-BY-NC-SA-4.0",
        generated: new Date().toISOString(),
        count: entries.length,
        entries,
      },
      null,
      2,
    );
  }
}
