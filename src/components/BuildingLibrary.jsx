import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

// Haqiqiy binolar kutubxonasi.
//
// Nima uchun kerak: foydalanuvchida chizma bo'lmasa ham tizimni HAQIQIY
// bino ustida sinab ko'rishi mumkin — o'ylab topilgan to'rtburchak emas,
// Toshkentdagi haqiqiy uy.
//
// OSM ma'lumoti mukammal emas va buni YASHIRMAYMIZ: devor qalinligi va
// qavat balandligi u yerda umuman yo'q, shuning uchun ular ochiq-oydin
// kiritiladigan maydon sifatida turadi.

const KINDS = [
  ['', 'Barchasi'],
  ['apartments', "Ko'p qavatli uy"],
  ['yes', 'Turar-joy / aralash'],
  ['industrial', 'Sanoat'],
  ['retail', 'Savdo'],
  ['school', 'Maktab'],
  ['office', 'Ofis']
];

export default function BuildingLibrary({ onPick, onError }) {
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState(null);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ kind: '', minLevels: 2, minArea: 300, q: '' });
  const [thickness, setThickness] = useState(0.3);
  const [height, setHeight] = useState(3.0);
  const [picked, setPicked] = useState(null);

  const load = () => {
    setBusy(true);
    api.library({ ...f, limit: 40 })
      .then((d) => { setRows(d.results); setStats(d.stats); })
      .catch((e) => onError?.(e))
      .finally(() => setBusy(false));
  };

  useEffect(() => { load(); }, []);

  const use = async (b) => {
    setPicked(b.id);
    try {
      const { plan } = await api.libraryPlan(b.id, { thickness, height });
      onPick?.(plan, b);
    } catch (e) { onError?.(e); }
    finally { setPicked(null); }
  };

  return (
    <div className="card">
      <h3>🏙 Haqiqiy binolar kutubxonasi</h3>
      <p className="muted" style={{ marginTop: -4 }}>
        OpenStreetMap dan O'zbekiston binolari
        {stats ? ` — ${stats.total.toLocaleString('ru-RU')} ta` : ''}.
        Chizmangiz bo'lmasa ham tizimni haqiqiy bino ustida sinab ko'ring.
      </p>

      <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label>Turi
          <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
            {KINDS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </label>
        <label>Eng kam qavat
          <input type="number" min="1" max="40" value={f.minLevels}
                 onChange={(e) => setF({ ...f, minLevels: +e.target.value })} />
        </label>
        <label>Eng kam maydon, m²
          <input type="number" min="0" step="100" value={f.minArea}
                 onChange={(e) => setF({ ...f, minArea: +e.target.value })} />
        </label>
        <label>Nomi
          <input type="text" placeholder="masalan: Artel" value={f.q}
                 onChange={(e) => setF({ ...f, q: e.target.value })} />
        </label>
        <button className="btn secondary" onClick={load} disabled={busy}>
          {busy ? '⏳' : '🔍'} Qidirish
        </button>
      </div>

      {/* OSM da YO'Q qiymatlar - ular kiritiladi, o'ylab topilmaydi */}
      <div className="row" style={{ gap: 8, marginTop: 10, alignItems: 'flex-end' }}>
        <label>Devor qalinligi, m
          <input type="number" min="0.1" max="1.5" step="0.05" value={thickness}
                 onChange={(e) => setThickness(+e.target.value)} />
        </label>
        <label>Qavat balandligi, m
          <input type="number" min="2" max="8" step="0.1" value={height}
                 onChange={(e) => setHeight(+e.target.value)} />
        </label>
        <span className="muted" style={{ fontSize: 12, maxWidth: 380 }}>
          Bu ikki qiymat OpenStreetMap da <b>yo'q</b> — ularni siz kiritasiz.
          Kontur esa haqiqiy.
        </span>
      </div>

      {!rows.length && !busy && (
        <div className="empty-state" style={{ marginTop: 12 }}>
          Bu shartlarga mos bino topilmadi — shartlarni bo'shatib ko'ring.
        </div>
      )}

      {rows.length > 0 && (
        <table className="table" style={{ marginTop: 12 }}>
          <thead>
            <tr><th>Nomi</th><th>Turi</th><th style={{ textAlign: 'right' }}>Maydon</th>
                <th style={{ textAlign: 'right' }}>Qavat</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id}>
                <td>{b.name || <span className="muted">nomsiz</span>}</td>
                <td className="muted">{b.kind}</td>
                <td style={{ textAlign: 'right' }}>{b.areaM2.toLocaleString('ru-RU')} m²</td>
                <td style={{ textAlign: 'right' }}>{b.levels}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn small" onClick={() => use(b)} disabled={picked === b.id}>
                    {picked === b.id ? '⏳' : 'Tanlash'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        Manba: OpenStreetMap / Geofabrik (ODbL). Ma'lumot jamoa tomonidan
        kiritilgan va <b>mukammal emas</b>: qavat soni binolarning 18% ida,
        balandligi esa 0,6% ida ko'rsatilgan. Tanlangan konturni chizmangiz
        bilan solishtirib tekshiring.
      </p>
    </div>
  );
}
