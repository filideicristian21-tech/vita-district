// Attività v0.4/v0.5, pure e idempotenti. Nessuna rete, nessun file immagine nel salvataggio.
import { LAYOUT } from './layout.js';

export const PAINTS = [
  { id: 'mare', name: 'Mare', hex: '#2f6f8f', price: 15 },
  { id: 'sabbia', name: 'Sabbia', hex: '#c4a574', price: 15 },
  { id: 'oliva', name: 'Oliva', hex: '#5c6b45', price: 15 },
];
export const BOLT_ORDER = [0, 2, 1, 3]; // 1 → 3 → 2 → 4
export const COURIER_KMH = 36;
export const COURIER_REWARD = 40;
export const BOCCE_REWARD = 8;
// v0.5: la regola dei 36 km/h perdona: 1,5 s di tolleranza per ogni sforamento, il terzo sforamento (non il primo) annulla il premio.
export const COURIER_GRACE_S = 1.5;
export const COURIER_STRIKES = 3;
export const SHELL_REWARD = 12;
export const SHELLS_PER_DAY = 5;
export const WASH_PRICE = 6;
export const WASH_SHINE_MS = 24 * 60 * 60 * 1000;

export function emptyJobs() {
  return { paints: [], checked: {}, courierPaid: [], courier: null, album: {}, boccePaid: [], shells: null, washed: {}, seen5: false };
}

export function newWorkshop() {
  return { bolts: [0, 0, 0, 0], next: 0, order: BOLT_ORDER.slice(), done: false };
}
export function workshopTurn(job, index, deltaDeg) {
  if (!job || job.done) return { ok: false, reason: 'closed' };
  if (!Number.isInteger(index) || index < 0 || index > 3) return { ok: false, reason: 'bolt' };
  if (index !== job.order[job.next]) return { ok: false, reason: 'order', expect: job.order[job.next] };
  const d = Number.isFinite(deltaDeg) ? deltaDeg : 0;
  if (Math.abs(d) >= 4) job.bolts[index] = Math.max(0, Math.min(180, job.bolts[index] + d));
  if (job.bolts[index] >= 180) {
    job.next += 1;
    if (job.next >= 4) job.done = true;
  }
  return { ok: true, progress: job.bolts[index], step: job.next, done: job.done };
}
export function claimWorkshop(state, carId) {
  if (!state.jobs || !state.garage.owned.includes(carId)) return { ok: false, reason: 'car' };
  if (state.jobs.checked[carId]) return { ok: true, already: true };
  state.jobs.checked[carId] = true;
  return { ok: true, already: false };
}

export function buyPaint(state, carId, paintId) {
  const paint = PAINTS.find((p) => p.id === paintId);
  if (!paint) return { ok: false, reason: 'unknown' };
  if (!state.garage.owned.includes(carId)) return { ok: false, reason: 'car' };
  if (!state.garage.paint) state.garage.paint = {};
  const key = carId + ':' + paintId;
  if (state.jobs.paints.includes(key)) {
    state.garage.paint[carId] = paint.hex;
    return { ok: true, price: 0, reused: true };
  }
  if (state.money < paint.price) return { ok: false, reason: 'money' };
  state.money -= paint.price;
  state.jobs.paints.push(key);
  state.garage.paint[carId] = paint.hex;
  return { ok: true, price: paint.price, reused: false };
}

