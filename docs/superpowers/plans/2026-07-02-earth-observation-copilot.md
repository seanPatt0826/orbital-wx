# Earth Observation Copilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A natural-language web app where a user asks a plain-English question about the planet and gets a NASA satellite map layer, a pie chart of the region's severity-band percentages, and a Claude-written explanation grounded in the real numbers.

**Architecture:** React (Vite) split-view frontend talks to a Node/Express backend. The backend uses Claude to parse the query into `{phenomenon, bbox}`, computes severity-band percentages from a locally-stored coarse global data grid (pure function, the credibility-critical piece), then uses Claude again to narrate the computed numbers. Map imagery comes from live NASA GIBS tiles; the numeric percentages come from the local grids so the demo never depends on a flaky API.

**Tech Stack:** Node 18+ (built-in `fetch` and `node:test`), Express, `@anthropic-ai/sdk`, React 18 + Vite, `react-leaflet`/Leaflet, `recharts`.

## Global Constraints

- **Node 18+** — relies on global `fetch` and the built-in `node:test` runner. No extra test framework on the server.
- **Plain JavaScript/JSX** — no TypeScript anywhere.
- **The Anthropic API key lives only in `server/.env`** (`ANTHROPIC_API_KEY`) and is read via `process.env`. It must never appear in client code or be sent to the browser.
- **Model IDs:** intent parsing uses `claude-haiku-4-5-20251001` (fast, cheap, structured); narration uses `claude-sonnet-5`.
- **Dependency-injected Claude client** — modules that call Claude accept an Anthropic client as a parameter so tests pass a fake. Never construct the client inside a unit.
- **Grid coordinate convention** (used by every grid-touching task): a grid has `res` (degrees), `rows`, `cols`, and a flat `values` array of length `rows*cols`, row-major, north-to-south then west-to-east. Cell `(r,c)` has center `latCenter = 90 - (r + 0.5)*res` and `lonCenter = -180 + (c + 0.5)*res`. `null` means no data.
- **Bounding box shape:** `{ minLat, maxLat, minLon, maxLon }` in degrees.
- **Vite dev proxy:** the client proxies `/api` to `http://localhost:3001`.

---

## File Structure

```
NASA competition app/
├── .gitignore
├── README.md
├── server/
│   ├── package.json
│   ├── .env.example
│   ├── src/
│   │   ├── index.js          # Express app + startup
│   │   ├── phenomena.js       # PHENOMENA config (id, label, gibsLayerId, gridFile, bands)
│   │   ├── dataStore.js       # loads + caches grid JSON
│   │   ├── statsEngine.js     # computeStats(grid, bbox, bands) — pure, fully tested
│   │   ├── buildGrid.js       # binSamples(samples, opts) — pure, fully tested
│   │   ├── intentParser.js    # parseIntent(text, client) via Claude tool use
│   │   ├── narrator.js        # narrate(payload, client) via Claude
│   │   └── queryRoute.js      # createQueryHandler({dataStore, client})
│   ├── data/                  # committed grid JSON produced by scripts
│   │   ├── drought.json
│   │   ├── wildfires.json
│   │   └── heat.json
│   ├── scripts/
│   │   ├── fetchDrought.js    # NASA POWER precipitation → drought.json
│   │   ├── fetchWildfires.js  # NASA FIRMS active fires → wildfires.json
│   │   └── fetchHeat.js       # NASA POWER temperature → heat.json
│   └── test/
│       ├── fixtures/tinyGrid.json
│       ├── statsEngine.test.js
│       ├── buildGrid.test.js
│       ├── intentParser.test.js
│       ├── narrator.test.js
│       └── queryRoute.test.js
└── client/
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── styles.css
        ├── hooks/useQuery.js
        └── components/
            ├── ChatPanel.jsx
            ├── MapCanvas.jsx
            ├── PieBreakdown.jsx
            └── TrendChart.jsx   # stretch
```

> **Phenomena note:** The spec's core was drought + wildfires + air quality. Air quality has **no clean, keyless, global gridded NASA source** parseable in Node within a sprint (MERRA-2/TEMPO require NetCDF/OPeNDAP or are region-limited). Both easily-sourced reliable feeds are **NASA POWER** (precipitation, temperature) and **FIRMS** (fires). This plan therefore builds **drought, wildfires, and heat (land-surface temperature)** as the concretely-sourced core. The engine is fully phenomenon-agnostic — air quality and NDVI drop in later as pure config + a grid file. This deviation is called out for the user at handoff.

---

## Task 1: Repo scaffold

**Files:**
- Create: `.gitignore`, `README.md`
- Create: `server/package.json`, `server/.env.example`, `server/src/index.js`
- Create: `client/package.json`, `client/vite.config.js`, `client/index.html`, `client/src/main.jsx`, `client/src/App.jsx`, `client/src/styles.css`

**Interfaces:**
- Consumes: nothing.
- Produces: a running Express server exposing `GET /api/health` → `{ ok: true }` on port 3001; a Vite React app that renders a placeholder and proxies `/api` to the server.

- [ ] **Step 1: Create `.gitignore`**

```
node_modules/
.env
dist/
```

- [ ] **Step 2: Create `server/package.json`**

```json
{
  "name": "eo-copilot-server",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js",
    "test": "node --test"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.65.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2"
  }
}
```

- [ ] **Step 3: Create `server/.env.example`**

```
ANTHROPIC_API_KEY=sk-ant-your-key-here
PORT=3001
```

- [ ] **Step 4: Create `server/src/index.js`**

```js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  return app;
}

// Only listen when run directly, not when imported by tests.
if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  const port = process.env.PORT || 3001;
  createApp().listen(port, () => console.log(`server on :${port}`));
}
```

- [ ] **Step 5: Create `client/package.json`**

```json
{
  "name": "eo-copilot-client",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "leaflet": "^1.9.4",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-leaflet": "^4.2.1",
    "recharts": "^2.12.7"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 6: Create `client/vite.config.js`**

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://localhost:3001' },
  },
});
```

- [ ] **Step 7: Create `client/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Earth Observation Copilot</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 8: Create `client/src/main.jsx`**

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
```

- [ ] **Step 9: Create `client/src/App.jsx`**

```jsx
export default function App() {
  return <h1>Earth Observation Copilot</h1>;
}
```

- [ ] **Step 10: Create `client/src/styles.css`**

```css
* { box-sizing: border-box; margin: 0; }
body { font-family: system-ui, sans-serif; }
```

- [ ] **Step 11: Create `README.md`**

