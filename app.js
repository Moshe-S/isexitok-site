"use strict";

const HELP_TEXT = "להצגת מצב לפי מיקום, הקלידו שם מקום או אזור";
const NO_FAV_TEXT = "אין עדיין מקומות שמורים";
const OPEN_IN_MY_PLACES_EMPTY_HELP =
  "כדי להפעיל את האפשרות, צריך להוסיף לפחות מקום אחד.";

const FAV_KEY = "favorites";
const OPEN_IN_MY_PLACES_KEY = "openInMyPlacesOnLoad";

const qInput = document.getElementById("q");
const clearBtn = document.getElementById("clear");
const showFavoritesBtn = document.getElementById("showFavorites");
const showAllBtn = document.getElementById("showAll");
const refreshBtn = document.getElementById("refreshNow");
const refreshStatus = document.getElementById("refreshStatus");
const syncIndicator = document.getElementById("syncIndicator");
const goHomeBtn = document.getElementById("goHomeBtn");

const meta = document.getElementById("meta");
const list = document.getElementById("list");
const serverWarning = document.getElementById("serverWarning");

const myPlacesPreferenceArea = document.getElementById("myPlacesPreferenceArea");
const openInMyPlacesToggle = document.getElementById("openInMyPlacesToggle");
const openInMyPlacesHelp = document.getElementById("openInMyPlacesHelp");
const app = document.getElementById("app");
const menuToggleBtn = document.getElementById("menuToggleBtn");
const searchToggleBtn = document.getElementById("searchToggleBtn");
const searchControls = document.getElementById("searchControls");
const mobileQ = document.getElementById("mobileQ");
const mobileClear = document.getElementById("mobileClear");
const closeSearchBtn = document.getElementById("closeSearch");
const searchBox = document.getElementById("searchBox");
const sideDrawer = document.getElementById("sideDrawer");
const drawerOverlay = document.getElementById("drawerOverlay");
const closeDrawerBtn = document.getElementById("closeDrawerBtn");
const navControls = document.getElementById("navControls");
const currentScreenTitle = document.getElementById("currentScreenTitle");

const rowTemplate = document.getElementById("placeRowTemplate");
const sitePurposeText = document.getElementById("sitePurposeText");

const panels = document.querySelectorAll(".panel");
const panelToggleBtns = document.querySelectorAll(".panelToggleBtn");
const panelCloseBtns = document.querySelectorAll(".panelCloseBtn");

function setMobileNavState(state) {
  if (!app) return;

  app.classList.remove("menu-open", "search-open");

  if (state === "menu") {
    app.classList.add("menu-open");
    return;
  }

  if (state === "search") {
    app.classList.add("search-open");
    if (qInput) {
      qInput.focus();
    }
    if (mobileQ) {
      mobileQ.focus();
    }
  }
  if (searchToggleBtn) {
    searchToggleBtn.textContent = state === "search" ? "✕" : "🔍";
  }
  if (searchToggleBtn) {
    searchToggleBtn.setAttribute("aria-expanded", state === "search" ? "true" : "false");
  }
}

function openDrawer() {
  if (!sideDrawer || !drawerOverlay) return;
    sideDrawer.classList.add("is-open");
    drawerOverlay.classList.add("is-visible");

  if (menuToggleBtn) {
    menuToggleBtn.textContent = "✕";
    menuToggleBtn.setAttribute("aria-expanded", "true");
  }
  app.classList.add("drawer-open");
  if (closeDrawerBtn) {
    closeDrawerBtn.focus();
  }

  document.addEventListener("keydown", trapDrawerFocus);
}

function closeDrawer() {
  if (!sideDrawer || !drawerOverlay) return;
    sideDrawer.classList.remove("is-open");
  drawerOverlay.classList.remove("is-visible");
  
  if (menuToggleBtn) {
    menuToggleBtn.textContent = "☰";
    menuToggleBtn.setAttribute("aria-expanded", "false");
  }
  app.classList.remove("drawer-open");
  document.removeEventListener("keydown", trapDrawerFocus);
  if (menuToggleBtn) {
    menuToggleBtn.focus();
  }
}

function trapDrawerFocus(e) {
  if (!sideDrawer || !sideDrawer.classList.contains("is-open")) return;
  if (e.key !== "Tab") return;

  const focusableElements = sideDrawer.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );

  if (focusableElements.length === 0) return;

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  if (e.shiftKey && document.activeElement === firstElement) {
    e.preventDefault();
    lastElement.focus();
  } else if (!e.shiftKey && document.activeElement === lastElement) {
    e.preventDefault();
    firstElement.focus();
  }
}

