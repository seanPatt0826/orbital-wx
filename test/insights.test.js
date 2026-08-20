import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  celsiusToFahrenheit,
  kmhToMph,
  describeWeatherCode,
  formatTemperature,
  formatMeasurement,
  monthKeyFromDate,
  monthKeyFromIsoDate,
  celsiusDeltaToFahrenheit,
  formatTemperatureDelta,
  firstValue,
  computeAnomaly,
  aqiCategory,
  buildTips
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
  // Constructed as local dates, not as "...Z" instants. monthKeyFromDate reads
  // the local month, so a UTC instant near a month boundary would make this
  // test pass or fail according to the machine's timezone rather than the code.
  assert.equal(monthKeyFromDate(new Date(2026, 7, 6)), 'AUG');
  assert.equal(monthKeyFromDate(new Date(2026, 0, 31)), 'JAN');
  assert.equal(monthKeyFromDate(new Date(2026, 11, 1)), 'DEC');
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

test('aqiCategory classifies each US AQI band', () => {
  assert.deepEqual(aqiCategory(0), { label: 'Good', level: 1 });
  assert.deepEqual(aqiCategory(50), { label: 'Good', level: 1 });
  assert.deepEqual(aqiCategory(51), { label: 'Moderate', level: 2 });
  assert.deepEqual(aqiCategory(101), { label: 'Unhealthy for sensitive groups', level: 3 });
  assert.deepEqual(aqiCategory(151), { label: 'Unhealthy', level: 4 });
  assert.deepEqual(aqiCategory(201), { label: 'Very unhealthy', level: 5 });
  assert.deepEqual(aqiCategory(301), { label: 'Hazardous', level: 6 });
});

test('aqiCategory returns null for missing input', () => {
  assert.equal(aqiCategory(null), null);
});

test('buildTips returns an empty array for benign conditions', () => {
  const tips = buildTips({
    uvIndexMax: 2, windSpeedKmh: 5, usAqi: 20,
    precipProbabilityMax: 5, anomalyC: 0.4, apparentTemperatureC: 18
  });
  assert.deepEqual(tips, []);
});

test('buildTips fires exactly at each threshold boundary', () => {
  const ids = (c) => buildTips(c).map((t) => t.id);
  assert.deepEqual(ids({ uvIndexMax: 6 }), ['uv']);
  assert.deepEqual(ids({ uvIndexMax: 5.9 }), []);
  assert.deepEqual(ids({ windSpeedKmh: 40 }), ['wind']);
  assert.deepEqual(ids({ windSpeedKmh: 39.9 }), []);
  assert.deepEqual(ids({ precipProbabilityMax: 60 }), ['precip']);
  assert.deepEqual(ids({ apparentTemperatureC: 32 }), ['heat']);
  assert.deepEqual(ids({ apparentTemperatureC: 0 }), ['freeze']);
  assert.deepEqual(ids({ anomalyC: 3 }), ['anomaly-warm']);
  assert.deepEqual(ids({ anomalyC: -3 }), ['anomaly-cool']);
});

test('buildTips emits both the health tip and the aerosol cross-link when AQI is elevated', () => {
  const ids = buildTips({ usAqi: 101 }).map((t) => t.id);
  assert.deepEqual(ids, ['aqi', 'aqi-aerosol']);
});

test('buildTips ignores missing values entirely', () => {
  assert.deepEqual(buildTips({}), []);
  assert.deepEqual(buildTips({ uvIndexMax: null, usAqi: null }), []);
});

test('every tip carries an id, severity, title and body', () => {
  const tips = buildTips({ uvIndexMax: 9, windSpeedKmh: 55, usAqi: 160 });
  assert.ok(tips.length > 0);
  for (const tip of tips) {
    assert.equal(typeof tip.id, 'string');
    assert.ok(['info', 'caution', 'warning'].includes(tip.severity));
    assert.ok(tip.title.length > 0);
    assert.ok(tip.body.length > 0);
  }
});

// ---------------------------------------------------------------------------
// Exactness tests added after auditing the pure functions against the spec.
// ---------------------------------------------------------------------------

test('computeAnomaly rejects the POWER fill value when no fill value is passed', () => {
  // POWER states the fill in header.fill_value, but a malformed or truncated
  // response can omit the header. The default must still be -999, otherwise
  // the function returns a fabricated 1022.9 degree anomaly.
  assert.equal(computeAnomaly(23.9, { AUG: -999 }, 'AUG'), null);
});

test('monthKeyFromIsoDate reads the month from a location-local date string', () => {
  assert.equal(monthKeyFromIsoDate('2026-01-01'), 'JAN');
  assert.equal(monthKeyFromIsoDate('2026-08-31'), 'AUG');
  assert.equal(monthKeyFromIsoDate('2026-09-01'), 'SEP');
  assert.equal(monthKeyFromIsoDate('2026-12-31'), 'DEC');
});

test('monthKeyFromIsoDate never shifts with the machine timezone', () => {
  // The whole point: "2026-08-31" is August at the location regardless of
  // where the browser sits. Parsing it through Date would shift the day.
  assert.equal(monthKeyFromIsoDate('2026-08-31'), 'AUG');
  assert.equal(monthKeyFromIsoDate('2026-08-31T00:00'), 'AUG');
});

