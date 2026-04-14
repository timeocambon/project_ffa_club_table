const clubEl = document.getElementById("club");
const anneeEl = document.getElementById("annee");
const btnFetch = document.getElementById("btnFetch");
const mobileOptionsToggle = document.getElementById("mobileOptionsToggle");
const mobileOptionsPanel = document.getElementById("mobileOptionsPanel");
const sexFilterEl = document.getElementById("sexFilter");
const sexBtn = document.getElementById("sexBtn");
const sexMenu = document.getElementById("sexMenu");
const resetSexFilterBtn = document.getElementById("resetSexFilter");
const sexOptionButtons = Array.from(document.querySelectorAll("[data-sex-value]"));

const catsBtn = document.getElementById("catsBtn");
const catsMenu = document.getElementById("catsMenu");
const catsList = document.getElementById("catsList");
const selectAllCatsBtn = document.getElementById("selectAllCats");
const clearCatsBtn = document.getElementById("clearCats");

const evtBtn = document.getElementById("evtBtn");
const evtMenu = document.getElementById("evtMenu");
const evtList = document.getElementById("evtList");
const selectAllEvtBtn = document.getElementById("selectAllEvt");
const clearEvtBtn = document.getElementById("clearEvt");

const absentBtn = document.getElementById("absentBtn");
const absentMenu = document.getElementById("absentMenu");
const absentNamesListEl = document.getElementById("absentNamesList");
const absentEmptyState = document.getElementById("absentEmptyState");
const absentBottomToggle = document.getElementById("absentBottomToggle");
const clearAbsentListBtn = document.getElementById("clearAbsentList");

const paintBtn = document.getElementById("paintBtn");
const paintMenu = document.getElementById("paintMenu");
const clearCellColorsBtn = document.getElementById("clearCellColors");
const clearSelectedCellBtn = document.getElementById("clearSelectedCell");
const paintSwatches = Array.from(document.querySelectorAll("[data-paint-color]"));

const saveBtn = document.getElementById("saveBtn");
const saveMenu = document.getElementById("saveMenu");
const saveNameEl = document.getElementById("saveName");
const saveRefreshListBtn = document.getElementById("saveRefreshList");
const saveCurrentViewBtn = document.getElementById("saveCurrentView");
const savedViewsSelectEl = document.getElementById("savedViewsSelect");
const loadSavedViewBtn = document.getElementById("loadSavedView");
const deleteSavedViewBtn = document.getElementById("deleteSavedView");

const sortBtn = document.getElementById("sortBtn");
const sortMenu = document.getElementById("sortMenu");
const sortColumnSelect = document.getElementById("sortColumnSelect");
const sortOrderSelect = document.getElementById("sortOrderSelect");
const sortApplyBtn = document.getElementById("sortApplyBtn");
const sortResetBtn = document.getElementById("sortResetBtn");

const thead = document.getElementById("thead");
const tbody = document.getElementById("tbody");
const statusText = document.getElementById("statusText");
const countBadge = document.getElementById("countBadge");
const loadingOverlay = document.getElementById("loadingOverlay");
const athleteContextMenu = document.getElementById("athleteContextMenu");
const ctxToggleAbsent = document.getElementById("ctxToggleAbsent");

const currentYear = String(new Date().getFullYear());
clubEl.value = "";
clubEl.removeAttribute("value");
anneeEl.value = currentYear;
anneeEl.placeholder = currentYear;
updateSexFilterUi();

let isLoading = false;
const FETCH_TIMEOUT_MS = 45000;

let rawResults = [];
let pivoted = null;
let filteredRows = [];
let currentVisibleEvents = [];
let barreme50 = null;
let barreme50LoadError = null;
const barreme50Ready = loadBarreme50();

let selectedCats = new Set();
let selectedEvtGroups = new Set();
let absentAthletes = new Set();
let absentNames = [];
const ABSENT_STORAGE_KEY = "ffa-club-table-absents";
const ABSENT_BOTTOM_STORAGE_KEY = "ffa-club-table-absents-bottom";
const CELL_COLORS_STORAGE_KEY = "ffa-club-table-cell-colors";
const SAVED_VIEWS_STORAGE_KEY = "ffa-club-table-saved-views";
const PAINTABLE_COLORS = new Set(["red", "yellow", "green"]);
let activePaintColor = "none";
let cellColorsByDataset = {};
let manualCellColors = {};
let selectedPaintCellKey = "";
let savedViews = {};

let sortState = {
  col: "athlete",
  mode: "asc",
};

let contextTargetAthlete = null;
let longPressTimer = null;
let longPressOrigin = null;
let longPressTriggered = false;

function setStatus(text, count = null) {
  statusText.textContent = text;
  if (typeof count === "number") {
    countBadge.hidden = false;
    countBadge.textContent = String(count);
  } else {
    countBadge.hidden = true;
  }
}

function setLoading(loading, text = "Chargement…") {
  isLoading = loading;
  btnFetch.disabled = loading;
  btnFetch.classList.toggle("is-loading", loading);
  btnFetch.textContent = loading ? "Chargement…" : "Charger";
  loadingOverlay.classList.toggle("hidden", !loading);
  loadingOverlay.setAttribute("aria-hidden", loading ? "false" : "true");
  if (loading) setStatus(text);
}

function isMobileViewport() {
  return window.matchMedia("(max-width: 768px)").matches;
}

function hideAllDropdownMenus() {
  catsMenu.classList.add("hidden");
  sexMenu.classList.add("hidden");
  evtMenu.classList.add("hidden");
  absentMenu.classList.add("hidden");
  paintMenu.classList.add("hidden");
  saveMenu.classList.add("hidden");
  sortMenu.classList.add("hidden");
}

function renderMobileOptionsState() {
  if (!mobileOptionsToggle || !mobileOptionsPanel) return;

  if (!isMobileViewport()) {
    mobileOptionsPanel.classList.remove("hidden");
    mobileOptionsToggle.setAttribute("aria-expanded", "true");
    mobileOptionsToggle.textContent = "Options ▼";
    return;
  }

  const isOpen = !mobileOptionsPanel.classList.contains("hidden");
  mobileOptionsToggle.setAttribute("aria-expanded", String(isOpen));
  mobileOptionsToggle.textContent = isOpen ? "Options ▲" : "Options ▼";

  if (!isOpen) hideAllDropdownMenus();
}