function updateNavLocation() {
  const drawerContent = sideDrawer ? sideDrawer.querySelector(".drawer-content") : null;
  const controls = document.getElementById("controls");
  const syncIndicator = document.getElementById("syncIndicator");
  const mobileNavArea = document.getElementById("mobileNavArea");

  if (!drawerContent || !navControls || !controls) return;

  if (window.innerWidth <= 768) {
    if (!drawerContent.contains(navControls)) {
      drawerContent.appendChild(navControls);
    }

    if (syncIndicator && mobileNavArea && searchToggleBtn && !mobileNavArea.contains(syncIndicator)) {
      mobileNavArea.insertBefore(syncIndicator, searchToggleBtn);
    }
  
  } else {
    if (!controls.contains(navControls)) {
      controls.appendChild(navControls);
    }

    if (syncIndicator && searchControls && !searchControls.contains(syncIndicator)) {
      searchControls.appendChild(syncIndicator);
    }
    closeDrawer();
  }
}

let allPlaces = [];
let serverPlaces = {};
let lastServerTime = null;
let lastSuccessfulRefreshAt = null;
let lastKnownServerStatus = null;
let lastSuccessfulStatusFetchAt = null;
let lastConnectionState = "connected";
let connectionRestoredShownAt = 0;
let favorites = loadFavorites();

let currentView = "home";
let viewBeforeSearch = "home";
let refreshStatusTimeoutId = null;
let isRequestInFlight = false;
let lastFetchFailed = false;
let shouldFetchFullSnapshot = false;
let lastManualRefreshAt = 0;
let manualRefreshPending = false;

let sortMode = loadSortMode();

document.addEventListener("DOMContentLoaded", init);

function updateBottomStatus(event) {
  if (!refreshStatus) return;

  if (refreshStatusTimeoutId) {
    clearTimeout(refreshStatusTimeoutId);
    refreshStatusTimeoutId = null;
  }

  let text = "";
  let state = "";
  let timeoutMs = 0;

  if (event === "manual_start") {
    text = "בודק...";
    state = "is-checking";
  } else if (event === "manual_repeat") {
    text = "עדיין בודק...";
    state = "is-checking";
  } else if (event === "manual_success") {
    text = "עודכן";
    state = "is-success";
    timeoutMs = 6000;
  } else if (event === "delay") {
    text = "ייתכן שיש בעיית תקשורת עם השרת";
    state = "is-warning";
  } else if (event === "error") {
    text = "שגיאת תקשורת עם השרת";
    state = "is-error";
  } else if (event === "connection_restored") {
    text =
      lastConnectionState === "source_lost" || lastConnectionState === "source_warning"
        ? "הקשר עם מקור ההתרעות חודש"
        : "הקשר עם השרת חודש";
    state = "is-success";
    timeoutMs = 4000;
  } else if (event === "clear") {
    text = "";
    state = "";
  } else {
    return;
  }

  refreshStatus.textContent = text;

  refreshStatus.classList.remove(
    "is-checking",
    "is-success",
    "is-warning",
    "is-error"
  );


  if (refreshBtn) {
    refreshBtn.classList.remove(
      "is-checking",
      "is-success",
      "is-warning",
      "is-error"
    );
  }

  if (state) {
    refreshStatus.classList.add(state);

    if (refreshBtn) {
      refreshBtn.classList.add(state);
    }
  }

  if (timeoutMs > 0) {
    refreshStatusTimeoutId = setTimeout(() => {
      updateBottomStatus("clear");
    }, timeoutMs);
  }
}

function setSyncIndicatorState(state) {
  if (!syncIndicator) return;

  syncIndicator.classList.remove(
    "is-checking",
    "is-success",
    "is-warning",
    "is-error"
  );

  if (state) {
    syncIndicator.classList.add(state);
  }
}

