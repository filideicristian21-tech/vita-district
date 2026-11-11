// v0.6: pose procedurali sopra lo scheletro Quaternius (nuoto, sovrapposizioni alla corsa).
// Ogni arto si orienta verso una direzione data nello spazio del "corpo" (x = sinistra del personaggio, y = su, z = avanti),
// partendo dalla posa di riposo catturata al caricamento: non serve conoscere gli assi locali delle ossa.
import * as THREE from 'three';

const CHAIN = [
  ['UpperArm.L', 'LowerArm.L'], ['LowerArm.L', 'Palm.L'], ['UpperArm.R', 'LowerArm.R'], ['LowerArm.R', 'Palm.R'],
  ['UpperLeg.L', 'LowerLeg.L'], ['LowerLeg.L', 'Foot.L'], ['UpperLeg.R', 'LowerLeg.R'], ['LowerLeg.R', 'Foot.R'],
  ['Neck', 'Head'], ['Torso', 'Neck'], ['Abdomen', 'Torso'],
];
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _m = new THREE.Matrix4();

export class Rig {
  constructor(model, frame) {
    this.model = model; this.frame = frame; // frame = gruppo "corpo" (le direzioni sono nel suo spazio)
    this.b = {}; model.traverse((o) => { if (o.isBone) { this.b[o.name] = o; this.b[o.name.replace(/([LR])(_end)?$/, '.$1$2')] = o; } }); // GLTFLoader toglie i punti: «UpperArmL» → «UpperArm.L»
    this.ok = CHAIN.every(([a, c]) => this.b[a] && this.b[c]);
    if (!this.ok) return;
    frame.updateWorldMatrix(true, true);
    const fInv = _m.copy(frame.matrixWorld).invert(); const fq = frame.getWorldQuaternion(new THREE.Quaternion()).invert();
    this.rest = {};
    for (const [a, c] of CHAIN) {
      const pa = this.b[a].getWorldPosition(new THREE.Vector3()).applyMatrix4(fInv);
      const pc = this.b[c].getWorldPosition(new THREE.Vector3()).applyMatrix4(fInv);
      this.rest[a] = { dir: pc.sub(pa).normalize(), q: fq.clone().multiply(this.b[a].getWorldQuaternion(new THREE.Quaternion())), len: 0 };
    }
    // piedi: sono ossa IK figlie della radice (a riposo stanno sulla caviglia); vanno riportati in fondo alla gamba
    this.foot = {};
    for (const s of ['L', 'R']) {
      const f = this.b['Foot.' + s], low = this.b['LowerLeg.' + s];
      const lq = low.getWorldQuaternion(new THREE.Quaternion());
      const rel = lq.clone().invert().multiply(f.getWorldQuaternion(new THREE.Quaternion()));
      const d = f.getWorldPosition(new THREE.Vector3()).sub(low.getWorldPosition(new THREE.Vector3()));
      this.foot[s] = { rel, offL: d.applyQuaternion(lq.clone().invert()) }; // caviglia nello spazio dell'osso gamba
    }
  }
  // orienta l'osso «name» verso dir (spazio corpo). w = peso (0 = lascia l'animazione, 1 = posa piena)
  aim(name, dir, w = 1) {
    const b = this.b[name], R = this.rest[name]; if (!b || !R || w <= 0) return;
    const fq = this.frame.getWorldQuaternion(_q2).invert();
    const target = _q.setFromUnitVectors(R.dir, _v.copy(dir).normalize()).multiply(R.q); // spazio corpo
    b.parent.updateWorldMatrix(true, false);
    const pq = fq.multiply(b.parent.getWorldQuaternion(new THREE.Quaternion())); // genitore in spazio corpo
    const local = pq.invert().multiply(target);
    if (w >= 1) b.quaternion.copy(local); else b.quaternion.slerp(local, w);
    b.updateMatrixWorld(true);
  }
  // ruota un osso di un angolo intorno a un asse dello spazio corpo, sopra la posa attuale
  turn(name, axis, ang) {
    const b = this.b[name]; if (!b || !ang) return;
    const fq = this.frame.getWorldQuaternion(new THREE.Quaternion());
    b.parent.updateWorldMatrix(true, false);
    const pw = b.parent.getWorldQuaternion(new THREE.Quaternion());
    const axW = _v2.copy(axis).applyQuaternion(fq).normalize();
    const axL = axW.applyQuaternion(pw.clone().invert()).normalize();
    b.quaternion.premultiply(_q.setFromAxisAngle(axL, ang)); b.updateMatrixWorld(true);
  }
  // dopo aver mosso le gambe: i piedi IK seguono la caviglia
  fixFeet() {
    for (const s of ['L', 'R']) {
      const F = this.foot[s]; if (!F) continue; const f = this.b['Foot.' + s], low = this.b['LowerLeg.' + s];
      low.updateWorldMatrix(true, false); const lq = low.getWorldQuaternion(new THREE.Quaternion());
      const wpos = low.getWorldPosition(new THREE.Vector3()).add(F.offL.clone().applyQuaternion(lq));
      const wq = lq.multiply(F.rel);
      f.parent.updateWorldMatrix(true, false);
      f.position.copy(f.parent.worldToLocal(wpos));
      f.quaternion.copy(f.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(wq));
      f.updateMatrixWorld(true);
    }
  }
}

