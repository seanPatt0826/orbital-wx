import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  celsiusToFahrenheit,
  kmhToMph,
  describeWeatherCode,
  formatTemperature,
  formatMeasurement,
  monthKeyFromDate,
  computeAnomaly
} from '../js/insights.js';

test('celsiusToFahrenheit converts known reference points', () => {
  assert.equal(celsiusToFahrenheit(0), 32);
  assert.equal(celsiusToFahrenheit(100), 212);
  assert.equal(celsiusToFahrenheit(-40), -40);
});

test('celsiusToFahrenheit returns null for missing input', () => {
  assert.equal(celsiusToFahrenheit(null), null);
  assert.equal(celsiusToFahrenheit(undefined), null);
});

test('kmhToMph converts and returns null for missing input', () => {
  assert.ok(Math.abs(kmhToMph(100) - 62.1371) < 0.001);
  assert.equal(kmhToMph(null), null);
});

test('describeWeatherCode maps known codes', () => {
  assert.deepEqual(describeWeatherCode(0), { label: 'Clear sky', icon: 'clear' });
  assert.deepEqual(describeWeatherCode(95), { label: 'Thunderstorm', icon: 'storm' });
});

test('describeWeatherCode falls back for unknown or missing codes', () => {
  assert.deepEqual(describeWeatherCode(999), { label: 'Unknown', icon: 'unknown' });
  assert.deepEqual(describeWeatherCode(null), { label: 'Unknown', icon: 'unknown' });
});

test('formatTemperature renders metric and imperial', () => {
  assert.equal(formatTemperature(21.5, 'metric'), '21.5 C');
  assert.equal(formatTemperature(0, 'imperial'), '32.0 F');
});

test('formatTemperature renders an em dash for missing values', () => {
  assert.equal(formatTemperature(null, 'metric'), '—');
  assert.equal(formatTemperature(undefined, 'imperial'), '—');
});

test('formatMeasurement appends units and honours digits', () => {
  assert.equal(formatMeasurement(12.66, 'km/h', 1), '12.7 km/h');
  assert.equal(formatMeasurement(73, '%', 0), '73 %');
});

test('formatMeasurement renders an em dash for missing values', () => {
  assert.equal(formatMeasurement(null, 'mm', 1), '—');
});

test('formatMeasurement omits the separator when there is no unit', () => {
  // The UV index column has no unit label; it must not render "7.8 ".
  // Note: avoid values such as 7.85 here. Binary floating point stores that
  // as slightly less than 7.85, so toFixed(1) yields "7.8" rather than the
  // "7.9" decimal intuition suggests. That is correct arithmetic, not a bug.
  assert.equal(formatMeasurement(7.8, '', 1), '7.8');
});

test('monthKeyFromDate returns the POWER month abbreviation', () => {
  assert.equal(monthKeyFromDate(new Date('2026-08-06T12:00:00Z')), 'AUG');
  assert.equal(monthKeyFromDate(new Date('2026-01-31T12:00:00Z')), 'JAN');
  assert.equal(monthKeyFromDate(new Date('2026-12-01T12:00:00Z')), 'DEC');
});

test('computeAnomaly subtracts the monthly normal from today mean', () => {
  const normals = { AUG: 20.47, JAN: 12.91 };
  // Real verified figures: Lisbon forecast mean 23.9 against an August normal of 20.47.
  assert.ok(Math.abs(computeAnomaly(23.9, normals, 'AUG', -999) - 3.43) < 0.001);
  assert.ok(Math.abs(computeAnomaly(10.0, normals, 'JAN', -999) - -2.91) < 0.001);
});

test('computeAnomaly returns null when the normal is a fill value', () => {
  assert.equal(computeAnomaly(23.9, { AUG: -999 }, 'AUG', -999), null);
});

test('computeAnomaly returns null when inputs are missing', () => {
  assert.equal(computeAnomaly(null, { AUG: 20.47 }, 'AUG', -999), null);
  assert.equal(computeAnomaly(23.9, null, 'AUG', -999), null);
  assert.equal(computeAnomaly(23.9, { AUG: 20.47 }, 'SEP', -999), null);
});