async function init() {
  if (sitePurposeText) {
    sitePurposeText.textContent =
      "";
  }

  await loadPlacesCatalog();
  updateSortButtonLabel();
  const defaultSortToggle = document.getElementById("defaultSortToggle");
  if (defaultSortToggle) {
    defaultSortToggle.checked = localStorage.getItem("sortMode") !== null;
  }
        attachEvents();
        updateNavLocation();
        window.addEventListener("resize", updateNavLocation);
        updateSearchButtonsVisibility();
    await fetchFullSnapshot();
    await fetchServerStatus();
    setInterval(() => {
      fetchIncrementalUpdates();
    }, 10000);
      setInterval(() => {
      fetchServerStatus();
    }, 5000);
    setInterval(() => {
      shouldFetchFullSnapshot = true;
    }, 300000);

    setInterval(() => {
    const now = Date.now();
    const elapsed = lastSuccessfulRefreshAt ? now - lastSuccessfulRefreshAt : Infinity;
    const sourceHealthState = getServerSourceHealthState();
    let currentConnectionState = "connected";
    document.body.classList.remove("data-stale");

    if (elapsed >= 5 * 60 * 1000) {
      currentConnectionState = "connection_lost";
      document.body.classList.add("data-stale");
      serverWarning.textContent = "קיימת כרגע בעיית תקשורת עם השרת. ייתכן שהמידע המוצג אינו עדכני.";
      updateBottomStatus("error");
    } else if (elapsed >= 90000) {
      currentConnectionState = "connection_warning";
      serverWarning.textContent = "ייתכן שיש בעיית תקשורת עם השרת.";
      updateBottomStatus("delay");
    } else if (sourceHealthState === "source_lost") {
      currentConnectionState = "source_lost";
      document.body.classList.add("data-stale");
      serverWarning.textContent = "השרת זמין, אך יש בעיה בקבלת עדכונים ממקור ההתרעות. ייתכן שהמידע המוצג אינו עדכני.";
    } else if (sourceHealthState === "source_warning") {
      currentConnectionState = "source_warning";
      serverWarning.textContent = "ייתכן עיכוב בקבלת עדכונים ממקור ההתרעות.";
    } else {
    if (Date.now() - connectionRestoredShownAt > 4000) {
      serverWarning.textContent = "";
    }
    document.body.classList.remove("data-stale");

      if (lastConnectionState !== "connected") {
        serverWarning.textContent =
          lastConnectionState === "source_lost" || lastConnectionState === "source_warning"
            ? "הקשר עם מקור ההתרעות חודש"
            : "הקשר עם השרת חודש";
        connectionRestoredShownAt = Date.now();
        updateBottomStatus("connection_restored");
        }
      }
    if (isRequestInFlight) {
      setSyncIndicatorState("is-checking");
    } else if (currentConnectionState === "connection_lost" || currentConnectionState === "source_lost") {
      setSyncIndicatorState("is-error");
    } else if (lastFetchFailed) {
      setSyncIndicatorState("is-warning");
    } else if (currentConnectionState === "connection_warning" || currentConnectionState === "source_warning") {
      setSyncIndicatorState("is-warning");
    } else {
      setSyncIndicatorState("is-success");
    }

    lastConnectionState = currentConnectionState;
  }, 1000);    

  if (shouldOpenInMyPlacesOnLoad() && favorites.size > 0) {
    currentView = "myPlaces";
    renderCurrentView();
    return;
  }

  if (currentView === "home") {
      renderHome();
    } else {
    renderCurrentView();
    }
}

async function fetchFullSnapshot() {
  if (isRequestInFlight) {
    return false;
  }

  isRequestInFlight = true;
  setSyncIndicatorState("is-checking");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  
  try {

    const res = await fetch("https://api.isexitok.com/api/alert", { cache: "no-store", signal: controller.signal });

    if (!res.ok) {
      throw new Error("HTTP " + res.status);
    }

    const data = await res.json();
    clearTimeout(timeoutId);

    if (!data || !data.places) {
      throw new Error("Invalid response");
    }

    serverPlaces = data.places;
    lastServerTime = data.serverTime;
    lastSuccessfulRefreshAt = Date.now();
    lastFetchFailed = false;
    isRequestInFlight = false;
    if (manualRefreshPending) {
      manualRefreshPending = false;
      updateBottomStatus("manual_success");
    }

        if (currentView !== "home") {
            renderCurrentView();
        }
        return true;

  } catch (err) {
    clearTimeout(timeoutId);
    isRequestInFlight = false;
    lastFetchFailed = true;
    return false;
  }
}


