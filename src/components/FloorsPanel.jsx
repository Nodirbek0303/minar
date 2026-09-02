import React, { useState } from 'react';
import { api, som, qty } from '../api.js';
import { MINAR } from '../../shared/formwork.js';

const FW_OPTIONS = [
  { id: 'msho', name: 'MINAR MSHO — mayda shtitli qolip (200–600 mm)' },
  { id: 'ksho', name: 'MINAR KSHO — katta shtitli qolip (3.3 m)' },
  { id: 'classic', name: 'Klassik apalka (vent-fasad, tirgak+anker)' }
];

// Qavatlar menejeri: qavat qo'shish/o'chirish, balandlik, va HAR QAVATDA
// apalka/qolip tizimini tanlash (klassik yoki MINAR KSHO/MSHO) — hisob avtomatik yangilanadi.
export default function FloorsPanel({ project, onSaved, onUnauthorized }) {
  const floors = project.plan?.floors?.length ? project.plan.floors : (project.quantities?.perFloor || []).map((f) => ({ id: f.id, name: f.name, height: f.height, facade: f.facade, formwork: { type: 'msho', color: 'RAL3020' } }));
  const [draft, setDraft] = useState(floors.map((f) => ({ ...f, formwork: f.formwork || { type: 'msho', color: 'RAL3020' } })));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const summary = project.floorSummary || [];
  const sumById = Object.fromEntries(summary.map((s) => [s.id, s]));

  const save = async (nextFloors) => {
    setBusy(true); setErr('');
    try {
      const p = await api.updateFloors(project.id, nextFloors);
      onSaved(p);
      setDraft((p.plan.floors || []).map((f) => ({ ...f })));
    } catch (e) {
      if (e.status === 401) onUnauthorized?.(); else setErr(e.message);
    }
    setBusy(false);
  };

  const addPodval = () => {
    const next = [{ id: null, name: 'Podval', height: 2.8, facade: true, underground: true, formwork: { type: 'msho', color: 'RAL3020' } }, ...draft];
    setDraft(next);
    save(next);
  };

  const addFloor = () => {
    const last = draft[draft.length - 1];
    const next = [...draft, {
      id: null,
      name: (draft.length + 1) + '-qavat',
      height: last?.height || 3,
      facade: last ? last.facade : true,
      formwork: last?.formwork ? { ...last.formwork } : { type: 'msho', color: 'RAL3020' }
    }];
    setDraft(next);
    save(next);
  };

  const removeFloor = (idx) => {
    if (draft.length <= 1) return;
    const next = draft.filter((_, i) => i !== idx);
    setDraft(next);
    save(next);
  };

  const toggleFacade = (idx) => {
    const next = draft.map((f, i) => (i === idx ? { ...f, facade: !f.facade } : f));
    setDraft(next);
    save(next);
  };

  const editField = (idx, field, value) => {
    setDraft((d) => d.map((f, i) => (i === idx ? { ...f, [field]: value } : f)));
  };

  const setFormwork = (idx, patch) => {
    const next = draft.map((f, i) => (i === idx ? { ...f, formwork: { ...(f.formwork || { type: 'msho', color: 'RAL3020' }), ...patch } } : f));
    setDraft(next);
    save(next);
  };

  const saveEdits = () => save(draft);

  const facadeOnCount = draft.filter((f) => f.facade).length;
  const totalFacade = (project.quantities?.perFloor || []).reduce((s, f) => s + f.facadeArea, 0);

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <b>🏢 Qavatlar ({draft.length})</b>
        <span className="small-muted">apalka yoqilgan: {facadeOnCount} qavat · jami qolip yuzasi {fmtQ(totalFacade)} m² (ikki yuza)</span>
        <span style={{ flex: 1 }} />
        <button className="btn small" onClick={addPodval} disabled={busy}>⬇ Podval qo'shish</button>
        <button className="btn small" onClick={addFloor} disabled={busy}>➕ Qavat qo'shish</button>
        <button className="btn small secondary" onClick={saveEdits} disabled={busy}>💾 Nom/balandlikni saqlash</button>
      </div>
      {err && <div className="error-box">{err}</div>}
      {busy && <p className="small-muted">⏳ Hisoblanmoqda...</p>}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {draft.map((f, i) => {
          const s = sumById[f.id] || {};
          return (
            <div className="card" key={f.id || 'new' + i} style={{ opacity: f.facade === false ? 0.75 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <input
                  type="text" value={f.name} style={{ flex: 1, fontWeight: 600 }}
                  onChange={(e) => editField(i, 'name', e.target.value)}
                />
                <button className="btn small danger" onClick={() => removeFloor(i)} disabled={busy || draft.length <= 1} title="Qavatni o'chirish">✕</button>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                <label className="small-muted">Balandligi:</label>
                <input
                  type="number" step="0.1" min="0.5" max="6" value={f.height}
                  onChange={(e) => editField(i, 'height', Number(e.target.value))}
                  style={{ width: 80 }}
                />
                <span className="small-muted">m</span>
                <span style={{ flex: 1 }} />
                <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} title="Bu qavatga apalka (qolip/fasad) o'rnatish">
                  <input type="checkbox" checked={f.facade !== false} onChange={() => toggleFacade(i)} disabled={busy} />
                  Apalka
                </label>
              </div>
              <div className="small-muted" style={{ marginBottom: 4 }}>Qolip / apalka tizimi:</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, alignItems: 'center', marginBottom: 10 }}>
                <select
                  value={f.formwork?.type || 'msho'}
                  onChange={(e) => setFormwork(i, { type: e.target.value })}
                  title="Bu qavat devoriga qanday qolip/apalka o'rnatiladi"
                >
                  {FW_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                {(f.formwork?.type === 'ksho' || f.formwork?.type === 'msho') && (
                  <select
                    value={f.formwork?.color || 'RAL3020'}
                    onChange={(e) => setFormwork(i, { color: e.target.value })}
                    title="MINAR kukun bo'yoq rangi"
                  >
                    {MINAR.colors.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.id})</option>)}
                  </select>
                )}
              </div>
              <div className="phase-row"><span>Qolip yuzasi (2 yuza)</span><b>{f.facade !== false ? fmtQ(s.facadeArea || 0) + ' m²' : "o'chirilgan"}</b></div>
              <div className="phase-row"><span>Panellar</span><b>{qty(s.panelCount || 0)} dona</b></div>
              <div className="phase-row"><span>Mahsulot turlari</span><b>{s.rows ?? '—'}</b></div>
              <div className="phase-row" style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 6 }}>
                <span>Qavat summasi</span><b style={{ color: 'var(--accent)' }}>{s.total ? som(s.total) : '—'}</b>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <b>🔩 MINAR qolip katalogi (qo'shilgan qavatlarda hisoblanadi)</b>
        <div className="small-muted" style={{ marginTop: 6, lineHeight: 1.7 }}>
          <b>MSHO</b> — mayda shtitli: eni 200–600 mm × balandlik 300–1500 mm, po'lat 1045 (65×4), fanera 12 mm laminat, ~26 kg/m².<br />
          <b>KSHO</b> — katta shtitli: profil 120×60 (ST3SP), 3.3 m gacha, konus vtulkalar, ~90 kg/m².<br />
          <b>TU</b> — teleskopik ustunlar TU3,2–TU5,1 + uch oyoq + univilka (pol qolipi uchun, har qavatda).<br />
          <b>Detallar:</b> universal zamok (240 mm, 50 kN), tyaga (tayrot) 150 kN, cho'yan gayka, klin (79×27), <b>ikki shoxli tirgak</b> (truba ushlagichi 100×75), vertikal/gorizontal trubalar va <b>push-pull tirgak</b> (qiyalik tayanch — qolip siljimasligi uchun).
          Narxlar "Materiallar" bo'limida tahrirlanadi.
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <b>Apalka maydoni qavatlar bo'yicha</b>
        <div style={{ marginTop: 8 }}>
          {summary.map((s) => (
            <div className="phase-row" key={s.id}>
              <span>{s.name}{s.facade ? '' : " (apalkasiz)"} — {s.height} m</span>
              <span>{s.facade ? s.facadeArea + ' m²' : '—'}</span>
            </div>
          ))}
          <div className="phase-row active" style={{ borderTop: '1px solid var(--border)', paddingTop: 6 }}>
            <span><b>JAMI</b></span>
            <span><b>{project.quantities?.facadeArea || 0} m² · {som(project.boq?.total || 0)}</b></span>
          </div>
        </div>
      </div>

      <p className="small-muted" style={{ marginTop: 10 }}>
        💡 <b>Apalka belgisini olib tashlash</b> — shu qavat fasad panellarini hisobdan va 3D ko'rinishdan olib tashlaydi
        (masalan, 1-qavat g'isht ko'rinishida qolsin, 2-qavat apalka bo'lsin). "➕ Qavat qo'shish" — xuddi shu rejani
        yangi qavatga ko'chiradi (ko'p qavatli uy). Barcha hisoblar avtomatik qayta hisoblanadi.
      </p>
    </div>
  );
}

function fmtQ(n) { return (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('uz-UZ'); }
