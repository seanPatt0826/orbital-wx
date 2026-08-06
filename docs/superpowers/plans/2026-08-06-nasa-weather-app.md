# NASA Space Apps Weather App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a keyless, static weather application in `weather/` that fuses Open-Meteo forecasts with NASA POWER climate normals, NASA GIBS satellite tile layers, and NASA EPIC whole-Earth imagery.

**Architecture:** Vanilla ES modules with strict single-responsibility boundaries: `api.js` is the only file that calls the network, `insights.js` is the only file with maths and rules (pure, therefore unit-tested), `ui.js` is the only file that touches the DOM, `map.js` owns the Leaflet instance, `app.js` orchestrates. No build step, no framework, no server, no secrets.

**Tech Stack:** HTML5, CSS3 (custom properties), JavaScript ES modules, Leaflet 1.9.4 via CDN, `node --test` for unit tests.

**Spec:** `docs/superpowers/specs/2026-08-06-nasa-weather-app-design.md`

## Global Constraints

- **No API keys.** Every endpoint used must be keyless. Never add one.
- **No fabricated data.** Missing or unavailable values render as an em dash (`—`). Never substitute a plausible number, never render POWER's `-999` fill value.
- **No emojis** anywhere in UI text, code, comments, or commit messages. Weather states use inline SVG.
- **No build step.** The app must run with `npx serve weather` and nothing else.
- **All arithmetic in metric.** API data is fetched and stored in Celsius and km/h. Unit conversion happens only at render time. Threshold rules always compare metric values.
- **Every module has one responsibility.** Network only in `api.js`, DOM only in `ui.js`, Leaflet only in `map.js`, pure logic only in `insights.js`.
- **Run the app from the repo root:** `npx serve weather`, then open the printed URL. ES modules do not work from `file://`.
- **Palette (fixed):** background `#0d0e11`, panel `#15171c`, hairline `#2a2e37`, text `#e8e6e1`, muted `#8d8f98`, accent amber `#f0a202`, cool `#7fb2c9`.
- **Contrast:** WCAG AA, 4.5:1 body text, 3:1 large readouts.

---

## File Structure

| File | Responsibility |
|---|---|
| `weather/index.html` | Page structure and panel containers only. No inline script or style. |
| `weather/style.css` | All styling. Design tokens as CSS custom properties. |
| `weather/package.json` | `{"type":"module"}` so `node --test` treats `.js` as ES modules. No dependencies. |
| `weather/js/config.js` | Frozen constants: endpoints, GIBS layer table, thresholds, WMO code table. No logic. |
| `weather/js/api.js` | Pure URL builders plus `fetch` wrappers with timeout and typed errors. |
| `weather/js/insights.js` | Pure functions: formatting, anomaly maths, AQI categories, tip rules. |
| `weather/js/map.js` | Leaflet map, marker, GIBS layer switching. |
| `weather/js/ui.js` | Renders data into the DOM, including loading and error states. |
| `weather/js/app.js` | Entry point: state, event wiring, orchestration. |
| `weather/test/insights.test.js` | Unit tests for `insights.js`. |
| `weather/test/api.test.js` | Unit tests for `api.js` URL builders. |
| `weather/README.md` | Run instructions, data sources, attribution. |

---

### Task 1: Scaffold and configuration

**Files:**
- Create: `weather/package.json`
- Create: `weather/index.html`
- Create: `weather/style.css`
- Create: `weather/js/config.js`
- Create: `weather/README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `config.js` exports `API`, `GIBS_LAYERS`, `THRESHOLDS`, `WMO_CODES`, `MONTH_KEYS`, `POWER_FILL_VALUE`, `REQUEST_TIMEOUT_MS`, `STORAGE_KEY`. All later tasks import from here.

- [ ] **Step 1: Create `weather/package.json`**

This exists only so Node treats `.js` files as ES modules when running tests. It has no dependencies and requires no install.

```json
{
  "name": "nasa-weather",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "description": "Keyless weather app fusing Open-Meteo forecasts with NASA Earth observation data",
  "scripts": {
    "test": "node --test",
    "start": "npx serve ."
  }
}
```

- [ ] **Step 2: Create `weather/js/config.js`**

```js
// Central configuration. No logic lives here, only frozen constants.
// Every endpoint below is keyless and was verified live on 2026-08-06.

export const API = Object.freeze({
  forecast: 'https://api.open-meteo.com/v1/forecast',
  geocoding: 'https://geocoding-api.open-meteo.com/v1/search',
  airQuality: 'https://air-quality-api.open-meteo.com/v1/air-quality',
  power: 'https://power.larc.nasa.gov/api/temporal/climatology/point',
  epicApi: 'https://epic.gsfc.nasa.gov/api/natural',
  epicArchive: 'https://epic.gsfc.nasa.gov/archive/natural',
  gibs: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best'
});

// NASA GIBS tile layers, all confirmed to return imagery in EPSG:3857.
// The fire / thermal anomaly layers were tested and rejected every
// GoogleMapsCompatible tile matrix set, so they are deliberately absent.
export const GIBS_LAYERS = Object.freeze([
  {
    id: 'truecolor',
    label: 'True colour',
    layer: 'MODIS_Terra_CorrectedReflectance_TrueColor',
    matrixSet: 'GoogleMapsCompatible_Level9',
    format: 'jpg',
    maxZoom: 9,
    description: 'What the MODIS instrument on Terra saw, in natural colour.'
  },
  {
    id: 'viirs',
    label: 'True colour (VIIRS)',
    layer: 'VIIRS_SNPP_CorrectedReflectance_TrueColor',
    matrixSet: 'GoogleMapsCompatible_Level9',
    format: 'jpg',
    maxZoom: 9,
    description: 'Natural colour from the VIIRS instrument on Suomi NPP.'
  },
  {
    id: 'aerosol',
    label: 'Aerosol depth',
    layer: 'MODIS_Combined_Value_Added_AOD',
    matrixSet: 'GoogleMapsCompatible_Level6',
    format: 'png',
    maxZoom: 6,
    description: 'Airborne particles: smoke, dust and haze seen from orbit.'
  },
  {
    id: 'landtemp',
    label: 'Land surface temp',
    layer: 'MODIS_Terra_Land_Surface_Temp_Day',
    matrixSet: 'GoogleMapsCompatible_Level7',
    format: 'png',
    maxZoom: 7,
    description: 'Daytime land surface temperature measured by MODIS.'
  }
]);

// Thresholds for the insight rules. All values are metric, matching the
// units the APIs return, so rules behave identically in either display unit.
export const THRESHOLDS = Object.freeze({
  uvIndex: 6,
  windSpeedKmh: 40,
  usAqi: 101,
  precipProbability: 60,
  anomalyWarmC: 3,
  anomalyCoolC: -3,
  apparentHotC: 32,
  apparentColdC: 0
});

