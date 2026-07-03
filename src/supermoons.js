// 2026 full supermoon peaks (within ~90% of lunar perigee).
// Cold Moon reference also anchors moon-phase math in radial.js.
export const REF_FULL_MOON_2026 = Date.UTC(2026, 11, 24, 1, 28, 0);

export const SUPERMOONS_BY_YEAR = {
  2025: [
    {
      name: "Beaver Moon",
      monthIndex: 10,
      date: 5,
      peakUtc: Date.UTC(2025, 10, 5, 22, 20, 0),
    },
    {
      name: "Cold Moon",
      monthIndex: 11,
      date: 4,
      peakUtc: Date.UTC(2025, 11, 4, 23, 14, 0),
    },
  ],
  2026: [
    {
      name: "Wolf Moon",
      monthIndex: 0,
      date: 3,
      peakUtc: Date.UTC(2026, 0, 3, 10, 3, 0),
    },
    {
      name: "Beaver Moon",
      monthIndex: 10,
      date: 24,
      peakUtc: Date.UTC(2026, 10, 24, 14, 53, 0),
    },
    {
      name: "Cold Moon",
      monthIndex: 11,
      date: 24,
      peakUtc: REF_FULL_MOON_2026,
    },
  ],
  2027: [
    {
      name: "Wolf Moon",
      monthIndex: 0,
      date: 18,
      peakUtc: Date.UTC(2027, 0, 18, 15, 52, 0),
    },
    {
      name: "Beaver Moon",
      monthIndex: 10,
      date: 14,
      peakUtc: Date.UTC(2027, 10, 14, 11, 27, 0),
    },
    {
      name: "Cold Moon",
      monthIndex: 11,
      date: 13,
      peakUtc: Date.UTC(2027, 11, 13, 18, 58, 0),
    },
  ],
};

export function supermoonsForYear(year) {
  return SUPERMOONS_BY_YEAR[year] || [];
}

export function supermoonPeaksForYear(year) {
  return supermoonsForYear(year).map((s) => s.peakUtc);
}

export function supermoonEventLabel(name) {
  return `${name} Supermoon`;
}
