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
  normalizePort,
  normalizeRouteHourPerf,
  parseBilansQuery,
  parseBilansWithStats,
  parseSummaryLine,
  withTimeout,
} from "../index.js";

test("normalise le port fourni par la plateforme d'hébergement", () => {
  assert.equal(normalizePort("10000"), 10000);
  assert.equal(normalizePort(8080), 8080);
  assert.equal(normalizePort("invalide"), 3001);
  assert.equal(normalizePort("70000"), 3001);
});

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
  assert.equal(eventCategory("Tétrathlon Disque BM"), "Combinées");
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

test("lit les colonnes FFA sans coller le classement à la performance", () => {
  const header = (event, sex) =>
    `<tr><td colspan="10"><div class="headers">2026 | ${event} | ${sex}</div></td></tr>`;
  const result = ({ place, performance, athlete, infos, date, location }) =>
    `<tr><td>${place}</td><td><b>${performance}</b></td><td>${athlete}</td>` +
    `<td>Athle Tarn Nord*</td><td>OCC</td><td>081</td><td>${infos}</td>` +
    `<td>${date}</td><td>${location}</td><td></td></tr>`;

  const html = `<table><tbody>
    ${header("Longueur", "F")}
    ${result({ place: 36, performance: "1m40 (-0.4)", athlete: "BERLEMONT Angie", infos: "BEF/13", date: "08/05/26", location: "Millau" })}
    ${result({ place: "-", performance: "2m26 (-2.8)", athlete: "THOMINES THERON Nola", infos: "BEF/13", date: "02/05/26", location: "Carmaux" })}
    ${header("Triple saut", "F")}
    ${result({ place: 11, performance: "7m20 (-0.1)", athlete: "ORTHLIEB Lorette", infos: "BEF/14", date: "08/05/26", location: "Millau" })}
    ${header("Poids (2 kg)", "F")}
    ${result({ place: 11, performance: "4m30 (i)", athlete: "PESARE Leyanna", infos: "BEF/13", date: "18/01/26", location: "Albi" })}
    ${header("Poids (3 kg)", "F")}
    ${result({ place: 11, performance: "5m51", athlete: "MAGOT SAITTA Maud", infos: "MIF/12", date: "12/04/26", location: "Castres" })}
    ${result({ place: 4, performance: "7m51", athlete: "MALEK Cherifa Janane", infos: "MIF/12", date: "02/05/26", location: "Carmaux" })}
    ${header("Poids (3 kg)", "M")}
    ${result({ place: 1, performance: "6m74", athlete: "ELBAZ BAWIN Eliott", infos: "BEM/14", date: "02/05/26", location: "Carmaux" })}
    ${header("Poids (4 kg)", "M")}
    ${result({ place: 1, performance: "8m40", athlete: "PECOULT Sacha", infos: "MIM/11", date: "19/04/26", location: "Albi" })}
    ${header("3 000m Marche", "M")}
    ${result({ place: 1, performance: "18'14''6", athlete: "VILLEMUR Gabin", infos: "MIM/11", date: "29/03/26", location: "Castres" })}
    ${header("5 Km Route", "F")}
    ${result({ place: 6, performance: "24'34''", athlete: "EYCHENNE Lucie", infos: "MIF/12", date: "04/01/26", location: "Lescure d'albigeois" })}
    ${header("5 Km Route", "M")}
    ${result({ place: 8, performance: "17'28''", athlete: "PECOULT Sacha", infos: "MIM/11", date: "04/01/26", location: "Lescure d'albigeois" })}
  </tbody></table>`;

  const { results, stats } = parseBilansWithStats(html, "081061", "2026");
  assert.equal(stats.parser, "dom");
  assert.equal(results.length, 11);
  assert.deepEqual(
    results.map(({ place, performance, athlete, location }) => ({
      place,
      performance,
      athlete,
      location,
    })),
    [
      { place: 36, performance: "1m40 (-0.4)", athlete: "BERLEMONT Angie", location: "Millau" },
      { place: null, performance: "2m26 (-2.8)", athlete: "THOMINES THERON Nola", location: "Carmaux" },
      { place: 11, performance: "7m20 (-0.1)", athlete: "ORTHLIEB Lorette", location: "Millau" },
      { place: 11, performance: "4m30 (i)", athlete: "PESARE Leyanna", location: "Albi" },
      { place: 11, performance: "5m51", athlete: "MAGOT SAITTA Maud", location: "Castres" },
      { place: 4, performance: "7m51", athlete: "MALEK Cherifa Janane", location: "Carmaux" },
      { place: 1, performance: "6m74", athlete: "ELBAZ BAWIN Eliott", location: "Carmaux" },
      { place: 1, performance: "8m40", athlete: "PECOULT Sacha", location: "Albi" },
      { place: 1, performance: "18'14''6", athlete: "VILLEMUR Gabin", location: "Castres" },
      { place: 6, performance: "24'34''", athlete: "EYCHENNE Lucie", location: "Lescure d'albigeois" },
      { place: 8, performance: "17'28''", athlete: "PECOULT Sacha", location: "Lescure d'albigeois" },
    ],
  );
});

