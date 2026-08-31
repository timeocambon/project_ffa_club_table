import assert from "node:assert/strict";
import test from "node:test";

import {
  app,
  applySecurityHeaders,
  createBilansLoader,
  eventCategory,
  eventType,
  extractTotalPages,
  expectedPerfRangeSeconds,
  isSupportedEvent,
  normalizeRouteHourPerf,
  parseBilansQuery,
  parseSummaryLine,
  withTimeout,
} from "../index.js";

test("applique des en-têtes HTTP restrictifs sans exposer Express", () => {
  const headers = new Map();
  let nextCalled = false;
  applySecurityHeaders(
    {},
    { setHeader: (name, value) => headers.set(name, value) },
    () => {
      nextCalled = true;
    },
  );

  assert.equal(nextCalled, true);
  assert.match(headers.get("Content-Security-Policy"), /script-src 'self'/);
  assert.match(headers.get("Content-Security-Policy"), /frame-ancestors 'none'/);
  assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(headers.get("X-Frame-Options"), "DENY");
  assert.equal(headers.get("Referrer-Policy"), "no-referrer");
  assert.equal(app.enabled("x-powered-by"), false);
});

test("valide le club et l'année avant toute récupération", () => {
  assert.deepEqual(
    parseBilansQuery(
      { club: " 081061 ", annee: "2026", debug: "1" },
      2026,
    ),
    {
      value: { club: "081061", annee: "2026", debug: true },
    },
  );
  assert.deepEqual(parseBilansQuery({ club: "081061" }, 2026), {
    value: { club: "081061", annee: "2026", debug: false },
  });
  assert.match(parseBilansQuery({ club: "123" }, 2026).error, /6 chiffres/);
  assert.match(
    parseBilansQuery({ club: "081061", annee: "1999" }, 2026).error,
    /2000 et 2027/,
  );
  assert.match(
    parseBilansQuery({ club: "081061", annee: "2028" }, 2026).error,
    /2000 et 2027/,
  );
});

test("mutualise les demandes identiques et respecte l'expiration du cache", async () => {
  let timestamp = 1_000;
  let calls = 0;
  const scrape = async () => {
    calls += 1;
    await new Promise((resolve) => setImmediate(resolve));
    return { version: calls };
  };
  const loadBilans = createBilansLoader({
    scrape,
    cacheMs: 1_000,
    now: () => timestamp,
  });
  const params = { club: "081061", annee: "2026", debug: false };

  const [first, duplicate] = await Promise.all([
    loadBilans(params),
    loadBilans(params),
  ]);
  assert.equal(calls, 1);
  assert.deepEqual(first, { version: 1 });
  assert.deepEqual(duplicate, { version: 1 });

  assert.deepEqual(await loadBilans(params), { version: 1 });
  assert.equal(calls, 1);

  timestamp += 1_000;
  assert.deepEqual(await loadBilans(params), { version: 2 });
  assert.equal(calls, 2);
});

test("ne conserve pas une récupération échouée ou une demande de débogage", async () => {
  let calls = 0;
  const loadBilans = createBilansLoader({
    scrape: async () => {
      calls += 1;
      if (calls === 1) throw new Error("indisponible");
      return { version: calls };
    },
  });
  const params = { club: "081061", annee: "2026", debug: false };

  await assert.rejects(loadBilans(params), /indisponible/);
  assert.deepEqual(await loadBilans(params), { version: 2 });

  const debugParams = { ...params, debug: true };
  assert.deepEqual(await loadBilans(debugParams), { version: 3 });
  assert.deepEqual(await loadBilans(debugParams), { version: 4 });
});

test("limite la taille du cache", async () => {
  let calls = 0;
  const loadBilans = createBilansLoader({
    scrape: async ({ club }) => ({ club, version: ++calls }),
    maxCacheEntries: 1,
  });

  const firstClub = { club: "081061", annee: "2026", debug: false };
  const secondClub = { club: "081062", annee: "2026", debug: false };

  assert.equal((await loadBilans(firstClub)).version, 1);
  assert.equal((await loadBilans(secondClub)).version, 2);
  assert.equal((await loadBilans(firstClub)).version, 3);
});

test("libère le délai maximal après succès et identifie un dépassement", async () => {
  assert.equal(await withTimeout(Promise.resolve("ok"), 100, "trop long"), "ok");

  await assert.rejects(
    withTimeout(new Promise(() => {}), 5, "trop long"),
    (error) => error.code === "SCRAPE_TIMEOUT" && /trop long/.test(error.message),
  );
});

test("reconnaît les disciplines affichées dans le tableau", () => {
  const supported = [
    "10 km Route",
    "Cross",
    "3000m Marche",
    "4 x 100m",
    "600m",
    "320m haies (76)",
    "1500m steeple",
    "Poids (3 kg)",
  ];

  for (const eventName of supported) {
    assert.equal(isSupportedEvent(eventName), true, eventName);
  }

  assert.equal(isSupportedEvent("Décathlon"), false);
  assert.equal(isSupportedEvent(""), false);
});

test("détecte les différentes formes de pagination Athlé.fr", () => {
  assert.equal(
    extractTotalPages('<div class="select-option">Page 1 / 12</div>'),
    12,
  );
  assert.equal(
    extractTotalPages('<div class="select-option">Page 001/025</div>'),
    20,
  );
  assert.equal(extractTotalPages("<main>Aucune pagination</main>"), 1);
});

test("classe les disciplines de façon cohérente avec l'interface", () => {
  assert.equal(eventCategory("600m"), "Demi-fond / Fond");
  assert.equal(eventCategory("10 km Marche Route"), "Marche");
  assert.equal(eventCategory("4 x 100m"), "Sprint");
  assert.equal(eventCategory("Disque (1 kg)"), "Lancers");
  assert.equal(eventCategory("Épreuve inconnue"), "Autres");
  assert.equal(eventType("320m haies"), "long-sprint");
});

test("protège les nouveaux formats de temps et les bornes plausibles", () => {
  assert.equal(
    normalizeRouteHourPerf("134'56''", "Semi-marathon Route"),
    "1h34'56''",
  );
  assert.deepEqual(expectedPerfRangeSeconds("320m haies"), [40, 120]);
  assert.deepEqual(expectedPerfRangeSeconds("1500m steeple"), [240, 1000]);
  assert.deepEqual(expectedPerfRangeSeconds("600m"), [60, 250]);
  assert.deepEqual(expectedPerfRangeSeconds("10000m"), [1500, 6000]);
});

test("extrait une ligne de résultat collée ou séparée", () => {
  assert.deepEqual(parseSummaryLine("1 3'20''00 DUPONT Alice", "1000m"), {
    place: 1,
    performance: "3'20''00",
    athlete: "DUPONT Alice",
  });
  assert.deepEqual(parseSummaryLine("13'20''00 DUPONT Alice", "1000m"), {
    place: 1,
    performance: "3'20''00",
    athlete: "DUPONT Alice",
  });
});