// WMO weather interpretation codes returned by Open-Meteo.
// `icon` selects an inline SVG symbol defined in index.html.
export const WMO_CODES = Object.freeze({
  0: { label: 'Clear sky', icon: 'clear' },
  1: { label: 'Mainly clear', icon: 'clear' },
  2: { label: 'Partly cloudy', icon: 'partly' },
  3: { label: 'Overcast', icon: 'cloud' },
  45: { label: 'Fog', icon: 'fog' },
  48: { label: 'Depositing rime fog', icon: 'fog' },
  51: { label: 'Light drizzle', icon: 'drizzle' },
  53: { label: 'Moderate drizzle', icon: 'drizzle' },
  55: { label: 'Dense drizzle', icon: 'drizzle' },
  56: { label: 'Light freezing drizzle', icon: 'sleet' },
  57: { label: 'Dense freezing drizzle', icon: 'sleet' },
  61: { label: 'Slight rain', icon: 'rain' },
  63: { label: 'Moderate rain', icon: 'rain' },
  65: { label: 'Heavy rain', icon: 'rain' },
  66: { label: 'Light freezing rain', icon: 'sleet' },
  67: { label: 'Heavy freezing rain', icon: 'sleet' },
  71: { label: 'Slight snowfall', icon: 'snow' },
  73: { label: 'Moderate snowfall', icon: 'snow' },
  75: { label: 'Heavy snowfall', icon: 'snow' },
  77: { label: 'Snow grains', icon: 'snow' },
  80: { label: 'Slight rain showers', icon: 'rain' },
  81: { label: 'Moderate rain showers', icon: 'rain' },
  82: { label: 'Violent rain showers', icon: 'rain' },
  85: { label: 'Slight snow showers', icon: 'snow' },
  86: { label: 'Heavy snow showers', icon: 'snow' },
  95: { label: 'Thunderstorm', icon: 'storm' },
  96: { label: 'Thunderstorm with slight hail', icon: 'storm' },
  99: { label: 'Thunderstorm with heavy hail', icon: 'storm' }
});

// NASA POWER returns monthly climatology keyed by these abbreviations.
export const MONTH_KEYS = Object.freeze([
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'
]);

// POWER uses -999 to mean "no data". It must never be rendered or used
// in arithmetic. The live value is read from header.fill_value; this is
// the documented default used when the header is absent.
export const POWER_FILL_VALUE = -999;

export const REQUEST_TIMEOUT_MS = 8000;
export const STORAGE_KEY = 'nasa-weather:last-location';
```

- [ ] **Step 3: Create `weather/index.html`**

Structure only. Panels are empty containers that `ui.js` fills. The SVG sprite defines every weather icon once.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Orbital WX - weather with Earth context</title>
  <meta name="description" content="Live weather fused with NASA Earth observation data. No API keys.">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <!-- Inline SVG sprite: every weather icon, defined once, referenced by <use>. -->
  <svg class="sprite" aria-hidden="true" focusable="false">
    <symbol id="icon-clear" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><path d="M12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></symbol>
    <symbol id="icon-partly" viewBox="0 0 24 24"><circle cx="8" cy="8" r="3.5"/><path d="M8 1.5v2M2.5 8h2M4.1 4.1l1.4 1.4"/><path d="M7 18h10a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6-1.3A3.4 3.4 0 0 0 7 18z"/></symbol>
    <symbol id="icon-cloud" viewBox="0 0 24 24"><path d="M7 18h10a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6-1.3A3.4 3.4 0 0 0 7 18z"/></symbol>
    <symbol id="icon-fog" viewBox="0 0 24 24"><path d="M7 15h10a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6-1.3A3.4 3.4 0 0 0 7 15z"/><path d="M4 19h16M6 22h12"/></symbol>
    <symbol id="icon-drizzle" viewBox="0 0 24 24"><path d="M7 15h10a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6-1.3A3.4 3.4 0 0 0 7 15z"/><path d="M9 19v1.5M13 19v1.5M17 19v1.5"/></symbol>
    <symbol id="icon-rain" viewBox="0 0 24 24"><path d="M7 15h10a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6-1.3A3.4 3.4 0 0 0 7 15z"/><path d="M9 18.5v3M13 18.5v3M17 18.5v3"/></symbol>
    <symbol id="icon-sleet" viewBox="0 0 24 24"><path d="M7 15h10a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6-1.3A3.4 3.4 0 0 0 7 15z"/><path d="M9 18.5v3M17 18.5v3"/><path d="M13 19l1.5 1.5M14.5 19L13 20.5"/></symbol>
    <symbol id="icon-snow" viewBox="0 0 24 24"><path d="M7 15h10a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6-1.3A3.4 3.4 0 0 0 7 15z"/><path d="M9 19l1.4 1.4M10.4 19L9 20.4M15 19l1.4 1.4M16.4 19L15 20.4"/></symbol>
    <symbol id="icon-storm" viewBox="0 0 24 24"><path d="M7 15h10a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6-1.3A3.4 3.4 0 0 0 7 15z"/><path d="M13 17l-3 4h3l-1 3"/></symbol>
    <symbol id="icon-unknown" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.2 2.4c-.8.3-1.2 1-1.2 1.8M12 17.5v.01"/></symbol>
  </svg>

  <header class="masthead">
    <div class="masthead__brand">
      <span class="masthead__title">ORBITAL WX</span>
      <span class="masthead__sub">Forecast fused with NASA Earth observation</span>
    </div>

    <div class="masthead__controls">
      <form class="search" id="search-form" role="search" autocomplete="off">
        <label class="visually-hidden" for="search-input">Search for a location</label>
        <input
          class="search__input"
          id="search-input"
          type="text"
          placeholder="Search a city"
          role="combobox"
          aria-expanded="false"
          aria-controls="search-results"
          aria-autocomplete="list">
        <button class="search__submit" type="submit">Search</button>
        <ul class="search__results" id="search-results" role="listbox" aria-label="Location suggestions" hidden></ul>
      </form>

      <button class="btn" id="geolocate-btn" type="button">Use my location</button>

      <div class="unit-toggle" role="group" aria-label="Unit system">
        <button class="unit-toggle__btn is-active" id="unit-metric" type="button" aria-pressed="true">C</button>
        <button class="unit-toggle__btn" id="unit-imperial" type="button" aria-pressed="false">F</button>
      </div>
    </div>
  </header>

  <div class="offline-banner" id="offline-banner" role="status" hidden>
    You are offline. Data shown may be out of date.
  </div>

  <main class="layout" id="main" aria-live="polite">
    <div class="layout__readouts">
      <section class="panel panel--current" id="panel-current" aria-labelledby="current-heading">
        <h2 class="panel__heading" id="current-heading">Current conditions</h2>
        <div class="panel__body" id="current-body"></div>
      </section>

      <section class="panel" id="panel-anomaly" aria-labelledby="anomaly-heading">
        <h2 class="panel__heading" id="anomaly-heading">Climate anomaly</h2>
        <div class="panel__body" id="anomaly-body"></div>
      </section>

      <section class="panel" id="panel-air" aria-labelledby="air-heading">
        <h2 class="panel__heading" id="air-heading">Air quality</h2>
        <div class="panel__body" id="air-body"></div>
      </section>

      <section class="panel" id="panel-tips" aria-labelledby="tips-heading">
        <h2 class="panel__heading" id="tips-heading">Insights</h2>
        <div class="panel__body" id="tips-body"></div>
      </section>
    </div>

    <div class="layout__map">
      <section class="panel panel--map" id="panel-map" aria-labelledby="map-heading">
        <h2 class="panel__heading" id="map-heading">NASA satellite view</h2>
        <div class="layer-switch" id="layer-switch" role="group" aria-label="Satellite layer"></div>
        <div class="map" id="map" role="img" aria-label="Map awaiting a location"></div>
        <p class="panel__note" id="map-note"></p>
      </section>
    </div>

    <section class="panel panel--wide" id="panel-hourly" aria-labelledby="hourly-heading">
      <h2 class="panel__heading" id="hourly-heading">Next 24 hours</h2>
      <div class="panel__body" id="hourly-body"></div>
    </section>

    <section class="panel panel--wide" id="panel-daily" aria-labelledby="daily-heading">
      <h2 class="panel__heading" id="daily-heading">Seven day forecast</h2>
      <div class="panel__body" id="daily-body"></div>
    </section>

    <section class="panel panel--wide" id="panel-epic" aria-labelledby="epic-heading">
      <h2 class="panel__heading" id="epic-heading">Earth today, from NASA EPIC</h2>
      <div class="panel__body" id="epic-body"></div>
    </section>
  </main>

  <footer class="colophon">
    <p>Weather and air quality from Open-Meteo. Climate normals from NASA POWER (MERRA-2).
       Imagery from NASA GIBS and NASA EPIC aboard NOAA DSCOVR. No API keys are used by this application.</p>
  </footer>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 4: Create `weather/style.css` with the design tokens and base layout**

The full visual pass happens in Task 12. This establishes the tokens and a working layout so every later task is visible.

```css
/* ===== Design tokens ===================================================== */
:root {
  --bg: #0d0e11;
  --panel: #15171c;
  --panel-raised: #1b1e25;
  --hairline: #2a2e37;
  --text: #e8e6e1;
  --muted: #8d8f98;
  --accent: #f0a202;
  --cool: #7fb2c9;
  --danger: #e05c4b;

  --mono: ui-monospace, 'Cascadia Code', Consolas, 'SF Mono', monospace;
  --sans: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
}

