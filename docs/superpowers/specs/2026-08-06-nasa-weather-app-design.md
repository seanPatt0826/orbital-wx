# NASA Space Apps Weather App - Design Spec

**Date:** 2026-08-06
**Location in repo:** new `weather/` folder, independent of the existing Earth Observation Copilot
**Stack:** vanilla HTML + CSS + JavaScript (ES modules), Leaflet via CDN, no build step, no API keys

---

## 1. Concept

A weather application that fuses live forecast data with NASA Earth observation data for the same
point on the globe. The forecast answers "what is it like right now"; the NASA data answers "is
that normal, and what does it look like from orbit".

The differentiator is a single computed sentence:

> Today is 4.2 C warmer than the August average for this location.

That number comes from subtracting NASA POWER's long-term monthly normal for the searched
coordinates from Open-Meteo's forecast mean for today. Two independent agencies, one honest
figure, no invented data.

---

## 2. Scope

In scope, all eight requested features:

1. Current weather
2. Hourly forecast (next 24 hours)
3. Seven-day forecast
4. Temperature, humidity, wind speed, precipitation
5. Location search with disambiguation, plus browser geolocation
6. Interactive Leaflet map centred on the location
7. NASA satellite imagery: GIBS tile layers on the map, plus an EPIC whole-Earth section
8. Weather-based tips and insights, rule-based from real values

Additional, agreed during design:

- NASA POWER climate anomaly headline
- Air quality panel (US AQI, PM2.5)
- Unit toggle, Celsius/Fahrenheit and km/h/mph
- Last location remembered in `localStorage`

Explicitly out of scope: user accounts, saved multi-location dashboards, historical charting
beyond the anomaly, push notifications, any server-side component.

---

## 3. Constraints

- **No API keys anywhere.** Every data source below was verified keyless on 2026-08-06. A
  front-end app cannot hide a secret, so the design removes the need for one. This is a
  deliberate architectural decision, not a limitation.
- **No build step.** No npm install required to run the app.
- **No fabricated data.** Missing values render as an em dash. Failed requests render an error
  state with a retry control. The app never substitutes a plausible-looking number.
- **No emojis** anywhere in the UI or code. Weather states use inline SVG icons.

### Local server requirement

ES modules are blocked by browsers under the `file://` protocol, so double-clicking
`index.html` will not work. Python is not installed on this machine; Node 24 and npx are.
The documented run command is therefore:

```
npx serve weather
```

VS Code's Live Server extension is an equivalent alternative. GitHub Pages serves the app
correctly with no changes, so development and deployment behave identically.

---

## 4. Data sources (all verified 2026-08-06)

| Source | Endpoint | Used for |
|---|---|---|
| Open-Meteo Forecast | `api.open-meteo.com/v1/forecast` | current, hourly, daily; temp, apparent temp, humidity, wind, precipitation, UV, weather code |
| Open-Meteo Geocoding | `geocoding-api.open-meteo.com/v1/search` | city search, returns lat/lon/country/admin1/timezone |
| Open-Meteo Air Quality | `air-quality-api.open-meteo.com/v1/air-quality` | US AQI, PM2.5 |
| NASA POWER Climatology | `power.larc.nasa.gov/api/temporal/climatology/point` | 2001-2020 monthly normals (T2M, PRECTOTCORR) from MERRA-2 |
| NASA EPIC | `epic.gsfc.nasa.gov/api/natural` + `/archive/natural/...` | most recent whole-Earth natural-colour imagery |
| NASA GIBS | `gibs.earthdata.nasa.gov/wmts/epsg3857/best/...` | satellite tile layers over the map |

### Verified forecast parameter set

The exact request, confirmed returning all fields on 2026-08-06 with `timezone=auto` and
`forecast_days=7`:

- `current`: `temperature_2m`, `relative_humidity_2m`, `apparent_temperature`, `precipitation`,
  `weather_code`, `wind_speed_10m`, `wind_direction_10m`, `is_day`
- `hourly`: `temperature_2m`, `precipitation_probability`, `weather_code` (returns 168 hours;
  the UI renders the next 24 from the current hour)
- `daily`: `weather_code`, `temperature_2m_max`, `temperature_2m_min`, `temperature_2m_mean`,
  `precipitation_sum`, `precipitation_probability_max`, `uv_index_max`, `wind_speed_10m_max`

The response also carries a `current_units` / `daily_units` object; unit labels are read from it
rather than hardcoded.

### Verified GIBS layers

Confirmed returning imagery at `GoogleMapsCompatible` tile matrix sets:

- `MODIS_Terra_CorrectedReflectance_TrueColor` (Level9, jpg)
- `VIIRS_SNPP_CorrectedReflectance_TrueColor` (Level9, jpg)
- `MODIS_Combined_Value_Added_AOD` - aerosol optical depth (Level6, png)
- `MODIS_Terra_Land_Surface_Temp_Day` (Level7, png)

**Known risk:** thermal anomaly / fire layers returned HTTP 400 for every
`GoogleMapsCompatible` tile matrix set tried. A fire layer is desirable but unproven. During
implementation, confirm against the GIBS WMTS capabilities document; if it cannot be made to
work in EPSG:3857, ship without it rather than ship a broken layer.

