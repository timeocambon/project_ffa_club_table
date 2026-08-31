import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const [readme, userGuide, renderGuide, packageJson] = await Promise.all([
  readFile(new URL("../README.md", import.meta.url), "utf8"),
  readFile(new URL("../docs/GUIDE_UTILISATEUR.md", import.meta.url), "utf8"),
  readFile(new URL("../docs/DEPLOIEMENT_RENDER.md", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8").then(JSON.parse),
]);

test("relie les guides principaux depuis le README", async () => {
  assert.match(readme, /docs\/GUIDE_UTILISATEUR\.md/);
  assert.match(readme, /docs\/DEPLOIEMENT_RENDER\.md/);

  await Promise.all([
    access(new URL("../docs/GUIDE_UTILISATEUR.md", import.meta.url)),
    access(new URL("../docs/DEPLOIEMENT_RENDER.md", import.meta.url)),
  ]);
});

test("documente toutes les fonctions importantes pour un utilisateur", () => {
  for (const section of [
    "Charger les résultats",
    "Comprendre le tableau",
    "Filtrer les résultats",
    "Gérer les absents",
    "Colorer des cellules",
    "Enregistrer une vue",
    "Utiliser l'application au clavier",
    "Résoudre les problèmes courants",
  ]) {
    assert.match(userGuide, new RegExp(`^## ${section}`, "m"), section);
  }

  for (const marker of ["N/D", "clic droit", "stockées", "Échap"]) {
    assert.match(userGuide, new RegExp(marker, "i"), marker);
  }
});

test("documente la publication, le contrôle et le retour arrière Render", () => {
  for (const marker of [
    "New > Blueprint",
    "Deploy Blueprint",
    "/healthz",
    "npm run test:smoke",
    "SMOKE_CLUB=081061",
    "Rollback",
    "https://render.com/docs/infrastructure-as-code",
  ]) {
    assert.match(renderGuide, new RegExp(marker.replaceAll("/", "\\/")), marker);
  }

  assert.equal(packageJson.scripts?.["test:smoke"], "node scripts/smoke-test.js");
});
