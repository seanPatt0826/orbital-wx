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

Node's test runner discovers `test/*.test.js` from the current directory.
Passing the directory explicitly (`node --test test/`) does not work on this
Node build: it tries to load the directory as a single module and fails.

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