async function fetchIncrementalUpdates() {
  if (isRequestInFlight) {
  return false;
  }
  if (shouldFetchFullSnapshot) {
    shouldFetchFullSnapshot = false;
    return await fetchFullSnapshot();
  }

  isRequestInFlight = true;
  setSyncIndicatorState("is-checking");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  
  try {
    if (lastServerTime === null) {
      isRequestInFlight = false;
      return await fetchFullSnapshot();
    }
    
    const res = await fetch(
      "https://api.isexitok.com/api/updates?since=" + encodeURIComponent(lastServerTime),
      { cache: "no-store", signal: controller.signal }
    );

    if (!res.ok) {
      throw new Error("HTTP " + res.status);
    }

    const data = await res.json();
    clearTimeout(timeoutId);

    if (!data || !data.updates) {
      throw new Error("Invalid response");
    }

    serverPlaces = {
      ...serverPlaces,
      ...data.updates
    };

    lastServerTime = data.serverTime;
    lastSuccessfulRefreshAt = Date.now();
    lastFetchFailed = false;
    isRequestInFlight = false;
    if (manualRefreshPending) {
      manualRefreshPending = false;
      updateBottomStatus("manual_success");
    }

    if (currentView !== "home") {
      renderCurrentView();
    }

    return true;

  } catch (err) {
    
    clearTimeout(timeoutId);
    isRequestInFlight = false;
    lastFetchFailed = true;
        return false;
  }
}

async function fetchServerStatus() {
  try {
    const res = await fetch("https://api.isexitok.com/api/status", { cache: "no-store" });

    if (!res.ok) {
      return;
    }

    const data = await res.json();

    lastKnownServerStatus = data;
    lastSuccessfulStatusFetchAt = Date.now();
  } catch (err) {
  }
}

function getServerSourceHealthState() {
  if (lastKnownServerStatus && lastKnownServerStatus.dataSourceHealth) {
    const state = lastKnownServerStatus.dataSourceHealth.state;

    if (state === "lost") return "source_lost";
    if (state === "warning") return "source_warning";
    if (state === "ok") return "ok";
    return "unknown";
  }
  if (!lastKnownServerStatus) return "unknown";

  const serverTime = Number(lastKnownServerStatus.serverTime || 0);
  const lastPoll = Number(lastKnownServerStatus.lastSuccessfulPollAt || 0);

  if (!serverTime || !lastPoll) return "unknown";

  const diffSeconds = serverTime - lastPoll;

  if (diffSeconds >= 300) return "source_lost";
  if (diffSeconds >= 90) return "source_warning";

  return "ok";
}