function toggleMobileOptionsPanel() {
  if (!mobileOptionsPanel || !mobileOptionsToggle || !isMobileViewport()) return;
  mobileOptionsPanel.classList.toggle("hidden");
  renderMobileOptionsState();
}

function toggleDropdownMenu(menuEl) {
  if (!menuEl) return;
  const shouldOpen = menuEl.classList.contains("hidden");
  hideAllDropdownMenus();
  menuEl.classList.toggle("hidden", !shouldOpen);
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

function normalizeAthleteKey(name) {
  return stripAccents(String(name ?? ""))
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function getCurrentDatasetKey() {
  const club = (clubEl?.value || "").trim() || "__empty_club__";
  const annee = (anneeEl?.value || currentYear).trim() || currentYear;
  return `${club}__${annee}`;
}

function loadCellColorStore() {
  try {
    const saved = localStorage.getItem(CELL_COLORS_STORAGE_KEY);
    if (!saved) {
      cellColorsByDataset = {};
      manualCellColors = {};
      return;
    }

    const parsed = JSON.parse(saved);
    cellColorsByDataset = parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    console.warn("Impossible de relire les couleurs de cases.", e);
    cellColorsByDataset = {};
  }

  syncCellColorsForCurrentDataset();
}

function persistCellColorStore() {
  try {
    const datasetKey = getCurrentDatasetKey();

    if (manualCellColors && Object.keys(manualCellColors).length > 0) {
      cellColorsByDataset[datasetKey] = manualCellColors;
    } else {
      delete cellColorsByDataset[datasetKey];
    }

    localStorage.setItem(
      CELL_COLORS_STORAGE_KEY,
      JSON.stringify(cellColorsByDataset),
    );
  } catch (e) {
    console.warn("Impossible d'enregistrer les couleurs de cases.", e);
  }
}

function syncCellColorsForCurrentDataset() {
  const datasetKey = getCurrentDatasetKey();
  const saved = cellColorsByDataset?.[datasetKey];
  manualCellColors = saved && typeof saved === "object" ? { ...saved } : {};
}

function sanitizeSavedViews(raw) {
  if (!raw || typeof raw !== "object") return {};

  return Object.fromEntries(
    Object.entries(raw)
      .filter(([key, value]) => key && value && typeof value === "object")
      .map(([key, value]) => [key, value]),
  );
}

function loadSavedViewsStore() {
  try {
    const saved = localStorage.getItem(SAVED_VIEWS_STORAGE_KEY);
    if (!saved) {
      savedViews = {};
      return;
    }

    savedViews = sanitizeSavedViews(JSON.parse(saved));
  } catch (e) {
    console.warn("Impossible de relire les sauvegardes.", e);
    savedViews = {};
  }
}

function persistSavedViewsStore() {
  try {
    localStorage.setItem(SAVED_VIEWS_STORAGE_KEY, JSON.stringify(savedViews));
    renderSavedViewsList();
  } catch (e) {
    console.warn("Impossible d'enregistrer la sauvegarde.", e);
    throw e;
  }
}

function getDefaultSaveName() {
  const club = (clubEl.value || "").trim();
  const annee = (anneeEl.value || currentYear).trim() || currentYear;
  return club ? `Club ${club} - ${annee}` : `Sauvegarde ${annee}`;
}

function renderSavedViewsList(preferredName = "") {
  if (!savedViewsSelectEl) return;

  const entries = Object.entries(savedViews).sort((a, b) => {
    const ad = String(a?.[1]?.savedAt || "");
    const bd = String(b?.[1]?.savedAt || "");
    return bd.localeCompare(ad) || a[0].localeCompare(b[0], "fr", { sensitivity: "base" });
  });

  const currentValue = preferredName || savedViewsSelectEl.value || "";
  savedViewsSelectEl.innerHTML = '<option value="">Aucune sauvegarde</option>';

  entries.forEach(([name, snapshot]) => {
    const option = document.createElement("option");
    option.value = name;
    const savedAt = snapshot?.savedAt ? new Date(snapshot.savedAt) : null;
    const dateLabel = savedAt && !Number.isNaN(savedAt.getTime())
      ? savedAt.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })
      : "";
    option.textContent = dateLabel ? `${name} — ${dateLabel}` : name;
    savedViewsSelectEl.appendChild(option);
  });

  if (currentValue && savedViews[currentValue]) {
    savedViewsSelectEl.value = currentValue;
  }
}

function buildCurrentSnapshot(name = "") {
  if (!rawResults.length || !pivoted) {
    throw new Error("Charge d'abord un club avant d'enregistrer une sauvegarde.");
  }

  const snapshotName = String(name || saveNameEl?.value || "").trim() || getDefaultSaveName();

  return {
    version: 1,
    name: snapshotName,
    savedAt: new Date().toISOString(),
    club: (clubEl.value || "").trim(),
    annee: (anneeEl.value || currentYear).trim() || currentYear,
    rawResults,
    selectedCats: [...selectedCats],
    selectedEvtGroups: [...selectedEvtGroups],
    sexFilter: sexFilterEl?.value || "all",
    absentNames: [...absentNames],
    absentBottom: Boolean(absentBottomToggle.checked),
    manualCellColors: { ...manualCellColors },
    sortState: { ...sortState },
  };
}

function restoreSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("Sauvegarde invalide.");
  }

  clubEl.value = String(snapshot.club || "");
  anneeEl.value = String(snapshot.annee || currentYear);

  rawResults = Array.isArray(snapshot.rawResults) ? snapshot.rawResults : [];
  pivoted = pivot(rawResults);

  const restoredCats = new Set(Array.isArray(snapshot.selectedCats) ? snapshot.selectedCats : []);
  const restoredEvtGroups = new Set(
    Array.isArray(snapshot.selectedEvtGroups)
      ? snapshot.selectedEvtGroups
      : pivoted.eventGroupsPresent,
  );

  selectedCats = restoredCats;
  selectedEvtGroups = restoredEvtGroups;
  sexFilterEl.value = snapshot.sexFilter === "F" || snapshot.sexFilter === "M" ? snapshot.sexFilter : "all";
  updateSexFilterUi();

  absentNames = uniqAbsentNames(Array.isArray(snapshot.absentNames) ? snapshot.absentNames : []);
  absentBottomToggle.checked = snapshot.absentBottom !== false;
  syncAbsentAthletesFromList();
  saveAbsentSettings();

  manualCellColors = snapshot.manualCellColors && typeof snapshot.manualCellColors === "object"
    ? { ...snapshot.manualCellColors }
    : {};
  persistCellColorStore();

  sortState = snapshot.sortState && typeof snapshot.sortState === "object"
    ? { ...sortState, ...snapshot.sortState }
    : { col: "athlete", mode: "asc" };

  fillCategoriesOptions(pivoted.cats, restoredCats);
  fillEventGroupOptions(pivoted.eventGroupsPresent, restoredEvtGroups);
  applyFiltersAndSort();
}

