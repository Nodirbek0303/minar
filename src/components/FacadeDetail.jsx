import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Fasad (apalka) tizimining 3D maketi: devor -> anker bolt -> gayka/shayba -> tirgak (bracket)
// -> vertikal profil -> klemmer -> panel. "Exploded" slайдer bilan qismlar ajraladi.
export default function FacadeDetail() {
  const mountRef = useRef(null);
  const explodeRef = useRef(0);
  const rotatingRef = useRef(false);
  const [explode, setExplode] = useState(0);
  const [rotating, setRotating] = useState(false);

  useEffect(() => { explodeRef.current = explode; }, [explode]);
  useEffect(() => { rotatingRef.current = rotating; }, [rotating]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f18);
    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.01, 100);
    camera.position.set(3.2, 1.6, 3.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    // metall qismlar uchun refleksiya muhiti
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0.65, 0.6);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(2, 3, 2); scene.add(key);
    const fill = new THREE.DirectionalLight(0x88aaff, 0.5); fill.position.set(-2, 1, -1); scene.add(fill);

    const grid = new THREE.GridHelper(6, 30, 0x24344d, 0x18243a);
    scene.add(grid);

    const parts = []; // {mesh, home:Vector3, dir:Vector3, factor}
    const addPart = (geo, color, pos, dir, factor, opts = {}) => {
      const mat = new THREE.MeshStandardMaterial({
        color, roughness: opts.rough ?? 0.5, metalness: opts.metal ?? 0.35, transparent: true, opacity: 1
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      if (opts.rot) mesh.rotation.copy(opts.rot);
      scene.add(mesh);
      parts.push({ mesh, home: pos.clone(), dir: dir.clone().normalize(), factor });
      return mesh;
    };

    // --- devor plitasi (z-qalinlik) ---
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 1.4, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.95, metalness: 0 })
    );
    wall.position.set(0, 0.7, 0);
    scene.add(wall);
    // devor poyasi (podstal) shartli chiziq: z=0.1 — tashqi yuza

    const Z = new THREE.Vector3(0, 0, 1);
    const steel = 0xc9ccd4, galv = 0x9fb2c8, nutC = 0xd8d44a, alum = 0xdde4ec, stone = 0xb9c2c9, klem = 0xe0b84a;

    const bracketCenters = [[-0.45, 1.0], [0.45, 1.0], [-0.45, 0.3], [0.45, 0.3]];
    for (const [bx, by] of bracketCenters) {
      // 2 anker bolt — devor ichiga kiradi
      for (const dx of [-0.07, 0.07]) {
        addPart(
          new THREE.CylinderGeometry(0.009, 0.009, 0.34, 16),
          steel,
          new THREE.Vector3(bx + dx, by, 0.1 - 0.34 / 2 + 0.05),
          Z, 0.3, { rot: new THREE.Euler(Math.PI / 2, 0, 0), metal: 0.8, rough: 0.3 }
        );
      }
      // tirgak: devorga tegib turuvchi plastina + gorizontal qo'l
      const plate = addPart(
        new THREE.BoxGeometry(0.22, 0.3, 0.006),
        galv,
        new THREE.Vector3(bx, by, 0.106),
        Z, 0.55, { metal: 0.6, rough: 0.45 }
      );
      plate.userData.isBracket = true;
      addPart(
        new THREE.BoxGeometry(0.05, 0.05, 0.18),
        galv,
        new THREE.Vector3(bx, by, 0.106 + 0.09),
        Z, 0.7, { metal: 0.6, rough: 0.45 }
      );
      // shayba + gayka (har ankerda, tashqi tomonda)
      for (const dx of [-0.07, 0.07]) {
        addPart(
          new THREE.CylinderGeometry(0.022, 0.022, 0.004, 24),
          steel,
          new THREE.Vector3(bx + dx, by, 0.112),
          Z, 0.8, { rot: new THREE.Euler(Math.PI / 2, 0, 0), metal: 0.8, rough: 0.3 }
        );
        addPart(
          new THREE.CylinderGeometry(0.014, 0.014, 0.012, 6),
          nutC,
          new THREE.Vector3(bx + dx, by, 0.12),
          Z, 0.9, { rot: new THREE.Euler(Math.PI / 2, 0, 0), metal: 0.85, rough: 0.35 }
        );
      }
    }

    // vertikal profillar (tirgak qo'llari ustida)
    for (const px of [-0.45, 0.45]) {
      addPart(
        new THREE.BoxGeometry(0.05, 1.3, 0.05),
        alum,
        new THREE.Vector3(px, 0.65, 0.106 + 0.18 + 0.025),
        Z, 1.1, { metal: 0.7, rough: 0.3 }
      );
    }

    // klemmerlar (profil va panel orasida)
    const klemPos = [[-0.45, 1.1], [-0.45, 0.2], [0.45, 1.1], [0.45, 0.2]];
    for (const [kx, ky] of klemPos) {
      addPart(
        new THREE.BoxGeometry(0.02, 0.05, 0.05),
        klem,
        new THREE.Vector3(kx, ky, 0.106 + 0.18 + 0.05 + 0.025),
        Z, 1.3, { metal: 0.7, rough: 0.35 }
      );
    }

    // apalka paneli (tosh) — 2 dona
    const panelH = 0.55;
    addPart(
      new THREE.BoxGeometry(1.06, panelH, 0.03),
      stone,
      new THREE.Vector3(0, 0.7 + panelH / 2 + 0.02, 0.106 + 0.18 + 0.05 + 0.05 + 0.015),
      Z, 1.6, { rough: 0.65, metal: 0.05 }
    );
    addPart(
      new THREE.BoxGeometry(1.06, panelH, 0.03),
      0xa8b2ba,
      new THREE.Vector3(0, 0.7 - panelH / 2 - 0.01, 0.106 + 0.18 + 0.05 + 0.05 + 0.015),
      Z, 1.6, { rough: 0.65, metal: 0.05 }
    );

    let raf;
    const clock = new THREE.Clock();
    const tick = () => {
      const dt = clock.getDelta();
      const t = explodeRef.current;
      for (const p of parts) {
        p.mesh.position.copy(p.home).addScaledVector(p.dir, t * p.factor);
        p.mesh.material.opacity = 1;
      }
      if (rotatingRef.current) scene.rotation.y += dt * 0.25;
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    const ro = new ResizeObserver(() => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    });
    ro.observe(mount);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      controls.dispose();
      pmrem.dispose();
      renderer.dispose();
      mount.innerHTML = '';
    };
  }, []);

  const legend = [
    ['#8a8f96', 'Devor (tashqi yuza)'],
    ['#c9ccd4', 'Anker bolt — devor ichiga 30+ sm'],
    ['#d8d44a', 'Gayka (M8/M10)'],
    ['#9fb2c8', 'Tirgak (bracket, galvanik po\'lat)'],
    ['#dde4ec', 'Vertikal profil (aluminiy, qadam 60 sm)'],
    ['#e0b84a', 'Klemmer (panel qisqichi)'],
    ['#b9c2c9', 'Apalka paneli (tosh/kompozit)']
  ];

  return (
    <div>
      <div className="viewer-wrap" style={{ height: 480 }}>
        <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
      </div>
      <div className="timeline-panel">
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="small-muted">Eksploded (ajratilgan) ko'rinish:</span>
          <input type="range" min={0} max={100} value={explode} style={{ width: 300 }}
            onChange={(e) => setExplode(Number(e.target.value))} />
          <label style={{ fontSize: 13 }}>
            <input type="checkbox" checked={rotating} onChange={(e) => setRotating(e.target.checked)} /> Aylanish
          </label>
        </div>
        <div className="legend" style={{ marginTop: 10 }}>
          {legend.map(([c, name]) => (
            <span key={name}><span className="dot" style={{ background: c }} />{name}</span>
          ))}
        </div>
        <p className="small-muted" style={{ marginTop: 8 }}>
          Ventilyatsiyalanuvchi fasad tizimi: anker bolt devorga kimyoviy yoki kengaytiruvchi usulda o'rnatiladi,
          ustiga gayka va shayba bilan <b>tirgak</b> mahkamlanadi, tirgak qo'liga <b>vertikal profil</b>, profillarga esa
          <b> klemmer</b> yordamida apalka paneli osiladi. Har 1 m² fasadga ~4 tirgak, ~8 anker + gayka/shayba ketadi
          (aniq hisob "Materiallar" bo'limida).
        </p>
      </div>
    </div>
  );
}
