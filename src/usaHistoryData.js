// USA history calendar data (1776–2026).

export const HISTORY_START = 1776;
export const HISTORY_END = 2026;

export const PARTY_COLORS = {
  republican: "#e04545",
  democrat: "#2f80ff",
  other: "#9b6bc4",
};

export function partyColor(party) {
  return PARTY_COLORS[party] || PARTY_COLORS.other;
}

function splitNameParts(name) {
  return name.trim().split(/\s+/);
}

function presidentSurname(name) {
  const parts = splitNameParts(name);
  if (parts.length >= 2 && parts[parts.length - 2].toLowerCase() === "van") {
    return parts.slice(-2).join(" ");
  }
  return parts[parts.length - 1];
}

function givenNameParts(name) {
  const parts = splitNameParts(name);
  const snWords = presidentSurname(name).split(/\s+/).length;
  return parts.slice(0, parts.length - snWords);
}

function formatPresidentLabel(givenParts, surname) {
  if (givenParts.length === 0) return surname;
  const initials = givenParts.map((p) => (p.endsWith(".") ? p : `${p[0]}.`)).join(" ");
  return `${initials} ${surname}`;
}

function buildPresidentDisplayNames(terms) {
  const uniqueNames = [...new Set(terms.map((t) => t.name))];
  const bySurname = new Map();
  for (const name of uniqueNames) {
    const surname = presidentSurname(name);
    if (!bySurname.has(surname)) bySurname.set(surname, []);
    bySurname.get(surname).push(name);
  }

  const labels = new Map();
  for (const names of bySurname.values()) {
    if (names.length === 1) {
      labels.set(names[0], presidentSurname(names[0]));
      continue;
    }
    for (const name of names) {
      const surname = presidentSurname(name);
      const given = givenNameParts(name);
      let label = surname;
      for (let n = 1; n <= given.length; n++) {
        label = formatPresidentLabel(given.slice(0, n), surname);
        const clashes = names.filter(
          (other) => formatPresidentLabel(
            givenNameParts(other).slice(0, n),
            presidentSurname(other),
          ) === label,
        );
        if (clashes.length === 1) break;
      }
      labels.set(name, label);
    }
  }
  return labels;
}

