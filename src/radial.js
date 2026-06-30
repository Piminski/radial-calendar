// Radial calendar renderer + spin interaction (SVG based).

import { ZODIAC_ICONS } from "./zodiac.js";
import { PRESENT_ICON } from "./birthdays.js";
import { REF_FULL_MOON_2026, supermoonPeaksForYear } from "./supermoons.js";
import { CELESTIAL_LABEL_SCALE, isCelestialLabel } from "./celestial.js";
import { partyColor } from "./usaHistoryData.js";

const SVGNS = "http://www.w3.org/2000/svg";

// Sun sign for a given month (0-based) and day. Each entry is the sign that
// runs into this month and the last day it occupies before the next sign begins.
const ZODIAC_BY_MONTH = [
  ["capricorn", 19], ["aquarius", 18], ["pisces", 20], ["aries", 19],
  ["taurus", 20], ["gemini", 20], ["cancer", 22], ["leo", 22],
  ["virgo", 22], ["libra", 22], ["scorpio", 21], ["sagittarius", 21],
];
const ZODIAC_ORDER = [
  "capricorn", "aquarius", "pisces", "aries", "taurus", "gemini",
  "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius",
];
function zodiacSign(monthIndex, date) {
  const [name, cut] = ZODIAC_BY_MONTH[monthIndex];
  return date <= cut ? name : ZODIAC_ORDER[(monthIndex + 1) % 12];
}

// Palette for the multi-day range tracks (A..E, inner -> outer).
const TRACK_COLORS = [
  "#e0654a", // A - warm red/orange
  "#e0a23c", // B - amber
  "#5aa469", // C - green
  "#4f93c4", // D - blue
  "#9b6bc4", // E - violet
];

// Blue track (D) — birthdays sit on this ring, labels reading inward.
const BLUE_LANE = 3;

const MOON_NAMES = [
  "New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous",
  "Full Moon", "Waning Gibbous", "Third Quarter", "Waning Crescent",
];
const SYNODIC = 29.530588853; // mean synodic month (days)
const REF_FULL_MOON = REF_FULL_MOON_2026;
const SUPERMOON_WINDOW_MS = 36 * 3600000; // ±36 h around peak

// 0..1 glow strength when near a supermoon peak and the disc is nearly full.
function supermoonStrength(t, phase, year) {
  const peaks = supermoonPeaksForYear(year);
  if (!peaks.length) return 0;
  const illum = moonIllum(phase);
  if (illum < 0.88) return 0;
  const phaseFactor = Math.min(1, (illum - 0.88) / 0.1);
  let best = 0;
  for (const peak of peaks) {
    const dt = Math.abs(t - peak);
    if (dt > SUPERMOON_WINDOW_MS) continue;
    const timeFactor = 1 - dt / SUPERMOON_WINDOW_MS;
    best = Math.max(best, timeFactor * phaseFactor);
  }
  return best;
}

// Fractional phase: 0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = third quarter.
function moonPhase(p) {
  let phase = ((p - REF_FULL_MOON) / 86400000 / SYNODIC + 0.5) % 1;
  if (phase < 0) phase += 1;
  return phase;
}

// Illuminated fraction (0..1).
function moonIllum(p) {
  return 0.5 * (1 - Math.cos(2 * Math.PI * p));
}

// SVG path for the lit portion of a moon of radius R at phase p (0 new .. 0.5 full .. 1 new).
function moonLitPath(R, p) {
  const tau = 2 * Math.PI;
  const c = Math.cos(tau * p);
  const rx = Math.max(R * Math.abs(c), 0.001);
  if (p <= 0.5) {
    // Waxing — lit on the right.
    const sweep = c > 0 ? 0 : 1;
    return `M 0 ${-R} A ${R} ${R} 0 0 1 0 ${R} `
         + `A ${rx.toFixed(3)} ${R} 0 0 ${sweep} 0 ${-R} Z`;
  }
  // Waning — lit on the left.
  const sweep = c < 0 ? 0 : 1;
  return `M 0 ${-R} A ${R} ${R} 0 0 0 0 ${R} `
       + `A ${rx.toFixed(3)} ${R} 0 0 ${sweep} 0 ${-R} Z`;
}

function moonPhaseName(p) {
  const illum = moonIllum(p);
  if (illum < 0.05) return MOON_NAMES[0];
  if (illum > 0.95) return MOON_NAMES[4];
  const i = Math.floor(p * 8 + 0.5) % 8;
  return MOON_NAMES[i];
}

const CFG = {
  // The outermost ring (the date numbers) lands at this fraction of width;
  // the circle center sits just off-screen to the left.
  outerXFrac: 0.92,
  centerYFrac: 0.5,
  radiusFrac: 1.5,      // Ro = viewport height * radiusFrac (portrait / square)
  landscapeRadiusFrac: 3.4, // zoom in when W > H for readability + peephole crop
  // Radii as multiples of Ro (inner -> outer):
  rMonthText: 0.6,      // month name curved inside the ring (behind)
  rRangeIn: 0.42,       // multi-day event tracks, distributed across the ring
  rRangeOut: 0.90,
  rDate: 1.0,           // day numbers sit at the outermost edge
  // Pixel offsets:
  holidayGap: 18,       // gap inside the date numbers where event text ends
  dotR: 3.0,
  // USA history: rings sit inward of headline text (8px gap from year labels).
  historyRangeIn: 0.52,
  historyRangeOut: 0.84,
  historyHeadlineGap: 8, // px between year number and headline (text-anchor end)
  historyPresidentLane: 6.0, // inside track: rangeIn + this * bandStep
  historyBandStepCap: 0.030, // tighter lane spacing than annual calendar
};