function saveCurrentView() {
  try {
    const snapshot = buildCurrentSnapshot();
    savedViews[snapshot.name] = snapshot;
    persistSavedViewsStore();
    if (saveNameEl) saveNameEl.value = snapshot.name;
    renderSavedViewsList(snapshot.name);
    setStatus(`Sauvegarde enregistrée : ${snapshot.name}`);
  } catch (e) {
    console.error(e);
    setStatus(String(e?.message || e));
  }
}

function loadSavedView() {
  const name = savedViewsSelectEl?.value || "";
  if (!name || !savedViews[name]) {
    setStatus("Choisis une sauvegarde à charger.");
    return;
  }

  try {
    restoreSnapshot(savedViews[name]);
    if (saveNameEl) saveNameEl.value = name;
    setStatus(`Sauvegarde chargée : ${name}`);
  } catch (e) {
    console.error(e);
    setStatus(String(e?.message || e));
  }
}

function deleteSavedView() {
  const name = savedViewsSelectEl?.value || "";
  if (!name || !savedViews[name]) {
    setStatus("Choisis une sauvegarde à supprimer.");
    return;
  }

  delete savedViews[name];
  try {
    persistSavedViewsStore();
    if (saveNameEl && saveNameEl.value.trim() === name) saveNameEl.value = "";
    renderSavedViewsList();
    setStatus(`Sauvegarde supprimée : ${name}`);
  } catch (e) {
    console.error(e);
    setStatus(String(e?.message || e));
  }
}

function updatePaintButtonLabel() {
  const labels = {
    none: "Couleurs ▼",
    red: "Couleur : rouge ▼",
    yellow: "Couleur : jaune ▼",
    green: "Couleur : vert ▼",
  };
  paintBtn.textContent = labels[activePaintColor] || "Couleurs ▼";
}

function setActivePaintColor(color) {
  activePaintColor = PAINTABLE_COLORS.has(color) ? color : "none";
  updatePaintButtonLabel();

  paintSwatches.forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.paintColor === activePaintColor);
  });

  document.body.classList.toggle("paint-mode", activePaintColor !== "none");
}

function buildCellKey(row, columnKey, kind = "value") {
  return [
    normalizeAthleteKey(row?.athlete || ""),
    String(row?.cat || ""),
    String(row?.sex || ""),
    String(columnKey || ""),
    String(kind || "value"),
  ].join("|");
}

function getCellColor(cellKey) {
  const color = manualCellColors?.[cellKey];
  return PAINTABLE_COLORS.has(color) ? color : "";
}

function getCellColorClass(cellKey) {
  const color = getCellColor(cellKey);
  return color ? `user-color-${color}` : "";
}

function applyCellColorClass(cellEl) {
  if (!cellEl) return;
  cellEl.classList.remove("user-color-red", "user-color-yellow", "user-color-green");
  const color = getCellColor(cellEl.dataset.cellKey || "");
  if (color) cellEl.classList.add(`user-color-${color}`);
}

function updateSelectedCellButton() {
  if (!clearSelectedCellBtn) return;

  const hasSelection = Boolean(selectedPaintCellKey);
  clearSelectedCellBtn.disabled = !hasSelection;
  clearSelectedCellBtn.textContent = hasSelection
    ? "Effacer la case sélectionnée"
    : "Sélectionne une case";
}

function refreshSelectedCellUI() {
  tbody.querySelectorAll("td.is-selected-paint-cell").forEach((cell) => {
    cell.classList.remove("is-selected-paint-cell");
  });

  if (!selectedPaintCellKey) {
    updateSelectedCellButton();
    return;
  }

  const selectedCell = tbody.querySelector(`td[data-cell-key="${CSS.escape(selectedPaintCellKey)}"]`);
  if (selectedCell) {
    selectedCell.classList.add("is-selected-paint-cell");
  } else {
    selectedPaintCellKey = "";
  }

  updateSelectedCellButton();
}

function setSelectedPaintCell(cellOrKey) {
  const nextKey = typeof cellOrKey === "string"
    ? cellOrKey
    : cellOrKey?.dataset?.cellKey || "";

  selectedPaintCellKey = String(nextKey || "");
  refreshSelectedCellUI();
}

function clearSelectedCellColor() {
  if (!selectedPaintCellKey) return;

  setCellColor(selectedPaintCellKey, "");
  const selectedCell = tbody.querySelector(`td[data-cell-key="${CSS.escape(selectedPaintCellKey)}"]`);
  if (selectedCell) applyCellColorClass(selectedCell);
  refreshSelectedCellUI();
}

function setCellColor(cellKey, color) {
  if (!cellKey) return;

  if (PAINTABLE_COLORS.has(color)) {
    manualCellColors[cellKey] = color;
  } else {
    delete manualCellColors[cellKey];
  }

  persistCellColorStore();
}

function attachPaintCellActions() {
  tbody.querySelectorAll("td[data-cell-key]").forEach((td) => {
    td.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;

      e.stopPropagation();
      const cellKey = td.dataset.cellKey || "";
      setSelectedPaintCell(td);

      if (activePaintColor === "none") return;

      const currentColor = getCellColor(cellKey);
      const nextColor = currentColor === activePaintColor ? "" : activePaintColor;
      setCellColor(cellKey, nextColor);
      applyCellColorClass(td);
      refreshSelectedCellUI();
    });
  });
}

