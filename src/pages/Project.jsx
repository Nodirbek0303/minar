import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, som } from '../api.js';
import PlanViewer2D from '../components/PlanViewer2D.jsx';
import MaterialsPanel from '../components/MaterialsPanel.jsx';
import Viewer5D from '../components/Viewer5D.jsx';
import FacadeDetail from '../components/FacadeDetail.jsx';
import ChatPanel from '../components/ChatPanel.jsx';
import FloorsPanel from '../components/FloorsPanel.jsx';
import BimCoordination from '../components/BimCoordination.jsx';
import FormworkDrawings from '../components/FormworkDrawings.jsx';

// Plan qayerdan kelgani - foydalanuvchi raqamlarning ishonchliligini
// shundan biladi.
const SOURCE_NAME = {
  dxf: 'DXF',
  ifc: 'IFC (BIM model)',
  osm: 'OpenStreetMap konturi',
  'image-ai': 'AI rasm tahlili',
  'ai-docs': 'AI hujjat tahlili',
  demo: 'Namuna'
};

const TABS = [
  { key: 'bim', name: '◈ BIM markazi' },
  { key: 'drawings', name: '📋 Ishchi chizmalar' },
  { key: 'plan', name: '📐 Reja (2D)' },
  { key: 'floors', name: '🏢 Qavatlar' },
  { key: 'materials', name: '🧱 Materiallar va narx' },
  { key: '5d', name: '🏗 5D ko‘rish (qolip joylanishi)' },
  { key: 'facade', name: '🔩 Fasad detali (3D)' },
  { key: 'chat', name: '🤖 AI yordamchi' }
];

export default function Project({ onUnauthorized }) {
  const { id } = useParams();
  const [p, setP] = useState(null);
  const [tab, setTab] = useState('bim');
  const [error, setError] = useState('');

  const load = () => api.getProject(id).then(setP).catch((e) => {
    if (e.status === 401) onUnauthorized?.(); else setError(e.message);
  });
  useEffect(() => { load(); }, [id]);

  if (error) return <div className="container"><div className="error-box">{error}</div></div>;
  if (!p) return <div className="container"><p className="small-muted">Yuklanmoqda...</p></div>;

  const q = p.quantities || {};
  return (
    <div className="container">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap', marginBottom: 8 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>{p.name}</h1>
        <span className="demo-tag">{SOURCE_NAME[p.plan?.meta?.source] || 'Namuna'}</span>
        <span style={{ flex: 1 }} />
        {p.opts?.rentMode === 'rent' && (
          <span className="badge">arenda · {p.opts?.rentMonths || 1} oy</span>
        )}
        <div style={{ textAlign: 'right' }}>
          <b style={{ color: 'var(--accent)', fontSize: 18 }}>{som(p.boq?.total || 0)}</b>
          <div className="small-muted">{q.facadeArea || 0} m² qolip · {p.schedule?.totalDays} kun montaj</div>
        </div>
      </div>

      {/* Manba haqidagi ogohlantirish. Bu yerda katta summalar chiqadi;
          agar ba'zi o'lchamlar TAXMIN bo'lsa, buni aytmaslik - raqamni
          o'lchangandek ko'rsatish demak. */}
      {p.plan?.meta?.note && (
        <div className="warn-box" style={{ marginBottom: 12 }}>
          ⚠ <b>Bu hisob taxminiy o'lchamlarga tayanadi.</b> {p.plan.meta.note}
        </div>
      )}

      <div className="stat-grid">
        <div className="stat"><div className="v">{q.floorCount ?? 1}</div><div className="l">qavat</div></div>
        <div className="stat"><div className="v">{q.facadeArea} m²</div><div className="l">qolip yuzasi (2 yuza)</div></div>
        <div className="stat"><div className="v">{q.panelCount || 0}</div><div className="l">panel (dona)</div></div>
        <div className="stat"><div className="v">{q.totalHeight} m</div><div className="l">bino balandligi</div></div>
        <div className="stat"><div className="v">{p.boq?.rows?.length || 0}</div><div className="l">mahsulot turlari</div></div>
        <div className="stat"><div className="v">{p.schedule?.totalDays} kun</div><div className="l">montaj muddati</div></div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
            {t.name}
          </button>
        ))}
      </div>

      {tab === 'bim' && <BimCoordination project={p} onSaved={setP} onUnauthorized={onUnauthorized} />}
      {tab === 'drawings' && <FormworkDrawings project={p} />}
      {tab === 'plan' && <PlanViewer2D plan={p.plan} />}
      {tab === 'floors' && <FloorsPanel project={p} onSaved={setP} onUnauthorized={onUnauthorized} />}
      {tab === 'materials' && <MaterialsPanel project={p} onSaved={setP} onUnauthorized={onUnauthorized} />}
      {tab === '5d' && <Viewer5D project={p} />}
      {tab === 'facade' && <FacadeDetail />}
      {tab === 'chat' && <ChatPanel project={p} onUnauthorized={onUnauthorized} />}
    </div>
  );
}