const S = LAYOUT.spots;
export const COURIER = {
  id: 'belvedere',
  name: 'Pacco al Belvedere',
  reward: COURIER_REWARD,
  pickup: { x: S.lia.x, z: S.lia.z, r: 5 },
  drop: { x: S.belvedere.x, z: S.belvedere.z, r: 8 },
  gates: [{ x: 252, z: -86, r: 12 }, { x: 360, z: 0, r: 12 }, { x: 430, z: 36, r: 12 }],
};
export function courierStart(state) {
  if (!state.jobs) return { ok: false, reason: 'save' };
  if (state.delivery) return { ok: false, reason: 'foot' };
  if (state.jobs.courier) return { ok: false, reason: 'active' };
  if (state.jobs.courierPaid.includes(COURIER.id)) return { ok: false, reason: 'done' };
  if (!state.garage.owned.length) return { ok: false, reason: 'car' };
  state.jobs.courier = { id: COURIER.id, spoiled: false, gate: 0, strikes: 0 };
  state.waypoint = 'belvedere';
  return { ok: true };
}
// dt in secondi. Ritorna lo stato del campione: 'ok' | 'over' (sopra il limite, nella tolleranza) | 'strike' (sforamento contato) | 'spoiled'.
export function courierSample(run, kmh, dt = 0) {
  if (!run) return 'ok';
  if (run.spoiled) return 'spoiled';
  if (!Number.isFinite(kmh)) return 'ok';
  run.strikes = Number.isInteger(run.strikes) ? run.strikes : 0;
  if (kmh <= COURIER_KMH) { run.over = 0; run.counted = false; return 'ok'; }
  const step = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.25)) : 0;
  run.over = (run.over || 0) + step;
  if (run.over >= COURIER_GRACE_S && !run.counted) {
    run.counted = true; run.strikes += 1;
    if (run.strikes >= COURIER_STRIKES) { run.spoiled = true; return 'spoiled'; }
    return 'strike';
  }
  return 'over';
}
export function courierGate(run, x, z) {
  if (!run || run.spoiled) return run;
  const g = COURIER.gates[run.gate];
  if (g && Math.hypot(x - g.x, z - g.z) <= g.r) run.gate += 1;
  return run;
}
export function courierFinish(state, x, z) {
  const run = state.jobs && state.jobs.courier;
  if (!run) return { ok: false, reason: 'none' };
  if (state.jobs.courierPaid.includes(run.id)) return { ok: false, reason: 'paid', reward: 0 };
  if (Math.hypot(x - COURIER.drop.x, z - COURIER.drop.z) > COURIER.drop.r) return { ok: false, reason: 'far' };
  if (run.spoiled) return { ok: false, reason: 'speed' }; // v0.5: prima il motivo vero (i cancelli si fermano quando il premio è perso)
  if (run.gate < COURIER.gates.length) return { ok: false, reason: 'route' };
  state.money += COURIER.reward;
  state.jobs.courierPaid.push(run.id);
  state.jobs.courier = null;
  if (state.waypoint === 'belvedere') state.waypoint = null;
  return { ok: true, reward: COURIER.reward };
}
export function courierCancel(state) {
  if (!state.jobs || !state.jobs.courier) return false;
  state.jobs.courier = null;
  if (state.waypoint === 'belvedere') state.waypoint = null;
  return true;
}
export function courierRetry(state) {
  const run = state.jobs && state.jobs.courier;
  if (!run) return false;
  run.spoiled = false; run.gate = 0; run.strikes = 0; run.over = 0; run.counted = false;
  return true;
}

export const PHOTO_TARGETS = {
  faro: { id: 'faro', name: 'Molo del Faro', x: 70, z: -174.5, stand: S.faroView, min: 18, max: 80 },
  giardini: { id: 'giardini', name: 'Laghetto dei Giardini', x: 375, z: -31, stand: { x: 400, z: 2 }, min: 12, max: 55 },
};
export function photoEvaluate(pose, id, blocked) {
  const t = PHOTO_TARGETS[id];
  if (!t || !pose) return { ok: false, reason: 'target' };
  const d = Math.hypot(pose.x - t.x, pose.z - t.z);
  if (d < t.min) return { ok: false, reason: 'close', d };
  if (d > t.max) return { ok: false, reason: 'far', d };
  const want = Math.atan2(t.x - pose.x, t.z - pose.z);
  const dy = Math.atan2(Math.sin(want - pose.yaw), Math.cos(want - pose.yaw));
  if (Math.abs(dy) > 0.5) return { ok: false, reason: 'aim', d };
  if (blocked) return { ok: false, reason: 'blocked', d };
  return { ok: true, score: +(1 - Math.abs(dy) / 0.5).toFixed(3), d };
}
export function claimPhoto(state, id, score) {
  const t = PHOTO_TARGETS[id];
  if (!t || !Number.isFinite(score)) return { ok: false, reason: 'target' };
  const prev = state.jobs.album[id];
  if (!prev) state.jobs.album[id] = { score };
  else if (score > prev.score) prev.score = score;
  return { ok: true, first: !prev, score: state.jobs.album[id].score };
}

