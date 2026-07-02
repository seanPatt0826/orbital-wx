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
