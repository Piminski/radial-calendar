const CELESTIAL_RE = /\b(meteor shower|equinox|solstice|supermoon)\b/i;

export const CELESTIAL_LABEL_SCALE = 0.88;

export function isCelestialLabel(label) {
  return CELESTIAL_RE.test(label);
}
