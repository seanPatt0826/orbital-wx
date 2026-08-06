// The only file in this project that touches the network.
// If data is missing or stale, the bug is here. If a number is wrong,
// the bug is in insights.js. If it looks wrong, the bug is in ui.js.

import { API, REQUEST_TIMEOUT_MS } from './config.js';

/** Carries the human-readable source name so the UI can say what failed. */
export class ApiError extends Error {
  constructor(source, detail) {
    super(`${source} request failed: ${detail}`);
    this.name = 'ApiError';
    this.source = source;
  }
}

// ---------------------------------------------------------------------------
// URL builders. Pure, and therefore unit tested.
// ---------------------------------------------------------------------------

const CURRENT_FIELDS = [
  'temperature_2m', 'relative_humidity_2m', 'apparent_temperature',
  'precipitation', 'weather_code', 'wind_speed_10m', 'wind_direction_10m', 'is_day'
].join(',');

const HOURLY_FIELDS = [
  'temperature_2m', 'precipitation_probability', 'weather_code'
].join(',');

const DAILY_FIELDS = [
  'weather_code', 'temperature_2m_max', 'temperature_2m_min', 'temperature_2m_mean',
  'precipitation_sum', 'precipitation_probability_max', 'uv_index_max', 'wind_speed_10m_max'
].join(',');

export function buildForecastUrl(latitude, longitude) {
  const url = new URL(API.forecast);
  // Always metric. Conversion to imperial happens at render time only, so
  // stored values and threshold comparisons never depend on the display unit.
  url.search = new URLSearchParams({
    latitude, longitude,
    current: CURRENT_FIELDS,
    hourly: HOURLY_FIELDS,
    daily: DAILY_FIELDS,
    timezone: 'auto',
    forecast_days: '7'
  }).toString();
  return url.toString();
}

export function buildGeocodingUrl(query) {
  const url = new URL(API.geocoding);
  url.search = new URLSearchParams({
    name: query, count: '5', language: 'en', format: 'json'
  }).toString();
  return url.toString();
}

export function buildAirQualityUrl(latitude, longitude) {
  const url = new URL(API.airQuality);
  url.search = new URLSearchParams({
    latitude, longitude,
    current: 'us_aqi,pm2_5,pm10',
    timezone: 'auto'
  }).toString();
  return url.toString();
}

export function buildClimateNormalsUrl(latitude, longitude) {
  const url = new URL(API.power);
  url.search = new URLSearchParams({
    parameters: 'T2M,PRECTOTCORR',
    community: 'RE',
    latitude, longitude,
    format: 'JSON'
  }).toString();
  return url.toString();
}

/**
 * EPIC returns an image id and a capture date; the archive path is derived
 * from them. The jpg variant is roughly 220 KB against 2.9 MB for the png,
 * which matters on a demo connection.
 */
export function buildEpicImageUrl(entry) {
  if (!entry || typeof entry.image !== 'string' || typeof entry.date !== 'string') {
    return null;
  }
  const [datePart] = entry.date.split(' ');
  const [year, month, day] = datePart.split('-');
  if (!year || !month || !day) return null;
  return `${API.epicArchive}/${year}/${month}/${day}/jpg/${entry.image}.jpg`;
}

// ---------------------------------------------------------------------------
// Fetchers. Every one times out rather than hanging the panel forever.
// ---------------------------------------------------------------------------

async function getJson(url, source) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new ApiError(source, `HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error.name === 'AbortError') {
      throw new ApiError(source, `no response within ${REQUEST_TIMEOUT_MS / 1000} seconds`);
    }
    throw new ApiError(source, error.message);
  } finally {
    clearTimeout(timer);
  }
}

/** Returns up to five candidate locations, or an empty array if none match. */
export async function searchLocations(query) {
  const data = await getJson(buildGeocodingUrl(query), 'Location search');
  return data.results || [];
}

export function fetchForecast(latitude, longitude) {
  return getJson(buildForecastUrl(latitude, longitude), 'Open-Meteo forecast');
}

export function fetchAirQuality(latitude, longitude) {
  return getJson(buildAirQualityUrl(latitude, longitude), 'Air quality');
}

export function fetchClimateNormals(latitude, longitude) {
  return getJson(buildClimateNormalsUrl(latitude, longitude), 'NASA POWER');
}

/** Returns the most recent EPIC capture, or null when the archive is empty. */
export async function fetchLatestEpic() {
  const data = await getJson(API.epicApi, 'NASA EPIC');
  if (!Array.isArray(data) || data.length === 0) return null;
  return data[0];
}
