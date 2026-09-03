import React from 'react';
import { som, qty } from '../api.js';

// Ikki tizimni yonma-yon taqqoslash: мелкощитовая va крупнощитовая.
// Har biri to'liq alohida hisoblangan — mijoz shu jadval bo'yicha tanlaydi.
export default function VariantCompare({ project, onSelect, busy }) {
  const v = project.variants;
  const c = project.comparison;
  if (!v?.melki || !v?.krupny) return null;

  const sel = project.variant || 'melki';
  const rows = [
    { k: 'Qolip yuzasi', get: (x) => qty(x.quantities.facadeArea) + ' m²', same: true },
    { k: 'Panellar', get: (x) => qty(x.quantities.panelCount) + ' dona', best: 'min', num: (x) => x.quantities.panelCount },
    { k: 'Pozitsiyalar', get: (x) => x.boq.rows.length + ' ta', best: 'min', num: (x) => x.boq.rows.length },
    { k: 'Umumiy og‘irlik', get: (x) => qty(weightOf(x.boq)) + ' kg', best: 'min', num: (x) => weightOf(x.boq) },
    { k: 'Montaj muddati', get: (x) => x.schedule.totalDays + ' kun', best: 'min', num: (x) => x.schedule.totalDays },
    { k: 'Summa', get: (x) => som(x.boq.total), best: 'min', num: (x) => x.boq.total, strong: true }
  ];

  const cell = (r, x, other) => {
    const isBest = r.best === 'min' && !r.same && r.num(x) < r.num(other);
    return (
      <td className="num" style={{
        fontWeight: r.strong ? 800 : 600,
        fontSize: r.strong ? 15 : 14,
        color: isBest ? 'var(--ok)' : undefined
      }}>
        {r.get(x)}{isBest ? ' ↓' : ''}
      </td>
    );
  };

  const head = (id) => {
    const x = v[id];
    const active = sel === id;
    return (
      <th style={{
        textAlign: 'right', padding: '10px 14px',
        borderBottom: '3px solid ' + (active ? x.color : 'transparent')
      }}>
        <div style={{ color: x.color, fontSize: 15, fontWeight: 700 }}>{x.title}</div>
        <div className="small-muted" style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
          {x.subtitle}
        </div>
      </th>
    );
  };

  return (
    <div className="card" style={{ marginBottom: 14, padding: 0, overflowX: 'auto' }}>
      <div style={{ padding: '14px 16px 6px' }}>
        <b>⚖ Ikki tizim taqqoslashi</b>
        <div className="small-muted" style={{ marginTop: 3 }}>
          Bitta loyiha uchun ikkalasi ham to'liq hisoblangan. Tanlangan variant bosh ko'rsatkichlarga,
          5D ko'rinishga va PDF spetsifikatsiyaga tushadi.
        </div>
      </div>
      <table className="boq" style={{ minWidth: 560 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Ko'rsatkich</th>
            {head('melki')}
            {head('krupny')}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.k}>
              <td>{r.k}</td>
              {cell(r, v.melki, v.krupny)}
              {cell(r, v.krupny, v.melki)}
            </tr>
          ))}
          <tr>
            <td className="small-muted">Xususiyati</td>
            <td className="small-muted" style={{ textAlign: 'right', fontSize: 12, maxWidth: 260 }}>{v.melki.hint}</td>
            <td className="small-muted" style={{ textAlign: 'right', fontSize: 12, maxWidth: 260 }}>{v.krupny.hint}</td>
          </tr>
          <tr>
            <td />
            {['melki', 'krupny'].map((id) => (
              <td key={id} style={{ textAlign: 'right' }}>
                <button
                  className={'btn small ' + (sel === id ? '' : 'secondary')}
                  onClick={() => onSelect(id)}
                  disabled={busy || sel === id}
                >
                  {sel === id ? '✓ Tanlangan' : 'Shuni tanlash'}
                </button>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      {c?.total && (
        <div className="small-muted" style={{ padding: '8px 16px 14px' }}>
          Farq: <b style={{ color: 'var(--accent)' }}>{som(Math.abs(c.total.diff))}</b>
          {' '}— {c.total.cheaper === 'melki' ? 'мелкощитовая' : 'крупнощитовая'} arzonroq
          ({Math.round(Math.abs(c.total.diff) / Math.max(1, Math.max(c.total.melki, c.total.krupny)) * 100)}%).
          {c.panels && <> Panel soni: {qty(c.panels.melki)} ↔ {qty(c.panels.krupny)} dona.</>}
        </div>
      )}
    </div>
  );
}

function weightOf(boq) {
  let sum = 0;
  for (const r of boq.rows || []) {
    const m = /—\s*([\d.]+)\s*kg/.exec(r.name);
    if (m) sum += Number(m[1]) * r.qty;
  }
  return Math.round(sum);
}
