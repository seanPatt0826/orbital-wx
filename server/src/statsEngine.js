export function computeStats(grid, bbox, bands) {
  const { res, rows, cols, values } = grid;
  const bandCounts = bands.map(() => 0);
  let counted = 0;
  let sum = 0;
  let max = -Infinity;
  let min = Infinity;

  for (let r = 0; r < rows; r++) {
    const latCenter = 90 - (r + 0.5) * res;
    if (latCenter < bbox.minLat || latCenter > bbox.maxLat) continue;
    for (let c = 0; c < cols; c++) {
      const lonCenter = -180 + (c + 0.5) * res;
      if (lonCenter < bbox.minLon || lonCenter > bbox.maxLon) continue;
      const v = values[r * cols + c];
      if (v === null || v === undefined) continue;
      counted++;
      sum += v;
      if (v > max) max = v;
      if (v < min) min = v;
      for (let b = 0; b < bands.length; b++) {
        if (v >= bands[b].min && v < bands[b].max) { bandCounts[b]++; break; }
      }
    }
  }

  return {
    counted,
    bands: bands.map((b, i) => ({
      name: b.name,
      color: b.color,
      count: bandCounts[i],
      pct: counted ? Math.round((bandCounts[i] / counted) * 100) : 0,
    })),
    mean: counted ? sum / counted : null,
    max: counted ? max : null,
    min: counted ? min : null,
  };
}
