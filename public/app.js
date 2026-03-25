const clubEl = document.getElementById("club");
const anneeEl = document.getElementById("annee");
const btnFetch = document.getElementById("btnFetch");

// Cat dropdown
const catsBtn = document.getElementById("catsBtn");
const catsMenu = document.getElementById("catsMenu");
const catsList = document.getElementById("catsList");
const selectAllCatsBtn = document.getElementById("selectAllCats");
const clearCatsBtn = document.getElementById("clearCats");

// Event-group dropdown
const evtBtn = document.getElementById("evtBtn");
const evtMenu = document.getElementById("evtMenu");
const evtList = document.getElementById("evtList");
const selectAllEvtBtn = document.getElementById("selectAllEvt");
const clearEvtBtn = document.getElementById("clearEvt");

const thead = document.getElementById("thead");
const tbody = document.getElementById("tbody");
const statusText = document.getElementById("statusText");
const countBadge = document.getElementById("countBadge");

let rawResults = [];
let pivoted = null; // { events, rows, cats, eventGroupsPresent }
let filteredRows = [];

let selectedCats = new Set();
let selectedEvtGroups = new Set();

let sortState = {
  col: "athlete", // "athlete" | "cat" | "sex" | baseEventName
  mode: "asc",    // "asc" | "desc" | "best" | "worst" | "none"
};

function setStatus(text, count = null) {
  statusText.textContent = text;
  if (typeof count === "number") {
    countBadge.hidden = false;
    countBadge.textContent = String(count);
  } else {
    countBadge.hidden = true;
  }
}

function validClub(s) {
  return /^\d{6}$/.test((s || "").trim());
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================
   Catégories (sans année)
========================= */

function categoryLabelFromInfos(infos) {
  const s = (infos || "").trim();
  if (!s) return "";

  const token = s.split("/")[0].trim().toUpperCase();
  const prefix2 = token.slice(0, 2);

  switch (prefix2) {
    case "EA": return "Éveil";
    case "PO": return "Poussin";
    case "BE": return "Benjamin";
    case "MI": return "Minime";
    case "CA": return "Cadet";
    case "JU": return "Junior";
    case "ES": return "Espoir";
    case "SE": return "Senior";
    case "MA": return "Master";
    default: return token || s;
  }
}

const CAT_ORDER = [
  "Éveil",
  "Poussin",
  "Benjamin",
  "Minime",
  "Cadet",
  "Junior",
  "Espoir",
  "Senior",
  "Master",
];

/* =========================
   Normalisation des épreuves
========================= */

function normalizeEventName(eventName) {
  let e = (eventName || "").trim();

  e = e.replace(/\u00a0/g, " ");
  e = e.replace(/(\d)\s+(\d)/g, "$1$2"); // "2 000" -> "2000"
  e = e.replace(/\s+/g, " ").trim();

  const lower = e.toLowerCase();

  const removeTokens = [
    "piste courte",
    "piste-courte",
    "pc",
    "salle",
    "indoor",
    "en salle",
    "piste couverte",
  ];

  let base = lower;
  for (const t of removeTokens) {
    base = base.replace(new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), "");
  }
  base = base.replace(/\s+/g, " ").trim();
  base = base.replace(/\s+nn\b/g, "").trim();
  base = base.replace(/\bkm\b/g, "km");
  base = base.replace(/\b(\d+)\s*m\b/g, "$1m");

  if (/\b(\d+)\s*km\b/.test(base) && /route|trail|cross/.test(base)) {
    return base
      .replace(/\b(\d+)\s*km\b/, (m, d) => `${d} Km`)
      .replace(/\broute\b/g, "Route")
      .replace(/\btrail\b/g, "Trail")
      .replace(/\bcross\b/g, "Cross")
      .replace(/\s+/g, " ")
      .trim();
  }

  if (/steeple/.test(base)) {
    base = base.replace(/\bsteeple\b/g, "Steeple");
    base = base.replace(/\b(\d+)m\b/i, "$1m");
    return base.replace(/\s+/g, " ").trim();
  }

  if (/haies/.test(base)) {
    base = base.replace(/\bhaies\b/g, "Haies");
    base = base.replace(/\b(\d+)m\b/i, "$1m");
    return base.replace(/\s+/g, " ").trim();
  }

  if (/marche/.test(base)) {
    base = base.replace(/\bmarche\b/g, "Marche");
    base = base.replace(/\b(\d+)m\b/i, "$1m");
    return base.replace(/\s+/g, " ").trim();
  }

  if (/relais|4x/.test(base)) {
    base = base.replace(/\brelais\b/g, "Relais");
    return base.replace(/\s+/g, " ").trim();
  }

  const m = base.match(/\b(\d+)m\b/);
  if (m) {
    return base.replace(/\b(\d+)m\b/i, "$1m").replace(/\s+/g, " ").trim();
  }

  return base.length ? base[0].toUpperCase() + base.slice(1) : e;
}

