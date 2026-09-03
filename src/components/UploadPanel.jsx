import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

// Ko'p faylli yuklash: DXF, PDF, rasm, DOCX, XLSX — bir vaqtda.
// Fayllar birga tahlil qilinadi, natija tasdiqlangach loyiha yaratiladi.

const KIND_ICON = {
  dxf: '📐', image: '🖼', pdf: '📕', docx: '📄', xlsx: '📊', text: '📝', cad: '⚠', other: '📎'
};
const KIND_NAME = {
  dxf: 'AutoCAD chizma', image: 'Rasm', pdf: 'PDF hujjat',
  docx: 'Word hujjat', xlsx: 'Excel jadval', text: 'Matn', cad: 'AutoCAD DWG', other: 'Boshqa'
};

const SCHEMES = [
  { id: 'podval-1', name: 'Faqat podval va 1-qavat', hint: 'Qolip yer osti qavatlariga va birinchi qavatga qo‘yiladi' },
  { id: 'all', name: 'Barcha qavatlar', hint: 'Har bir qavatga qolip hisoblanadi' }
];

const UNITS = [
  { id: 'auto', name: 'avtomatik' },
  { id: 'mm', name: 'mm' },
  { id: 'cm', name: 'sm' },
  { id: 'm', name: 'm' }
];

const kindOf = (name) => {
  const ext = '.' + (name.split('.').pop() || '').toLowerCase();
  if (ext === '.dxf') return 'dxf';
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) return 'image';
  if (ext === '.pdf') return 'pdf';
  if (ext === '.docx') return 'docx';
  if (ext === '.xlsx') return 'xlsx';
  if (['.txt', '.csv'].includes(ext)) return 'text';
  if (ext === '.dwg') return 'cad';
  return 'other';
};

const kb = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

