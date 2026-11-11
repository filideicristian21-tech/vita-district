// Auto procedurali originali (nessun marchio): carrozzeria estrusa da un profilo laterale, vetri, luci, ruote istanziate.
// 5 draw call per auto: carrozzeria (vernice con trasparente), vetri, plastiche, luci, ruote (InstancedMesh da 4).
// v0.5: vernice meno metallica e con clearcoat, paraurti/specchietti/maniglie, cerchi con razze e mozzo, fari più grandi.
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
// +X del profilo (muso) deve diventare +Z, la stessa convenzione dei fari. rotateY(+PI/2 lo mandava a -Z).
const BEV = 0.13;
function extrudeRaw(shape, width, bevel) {
  const depth = Math.max(0.04, width - bevel * 2);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: bevel > 0.1 ? 5 : 2, curveSegments: 12, steps: 1 });
  g.rotateY(-Math.PI / 2);
  return g;
}
function centerX(g) { g.computeBoundingBox(); const b = g.boundingBox; g.translate(-(b.min.x + b.max.x) / 2, 0, 0); return g; }
function shiftCenter(g, center) {
  g.translate(-center.x, 0, -center.z);
  return g;
}
const MATS = {};
function mats(color) {
  if (!MATS.glass) {
    // v0.6 (Forge): vetri scuri semitrasparenti con abitacolo scuro dietro; gomma e cerchio con materiali separati
    MATS.glass = new THREE.MeshStandardMaterial({ color: '#0f1518', roughness: 0.03, metalness: 0, envMapIntensity: 1.5, transparent: true, opacity: 0.62, depthWrite: false });
    MATS.lights = new THREE.MeshBasicMaterial({ vertexColors: true });
    MATS.wheel = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
    MATS.rim = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.9, envMapIntensity: 1.2 });
    MATS.trim = new THREE.MeshStandardMaterial({ color: '#18191b', roughness: 0.62, metalness: 0.05 });
  }
  return { paint: paintMat(color), ...MATS };
}
export function paintMat(color, shiny = false) {
  // v0.6 (Forge/Spark): pastello = metalness 0, trasparente lucido sopra
  return new THREE.MeshPhysicalMaterial({ color, roughness: shiny ? 0.25 : 0.36, metalness: 0.0, clearcoat: 1, clearcoatRoughness: shiny ? 0.02 : 0.07, envMapIntensity: shiny ? 1.3 : 1.1 });
}
// lavaggio: carrozzeria più lucida (solo estetica)
// v0.7 (Forge): il riflesso segue il giorno e la notte anche per auto create o lavate più tardi
export const ENV_K = { value: 1 };
export function setShiny(root, shiny) {
  const p = root.userData.paintMesh; if (!p) return;
  const m = p.material; m.roughness = shiny ? 0.25 : 0.36; m.clearcoatRoughness = shiny ? 0.02 : 0.07; m.userData.envBase = shiny ? 1.3 : 1.1; m.envMapIntensity = m.userData.envBase * ENV_K.value; root.userData.shiny = shiny;
}
function colored(g, hex) { const c = new THREE.Color(hex); const n = g.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g.index ? g.toNonIndexed() : g; }
function strip(g) { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k); return g; }

