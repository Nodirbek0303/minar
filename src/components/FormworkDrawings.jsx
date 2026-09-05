import React, { useMemo, useRef, useState } from 'react';
import { exteriorWallsOf, openingsOfWall, layoutWallFaceWithOpenings, FORMWORK_NORMS } from '../../shared/formwork.js';

const mm = (m) => Math.round(m * 1000);
const wallLength = (w) => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
const dxfNum = (n) => Number(n).toFixed(2);

// Ishchi chizma geometriyasi UI, SVG va DXF uchun BITTA manbadan olinadi.
// Shunday qilib 3D/BOQ va chizma bir-biridan ajralib ketmaydi.
function detailFor(plan, wall, height, type) {
  const L = wallLength(wall);
  const openings = openingsOfWall(plan, wall, height);
  const face = layoutWallFaceWithOpenings({ type, lenM: L, hM: height, openings });
  const panels = [];
  for (const seg of face.segments) {
    let y = seg.y;
    for (const row of seg.rowPlans) {
      let x = seg.x;
      for (const width of Object.keys(row.panels).map(Number).sort((a, b) => b - a)) {
        for (let i = 0; i < row.panels[width]; i++) {
          panels.push({ x, y, w: width / 1000, h: row.h / 1000, mark: `${width}×${row.h}` });
          x += width / 1000;
        }
      }
      y += row.h / 1000;
    }
  }
  const ties = [];
  for (let y = FORMWORK_NORMS.TYAGA_ROW_STEP_M; y < height - .08; y += FORMWORK_NORMS.TYAGA_ROW_STEP_M) {
    for (let x = FORMWORK_NORMS.TYAGA_STEP_M / 2; x < L; x += FORMWORK_NORMS.TYAGA_STEP_M) {
      if (!openings.some((o) => x >= o.x0 && x <= o.x1 && y >= o.y0 && y <= o.y1)) ties.push({ x, y });
    }
  }
  const braces = [];
  for (let x = FORMWORK_NORMS.BRACE_STEP_M / 2; x < L; x += FORMWORK_NORMS.BRACE_STEP_M) braces.push(x);
  const beams = [];
  for (let y = FORMWORK_NORMS.BEAM_ROW_STEP_M; y < height; y += FORMWORK_NORMS.BEAM_ROW_STEP_M) beams.push(y);
  return { L, height, openings, face, panels, ties, braces, beams };
}

