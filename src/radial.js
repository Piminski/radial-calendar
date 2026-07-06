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
  rDate: 1.05,          // day numbers, spokes, and shaded wedges (outer edge)
  // Pixel offsets:
  holidayGap: 22,       // gap inside the date numbers where weekday + event text sit
  dotR: 3.0,
  weekdayInset: 3,      // nudge weekday letters inward from the date-number gap center
  singleDayRangeInset: 6, // gap from weekday letters (3px inset + 3px weekday shift)
  // USA history: rings sit inward of headline text (8px gap from year labels).
  historyRangeIn: 0.52,
  historyRangeOut: 0.84,
  historyHeadlineGap: 8, // px between year number and headline (text-anchor end)
  historyPresidentLane: 6.0, // inside track: rangeIn + this * bandStep
  historyBandStepCap: 0.030, // tighter lane spacing than annual calendar
  viewZoomMin: 0.75,
  viewZoomMax: 2.5,
  viewPanXFrac: 0.45, // max horizontal pan as a fraction of Ro
  spinVelBlend: 0.28, // velocity smoothing while dragging (0–1)
  spinFriction: 0.992, // per ~16 ms frame — freewheel coast
  spinDetentVel: 0.00028,
  spinStopVel: 0.000018,
  spinSettleOmega: 0.015, // ms^-1 — final detent spring
  spinSettleDamping: 0.38, // < 1 gives a subtle spring wiggle
  spinSettleStopDeg: 0.002,
  spiralVisibleHalf: 102, // peephole: render days within this many degrees of focus
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
    this.onFocusChange = onFocusChange || (() => {});
    this.rot = 0;
    this.vel = 0; // deg/ms for momentum
    this.viewZoom = 1;
    this.viewPanX = 0;
    this.dir = 1; // winding direction: 1 = dates advance anticlockwise
    this._raf = null;
    this._dragging = false;
    this._coasting = false;
    this._spinLoopRunning = false;
    this._spinGeom = null;
    this._spinLast = 0;
    this._coastTarget = null;
    this._coastPlan = null;

    this.spiral = model.kind === "spiral" ? model : null;
    this.model = model;
    this.degPerDay = 360 / model.total;
    this.dir = 1;
    this._spiralRenderKey = null;
    if (this.spiral) {
      this._yearStart = Date.UTC(model.defaultYear, 0, 1, 12, 0, 0);
    } else {
      this._yearStart = Date.UTC(model.year, 0, 1, 12, 0, 0);
    }
    this.todayIndex = this._computeTodayIndex();

    this._assignLanes();
    this._buildStatic();
    this.resize();
    if (this.spiral) {
      const start = this.model.yearStartIndex[this.model.defaultYear] ?? 0;
      this.goToIndex(start, false);
      if (this.todayIndex >= 0) this.goToIndex(this.todayIndex, false);
    } else {
      this.goToIndex(this.todayIndex, false);
    }
    this._attachEvents();
  }

  get isHistory() { return this.model.kind === "history"; }

  get isSpiral() { return !!this.spiral; }

  _daysInYear(year) {
    return this.model.daysPerYear?.[year] ?? this.model.total;
  }

  _degHalf(index) {
    if (this.isSpiral) {
      const day = this.model.days[index];
      return (360 / this._daysInYear(day.year)) / 2;
    }
    return this.degPerDay / 2;
  }

  _spiralFocusAngle() {
    return -this.rot / this.dir;
  }

  _spiralScreenAngle(index) {
    return this.aDeg(index) + this.rot;
  }

  _spiralVisibleIndices() {
    const half = CFG.spiralVisibleHalf;
    const out = [];
    for (let i = 0; i < this.model.total; i++) {
      const sa = this._spiralScreenAngle(i);
      if (Math.abs(sa) <= half + this._degHalf(i)) out.push(i);
    }
    return out;
  }

  _spiralNeedsRerender() {
    const half = CFG.spiralVisibleHalf + 20;
    const fa = this._spiralFocusAngle();
    const key = `${Math.floor((fa - half) / 24)}:${Math.floor((fa + half) / 24)}`;
    if (key === this._spiralRenderKey) return false;
    this._spiralRenderKey = key;
    return true;
  }

  _clampRotSpiral() {
    if (!this.isSpiral) return;
    const minRot = -this.aDeg(this.model.total - 1) - this._degHalf(this.model.total - 1);
    const maxRot = this._degHalf(0);
    this.rot = Math.min(maxRot, Math.max(minRot, this.rot));
    if (this.rot <= minRot && this.vel < 0) this.vel = 0;
    if (this.rot >= maxRot && this.vel > 0) this.vel = 0;
  }

  _focusDayForMoon() {
    const idx = this.focusIndex();
    return this.model.days[idx];
  }

  _baseRo() {
    const landscape = this.W > this.H;
    const radiusFrac = landscape ? CFG.landscapeRadiusFrac : CFG.radiusFrac;
    return this.H * radiusFrac;
  }

  _clampPanX(panX, Ro) {
    const limit = Ro * CFG.viewPanXFrac;
    return Math.min(limit, Math.max(-limit, panX));
  }

  _setViewZoom(next) {
    const clamped = Math.min(CFG.viewZoomMax, Math.max(CFG.viewZoomMin, next));
    if (Math.abs(clamped - this.viewZoom) < 0.001) return;
    this.viewZoom = clamped;
    this.viewPanX = this._clampPanX(this.viewPanX, this._baseRo() * this.viewZoom);
    this._spinGeom = null;
    this._render();
    this._positionMoon();
    this._applyTransform();
  }

  resetView(animate = true) {
    this._haltSpin();
    this.vel = 0;
    this.viewZoom = 1;
    this.viewPanX = 0;
    this._render();
    this._positionMoon();
    this.goToToday(animate);
  }

  // Angle (deg) of a day index, honouring the winding direction.
  aDeg(i) {
    if (this.isSpiral) return this.model.days[i].angleDeg * this.dir;
    return i * this.degPerDay * this.dir;
  }

  _eventSpansDecades(ev) {
    if (!this.isHistory) return false;
    const y0 = this.model.startYear + ev.startIndex;
    const y1 = this.model.startYear + ev.endIndex;
    if (y1 - y0 < 10) return false;
    return Math.floor(y0 / 10) !== Math.floor(y1 / 10);
  }

  _renderRangeEventLabel(sg, rc, inside, label, color, fs, dy = 0) {
    const offset = CFG.dotR + 4;
    const t = el("text", {
      x: inside ? (rc - offset) : (rc + offset), y: dy,
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

  _eventLabelKey(ev, role) {
    return `${ev.lane}:${ev.startIndex}:${ev.endIndex}:${role}`;
  }

  // Resolve inside/outside per spoke (all lanes). Apply tangential dy stagger only
  // within the same lane — cross-lane stagger misaligns labels from their dots.
  _buildEventLabelLayout(g, bandStep, evFs) {
    const items = [];
    this.model.events.forEach((ev) => {
      if (ev.endIndex > ev.startIndex) {
        items.push({ ev, role: "start", idx: ev.startIndex });
        items.push({ ev, role: "end", idx: ev.endIndex });
      } else {
        items.push({ ev, role: "only", idx: ev.startIndex });
      }
    });

    const layouts = new Map();
    const tangentialRange = (inside, widthDeg) => (
      inside ? [-widthDeg, 0] : [0, widthDeg]
    );
    const rangesOverlap = (a, b) => a[0] < b[1] && b[0] < a[1];

    const byIndex = new Map();
    items.forEach((item) => {
      if (!byIndex.has(item.idx)) byIndex.set(item.idx, []);
      byIndex.get(item.idx).push(item);
    });

    byIndex.forEach((list, idx) => {
      list.sort((a, b) => a.ev.lane - b.ev.lane || a.role.localeCompare(b.role));
      const hasHeadline = dayHasPerimeterLabel(this.model.days[idx]);

      if (list.length === 1) {
        const item = list[0];
        layouts.set(this._eventLabelKey(item.ev, item.role), {
          inside: hasHeadline,
          dy: 0,
        });
        return;
      }

      const placed = [];
      list.forEach((item, i) => {
        const rc = g.rangeOut - (item.ev.lane + 0.5) * bandStep;
        const widthDeg = this._labelArcHalfDeg(item.ev.label, evFs, rc) * 2;

        const overlapsSide = (inside) => {
          const range = tangentialRange(inside, widthDeg);
          return placed.some((p) => rangesOverlap(range, p.range));
        };

        let inside = false;
        if (overlapsSide(false)) inside = true;
        if (overlapsSide(inside)) inside = i % 2 === 1;

        placed.push({ range: tangentialRange(inside, widthDeg) });
        layouts.set(this._eventLabelKey(item.ev, item.role), { inside, dy: 0 });
      });
    });

    const byLaneDay = new Map();
    items.forEach((item) => {
      const key = `${item.idx}:${item.ev.lane}`;
      if (!byLaneDay.has(key)) byLaneDay.set(key, []);
      byLaneDay.get(key).push(item);
    });

    byLaneDay.forEach((list) => {
      if (list.length < 2) return;
      list.sort((a, b) => a.role.localeCompare(b.role));
      list.forEach((item, i) => {
        const key = this._eventLabelKey(item.ev, item.role);
        const layout = layouts.get(key) ?? { inside: false, dy: 0 };
        layout.dy = (i - (list.length - 1) / 2) * evFs * 1.25;
        layouts.set(key, layout);
      });
    });

    return layouts;
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
    if (this.isSpiral) {
      const y = now.getFullYear();
      const mi = now.getMonth();
      const d = now.getDate();
      const found = this.model.days.find(
        (x) => x.year === y && x.monthIndex === mi && x.date === d,
      );
      if (found) return found.index;
      return -1;
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
    const Ro = this._baseRo() * this.viewZoom;
    const h = this.isHistory;
    return {
      W, H, Ro,
      cx: W * CFG.outerXFrac - Ro * CFG.rDate + this.viewPanX,
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
    this._spinGeom = null;
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
    this.nowLine = el("line", { class: "now-line" });
    this.nowDot = el("circle", { r: 3.5, class: "now-dot" });
    this.overlay.appendChild(this.nowLine);
    this.overlay.appendChild(this.nowDot);
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

    this.focusYearLabel = el("text", {
      class: "focus-year",
      "text-anchor": "end",
      "dominant-baseline": "middle",
    });
    this.svg.appendChild(this.focusYearLabel);

    if (this.isHistory) {
      this.moon.style.display = "none";
      this.zodiac.style.display = "none";
      this.focusYearLabel.style.display = "none";
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

    const zodiacX = g.cx + rMoon - 2 * zR - 4;
    const yearFs = Math.max(7, g.Ro * 0.0085);
    this.focusYearLabel.setAttribute("font-size", yearFs);
    this.focusYearLabel.setAttribute("x", zodiacX - zR - 6);
    this.focusYearLabel.setAttribute("y", g.cy);

    this._updateMoon();
    this._updateZodiac(this._lastDay);
    this._updateFocusYear(this._lastDay || this.model.days[this.focusIndex()]);
  }

  _focusYear(day) {
    if (!day) return this.model.year;
    return day.year ?? this.model.year;
  }

  _updateFocusYear(day) {
    if (this.isHistory || !this.focusYearLabel) return;
    const year = this._focusYear(day);
    if (year === this._focusYearShown) return;
    this._focusYearShown = year;
    this.focusYearLabel.textContent = String(year);
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
    let t;
    let year = this.model.year;
    if (this.isSpiral) {
      const day = this._focusDayForMoon();
      if (!day) return;
      year = day.year;
      const fa = this._spiralFocusAngle();
      const degPerDayY = 360 / this._daysInYear(day.year);
      const frac = Math.max(0, Math.min(1, (fa - day.angleDeg) / degPerDayY + 0.5));
      const dayStart = Date.UTC(day.year, day.monthIndex, day.date, 12, 0, 0);
      t = dayStart + (frac - 0.5) * 86400000;
    } else {
      const focusFloat = -this.rot / (this.degPerDay * this.dir);
      t = this._yearStart + focusFloat * 86400000;
    }
    const p = moonPhase(t);
    this.moonLit.setAttribute("d", moonLitPath(this._moonR, p));
    const glow = supermoonStrength(t, p, year);
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

    const gTicks = el("g", { class: "ticks" });
    const gMonths = el("g", { class: "months" });
    const gArcs = el("g", { class: "arcs" });
    const gLabels = el("g", { class: "labels" });
    this.wheel.appendChild(gTicks);
    this.wheel.appendChild(gMonths);
    this.wheel.appendChild(gArcs);
    this.wheel.appendChild(gLabels);

    const visibleSet = this.isSpiral ? new Set(this._spiralVisibleIndices()) : null;
    const showDay = (i) => !visibleSet || visibleSet.has(i);

    const halfAt = (idx) => this._degHalf(idx);
    const half = this.isSpiral ? null : this.degPerDay / 2;

    if (!this.isSpiral && this.todayIndex > 0) {
      const p0 = this.aDeg(-0.5);
      const p1 = this.aDeg(this.todayIndex - 0.5);
      gTicks.appendChild(el("path", {
        d: wedgePath(g.date, Math.min(p0, p1), Math.max(p0, p1)),
        class: "past-seg",
      }));
    }

    if (this.isSpiral && this.todayIndex >= 0 && showDay(this.todayIndex)) {
      const tA = this.aDeg(this.todayIndex);
      const tHalf = halfAt(this.todayIndex);
      gTicks.appendChild(el("path", {
        d: wedgePath(g.date, tA - tHalf, tA + tHalf),
        class: "today-seg",
      }));
    } else if (!this.isSpiral && this.todayIndex >= 0) {
      const tA = this.aDeg(this.todayIndex);
      gTicks.appendChild(el("path", {
        d: wedgePath(g.date, tA - half, tA + half),
        class: "today-seg",
      }));
    }

    this.model.days.forEach((d) => {
      if (!showDay(d.index)) return;
      const deg = this.isSpiral
        ? this.aDeg(d.index) - halfAt(d.index)
        : this.aDeg(d.index - 0.5);
      const framesToday = this.todayIndex >= 0
        && (d.index === this.todayIndex || d.index === this.todayIndex + 1);
      const isYearStart = this.isHistory
        ? d.isCenturyStart
        : this.isSpiral
          ? d.isYearStart
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

    if (this.isHistory) {
      const seamDeg = this.aDeg(this.model.total - 0.5);
      gTicks.appendChild(el("line", {
        x1: 0, y1: 0, x2: g.date, y2: 0,
        transform: `rotate(${seamDeg})`,
        class: "spoke seam",
      }));
    }

    const stepCap = this.isHistory ? g.Ro * CFG.historyBandStepCap : g.Ro * 0.048;
    const bandStep = Math.min((g.rangeOut - g.rangeIn) / this.laneCount, stepCap);
    this._bandStep = bandStep;
    const evFs = Math.max(7, g.Ro * 0.0085);

    if (this.isHistory) this._renderDecades(gMonths, g, g.rangeIn + bandStep * 0.35);
    else if (this.isSpiral) this._renderMonths(gMonths, g, g.rangeOut - bandStep, visibleSet);
    else this._renderMonths(gMonths, g, g.rangeOut - bandStep);

    const eventLabelLayouts = this._buildEventLabelLayout(g, bandStep, evFs);
    const visHalf = this.isSpiral ? CFG.spiralVisibleHalf : null;

    this.model.events.forEach((ev) => {
      if (this.isSpiral) {
        const aS = this._spiralScreenAngle(ev.startIndex);
        const aE = this._spiralScreenAngle(ev.endIndex);
        const lo = Math.min(aS, aE) - halfAt(ev.startIndex);
        const hi = Math.max(aS, aE) + halfAt(ev.endIndex);
        if (hi < -visHalf || lo > visHalf) return;
      }

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
        if (this.isSpiral && !showDay(idx)) return;
        const isSingleDay = ev.endIndex === ev.startIndex;
        const rcEvent = rc - (isSingleDay && !this.isHistory ? CFG.singleDayRangeInset : 0);
        const sg = el("g", { transform: `rotate(${this.aDeg(idx)})` });
        sg.appendChild(el("circle", { cx: rcEvent, cy: 0, r: CFG.dotR, fill: color, class: "range-dot" }));
        const role = ev.endIndex > ev.startIndex
          ? (idx === ev.startIndex ? "start" : "end")
          : "only";
        const layout = eventLabelLayouts.get(this._eventLabelKey(ev, role))
          ?? { inside: false, dy: 0 };
        this._renderRangeEventLabel(
          sg, rcEvent, layout.inside, ev.label, color, evFs, layout.dy,
        );
        gArcs.appendChild(sg);
      });
    });

    if (this.isHistory && this.model.presidentTerms) {
      this._renderPresidentTerms(gArcs, g, bandStep, evFs);
    }

    if (!this.isHistory) {
    const rcBirth = g.rangeOut - (BLUE_LANE + 0.5) * bandStep - Math.max(12, g.Ro * 0.014);
    const bdayFs = Math.max(7, g.Ro * 0.0085);
    const iconSize = Math.max(8, g.Ro * 0.009);

    this.model.days.forEach((d) => {
      if (!d.birthday || !showDay(d.index)) return;
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
      if (!showDay(d.index)) return;
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
      const dateX = g.date + 5;
      const wd = el("text", {
        x: dateX - g.headlineGap / 2 - CFG.weekdayInset, y: 0,
        "font-size": wdFs,
        "dominant-baseline": "middle",
        "text-anchor": "middle",
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
      dateText.textContent = (this.isSpiral && d.isYearStart) ? String(d.year) : d.date;
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

  _renderMonths(group, g, radius, visibleSet = null) {
    const byMonth = new Map();
    this.model.days.forEach((d) => {
      if (visibleSet && !visibleSet.has(d.index)) return;
      const key = this.isSpiral ? `${d.year}-${d.monthIndex}` : d.monthIndex;
      if (!byMonth.has(key)) byMonth.set(key, { first: d.index, last: d.index, name: d.month });
      else byMonth.get(key).last = d.index;
    });
    let i = 0;
    byMonth.forEach((m) => {
      const e0 = this.aDeg(m.first) - this._degHalf(m.first);
      const e1 = this.aDeg(m.last) + this._degHalf(m.last);
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

    const firstTerm = terms[0];
    if (firstTerm) {
      this._renderPresidentTermStart(
        group, rc, this.aDeg(firstTerm.startIndex) - half, firstTerm, evFs,
      );
    }

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

  _renderPresidentTermStart(group, rc, angle, president, evFs) {
    const sg = el("g", { transform: `rotate(${angle})` });
    const fs = evFs * 0.9;
    const gap = this._presidentDotGap(fs, "", president.displayName);
    const color = partyColor(president.party);

    sg.appendChild(el("circle", {
      cx: rc, cy: 0, r: CFG.dotR,
      fill: color,
      class: "president-dot",
    }));

    sg.appendChild(this._presidentText(
      rc + gap, 0, fs,
      { "text-anchor": "start", class: "president-label", fill: color },
      president.displayName,
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
    this._spinGeom = g;
    if (this.isSpiral && this._spiralNeedsRerender()) this._render();
    this.wheel.setAttribute("transform", `translate(${g.cx} ${g.cy}) rotate(${this.rot})`);
    this._positionOverlay(g);
    this._updateMoon();
    this._emitFocus();
  }

  _applySpinFrame() {
    if (!this._spinGeom) this._spinGeom = this._geom();
    const g = this._spinGeom;
    if (this.isSpiral) {
      this._clampRotSpiral();
      if (this._spiralNeedsRerender()) this._render();
    }
    this.wheel.setAttribute("transform", `translate(${g.cx} ${g.cy}) rotate(${this.rot})`);
    this._updateMoon();
    this._emitFocus();
  }

  _haltSpin() {
    cancelAnimationFrame(this._raf);
    this._raf = null;
    this._coasting = false;
    this._spinLoopRunning = false;
    this._coastTarget = null;
    this._coastPlan = null;
  }

  _startSpinLoop() {
    if (this._spinLoopRunning) return;
    this._spinLoopRunning = true;
    this._spinLast = performance.now();
    if (!this._spinGeom) this._spinGeom = this._geom();

    const tick = (now) => {
      if (!this._dragging && !this._coasting && !this._coastPlan) {
        this._spinLoopRunning = false;
        this._raf = null;
        return;
      }

      const dt = Math.min(32, Math.max(1, now - this._spinLast));
      this._spinLast = now;

      if (this._coastPlan && !this._dragging) {
        this._stepSettle(dt);
        if (
          Math.abs(this._coastPlan.target - this.rot) < CFG.spinSettleStopDeg
          && Math.abs(this.vel) < CFG.spinStopVel
        ) {
          this._finishCoast();
          return;
        }
      } else if (this._coasting && !this._dragging) {
        this.vel *= Math.pow(CFG.spinFriction, dt / 16);
        this.rot += this.vel * dt;
        if (this.isSpiral) this._clampRotSpiral();
        if (Math.abs(this.vel) < CFG.spinDetentVel) {
          this._beginSettle();
        }
      }

      this._applySpinFrame();
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  _finishCoast() {
    if (this.isSpiral) this._clampRotSpiral();
    if (this._coastPlan) this.rot = this._targetRotNear(this.rot);
    else if (this._coasting) this.rot = this._targetRotNear(this.rot);
    else if (this._coastTarget != null) this.rot = this._coastTarget;
    this.vel = 0;
    this._coasting = false;
    this._spinLoopRunning = false;
    this._coastTarget = null;
    this._coastPlan = null;
    this._raf = null;
    this._applyTransform();
  }

  _beginCoast() {
    this._dragging = false;
    this._coastPlan = null;
    this._coastTarget = null;
    this._coasting = true;
    this._startSpinLoop();
  }

  _beginSettle() {
    if (this.isSpiral) this._clampRotSpiral();
    const target = this._targetRotNear(this.rot);
    this._coasting = false;
    this._coastTarget = target;
    this._coastPlan = { target };
  }

  _stepSettle(dt) {
    if (this.isSpiral) this._clampRotSpiral();
    const target = this.isSpiral ? this._targetRotNear(this.rot) : this._coastPlan.target;
    const omega = CFG.spinSettleOmega;
    const damping = 2 * CFG.spinSettleDamping * omega;
    const error = target - this.rot;
    const accel = error * omega * omega - this.vel * damping;
    this.vel += accel * dt;
    this.rot += this.vel * dt;
    if (this.isSpiral) this._clampRotSpiral();
  }

  _spiralFocusIndex() {
    const fa = this._spiralFocusAngle();
    const days = this.model.days;
    let lo = 0;
    let hi = days.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (days[mid].angleDeg < fa) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) {
      const d0 = Math.abs(days[lo - 1].angleDeg - fa);
      const d1 = Math.abs(days[lo].angleDeg - fa);
      if (d0 < d1) return lo - 1;
    }
    return lo;
  }

  _targetRotNear(rot) {
    if (this.isSpiral) {
      const saved = this.rot;
      this.rot = rot;
      const idx = this._spiralFocusIndex();
      this.rot = saved;
      return this._baseRotForIndex(idx);
    }
    const idx = Math.round(-rot / (this.degPerDay * this.dir));
    const wrapped = ((idx % this.model.total) + this.model.total) % this.model.total;
    const targetBase = this._baseRotForIndex(wrapped);
    const k = Math.round((rot - targetBase) / 360);
    return targetBase + k * 360;
  }

  _positionOverlay(g = this._geom()) {
    const x2 = this.W + 40;
    this.nowLine.setAttribute("x1", g.cx);
    this.nowLine.setAttribute("y1", g.cy);
    this.nowLine.setAttribute("x2", x2);
    this.nowLine.setAttribute("y2", g.cy);
    this.nowDot.setAttribute("cx", g.cx + g.date);
    this.nowDot.setAttribute("cy", g.cy);
  }

  _drawOverlay() {
    this._positionOverlay();
  }

  // ---- focus reporting ----
  focusIndex() {
    if (this.isSpiral) return this._spiralFocusIndex();
    const i = Math.round(-this.rot / (this.degPerDay * this.dir));
    return ((i % this.model.total) + this.model.total) % this.model.total;
  }

  _emitFocus() {
    const idx = this.focusIndex();
    const day = this.model.days[idx];
    if (day && day !== this._lastDay) {
      this._lastDay = day;
      this._updateZodiac(day);
      this._updateFocusYear(day);
      this.onFocusChange(day, idx === this.todayIndex);
    }
  }

  // ---- navigation ----
  _baseRotForIndex(index) {
    return -this.aDeg(index);
  }

  _nearestRot(targetBase) {
    if (this.isSpiral) return targetBase;
    const k = Math.round((this.rot - targetBase) / 360);
    return targetBase + k * 360;
  }

  goToIndex(index, animate = true) {
    if (this.isSpiral) {
      index = Math.max(0, Math.min(this.model.total - 1, index));
    }
    const target = this._nearestRot(this._baseRotForIndex(index));
    if (!animate) {
      this.rot = target;
      this._applyTransform();
      return;
    }
    this._animateTo(target);
  }

  goToToday(animate = true) {
    if (this.todayIndex >= 0) this.goToIndex(this.todayIndex, animate);
  }

  step(delta) {
    if (!this.isSpiral) {
      this.goToIndex(this.focusIndex() + delta, true);
      return;
    }
    const next = Math.max(0, Math.min(this.model.total - 1, this.focusIndex() + delta));
    this.goToIndex(next, true);
  }

  _animateTo(target) {
    this._haltSpin();
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
    const pointers = new Map();
    let lastAngle = 0;
    let lastPanX = 0;
    let lastT = 0;
    let mode = "idle"; // idle | spin | pan | pinch
    let pinchStart = null;
    let lastTap = null;
    let spinMoved = false;
    let spinVelInit = true;
    let lastInstantVel = 0;
    const velSamples = [];
    let usedPinch = false;
    const TAP_MAX_MS = 320;
    const TAP_MAX_DIST = 32;

    const pointerList = () => [...pointers.values()];

    const pinchMetrics = () => {
      const pts = pointerList();
      if (pts.length < 2) return null;
      const [a, b] = pts;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      return {
        dist: Math.hypot(dx, dy) || 1,
        midX: (a.x + b.x) / 2,
      };
    };

    const angleAt = (clientX, clientY) => {
      const rect = this.svg.getBoundingClientRect();
      const g = g0();
      const x = clientX - rect.left - g.cx;
      const y = clientY - rect.top - g.cy;
      return (Math.atan2(y, x) * 180) / Math.PI;
    };

    const beginPinch = () => {
      const m = pinchMetrics();
      if (!m) return;
      mode = "pinch";
      usedPinch = true;
      this._dragging = false;
      this._haltSpin();
      this.vel = 0;
      pinchStart = {
        dist: m.dist,
        zoom: this.viewZoom,
        panX: this.viewPanX,
        midX: m.midX,
      };
      this.svg.classList.add("grabbing");
    };

    const applyPinch = () => {
      if (!pinchStart) return;
      const m = pinchMetrics();
      if (!m) return;
      const nextZoom = Math.min(
        CFG.viewZoomMax,
        Math.max(CFG.viewZoomMin, pinchStart.zoom * (m.dist / pinchStart.dist)),
      );
      const Ro = this._baseRo() * nextZoom;
      const nextPanX = this._clampPanX(pinchStart.panX + (m.midX - pinchStart.midX), Ro);
      const zoomChanged = Math.abs(nextZoom - this.viewZoom) > 0.001;
      const panChanged = Math.abs(nextPanX - this.viewPanX) > 0.5;
      this.viewZoom = nextZoom;
      this.viewPanX = nextPanX;
      if (!zoomChanged && !panChanged) return;
      if (zoomChanged) {
        this._render();
        this._positionMoon();
      }
      this._applyTransform();
    };

    const maybeDoubleTap = (e) => {
      if (usedPinch || spinMoved || e.pointerType === "mouse") return;
      const now = performance.now();
      const x = e.clientX;
      const y = e.clientY;
      if (
        lastTap
        && now - lastTap.t < TAP_MAX_MS
        && Math.hypot(x - lastTap.x, y - lastTap.y) < TAP_MAX_DIST
      ) {
        lastTap = null;
        this.resetView(true);
        return;
      }
      lastTap = { t: now, x, y };
    };

    const onDown = (e) => {
      if (e.button !== 0 && e.button !== 1) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size >= 2) {
        try { this.svg.setPointerCapture(e.pointerId); } catch {}
        beginPinch();
        return;
      }

      cancelAnimationFrame(this._raf);
      this._raf = null;
      this._coasting = false;
      this._spinLoopRunning = false;
      this.vel = 0;
      spinMoved = false;
      spinVelInit = true;
      velSamples.length = 0;
      usedPinch = false;
      mode = (e.shiftKey || e.button === 1) ? "pan" : "spin";
      if (mode === "pan") {
        this._dragging = false;
        lastPanX = e.clientX;
      } else {
        this._dragging = true;
        lastAngle = angleAt(e.clientX, e.clientY);
        this._startSpinLoop();
      }
      lastT = performance.now();
      try { this.svg.setPointerCapture(e.pointerId); } catch {}
      this.svg.classList.add("grabbing");
    };

    const onMove = (e) => {
      if (pointers.has(e.pointerId)) {
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      if (pointers.size >= 2) {
        if (mode !== "pinch") beginPinch();
        applyPinch();
        return;
      }

      if (mode === "pan") {
        const dx = e.clientX - lastPanX;
        lastPanX = e.clientX;
        this.viewPanX = this._clampPanX(this.viewPanX + dx, g0().Ro);
        this._spinGeom = null;
        this._applyTransform();
        return;
      }

      if (!this._dragging || mode !== "spin") return;
      const a = angleAt(e.clientX, e.clientY);
      let delta = a - lastAngle;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      if (Math.abs(delta) > 0.05) spinMoved = true;
      const now = performance.now();
      const dt = Math.max(1, now - lastT);
      const instantVel = delta / dt;
      lastInstantVel = instantVel;
      velSamples.push(instantVel);
      if (velSamples.length > 4) velSamples.shift();
      if (spinVelInit) {
        this.vel = instantVel;
        spinVelInit = false;
      } else {
        this.vel = this.vel * (1 - CFG.spinVelBlend) + instantVel * CFG.spinVelBlend;
      }
      this.rot += delta;
      lastAngle = a;
      lastT = now;
      this._applyTransform();
    };

    const onUp = (e) => {
      const wasPan = mode === "pan";
      const wasSpin = this._dragging && mode === "spin";
      const wasPinch = mode === "pinch";
      pointers.delete(e.pointerId);
      try { this.svg.releasePointerCapture(e.pointerId); } catch {}

      if (pointers.size >= 2) {
        pinchStart = null;
        beginPinch();
        return;
      }

      if (pointers.size === 1 && wasPinch) {
        mode = "idle";
        pinchStart = null;
        this._dragging = false;
        this.svg.classList.remove("grabbing");
        return;
      }

      if (pointers.size === 0) {
        this.svg.classList.remove("grabbing");
        mode = "idle";
        pinchStart = null;
        if (wasSpin && spinMoved) {
          const n = velSamples.length;
          if (n >= 2) {
            this.vel = velSamples[n - 1] * 0.65 + velSamples[n - 2] * 0.35;
          } else {
            this.vel = lastInstantVel;
          }
          velSamples.length = 0;
          this._beginCoast();
        } else {
          this._dragging = false;
          this._haltSpin();
          if (wasPan || wasPinch) cancelAnimationFrame(this._raf);
          else maybeDoubleTap(e);
        }
        return;
      }

      this._dragging = false;
      mode = "idle";
      this.svg.classList.remove("grabbing");
    };

    this.svg.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    this.svg.addEventListener("dblclick", (e) => {
      if (e.pointerType === "touch") return;
      e.preventDefault();
      this.resetView(true);
    });

    this.svg.addEventListener("wheel", (e) => {
      e.preventDefault();
      this._haltSpin();
      if (e.ctrlKey || e.metaKey) {
        const d = (Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX);
        this._setViewZoom(this.viewZoom * (1 - d * 0.002));
        return;
      }
      const d = (Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX);
      this.vel = d * 0.0042;
      this.rot += d * 0.14;
      if (this.isSpiral) this._clampRotSpiral();
      this._applyTransform();
      clearTimeout(this._wheelSnap);
      this._wheelSnap = setTimeout(() => this._beginCoast(), 90);
    }, { passive: false });

    window.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); this.step(1); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); this.step(-1); }
      else if (e.key === "Home" || e.key.toLowerCase() === "t") { e.preventDefault(); this.goToToday(); }
    });
  }
}
