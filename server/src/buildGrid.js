function makeShape(res) {
  const rows = Math.round(180 / res);
  const cols = Math.round(360 / res);
  return { rows, cols };
}

function cellIndex(lat, lon, res, cols) {
  let r = Math.floor((90 - lat) / res);
  let c = Math.floor((lon + 180) / res);
  if (r < 0) r = 0;
  if (c < 0) c = 0;
  if (r >= Math.round(180 / res)) r = Math.round(180 / res) - 1;
  if (c >= cols) c = cols - 1;
  return r * cols + c;
}

export function binSamples(samples, { res, phenomenon, unit }) {
  const { rows, cols } = makeShape(res);
  const sums = new Array(rows * cols).fill(0);
  const counts = new Array(rows * cols).fill(0);
  for (const s of samples) {
    const i = cellIndex(s.lat, s.lon, res, cols);
    sums[i] += s.value;
    counts[i] += 1;
  }
  const values = sums.map((sum, i) => (counts[i] ? sum / counts[i] : null));
  return { phenomenon, unit, res, rows, cols, values };
}

export function aggregateCount(samples, { res, phenomenon, unit }) {
  const { rows, cols } = makeShape(res);
  const values = new Array(rows * cols).fill(0);
  for (const s of samples) values[cellIndex(s.lat, s.lon, res, cols)] += 1;
  return { phenomenon, unit, res, rows, cols, values };
}
