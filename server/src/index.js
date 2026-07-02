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
