import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, som } from '../api.js';

const UNITS = [
  { id: 'mm', name: 'millimetr (mm)' },
  { id: 'cm', name: 'santimetr (sm)' },
  { id: 'm', name: 'metr (m)' }
];

export default function Dashboard({ onUnauthorized }) {
  const nav = useNavigate();
  const [projects, setProjects] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  // Masshtab aniqlanmaganda: foydalanuvchidan birlikni so'rash
  const [unitAsk, setUnitAsk] = useState(null); // {fileId, name, units, size}
  const [aiOn, setAiOn] = useState(false);
  const fileRef = useRef();

  const fail = (e) => {
    if (e.status === 401) return onUnauthorized?.();
    setError(e.message);
  };

  const reload = () => api.listProjects().then(setProjects).catch(fail);

  useEffect(() => {
    reload();
    api.aiStatus().then((s) => setAiOn(s.enabled)).catch(() => {});
  }, []);

  // Tahlil → loyiha yaratish. units berilsa DXF shu birlikda o'qiladi.
  const analyzeAndCreate = async (fileId, fallbackName, units) => {
    setBusy('AI chizmani tahlil qilmoqda...');
    const an = await api.analyze(fileId, units);
    setBusy('Loyiha yaratilmoqda va hisoblanmoqda...');
    const p = await api.createProject(an.plan.meta?.name || fallbackName, an.plan);
    nav('/project/' + p.id);
  };

  const upload = async (file) => {
    setError(''); setUnitAsk(null);
    if (!file) return;
    setBusy('Fayl yuklanmoqda...');
    let up = null;
    try {
      up = await api.upload(file);
      await analyzeAndCreate(up.fileId, up.name);
    } catch (e) {
      setBusy('');
      // Masshtab aniqlanmadi — birlikni qo'lda tanlash imkonini beramiz
      if (e.status === 422 && e.data?.code === 'DXF_UNITS' && up?.fileId) {
        setUnitAsk({ fileId: up.fileId, name: up.name, units: e.data.units, size: e.data.size, message: e.message });
        return;
      }
      fail(e);
    }
  };

  const retryWithUnits = async (units) => {
    if (!unitAsk?.fileId) return;
    setError('');
    try {
      await analyzeAndCreate(unitAsk.fileId, unitAsk.name, units);
    } catch (e) {
      setBusy('');
      if (e.status === 422) { setError(e.message); return; }
      fail(e);
    }
  };

  const createSample = async () => {
    setError(''); setUnitAsk(null);
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
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => fileRef.current?.click()} disabled={!!busy}>
            📐 Chizma yuklash (DXF / rasm)
          </button>
          <button className="btn secondary" onClick={createSample} disabled={!!busy}>
            ⚡ Namuna loyiha bilan sinab ko'rish
          </button>
          <span className="badge" style={{ alignSelf: 'center' }}>
            AI: {aiOn ? <span style={{ color: 'var(--ok)' }}>ulangan</span> : <span style={{ color: 'var(--accent)' }}>demo rejim</span>}
          </span>
        </div>
        <input
          ref={fileRef} type="file" accept=".dxf,.png,.jpg,.jpeg,.webp" style={{ display: 'none' }}
          onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }}
        />
        {busy && <p style={{ color: 'var(--accent)', marginTop: 12 }}>⏳ {busy}</p>}
        {error && <div className="error-box">⚠ {error}</div>}

        {unitAsk && (
          <div className="card" style={{ marginTop: 12, borderColor: 'var(--accent)' }}>
            <b>📏 Chizma birligi aniqlanmadi</b>
            <p className="small-muted" style={{ marginTop: 6 }}>{unitAsk.message}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="small-muted">Chizma qaysi birlikda chizilgan?</span>
              {UNITS.map((u) => (
                <button key={u.id} className="btn small" onClick={() => retryWithUnits(u.id)} disabled={!!busy}>
                  {u.name}
                </button>
              ))}
              <button className="btn small secondary" onClick={() => setUnitAsk(null)}>Bekor qilish</button>
            </div>
          </div>
        )}

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
