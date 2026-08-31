import express from "express";
import cors from "cors";
import { chromium } from "playwright";
import * as cheerio from "cheerio";
import { pathToFileURL } from "node:url";

const CACHE_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_MAX_ENTRIES = 100;
const SCRAPE_TIMEOUT_MS = 180000;
const MIN_RESULTS_YEAR = 2000;
const MAX_RESULTS_PAGES = 20;

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    const launchPromise = chromium
      .launch({ headless: true })
      .then((instance) => {
        instance.on("disconnected", () => {
          if (browserPromise === launchPromise) browserPromise = null;
        });
        console.log("Browser launched");
        return instance;
      })
      .catch((error) => {
        if (browserPromise === launchPromise) browserPromise = null;
        throw error;
      });

    browserPromise = launchPromise;
  }

  return browserPromise;
}

async function closeBrowser() {
  const currentBrowserPromise = browserPromise;
  browserPromise = null;
  if (!currentBrowserPromise) return;

  try {
    const browser = await currentBrowserPromise;
    if (browser.isConnected()) await browser.close();
  } catch (error) {
    console.error("Fermeture du navigateur impossible :", error);
  }
}

function parseBilansQuery(query, currentYear = new Date().getFullYear()) {
  const club = (query?.club ?? "").toString().trim();
  const annee = (query?.annee ?? String(currentYear)).toString().trim();
  const debug = (query?.debug ?? "").toString().trim() === "1";

  if (!/^\d{6}$/.test(club)) {
    return {
      error: "club doit être un code à 6 chiffres, ex: 081061",
    };
  }

  const yearNumber = Number(annee);
  if (
    !/^\d{4}$/.test(annee) ||
    !Number.isInteger(yearNumber) ||
    yearNumber < MIN_RESULTS_YEAR ||
    yearNumber > currentYear + 1
  ) {
    return {
      error: `annee doit être comprise entre ${MIN_RESULTS_YEAR} et ${currentYear + 1}`,
    };
  }

  return { value: { club, annee, debug } };
}

function createBilansLoader({
  scrape,
  cacheMs = CACHE_MS,
  maxCacheEntries = CACHE_MAX_ENTRIES,
  now = () => Date.now(),
}) {
  const cache = new Map();
  const pending = new Map();

  function pruneCache(timestamp) {
    for (const [key, entry] of cache) {
      if (timestamp - entry.ts >= cacheMs) cache.delete(key);
    }

    while (cache.size > maxCacheEntries) {
      const oldestKey = cache.keys().next().value;
      cache.delete(oldestKey);
    }
  }

  return async function loadBilans(params) {
    if (params.debug) return scrape(params);

    const cacheKey = `${params.club}:${params.annee}`;
    const timestamp = now();
    pruneCache(timestamp);

    const cached = cache.get(cacheKey);
    if (cached) return cached.data;

    const pendingRequest = pending.get(cacheKey);
    if (pendingRequest) return pendingRequest;

    const request = Promise.resolve()
      .then(() => scrape(params))
      .then((data) => {
        const completedAt = now();
        cache.delete(cacheKey);
        cache.set(cacheKey, { ts: completedAt, data });
        pruneCache(completedAt);
        return data;
      })
      .finally(() => {
        pending.delete(cacheKey);
      });

    pending.set(cacheKey, request);
    return request;
  };
}

function withTimeout(promise, timeoutMs, message) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(message);
      error.code = "SCRAPE_TIMEOUT";
      reject(error);
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function gotoWithRetry(
  page,
  url,
  { waitUntil = "domcontentloaded", timeout = 30000 } = {},
  attempts = 3,
) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await page.goto(url, { waitUntil, timeout });
      return;
    } catch (error) {
      lastError = error;
      const message = String(error?.message || error);
      const retryable =
        /ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|net::|Timeout/i.test(message);
      if (!retryable || attempt === attempts) break;
      await page.waitForTimeout(700 * attempt);
    }
  }
  throw lastError;
}

