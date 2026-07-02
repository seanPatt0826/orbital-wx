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
