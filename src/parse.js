// CSV parsing + calendar model construction for the radial calendar.

const MONTHS = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];

const TRACKS = ["A", "B", "C", "D", "E"];

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

  // Clean up _raw to keep the model tidy.
  days.forEach((d) => delete d._raw);

  return {
    year,
    days,
    total,
    events,
    trackCount: TRACKS.length,
    monthStarts: days.filter((d) => d.isMonthStart).map((d) => d.index),
  };
}

export { MONTHS, TRACKS };
