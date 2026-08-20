# Orbital WX

Weather forecasts fused with NASA Earth observation data. No API keys, no build step, no server.

Live: <https://seanpatt0826.github.io/orbital-wx/>

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

Node's test runner discovers `test/*.test.js` from the current directory.
Passing the directory explicitly (`node --test test/`) does not work on this
Node build: it tries to load the directory as a single module and fails.

No installation required.

## Deploy

GitHub Pages serves the `gh-pages` branch from its root, but the app lives in
`weather/` on `main`. The bridge is a subtree split, run from the repo root:

```
git subtree split --prefix=weather -b gh-pages
git push --force origin gh-pages:gh-pages
```

Run both lines after any change under `weather/` that should go live. Nothing
else is needed: no build, no secrets, no environment variables.

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

## The globe

The satellite view is a 3D globe rendered with CesiumJS, loaded as a UMD bundle
from a CDN so there is still no build step. No Cesium ion access token is used:
the bundle ships with a default one, which `map.js` clears before the viewer is
created, so an accidental ion request fails loudly rather than quietly working.
Every tile comes from NASA GIBS.

NASA's Blue Marble sits underneath the daily imagery. Both instruments image in
strips, and where a day's swath is missing the gap arrives as black pixels in a
JPEG, which has no alpha channel and so cannot reveal anything on its own. Those
are keyed out, and Blue Marble shows through instead of a black tear.

VIIRS leads the layer list, and is the default, because its 3040km swath overlaps
between consecutive orbits and covers the whole planet every day. MODIS Terra is
still available but its 2330km swath does not quite meet at the equator, leaving
visible gaps; its label and description say so, so the gaps read as instrument
behaviour rather than a broken layer.

Thematic layers legitimately have no polar coverage - the aerosol layer returns
404 for its entire southernmost tile row while true colour serves it fine. That
is data absence, and it is logged rather than surfaced as an error.

## Attribution

Weather and air quality data by Open-Meteo. Climate normals from the NASA POWER project.
Imagery courtesy of NASA EOSDIS GIBS and the NASA EPIC team aboard NOAA DSCOVR.
Globe rendered with CesiumJS (Apache 2.0).