*, *::before, *::after { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--mono);
  font-size: 14px;
  line-height: 1.5;
}

.sprite { display: none; }

.visually-hidden {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

/* ===== Masthead ========================================================== */
.masthead {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--hairline);
}

.masthead__title {
  display: block;
  font-size: 18px;
  letter-spacing: 0.18em;
  color: var(--accent);
}

.masthead__sub {
  display: block;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.masthead__controls {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: center;
}

/* ===== Panels ============================================================ */
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-4);
  padding: var(--space-5);
  max-width: 1400px;
  margin: 0 auto;
}

.panel {
  position: relative;
  background: var(--panel);
  border: 1px solid var(--hairline);
  padding: var(--space-4);
}

.panel__heading {
  margin: 0 0 var(--space-3);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
}

.panel__note {
  margin: var(--space-2) 0 0;
  font-size: 11px;
  color: var(--muted);
}

.map { height: 380px; background: var(--panel-raised); }

@media (min-width: 900px) {
  .layout {
    grid-template-columns: minmax(0, 380px) minmax(0, 1fr);
  }
  .layout__readouts { display: grid; gap: var(--space-4); align-content: start; }
  .panel--wide { grid-column: 1 / -1; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 5: Create a temporary `weather/js/app.js` so the page loads without a console error**

```js
// Entry point. Fully implemented in Task 6 onward.
import { API } from './config.js';

console.info('Orbital WX booted. Forecast endpoint:', API.forecast);
```

- [ ] **Step 6: Create `weather/README.md`**

```markdown
# Orbital WX

Weather forecasts fused with NASA Earth observation data. No API keys, no build step, no server.

## Run

From the repository root:

```
npx serve weather
```

Then open the URL it prints (usually http://localhost:3000).

Opening `index.html` directly by double-clicking will **not** work: browsers block ES modules
on the `file://` protocol. VS Code's Live Server extension is an equivalent alternative.

## Test

```
cd weather
node --test
```

No installation required.

## Data sources

All keyless.

| Source | Used for |
|---|---|
| Open-Meteo Forecast | current, hourly and seven day forecast |
| Open-Meteo Geocoding | location search |
| Open-Meteo Air Quality | US AQI and PM2.5 |
| NASA POWER | 2001-2020 monthly climate normals (MERRA-2) |
| NASA GIBS | satellite tile layers |
| NASA EPIC | whole-Earth imagery from NOAA DSCOVR |

## Attribution

Weather and air quality data by Open-Meteo. Climate normals from the NASA POWER project.
Imagery courtesy of NASA EOSDIS GIBS and the NASA EPIC team aboard NOAA DSCOVR.
```

- [ ] **Step 7: Verify the app serves**

Run: `npx serve weather` from the repository root, open the printed URL.
Expected: the masthead renders in graphite and amber, all panel headings are visible, and the browser console shows `Orbital WX booted.` with no errors.

- [ ] **Step 8: Commit**

```bash
git add weather/
git commit -m "feat: scaffold keyless NASA weather app with design tokens and config"
```

---

### Task 2: Formatting and weather code helpers

**Files:**
- Create: `weather/js/insights.js`
- Create: `weather/test/insights.test.js`

**Interfaces:**
- Consumes: `WMO_CODES` from `config.js`.
- Produces: `celsiusToFahrenheit(c)`, `kmhToMph(k)`, `describeWeatherCode(code)` returning `{ label, icon }`, `formatTemperature(valueC, units)` returning a string, `formatMeasurement(value, unit, digits)` returning a string. `units` is the string `'metric'` or `'imperial'` throughout the codebase.

- [ ] **Step 1: Write the failing tests**

Create `weather/test/insights.test.js`:

```js
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
  // The UV index column has no unit label; it must not render "7.9 ".
  assert.equal(formatMeasurement(7.85, '', 1), '7.9');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd weather && node --test`
Expected: FAIL, cannot find module `../js/insights.js`.

- [ ] **Step 3: Write the implementation**

Create `weather/js/insights.js`:

```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd weather && node --test`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add weather/js/insights.js weather/test/insights.test.js
git commit -m "feat: add formatting and weather code helpers with tests"
```

---

### Task 3: Climate anomaly computation

**Files:**
- Modify: `weather/js/insights.js`
- Modify: `weather/test/insights.test.js`

**Interfaces:**
- Consumes: `MONTH_KEYS`, `POWER_FILL_VALUE` from `config.js`.
- Produces: `monthKeyFromDate(date)` returning e.g. `'AUG'`, and `computeAnomaly(todayMeanC, normals, monthKey, fillValue)` returning a number or `null`. `normals` is the object POWER returns at `properties.parameter.T2M`.

- [ ] **Step 1: Write the failing tests**

Append to `weather/test/insights.test.js`, and add `monthKeyFromDate` and `computeAnomaly` to the existing import at the top of the file:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd weather && node --test`
Expected: FAIL, `monthKeyFromDate is not defined`.

- [ ] **Step 3: Write the implementation**

Add to `weather/js/insights.js`, and extend the config import to `import { WMO_CODES, MONTH_KEYS } from './config.js';`:

```js
/** Converts a Date into the JAN..DEC key NASA POWER uses for climatology. */
export function monthKeyFromDate(date) {
  return MONTH_KEYS[date.getMonth()];
}

/**
 * The headline number: how far today's mean temperature sits from the
 * long-term average for this month at this exact point.
 *
 * Returns null rather than a guess whenever the comparison cannot be made
 * honestly, including when POWER reports its fill value (-999) for the month.
 */
export function computeAnomaly(todayMeanC, normals, monthKey, fillValue) {
  if (!isNumber(todayMeanC)) return null;
  if (!normals || typeof normals !== 'object') return null;

  const normal = normals[monthKey];
  if (!isNumber(normal)) return null;
  if (normal === fillValue) return null;

  return todayMeanC - normal;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd weather && node --test`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add weather/js/insights.js weather/test/insights.test.js
git commit -m "feat: compute climate anomaly against NASA POWER monthly normals"
```

---

### Task 4: Air quality categories and insight rules

**Files:**
- Modify: `weather/js/insights.js`
- Modify: `weather/test/insights.test.js`

**Interfaces:**
- Consumes: `THRESHOLDS` from `config.js`.
- Produces: `aqiCategory(usAqi)` returning `{ label, level }` or `null`; `buildTips(conditions)` returning an array of `{ id, severity, title, body }`. `conditions` is `{ uvIndexMax, windSpeedKmh, usAqi, precipProbabilityMax, anomalyC, apparentTemperatureC }`, all metric, any of which may be `null`.

- [ ] **Step 1: Write the failing tests**

Append to `weather/test/insights.test.js`, adding `aqiCategory` and `buildTips` to the import:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd weather && node --test`
Expected: FAIL, `aqiCategory is not defined`.

- [ ] **Step 3: Write the implementation**

Add to `weather/js/insights.js`, extending the config import to `import { WMO_CODES, MONTH_KEYS, THRESHOLDS } from './config.js';`:

```js
// US AQI breakpoints as published by the EPA.
const AQI_BANDS = [
  { max: 50, label: 'Good', level: 1 },
  { max: 100, label: 'Moderate', level: 2 },
  { max: 150, label: 'Unhealthy for sensitive groups', level: 3 },
  { max: 200, label: 'Unhealthy', level: 4 },
  { max: 300, label: 'Very unhealthy', level: 5 },
  { max: Infinity, label: 'Hazardous', level: 6 }
];

export function aqiCategory(usAqi) {
  if (!isNumber(usAqi)) return null;
  const band = AQI_BANDS.find((b) => usAqi <= b.max);
  return { label: band.label, level: band.level };
}

/**
 * Turns real measured values into actionable advice.
 *
 * Every rule reads a metric value and fires only when that value is actually
 * present, so a failed air quality request silently produces fewer tips
 * rather than a wrong one.
 */
export function buildTips(conditions) {
  const {
    uvIndexMax = null,
    windSpeedKmh = null,
    usAqi = null,
    precipProbabilityMax = null,
    anomalyC = null,
    apparentTemperatureC = null
  } = conditions || {};

  const tips = [];

  if (isNumber(uvIndexMax) && uvIndexMax >= THRESHOLDS.uvIndex) {
    tips.push({
      id: 'uv',
      severity: 'caution',
      title: 'Sun protection advised',
      body: `The UV index peaks at ${uvIndexMax.toFixed(1)} today. Cover up or use sunscreen around midday.`
    });
  }

  if (isNumber(windSpeedKmh) && windSpeedKmh >= THRESHOLDS.windSpeedKmh) {
    tips.push({
      id: 'wind',
      severity: 'caution',
      title: 'Strong wind',
      body: `Wind is running at ${windSpeedKmh.toFixed(0)} km/h. Secure loose outdoor objects.`
    });
  }

  if (isNumber(usAqi) && usAqi >= THRESHOLDS.usAqi) {
    const category = aqiCategory(usAqi);
    tips.push({
      id: 'aqi',
      severity: usAqi >= 151 ? 'warning' : 'caution',
      title: `Air quality: ${category.label.toLowerCase()}`,
      body: `US AQI is ${usAqi}. Sensitive groups should limit prolonged outdoor exertion.`
    });
    // The point where the weather data and the NASA data meet.
    tips.push({
      id: 'aqi-aerosol',
      severity: 'info',
      title: 'See it from orbit',
      body: 'Switch the map to the aerosol depth layer to see the airborne particles measured by MODIS.'
    });
  }

  if (isNumber(precipProbabilityMax) && precipProbabilityMax >= THRESHOLDS.precipProbability) {
    tips.push({
      id: 'precip',
      severity: 'info',
      title: 'Rain likely',
      body: `Precipitation probability reaches ${precipProbabilityMax.toFixed(0)} percent today.`
    });
  }

  if (isNumber(apparentTemperatureC) && apparentTemperatureC >= THRESHOLDS.apparentHotC) {
    tips.push({
      id: 'heat',
      severity: 'warning',
      title: 'Heat stress risk',
      body: `It feels like ${apparentTemperatureC.toFixed(1)} C. Hydrate and avoid exertion in the afternoon.`
    });
  }

  if (isNumber(apparentTemperatureC) && apparentTemperatureC <= THRESHOLDS.apparentColdC) {
    tips.push({
      id: 'freeze',
      severity: 'warning',
      title: 'Freezing conditions',
      body: `It feels like ${apparentTemperatureC.toFixed(1)} C. Watch for ice underfoot.`
    });
  }

  if (isNumber(anomalyC) && anomalyC >= THRESHOLDS.anomalyWarmC) {
    tips.push({
      id: 'anomaly-warm',
      severity: 'info',
      title: 'Warmer than the long-term average',
      body: `Today runs ${anomalyC.toFixed(1)} C above the NASA POWER average for this month here.`
    });
  }

  if (isNumber(anomalyC) && anomalyC <= THRESHOLDS.anomalyCoolC) {
    tips.push({
      id: 'anomaly-cool',
      severity: 'info',
      title: 'Cooler than the long-term average',
      body: `Today runs ${Math.abs(anomalyC).toFixed(1)} C below the NASA POWER average for this month here.`
    });
  }

  return tips;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd weather && node --test`
Expected: PASS, 21 tests.

- [ ] **Step 5: Commit**

```bash
git add weather/js/insights.js weather/test/insights.test.js
git commit -m "feat: add AQI categories and threshold-driven insight rules"
```

---

### Task 5: API layer

**Files:**
- Create: `weather/js/api.js`
- Create: `weather/test/api.test.js`

**Interfaces:**
- Consumes: `API`, `REQUEST_TIMEOUT_MS` from `config.js`.
- Produces: pure builders `buildForecastUrl(lat, lon)`, `buildGeocodingUrl(query)`, `buildAirQualityUrl(lat, lon)`, `buildClimateNormalsUrl(lat, lon)`, `buildEpicImageUrl(entry)`; async fetchers `searchLocations(query)`, `fetchForecast(lat, lon)`, `fetchAirQuality(lat, lon)`, `fetchClimateNormals(lat, lon)`, `fetchLatestEpic()`; and the `ApiError` class carrying `.source`.

The URL builders are separated from the fetchers precisely so the query construction can be tested without touching the network.

- [ ] **Step 1: Write the failing tests**

Create `weather/test/api.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd weather && node --test`
Expected: FAIL, cannot find module `../js/api.js`.

- [ ] **Step 3: Write the implementation**

Create `weather/js/api.js`:

```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd weather && node --test`
Expected: PASS, 28 tests total across both files.

- [ ] **Step 5: Commit**

```bash
git add weather/js/api.js weather/test/api.test.js
git commit -m "feat: add keyless API layer with timeouts and typed errors"
```

---

### Task 6: First vertical slice - search and current conditions

**Files:**
- Create: `weather/js/ui.js`
- Modify: `weather/js/app.js` (replace the placeholder from Task 1 entirely)

**Interfaces:**
- Consumes: everything from `api.js` and `insights.js`.
- Produces: `ui.js` exports `showLoading(panelId)`, `showError(panelId, message, onRetry)`, `renderCurrent(data, place, units)`, `renderSuggestions(results, onPick)`, `hideSuggestions()`, `setDocumentLocation(label)`. Panel ids are the DOM ids from `index.html`: `current-body`, `anomaly-body`, `air-body`, `tips-body`, `hourly-body`, `daily-body`, `epic-body`.

- [ ] **Step 1: Create `weather/js/ui.js`**

```js
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
```

- [ ] **Step 2: Replace `weather/js/app.js` with the orchestrator**

```js
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
```

- [ ] **Step 3: Verify the slice works in the browser**

Run: `npx serve weather`, open the URL, type `Lisbon`, press Search, click the first suggestion.
Expected: current conditions render with a real temperature, feels-like, humidity, wind and precipitation; the page title becomes `Lisbon, Lisbon, PT - Orbital WX`; reloading the page restores Lisbon automatically.

- [ ] **Step 4: Confirm the tests still pass**

Run: `cd weather && node --test`
Expected: PASS, 28 tests.

- [ ] **Step 5: Commit**

```bash
git add weather/js/ui.js weather/js/app.js
git commit -m "feat: wire location search and current conditions end to end"
```

---

### Task 7: Hourly strip and seven day forecast

**Files:**
- Modify: `weather/js/ui.js`
- Modify: `weather/js/app.js`
- Modify: `weather/style.css`

**Interfaces:**
- Consumes: the forecast response already held in `state.forecast`.
- Produces: `ui.js` gains `renderHourly(data, units)` and `renderDaily(data, units)`.

- [ ] **Step 1: Add `renderHourly` and `renderDaily` to `weather/js/ui.js`**

```js
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
  body.appendChild(strip);
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
  body.appendChild(table);
}
```

- [ ] **Step 2: Call them from `loadForecast` in `weather/js/app.js`**

Replace the body of `loadForecast` with:

```js
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
```

- [ ] **Step 3: Add the styles to `weather/style.css`**

```css
/* ===== Readouts ========================================================== */
.readouts { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2) var(--space-4); }

.readout { display: flex; justify-content: space-between; gap: var(--space-3); border-bottom: 1px solid var(--hairline); padding: var(--space-2) 0; }
.readout__label { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
.readout__value { font-variant-numeric: tabular-nums; }

.current__head { display: flex; gap: var(--space-4); align-items: center; margin-bottom: var(--space-4); }
.current__place { margin: 0; font-size: 12px; letter-spacing: 0.08em; color: var(--muted); }
.current__temp { margin: var(--space-1) 0; font-size: 40px; line-height: 1; font-variant-numeric: tabular-nums; }
.current__condition { margin: 0; color: var(--accent); }

.icon { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.icon--large { width: 56px; height: 56px; color: var(--accent); }
.icon--small { width: 16px; height: 16px; }

/* ===== Hourly strip ====================================================== */
.hourly { display: flex; gap: var(--space-2); overflow-x: auto; padding-bottom: var(--space-2); }
.hourly__cell { flex: 0 0 auto; width: 56px; display: grid; justify-items: center; gap: var(--space-1); }
.hourly__time, .hourly__precip { font-size: 10px; color: var(--muted); }
.hourly__temp { font-size: 12px; font-variant-numeric: tabular-nums; }
.hourly__bar { width: 6px; height: 72px; background: var(--panel-raised); display: flex; align-items: flex-end; }
.hourly__fill { width: 100%; background: var(--accent); }

/* ===== Daily table ======================================================= */
.daily { width: 100%; border-collapse: collapse; }
.daily th { text-align: left; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); font-weight: 500; padding: var(--space-2); border-bottom: 1px solid var(--hairline); }
.daily td { padding: var(--space-2); border-bottom: 1px solid var(--hairline); }
.daily__condition { display: flex; align-items: center; gap: var(--space-2); }
.daily .num { text-align: right; font-variant-numeric: tabular-nums; }
```

- [ ] **Step 4: Verify in the browser**

Run: `npx serve weather`, search a location.
Expected: the hourly strip starts at the current hour and scrolls horizontally through 24 cells with bars that vary in height; the seven day table shows seven rows with the first labelled "Today".

- [ ] **Step 5: Commit**

```bash
git add weather/js/ui.js weather/js/app.js weather/style.css
git commit -m "feat: add hourly strip and seven day forecast table"
```

---

### Task 8: Interactive map with NASA GIBS layers

**Files:**
- Create: `weather/js/map.js`
- Modify: `weather/js/app.js`
- Modify: `weather/style.css`

**Interfaces:**
- Consumes: `API`, `GIBS_LAYERS` from `config.js`; the Leaflet global `L` from the CDN script tag.
- Produces: `initMap(elementId)`, `flyTo(latitude, longitude, label)`, `setLayer(layerId)`, `renderLayerSwitch(containerId, onSelect)`, `gibsDateString(date)`.

- [ ] **Step 1: Create `weather/js/map.js`**

```js
// Owns the Leaflet instance. Nothing else in the app touches Leaflet.

import { API, GIBS_LAYERS } from './config.js';

let map = null;
let marker = null;
let tileLayer = null;
let activeLayerId = GIBS_LAYERS[0].id;

/**
 * GIBS publishes imagery per UTC day. Today's tiles are often not processed
 * yet, so the app requests yesterday, which is reliably available.
 */
export function gibsDateString(date = new Date()) {
  const utc = new Date(date.getTime() - 24 * 60 * 60 * 1000);
  return utc.toISOString().slice(0, 10);
}

function layerById(id) {
  return GIBS_LAYERS.find((l) => l.id === id) || GIBS_LAYERS[0];
}

export function initMap(elementId) {
  map = L.map(elementId, {
    center: [20, 0],
    zoom: 2,
    worldCopyJump: true,
    attributionControl: true
  });
  setLayer(activeLayerId);
  return map;
}

/** Swaps the GIBS tile layer, keeping the current view. */
export function setLayer(layerId) {
  const config = layerById(layerId);
  activeLayerId = config.id;

  if (tileLayer) map.removeLayer(tileLayer);

  const template =
    `${API.gibs}/${config.layer}/default/${gibsDateString()}/${config.matrixSet}/{z}/{y}/{x}.${config.format}`;

  tileLayer = L.tileLayer(template, {
    maxZoom: config.maxZoom,
    minZoom: 1,
    tileSize: 256,
    attribution: 'Imagery: NASA EOSDIS GIBS'
  });
  tileLayer.addTo(map);

  // Zooming past the layer's maximum leaves the map blank, so clamp it.
  if (map.getZoom() > config.maxZoom) map.setZoom(config.maxZoom);
  map.setMaxZoom(config.maxZoom);

  return config;
}

export function flyTo(latitude, longitude, label) {
  const config = layerById(activeLayerId);
  const zoom = Math.min(6, config.maxZoom);
  map.flyTo([latitude, longitude], zoom, { duration: 1.2 });

  if (marker) map.removeLayer(marker);
  marker = L.marker([latitude, longitude]).addTo(map);
  marker.bindPopup(label);

  // The map is decorative to a screen reader unless it says where it is.
  document.getElementById('map')
    .setAttribute('aria-label', `Satellite map centred on ${label}, showing the ${config.label} layer`);
}

/** Builds the layer switch buttons and reports the active layer's metadata. */
export function renderLayerSwitch(containerId, onSelect) {
  const container = document.getElementById(containerId);
  container.replaceChildren();

  for (const config of GIBS_LAYERS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'layer-switch__btn';
    button.textContent = config.label;
    button.setAttribute('aria-pressed', String(config.id === activeLayerId));
    if (config.id === activeLayerId) button.classList.add('is-active');

    button.addEventListener('click', () => {
      const applied = setLayer(config.id);
      for (const sibling of container.children) {
        const isActive = sibling === button;
        sibling.classList.toggle('is-active', isActive);
        sibling.setAttribute('aria-pressed', String(isActive));
      }
      onSelect(applied);
    });

    container.appendChild(button);
  }
  return layerById(activeLayerId);
}
```

- [ ] **Step 2: Wire the map into `weather/js/app.js`**

Add the import:

```js
import * as mapView from './map.js';
```

Add this helper and call it from `init` before `restoreLastPlace()`:

```js
function describeLayer(config) {
  document.getElementById('map-note').textContent =
    `${config.description} Layer: ${config.layer}, imagery dated ${mapView.gibsDateString()}.`;
}

function setupMap() {
  mapView.initMap('map');
  const active = mapView.renderLayerSwitch('layer-switch', describeLayer);
  describeLayer(active);
}
```

In `selectPlace`, after `ui.setDocumentLocation(place.label)`, add:

```js
  mapView.flyTo(place.latitude, place.longitude, place.label);
```

- [ ] **Step 3: Add the styles to `weather/style.css`**

```css
/* ===== Layer switch ====================================================== */
.layer-switch { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-3); }

.layer-switch__btn,
.btn,
.unit-toggle__btn,
.search__submit {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text);
  background: var(--panel-raised);
  border: 1px solid var(--hairline);
  padding: var(--space-2) var(--space-3);
  cursor: pointer;
}

.layer-switch__btn:hover, .btn:hover, .unit-toggle__btn:hover, .search__submit:hover {
  border-color: var(--accent);
}

.layer-switch__btn.is-active, .unit-toggle__btn.is-active {
  color: var(--bg);
  background: var(--accent);
  border-color: var(--accent);
}

:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* Leaflet's default panel is white; force it into the console palette. */
.leaflet-container { background: var(--panel-raised); }
.leaflet-control-attribution {
  background: rgba(13, 14, 17, 0.85) !important;
  color: var(--muted) !important;
  font-family: var(--mono);
  font-size: 10px;
}
.leaflet-control-attribution a { color: var(--cool) !important; }
```

- [ ] **Step 4: Verify in the browser**

Run: `npx serve weather`, search a location, then click each of the four layer buttons.
Expected: the map flies to the location with a marker; every layer button loads visible imagery; the note under the map names the layer and its date; no blank grey tiles at the default zoom.

- [ ] **Step 5: Commit**

```bash
git add weather/js/map.js weather/js/app.js weather/style.css
git commit -m "feat: add Leaflet map with switchable NASA GIBS layers"
```

---

### Task 9: Anomaly card, air quality and insights

**Files:**
- Modify: `weather/js/ui.js`
- Modify: `weather/js/app.js`
- Modify: `weather/style.css`

**Interfaces:**
- Consumes: `fetchClimateNormals`, `fetchAirQuality` from `api.js`; `computeAnomaly`, `monthKeyFromDate`, `aqiCategory`, `buildTips` from `insights.js`.
- Produces: `ui.js` gains `renderAnomaly(anomalyC, meta, units)`, `renderAirQuality(data)`, `renderTips(tips)`. `meta` is `{ baseline, sources, normalC, monthKey }`.

- [ ] **Step 1: Add the three renderers to `weather/js/ui.js`**

Extend the imports from `./insights.js` to include `aqiCategory`.

```js
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
  // This is a temperature DIFFERENCE, not a temperature. It converts with
  // the 9/5 ratio alone. Do not use celsiusToFahrenheit here: adding the
  // 32 degree offset to a difference would be wrong by 32 every time.
  const shown = units === 'imperial'
    ? `${(magnitude * 9 / 5).toFixed(1)} F`
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
```

- [ ] **Step 2: Orchestrate the three panels in `weather/js/app.js`**

Extend the imports:

```js
import { searchLocations, fetchForecast, fetchClimateNormals, fetchAirQuality } from './api.js';
import { computeAnomaly, monthKeyFromDate, buildTips } from './insights.js';
import { POWER_FILL_VALUE } from './config.js';
```

Add these fields to `state`: `normals: null`, `airQuality: null`, `anomaly: null`.

Add the loaders. Each fetch settles independently, so a POWER outage costs only the anomaly card:

```js
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

    ui.renderAnomaly(state.anomaly, {
      monthKey,
      normalC: normals[monthKey] === fillValue ? null : normals[monthKey],
      baseline: (data.header && data.header.range) || 'unstated',
      sources: (data.header && data.header.sources || []).join(', ') || 'NASA POWER'
    }, state.units);

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
```

In `selectPlace`, replace `await loadForecast();` with:

```js
  // The forecast must land before the anomaly, which needs today's mean.
  await loadForecast();
  refreshTips();
  loadClimateNormals();
  loadAirQuality();
```

- [ ] **Step 3: Add the styles to `weather/style.css`**

```css
/* ===== Anomaly =========================================================== */
.anomaly__value { margin: 0; font-size: 44px; line-height: 1; font-variant-numeric: tabular-nums; }
.anomaly__value.is-warm { color: var(--accent); }
.anomaly__value.is-cool { color: var(--cool); }
.anomaly__claim { margin: var(--space-2) 0 0; font-family: var(--sans); font-size: 14px; }

/* ===== Air quality ======================================================= */
.air__value { margin: 0; font-size: 36px; line-height: 1; font-variant-numeric: tabular-nums; }
.air__value[data-level="1"], .air__value[data-level="2"] { color: var(--cool); }
.air__value[data-level="3"], .air__value[data-level="4"] { color: var(--accent); }
.air__value[data-level="5"], .air__value[data-level="6"] { color: var(--danger); }
.air__label { margin: var(--space-1) 0 var(--space-3); color: var(--muted); font-size: 12px; }

/* ===== Tips ============================================================== */
.tips { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-3); }
.tip { border-left: 2px solid var(--hairline); padding-left: var(--space-3); }
.tip--caution { border-left-color: var(--accent); }
.tip--warning { border-left-color: var(--danger); }
.tip--info { border-left-color: var(--cool); }
.tip__title { margin: 0; font-size: 12px; letter-spacing: 0.06em; }
.tip__body { margin: var(--space-1) 0 0; font-family: var(--sans); color: var(--muted); font-size: 13px; }