### POWER response handling

The climatology response carries its own metadata, which the UI must use rather than hardcode:

- `header.range` - the true baseline period string, displayed under the anomaly
- `header.sources` - e.g. `["MERRA2"]`, displayed as attribution
- `header.fill_value` - **`-999`**; any parameter value equal to this is missing data and must
  never be rendered or used in arithmetic
- `parameters[NAME].units` and `.longname` - labels
- Month keys are `JAN`..`DEC` plus `ANN`

---

## 5. File layout

```
C:\Projects\NASA competition app\
└── weather\
    ├── index.html            page structure only, no inline script or style
    ├── style.css             all styling, design tokens as CSS custom properties
    ├── js\
    │   ├── config.js         API base URLs, GIBS layer definitions, thresholds, unit tables
    │   ├── api.js            every network call; the only file that uses fetch
    │   ├── insights.js       pure functions: anomaly maths, tip rules, weather-code mapping
    │   ├── map.js            Leaflet setup, marker, GIBS layer switching
    │   ├── ui.js             renders data into the DOM; the only file that touches the DOM
    │   └── app.js            entry point, event wiring, orchestration
    ├── test\
    │   └── insights.test.js  node --test, no install required
    └── README.md             run instructions, data sources, attribution
```

The separation rule, which also serves as the debugging guide: network problems live in
`api.js`, wrong numbers live in `insights.js`, wrong pixels live in `ui.js` or `style.css`.

### Module contracts

**`config.js`** - no dependencies. Exports frozen constants: endpoint URLs, the GIBS layer
table (id, label, tile matrix set, format, attribution), tip thresholds, WMO weather code table.

**`api.js`** - depends on `config.js`. One exported async function per source:
`searchLocations(query)`, `fetchForecast(lat, lon, units)`, `fetchAirQuality(lat, lon)`,
`fetchClimateNormals(lat, lon)`, `fetchLatestEpic()`. Each wraps `fetch` with an
`AbortController` timeout, checks `response.ok`, and throws a typed error carrying the source
name so the UI can report which panel failed. No DOM access, no formatting.

**`insights.js`** - no dependencies, no network, no DOM. Pure functions only, which is what
makes it testable: `computeAnomaly(todayMeanC, normals, monthKey, fillValue)`,
`describeWeatherCode(code)`, `buildTips(conditions)`, `formatTemperature(value, unit)`,
`aqiCategory(usAqi)`. Every function returns a value or `null`; none throws for missing input.

**`map.js`** - depends on `config.js` and the Leaflet global. Exports `initMap(element)`,
`flyTo(lat, lon, label)`, `setLayer(layerId, date)`. Owns the Leaflet instance; nothing else
touches it.

**`ui.js`** - depends on `insights.js` for formatting. Exports one render function per panel
plus `showLoading(panel)` and `showError(panel, message, retryFn)`. Receives plain data, returns
nothing, mutates only its own subtree.

**`app.js`** - depends on all of the above. Holds the small amount of application state
(current location, unit preference), wires DOM events, and orchestrates fetches.

---

## 6. Data flow

```
   [search input]                      [use my location]
         |                                     |
         v                                     v
  searchLocations()                   navigator.geolocation
  suggestion list, keyboard-navigable         |
         |                                     |
         +------> { lat, lon, name, country, timezone } <------+
                              |
     +------------+-----------+-----------+--------------+
     v            v                       v              v
 fetchForecast fetchAirQuality  fetchClimateNormals    map.flyTo
     |            |                       |          + GIBS layer
     +------------+-----------+-----------+
                              v
                   insights.js (pure)
              anomaly, tips, code descriptions
                              v
                        ui.js renders
```

Each fetch is independent and settles independently, so one slow or failing source never blocks
the others. The EPIC section loads once on page load and is not tied to the searched location.

Geolocation note: Open-Meteo provides no reverse geocoding, so a geolocated position is labelled
with its coordinates rather than a guessed place name. Displaying a plausible but unverified
place name would violate the no-fabrication rule.

---

## 7. The anomaly feature, precisely defined

```
anomaly = todayMeanTemperatureC - normals.T2M[currentMonthKey]
```

- `todayMeanTemperatureC` comes from Open-Meteo `daily.temperature_2m_mean[0]`, requested in
  Celsius regardless of the display unit so the arithmetic is always unit-consistent. Conversion
  to Fahrenheit happens at render time only.
- `currentMonthKey` derives from the location's local date, not the browser's, using the
  timezone Open-Meteo returns.
- If the normal equals `header.fill_value` (-999), or either input is missing, `computeAnomaly`
  returns `null` and the card shows an unavailable state.
- The card displays the signed difference, the baseline period taken from `header.range`, and
  the source from `header.sources`.

Comparing a single day against a monthly normal is a real comparison but a coarse one; the label
states exactly what is being compared so the claim is never overstated.

---

## 8. Insight rules

All thresholds live in `config.js`; all evaluation lives in `buildTips`, which takes real values
and returns an array of `{ severity, title, body }`. Rules only fire on values actually present.

