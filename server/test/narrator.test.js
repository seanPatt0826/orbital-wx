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
