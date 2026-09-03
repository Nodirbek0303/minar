import React, { useState } from 'react';
import { qty } from '../api.js';

// Etalon spetsifikatsiya bilan solishtirish.
// Loyihachi bergan tayyor ro'yxat bilan platformaning hisobi yonma-yon
// qo'yiladi — farq bo'lsa darrov ko'rinadi ("hato bo'lmasin").
const STATUS = {
  match:   { icon: '✓', label: 'mos',            color: 'var(--ok)' },
  differs: { icon: '≠', label: 'farq qiladi',    color: 'var(--accent)' },
  missing: { icon: '✗', label: 'hisobda yo‘q',   color: 'var(--danger)' },
  extra:   { icon: '+', label: 'etalonda yo‘q',  color: 'var(--muted)' }
};

export default function SpecCheck({ project }) {
  const [filter, setFilter] = useState('all');
  const check = project.specCheck?.[project.variant || 'melki'];
  const etalon = project.etalon;
  if (!check || !etalon) return null;

  const { rows, stat } = check;
  const shown = filter === 'all' ? rows : rows.filter((r) => r.status === filter);
  const total = rows.length;
  const okPct = total ? Math.round(stat.match / total * 100) : 0;

  const chip = (id, n) => (
    <button
      key={id}
      className={'btn small ' + (filter === id ? '' : 'secondary')}
      onClick={() => setFilter(filter === id ? 'all' : id)}
      style={filter === id ? undefined : { color: STATUS[id].color }}
    >
      {STATUS[id].icon} {STATUS[id].label}: {n}
    </button>
  );

  return (
    <div className="card" style={{ marginBottom: 14, padding: 0 }}>
      <div style={{ padding: '14px 16px 8px' }}>
        <b>📋 Etalon spetsifikatsiya bilan solishtirish</b>
        <div className="small-muted" style={{ marginTop: 3 }}>
          Manba: <b>{etalon.fileName || 'spetsifikatsiya'}</b> — {etalon.total} pozitsiya,
          {' '}{etalon.sections.map((s) => s.title).join(' + ')}.
          {' '}Platformaning hisobi shu ro‘yxat bilan qator-qator solishtirilgan.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
          {chip('match', stat.match)}
          {chip('differs', stat.differs)}
          {chip('missing', stat.missing)}
          {chip('extra', stat.extra)}
          <span style={{ flex: 1 }} />
          <span className="small-muted">
            mos kelish: <b style={{ color: okPct > 70 ? 'var(--ok)' : 'var(--accent)' }}>{okPct}%</b>
          </span>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="boq" style={{ minWidth: 640 }}>
          <thead>
            <tr>
              <th style={{ width: 34 }} />
              <th>Bo‘lim</th>
              <th>Pozitsiya</th>
              <th style={{ textAlign: 'right' }}>Etalon</th>
              <th style={{ textAlign: 'right' }}>Hisob</th>
              <th style={{ textAlign: 'right' }}>Farq</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => {
              const st = STATUS[r.status];
              return (
                <tr key={r.name + i}>
                  <td style={{ color: st.color, fontWeight: 700, textAlign: 'center' }}>{st.icon}</td>
                  <td className="small-muted" style={{ fontSize: 12 }}>{r.section}</td>
                  <td>{r.name}</td>
                  <td className="num">{r.spec === null ? '—' : qty(r.spec)}</td>
                  <td className="num" style={{ fontWeight: 600 }}>
                    {r.computed === null ? '—' : qty(r.computed)}
                  </td>
                  <td className="num" style={{ color: st.color, fontWeight: 600 }}>
                    {r.diff === null ? '—' : (r.diff > 0 ? '+' : '') + qty(r.diff)}
                    {r.pct !== null && Math.abs(r.pct) >= 1 ? ` (${r.pct > 0 ? '+' : ''}${r.pct}%)` : ''}
                  </td>
                </tr>
              );
            })}
            {!shown.length && (
              <tr><td colSpan={6} className="small-muted" style={{ textAlign: 'center', padding: 16 }}>
                Bu toifada pozitsiya yo‘q
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="small-muted" style={{ padding: '10px 16px 14px', margin: 0, lineHeight: 1.7 }}>
        <b>✓ mos</b> — miqdor bir xil · <b>≠ farq</b> — pozitsiya bor, lekin miqdor boshqa ·
        {' '}<b>✗ hisobda yo‘q</b> — etalonda bor, platforma hisoblamagan ·
        {' '}<b>+ etalonda yo‘q</b> — platforma qo‘shgan, ro‘yxatda yo‘q.<br />
        Farq sabablari: chizmadagi devor uzunligi, qavatlar soni yoki me’yorlar boshqacha bo‘lishi mumkin.
        Me’yorlarni to‘g‘rilash uchun farqni ko‘rsating — hisob shunga moslanadi.
      </p>
    </div>
  );
}
