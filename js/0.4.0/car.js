// Guida arcade pura (testabile in Node): niente fisica realistica, solo un modello credibile e stabile.
// Coordinate: x est, z nord; yaw=0 → muso verso +z. Velocità in m/s.
import { resolveWorld } from './collide.js';

export function newCar(spec, x, z, yaw) {
  return { spec, x, z, yaw, vx: 0, vz: 0, steer: 0, gear: 1, wheelRot: 0, stuckT: 0, hit: 0 };
}
export const fwdSpeed = (c) => c.vx * Math.sin(c.yaw) + c.vz * Math.cos(c.yaw);
export const kmh = (c) => Math.round(Math.abs(fwdSpeed(c)) * 3.6);
// cerchi di collisione lungo il corpo (davanti, centro, dietro)
export function carCircles(c) {
  const s = c.spec, r = s.wid * 0.5, k = (s.len * 0.5 - r);
  const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
  return [-k, 0, k].map((o) => ({ x: c.x + fx * o, z: c.z + fz * o, r }));
}

// input: { steer -1..1 (positivo = sinistra), throttle 0..1, brake 0..1, reverse bool }
// world: { boxes, circles, obstacles: [{x,z}] pedoni da non investire }
export function stepCar(c, input, dt, world) {
  const n = Math.max(1, Math.ceil(dt / (1 / 120)));          // substep: max 1/120 s
  const h = dt / n; let hit = 0;
  for (let i = 0; i < n; i++) hit += substep(c, input, h, world);
  c.hit = hit;
  return c;
}
function substep(c, inp, h, world) {
  const s = c.spec; const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
  let v = fwdSpeed(c); let lat = c.vx * fz - c.vz * fx;     // componente laterale (destra positiva)
  // sterzo progressivo, meno angolo ad alta velocità
  const lim = s.steer * (1 - 0.55 * Math.min(1, Math.abs(v) / s.vMax));
  const target = Math.max(-1, Math.min(1, inp.steer || 0)) * lim;
  const ds = target - c.steer, maxD = s.steerRate * h;
  c.steer += Math.max(-maxD, Math.min(maxD, ds));
  // marcia: R solo se chiesta; acceleratore spinge nel verso della marcia
  const dir = inp.reverse ? -1 : 1; c.gear = dir;
  const thr = Math.max(0, Math.min(1, inp.throttle || 0)), brk = Math.max(0, Math.min(1, inp.brake || 0));
  // frenata automatica davanti ai pedoni (non investire): se c'è qualcuno nel cono davanti entro lo spazio di frenata, freno pieno e niente gas
  let auto = 0;
  if (world && world.obstacles) for (const o of world.obstacles) {
    const dx = o.x - c.x, dz = o.z - c.z; const along = (dx * fx + dz * fz) * Math.sign(v || dir), side = Math.abs(dx * fz - dz * fx);
    const stop = (v * v) / (2 * s.brake) + s.len * 0.5 + 1.6;
    if (along > 0 && along < stop && side < s.wid * 0.5 + 0.7) auto = 1;
  }
  let a = 0;
  if (auto) a = -Math.sign(v) * s.brake * 1.2;
  else {
    if (thr > 0) {
      if (v * dir < -0.3) a = dir * s.brake * thr;                    // sto andando nel verso opposto: prima freno
      else if ((dir > 0 && v < s.vMax) || (dir < 0 && v > -s.rev)) a = dir * s.acc * thr * (1 - (Math.abs(v) / (dir > 0 ? s.vMax : s.rev)) ** 3);
    }
    if (brk > 0) a += -Math.sign(v) * s.brake * brk;
  }
  // attrito di rotolamento + aria
  a += -v * 0.05 - Math.sign(v) * 0.25;
  const vNew = v + a * h;
  v = (Math.sign(vNew) !== Math.sign(v) && v !== 0 && (brk > 0 || auto || thr === 0 || v * dir < 0)) ? 0 : vNew; // il freno ferma, non inverte
  if (Math.abs(v) < 0.02 && thr === 0) v = 0;
  // imbardata (modello a bicicletta)
  c.yaw += (v / s.wb) * Math.tan(c.steer) * h;
  // aderenza: la componente laterale si smorza (grip alto = niente scivolata)
  const slide = Math.abs(v) > 12 ? s.grip : s.grip * 2.2;
  lat += -(v / s.wb) * Math.tan(c.steer) * Math.abs(v) * 0.06 * h * (s.grip < 5 ? 1 : 0); // la sportiva allarga il retro in velocità
  lat *= Math.exp(-slide * h);
  const nfx = Math.sin(c.yaw), nfz = Math.cos(c.yaw);
  c.vx = nfx * v + nfz * lat; c.vz = nfz * v - nfx * lat;
  // spostamento e collisioni (cerchi del corpo contro muri/auto/arredi)
  const ox = c.x, oz = c.z;
  c.x += c.vx * h; c.z += c.vz * h;
  let hit = 0;
  if (world) {
    for (const cc of carCircles(c)) {
      const p = { x: cc.x, z: cc.z }; resolveWorld(world, p, cc.r, 0.12);
      const dx = p.x - cc.x, dz = p.z - cc.z;
      if (dx || dz) { c.x += dx; c.z += dz; hit = 1; }
    }
    if (hit) {
      // urto: si perde la velocità verso l'ostacolo (niente rimbalzi pazzi)
      const mx = c.x - ox, mz = c.z - oz; const want = Math.hypot(c.vx, c.vz) * h || 1;
      const keep = Math.min(1, Math.hypot(mx, mz) / want);
      c.vx *= keep * 0.5; c.vz *= keep * 0.5;
    }
  }
  c.wheelRot += (fwdSpeed(c) / (c.spec.wheelR || 0.32)) * h;
  // bloccata: gas premuto ma ferma
  c.stuckT = (thr > 0.5 && Math.abs(fwdSpeed(c)) < 0.4) ? c.stuckT + h : 0;
  return hit;
}

// Punto sicuro per scendere: lato sinistro, destro, dietro, davanti. Deve essere libero per tutto il volume
// del pedone (cerchio 0.35 m) e raggiungibile senza attraversare un muro (raggio dal centro auto).
export function exitSpot(c, world, rayDistance, pedR = 0.35) {
  if (Math.abs(fwdSpeed(c)) > 2) return { ok: false, reason: 'fast' };
  const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), s = c.spec;
  const side = s.wid / 2 + 0.6, end = s.len / 2 + 0.7;
  const cands = [[fz * side, -fx * side], [-fz * side, fx * side], [-fx * end, -fz * end], [fx * end, fz * end]];
  for (const [dx, dz] of cands) {
    const p = { x: c.x + dx, z: c.z + dz };
    if (world.bounds && (p.x < world.bounds.minX + 1 || p.x > world.bounds.maxX - 1 || p.z < world.bounds.minZ + 1 || p.z > world.bounds.maxZ - 1)) continue;
    const q = { ...p }; resolveWorld(world, q, pedR, 0.12);
    if (Math.hypot(q.x - p.x, q.z - p.z) > 1e-4) continue;                  // qualcosa lo occupa
    const L = Math.hypot(dx, dz);
    if (rayDistance && rayDistance({ x: c.x, y: 1.0, z: c.z }, { x: dx / L, y: 0, z: dz / L }, L) < L - 0.05) continue; // muro in mezzo
    if ((world.obstacles || []).some((o) => Math.hypot(o.x - p.x, o.z - p.z) < 0.8)) continue;
    return { ok: true, x: p.x, z: p.z };
  }
  return { ok: false, reason: 'blocked' };
}
