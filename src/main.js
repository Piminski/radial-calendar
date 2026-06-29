import { buildModel } from "./parse.js";
import { RadialCalendar } from "./radial.js";

const svg = document.getElementById("wheel");
let cal = null;

function init(model) {
  cal = new RadialCalendar(svg, model);
  let t;
  window.addEventListener("resize", () => {
    clearTimeout(t);
    t = setTimeout(() => cal.resize(), 120);
  });
}

fetch("./data/calendar-2026.csv")
  .then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  })
  .then((text) => init(buildModel(text, 2026)))
  .catch((err) => console.error("Could not load CSV:", err));