function parseAbsentNames(text) {
  return String(text ?? "")
    .split(/\r?\n|;/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function uniqAbsentNames(names) {
  const seen = new Set();
  const result = [];

  for (const rawName of names || []) {
    const cleanName = String(rawName || "").trim();
    if (!cleanName) continue;

    const normalized = normalizeAthleteKey(cleanName);
    if (!normalized || seen.has(normalized)) continue;

    seen.add(normalized);
    result.push(cleanName);
  }

  return result;
}

function renderAbsentNamesList() {
  absentNamesListEl.innerHTML = "";
  const hasNames = absentNames.length > 0;
  absentEmptyState.hidden = hasNames;

  if (!hasNames) return;

  for (const name of absentNames) {
    const li = document.createElement("li");
    li.className = "absent-list-item";

    const nameSpan = document.createElement("span");
    nameSpan.className = "absent-list-name";
    nameSpan.textContent = name;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "absent-remove";
    removeBtn.dataset.removeAbsent = name;
    removeBtn.setAttribute("aria-label", `Retirer ${name} des absents`);
    removeBtn.title = "Retirer";
    removeBtn.textContent = "×";

    li.append(nameSpan, removeBtn);
    absentNamesListEl.appendChild(li);
  }
}

function updateAbsentButtonLabel() {
  const count = absentAthletes.size;
  absentBtn.textContent = count > 0 ? `Absents (${count}) ▼` : "Absents ▼";
}

function saveAbsentSettings() {
  try {
    localStorage.setItem(ABSENT_STORAGE_KEY, JSON.stringify(absentNames));
    localStorage.setItem(
      ABSENT_BOTTOM_STORAGE_KEY,
      absentBottomToggle.checked ? "1" : "0",
    );
  } catch (e) {
    console.warn("Impossible d'enregistrer les absents dans le navigateur.", e);
  }
}

function syncAbsentAthletesFromList() {
  absentAthletes = new Set(
    absentNames.map((name) => normalizeAthleteKey(name)),
  );
  updateAbsentButtonLabel();
  renderAbsentNamesList();
}

function loadAbsentSettings() {
  try {
    const savedNames = localStorage.getItem(ABSENT_STORAGE_KEY);
    const savedBottom = localStorage.getItem(ABSENT_BOTTOM_STORAGE_KEY);

    if (typeof savedNames === "string" && savedNames.trim()) {
      try {
        const parsed = JSON.parse(savedNames);
        absentNames = Array.isArray(parsed) ? uniqAbsentNames(parsed) : [];
      } catch {
        absentNames = uniqAbsentNames(parseAbsentNames(savedNames));
      }
    }

    if (savedBottom === "0") {
      absentBottomToggle.checked = false;
    }
  } catch (e) {
    console.warn("Impossible de relire les absents depuis le navigateur.", e);
  }

  syncAbsentAthletesFromList();
}

function isAbsentRow(row) {
  return absentAthletes.has(normalizeAthleteKey(row?.athlete || ""));
}

function getRowSexValue(row) {
  const rawSex = String(row?.sex ?? "").trim().toUpperCase();
  if (rawSex === "F" || rawSex === "M") return rawSex;

  const rawCat = String(row?.cat ?? "").trim().toUpperCase();
  if (/(^|[^A-Z])F$/.test(rawCat) || /FEM|FILLE/.test(rawCat)) return "F";
  if (/(^|[^A-Z])M$/.test(rawCat) || /MASC|GAR[CÇ]ON/.test(rawCat)) return "M";

  return "";
}

function applyAbsentSettings() {
  syncAbsentAthletesFromList();
  saveAbsentSettings();
  applyFiltersAndSort();
}

function getAbsentNamesList() {
  return [...absentNames];
}

function setAbsentNamesList(names) {
  absentNames = uniqAbsentNames(names);
}

function setAthleteAbsent(name, shouldBeAbsent) {
  const normalized = normalizeAthleteKey(name);
  if (!normalized) return;

  const names = getAbsentNamesList();
  const nextNames = names.filter((item) => normalizeAthleteKey(item) !== normalized);

  if (shouldBeAbsent) nextNames.push(String(name).trim());

  setAbsentNamesList(nextNames);
  applyAbsentSettings();
}

function hideAthleteContextMenu() {
  contextTargetAthlete = null;
  athleteContextMenu.classList.add("hidden");
  athleteContextMenu.setAttribute("aria-hidden", "true");
}

function showAthleteContextMenu(x, y, athleteName) {
  contextTargetAthlete = athleteName;
  const alreadyAbsent = absentAthletes.has(normalizeAthleteKey(athleteName));
  ctxToggleAbsent.textContent = alreadyAbsent ? "Retirer absent" : "Mettre absent";

  athleteContextMenu.classList.remove("hidden");
  athleteContextMenu.setAttribute("aria-hidden", "false");

  const margin = 8;
  const menuRect = athleteContextMenu.getBoundingClientRect();
  const maxX = window.innerWidth - menuRect.width - margin;
  const maxY = window.innerHeight - menuRect.height - margin;
  const left = Math.max(margin, Math.min(x, maxX));
  const top = Math.max(margin, Math.min(y, maxY));

  athleteContextMenu.style.left = `${left}px`;
  athleteContextMenu.style.top = `${top}px`;
}

function clearLongPressTimer() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function attachRowContextActions() {
  tbody.querySelectorAll("tr[data-athlete]").forEach((tr) => {
    const athleteName = tr.dataset.athlete || "";

    tr.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      showAthleteContextMenu(e.clientX, e.clientY, athleteName);
    });

    tr.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch") return;

      longPressTriggered = false;
      longPressOrigin = {
        x: e.clientX,
        y: e.clientY,
        athleteName,
      };

      clearLongPressTimer();
      longPressTimer = setTimeout(() => {
        longPressTriggered = true;
        showAthleteContextMenu(longPressOrigin.x, longPressOrigin.y, longPressOrigin.athleteName);
      }, 550);
    });

    tr.addEventListener("pointermove", (e) => {
      if (!longPressOrigin || e.pointerType !== "touch") return;
      const dx = Math.abs(e.clientX - longPressOrigin.x);
      const dy = Math.abs(e.clientY - longPressOrigin.y);
      if (dx > 10 || dy > 10) clearLongPressTimer();
    });

    const cancel = () => {
      clearLongPressTimer();
      longPressOrigin = null;
    };

    tr.addEventListener("pointerup", cancel);
    tr.addEventListener("pointercancel", cancel);
    tr.addEventListener("pointerleave", cancel);

    tr.addEventListener("click", (e) => {
      if (longPressTriggered) {
        e.preventDefault();
        e.stopPropagation();
        longPressTriggered = false;
      }
    });
  });
}

