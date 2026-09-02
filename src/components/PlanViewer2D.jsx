import React, { useEffect, useRef } from 'react';

// Reja 2D ko'rish: devorlar, ochiqliklar (eshik/deraza), xona nomlari va o'lchamlar.
export default function PlanViewer2D({ plan }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !plan) return;
    const walls = plan.walls || [];
    const rooms = plan.rooms || [];
    const openings = plan.openings || [];

    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const w of walls) for (const p of [w.a, w.b]) { minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]); maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]); }
    const pad = 0.6;
    const W = maxX - minX + pad * 2, H = maxY - minY + pad * 2;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const cw = canvas.clientWidth, ch = canvas.clientHeight;
      canvas.width = cw * dpr; canvas.height = ch * dpr;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#0a0f18';
      ctx.fillRect(0, 0, cw, ch);
      const s = Math.min((cw - 40) / W, (ch - 40) / H);
      const offX = (cw - W * s) / 2;
      const X = (x) => (x - minX + pad) * s + offX;
      const Y = (y) => ch - ((y - minY + pad) * s + 20);

      // grid
      ctx.strokeStyle = '#151d2c'; ctx.lineWidth = 1;
      const step = 1;
      const startX = Math.ceil((minX - pad) / step) * step;
      for (let gx = startX; gx <= maxX + pad; gx += step) { ctx.beginPath(); ctx.moveTo(X(gx), 0); ctx.lineTo(X(gx), ch); ctx.stroke(); }
      for (let gy = Math.ceil((minY - pad) / step) * step; gy <= maxY + pad; gy += step) { ctx.beginPath(); ctx.moveTo(0, Y(gy)); ctx.lineTo(cw, Y(gy)); ctx.stroke(); }

      // rooms
      ctx.font = '12px Segoe UI';
      for (const r of rooms) {
        ctx.beginPath();
        r.polygon.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
        ctx.closePath();
        ctx.fillStyle = 'rgba(47, 129, 247, 0.07)';
        ctx.fill();
        const cx = r.polygon.reduce((s2, p2) => s2 + p2[0], 0) / r.polygon.length;
        const cy = r.polygon.reduce((s2, p2) => s2 + p2[1], 0) / r.polygon.length;
        ctx.fillStyle = '#8fa3bd'; ctx.textAlign = 'center';
        ctx.fillText(r.name || '', X(cx), Y(cy) - 6);
      }

      // openings (oq bo'shliq + yoy)
      for (const o of openings) {
        const w = walls.find((x) => x.id === o.wallId);
        if (!w) continue;
        const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
        const u = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L];
        const t0 = o.offset, t1 = o.offset + o.width;
        ctx.strokeStyle = '#0a0f18';
        ctx.lineWidth = w.thickness * s + 2;
        ctx.beginPath();
        ctx.moveTo(X(w.a[0] + u[0] * t0), Y(w.a[1] + u[1] * t0));
        ctx.lineTo(X(w.a[0] + u[0] * t1), Y(w.a[1] + u[1] * t1));
        ctx.stroke();
        ctx.strokeStyle = o.type === 'door' ? '#3fb950' : '#2f81f7';
        ctx.lineWidth = 1.5;
        if (o.type === 'door') {
          ctx.beginPath();
          ctx.moveTo(X(w.a[0] + u[0] * t0), Y(w.a[1] + u[1] * t0));
          ctx.lineTo(X(w.a[0] + u[0] * t0), Y(w.a[1] + u[1] * t0) + s * 0.8);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(X(w.a[0] + u[0] * t0), Y(w.a[1] + u[1] * t0), o.width * s, -Math.PI / 2, 0, false);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.moveTo(X(w.a[0] + u[0] * t0), Y(w.a[1] + u[1] * t0));
          ctx.lineTo(X(w.a[0] + u[0] * t1), Y(w.a[1] + u[1] * t1));
          ctx.stroke();
        }
      }

      // walls
      for (const w of walls) {
        ctx.strokeStyle = w.type === 'exterior' ? '#e8eef7' : '#9db2cc';
        ctx.lineWidth = Math.max(2, w.thickness * s);
        ctx.beginPath();
        ctx.moveTo(X(w.a[0]), Y(w.a[1]));
        ctx.lineTo(X(w.b[0]), Y(w.b[1]));
        ctx.stroke();
        // uzunlik yozuvi
        const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
        ctx.fillStyle = '#5d7291'; ctx.font = '10px Segoe UI'; ctx.textAlign = 'center';
        ctx.fillText(L.toFixed(2) + ' m', X((w.a[0] + w.b[0]) / 2), Y((w.a[1] + w.b[1]) / 2) - Math.max(6, w.thickness * s));
      }
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [plan]);

  return (
    <div>
      <div className="viewer-wrap" style={{ height: 480 }}>
        <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} />
      </div>
      <div className="legend">
        <span><span className="dot" style={{ background: '#e8eef7' }} />Tashqi devor</span>
        <span><span className="dot" style={{ background: '#9db2cc' }} />Ichki devor</span>
        <span><span className="dot" style={{ background: '#3fb950' }} />Eshik</span>
        <span><span className="dot" style={{ background: '#2f81f7' }} />Deraza</span>
      </div>
      {plan.meta?.analysis && (
        <div className="card" style={{ marginTop: 10 }}>
          <b>🤖 AI tahlil hisoboti</b>
          <div className="small-muted" style={{ marginTop: 6, lineHeight: 1.8 }}>
            Chizmadan o'qildi va tartibga solindi:
            <b> {plan.meta.analysis.walls}</b> devor (<b>{plan.meta.analysis.exterior}</b> tashqi, <b>{plan.meta.analysis.interior}</b> ichki) ·
            devor qalinligi <b>{plan.meta.analysis.thickness * 100} sm</b> ·
            <b> {plan.meta.analysis.openings}</b> eshik/deraza ·
            <b> {plan.meta.analysis.rooms}</b> xona (ismi chizmadan) ·
            <b> {plan.meta.analysis.columns}</b> ustun ·
            tozalangan ortiqcha chiziqlar: <b>{plan.meta.analysis.cleaned}</b>.
            Devorlar va ustunlar 3D da avtomatik qurildi, apalka (qolip) "Materiallar" bo'limida hisoblandi.
          </div>
        </div>
      )}
      <p className="small-muted" style={{ marginTop: 8 }}>
        Chizma avtomatik o'lchandi. Devor uzunliklari, xona maydonlari va ochiqliklar "Materiallar" bo'limidagi hisob-kitobga asos bo'ladi.
      </p>
    </div>
  );
}
