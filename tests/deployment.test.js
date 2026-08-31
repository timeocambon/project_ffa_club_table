import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [dockerfile, dockerignore, packageJson, packageLock] = await Promise.all([
  readFile(new URL("../Dockerfile", import.meta.url), "utf8"),
  readFile(new URL("../.dockerignore", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../package-lock.json", import.meta.url), "utf8").then(
    JSON.parse,
  ),
]);

test("aligne l'image Docker sur la version Playwright verrouillée", () => {
  const playwrightVersion =
    packageLock.packages?.["node_modules/playwright"]?.version;
  assert.match(playwrightVersion, /^\d+\.\d+\.\d+$/);
  assert.match(
    dockerfile,
    new RegExp(`playwright:v${playwrightVersion.replaceAll(".", "\\.")}-`),
  );
});

test("conserve les protections de l'image de production", () => {
  assert.match(dockerfile, /ENV NODE_ENV=production/);
  assert.match(dockerfile, /EXPOSE 3001/);
  assert.match(dockerfile, /HEALTHCHECK[\s\S]+\/healthz/);
  assert.match(dockerfile, /RUN npm run validate:barremes/);
  assert.match(dockerfile, /CMD \["npm", "start"\]/);
});

test("exclut les fichiers de développement de l'image", () => {
  const ignoredEntries = new Set(
    dockerignore.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean),
  );
  for (const entry of ["node_modules", ".git", "tests", "*.md"]) {
    assert.equal(ignoredEntries.has(entry), true, entry);
  }
});

test("empêche la publication npm accidentelle et documente la version de Node", () => {
  assert.equal(packageJson.private, true);
  assert.equal(packageJson.engines?.node, ">=20");
});
