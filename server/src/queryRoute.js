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
