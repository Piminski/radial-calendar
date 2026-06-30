import { buildModel } from "./parse.js";
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
let historyModel = null;
let resizeTimer;
let activeCalendar = "history";

function setTitle(kind) {
  document.title = kind === "history"
    ? "Radial Calendar — USA History"
    : "Radial Calendar 2026";
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
  setTitle(model.kind);
}

function initAnnual(text) {
  annualModel = buildModel(text, 2026);
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
  } else if (annualModel) {
    mount(annualModel);
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