test('monthKeyFromIsoDate returns null for malformed input', () => {
  assert.equal(monthKeyFromIsoDate(null), null);
  assert.equal(monthKeyFromIsoDate(''), null);
  assert.equal(monthKeyFromIsoDate('not-a-date'), null);
  assert.equal(monthKeyFromIsoDate('2026-13-01'), null);
  assert.equal(monthKeyFromIsoDate('2026-00-01'), null);
});

test('celsiusDeltaToFahrenheit scales a difference without the 32 degree offset', () => {
  // A 4.2 C anomaly is a 7.6 F anomaly, not a 39.6 F one.
  assert.equal(celsiusDeltaToFahrenheit(0), 0);
  assert.ok(Math.abs(celsiusDeltaToFahrenheit(4.2) - 7.56) < 1e-9);
  assert.equal(celsiusDeltaToFahrenheit(-5), -9);
  assert.equal(celsiusDeltaToFahrenheit(null), null);
});

test('formatMeasurement omits the unit when none is given', () => {
  assert.equal(formatMeasurement(5), '5.0');
});

test('describeWeatherCode does not hand out the shared config entry', () => {
  const first = describeWeatherCode(0);
  first.label = 'MUTATED';
  assert.deepEqual(describeWeatherCode(0), { label: 'Clear sky', icon: 'clear' });
});

test('firstValue reads a forecast series without throwing on absent fields', () => {
  // Open-Meteo omits a field entirely when it has nothing to report, so
  // daily.uv_index_max[0] throws rather than yielding null.
  assert.equal(firstValue([3, 4]), 3);
  assert.equal(firstValue([0]), 0);
  assert.equal(firstValue([]), null);
  assert.equal(firstValue(undefined), null);
  assert.equal(firstValue(null), null);
  assert.equal(firstValue([null, 5]), null);
  assert.equal(firstValue('not an array'), null);
});

test('the air quality tip escalates from caution to warning at the unhealthy boundary', () => {
  const severity = (usAqi) => buildTips({ usAqi }).find((t) => t.id === 'aqi').severity;
  assert.equal(severity(101), 'caution');
  assert.equal(severity(150), 'caution');
  assert.equal(severity(151), 'warning');
});

// ---------------------------------------------------------------------------
// Tips must read in the unit the user is viewing. The rules still evaluate
// metric values, so which unit is displayed can never change which tips fire.
// ---------------------------------------------------------------------------

test('buildTips renders absolute temperatures in the display unit', () => {
  const body = (units) => buildTips({ apparentTemperatureC: 35 }, units).find((t) => t.id === 'heat').body;
  assert.match(body('metric'), /35\.0 C/);
  assert.match(body('imperial'), /95\.0 F/);
  assert.doesNotMatch(body('imperial'), / C\b/);
});

test('buildTips renders the anomaly as a difference, not a temperature', () => {
  // 4 C above the average is 7.2 F above it. Formatting it as a temperature
  // would add the 32 degree offset and claim 39.2 F.
  const body = (units) => buildTips({ anomalyC: 4 }, units).find((t) => t.id === 'anomaly-warm').body;
  assert.match(body('metric'), /4\.0 C/);
  assert.match(body('imperial'), /7\.2 F/);
  assert.doesNotMatch(body('imperial'), /39\.2/);
});

test('buildTips renders wind speed in the display unit', () => {
  const body = (units) => buildTips({ windSpeedKmh: 50 }, units).find((t) => t.id === 'wind').body;
  assert.match(body('metric'), /50 km\/h/);
  assert.match(body('imperial'), /31 mph/);
});

test('buildTips fires on the same metric thresholds whichever unit is displayed', () => {
  const ids = (c, u) => buildTips(c, u).map((t) => t.id);
  for (const units of ['metric', 'imperial']) {
    assert.deepEqual(ids({ apparentTemperatureC: 32 }, units), ['heat'], `at 32 C, ${units}`);
    assert.deepEqual(ids({ apparentTemperatureC: 31.9 }, units), [], `at 31.9 C, ${units}`);
    assert.deepEqual(ids({ windSpeedKmh: 40 }, units), ['wind'], `at 40 km/h, ${units}`);
    assert.deepEqual(ids({ anomalyC: 3 }, units), ['anomaly-warm'], `at +3 C, ${units}`);
  }
});

test('buildTips defaults to metric when no unit is given', () => {
  assert.match(buildTips({ apparentTemperatureC: 35 })[0].body, /35\.0 C/);
});

test('formatTemperatureDelta formats a difference in either unit', () => {
  // Shared by the anomaly card and the anomaly tip so the two can never
  // disagree, and so neither can reach for formatTemperature by mistake.
  assert.equal(formatTemperatureDelta(4, 'metric'), '4.0 C');
  assert.equal(formatTemperatureDelta(4, 'imperial'), '7.2 F');
  assert.equal(formatTemperatureDelta(0, 'imperial'), '0.0 F');
  assert.equal(formatTemperatureDelta(-2.5, 'metric'), '-2.5 C');
  assert.equal(formatTemperatureDelta(null, 'metric'), '—');
});
