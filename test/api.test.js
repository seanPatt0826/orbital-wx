import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildForecastUrl,
  buildGeocodingUrl,
  buildAirQualityUrl,
  buildClimateNormalsUrl,
  buildEpicImageUrl,
  ApiError
} from '../js/api.js';

test('buildForecastUrl requests every field the UI needs, in metric', () => {
  const url = new URL(buildForecastUrl(38.72, -9.14));
  assert.equal(url.origin + url.pathname, 'https://api.open-meteo.com/v1/forecast');
  assert.equal(url.searchParams.get('latitude'), '38.72');
  assert.equal(url.searchParams.get('longitude'), '-9.14');
  assert.equal(url.searchParams.get('timezone'), 'auto');
  assert.equal(url.searchParams.get('forecast_days'), '7');

  const daily = url.searchParams.get('daily');
  for (const field of [
    'temperature_2m_mean', 'temperature_2m_max', 'temperature_2m_min',
    'uv_index_max', 'precipitation_probability_max', 'weather_code'
  ]) {
    assert.ok(daily.includes(field), `daily should request ${field}`);
  }

  const current = url.searchParams.get('current');
  for (const field of [
    'temperature_2m', 'relative_humidity_2m', 'apparent_temperature',
    'precipitation', 'weather_code', 'wind_speed_10m'
  ]) {
    assert.ok(current.includes(field), `current should request ${field}`);
  }
});

test('buildGeocodingUrl encodes the query safely', () => {
  const url = new URL(buildGeocodingUrl('Sao Paulo & co'));
  assert.equal(url.searchParams.get('name'), 'Sao Paulo & co');
  assert.equal(url.searchParams.get('count'), '5');
});

test('buildAirQualityUrl requests AQI and particulates', () => {
  const url = new URL(buildAirQualityUrl(38.72, -9.14));
  const current = url.searchParams.get('current');
  assert.ok(current.includes('us_aqi'));
  assert.ok(current.includes('pm2_5'));
});

test('buildClimateNormalsUrl targets the POWER climatology endpoint', () => {
  const url = new URL(buildClimateNormalsUrl(38.72, -9.14));
  assert.equal(url.origin + url.pathname, 'https://power.larc.nasa.gov/api/temporal/climatology/point');
  assert.equal(url.searchParams.get('parameters'), 'T2M,PRECTOTCORR');
  assert.equal(url.searchParams.get('community'), 'RE');
  assert.equal(url.searchParams.get('format'), 'JSON');
});

test('buildEpicImageUrl derives the archive path from the entry date', () => {
  const entry = { image: 'epic_1b_20260802010437', date: '2026-08-02 00:59:48' };
  assert.equal(
    buildEpicImageUrl(entry),
    'https://epic.gsfc.nasa.gov/archive/natural/2026/08/02/jpg/epic_1b_20260802010437.jpg'
  );
});

test('buildEpicImageUrl returns null for a malformed entry', () => {
  assert.equal(buildEpicImageUrl(null), null);
  assert.equal(buildEpicImageUrl({ image: 'x' }), null);
});

test('ApiError records which source failed', () => {
  const err = new ApiError('NASA POWER', 'timed out');
  assert.equal(err.source, 'NASA POWER');
  assert.ok(err.message.includes('NASA POWER'));
  assert.ok(err instanceof Error);
});
