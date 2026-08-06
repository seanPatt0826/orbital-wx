import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  celsiusToFahrenheit,
  kmhToMph,
  describeWeatherCode,
  formatTemperature,
  formatMeasurement
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