function fetchJsonWithTimeout(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, { signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

async function loadBarreme50() {
  try {
    const res = await fetch("./barreme50.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    barreme50 = await res.json();
    return barreme50;
  } catch (e) {
    console.error("Impossible de charger le barème 50.", e);
    barreme50LoadError = e;
    barreme50 = null;
    return null;
  }
}

function stripAccents(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function normalizeWeightNumber(s) {
  return String(s ?? "")
    .replace(",", ".")
    .trim()
    .replace(/\.0+$/, "")
    .replace(".", "_");
}

function eventKeyForPoints(cat, sex, eventName) {
  const normalized = normalizeEventName(eventName);
  let s = stripAccents(normalized).toLowerCase().trim();
  s = s.replace(/ /g, " ");
  s = s.replace(/\s+/g, " ").trim();

  if (!s) return null;

  if (s === "hauteur") return "hauteur";
  if (s === "perche") return "perche";
  if (s === "longueur") return "longueur";
  if (s === "triple saut") return "triple_saut";

  if (s === "50m") return cat === "Cadet" ? "50m_salle" : "50m";
  if (s === "60m") return cat === "Cadet" ? "60m_salle" : "60m";
  if (s === "80m") return "80m";
  if (s === "100m") return "100m";
  if (s === "120m") return "120m";
  if (s === "200m") return cat === "Cadet" && sex === "M" ? "200m_salle" : "200m";
  if (s === "300m") return "300m";
  if (s === "400m") return "400m";
  if (s === "800m") return "800m";
  if (s === "1000m") return "1000m";
  if (s === "1500m") return "1500m";
  if (s === "2000m") return "2000m";
  if (s === "3000m") return "3000m";
  if (s === "1500m steeple") return "1500m_steeple";
  if (s === "2000m steeple") return "2000m_steeple";
  if (s === "2000m marche") return "2000m_marche";
  if (s === "3000m marche") return "3000m_marche";
  if (s === "4 x 60m") return "4x60m";
  if (s === "4 x 60m mixte") return "4x60m_mixte";
  if (s === "4 x 100m") return "4x100m";
  if (s === "4 x 100m mixte") return "4x100m_mixte";

  if (/^50m haies \(65\)$/.test(s)) return "50m_haies_65";
  if (/^50m haies \(76\)$/.test(s)) return "50m_haies_76";
  if (/^50m haies \(84\)$/.test(s)) return "50m_haies_84";
  if (/^50m haies \(91\)$/.test(s)) return "50m_haies_91_salle";
  if (/^60m haies \(76\)$/.test(s)) return "60m_haies_76_salle";
  if (/^60m haies \(91\)$/.test(s)) return "60m_haies_91_salle";
  if (/^80m haies \(76\)$/.test(s)) return "80m_haies_76";
  if (/^80m haies \(84\)$/.test(s)) return "80m_haies_84";
  if (/^100m haies \(76\)$/.test(s)) return "100m_haies_76";
  if (/^100m haies \(84\)$/.test(s)) return "100m_haies_84";
  if (/^110m haies \(91\)$/.test(s)) return "110m_haies_91";
  if (/^200m haies \(76\)$/.test(s)) return "200m_haies_76";
  if (/^320m haies \(76\)$/.test(s)) return "320m_haies_76";
  if (/^400m haies \(76\)$/.test(s)) return "400m_haies_76";
  if (/^400m haies \(84\)$/.test(s)) return "400m_haies_84";

  let m = s.match(/^poids \(([\d.,]+)\s*kg\)$/);
  if (m) return `poids_${normalizeWeightNumber(m[1])}kg`;

  m = s.match(/^disque \(([\d.,]+)\s*kg\)$/);
  if (m) return `disque_${normalizeWeightNumber(m[1])}kg`;

  m = s.match(/^marteau \(([\d.,]+)\s*kg\)$/);
  if (m) return `marteau_${normalizeWeightNumber(m[1])}kg`;

  m = s.match(/^javelot \(([\d.,]+)\s*g\)$/);
  if (m) return `javelot_${normalizeWeightNumber(m[1])}g`;

  return null;
}

function pointsTableFor(row, eventName) {
  if (!barreme50?.categories) return null;

  const cat = row?.cat || "";
  const sex = row?.sex || "";
  const eventKey = eventKeyForPoints(cat, sex, eventName);

  if (!eventKey) return null;

  return barreme50.categories?.[cat]?.[sex]?.[eventKey] ?? null;
}

function pointsFromPerformance(row, eventName, performance) {
  if (!performance) return null;

  const table = pointsTableFor(row, eventName);
  if (!table || !Array.isArray(table.thresholds)) return null;

  const parsed = perfToComparable(performance);
  if (!parsed || parsed.type !== table.type) return null;

  if (table.type === "time") {
    for (const entry of table.thresholds) {
      if (parsed.value <= entry.value) return entry.points;
    }
    return null;
  }

  for (const entry of table.thresholds) {
    if (parsed.value >= entry.value) return entry.points;
  }

  return null;
}

function pointsLabel(points) {
  return Number.isFinite(points) ? String(points) : "—";
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
    case "EA":
      return "Éveil";
    case "PO":
      return "Poussin";
    case "BE":
      return "Benjamin";
    case "MI":
      return "Minime";
    case "CA":
      return "Cadet";
    case "JU":
      return "Junior";
    case "ES":
      return "Espoir";
    case "SE":
      return "Senior";
    case "MA":
      return "Master";
    default:
      return token || s;
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
  e = e.replace(/(\d)\s+(\d)/g, "$1$2");
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
    base = base.replace(
      new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"),
      "",
    );
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
    return base
      .replace(/\b(\d+)m\b/i, "$1m")
      .replace(/\s+/g, " ")
      .trim();
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

  if (
    /(tri'?athlon|tetrathlon|pentathlon|heptathlon|d[ée]cathlon|combin)/.test(e)
  ) {
    return "Combinées";
  }

  if (/(route|trail|cross|semi|marathon)/.test(e))
    return "Route / Trail / Cross";
  if (/\b\d+(\.\d+)?\s*km\b/.test(e) && /(route|trail|cross)/.test(e))
    return "Route / Trail / Cross";

  if (/haies/.test(e)) return "Haie";
  if (/steeple|mile/.test(e)) return "Demi-fond / Fond";

  if (/relais|4x/.test(e)) return "Sprint";
  if (/\b(30|40|50|60|80|100|110|120|150|200|300|400)m\b/.test(e))
    return "Sprint";

  if (/\b(800|1000|1500|1600|2000|3000|5000|10000)m\b/.test(e))
    return "Demi-fond / Fond";

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

  if (Number.isFinite(pa) && Number.isFinite(pb)) return pb < pa ? b : a;
  if (Number.isFinite(pa) && pb == null) return a;
  if (Number.isFinite(pb) && pa == null) return b;

  const av = perfToComparable(a.performance);
  const bv = perfToComparable(b.performance);
  if (!av) return b;
  if (!bv) return a;

  const dist = av.type === "dist" || bv.type === "dist";
  return dist ? (av.value >= bv.value ? a : b) : av.value <= bv.value ? a : b;
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

    const exists = arr.some(
      (x) =>
        x.performance === r.performance &&
        x.date === r.date &&
        x.location === r.location,
    );

    if (!exists) {
      arr.push(r);
    }
  }

  const events = Array.from(baseEventSet).sort(compareEventNames);

  const cats = Array.from(catSet).sort((a, b) => {
    const ia = CAT_ORDER.indexOf(a);
    const ib = CAT_ORDER.indexOf(b);
    if (ia !== -1 || ib !== -1)
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    return a.localeCompare(b, "fr", { sensitivity: "base" });
  });

  const eventGroupsPresent = Array.from(evtGroupSet).sort((a, b) => {
    const ia = EVT_GROUP_ORDER.indexOf(a);
    const ib = EVT_GROUP_ORDER.indexOf(b);
    if (ia !== -1 || ib !== -1)
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
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
  return String(s)
    .replace(/\(.*?\)/g, "")
    .trim();
}

function perfToComparable(perf) {
  if (!perf) return null;

  let s = cleanPerf(perf);
  if (!s) return null;

  s = s.replace(/\u00a0/g, " ").trim();

  let m = s.match(/^(\d+)\s*m\s*(\d{1,2})$/i);
  if (m) {
    const meters = Number(m[1]);
    const cm = Number(m[2]);
    if (Number.isFinite(meters) && Number.isFinite(cm)) {
      return { type: "dist", value: meters + cm / 100 };
    }
  }

  m = s.match(/^(\d+)[,.](\d{1,2})$/);
  if (m) {
    const meters = Number(m[1]);
    const cm = Number(m[2]);
    if (Number.isFinite(meters) && Number.isFinite(cm)) {
      return { type: "dist", value: meters + cm / 100 };
    }
  }

  m = s.match(/^(\d+)\s*m$/i);
  if (m) {
    const meters = Number(m[1]);
    if (Number.isFinite(meters)) {
      return { type: "dist", value: meters };
    }
  }

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

  if (![hours, minutes, seconds, hundredths].every(Number.isFinite))
    return null;

  const total =
    hours * 3600 + minutes * 60 + seconds + (hundredths ? hundredths / 100 : 0);
  if (!Number.isFinite(total) || total === 0) return null;

  return { type: "time", value: total };
}

function comparePerf(aPerf, bPerf, mode) {
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

function updateSexFilterUi() {
  const labels = {
    all: "Sexe : Tous ▼",
    M: "Sexe : Hommes ▼",
    F: "Sexe : Femmes ▼",
  };
  const value = sexFilterEl?.value || "all";
  if (sexBtn) sexBtn.textContent = labels[value] || labels.all;
  sexOptionButtons.forEach((btn) => {
    btn.classList.toggle("is-active", (btn.dataset.sexValue || "all") === value);
  });
}

function setSexFilter(value = "all") {
  if (!sexFilterEl) return;
  const normalized = value === "F" || value === "M" ? value : "all";
  sexFilterEl.value = normalized;
  updateSexFilterUi();
  applyFiltersAndSort();
}

function fillCategoriesOptions(cats, preservedSelection = null) {
  catsList.innerHTML = "";
  const nextSelected = preservedSelection instanceof Set
    ? new Set([...preservedSelection].filter((cat) => cats.includes(cat)))
    : new Set();
  selectedCats = nextSelected;

  cats.forEach((cat) => {
    const safeId = "cat_" + cat.replace(/[^\w]/g, "_");
    const label = document.createElement("label");
    label.innerHTML = `
      <input type="checkbox" value="${escapeHtml(cat)}" id="${safeId}" ${selectedCats.has(cat) ? "checked" : ""}>
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

catsBtn.addEventListener("click", () => toggleDropdownMenu(catsMenu));
sexBtn?.addEventListener("click", () => toggleDropdownMenu(sexMenu));
resetSexFilterBtn?.addEventListener("click", () => setSexFilter("all"));
sexOptionButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    setSexFilter(btn.dataset.sexValue || "all");
  });
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".dropdown")) {
    hideAllDropdownMenus();
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
  catsList
    .querySelectorAll("input[type=checkbox]")
    .forEach((cb) => (cb.checked = false));
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

function fillEventGroupOptions(groups, preservedSelection = null) {
  evtList.innerHTML = "";
  const nextSelected = preservedSelection instanceof Set
    ? new Set([...preservedSelection].filter((g) => groups.includes(g)))
    : new Set(groups);
  selectedEvtGroups = nextSelected;

  groups.forEach((g) => {
    const safeId = "evt_" + g.replace(/[^\w]/g, "_");
    const label = document.createElement("label");
    label.innerHTML = `
      <input type="checkbox" value="${escapeHtml(g)}" id="${safeId}" ${selectedEvtGroups.has(g) ? "checked" : ""}>
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

evtBtn.addEventListener("click", () => toggleDropdownMenu(evtMenu));

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
  evtList
    .querySelectorAll("input[type=checkbox]")
    .forEach((cb) => (cb.checked = false));
  applyFiltersAndSort();
  updateEvtButtonLabel();
});

/* =========================
   Dropdown absents
========================= */

absentBtn.addEventListener("click", () => toggleDropdownMenu(absentMenu));
paintBtn.addEventListener("click", () => toggleDropdownMenu(paintMenu));
sortBtn.addEventListener("click", () => {
  syncSortMenuControls();
  toggleDropdownMenu(sortMenu);
});
saveBtn.addEventListener("click", () => {
  renderSavedViewsList();
  toggleDropdownMenu(saveMenu);
});

paintSwatches.forEach((btn) => {
  btn.addEventListener("click", () => {
    setActivePaintColor(btn.dataset.paintColor || "none");
  });
});

clearSelectedCellBtn?.addEventListener("click", () => {
  clearSelectedCellColor();
});

clearCellColorsBtn.addEventListener("click", () => {
  manualCellColors = {};
  persistCellColorStore();
  applyFiltersAndSort();
});


saveRefreshListBtn?.addEventListener("click", () => {
  renderSavedViewsList();
});

saveCurrentViewBtn?.addEventListener("click", saveCurrentView);
loadSavedViewBtn?.addEventListener("click", loadSavedView);
deleteSavedViewBtn?.addEventListener("click", deleteSavedView);

savedViewsSelectEl?.addEventListener("change", () => {
  const name = savedViewsSelectEl.value || "";
  if (saveNameEl && name) saveNameEl.value = name;
});

saveNameEl?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    saveCurrentView();
  }
});

sortColumnSelect?.addEventListener("change", () => {
  const col = sortColumnSelect.value || "athlete";
  const orderOptions = getSortModeOptionsForColumn(col);
  sortOrderSelect.innerHTML = orderOptions
    .map((option) => `<option value="${option.value}">${escapeHtml(option.label)}</option>`)
    .join("");
  sortOrderSelect.value = getDefaultSortModeForColumn(col);
});

sortApplyBtn?.addEventListener("click", () => {
  applySortMenuSelection();
});

sortResetBtn?.addEventListener("click", () => {
  sortState = { col: "athlete", mode: "asc" };
  syncSortMenuControls();
  applyFiltersAndSort();
});

absentBottomToggle.addEventListener("change", applyAbsentSettings);
clearAbsentListBtn.addEventListener("click", () => {
  setAbsentNamesList([]);
  absentBottomToggle.checked = true;
  applyAbsentSettings();
});

absentNamesListEl.addEventListener("click", (e) => {
  const removeBtn = e.target.closest("[data-remove-absent]");
  if (!removeBtn) return;
  e.stopPropagation();
  setAthleteAbsent(removeBtn.dataset.removeAbsent || "", false);
});

ctxToggleAbsent.addEventListener("click", () => {
  if (!contextTargetAthlete) return;
  const athleteName = contextTargetAthlete;
  const shouldBeAbsent = !absentAthletes.has(normalizeAthleteKey(athleteName));
  hideAthleteContextMenu();
  setAthleteAbsent(athleteName, shouldBeAbsent);
});

document.addEventListener("click", (e) => {
  if (!e.target.closest("#athleteContextMenu")) {
    hideAthleteContextMenu();
  }
});

window.addEventListener("scroll", hideAthleteContextMenu, true);
window.addEventListener("resize", hideAthleteContextMenu);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") hideAthleteContextMenu();
});

/* =========================
   Tri
========================= */

function getSortableColumns() {
  const baseColumns = [
    { value: "athlete", label: "Nom / Prénom" },
    { value: "cat", label: "Catégorie" },
    { value: "sex", label: "Sexe" },
  ];

  const eventColumns = (currentVisibleEvents.length ? currentVisibleEvents : pivoted?.events || []).map((eventName) => ({
    value: eventName,
    label: eventName,
  }));

  return [...baseColumns, ...eventColumns];
}

function getSortModeOptionsForColumn(col) {
  if (col === "athlete" || col === "cat" || col === "sex") {
    return [
      { value: "asc", label: "Ascendant" },
      { value: "desc", label: "Descendant" },
    ];
  }

  return [
    { value: "best", label: "Meilleur d'abord" },
    { value: "worst", label: "Moins bon d'abord" },
  ];
}

function getDefaultSortModeForColumn(col) {
  return col === "athlete" || col === "cat" || col === "sex" ? "asc" : "best";
}

function syncSortMenuControls() {
  if (!sortColumnSelect || !sortOrderSelect) return;

  const columns = getSortableColumns();
  const availableValues = new Set(columns.map((column) => column.value));

  let selectedCol = sortState.col;
  if (!availableValues.has(selectedCol)) {
    selectedCol = sortColumnSelect.value && availableValues.has(sortColumnSelect.value)
      ? sortColumnSelect.value
      : "athlete";
  }

  sortColumnSelect.innerHTML = columns
    .map((column) => `<option value="${escapeHtml(column.value)}">${escapeHtml(column.label)}</option>`)
    .join("");
  sortColumnSelect.value = selectedCol;

  const orderOptions = getSortModeOptionsForColumn(selectedCol);
  const allowedModes = new Set(orderOptions.map((option) => option.value));
  const selectedMode = allowedModes.has(sortState.mode) ? sortState.mode : getDefaultSortModeForColumn(selectedCol);

  sortOrderSelect.innerHTML = orderOptions
    .map((option) => `<option value="${option.value}">${escapeHtml(option.label)}</option>`)
    .join("");
  sortOrderSelect.value = selectedMode;
}

function applySortMenuSelection() {
  if (!sortColumnSelect || !sortOrderSelect) return;

  const col = sortColumnSelect.value || "athlete";
  const allowedModes = new Set(getSortModeOptionsForColumn(col).map((option) => option.value));
  const mode = allowedModes.has(sortOrderSelect.value)
    ? sortOrderSelect.value
    : getDefaultSortModeForColumn(col);

  sortState = { col, mode };
  applyFiltersAndSort();
  syncSortMenuControls();
}

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
    const col = th.getAttribute("data-col");
    if (!col) return;
    th.style.cursor = "pointer";
    th.addEventListener("click", () => {
      cycleSortFor(col);
      applyFiltersAndSort();
    });
  });
}