async function scrapeBilans({ club, annee, debug }) {
  const baseUrl =
    `https://www.athle.fr/bases/liste.aspx?frmbase=bilans&frmmode=1&frmespace=1478` +
    `&frmannee=${encodeURIComponent(annee)}&frmclub=${encodeURIComponent(club)}` +
    `&frmcategorie=&frmsexe=&frmepreuve=&frmvent=&frmligue=&frmdepartement=&frmstructure=&frmnationalite=&frmplaces=&frmpostback=true`;

  const browser = await getBrowser();
  let page = null;

  try {
    page = await browser.newPage();
    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (["image", "font", "stylesheet", "media"].includes(type)) {
        return route.abort();
      }
      return route.continue();
    });

    const scrape = (async () => {
      const all = [];
      let debugTextSample = null;
      const debugPages = [];

      await gotoWithRetry(page, `${baseUrl}&frmposition=0`);
      await page
        .getByText("Résultats de votre recherche")
        .waitFor({ timeout: 20000 });

      const firstHtml = await page.content();
      const totalPages = extractTotalPages(firstHtml);
      console.log("Total pages détectées:", totalPages);

      if (debug) {
        debugTextSample = extractNormalizedText(firstHtml).slice(0, 2500);
      }

      function collectPage(html, position) {
        const { results, stats } = parseBilansWithStats(html, club, annee);
        if (debug) {
          debugPages.push({
            pos: position,
            parsedCount: results.length,
            stats,
            first2: results.slice(0, 2),
          });
        }
        all.push(...results);
      }

      collectPage(firstHtml, 0);

      for (let position = 1; position < totalPages; position++) {
        await gotoWithRetry(page, `${baseUrl}&frmposition=${position}`);
        await page
          .getByText("Résultats de votre recherche")
          .waitFor({ timeout: 20000 });
        collectPage(await page.content(), position);
      }

      const uniqueResults = dedup(all);
      const results = uniqueResults.filter((result) =>
        isSupportedEvent(result.event),
      );

      const data = {
        clubId: club,
        year: annee,
        count: results.length,
        results,
        source: "athle.fr",
        ...(debug
          ? {
              debugTextSample,
              debugPages,
              debugSteepleRaw: uniqueResults.filter((result) =>
                /steeple/i.test(result.event)
              ),
              debugSteepleFiltered: results.filter((result) =>
                /steeple/i.test(result.event)
              ),
              debugHeightRaw: uniqueResults.filter((result) =>
                /hauteur/i.test(result.event)
              ),
              debugHeightFiltered: results.filter((result) =>
                /hauteur/i.test(result.event)
              ),
              debugUniqueEvents: [
                ...new Set(uniqueResults.map((result) => result.event)),
              ].sort(),
            }
          : {}),
      };

      return data;
    })();

    return await withTimeout(
      scrape,
      SCRAPE_TIMEOUT_MS,
      "Le scraping a dépassé le temps limite.",
    );
  } finally {
    if (page) {
      await page.close().catch((error) => {
        console.error("Fermeture de la page impossible :", error);
      });
    }
  }
}

const loadBilans = createBilansLoader({ scrape: scrapeBilans });
const app = express();

app.use(cors());
app.use(express.static("public"));

/* =========================
   ROUTE API
========================= */

app.get("/healthz", (_req, res) => {
  res.status(200).send("ok");
});

app.get("/api/bilans", async (req, res) => {
  const parsedQuery = parseBilansQuery(req.query);
  if (parsedQuery.error) {
    return res.status(400).json({ error: parsedQuery.error });
  }

  try {
    const data = await loadBilans(parsedQuery.value);
    return res.json(data);
  } catch (error) {
    console.error("Récupération Athlé.fr échouée :", error);
    const timeout = error?.code === "SCRAPE_TIMEOUT";
    return res.status(timeout ? 504 : 502).json({
      error: "scrape_failed",
      message: timeout
        ? "Athlé.fr n'a pas répondu dans le temps imparti."
        : "Impossible de récupérer les résultats depuis Athlé.fr.",
    });
  }
});

/* =========================
   PAGES
========================= */

function extractTotalPages(html) {
  const $ = cheerio.load(html);

  const pagText = $("div.select-option")
    .toArray()
    .map((el) => $(el).text().replace(/\s+/g, " ").trim())
    .find((text) => /\bPage\b/i.test(text) && /\d+\s*\/\s*\d+/.test(text));

  if (!pagText) return 1;

  const m = pagText.match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return 1;

  const total = parseInt(m[2], 10);
  if (!Number.isFinite(total) || total <= 0) return 1;

  return Math.min(total, MAX_RESULTS_PAGES);
}

/* =========================
   TEXT NORMALIZATION
========================= */