```markdown
# Earth Observation Copilot

Natural-language interface to NASA Earth datasets. Ask about the planet in plain English; get a NASA map layer, a severity-percentage pie chart, and a grounded explanation.

## Run
- Server: `cd server && npm install && cp .env.example .env` (add your key) `&& npm run dev`
- Client: `cd client && npm install && npm run dev`
```

- [ ] **Step 12: Install and verify server**

Run: `cd server && npm install && node --test`
Expected: install succeeds; test run reports 0 tests (no test files yet) and exits 0.

- [ ] **Step 13: Verify server boots**

Run: `cd server && npm start` then in another shell `curl http://localhost:3001/api/health`
Expected: `{"ok":true}`. Stop the server.

- [ ] **Step 14: Install and verify client**

Run: `cd client && npm install && npm run build`
Expected: build succeeds, produces `dist/`.

- [ ] **Step 15: Commit**

```bash
git add .
git commit -m "chore: scaffold server and client"
```

---

## Task 2: statsEngine (the credibility-critical pure function)

**Files:**
- Create: `server/src/statsEngine.js`
- Create: `server/test/fixtures/tinyGrid.json`
- Test: `server/test/statsEngine.test.js`

**Interfaces:**
- Consumes: a grid object (Global Constraints coordinate convention); a bbox `{minLat,maxLat,minLon,maxLon}`; a bands array `[{ name, min, max, color }]` where a cell value `v` belongs to a band when `min <= v < max` (last band uses `max: Infinity`).
- Produces: `computeStats(grid, bbox, bands)` → `{ counted, bands: [{ name, count, pct, color }], mean, max, min }` where `pct` is `count/counted*100` rounded to a whole number, `counted` excludes `null` cells, and `mean/max/min` are over the non-null in-bbox values (all `null` when `counted === 0`).

- [ ] **Step 1: Create the fixture `server/test/fixtures/tinyGrid.json`**

A 2°-resolution 4-cell-tall world is overkill; use a tiny explicit grid: `res: 90`, `rows: 2`, `cols: 4` (8 cells). Centers: row0 latCenter=45, row1 latCenter=-45; cols lonCenter=-135,-45,45,135.

```json
{
  "phenomenon": "test",
  "unit": "index",
  "res": 90,
  "rows": 2,
  "cols": 4,
  "values": [5, 15, 55, null, 8, 35, 95, 20]
}
```

- [ ] **Step 2: Write the failing test `server/test/statsEngine.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeStats } from '../src/statsEngine.js';

const grid = JSON.parse(readFileSync(new URL('./fixtures/tinyGrid.json', import.meta.url)));
const bands = [
  { name: 'Severe', min: 0, max: 10, color: '#7f1d1d' },
  { name: 'Moderate', min: 10, max: 50, color: '#f59e0b' },
  { name: 'Normal', min: 50, max: Infinity, color: '#16a34a' },
];

test('counts only non-null cells whose center is inside the bbox', () => {
  // Whole world bbox selects all 8 cells; one is null → counted 7.
  const r = computeStats(grid, { minLat: -90, maxLat: 90, minLon: -180, maxLon: 180 }, bands);
  assert.equal(r.counted, 7);
});

test('classifies cells into bands and computes rounded percentages', () => {
  const r = computeStats(grid, { minLat: -90, maxLat: 90, minLon: -180, maxLon: 180 }, bands);
  // values (non-null): 5,15,55,8,35,95,20
  // Severe (<10): 5,8 → 2 ; Moderate (10-50): 15,35,20 → 3 ; Normal (>=50): 55,95 → 2
  const by = Object.fromEntries(r.bands.map((b) => [b.name, b]));
  assert.equal(by.Severe.count, 2);
  assert.equal(by.Moderate.count, 3);
  assert.equal(by.Normal.count, 2);
  assert.equal(by.Severe.pct, Math.round((2 / 7) * 100)); // 29
  assert.equal(by.Moderate.pct, Math.round((3 / 7) * 100)); // 43
});

test('restricts to a bbox by cell-center membership', () => {
  // Northern hemisphere only (latCenter 45): row0 = [5,15,55,null] → counted 3.
  const r = computeStats(grid, { minLat: 0, maxLat: 90, minLon: -180, maxLon: 180 }, bands);
  assert.equal(r.counted, 3);
  assert.equal(r.max, 55);
  assert.equal(r.min, 5);
});

test('handles an empty bbox with null stats and zero pcts', () => {
  const r = computeStats(grid, { minLat: 80, maxLat: 90, minLon: 170, maxLon: 180 }, bands);
  assert.equal(r.counted, 0);
  assert.equal(r.mean, null);
  assert.equal(r.bands.every((b) => b.pct === 0), true);
});

test('preserves band color and covers longitude wrap-free ranges', () => {
  const r = computeStats(grid, { minLat: -90, maxLat: 90, minLon: -180, maxLon: 0 }, bands);
  // Western hemisphere cols (lonCenter -135,-45): values 5,55,8,95 → counted 4.
  assert.equal(r.counted, 4);
  const severe = r.bands.find((b) => b.name === 'Severe');
  assert.equal(severe.color, '#7f1d1d');
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd server && node --test test/statsEngine.test.js`
Expected: FAIL — `computeStats` is not exported / not defined.

- [ ] **Step 4: Implement `server/src/statsEngine.js`**

```js
export function computeStats(grid, bbox, bands) {
  const { res, rows, cols, values } = grid;
  const bandCounts = bands.map(() => 0);
  let counted = 0;
  let sum = 0;
  let max = -Infinity;
  let min = Infinity;

  for (let r = 0; r < rows; r++) {
    const latCenter = 90 - (r + 0.5) * res;
    if (latCenter < bbox.minLat || latCenter > bbox.maxLat) continue;
    for (let c = 0; c < cols; c++) {
      const lonCenter = -180 + (c + 0.5) * res;
      if (lonCenter < bbox.minLon || lonCenter > bbox.maxLon) continue;
      const v = values[r * cols + c];
      if (v === null || v === undefined) continue;
      counted++;
      sum += v;
      if (v > max) max = v;
      if (v < min) min = v;
      for (let b = 0; b < bands.length; b++) {
        if (v >= bands[b].min && v < bands[b].max) { bandCounts[b]++; break; }
      }
    }
  }

  return {
    counted,
    bands: bands.map((b, i) => ({
      name: b.name,
      color: b.color,
      count: bandCounts[i],
      pct: counted ? Math.round((bandCounts[i] / counted) * 100) : 0,
    })),
    mean: counted ? sum / counted : null,
    max: counted ? max : null,
    min: counted ? min : null,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && node --test test/statsEngine.test.js`