export const PRESIDENT_TERMS = [
  { name: "George Washington", start: 1789, end: 1796, party: "other" },
  { name: "John Adams", start: 1797, end: 1800, party: "other" },
  { name: "Thomas Jefferson", start: 1801, end: 1808, party: "other" },
  { name: "James Madison", start: 1809, end: 1816, party: "other" },
  { name: "James Monroe", start: 1817, end: 1824, party: "other" },
  { name: "John Quincy Adams", start: 1825, end: 1828, party: "other" },
  { name: "Andrew Jackson", start: 1829, end: 1836, party: "democrat" },
  { name: "Martin Van Buren", start: 1837, end: 1840, party: "democrat" },
  { name: "William Henry Harrison", start: 1841, end: 1841, party: "other" },
  { name: "John Tyler", start: 1841, end: 1844, party: "other" },
  { name: "James K. Polk", start: 1845, end: 1848, party: "democrat" },
  { name: "Zachary Taylor", start: 1849, end: 1850, party: "other" },
  { name: "Millard Fillmore", start: 1850, end: 1852, party: "other" },
  { name: "Franklin Pierce", start: 1853, end: 1856, party: "democrat" },
  { name: "James Buchanan", start: 1857, end: 1860, party: "democrat" },
  { name: "Abraham Lincoln", start: 1861, end: 1865, party: "republican" },
  { name: "Andrew Johnson", start: 1865, end: 1868, party: "democrat" },
  { name: "Ulysses S. Grant", start: 1869, end: 1876, party: "republican" },
  { name: "Rutherford B. Hayes", start: 1877, end: 1880, party: "republican" },
  { name: "James A. Garfield", start: 1881, end: 1881, party: "republican" },
  { name: "Chester A. Arthur", start: 1881, end: 1884, party: "republican" },
  { name: "Grover Cleveland", start: 1885, end: 1888, party: "democrat" },
  { name: "Benjamin Harrison", start: 1889, end: 1892, party: "republican" },
  { name: "Grover Cleveland", start: 1893, end: 1896, party: "democrat" },
  { name: "William McKinley", start: 1897, end: 1900, party: "republican" },
  { name: "Theodore Roosevelt", start: 1901, end: 1908, party: "republican" },
  { name: "William Howard Taft", start: 1909, end: 1912, party: "republican" },
  { name: "Woodrow Wilson", start: 1913, end: 1920, party: "democrat" },
  { name: "Warren G. Harding", start: 1921, end: 1923, party: "republican" },
  { name: "Calvin Coolidge", start: 1923, end: 1928, party: "republican" },
  { name: "Herbert Hoover", start: 1929, end: 1932, party: "republican" },
  { name: "Franklin D. Roosevelt", start: 1933, end: 1944, party: "democrat" },
  { name: "Harry S. Truman", start: 1945, end: 1952, party: "democrat" },
  { name: "Dwight D. Eisenhower", start: 1953, end: 1960, party: "republican" },
  { name: "John F. Kennedy", start: 1961, end: 1963, party: "democrat" },
  { name: "Lyndon B. Johnson", start: 1963, end: 1968, party: "democrat" },
  { name: "Richard Nixon", start: 1969, end: 1974, party: "republican" },
  { name: "Gerald Ford", start: 1974, end: 1976, party: "republican" },
  { name: "Jimmy Carter", start: 1977, end: 1980, party: "democrat" },
  { name: "Ronald Reagan", start: 1981, end: 1988, party: "republican" },
  { name: "George H. W. Bush", start: 1989, end: 1992, party: "republican" },
  { name: "Bill Clinton", start: 1993, end: 2000, party: "democrat" },
  { name: "George W. Bush", start: 2001, end: 2008, party: "republican" },
  { name: "Barack Obama", start: 2009, end: 2016, party: "democrat" },
  { name: "Donald Trump", start: 2017, end: 2020, party: "republican" },
  { name: "Joe Biden", start: 2021, end: 2024, party: "democrat" },
  { name: "Donald Trump", start: 2025, end: 2026, party: "republican" },
];

const PRESIDENT_DISPLAY_NAMES = buildPresidentDisplayNames(PRESIDENT_TERMS);

export function presidentDisplayName(fullName) {
  return PRESIDENT_DISPLAY_NAMES.get(fullName) || presidentSurname(fullName);
}

function formatCompactLabel(givenParts, surname) {
  if (givenParts.length === 0) return surname;
  const prefix = givenParts.map((p) => p.replace(/\.$/, "")[0]).join(".");
  return `${prefix}.${surname}`;
}

function buildDisambiguatedDisplayNames(names, reservedLabels, presidentNames) {
  const uniqueNames = [...new Set(names)];
  const bySurname = new Map();
  for (const name of uniqueNames) {
    const surname = presidentSurname(name);
    if (!bySurname.has(surname)) bySurname.set(surname, []);
    bySurname.get(surname).push(name);
  }

  const labels = new Map();
  const labelClashesReserved = (label, fullName) => {
    if (!reservedLabels.has(label)) return false;
    return !presidentNames.some(
      (presName) => presName === fullName && presidentDisplayName(presName) === label,
    );
  };

  for (const group of bySurname.values()) {
    for (const name of group) {
      const surname = presidentSurname(name);
      const given = givenNameParts(name);
      let label = surname;
      for (let n = 0; n <= given.length; n++) {
        label = n === 0 ? surname : formatCompactLabel(given.slice(0, n), surname);
        const groupClash = group.filter(
          (other) => {
            const og = givenNameParts(other);
            const ol = n === 0
              ? presidentSurname(other)
              : formatCompactLabel(og.slice(0, n), presidentSurname(other));
            return ol === label && other !== name;
          },
        ).length;
        if (groupClash === 0 && !labelClashesReserved(label, name)) break;
      }
      labels.set(name, label);
    }
  }
  return labels;
}

