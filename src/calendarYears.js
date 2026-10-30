// Build 2025 / 2027 calendars from the 2026 CSV template.

import { FRIEND_BIRTHDAYS } from "./birthdays.js";
import { supermoonsForYear, supermoonEventLabel } from "./supermoons.js";
import {
  MONTHS,
  TRACKS,
  parseCSV,
  stripHolidaysMatchingRangeEvents,
  readRangeTrackCells,
} from "./parse.js";

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

const EXACT_2026_ONLY = new Set([
  "Milano Cortina Winter Olympics",
  "World Baseball Classic",
  "Winter Paralympics",
  "FIFA World Cup",
  "FIFA World Cup Final",
  "Commonwealth Games",
  "G20 Miami summit",
  "Super Bowl LX",
  "Harbin Ice Snow Festival",
  "Midterm Elections",
]);

const MOVEABLE_RANGE_LABELS = new Set([
  "Lent", "Passover", "Hanukkah", "Sukkot", "Rosh HaShanah",
]);

/** Multiday events whose dates shift year to year (overrides in YEAR_RANGES). */
const FLOATING_RANGE_LABELS = new Set([
  ...MOVEABLE_RANGE_LABELS,
  "Comic-Con",
  "Coachella",
  "SXSW",
  "Cannes Film Festival",
  "Burning Man",
  "Venice Film Festival",
  "Rio Carnival",
  "The Governors Ball",
]);

/** Coachella — two long weekends per year (monthIndex 0-based). */
const COACHELLA_BY_YEAR = {
  2025: [
    { from: [3, 11], to: [3, 13] },
    { from: [3, 18], to: [3, 20] },
  ],
  2026: [
    { from: [3, 10], to: [3, 12] },
    { from: [3, 17], to: [3, 19] },
  ],
  2027: [
    { from: [3, 9], to: [3, 11] },
    { from: [3, 16], to: [3, 18] },
  ],
};

const MOVEABLE_HOLIDAY_RE = [
  /lunar new year/i,
  /mardi gras/i,
  /ash wednesday/i,
  /^good friday$/i,
  /^easter sunday$/i,
  /martin luther king/i,
  /presidents' day/i,
  /^memorial day$/i,
  /^labor day$/i,
  /^columbus day/i,
  /^thanksgiving$/i,
  /^black friday$/i,
  /^cyber monday$/i,
  /^rosh hashanah$/i,
  /^yom kippur$/i,
  /^sukkot$/i,
  /^hanukkah$/i,
  /mid-autumn festival/i,
  /dragon boat festival/i,
  /daylight saving/i,
  /^mlb opening day$/i,
  /^passover$/i,
  /met gala/i,
  /golden globes/i,
  /independence day \(observed\)/i,
  /^super bowl l[ivx]+$/i,
  / marathon$/i,
];

