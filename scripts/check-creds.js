// Smoke-test archival credentials without printing them.
// Run: node --env-file=.env scripts/check-creds.js

const ia = { key: process.env.IA_ACCESS_KEY, secret: process.env.IA_SECRET_KEY };
const zenodo = process.env.ZENODO_TOKEN;

async function checkZenodo() {
  if (!zenodo) return console.log("Zenodo:  no token in env");
  const res = await fetch(
    "https://zenodo.org/api/deposit/depositions?size=1",
    { headers: { Authorization: `Bearer ${zenodo}` } },
  );
  console.log(`Zenodo:  HTTP ${res.status}` + (res.ok ? " — token valid" : " — CHECK TOKEN"));
}

async function checkIA() {
  if (!ia.key || !ia.secret) return console.log("IA:      no keys in env");
  // Authenticated list of the account's items via the S3 endpoint.
  const res = await fetch("https://s3.us.archive.org/", {
    headers: { Authorization: `LOW ${ia.key}:${ia.secret}` },
  });
  const ok = res.status !== 401 && res.status !== 403;
  console.log(`IA:      HTTP ${res.status}` + (ok ? " — keys accepted" : " — CHECK KEYS"));
}

await checkZenodo();
await checkIA();