Expected: PASS — all 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/statsEngine.js server/test/statsEngine.test.js server/test/fixtures/tinyGrid.json
git commit -m "feat: statsEngine computes severity-band percentages over a bbox"
```

---

## Task 3: phenomena config + dataStore

**Files:**
- Create: `server/src/phenomena.js`
- Create: `server/src/dataStore.js`
- Test: (folded into Task 5's integration test; this task is verified by import + a smoke check)

**Interfaces:**
- Consumes: grid JSON files in `server/data/`.
- Produces:
  - `PHENOMENA` — object keyed by id. Each entry: `{ id, label, gibsLayerId, gridFile, bands: [{name, min, max, color}] }`.
  - `listPhenomenaIds()` → `string[]`.
  - `createDataStore(dataDir)` → `{ getGrid(gridFile) }`, where `getGrid` reads + caches the parsed JSON grid for a filename.

- [ ] **Step 1: Create `server/src/phenomena.js`**

`gibsLayerId` values are real GIBS EPSG:3857 layers; `MODIS_Terra_CorrectedReflectance_TrueColor` is the safe fallback if a thematic layer fails verification in Task 8.

```js
export const PHENOMENA = {
  drought: {
    id: 'drought',
    label: 'Drought (precipitation dryness)',
    gibsLayerId: 'MODIS_Terra_NDVI_8Day',
    gridFile: 'drought.json',
    bands: [
      { name: 'Severe', min: 0, max: 10, color: '#7f1d1d' },
      { name: 'Moderate', min: 10, max: 30, color: '#f59e0b' },
      { name: 'Mild', min: 30, max: 50, color: '#fbbf24' },
      { name: 'Normal', min: 50, max: Infinity, color: '#16a34a' },
    ],
  },
  wildfires: {
    id: 'wildfires',
    label: 'Active fires',
    gibsLayerId: 'MODIS_Terra_Thermal_Anomalies_All',
    gridFile: 'wildfires.json',
    bands: [
      { name: 'None', min: 0, max: 1, color: '#1f2937' },
      { name: 'Low', min: 1, max: 5, color: '#f59e0b' },
      { name: 'High', min: 5, max: Infinity, color: '#dc2626' },
    ],
  },
  heat: {
    id: 'heat',
    label: 'Land surface temperature',
    gibsLayerId: 'MODIS_Terra_Land_Surface_Temp_Day',
    gridFile: 'heat.json',
    bands: [
      { name: 'Cold', min: -Infinity, max: 0, color: '#2563eb' },
      { name: 'Mild', min: 0, max: 25, color: '#16a34a' },
      { name: 'Hot', min: 25, max: 40, color: '#f59e0b' },
      { name: 'Extreme', min: 40, max: Infinity, color: '#dc2626' },
    ],
  },
};

export function listPhenomenaIds() {
  return Object.keys(PHENOMENA);
}
```

- [ ] **Step 2: Create `server/src/dataStore.js`**

```js
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function createDataStore(dataDir) {
  const cache = new Map();
  return {
    getGrid(gridFile) {
      if (!cache.has(gridFile)) {
        const raw = readFileSync(join(dataDir, gridFile), 'utf8');
        cache.set(gridFile, JSON.parse(raw));
      }
      return cache.get(gridFile);
    },
  };
}
```

- [ ] **Step 3: Verify modules import**

Run: `cd server && node -e "import('./src/phenomena.js').then(m => console.log(m.listPhenomenaIds()))"`
Expected: `[ 'drought', 'wildfires', 'heat' ]`

- [ ] **Step 4: Commit**

```bash
git add server/src/phenomena.js server/src/dataStore.js
git commit -m "feat: phenomena config and grid dataStore"
```

---

## Task 4: buildGrid utility (pure binning for the fetch scripts)

**Files:**
- Create: `server/src/buildGrid.js`
- Test: `server/test/buildGrid.test.js`

**Interfaces:**
- Consumes: `samples` — `[{ lat, lon, value }]`; `opts` — `{ res, phenomenon, unit }`.
- Produces: `binSamples(samples, opts)` → a grid object matching the Global Constraints convention. Each cell is the **mean** of the sample values whose lat/lon fall in it; cells with no samples are `null`. Also `aggregateCount(samples, opts)` → same shape but each cell is the **count** of samples in it (used for fire counts), `0` where none.

- [ ] **Step 1: Write the failing test `server/test/buildGrid.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { binSamples, aggregateCount } from '../src/buildGrid.js';

test('binSamples averages values into the correct cell', () => {
  // res 90 → rows 2, cols 4. Point lat 45, lon -135 → r0,c0.
  const grid = binSamples(
    [
      { lat: 45, lon: -135, value: 10 },
      { lat: 44, lon: -134, value: 20 }, // same cell
      { lat: -45, lon: 135, value: 99 }, // r1,c3
    ],
    { res: 90, phenomenon: 'x', unit: 'u' }
  );
  assert.equal(grid.rows, 2);
  assert.equal(grid.cols, 4);
  assert.equal(grid.values[0], 15); // mean of 10,20
  assert.equal(grid.values[1 * 4 + 3], 99);
  assert.equal(grid.values[2], null); // untouched cell
});

