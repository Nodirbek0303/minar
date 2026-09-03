import React, { useState } from 'react';

// 3D chizilmaganda ko'rsatiladigan ekran: nima bo'lgani, sababi va
// foydalanuvchi o'zi bajara oladigan aniq qadamlar.
export default function WebGLFallback({ title, error }) {
  const [copied, setCopied] = useState('');
  const d = error?.diagnostics;

  // Sababga qarab birinchi navbatdagi maslahat
  const noWebglAtAll = d && !d.webgl1 && !d.webgl2;
  const isSoftware = d?.gpu && /swiftshader|llvmpipe|software|mesa/i.test(d.gpu);

  const copy = (text) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(text);
      setTimeout(() => setCopied(''), 1500);
    }).catch(() => {});
  };

  const Step = ({ n, children }) => (
    <li style={{ marginBottom: 8, display: 'grid', gridTemplateColumns: '22px 1fr', alignItems: 'baseline' }}>
      <b style={{ color: 'var(--accent)' }}>{n}.</b>
      <span>{children}</span>
    </li>
  );

  const Chrome = ({ url }) => (
    <span>
      <code style={{ background: 'rgba(255,255,255,0.07)', padding: '1px 6px', borderRadius: 4 }}>{url}</code>
      <button
        className="btn small secondary"
        style={{ marginLeft: 6, padding: '1px 8px', fontSize: 11 }}
        onClick={() => copy(url)}
        title="Manzilni nusxalash (brauzer manzil satriga qo'ying)"
      >{copied === url ? '✓ nusxalandi' : 'nusxalash'}</button>
    </span>
  );

  return (
    <div style={{ padding: '22px 26px', height: '100%', overflowY: 'auto' }}>
      <b style={{ fontSize: 16 }}>🖥 {title}</b>
      <p className="small-muted" style={{ marginTop: 6, marginBottom: 14 }}>
        Brauzeringiz uchuvchi grafikani (WebGL) ocholmadi. <b>Hisob-kitob, spetsifikatsiya va narx
        to'liq ishlaydi</b> — faqat 3D ko'rinish chizilmaydi.
      </p>

      <div className="card" style={{ background: 'rgba(255,255,255,0.03)', marginBottom: 14 }}>
        <b style={{ fontSize: 13 }}>Buni qanday tuzatish (Chrome / Edge):</b>
        <ol style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', fontSize: 13.5, lineHeight: 1.75 }}>
          <Step n="1">
            <Chrome url="chrome://settings/system" /> — <b>“Использовать аппаратное ускорение”</b>
            (apparat tezlashtirish) yoqilgan bo'lsin, so'ng brauzerni <b>butunlay yopib qayta oching</b>.
          </Step>
          <Step n="2">
            <Chrome url="chrome://gpu" /> — ochib, <b>WebGL</b> va <b>WebGL2</b> qatorlarini qarang.
            “Disabled” yoki “Software only” bo'lsa, sabab shu yerda yozilgan bo'ladi.
          </Step>
          <Step n="3">
            Videokarta eski bo'lsa: <Chrome url="chrome://flags/#ignore-gpu-blocklist" /> →
            <b> Enabled</b>, keyin <Chrome url="chrome://flags/#enable-unsafe-swiftshader" /> →
            <b> Enabled</b> (dasturiy render — sekinroq, lekin ishlaydi). Brauzerni qayta ishga tushiring.
          </Step>
          <Step n="4">
            Videokarta drayverini yangilang, yoki boshqa brauzer/kompyuterda oching.
            Telefon va planshetlarda odatda darhol ishlaydi.
          </Step>
        </ol>
      </div>

      {noWebglAtAll && (
        <p className="small-muted" style={{ marginBottom: 10 }}>
          ⚠ Bu kompyuterda WebGL umuman mavjud emas — yuqoridagi 1 va 3-qadamlar eng ehtimolli yechim.
        </p>
      )}
      {isSoftware && (
        <p className="small-muted" style={{ marginBottom: 10 }}>
          ℹ Brauzer dasturiy render ishlatyapti ({d.gpu}) — 3D sekin bo'ladi yoki umuman ochilmaydi.
          Apparat tezlashtirishni yoqish muammoni hal qiladi.
        </p>
      )}

      <details style={{ fontSize: 12.5 }}>
        <summary className="small-muted" style={{ cursor: 'pointer' }}>Texnik ma'lumot</summary>
        <div className="small-muted" style={{ marginTop: 8, lineHeight: 1.7, fontFamily: 'monospace' }}>
          Xato: {error?.message || '—'}<br />
          {d && <>WebGL2: {String(d.webgl2)} · WebGL1: {String(d.webgl1)}<br /></>}
          {d?.gpu && <>Renderer: {d.gpu}<br /></>}
          {d?.reason && <>Sabab: {d.reason}</>}
        </div>
      </details>
    </div>
  );
}
