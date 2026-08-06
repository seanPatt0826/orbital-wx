// Pure logic. No network, no DOM, no side effects.
// Everything here is unit tested, which is only possible because it is pure.

import { WMO_CODES } from './config.js';

// Rendered whenever a value is genuinely unavailable. Never render a zero
// or a guess in its place.
export const EM_DASH = '—';

/** True only for real, finite numbers. Guards every formatter below. */
function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function celsiusToFahrenheit(celsius) {
  if (!isNumber(celsius)) return null;
  return celsius * 9 / 5 + 32;
}

export function kmhToMph(kmh) {
  if (!isNumber(kmh)) return null;
  return kmh * 0.621371;
}

/** Maps a WMO weather interpretation code to a label and an SVG icon id. */
export function describeWeatherCode(code) {
  const entry = WMO_CODES[code];
  if (!entry) return { label: 'Unknown', icon: 'unknown' };
  return entry;
}

/**
 * Formats a Celsius value for display. Conversion happens here, at render
 * time, so all stored values and all threshold comparisons stay metric.
 */
export function formatTemperature(celsius, units) {
  if (!isNumber(celsius)) return EM_DASH;
  if (units === 'imperial') {
    return `${celsiusToFahrenheit(celsius).toFixed(1)} F`;
  }
  return `${celsius.toFixed(1)} C`;
}

/** Formats any other measurement with an explicit unit label. */
export function formatMeasurement(value, unit, digits = 1) {
  if (!isNumber(value)) return EM_DASH;
  // trim() covers the unitless case, such as the UV index.
  return `${value.toFixed(digits)} ${unit}`.trim();
}