function attachEvents() {
  qInput.addEventListener("input", handleSearchInput);
  if (mobileQ) {
    mobileQ.addEventListener("input", (e) => {
      if (qInput) {
        qInput.value = e.target.value;
      }
      handleSearchInput();
    });
  }
  clearBtn.addEventListener("click", handleClear);
  if (mobileClear) {
    mobileClear.addEventListener("click", handleClear);
  }
  showFavoritesBtn.addEventListener("click", handleShowMyPlaces);
  showAllBtn.addEventListener("click", handleShowAll);
  goHomeBtn.addEventListener("click", handleGoHome);
  refreshBtn.addEventListener("click", handleRefresh);
  if (menuToggleBtn) {
  menuToggleBtn.addEventListener("click", handleMenuToggle);
  }

  if (searchToggleBtn) {
    searchToggleBtn.addEventListener("click", handleSearchToggle);
  }

  if (closeSearchBtn) {
  closeSearchBtn.addEventListener("click", handleCloseSearch);
  }

  if (openInMyPlacesToggle) {
  openInMyPlacesToggle.addEventListener("change", handleOpenInMyPlacesPreferenceChange);
  }
  if (closeDrawerBtn) {
  closeDrawerBtn.addEventListener("click", closeDrawer);
  }

  if (drawerOverlay) {
    drawerOverlay.addEventListener("click", closeDrawer);
  }

  const sortToggleBtn = document.getElementById("sortToggleBtn");
  const sortMenu = document.getElementById("sortMenu");
  const defaultSortToggle = document.getElementById("defaultSortToggle");

  if (sortToggleBtn && sortMenu) {
    sortToggleBtn.addEventListener("click", () => {
      const isOpen = !sortMenu.hidden;
      sortMenu.hidden = isOpen;
      sortToggleBtn.setAttribute("aria-expanded", isOpen ? "false" : "true");
    });

    sortMenu.querySelectorAll("[data-sort-mode]").forEach(btn => {
      btn.addEventListener("click", () => {
        sortMode = btn.dataset.sortMode;
        sortMenu.querySelectorAll("[data-sort-mode]").forEach(b => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        renderCurrentView();

        if (defaultSortToggle && defaultSortToggle.checked) {
          saveSortMode(sortMode);
        }

        sortMenu.hidden = true;
        sortToggleBtn.setAttribute("aria-expanded", "false");
        updateSortButtonLabel();
      });
    });
  }

  if (defaultSortToggle) {
    defaultSortToggle.addEventListener("change", () => {
      if (defaultSortToggle.checked) {
        saveSortMode(sortMode);
      } else {
        localStorage.removeItem("sortMode");
      }
    });
  }

    document.addEventListener("click", (e) => {
      if (!sortMenu || !sortToggleBtn) return;

      const isClickInside =
        sortMenu.contains(e.target) || sortToggleBtn.contains(e.target);

      if (!isClickInside) {
        sortMenu.hidden = true;
        sortToggleBtn.setAttribute("aria-expanded", "false");
      }
    });
}

async function loadPlacesCatalog() {
  const res = await fetch("./places-catalog.json", { cache: "no-store" });
  const data = await res.json();
  allPlaces = Array.isArray(data) ? data : [];
}

function handleSearchInput() {
  const query = qInput.value.trim();
  

  if (query !== "") {
    if (currentView !== "search") {
      viewBeforeSearch = currentView;
    }
    currentView = "search";
  } else if (currentView === "search") {
    currentView = viewBeforeSearch;
  }

  renderCurrentView();
  updateSearchButtonsVisibility();
}

function updateSearchButtonsVisibility() {
  const hasText =
    (qInput && qInput.value.trim() !== "") ||
    (mobileQ && mobileQ.value.trim() !== "");

  clearBtn.hidden = !hasText;

  if (mobileClear) {
    mobileClear.hidden = !hasText;
  }

  if (closeSearchBtn) {
    closeSearchBtn.hidden = !app.classList.contains("search-open");
  }
}

function handleClear() {
  const hadQuery = qInput.value.trim() !== "";

  if (qInput) qInput.value = "";
  if (mobileQ) mobileQ.value = "";

  if (hadQuery && currentView === "search") {
    currentView = viewBeforeSearch;
  }

  renderCurrentView();
  if (mobileQ && document.activeElement === mobileQ) {
    mobileQ.focus();
  } else if (qInput) {
    qInput.focus();
  }
  updateSearchButtonsVisibility();
}

function handleShowMyPlaces() {
  closeDrawer();
  qInput.value = "";
  currentView = "myPlaces";
  renderCurrentView();
}

function handleShowAll() {
  closeDrawer();
  qInput.value = "";
  currentView = "all";
  renderCurrentView();
}

function handleGoHome() {
  closeDrawer();
  qInput.value = "";
  currentView = "home";
  renderCurrentView();
}

function handleMenuToggle() {
  if (!sideDrawer || !drawerOverlay) return;

  const isOpen = sideDrawer.classList.contains("is-open");

  if (isOpen) {
    closeDrawer();
  } else {
    openDrawer();
  }
}

function handleSearchToggle() {
  if (!app) return;

  const isOpen = app.classList.contains("search-open");
  setMobileNavState(isOpen ? "default" : "search");
  updateSearchButtonsVisibility();
}

function handleCloseSearch() {
  setMobileNavState("default");
  updateSearchButtonsVisibility();
}

async function handleRefresh() {
  const now = Date.now();

  if (now - lastManualRefreshAt < 500) {
    return;
  }

    lastManualRefreshAt = now;

  if (!manualRefreshPending) {
    manualRefreshPending = true;
    updateBottomStatus("manual_start");
  } else {
    updateBottomStatus("manual_repeat");
  }

  if (isRequestInFlight) {
    return;
  }
  const didRefreshSucceed = await fetchIncrementalUpdates();

  if (didRefreshSucceed) {
    updateBottomStatus("manual_success");
  }
    if (!didRefreshSucceed) {
      updateBottomStatus("error");
  }

}



function closeAllPanels() {
  panels.forEach((panel) => {
    panel.hidden = true;
    const toggleBtnId = panel.id.replace("Panel", "ToggleBtn");
    const toggleBtn = document.getElementById(toggleBtnId);
    if (toggleBtn) {
      toggleBtn.classList.remove("is-active");
    }
  });
}

panelCloseBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const panel = btn.closest(".panel");
    if (panel) {
      panel.hidden = true;
      const toggleBtnId = btn.id.replace("CloseBtn", "ToggleBtn");
      const toggleBtn = document.getElementById(toggleBtnId);
      if (toggleBtn) {
        toggleBtn.focus();
      }
    }
    const toggleBtnId = btn.id.replace("CloseBtn", "ToggleBtn");
    const toggleBtn = document.getElementById(toggleBtnId);
    if (toggleBtn) {
      toggleBtn.setAttribute("aria-expanded", "false");
      toggleBtn.classList.remove("is-active");
    }
  });
});

panelToggleBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const panelId = btn.id.replace("ToggleBtn", "Panel");
    const panel = document.getElementById(panelId);
    if (!panel) return;

    const isOpen = !panel.hidden;
    if (isOpen) {
      btn.setAttribute("aria-expanded", "false");
    }
    panelToggleBtns.forEach((b) => {
      b.setAttribute("aria-expanded", "false");
    });
    closeAllPanels();

    if (!isOpen) {
      panel.hidden = false;
      panel.focus();
      btn.setAttribute("aria-expanded", "true");
      btn.classList.add("is-active");
    }
  });
});

function renderCurrentView() {
  hideTransientAreas();
  updateHomeButton();

  [showFavoritesBtn, showAllBtn, goHomeBtn].forEach(btn => btn.classList.remove("is-active"));
  if (currentView === "home") {
    goHomeBtn.classList.add("is-active");
  } else if (currentView === "myPlaces") {
    showFavoritesBtn.classList.add("is-active");
  } else if (currentView === "all") {
    showAllBtn.classList.add("is-active");
  }

    updateCurrentScreenTitle();

  if (currentView === "home") {
    renderHome();
    return;
  }

  if (currentView === "myPlaces") {
    renderMyPlaces();
    return;
  }

  if (currentView === "all") {
    renderAll();
    return;
  }

  if (currentView === "search") {
    renderSearch();
  }
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const activeToggle = document.querySelector(".panelToggleBtn.is-active");

    const sortMenu = document.getElementById("sortMenu");
    const sortToggleBtn = document.getElementById("sortToggleBtn");

    if (sortMenu && !sortMenu.hidden) {
      sortMenu.hidden = true;
      if (sortToggleBtn) {
        sortToggleBtn.setAttribute("aria-expanded", "false");
        sortToggleBtn.focus();
      }
    }

    closeAllPanels();
    if (activeToggle) {
      activeToggle.focus();
    }
    panelToggleBtns.forEach((btn) => {
      btn.setAttribute("aria-expanded", "false");
      btn.classList.remove("is-active");
    });
  }
});

function renderHome() {
  list.innerHTML = "";
  meta.textContent = HELP_TEXT;
  updateHomeButton();
}

function renderMyPlaces() {
  showMyPlacesPreferenceArea(true);
  updateOpenInMyPlacesButtonState();

  if (favorites.size === 0) {
    list.innerHTML = "";
    meta.textContent = NO_FAV_TEXT;

    if (openInMyPlacesHelp) {
      openInMyPlacesHelp.textContent = "";
      openInMyPlacesHelp.hidden = true;
    }

    return;
  }

  if (openInMyPlacesHelp) {
    openInMyPlacesHelp.textContent = "";
    openInMyPlacesHelp.hidden = true;
  }

  const items = allPlaces.filter((place) => favorites.has(String(place.name)));
  meta.textContent = "";
  renderList(items);
}

function renderAll() {
  meta.textContent = "";
  renderList(allPlaces);
}

function renderSearch() {
  const query = qInput.value.trim().toLowerCase();

  if (query === "") {
    currentView = viewBeforeSearch;
    renderCurrentView();
    return;
  }

  const filtered = allPlaces.filter((place) => matchesPlace(place, query));
  meta.textContent = "";
  renderList(filtered);
}

function matchesPlace(place, query) {
  const name = String(place.name || "").toLowerCase();
  const aliases = Array.isArray(place.aliases)
    ? place.aliases.map((alias) => String(alias).toLowerCase())
    : [];

  if (name.includes(query)) {
    return true;
  }

  return aliases.some((alias) => alias.includes(query));
}

