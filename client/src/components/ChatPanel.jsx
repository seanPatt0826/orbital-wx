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
    <div className="chat">
      <div className="chat-scroll">
        {messages.length === 0 && (
          <div className="intro">
            <div className="intro-title">What is happening on Earth?</div>
            <div className="intro-sub">Ask in plain language, or try an example:</div>
            <div className="chips">
              {suggestions.map((s) => (
                <button key={s} className="chip" onClick={() => onSend(s)}>
                  <span className="chip-text">{s}</span>
                  <span className="chip-arrow" />
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.text}
          </div>
        ))}

        {loading && (
          <div className="bubble assistant typing">
            <span className="tdot" />
            <span className="tdot" />
            <span className="tdot" />
          </div>
        )}
      </div>

      <form className="composer" onSubmit={submit}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask about the planet..."
        />
        <button className="send" type="submit" disabled={loading}>
          Send
        </button>
      </form>
    </div>
  );
}
