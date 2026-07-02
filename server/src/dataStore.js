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