function getSortedItems(items) {
  if (sortMode !== "lastAlert") {
    return items;
  }

  return [...items].sort((a, b) => {
    const aRecord = serverPlaces[String(a.name || "")] || null;
    const bRecord = serverPlaces[String(b.name || "")] || null;

    const aRank = getSortLifecycleRank(aRecord);
    const bRank = getSortLifecycleRank(bRecord);

    if (aRank !== bRank) {
      return aRank - bRank;
    }

    if (aRank === 1 || aRank === 2) {
      return Number(bRecord.updatedAt || 0) - Number(aRecord.updatedAt || 0);
    }

    return 0;
  });
}

function getSortLifecycleRank(record) {
  if (!record) return 3;
  if (record.lifecycle === "active") return 1;
  if (record.lifecycle === "stale") return 2;
  return 3;
}

function updateSortButtonLabel() {
  const sortToggleBtn = document.getElementById("sortToggleBtn");
  if (!sortToggleBtn) return;

  if (sortMode === "lastAlert") {
    sortToggleBtn.textContent = "מיון: עדכון אחרון";
  } else {
    sortToggleBtn.textContent = "מיון: א-ת";
  }
}

function renderList(items) {
  items = getSortedItems(items);
  list.innerHTML = "";

  items.forEach((place, index) => {
    const rowNode = createPlaceRow(place);

    const favBtn = rowNode.querySelector(".fav");
if (favBtn) {
  favBtn.tabIndex = index === 0 ? 0 : -1;
}
    list.appendChild(rowNode);
  });
}

function createPlaceRow(place) {
  const fragment = rowTemplate.content.cloneNode(true);

  const favBtn = fragment.querySelector(".fav");
  favBtn.tabIndex = -1;
  favBtn.addEventListener("keydown", handleFavKeydown);
  const nameEl = fragment.querySelector(".place-name");
  const statusEl = fragment.querySelector(".place-status");
  const timeEl = fragment.querySelector(".place-time");

    const placeName = String(place.name || "");
    const serverRecord = serverPlaces[placeName] || null;
    const isFav = favorites.has(placeName);

  favBtn.textContent = isFav ? "★" : "☆";
  favBtn.setAttribute(
    "aria-label",
    isFav ? "הסר מהמקומות שלי" : "הוסף למקומות שלי"
  );
  favBtn.setAttribute("aria-pressed", isFav ? "true" : "false");

  favBtn.addEventListener("click", () => {
    toggleFavorite(placeName);
  });

  nameEl.textContent = placeName;
  if (serverRecord) {
  statusEl.textContent = formatServerStatus(serverRecord);
} else {
  statusEl.textContent = formatInitialStatus(place);
}
  if (serverRecord && serverRecord.updatedAt) {

  const diffSeconds = lastServerTime - serverRecord.updatedAt;
  const minutes = Math.floor(diffSeconds / 60);

  const date = new Date(serverRecord.updatedAt * 1000);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const startOfToday = new Date();
  startOfToday.setHours(0,0,0,0);

  const isYesterday = date < startOfToday;

  if (serverRecord.lifecycle === "stale") {
    const elapsedText = formatStaleElapsedTime(diffSeconds);

    timeEl.textContent =
      (isYesterday ? "אתמול בשעה " : "בשעה ") +
      hh +
      ":" +
      mm +
      " (לפני " +
      elapsedText +
      ", " +
      (serverRecord.instructions || "") +
      ")";
  } else if (serverRecord.lifecycle === "expired") {
    const dd = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");

    timeEl.textContent =
      "(" + dd + "/" + month + " ב-" + hh + ":" + mm + ")";
  } else {
    if (minutes === 0) {
      timeEl.textContent = "ב " + hh + ":" + mm + ", לפני פחות מדקה";
    } else {
      const prefix = isYesterday ? "אתמול בשעה " : "בשעה ";
      timeEl.textContent = prefix + hh + ":" + mm + ", לפני " + minutes + " דק'";
    }
  }

} else {
  timeEl.textContent = "";
}
  return fragment;
}

function handleFavKeydown(e) {
  const current = e.currentTarget;

  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;

  e.preventDefault();

  const items = Array.from(document.querySelectorAll(".fav"));
  const index = items.indexOf(current);

  if (index === -1) return;

  let nextIndex = index;

  if (e.key === "ArrowDown") {
    nextIndex = (index + 1) % items.length;
  }

  if (e.key === "ArrowUp") {
    nextIndex = (index - 1 + items.length) % items.length;
  }

  items.forEach((btn, i) => {
    btn.tabIndex = i === nextIndex ? 0 : -1;
  });

  items[nextIndex].focus();
}

