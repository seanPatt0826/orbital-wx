import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

export default function PieBreakdown({ bands }) {
  if (!bands || bands.length === 0) return null;

  const data = bands.map((b) => ({ name: b.name, value: b.pct, color: b.color }));
  const dominant = data.reduce((a, b) => (b.value > a.value ? b : a), data[0]);

  return (
    <div className="pie-wrap">
      <div className="pie-chart">
        <ResponsiveContainer width="100%" height={196}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={58}
              outerRadius={82}
              paddingAngle={2}
              stroke="none"
            >
              {data.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v, n) => [`${v}%`, n]}
              contentStyle={{
                background: 'rgba(12,18,33,0.95)',
                border: '1px solid rgba(148,163,184,0.24)',
                borderRadius: 10,
                color: '#e6edf6',
                fontSize: 12,
              }}
              itemStyle={{ color: '#e6edf6' }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pie-center">
          <div>
            <div className="pc-pct">{dominant.value}%</div>
            <div className="pc-name">{dominant.name}</div>
          </div>
        </div>
      </div>

      <ul className="legend">
        {bands.map((b) => (
          <li key={b.name}>
            <span className="dot" style={{ background: b.color }} />
            <span className="lg-name">{b.name}</span>
            <span className="lg-pct">{b.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
