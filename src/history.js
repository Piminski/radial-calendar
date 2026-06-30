// Build the radial model for USA history (1776–2026).

import {
  HISTORY_END,
  HISTORY_START,
  MULTIYEAR_EVENTS,
  PRESIDENT_TERMS,
  PRESIDENTIAL_ELECTIONS,
  presidentDisplayName,
  electionOpponentDisplayName,
} from "./usaHistoryData.js";
import { splitEventParts } from "./parseYearEvents.js";

const TRACKS = ["A", "B", "C", "D", "E"];

const INAUGURATION_RE = /\b(inaugurat|sworn in)\b/i;
const ELECTED_PRES_RE = /\belected president\b/i;

function yearIndex(year) {
  return year - HISTORY_START;
}

function clampYearIndex(index, lastIndex) {
  return Math.min(Math.max(index, 0), lastIndex);
}

function activeMultiyearLabels(year) {
  return MULTIYEAR_EVENTS
    .filter((ev) => year >= ev.start && year <= ev.end)
    .map((ev) => ev.label);
}

function echoesMultiyearTrack(event, year) {
  const e = event.toLowerCase().trim();
  for (const label of activeMultiyearLabels(year)) {
    const l = label.toLowerCase();
    if (e === l) return true;
    if (e.startsWith(l) && /\b(begins|ends|starts|continues)\b/.test(e)) return true;
  }
  return false;
}

function echoesPresidentRing(event) {
  const e = event.toLowerCase();
  if (INAUGURATION_RE.test(e) || ELECTED_PRES_RE.test(e)) return true;
  if (/\bpresidential transfer\b/.test(e)) return true;
  if (/\belected\b/.test(e) && /\bpresident\b/.test(e)) return true;
  if (/\bre-?elected\b/.test(e)) return true;
  if (/\bbecomes (the )?(first )?(successor )?president\b/.test(e)) return true;
  if (/\binaugurat(ed|ion)\b/.test(e)) return true;
  return false;
}

export function filterHeadlineEvents(year, events) {
  const seen = new Set();
  const out = [];
  for (const event of events) {
    if (echoesMultiyearTrack(event, year)) continue;
    if (echoesPresidentRing(event)) continue;
    const key = event.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(event);
    if (out.length >= 3) break;
  }
  return out;
}

function eventsForYear(year, yearEvents) {
  const raw = yearEvents[year] || [];
  const parts = raw.flatMap(splitEventParts);
  return filterHeadlineEvents(year, parts);
}

function decadeLabel(year) {
  return `${Math.floor(year / 10) * 10}s`;
}

export function buildHistoryModel(yearEvents) {
  if (!yearEvents) throw new Error("buildHistoryModel requires parsed year events");
  const lastIndex = HISTORY_END - HISTORY_START;
  const days = [];
  for (let year = HISTORY_START; year <= HISTORY_END; year++) {
    const index = yearIndex(year);
    const decade = Math.floor(year / 10) * 10;
    days.push({
      index,
      year,
      date: year,
      dayLetter: "",
      monthIndex: decade,
      month: decadeLabel(year),
      isMonthStart: year % 10 === 0,
      isCenturyStart: year % 100 === 0,
      holidays: eventsForYear(year, yearEvents),
      isUsBankHoliday: false,
      birthday: null,
      supermoon: null,
    });
  }

  const events = MULTIYEAR_EVENTS.map((ev) => ({
    label: ev.label,
    startIndex: clampYearIndex(yearIndex(ev.start), lastIndex),
    endIndex: clampYearIndex(yearIndex(ev.end), lastIndex),
    track: null,
    trackIndex: null,
    lane: null,
  }));

  const len = (e) => e.endIndex - e.startIndex;
  const sorted = [...events].sort((a, b) => len(a) - len(b) || a.startIndex - b.startIndex);
  const lanes = [];
  sorted.forEach((ev) => {
    let lane = 0;
    for (;; lane++) {
      if (lane >= lanes.length) lanes.push([]);
      const clash = lanes[lane].some(
        (iv) => !(ev.endIndex < iv.s || ev.startIndex > iv.e));
      if (!clash) {
        lanes[lane].push({ s: ev.startIndex, e: ev.endIndex });
        ev.lane = lane;
        ev.trackIndex = lane % TRACKS.length;
        ev.track = TRACKS[ev.trackIndex];
        break;
      }
    }
  });

  const presidentTerms = PRESIDENT_TERMS.map((p) => ({
    name: p.name,
    displayName: presidentDisplayName(p.name),
    party: p.party,
    startIndex: yearIndex(p.start),
    endIndex: yearIndex(p.end),
  }));

  const incumbentElections = PRESIDENTIAL_ELECTIONS
    .filter((e) => {
      const idx = yearIndex(e.year);
      return presidentTerms.some(
        (t) => t.name === e.winner && idx >= t.startIndex && idx <= t.endIndex,
      );
    })
    .map((e) => {
      const idx = yearIndex(e.year);
      const term = presidentTerms.find(
        (t) => t.name === e.winner && idx >= t.startIndex && idx <= t.endIndex,
      );
      return {
        year: e.year,
        yearIndex: idx,
        incumbentDisplayName: presidentDisplayName(e.winner),
        challengerDisplayName: electionOpponentDisplayName(e.loser),
        party: term?.party ?? "other",
      };
    });

  const transitionOpponents = new Map();
  for (let i = 0; i < presidentTerms.length - 1; i++) {
    const prev = presidentTerms[i];
    const next = presidentTerms[i + 1];
    const electionYear = HISTORY_START + next.startIndex - 1;
    const election = PRESIDENTIAL_ELECTIONS.find(
      (e) => e.year === electionYear && e.winner === next.name,
    );
    if (!election?.loser || election.loser === prev.name) continue;
    transitionOpponents.set(
      `${next.name}:${next.startIndex}`,
      `v ${electionOpponentDisplayName(election.loser)}`,
    );
  }

  return {
    kind: "history",
    startYear: HISTORY_START,
    endYear: HISTORY_END,
    year: HISTORY_END,
    total: days.length,
    days,
    events,
    presidentTerms,
    incumbentElections,
    transitionOpponents,
    trackCount: TRACKS.length,
    monthStarts: days.filter((d) => d.isMonthStart).map((d) => d.index),
  };
}
