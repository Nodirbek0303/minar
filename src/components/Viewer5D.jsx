import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import {
  MINAR, layoutWallFaceWithOpenings, openingsOfWall, exteriorWallsOf,
  columnJunctions, COLUMN_SIZE, FORMWORK_NORMS
} from '../../shared/formwork.js';
import { createRenderer, watchContextLoss } from '../lib/webgl.js';
import WebGLFallback from './WebGLFallback.jsx';

// MINAR panel teksturasi: qizil (yoki tanlangan RAL) ramka + qora laminat fanera
// + konus vtulkalar + MINAR yozuvi. O'lcham va rang bo'yicha keshlanadi.
const texCache = new Map();
function minarTexture(wMm, hMm, colorHex) {
  const key = colorHex + '|' + wMm + 'x' + hMm;
  if (texCache.has(key)) return texCache.get(key);
  const cv = document.createElement('canvas');
  const W = 256, H = Math.max(64, Math.min(512, Math.round(256 * hMm / wMm)));
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = colorHex;
  ctx.fillRect(0, 0, W, H);
  const fw = Math.max(12, Math.round(W * 0.085)), fh = Math.max(10, Math.round(H * 0.06));
  ctx.fillStyle = '#232327';
  ctx.fillRect(fw, fh, W - fw * 2, H - fh * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.045)';
  ctx.lineWidth = 1;
  for (let x = fw; x <= W - fw; x += 11) { ctx.beginPath(); ctx.moveTo(x, fh); ctx.lineTo(x, H - fh); ctx.stroke(); }
  for (let y = fh; y <= H - fh; y += 11) { ctx.beginPath(); ctx.moveTo(fw, y); ctx.lineTo(W - fw, y); ctx.stroke(); }
  // konus vtulkalar (4 burchak)
  ctx.fillStyle = '#0f0f11';
  const r = Math.max(4, Math.round(W * 0.018));
  for (const [cx2, cy2] of [[fw + r + 3, fh + r + 3], [W - fw - r - 3, fh + r + 3], [fw + r + 3, H - fh - r - 3], [W - fw - r - 3, H - fh - r - 3]]) {
    ctx.beginPath(); ctx.arc(cx2, cy2, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = `bold ${Math.max(9, Math.round(H * 0.045))}px Segoe UI, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('MINAR', W / 2, H / 2 + Math.round(H * 0.016));
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, tex);
  return tex;
}

const COLORS = {
  brick: 0x9c7a5b,
  gazobeton: 0xd9d9d3,
  plaster: 0xe8e4da,
  paint: 0xf2ede2,
  glass: 0x7ec8ff,
  panelA: 0xb9c2c9,
  panelB: 0xaeb8c1,
  tile: 0xcfd6dd,
  roof: 0x7d828a,
  ground: 0x1a2433,
  edge: 0x5d6672
};

const FLOOR_COLORS = [0xb9c2c9, 0xaeb8c1, 0xc3cbd2, 0xb3bcc4]; // qavatlar panel tonlari

// Qavat yorlig'i (belgi) — har doim kameraga qaragan matn
function makeFloorLabel(text) {
  const cv = document.createElement('canvas');
  cv.width = 360; cv.height = 110;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgba(16,24,38,0.94)';
  ctx.beginPath();
  ctx.roundRect(4, 8, 352, 94, 18);
  ctx.fill();
  ctx.strokeStyle = '#f5a623';
  ctx.lineWidth = 7;
  ctx.stroke();
  ctx.fillStyle = '#ffd37a';
  ctx.font = 'bold 46px Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 180, 57);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  spr.scale.set(2.6, 0.8, 1);
  return spr;
}

// Ko'p qavatli bino 3D modeli: har qavat devorlari, eshik/derazalar, plitka pol,
// va HAR QAVATGA alohida joylanadigan apalka panellari (bo'g'im chiziqlari bilan).
// Qavat tanlanadi, vaqt jadvali bilan qurilib boradi, VR rejimi bor.
export default function Viewer5D({ project }) {
  const mountRef = useRef(null);
  const stateRef = useRef({});
  const [day, setDay] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [selFloor, setSelFloor] = useState(null); // null = barchasi
  const [glError, setGlError] = useState(null); // {message, diagnostics}
  const [canPng, setCanPng] = useState(true);
  const selFloorRef = useRef(null);
  const totalDays = project.schedule?.totalDays || 1;
  const phases = project.schedule?.phases || [];
  const floors = project.plan?.floors?.length ? project.plan.floors
    : (project.quantities?.perFloor || [{ id: 'fl0', name: '1-qavat', height: 3, facade: true }]);

  useEffect(() => { selFloorRef.current = selFloor; }, [selFloor]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !project) return;
    const plan = project.plan;
    const wallMaterial = project.opts?.wallMaterial || 'brick';
    const flDef = (plan.floors?.length ? plan.floors : [{ id: 'fl0', name: '1-qavat', height: plan.walls?.[0]?.height || 3, facade: true }])
      .map((f) => ({ ...f, height: Math.max(0.5, Number(f.height) || 3) }));
    const N = flDef.length;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f18);
    scene.fog = new THREE.Fog(0x0a0f18, 80, 220);

    const camera = new THREE.PerspectiveCamera(50, mount.clientWidth / mount.clientHeight, 0.1, 600);
    // WebGL kontekstini bir necha sozlama bilan sinab ko'ramiz (eski videokarta,
    // apparat tezlashtirish o'chirilgan, masofaviy ish stoli). Hech biri
    // ishlamasa — butun sahifa emas, faqat shu bo'lim o'rniga tushuntirish chiqadi.
    let renderer;
    try {
      const r = createRenderer();
      renderer = r.renderer;
      setCanPng(r.canPng);
      setGlError(null);
    } catch (e) {
      setGlError({ message: e.message, diagnostics: e.diagnostics });
      return;
    }
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.xr.enabled = true;
    mount.appendChild(renderer.domElement);
    mount.appendChild(VRButton.createButton(renderer));

    const unwatchGl = watchContextLoss(renderer, () => {
      setGlError({ message: 'Videokarta konteksti yo‘qoldi (drayver qayta ishga tushgan bo‘lishi mumkin)', diagnostics: null });
    });

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xfff2d9, 1.2);
    sun.position.set(30, 50, 18);
    scene.add(sun);
    const sun2 = new THREE.DirectionalLight(0x88aaff, 0.35);
    sun2.position.set(-25, 20, -30);
    scene.add(sun2);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(300, 300),
      new THREE.MeshStandardMaterial({ color: COLORS.ground, roughness: 1, transparent: true, opacity: 0.45 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    scene.add(ground);
    const grid = new THREE.GridHelper(300, 150, 0x24344d, 0x18243a);
    scene.add(grid);

    // --- plan chegaralari ---
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const w of plan.walls || []) for (const p of [w.a, w.b]) {
      minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]);
      maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]);
    }
    const cx = (minX + maxX) / 2, cz = (minY + maxY) / 2;
    const ext = Math.max(maxX - minX, maxY - minY, 6);
    const totalH = flDef.reduce((s, f) => s + f.height, 0);
    const elevStart = flDef[0]?.underground ? -flDef[0].height : 0; // podval yer ostidan
    // devorlar to3() orqali markazlashtiriladi (0,0) atrofida — kamera ham shu markazga qaraydi
    camera.position.set(ext * 1.0, totalH * 0.9 + ext * 0.45, ext * 1.35);
    controls.target.set(0, (elevStart + totalH) / 2, 0);

    const to3 = (x, y) => new THREE.Vector3(x - cx, 0, y - cz);
    const stagger = () => Math.random();

    // Yaratilgan barcha geometriya va materiallar — sahna yopilganda dispose qilinadi (xotira sizishiga qarshi)
    const disposables = new Set();
    const track = (x) => { disposables.add(x); return x; };

    const wallMeshes = [], glassMeshes = [], panelMeshes = [], floorMeshes = [];
    const byWall = {};
    for (const o of plan.openings || []) (byWall[o.wallId] ||= []).push(o);
    const wallsEff = exteriorWallsOf(plan); // tashqi devorlar avtomatik aniqilangan
    const junctions = plan.columns?.length ? plan.columns.map((c) => [c.x, c.y]) : columnJunctions(plan); // ustunlar

    // Podval yer ostidan boshlanadi (manfiy sath)
    let elev = elevStart;
    for (let fi = 0; fi < N; fi++) {
      const fl = flDef[fi];
      const H = fl.height;

      for (const w of wallsEff) {
        const a = to3(w.a[0], w.a[1]), b = to3(w.b[0], w.b[1]);
        const len = a.distanceTo(b);
        const ang = Math.atan2(b.z - a.z, b.x - a.x);
        const u = new THREE.Vector3((b.x - a.x) / len, 0, (b.z - a.z) / len);
        const n = new THREE.Vector3(-u.z, 0, u.x);
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const ops = (byWall[w.id] || []).slice().sort((p, q) => p.offset - q.offset);
        const isExt = w.type === 'exterior';
        const outward = mid.clone().sub(new THREE.Vector3(0, 0, 0));
        const extSign = isExt ? (outward.dot(n) >= 0 ? 1 : -1) : 0;

        const mkBox = (t0, t1, y0, y1, mat, phase, f) => {
          const L = t1 - t0;
          if (L <= 0.01 || y1 - y0 <= 0.01) return null;
          const geo = track(new THREE.BoxGeometry(L, y1 - y0, w.thickness));
          const mesh = new THREE.Mesh(geo, track(mat.clone()));
          const p = a.clone().add(u.clone().multiplyScalar(t0 + L / 2));
          mesh.position.set(p.x, elev + (y0 + y1) / 2, p.z);
          mesh.rotation.y = -ang;
          mesh.userData = { f, phase, floor: fi };
          scene.add(mesh);
          if (phase === 'walls') wallMeshes.push(mesh);
          return mesh;
        };

        const brickMat = new THREE.MeshStandardMaterial({ color: wallMaterial === 'brick' ? COLORS.brick : COLORS.gazobeton, roughness: 0.9, transparent: true });
        let cursor = 0;
        const f = stagger();
        for (const o of ops) {
          const t0 = Math.max(0, o.offset), t1 = Math.min(len, o.offset + o.width);
          const oh = Math.min(o.height, Math.max(0.5, H - 0.3));
          if (t0 > cursor) mkBox(cursor, t0, 0, H, brickMat, 'walls', f);
          if (o.type === 'window') {
            const sill = Math.min(o.sill, H - oh - 0.2);
            mkBox(t0, t1, 0, sill, brickMat, 'walls', f);
            const gmat = new THREE.MeshStandardMaterial({ color: COLORS.glass, transparent: true, opacity: 0.45, roughness: 0.1, metalness: 0.1 });
            const g = mkBox(t0, t1, sill, sill + oh, gmat, 'walls', f);
            if (g) glassMeshes.push(g);
            mkBox(t0, t1, sill + oh, H, brickMat, 'walls', f);
          } else {
            mkBox(t0, t1, oh, H, brickMat, 'walls', f);
          }
          cursor = t1;
        }
        if (cursor < len) mkBox(cursor, len, 0, H, brickMat, 'walls', f);

        // --- Devor yuzasi qoplami ---
        if (isExt && extSign !== 0 && fl.facade !== false) {
          const fwType = fl.formwork?.type || 'classic';
          if (fwType === 'ksho' || fwType === 'msho') {
            // MINAR qolip panellari — katalog o'lchamlari bilan aniq sxema
            const colorHex = (MINAR.colors.find((c) => c.id === (fl.formwork.color || 'RAL3020')) || MINAR.colors[0]).hex;
            // Server bilan BIR XIL joylashuv: ochiqliklar (eshik/deraza) o'rniga panel qo'yilmaydi
            const face = layoutWallFaceWithOpenings({
              type: fwType, lenM: len, hM: H, openings: openingsOfWall(plan, w, H)
            });
            for (const seg of face.segments) {
              let yCur = elev + seg.y;
              for (const row of seg.rowPlans) {
                const hM = row.h / 1000;
                let tCur = seg.x;
                const widths = Object.keys(row.panels).map(Number).sort((a2, b2) => b2 - a2);
                for (const wMm of widths) {
                  const wM = wMm / 1000;
                  for (let j = 0; j < row.panels[wMm]; j++) {
                    const tex = minarTexture(wMm, row.h, colorHex);
                    const mat = track(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.1, transparent: true }));
                    const mesh = new THREE.Mesh(track(new THREE.BoxGeometry(wM - 0.004, hM - 0.004, 0.055)), mat);
                    const p = a.clone().add(u.clone().multiplyScalar(tCur + wM / 2));
                    mesh.position.set(p.x, yCur + hM / 2, p.z).add(n.clone().multiplyScalar(extSign * (w.thickness / 2 + 0.035)));
                    mesh.rotation.y = -ang;
                    mesh.userData = { f: stagger(), phase: 'walls', fw: true, floor: fi };
                    scene.add(mesh);
                    panelMeshes.push(mesh);
                    tCur += wM;
                  }
                }
                yCur += hM;
              }
            }
            // Vertikal trubalar (48mm) — panellar birikmalarida, IKKI SHOxLI TIRGAKLAR bilan mahkamlanadi
            const nT = Math.max(1, Math.ceil(len / FORMWORK_NORMS.TRUBA_V_STEP_M));
            // gorizontal truba qatorlari — spetsifikatsiyadagi bilan bir xil soni va qadami
            const horizRows = Math.max(1, Math.round(H / FORMWORK_NORMS.TRUBA_H_ROW_STEP_M));
            const boundaries = [];
            for (let i = 0; i < horizRows; i++) boundaries.push((i + 0.5) * (H / horizRows));
            const tubeOff = extSign * (w.thickness / 2 + 0.035 + 0.055 + 0.035);
            {
              const tubeGeo = track(new THREE.CylinderGeometry(0.031, 0.031, H + 0.06, 12));
              const tubeMat = new THREE.MeshStandardMaterial({ color: 0x55575c, metalness: 0.75, roughness: 0.3, transparent: true });
              const bodyGeo = track(new THREE.BoxGeometry(0.1, 0.095, 0.08));
              const prongGeo = track(new THREE.BoxGeometry(0.026, 0.08, 0.075));
              const clampMat = new THREE.MeshStandardMaterial({ color: colorHex, metalness: 0.45, roughness: 0.45, transparent: true });
              const clampZ = -extSign * 0.062; // tirgak shoxlari panel tomonga
              for (let i = 0; i <= nT; i++) {
                const tx = i * (len / nT);
                const tp = a.clone().add(u.clone().multiplyScalar(tx));
                // truba
                const tube = new THREE.Mesh(tubeGeo, track(tubeMat.clone()));
                tube.position.set(tp.x, elev + H / 2, tp.z).add(n.clone().multiplyScalar(tubeOff));
                tube.rotation.y = -ang;
                tube.userData = { f: stagger(), phase: 'walls', fw: true, floor: fi };
                scene.add(tube);
                panelMeshes.push(tube);
                // ikki shoxli tirgak: korpus + 2 shox (har panel qatori chegarasida)
                for (const by of boundaries) {
                  const base = tp.clone().add(n.clone().multiplyScalar(tubeOff));
                  const mk = (geo, mat, ox, oz) => {
                    const m = new THREE.Mesh(geo, track(mat.clone()));
                    const lp = new THREE.Vector3(ox, 0, oz).applyEuler(new THREE.Euler(0, -ang, 0));
                    m.position.set(base.x + lp.x, elev + by, base.z + lp.z);
                    m.rotation.y = -ang;
                    m.userData = { f: stagger(), phase: 'walls', fw: true, floor: fi };
                    scene.add(m);
                    panelMeshes.push(m);
                  };
                  mk(bodyGeo, clampMat, 0, 0);
                  mk(prongGeo, clampMat, 0.055, clampZ);
                  mk(prongGeo, clampMat, -0.055, clampZ);
                }
              }
            }
            // Gorizontal trubalar (48mm) — har panel qatori chegarasida bo'ylab
            {
              const hLen = len + 0.24;
              const hGeo = track(new THREE.CylinderGeometry(0.031, 0.031, hLen, 12));
              const hMat = new THREE.MeshStandardMaterial({ color: 0x55575c, metalness: 0.75, roughness: 0.3, transparent: true });
              const hDir = u.clone().normalize();
              const hQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), hDir);
              const hMid = mid.clone().add(n.clone().multiplyScalar(tubeOff + 0.005));
              for (const by of boundaries) {
                const hTube = new THREE.Mesh(hGeo, track(hMat.clone()));
                hTube.position.set(hMid.x, elev + by, hMid.z);
                hTube.quaternion.copy(hQuat);
                hTube.userData = { f: stagger(), phase: 'walls', fw: true, floor: fi };
                scene.add(hTube);
                panelMeshes.push(hTube);
              }
            }
            // Push-pull tirgaklar — qolip TASHQARISIDA qiyalik tayanch:
            // panellar yiqilib, joyidan siljib ketmasligi uchun
            {
              const nBr = Math.max(1, Math.ceil(len / FORMWORK_NORMS.BRACE_STEP_M));
              const outBase = w.thickness / 2 + 0.035 + 0.055 + 0.035 + 1.6;
              const outTop = tubeOff + 0.02;
              const topY = elev + H * 0.85;
              const base0 = a.clone().add(u.clone().multiplyScalar(0.5 * (len / nBr))).add(n.clone().multiplyScalar(extSign * outBase));
              base0.y = elev + 0.04;
              const top0 = a.clone().add(u.clone().multiplyScalar(0.5 * (len / nBr))).add(n.clone().multiplyScalar(extSign * outTop));
              top0.y = topY;
              const bLen = base0.distanceTo(top0);
              const braceGeo = track(new THREE.CylinderGeometry(0.036, 0.036, bLen, 10));
              const braceMat = new THREE.MeshStandardMaterial({ color: colorHex, metalness: 0.5, roughness: 0.4, transparent: true });
              const footGeo = track(new THREE.BoxGeometry(0.16, 0.02, 0.16));
              const footMat = new THREE.MeshStandardMaterial({ color: 0x55575c, metalness: 0.6, roughness: 0.4, transparent: true });
              const upY = new THREE.Vector3(0, 1, 0);
              for (let i = 0; i < nBr; i++) {
                const t = (i + 0.5) * (len / nBr);
                const base = a.clone().add(u.clone().multiplyScalar(t)).add(n.clone().multiplyScalar(extSign * outBase));
                base.y = elev + 0.04;
                const top = a.clone().add(u.clone().multiplyScalar(t)).add(n.clone().multiplyScalar(extSign * outTop));
                top.y = topY;
                const dir = top.clone().sub(base);
                const brace = new THREE.Mesh(braceGeo, track(braceMat.clone()));
                brace.position.copy(base).addScaledVector(dir, 0.5);
                brace.quaternion.setFromUnitVectors(upY, dir.clone().normalize());
                brace.userData = { f: stagger(), phase: 'walls', fw: true, floor: fi };
                scene.add(brace);
                panelMeshes.push(brace);
                const foot = new THREE.Mesh(footGeo, track(footMat.clone()));
                foot.position.set(base.x, elev + 0.012, base.z);
                foot.userData = { f: stagger(), phase: 'walls', fw: true, floor: fi };
                scene.add(foot);
                panelMeshes.push(foot);
              }
            }
            // Ustunlar (40×40) — devor bog'lanish nuqtalarida, universal qolip
            if (junctions.length) {
              const colMat = new THREE.MeshStandardMaterial({ map: minarTexture(400, Math.round(H * 1000), colorHex), roughness: 0.5, metalness: 0.1, transparent: true });
              const colGeo = track(new THREE.BoxGeometry(COLUMN_SIZE, H, COLUMN_SIZE));
              for (const [jx, jy] of junctions) {
                const col = new THREE.Mesh(colGeo, track(colMat.clone()));
                col.position.set(jx - cx, elev + H / 2, jy - cz);
                col.userData = { f: stagger(), phase: 'walls', fw: true, floor: fi };
                scene.add(col);
                panelMeshes.push(col);
              }
            }
            // tyaga (tayrot) shtangalar — qatorlar orasidan o'tadi
            const tieRows = Math.max(1, Math.round(H / FORMWORK_NORMS.TYAGA_ROW_STEP_M));
            const tieCols = Math.max(1, Math.ceil(len / FORMWORK_NORMS.TYAGA_STEP_M));
            const tieMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4e, metalness: 0.7, roughness: 0.35, transparent: true });
            const yAxis = new THREE.Vector3(0, 1, 0);
            const tieDir = n.clone().multiplyScalar(extSign).normalize();
            const tieQuat = new THREE.Quaternion().setFromUnitVectors(yAxis, tieDir);
            for (let r2 = 0; r2 < tieRows; r2++) {
              for (let c2 = 0; c2 < tieCols; c2++) {
                const ty = elev + ((r2 + 0.5) / tieRows) * H;
                const tx = (c2 + 0.5) * (len / tieCols);
                const p = a.clone().add(u.clone().multiplyScalar(tx));
                const tie = new THREE.Mesh(track(new THREE.CylinderGeometry(0.014, 0.014, w.thickness + 0.34, 10)), track(tieMat.clone()));
                tie.position.set(p.x, ty, p.z);
                tie.quaternion.copy(tieQuat);
                tie.userData = { f: stagger(), phase: 'walls', fw: true, floor: fi };
                scene.add(tie);
                panelMeshes.push(tie);
              }
            }
          } else {
            // Klassik vent-fasad panellari (apalka)
            const segLen = 1.0;
            const nSeg = Math.max(1, Math.round(len / segLen));
            const segW = len / nSeg;
            const base = new THREE.Color(FLOOR_COLORS[fi % FLOOR_COLORS.length]);
            const zOff = extSign * (w.thickness / 2 + 0.07);
            for (let j = 0; j < nSeg; j++) {
              const t0 = j * segW + 0.004, t1 = (j + 1) * segW - 0.004;
              const L = t1 - t0;
              if (L <= 0.02) continue;
              const tone = base.clone().offsetHSL(0, 0, (j % 2 === 0 ? 0 : -0.02));
              const pmat = track(new THREE.MeshStandardMaterial({ color: tone, roughness: 0.55, metalness: 0.12, transparent: true }));
              const mesh = new THREE.Mesh(track(new THREE.BoxGeometry(L, H - 0.1, 0.04)), pmat);
              const pp = a.clone().add(u.clone().multiplyScalar(t0 + L / 2));
              mesh.position.set(pp.x, elev + H / 2, pp.z).add(n.clone().multiplyScalar(zOff));
              mesh.rotation.y = -ang;
              const edge = new THREE.LineSegments(
                new THREE.EdgesGeometry(mesh.geometry),
                new THREE.LineBasicMaterial({ color: COLORS.edge, transparent: true })
              );
              mesh.add(edge);
              mesh.userData = { f: stagger(), phase: 'facade', floor: fi, edge };
              scene.add(mesh);
              panelMeshes.push(mesh);
            }
          }
        }
      }

      // --- pol plitkalari (har qavat) ---
      for (const r of plan.rooms || []) {
        const shape = new THREE.Shape(r.polygon.map(([x, y]) => new THREE.Vector2(x - cx, y - cz)));
        const geo = track(new THREE.ShapeGeometry(shape));
        const mat = track(new THREE.MeshStandardMaterial({ color: COLORS.tile, roughness: 0.4, transparent: true, opacity: 0 }));
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = elev + 0.02;
        mesh.userData = { f: stagger(), phase: 'floor', floor: fi };
        scene.add(mesh);
        floorMeshes.push(mesh);
      }

      elev += H;
    }

    // --- Qavat ajratgichlari va yorliqlari: qavatlar alohida ko'rinsin ---
    const sepMeshes = [];
    const slabW = (maxX - minX) + 0.25, slabD = (maxY - minY) + 0.25;
    const sepGeo = track(new THREE.PlaneGeometry(slabW, slabD));
    const sepEdgeGeo = track(new THREE.EdgesGeometry(sepGeo));
    let feAcc = elevStart;
    for (let i = 0; i <= N; i++) {
      if (i > 0) feAcc += flDef[i - 1].height;
      // yarim shaffof ajratgich plita (har qavat sathi)
      const sep = new THREE.Mesh(
        sepGeo,
        new THREE.MeshStandardMaterial({ color: 0x3f7fbf, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false })
      );
      sep.rotation.x = -Math.PI / 2;
      sep.position.set(0, feAcc + 0.015, 0);
      sep.userData = { floor: i - 1, baseOp: 0.14 }; // i=0 — yer sathi
      scene.add(sep);
      sepMeshes.push(sep);
      // kontur chizig'i
      const edge = new THREE.LineSegments(
        sepEdgeGeo,
        new THREE.LineBasicMaterial({ color: 0x5b9bd5, transparent: true, opacity: 0.5 })
      );
      edge.rotation.x = -Math.PI / 2;
      edge.position.set(0, feAcc + 0.02, 0);
      edge.userData = { floor: i - 1, baseOp: 0.5 };
      scene.add(edge);
      sepMeshes.push(edge);
      // qavat yorlig'i (har doim ko'rinadigan belgi)
      if (i < N) {
        const label = makeFloorLabel(flDef[i].name + (flDef[i].facade === false ? ' ○' : ' ●'));
        track(label.material);
        label.position.set((minX - cx) - 0.6, feAcc + flDef[i].height / 2, (maxY - cz) + 0.7);
        label.userData = { floor: i, isLabel: true, baseOp: 1 };
        scene.add(label);
        sepMeshes.push(label);
      }
    }

    // --- jadval holati ---
    const phaseByKey = Object.fromEntries(phases.map((p) => [p.key, p]));
    const progressOf = (key, d) => {
      const ph = phaseByKey[key];
      if (!ph) return 0;
      return Math.min(1, Math.max(0, (d - ph.startDay + 1) / Math.max(1, ph.days)));
    };
    const baseColor = new THREE.Color(wallMaterial === 'brick' ? COLORS.brick : COLORS.gazobeton);

    // Jadvalda faqat ikki bosqich bo'ladi: MINAR qolip montaji ('walls') va
    // klassik vent-fasad ('facade'). Har qavat ketma-ket quriladi.
    const applyDay = (d) => {
      const sel = selFloorRef.current;
      const floorOpacity = (i) => (sel == null || sel === i ? 1 : 0.1);
      const staggerFloor = (p, i) => Math.min(1, Math.max(0, p * (N + 1) - i));
      const wallsP = progressOf('walls', d);
      const facadeP = progressOf('facade', d);
      // qavat qurilishi: qolip qavati bo'lsa 'walls', aks holda 'facade' bosqichi
      const structP = phaseByKey.walls ? wallsP : facadeP;

      for (const m of wallMeshes) {
        const { f, floor } = m.userData;
        const grow = Math.min(1, Math.max(0, staggerFloor(structP, floor) * 1.3 - f * 0.3));
        const op = floorOpacity(floor);
        m.scale.y = Math.max(0.001, grow);
        m.visible = grow > 0.001 && op > 0.05;
        m.material.color.copy(baseColor);
        m.material.opacity = op;
      }
      for (const g of glassMeshes) g.visible = g.scale.y > 0.001;
      // Pol plitalari devor bilan birga paydo bo'ladi (avval hech qachon ko'rinmasdi)
      for (const m of floorMeshes) {
        const p = Math.min(1, Math.max(0, staggerFloor(structP, m.userData.floor) * 1.3 - m.userData.f * 0.3));
        const op = floorOpacity(m.userData.floor);
        m.material.opacity = p * 0.8 * op;
        m.visible = p > 0.01 && op > 0.05;
      }
      for (const m of panelMeshes) {
        // MINAR qolipi devor ko'tarilgach o'rnatiladi; klassik apalka — 'facade' bosqichida
        const base = m.userData.fw ? Math.min(1, Math.max(0, (wallsP - 0.2) / 0.8)) : facadeP;
        const p = Math.min(1, Math.max(0, staggerFloor(base, m.userData.floor) * 1.3 - m.userData.f * 0.3));
        const op = floorOpacity(m.userData.floor);
        m.material.opacity = p * op;
        m.visible = p > 0.01 && op > 0.05;
        if (m.userData.edge) m.userData.edge.material.opacity = p * op;
      }
      // qavat ajratgichlari va yorliqlari — doim ko'rinadi, qavat tanloviga bo'ysunadi
      for (const m of sepMeshes) {
        const op = floorOpacity(m.userData.floor);
        m.material.opacity = (m.userData.baseOp ?? 1) * op;
        m.visible = op > 0.05;
      }
    };

    // --- animatsiya tsikli ---
    const clock = new THREE.Clock();
    const state = { day: totalDays, playing: false };
    stateRef.current = { state, setDay, applyDay, renderOnce: () => renderer.render(scene, camera) };
    const tick = () => {
      const dt = clock.getDelta();
      if (state.playing) {
        state.day += dt * 6;
        if (state.day > totalDays) { state.day = totalDays; state.playing = false; }
        setDay(Math.floor(state.day));
      }
      applyDay(state.day);
      controls.update();
      renderer.render(scene, camera);
    };
    applyDay(state.day);
    renderer.setAnimationLoop(tick);

    const ro = new ResizeObserver(() => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    });
    ro.observe(mount);

    return () => {
      ro.disconnect();
      unwatchGl();
      renderer.setAnimationLoop(null);
      controls.dispose();
      // Sahnadagi barcha geometriya/materiallarni bo'shatish
      scene.traverse((obj) => {
        if (obj.geometry) disposables.add(obj.geometry);
        const m = obj.material;
        if (m) (Array.isArray(m) ? m : [m]).forEach((x) => disposables.add(x));
      });
      // Panel teksturalari keshlangan va boshqa sahnalarda qayta ishlatiladi — ular saqlanadi
      const keptTextures = new Set(texCache.values());
      for (const d of disposables) {
        if (d.map && !keptTextures.has(d.map)) d.map.dispose?.();
        d.dispose?.();
      }
      disposables.clear();
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss?.();
      mount.innerHTML = '';
    };
  }, [project]);

  useEffect(() => { setDay(totalDays); }, [totalDays]);

  useEffect(() => {
    const st = stateRef.current;
    if (st?.state && day !== null) st.state.day = day;
  }, [day]);

  useEffect(() => {
    const st = stateRef.current;
    if (st?.state) {
      st.state.playing = playing;
      if (playing && st.state.day >= totalDays) st.state.day = 0;
    }
  }, [playing, totalDays]);

  // qavat tanlanganda sahnani yangilash
  useEffect(() => {
    const st = stateRef.current;
    if (st?.applyDay && st.state) st.applyDay(st.state.day);
  }, [selFloor]);

  const shownDay = day ?? totalDays;
  const activePhase = phases.find((ph) => shownDay >= ph.startDay && shownDay <= ph.endDay);
  const fmt = (n) => (n / 1e6).toFixed(1) + " mln so'm";
  const selInfo = selFloor != null ? floors[selFloor] : null;

  return (
    <div>
      <div className="viewer-wrap" style={glError ? { height: 'auto' } : { height: 540 }}>
        {glError ? <WebGLFallback title="3D ko'rinishni chizib bo'lmadi" error={glError} /> : null}
        <div ref={mountRef} style={{ width: '100%', height: '100%', display: glError ? 'none' : 'block' }} />
        <div className="viewer-hud" style={glError ? { display: 'none' } : undefined}>
          <div className="hud-card">
            <div className="v">{shownDay} / {totalDays} kun</div>
            <div className="l">{activePhase ? activePhase.name : 'Qurilish yakunlandi'}</div>
          </div>
          <div className="hud-card">
            <div className="v">{project.quantities?.facadeArea || 0} m²</div>
            <div className="l">apalka (qolip) maydoni</div>
          </div>
          {selInfo && (
            <div className="hud-card">
              <div className="v">{selInfo.name}</div>
              <div className="l">tanlangan qavat{selInfo.facade === false ? ' · apalkasiz' : ' · apalka bilan'}</div>
            </div>
          )}
        </div>
      </div>

      <div className="timeline-panel">
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
          <span className="small-muted">Qavat:</span>
          <button
            className={'btn small ' + (selFloor == null ? '' : 'secondary')}
            onClick={() => setSelFloor(null)}
          >🏢 Barchasi</button>
          {floors.map((f, i) => (
            <button
              key={f.id || i}
              className={'btn small ' + (selFloor === i ? '' : 'secondary')}
              onClick={() => setSelFloor(i)}
              title={f.facade === false ? 'Apalkasiz qavat' : 'Apalka bilan'}
            >{f.name}{f.facade === false ? ' ○' : ' ●'}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn small" disabled={!!glError} onClick={() => setPlaying((p) => !p)}>{playing ? '⏸ To‘xtatish' : '▶ Qurilishni boshlash'}</button>
          <button
            className="btn small secondary"
            disabled={!!glError}
            title="3D ko'rinishni PNG rasm qilib saqlash"
            onClick={() => {
              const c = mountRef.current?.querySelector('canvas');
              if (!c) return;
              // Kam quvvatli rejimda bufer saqlanmaydi — rasmni olishdan oldin qayta chizamiz
              if (!canPng) stateRef.current?.renderOnce?.();
              const a = document.createElement('a');
              a.href = c.toDataURL('image/png');
              a.download = '5d-koirish-' + shownDay + '-kun.png';
              a.click();
            }}
          >📸 PNG yuklab olish</button>
          <span className="small-muted">yoki slayder bilan kunni tanlang:</span>
        </div>
        <input
          type="range" min={0} max={totalDays} value={shownDay} disabled={!!glError} style={{ margin: '10px 0' }}
          onChange={(e) => setDay(Number(e.target.value))}
        />
        {phases.map((ph) => (
          <div key={ph.key} className={'phase-row ' + (shownDay >= ph.endDay ? 'done' : shownDay >= ph.startDay ? 'active' : '')}>
            <span>{ph.name} — {ph.days} kun ({ph.qty} {ph.unit})</span>
            <span>{ph.qty} {ph.unit} · {ph.days} kun</span>
          </div>
        ))}
        <div className="legend">
          <span><span className="dot" style={{ background: '#9c7a5b' }} />Devor (beton/g'isht)</span>
          <span><span className="dot" style={{ background: '#7ec8ff' }} />Oyna</span>
          <span><span className="dot" style={{ background: '#c22a1e' }} />MINAR qolip (apalka)</span>
          <span><span className="dot" style={{ background: '#4a4a4e' }} />Tyaga (tayrot)</span>
        </div>
        <p className="small-muted" style={{ marginTop: 8 }}>
          💡 Qavat tugmalarida <b>●</b> — apalka bor, <b>○</b> — apalka o'chirilgan ("Qavatlar" bo'limida boshqariladi).
          Qavatni tanlasangiz, boshqa qavatlar shaffof bo'lib, shu qavatning apalka joylashuvi yaqqol ko'rinadi.
          🥽 <b>VR rejimi:</b> HTTPS orqali ochib VR qo'lqoynini ulang.
        </p>
      </div>
    </div>
  );
}
