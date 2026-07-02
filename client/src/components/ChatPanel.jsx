import { useState } from 'react';

export default function ChatPanel({ messages, onSend, loading, suggestions }) {
  const [text, setText] = useState('');
  function submit(e) {
    e.preventDefault();
    const t = text.trim();
    if (!t || loading) return;
    onSend(t);
    setText('');
  }
  return (
    <>
      <div className="chat-body">
        {messages.length === 0 && (
          <div className="suggestions">
            {suggestions.map((s) => (
              <button key={s} className="chip" onClick={() => onSend(s)}>{s}</button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>{m.text}</div>
        ))}
        {loading && <div className="msg assistant">Analyzing…</div>}
      </div>
      <form className="chat-input" onSubmit={submit}>
        <input value={text} onChange={(e) => setText(e.target.value)}
               placeholder="Ask about the planet…" />
        <button type="submit" disabled={loading}>Send</button>
      </form>
    </>
  );
}
