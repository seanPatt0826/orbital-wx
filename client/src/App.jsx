import { useState } from 'react';
import { useQuery } from './hooks/useQuery.js';
import ChatPanel from './components/ChatPanel.jsx';
import MapCanvas from './components/MapCanvas.jsx';
import PieBreakdown from './components/PieBreakdown.jsx';

const SUGGESTIONS = [
  'Show areas in Africa experiencing severe drought',
  'Where are the active wildfires right now?',
  'How hot is the Middle East?',
];

const PHENOMENON_LABELS = {
  drought: 'Drought severity',
  wildfires: 'Active wildfires',
  heat: 'Land surface temperature',
};

export default function App() {
  const [messages, setMessages] = useState([]);
  const [result, setResult] = useState(null);
  const { postQuery, loading } = useQuery();

  async function handleSend(text) {
    setMessages((m) => [...m, { role: 'user', text }]);
    const data = await postQuery(text);
    if (!data) {
      setMessages((m) => [
        ...m,
        { role: 'assistant', text: 'Sorry, I could not answer that. Try one of the example questions.' },
      ]);
      return;
    }
    setResult(data);
    setMessages((m) => [...m, { role: 'assistant', text: data.explanation }]);
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <header className="brand">
          <div className="brand-mark" />
          <div>
            <div className="brand-title">Earth Observation Copilot</div>
            <div className="brand-sub">Natural-language interface to NASA Earth data</div>
          </div>
        </header>
        <ChatPanel messages={messages} onSend={handleSend} loading={loading} suggestions={SUGGESTIONS} />
      </aside>

      <main className="stage">
        <MapCanvas bbox={result?.bbox} gibsLayerId={result?.gibsLayerId} />

        <div className="stage-topbar">
          <span className="badge">Sample data</span>
        </div>

        {!result && (
          <div className="stage-hint">
            <div className="stage-hint-title">Ask about the planet</div>
            <div className="stage-hint-sub">
              Pose a question on the left and watch the map fly to the region with a live NASA layer and a
              severity breakdown.
            </div>
          </div>
        )}

        {result && (
          <section className="result-card">
            <div className="result-head">
              <div className="result-region">{result.regionLabel}</div>
              <div className="result-phenom">
                {PHENOMENON_LABELS[result.phenomenon] || result.phenomenon}
              </div>
            </div>
            <PieBreakdown bands={result.bands} />
            <div className="result-foot">
              {result.stats?.counted != null
                ? `${result.stats.counted.toLocaleString()} grid cells analyzed across the region.`
                : 'Regional breakdown from NASA-derived data.'}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