.state { color: var(--muted); font-size: 12px; }
.state--error { color: var(--danger); }
.state__message { margin: 0 0 var(--space-2); }
.btn--small { padding: var(--space-1) var(--space-2); }
```

- [ ] **Step 4: Verify in the browser**

Run: `npx serve weather`, search `Lisbon`.
Expected: the anomaly card shows a signed value with the claim sentence and cites `January 2001 - December 2020` and `MERRA2`; the air quality card shows a real AQI with its category; the insights list reflects the actual conditions. Search a mid-ocean point such as `Midway` to confirm the anomaly still resolves or degrades honestly.

- [ ] **Step 5: Confirm the tests still pass**

Run: `cd weather && node --test`
Expected: PASS, 28 tests.

- [ ] **Step 6: Commit**

```bash
git add weather/js/ui.js weather/js/app.js weather/style.css
git commit -m "feat: add climate anomaly, air quality and insight panels"
```

---

### Task 10: NASA EPIC imagery section

**Files:**
- Modify: `weather/js/ui.js`
- Modify: `weather/js/app.js`
- Modify: `weather/style.css`

**Interfaces:**
- Consumes: `fetchLatestEpic`, `buildEpicImageUrl` from `api.js`.
- Produces: `ui.js` gains `renderEpic(entry, imageUrl)`.

- [ ] **Step 1: Add `renderEpic` to `weather/js/ui.js`**

```js
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
```

- [ ] **Step 2: Load it once at startup in `weather/js/app.js`**

Extend the `api.js` import with `fetchLatestEpic, buildEpicImageUrl`, then add:

```js
async function loadEpic() {
  ui.showLoading('epic-body');
  try {
    const entry = await fetchLatestEpic();
    ui.renderEpic(entry, buildEpicImageUrl(entry));
  } catch (error) {
    ui.showError('epic-body', error.message, loadEpic);
  }
}
```

Call `loadEpic();` at the end of `init()`. It does not depend on a location, so it runs immediately on page load.

- [ ] **Step 3: Add the styles to `weather/style.css`**

```css
/* ===== EPIC ============================================================== */
.epic { margin: 0; display: grid; gap: var(--space-4); align-items: start; }
.epic__image { width: 100%; max-width: 420px; height: auto; display: block; background: var(--panel-raised); border: 1px solid var(--hairline); }
.epic__caption { color: var(--muted); }
.epic__date { margin: 0 0 var(--space-2); color: var(--text); font-size: 12px; letter-spacing: 0.08em; }
.epic__text { margin: 0; font-family: var(--sans); font-size: 13px; }

