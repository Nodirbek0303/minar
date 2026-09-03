import React, { useMemo, useState } from 'react';
import { api, som, qty } from '../api.js';
import VariantCompare from './VariantCompare.jsx';

// Spetsifikatsiya + smeta: apalka (qolip) va unga ketadigan mahsulotlar.
// Narxlar ko'rsatiladi va har qator uchun qo'lda tahrirlanadi;
// sotib olish va ARENDA rejimlari alohida hisoblanadi.
export default function MaterialsPanel({ project, onSaved, onUnauthorized }) {
  const [floorFilter, setFloorFilter] = useState('all');
  const [showPrices, setShowPrices] = useState(true);
  const [edit, setEdit] = useState(null);      // {key, value}
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const boq = project.boq || { rows: [] };
  const q = project.quantities || {};
  const rent = project.opts?.rentMode === 'rent';
  const months = project.opts?.rentMonths || 1;
  const floors = project.plan?.floors?.length ? project.plan.floors
    : (q.perFloor || [{ id: 'fl0', name: '1-qavat' }]);
  const floorSummary = project.floorSummary || [];

  // Har ikki tizim bo'limi: pozitsiyalar + oraliq jami
  const variants = project.variants || {};
  const sections = useMemo(() => (
    ['melki', 'krupny']
      .filter((id) => variants[id])
      .map((id) => {
        const v = variants[id];
        const rs = floorFilter === 'all' ? v.boq.rows : v.boq.rows.filter((r) => r.floorId === floorFilter);
        return {
          id, title: v.title, subtitle: v.subtitle, color: v.color,
          rows: rs,
          subtotal: rs.reduce((s, r) => s + r.total, 0),
          panels: rs.filter((r) => r.baseKey === 'qolip_panel').reduce((s, r) => s + r.qty, 0),
          selected: (project.variant || 'melki') === id
        };
      })
  ), [variants, floorFilter, project.variant]);

  const rows = useMemo(() => (
    floorFilter === 'all' ? boq.rows : boq.rows.filter((r) => r.floorId === floorFilter)
  ), [boq.rows, floorFilter]);

  const shownTotal = sections.reduce((s, x) => s + x.subtotal, 0);
  const selectedSection = sections.find((x) => x.selected);

  const save = async (body) => {
    setBusy(true); setErr('');
    try {
      const p = await api.updateProject(project.id, body);
      onSaved(p);
    } catch (e) {
      if (e.status === 401) onUnauthorized?.(); else setErr(e.message);
    }
    setBusy(false);
  };

  const setRentMode = (mode) => save({ opts: { rentMode: mode, rentMonths: months } });
  const selectVariant = (variant) => save({ variant });
  const setMonths = (m) => save({ opts: { rentMode: 'rent', rentMonths: Math.max(1, Math.min(120, Number(m) || 1)) } });

  const commitPrice = () => {
    if (!edit) return;
    const next = { ...(project.priceOverrides || {}) };
    const v = String(edit.value).trim();
    if (v === '') delete next[edit.key];
    else next[edit.key] = Number(v.replace(/\s/g, ''));
    setEdit(null);
    save({ priceOverrides: next });
  };

  const resetPrices = () => save({ priceOverrides: {} });

  // Spetsifikatsiya / tijorat taklifi (chop etish uchun)
  const printSpec = () => {
    const priceCols = showPrices;
    const printRows = selectedSection?.rows || rows;
    const rowsHtml = printRows.map((r) => (
      '<tr><td>' + (r.floorName || '') + '</td><td style="text-align:left">' + escapeHtml(r.name) + '</td><td>' + r.unit + '</td>' +
      '<td style="text-align:right"><b>' + qty(r.qty) + '</b></td>' +
      (priceCols
        ? '<td style="text-align:right">' + qty(r.matRate) + '</td><td style="text-align:right"><b>' + qty(r.total) + '</b></td>'
        : '') +
      '</tr>'
    )).join('');
    const fwInfo = (project.plan?.floors || []).map((f) =>
      f.name + ' — ' + (f.formwork?.type === 'ksho' ? 'KSHO' : f.formwork?.type === 'msho' ? 'MSHO (' + (f.formwork?.color || 'RAL3020') + ')' : 'klassik')
    ).join('; ');
    const mode = rent ? `ARENDA — ${months} oy` : 'SOTIB OLISH';
    const html = '<!doctype html><html lang="uz"><head><meta charset="utf-8"><title>Spetsifikatsiya — ' + escapeHtml(project.name) + '</title>' +
    '<style>' +
    "body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; margin: 28px; }" +
    '.head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #c22a1e; padding-bottom: 12px; }' +
    '.brand { font-size: 30px; font-weight: 800; color: #c22a1e; letter-spacing: 1px; }' +
    '.sub { color: #555; font-size: 12px; margin-top: 3px; }' +
    'h1 { font-size: 19px; margin: 20px 0 4px; }' +
    '.meta { color: #555; font-size: 13px; margin-bottom: 14px; }' +
    'table { width: 100%; border-collapse: collapse; font-size: 12px; }' +
    'th { background: #c22a1e; color: #fff; padding: 7px 8px; text-align: right; }' +
    'th:first-child, th:nth-child(2) { text-align: left; }' +
    'td { padding: 6px 8px; border-bottom: 1px solid #eee; text-align: right; }' +
    'td:first-child, td:nth-child(2) { text-align: left; }' +
    'tr:nth-child(even) td { background: #faf7f6; }' +
    'tfoot td { font-size: 14px; font-weight: 700; border-top: 2px solid #c22a1e; background: #fff !important; }' +
    '.note { margin-top: 18px; font-size: 11px; color: #777; line-height: 1.5; }' +
    '@media print { button { display: none; } }' +
    '</style></head><body>' +
    '<button onclick="window.print()" style="padding:9px 16px;background:#c22a1e;color:#fff;border:none;border-radius:7px;font-weight:600;cursor:pointer">🖨 Chop etish / PDF saqlash</button>' +
    '<div class="head"><div><div class="brand">MINAR</div>' +
    '<div class="sub">Silk Stars Engineering — qurilish qoliplari va mahsulotlari<br>www.minar.uz · (88) 141-45-00 · minar.uzbekistan</div></div>' +
    '<div style="text-align:right;font-size:12px;color:#555">Spetsifikatsiya №' + project.id + '<br>' + new Date().toLocaleDateString('uz-UZ') + '</div></div>' +
    '<h1>Apalka (qolip) mahsulotlari — ' + escapeHtml(project.name) + '</h1>' +
    '<div class="meta">Tizim: <b>' + escapeHtml(selectedSection?.title || '') + '</b> — ' + escapeHtml(selectedSection?.subtitle || '') + '</div>' +
    '<div class="meta">Rejim: <b>' + mode + '</b> · Qolip yuzasi: ' + (q.facadeArea || 0) + ' m² (ikki yuza) · Qavatlar: ' +
      (q.floorCount || 1) + ' · Panellar: ' + (q.panelCount || 0) + ' dona · Montaj muddati: ' + (project.schedule?.totalDays || 0) + ' kun</div>' +
    '<table><thead><tr><th>Qavat</th><th>Mahsulot</th><th>Birlik</th><th>Miqdor</th>' +
      (priceCols ? '<th>Narx (so‘m)</th><th>Summa (so‘m)</th>' : '') + '</tr></thead><tbody>' + rowsHtml + '</tbody>' +
      (priceCols ? '<tfoot><tr><td colspan="5">JAMI' + (rent ? ' (' + months + ' oylik arenda)' : '') + '</td><td>' + qty(selectedSection?.subtotal || 0) + '</td></tr></tfoot>' : '') +
    '</table>' +
    '<div class="note">Qolip tizimi: ' + escapeHtml(fwInfo) + '. Qolip devorning ikkala yuzasiga hisoblangan, eshik va deraza o‘rinlari chegirilgan. ' +
      'Panellar devor uzunligi va balandligiga katalog o‘lchamlari bilan aniq joylangan. Ushbu hisob ArxAI platformasida avtomatik yaratilgan.</div>' +
    '</body></html>';
    const w = window.open('', '_blank');
    if (!w) { setErr('Pop-up oynasi bloklangan — brauzerda ruxsat bering'); return; }
    w.document.write(html);
    w.document.close();
  };

  const exportCsv = () => {
    const head = showPrices
      ? 'Qavat,Mahsulot,Birlik,Miqdor,Narx,Summa\n'
      : 'Qavat,Mahsulot,Birlik,Miqdor\n';
    const body = (selectedSection?.rows || rows).map((r) => {
      const base = ['"' + (r.floorName || '') + '"', '"' + r.name.replace(/"/g, '""') + '"', r.unit, r.qty];
      return (showPrices ? [...base, r.matRate, r.total] : base).join(',');
    }).join('\n');
    const blob = new Blob(['﻿' + head + body], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'spetsifikatsiya-' + project.name.replace(/[^\w\-]+/g, '-') + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const overrides = project.priceOverrides || {};

  return (
    <div>
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
        {floorSummary.map((s) => (
          <div
            className="stat" key={s.id} style={{ cursor: 'pointer', borderColor: floorFilter === s.id ? 'var(--accent)' : undefined }}
            onClick={() => setFloorFilter(floorFilter === s.id ? 'all' : s.id)}
            title="Jadvalni shu qavat bo'yicha filtrlash"
          >
            <div className="v" style={{ fontSize: 15 }}>{s.name}{s.facade ? '' : ' ○'}</div>
            <div className="l">
              {s.facade ? s.facadeArea + ' m²' : "apalka yo'q"}
              {s.panelCount > 0 ? ' · ' + qty(s.panelCount) + ' panel' : ''}
              {showPrices && s.total > 0 ? <><br />{som(s.total)}</> : null}
            </div>
          </div>
        ))}
      </div>

      <VariantCompare project={project} onSelect={selectVariant} busy={busy} />

      {/* Rejim: sotib olish yoki arenda */}
      <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <b>💰 Narxlash rejimi:</b>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className={'btn small ' + (rent ? 'secondary' : '')}
            onClick={() => setRentMode('buy')} disabled={busy}
          >Sotib olish</button>
          <button
            className={'btn small ' + (rent ? '' : 'secondary')}
            onClick={() => setRentMode('rent')} disabled={busy}
          >Arenda (ijara)</button>
        </div>
        {rent && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="small-muted">Muddat:</span>
            <input
              type="number" min="1" max="120" value={months} style={{ width: 70 }}
              onChange={(e) => setMonths(e.target.value)} disabled={busy}
            />
            <span className="small-muted">oy</span>
          </label>
        )}
        <span style={{ flex: 1 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={showPrices} onChange={() => setShowPrices((v) => !v)} />
          <span className="small-muted">Narxlarni ko'rsatish</span>
        </label>
        {Object.keys(overrides).length > 0 && (
          <button className="btn small secondary" onClick={resetPrices} disabled={busy}>
            ↺ Narxlarni tiklash ({Object.keys(overrides).length})
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <label className="small-muted">Qavat:</label>
        <select value={floorFilter} onChange={(e) => setFloorFilter(e.target.value)}>
          <option value="all">Barcha qavatlar</option>
          {floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <button className="btn small secondary" onClick={exportCsv}>⬇ CSV eksport</button>
        <button className="btn small" style={{ background: 'var(--accent2)', color: '#fff' }} onClick={printSpec}>🖨 Spetsifikatsiya (PDF)</button>
        <span style={{ flex: 1 }} />
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 16 }}>
            {showPrices ? som(selectedSection?.subtotal || 0) : (selectedSection?.rows.length || 0) + ' mahsulot'}
          </div>
          <div className="small-muted">
            tanlangan: <b>{selectedSection?.title || '—'}</b> · qolip {q.facadeArea || 0} m² · {project.schedule?.totalDays} kun
            {rent ? ' · arenda ' + months + ' oy' : ''}
          </div>
        </div>
      </div>
      {err && <div className="error-box">{err}</div>}
      {busy && <p className="small-muted">⏳ Qayta hisoblanmoqda...</p>}

      {sections.map((sec) => (
        <div className="card" key={sec.id} style={{
          padding: 0, overflowX: 'auto', marginBottom: 14,
          borderColor: sec.selected ? sec.color : undefined,
          borderWidth: sec.selected ? 2 : 1
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            padding: '12px 16px', borderBottom: '1px solid var(--border)'
          }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: sec.color, display: 'inline-block' }} />
            <b style={{ fontSize: 15 }}>{sec.title.toUpperCase()}</b>
            <span className="small-muted">{sec.subtitle}</span>
            {sec.selected && <span className="badge" style={{ color: sec.color }}>tanlangan</span>}
            <span style={{ flex: 1 }} />
            <span className="small-muted">
              {sec.rows.length} pozitsiya · {qty(sec.panels)} panel
            </span>
            {showPrices && (
              <b style={{ color: sec.color, fontSize: 16 }}>{som(sec.subtotal)}</b>
            )}
            {!sec.selected && (
              <button className="btn small secondary" onClick={() => selectVariant(sec.id)} disabled={busy}>
                Tanlash
              </button>
            )}
          </div>
          <table className="boq">
            <thead>
              <tr>
                <th>#</th>
                {floorFilter === 'all' && <th>Qavat</th>}
                <th>Mahsulot</th>
                <th>Birlik</th>
                <th style={{ textAlign: 'right' }}>Miqdor</th>
                {showPrices && <th style={{ textAlign: 'right' }}>Narx{rent ? ` (${months} oy)` : ''}</th>}
                {showPrices && <th style={{ textAlign: 'right' }}>Summa</th>}
              </tr>
            </thead>
            <tbody>
              {sec.rows.map((r, i) => (
                <tr key={r.key}>
                  <td>{i + 1}</td>
                  {floorFilter === 'all' && <td className="small-muted">{r.floorName}</td>}
                  <td>{r.name}</td>
                  <td>{r.unit}</td>
                  <td className="num" style={{ fontWeight: 600, fontSize: 14 }}>{qty(r.qty)}</td>
                  {showPrices && (
                    <td className="num" onClick={() => sec.selected && setEdit({ key: r.key, value: String(r.matRate) })}
                      style={{ cursor: sec.selected ? 'pointer' : 'default' }}
                      title={sec.selected ? "Narxni o'zgartirish uchun bosing" : 'Narx faqat tanlangan variantda tahrirlanadi'}>
                      {edit?.key === r.key && sec.selected ? (
                        <input
                          type="number" autoFocus value={edit.value} style={{ width: 110 }}
                          onChange={(e) => setEdit({ key: r.key, value: e.target.value })}
                          onBlur={commitPrice}
                          onKeyDown={(e) => { if (e.key === 'Enter') commitPrice(); if (e.key === 'Escape') setEdit(null); }}
                        />
                      ) : (
                        <span style={overrides[r.key] !== undefined ? { color: 'var(--accent)', fontWeight: 600 } : undefined}>
                          {qty(r.matRate)}{overrides[r.key] !== undefined ? ' ✎' : ''}
                        </span>
                      )}
                    </td>
                  )}
                  {showPrices && <td className="num" style={{ fontWeight: 600 }}>{qty(r.total)}</td>}
                </tr>
              ))}
            </tbody>
            {showPrices && sec.rows.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={floorFilter === 'all' ? 5 : 4} style={{ textAlign: 'right', fontWeight: 700 }}>
                    {sec.title} — oraliq jami{rent ? ` (${months} oylik arenda)` : ''}
                  </td>
                  <td />
                  <td className="num" style={{ fontWeight: 800, color: sec.color }}>{qty(sec.subtotal)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      ))}

      <p className="small-muted" style={{ marginTop: 10 }}>
        Qolip devorning <b>ikkala yuzasiga</b> hisoblanadi, eshik va deraza o'rinlari chegiriladi
        {q.skippedArea > 0 ? <> (panel o'lchamiga kichik qolgan {qty(q.skippedArea)} m² proyom qutisi bilan yopiladi)</> : null}.
        Narx ustunidagi raqamni bosib o'z narxingizni kiritishingiz mumkin — jami avtomatik qayta hisoblanadi.
      </p>
    </div>
  );
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
