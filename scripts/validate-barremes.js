import fs from "node:fs";

const errors = [];

const BARREME_50_PATH = new URL("../public/barreme50.json", import.meta.url);
const BARREME_1000_PATH = new URL("../public/barreme1000.json", import.meta.url);

const FIXED_BARREME_50_EVENTS = new Set([
  "50m",
  "50m_salle",
  "60m",
  "60m_salle",
  "80m",
  "100m",
  "120m",
  "200m",
  "200m_salle",
  "300m",
  "400m",
  "800m",
  "1000m",
  "1500m",
  "2000m",
  "3000m",
  "1500m_steeple",
  "2000m_steeple",
  "1000m_marche",
  "2000m_marche",
  "3000m_marche",
  "4x60m",
  "4x60m_mixte",
  "4x100m",
  "4x100m_mixte",
  "50m_haies_65",
  "50m_haies_76",
  "50m_haies_84",
  "50m_haies_91_salle",
  "60m_haies_76_salle",
  "60m_haies_91_salle",
  "80m_haies_76",
  "80m_haies_84",
  "100m_haies_76",
  "100m_haies_84",
  "110m_haies_91",
  "200m_haies_76",
  "320m_haies_76",
  "400m_haies_76",
  "400m_haies_84",
  "hauteur",
  "perche",
  "longueur",
  "triple_saut",
]);

const BARREME_1000_EVENTS = new Set([
  "50m",
  "60m",
  "100m",
  "200m",
  "300m",
  "400m",
  "600m",
  "800m",
  "1000m",
  "1500m",
  "2000m",
  "3000m",
  "5000m",
  "10000m",
  "2000mSC",
  "3000mSC",
  "3kmW",
  "5kmW",
  "10kmW",
  "4x100m",
  "4x200m",
  "4x400m",
  "50mH",
  "60mH",
  "100mH",
  "110mH",
  "400mH",
  "HJ",
  "PV",
  "LJ",
  "TJ",
  "SP",
  "DT",
  "HT",
  "JT",
  "MileRoad",
  "5kmRoad",
  "10kmRoad",
  "15kmRoad",
  "10MilesRoad",
  "20kmRoad",
  "HalfMarathon",
  "25kmRoad",
  "30kmRoad",
  "Marathon",
  "100kmRoad",
]);

