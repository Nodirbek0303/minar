import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const SUGGESTIONS = [
  'Bu loyihaga qancha panel va zamok kerak?',
  'Arenda sotib olishdan qanchaga arzon tushadi?',
  'TU teleskopik ustunlar qanday hisoblanadi?',
  'Montaj muddatini qisqartirish uchun nima qilish kerak?'
];

export default function ChatPanel({ project, onUnauthorized }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    setMsgs([{
      role: 'bot',
      content: `Assalomu alaykum! Men **ArxAI yordamchisi**man. "${project.name}" loyihasi kontekstida savol bering — material sarfi, hisob-kitob, fasad tizimi yoki muddat haqida maslahat beraman.`
    }]);
    api.aiStatus().then((s) => setDemo(!s.enabled)).catch(() => {});
  }, [project.id]);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs]);

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    setInput('');
    setMsgs((m) => [...m, { role: 'user', content: message }]);
    setBusy(true);
    try {
      const history = msgs.slice(1).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));
      const r = await api.chat(message, history, project.id);
      setMsgs((m) => [...m, { role: 'bot', content: r.answer }]);
      setDemo(!!r.demo);
    } catch (e) {
      if (e.status === 401) onUnauthorized?.();
      setMsgs((m) => [...m, { role: 'bot', content: '⚠ Xatolik: ' + e.message }]);
    }
    setBusy(false);
  };

  return (
    <div className="card chat-box">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <b>🤖 AI yordamchi</b>
        {demo && <span className="demo-tag">demo rejim — AI kaliti yo'q, lekin qoidalar ishlaydi</span>}
      </div>
      <div className="chat-msgs" ref={boxRef}>
        {msgs.map((m, i) => (
          <div key={i} className={'msg ' + (m.role === 'user' ? 'user' : 'bot')}>{m.content}</div>
        ))}
        {busy && <div className="msg bot">⏳ O'ylayapman...</div>}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '8px 0 4px' }}>
        {SUGGESTIONS.map((s) => (
          <button key={s} className="btn small secondary" onClick={() => send(s)}>{s}</button>
        ))}
      </div>
      <div className="chat-input">
        <input
          value={input}
          placeholder="Savolingizni yozing..."
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button className="btn" onClick={() => send()} disabled={busy}>Yuborish</button>
      </div>
    </div>
  );
}
