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