function readJson(path, label) {
  try {
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch (error) {
    errors.push(`${label}: JSON illisible (${error.message})`);
    return null;
  }
}

function exactKeys(label, value, expectedKeys) {
  const actual = value && typeof value === "object"
    ? Object.keys(value).sort()
    : [];
  const expected = [...expectedKeys].sort();

  if (actual.join("|") !== expected.join("|")) {
    errors.push(
      `${label}: clés attendues ${expected.join(", ")}; reçues ${actual.join(", ")}`,
    );
  }
}

function validateTable(table, label) {
  if (!table || typeof table !== "object") {
    errors.push(`${label}: table absente ou invalide`);
    return { tables: 0, thresholds: 0 };
  }

  if (table.type !== "time" && table.type !== "dist") {
    errors.push(`${label}: type inconnu ${String(table.type)}`);
  }

  if (
    table.floorPoints != null &&
    (!Number.isInteger(table.floorPoints) || table.floorPoints <= 0)
  ) {
    errors.push(`${label}: minimum de points invalide`);
  }

  if (!Array.isArray(table.thresholds) || table.thresholds.length === 0) {
    errors.push(`${label}: aucun seuil`);
    return { tables: 1, thresholds: 0 };
  }

  for (let index = 0; index < table.thresholds.length; index += 1) {
    const entry = table.thresholds[index];
    const entryLabel = `${label}.thresholds[${index}]`;

    if (!Number.isInteger(entry?.points) || entry.points <= 0) {
      errors.push(`${entryLabel}: nombre de points invalide`);
    }
    if (!Number.isFinite(entry?.value) || entry.value <= 0) {
      errors.push(`${entryLabel}: valeur de performance invalide`);
    }

    if (index === 0) continue;

    const previous = table.thresholds[index - 1];
    if (entry.points >= previous.points) {
      errors.push(
        `${entryLabel}: les points ne sont pas strictement décroissants ` +
          `(${previous.points} puis ${entry.points})`,
      );
    }

    if (table.type === "time" && entry.value < previous.value) {
      errors.push(
        `${entryLabel}: les temps diminuent (${previous.value} puis ${entry.value})`,
      );
    }

    if (table.type === "dist" && entry.value > previous.value) {
      errors.push(
        `${entryLabel}: les distances augmentent (${previous.value} puis ${entry.value})`,
      );
    }
  }

  const lowestThresholdPoints = table.thresholds.at(-1)?.points;
  if (
    Number.isInteger(table.floorPoints) &&
    Number.isInteger(lowestThresholdPoints) &&
    table.floorPoints >= lowestThresholdPoints
  ) {
    errors.push(`${label}: le minimum doit être inférieur au dernier seuil`);
  }

  return { tables: 1, thresholds: table.thresholds.length };
}

function isSupportedBarreme50Event(eventKey) {
  return (
    FIXED_BARREME_50_EVENTS.has(eventKey) ||
    /^(poids|disque|marteau)_[\d_]+kg$/.test(eventKey) ||
    /^javelot_[\d_]+g$/.test(eventKey)
  );
}

function validateBarreme50(root) {
  if (!root) return { tables: 0, thresholds: 0 };
  if (!root.source || typeof root.source !== "object") {
    errors.push("barème 50: source absente");
  }

  exactKeys("barème 50.categories", root.categories, [
    "Poussin",
    "Benjamin",
    "Minime",
    "Cadet",
  ]);

  const totals = { tables: 0, thresholds: 0 };
  for (const [category, sexes] of Object.entries(root.categories || {})) {
    exactKeys(`barème 50.${category}`, sexes, ["F", "M"]);

    for (const [sex, events] of Object.entries(sexes || {})) {
      for (const [eventKey, table] of Object.entries(events || {})) {
        const label = `barème 50.${category}.${sex}.${eventKey}`;
        if (!isSupportedBarreme50Event(eventKey)) {
          errors.push(`${label}: épreuve non reconnue par l'application`);
        }

        const count = validateTable(table, label);
        totals.tables += count.tables;
        totals.thresholds += count.thresholds;
      }
    }
  }

  const mif1000 = root.categories?.Minime?.F?.["1000m"]?.thresholds || [];
  const mif24 = mif1000.find((entry) => entry.points === 24);
  if (mif24?.value !== 223.82) {
    errors.push("barème 50.Minime.F.1000m: le seuil de 24 points doit être 223.82");
  }

  const befWalk =
    root.categories?.Benjamin?.F?.["2000m_marche"]?.thresholds || [];
  const bef16 = befWalk.find((entry) => entry.points === 16);
  if (bef16?.value !== 872.36) {
    errors.push(
      "barème 50.Benjamin.F.2000m_marche: le seuil de 16 points doit être 872.36",
    );
  }

  if (!root.categories?.Minime?.M?.disque_1_25kg) {
    errors.push("barème 50.Minime.M: table du disque 1,25 kg absente");
  }

  return totals;
}

function validateBarreme1000(root) {
  if (!root) return { tables: 0, thresholds: 0 };
  if (
    (!root.source || typeof root.source !== "object") &&
    (typeof root.source !== "string" || !root.source.trim())
  ) {
    errors.push("barème 1000: source absente");
  }

  exactKeys("barème 1000.sexes", root.sexes, ["F", "M"]);

  const totals = { tables: 0, thresholds: 0 };
  for (const [sex, venues] of Object.entries(root.sexes || {})) {
    exactKeys(`barème 1000.${sex}`, venues, ["indoor", "outdoor"]);

    for (const [venue, events] of Object.entries(venues || {})) {
      for (const [eventKey, table] of Object.entries(events || {})) {
        const label = `barème 1000.${sex}.${venue}.${eventKey}`;
        if (!BARREME_1000_EVENTS.has(eventKey)) {
          errors.push(`${label}: épreuve non reconnue par l'application`);
        }

        const count = validateTable(table, label);
        totals.tables += count.tables;
        totals.thresholds += count.thresholds;
      }
    }
  }

  return totals;
}

function expectTotals(label, actual, expected) {
  if (actual.tables !== expected.tables) {
    errors.push(
      `${label}: ${actual.tables} tables trouvées, ${expected.tables} attendues`,
    );
  }
  if (actual.thresholds !== expected.thresholds) {
    errors.push(
      `${label}: ${actual.thresholds} seuils trouvés, ${expected.thresholds} attendus`,
    );
  }
}

const barreme50 = readJson(BARREME_50_PATH, "barème 50");
const barreme1000 = readJson(BARREME_1000_PATH, "barème 1000");

const totals50 = validateBarreme50(barreme50);
const totals1000 = validateBarreme1000(barreme1000);

expectTotals("barème 50", totals50, { tables: 152, thresholds: 6288 });
expectTotals("barème 1000", totals1000, {
  tables: 120,
  thresholds: 145152,
});

if (errors.length > 0) {
  console.error(`Validation des barèmes échouée (${errors.length} erreur(s)) :`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log(
    `Barèmes valides : ${totals50.tables + totals1000.tables} tables et ` +
      `${totals50.thresholds + totals1000.thresholds} seuils contrôlés.`,
  );
}
