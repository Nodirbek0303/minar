import React, { useMemo, useState } from 'react';
import { api } from '../api.js';

const STATE = {
  ready: ['Tayyor', 'ok'], reference: ['Ma’lumotnoma', 'muted'],
  exchange_required: ['IFC/DXF kerak', 'warning'], processing: ['Qayta ishlanmoqda', 'warning']
};
const STATUS = { open: 'Ochiq', in_progress: 'Ishlanmoqda', resolved: 'Yopilgan' };

export default function BimCoordination({ project, onSaved, onUnauthorized }) {
  const [title, setTitle] = useState('');
  const [discipline, setDiscipline] = useState('AR');
  const [priority, setPriority] = useState('normal');
  const [saving, setSaving] = useState(false);
  const bim = project.bim || { models: [], issues: [] };
  const models = bim.models || [];
  const issues = bim.issues || [];
  const ready = models.filter((m) => m.state === 'ready').length;
  const open = issues.filter((i) => i.status !== 'resolved').length;
  const formats = useMemo(() => [...new Set(models.map((m) => m.format))].join(' · ') || '—', [models]);

  const save = async (next) => {
    setSaving(true);
    try { onSaved(await api.updateProject(project.id, { bim: next })); }
    catch (e) { if (e.status === 401) onUnauthorized?.(); else window.alert(e.message); }
    finally { setSaving(false); }
  };
  const addIssue = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    save({ ...bim, issues: [...issues, { id: 'issue-' + Date.now(), title: title.trim(), discipline, priority, status: 'open', createdAt: new Date().toISOString() }] });
    setTitle('');
  };
  const setIssueStatus = (id, status) => save({ ...bim, issues: issues.map((x) => x.id === id ? { ...x, status } : x) });

  return <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(280px, .8fr)' }}>
    <section className="card">
      <div className="section-heading"><div><span className="eyebrow">Common Data Environment</span><h2>BIM koordinatsiya markazi</h2></div><span className="badge on">● loyiha ma’lumotlari sinxron</span></div>
      <p className="small-muted" style={{ lineHeight: 1.65, marginTop: 0 }}>
        Arxitektura, konstruksiya va MEP model manbalari bitta loyiha kontekstida saqlanadi. Hisob uchun hozirgi asosiy geometriya — DXF/plan; IFC esa openBIM almashuv modeli sifatida tekshiriladi va versiyasi kuzatiladi.
      </p>
      <div className="bim-kpis">
        <Metric value={models.length} label="biriktirilgan manba" />
        <Metric value={ready} label="hisobga tayyor model" tone="ok" />
        <Metric value={open} label="ochiq koordinatsiya masalasi" tone={open ? 'warning' : 'ok'} />
        <Metric value={formats} label="formatlar" />
      </div>
      <div className="model-table">
        <div className="model-row model-head"><span>Model / hujjat</span><span>Yo‘nalish</span><span>Reviziya</span><span>Holat</span></div>
        {models.length ? models.map((m) => {
          const state = STATE[m.state] || STATE.reference;
          return <div className="model-row" key={m.id}><span><b>{m.name}</b><small>{m.format} · source ID: {m.fileId}</small></span><span>{m.discipline}</span><span>{m.revision}</span><span className={'status ' + state[1]}>{state[0]}</span></div>;
        }) : <div className="empty-state">Model biriktirilmagan. Yangi loyiha yaratishda IFC, DXF yoki DWG faylini yuklang.</div>}
      </div>
      <div className="integration-note"><b>Revit / AutoCAD bilan ishlash:</b> Revit’dan <b>IFC4</b> (model koordinatsiyasi) yoki <b>DXF</b> (2D reja) eksport qiling. AutoCAD DWG manba sifatida saqlanadi; aniq geometriya hisobi uchun DXF eksporti kerak. Native RVT/DWG faylini serverda “to‘liq BIM model” deb noto‘g‘ri talqin qilmaymiz.</div>
    </section>
    <aside className="card">
      <div className="section-heading"><div><span className="eyebrow">Issue management</span><h2>Masalalar</h2></div></div>
      <form onSubmit={addIssue} className="issue-form">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Masalan: AR va KR devor o‘qi farq qiladi" maxLength="160" />
        <div><select value={discipline} onChange={(e) => setDiscipline(e.target.value)}><option>AR</option><option>KR</option><option>MEP</option><option>Umumiy</option></select><select value={priority} onChange={(e) => setPriority(e.target.value)}><option value="normal">Oddiy</option><option value="high">Yuqori</option><option value="low">Past</option></select></div>
        <button className="btn" disabled={saving || !title.trim()}>+ Masala ochish</button>
      </form>
      <div className="issue-list">{issues.length ? issues.slice().reverse().map((i) => <div className="issue" key={i.id}><div><span className={'priority ' + i.priority}>{i.priority === 'high' ? 'Yuqori' : i.priority === 'low' ? 'Past' : 'Oddiy'}</span><b>{i.title}</b><small>{i.discipline} · {new Date(i.createdAt).toLocaleDateString('uz-UZ')}</small></div><select aria-label="Masala holati" value={i.status} onChange={(e) => setIssueStatus(i.id, e.target.value)} disabled={saving}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>) : <div className="empty-state">Hozircha koordinatsiya masalasi yo‘q.</div>}</div>
    </aside>
  </div>;
}

function Metric({ value, label, tone = '' }) { return <div className="bim-metric"><b className={tone}>{value}</b><span>{label}</span></div>; }
