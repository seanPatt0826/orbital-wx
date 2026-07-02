import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function PieBreakdown({ bands }) {
  if (!bands || bands.length === 0) return null;
  const data = bands.map((b) => ({ name: b.name, value: b.pct, color: b.color }));
  return (
    <div className="pie-card">
      <h3>Severity breakdown</h3>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" outerRadius={80}
               label={(e) => `${e.name} ${e.value}%`}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <Tooltip formatter={(v) => `${v}%`} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
