// Auto procedurali originali (nessun marchio): carrozzeria estrusa da un profilo laterale, vetri, luci, ruote istanziate.
// 4 draw call per auto: carrozzeria, vetri, luci, ruote (InstancedMesh da 4).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// profili laterali: x = lunghezza (0 = coda, len = muso), y = altezza. top: punti lisciati; win: finestrature.
const PROFILES = {
  pode:  { r: 0.335, light: 0.66, bot: 0.4,
    top: [[0, 0.78], [0.2, 0.9], [1.0, 0.97], [1.6, 1.19], [2.5, 1.24], [3.1, 0.99], [3.9, 0.82], [4.25, 0.64]],
    win: [[1.12, 0.99], [1.62, 1.16], [2.48, 1.2], [3.02, 0.99]] },
  vela:  { r: 0.29, light: 0.82, bot: 0.36,
    top: [[0, 1.0], [0.07, 1.4], [0.35, 1.5], [2.15, 1.51], [2.8, 1.06], [3.45, 0.92], [3.6, 0.66]],
    win: [[0.14, 1.07], [0.22, 1.4], [0.4, 1.46], [2.12, 1.47], [2.72, 1.07]] },
  bruma: { r: 0.38, light: 1.0, bot: 0.5,
    top: [[0, 1.28], [0.1, 1.68], [0.35, 1.76], [3.1, 1.76], [3.62, 1.32], [4.45, 1.16], [4.6, 0.84]],
    win: [[0.16, 1.31], [0.24, 1.63], [0.4, 1.69], [3.05, 1.69], [3.5, 1.32]] },
};

function sideShape(pr, len) {
  const s = new THREE.Shape(); s.moveTo(0.05, pr.bot); s.lineTo(0, pr.top[0][1]);
  s.splineThru(pr.top.slice(1).map(([x, y]) => new THREE.Vector2(x, y)));
  s.lineTo(len - 0.04, pr.bot); s.closePath(); return s;
}
function extrudeSide(shape, width, bevel) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 10, steps: 1 });
  g.rotateY(Math.PI / 2); // x (lunghezza) → muso verso +z
  g.computeBoundingBox(); const b = g.boundingBox; g.translate(-(b.min.x + b.max.x) / 2, 0, -(b.min.z + b.max.z) / 2);
  return g;
}
const MATS = {};
function mats(color) {
  if (!MATS.glass) {
    MATS.glass = new THREE.MeshStandardMaterial({ color: '#1c2429', roughness: 0.05, metalness: 0.3, envMapIntensity: 1.6 });
    MATS.lights = new THREE.MeshBasicMaterial({ vertexColors: true });
    MATS.wheel = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.2 });
  }
  return { paint: new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.55, envMapIntensity: 1.25 }), ...MATS };
}
function colored(g, hex) { const c = new THREE.Color(hex); const n = g.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g.index ? g.toNonIndexed() : g; }
function strip(g) { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k); return g; }

export function buildCar(id, spec, color = spec.color) {
  const pr = PROFILES[id]; const L = spec.len, W = spec.wid; const m = mats(color);
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  // carrozzeria + sottoscocca scura (stessa draw call: colori diversi via due mesh? no: sottoscocca nel vetro scuro)
  const bodyG = extrudeSide(sideShape(pr, L), W, 0.09);
  const paint = new THREE.Mesh(bodyG, m.paint); paint.castShadow = true; paint.receiveShadow = true; body.add(paint);
  // vetri: finestrature leggermente più larghe della carrozzeria + parabrezza/lunotto + fascia sottoscocca
  const ws = new THREE.Shape(pr.win.map(([x, y]) => new THREE.Vector2(x, y)));
  const winG = extrudeSide(ws, W + 0.03, 0.02);
  const under = new THREE.BoxGeometry(W - 0.2, 0.12, L - 0.5); under.translate(0, pr.bot + 0.02, 0);
  const glass = new THREE.Mesh(mergeGeometries([strip(winG.index ? winG.toNonIndexed() : winG), strip(under.toNonIndexed())]), m.glass); body.add(glass);
  // luci (anteriori calde, posteriori rosse, targhe chiare senza scritte)
  const lg = [];
  const lw = Math.min(0.32, W * 0.18);
  for (const sx of [-1, 1]) {
    const f = new THREE.BoxGeometry(lw, 0.09, 0.05); f.translate(sx * (W / 2 - lw / 2 - 0.12), pr.light, L / 2 - 0.02); lg.push(colored(f, '#fff4d8'));
    const r = new THREE.BoxGeometry(lw, 0.08, 0.05); r.translate(sx * (W / 2 - lw / 2 - 0.1), pr.light + 0.04, -L / 2 + 0.02); lg.push(colored(r, '#b3121a'));
  }
  for (const z of [L / 2 + 0.005, -L / 2 - 0.005]) { const t = new THREE.BoxGeometry(0.46, 0.11, 0.02); t.translate(0, pr.bot + 0.14, z); lg.push(colored(t, '#e9e6dc')); }
  const lights = new THREE.Mesh(mergeGeometries(lg.map(strip)), m.lights); body.add(lights);
  // ruote: pneumatico + cerchio a razze in una geometria (colori per vertice), 4 istanze
  const r = pr.r, tw = 0.22;
  const tire = new THREE.CylinderGeometry(r, r, tw, 20, 1); tire.rotateZ(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(r * 0.62, r * 0.62, tw + 0.02, 10, 1); rim.rotateZ(Math.PI / 2);
  const parts = [colored(tire, '#1d1e20'), colored(rim, id === 'pode' ? '#3b3e42' : '#a8adb1')];
  for (let k = 0; k < 5; k++) { const sp = new THREE.BoxGeometry(tw + 0.04, r * 1.1, 0.05); sp.rotateX((k / 5) * Math.PI); parts.push(colored(sp, '#2a2c2f')); }
  const wheelG = mergeGeometries(parts.map(strip));
  const wheels = new THREE.InstancedMesh(wheelG, m.wheel, 4); wheels.castShadow = true; wheels.frustumCulled = false; root.add(wheels);
  const half = spec.wb / 2, wx = W / 2 - tw / 2 - 0.04;
  root.userData = { wheels, wheelPos: [[wx, r, half], [-wx, r, half], [wx, r, -half], [-wx, r, -half]], body, paint };
  setWheels(root, 0, 0);
  return root;
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
// rot: rotazione di rotolamento (rad), steer: angolo ruote anteriori (rad, positivo = sinistra)
export function setWheels(root, rot, steer, roll = 0) {
  const u = root.userData;
  u.wheelPos.forEach(([x, y, z], i) => {
    _q.setFromEuler(_e.set(rot, i < 2 ? steer : 0, 0, 'YXZ'));
    _m.compose(_v.set(x, y, z), _q, _s); u.wheels.setMatrixAt(i, _m);
  });
  u.wheels.instanceMatrix.needsUpdate = true;
  u.body.rotation.z = roll; // leggero rollio in curva (solo estetico)
}
