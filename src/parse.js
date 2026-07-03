// CSV parsing + calendar model construction for the radial calendar.

import { FRIEND_BIRTHDAYS } from "./birthdays.js";
import { supermoonsForYear, supermoonEventLabel } from "./supermoons.js";
import { buildYearFromTemplate, isUsBankHoliday } from "./calendarYears.js";

const MONTHS = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];

const TRACKS = ["A", "B", "C", "D", "E"];

// US Federal Reserve bank holidays — computed per year in calendarYears.js.

function bankHoliday(year, monthIndex, date) {
  return isUsBankHoliday(year, monthIndex, date);
}

// Minimal RFC-4180-ish CSV parser (handles quoted fields with embedded commas/quotes).
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      // Skip fully-empty trailing rows.
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((v) => v !== "")) rows.push(row);
  }
  return rows;
}

// Split a holiday cell that may contain several names joined by " / ".
function splitHolidays(cell) {
  if (!cell) return [];
  return cell
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Build the calendar model from raw CSV text.
 * Expected header:
 *   Month,Date,Day,Holiday,Holiday range,RangeRing_A,RangeLine_A,...RangeLine_E
 * Range events span every day flagged with "X" in a RangeLine_* column; the
 * event name sits in the matching RangeRing_* column at the start/end of the run.
 */
export function buildModel(text, year = 2026) {
  const rows = parseCSV(text);
  const header = rows[0].map((h) => h.trim());
  const body = rows.slice(1);

  const col = (name) => header.indexOf(name);
  const cMonth = col("Month");
  const cDate = col("Date");
  const cDay = col("Day");
  const cHoliday = col("Holiday");

  const days = [];
  body.forEach((raw, i) => {
    const r = raw.slice();
    const monthName = (r[cMonth] || "").trim().toUpperCase();
    const monthIndex = MONTHS.indexOf(monthName);
    const date = parseInt((r[cDate] || "").trim(), 10);
    if (!monthName || Number.isNaN(date)) return;
    const prev = days[days.length - 1];
    days.push({
      index: days.length,
      month: monthName,
      monthIndex,
      date,
      dayLetter: (r[cDay] || "").trim(),
      isMonthStart: date === 1 || !prev || prev.monthIndex !== monthIndex,
      holidays: splitHolidays(r[cHoliday]),
      isUsBankHoliday: bankHoliday(year, monthIndex, date),
      _raw: r,
    });
  });

  const total = days.length;

  // Extract multi-day (and single-day labelled) range events per track.
  const events = [];
  TRACKS.forEach((track, t) => {
    const ringCol = col(`RangeRing_${track}`);
    const lineCol = col(`RangeLine_${track}`);
    let cur = null;
    const flush = () => {
      if (cur) {
        cur.span = cur.endIndex - cur.startIndex + 1;
        cur.label = cur.label || "(untitled)";
        events.push(cur);
        cur = null;
      }
    };
    days.forEach((d) => {
      const r = d._raw;
      const ring = ((r[ringCol] || "").trim());
      const flagged = ((r[lineCol] || "").trim().toUpperCase() === "X");
      if (!flagged && !ring) { flush(); return; }
      if (ring && cur && cur.label && ring !== cur.label) {
        // Back-to-back events sharing a track: close previous on prior day.
        cur.endIndex = d.index - 1;
        flush();
      }
      if (!cur) {
        cur = { track, trackIndex: t, startIndex: d.index, endIndex: d.index, label: ring || "" };
      } else {
        cur.endIndex = d.index;
        if (ring && !cur.label) cur.label = ring;
      }
    });
    flush();
  });

  const birthdayByKey = new Map(
    FRIEND_BIRTHDAYS.map((b) => [`${b.monthIndex}-${b.date}`, b.name]),
  );
  days.forEach((d) => {
    d.birthday = birthdayByKey.get(`${d.monthIndex}-${d.date}`) || null;
  });

  supermoonsForYear(year).forEach(({ name, monthIndex, date }) => {
    const d = days.find((x) => x.monthIndex === monthIndex && x.date === date);
    if (!d) return;
    d.supermoon = supermoonEventLabel(name);
  });

  // Clean up _raw to keep the model tidy.
  days.forEach((d) => delete d._raw);

  return {
    kind: "annual",
    year,
    days,
    total,
    events,
    trackCount: TRACKS.length,
    monthStarts: days.filter((d) => d.isMonthStart).map((d) => d.index),
  };
}

export { MONTHS, TRACKS };

function daysInYear(year) {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return leap ? 366 : 365;
}

function enrichYearDays(days, year) {
  const birthdayByKey = new Map(
    FRIEND_BIRTHDAYS.map((b) => [`${b.monthIndex}-${b.date}`, b.name]),
  );
  days.forEach((d) => {
    d.birthday = birthdayByKey.get(`${d.monthIndex}-${d.date}`) || null;
  });
  supermoonsForYear(year).forEach(({ name, monthIndex, date }) => {
    const d = days.find((x) => x.monthIndex === monthIndex && x.date === date);
    if (!d) return;
    d.supermoon = supermoonEventLabel(name);
  });
  return days;
}

/** Programmatic day list for years without a CSV. */
export function buildYearSkeleton(year) {
  const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
  const monthLengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (daysInYear(year) === 366) monthLengths[1] = 29;

  let dow = new Date(Date.UTC(year, 0, 1)).getUTCDay();
  const days = [];
  for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
    for (let date = 1; date <= monthLengths[monthIndex]; date++) {
      const prev = days[days.length - 1];
      days.push({
        index: days.length,
        month: MONTHS[monthIndex],
        monthIndex,
        date,
        dayLetter: DAY_LETTERS[dow],
        isMonthStart: date === 1 || !prev || prev.monthIndex !== monthIndex,
        holidays: [],
        isUsBankHoliday: bankHoliday(year, monthIndex, date),
      });
      dow = (dow + 1) % 7;
    }
  }
  enrichYearDays(days, year);
  return {
    kind: "annual",
    year,
    days,
    total: days.length,
    events: [],
    trackCount: TRACKS.length,
    monthStarts: days.filter((d) => d.isMonthStart).map((d) => d.index),
  };
}