/** Floating + fixed US bank holidays for a given year. */
export function usBankHolidayDates(year) {
  const set = new Set(["0-1", "5-19", "10-11", "11-25"]);

  const nthDow = (monthIndex, weekday, n) => {
    const d = new Date(Date.UTC(year, monthIndex, 1));
    let count = 0;
    while (d.getUTCMonth() === monthIndex) {
      if (d.getUTCDay() === weekday) {
        count++;
        if (count === n) return d.getUTCDate();
      }
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return 1;
  };

  const lastDow = (monthIndex, weekday) => {
    const d = new Date(Date.UTC(year, monthIndex + 1, 0));
    while (d.getUTCDay() !== weekday) d.setUTCDate(d.getUTCDate() - 1);
    return d.getUTCDate();
  };

  const observe = (monthIndex, date) => {
    const d = new Date(Date.UTC(year, monthIndex, date));
    const dow = d.getUTCDay();
    if (dow === 6) set.add(`${monthIndex}-${date - 1}`);
    else if (dow === 0) set.add(`${monthIndex}-${date + 1}`);
    set.add(`${monthIndex}-${date}`);
  };

  set.add(`0-${nthDow(0, 1, 3)}`);
  set.add(`1-${nthDow(1, 1, 3)}`);
  set.add(`4-${lastDow(4, 1)}`);
  set.add(`8-${nthDow(8, 1, 1)}`);
  set.add(`9-${nthDow(9, 1, 2)}`);
  set.add(`10-${nthDow(10, 4, 4)}`);
  observe(6, 4);
  return set;
}

export function isUsBankHoliday(year, monthIndex, date) {
  return usBankHolidayDates(year).has(`${monthIndex}-${date}`);
}

/** Nth occurrence of `weekday` (0=Sun … 6=Sat) in a month. */
export function nthWeekdayOfMonth(year, monthIndex, weekday, n) {
  const d = new Date(Date.UTC(year, monthIndex, 1));
  let count = 0;
  while (d.getUTCMonth() === monthIndex) {
    if (d.getUTCDay() === weekday) {
      count++;
      if (count === n) return d.getUTCDate();
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return 1;
}

function splitParts(cell) {
  if (!cell) return [];
  return cell.split("/").map((s) => s.trim()).filter(Boolean);
}

function is2026OnlyLabel(label) {
  const t = label.trim();
  if (EXACT_2026_ONLY.has(t)) return true;
  if (/^Super Bowl L[IVX]+$/i.test(t)) return true;
  return false;
}

function isMoveableHoliday(label) {
  return MOVEABLE_HOLIDAY_RE.some((re) => re.test(label.trim()));
}

function filterHolidayCell(cell) {
  return splitParts(cell)
    .filter((p) => !is2026OnlyLabel(p) && !isMoveableHoliday(p))
    .join(" / ");
}

function daysInYear(year) {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return leap ? 366 : 365;
}

function dayKey(monthIndex, date) {
  return `${monthIndex}-${date}`;
}

function findDay(days, monthIndex, date) {
  return days.find((d) => d.monthIndex === monthIndex && d.date === date);
}

const YEAR_HOLIDAYS = {
  2025: [
    [0, 5, "Golden Globes"],
    [0, 20, "Martin Luther King Day"],
    [0, 29, "Lunar New Year"],
    [1, 9, "Super Bowl LIX"],
    [1, 17, "Presidents' Day"],
    [2, 4, "Mardi Gras"],
    [2, 5, "Ash Wednesday"],
    [2, 9, "Daylight Saving Begins"],
    [2, 27, "MLB Opening Day"],
    [3, 18, "Good Friday"],
    [3, 20, "Easter Sunday"],
    [4, 26, "Memorial Day"],
    [5, 19, "Juneteenth"],
    [6, 4, "Independence Day"],
    [8, 1, "Labor Day"],
    [9, 13, "Columbus Day"],
    [9, 25, "Mid-Autumn Festival"],
    [10, 2, "Yom Kippur"],
    [10, 27, "Thanksgiving"],
    [10, 28, "Black Friday"],
    [11, 1, "Daylight Saving Ends"],
    [11, 30, "Cyber Monday"],
  ],
  2027: [
    [0, 10, "Golden Globes"],
    [0, 18, "Martin Luther King Day"],
    [0, 6, "Lunar New Year"],
    [1, 7, "Super Bowl LXI"],
    [1, 15, "Presidents' Day"],
    [1, 16, "Mardi Gras"],
    [1, 17, "Ash Wednesday"],
    [2, 14, "Daylight Saving Begins"],
    [2, 26, "Good Friday"],
    [2, 28, "Easter Sunday"],
    [3, 1, "MLB Opening Day"],
    [4, 31, "Memorial Day"],
    [5, 19, "Juneteenth"],
    [5, 25, "Dragon Boat Festival"],
    [6, 4, "Independence Day"],
    [6, 5, "Independence Day (observed)"],
    [8, 6, "Labor Day"],
    [9, 11, "Columbus Day"],
    [9, 20, "Yom Kippur"],
    [9, 25, "Mid-Autumn Festival"],
    [10, 7, "Daylight Saving Ends"],
    [10, 25, "Thanksgiving"],
    [10, 26, "Black Friday"],
    [10, 29, "Cyber Monday"],
  ],
};

/** Same calendar dates every year (from the 2026 CSV), excluding floating / one-off events. */
const FIXED_ANNUAL_RANGES = [
  { track: "A", label: "Hanami (Cherry Blossoms)", from: [2, 20], to: [3, 5] },
  { track: "A", label: "Bergkirchweih", from: [4, 21], to: [5, 1] },
  { track: "A", label: "Nobel Prize Announcements", from: [9, 5], to: [9, 12] },
  { track: "A", label: "Dia de los Muertos", from: [9, 31], to: [10, 2] },
  { track: "B", label: "CES Las Vegas", from: [0, 6], to: [0, 9] },
  { track: "B", label: "Sundance Film Festival", from: [0, 22], to: [1, 1] },
  { track: "B", label: "Berlin Film Festival", from: [1, 12], to: [1, 22] },
  { track: "B", label: "Frieze LA", from: [1, 26], to: [2, 1] },
  { track: "B", label: "Songkran", from: [3, 13], to: [3, 15] },
  { track: "B", label: "Golden Week", from: [3, 29], to: [4, 5] },
  { track: "B", label: "French Open", from: [4, 24], to: [5, 7] },
  { track: "B", label: "Royal Ascot", from: [5, 16], to: [5, 20] },
  { track: "B", label: "Cannes Lions", from: [5, 22], to: [5, 26] },
  { track: "B", label: "Wimbledon", from: [5, 29], to: [6, 12] },
  { track: "B", label: "World Series", from: [9, 23], to: [9, 31] },
  { track: "C", label: "Venice Carnival", from: [0, 31], to: [1, 17] },
  { track: "C", label: "The Masters", from: [3, 9], to: [3, 12] },
  { track: "C", label: "Art Basel", from: [5, 18], to: [5, 21] },
  { track: "C", label: "Tour de France", from: [6, 4], to: [6, 26] },
  { track: "C", label: "US Open", from: [7, 31], to: [8, 13] },
  { track: "C", label: "Oktoberfest", from: [8, 19], to: [9, 4] },
  { track: "D", label: "San Fermin", from: [6, 7], to: [6, 14] },
  { track: "D", label: "Bayreuth Festival", from: [6, 25], to: [7, 26] },
  { track: "A", label: "The Governors Ball", from: [5, 5], to: [5, 7] },
  { track: "A", label: "Comic-Con", from: [6, 23], to: [6, 26] },
  { track: "A", label: "Venice Film Festival", from: [8, 2], to: [8, 12] },
  { track: "B", label: "Cannes Film Festival", from: [4, 12], to: [4, 23] },
  { track: "B", label: "Burning Man", from: [7, 30], to: [8, 7] },
  { track: "C", label: "SXSW", from: [2, 12], to: [2, 18] },
  { track: "D", label: "Rio Carnival", from: [1, 13], to: [1, 18] },
];

const YEAR_RANGES = {
  2025: [
    { track: "B", label: "Passover", from: [3, 12], to: [3, 19] },
    { track: "E", label: "Lent", from: [2, 5], to: [3, 19] },
    { track: "D", label: "Sukkot", from: [9, 6], to: [9, 13] },
    { track: "C", label: "SXSW", from: [2, 7], to: [2, 15] },
    { track: "B", label: "Cannes Film Festival", from: [4, 13], to: [4, 24] },
    { track: "D", label: "Rio Carnival", from: [1, 28], to: [2, 8] },
    { track: "B", label: "Burning Man", from: [7, 24], to: [8, 1] },
    { track: "A", label: "The Governors Ball", from: [5, 6], to: [5, 8] },
    { track: "A", label: "Comic-Con", from: [6, 24], to: [6, 27] },
    { track: "A", label: "Venice Film Festival", from: [7, 27], to: [8, 6] },
    { track: "A", label: "Hanukkah", from: [11, 14], to: [11, 22] },
    { track: "E", label: "Rosh HaShanah", from: [8, 22], to: [8, 24] },
  ],
  2027: [
    { track: "B", label: "Passover", from: [3, 21], to: [3, 29] },
    { track: "E", label: "Lent", from: [1, 17], to: [2, 27] },
    { track: "E", label: "Rosh HaShanah", from: [9, 1], to: [9, 3] },
    { track: "A", label: "Hanukkah", from: [11, 24], to: [11, 31] },
    { track: "D", label: "Sukkot", from: [9, 15], to: [9, 22] },
    { track: "C", label: "SXSW", from: [2, 13], to: [2, 21] },
    { track: "B", label: "Cannes Film Festival", from: [4, 11], to: [4, 22] },
    { track: "D", label: "Rio Carnival", from: [1, 12], to: [1, 17] },
    { track: "A", label: "Comic-Con", from: [6, 22], to: [6, 25] },
    { track: "B", label: "Burning Man", from: [7, 29], to: [8, 6] },
    { track: "E", label: "Documenta 16", from: [5, 10], to: [8, 19] },
  ],
};

function yearRangeLabels(year) {
  const labels = new Set((YEAR_RANGES[year] || []).map((r) => r.label));
  if (COACHELLA_BY_YEAR[year]) labels.add("Coachella");
  return labels;
}

function coachellaRangesForYear(year) {
  return (COACHELLA_BY_YEAR[year] || []).map(({ from, to }) => ({
    track: "A",
    label: "Coachella",
    from,
    to,
  }));
}

/** Abbott World Marathon Majors — monthIndex (0-based), date, label. */
const MARATHON_MAJORS_BY_YEAR = {
  2025: [
    [2, 2, "Tokyo Marathon"],
    [3, 21, "Boston Marathon"],
    [3, 27, "London Marathon"],
    [4, 25, "Cape Town Marathon"],
    [7, 31, "Sydney Marathon"],
    [8, 28, "Berlin Marathon"],
    [9, 12, "Chicago Marathon"],
    [10, 2, "New York City Marathon"],
  ],
  2026: [
    [2, 1, "Tokyo Marathon"],
    [3, 20, "Boston Marathon"],
    [3, 26, "London Marathon"],
    [4, 24, "Cape Town Marathon"],
    [7, 30, "Sydney Marathon"],
    [8, 27, "Berlin Marathon"],
    [9, 11, "Chicago Marathon"],
    [10, 1, "New York City Marathon"],
  ],
  2027: [
    [2, 7, "Tokyo Marathon"],
    [3, 19, "Boston Marathon"],
    [3, 25, "London Marathon"],
    [4, 23, "Cape Town Marathon"],
    [7, 29, "Sydney Marathon"],
    [8, 26, "Berlin Marathon"],
    [9, 10, "Chicago Marathon"],
    [10, 7, "New York City Marathon"],
  ],
};

function addHoliday(days, monthIndex, date, label) {
  const d = findDay(days, monthIndex, date);
  if (!d) return;
  if (!d.holidays.includes(label)) d.holidays.push(label);
}

function applyYearHolidays(days, year) {
  (YEAR_HOLIDAYS[year] || []).forEach(([mi, dt, label]) => {
    addHoliday(days, mi, dt, label);
  });
}

export function applyMarathonHolidays(days, year) {
  (MARATHON_MAJORS_BY_YEAR[year] || []).forEach(([mi, dt, label]) => {
    addHoliday(days, mi, dt, label);
  });
}

export function applyMetGala(days, year) {
  days.forEach((d) => {
    d.holidays = d.holidays.filter((h) => !/met gala/i.test(h));
  });
  addHoliday(days, 4, nthWeekdayOfMonth(year, 4, 1, 1), "The Met Gala");
}

function paintRange(days, year, header, { track, label, from, to }) {
  const col = (name) => header.indexOf(name);
  const ringCol = col(`RangeRing_${track}`);
  const lineCol = col(`RangeLine_${track}`);
  let mi = from[0];
  let dt = from[1];
  const [endMi, endDt] = to;

  while (mi < endMi || (mi === endMi && dt <= endDt)) {
    const d = findDay(days, mi, dt);
    if (d) {
      d._raw[lineCol] = "X";
      d._raw[ringCol] = label;
    }
    if (mi === endMi && dt === endDt) break;
    dt++;
    const monthLen = new Date(Date.UTC(year, mi + 1, 0)).getUTCDate();
    if (dt > monthLen) { dt = 1; mi++; }
  }
}

function applyRangeList(days, year, header, ranges) {
  ranges.forEach((range) => paintRange(days, year, header, range));
}

function applyFixedAnnualRanges(days, year, header) {
  const overrides = yearRangeLabels(year);
  const ranges = FIXED_ANNUAL_RANGES.filter(({ label }) => {
    if (MOVEABLE_RANGE_LABELS.has(label)) return false;
    if (FLOATING_RANGE_LABELS.has(label) && overrides.has(label)) return false;
    return true;
  });
  applyRangeList(days, year, header, ranges);
}

function applyYearRanges(days, year, header) {
  const ranges = [...(YEAR_RANGES[year] || []), ...coachellaRangesForYear(year)];
  applyRangeList(days, year, header, ranges);
}

function extractRangeEvents(days, header) {
  const col = (name) => header.indexOf(name);
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
      const { ring, flagged } = readRangeTrackCells(r, ringCol, lineCol);
      if (!flagged && !ring) { flush(); return; }
      if (ring && cur && cur.label && ring !== cur.label) {
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
  return events;
}

function enrichDays(days, year) {
  const birthdayByKey = new Map(
    FRIEND_BIRTHDAYS.map((b) => [`${b.monthIndex}-${b.date}`, b.name]),
  );
  days.forEach((d) => {
    d.birthday = birthdayByKey.get(`${d.monthIndex}-${d.date}`) || null;
  });
  supermoonsForYear(year).forEach(({ name, monthIndex, date }) => {
    const d = findDay(days, monthIndex, date);
    if (!d) return;
    d.supermoon = supermoonEventLabel(name);
  });
}

/**
 * Build a full calendar model for `year` by copying the 2026 CSV template
 * (fixed-date events), excluding 2026-only items, and applying moveable /
 * year-specific holidays and ranges.
 */
export function buildYearFromTemplate(templateCsv, year) {
  const rows = parseCSV(templateCsv);
  const header = rows[0].map((h) => h.trim());
  const body = rows.slice(1);
  const col = (name) => header.indexOf(name);
  const cMonth = col("Month");
  const cDate = col("Date");
  const cDay = col("Day");
  const cHoliday = col("Holiday");

  const templateByKey = new Map();
  body.forEach((raw) => {
    const r = raw.slice();
    const monthName = (r[cMonth] || "").trim().toUpperCase();
    const monthIndex = MONTHS.indexOf(monthName);
    const date = parseInt((r[cDate] || "").trim(), 10);
    if (monthIndex < 0 || Number.isNaN(date)) return;
    templateByKey.set(dayKey(monthIndex, date), r);
  });

  const monthLengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (daysInYear(year) === 366) monthLengths[1] = 29;

  let dow = new Date(Date.UTC(year, 0, 1)).getUTCDay();
  const days = [];

  for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
    for (let date = 1; date <= monthLengths[monthIndex]; date++) {
      const tpl = templateByKey.get(dayKey(monthIndex, date));
      const prev = days[days.length - 1];
      const holidays = tpl ? splitParts(filterHolidayCell(tpl[cHoliday] || "")) : [];
      const raw = header.map(() => "");
      raw[cMonth] = MONTHS[monthIndex];
      raw[cDate] = String(date);
      raw[cDay] = DAY_LETTERS[dow];
      raw[cHoliday] = holidays.join(" / ");

      days.push({
        index: days.length,
        month: MONTHS[monthIndex],
        monthIndex,
        date,
        dayLetter: DAY_LETTERS[dow],
        isMonthStart: date === 1 || !prev || prev.monthIndex !== monthIndex,
        holidays,
        isUsBankHoliday: isUsBankHoliday(year, monthIndex, date),
        _raw: raw,
      });
      dow = (dow + 1) % 7;
    }
  }

  applyFixedAnnualRanges(days, year, header);
  applyYearHolidays(days, year);
  applyMarathonHolidays(days, year);
  applyMetGala(days, year);
  applyYearRanges(days, year, header);

  days.forEach((d) => {
    d._raw[cHoliday] = d.holidays.join(" / ");
  });

  enrichDays(days, year);

  const events = extractRangeEvents(days, header);
  stripHolidaysMatchingRangeEvents(days, events);
  days.forEach((d) => delete d._raw);

  return {
    kind: "annual",
    year,
    days,
    total: days.length,
    events,
    trackCount: TRACKS.length,
    monthStarts: days.filter((d) => d.isMonthStart).map((d) => d.index),
  };
}
