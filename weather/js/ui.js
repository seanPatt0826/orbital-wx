// The only file that touches the DOM. Every function takes plain data and
// returns nothing; nothing here fetches, and nothing here calculates.

import {
  describeWeatherCode,
  formatTemperature,
  formatMeasurement,
  aqiCategory,
  kmhToMph,
  celsiusDeltaToFahrenheit,
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

/**
 * Arrow keys move through the suggestion listbox, Enter selects, Escape
 * dismisses. Without this the search is unusable without a mouse.
 */
export function enableSuggestionKeyboard() {
  const input = $('search-input');
  const list = $('search-results');
  let activeIndex = -1;

  function setActive(index) {
    const items = Array.from(list.children);
    if (items.length === 0) return;
    activeIndex = (index + items.length) % items.length;
    items.forEach((item, i) => {
      const isActive = i === activeIndex;
      item.classList.toggle('is-active', isActive);
      item.setAttribute('aria-selected', String(isActive));
      if (isActive) input.setAttribute('aria-activedescendant', item.id);
    });
  }

  input.addEventListener('keydown', (event) => {
    if (list.hidden) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive(activeIndex + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(activeIndex - 1);
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      list.children[activeIndex].click();
      activeIndex = -1;
    } else if (event.key === 'Escape') {
      hideSuggestions();
      activeIndex = -1;
    }
  });
}

/**
 * Finds the index of the current hour within the hourly series.
 * Open-Meteo returns 168 hours starting at midnight local time, so the
 * strip must start from now rather than from the top of the array.
 */
function currentHourIndex(hourly, currentTime) {
  if (!currentTime) return 0;
  const stamp = currentTime.slice(0, 13); // "2026-08-06T09"
  const found = hourly.time.findIndex((t) => t.slice(0, 13) === stamp);
  return found === -1 ? 0 : found;
}

export function renderHourly(data, units) {
  const body = $('hourly-body');
  clear(body);

  const hourly = data.hourly;
  const start = currentHourIndex(hourly, data.current && data.current.time);
  const slice = [];
  for (let i = start; i < Math.min(start + 24, hourly.time.length); i += 1) {
    slice.push({
      time: hourly.time[i],
      temperature: hourly.temperature_2m[i],
      precipProbability: hourly.precipitation_probability[i],
      code: hourly.weather_code[i]
    });
  }

  // Bars are scaled across the visible window only, so the shape of the
  // day is legible whatever the absolute temperatures are.
  const temps = slice.map((h) => h.temperature).filter((t) => typeof t === 'number');
  if (temps.length === 0) {
    body.appendChild(element('p', 'state', 'Hourly temperatures unavailable.'));
    return;
  }
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const span = max - min || 1;

  const strip = element('div', 'hourly');
  for (const hour of slice) {
    const cell = element('div', 'hourly__cell');
    cell.appendChild(element('span', 'hourly__time', hour.time.slice(11, 16)));

    const bar = element('div', 'hourly__bar');
    const fill = element('div', 'hourly__fill');
    const height = typeof hour.temperature === 'number'
      ? 12 + ((hour.temperature - min) / span) * 88
      : 0;
    fill.style.height = `${height}%`;
    bar.appendChild(fill);
    cell.appendChild(bar);

    cell.appendChild(element('span', 'hourly__temp', formatTemperature(hour.temperature, units)));
    cell.appendChild(icon(describeWeatherCode(hour.code).icon, 'icon icon--small'));
    cell.appendChild(element('span', 'hourly__precip',
      typeof hour.precipProbability === 'number' ? `${hour.precipProbability}%` : EM_DASH));
    strip.appendChild(cell);
  }
  // A region that scrolls only under the pointer is unreachable by keyboard,
  // so it is made focusable and named for screen readers.
  strip.tabIndex = 0;
  strip.setAttribute('role', 'region');
  strip.setAttribute('aria-label', 'Hourly forecast, scrolls horizontally');
  body.appendChild(strip);
}

/**
 * The headline. Shows the signed difference, states exactly what was
 * compared, and cites the baseline period POWER itself reported.
 */
export function renderAnomaly(anomalyC, meta, units) {
  const body = $('anomaly-body');
  clear(body);

  if (anomalyC === null) {
    body.appendChild(element('p', 'state', 'Climate normals unavailable for this point.'));
    return;
  }

  const warmer = anomalyC >= 0;
  const magnitude = Math.abs(anomalyC);
  // This is a temperature DIFFERENCE, not a temperature, so it converts with
  // the 9/5 ratio alone. The arithmetic lives in insights.js where it is unit
  // tested; using celsiusToFahrenheit here would add 32 to every anomaly.
  const shown = units === 'imperial'
    ? `${celsiusDeltaToFahrenheit(magnitude).toFixed(1)} F`
    : `${magnitude.toFixed(1)} C`;

  const value = element('p', `anomaly__value ${warmer ? 'is-warm' : 'is-cool'}`);
  value.textContent = `${warmer ? '+' : '-'}${shown}`;
  body.appendChild(value);

  body.appendChild(element(
    'p',
    'anomaly__claim',
    `Today is ${shown} ${warmer ? 'warmer' : 'cooler'} than the ${meta.monthKey} average for this location.`
  ));

  const normalShown = formatTemperature(meta.normalC, units);
  body.appendChild(element('p', 'panel__note',
    `Long-term ${meta.monthKey} mean here: ${normalShown}. Baseline: ${meta.baseline}. Source: ${meta.sources}.`));
}

export function renderAirQuality(data) {
  const body = $('air-body');
  clear(body);

  const current = (data && data.current) || {};
  const category = aqiCategory(current.us_aqi);

  const value = element('p', 'air__value', category ? String(current.us_aqi) : EM_DASH);
  if (category) value.dataset.level = String(category.level);
  body.appendChild(value);
  body.appendChild(element('p', 'air__label', category ? category.label : 'Unavailable'));

  const grid = element('div', 'readouts');
  grid.appendChild(readout('PM2.5', formatMeasurement(current.pm2_5, 'ug/m3', 1)));
  grid.appendChild(readout('PM10', formatMeasurement(current.pm10, 'ug/m3', 1)));
  body.appendChild(grid);
}

export function renderTips(tips) {
  const body = $('tips-body');
  clear(body);

  if (tips.length === 0) {
    body.appendChild(element('p', 'state', 'No advisories. Conditions are unremarkable today.'));
    return;
  }

  const list = element('ul', 'tips');
  for (const tip of tips) {
    const item = element('li', `tip tip--${tip.severity}`);
    item.appendChild(element('p', 'tip__title', tip.title));
    item.appendChild(element('p', 'tip__body', tip.body));
    list.appendChild(item);
  }
  body.appendChild(list);
}

/**
 * The most recent whole-Earth capture from EPIC aboard NOAA DSCOVR.
 * Independent of the searched location: this is the planet, not the city.
 */
export function renderEpic(entry, imageUrl) {
  const body = $('epic-body');
  clear(body);

  if (!entry || !imageUrl) {
    body.appendChild(element('p', 'state', 'EPIC imagery unavailable right now.'));
    return;
  }

  const figure = element('figure', 'epic');
  const image = document.createElement('img');
  image.className = 'epic__image';
  image.src = imageUrl;
  image.loading = 'lazy';
  image.alt = `Full disc image of Earth captured by NASA EPIC on ${entry.date}`;
  figure.appendChild(image);

  const caption = element('figcaption', 'epic__caption');
  caption.appendChild(element('p', 'epic__date', `Captured ${entry.date} UTC`));
  caption.appendChild(element('p', 'epic__text', entry.caption || ''));

  if (entry.centroid_coordinates) {
    const { lat, lon } = entry.centroid_coordinates;
    caption.appendChild(element('p', 'panel__note',
      `Sub-satellite point: ${lat.toFixed(2)}, ${lon.toFixed(2)}`));
  }
  figure.appendChild(caption);
  body.appendChild(figure);
}

/** Formats an ISO date as a short weekday, using the location's own days. */
function weekdayLabel(isoDate, index) {
  if (index === 0) return 'Today';
  const date = new Date(`${isoDate}T12:00:00`);
  return date.toLocaleDateString(undefined, { weekday: 'short' });
}

export function renderDaily(data, units) {
  const body = $('daily-body');
  clear(body);

  const daily = data.daily;
  const table = element('table', 'daily');

  const head = element('thead');
  const headRow = element('tr');
  for (const label of ['Day', 'Conditions', 'Low', 'High', 'Rain', 'UV']) {
    headRow.appendChild(element('th', null, label));
  }
  head.appendChild(headRow);
  table.appendChild(head);

  const tbody = element('tbody');
  for (let i = 0; i < daily.time.length; i += 1) {
    const condition = describeWeatherCode(daily.weather_code[i]);
    const row = element('tr');

    row.appendChild(element('td', 'daily__day', weekdayLabel(daily.time[i], i)));

    const conditionCell = element('td', 'daily__condition');
    conditionCell.appendChild(icon(condition.icon, 'icon icon--small'));
    conditionCell.appendChild(element('span', null, condition.label));
    row.appendChild(conditionCell);

    row.appendChild(element('td', 'num', formatTemperature(daily.temperature_2m_min[i], units)));
    row.appendChild(element('td', 'num', formatTemperature(daily.temperature_2m_max[i], units)));
    row.appendChild(element('td', 'num', formatMeasurement(daily.precipitation_sum[i], 'mm', 1)));
    row.appendChild(element('td', 'num', formatMeasurement(daily.uv_index_max[i], '', 1)));

    tbody.appendChild(row);
  }
  table.appendChild(tbody);

  // Six columns do not fit a 360px viewport. Without this wrapper the table
  // widens the whole document and the entire page scrolls sideways; with it
  // the table scrolls inside its own panel, as the hourly strip does.
  const scroller = element('div', 'table-scroll');
  scroller.tabIndex = 0;
  scroller.setAttribute('role', 'region');
  scroller.setAttribute('aria-label', 'Seven day forecast, scrolls horizontally');
  scroller.appendChild(table);
  body.appendChild(scroller);
}