/**
 * Continuous multi-year timeline: each year occupies 360° sequentially (unwrapped).
 * Only the peephole window is rendered so years never stack on the same arc.
 */
export function buildSpiralModel(csvByYear, years, templateCsv) {
  const yearModels = {};
  const allDays = [];
  const allEvents = [];
  const yearStartIndex = {};
  const daysPerYear = {};
  let offset = 0;

  years.forEach((year, yearSlot) => {
    yearStartIndex[year] = offset;
    const csv = csvByYear[year];
    let yearModel;
    if (csv) {
      yearModel = buildModel(csv, year);
    } else if (templateCsv) {
      yearModel = buildYearFromTemplate(templateCsv, year);
    } else {
      yearModel = buildYearSkeleton(year);
    }
    yearModels[year] = yearModel;
    const yearDays = yearModel.days;
    const dpy = yearDays.length;
    daysPerYear[year] = dpy;
    const degPerDayY = 360 / dpy;

    yearDays.forEach((d, indexInYear) => {
      allDays.push({
        ...d,
        index: offset + indexInYear,
        year,
        yearSlot,
        indexInYear,
        angleDeg: yearSlot * 360 + indexInYear * degPerDayY,
        isYearStart: indexInYear === 0,
      });
    });

    yearModel.events.forEach((ev) => {
      allEvents.push({
        ...ev,
        startIndex: ev.startIndex + offset,
        endIndex: ev.endIndex + offset,
        year,
      });
    });

    offset += dpy;
  });

  const now = new Date().getFullYear();
  const defaultYear = years.includes(now)
    ? now
    : years.includes(2026)
      ? 2026
      : years[Math.floor(years.length / 2)];

  return {
    kind: "spiral",
    years,
    yearModels,
    startYear: years[0],
    endYear: years[years.length - 1],
    defaultYear,
    year: defaultYear,
    days: allDays,
    total: allDays.length,
    events: allEvents,
    yearStartIndex,
    daysPerYear,
    trackCount: TRACKS.length,
    monthStarts: allDays.filter((d) => d.isMonthStart).map((d) => d.index),
  };
}
