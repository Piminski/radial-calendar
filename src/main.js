import { buildSpiralModel, buildModel } from "./parse.js";
import { buildYearFromTemplate } from "./calendarYears.js";
import { buildHistoryModel } from "./history.js";
import { parseYearEventsMarkdown } from "./parseYearEvents.js";
import { RadialCalendar } from "./radial.js";

const svg = document.getElementById("wheel");
const menu = document.getElementById("calendar-menu");
const menuBtn = document.getElementById("calendar-menu-btn");
const menuDropdown = document.getElementById("calendar-menu-dropdown");
const menuItems = [...menuDropdown.querySelectorAll(".calendar-menu-item")];
let cal = null;
let annualModel = null;
let yearModels = {};
let historyModel = null;
let resizeTimer;
let activeCalendar = "history";

const SPIRAL_YEARS = [2025, 2026, 2027];

function setTitle(kind, model) {
  if (kind === "history") {
    document.title = "Radial Calendar — USA History";
  } else if (kind === "spiral") {
    document.title = "Radial Calendar — Annual";
  } else if (kind === "annual" && model?.year) {
    document.title = `Radial Calendar ${model.year}`;
  } else {
    document.title = "Radial Calendar";
  }
}

function setActiveMenuItem(value) {
  activeCalendar = value;
  menuItems.forEach((item) => {
    item.setAttribute("aria-checked", item.dataset.value === value ? "true" : "false");
  });
}

function closeMenu() {
  menuDropdown.hidden = true;
  menuBtn.setAttribute("aria-expanded", "false");
}

function openMenu() {
  menuDropdown.hidden = false;
  menuBtn.setAttribute("aria-expanded", "true");
}

function toggleMenu() {
  if (menuDropdown.hidden) openMenu();
  else closeMenu();
}

function mount(model) {
  if (cal) cancelAnimationFrame(cal._raf);
  cal = new RadialCalendar(svg, model);
  setTitle(model.kind, model);
}

function initAnnual(csv2026) {
  annualModel = buildSpiralModel({ 2026: csv2026 }, SPIRAL_YEARS, csv2026);
  yearModels = {
    2025: buildYearFromTemplate(csv2026, 2025),
    2026: buildModel(csv2026, 2026),
    2027: buildYearFromTemplate(csv2026, 2027),
  };
}

function initHistory(eventsMd) {
  historyModel = buildHistoryModel(parseYearEventsMarkdown(eventsMd));
  mount(historyModel);
  setActiveMenuItem("history");
}

function switchCalendar(value) {
  setActiveMenuItem(value);
  if (value === "history") {
    if (historyModel) mount(historyModel);
  } else if (value === "annual") {
    if (annualModel) mount(annualModel);
  } else if (yearModels[value]) {
    mount(yearModels[value]);
  }
}

menuBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleMenu();
});

menuItems.forEach((item) => {
  item.addEventListener("click", () => {
    switchCalendar(item.dataset.value);
    closeMenu();
  });
});

document.addEventListener("click", (e) => {
  if (!menu.contains(e.target)) closeMenu();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeMenu();
});

Promise.all([
  fetch("./data/calendar-2026.csv").then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  }),
  fetch("./data/us-defining-events-by-year.md").then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  }),
])
  .then(([csv, eventsMd]) => {
    initAnnual(csv);
    initHistory(eventsMd);
  })
  .catch((err) => console.error("Could not load calendar data:", err));

window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => cal?.resize(), 120);
});

window.addEventListener("orientationchange", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => cal?.resize(), 120);
});