export function buildCar(id, spec, color = spec.color) {
  const pr = PROFILES[id]; const L = spec.len, W = spec.wid; const m = mats(color);
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  // carrozzeria + sottoscocca scura (stessa draw call: colori diversi via due mesh? no: sottoscocca nel vetro scuro)
  const bodyG = extrudeRaw(sideShape(pr, L), W, BEV); // v0.6: smussatura più ampia = fianchi e tetto arrotondati
  bodyG.computeBoundingBox();
  const bodyCenter = bodyG.boundingBox.getCenter(new THREE.Vector3());
  shiftCenter(bodyG, bodyCenter);
  const paint = new THREE.Mesh(bodyG, m.paint); paint.castShadow = true; paint.receiveShadow = true; body.add(paint);
  // Stesso centro della scocca: il bbox dei vetri da solo li spostava in longitudine.
  const ws = new THREE.Shape(pr.win.map(([x, y]) => new THREE.Vector2(x, y)));
  const winG = shiftCenter(extrudeRaw(ws, W + 0.03, 0.02), bodyCenter);
  centerX(winG); // v0.5: i vetri laterali erano spostati di 8 cm (si vedevano solo da un lato)
  // v0.5: parabrezza e lunotto. Stessa finestratura, più stretta (montanti in tinta) e allargata avanti/dietro
  // quanto basta per uscire dalla carrozzeria inclinata: prima da dietro l'auto sembrava un blocco senza vetri.
  // Ogni punto della finestratura viene portato appena fuori dalla superficie vera della carrozzeria (profilo campionato + smussatura), avanti o dietro.
  const outline = sideShape(pr, L).getPoints(48);
  const edgeAt = (y, front) => { let best = null; for (let i = 0; i < outline.length; i++) { const a = outline[i], c = outline[(i + 1) % outline.length]; if ((a.y - y) * (c.y - y) > 0 || a.y === c.y) continue; const x = a.x + ((y - a.y) / (c.y - a.y)) * (c.x - a.x); if (best === null || (front ? x > best.x : x < best.x)) best = { x, k: Math.min(3, Math.hypot(c.x - a.x, c.y - a.y) / Math.abs(c.y - a.y)) }; } return best; };
  const OUT = BEV + 0.012; // la smussatura della scocca (0,09) sporge oltre il profilo: il vetro va oltre di 1,2 cm
  const midX = (pr.win[0][0] + pr.win[pr.win.length - 1][0]) / 2;
  const ws2 = new THREE.Shape(pr.win.map(([x, y]) => { const front = x > midX; const e = edgeAt(y - 0.03, front); return new THREE.Vector2(e === null ? x : e.x + (front ? 1 : -1) * OUT * e.k, y - 0.03); }));
  const winG2 = shiftCenter(extrudeRaw(ws2, W - 0.34, 0.02), bodyCenter); centerX(winG2);
  const under = new THREE.BoxGeometry(W - 0.2, 0.12, L - 0.5); under.translate(0, pr.bot + 0.02, 0);
  const glass = new THREE.Mesh(mergeGeometries([strip(winG.index ? winG.toNonIndexed() : winG), strip(winG2.index ? winG2.toNonIndexed() : winG2), strip(under.toNonIndexed())]), m.glass); body.add(glass);
  // luci (anteriori calde, posteriori rosse, targhe chiare senza scritte)
  const lg = [];
  const lw = Math.min(0.32, W * 0.18);
  for (const sx of [-1, 1]) {
    const f = new THREE.BoxGeometry(lw, 0.09, 0.05); f.translate(sx * (W / 2 - lw / 2 - 0.12), pr.light, L / 2 - 0.02); lg.push(colored(f, '#fff4d8'));
    const r = new THREE.BoxGeometry(lw, 0.08, 0.05); r.translate(sx * (W / 2 - lw / 2 - 0.1), pr.light + 0.04, -L / 2 + 0.02); lg.push(colored(r, '#b3121a'));
  }
  for (const z of [L / 2 + 0.005, -L / 2 - 0.005]) { const t = new THREE.BoxGeometry(0.46, 0.11, 0.02); t.translate(0, pr.bot + 0.14, z); lg.push(colored(t, '#e9e6dc')); }
  const lights = new THREE.Mesh(mergeGeometries(lg.map(strip)), m.lights); body.add(lights);
  // v0.7: frecce (indicatori di direzione) ai 4 angoli + ripetitori sui fianchi. Una sola mesh: il lato è nel vertex color (r=1 sinistra).
  const bg = [];
  for (const sx of [-1, 1]) {
    const side = sx > 0 ? 1 : 0; // l'auto guarda +z: la sua sinistra è +x
    // sotto i fari/fanali, alla stessa x (gli angoli smussati della scocca nasconderebbero un indicatore sul bordo)
    const lw = Math.min(0.32, W * 0.18);
    const f = new THREE.BoxGeometry(lw, 0.08, 0.05); f.translate(sx * (W / 2 - lw / 2 - 0.12), pr.light - 0.09, L / 2 - 0.015); bg.push(colored(f, side ? '#ffffff' : '#000000'));
    const r = new THREE.BoxGeometry(lw, 0.09, 0.05); r.translate(sx * (W / 2 - lw / 2 - 0.1), pr.light - 0.055, -L / 2 + 0.015); bg.push(colored(r, side ? '#ffffff' : '#000000'));
    const rp = new THREE.BoxGeometry(0.03, 0.07, 0.24); rp.translate(sx * (W / 2 + 0.015), pr.bot + 0.42, L * 0.3); bg.push(colored(rp, side ? '#ffffff' : '#000000'));
  }
  const blinkU = { uL: { value: 0 }, uR: { value: 0 } };
  const blinkM = new THREE.MeshBasicMaterial({ vertexColors: true });
  blinkM.onBeforeCompile = (sh) => { sh.uniforms.uL = blinkU.uL; sh.uniforms.uR = blinkU.uR;
    sh.fragmentShader = 'uniform float uL;\nuniform float uR;\n' + sh.fragmentShader.replace('#include <color_fragment>', 'float onB = vColor.r > 0.5 ? uL : uR; diffuseColor.rgb = mix(vec3(0.42, 0.24, 0.06), vec3(1.0, 0.55, 0.05) * 2.4, onB);'); };
  blinkM.customProgramCacheKey = () => 'vd7blink';
  const blink = new THREE.Mesh(mergeGeometries(bg.map(strip)), blinkM); blink.visible = false; body.add(blink); // visibile solo con le frecce inserite: 0 draw call in più a riposo
  // plastiche: paraurti, minigonne, specchietti, griglia, maniglie
  const tg = [];
  const bz = (z0, z1, y0, y1, w) => { const b = new THREE.BoxGeometry(w, y1 - y0, z1 - z0); b.translate(0, (y0 + y1) / 2, (z0 + z1) / 2); tg.push(b); };
  bz(L / 2 - 0.16, L / 2 + 0.03, pr.bot - 0.02, pr.bot + 0.2, W - 0.06);        // paraurti anteriore
  bz(-L / 2 - 0.03, -L / 2 + 0.16, pr.bot - 0.02, pr.bot + 0.2, W - 0.06);      // paraurti posteriore
  bz(L / 2 - 0.02, L / 2 + 0.012, pr.light - 0.16, pr.light - 0.05, W * 0.42);  // griglia
  for (const sx of [-1, 1]) {
    const sk = new THREE.BoxGeometry(0.06, 0.1, L * 0.5); sk.translate(sx * (W / 2 + 0.005), pr.bot + 0.04, 0); tg.push(sk); // minigonna
    const mi = new THREE.BoxGeometry(0.16, 0.09, 0.07); mi.translate(sx * (W / 2 + 0.07), pr.win[pr.win.length - 1][1] + 0.05, pr.win[pr.win.length - 1][0] - L / 2 - 0.12); tg.push(mi); // specchietto
    for (const hz of [0.05, -0.55]) { const h = new THREE.BoxGeometry(0.03, 0.03, 0.16); h.translate(sx * (W / 2 + 0.01), pr.win[0][1] - 0.12, hz * L * 0.5); tg.push(h); } // maniglie
  }
  // abitacolo scuro (si vede dietro i vetri semitrasparenti) e linee delle porte
  { const wx0 = pr.win[0][0], wx1 = pr.win[pr.win.length - 1][0], wyb = Math.min(...pr.win.map((q) => q[1]));
    const cab = new THREE.BoxGeometry(W - 0.34, Math.max(...pr.win.map((q) => q[1])) - wyb + 0.05, (wx1 - wx0) * 0.92); cab.translate(0, wyb + (Math.max(...pr.win.map((q) => q[1])) - wyb) / 2 - 0.02, (wx0 + wx1) / 2 - L / 2); tg.push(cab);
    const door = (zc) => { for (const sx of [-1, 1]) { const g = new THREE.BoxGeometry(0.012, wyb - pr.bot - 0.12, 0.012); g.translate(sx * (W / 2 + 0.004), (wyb + pr.bot) / 2 + 0.02, zc); tg.push(g); } };
    const mid = (wx0 + wx1) / 2 - L / 2; door(mid + (wx1 - wx0) * 0.08); door(wx1 - L / 2 + 0.05); if (id !== 'pode') door(wx0 - L / 2 + 0.25); else door(wx0 - L / 2 + 0.05);
    for (const sx of [-1, 1]) { const g = new THREE.BoxGeometry(0.012, 0.012, wx1 - wx0 + 0.2); g.translate(sx * (W / 2 + 0.004), pr.bot + 0.12, mid); tg.push(g); } }
  const trim = new THREE.Mesh(mergeGeometries(tg.map((g) => strip(g.toNonIndexed()))), m.trim); trim.castShadow = true; body.add(trim);
  // ruote: pneumatico + cerchio a razze in una geometria (colori per vertice), 4 istanze
  const r = pr.r, tw = 0.22;
  // v0.6: pneumatico a profilo tondo (spalla e battistrada) + cerchio metallico a 5 razze, due istanze separate
  const prof = []; const ri = r * 0.68;
  for (let k = 0; k <= 10; k++) { const a = -Math.PI / 2 + (k / 10) * Math.PI; prof.push(new THREE.Vector2(ri + (r - ri) * (0.55 + 0.45 * Math.cos(a)) * 1, (tw / 2) * Math.sin(a))); }
  const tireG = new THREE.LatheGeometry(prof, 28); tireG.rotateZ(Math.PI / 2);
  const tireParts = [colored(tireG, '#1c1d1f')];
  const rimC = id === 'pode' ? '#3b3e42' : '#c3c8cc';
  const barrel = new THREE.CylinderGeometry(ri, ri, tw * 0.8, 20, 1, true); barrel.rotateZ(Math.PI / 2);
  const face = new THREE.CylinderGeometry(ri * 0.98, ri * 0.98, 0.02, 20, 1); face.rotateZ(Math.PI / 2); face.translate(tw * 0.32, 0, 0);
  const hub = new THREE.CylinderGeometry(r * 0.13, r * 0.15, 0.06, 10, 1); hub.rotateZ(Math.PI / 2); hub.translate(tw * 0.36, 0, 0);
  const rimParts = [colored(barrel, '#5a5e62'), colored(face, '#24272a'), colored(hub, rimC)];
  for (let k = 0; k < 5; k++) { const sp = new THREE.BoxGeometry(0.05, ri * 0.95, 0.06); sp.translate(tw * 0.34, ri * 0.47, 0); sp.rotateX((k / 5) * Math.PI * 2); rimParts.push(colored(sp, rimC)); }
  const ring = new THREE.TorusGeometry(ri * 0.97, 0.022, 6, 24); ring.rotateY(Math.PI / 2); ring.translate(tw * 0.36, 0, 0); rimParts.push(colored(ring, rimC));
  const wheels = new THREE.InstancedMesh(mergeGeometries(tireParts.map(strip)), m.wheel, 4); wheels.castShadow = true;
  const rims = new THREE.InstancedMesh(mergeGeometries(rimParts.map(strip)), m.rim, 4); rims.castShadow = false;
  for (const w of [wheels, rims]) { w.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Math.max(L, W)); w.frustumCulled = true; root.add(w); }
  const half = spec.wb / 2, wx = W / 2 - tw / 2 - 0.04;
  root.userData = { lights, blink, blinkU, trim, glass, wheels, rims, wheelPos: [[wx, r, half], [-wx, r, half], [wx, r, -half], [-wx, r, -half]], body, paintMesh: paint };
  setWheels(root, 0, 0);
  return root;
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
// rot: rotazione di rotolamento (rad), steer: angolo ruote anteriori (rad, positivo = sinistra)
export function setWheels(root, rot, steer, roll = 0) {
  const u = root.userData;
  u.wheelPos.forEach(([x, y, z], i) => {
    // ruote con x<0 girate di 180°: il cerchio guarda sempre fuori (rotolamento invertito di conseguenza)
    _q.setFromEuler(_e.set(x > 0 ? rot : -rot, (i < 2 ? steer : 0) + (x > 0 ? 0 : Math.PI), 0, 'YXZ'));
    _m.compose(_v.set(x, y, z), _q, _s); u.wheels.setMatrixAt(i, _m); if (u.rims) u.rims.setMatrixAt(i, _m);
  });
  u.wheels.instanceMatrix.needsUpdate = true; if (u.rims) u.rims.instanceMatrix.needsUpdate = true;
  u.body.rotation.z = roll; // leggero rollio in curva (solo estetico)
}

// v0.6 (Teco): LOD a 20/50 m. Vicino tutto; 20-50 m niente ombre dei dettagli; oltre 50 m solo scocca, vetri e gomme (niente cerchi, plastiche, luci).
export function carLOD(root, d) {
  const u = root.userData; const lvl = d < 20 ? 0 : d < 50 ? 1 : 2;
  if (u.lod === lvl) return; u.lod = lvl;
  u.trim.visible = u.lights.visible = u.rims.visible = lvl < 2; if (u.blink) u.blink.visible = lvl < 2 && !!u.blinkOn;
  u.trim.castShadow = u.wheels.castShadow = lvl === 0;
}

// v0.7: stato delle frecce sull'auto (0/1 per lato)
export function setBlink(root, l, r, on = true) { const d = root.userData; if (!d.blinkU) return; d.blinkU.uL.value = l; d.blinkU.uR.value = r; d.blinkOn = on; d.blink.visible = on && d.trim.visible; }
