// Entry point. Holds the small amount of application state, wires DOM
// events, and coordinates the modules. No fetching, no formatting, no
// DOM construction happens here.

import { STORAGE_KEY } from './config.js';
import { searchLocations, fetchForecast } from './api.js';
import * as ui from './ui.js';

const state = {
  place: null,     // { latitude, longitude, label, timezone }
  units: 'metric',
  forecast: null
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
  try {
    state.forecast = await fetchForecast(state.place.latitude, state.place.longitude);
    ui.renderCurrent(state.forecast, state.place, state.units);
  } catch (error) {
    ui.showError('current-body', error.message, loadForecast);
  }
}

async function selectPlace(place) {
  state.place = place;
  ui.hideSuggestions();
  ui.setDocumentLocation(place.label);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(place));
  document.getElementById('search-input').value = place.label;
  await loadForecast();
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

function init() {
  document.getElementById('search-form').addEventListener('submit', handleSearch);
  if (!restoreLastPlace()) {
    ui.showError('current-body', 'Search for a location to begin.', null);
  }
}

init();