test('aggregateCount counts samples per cell and zero-fills', () => {
  const grid = aggregateCount(
    [
      { lat: 45, lon: -135 },
      { lat: 44, lon: -134 },
      { lat: 45, lon: -45 },
    ],
    { res: 90, phenomenon: 'fires', unit: 'count' }
  );
  assert.equal(grid.values[0], 2);
  assert.equal(grid.values[1], 1);
  assert.equal(grid.values[2], 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && node --test test/buildGrid.test.js`
Expected: FAIL — `binSamples` not defined.

- [ ] **Step 3: Implement `server/src/buildGrid.js`**

```js
function makeShape(res) {
  const rows = Math.round(180 / res);
  const cols = Math.round(360 / res);
  return { rows, cols };
}

function cellIndex(lat, lon, res, cols) {
  let r = Math.floor((90 - lat) / res);
  let c = Math.floor((lon + 180) / res);
  if (r < 0) r = 0;
  if (c < 0) c = 0;
  if (r >= Math.round(180 / res)) r = Math.round(180 / res) - 1;
  if (c >= cols) c = cols - 1;
  return r * cols + c;
}

export function binSamples(samples, { res, phenomenon, unit }) {
  const { rows, cols } = makeShape(res);
  const sums = new Array(rows * cols).fill(0);
  const counts = new Array(rows * cols).fill(0);
  for (const s of samples) {
    const i = cellIndex(s.lat, s.lon, res, cols);
    sums[i] += s.value;
    counts[i] += 1;
  }
  const values = sums.map((sum, i) => (counts[i] ? sum / counts[i] : null));
  return { phenomenon, unit, res, rows, cols, values };
}

export function aggregateCount(samples, { res, phenomenon, unit }) {
  const { rows, cols } = makeShape(res);
  const values = new Array(rows * cols).fill(0);
  for (const s of samples) values[cellIndex(s.lat, s.lon, res, cols)] += 1;
  return { phenomenon, unit, res, rows, cols, values };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && node --test test/buildGrid.test.js`
Expected: PASS — both tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/buildGrid.js server/test/buildGrid.test.js
git commit -m "feat: buildGrid bins samples into a coarse global grid"
```

---

## Task 5: intentParser (Claude tool use → structured params)

**Files:**
- Create: `server/src/intentParser.js`
- Test: `server/test/intentParser.test.js`

**Interfaces:**
- Consumes: `text` (user query string); `client` (an object with `.messages.create(...)` matching the Anthropic SDK shape).
- Produces: `parseIntent(text, client)` → `Promise<{ phenomenon, bbox: {minLat,maxLat,minLon,maxLon}, regionLabel, timeframe }>`. Uses a forced tool call named `set_query_params`. If Claude does not return a tool use, throws `Error('could not parse query')`. `phenomenon` is validated against `listPhenomenaIds()`; an unknown value throws `Error('unsupported phenomenon')`.

- [ ] **Step 1: Write the failing test `server/test/intentParser.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../src/intentParser.js';

function fakeClient(toolInput) {
  return {
    messages: {
      create: async () => ({
        content: toolInput
          ? [{ type: 'tool_use', name: 'set_query_params', input: toolInput }]
          : [{ type: 'text', text: 'no tool' }],
      }),
    },
  };
}

test('returns structured params from the tool call', async () => {
  const client = fakeClient({
    phenomenon: 'drought',
    minLat: -35, maxLat: 37, minLon: -18, maxLon: 52,
    regionLabel: 'Africa', timeframe: 'current',
  });
  const r = await parseIntent('severe drought in Africa', client);
  assert.equal(r.phenomenon, 'drought');
  assert.deepEqual(r.bbox, { minLat: -35, maxLat: 37, minLon: -18, maxLon: 52 });
  assert.equal(r.regionLabel, 'Africa');
});

test('throws when Claude returns no tool use', async () => {
  await assert.rejects(() => parseIntent('hello', fakeClient(null)), /could not parse query/);
});

test('throws on unsupported phenomenon', async () => {
  const client = fakeClient({
    phenomenon: 'volcanoes', minLat: 0, maxLat: 1, minLon: 0, maxLon: 1,
    regionLabel: 'x', timeframe: 'current',
  });
  await assert.rejects(() => parseIntent('volcanoes', client), /unsupported phenomenon/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && node --test test/intentParser.test.js`
Expected: FAIL — `parseIntent` not defined.

- [ ] **Step 3: Implement `server/src/intentParser.js`**

```js
import { listPhenomenaIds } from './phenomena.js';

const TOOL = {
  name: 'set_query_params',
  description: 'Record the interpreted parameters of the user\'s Earth-observation question.',
  input_schema: {
    type: 'object',
    properties: {
      phenomenon: { type: 'string', enum: ['drought', 'wildfires', 'heat'], description: 'Which Earth phenomenon the user is asking about.' },
      minLat: { type: 'number' }, maxLat: { type: 'number' },
      minLon: { type: 'number' }, maxLon: { type: 'number' },
      regionLabel: { type: 'string', description: 'Human-readable name of the region, e.g. "Africa" or "California".' },
      timeframe: { type: 'string', description: 'e.g. "current". Use "current" if unspecified.' },
    },
    required: ['phenomenon', 'minLat', 'maxLat', 'minLon', 'maxLon', 'regionLabel', 'timeframe'],
  },
};

const SYSTEM = `You translate a user's natural-language question about Earth into structured parameters by calling set_query_params.
Choose the single best phenomenon. Infer a bounding box in degrees for the named region (whole world = -90..90, -180..180). Always call the tool.`;

export async function parseIntent(text, client) {
  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'set_query_params' },
    messages: [{ role: 'user', content: text }],
  });
  const tool = res.content.find((b) => b.type === 'tool_use');
  if (!tool) throw new Error('could not parse query');
  const p = tool.input;
  if (!listPhenomenaIds().includes(p.phenomenon)) throw new Error('unsupported phenomenon');
  return {
    phenomenon: p.phenomenon,
    bbox: { minLat: p.minLat, maxLat: p.maxLat, minLon: p.minLon, maxLon: p.maxLon },
    regionLabel: p.regionLabel,
    timeframe: p.timeframe,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && node --test test/intentParser.test.js`
Expected: PASS — all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/intentParser.js server/test/intentParser.test.js
git commit -m "feat: intentParser turns free text into structured query params"
```

---

## Task 6: narrator (Claude explanation grounded in numbers)

**Files:**
- Create: `server/src/narrator.js`
- Test: `server/test/narrator.test.js`

**Interfaces:**
- Consumes: `payload` — `{ phenomenonLabel, regionLabel, bands: [{name, pct}], stats: {mean, max, min}, timeframe }`; `client`.
- Produces: `narrate(payload, client)` → `Promise<string>` (2-3 sentence explanation). The user-message content includes the computed numbers; the system prompt forbids inventing figures. Returns the text of the first text block, or `''` if none.

- [ ] **Step 1: Write the failing test `server/test/narrator.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { narrate } from '../src/narrator.js';

test('returns the model text and passes the numbers in the prompt', async () => {
  let seenContent = '';
  const client = {
    messages: {
      create: async (req) => {
        seenContent = req.messages[0].content;
        return { content: [{ type: 'text', text: 'Africa shows widespread severe dryness.' }] };
      },
    },
  };
  const out = await narrate(
    { phenomenonLabel: 'Drought', regionLabel: 'Africa', bands: [{ name: 'Severe', pct: 32 }], stats: { mean: 12, max: 40, min: 1 }, timeframe: 'current' },
    client
  );
  assert.match(out, /widespread severe/);
  assert.match(seenContent, /Severe/);
  assert.match(seenContent, /32/);
});

test('returns empty string when no text block', async () => {
  const client = { messages: { create: async () => ({ content: [] }) } };
  const out = await narrate({ phenomenonLabel: 'x', regionLabel: 'y', bands: [], stats: {}, timeframe: 'current' }, client);
  assert.equal(out, '');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && node --test test/narrator.test.js`
Expected: FAIL — `narrate` not defined.

- [ ] **Step 3: Implement `server/src/narrator.js`**

```js
const SYSTEM = `You are an Earth-science explainer. Given computed statistics for a region, write 2-3 clear sentences explaining what they show for a general audience.
Use ONLY the numbers provided. Do not invent figures, dates, or datasets. Be concise and factual.`;

export async function narrate(payload, client) {
  const { phenomenonLabel, regionLabel, bands, stats, timeframe } = payload;
  const bandLines = bands.map((b) => `${b.name}: ${b.pct}%`).join(', ');
  const content =
    `Phenomenon: ${phenomenonLabel}\nRegion: ${regionLabel}\nTimeframe: ${timeframe}\n` +
    `Severity breakdown: ${bandLines}\nMean: ${stats.mean}, Max: ${stats.max}, Min: ${stats.min}`;
  const res = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 300,
    system: SYSTEM,
    messages: [{ role: 'user', content }],
  });
  const block = res.content.find((b) => b.type === 'text');
  return block ? block.text : '';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && node --test test/narrator.test.js`
Expected: PASS — both tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/narrator.js server/test/narrator.test.js
git commit -m "feat: narrator explains computed stats without inventing numbers"
```

---

## Task 7: queryRoute — wire `/api/query` end-to-end

**Files:**
- Create: `server/src/queryRoute.js`
- Modify: `server/src/index.js` (mount the route + build dependencies)
- Test: `server/test/queryRoute.test.js`

**Interfaces:**
- Consumes: `parseIntent`, `narrate`, `computeStats`, `PHENOMENA`, a `dataStore`, and a Claude `client`.
- Produces: `createQueryHandler({ dataStore, client })` → an async Express handler for `POST /api/query`. Request body `{ text }`. Success response:
  ```
  { phenomenon, regionLabel, bbox, gibsLayerId, bands: [{name,pct,count,color}], stats: {counted,mean,max,min}, explanation, timeframe }
  ```
  On a parse/unsupported error, responds `400 { error: <message> }`. On empty data (`counted === 0`), still returns `200` with the zero-pct bands and `explanation: 'No data available for that region.'` (skips the narrator call).

- [ ] **Step 1: Write the failing test `server/test/queryRoute.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createQueryHandler } from '../src/queryRoute.js';

const tiny = JSON.parse(readFileSync(new URL('./fixtures/tinyGrid.json', import.meta.url)));

// dataStore always returns the tiny grid regardless of filename.
const dataStore = { getGrid: () => tiny };

function fakeClient() {
  return {
    messages: {
      create: async (req) => {
        if (req.tools) {
          return { content: [{ type: 'tool_use', name: 'set_query_params', input: {
            phenomenon: 'drought', minLat: -90, maxLat: 90, minLon: -180, maxLon: 180,
            regionLabel: 'World', timeframe: 'current',
          } }] };
        }
        return { content: [{ type: 'text', text: 'Explanation here.' }] };
      },
    },
  };
}

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

test('returns a full payload for a valid query', async () => {
  const handler = createQueryHandler({ dataStore, client: fakeClient() });
  const res = mockRes();
  await handler({ body: { text: 'drought worldwide' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.phenomenon, 'drought');
  assert.equal(res.body.gibsLayerId, 'MODIS_Terra_NDVI_8Day');
  assert.ok(res.body.bands.length >= 1);
  assert.equal(res.body.explanation, 'Explanation here.');
});

test('returns 400 on unsupported phenomenon', async () => {
  const client = { messages: { create: async () => ({ content: [{ type: 'tool_use', name: 'set_query_params', input: {
    phenomenon: 'aliens', minLat: 0, maxLat: 1, minLon: 0, maxLon: 1, regionLabel: 'x', timeframe: 'current',
  } }] }) } };
  const handler = createQueryHandler({ dataStore, client });
  const res = mockRes();
  await handler({ body: { text: 'aliens' } }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /unsupported/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && node --test test/queryRoute.test.js`
Expected: FAIL — `createQueryHandler` not defined.

- [ ] **Step 3: Implement `server/src/queryRoute.js`**

```js
import { PHENOMENA } from './phenomena.js';
import { parseIntent } from './intentParser.js';
import { narrate } from './narrator.js';
import { computeStats } from './statsEngine.js';

export function createQueryHandler({ dataStore, client }) {
  return async function handleQuery(req, res) {
    try {
      const { text } = req.body || {};
      if (!text || !text.trim()) return res.status(400).json({ error: 'empty query' });

      const intent = await parseIntent(text, client);
      const config = PHENOMENA[intent.phenomenon];
      const grid = dataStore.getGrid(config.gridFile);
      const stats = computeStats(grid, intent.bbox, config.bands);

      let explanation = 'No data available for that region.';
      if (stats.counted > 0) {
        explanation = await narrate(
          {
            phenomenonLabel: config.label,
            regionLabel: intent.regionLabel,
            bands: stats.bands,
            stats: { mean: stats.mean, max: stats.max, min: stats.min },
            timeframe: intent.timeframe,
          },
          client
        );
      }

      return res.json({
        phenomenon: intent.phenomenon,
        regionLabel: intent.regionLabel,
        bbox: intent.bbox,
        gibsLayerId: config.gibsLayerId,
        bands: stats.bands,
        stats: { counted: stats.counted, mean: stats.mean, max: stats.max, min: stats.min },
        explanation,
        timeframe: intent.timeframe,
      });
    } catch (err) {
      const status = /unsupported|could not parse|empty query/.test(err.message) ? 400 : 500;
      return res.status(status).json({ error: err.message });
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && node --test test/queryRoute.test.js`
Expected: PASS — both tests pass.

- [ ] **Step 5: Wire it into `server/src/index.js`**

Replace the file with:

```js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createDataStore } from './dataStore.js';
import { createQueryHandler } from './queryRoute.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const dataStore = createDataStore(join(__dirname, '..', 'data'));
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  app.post('/api/query', createQueryHandler({ dataStore, client }));
  return app;
}

if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  const port = process.env.PORT || 3001;
  createApp().listen(port, () => console.log(`server on :${port}`));
}
```

- [ ] **Step 6: Run the full server test suite**

Run: `cd server && node --test`
Expected: PASS — statsEngine, buildGrid, intentParser, narrator, queryRoute all green.

- [ ] **Step 7: Commit**

```bash
git add server/src/queryRoute.js server/src/index.js server/test/queryRoute.test.js
git commit -m "feat: wire /api/query orchestrating intent, stats, and narration"
```

---

## Task 8: Fetch real NASA data into committed grids

**Files:**
- Create: `server/scripts/fetchDrought.js`, `server/scripts/fetchWildfires.js`, `server/scripts/fetchHeat.js`
- Create (output, committed): `server/data/drought.json`, `server/data/wildfires.json`, `server/data/heat.json`

**Interfaces:**
- Consumes: `binSamples` / `aggregateCount` from `buildGrid.js`; live NASA APIs.
- Produces: three grid JSON files on disk matching the Global Constraints convention, at `res: 2` (rows 90, cols 180 = 16,200 cells — small, fast, plenty for a demo).

> These scripts hit the network and are verified manually, not by `node --test`. The pure binning they rely on is already covered by Task 4.

- [ ] **Step 1: Implement `server/scripts/fetchHeat.js` (NASA POWER temperature)**

POWER's regional climatology endpoint returns a grid of points. We request 20°×20° tiles across the globe and bin the `T2M` (2 m air temperature, °C) annual mean into our grid.

```js
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
```

- [ ] **Step 2: Run it and verify**

Run: `cd server && node scripts/fetchHeat.js`
Expected: logs tiles, then `wrote .../heat.json cells with data: <a few thousand>`. If POWER rate-limits, the script logs failed tiles and continues; re-run to fill gaps is acceptable for a demo.

- [ ] **Step 3: Implement `server/scripts/fetchDrought.js` (NASA POWER precipitation → dryness percentile)**

Same tiling, parameter `PRECTOTCORR` (corrected precipitation, mm/day annual mean). Lower precipitation = drier. We convert each cell's precipitation into a **dryness index 0–100** by ranking all cells (0 = driest), so the drought bands in `phenomena.js` (Severe <10, etc.) are percentile-based and transparent.

```js
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { binSamples } from '../src/buildGrid.js';

const PARAM = 'PRECTOTCORR';
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
    all.push(...(await fetchTile(lat, lat + 20 - 0.1, lon, lon + 20 - 0.1)));
  }
}
// Bin precipitation, then convert to a 0-100 dryness percentile (0 = driest).
const precipGrid = binSamples(all, { res: RES, phenomenon: 'drought', unit: 'precip mm/day' });
const withData = precipGrid.values
  .map((v, i) => ({ v, i }))
  .filter((x) => x.v !== null)
  .sort((a, b) => a.v - b.v); // ascending: driest first
const values = precipGrid.values.slice();
withData.forEach((x, rank) => {
  values[x.i] = Math.round((rank / (withData.length - 1)) * 100);
});
const grid = { ...precipGrid, unit: 'dryness percentile (0=driest)', values };
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'drought.json');
writeFileSync(out, JSON.stringify(grid));
console.log('wrote', out, 'cells with data:', values.filter((v) => v !== null).length);
```

- [ ] **Step 4: Run it and verify**

Run: `cd server && node scripts/fetchDrought.js`
Expected: `wrote .../drought.json cells with data: <a few thousand>`.

- [ ] **Step 5: Implement `server/scripts/fetchWildfires.js` (NASA FIRMS active fires)**

FIRMS serves a global CSV of recent active-fire detections. Requires a free MAP_KEY from https://firms.modaps.eosdis.nasa.gov/api/. We count detections per cell with `aggregateCount`. The key is read from `process.env.FIRMS_MAP_KEY`.

```js
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
```

- [ ] **Step 6: Run it and verify**

Run: `cd server && FIRMS_MAP_KEY=<key> node scripts/fetchWildfires.js`
Expected: `wrote .../wildfires.json detections: <thousands>`. (On Windows PowerShell: `$env:FIRMS_MAP_KEY='<key>'; node scripts/fetchWildfires.js`.)

- [ ] **Step 7: Sanity-check a real query against real data**

Start the server (`npm start` with a real `ANTHROPIC_API_KEY` in `.env`), then:
Run: `curl -s -X POST http://localhost:3001/api/query -H "Content-Type: application/json" -d "{\"text\":\"drought in Africa\"}"`
Expected: JSON with `phenomenon: "drought"`, non-empty `bands` whose `pct` values sum to ~100, and a one-paragraph `explanation`.

- [ ] **Step 8: Verify GIBS layer IDs load (map readiness)**

Open in a browser: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_NDVI_8Day/default/2024-06-01/GoogleMapsCompatible_Level9/2/1/1.png`
Expected: an image loads. Repeat for `MODIS_Terra_Thermal_Anomalies_All` (ext `.png`) and `MODIS_Terra_Land_Surface_Temp_Day` (ext `.png`). If any 404s, set that phenomenon's `gibsLayerId` in `phenomena.js` to `MODIS_Terra_CorrectedReflectance_TrueColor` (ext `.jpg`) as the fallback and note it.

- [ ] **Step 9: Commit**

```bash
git add server/scripts server/data
git commit -m "feat: fetch scripts and committed NASA data grids"
```

---

## Task 9: Frontend — split-view layout + useQuery hook

**Files:**
- Modify: `client/src/App.jsx`
- Modify: `client/src/styles.css`
- Create: `client/src/hooks/useQuery.js`

**Interfaces:**
- Consumes: the `/api/query` response shape from Task 7.
- Produces:
  - `useQuery()` → `{ postQuery, loading, error }`, where `postQuery(text)` → `Promise<response|null>` (returns `null` and sets `error` on failure).
  - `App` — a two-column layout: left `<div class="chat-col">`, right `<div class="canvas-col">`, holding conversation + result state (wired fully in Task 13).

- [ ] **Step 1: Create `client/src/hooks/useQuery.js`**

```js
import { useState } from 'react';

export function useQuery() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function postQuery(text) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'request failed');
      return data;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setLoading(false);
    }
  }

  return { postQuery, loading, error };
}
```

- [ ] **Step 2: Replace `client/src/App.jsx` with the split-view shell**

```jsx
import { useState } from 'react';

export default function App() {
  const [result, setResult] = useState(null);
  return (
    <div className="app">
      <div className="chat-col">
        <header className="brand">Earth Observation Copilot</header>
        <div className="chat-body">Ask about the planet…</div>
      </div>
      <div className="canvas-col">
        {result ? <pre>{JSON.stringify(result, null, 2)}</pre> : <div className="placeholder">The map and breakdown appear here.</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Replace `client/src/styles.css`**

```css
* { box-sizing: border-box; margin: 0; }
body { font-family: system-ui, sans-serif; color: #0f172a; }
.app { display: grid; grid-template-columns: 380px 1fr; height: 100vh; }
.chat-col { display: flex; flex-direction: column; border-right: 1px solid #e2e8f0; background: #f8fafc; }
.brand { padding: 16px; font-weight: 700; font-size: 18px; border-bottom: 1px solid #e2e8f0; }
.chat-body { flex: 1; overflow-y: auto; padding: 16px; }
.canvas-col { position: relative; }
.placeholder { display: grid; place-items: center; height: 100%; color: #94a3b8; }
```

- [ ] **Step 4: Verify it renders**

Run: `cd client && npm run dev`, open the shown URL.
Expected: two columns — left branded chat panel, right placeholder. No console errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/App.jsx client/src/styles.css client/src/hooks/useQuery.js
git commit -m "feat: split-view app shell and useQuery hook"
```

---

## Task 10: PieBreakdown component

**Files:**
- Create: `client/src/components/PieBreakdown.jsx`

**Interfaces:**
- Consumes: `bands` — `[{ name, pct, color }]`.
- Produces: `<PieBreakdown bands={bands} />` — a Recharts pie chart using each band's `color`, labeled with `name` and `pct`. Renders nothing (`null`) when `bands` is empty.

- [ ] **Step 1: Create `client/src/components/PieBreakdown.jsx`**

```jsx
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function PieBreakdown({ bands }) {
  if (!bands || bands.length === 0) return null;
  const data = bands.map((b) => ({ name: b.name, value: b.pct, color: b.color }));
  return (
    <div className="pie-card">
      <h3>Severity breakdown</h3>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" outerRadius={80}
               label={(e) => `${e.name} ${e.value}%`}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <Tooltip formatter={(v) => `${v}%`} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Verify in isolation**

Temporarily render `<PieBreakdown bands={[{name:'Severe',pct:32,color:'#7f1d1d'},{name:'Normal',pct:68,color:'#16a34a'}]} />` inside `App.jsx`'s canvas column.
Expected: a labeled two-slice pie appears. Revert the temporary edit.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/PieBreakdown.jsx
git commit -m "feat: PieBreakdown severity pie chart"
```

---

## Task 11: MapCanvas component (Leaflet + NASA GIBS + fly-to)

**Files:**
- Create: `client/src/components/MapCanvas.jsx`
- Modify: `client/src/main.jsx` (import Leaflet CSS)

**Interfaces:**
- Consumes: `bbox` — `{minLat,maxLat,minLon,maxLon}` or null; `gibsLayerId` — string or null.
- Produces: `<MapCanvas bbox={bbox} gibsLayerId={gibsLayerId} />` — a full-height Leaflet map. When `bbox` changes it `flyToBounds`; when `gibsLayerId` changes it swaps the GIBS tile layer. A neutral base layer is always present so the map is never blank.

- [ ] **Step 1: Add Leaflet CSS import to `client/src/main.jsx`**

Add this import line near the top (after the React imports):

```jsx
import 'leaflet/dist/leaflet.css';
```

- [ ] **Step 2: Create `client/src/components/MapCanvas.jsx`**

```jsx
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import { useEffect } from 'react';

const GIBS_TIME = '2024-06-01';
const gibsUrl = (layer, ext) =>
  `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/${GIBS_TIME}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.${ext}`;

// PNG for thematic overlays, JPG only for the true-color fallback.
const extFor = (layer) => (layer === 'MODIS_Terra_CorrectedReflectance_TrueColor' ? 'jpg' : 'png');

function Controller({ bbox, gibsLayerId }) {
  const map = useMap();
  useEffect(() => {
    if (bbox) {
      map.flyToBounds([[bbox.minLat, bbox.minLon], [bbox.maxLat, bbox.maxLon]], { duration: 1.2 });
    }
  }, [bbox, map]);
  return null;
}

export default function MapCanvas({ bbox, gibsLayerId }) {
  return (
    <MapContainer center={[10, 10]} zoom={2} style={{ height: '100%', width: '100%' }} worldCopyJump>
      <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
                 attribution="&copy; CARTO" />
      {gibsLayerId && (
        <TileLayer key={gibsLayerId} url={gibsUrl(gibsLayerId, extFor(gibsLayerId))}
                   opacity={0.75} attribution="Imagery &copy; NASA GIBS" />
      )}
      <Controller bbox={bbox} gibsLayerId={gibsLayerId} />
    </MapContainer>
  );
}
```

- [ ] **Step 3: Verify in isolation**

Temporarily render `<MapCanvas bbox={{minLat:-35,maxLat:37,minLon:-18,maxLon:52}} gibsLayerId="MODIS_Terra_NDVI_8Day" />` in the canvas column.
Expected: a dark world map flies to Africa with a NASA overlay. Revert the temporary edit.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/MapCanvas.jsx client/src/main.jsx
git commit -m "feat: MapCanvas with NASA GIBS layer and fly-to"
```

---

## Task 12: ChatPanel component

**Files:**
- Create: `client/src/components/ChatPanel.jsx`
- Modify: `client/src/styles.css` (chat + input styles)

**Interfaces:**
- Consumes: `messages` — `[{ role: 'user'|'assistant', text }]`; `onSend(text)`; `loading` (bool); `suggestions` — `string[]`.
- Produces: `<ChatPanel messages onSend loading suggestions />` — a scrollable message list, clickable suggestion chips (shown when there are no messages), and an input box that calls `onSend` on submit and clears.

- [ ] **Step 1: Create `client/src/components/ChatPanel.jsx`**

```jsx
import { useState } from 'react';

export default function ChatPanel({ messages, onSend, loading, suggestions }) {
  const [text, setText] = useState('');
  function submit(e) {
    e.preventDefault();
    const t = text.trim();
    if (!t || loading) return;
    onSend(t);
    setText('');
  }
  return (
    <>
      <div className="chat-body">
        {messages.length === 0 && (
          <div className="suggestions">
            {suggestions.map((s) => (
              <button key={s} className="chip" onClick={() => onSend(s)}>{s}</button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>{m.text}</div>
        ))}
        {loading && <div className="msg assistant">Analyzing…</div>}
      </div>
      <form className="chat-input" onSubmit={submit}>
        <input value={text} onChange={(e) => setText(e.target.value)}
               placeholder="Ask about the planet…" />
        <button type="submit" disabled={loading}>Send</button>
      </form>
    </>
  );
}
```

- [ ] **Step 2: Append chat styles to `client/src/styles.css`**

```css
.suggestions { display: flex; flex-direction: column; gap: 8px; }
.chip { text-align: left; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 10px; background: #fff; cursor: pointer; }
.chip:hover { border-color: #2563eb; }
.msg { padding: 10px 12px; border-radius: 10px; margin-bottom: 8px; max-width: 90%; }
.msg.user { background: #2563eb; color: #fff; margin-left: auto; }
.msg.assistant { background: #e2e8f0; }
.chat-input { display: flex; gap: 8px; padding: 12px; border-top: 1px solid #e2e8f0; }
.chat-input input { flex: 1; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; }
.chat-input button { padding: 10px 16px; border: none; border-radius: 8px; background: #2563eb; color: #fff; cursor: pointer; }
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ChatPanel.jsx client/src/styles.css
git commit -m "feat: ChatPanel with suggestions and input"
```

---

## Task 13: Wire the full experience together

**Files:**
- Modify: `client/src/App.jsx`

**Interfaces:**
- Consumes: `useQuery`, `ChatPanel`, `MapCanvas`, `PieBreakdown`, and the `/api/query` response.
- Produces: the finished app — typing a query sends it, appends the user + assistant messages, flies the map, sets the GIBS layer, and renders the pie breakdown. Errors surface as an assistant message.

- [ ] **Step 1: Replace `client/src/App.jsx`**

```jsx
import { useState } from 'react';
import { useQuery } from './hooks/useQuery.js';
import ChatPanel from './components/ChatPanel.jsx';
import MapCanvas from './components/MapCanvas.jsx';
import PieBreakdown from './components/PieBreakdown.jsx';

const SUGGESTIONS = [
  'Show areas in Africa experiencing severe drought',
  'Where are the active wildfires right now?',
  'How hot is the Middle East?',
];

export default function App() {
  const [messages, setMessages] = useState([]);
  const [result, setResult] = useState(null);
  const { postQuery, loading } = useQuery();

  async function handleSend(text) {
    setMessages((m) => [...m, { role: 'user', text }]);
    const data = await postQuery(text);
    if (!data) {
      setMessages((m) => [...m, { role: 'assistant', text: 'Sorry, I could not answer that. Try one of the example questions.' }]);
      return;
    }
    setResult(data);
    setMessages((m) => [...m, { role: 'assistant', text: data.explanation }]);
  }

  return (
    <div className="app">
      <div className="chat-col">
        <header className="brand">Earth Observation Copilot</header>
        <ChatPanel messages={messages} onSend={handleSend} loading={loading} suggestions={SUGGESTIONS} />
      </div>
      <div className="canvas-col">
        <MapCanvas bbox={result?.bbox} gibsLayerId={result?.gibsLayerId} />
        {result && (
          <div className="overlay-card">
            <div className="region-title">{result.regionLabel} · {result.phenomenon}</div>
            <PieBreakdown bands={result.bands} />
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Append overlay-card styles to `client/src/styles.css`**

```css
.overlay-card { position: absolute; top: 16px; right: 16px; width: 300px; background: #fff; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.18); padding: 12px; z-index: 1000; }
.region-title { font-weight: 700; text-transform: capitalize; margin-bottom: 4px; }
.pie-card h3 { font-size: 13px; color: #475569; margin-bottom: 4px; }
```

- [ ] **Step 3: Full manual end-to-end test**

Start both: server (`cd server && npm run dev`, real key in `.env`) and client (`cd client && npm run dev`). In the browser, click the "severe drought in Africa" suggestion.
Expected: the map flies to Africa with the NASA layer, the pie chart shows severity percentages summing to ~100, and an explanation appears in the chat. Then type "active wildfires right now" and confirm the layer + pie update.

- [ ] **Step 4: Commit**

```bash
git add client/src/App.jsx client/src/styles.css
git commit -m "feat: wire chat, map, and pie breakdown end-to-end"
```

---

## Stretch tasks (post-MVP — implement only if core is solid)

Each is concrete enough to build directly; they reuse the existing engine.

- [ ] **Stretch A — TrendChart:** Create `client/src/components/TrendChart.jsx` using Recharts `LineChart`. Extend grid JSON with an optional `timeseries: [{ label, mean }]` (e.g., 12 monthly means from POWER `temporal/monthly`), have `queryRoute` pass it through, and render below the pie. Skip gracefully when absent.
- [ ] **Stretch B — Live NASA POWER bonus:** Add `GET /api/live?lat=&lon=` to the server that calls POWER `temporal/climatology/point` live and returns `T2M`/`PRECTOTCORR`, shown as a "live from NASA" badge in the overlay card. Demonstrates real-time capability.
- [ ] **Stretch C — Add air quality + NDVI phenomena:** Add entries to `PHENOMENA` (`gibsLayerId: 'MODIS_Terra_Aerosol'` and `'MODIS_Terra_NDVI_8Day'`), write matching fetch scripts producing `airquality.json` / `ndvi.json`, and add the enum values to `intentParser`'s tool schema. Zero engine changes.
- [ ] **Stretch D — Polish:** loading shimmer on the map, animated pie mount, and a "share" button that serializes the last query into the URL.

---

## Self-Review

- **Spec coverage:** Concept/differentiator (Tasks 2, 10, 13) ✓; coarse-global-grid trick (Tasks 2, 4, 8) ✓; hybrid split view (Tasks 9, 11, 13) ✓; architecture + data flow (Tasks 5–7) ✓; all six components (Tasks 5–13) ✓; error handling — 400s, empty-bbox, request failures, suggestion chips (Tasks 7, 9, 12, 13) ✓; testing — statsEngine/buildGrid/intent/narrator/route (Tasks 2,4,5,6,7) ✓; data prep flagged as first data step (Task 8) ✓. **Deviation:** air quality moved from core to Stretch C for lack of a clean Node-parseable global source; heat substituted. Flagged to user at handoff.
- **Placeholder scan:** No TBD/TODO; every code step has full code; commands have expected output. GIBS layer IDs have a concrete verify-and-fallback step (Task 8 Step 8) rather than a guess.
- **Type consistency:** grid `{res,rows,cols,values}` consistent across Tasks 2/4/8; bbox `{minLat,maxLat,minLon,maxLon}` consistent across statsEngine/intentParser/queryRoute/MapCanvas; `computeStats` return `{counted,bands:[{name,count,pct,color}],mean,max,min}` consumed unchanged by queryRoute; `/api/query` response shape produced in Task 7 matches consumers in Tasks 9–13; `binSamples`/`aggregateCount` signatures consistent between Task 4 and Task 8.
