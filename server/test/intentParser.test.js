import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../src/intentParser.js';

function fakeClient(toolInput) {
  const calls = [];
  return {
    calls,
    messages: {
      create: async (req) => {
        calls.push(req);
        return {
          content: toolInput
            ? [{ type: 'tool_use', name: 'set_query_params', input: toolInput }]
            : [{ type: 'text', text: 'no tool' }],
        };
      },
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
  const req = client.calls[0];
  assert.equal(req.model, 'claude-haiku-4-5-20251001');
  assert.deepEqual(req.tool_choice, { type: 'tool', name: 'set_query_params' });
  assert.equal(req.tools[0].name, 'set_query_params');
  assert.equal(r.timeframe, 'current');
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
