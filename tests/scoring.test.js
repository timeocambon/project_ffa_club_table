import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  perfToComparable,
  pointsPresentation,
  pointsResultFromTable,
} from "../public/scoring.js";

const barreme50 = JSON.parse(
  await readFile(new URL("../public/barreme50.json", import.meta.url), "utf8"),
);

test("convertit les formats de temps et de distance utilisés par l'interface", () => {
  assert.deepEqual(perfToComparable("3'20''00"), {
    type: "time",
    value: 200,
  });
  assert.deepEqual(perfToComparable("1:23.45"), {
    type: "time",
    value: 83.45,
  });
  assert.deepEqual(perfToComparable("12m34"), {
    type: "dist",
    value: 12.34,
  });
  assert.equal(perfToComparable("performance inconnue"), null);
});

test("calcule les points avec le barème officiel, quel que soit l'ordre des seuils", () => {
  const table = barreme50.categories.Benjamin.F["1000m"];
  const expected = { points: 40, status: "ok", mode: "50" };

  assert.deepEqual(pointsResultFromTable(table, "3'20''00", "50"), expected);
  assert.deepEqual(
    pointsResultFromTable(
      { ...table, thresholds: [...table.thresholds].reverse() },
      "3'20''00",
      "50",
    ),
    expected,
  );
});

test("distingue les états sans barème, invalide, hors barème et vide", () => {
  const timeTable = {
    type: "time",
    thresholds: [{ points: 1, value: 10 }],
  };

  const unavailable = pointsResultFromTable(null, "10''00", "1000");
  assert.equal(unavailable.status, "unavailable");
  assert.deepEqual(pointsPresentation(unavailable), {
    label: "N/D",
    className: "points-unavailable",
    title: "Barème 1000 indisponible pour cette épreuve, cette catégorie ou ce sexe.",
  });

  const invalid = pointsResultFromTable(timeTable, "12m34", "50");
  assert.equal(invalid.status, "invalid");
  assert.equal(pointsPresentation(invalid).label, "?");

  const outOfRange = pointsResultFromTable(timeTable, "11''00", "50");
  assert.equal(outOfRange.status, "out-of-range");
  assert.equal(pointsPresentation(outOfRange).label, "0");

  const empty = pointsResultFromTable(timeTable, "", "50");
  assert.equal(empty.status, "empty");
  assert.equal(pointsPresentation(empty).label, "—");
});