@media (min-width: 700px) {
  .epic { grid-template-columns: minmax(0, 420px) minmax(0, 1fr); }
}
```

- [ ] **Step 4: Verify in the browser**

Run: `npx serve weather`, scroll to the EPIC panel.
Expected: a real full-disc Earth photograph loads with its capture timestamp and NASA's own caption text.

- [ ] **Step 5: Commit**

```bash
git add weather/js/ui.js weather/js/app.js weather/style.css
git commit -m "feat: add NASA EPIC whole-Earth imagery section"
```

---

### Task 11: Geolocation, unit toggle and keyboard navigation

**Files:**
- Modify: `weather/js/app.js`
- Modify: `weather/js/ui.js`

**Interfaces:**
- Consumes: everything already built.
- Produces: no new exports. Adds `#geolocate-btn`, `#unit-metric`, `#unit-imperial` handlers and arrow-key navigation of the suggestion listbox.

- [ ] **Step 1: Add geolocation and the unit toggle to `weather/js/app.js`**

```js
/**
 * Open-Meteo has no reverse geocoding, so a geolocated point is labelled
 * with its coordinates. Guessing a nearby city name would be fabrication.
 */
function handleGeolocate() {
  if (!navigator.geolocation) {
    ui.showError('current-body', 'This browser does not support geolocation.', null);
    return;
  }

  ui.showLoading('current-body');
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      selectPlace({
        latitude,
        longitude,
        timezone: 'auto',
        label: `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`
      });
    },
    (error) => {
      ui.showError('current-body', `Location unavailable: ${error.message}`, null);
    },
    { timeout: 10000, maximumAge: 300000 }
  );
}

/** Re-renders from data already in memory; changing units refetches nothing. */
function setUnits(units) {
  state.units = units;

  const metricBtn = document.getElementById('unit-metric');
  const imperialBtn = document.getElementById('unit-imperial');
  metricBtn.classList.toggle('is-active', units === 'metric');
  imperialBtn.classList.toggle('is-active', units === 'imperial');
  metricBtn.setAttribute('aria-pressed', String(units === 'metric'));
  imperialBtn.setAttribute('aria-pressed', String(units === 'imperial'));

  if (!state.forecast) return;
  ui.renderCurrent(state.forecast, state.place, units);
  ui.renderHourly(state.forecast, units);
  ui.renderDaily(state.forecast, units);
  if (state.anomaly !== null && state.normals) {
    const fillValue = (state.normals.header && state.normals.header.fill_value) ?? POWER_FILL_VALUE;
    const normals = state.normals.properties.parameter.T2M;
    const monthKey = monthKeyFromDate(new Date());
    ui.renderAnomaly(state.anomaly, {
      monthKey,
      normalC: normals[monthKey] === fillValue ? null : normals[monthKey],
      baseline: (state.normals.header && state.normals.header.range) || 'unstated',
      sources: (state.normals.header && state.normals.header.sources || []).join(', ') || 'NASA POWER'
    }, units);
  }
}
```