function formatStaleElapsedTime(diffSeconds) {
  const totalMinutes = Math.max(0, Math.floor(diffSeconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return minutes + " דק'";
  }

  if (hours === 1) {
    return "שעה ו-" + minutes + " דק'";
  }

  if (hours === 2) {
    return "שעתיים ו-" + minutes + " דק'";
  }

  return hours + " ש' ו-" + minutes + " דק'";
}

function formatInitialStatus(place) {
  if (place.status === "no_official_update") {
    return "לא זוהה עדכון רשמי";
  }

  return String(place.status || "");
}

function formatInitialTime() {
  return "";
}

function formatServerStatus(serverRecord) {
  if (!serverRecord) {
    return "";
  }

  if (serverRecord.lifecycle === "active") {
    if (serverRecord.instructions === "האירוע הסתיים") {
      return "אפשר לצאת 🥳 (" + serverRecord.instructions + "), העדכון התקבל";
    }
    return serverRecord.instructions || "";
  }

  if (serverRecord.status === "no_recent_update" && serverRecord.lifecycle === "stale") {
    return "העדכון האחרון התקבל";
  }

  if (serverRecord.status === "no_recent_update" && serverRecord.lifecycle === "expired") {
    return "עברו מעל 24 שעות מאז העדכון האחרון";
  }

  if (serverRecord.status === "no_recent_update" && serverRecord.lifecycle === "never") {
    return "לא זוהה עדכון רשמי";
  }

  return "";
}

function toggleFavorite(placeName) {
  if (favorites.has(placeName)) {
    favorites.delete(placeName);
  } else {
    favorites.add(placeName);
  }

  saveFavorites(favorites);
  renderCurrentView();
}

function updateCurrentScreenTitle() {
  if (!currentScreenTitle) return;

  if (app && app.classList.contains("search-open")) {
    return;
  }

  const activeButton = document.querySelector("#navControls button.is-active");

  if (!activeButton) {
    currentScreenTitle.textContent = "";
    return;
  }

  currentScreenTitle.textContent = activeButton.textContent.trim() + ":";
}

function updateHomeButton() {
  goHomeBtn.hidden = currentView === "home";
}

function hideTransientAreas() {
  if (myPlacesPreferenceArea) {
    myPlacesPreferenceArea.hidden = true;
  }

  const listToolbar = document.getElementById("listToolbar");
  if (listToolbar) {
    listToolbar.hidden = false;
  }

  if (openInMyPlacesHelp) {
    openInMyPlacesHelp.textContent = "";
    openInMyPlacesHelp.hidden = true;
  }
}

function showMyPlacesPreferenceArea(shouldShow) {
  if (!myPlacesPreferenceArea) {
    return;
  }

  myPlacesPreferenceArea.hidden = !shouldShow;
}

function updateOpenInMyPlacesButtonState() {
  if (!openInMyPlacesToggle) {
    return;
  }

  openInMyPlacesToggle.checked = shouldOpenInMyPlacesOnLoad();

  if (favorites.size === 0) {
    openInMyPlacesToggle.disabled = true;
  } else {
    openInMyPlacesToggle.disabled = false;
  }
}

function handleOpenInMyPlacesPreferenceChange() {
  if (!openInMyPlacesToggle || !openInMyPlacesHelp) {
    return;
  }

  if (favorites.size === 0) {
    openInMyPlacesHelp.textContent = OPEN_IN_MY_PLACES_EMPTY_HELP;
    openInMyPlacesHelp.hidden = false;
    openInMyPlacesToggle.checked = false;
    return;
  }

  const value = openInMyPlacesToggle.checked;
  localStorage.setItem(OPEN_IN_MY_PLACES_KEY, JSON.stringify(value));

  openInMyPlacesHelp.textContent = "";
  openInMyPlacesHelp.hidden = true;
}

function shouldOpenInMyPlacesOnLoad() {
  try {
    return JSON.parse(localStorage.getItem(OPEN_IN_MY_PLACES_KEY) || "false") === true;
  } catch {
    return false;
  }
}

function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function loadSortMode() {
  try {
    const value = localStorage.getItem("sortMode");
    return value === "lastAlert" ? "lastAlert" : "catalog";
  } catch {
    return "catalog";
  }
}

function saveSortMode(mode) {
  localStorage.setItem("sortMode", mode);
}

function saveFavorites(set) {
  localStorage.setItem(FAV_KEY, JSON.stringify(Array.from(set)));
}