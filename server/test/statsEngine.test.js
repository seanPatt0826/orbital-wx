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