Register them in `init()`:

```js
  document.getElementById('geolocate-btn').addEventListener('click', handleGeolocate);
  document.getElementById('unit-metric').addEventListener('click', () => setUnits('metric'));
  document.getElementById('unit-imperial').addEventListener('click', () => setUnits('imperial'));
```

- [ ] **Step 2: Add keyboard navigation for the suggestions in `weather/js/ui.js`**

Append to `ui.js`:

```js
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
```

Call `ui.enableSuggestionKeyboard();` once inside `init()` in `app.js`.

Add the highlight style to `style.css`:

```css
.search { position: relative; }
.search__input { font-family: var(--mono); font-size: 13px; color: var(--text); background: var(--panel-raised); border: 1px solid var(--hairline); padding: var(--space-2) var(--space-3); min-width: 220px; }
.search__results { position: absolute; top: 100%; left: 0; right: 0; z-index: 1000; list-style: none; margin: var(--space-1) 0 0; padding: 0; background: var(--panel-raised); border: 1px solid var(--hairline); max-height: 240px; overflow-y: auto; }
.search__result { padding: var(--space-2) var(--space-3); cursor: pointer; font-size: 12px; }
.search__result:hover, .search__result.is-active { background: var(--accent); color: var(--bg); }
.unit-toggle { display: flex; }
```

