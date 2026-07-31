// Anonymous submission Worker (PLAN.md M6).
//
// Receives the submit form's POST, drops spam (honeypot + optional Turnstile),
// and files a GitHub issue authored by the bot token — so a submitter needs no
// GitHub account and their identity never appears anywhere. Redirects the
// browser to the site's thank-you (or error) page.
//
// Config (wrangler vars): GITHUB_OWNER, GITHUB_REPO, SITE_URL, ISSUE_LABEL,
//   ALLOWED_LANGS (comma-separated), ALLOWED_CATEGORIES, ALLOWED_KINDS.
// Secrets: GITHUB_TOKEN (required), TURNSTILE_SECRET (optional).

const MAX = { url: 2000, title: 200, why: 1000 };

function redirect(base, lang, page) {
  return Response.redirect(`${base}/${lang}/submit/${page}/`, 303);
}

function inList(value, csv) {
  if (!value) return "";
  const set = (csv || "").split(",").map((s) => s.trim()).filter(Boolean);
  return set.includes(value) ? value : "";
}

function validUrl(raw) {
  if (!raw || raw.length > MAX.url) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

async function turnstileOk(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return true; // not configured -> skip
  if (!token) return false;
  const body = new FormData();
  body.set("secret", env.TURNSTILE_SECRET);
  body.set("response", token);
  if (ip) body.set("remoteip", ip);
  const res = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { method: "POST", body },
  );
  const data = await res.json().catch(() => ({}));
  return data.success === true;
}

async function createIssue(env, fields) {
  const lines = [
    `**URL:** ${fields.url}`,
    fields.title ? `**Title:** ${fields.title}` : null,
    fields.category ? `**Category:** ${fields.category}` : null,
    fields.kind ? `**Type:** ${fields.kind}` : null,
    "",
    fields.why ? `**Why it belongs:**\n\n> ${fields.why.replace(/\n/g, "\n> ")}` : null,
    "",
    "---",
    "_Submitted anonymously via the website form. No submitter identity is collected._",
  ].filter((l) => l !== null);

  const res = await fetch(
    `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "aandolanjeevi-submit-worker",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: `Link submission: ${fields.title || fields.url}`.slice(0, 200),
        body: lines.join("\n"),
        labels: [env.ISSUE_LABEL || "submission"],
      }),
    },
  );
  return res.ok;
}

export default {
  async fetch(request, env) {
    const site = env.SITE_URL || "https://aandolanjeevi.in";
    if (request.method !== "POST") {
      return Response.redirect(site, 303);
    }

    let form;
    try {
      form = await request.formData();
    } catch {
      return redirect(site, "en", "error");
    }

    const langs = (env.ALLOWED_LANGS || "en").split(",").map((s) => s.trim());
    const langRaw = String(form.get("lang") || "");
    const lang = langs.includes(langRaw) ? langRaw : langs[0] || "en";

    // Honeypot: a filled "website" means a bot. Pretend success, do nothing.
    if (String(form.get("website") || "").trim() !== "") {
      return redirect(site, lang, "thanks");
    }

    const ip = request.headers.get("CF-Connecting-IP");
    if (!(await turnstileOk(env, form.get("cf-turnstile-response"), ip))) {
      return redirect(site, lang, "error");
    }

    const url = validUrl(String(form.get("url") || "").trim());
    if (!url) return redirect(site, lang, "error");

    const fields = {
      url,
      title: String(form.get("title") || "").trim().slice(0, MAX.title),
      why: String(form.get("why") || "").trim().slice(0, MAX.why),
      category: inList(String(form.get("category") || "").trim(), env.ALLOWED_CATEGORIES),
      kind: inList(String(form.get("kind") || "").trim(), env.ALLOWED_KINDS),
    };

    try {
      const ok = await createIssue(env, fields);
      return redirect(site, lang, ok ? "thanks" : "error");
    } catch {
      return redirect(site, lang, "error");
    }
  },
};