export function personDisplayName(fullName) {
  return presidentDisplayName(fullName);
}

// Presidential general elections (year = November election; inauguration is the following year).
export const PRESIDENTIAL_ELECTIONS = [
  { year: 1796, winner: "John Adams", loser: "Thomas Jefferson" },
  { year: 1800, winner: "Thomas Jefferson", loser: "John Adams" },
  { year: 1804, winner: "Thomas Jefferson", loser: "Charles C. Pinckney" },
  { year: 1808, winner: "James Madison", loser: "Charles C. Pinckney" },
  { year: 1812, winner: "James Madison", loser: "DeWitt Clinton" },
  { year: 1816, winner: "James Monroe", loser: "Rufus King" },
  { year: 1824, winner: "John Quincy Adams", loser: "Andrew Jackson" },
  { year: 1828, winner: "Andrew Jackson", loser: "John Quincy Adams" },
  { year: 1832, winner: "Andrew Jackson", loser: "Henry Clay" },
  { year: 1836, winner: "Martin Van Buren", loser: "William Henry Harrison" },
  { year: 1840, winner: "William Henry Harrison", loser: "Martin Van Buren" },
  { year: 1844, winner: "James K. Polk", loser: "Henry Clay" },
  { year: 1848, winner: "Zachary Taylor", loser: "Lewis Cass" },
  { year: 1852, winner: "Franklin Pierce", loser: "Winfield Scott" },
  { year: 1856, winner: "James Buchanan", loser: "John C. Frémont" },
  { year: 1860, winner: "Abraham Lincoln", loser: "Stephen A. Douglas" },
  { year: 1864, winner: "Abraham Lincoln", loser: "George B. McClellan" },
  { year: 1868, winner: "Ulysses S. Grant", loser: "Horatio Seymour" },
  { year: 1872, winner: "Ulysses S. Grant", loser: "Horace Greeley" },
  { year: 1876, winner: "Rutherford B. Hayes", loser: "Samuel J. Tilden" },
  { year: 1880, winner: "James A. Garfield", loser: "Winfield Scott Hancock" },
  { year: 1884, winner: "Grover Cleveland", loser: "James G. Blaine" },
  { year: 1888, winner: "Benjamin Harrison", loser: "Grover Cleveland" },
  { year: 1892, winner: "Grover Cleveland", loser: "Benjamin Harrison" },
  { year: 1896, winner: "William McKinley", loser: "William Jennings Bryan" },
  { year: 1900, winner: "William McKinley", loser: "William Jennings Bryan" },
  { year: 1904, winner: "Theodore Roosevelt", loser: "Alton B. Parker" },
  { year: 1908, winner: "William Howard Taft", loser: "William Jennings Bryan" },
  { year: 1912, winner: "Woodrow Wilson", loser: "William Howard Taft" },
  { year: 1916, winner: "Woodrow Wilson", loser: "Charles Evans Hughes" },
  { year: 1920, winner: "Warren G. Harding", loser: "James M. Cox" },
  { year: 1924, winner: "Calvin Coolidge", loser: "John W. Davis" },
  { year: 1928, winner: "Herbert Hoover", loser: "Alfred E. Smith" },
  { year: 1932, winner: "Franklin D. Roosevelt", loser: "Herbert Hoover" },
  { year: 1936, winner: "Franklin D. Roosevelt", loser: "Alf Landon" },
  { year: 1940, winner: "Franklin D. Roosevelt", loser: "Wendell Willkie" },
  { year: 1944, winner: "Franklin D. Roosevelt", loser: "Thomas E. Dewey" },
  { year: 1948, winner: "Harry S. Truman", loser: "Thomas E. Dewey" },
  { year: 1952, winner: "Dwight D. Eisenhower", loser: "Adlai Stevenson" },
  { year: 1956, winner: "Dwight D. Eisenhower", loser: "Adlai Stevenson" },
  { year: 1960, winner: "John F. Kennedy", loser: "Richard Nixon" },
  { year: 1964, winner: "Lyndon B. Johnson", loser: "Barry Goldwater" },
  { year: 1968, winner: "Richard Nixon", loser: "Hubert Humphrey" },
  { year: 1972, winner: "Richard Nixon", loser: "George McGovern" },
  { year: 1976, winner: "Jimmy Carter", loser: "Gerald Ford" },
  { year: 1980, winner: "Ronald Reagan", loser: "Jimmy Carter" },
  { year: 1984, winner: "Ronald Reagan", loser: "Walter Mondale" },
  { year: 1988, winner: "George H. W. Bush", loser: "Michael Dukakis" },
  { year: 1992, winner: "Bill Clinton", loser: "George H. W. Bush" },
  { year: 1996, winner: "Bill Clinton", loser: "Bob Dole" },
  { year: 2000, winner: "George W. Bush", loser: "Al Gore" },
  { year: 2004, winner: "George W. Bush", loser: "John Kerry" },
  { year: 2008, winner: "Barack Obama", loser: "John McCain" },
  { year: 2012, winner: "Barack Obama", loser: "Mitt Romney" },
  { year: 2016, winner: "Donald Trump", loser: "Hillary Clinton" },
  { year: 2020, winner: "Joe Biden", loser: "Donald Trump" },
  { year: 2024, winner: "Donald Trump", loser: "Kamala Harris" },
];