export default function UploadPanel({ onCreated, onUnauthorized }) {
  const [picked, setPicked] = useState([]);        // File[]
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);      // tahlil natijasi
  const [scheme, setScheme] = useState('podval-1');
  const [units, setUnits] = useState('auto');
  const [caps, setCaps] = useState(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef();

  useEffect(() => { api.capabilities().then(setCaps).catch(() => {}); }, []);

  const fail = (e) => {
    if (e.status === 401) return onUnauthorized?.();
    setError(e.message);
  };

  const addFiles = (list) => {
    const arr = Array.from(list || []);
    if (!arr.length) return;
    setError(''); setResult(null);
    setPicked((prev) => {
      const seen = new Set(prev.map((f) => f.name + f.size));
      return [...prev, ...arr.filter((f) => !seen.has(f.name + f.size))].slice(0, 20);
    });
  };

  const removeAt = (i) => setPicked((p) => p.filter((_, j) => j !== i));
  const clearAll = () => { setPicked([]); setResult(null); setError(''); };

  const analyze = async () => {
    if (!picked.length || busy) return;
    setError(''); setResult(null);
    try {
      setBusy(`${picked.length} ta fayl yuklanmoqda...`);
      const up = await api.uploadMany(picked);
      setBusy('Hujjatlar o‘qilmoqda va tahlil qilinmoqda...');
      const r = await api.analyzeBatch(up.files.map((f) => f.fileId), {
        units: units === 'auto' ? undefined : units,
        scheme
      });
      setResult(r);
      setBusy('');
    } catch (e) {
      setBusy('');
      if (e.status === 422 && e.data?.report) {
        setResult({ ...e.data, failed: true });
        setError(e.message);
        return;
      }
      fail(e);
    }
  };

  const createProject = async () => {
    if (!result?.plan || busy) return;
    setBusy('Loyiha yaratilmoqda va hisoblanmoqda...');
    try {
      const p = await api.createProject(
        result.plan.meta?.name || 'Yangi loyiha', result.plan, undefined, scheme, result.etalon
      );
      onCreated(p);
    } catch (e) {
      setBusy('');
      fail(e);
    }
  };

  const onDrop = (e) => {
    e.preventDefault(); setDrag(false);
    addFiles(e.dataTransfer?.files);
  };

  const accept = caps?.formats?.join(',') || '.dxf,.pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.txt,.csv';

  return (
    <div>
      {/* --- Tashlash maydoni --- */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className="card"
        style={{
          border: '2px dashed ' + (drag ? 'var(--accent)' : 'var(--border)'),
          background: drag ? 'rgba(245,166,35,0.06)' : undefined,
          textAlign: 'center', padding: '26px 20px', cursor: 'pointer', marginBottom: 12
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 4 }}>📥</div>
        <b>Hujjatlarni bu yerga tashlang yoki bosing</b>
        <div className="small-muted" style={{ marginTop: 6, lineHeight: 1.7 }}>
          Bir vaqtda <b>20 tagacha</b> fayl: AutoCAD chizmasi (DXF), PDF loyiha, chizma rasmi (JPG/PNG),
          Word (DOCX) va Excel (XLSX) hujjatlari, matn fayllari.<br />
          Barchasi <b>birga</b> o‘qiladi — chizmadan geometriya, hujjatlardan qavatlar va o‘lchamlar olinadi.
        </div>
        <input
          ref={inputRef} type="file" multiple accept={accept} style={{ display: 'none' }}
          onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
        />
      </div>

      {/* --- Sozlamalar --- */}
      <div className="card" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="small-muted">Apalka sxemasi:</span>
          <select value={scheme} onChange={(e) => setScheme(e.target.value)} style={{ minWidth: 220 }}>
            {SCHEMES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <span className="small-muted" style={{ fontSize: 12 }}>
          {SCHEMES.find((s) => s.id === scheme)?.hint}
        </span>
        <span style={{ flex: 1 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="small-muted">DXF birligi:</span>
          <select value={units} onChange={(e) => setUnits(e.target.value)}>
            {UNITS.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
      </div>

      {/* --- Tanlangan fayllar --- */}
      {picked.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <b>Tanlangan fayllar ({picked.length})</b>
            <span style={{ flex: 1 }} />
            <button className="btn small secondary" onClick={clearAll} disabled={!!busy}>Tozalash</button>
            <button className="btn small" onClick={analyze} disabled={!!busy}>
              🤖 Tahlil qilish
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
            {picked.map((f, i) => {
              const k = kindOf(f.name);
              return (
                <div key={f.name + i} className="phase-row" style={{ gap: 8 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {KIND_ICON[k]} {f.name}
                  </span>
                  <span className="small-muted" style={{ whiteSpace: 'nowrap' }}>
                    {kb(f.size)}
                    <button
                      className="btn small danger" style={{ marginLeft: 8, padding: '0 7px' }}
                      onClick={() => removeAt(i)} disabled={!!busy} title="Ro'yxatdan olib tashlash"
                    >✕</button>
                  </span>
                </div>
              );
            })}
          </div>
          {caps && !caps.ai && picked.some((f) => ['image', 'pdf'].includes(kindOf(f.name))) && (
            <p className="small-muted" style={{ marginTop: 10 }}>
              ⚠ AI kaliti ulanmagan: rasm va PDF <b>chizmalari</b> o‘qilmaydi. Hujjatlardagi <b>matn</b>
              (qavatlar, balandliklar, o‘lchamlar) va DXF chizmalar baribir to‘liq tahlil qilinadi.
            </p>
          )}
        </div>
      )}

      {busy && <p style={{ color: 'var(--accent)' }}>⏳ {busy}</p>}
      {error && <div className="error-box">⚠ {error}</div>}

      {/* --- Tahlil natijasi --- */}
      {result && <AnalysisReport result={result} onCreate={createProject} busy={busy} />}
    </div>
  );
}

function AnalysisReport({ result, onCreate, busy }) {
  const { report = [], plan, summary, source, aiError, floorSource, failed } = result;
  const okCount = report.filter((r) => r.ok).length;

  return (
    <div className="card" style={{ borderColor: failed ? 'var(--danger)' : 'var(--accent)', marginTop: 12 }}>
      <b>📋 Tahlil hisoboti</b>
      <div className="small-muted" style={{ marginTop: 4, marginBottom: 10 }}>
        {okCount}/{report.length} fayl o‘qildi{source ? ` · geometriya manbasi: ${source}` : ''}
      </div>

      <div style={{ marginBottom: 12 }}>
        {report.map((f, i) => (
          <div className="phase-row" key={i}>
            <span>
              {f.ok ? '✅' : '⚠️'} {KIND_ICON[f.kind] || '📎'} {f.name}
              {f.roleTitle && (
                <b style={{ color: 'var(--accent)' }}> · {f.roleTitle}</b>
              )}
            </span>
            <span className="small-muted">{f.info}</span>
          </div>
        ))}
      </div>

      {summary && (
        <div className="phase-row" style={{ display: 'block', lineHeight: 1.7 }}>
          <b>Xulosa:</b> <span className="small-muted">{summary}</span>
        </div>
      )}
      {aiError && (
        <p className="small-muted" style={{ marginTop: 8 }}>ℹ {aiError}</p>
      )}

      {result.etalon && (
        <div className="phase-row" style={{ display: 'block', lineHeight: 1.7 }}>
          <b>📋 Etalon spetsifikatsiya:</b>{' '}
          <span className="small-muted">
            {result.etalon.total} pozitsiya — {result.etalon.sections.map((s) => `${s.title} (${s.items.length})`).join(' + ')}.
            Loyiha yaratilgach hisob shu ro‘yxat bilan solishtiriladi.
          </span>
        </div>
      )}

      {plan && (
        <>
          <div className="phase-row" style={{ marginTop: 10 }}>
            <span>Chizma</span>
            <b>{plan.walls.length} devor · {plan.rooms.length} xona{plan.columns?.length ? ` · ${plan.columns.length} ustun` : ''}</b>
          </div>

          <div style={{ marginTop: 12 }}>
            <b style={{ fontSize: 13 }}>
              Qavatlar ({plan.floors?.length || 0})
              <span className="small-muted" style={{ fontWeight: 400 }}>
                {floorSource === 'ai' ? ' — AI aniqladi' : floorSource === 'matn' ? ' — hujjat matnidan' : ' — standart'}
              </span>
            </b>
            <div style={{ marginTop: 6 }}>
              {(plan.floors || []).map((f) => (
                <div className="phase-row" key={f.id}>
                  <span>
                    {f.underground ? '⬇' : '🏢'} {f.name}
                    <span className="small-muted"> · {f.height} m</span>
                    {f.addedByRule && (
                      <span className="small-muted" style={{ color: 'var(--accent)' }}>
                        {' '}· qoida bo‘yicha qo‘shildi (hujjatda topilmadi)
                      </span>
                    )}
                  </span>
                  <b style={{ color: f.facade ? 'var(--ok)' : 'var(--muted)' }}>
                    {f.facade ? '● apalka qo‘yiladi' : '○ apalka yo‘q'}
                  </b>
                </div>
              ))}
            </div>
          </div>

          <button className="btn" style={{ marginTop: 14 }} onClick={onCreate} disabled={!!busy}>
            ✅ Loyihani yaratish va hisoblash
          </button>
        </>
      )}
    </div>
  );
}
