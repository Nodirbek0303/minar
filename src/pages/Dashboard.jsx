import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, som } from '../api.js';
import UploadPanel from '../components/UploadPanel.jsx';


export default function Dashboard({ onUnauthorized }) {
  const nav = useNavigate();
  const [projects, setProjects] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [aiOn, setAiOn] = useState(false);

  const fail = (e) => {
    if (e.status === 401) return onUnauthorized?.();
    setError(e.message);
  };

  const reload = () => api.listProjects().then(setProjects).catch(fail);

  useEffect(() => {
    reload();
    api.aiStatus().then((s) => setAiOn(s.enabled)).catch(() => {});
  }, []);

  const createSample = async () => {
    setError('');
    setBusy('Namuna loyiha yaratilmoqda...');
    try {
      const p = await api.createProject('Namuna uy 10×8 m', null);
      nav('/project/' + p.id);
    } catch (e) { setBusy(''); fail(e); }
  };

  const remove = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm('Loyiha o‘chirilsinmi?')) return;
    try { await api.deleteProject(id); reload(); } catch (e2) { fail(e2); }
  };

  return (
    <div className="container">
      <div className="hero">
        <h1>ArxAI — MINAR apalka (qolip) sotish va hisob platformasi</h1>
        <p>
          Qo'lda chizilgan yoki DXF formatidagi loyihani yuklang — sun'iy intellekt devorlar, eshik va derazalarni
          aniqlaydi, binoga kerak bo'ladigan <b>apalka (qolip) va unga ketadigan hamma narsa</b> — panellar, universal zamok,
          tyaga (tayrot), gayka, klin, truba va TU teleskopik ustunlarni — qavat-qavat to'liq hisoblab, narxini chiqaradi
          (sotib olish yoki arenda) va 5D rejimda qolip qanday joylanishini 3D da ko'rsatadi.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <button className="btn secondary" onClick={createSample} disabled={!!busy}>
            ⚡ Namuna loyiha bilan sinab ko'rish
          </button>
          <span className="badge">
            AI: {aiOn ? <span style={{ color: 'var(--ok)' }}>ulangan</span> : <span style={{ color: 'var(--accent)' }}>demo rejim</span>}
          </span>
          {busy && <span style={{ color: 'var(--accent)' }}>⏳ {busy}</span>}
          {error && <span className="error-box" style={{ margin: 0 }}>⚠ {error}</span>}
        </div>

        <UploadPanel
          onCreated={(p) => nav('/project/' + p.id)}
          onUnauthorized={onUnauthorized}
        />

        <div className="feature-row">
          <div className="feature"><b>1. Chizma yuklash</b>DXF (AutoCAD) yoki qo'lda chizilgan rasm (JPG/PNG). Birlik DXF sarlavhasidan olinadi.</div>
          <div className="feature"><b>2. AI tahlil</b>Sun'iy intellekt devor, eshik, deraza va xonalarni aniqlab, chizmani raqamli modelga aylantiradi.</div>
          <div className="feature"><b>3. Apalka hisobi</b>MSHO/KSHO panellari, zamok, tyaga, gayka, klin, truba, ustun qolipi, TU — devorning ikki yuzasi bo'yicha.</div>
          <div className="feature"><b>4. Narx: sotib olish yoki arenda</b>Har pozitsiya uchun narx tahrirlanadi; arenda oylik tarif × oylar bo'yicha hisoblanadi.</div>
          <div className="feature"><b>5. 5D + VR</b>Qolip qavat-qavat qanday joylanishini vaqt bo'yicha ko'rish; VR rejimida bino ichida yurish.</div>
        </div>
      </div>

      <h2 style={{ fontSize: 18 }}>Loyihalar</h2>
      {projects.length === 0 && !busy && (
        <div className="card small-muted">Hozircha loyiha yo'q. Chizma yuklang yoki namuna loyiha bilan boshlang.</div>
      )}
      {projects.map((p) => (
        <div className="proj-item" key={p.id} onClick={() => nav('/project/' + p.id)} style={{ cursor: 'pointer' }}>
          <div>
            <b>{p.name}</b>
            <div className="small-muted">
              {p.wallCount} devor · {p.floorCount} qavat · {new Date(p.createdAt).toLocaleString('uz-UZ')}
            </div>
          </div>
          <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div>
              <div style={{ color: 'var(--accent)', fontWeight: 700 }}>{p.facadeArea ? p.facadeArea + ' m²' : '—'}</div>
              <div className="small-muted">{p.total ? som(p.total) : 'apalka maydoni'}</div>
            </div>
            <button className="btn small danger" onClick={(e) => remove(e, p.id)} title="Loyihani o'chirish">✕</button>
          </div>
        </div>
      ))}
    </div>
  );
}