/* =========================
   Filters + render
========================= */

function rowHasPerformanceForEvent(row, eventName) {
  const best = bestResultFromList(row?.perEvent?.get(eventName));
  return Boolean(best?.performance?.trim());
}

function applyFiltersAndSort() {
  if (!pivoted) return;

  let rows = pivoted.rows.slice();

  if (selectedCats.size > 0) {
    rows = rows.filter((r) => selectedCats.has(r.cat));
  }

  const wantedSex = sexFilterEl?.value || "all";
  if (wantedSex !== "all") {
    rows = rows.filter((r) => getRowSexValue(r) === wantedSex);
  }

  const visibleEvents = pivoted.events.filter((ev) => {
    if (selectedEvtGroups.size === 0) return false;
    const g = eventGroupFromName(ev);
    if (!selectedEvtGroups.has(g)) return false;

    return rows.some((row) => rowHasPerformanceForEvent(row, ev));
  });

  currentVisibleEvents = visibleEvents.slice();

  if (sortState.col !== "athlete" && sortState.col !== "cat" && sortState.col !== "sex") {
    if (!visibleEvents.includes(sortState.col)) {
      sortState = { col: "athlete", mode: "asc" };
    }
  }

  syncSortMenuControls();

  const { col, mode } = sortState;

  rows.sort((a, b) => {
    if (absentBottomToggle.checked) {
      const aAbsent = isAbsentRow(a);
      const bAbsent = isAbsentRow(b);
      if (aAbsent !== bAbsent) return aAbsent ? 1 : -1;
    }

    if (col === "athlete") {
      const d = a.athlete.localeCompare(b.athlete, "fr", {
        sensitivity: "base",
      });
      return mode === "desc" ? -d : d;
    }

    if (col === "cat") {
      const ia = CAT_ORDER.indexOf(a.cat);
      const ib = CAT_ORDER.indexOf(b.cat);
      const da = ia === -1 ? 999 : ia;
      const db = ib === -1 ? 999 : ib;
      const d =
        da - db || a.cat.localeCompare(b.cat, "fr", { sensitivity: "base" });
      return mode === "desc" ? -d : d;
    }

    if (col === "sex") {
      const d = (a.sex || "").localeCompare(b.sex || "", "fr", {
        sensitivity: "base",
      });
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

    return (a.sex || "").localeCompare(b.sex || "", "fr", {
      sensitivity: "base",
    });
  });

  filteredRows = rows;
  renderPivot(visibleEvents, filteredRows);
}

function renderPivot(events, rows) {
  const headerCells = [
    `<th data-col="athlete">Nom / Prénom</th>`,
    `<th data-col="cat">Catégorie</th>`,
    `<th data-col="sex">Sexe</th>`,
    ...events.flatMap((e) => [
      `<th data-col="${escapeHtml(e)}">${escapeHtml(e)}</th>`,
      `<th class="points-header">Pts</th>`,
    ]),
  ].join("");

  thead.innerHTML = `<tr>${headerCells}</tr>`;
  attachHeaderClicks();

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="${3 + events.length * 2}" class="empty">Aucun résultat.</td></tr>`;
    setStatus("Aucun résultat", 0);
    return;
  }

  const html = rows
    .map((row) => {
      const absent = isAbsentRow(row);
      const absentBadge = absent ? '<span class="absent-badge">Absent</span>' : "";
      const athleteCellKey = buildCellKey(row, "athlete", "meta");
      const catCellKey = buildCellKey(row, "cat", "meta");
      const sexCellKey = buildCellKey(row, "sex", "meta");
      const base = `
      <td data-cell-key="${escapeHtml(athleteCellKey)}" class="paintable-cell ${getCellColorClass(athleteCellKey)}">${escapeHtml(row.athlete)}${absentBadge}</td>
      <td data-cell-key="${escapeHtml(catCellKey)}" class="paintable-cell ${getCellColorClass(catCellKey)}">${escapeHtml(row.cat)}</td>
      <td data-cell-key="${escapeHtml(sexCellKey)}" class="paintable-cell ${getCellColorClass(sexCellKey)}">${escapeHtml(row.sex)}</td>
    `;

      const cells = events
        .map((ev) => {
          const list = row.perEvent.get(ev) || [];
          const best = bestResultFromList(list);
          const val = best?.performance ?? "";
          const pts = pointsFromPerformance(row, ev, val);
          const performanceCellKey = buildCellKey(row, ev, "performance");
          const pointsCellKey = buildCellKey(row, ev, "points");

          return `
            <td data-cell-key="${escapeHtml(performanceCellKey)}" class="paintable-cell ${getCellColorClass(performanceCellKey)}">${escapeHtml(val)}</td>
            <td data-cell-key="${escapeHtml(pointsCellKey)}" class="points-cell paintable-cell ${Number.isFinite(pts) ? "has-points" : "no-points"} ${getCellColorClass(pointsCellKey)}">${escapeHtml(pointsLabel(pts))}</td>
          `;
        })
        .join("");

      return `<tr data-athlete="${escapeHtml(row.athlete)}" class="${absent ? "absent-row" : ""}">${base}${cells}</tr>`;
    })
    .join("");

  tbody.innerHTML = html;
  attachRowContextActions();
  attachPaintCellActions();
  refreshSelectedCellUI();

  const pointsInfo = barreme50
    ? " | barème 50: Benjamin / Minime / Cadet"
    : barreme50LoadError
      ? " | barème 50 indisponible"
      : "";
  const absentInfo = absentAthletes.size ? ` | absents: ${absentAthletes.size}` : "";

  setStatus(
    `OK — lignes: ${rows.length} | épreuves: ${events.length}${pointsInfo}${absentInfo}`,
    rows.length,
  );
}

/* =========================
   Fetch
========================= */

async function fetchData() {
  if (isLoading) return;

  const club = (clubEl.value || "").trim();
  const annee = (anneeEl.value || currentYear).trim();

  if (!validClub(club)) {
    setStatus("Club invalide (6 chiffres).");
    tbody.innerHTML = `<tr><td class="empty">Entre un numéro de club valide.</td></tr>`;
    return;
  }

  syncCellColorsForCurrentDataset();
  setLoading(true, "Chargement des résultats…");

  try {
    await barreme50Ready;
    const res = await fetchJsonWithTimeout(
      `/api/bilans?club=${encodeURIComponent(club)}&annee=${encodeURIComponent(annee)}`,
      FETCH_TIMEOUT_MS,
    );
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

    const message = e?.name === "AbortError"
      ? "Le chargement a pris trop de temps. Réessaie dans quelques secondes."
      : String(e?.message || e);

    tbody.innerHTML = `<tr><td class="empty">Erreur: ${escapeHtml(message)}</td></tr>`;
    setStatus(e?.name === "AbortError" ? "Temps d'attente dépassé" : "Erreur");
  } finally {
    setLoading(false);
  }
}

/* =========================
   Events
========================= */

loadAbsentSettings();
loadCellColorStore();
loadSavedViewsStore();
renderSavedViewsList();
setActivePaintColor("none");

renderMobileOptionsState();
syncSortMenuControls();

mobileOptionsToggle?.addEventListener("click", toggleMobileOptionsPanel);
window.addEventListener("resize", renderMobileOptionsState);

btnFetch.addEventListener("click", fetchData);
clubEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") fetchData();
});
anneeEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") fetchData();
});
sexFilterEl.addEventListener("change", () => {
  updateSexFilterUi();
  applyFiltersAndSort();
});
