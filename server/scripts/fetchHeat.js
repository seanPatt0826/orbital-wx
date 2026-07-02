import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { binSamples } from '../src/buildGrid.js';

const PARAM = 'T2M';
const RES = 2;

async function fetchTile(latMin, latMax, lonMin, lonMax) {
  const url = `https://power.larc.nasa.gov/api/temporal/climatology/regional?parameters=${PARAM}` +
    `&community=RE&latitude-min=${latMin}&latitude-max=${latMax}` +
    `&longitude-min=${lonMin}&longitude-max=${lonMax}&format=JSON`;
  const r = await fetch(url);
  if (!r.ok) { console.warn('tile failed', latMin, lonMin, r.status); return []; }
  const j = await r.json();
  const samples = [];
  for (const f of j.features || []) {
    const [lon, lat] = f.geometry.coordinates;
    const ann = f.properties.parameter[PARAM].ANN;
    if (ann !== undefined && ann !== null && ann > -900) samples.push({ lat, lon, value: ann });
  }
  return samples;
}

const all = [];
for (let lat = -80; lat < 80; lat += 20) {
  for (let lon = -180; lon < 180; lon += 20) {
    const s = await fetchTile(lat, lat + 20 - 0.1, lon, lon + 20 - 0.1);
    all.push(...s);
    console.log(`tile ${lat},${lon}: ${s.length} pts (total ${all.length})`);
  }
}
const grid = binSamples(all, { res: RES, phenomenon: 'heat', unit: '°C annual mean' });
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'heat.json');
writeFileSync(out, JSON.stringify(grid));
console.log('wrote', out, 'cells with data:', grid.values.filter((v) => v !== null).length);