const PRESIDENT_NAMES = [...new Set(PRESIDENT_TERMS.map((t) => t.name))];
const PRESIDENT_LABELS = new Set(PRESIDENT_NAMES.map((n) => presidentDisplayName(n)));
const ELECTION_OPPONENT_DISPLAY_NAMES = buildDisambiguatedDisplayNames(
  PRESIDENTIAL_ELECTIONS.map((e) => e.loser).filter(Boolean),
  PRESIDENT_LABELS,
  PRESIDENT_NAMES,
);

export function electionOpponentDisplayName(fullName) {
  return ELECTION_OPPONENT_DISPLAY_NAMES.get(fullName)
    || presidentSurname(fullName);
}

export const MULTIYEAR_EVENTS = [
  { label: "Revolutionary War", start: 1775, end: 1783 },
  { label: "Early Republic", start: 1789, end: 1815 },
  { label: "War of 1812", start: 1812, end: 1815 },
  { label: "Antebellum Era", start: 1815, end: 1860 },
  { label: "Mexican-American War", start: 1846, end: 1848 },
  { label: "California Gold Rush", start: 1848, end: 1855 },
  { label: "Civil War", start: 1861, end: 1865 },
  { label: "Reconstruction", start: 1865, end: 1877 },
  { label: "Gilded Age", start: 1870, end: 1900 },
  { label: "Progressive Era", start: 1890, end: 1920 },
  { label: "World War I", start: 1917, end: 1918 },
  { label: "Roaring Twenties", start: 1920, end: 1929 },
  { label: "Great Depression", start: 1929, end: 1939 },
  { label: "World War II", start: 1941, end: 1945 },
  { label: "Cold War", start: 1947, end: 1991 },
  { label: "Dot-com bubble", start: 1995, end: 2000 },
  { label: "Korean War", start: 1950, end: 1953 },
  { label: "Civil Rights Movement", start: 1954, end: 1968 },
  { label: "Vietnam War", start: 1955, end: 1975 },
  { label: "Space Race", start: 1957, end: 1975 },
  { label: "War on Terror", start: 2001, end: 2021 },
  { label: "Iraq War", start: 2003, end: 2011 },
  { label: "COVID-19 Pandemic", start: 2020, end: 2023 },
];