export function bocceLand(angle, power) {
  const a = Math.max(-1, Math.min(1, angle || 0));
  const p = Math.max(0, Math.min(1, power || 0));
  return { x: a * (0.8 + p * 2.2), z: 1.5 + p * 12 };
}
export function bocceDistances(lands) {
  return lands.map((p) => Math.hypot(p.x, p.z - 8));
}
export function claimBocce(state, roundId, throws) {
  if (!Number.isFinite(roundId)) return { ok: false, reason: 'id' };
  if (state.jobs.boccePaid.includes(roundId)) return { ok: true, reward: 0, already: true };
  if (!Array.isArray(throws) || throws.length !== 3) return { ok: false, reason: 'throws' };
  if (!throws.every((t) => t && Number.isFinite(t.angle) && Number.isFinite(t.power) && t.power >= 0 && t.power <= 1)) return { ok: false, reason: 'throws' };
  state.money += BOCCE_REWARD;
  state.jobs.boccePaid.push(roundId);
  return { ok: true, reward: BOCCE_REWARD, already: false, distances: bocceDistances(throws.map((t) => bocceLand(t.angle, t.power))) };
}

// ---------- v0.5: conchiglie sulla Spiaggia di Ponente ----------
// Ogni giorno (data locale del dispositivo) 5 conchiglie su 8 posti; raccolte tutte e 5 → 12 crediti finti, una volta al giorno.
export function dayKey(now) { const d = new Date(now); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
export function shellsOfDay(day, total = 8, n = SHELLS_PER_DAY) {
  let h = 2166136261; for (const c of day) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const ids = [...Array(total).keys()];
  for (let i = ids.length - 1; i > 0; i--) { h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; const j = h % (i + 1); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  return ids.slice(0, n).sort((a, b) => a - b);
}
export function shellsToday(state, now) {
  const day = dayKey(now);
  let s = state.jobs.shells;
  if (!s || s.day !== day) { s = state.jobs.shells = { day, got: [], paid: false }; }
  return { ...s, today: shellsOfDay(day) };
}
export function pickShell(state, id, now) {
  const t = shellsToday(state, now); const s = state.jobs.shells;
  if (!t.today.includes(id)) return { ok: false, reason: 'none' };
  if (s.got.includes(id)) return { ok: false, reason: 'got' };
  s.got.push(id);
  let reward = 0;
  if (s.got.length >= SHELLS_PER_DAY && !s.paid) { s.paid = true; reward = SHELL_REWARD; state.money += reward; }
  return { ok: true, count: s.got.length, reward };
}
// ---------- v0.5: autolavaggio (solo estetico: carrozzeria più lucida per un giorno) ----------
export function washCar(state, carId, now, opId) {
  if (!state.garage.owned.includes(carId)) return { ok: false, reason: 'car' };
  if (!Number.isFinite(opId) || opId <= state.lastOpId) return { ok: false, reason: 'op' };
  if (state.money < WASH_PRICE) return { ok: false, reason: 'money' };
  state.money -= WASH_PRICE; state.lastOpId = opId;
  state.jobs.washed[carId] = now;
  return { ok: true, price: WASH_PRICE };
}
export function isShiny(state, carId, now) { const t = state.jobs.washed && state.jobs.washed[carId]; return Number.isFinite(t) && now - t >= 0 && now - t < WASH_SHINE_MS; }