- [ ] **Step 3: Verify in the browser**

Run: `npx serve weather`.
Expected: pressing "Use my location" prompts for permission and loads a coordinate-labelled location; the C and F buttons re-render every temperature instantly with no network request (confirm in the Network tab); typing a city then using arrow keys and Enter selects a suggestion without touching the mouse.

- [ ] **Step 4: Commit**

```bash
git add weather/js/app.js weather/js/ui.js weather/style.css
git commit -m "feat: add geolocation, unit toggle and keyboard search navigation"
```

---

### Task 12: Offline handling, visual pass and final verification

**Files:**
- Modify: `weather/js/app.js`
- Modify: `weather/style.css`

**Interfaces:**
- Consumes: everything.
- Produces: the finished application.

- [ ] **Step 1: Add offline detection to `weather/js/app.js`**

```js
/** Surfaces connectivity loss rather than letting requests fail silently. */
function watchConnectivity() {
  const banner = document.getElementById('offline-banner');
  const update = () => { banner.hidden = navigator.onLine; };
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}
```

Call `watchConnectivity();` in `init()`.

- [ ] **Step 2: Add the mission-console finishing details to `weather/style.css`**

The corner registration ticks are the signature that separates this from a generic dark dashboard.

```css
/* ===== Panel registration ticks =========================================== */
.panel::before,
.panel::after {
  content: '';
  position: absolute;
  width: 6px;
  height: 6px;
  border-color: var(--accent);
  opacity: 0.55;
}
.panel::before { top: -1px; left: -1px; border-top: 1px solid; border-left: 1px solid; }
.panel::after { bottom: -1px; right: -1px; border-bottom: 1px solid; border-right: 1px solid; }

/* ===== Offline banner ==================================================== */
.offline-banner {
  padding: var(--space-2) var(--space-5);
  background: var(--danger);
  color: #12100e;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

/* ===== Colophon ========================================================== */
.colophon {
  border-top: 1px solid var(--hairline);
  padding: var(--space-5);
  max-width: 1400px;
  margin: 0 auto;
}
.colophon p { margin: 0; font-family: var(--sans); font-size: 12px; color: var(--muted); max-width: 70ch; }

/* Values fade rather than jump when a panel re-renders. */
.panel__body { animation: fade-in 220ms ease-out; }
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
```