// ---------------- Nuoto ----------------
// Stili: libero (crawl), rana, dorso, sott (sott'acqua), fermo (galleggio verticale). Fase 0..1 = un ciclo completo.
export const SWIM_STYLES = ['libero', 'rana', 'dorso', 'sott'];
export const SWIM = {
  // depth = quanto stanno i fianchi sotto il pelo dell'acqua (m)
  libero: { name: 'Stile libero', speed: 1.55, cps: 0.55, pitch: 1.45, depth: 0.18 },
  rana: { name: 'Rana', speed: 1.0, cps: 0.6, pitch: 1.2, depth: 0.22 },
  dorso: { name: 'Dorso', speed: 1.2, cps: 0.5, pitch: -1.42, depth: 0.12 },
  sott: { name: "Sott'acqua", speed: 1.1, cps: 0.55, pitch: 1.5, depth: 1.7 },
  fermo: { name: 'Galleggio', speed: 0, cps: 0.45, pitch: 0.18, depth: 0.55 },
};
const TAU = Math.PI * 2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
// pose per lato: s = +1 sinistra, -1 destra. Restituisce [braccio, avambraccio, coscia, gamba]
function limbPose(style, ph, s) {
  if (style === 'libero' || style === 'dorso') {
    const back = style === 'dorso';
    const th = TAU * (ph + (s > 0 ? 0 : 0.5)) * (back ? -1 : 1);       // braccia alternate
    // trazione: il braccio passa davanti al petto (+z del corpo = sotto, in acqua); recupero dietro, gomito piegato
    const ua = V(s * 0.16, Math.cos(th), Math.sin(th));
    const pull = back ? Math.sin(th) < 0 : Math.sin(th) > 0;
    const la = pull ? ua.clone().add(V(0, 0, back ? -0.25 : 0.25)) : ua.clone().add(V(s * 0.25, -0.6, back ? 0.5 : -0.5));
    const k = Math.sin(TAU * ph * 3 + (s > 0 ? 0 : Math.PI)) * 0.32;    // 6 battute per ciclo
    const ul = V(s * 0.07, -1, (back ? -1 : 1) * k * 0.6), ll = V(s * 0.05, -1, (back ? -1 : 1) * (k * 0.6 - 0.12));
    return [ua, la, ul, ll];
  }
  if (style === 'rana' || style === 'sott') {
    // 0-0.35 apertura e trazione, 0.35-0.55 mani al petto e spinta avanti, 0.45-0.75 calciata, poi scivolata
    let ua, la;
    if (ph < 0.35) { const u = ph / 0.35; ua = V(s * (0.15 + 0.85 * u), 1 - 0.8 * u, 0.15 + 0.55 * u); la = ua.clone().add(V(-s * 0.4 * u, -0.3 * u, 0.4 * u)); }
    else if (ph < 0.55) { const u = (ph - 0.35) / 0.2; ua = V(s * (1 - 0.85 * u), 0.2 + 0.8 * u, 0.7 - 0.55 * u); la = V(s * (0.1 - 0.05 * u), 0.2 + 0.8 * u, 0.6 - 0.45 * u); }
    else { ua = V(s * 0.15, 1, 0.15); la = V(s * 0.05, 1, 0.12); }
    let ul, ll;
    if (ph > 0.3 && ph < 0.55) { const u = (ph - 0.3) / 0.25; ul = V(s * 0.45 * u, -1, 0.55 * u); ll = V(s * 0.6 * u, -1 + 0.4 * u, -0.9 * u); }
    else if (ph >= 0.55 && ph < 0.75) { const u = (ph - 0.55) / 0.2; ul = V(s * 0.45 * (1 - u) + s * 0.25 * Math.sin(u * Math.PI), -1, 0.55 * (1 - u)); ll = V(s * (0.6 * (1 - u) + 0.3 * Math.sin(u * Math.PI)), -1 + 0.4 * (1 - u), -0.9 * (1 - u)); }
    else { ul = V(s * 0.05, -1, 0); ll = V(s * 0.04, -1, -0.05); }
    return [ua, la, ul, ll];
  }
  // galleggio: mani che "spalmano" l'acqua, gambe a pedalata
  const a = Math.sin(TAU * ph + (s > 0 ? 0 : Math.PI));
  const ua = V(s * 0.9, -0.35, 0.35 + 0.25 * a), la = V(s * (0.7 - 0.3 * a), -0.2, 0.7);
  const b = Math.sin(TAU * ph + (s > 0 ? 0 : Math.PI));
  const ul = V(s * 0.12, -1, 0.35 + 0.3 * b), ll = V(s * 0.1, -1, -0.1 - 0.35 * Math.max(0, b));
  return [ua, la, ul, ll];
}
export function applySwimPose(rig, style, ph, w = 1) {
  if (!rig || !rig.ok) return;
  for (const s of [1, -1]) {
    const S = s > 0 ? 'L' : 'R'; const [ua, la, ul, ll] = limbPose(style, ph, s);
    rig.aim('UpperArm.' + S, ua, w); rig.aim('LowerArm.' + S, la, w);
    rig.aim('UpperLeg.' + S, ul, w); rig.aim('LowerLeg.' + S, ll, w);
  }
  // testa: in avanti a pancia in giù (guarda davanti), ferma a dorso; nel crawl respira girandola di lato ogni ciclo
  if (style === 'libero') rig.turn('Neck', V(0, 1, 0), Math.max(0, Math.sin(TAU * ph)) ** 3 * 0.9);
  if (style === 'libero' || style === 'rana' || style === 'sott') rig.turn('Neck', V(1, 0, 0), -0.55 * w);
  rig.fixFeet();
}
// rollio del corpo (crawl e dorso ruotano 35-40° per lato)
export function swimRoll(style, ph) { return style === 'libero' || style === 'dorso' ? Math.sin(TAU * ph) * 0.6 : 0; }
// rana: la velocità pulsa (spinta dopo la calciata, poi scivola)
export function swimSurge(style, ph) { return style === 'rana' || style === 'sott' ? 0.55 + 0.9 * Math.max(0, Math.sin(TAU * (ph - 0.55))) : 1; }

// macchina a stati della profondità con isteresi (Nexus): niente sfarfallio sul bagnasciuga
export function waterState(prev, depth) {
  if (prev === 'swim') return depth < 0.95 ? (depth < 0.3 ? 'walk' : 'wade') : 'swim';
  if (prev === 'wade') return depth > 1.15 ? 'swim' : depth < 0.3 ? 'walk' : 'wade';
  return depth > 1.15 ? 'swim' : depth > 0.35 ? 'wade' : 'walk';
}
