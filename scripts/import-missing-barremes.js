import fs from "node:fs";

const BARREME_50_PATH = new URL("../public/barreme50.json", import.meta.url);
const BARREME_1000_PATH = new URL("../public/barreme1000.json", import.meta.url);

const waInputPath = process.argv[2];
if (!waInputPath) {
  console.error(
    "Usage: node scripts/import-missing-barremes.js <wa_scoring_tables_2025.min.json>",
  );
  process.exit(1);
}

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function timeTable(values) {
  return {
    type: "time",
    floorPoints: 1,
    thresholds: values.map((value, index) => ({
      points: 10 - index,
      value,
    })),
  };
}

function distanceTable(values) {
  return {
    type: "dist",
    floorPoints: 1,
    thresholds: values.map((value, index) => ({
      points: 10 - index,
      value,
    })),
  };
}

function poussinTables() {
  const tables = {
    "50m": timeTable([7.7, 8, 8.3, 8.6, 8.9, 9.2, 9.5, 9.8, 10.1]),
    "1000m": timeTable([210, 225, 240, 255, 270, 285, 300, 315, 330]),
    "50m_haies_65": timeTable([9.5, 9.8, 10.1, 10.4, 10.7, 11, 11.3, 11.6, 12]),
    hauteur: distanceTable([1.35, 1.25, 1.2, 1.15, 1.1, 1.05, 1, 0.95, 0.9]),
    perche: distanceTable([2.1, 2, 1.9, 1.8, 1.7, 1.6, 1.5, 1.4, 1.3]),
    longueur: distanceTable([4, 3.75, 3.5, 3.25, 3, 2.75, 2.5, 2.25, 2]),
    triple_saut: distanceTable([8.4, 8, 7.6, 7.2, 6.8, 6.4, 6, 5.6, 5.2]),
    poids_1_5kg: distanceTable([7.75, 7.25, 6.75, 6.25, 5.75, 5.25, 4.75, 4.25, 3.75]),
    poids_2kg: distanceTable([7.75, 7.25, 6.75, 6.25, 5.75, 5.25, 4.75, 4.25, 3.75]),
    disque_0_6kg: distanceTable([23, 21, 19, 17, 15, 13, 11, 9, 7]),
    marteau_1_5kg: distanceTable([20, 18.5, 17, 15.5, 14, 12.5, 11, 9.5, 8]),
    marteau_2kg: distanceTable([20, 18.5, 17, 15.5, 14, 12.5, 11, 9.5, 8]),
    javelot_300g: distanceTable([18.5, 17, 15.5, 14, 12.5, 11, 9.5, 8, 6.5]),
    javelot_400g: distanceTable([18.5, 17, 15.5, 14, 12.5, 11, 9.5, 8, 6.5]),
    "4x60m": timeTable([30, 32, 34, 36, 38, 40, 42, 44, 46]),
    "1000m_marche": timeTable([390, 405, 420, 435, 450, 465, 480, 495, 510]),
  };

  return structuredClone(tables);
}

const roadEvents = new Map([
  ["Mile route", "MileRoad"],
  ["5 km", "5kmRoad"],
  ["10 km", "10kmRoad"],
  ["15 km", "15kmRoad"],
  ["10 Miles", "10MilesRoad"],
  ["20 km", "20kmRoad"],
  ["HM", "HalfMarathon"],
  ["25 km", "25kmRoad"],
  ["30 km", "30kmRoad"],
  ["Marathon", "Marathon"],
  ["100 km", "100kmRoad"],
]);

const barreme50 = readJson(BARREME_50_PATH);
barreme50.categories.Poussin = {
  F: poussinTables(),
  M: poussinTables(),
};
barreme50.source.officialPage =
  "https://www.athle.fr/contenu/jeunes-regles-et-cotations/5577";
barreme50.source.pdfs.Poussin =
  "https://www.athle.fr/pdf/docffa/pointjeunes_po.pdf";

const waData = readJson(waInputPath);
if (waData?._meta?.edition !== "April 2025 revised") {
  throw new Error("Le fichier World Athletics doit être l'édition révisée d'avril 2025.");
}

const barreme1000 = readJson(BARREME_1000_PATH);
for (const sex of ["M", "F"]) {
  const waSex = sex === "F" ? "W" : "M";
  for (const [waCode, localCode] of roadEvents) {
    const sourceTable = waData?.[waSex]?.[waCode];
    if (
      sourceTable?.type !== "road" ||
      sourceTable?.direction !== "min" ||
      !Array.isArray(sourceTable?.data)
    ) {
      throw new Error(`Table route World Athletics invalide : ${waSex}.${waCode}`);
    }

    barreme1000.sexes[sex].outdoor[localCode] = {
      type: "time",
      thresholds: sourceTable.data.map(([points, value]) => ({ points, value })),
    };
  }
}

barreme1000.source = {
  base: "FFA Table IAAF (hongroise) 2017",
  road: {
    edition: "World Athletics Scoring Tables 2025 — April 2025 revised",
    officialPage:
      "https://worldathletics.org/about-iaaf/documents/technical-information",
    structuredExtraction:
      "https://github.com/lbouchard450/wa-scoring-tables",
  },
};

fs.writeFileSync(BARREME_50_PATH, `${JSON.stringify(barreme50, null, 2)}\n`);
fs.writeFileSync(BARREME_1000_PATH, JSON.stringify(barreme1000));

console.log("Barèmes Poussin et route importés.");
