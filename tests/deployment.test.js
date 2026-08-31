import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [
  ciWorkflow,
  dockerfile,
  dockerignore,
  packageJson,
  packageLock,
  renderBlueprint,
  serverSource,
] =
  await Promise.all([
    readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"),
    readFile(new URL("../Dockerfile", import.meta.url), "utf8"),
    readFile(new URL("../.dockerignore", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8").then(
      JSON.parse,
    ),
    readFile(new URL("../package-lock.json", import.meta.url), "utf8").then(
      JSON.parse,
    ),
    readFile(new URL("../render.yaml", import.meta.url), "utf8"),
    readFile(new URL("../index.js", import.meta.url), "utf8"),
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
  assert.match(dockerfile, /^USER pwuser$/m);
  assert.match(dockerfile, /CMD \["node", "index\.js"\]/);
});

test("décrit un service Render Docker gratuit et surveillé", () => {
  assert.match(renderBlueprint, /^services:\s*$/m);
  assert.match(renderBlueprint, /^\s+- type: web\s*$/m);
  assert.match(renderBlueprint, /^\s+runtime: docker\s*$/m);
  assert.match(renderBlueprint, /^\s+plan: free\s*$/m);
  assert.match(renderBlueprint, /^\s+region: frankfurt\s*$/m);
  assert.match(renderBlueprint, /^\s+healthCheckPath: \/healthz\s*$/m);
  assert.match(renderBlueprint, /^\s+autoDeployTrigger: checksPass\s*$/m);
  assert.match(renderBlueprint, /^\s+maxShutdownDelaySeconds: 210\s*$/m);
  assert.doesNotMatch(renderBlueprint, /^\s+- key: PORT\s*$/m);
});

test("écoute sur toutes les interfaces avec un port Render numérique", () => {
  assert.match(serverSource, /const PORT = normalizePort\(process\.env\.PORT\)/);
  assert.match(serverSource, /process\.env\.HOST \|\| "0\.0\.0\.0"/);
  assert.match(serverSource, /app\.listen\(port, host,/);
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

test("exécute toute la suite dans GitHub Actions avec des droits minimaux", () => {
  assert.match(ciWorkflow, /^\s*contents:\s+read\s*$/m);
  assert.match(ciWorkflow, /uses:\s+actions\/checkout@v6/);
  assert.match(ciWorkflow, /uses:\s+actions\/setup-node@v6/);
  assert.match(ciWorkflow, /^\s*node-version:\s+22\s*$/m);
  assert.match(ciWorkflow, /^\s*cache:\s+npm\s*$/m);
  assert.match(
    ciWorkflow,
    /npx playwright install --with-deps chromium/,
  );
  assert.match(ciWorkflow, /^\s*run:\s+npm test\s*$/m);
});