| Condition | Source field | Tip |
|---|---|---|
| UV index >= 6 | `daily.uv_index_max[0]` | Sun protection advised |
| Wind speed >= 40 km/h | `current.wind_speed_10m` | Secure loose outdoor objects |
| US AQI >= 101 | `current.us_aqi` | Sensitive groups should limit prolonged outdoor exertion |
| US AQI >= 101 | `current.us_aqi` | Cross-link: view the aerosol layer on the map to see it from orbit |
| Precipitation probability >= 60% | `daily.precipitation_probability_max[0]` | Rain likely, take cover |
| Anomaly >= +3 C | computed | Notably warmer than this month's long-term average |
| Anomaly <= -3 C | computed | Notably cooler than this month's long-term average |
| Apparent temperature >= 32 C | `current.apparent_temperature` | Heat stress risk, hydrate |
| Apparent temperature <= 0 C | `current.apparent_temperature` | Freezing conditions, risk of ice |

All threshold comparisons run against Celsius and km/h values as returned by the API, before any
unit conversion, so the rules behave identically whichever unit the user is viewing.

The aerosol cross-link is the point where the weather data and the NASA data talk to each other,
which is what separates this from a forecast widget with a satellite picture attached.

---

## 9. Error handling

- Every request has an `AbortController` timeout (8 seconds).
- Non-`ok` responses throw an error tagged with the source name.
- Each panel renders its own loading, error, and empty states independently.
- Error states include a retry control that re-runs only the failed request.
- `navigator.onLine === false` shows an offline banner.
- A search returning no matches shows "no matching location", not an empty page.
- Missing individual fields render as an em dash.

Visible, honest failure states are a deliberate demo asset: "what happens when your data source
goes down" is a question judges ask, and the answer should be on screen.

---

## 10. Visual design

Direction: **mission console telemetry**. Instrument-panel density, monospace numerals,
everything legible at a glance.

It must not read as a copy of the Earth Observation Copilot in this same repo, which uses navy
`#060912`, Inter, cyan `#38bdf8`, glassy translucent panels and gradient buttons. This app is
deliberately different:

- **Palette:** graphite rather than navy. Background `#0d0e11`, panel `#15171c`, hairline borders
  `#2a2e37`, primary text `#e8e6e1` (warm off-white), muted `#8d8f98`. Single signal accent in
  amber `#f0a202` for the anomaly and alerts. Cool `#7fb2c9` used only for below-normal anomalies.
- **Type:** system monospace stack (`ui-monospace, 'Cascadia Code', Consolas, monospace`) for all
  readouts, labels and axis ticks, so no external font dependency. Uppercase letter-spaced
  labels. A system sans stack for prose in the tips section.
- **Signature detail:** flat panels with hairline borders and small corner registration ticks,
  no glassmorphism, no gradient fills. Numeric readouts right-aligned on a consistent baseline
  grid so columns of figures line up like an instrument cluster.
- **Layout:** header with search and unit toggle; a left readout column and a right map column on
  desktop; hourly strip as a full-width horizontal scroller with a bar sparkline; seven-day
  forecast as a compact table; EPIC imagery full-width at the foot.
- **Motion:** value changes fade rather than slide; the map flies to the new location. All motion
  suppressed under `prefers-reduced-motion`.

Contrast target is WCAG AA, 4.5:1 for body text and 3:1 for large readouts, verified against the
panel background rather than assumed.

---

## 11. Accessibility and responsiveness

- Semantic landmarks: `header`, `main`, `section`, `footer`.
- The results region is `aria-live="polite"` so updates are announced.
- Search suggestions are a keyboard-navigable listbox: arrow keys, Enter, Escape.
- Every control reachable and visibly focused via keyboard.
- The map has a text alternative summarising the location and active layer.
- Breakpoints: single column below 768px, two columns above. Hourly strip scrolls horizontally
  on all sizes. No horizontal page scroll at any width.

---

## 12. Testing

`insights.js` is pure, so `cd weather && node --test` runs with no install. Passing the
directory explicitly (`node --test test/`) fails on Node 24: it loads the directory as a
single module. Coverage:

- `computeAnomaly` with normal input, with `-999` fill values, with missing inputs
- `describeWeatherCode` across the WMO code table including unknown codes
- `buildTips` firing and not firing at each threshold boundary
- `formatTemperature` for both units and for `null`
- `aqiCategory` at each category boundary

Manual verification before the demo: search a city, geolocate, toggle units, switch every GIBS
layer, and force a failure (offline) to confirm error states render.

---

## 13. Deployment

Static hosting, no configuration: GitHub Pages serving the `weather/` folder, or any static
host. No secrets, no environment variables, no server.

---

## 14. Risks

| Risk | Mitigation |
|---|---|
| GIBS fire layer unavailable in EPSG:3857 | Verify against capabilities; ship without it if unproven |
| GIBS imagery for today not yet published | Request the most recent available date, fall back one day |
| EPIC archive path changes | Isolated in `api.js`; section fails independently without breaking the app |
| POWER slow under load | 8 second timeout, panel-level error with retry |
| Monthly normal is a coarse baseline for a daily value | Label states exactly what is compared |
