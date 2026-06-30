// Parse defining-events markdown table into { year: [labels] }.

export function parseYearEventsMarkdown(text) {
  const events = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^\|\s*(\d{4})\s*\|\s*(.+?)\s*\|?\s*$/);
    if (!m) continue;
    const year = parseInt(m[1], 10);
    let label = m[2].trim();
    if (label.endsWith("|")) label = label.slice(0, -1).trim();
    if (!label) continue;
    events[year] = [label];
  }
  return events;
}

export function splitEventParts(label) {
  return label.split(/\s*[;/]\s*/).map((s) => s.trim()).filter(Boolean);
}
