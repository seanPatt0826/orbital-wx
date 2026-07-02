import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { aggregateCount } from '../src/buildGrid.js';

const RES = 2;
const KEY = process.env.FIRMS_MAP_KEY;
if (!KEY) { console.error('set FIRMS_MAP_KEY (free from firms.modaps.eosdis.nasa.gov/api/)'); process.exit(1); }

// Global VIIRS active fires, last 1 day.
const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${KEY}/VIIRS_SNPP_NRT/world/1`;
const r = await fetch(url);
const csv = await r.text();
const lines = csv.trim().split('\n');
const header = lines[0].split(',');
const latI = header.indexOf('latitude');
const lonI = header.indexOf('longitude');
const samples = lines.slice(1).map((line) => {
  const cols = line.split(',');
  return { lat: parseFloat(cols[latI]), lon: parseFloat(cols[lonI]) };
}).filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon));

const grid = aggregateCount(samples, { res: RES, phenomenon: 'wildfires', unit: 'fire detections (1 day)' });
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'wildfires.json');
writeFileSync(out, JSON.stringify(grid));
console.log('wrote', out, 'detections:', samples.length);
