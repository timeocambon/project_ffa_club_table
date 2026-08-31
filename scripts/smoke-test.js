import { pathToFileURL } from "node:url";

const DEFAULT_APP_URL = "http://127.0.0.1:3001";
const DEFAULT_STARTUP_TIMEOUT_MS = 120_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_SCRAPE_TIMEOUT_MS = 200_000;

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeBaseUrl(value = DEFAULT_APP_URL) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("APP_URL doit utiliser http ou https.");
  }
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  url.search = "";
  url.hash = "";
  return url.href.replace(/\/$/, "");
}

function assertSmoke(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchWithTimeout(fetchImpl, url, timeoutMs, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function waitForHealthy({
  baseUrl,
  fetchImpl,
  startupTimeoutMs,
  requestTimeoutMs,
}) {
  const deadline = Date.now() + startupTimeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetchWithTimeout(
        fetchImpl,
        `${baseUrl}/healthz`,
        requestTimeoutMs,
      );
      const body = await response.text();
      if (response.ok && body.trim() === "ok") return;
      lastError = new Error(`Santé HTTP ${response.status}: ${body.trim()}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  throw new Error(
    `Le service n'est pas devenu sain dans le délai prévu : ${lastError?.message || "aucune réponse"}`,
  );
}

async function runSmokeChecks({
  appUrl = DEFAULT_APP_URL,
  club = "",
  year = String(new Date().getFullYear()),
  requireResults = false,
  startupTimeoutMs = DEFAULT_STARTUP_TIMEOUT_MS,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  scrapeTimeoutMs = DEFAULT_SCRAPE_TIMEOUT_MS,
  fetchImpl = fetch,
  log = console.log,
} = {}) {
  const baseUrl = normalizeBaseUrl(appUrl);

  await waitForHealthy({
    baseUrl,
    fetchImpl,
    startupTimeoutMs,
    requestTimeoutMs,
  });
  log("✓ Service disponible et sain");

  const homeResponse = await fetchWithTimeout(
    fetchImpl,
    `${baseUrl}/`,
    requestTimeoutMs,
  );
  const homeHtml = await homeResponse.text();
  assertSmoke(homeResponse.ok, `La page principale répond ${homeResponse.status}.`);
  assertSmoke(
    /text\/html/i.test(homeResponse.headers.get("content-type") || ""),
    "La page principale n'est pas servie en HTML.",
  );
  assertSmoke(
    homeHtml.includes("<title>Bilans Club</title>"),
    "Le contenu attendu de la page principale est absent.",
  );
  assertSmoke(
    (homeResponse.headers.get("content-security-policy") || "").includes(
      "default-src 'self'",
    ),
    "La politique de sécurité du contenu est absente.",
  );
  assertSmoke(
    !homeResponse.headers.has("x-powered-by"),
    "Le serveur expose inutilement sa technologie.",
  );
  log("✓ Page publique et en-têtes de sécurité valides");

  const appResponse = await fetchWithTimeout(
    fetchImpl,
    `${baseUrl}/app.js`,
    requestTimeoutMs,
  );
  const appSource = await appResponse.text();
  assertSmoke(appResponse.ok, `Le script principal répond ${appResponse.status}.`);
  assertSmoke(
    /javascript/i.test(appResponse.headers.get("content-type") || ""),
    "Le script principal n'est pas servi comme JavaScript.",
  );
  assertSmoke(appSource.includes("fetchData"), "Le script principal semble incomplet.");
  log("✓ Ressources statiques disponibles");

  const invalidResponse = await fetchWithTimeout(
    fetchImpl,
    `${baseUrl}/api/bilans?club=123`,
    requestTimeoutMs,
  );
  const invalidPayload = await invalidResponse.json();
  assertSmoke(invalidResponse.status === 400, "L'API n'a pas refusé un club invalide.");
  assertSmoke(
    typeof invalidPayload?.error === "string" && invalidPayload.error.length > 0,
    "L'API ne fournit pas de message pour une saisie invalide.",
  );
  log("✓ Validation de l'API opérationnelle");

  let resultCount = null;
  if (club) {
    assertSmoke(/^\d{6}$/.test(club), "SMOKE_CLUB doit contenir exactement 6 chiffres.");
    assertSmoke(/^\d{4}$/.test(year), "SMOKE_YEAR doit contenir exactement 4 chiffres.");

    const bilansResponse = await fetchWithTimeout(
      fetchImpl,
      `${baseUrl}/api/bilans?club=${encodeURIComponent(club)}&annee=${encodeURIComponent(year)}`,
      scrapeTimeoutMs,
    );
    const payload = await bilansResponse.json().catch(() => ({}));
    assertSmoke(
      bilansResponse.ok,
      `La récupération réelle a échoué (${bilansResponse.status}) : ${payload?.message || payload?.error || "réponse inconnue"}`,
    );
    assertSmoke(Array.isArray(payload.results), "La réponse réelle ne contient pas de résultats.");
    assertSmoke(payload.count === payload.results.length, "Le total réel est incohérent.");
    assertSmoke(payload.source === "athle.fr", "La source réelle est inattendue.");
    if (requireResults) {
      assertSmoke(payload.results.length > 0, "Aucun résultat réel n'a été récupéré.");
    }

    resultCount = payload.results.length;
    log(`✓ Récupération Athlé.fr réussie : ${resultCount} résultat(s)`);
  }

  log(`Contrôle de production réussi pour ${baseUrl}`);
  return { baseUrl, resultCount };
}

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  runSmokeChecks({
    appUrl: process.env.APP_URL || DEFAULT_APP_URL,
    club: (process.env.SMOKE_CLUB || "").trim(),
    year: (process.env.SMOKE_YEAR || String(new Date().getFullYear())).trim(),
    requireResults: process.env.SMOKE_REQUIRE_RESULTS === "1",
    startupTimeoutMs: positiveInteger(
      process.env.SMOKE_STARTUP_TIMEOUT_MS,
      DEFAULT_STARTUP_TIMEOUT_MS,
    ),
    requestTimeoutMs: positiveInteger(
      process.env.SMOKE_REQUEST_TIMEOUT_MS,
      DEFAULT_REQUEST_TIMEOUT_MS,
    ),
    scrapeTimeoutMs: positiveInteger(
      process.env.SMOKE_SCRAPE_TIMEOUT_MS,
      DEFAULT_SCRAPE_TIMEOUT_MS,
    ),
  }).catch((error) => {
    console.error(`Contrôle de production échoué : ${error?.message || error}`);
    process.exitCode = 1;
  });
}

export { normalizeBaseUrl, runSmokeChecks };