function download(name, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function dxf(detail, wallId, projectName) {
  const out = ['0', 'SECTION', '2', 'HEADER', '0', 'ENDSEC', '0', 'SECTION', '2', 'TABLES'];
  for (const layer of ['FORMWORK_PANEL_OUTER', 'FORMWORK_PANEL_INNER', 'TIE', 'BEAM', 'BRACE', 'DIMENSION', 'TEXT']) out.push('0', 'TABLE', '2', 'LAYER', '70', '1', '0', 'LAYER', '2', layer, '70', '0', '62', '7', '6', 'CONTINUOUS', '0', 'ENDTAB');
  out.push('0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES');
  const line = (x1, y1, x2, y2, layer) => out.push('0', 'LINE', '8', layer, '10', dxfNum(x1), '20', dxfNum(y1), '30', '0', '11', dxfNum(x2), '21', dxfNum(y2), '31', '0');
  const text = (x, y, value, h = 90) => out.push('0', 'TEXT', '8', 'TEXT', '10', dxfNum(x), '20', dxfNum(y), '30', '0', '40', String(h), '1', value, '7', 'STANDARD');
  const rect = (x, y, w, h, layer) => { line(x, y, x + w, y, layer); line(x + w, y, x + w, y + h, layer); line(x + w, y + h, x, y + h, layer); line(x, y + h, x, y, layer); };
  const S = 1000; const innerOffset = -(detail.height * S + 1800);
  detail.panels.forEach((p) => {
    rect(p.x * S, p.y * S, p.w * S, p.h * S, 'FORMWORK_PANEL_OUTER');
    rect(p.x * S, p.y * S + innerOffset, p.w * S, p.h * S, 'FORMWORK_PANEL_INNER');
    text((p.x + p.w / 2) * S - 120, (p.y + p.h / 2) * S, p.mark, 70);
    text((p.x + p.w / 2) * S - 120, (p.y + p.h / 2) * S + innerOffset, p.mark, 70);
  });
  detail.openings.forEach((o) => { rect(o.x0 * S, o.y0 * S, (o.x1 - o.x0) * S, (o.y1 - o.y0) * S, 'DIMENSION'); rect(o.x0 * S, o.y0 * S + innerOffset, (o.x1 - o.x0) * S, (o.y1 - o.y0) * S, 'DIMENSION'); text(o.x0 * S, o.y1 * S + 70, o.type === 'door' ? 'ESHIK' : 'DERAZA', 70); });
  detail.ties.forEach((t) => { line(t.x * S - 40, t.y * S, t.x * S + 40, t.y * S, 'TIE'); line(t.x * S, t.y * S - 40, t.x * S, t.y * S + 40, 'TIE'); });
  detail.beams.forEach((y) => { line(0, y * S, detail.L * S, y * S, 'BEAM'); line(0, y * S + innerOffset, detail.L * S, y * S + innerOffset, 'BEAM'); });
  detail.braces.forEach((x) => { line(x * S, 0, (x + .65) * S, -650, 'BRACE'); text((x + .65) * S, -700, 'PODKOS', 60); });
  line(0, -260, detail.L * S, -260, 'DIMENSION'); line(0, -210, 0, -310, 'DIMENSION'); line(detail.L * S, -210, detail.L * S, -310, 'DIMENSION'); text(detail.L * S / 2 - 150, -420, `L=${mm(detail.L)} mm`, 100);
  line(-260, 0, -260, detail.height * S, 'DIMENSION'); text(-680, detail.height * S / 2, `H=${mm(detail.height)} mm`, 100); text(0, detail.height * S + 350, `${projectName} — DEVOR ${wallId} / A: TASHQI YUZA`, 160); text(0, innerOffset - 300, `${projectName} — DEVOR ${wallId} / B: ICHKI YUZA`, 160);
  out.push('0', 'ENDSEC', '0', 'EOF'); return out.join('\n');
}

export default function FormworkDrawings({ project }) {
  const plan = project.plan; const walls = exteriorWallsOf(plan);
  const [wallId, setWallId] = useState(walls[0]?.id || ''); const svgRef = useRef(null);
  const facadeFloors = (plan.floors || []).filter((f) => f.facade !== false);
  const [floorId, setFloorId] = useState(facadeFloors[0]?.id || '');
  const type = project.variants?.[project.variant]?.fwType || (project.variant === 'krupny' ? 'ksho' : 'msho');
  const floor = facadeFloors.find((f) => f.id === floorId) || facadeFloors[0] || { name: '1-qavat', height: plan.walls?.[0]?.height || 3 };
  const wall = walls.find((w) => w.id === wallId) || walls[0];
  const detail = useMemo(() => wall ? detailFor(plan, wall, Number(floor.height) || 3, type) : null, [plan, wall, floor.height, type]);
  if (!wall || !detail) return <div className="card small-muted">Ishchi chizma uchun tashqi devor topilmadi.</div>;
  const W = 1100, H = 690, sx = 820 / detail.L, sy = 430 / detail.height, s = Math.min(sx, sy), ox = 130, oy = 555;
  const X = (x) => ox + x * s, Y = (y) => oy - y * s;
  const exportSvg = () => download(`ARXAI_${project.name}_devor_${wall.id}.svg`, svgRef.current.outerHTML, 'image/svg+xml');
  return <div className="drawing-layout">
    <div className="card drawing-main">
      <div className="section-heading"><div><span className="eyebrow">Montaj varag‘i · 1:50</span><h2>Qolipning ishchi chizmasi</h2></div><span className="badge on">BOQ bilan bog‘langan</span></div>
      <div className="drawing-toolbar"><label>Qavat <select value={floor.id} onChange={(e) => setFloorId(e.target.value)}>{(plan.floors || [floor]).map((f, i) => <option value={f.id} key={f.id} disabled={f.facade === false}>{f.name} · H={Number(f.height).toFixed(2)} m{f.facade === false ? ' (qolip yo‘q)' : ''}</option>)}</select></label><label>Devor <select value={wall.id} onChange={(e) => setWallId(e.target.value)}>{walls.map((w, i) => <option value={w.id} key={w.id}>D-{i + 1} · {mm(wallLength(w))} mm</option>)}</select></label><button className="btn small secondary" onClick={exportSvg}>SVG yuklash</button><button className="btn small" onClick={() => download(`ARXAI_${project.name}_${floor.name}_devor_${wall.id}.dxf`, dxf(detail, wall.id, project.name), 'application/dxf')}>AutoCAD / Revit DXF</button></div>
      <div className="drawing-canvas"><svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Qolip montaj chizmasi">
        <rect width={W} height={H} fill="#fff"/><rect x="16" y="16" width={W - 32} height={H - 32} fill="none" stroke="#202938" strokeWidth="1"/>
        <text x="52" y="58" fontSize="22" fontWeight="700" fill="#17202f">QOLIP MONTAJ REJASI — {project.name}</text><text x="52" y="83" fontSize="13" fill="#53657c">Devor {wall.id} · {floor.name} · IKKI YUZA: A tashqi, B ichki · O‘lchamlar mm</text><text x={X(0)} y={Y(detail.height) - 15} fontSize="14" fontWeight="700" fill="#b52b25">A — TASHQI YUZA (podkos shu tomonda)</text><text x={X(0)} y={Y(detail.height) + 5} fontSize="11" fill="#53657c">B — ICHKI YUZA DXF eksportida alohida FORM­WORK_PANEL_INNER qatlamida beriladi; panellar va balkalar ikkala yuzada.</text>
        {detail.panels.map((p, i) => <g key={i}><rect x={X(p.x)} y={Y(p.y + p.h)} width={p.w * s} height={p.h * s} fill="#f7ddd9" stroke="#d3332c" strokeWidth="1.2"/><text x={X(p.x + p.w / 2)} y={Y(p.y + p.h / 2)} textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(11, Math.max(6, p.w * s / 6))} fill="#7b1f1b">{p.mark}</text></g>)}
        {detail.openings.map((o, i) => <g key={'o' + i}><rect x={X(o.x0)} y={Y(o.y1)} width={(o.x1 - o.x0) * s} height={(o.y1 - o.y0) * s} fill="#f7ddd9" stroke="#d3332c" strokeWidth="4" strokeDasharray="9 3"/><line x1={X(o.x0)} y1={Y(o.y0)} x2={X(o.x1)} y2={Y(o.y1)} stroke="#d3332c" strokeWidth="1"/><line x1={X(o.x0)} y1={Y(o.y1)} x2={X(o.x1)} y2={Y(o.y0)} stroke="#d3332c" strokeWidth="1"/><text x={X((o.x0 + o.x1) / 2)} y={Y((o.y0 + o.y1) / 2)} textAnchor="middle" fontSize="10" fill="#9a201b">{o.type === 'door' ? 'ESHIK' : 'DERAZA'} APALKA PROYOM</text></g>)}
        {detail.beams.map((y, i) => <line key={'b' + i} x1={X(0)} y1={Y(y)} x2={X(detail.L)} y2={Y(y)} stroke="#f0a100" strokeWidth="3" strokeDasharray="8 4"/>)}
        {detail.ties.map((t, i) => <g key={'t' + i} stroke="#1b2737" strokeWidth="1.5"><circle cx={X(t.x)} cy={Y(t.y)} r="5" fill="#d8d44a"/><line x1={X(t.x)-7} y1={Y(t.y)} x2={X(t.x)+7} y2={Y(t.y)}/><line x1={X(t.x)} y1={Y(t.y)-7} x2={X(t.x)} y2={Y(t.y)+7}/></g>)}
        {detail.braces.map((x, i) => <g key={'r' + i} stroke="#485b73"><line x1={X(x)} y1={Y(.08)} x2={X(Math.min(detail.L, x + .65))} y2={Y(-.65)} strokeWidth="3"/><text x={X(Math.min(detail.L, x + .65))} y={Y(-.78)} fontSize="9">PODKOS</text></g>)}
        <g stroke="#27384e" fill="#27384e" fontSize="12"><line x1={X(0)} y1={Y(-.28)} x2={X(detail.L)} y2={Y(-.28)}/><line x1={X(0)} y1={Y(-.18)} x2={X(0)} y2={Y(-.38)}/><line x1={X(detail.L)} y1={Y(-.18)} x2={X(detail.L)} y2={Y(-.38)}/><text x={X(detail.L/2)} y={Y(-.48)} textAnchor="middle">{mm(detail.L)} mm</text><line x1={X(-.3)} y1={Y(0)} x2={X(-.3)} y2={Y(detail.height)}/><text x={X(-.5)} y={Y(detail.height/2)} transform={`rotate(-90 ${X(-.5)} ${Y(detail.height/2)})`} textAnchor="middle">{mm(detail.height)} mm</text></g>
        <g transform="translate(850 130)" fontSize="12" fill="#27384e"><text fontSize="15" fontWeight="700">BELGILAR / QADAMLAR</text><rect y="16" width="14" height="14" fill="#f7ddd9" stroke="#d3332c"/><text x="22" y="28">MINAR shtiti (marka ichida)</text><line y1="48" x2="14" y2="48" stroke="#f0a100" strokeWidth="3"/><text x="22" y="52">Tekislovchi balka: {mm(FORMWORK_NORMS.BEAM_ROW_STEP_M)} mm</text><text y="77">✚  Tyaga: {mm(FORMWORK_NORMS.TYAGA_STEP_M)} mm × {mm(FORMWORK_NORMS.TYAGA_ROW_STEP_M)} mm</text><text y="102">╱  Podkos: {mm(FORMWORK_NORMS.BRACE_STEP_M)} mm qadam</text><text y="127">Burchaklarda: ichki/tashqi burchak shtiti</text><text y="152">Pastki texnologik bo‘shliq: {mm(FORMWORK_NORMS.GAP_M)} mm</text></g>
        <rect x="760" y="570" width="300" height="82" fill="none" stroke="#27384e"/><text x="775" y="595" fontSize="13" fontWeight="700">MINAR · DEVOR QOLIPI</text><text x="775" y="616" fontSize="11">Varaq: D-{wall.id} · Masshtab: 1:50</text><text x="775" y="636" fontSize="11">Eksport: DXF / SVG · ArxAI</text>
      </svg></div>
    </div>
    <aside className="card drawing-notes"><span className="eyebrow">Tekshiruv jadvali</span><h3>Ushbu devor</h3><div className="note-row"><span>Panel</span><b>{detail.panels.length * 2} dona / ikki yuza</b></div><div className="note-row"><span>Tyaga / anker</span><b>{detail.ties.length} nuqta × 2 yuza</b></div><div className="note-row"><span>Gayka + shayba</span><b>{detail.ties.length * 2} komplekt</b></div><div className="note-row"><span>Podkos</span><b>{detail.braces.length} dona (tashqi)</b></div><div className="note-row"><span>Proyom apalkasi</span><b>{detail.openings.length} ta × 4 element</b></div><hr/><p className="small-muted">Qizil punktir — MINAR panel ko‘rinishidagi proyom qolipi. Har bir deraza/eshikda 2 yon, yuqori va pastki element bor; ichki o‘lcham beton proyomi bo‘lib ochiq qoladi.</p><p className="small-muted">DXF faylda alohida layerlar: <b>FORMWORK_PANEL_OUTER</b>, <b>FORMWORK_PANEL_INNER</b>, <b>TIE</b>, <b>BEAM</b>, <b>BRACE</b>, <b>DIMENSION</b>. Uni AutoCAD’da ochish, Revit’da esa Import CAD orqali bog‘lash mumkin.</p><p className="small-muted">Muhandis yakuniy montajdan oldin beton bosimi, ankraj va podkoslarni konstruktiv hisob bilan tasdiqlashi shart.</p></aside>
  </div>;
}
