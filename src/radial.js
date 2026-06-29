// Radial calendar renderer + spin interaction (SVG based).

const SVGNS = "http://www.w3.org/2000/svg";

// Palette for the multi-day range tracks (A..E, inner -> outer).
const TRACK_COLORS = [
  "#e0654a", // A - warm red/orange
  "#e0a23c", // B - amber
  "#5aa469", // C - green
  "#4f93c4", // D - blue
  "#9b6bc4", // E - violet
];

const CFG = {
  // The outermost ring (the date numbers) lands at this fraction of width;
  // the circle center sits just off-screen to the left.
  outerXFrac: 0.92,
  centerYFrac: 0.5,
  radiusFrac: 1.5,      // Ro = viewport height * radiusFrac
  // Radii as multiples of Ro (inner -> outer):
  rMonthText: 0.6,      // month name curved inside the ring (behind)
  rRangeIn: 0.42,       // multi-day event tracks, distributed across the ring
  rRangeOut: 0.90,
  rDate: 1.0,           // day numbers sit at the outermost edge
  // Pixel offsets:
  holidayGap: 18,       // gap inside the date numbers where event text ends
  dotR: 3.0,
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

function arcPath(r, a0, a1) {
  const [x0, y0] = polar(r, a0);
  const [x1, y1] = polar(r, a1);
  const large = Math.abs(a1 - a0) % 360 > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

// Filled wedge (pie slice) from the center out to radius r, spanning a0->a1.
function wedgePath(r, a0, a1) {
  const [x0, y0] = polar(r, a0);
  const [x1, y1] = polar(r, a1);
  const large = Math.abs(a1 - a0) % 360 > 180 ? 1 : 0;
  return `M 0 0 L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
}

export class RadialCalendar {
  constructor(svg, model, { onFocusChange } = {}) {
    this.svg = svg;
    this.model = model;
    this.onFocusChange = onFocusChange || (() => {});
    this.rot = 0;
    this.vel = 0; // deg/ms for momentum
    this.degPerDay = 360 / model.total;
    this.dir = -1; // winding direction: -1 = dates advance clockwise
    this.todayIndex = this._computeTodayIndex();
    this._raf = null;
    this._dragging = false;

    this._assignLanes();
    this._buildStatic();
    this.resize();
    this.goToIndex(this.todayIndex, false);
    this._attachEvents();
  }

  // Angle (deg) of a day index, honouring the winding direction.
  aDeg(i) { return i * this.degPerDay * this.dir; }

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
    const Ro = H * CFG.radiusFrac;
    return {
      W, H, Ro,
      cx: W * CFG.outerXFrac - Ro * CFG.rDate,
      cy: H * CFG.centerYFrac,
      monthText: Ro * CFG.rMonthText,
      rangeIn: Ro * CFG.rRangeIn,
      rangeOut: Ro * CFG.rRangeOut,
      date: Ro * CFG.rDate,
    };
  }

  resize() {
    const rect = this.svg.getBoundingClientRect();
    this.W = rect.width || 1200;
    this.H = rect.height || 800;
    this.svg.setAttribute("viewBox", `0 0 ${this.W} ${this.H}`);
    this._render();
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
    this.svg.appendChild(defs);

    this.wheel = el("g", { class: "wheel" });
    this.svg.appendChild(this.wheel);

    // Fixed overlay (does not rotate): the red "today / now" reference line.
    this.overlay = el("g", { class: "overlay" });
    this.svg.appendChild(this.overlay);
  }

  _render() {
    const g = this._geom();
    this.wheel.innerHTML = "";

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
      gTicks.appendChild(el("line", {
        x1: 0, y1: 0, x2: g.date, y2: 0,
        transform: `rotate(${deg})`,
        class: "spoke" + (d.isMonthStart ? " month" : ""),
      }));
    });

    // --- month names: faint, curved inside the ring, behind everything ---
    this._renderMonths(gMonths, g);

    // --- multi-day events: thin line + a dot at each end, label starts at the dot.
    //     Lane 0 hugs the perimeter; overlapping events stack inward. ---
    const bandStep = (g.rangeOut - g.rangeIn) / this.laneCount;
    const evFs = Math.max(7, g.Ro * 0.0085);

    this.model.events.forEach((ev) => {
      const rc = g.rangeOut - (ev.lane + 0.5) * bandStep;
      const color = TRACK_COLORS[ev.lane % TRACK_COLORS.length];
      const aS = this.aDeg(ev.startIndex);
      const aE = this.aDeg(ev.endIndex);

      if (ev.endIndex > ev.startIndex) {
        gArcs.appendChild(el("path", {
          d: arcPath(rc, Math.min(aS, aE), Math.max(aS, aE)), fill: "none", stroke: color,
          "stroke-width": Math.max(1, g.Ro * 0.0013), class: "range-line",
        }));
      }

      const ends = ev.endIndex > ev.startIndex
        ? [ev.startIndex, ev.endIndex] : [ev.startIndex];
      ends.forEach((idx) => {
        const sg = el("g", { transform: `rotate(${this.aDeg(idx)})` });
        sg.appendChild(el("circle", { cx: rc, cy: 0, r: CFG.dotR, fill: color, class: "range-dot" }));
        const t = el("text", {
          x: rc + CFG.dotR + 4, y: 0,
          "font-size": evFs,
          "dominant-baseline": "middle",
          "text-anchor": "start",
          class: "range-label",
          fill: color,
        });
        t.textContent = ev.label;
        sg.appendChild(t);
        gArcs.appendChild(sg);
      });
    });

    // --- weekday letter + date numbers (outer edge) + holidays ---
    const dateFs = Math.max(8, g.Ro * 0.0125);
    const holFs = Math.max(6.5, g.Ro * 0.0092);
    const wdFs = Math.max(6, g.Ro * 0.0075);

    this.model.days.forEach((d) => {
      const isToday = d.index === this.todayIndex;
      const isWeekend = d.dayLetter === "S";
      const isPast = d.index < this.todayIndex;
      const sg = el("g", {
        transform: `rotate(${this.aDeg(d.index)})`,
        class: isPast ? "day past" : "day",
      });

      if (d.holidays.length) {
        const ht = el("text", {
          x: g.date - CFG.holidayGap, y: 0,
          "font-size": holFs,
          "dominant-baseline": "middle",
          "text-anchor": "end",
          class: "holiday",
        });
        ht.textContent = d.holidays.join("  ·  ");
        sg.appendChild(ht);
      }

      const wd = el("text", {
        x: g.date - 2, y: 0,
        "font-size": wdFs,
        "dominant-baseline": "middle",
        "text-anchor": "end",
        class: "weekday" + (isWeekend ? " weekend" : ""),
      });
      wd.textContent = d.dayLetter;
      sg.appendChild(wd);

      const dateText = el("text", {
        x: g.date + 5, y: 0,
        "font-size": dateFs,
        "dominant-baseline": "middle",
        "text-anchor": "start",
        class: "date-num" + (isToday ? " today" : (isWeekend ? " weekend" : "")),
      });
      dateText.textContent = d.date;
      sg.appendChild(dateText);

      if (isToday) {
        const tf = el("text", {
          x: g.date + g.Ro * 0.028, y: 0,
          "font-size": Math.max(11, g.Ro * 0.014),
          "dominant-baseline": "middle",
          "text-anchor": "start",
          class: "today-flag",
        });
        tf.textContent = "● TODAY";
        sg.appendChild(tf);
      }

      gLabels.appendChild(sg);
    });
  }

  _renderMonths(group, g) {
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
      group.appendChild(el("path", { id: pid, d: arcPath(g.monthText, a0, a1), fill: "none" }));
      const label = el("text", {
        "font-size": Math.max(13, g.Ro * 0.032),
        class: "month-name",
      });
      const tp = el("textPath", { href: `#${pid}`, startOffset: "50%", "text-anchor": "middle" });
      tp.textContent = m.name;
      label.appendChild(tp);
      group.appendChild(label);
    });
  }

  _applyTransform() {
    const g = this._geom();
    this.wheel.setAttribute("transform", `translate(${g.cx} ${g.cy}) rotate(${this.rot})`);
    this._drawOverlay();
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