test("sépare les lignes voisines et récupère relais et épreuves combinées", () => {
  const html = `<table><tbody>
    <tr><td colspan="10"><div class="headers">2026 | 50m | F</div></td></tr>
    <tr><td>10</td><td><b>8''57 (+1.7)</b></td><td>CHAFAI BEGUE Sheyma</td><td>Athle Tarn Nord*</td><td>OCC</td><td>081</td><td>BEF/14</td><td>12/04/26</td><td>Castres</td><td></td></tr><tr><td>-</td><td><b>8''57 (-0.2)</b></td><td>BERNADOU Isia</td><td>Athle Tarn Nord*</td><td>OCC</td><td>081</td><td>BEF/14</td><td>02/05/26</td><td>Carmaux</td><td></td></tr>
    <tr><td colspan="10"><div class="headers">2026 | 4 X 60m | F</div></td></tr>
    <tr><td>1</td><td><b>35''26</b></td><td></td><td>ATHLE TARN NORD*</td><td>OCC</td><td>081</td><td>MIF/</td><td>02/05/26</td><td>Carmaux</td><td></td></tr>
    <tr class="detail-row"><td colspan="4"><table class="detail-inner-table"><tbody><tr><td colspan="2">SCARSELLI Dana (MIF/11), MASSUYES Margot (MIF/12), MALEK Cherifa Janane (MIF/12), EYCHENNE Lucie (MIF/12)</td></tr></tbody></table></td></tr>
    <tr><td colspan="10"><div class="headers">2026 | Tétrathlon Disque BM | M</div></td></tr>
    <tr><td>1</td><td><b>1 147 pts</b></td><td>VEDEL Clement</td><td>Athle Tarn Nord*</td><td>OCC</td><td>081</td><td>BEM/13</td><td>18/04/26</td><td>Albi</td><td></td></tr>
  </tbody></table>`;

  const { results } = parseBilansWithStats(html, "081061", "2026");
  assert.equal(results.length, 4);
  assert.deepEqual(
    results.slice(0, 2).map(({ athlete, place, location }) => ({
      athlete,
      place,
      location,
    })),
    [
      { athlete: "CHAFAI BEGUE Sheyma", place: 10, location: "Castres" },
      { athlete: "BERNADOU Isia", place: null, location: "Carmaux" },
    ],
  );
  assert.equal(
    results[2].athlete,
    "SCARSELLI Dana, MASSUYES Margot, MALEK Cherifa Janane, EYCHENNE Lucie",
  );
  assert.equal(results[3].category, "Combinées");
  assert.equal(results[3].performance, "1 147 pts");
});
