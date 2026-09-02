import React, { useEffect, useState } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import Project from './pages/Project.jsx';
import { api } from './api.js';

export default function App() {
  const [auth, setAuth] = useState(null); // {required, ok}

  useEffect(() => {
    api.authStatus()
      .then((s) => setAuth({ required: s.required, ok: !s.required }))
      .catch(() => setAuth({ required: false, ok: true }));
  }, []);

  // Sessiya tugasa (401) — kirish ekraniga qaytarish
  const onUnauthorized = () => setAuth({ required: true, ok: false });

  if (!auth) return <div className="container"><p className="small-muted">Yuklanmoqda...</p></div>;
  if (auth.required && !auth.ok) return <Login onDone={() => setAuth({ required: true, ok: true })} />;

  return (
    <>
      <header className="app-header">
        <Link to="/" style={{ color: 'inherit' }}>
          <div className="logo">Arx<span>AI</span> Platform</div>
        </Link>
        <span className="badge">DXF · AI · 5D · VR</span>
        <span style={{ flex: 1 }} />
        <Link to="/" className="small-muted">Bosh sahifa</Link>
        {auth.required && (
          <button
            className="btn small secondary"
            onClick={() => api.logout().then(() => setAuth({ required: true, ok: false }))}
          >Chiqish</button>
        )}
      </header>
      <Routes>
        <Route path="/" element={<Dashboard onUnauthorized={onUnauthorized} />} />
        <Route path="/project/:id" element={<Project onUnauthorized={onUnauthorized} />} />
      </Routes>
    </>
  );
}

function Login({ onDone }) {
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr('');
    try {
      await api.login(password);
      onDone();
    } catch (e2) {
      setErr(e2.message);
    }
    setBusy(false);
  };

  return (
    <div className="container" style={{ maxWidth: 400, marginTop: 80 }}>
      <div className="card">
        <div className="logo" style={{ marginBottom: 6 }}>Arx<span>AI</span> Platform</div>
        <p className="small-muted" style={{ marginTop: 0 }}>Davom etish uchun parolni kiriting.</p>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            type="password" value={password} autoFocus
            placeholder="Parol"
            onChange={(e) => setPassword(e.target.value)}
          />
          {err && <div className="error-box">{err}</div>}
          <button className="btn" type="submit" disabled={busy || !password}>
            {busy ? 'Tekshirilmoqda...' : 'Kirish'}
          </button>
        </form>
      </div>
    </div>
  );
}
