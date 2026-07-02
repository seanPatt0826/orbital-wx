const SYSTEM = `You are an Earth-science explainer. Given computed statistics for a region, write 2-3 clear sentences explaining what they show for a general audience.
Use ONLY the numbers provided. Do not invent figures, dates, or datasets. Be concise and factual.`;

export async function narrate(payload, client) {
  const { phenomenonLabel, regionLabel, bands, stats, timeframe } = payload;
  const bandLines = bands.map((b) => `${b.name}: ${b.pct}%`).join(', ');
  const content =
    `Phenomenon: ${phenomenonLabel}\nRegion: ${regionLabel}\nTimeframe: ${timeframe}\n` +
    `Severity breakdown: ${bandLines}\nMean: ${stats.mean}, Max: ${stats.max}, Min: ${stats.min}`;
  const res = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 300,
    system: SYSTEM,
    messages: [{ role: 'user', content }],
  });
  const block = res.content.find((b) => b.type === 'text');
  return block ? block.text : '';
}
