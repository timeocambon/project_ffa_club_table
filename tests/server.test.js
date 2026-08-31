import assert from "node:assert/strict";
import test from "node:test";

import {
  eventCategory,
  eventType,
  expectedPerfRangeSeconds,
  isSupportedEvent,
  normalizeRouteHourPerf,
  parseSummaryLine,
} from "../index.js";

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
