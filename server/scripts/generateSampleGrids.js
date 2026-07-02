import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RES = 2;
const ROWS = 180 / RES; // 90
const COLS = 360 / RES; // 180

function cellCenter(r, c) {
  return { lat: 90 - (r + 0.5) * RES, lon: -180 + (c + 0.5) * RES };
}

// Dryness score 0-100 where 0 = driest (severe). Subtropical deserts score low,
// equatorial and temperate bands score higher, with longitudinal + noise variation.
function droughtValue(lat, lon) {
  const a = Math.abs(lat);
  let base;
  if (a < 12) base = 75;
  else if (a < 35) base = 15;
  else if (a < 60) base = 60;
  else base = 40;
  base += 20 * Math.sin(lon / 25);
  base += Math.random() * 24 - 12;
  return Math.round(Math.max(0, Math.min(100, base)));
}

// Land surface temperature (C): ~32C at equator falling toward the poles.
function heatValue(lat, lon) {
  const a = Math.abs(lat);
  let t = 32 - 0.75 * a;
  t += 6 * Math.sin(lon / 20);
  t += Math.random() * 8 - 4;
  return Math.round(t);
}

// Active-fire count: mostly zero, clustered in savanna/mediterranean latitude belts.
function fireValue(lat) {
  const a = Math.abs(lat);
  let p;
  if (a < 25) p = 0.35;
  else if (a < 50) p = 0.2;
  else p = 0.05;
  if (Math.random() < p) return Math.floor(Math.random() * 10) + 1;
  return 0;
}

function buildGrid(phenomenon, unit, fn) {
  const values = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const { lat, lon } = cellCenter(r, c);
      values.push(fn(lat, lon));
    }
  }
  return { phenomenon, unit, res: RES, rows: ROWS, cols: COLS, sample: true, values };
}

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
mkdirSync(dataDir, { recursive: true });

const grids = [
  ['drought.json', buildGrid('drought', 'sample dryness percentile (0=driest)', droughtValue)],
  ['heat.json', buildGrid('heat', 'sample land surface temperature (C)', heatValue)],
  ['wildfires.json', buildGrid('wildfires', 'sample fire detections (count)', (lat) => fireValue(lat))],
];

for (const [file, grid] of grids) {
  writeFileSync(join(dataDir, file), JSON.stringify(grid));
  console.log(`wrote ${file}: ${grid.values.length} cells`);
}
