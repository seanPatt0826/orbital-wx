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
