import { useState } from 'react';

export default function App() {
  const [result, setResult] = useState(null);
  return (
    <div className="app">
      <div className="chat-col">
        <header className="brand">Earth Observation Copilot</header>
        <div className="chat-body">Ask about the planet…</div>
      </div>
      <div className="canvas-col">
        {result ? <pre>{JSON.stringify(result, null, 2)}</pre> : <div className="placeholder">The map and breakdown appear here.</div>}
      </div>
    </div>
  );
}
