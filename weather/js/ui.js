// The only file that touches the DOM. Every function takes plain data and
// returns nothing; nothing here fetches, and nothing here calculates.

import {
  describeWeatherCode,
  formatTemperature,
  formatMeasurement,
  kmhToMph,
  EM_DASH
} from './insights.js';

const $ = (id) => document.getElementById(id);

/** Removes all children without the security pitfalls of innerHTML = ''. */
function clear(element) {
  while (element.firstChild) element.removeChild(element.firstChild);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Builds an <svg><use> reference into the sprite defined in index.html. */
function icon(name, className = 'icon') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#icon-${name}`);
  svg.appendChild(use);
  return svg;
}

/** A labelled value in the instrument-cluster readout style. */
function readout(label, value) {
  const row = element('div', 'readout');
  row.appendChild(element('span', 'readout__label', label));
  row.appendChild(element('span', 'readout__value', value));
  return row;
}

export function showLoading(panelId) {
  const panel = $(panelId);
  clear(panel);
  panel.appendChild(element('p', 'state state--loading', 'Loading'));
}

/**
 * Renders a failure honestly, naming the source that failed and offering a
 * retry that re-runs only that request.
 */
export function showError(panelId, message, onRetry) {
  const panel = $(panelId);
  clear(panel);
  const wrap = element('div', 'state state--error');
  wrap.appendChild(element('p', 'state__message', message));
  if (onRetry) {
    const button = element('button', 'btn btn--small', 'Retry');
    button.type = 'button';
    button.addEventListener('click', onRetry);
    wrap.appendChild(button);
  }
  panel.appendChild(wrap);
}

export function setDocumentLocation(label) {
  document.title = `${label} - Orbital WX`;
}

/**
 * Current conditions. `data` is the raw Open-Meteo forecast response;
 * `place` is the resolved location record.
 */
export function renderCurrent(data, place, units) {
  const body = $('current-body');
  clear(body);

  const current = data.current || {};
  const condition = describeWeatherCode(current.weather_code);

  const head = element('div', 'current__head');
  head.appendChild(icon(condition.icon, 'icon icon--large'));

  const headText = element('div', 'current__headtext');
  headText.appendChild(element('p', 'current__place', place.label));
  headText.appendChild(element('p', 'current__temp', formatTemperature(current.temperature_2m, units)));
  headText.appendChild(element('p', 'current__condition', condition.label));
  head.appendChild(headText);
  body.appendChild(head);

  const wind = units === 'imperial'
    ? formatMeasurement(kmhToMph(current.wind_speed_10m), 'mph', 1)
    : formatMeasurement(current.wind_speed_10m, 'km/h', 1);

  const grid = element('div', 'readouts');
  grid.appendChild(readout('Feels like', formatTemperature(current.apparent_temperature, units)));
  grid.appendChild(readout('Humidity', formatMeasurement(current.relative_humidity_2m, '%', 0)));
  grid.appendChild(readout('Wind', wind));
  grid.appendChild(readout('Precipitation', formatMeasurement(current.precipitation, 'mm', 1)));
  body.appendChild(grid);

  const observed = current.time
    ? `Observed ${current.time.replace('T', ' ')} local time`
    : EM_DASH;
  body.appendChild(element('p', 'panel__note', observed));
}

/** Renders the geocoding suggestions as an accessible listbox. */
export function renderSuggestions(results, onPick) {
  const list = $('search-results');
  const input = $('search-input');
  clear(list);

  if (results.length === 0) {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    return;
  }

  results.forEach((result, index) => {
    const item = element('li', 'search__result');
    item.id = `search-result-${index}`;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', 'false');
    item.tabIndex = -1;

    const parts = [result.name, result.admin1, result.country].filter(Boolean);
    item.textContent = parts.join(', ');
    item.addEventListener('click', () => onPick(result));
    list.appendChild(item);
  });

  list.hidden = false;
  input.setAttribute('aria-expanded', 'true');
}

export function hideSuggestions() {
  const list = $('search-results');
  clear(list);
  list.hidden = true;
  $('search-input').setAttribute('aria-expanded', 'false');
}
