import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const publicDirectory = fileURLToPath(new URL("../public/", import.meta.url));

const mockData = {
  clubId: "081061",
  year: "2026",
  count: 6,
  source: "test-local",
  results: [
    {
      event: "10 km Route",
      athlete: "DUPONT Alice",
      infos: "SEF / 1999",
      sex: "F",
      performance: "35'00''",
      date: "01/06/26",
      location: "Test",
    },
    {
      event: "800m",
      athlete: "MARTIN Lea",
      infos: "BEF / 2013",
      sex: "F",
      performance: "2'45''00",
      date: "01/06/26",
      location: "Test",
    },
    {
      event: "1000m",
      athlete: "MARTIN Lea",
      infos: "BEF / 2013",
      sex: "F",
      performance: "3'20''00",
      place: 1,
      date: "01/06/26",
      location: "Test",
    },
    {
      event: "1000m",
      athlete: "MARTIN Lea",
      infos: "BEF / 2013",
      sex: "F",
      performance: "3'10''00",
      place: 2,
      date: "08/06/26",
      location: "Test 2",
    },
    {
      event: "50m",
      athlete: "DURAND Emma",
      infos: "POF / 2016",
      sex: "F",
      performance: "8''00",
      date: "01/06/26",
      location: "Test",
    },
    {
      event: "3000m Steeple (91)",
      athlete: "BERNARD Paul",
      infos: "SEM / 1998",
      sex: "M",
      performance: "9'00''00",
      date: "01/06/26",
      location: "Test",
    },
  ],
};

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function createTestServer() {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      if (url.pathname === "/api/bilans") {
        if (url.searchParams.get("club") === "999999") {
          response.writeHead(502, {
            "content-type": "application/json; charset=utf-8",
          });
          response.end(JSON.stringify({
            error: "scrape_failed",
            message: "Impossible de récupérer les résultats depuis Athlé.fr.",
          }));
          return;
        }

        response.writeHead(200, {
          "content-type": "application/json; charset=utf-8",
        });
        response.end(JSON.stringify(mockData));
        return;
      }

      const relativePath = url.pathname === "/"
        ? "index.html"
        : decodeURIComponent(url.pathname.slice(1));
      const filePath = path.resolve(publicDirectory, relativePath);

      if (!filePath.startsWith(publicDirectory)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }

      const body = await readFile(filePath);
      response.writeHead(200, {
        "content-type": contentTypes[path.extname(filePath)] ??
          "application/octet-stream",
      });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  });
}

test(
  "affiche les points et les états N/D dans le tableau",
  { timeout: 30_000 },
  async () => {
    const server = createTestServer();
    let browser;

    try {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });

      const address = server.address();
      assert.equal(typeof address, "object");

      browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(String(error)));

      await page.goto(`http://127.0.0.1:${address.port}/`);
      const clubInput = page.getByRole("textbox", { name: "Club" });
      const yearInput = page.getByRole("textbox", { name: "Année" });
      const loadButton = page.getByRole("button", { name: "Charger" });

      await clubInput.fill("12");
      await loadButton.click();
      assert.equal(await clubInput.getAttribute("aria-invalid"), "true");
      await page.getByText("Club invalide (6 chiffres).").waitFor();

      await clubInput.fill("081061");
      await yearInput.fill("1999");
      await loadButton.click();
      assert.equal(await yearInput.getAttribute("aria-invalid"), "true");
      await page.getByText(/Année invalide/).waitFor();

      const categoriesButton = page.getByRole("button", { name: /Catégories/ });
      assert.equal(await categoriesButton.getAttribute("aria-expanded"), "false");
      await categoriesButton.click();
      assert.equal(await categoriesButton.getAttribute("aria-expanded"), "true");
      assert.equal(await page.locator("#catsMenu").getAttribute("aria-hidden"), "false");
      await page.keyboard.press("Escape");
      assert.equal(await categoriesButton.getAttribute("aria-expanded"), "false");
      assert.equal(await page.evaluate(() => document.activeElement?.id), "catsBtn");

      await yearInput.fill("2026");
      await page.getByRole("button", { name: "Charger" }).click();

      const routeRow = page.getByRole("row", { name: /DUPONT Alice/ });
      const benjaminRow = page.getByRole("row", { name: /MARTIN Lea/ });
      const poussinRow = page.getByRole("row", { name: /DURAND Emma/ });
      const steepleRow = page.getByRole("row", { name: /BERNARD Paul/ });
      await routeRow.waitFor();
      await benjaminRow.waitFor();
      await poussinRow.waitFor();
      await steepleRow.waitFor();

      assert.match(await routeRow.innerText(), /35'00''\s+N\/D/);
      assert.match(await benjaminRow.innerText(), /2'45''00\s+N\/D/);
      assert.match(await benjaminRow.innerText(), /3'10''00/);
      assert.doesNotMatch(await benjaminRow.innerText(), /3'20''00/);
      assert.match(await poussinRow.innerText(), /8''00\s+9/);
      assert.match(await steepleRow.innerText(), /9'00''00\s+N\/D/);
      assert.match(
        await page.locator(".points-legend").innerText(),
        /aucun barème disponible/i,
      );
      assert.match(await page.locator("#statusText").innerText(), /OK — lignes: 4/);

      await page.getByRole("button", { name: /Barème : 50/ }).click();
      await page.getByRole("button", { name: "Barème 1000", exact: true }).click();
      assert.match(await routeRow.innerText(), /35'00''\s+986/);
      assert.match(await steepleRow.innerText(), /9'00''00\s+994/);
      assert.match(await poussinRow.innerText(), /8''00\s+N\/D/);

      const athleteHeader = page.locator('th[data-col="athlete"]');
      assert.equal(await athleteHeader.getAttribute("aria-sort"), "ascending");
      await page.getByRole("button", { name: /Nom \/ Prénom/ }).press("Enter");
      assert.equal(await athleteHeader.getAttribute("aria-sort"), "descending");
      assert.match(await page.locator("#tbody tr").first().innerText(), /MARTIN Lea/);

      await page.getByRole("button", { name: /Sexe : Tous/ }).click();
      const womenButton = page.getByRole("button", { name: "Femmes", exact: true });
      await womenButton.click();
      assert.equal(await womenButton.getAttribute("aria-pressed"), "true");

      await page.getByRole("textbox", { name: "Club" }).fill("999999");
      await page.getByRole("button", { name: "Charger" }).click();
      await page.getByText(
        "Erreur: Impossible de récupérer les résultats depuis Athlé.fr.",
      ).waitFor();

      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload();
      const optionsButton = page.getByRole("button", { name: /Options/ });
      assert.equal(await optionsButton.getAttribute("aria-expanded"), "false");
      await optionsButton.click();
      assert.equal(await optionsButton.getAttribute("aria-expanded"), "true");
      await page.locator("#mobileOptionsPanel").waitFor({ state: "visible" });
      assert.deepEqual(errors, []);
    } finally {
      if (browser) await browser.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