function extractNormalizedText(html) {
  const $ = cheerio.load(html);

  $("a").each((_, el) => {
    const t = $(el).text().trim();
    $(el).replaceWith(` ${t} `);
  });

  let text = $("body").text();

  const start = text.indexOf("Résultats de votre recherche");
  if (start !== -1) text = text.slice(start);

  text = text.replace(/\r/g, "");
  text = text.replace(/\u00A0/g, " ");
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n[ \t]+/g, "\n");
  text = text.replace(/\n{2,}/g, "\n").trim();

  text = text.replace(/([A-Za-zÀ-ÖØ-öø-ÿ\)])(\d{1,4}(?:h|['’]))/g, "$1\n$2");

  text = text.replace(/([A-Za-zÀ-ÖØ-öø-ÿ\)])-(?=(\d{1,2}m\d{2}\b))/g, "$1\n- ");

  text = text.replace(/([A-Za-zÀ-ÖØ-öø-ÿ\)])(?=(\d{1,4}m\d{2}\b))/g, "$1\n");

  text = text.replace(/(\d{2}\/\d{2}\/\d{2})(?=(\d{1,4}m\d{2}\b))/g, "$1\n");

  text = text.replace(
    /(\d{2}\/\d{2}\/\d{2})(?=(\d{2,4}'\d{2}''\d{0,2}|\d{1,3}h\d{2}'\d{2}''\d{0,2}))/g,
    "$1\n",
  );

  text = text.replace(/([A-Za-zÀ-ÖØ-öø-ÿ\)])(\d{4}\s*\|)/g, "$1\n$2");

  text = text.replace(/\n{2,}/g, "\n").trim();
  return text;
}

/* =========================
   PARSING
========================= */

function eventCategory(eventName) {
  const e = normalizeEventName(eventName);
  if (!e) return "Autres";

  if (e.includes("marche")) return "Marche";
  if (/route|trail|cross|marathon|semi/.test(e)) {
    return "Route / Trail / Cross";
  }
  if (/relais|\d+\s*x\s*\d+/.test(e)) return "Sprint";
  if (e.includes("haies")) return "Haie";
  if (e.includes("steeple")) return "Demi-fond / Fond";

  if (
    e.includes("poids") ||
    e.includes("disque") ||
    e.includes("javelot") ||
    e.includes("marteau")
  ) {
    return "Lancers";
  }

  if (
    e.includes("hauteur") ||
    e.includes("perche") ||
    e.includes("longueur") ||
    e.includes("triple saut")
  ) {
    return "Sauts";
  }

  const m = e.match(/(\d[\d ]*)\s*m\b/);
  if (m) {
    const dist = parseInt(m[1].replace(/\s+/g, ""), 10);
    if (Number.isFinite(dist)) {
      if (dist >= 600) return "Demi-fond / Fond";
      return "Sprint";
    }
  }

  return "Autres";
}

function parseBilansWithStats(html, clubId, annee) {
  const text = extractNormalizedText(html);
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const results = [];

  let currentEvent = null;
  let currentSex = null;
  let currentRank = 0;

  const headerRe = new RegExp(
    `^${escapeRegExp(annee)}\\s*\\|\\s*([^|]+)\\|\\s*([FM])\\s*$`,
  );

  const stats = {
    totalLines: lines.length,
    headersSeen: 0,
    clubLinesSeen: 0,
    summarySeen: 0,
    summaryParsedOk: 0,
    firstHeader: null,
    firstClubLine: null,
    firstSummaryLine: null,
    firstSummaryParseError: null,
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const hm = line.match(headerRe);
    if (hm) {
      currentEvent = hm[1].trim();
      currentSex = hm[2].trim();
      currentRank = 0;
      stats.headersSeen += 1;
      if (!stats.firstHeader) stats.firstHeader = line;
      continue;
    }

    if (/^Club\s*:/.test(line)) {
      stats.clubLinesSeen += 1;
      if (!stats.firstClubLine) stats.firstClubLine = line;

      const summaryLine = i > 0 ? lines[i - 1] : null;
      if (!summaryLine) continue;

      if (/^PlacePerformance/i.test(summaryLine.replace(/\s+/g, ""))) continue;

      if (summaryLine.includes(",") && summaryLine.includes("/")) {
        if (!stats.firstSummaryParseError)
          stats.firstSummaryParseError = summaryLine;
        continue;
      }

      stats.summarySeen += 1;
      if (!stats.firstSummaryLine) stats.firstSummaryLine = summaryLine;

      const summary = parseSummaryLine(summaryLine, currentEvent);
      if (!summary) {
        if (!stats.firstSummaryParseError)
          stats.firstSummaryParseError = summaryLine;
        continue;
      }
      stats.summaryParsedOk += 1;

      const clubName = extractBetweenInline(line, "Club", "Ligue");
      const league = extractBetweenInline(line, "Ligue", "Dep.");
      const department = extractBetweenInline(line, "Dep.", "Infos");
      const infos = extractBetweenInline(line, "Infos", "Date");
      const dateField = extractBetweenInline(line, "Date", "Lieu");
      const locationField = extractAfterInline(line, "Lieu");

      const isTiedLine = /^[-–—]\s+/.test(summaryLine);

      const resolvedPlace =
        Number.isFinite(summary.place) && summary.place > 0
          ? summary.place
          : isTiedLine
            ? currentRank
            : currentRank + 1;

      currentRank = resolvedPlace;

      results.push({
        clubId,
        year: annee,
        category: eventCategory(currentEvent),
        event: currentEvent,
        sex: currentSex,
        place: resolvedPlace,
        performance: summary.performance,
        athlete: summary.athlete,
        clubName: clubName ?? null,
        league: league ?? null,
        department: department ?? null,
        infos: infos ?? null,
        date: dateField ?? null,
        location: locationField ?? null,
      });
    }
  }

  return { results, stats };
}