/* =========================
   Groupes d’épreuves
========================= */

const EVT_GROUP_ORDER = [
  "Sprint",
  "Haie",
  "Demi-fond / Fond",
  "Sauts",
  "Lancers",
  "Marche",
  "Route / Trail / Cross",
  "Combinées",
  "Autres",
];

function eventGroupFromName(eventName) {
  const norm = normalizeEventName(eventName);
  let e = norm.toLowerCase();

  e = e.replace(/\u00a0/g, " ");
  e = e.replace(/(\d)\s+(\d)/g, "$1$2");
  e = e.replace(/\s+/g, " ").trim();

  if (/(longueur|triple|hauteur|perche)/.test(e)) return "Sauts";
  if (/(poids|disque|javelot|marteau)/.test(e)) return "Lancers";
  if (/marche/.test(e)) return "Marche";

  if (/(tri'?athlon|tetrathlon|pentathlon|heptathlon|d[ée]cathlon|combin)/.test(e)) {
    return "Combinées";
  }

  if (/(route|trail|cross|semi|marathon)/.test(e)) return "Route / Trail / Cross";
  if (/\b\d+(\.\d+)?\s*km\b/.test(e) && /(route|trail|cross)/.test(e)) return "Route / Trail / Cross";

  if (/haies/.test(e)) return "Haie";
  if (/steeple|mile/.test(e)) return "Demi-fond / Fond";

  if (/relais|4x/.test(e)) return "Sprint";
  if (/\b(30|40|50|60|80|100|110|120|150|200|300|400)m\b/.test(e)) return "Sprint";

  if (/\b(800|1000|1500|1600|2000|3000|5000|10000)m\b/.test(e)) return "Demi-fond / Fond";

  return "Autres";
}

function getEventSortInfo(eventName) {
  const e = normalizeEventName(eventName).toLowerCase();

  // courses / haies / steeple
  const m = e.match(/(\d+)\s*m\b/);
  if (m) {
    const meters = parseInt(m[1], 10);

    let subtype = 0;
    if (e.includes("haies")) subtype = 1;
    else if (e.includes("steeple")) subtype = 2;

    return {
      bucket: 0,
      meters,
      subtype,
      label: e,
    };
  }

  // sauts
  if (e.includes("hauteur")) {
    return { bucket: 1, family: 1, weight: 0, label: e };
  }
  if (e.includes("perche")) {
    return { bucket: 1, family: 2, weight: 0, label: e };
  }
  if (e.includes("longueur")) {
    return { bucket: 1, family: 3, weight: 0, label: e };
  }
  if (e.includes("triple saut")) {
    return { bucket: 1, family: 4, weight: 0, label: e };
  }

  // lancers
  if (e.includes("poids")) {
    return { bucket: 2, family: 1, weight: extractThrowWeight(e), label: e };
  }
  if (e.includes("disque")) {
    return { bucket: 2, family: 2, weight: extractThrowWeight(e), label: e };
  }
  if (e.includes("javelot")) {
    return { bucket: 2, family: 3, weight: extractThrowWeight(e), label: e };
  }
  if (e.includes("marteau")) {
    return { bucket: 2, family: 4, weight: extractThrowWeight(e), label: e };
  }

  return {
    bucket: 9,
    meters: 99999,
    subtype: 9,
    family: 999,
    weight: 999999,
    label: e,
  };
}

function extractThrowWeight(e) {
  let m = e.match(/\(([\d.]+)\s*kg\)/i);
  if (m) return Math.round(Number(m[1]) * 1000);

  m = e.match(/\((\d+)\s*g\)/i);
  if (m) return Number(m[1]);

  return 999999;
}

function compareEventNames(a, b) {
  const A = getEventSortInfo(a);
  const B = getEventSortInfo(b);

  if (A.bucket !== B.bucket) return A.bucket - B.bucket;

  // courses
  if (A.bucket === 0) {
    if (A.meters !== B.meters) return A.meters - B.meters;
    if (A.subtype !== B.subtype) return A.subtype - B.subtype;
    return A.label.localeCompare(B.label, "fr", { sensitivity: "base" });
  }

  // sauts
  if (A.bucket === 1) {
    if (A.family !== B.family) return A.family - B.family;
    return A.label.localeCompare(B.label, "fr", { sensitivity: "base" });
  }

  // lancers
  if (A.bucket === 2) {
    if (A.family !== B.family) return A.family - B.family;
    if (A.weight !== B.weight) return A.weight - B.weight;
    return A.label.localeCompare(B.label, "fr", { sensitivity: "base" });
  }

  return A.label.localeCompare(B.label, "fr", { sensitivity: "base" });
}

/* =========================
   Pivot
========================= */

function betterResult(a, b) {
  if (!a) return b;
  if (!b) return a;

  const pa = a.place == null ? null : Number(a.place);
  const pb = b.place == null ? null : Number(b.place);

  // place plus petite = meilleur
  if (Number.isFinite(pa) && Number.isFinite(pb)) return pb < pa ? b : a;
  if (Number.isFinite(pa) && pb == null) return a;
  if (Number.isFinite(pb) && pa == null) return b;

  // pas de places -> comparer la perf
  const av = perfToComparable(a.performance);
  const bv = perfToComparable(b.performance);
  if (!av) return b;
  if (!bv) return a;

  const dist = av.type === "dist" || bv.type === "dist";
  return dist ? (av.value >= bv.value ? a : b) : (av.value <= bv.value ? a : b);
}

function bestResultFromList(list) {
  if (!Array.isArray(list) || !list.length) return null;
  return list.reduce((best, r) => betterResult(best, r), null);
}

function sortResultsList(list) {
  if (!Array.isArray(list)) return [];
  return [...list].sort((a, b) => {
    const best = betterResult(a, b);
    if (best === a) return -1;
    if (best === b) return 1;
    return 0;
  });
}

function pivot(results) {
  const baseEventSet = new Set();
  const catSet = new Set();
  const evtGroupSet = new Set();
  const athletes = new Map();

  for (const r of results) {
    const rawEvent = (r.event ?? "").trim();
    const baseEvent = normalizeEventName(rawEvent);

    const athlete = (r.athlete ?? "").trim();
    const infos = (r.infos ?? "").trim();
    const sex = (r.sex ?? "").trim();
    const cat = categoryLabelFromInfos(infos);

    // 800m uniquement Cadet et +
    if (baseEvent === "800m") {
      const allowed = ["Cadet", "Junior", "Espoir", "Senior", "Master"];
      if (!allowed.includes(cat)) continue;
    }

    if (!baseEvent || !athlete) continue;

    baseEventSet.add(baseEvent);
    evtGroupSet.add(eventGroupFromName(baseEvent));
    if (cat) catSet.add(cat);

    const key = `${athlete}||${cat}||${sex}`;
    if (!athletes.has(key)) {
      athletes.set(key, { athlete, cat, sex, perEvent: new Map() });
    }

    const row = athletes.get(key);

    if (!row.perEvent.has(baseEvent)) {
      row.perEvent.set(baseEvent, []);
    }

    const arr = row.perEvent.get(baseEvent);

    const exists = arr.some((x) =>
      x.performance === r.performance &&
      x.date === r.date &&
      x.location === r.location
    );

    if (!exists) {
      arr.push(r);
    }
  }

  const events = Array.from(baseEventSet).sort(compareEventNames);

  const cats = Array.from(catSet).sort((a, b) => {
    const ia = CAT_ORDER.indexOf(a);
    const ib = CAT_ORDER.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    return a.localeCompare(b, "fr", { sensitivity: "base" });
  });

  const eventGroupsPresent = Array.from(evtGroupSet).sort((a, b) => {
    const ia = EVT_GROUP_ORDER.indexOf(a);
    const ib = EVT_GROUP_ORDER.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    return a.localeCompare(b, "fr", { sensitivity: "base" });
  });

  const rows = Array.from(athletes.values());
  return { events, rows, cats, eventGroupsPresent };
}

/* =========================
   Perf parsing (tri best/worst)
========================= */

function looksLikePerformance(s) {
  return /\d/.test(s) && /['’":hHmM\.,]/.test(s);
}

function cleanPerf(s) {
  return String(s).replace(/\(.*?\)/g, "").trim();
}

function perfToComparable(perf) {
  if (!perf) return null;

  let s = cleanPerf(perf);
  if (!s) return null;

  s = s.replace(/\u00a0/g, " ").trim();

  // distances : 5m82 / 1m53 / 14m32
  let m = s.match(/^(\d+)\s*m\s*(\d{1,2})$/i);
  if (m) {
    const meters = Number(m[1]);
    const cm = Number(m[2]);
    if (Number.isFinite(meters) && Number.isFinite(cm)) {
      return { type: "dist", value: meters + cm / 100 };
    }
  }

  // distances : 6,12 / 6.12
  m = s.match(/^(\d+)[,.](\d{1,2})$/);
  if (m) {
    const meters = Number(m[1]);
    const cm = Number(m[2]);
    if (Number.isFinite(meters) && Number.isFinite(cm)) {
      return { type: "dist", value: meters + cm / 100 };
    }
  }

  // distance entière simple
  m = s.match(/^(\d+)\s*m$/i);
  if (m) {
    const meters = Number(m[1]);
    if (Number.isFinite(meters)) {
      return { type: "dist", value: meters };
    }
  }

  // temps avec :
  // 7''53 / 1'53''43 / 1h07'20'' / 1:07:20
  if (s.includes(":")) {
    const parts = s.split(":").map((p) => p.trim());
    let secPart = parts.pop();
    let frac = 0;

    if (secPart.includes(".")) {
      const [secStr, fracStr] = secPart.split(".");
      secPart = secStr;
      frac = Number("0." + fracStr);
    }

    const secs = Number(secPart);
    if (!Number.isFinite(secs)) return null;

    let total = secs + frac;
    let mult = 60;

    while (parts.length) {
      const n = Number(parts.pop());
      if (!Number.isFinite(n)) return null;
      total += n * mult;
      mult *= 60;
    }

    return { type: "time", value: total };
  }

  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  let hundredths = 0;

  const hm = s.match(/(\d+)\s*h/i);
  if (hm) hours = Number(hm[1]);

  const mm = s.match(/(\d+)\s*'(?!')/);
  if (mm) minutes = Number(mm[1]);

  const sm = s.match(/(\d+)\s*''\s*(\d+)?/);
  if (sm) {
    seconds = Number(sm[1]);
    hundredths = sm[2] ? Number(sm[2]) : 0;
  } else {
    const nm = s.match(/^\d+([.,]\d+)?$/);
    if (nm) {
      return { type: "time", value: Number(s.replace(",", ".")) };
    }
    if (!looksLikePerformance(s)) return null;
  }

  if (![hours, minutes, seconds, hundredths].every(Number.isFinite)) return null;

  const total = hours * 3600 + minutes * 60 + seconds + (hundredths ? hundredths / 100 : 0);
  if (!Number.isFinite(total) || total === 0) return null;

  return { type: "time", value: total };
}

function comparePerf(aPerf, bPerf, mode /* best|worst */) {
  const a = perfToComparable(aPerf);
  const b = perfToComparable(bPerf);

  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;

  if (a.type !== b.type) return a.type === "time" ? -1 : 1;

  let d;
  if (a.type === "time") d = a.value - b.value;
  else d = b.value - a.value;

  return mode === "best" ? d : -d;
}

/* =========================
   Dropdown catégories
========================= */

function updateCatsButtonLabel() {
  const n = selectedCats.size;
  catsBtn.textContent = n > 0 ? `Catégories (${n}) ▼` : "Catégories ▼";
}

function fillCategoriesOptions(cats) {
  catsList.innerHTML = "";
  selectedCats.clear();

  cats.forEach((cat) => {
    const safeId = "cat_" + cat.replace(/[^\w]/g, "_");
    const label = document.createElement("label");
    label.innerHTML = `
      <input type="checkbox" value="${escapeHtml(cat)}" id="${safeId}">
      ${escapeHtml(cat)}
    `;
    const cb = label.querySelector("input");
    cb.addEventListener("change", () => {
      if (cb.checked) selectedCats.add(cat);
      else selectedCats.delete(cat);
      applyFiltersAndSort();
      updateCatsButtonLabel();
    });
    catsList.appendChild(label);
  });

  updateCatsButtonLabel();
}

catsBtn.addEventListener("click", () => catsMenu.classList.toggle("hidden"));

document.addEventListener("click", (e) => {
  if (!e.target.closest(".dropdown")) {
    catsMenu.classList.add("hidden");
    evtMenu.classList.add("hidden");
  }
});

selectAllCatsBtn.addEventListener("click", () => {
  selectedCats.clear();
  catsList.querySelectorAll("input[type=checkbox]").forEach((cb) => {
    cb.checked = true;
    selectedCats.add(cb.value);
  });
  applyFiltersAndSort();
  updateCatsButtonLabel();
});

clearCatsBtn.addEventListener("click", () => {
  selectedCats.clear();
  catsList.querySelectorAll("input[type=checkbox]").forEach((cb) => (cb.checked = false));
  applyFiltersAndSort();
  updateCatsButtonLabel();
});

/* =========================
   Dropdown groupes d’épreuves
========================= */

function updateEvtButtonLabel() {
  const n = selectedEvtGroups.size;
  evtBtn.textContent = n > 0 ? `Épreuves (${n}) ▼` : "Épreuves ▼";
}

function fillEventGroupOptions(groups) {
  evtList.innerHTML = "";
  selectedEvtGroups.clear();

  groups.forEach((g) => selectedEvtGroups.add(g));

  groups.forEach((g) => {
    const safeId = "evt_" + g.replace(/[^\w]/g, "_");
    const label = document.createElement("label");
    label.innerHTML = `
      <input type="checkbox" value="${escapeHtml(g)}" id="${safeId}" checked>
      ${escapeHtml(g)}
    `;
    const cb = label.querySelector("input");
    cb.addEventListener("change", () => {
      if (cb.checked) selectedEvtGroups.add(g);
      else selectedEvtGroups.delete(g);
      applyFiltersAndSort();
      updateEvtButtonLabel();
    });
    evtList.appendChild(label);
  });

  updateEvtButtonLabel();
}

evtBtn.addEventListener("click", () => evtMenu.classList.toggle("hidden"));

selectAllEvtBtn.addEventListener("click", () => {
  selectedEvtGroups.clear();
  evtList.querySelectorAll("input[type=checkbox]").forEach((cb) => {
    cb.checked = true;
    selectedEvtGroups.add(cb.value);
  });
  applyFiltersAndSort();
  updateEvtButtonLabel();
});

clearEvtBtn.addEventListener("click", () => {
  selectedEvtGroups.clear();
  evtList.querySelectorAll("input[type=checkbox]").forEach((cb) => (cb.checked = false));
  applyFiltersAndSort();
  updateEvtButtonLabel();
});

/* =========================
   Tri au clic sur header
========================= */

function cycleSortFor(col) {
  if (col === "athlete" || col === "cat" || col === "sex") {
    if (sortState.col !== col) {
      sortState = { col, mode: "asc" };
      return;
    }
    sortState.mode =
      sortState.mode === "asc"
        ? "desc"
        : sortState.mode === "desc"
        ? "none"
        : "asc";
    if (sortState.mode === "none") sortState.col = "athlete";
    return;
  }

  if (sortState.col !== col) {
    sortState = { col, mode: "best" };
    return;
  }
  sortState.mode =
    sortState.mode === "best"
      ? "worst"
      : sortState.mode === "worst"
      ? "none"
      : "best";
  if (sortState.mode === "none") sortState.col = "athlete";
}

function attachHeaderClicks() {
  thead.querySelectorAll("th").forEach((th) => {
    th.style.cursor = "pointer";
    th.addEventListener("click", () => {
      const col = th.getAttribute("data-col");
      if (!col) return;
      cycleSortFor(col);
      applyFiltersAndSort();
    });
  });
}

/* =========================
   Filters + render
========================= */

function applyFiltersAndSort() {
  if (!pivoted) return;

  let rows = pivoted.rows.slice();

  if (selectedCats.size > 0) {
    rows = rows.filter((r) => selectedCats.has(r.cat));
  }

  const visibleEvents = pivoted.events.filter((ev) => {
    if (selectedEvtGroups.size === 0) return false;
    const g = eventGroupFromName(ev);
    return selectedEvtGroups.has(g);
  });

  const { col, mode } = sortState;

  rows.sort((a, b) => {
    if (col === "athlete") {
      const d = a.athlete.localeCompare(b.athlete, "fr", { sensitivity: "base" });
      return mode === "desc" ? -d : d;
    }

    if (col === "cat") {
      const ia = CAT_ORDER.indexOf(a.cat);
      const ib = CAT_ORDER.indexOf(b.cat);
      const da = ia === -1 ? 999 : ia;
      const db = ib === -1 ? 999 : ib;
      const d = da - db || a.cat.localeCompare(b.cat, "fr", { sensitivity: "base" });
      return mode === "desc" ? -d : d;
    }

    if (col === "sex") {
      const d = (a.sex || "").localeCompare((b.sex || ""), "fr", { sensitivity: "base" });
      return mode === "desc" ? -d : d;
    }

    if (pivoted.events.includes(col)) {
      const aBest = bestResultFromList(a.perEvent.get(col));
      const bBest = bestResultFromList(b.perEvent.get(col));

      const aPerf = aBest?.performance ?? "";
      const bPerf = bBest?.performance ?? "";

      const d = comparePerf(aPerf, bPerf, mode);
      if (d !== 0) return d;
    }

    const n = a.athlete.localeCompare(b.athlete, "fr", { sensitivity: "base" });
    if (n !== 0) return n;

    const ca = CAT_ORDER.indexOf(a.cat);
    const cb = CAT_ORDER.indexOf(b.cat);
    const dcat = (ca === -1 ? 999 : ca) - (cb === -1 ? 999 : cb);
    if (dcat !== 0) return dcat;

    return (a.sex || "").localeCompare((b.sex || ""), "fr", { sensitivity: "base" });
  });

  filteredRows = rows;
  renderPivot(visibleEvents, filteredRows);
}

function renderPivot(events, rows) {
  const headerCells = [
    `<th data-col="athlete">Nom / Prénom</th>`,
    `<th data-col="cat">Catégorie</th>`,
    `<th data-col="sex">Sexe</th>`,
    ...events.map((e) => `<th data-col="${escapeHtml(e)}">${escapeHtml(e)}</th>`),
  ].join("");

  thead.innerHTML = `<tr>${headerCells}</tr>`;
  attachHeaderClicks();

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="${3 + events.length}" class="empty">Aucun résultat.</td></tr>`;
    setStatus("Aucun résultat", 0);
    return;
  }

  const html = rows.map((row) => {
    const base = `
      <td>${escapeHtml(row.athlete)}</td>
      <td>${escapeHtml(row.cat)}</td>
      <td>${escapeHtml(row.sex)}</td>
    `;

    const cells = events.map((ev) => {
      const list = row.perEvent.get(ev) || [];
      const best = bestResultFromList(list);
      const val = best?.performance ?? "";
      return `<td>${escapeHtml(val)}</td>`;
    }).join("");

    return `<tr>${base}${cells}</tr>`;
  }).join("");

  tbody.innerHTML = html;
  setStatus(`OK — lignes: ${rows.length} | épreuves: ${events.length}`, rows.length);
}

/* =========================
   Fetch
========================= */

async function fetchData() {
  const club = (clubEl.value || "").trim();
  const annee = (anneeEl.value || "2026").trim();

  if (!validClub(club)) {
    setStatus("Club invalide (6 chiffres).");
    tbody.innerHTML = `<tr><td class="empty">Ex: 081061</td></tr>`;
    return;
  }

  setStatus("Chargement…");

  try {
    const res = await fetch(`/api/bilans?club=${encodeURIComponent(club)}&annee=${encodeURIComponent(annee)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    rawResults = Array.isArray(data.results) ? data.results : [];

    pivoted = pivot(rawResults);

    fillCategoriesOptions(pivoted.cats);
    fillEventGroupOptions(pivoted.eventGroupsPresent);

    sortState = { col: "athlete", mode: "asc" };
    applyFiltersAndSort();
  } catch (e) {
    console.error(e);
    pivoted = null;
    thead.innerHTML = "";
    tbody.innerHTML = `<tr><td class="empty">Erreur: ${escapeHtml(String(e.message || e))}</td></tr>`;
    setStatus("Erreur");
  }
}

/* =========================
   Events
========================= */

btnFetch.addEventListener("click", fetchData);
clubEl.addEventListener("keydown", (e) => { if (e.key === "Enter") fetchData(); });
anneeEl.addEventListener("keydown", (e) => { if (e.key === "Enter") fetchData(); });