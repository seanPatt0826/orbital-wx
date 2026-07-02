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

export default function App() {
  const [messages, setMessages] = useState([]);
  const [result, setResult] = useState(null);
  const { postQuery, loading } = useQuery();

  async function handleSend(text) {
    setMessages((m) => [...m, { role: 'user', text }]);
    const data = await postQuery(text);
    if (!data) {
      setMessages((m) => [...m, { role: 'assistant', text: 'Sorry, I could not answer that. Try one of the example questions.' }]);
      return;
    }
    setResult(data);
    setMessages((m) => [...m, { role: 'assistant', text: data.explanation }]);
  }

  return (
    <div className="app">
      <div className="chat-col">
        <header className="brand">Earth Observation Copilot</header>
        <ChatPanel messages={messages} onSend={handleSend} loading={loading} suggestions={SUGGESTIONS} />
      </div>
      <div className="canvas-col">
        <MapCanvas bbox={result?.bbox} gibsLayerId={result?.gibsLayerId} />
        {result && (
          <div className="overlay-card">
            <div className="region-title">{result.regionLabel} · {result.phenomenon}</div>
            <PieBreakdown bands={result.bands} />
          </div>
        )}
      </div>
    </div>
  );
}