/* =========================
   HELPERS: FICHE INLINE
========================= */

function extractBetweenInline(line, startLabel, endLabel) {
  const startRe = new RegExp(`${escapeRegExp(startLabel)}\\s*:\\s*`, "i");
  const endRe = new RegExp(`\\s*${escapeRegExp(endLabel)}\\s*:`, "i");

  const startIdx = line.search(startRe);
  if (startIdx === -1) return null;

  const afterStart = line.slice(startIdx).replace(startRe, "");
  const endIdx = afterStart.search(endRe);
  const segment = (
    endIdx === -1 ? afterStart : afterStart.slice(0, endIdx)
  ).trim();

  return segment || null;
}

function extractAfterInline(line, startLabel) {
  const startRe = new RegExp(`${escapeRegExp(startLabel)}\\s*:\\s*`, "i");
  const startIdx = line.search(startRe);
  if (startIdx === -1) return null;
  const after = line.slice(startIdx).replace(startRe, "").trim();
  return after || null;
}

/* =========================
   PARSE RÉSUMÉ: PLACE + PERF TOKEN
========================= */

function parseSummaryLine(line, currentEvent) {
  const tokens = line.split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;

  let pp = null;
  const first = tokens[0];
  const second = tokens[1] || "";

  if (/^[-–—]$/.test(first) && second) {
    const perf = cleanPerf(second);
    if (looksLikePerformance(perf, currentEvent)) {
      pp = {
        place: null,
        performance: perf,
      };
    }
  }
  else if (/^\d+$/.test(first) && second) {
    const place = parseInt(first, 10);
    const perf = cleanPerf(second);

    if (looksLikePerformance(perf, currentEvent)) {
      pp = {
        place,
        performance: perf,
      };
    } else {
      const glued = `${first}${second}`;
      pp = parsePlacePerfToken(glued, currentEvent);
    }
  } else {
    pp = parsePlacePerfToken(first, currentEvent);
  }

  if (!pp) return null;

  const nameMatch = line.match(
    /\b([A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý' -]{1,})\s+([A-ZÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ' -]*)\b/,
  );
  if (!nameMatch) return null;

  const lastName = nameMatch[1].trim();
  const firstName = nameMatch[2].trim().split(" ")[0];
  const athlete = `${lastName} ${firstName}`;

  return {
    place: pp.place,
    performance: pp.performance,
    athlete,
  };
}

