// Entry point. Holds the small amount of application state, wires DOM
// events, and coordinates the modules. No fetching, no formatting, no
// DOM construction happens here.

import { STORAGE_KEY, POWER_FILL_VALUE } from './config.js';
import { searchLocations, fetchForecast, fetchClimateNormals, fetchAirQuality } from './api.js';
import { computeAnomaly, monthKeyFromDate, buildTips } from './insights.js';
import * as ui from './ui.js';
import * as mapView from './map.js';

const state = {
  place: null,     // { latitude, longitude, label, timezone }
  units: 'metric',
  forecast: null,
  normals: null,
  airQuality: null,
  anomaly: null
};

/** Builds the display label once, so every panel shows the same name. */
function toPlace(result) {
  const parts = [result.name, result.admin1, result.country].filter(Boolean);
  return {
    latitude: result.latitude,
    longitude: result.longitude,
    timezone: result.timezone,
    label: parts.join(', ')
  };
}

async function loadForecast() {
  ui.showLoading('current-body');
  ui.showLoading('hourly-body');
  ui.showLoading('daily-body');
  try {
    state.forecast = await fetchForecast(state.place.latitude, state.place.longitude);
    ui.renderCurrent(state.forecast, state.place, state.units);
    ui.renderHourly(state.forecast, state.units);
    ui.renderDaily(state.forecast, state.units);
  } catch (error) {
    ui.showError('current-body', error.message, loadForecast);
    ui.showError('hourly-body', error.message, loadForecast);
    ui.showError('daily-body', error.message, loadForecast);
  }
}

/**
 * Recomputes the tips from whatever data has successfully arrived.
 * Called after each panel loads, so advice appears progressively.
 */
function refreshTips() {
  const daily = state.forecast && state.forecast.daily;
  const current = state.forecast && state.forecast.current;
  const air = state.airQuality && state.airQuality.current;

  ui.renderTips(buildTips({
    uvIndexMax: daily ? daily.uv_index_max[0] : null,
    precipProbabilityMax: daily ? daily.precipitation_probability_max[0] : null,
    windSpeedKmh: current ? current.wind_speed_10m : null,
    apparentTemperatureC: current ? current.apparent_temperature : null,
    usAqi: air ? air.us_aqi : null,
    anomalyC: state.anomaly
  }));
}

/** Reads the baseline metadata POWER reports, rather than hardcoding it. */
function normalsMeta(data, monthKey, fillValue) {
  const normals = data.properties.parameter.T2M;
  return {
    monthKey,
    normalC: normals[monthKey] === fillValue ? null : normals[monthKey],
    baseline: (data.header && data.header.range) || 'unstated',
    sources: ((data.header && data.header.sources) || []).join(', ') || 'NASA POWER'
  };
}

async function loadClimateNormals() {
  ui.showLoading('anomaly-body');
  try {
    const data = await fetchClimateNormals(state.place.latitude, state.place.longitude);
    state.normals = data;

    const fillValue = (data.header && data.header.fill_value) ?? POWER_FILL_VALUE;
    const normals = data.properties.parameter.T2M;
    const monthKey = monthKeyFromDate(new Date());
    const todayMean = state.forecast ? state.forecast.daily.temperature_2m_mean[0] : null;

    state.anomaly = computeAnomaly(todayMean, normals, monthKey, fillValue);

    ui.renderAnomaly(state.anomaly, normalsMeta(data, monthKey, fillValue), state.units);
    refreshTips();
  } catch (error) {
    ui.showError('anomaly-body', error.message, loadClimateNormals);
  }
}

async function loadAirQuality() {
  ui.showLoading('air-body');
  try {
    state.airQuality = await fetchAirQuality(state.place.latitude, state.place.longitude);
    ui.renderAirQuality(state.airQuality);
    refreshTips();
  } catch (error) {
    ui.showError('air-body', error.message, loadAirQuality);
  }
}

async function selectPlace(place) {
  state.place = place;
  ui.hideSuggestions();
  ui.setDocumentLocation(place.label);
  mapView.flyTo(place.latitude, place.longitude, place.label);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(place));
  document.getElementById('search-input').value = place.label;

  // The forecast must land before the anomaly, which needs today's mean.
  await loadForecast();
  refreshTips();
  loadClimateNormals();
  loadAirQuality();
}

async function handleSearch(event) {
  event.preventDefault();
  const query = document.getElementById('search-input').value.trim();
  if (query.length < 2) return;

  try {
    const results = await searchLocations(query);
    if (results.length === 0) {
      ui.showError('current-body', `No location matches "${query}".`, null);
      return;
    }
    ui.renderSuggestions(results, (result) => selectPlace(toPlace(result)));
  } catch (error) {
    ui.showError('current-body', error.message, () => handleSearch(event));
  }
}

function restoreLastPlace() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return false;
  try {
    selectPlace(JSON.parse(saved));
    return true;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return false;
  }
}

function describeLayer(config) {
  document.getElementById('map-note').textContent =
    `${config.description} Layer: ${config.layer}, imagery dated ${mapView.gibsDateString()}.`;
}

function setupMap() {
  mapView.initMap('map');
  const active = mapView.renderLayerSwitch('layer-switch', describeLayer);
  describeLayer(active);
}

function init() {
  document.getElementById('search-form').addEventListener('submit', handleSearch);
  // The map must exist before selectPlace can fly to a restored location.
  setupMap();
  if (!restoreLastPlace()) {
    ui.showError('current-body', 'Search for a location to begin.', null);
  }
}

init();
