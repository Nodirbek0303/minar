import React, { useEffect, useMemo, useRef, useState } from 'react';

const len = (w) => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
const mm = (v) => `${Math.round(Number(v) * 1000)} mm`;
const coord = (p) => `${Number(p[0]).toFixed(3)}; ${Number(p[1]).toFixed(3)}`;

function downloadPlanDxf(plan) {
  const rows = ['0','SECTION','2','HEADER','9','$INSUNITS','70','6','0','ENDSEC','0','SECTION','2','TABLES'];
  for (const layer of ['WALL_EXTERIOR','WALL_INTERIOR','OPENING_DOOR','OPENING_WINDOW','DIMENSION','TEXT']) rows.push('0','TABLE','2','LAYER','70','1','0','LAYER','2',layer,'70','0','62','7','6','CONTINUOUS','0','ENDTAB');
  rows.push('0','ENDSEC','0','SECTION','2','ENTITIES');
  const line = (a,b,layer) => rows.push('0','LINE','8',layer,'10',String(a[0]*1000),'20',String(a[1]*1000),'30','0','11',String(b[0]*1000),'21',String(b[1]*1000),'31','0');
  const text = (x,y,v) => rows.push('0','TEXT','8','TEXT','10',String(x*1000),'20',String(y*1000),'30','0','40','120','1',v,'7','STANDARD');
  (plan.walls || []).forEach((w,i) => { line(w.a,w.b,w.type === 'exterior' ? 'WALL_EXTERIOR' : 'WALL_INTERIOR'); const L=len(w), mx=(w.a[0]+w.b[0])/2, my=(w.a[1]+w.b[1])/2; text(mx,my,`${w.height.toFixed(2)}m x ${L.toFixed(2)}m`); });
  (plan.openings || []).forEach((o) => { const w=(plan.walls||[]).find((x)=>x.id===o.wallId); if(!w)return; const L=len(w), ux=(w.b[0]-w.a[0])/L,uy=(w.b[1]-w.a[1])/L; line([w.a[0]+ux*o.offset,w.a[1]+uy*o.offset],[w.a[0]+ux*(o.offset+o.width),w.a[1]+uy*(o.offset+o.width)],o.type==='door'?'OPENING_DOOR':'OPENING_WINDOW'); });
  rows.push('0','ENDSEC','0','EOF'); const blob=new Blob([rows.join('\n')],{type:'application/dxf'}), a=document.createElement('a'); a.href=URL.createObjectURL(blob);a.download=`ARXAI_${plan.meta?.name||'plan'}_2D.dxf`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

// Reja, devor pasporti va o'lcham chiziqlari bir xil geometriyadan chiziladi.
export default function PlanViewer2D({ plan }) {
  const canvasRef = useRef(null), transformRef = useRef(null);
  const [selected, setSelected] = useState(null);
  const walls = plan.walls || [], rooms = plan.rooms || [], openings = plan.openings || [];
  const active = walls.find((w) => w.id === selected);
  const stats = useMemo(() => ({
    perimeter: walls.filter((w) => w.type === 'exterior').reduce((n, w) => n + len(w), 0),
    total: walls.reduce((n, w) => n + len(w), 0)
  }), [walls]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas || !walls.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    walls.forEach((w) => [w.a, w.b].forEach((p) => { minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]); maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]); }));
    const pad = Math.max(.8, Math.max(maxX - minX, maxY - minY) * .1), W = maxX - minX + 2 * pad, H = maxY - minY + 2 * pad;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1, cw = canvas.clientWidth, ch = canvas.clientHeight, ctx = canvas.getContext('2d');
      canvas.width = cw * dpr; canvas.height = ch * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#0a0f18'; ctx.fillRect(0, 0, cw, ch);
      const s = Math.min((cw - 60) / W, (ch - 60) / H), left = (cw - W * s) / 2, X = (x) => (x - minX + pad) * s + left, Y = (y) => ch - ((y - minY + pad) * s + 28);
      transformRef.current = { X, Y }; ctx.strokeStyle = '#152033'; ctx.lineWidth = 1;
      for (let x = Math.ceil((minX - pad)); x <= maxX + pad; x++) { ctx.beginPath(); ctx.moveTo(X(x), 0); ctx.lineTo(X(x), ch); ctx.stroke(); }
      for (let y = Math.ceil((minY - pad)); y <= maxY + pad; y++) { ctx.beginPath(); ctx.moveTo(0, Y(y)); ctx.lineTo(cw, Y(y)); ctx.stroke(); }
      rooms.forEach((r) => { ctx.beginPath(); r.polygon.forEach(([x, y], i) => i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))); ctx.closePath(); ctx.fillStyle = 'rgba(47,129,247,.07)'; ctx.fill(); const x = r.polygon.reduce((n, p) => n + p[0], 0) / r.polygon.length, y = r.polygon.reduce((n, p) => n + p[1], 0) / r.polygon.length; ctx.fillStyle = '#8fa3bd'; ctx.font = '12px Segoe UI'; ctx.textAlign = 'center'; ctx.fillText(r.name || '', X(x), Y(y)); });
      // Rejani o'qib bo'ladigan saqlash uchun barcha devorlarga bir vaqtda
      // yozuv qo'yilmaydi. Tanlangan devorning marka/o'lchami alohida chiqadi,
      // qolganlar esa aniq vedomost jadvalida beriladi.
      walls.forEach((w) => { const chosen = w.id === selected; ctx.strokeStyle = chosen ? '#f5a623' : w.type === 'exterior' ? '#e8eef7' : '#9db2cc'; ctx.lineWidth = Math.max(chosen ? 4 : 2, w.thickness * s); ctx.beginPath(); ctx.moveTo(X(w.a[0]), Y(w.a[1])); ctx.lineTo(X(w.b[0]), Y(w.b[1])); ctx.stroke(); });
      openings.forEach((o) => { const w = walls.find((x) => x.id === o.wallId); if (!w) return; const L = len(w), ux = (w.b[0]-w.a[0])/L, uy = (w.b[1]-w.a[1])/L; ctx.strokeStyle = '#0a0f18'; ctx.lineWidth = w.thickness * s + 3; ctx.beginPath(); ctx.moveTo(X(w.a[0]+ux*o.offset), Y(w.a[1]+uy*o.offset)); ctx.lineTo(X(w.a[0]+ux*(o.offset+o.width)), Y(w.a[1]+uy*(o.offset+o.width))); ctx.stroke(); ctx.strokeStyle = o.type === 'door' ? '#3fb950' : '#2f81f7'; ctx.lineWidth = 2; ctx.stroke(); });
      if (active) { const L = len(active), nx = -(active.b[1]-active.a[1])/L, ny = (active.b[0]-active.a[0])/L, off = Math.max(.34, active.thickness * 2.3), a = [active.a[0]+nx*off, active.a[1]+ny*off], b = [active.b[0]+nx*off, active.b[1]+ny*off], tx = X((a[0]+b[0])/2), ty = Y((a[1]+b[1])/2); ctx.strokeStyle = '#f5a623'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(X(a[0]),Y(a[1]));ctx.lineTo(X(b[0]),Y(b[1]));ctx.stroke(); [a,b].forEach((p) => { ctx.beginPath();ctx.moveTo(X(p[0]-nx*.1),Y(p[1]-ny*.1));ctx.lineTo(X(p[0]+nx*.1),Y(p[1]+ny*.1));ctx.stroke(); }); const label = `${active.height.toFixed(2)} m × ${L.toFixed(2)} m`; ctx.font='bold 13px Segoe UI'; const width=ctx.measureText(label).width+22; ctx.fillStyle = '#0e1420';ctx.fillRect(tx-width/2,ty-16,width,24);ctx.strokeRect(tx-width/2,ty-16,width,24);ctx.fillStyle='#ffd37a';ctx.fillText(label,tx,ty); }
    };
    draw(); const ro = new ResizeObserver(draw); ro.observe(canvas); return () => ro.disconnect();
  }, [plan, selected, active, walls, rooms, openings]);
  const pick = (e) => { const t = transformRef.current, box = canvasRef.current.getBoundingClientRect(); if (!t) return; const px = e.clientX-box.left, py = e.clientY-box.top; let near, best = 18; walls.forEach((w) => { const ax=t.X(w.a[0]), ay=t.Y(w.a[1]), bx=t.X(w.b[0]), by=t.Y(w.b[1]), dx=bx-ax,dy=by-ay, k=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy))), d=Math.hypot(px-(ax+k*dx),py-(ay+k*dy)); if(d<best){best=d;near=w;} }); if(near)setSelected(near.id); };
  return <div>
    <div className="plan-toolbar"><b>2D reja</b><span className="small-muted">Devorga bosing — balandlik × uzunlik chiqadi.</span><span className="badge">{walls.length} devor · tashqi perimetr {stats.perimeter.toFixed(2)} m</span><button className="btn small secondary" onClick={() => downloadPlanDxf(plan)}>2D DXF yuklash</button></div>
    <div className="viewer-wrap" style={{ height: 520 }}><canvas ref={canvasRef} onClick={pick} style={{ width:'100%',height:'100%',display:'block',cursor:'crosshair' }} /></div>
    <div className="legend"><span><span className="dot" style={{background:'#e8eef7'}}/>Tashqi devor</span><span><span className="dot" style={{background:'#9db2cc'}}/>Ichki devor</span><span><span className="dot" style={{background:'#f5a623'}}/>Tanlangan devor</span><span><span className="dot" style={{background:'#3fb950'}}/>Eshik</span><span><span className="dot" style={{background:'#2f81f7'}}/>Deraza</span></div>
    <div className="card wall-register"><div className="section-heading"><div><span className="eyebrow">Wall schedule</span><h2>Devorlar</h2></div><span className="small-muted">Jami: {stats.total.toFixed(2)} m</span></div><div className="table-scroll"><table className="boq"><thead><tr><th>Devor</th><th>Tur</th><th>Uzunlik</th><th>Qalinlik</th><th>Balandlik</th></tr></thead><tbody>{walls.map((w,i)=><tr key={w.id} className={w.id===selected?'selected-row':''} onClick={()=>setSelected(w.id)}><td><b>D-{i+1}</b></td><td>{w.type==='exterior'?'Tashqi':'Ichki'}</td><td>{len(w).toFixed(2)} m</td><td>{mm(w.thickness)}</td><td>{w.height.toFixed(2)} m</td></tr>)}</tbody></table></div></div>
    {plan.meta?.analysis && <div className="card" style={{marginTop:10}}><b>🤖 Tahlil nazorati</b><div className="small-muted" style={{marginTop:6,lineHeight:1.8}}><b>{plan.meta.analysis.walls}</b> devor · <b>{plan.meta.analysis.openings}</b> ochiqlik · <b>{plan.meta.analysis.rooms}</b> xona · <b>{plan.meta.analysis.columns}</b> ustun. Jadvaldagi qiymatlar yuklangan chizma geometriyasidan olinadi.</div></div>}
  </div>;
}