function parsePlacePerfToken(token, currentEvent) {
  if (!token) return null;

  const raw = cleanPerf(token.trim());
  const event = normalizeEventName(currentEvent || "");

  const isFieldEvent =
    /hauteur|perche|longueur|triple saut|poids|disque|javelot|marteau/.test(
      event,
    );

  if (isFieldEvent) {
    const candidates = [];
    const fieldRange = expectedFieldRange(currentEvent);

    function pushFieldCandidate(place, performance, source) {
      const meters = fieldPerfToMeters(performance);
      if (meters == null) return;

      let score = 0;

      if (fieldRange) {
        const [min, max] = fieldRange;
        if (meters >= min && meters <= max) score += 100;
        else score -= 100;
      }

      if (place == null) score += 20;
      else if (place >= 1 && place <= 99) score += 5;

      candidates.push({
        place,
        performance,
        source,
        score,
      });
    }

    if (
      /^\d{1,2}m\d{2}$/i.test(raw) ||
      /^\d+[,.]\d{1,2}$/.test(raw) ||
      /^\d+cm$/i.test(raw)
    ) {
      pushFieldCandidate(null, raw, "whole");
    }

    for (let cut = 1; cut <= 2 && cut < raw.length; cut++) {
      const placeStr = raw.slice(0, cut);
      const perfStr = cleanPerf(raw.slice(cut));

      const place = parseInt(placeStr, 10);
      if (!Number.isFinite(place) || place <= 0) continue;

      if (/^0\d*m\d{2}$/i.test(perfStr)) continue;
      if (/^0\d*[,.]\d{1,2}$/.test(perfStr)) continue;
      if (/^0\d*cm$/i.test(perfStr)) continue;

      if (
        /^\d{1,2}m\d{2}$/i.test(perfStr) ||
        /^\d+[,.]\d{1,2}$/.test(perfStr) ||
        /^\d+cm$/i.test(perfStr)
      ) {
        pushFieldCandidate(place, perfStr, "split");
      }
    }

    if (!candidates.length) return null;

    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;

      if ((a.place == null) !== (b.place == null)) {
        return a.place == null ? -1 : 1;
      }

      const aPlace = Number.isFinite(a.place) ? a.place : 9999;
      const bPlace = Number.isFinite(b.place) ? b.place : 9999;
      return aPlace - bPlace;
    });

    return {
      place: candidates[0].place,
      performance: candidates[0].performance,
    };
  }

  let t = raw;
  t = normalizeRouteHourPerf(t, currentEvent);

  const candidates = [];
  const aggressive = isAggressiveSplitEvent(currentEvent);

  if (looksLikePerformance(t, currentEvent)) {
    candidates.push({
      place: null,
      performance: t,
    });
  }

  if (aggressive) {
    for (let cut = 1; cut <= 2 && cut < raw.length; cut++) {
      const placeStr = raw.slice(0, cut);
      const perfStr = cleanPerf(raw.slice(cut));

      const place = parseInt(placeStr, 10);
      if (!Number.isFinite(place) || place <= 0) continue;
      if (!perfStr) continue;

      const normalizedPerf = normalizeRouteHourPerf(perfStr, currentEvent);
      if (!looksLikePerformance(normalizedPerf, currentEvent)) continue;

      candidates.push({
        place,
        performance: normalizedPerf,
      });
    }
  }

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    const scoreDiff =
      scoreCandidate(b, currentEvent) - scoreCandidate(a, currentEvent);
    if (scoreDiff !== 0) return scoreDiff;

    const aPlaceLen = String(a.place ?? "").length;
    const bPlaceLen = String(b.place ?? "").length;
    if (bPlaceLen !== aPlaceLen) return bPlaceLen - aPlaceLen;

    const aPlace = Number.isFinite(a.place) ? a.place : 9999;
    const bPlace = Number.isFinite(b.place) ? b.place : 9999;
    return aPlace - bPlace;
  });

  const best = { ...candidates[0] };

  if (typeof best.performance === "string") {
    best.performance = best.performance
      .replace(/^0(?=\d''\d{2}$)/, "")
      .replace(/^0(?=\d{1,2}'\d{2}''\d{0,2}$)/, "")
      .replace(/^0h(?=\d{2}'\d{2}''\d{0,2}$)/i, "");
  }

  return best;
}

function looksLikePerformance(s, currentEvent) {
  const t = (s || "").trim();
  if (!t) return false;

  const x = t
    .replace(/"/g, "''")
    .replace(/″/g, "''")
    .replace(/’’/g, "''")
    .trim();

  if (/^\d+m\d+$/i.test(x)) return true;
  if (/^\d+[,.]\d{1,2}$/.test(x)) return true;
  if (/^\d+cm$/i.test(x)) return true;

  if (/^0\d''\d{2}$/.test(x)) return false;
  if (/^0\d{1,2}'\d{2}''\d{0,2}$/.test(x)) return false;
  if (/^0\d+h\d{2}'\d{2}''\d{0,2}$/i.test(x)) return false;

  if (/^\d{1,2}h\d{2}'\d{2}''\d{0,2}$/i.test(x)) return true;
  if (/^\d{1,3}'\d{2}''\d{0,2}$/.test(x)) return true;
  if (/^\d{1,2}''\d{2}$/.test(x)) return true;

  return false;
}

function eventType(eventName) {
  const e = (eventName || "").toLowerCase();

  if (/haies/.test(e)) {
    const m = e.match(/(\d+)\s*m/);
    const d = m ? parseInt(m[1], 10) : null;
    if (d != null && d <= 80) return "short-sprint";
    if (d != null && d <= 150) return "sprint";
    if (d === 400) return "long-sprint";
  }

  if (/route|marathon|marche|cross|steeple/.test(e)) return "endurance";

  const m = e.match(/(\d+)\s*m/);
  const d = m ? parseInt(m[1], 10) : null;

  if (d == null) return "other";
  if (d <= 80) return "short-sprint";
  if (d <= 200) return "sprint";
  if (d <= 400) return "long-sprint";
  if (d >= 600) return "endurance";

  return "other";
}

function perfToSeconds(perf) {
  const p = (perf || "").trim();

  let m = p.match(/^(\d{1,2})''(\d{2})$/);
  if (m) {
    return parseInt(m[1], 10) + parseInt(m[2], 10) / 100;
  }

  m = p.match(/^(\d{1,3})'(\d{2})''(\d{0,2})$/);
  if (m) {
    const min = parseInt(m[1], 10);
    const sec = parseInt(m[2], 10);
    const cs = parseInt((m[3] || "0").padEnd(2, "0"), 10);
    return min * 60 + sec + cs / 100;
  }

  m = p.match(/^(\d{1,2})h(\d{2})'(\d{2})''(\d{0,2})$/i);
  if (m) {
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const sec = parseInt(m[3], 10);
    const cs = parseInt((m[4] || "0").padEnd(2, "0"), 10);
    return h * 3600 + min * 60 + sec + cs / 100;
  }

  return null;
}

function expectedPerfRangeSeconds(eventName) {
  const e = normalizeEventName(eventName);

  // haies
  if (/^50\s*m\s+haies\b/.test(e)) return [7, 20];
  if (/^60\s*m\s+haies\b/.test(e)) return [8, 25];
  if (/^80\s*m\s+haies\b/.test(e)) return [10, 30];
  if (/^100\s*m\s+haies\b/.test(e)) return [12, 35];
  if (/^110\s*m\s+haies\b/.test(e)) return [13, 40];
  if (/^200\s*m\s+haies\b/.test(e)) return [25, 80];
  if (/^300\s*m\s+haies\b/.test(e)) return [35, 110];
  if (/^320\s*m\s+haies\b/.test(e)) return [40, 120];
  if (/^400\s*m\s+haies\b/.test(e)) return [45, 160];

  // steeple
  if (/^(1500|1 500)\s*m\s+steeple\b/.test(e)) return [240, 1000];
  if (/^(2000|2 000)\s*m\s+steeple\b/.test(e)) return [360, 1400];
  if (/^(3000|3 000)\s*m\s+steeple\b/.test(e)) return [500, 2200];

  // plat
  if (/^50\s*m\b/.test(e) && !/haies/.test(e)) return [5, 20];
  if (/^60\s*m\b/.test(e) && !/haies/.test(e)) return [6, 25];
  if (/^80\s*m\b/.test(e) && !/haies/.test(e)) return [8, 30];
  if (/^100\s*m\b/.test(e) && !/haies/.test(e)) return [10, 35];
  if (/^120\s*m\b/.test(e) && !/haies/.test(e)) return [12, 40];
  if (/^200\s*m\b/.test(e) && !/haies/.test(e)) return [20, 70];
  if (/^300\s*m\b/.test(e) && !/haies/.test(e)) return [30, 100];
  if (/^400\s*m\b/.test(e) && !/haies/.test(e)) return [40, 140];
  if (/^600\s*m\b/.test(e)) return [60, 250];
  if (/^800\s*m\b/.test(e)) return [70, 400];
  if (/^(1000|1 000)\s*m\b/.test(e)) return [120, 500];
  if (/^(1500|1 500)\s*m\b/.test(e)) return [180, 700];
  if (/^(2000|2 000)\s*m\b/.test(e)) return [300, 1000];
  if (/^(3000|3 000)\s*m\b/.test(e)) return [450, 1500];
  if (/^(5000|5 000)\s*m\b/.test(e)) return [700, 3000];
  if (/^(10000|10 000)\s*m\b/.test(e)) return [1500, 6000];

  return null;
}
function expectedFieldRange(eventName) {
  const e = normalizeEventName(eventName);

  // sauts
  if (/hauteur/.test(e)) return [0.8, 2.6];
  if (/perche/.test(e)) return [1.0, 6.5];
  if (/longueur/.test(e)) return [2.0, 9.5];
  if (/triple saut/.test(e)) return [4.0, 19.0];

  // poids
  if (/poids\s*\(2\s*kg\)/.test(e)) return [3.0, 15.0];
  if (/poids\s*\(3\s*kg\)/.test(e)) return [4.0, 18.0];
  if (/poids\s*\(4\s*kg\)/.test(e)) return [5.0, 22.0];
  if (/poids\s*\(5\s*kg\)/.test(e)) return [5.0, 22.0];
  if (/poids\s*\(7\.?26\s*kg\)/.test(e)) return [5.0, 25.0];
  if (/poids/.test(e)) return [3.0, 25.0];

  // disque
  if (/disque\s*\(0\.?6\s*kg\)/.test(e)) return [5.0, 25.0];
  if (/disque\s*\(0\.?8\s*kg\)/.test(e)) return [5.0, 35.0];
  if (/disque\s*\(1\.?0\s*kg\)/.test(e)) return [8.0, 45.0];
  if (/disque\s*\(1[.,]2(?:5)?\s*kg\)/.test(e)) return [8.0, 50.0];
  if (/disque\s*\(1\.?5\s*kg\)/.test(e)) return [8.0, 55.0];
  if (/disque\s*\(2\.?0\s*kg\)/.test(e)) return [8.0, 70.0];
  if (/disque/.test(e)) return [5.0, 70.0];

  // javelot
  if (/javelot\s*\(400\s*g\)/.test(e)) return [3.0, 25.0];
  if (/javelot\s*\(500\s*g\)/.test(e)) return [5.0, 35.0];
  if (/javelot\s*\(600\s*g\)/.test(e)) return [8.0, 60.0];
  if (/javelot\s*\(700\s*g\)/.test(e)) return [10.0, 80.0];
  if (/javelot\s*\(800\s*g\)/.test(e)) return [10.0, 90.0];
  if (/javelot/.test(e)) return [3.0, 90.0];

  // marteau
  if (/marteau\s*\(3\s*kg\)/.test(e)) return [5.0, 35.0];
  if (/marteau\s*\(4\s*kg\)/.test(e)) return [5.0, 50.0];
  if (/marteau\s*\(5\s*kg\)/.test(e)) return [5.0, 60.0];
  if (/marteau\s*\(7\.?26\s*kg\)/.test(e)) return [5.0, 80.0];
  if (/marteau/.test(e)) return [5.0, 80.0];

  return null;
}

function fieldPerfToMeters(perf) {
  const s = String(perf || "")
    .trim()
    .replace(",", ".");

  let m = s.match(/^(\d+)\s*m\s*(\d{1,2})$/i);
  if (m) {
    const meters = Number(m[1]);
    const cm = Number(m[2]);
    if (Number.isFinite(meters) && Number.isFinite(cm)) {
      return meters + cm / 100;
    }
  }

  m = s.match(/^(\d+)\.(\d{1,2})$/);
  if (m) {
    const meters = Number(m[1]);
    const cm = Number(m[2]);
    if (Number.isFinite(meters) && Number.isFinite(cm)) {
      return meters + cm / 100;
    }
  }

  m = s.match(/^(\d+)\s*m$/i);
  if (m) {
    const meters = Number(m[1]);
    if (Number.isFinite(meters)) return meters;
  }

  return null;
}

function scoreCandidate(c, currentEvent) {
  const perf = c.performance || "";
  const type = eventType(currentEvent);
  const event = normalizeEventName(currentEvent);
  let score = 0;

  if (c.place == null) score += 1;
  else if (c.place >= 1 && c.place <= 99) score += 4;
  else score -= 8;

  if (type === "short-sprint") {
    if (/^[5-9]''\d{2}$/.test(perf)) score += 12;
    if (/^1\d''\d{2}$/.test(perf)) score += 5;
    if (/^\d{1,2}'/.test(perf)) score -= 10;
  }

  if (type === "sprint") {
    if (/^\d{1,2}''\d{2}$/.test(perf)) score += 10;
    if (/^\d{1,2}'/.test(perf)) score -= 10;
  }

  if (type === "long-sprint") {
    if (/^\d{1,2}''\d{2}$/.test(perf)) score += 10;
    if (/^\d{1,2}'/.test(perf)) score -= 6;
  }

  if (type === "endurance") {
    if (/^\d{1,2}h\d{2}'\d{2}''/.test(perf)) score += 12;
    if (/^\d{1,3}'\d{2}''/.test(perf)) score += 12;
    if (/^\d{1,2}''\d{2}$/.test(perf)) score -= 14;

    if (event.includes("route") && /^0h/i.test(perf)) score -= 30;
  }

  const secs = perfToSeconds(perf);
  const range = expectedPerfRangeSeconds(currentEvent);
  if (range && secs != null) {
    const [min, max] = range;
    if (secs >= min && secs <= max) score += 30;
    else score -= 30;
  }

  if (/^\d+m\d+$/i.test(perf)) {
    score += 10;

    const meters = fieldPerfToMeters(perf);
    const fieldRange = expectedFieldRange(currentEvent);
    if (meters != null && fieldRange) {
      const [min, max] = fieldRange;
      if (meters >= min && meters <= max) score += 30;
      else score -= 30;
    }
  }

  return score;
}

function cleanPerf(s) {
  return s.replace(/\(.*?\)/g, "").trim();
}

function normalizeEventName(eventName) {
  return (eventName || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function isSupportedEvent(eventName) {
  const e = normalizeEventName(eventName);
  if (!e) return false;

  // Disciplines sans barème systématique mais déjà prises en charge par
  // l'interface et le parseur. Elles restent visibles avec la mention N/D.
  if (/route|trail|cross|marathon|semi/.test(e)) return true;
  if (e.includes("marche")) return true;
  if (/relais|\d+\s*x\s*\d+/.test(e)) return true;

  // sauts
  if (
    e.includes("hauteur") ||
    e.includes("perche") ||
    e.includes("longueur") ||
    e.includes("triple saut")
  ) {
    return true;
  }

  // lancers
  if (
    e.includes("poids") ||
    e.includes("disque") ||
    e.includes("javelot") ||
    e.includes("marteau")
  ) {
    return true;
  }

  const m = e.match(/(\d[\d ]*)\s*m\b/);
  if (!m) return false;

  const dist = parseInt(m[1].replace(/\s+/g, ""), 10);
  if (!Number.isFinite(dist)) return false;

  // haies
  if (e.includes("haies")) {
    return [50, 60, 80, 100, 110, 200, 300, 320, 400].includes(dist);
  }

  // steeple
  if (e.includes("steeple")) {
    return [1500, 2000, 3000].includes(dist);
  }

  // plat
  return [
    50, 60, 80, 100, 120, 200, 300, 400, 600, 800, 1000, 1500, 2000, 3000,
    5000, 10000,
  ].includes(dist);
}

function isAggressiveSplitEvent(eventName) {
  return isSupportedEvent(eventName);
}

/* =========================
   UTILS
========================= */

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dedup(arr) {
  const seen = new Set();
  const out = [];
  for (const r of arr) {
    const key = `${r.year}|${r.event}|${r.sex}|${r.place}|${r.athlete}|${r.performance}|${r.date}|${r.location}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(r);
    }
  }
  return out;
}

function isRouteLikeEvent(eventName) {
  const e = normalizeEventName(eventName);
  return (
    e.includes("route") ||
    e.includes("trail") ||
    e.includes("cross") ||
    e.includes("marathon") ||
    e.includes("1/2 marathon") ||
    e.includes("semi")
  );
}

function normalizeRouteHourPerf(token, currentEvent) {
  if (!isRouteLikeEvent(currentEvent)) return token;

  const t = cleanPerf(token.trim());

  const m = t.match(/^(\d{3,4})'(\d{2})''(\d{0,2})$/);
  if (!m) return t;

  const left = m[1];
  const sec = m[2];
  const extra = m[3] || "";

  const hours = left.slice(0, -2);
  const minutes = left.slice(-2);

  if (!hours || !minutes) return t;

  return `${parseInt(hours, 10)}h${minutes}'${sec}''${extra}`;
}

const PORT = process.env.PORT || 3001;

export {
  app,
  closeBrowser,
  createBilansLoader,
  eventCategory,
  eventType,
  extractTotalPages,
  expectedPerfRangeSeconds,
  isSupportedEvent,
  normalizeRouteHourPerf,
  parseBilansQuery,
  parsePlacePerfToken,
  parseSummaryLine,
  withTimeout,
};

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

function startServer(port = PORT) {
  const server = app.listen(port, () => {
    const address = server.address();
    const activePort = typeof address === "object" ? address?.port : port;
    console.log(`API on port ${activePort}`);
    getBrowser().catch((err) => {
      console.error("Préchargement Playwright échoué :", err);
    });
  });

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Arrêt du serveur (${signal})…`);

    server.close(async (error) => {
      await closeBrowser();
      if (error) {
        console.error("Arrêt du serveur impossible :", error);
        process.exitCode = 1;
      }
    });
  }

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  return server;
}

export { startServer };

if (isMainModule) {
  startServer();
}
