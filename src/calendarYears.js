// Build 2025 / 2027 calendars from the 2026 CSV template.

import { FRIEND_BIRTHDAYS } from "./birthdays.js";
import { supermoonsForYear, supermoonEventLabel } from "./supermoons.js";
import { MONTHS, TRACKS, parseCSV, buildModel } from "./parse.js";

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
]);

const MOVEABLE_RANGE_LABELS = new Set(["Lent", "Passover", "Hanukkah", "Sukkot"]);

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
  /independence day \(observed\)/i,
  /^super bowl l[ivx]+$/i,
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

function shouldSkipTemplateEvent(label) {
  if (!label) return true;
  if (is2026OnlyLabel(label)) return true;
  if (MOVEABLE_RANGE_LABELS.has(label.trim())) return true;
  return false;
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
    [0, 20, "Martin Luther King Day"],
    [0, 29, "Lunar New Year"],
    [1, 9, "Super Bowl LIX"],
    [1, 17, "Presidents' Day"],
    [2, 4, "Mardi Gras"],
    [2, 5, "Ash Wednesday"],
    [2, 9, "Daylight Saving Begins"],
    [2, 27, "MLB Opening Day"],
    [3, 12, "Passover"],
    [3, 18, "Good Friday"],
    [3, 20, "Easter Sunday"],
    [4, 26, "Memorial Day"],
    [5, 19, "Juneteenth"],
    [6, 4, "Independence Day"],
    [8, 1, "Labor Day"],
    [9, 13, "Columbus Day"],
    [9, 22, "Rosh HaShanah"],
    [9, 25, "Mid-Autumn Festival"],
    [10, 2, "Yom Kippur"],
    [10, 7, "Sukkot"],
    [10, 27, "Thanksgiving"],
    [10, 28, "Black Friday"],
    [11, 1, "Daylight Saving Ends"],
    [11, 14, "Hanukkah"],
    [11, 30, "Cyber Monday"],
  ],
  2027: [
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
    [3, 21, "Passover"],
    [4, 31, "Memorial Day"],
    [5, 19, "Juneteenth"],
    [5, 25, "Dragon Boat Festival"],
    [6, 4, "Independence Day"],
    [6, 5, "Independence Day (observed)"],
    [8, 6, "Labor Day"],
    [9, 11, "Columbus Day"],
    [9, 11, "Rosh HaShanah"],
    [9, 20, "Yom Kippur"],
    [9, 25, "Mid-Autumn Festival"],
    [9, 25, "Sukkot"],
    [10, 7, "Daylight Saving Ends"],
    [10, 25, "Thanksgiving"],
    [10, 26, "Black Friday"],
    [10, 29, "Cyber Monday"],
    [11, 24, "Hanukkah"],
  ],
};

const YEAR_RANGES = {
  2025: [
    { track: "A", label: "Passover", from: [3, 12], to: [3, 20] },
    { track: "A", label: "Expo 2025 Osaka", from: [3, 13], to: [9, 13] },
    { track: "E", label: "Lent", from: [2, 5], to: [3, 19] },
    { track: "A", label: "Hanukkah", from: [11, 14], to: [11, 22] },
    { track: "E", label: "Sukkot", from: [10, 7], to: [10, 13] },
  ],
  2027: [
    { track: "A", label: "Passover", from: [3, 21], to: [3, 29] },
    { track: "E", label: "Lent", from: [1, 17], to: [2, 27] },
    { track: "A", label: "Hanukkah", from: [11, 24], to: [11, 31] },
    { track: "E", label: "Sukkot", from: [9, 25], to: [10, 1] },
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

function applyYearRanges(days, year, header) {
  const col = (name) => header.indexOf(name);

  (YEAR_RANGES[year] || []).forEach(({ track, label, from, to }) => {
    const ringCol = col(`RangeRing_${track}`);
    const lineCol = col(`RangeLine_${track}`);
    let mi = from[0];
    let dt = from[1];
    const [endMi, endDt] = to;

    while (mi < endMi || (mi === endMi && dt <= endDt)) {
      const d = findDay(days, mi, dt);
      if (d) {
        d._raw[lineCol] = "X";
        if (mi === from[0] && dt === from[1]) d._raw[ringCol] = label;
      }
      if (mi === endMi && dt === endDt) break;
      dt++;
      const monthLen = new Date(Date.UTC(year, mi + 1, 0)).getUTCDate();
      if (dt > monthLen) { dt = 1; mi++; }
    }
    const endDay = findDay(days, endMi, endDt);
    if (endDay) endDay._raw[ringCol] = label;
  });
}

function copyTemplateEvent(days, templateDays, templateEvent, header) {
  if (shouldSkipTemplateEvent(templateEvent.label)) return;

  const col = (name) => header.indexOf(name);
  const track = templateEvent.track;
  const ringCol = col(`RangeRing_${track}`);
  const lineCol = col(`RangeLine_${track}`);

  for (let i = templateEvent.startIndex; i <= templateEvent.endIndex; i++) {
    const src = templateDays[i];
    const dst = findDay(days, src.monthIndex, src.date);
    if (!dst) continue;
    dst._raw[lineCol] = "X";
    if (i === templateEvent.startIndex) dst._raw[ringCol] = templateEvent.label;
    if (i === templateEvent.endIndex && templateEvent.endIndex !== templateEvent.startIndex) {
      dst._raw[ringCol] = templateEvent.label;
    }
  }
  if (templateEvent.startIndex === templateEvent.endIndex) {
    const src = templateDays[templateEvent.startIndex];
    const dst = findDay(days, src.monthIndex, src.date);
    if (dst) dst._raw[ringCol] = templateEvent.label;
  }
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
      const ring = (r[ringCol] || "").trim();
      const flagged = (r[lineCol] || "").trim().toUpperCase() === "X";
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

  const templateModel = buildModel(templateCsv, 2026);

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

  templateModel.events.forEach((ev) => {
    copyTemplateEvent(days, templateModel.days, ev, header);
  });

  applyYearHolidays(days, year);
  applyYearRanges(days, year, header);

  days.forEach((d) => {
    d._raw[cHoliday] = d.holidays.join(" / ");
  });

  enrichDays(days, year);

  const events = extractRangeEvents(days, header);
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