function el(name, attrs) {
  const e = document.createElementNS(SVGNS, name);
  if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

function polar(r, deg) {
  const a = (deg * Math.PI) / 180;
  return [r * Math.cos(a), r * Math.sin(a)];
}

function arcPath(r, a0, a1, sweep = 1) {
  const [x0, y0] = polar(r, a0);
  const [x1, y1] = polar(r, a1);
  const large = Math.abs(a1 - a0) % 360 > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${large} ${sweep} ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

// Arc path for textPath: always increasing screen angle so labels stay upright (top outward).
function uprightArcPath(r, a0, a1) {
  return arcPath(r, Math.min(a0, a1), Math.max(a0, a1), 1);
}

// Filled wedge (pie slice) from the center out to radius r, spanning a0->a1.
function wedgePath(r, a0, a1) {
  const [x0, y0] = polar(r, a0);
  const [x1, y1] = polar(r, a1);
  const large = Math.abs(a1 - a0) % 360 > 180 ? 1 : 0;
  return `M 0 0 L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
}

function approxTextWidth(text, fontSize) {
  return text.length * fontSize * 0.52;
}


let _presidentMeasureCtx = null;
function measurePresidentText(text, fontSize) {
  if (!text) return 0;
  if (!_presidentMeasureCtx) {
    const canvas = document.createElement("canvas");
    _presidentMeasureCtx = canvas.getContext("2d");
  }
  _presidentMeasureCtx.font = `600 ${fontSize}px Inter, "Helvetica Neue", Arial, system-ui, sans-serif`;
  return _presidentMeasureCtx.measureText(text).width;
}

function dayHasPerimeterLabel(day) {
  return day && (day.holidays.length > 0 || day.supermoon);
}

function perimeterLabelItems(day, holFs) {
  const celestialFs = holFs * CELESTIAL_LABEL_SCALE;
  const items = [];
  day.holidays.forEach((label) => {
    const celestial = isCelestialLabel(label);
    items.push({ text: label, fs: celestial ? celestialFs : holFs, celestial });
  });
  if (day.supermoon) {
    items.push({ text: day.supermoon, fs: celestialFs, celestial: true, supermoon: true });
  }
  const outer = items.filter((item) => !item.celestial);
  const inner = items.filter((item) => item.celestial);
  return [...outer, ...inner];
}

export class RadialCalendar {
  constructor(svg, model, { onFocusChange } = {}) {
    this.svg = svg;
    this.model = model;
    this.onFocusChange = onFocusChange || (() => {});
    this.rot = 0;
    this.vel = 0; // deg/ms for momentum
    this.degPerDay = 360 / model.total;
    this.dir = 1; // winding direction: 1 = dates advance anticlockwise
    this._yearStart = Date.UTC(model.year, 0, 1, 12, 0, 0);
    this.todayIndex = this._computeTodayIndex();
    this._raf = null;
    this._dragging = false;

    this._assignLanes();
    this._buildStatic();
    this.resize();
    this.goToIndex(this.todayIndex, false);
    this._attachEvents();
  }

  get isHistory() { return this.model.kind === "history"; }

  // Angle (deg) of a day index, honouring the winding direction.
  aDeg(i) { return i * this.degPerDay * this.dir; }

  _eventSpansDecades(ev) {
    if (!this.isHistory) return false;
    const y0 = this.model.startYear + ev.startIndex;
    const y1 = this.model.startYear + ev.endIndex;
    if (y1 - y0 < 10) return false;
    return Math.floor(y0 / 10) !== Math.floor(y1 / 10);
  }

  _renderRangeEventLabel(sg, rc, inside, label, color, fs) {
    const t = el("text", {
      x: inside ? (rc - CFG.dotR - 4) : (rc + CFG.dotR + 4), y: 0,
      "font-size": fs,
      "dominant-baseline": "middle",
      "text-anchor": inside ? "end" : "start",
      class: "range-label",
      fill: color,
    });
    t.textContent = label;
    sg.appendChild(t);
  }

  _labelArcHalfDeg(label, fs, rc) {
    const pad = 4;
    return ((approxTextWidth(label, fs) + pad) / rc) * (180 / Math.PI);
  }

  _renderMultidecadePathLabel(group, rc, a0, a1, text, color, fs, role) {
    const pathId = `range-lbl-${this._pathId++}`;
    group.appendChild(el("path", {
      id: pathId, d: uprightArcPath(rc, a0, a1), fill: "none", stroke: "none",
    }));
    const isStart = role === "start";
    const label = el("text", {
      "font-size": fs,
      class: "range-label range-label-radial",
      fill: color,
    });
    const tp = el("textPath", {
      href: `#${pathId}`,
      startOffset: isStart ? "0%" : "100%",
      "text-anchor": isStart ? "start" : "end",
      dy: `-${Math.max(3, fs * 0.35)}`,
    });
    tp.textContent = text;
    label.appendChild(tp);
    group.appendChild(label);
  }

  _renderMultidecadeEvent(group, ev, rc, color, fs, g) {
    const aS = this.aDeg(ev.startIndex);
    const aE = this.aDeg(ev.endIndex);
    const aLo = Math.min(aS, aE);
    const aHi = Math.max(aS, aE);

    group.appendChild(el("path", {
      d: uprightArcPath(rc, aS, aE), fill: "none", stroke: color,
      "stroke-width": Math.max(1, g.Ro * 0.0013), class: "range-line",
    }));

    for (const angle of [aS, aE]) {
      const [x, y] = polar(rc, angle);
      group.appendChild(el("circle", {
        cx: x, cy: y, r: CFG.dotR, fill: color, class: "range-dot",
      }));
    }

    const rLabel = rc + CFG.dotR + 3;
    const halfSpan = this._labelArcHalfDeg(ev.label, fs, rLabel);
    this._renderMultidecadePathLabel(
      group, rLabel, aLo, aLo + halfSpan * 2, ev.label, color, fs, "start",
    );
    this._renderMultidecadePathLabel(
      group, rLabel, aHi - halfSpan * 2, aHi, ev.label, color, fs, "end",
    );
  }

  // When several events start or end on the same year, alternate label side to reduce overlap.
  _buildEventLabelSides() {
    const byIndex = new Map();
    const add = (idx, ev, role) => {
      if (!byIndex.has(idx)) byIndex.set(idx, []);
      byIndex.get(idx).push({ ev, role });
    };
    this.model.events.forEach((ev) => {
      if (ev.endIndex > ev.startIndex) {
        add(ev.startIndex, ev, "start");
        add(ev.endIndex, ev, "end");
      } else {
        add(ev.startIndex, ev, "only");
      }
    });
    const sides = new Map();
    byIndex.forEach((list, idx) => {
      list.sort((a, b) => a.ev.lane - b.ev.lane);
      const hasHeadline = dayHasPerimeterLabel(this.model.days[idx]);
      list.forEach((item, i) => {
        const key = `${item.ev.lane}:${item.ev.startIndex}:${item.ev.endIndex}:${item.role}`;
        let side;
        if (list.length > 1) {
          side = i % 2 === 0 ? "inside" : "outside";
        } else if (hasHeadline) {
          side = "inside";
        } else {
          side = "outside";
        }
        sides.set(key, side);
      });
    });
    return sides;
  }

  // Interval packing: lane 0 is the perimeter. Shorter events are placed first so
  // they claim the outer lanes; longer events get pushed inward whenever they
  // overlap (in days) with an event already sitting on an outer lane.
  _assignLanes() {
    const len = (e) => e.endIndex - e.startIndex;
    const evs = [...this.model.events].sort(
      (a, b) => len(a) - len(b) || a.startIndex - b.startIndex);
    const lanes = []; // each lane = list of occupied [s, e] intervals
    evs.forEach((ev) => {
      let lane = 0;
      for (;; lane++) {
        if (lane >= lanes.length) lanes.push([]);
        const clash = lanes[lane].some(
          (iv) => !(ev.endIndex < iv.s || ev.startIndex > iv.e));
        if (!clash) {
          lanes[lane].push({ s: ev.startIndex, e: ev.endIndex });
          ev.lane = lane;
          break;
        }
      }
    });
    this.laneCount = Math.max(1, lanes.length);
  }

  _computeTodayIndex() {
    const now = new Date();
    if (this.isHistory) {
      const y = Math.min(Math.max(now.getFullYear(), this.model.startYear), this.model.endYear);
      const found = this.model.days.find((x) => x.year === y);
      return found ? found.index : this.model.total - 1;
    }
    if (now.getFullYear() === this.model.year) {
      const mi = now.getMonth();
      const d = now.getDate();
      const found = this.model.days.find((x) => x.monthIndex === mi && x.date === d);
      if (found) return found.index;
    }
    return 0;
  }

  // ---- geometry ----
  _geom() {
    const W = this.W, H = this.H;
    const landscape = W > H;
    const radiusFrac = landscape ? CFG.landscapeRadiusFrac : CFG.radiusFrac;
    const Ro = H * radiusFrac;
    const h = this.isHistory;
    return {
      W, H, Ro,
      cx: W * CFG.outerXFrac - Ro * CFG.rDate,
      cy: H * CFG.centerYFrac,
      monthText: Ro * CFG.rMonthText,
      rangeIn: Ro * (h ? CFG.historyRangeIn : CFG.rRangeIn),
      rangeOut: Ro * (h ? CFG.historyRangeOut : CFG.rRangeOut),
      date: Ro * CFG.rDate,
      headlineGap: h ? CFG.historyHeadlineGap : CFG.holidayGap,
    };
  }

  resize() {
    const rect = this.svg.getBoundingClientRect();
    this.W = rect.width || 1200;
    this.H = rect.height || 800;
    this.svg.setAttribute("viewBox", `0 0 ${this.W} ${this.H}`);
    this._render();
    this._positionMoon();
    this._applyTransform();
  }

  // ---- build the (rebuildable) scene ----
  _buildStatic() {
    this.svg.innerHTML = "";
    // Defs for soft vignette behind the wheel.
    const defs = el("defs");
    const grad = el("radialGradient", { id: "hub-glow", cx: "0", cy: "0", r: "1",
      gradientUnits: "userSpaceOnUse" });
    grad.appendChild(el("stop", { offset: "0", "stop-color": "#11151c", "stop-opacity": "0" }));
    grad.appendChild(el("stop", { offset: "1", "stop-color": "#11151c", "stop-opacity": "0" }));
    defs.appendChild(grad);

    const moonGlowGrad = el("radialGradient", {
      id: "moon-super-glow", cx: "0.5", cy: "0.5", r: "0.5", gradientUnits: "objectBoundingBox",
    });
    moonGlowGrad.appendChild(el("stop", { offset: "0%", "stop-color": "#fff", "stop-opacity": "1" }));
    moonGlowGrad.appendChild(el("stop", { offset: "32%", "stop-color": "#f4f6f8", "stop-opacity": "0.52" }));
    moonGlowGrad.appendChild(el("stop", { offset: "68%", "stop-color": "#dfe6f0", "stop-opacity": "0.18" }));
    moonGlowGrad.appendChild(el("stop", { offset: "100%", "stop-color": "#fff", "stop-opacity": "0" }));
    defs.appendChild(moonGlowGrad);

    const moonGlowFilter = el("filter", {
      id: "moon-glow-blur", x: "-120%", y: "-120%", width: "340%", height: "340%",
      filterUnits: "objectBoundingBox",
    });
    this.moonGlowBlur = el("feGaussianBlur", { in: "SourceGraphic", stdDeviation: "0" });
    moonGlowFilter.appendChild(this.moonGlowBlur);
    defs.appendChild(moonGlowFilter);
    this.svg.appendChild(defs);

    this.wheel = el("g", { class: "wheel" });
    this.svg.appendChild(this.wheel);

    // Fixed overlay (does not rotate): the blue "now" reference line.
    this.overlay = el("g", { class: "overlay" });
    this.svg.appendChild(this.overlay);

    // Moon phase indicator (drawn procedurally so it animates smoothly as you spin).
    this.moon = el("g", { class: "moon" });
    this.moonTitle = el("title");
    this.moonGlow = el("circle", {
      cx: 0, cy: 0, r: 1, class: "moon-glow",
      fill: "url(#moon-super-glow)", filter: "url(#moon-glow-blur)",
    });
    this.moonDisc = el("circle", { cx: 0, cy: 0, r: 1, class: "moon-disc" });
    this.moonLit = el("path", { d: "", class: "moon-lit" });
    this.moonRing = el("circle", { cx: 0, cy: 0, r: 1, class: "moon-ring" });
    this.moon.appendChild(this.moonTitle);
    this.moon.appendChild(this.moonGlow);
    this.moon.appendChild(this.moonDisc);
    this.moon.appendChild(this.moonLit);
    this.moon.appendChild(this.moonRing);
    this.svg.appendChild(this.moon);

    // Zodiac (sun sign) indicator in a matching circle next to the moon.
    this.zodiac = el("g", { class: "zodiac" });
    this.zTitle = el("title");
    this.zRing = el("circle", { cx: 0, cy: 0, r: 1, class: "zodiac-ring" });
    this.zIcon = el("g", { class: "zodiac-icon" });
    this.zodiac.appendChild(this.zTitle);
    this.zodiac.appendChild(this.zRing);
    this.zodiac.appendChild(this.zIcon);
    this.svg.appendChild(this.zodiac);

    if (this.isHistory) {
      this.moon.style.display = "none";
      this.zodiac.style.display = "none";
    }
  }

  _positionMoon() {
    if (this.isHistory) return;
    const g = this._geom();
    this._moonR = 10; // 20px diameter
    const bandStep = this._bandStep || (g.rangeOut - g.rangeIn) / this.laneCount;
    const rMoon = g.rangeOut - 2 * bandStep; // between the 2nd (yellow) and 3rd (green) rings
    this.moon.setAttribute("transform", `translate(${g.cx + rMoon} ${g.cy})`);
    this.moonDisc.setAttribute("r", this._moonR);
    this.moonRing.setAttribute("r", this._moonR);

    // Zodiac circle sits just inward (toward centre) of the moon, same size.
    const zR = 10;
    const icon = 14; // icon size inside the 20px circle
    const sc = icon / 24;
    this.zRing.setAttribute("r", zR);
    this.zIcon.setAttribute("transform", `translate(${-icon / 2} ${-icon / 2}) scale(${sc})`);
    this.zodiac.setAttribute("transform", `translate(${g.cx + rMoon - 2 * zR - 4} ${g.cy})`);

    this._updateMoon();
    this._updateZodiac(this._lastDay);
  }

  _updateZodiac(day) {
    if (this.isHistory || !day || !this.zIcon) return;
    const sign = zodiacSign(day.monthIndex, day.date);
    if (sign !== this._zsign) {
      this._zsign = sign;
      this.zIcon.innerHTML = ZODIAC_ICONS[sign];
      this.zTitle.textContent = sign.charAt(0).toUpperCase() + sign.slice(1);
    }
  }

  _updateMoon() {
    if (this.isHistory || !this.moonLit || !this._moonR) return;
    const focusFloat = -this.rot / (this.degPerDay * this.dir);
    const t = this._yearStart + focusFloat * 86400000;
    const p = moonPhase(t);
    this.moonLit.setAttribute("d", moonLitPath(this._moonR, p));
    const glow = supermoonStrength(t, p, this.model.year);
    const R = this._moonR;
    if (glow > 0) {
      this.moonGlow.setAttribute("r", (R * (1.55 + glow * 1.15)).toFixed(2));
      this.moonGlow.style.opacity = (0.62 + glow * 0.38).toFixed(3);
      this.moonGlowBlur.setAttribute("stdDeviation", (3.5 + glow * 5.5).toFixed(1));
    } else {
      this.moonGlow.style.opacity = "0";
      this.moonGlowBlur.setAttribute("stdDeviation", "0");
    }
    const name = moonPhaseName(p);
    this.moonTitle.textContent = glow > 0.35 ? `${name} · Supermoon` : name;
  }

  _render() {
    const g = this._geom();
    this.wheel.innerHTML = "";
    this._pathId = 0;

    // Render order = z-order. The today segment + ticks sit at the very back.
    const gTicks = el("g", { class: "ticks" });
    const gMonths = el("g", { class: "months" });
    const gArcs = el("g", { class: "arcs" });
    const gLabels = el("g", { class: "labels" });
    this.wheel.appendChild(gTicks);
    this.wheel.appendChild(gMonths);
    this.wheel.appendChild(gArcs);
    this.wheel.appendChild(gLabels);

    const half = this.degPerDay / 2;

    // --- past background: a dark-grey wedge covering every day before today ---
    if (this.todayIndex > 0) {
      const p0 = this.aDeg(-0.5);
      const p1 = this.aDeg(this.todayIndex - 0.5);
      gTicks.appendChild(el("path", {
        d: wedgePath(g.date, Math.min(p0, p1), Math.max(p0, p1)),
        class: "past-seg",
      }));
    }

    // --- today highlight: a filled red wedge filling today's day slot ---
    const tA = this.aDeg(this.todayIndex);
    gTicks.appendChild(el("path", {
      d: wedgePath(g.date, tA - half, tA + half),
      class: "today-seg",
    }));

    // --- ticks (at the back): drawn BETWEEN days, dividing the day slots ---
    this.model.days.forEach((d) => {
      const deg = this.aDeg(d.index - 0.5); // boundary before this day
      const framesToday = d.index === this.todayIndex || d.index === this.todayIndex + 1;
      const isYearStart = this.isHistory
        ? d.isCenturyStart
        : d.monthIndex === 0 && d.date === 1;
      gTicks.appendChild(el("line", {
        x1: 0, y1: 0, x2: g.date, y2: 0,
        transform: `rotate(${deg})`,
        class: "spoke"
          + (d.isMonthStart ? (this.isHistory ? " decade" : " month") : "")
          + (isYearStart ? (this.isHistory ? " century" : " year") : "")
          + (framesToday ? " today" : ""),
      }));
    });

    // History calendar seam: thick marker between last year (2026) and first (1776).
    if (this.isHistory) {
      const seamDeg = this.aDeg(this.model.total - 0.5);
      gTicks.appendChild(el("line", {
        x1: 0, y1: 0, x2: g.date, y2: 0,
        transform: `rotate(${seamDeg})`,
        class: "spoke seam",
      }));
    }

    // Multi-day ring spacing (shared by events, the month band, and the moon).
    // History packs lanes tighter; annual calendar uses a wider cap.
    const stepCap = this.isHistory ? g.Ro * CFG.historyBandStepCap : g.Ro * 0.048;
    const bandStep = Math.min((g.rangeOut - g.rangeIn) / this.laneCount, stepCap);
    this._bandStep = bandStep;
    const evFs = Math.max(7, g.Ro * 0.0085);

    // --- decade/month names: faint, curved in the band between the rings ---
    if (this.isHistory) this._renderDecades(gMonths, g, g.rangeIn + bandStep * 0.35);
    else this._renderMonths(gMonths, g, g.rangeOut - bandStep);

    // --- multi-day / multiyear events: thin line + a dot at each end, label starts at the dot.
    //     Lane 0 hugs the perimeter; overlapping events stack inward. ---
    const eventLabelSides = this._buildEventLabelSides();

    this.model.events.forEach((ev) => {
      const rc = g.rangeOut - (ev.lane + 0.5) * bandStep;
      const color = TRACK_COLORS[ev.lane % TRACK_COLORS.length];
      const aS = this.aDeg(ev.startIndex);
      const aE = this.aDeg(ev.endIndex);

      if (ev.endIndex > ev.startIndex && this._eventSpansDecades(ev)) {
        this._renderMultidecadeEvent(gArcs, ev, rc, color, evFs, g);
        return;
      }

      if (ev.endIndex > ev.startIndex) {
        gArcs.appendChild(el("path", {
          d: uprightArcPath(rc, aS, aE), fill: "none", stroke: color,
          "stroke-width": Math.max(1, g.Ro * 0.0013), class: "range-line",
        }));
      }

      const ends = ev.endIndex > ev.startIndex
        ? [ev.startIndex, ev.endIndex] : [ev.startIndex];
      ends.forEach((idx) => {
        const sg = el("g", { transform: `rotate(${this.aDeg(idx)})` });
        sg.appendChild(el("circle", { cx: rc, cy: 0, r: CFG.dotR, fill: color, class: "range-dot" }));
        const role = ev.endIndex > ev.startIndex
          ? (idx === ev.startIndex ? "start" : "end")
          : "only";
        const sideKey = `${ev.lane}:${ev.startIndex}:${ev.endIndex}:${role}`;
        const inside = eventLabelSides.get(sideKey) === "inside";
        this._renderRangeEventLabel(
          sg, rc, inside, ev.label, color, evFs,
        );
        gArcs.appendChild(sg);
      });
    });

    // --- president terms (history only): inside track, drawn after events ---
    if (this.isHistory && this.model.presidentTerms) {
      this._renderPresidentTerms(gArcs, g, bandStep, evFs);
    }

    // --- friend birthdays: grey label + present icon on the blue event ring ---
    if (!this.isHistory) {
    const rcBirth = g.rangeOut - (BLUE_LANE + 0.5) * bandStep - Math.max(12, g.Ro * 0.014);
    const bdayFs = Math.max(7, g.Ro * 0.0085);
    const iconSize = Math.max(8, g.Ro * 0.009);

    this.model.days.forEach((d) => {
      if (!d.birthday) return;
      const sg = el("g", { transform: `rotate(${this.aDeg(d.index)})` });
      const labelX = rcBirth - iconSize - 6;
      const iconG = el("g", { class: "birthday-icon" });
      iconG.setAttribute(
        "transform",
        `translate(${labelX + 2} ${-iconSize / 2}) scale(${iconSize / 24})`,
      );
      iconG.innerHTML = PRESENT_ICON;
      sg.appendChild(iconG);
      const t = el("text", {
        x: labelX,
        y: 0,
        "font-size": bdayFs,
        "dominant-baseline": "middle",
        "text-anchor": "end",
        class: "birthday-label",
      });
      t.textContent = d.birthday;
      sg.appendChild(t);
      gArcs.appendChild(sg);
    });
    }

    // --- weekday letter + date numbers (outer edge) + holidays / year events ---
    const dateFs = this.isHistory
      ? Math.max(7, g.Ro * 0.0105)
      : Math.max(8, g.Ro * 0.0125);
    const holFs = Math.max(6.5, g.Ro * 0.0092);
    const wdFs = Math.max(6, g.Ro * 0.0075);

    this.model.days.forEach((d) => {
      const isToday = d.index === this.todayIndex;
      const isWeekend = d.dayLetter === "S";
      const isBankHoliday = d.isUsBankHoliday;
      const isPast = d.index < this.todayIndex;
      const sg = el("g", {
        transform: `rotate(${this.aDeg(d.index)})`,
        class: isPast ? "day past" : "day",
      });

      if (d.holidays.length || d.supermoon) {
        const yearX = g.date + (this.isHistory ? 3 : 5);
        const holX = yearX - g.headlineGap;
        const labelGap = Math.max(8, holFs * 0.55);
        let x = holX;
        const items = this.isHistory
          ? d.holidays.map((text) => ({ text, fs: holFs * 0.92, celestial: false }))
          : perimeterLabelItems(d, holFs);
        items.forEach((item, i) => {
          const nested = i > 0;
          const t = el("text", {
            x, y: 0,
            "font-size": item.fs,
            "dominant-baseline": "middle",
            "text-anchor": "end",
            class: "holiday"
              + (this.isHistory ? " history-event" : "")
              + (item.celestial ? " celestial" : "")
              + (item.supermoon ? " supermoon-label" : "")
              + (nested && item.celestial ? " nested" : "")
              + (isBankHoliday ? " bank-holiday" : ""),
          });
          t.textContent = item.text;
          sg.appendChild(t);
          x -= approxTextWidth(item.text, item.fs) + labelGap;
        });
      }

      if (!this.isHistory) {
      const wd = el("text", {
        x: g.date - 2, y: 0,
        "font-size": wdFs,
        "dominant-baseline": "middle",
        "text-anchor": "end",
        class: "weekday"
          + (isBankHoliday ? " bank-holiday" : isWeekend ? " weekend" : ""),
      });
      wd.textContent = d.dayLetter;
      sg.appendChild(wd);
      }

      const dateText = el("text", {
        x: g.date + (this.isHistory ? 3 : 5), y: 0,
        "font-size": dateFs,
        "dominant-baseline": "middle",
        "text-anchor": "start",
        class: "date-num"
          + (this.isHistory ? " history-year" : "")
          + (isToday ? " today" : isBankHoliday ? " bank-holiday" : isWeekend ? " weekend" : ""),
      });
      dateText.textContent = d.date;
      sg.appendChild(dateText);

      if (isToday) {
        sg.appendChild(el("circle", {
          cx: g.date + 5 + dateFs * 1.15 + 10, cy: 0, r: Math.max(3, g.Ro * 0.0035),
          class: "today-dot",
        }));
      }

      gLabels.appendChild(sg);
    });
  }

  _renderMonths(group, g, radius) {
    const half = this.degPerDay / 2;
    const byMonth = new Map();
    this.model.days.forEach((d) => {
      if (!byMonth.has(d.monthIndex)) byMonth.set(d.monthIndex, { first: d.index, last: d.index, name: d.month });
      else byMonth.get(d.monthIndex).last = d.index;
    });
    let i = 0;
    byMonth.forEach((m) => {
      // Always draw the label path with increasing screen angle so text stays upright.
      const e0 = this.aDeg(m.first) - half;
      const e1 = this.aDeg(m.last) + half;
      const a0 = Math.min(e0, e1), a1 = Math.max(e0, e1);
      const pid = `month-arc-${i++}`;
      group.appendChild(el("path", { id: pid, d: arcPath(radius, a0, a1), fill: "none" }));
      const label = el("text", {
        "font-size": Math.max(12, g.Ro * 0.026),
        class: "month-name",
      });
      const tp = el("textPath", { href: `#${pid}`, startOffset: "50%", "text-anchor": "middle" });
      tp.textContent = m.name;
      label.appendChild(tp);
      group.appendChild(label);
    });
  }

  _renderDecades(group, g, radius) {
    const half = this.degPerDay / 2;
    const byDecade = new Map();
    this.model.days.forEach((d) => {
      if (!byDecade.has(d.monthIndex)) {
        byDecade.set(d.monthIndex, { first: d.index, last: d.index, name: d.month });
      } else {
        byDecade.get(d.monthIndex).last = d.index;
      }
    });
    let i = 0;
    [...byDecade.entries()].sort((a, b) => a[0] - b[0]).forEach(([, m]) => {
      const e0 = this.aDeg(m.first) - half;
      const e1 = this.aDeg(m.last) + half;
      const a0 = Math.min(e0, e1);
      const a1 = Math.max(e0, e1);
      const pid = `decade-arc-${i++}`;
      group.appendChild(el("path", { id: pid, d: arcPath(radius, a0, a1), fill: "none" }));
      const label = el("text", {
        "font-size": Math.max(11, g.Ro * 0.022),
        class: "month-name decade-name",
      });
      const tp = el("textPath", { href: `#${pid}`, startOffset: "50%", "text-anchor": "middle" });
      tp.textContent = m.name;
      label.appendChild(tp);
      group.appendChild(label);
    });
  }

  _renderPresidentTerms(group, g, bandStep, evFs) {
    const rc = g.rangeIn + bandStep * CFG.historyPresidentLane;
    const half = this.degPerDay / 2;
    const terms = this.model.presidentTerms;

    terms.forEach((term) => {
      const a0 = this.aDeg(term.startIndex) - half;
      const a1 = this.aDeg(term.endIndex) + half;
      const color = partyColor(term.party);
      group.appendChild(el("path", {
        d: arcPath(rc, Math.min(a0, a1), Math.max(a0, a1)),
        fill: "none",
        stroke: color,
        "stroke-width": Math.max(1.2, g.Ro * 0.0015),
        class: "president-line",
      }));
    });

    for (let i = 0; i < terms.length - 1; i++) {
      const prev = terms[i];
      const next = terms[i + 1];
      let transitionAngle;
      if (prev.endIndex === next.startIndex) {
        transitionAngle = this.aDeg(next.startIndex);
      } else if (prev.endIndex + 1 === next.startIndex) {
        transitionAngle = this.aDeg(next.startIndex) - half;
      } else {
        continue;
      }
      this._renderPresidentTransition(
        group, rc, transitionAngle, prev, next, evFs,
        this.model.transitionOpponents?.get(`${next.name}:${next.startIndex}`),
      );
    }

    if (this.model.incumbentElections) {
      this.model.incumbentElections.forEach((election) => {
        this._renderIncumbentReelection(
          group, rc, this.aDeg(election.yearIndex) + half, election, evFs,
        );
      });
    }
  }

  _presidentDotGap(fs, insideText = "", outsideText = "") {
    const pad = 3;
    const minFromText = Math.max(
      measurePresidentText(insideText, fs),
      measurePresidentText(outsideText, fs),
    ) * 0.08;
    return CFG.dotR + pad + Math.max(fs * 0.65, minFromText);
  }

  _presidentText(x, y, fs, attrs, text) {
    const t = el("text", {
      x,
      y,
      "font-size": fs,
      "dominant-baseline": "middle",
      ...attrs,
    });
    t.textContent = text;
    return t;
  }

  _renderPresidentOpponentTag(sg, anchorX, y, fs, afterText, opponentTag) {
    if (!opponentTag) return;
    const tagGap = Math.max(2, fs * 0.12);
    const tag = opponentTag.startsWith(" ") ? opponentTag : ` ${opponentTag}`;
    sg.appendChild(this._presidentText(
      anchorX + measurePresidentText(afterText, fs) + tagGap,
      y,
      fs,
      { "text-anchor": "start", class: "president-label president-challenger" },
      tag,
    ));
  }

  _renderIncumbentReelection(group, rc, angle, election, evFs) {
    const sg = el("g", { transform: `rotate(${angle})` });
    const fs = evFs * 0.9;
    const gap = this._presidentDotGap(
      fs, election.challengerDisplayName, election.incumbentDisplayName,
    );
    const incColor = partyColor(election.party);

    sg.appendChild(el("circle", {
      cx: rc, cy: 0, r: CFG.dotR,
      fill: incColor,
      class: "president-dot president-reelection-dot",
    }));

    sg.appendChild(this._presidentText(
      rc - gap, 0, fs,
      { "text-anchor": "end", class: "president-label president-challenger" },
      election.challengerDisplayName,
    ));
    sg.appendChild(this._presidentText(
      rc + gap, 0, fs,
      { "text-anchor": "start", class: "president-label", fill: incColor },
      election.incumbentDisplayName,
    ));

    group.appendChild(sg);
  }

  _renderPresidentTransition(group, rc, angle, outgoing, incoming, evFs, opponentTag) {
    const sg = el("g", { transform: `rotate(${angle})` });
    const fs = evFs * 0.9;
    const gap = this._presidentDotGap(fs, outgoing.displayName, incoming.displayName);
    const outColor = partyColor(outgoing.party);
    const inColor = partyColor(incoming.party);

    sg.appendChild(el("circle", {
      cx: rc, cy: 0, r: CFG.dotR,
      fill: inColor,
      stroke: outColor,
      "stroke-width": 1.2,
      class: "president-dot",
    }));

    sg.appendChild(this._presidentText(
      rc - gap, 0, fs,
      { "text-anchor": "end", class: "president-label", fill: outColor },
      outgoing.displayName,
    ));

    const inX = rc + gap;
    sg.appendChild(this._presidentText(
      inX, 0, fs,
      { "text-anchor": "start", class: "president-label", fill: inColor },
      incoming.displayName,
    ));
    this._renderPresidentOpponentTag(sg, inX, 0, fs, incoming.displayName, opponentTag);

    group.appendChild(sg);
  }

  _applyTransform() {
    const g = this._geom();
    this.wheel.setAttribute("transform", `translate(${g.cx} ${g.cy}) rotate(${this.rot})`);
    this._drawOverlay();
    this._updateMoon();
    this._emitFocus();
  }

  _drawOverlay() {
    const g = this._geom();
    this.overlay.innerHTML = "";
    // Fixed horizontal "now" reference line from the wheel out to the right edge.
    const x2 = this.W + 40;
    const line = el("line", {
      x1: g.cx + g.monthText, y1: g.cy, x2, y2: g.cy, class: "now-line",
    });
    this.overlay.appendChild(line);
    const tick = el("circle", { cx: g.cx + g.date, cy: g.cy, r: 3.5, class: "now-dot" });
    this.overlay.appendChild(tick);
  }

  // ---- focus reporting ----
  focusIndex() {
    // Day i is focused when aDeg(i) + rot == 0  =>  i = -rot / (degPerDay * dir)
    const i = Math.round(-this.rot / (this.degPerDay * this.dir));
    return ((i % this.model.total) + this.model.total) % this.model.total;
  }

  _emitFocus() {
    const idx = this.focusIndex();
    const day = this.model.days[idx];
    if (day && day !== this._lastDay) {
      this._lastDay = day;
      this._updateZodiac(day);
      this.onFocusChange(day, idx === this.todayIndex);
    }
  }

  // ---- navigation ----
  _baseRotForIndex(index) {
    return -this.aDeg(index);
  }

  _nearestRot(targetBase) {
    const k = Math.round((this.rot - targetBase) / 360);
    return targetBase + k * 360;
  }

  goToIndex(index, animate = true) {
    const target = this._nearestRot(this._baseRotForIndex(index));
    if (!animate) {
      this.rot = target;
      this._applyTransform();
      return;
    }
    this._animateTo(target);
  }

  goToToday(animate = true) { this.goToIndex(this.todayIndex, animate); }

  step(delta) { this.goToIndex(this.focusIndex() + delta, true); }

  _animateTo(target) {
    cancelAnimationFrame(this._raf);
    const start = this.rot;
    const dur = Math.min(900, 200 + Math.abs(target - start) * 1.4);
    const t0 = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      this.rot = start + (target - start) * ease(t);
      this._applyTransform();
      if (t < 1) this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  // ---- input ----
  _attachEvents() {
    const g0 = () => this._geom();
    let lastAngle = 0;
    let lastT = 0;

    const angleAt = (clientX, clientY) => {
      const rect = this.svg.getBoundingClientRect();
      const g = g0();
      const x = clientX - rect.left - g.cx;
      const y = clientY - rect.top - g.cy;
      return (Math.atan2(y, x) * 180) / Math.PI;
    };

    const onDown = (e) => {
      this._dragging = true;
      cancelAnimationFrame(this._raf);
      this.vel = 0;
      lastAngle = angleAt(e.clientX, e.clientY);
      lastT = performance.now();
      this.svg.setPointerCapture(e.pointerId);
      this.svg.classList.add("grabbing");
    };
    const onMove = (e) => {
      if (!this._dragging) return;
      const a = angleAt(e.clientX, e.clientY);
      let delta = a - lastAngle;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      const now = performance.now();
      const dt = Math.max(1, now - lastT);
      this.vel = delta / dt;
      this.rot += delta;
      lastAngle = a;
      lastT = now;
      this._applyTransform();
    };
    const onUp = (e) => {
      if (!this._dragging) return;
      this._dragging = false;
      this.svg.classList.remove("grabbing");
      try { this.svg.releasePointerCapture(e.pointerId); } catch {}
      this._momentum();
    };

    this.svg.addEventListener("pointerdown", onDown);
    this.svg.addEventListener("pointermove", onMove);
    this.svg.addEventListener("pointerup", onUp);
    this.svg.addEventListener("pointercancel", onUp);

    this.svg.addEventListener("wheel", (e) => {
      e.preventDefault();
      cancelAnimationFrame(this._raf);
      const d = (Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX);
      this.rot += d * 0.12;
      this._applyTransform();
      clearTimeout(this._wheelSnap);
      this._wheelSnap = setTimeout(() => this.goToIndex(this.focusIndex()), 140);
    }, { passive: false });

    window.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); this.step(1); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); this.step(-1); }
      else if (e.key === "Home" || e.key.toLowerCase() === "t") { e.preventDefault(); this.goToToday(); }
    });
  }

  _momentum() {
    cancelAnimationFrame(this._raf);
    let v = this.vel; // deg/ms
    if (Math.abs(v) < 0.002) { this.goToIndex(this.focusIndex()); return; }
    let last = performance.now();
    const tick = (now) => {
      const dt = now - last; last = now;
      this.rot += v * dt;
      v *= Math.pow(0.93, dt / 16);
      this._applyTransform();
      if (Math.abs(v) > 0.003) this._raf = requestAnimationFrame(tick);
      else this.goToIndex(this.focusIndex());
    };
    this._raf = requestAnimationFrame(tick);
  }
}