- [ ] **Step 3: Run the full test suite**

Run: `cd weather && node --test`
Expected: PASS, 28 tests, zero failures.

- [ ] **Step 4: Work through the manual verification checklist**

Run `npx serve weather` and confirm each item. Do not mark this step complete until every line passes.

- [ ] Search `Lisbon`, pick a suggestion: every panel populates with real values
- [ ] Search `Reykjavik`: the anomaly may be negative; confirm it renders cool-coloured with a minus sign
- [ ] Search a nonsense string such as `zzzzzz`: a "no location matches" message appears, no blank page
- [ ] All four GIBS layers load visible imagery
- [ ] The C and F toggle changes every temperature, including the anomaly, with no network traffic
- [ ] "Use my location" works, or reports a clear reason if permission is denied
- [ ] Reload: the last location is restored from `localStorage`
- [ ] Open DevTools, throttle to Offline, reload: the offline banner appears and every panel shows an error state with a working Retry
- [ ] Resize to 360px wide: single column, no horizontal page scroll, the hourly strip scrolls within itself
- [ ] Tab through the entire page: every control has a visible amber focus ring
- [ ] Search using only the keyboard: type, arrow down, Enter
- [ ] Enable "Reduce motion" in the OS: the map still moves but panel fades are suppressed
- [ ] Search the mid-Pacific (`Midway`): confirm the anomaly either resolves or says unavailable, and never shows -999
- [ ] Confirm no emojis anywhere in the UI
- [ ] Confirm the browser console is free of errors

- [ ] **Step 5: Commit**

```bash
git add weather/
git commit -m "feat: add offline handling and mission console visual pass"
```

---

## Verification Summary

The application is complete when:

1. `cd weather && node --test` reports 28 passing tests
2. Every item in the Task 12 manual checklist passes
3. No API key exists anywhere in the repository
4. No panel can render a fabricated number, including POWER's -999 fill value
