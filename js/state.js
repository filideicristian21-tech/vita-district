// VITA DISTRICT — stato di gioco puro (nessun DOM, testabile in Node).
// Tutti i timestamp sono millisecondi Unix UTC (Date.now()).

export const SAVE_KEY = 'vitaDistrict.v1.save';
export const KEY_PREFIX = 'vitaDistrict.';
export const SAVE_VERSION = 1;
export const DAY_MS = 24 * 60 * 60 * 1000;

// Crescita media realistica (valori orientativi, non medici).
export const GROWTH = {
  hairMmPerDay: 0.40,   // capelli ~1,2 cm al mese
  beardMmPerDay: 0.40,  // barba: ombra in 1-2 giorni, corta in ~1 settimana
  hairMaxMm: 250,
  beardMaxMm: 120,
  offlineCapMs: 60 * DAY_MS, // massimo tempo offline riconosciuto per singolo rientro
};

export const PRICES = { coffee: 5, croissant: 4, beard: 10, hair: 20, combo: 25 };
export const START_MONEY = 120;

export const HAIR_STYLES = [
  { id: 'keep', name: 'Lascia così', targetMm: null },
  { id: 'buzz', name: 'Rasato (3 mm)', targetMm: 3 },
  { id: 'short', name: 'Corto (12 mm)', targetMm: 12 },
  { id: 'medium', name: 'Medio (35 mm)', targetMm: 35 },
  { id: 'trim', name: 'Spuntatina (-20%)', trim: 0.8 },
];
export const BEARD_STYLES = [
  { id: 'keep', name: 'Lascia così', targetMm: null },
  { id: 'shave', name: 'Rasatura completa', targetMm: 0, shape: 'full' },
  { id: 'stubble', name: 'Barba corta (2 mm)', targetMm: 2, shape: 'full' },
  { id: 'groomed', name: 'Barba curata (8 mm)', targetMm: 8, shape: 'full' },
  { id: 'goatee', name: 'Pizzetto (8 mm)', targetMm: 8, shape: 'goatee' },
  { id: 'mustache', name: 'Solo baffi (6 mm)', targetMm: 6, shape: 'mustache' },
];

export const DELIVERY_SPOTS = [
  { id: 'bice', name: 'Signora Bice — portone civico 7', reward: 30, line: '«Finalmente! Erano tre giorni che lo aspettavo. Tieni, una caramella alla menta. Non dirlo a nessuno.»' },
  { id: 'lab', name: 'Laboratorio del vicolo', reward: 30, line: '«Perfetto, proprio il pezzo che mi mancava. Grazie!»' },
  { id: 'condo', name: 'Condominio Nord — citofono 12', reward: 50, line: '«Lascialo pure qui, grazie mille. Bella corsa!»' },
];

export function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export function newState(now) {
  return {
    version: SAVE_VERSION,
    createdAt: now,
    player: { x: 0, z: -3.5, yaw: 0 },
    money: START_MONEY,
    inventory: { coffee: 0, croissant: 0, candy: 0 },
    stats: { deliveries: 0, haircuts: 0, coffees: 0 },
    grooming: {
      hairMm: 18, beardMm: 1.5, beardShape: 'full',
      checkpoint: now,        // ultimo istante già accreditato
      clockAnomaly: false,    // orologio tornato indietro rispetto al checkpoint
      demoDays: 0,            // giorni di DEMO aggiunti (separati)
      demoHairMm: 0, demoBeardMm: 0,
      lastCutAt: null,
    },
    delivery: null,           // {target, reward, stage:'carrying'}
    waypoint: null,           // id luogo
    tutorialDone: false,
    lastOpId: 0,
  };
}

// Liquidazione della crescita reale fino a `now`.
// - Intervallo negativo (orologio indietro): nessuna crescita, checkpoint NON spostato
//   (così l'intervallo non viene mai accreditato due volte), anomalia segnalata.
// - Intervallo oltre il tetto: si accredita solo il tetto, checkpoint = now.
export function settleGrowth(state, now) {
  const g = state.grooming;
  if (!isNum(now)) return 0;
  const dt = now - g.checkpoint;
  if (dt < 0) { g.clockAnomaly = true; return 0; }
  g.clockAnomaly = false;
  const credited = Math.min(dt, GROWTH.offlineCapMs);
  const days = credited / DAY_MS;
  g.hairMm = clamp(g.hairMm + days * GROWTH.hairMmPerDay, 0, GROWTH.hairMaxMm);
  g.beardMm = clamp(g.beardMm + days * GROWTH.beardMmPerDay, 0, GROWTH.beardMaxMm);
  g.checkpoint = now;
  return credited;
}

// Lunghezze mostrate = reali + bonus DEMO (separato e reversibile).
export function visibleLengths(state) {
  const g = state.grooming;
  return {
    hairMm: clamp(g.hairMm + g.demoHairMm, 0, GROWTH.hairMaxMm),
    beardMm: clamp(g.beardMm + g.demoBeardMm, 0, GROWTH.beardMaxMm),
    shape: g.beardShape,
  };
}

export function demoAdvanceDay(state) {
  const g = state.grooming;
  g.demoDays += 1;
  g.demoHairMm += GROWTH.hairMmPerDay;
  g.demoBeardMm += GROWTH.beardMmPerDay;
}
export function demoReset(state) {
  const g = state.grooming;
  g.demoDays = 0; g.demoHairMm = 0; g.demoBeardMm = 0;
}

export function haircutPrice(hairId, beardId) {
  const h = hairId && hairId !== 'keep', b = beardId && beardId !== 'keep';
  if (h && b) return PRICES.combo;
  if (h) return PRICES.hair;
  if (b) return PRICES.beard;
  return 0;
}

// Risultato del taglio su lunghezze date (per anteprima e per conferma).
export function cutResult(lengths, hairId, beardId) {
  const hs = HAIR_STYLES.find((s) => s.id === hairId) || HAIR_STYLES[0];
  const bs = BEARD_STYLES.find((s) => s.id === beardId) || BEARD_STYLES[0];
  let hair = lengths.hairMm, beard = lengths.beardMm, shape = lengths.shape;
  if (hs.trim) hair = hair * hs.trim;
  else if (hs.targetMm != null) hair = Math.min(hair, hs.targetMm); // un taglio non allunga
  if (bs.targetMm != null) { beard = Math.min(beard, bs.targetMm); shape = bs.shape; }
  return { hairMm: hair, beardMm: beard, shape };
}

// Taglio atomico: liquida crescita, verifica, applica costo e look una volta sola.
export function applyHaircut(state, hairId, beardId, now, opId) {
  if (opId != null && opId <= state.lastOpId) return { ok: false, reason: 'Operazione già eseguita.' };
  const price = haircutPrice(hairId, beardId);
  if (price === 0) return { ok: false, reason: 'Nessun servizio scelto.' };
  if (state.money < price) return { ok: false, reason: `Crediti insufficienti: servono ${price}.` };
  settleGrowth(state, now);
  const res = cutResult(visibleLengths(state), hairId, beardId);
  const g = state.grooming;
  // Il bonus demo viene "consumato" dal taglio: il risultato diventa la nuova lunghezza reale.
  g.hairMm = res.hairMm; g.beardMm = res.beardMm; g.beardShape = res.shape;
  g.demoHairMm = 0; g.demoBeardMm = 0; g.demoDays = 0;
  g.lastCutAt = now;
  state.money -= price;
  state.stats.haircuts += 1;
  if (opId != null) state.lastOpId = opId;
  return { ok: true, price };
}

export function buy(state, item) {
  const price = PRICES[item];
  if (!price) return { ok: false, reason: 'Articolo sconosciuto.' };
  if (state.money < price) return { ok: false, reason: `Crediti insufficienti: servono ${price}.` };
  state.money -= price;
  state.inventory[item] = (state.inventory[item] || 0) + 1;
  if (item === 'coffee') state.stats.coffees += 1;
  return { ok: true, price };
}

export function consume(state, item) {
  if (!(state.inventory[item] > 0)) return false;
  state.inventory[item] -= 1; return true;
}

export function acceptDelivery(state, targetId) {
  if (state.delivery) return { ok: false, reason: 'Hai già una consegna in corso.' };
  const spot = DELIVERY_SPOTS.find((s) => s.id === targetId);
  if (!spot) return { ok: false, reason: 'Destinazione sconosciuta.' };
  state.delivery = { target: spot.id, reward: spot.reward, stage: 'carrying' };
  state.waypoint = 'dl_' + spot.id;
  return { ok: true, spot };
}
export function cancelDelivery(state) {
  if (!state.delivery) return false;
  state.delivery = null; if (state.waypoint && state.waypoint.startsWith('dl_')) state.waypoint = null;
  return true;
}
export function completeDelivery(state, targetId) {
  const d = state.delivery;
  if (!d || d.target !== targetId) return { ok: false, reason: 'Nessun pacco per questo indirizzo.' };
  state.money += d.reward;
  state.stats.deliveries += 1;
  if (targetId === 'bice') state.inventory.candy += 1;
  state.delivery = null;
  if (state.waypoint === 'dl_' + targetId) state.waypoint = null;
  return { ok: true, reward: d.reward };
}

// Validazione difensiva di un salvataggio letto da storage.
export function validate(raw, now) {
  let s;
  try { s = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
  if (!s || typeof s !== 'object' || s.version !== SAVE_VERSION) return null;
  const base = newState(now);
  const out = base;
  const p = s.player || {};
  if (isNum(p.x) && isNum(p.z)) { out.player.x = clamp(p.x, -95, 95); out.player.z = clamp(p.z, -75, 75); }
  if (isNum(p.yaw)) out.player.yaw = p.yaw;
  if (isNum(s.money)) out.money = Math.max(0, Math.floor(s.money));
  if (s.inventory) for (const k of Object.keys(out.inventory)) if (isNum(s.inventory[k])) out.inventory[k] = Math.max(0, Math.floor(s.inventory[k]));
  if (s.stats) for (const k of Object.keys(out.stats)) if (isNum(s.stats[k])) out.stats[k] = Math.max(0, Math.floor(s.stats[k]));
  const g = s.grooming || {};
  const og = out.grooming;
  if (isNum(g.hairMm)) og.hairMm = clamp(g.hairMm, 0, GROWTH.hairMaxMm);
  if (isNum(g.beardMm)) og.beardMm = clamp(g.beardMm, 0, GROWTH.beardMaxMm);
  if (['full', 'goatee', 'mustache'].includes(g.beardShape)) og.beardShape = g.beardShape;
  if (isNum(g.checkpoint) && g.checkpoint > 0) og.checkpoint = g.checkpoint;
  og.clockAnomaly = !!g.clockAnomaly;
  if (isNum(g.demoDays)) og.demoDays = Math.max(0, Math.floor(g.demoDays));
  if (isNum(g.demoHairMm)) og.demoHairMm = Math.max(0, g.demoHairMm);
  if (isNum(g.demoBeardMm)) og.demoBeardMm = Math.max(0, g.demoBeardMm);
  if (isNum(g.lastCutAt)) og.lastCutAt = g.lastCutAt;
  if (s.delivery && DELIVERY_SPOTS.some((d) => d.id === s.delivery.target)) {
    const spot = DELIVERY_SPOTS.find((d) => d.id === s.delivery.target);
    out.delivery = { target: spot.id, reward: spot.reward, stage: 'carrying' };
  }
  if (typeof s.waypoint === 'string' && s.waypoint.length < 40) out.waypoint = s.waypoint;
  out.tutorialDone = !!s.tutorialDone;
  if (isNum(s.createdAt)) out.createdAt = s.createdAt;
  if (isNum(s.lastOpId)) out.lastOpId = s.lastOpId;
  return out;
}

export function serialize(state) { return JSON.stringify(state); }

// Storage astratto (localStorage nel browser, mock nei test).
export function loadState(storage, now) {
  let raw = null;
  try { raw = storage.getItem(SAVE_KEY); } catch { return { state: newState(now), status: 'unavailable' }; }
  if (raw == null) return { state: newState(now), status: 'new' };
  const s = validate(raw, now);
  if (!s) return { state: newState(now), status: 'corrupt' };
  const credited = settleGrowth(s, now);
  return { state: s, status: 'loaded', credited };
}
export function saveState(storage, state) {
  try { storage.setItem(SAVE_KEY, serialize(state)); return true; } catch { return false; }
}
// Reset: elimina SOLO le chiavi del progetto, mai storage.clear().
export function resetSave(storage) {
  const keys = [];
  try {
    for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k && k.startsWith(KEY_PREFIX)) keys.push(k); }
    keys.forEach((k) => storage.removeItem(k));
  } catch { return 0; }
  return keys.length;
}

// Stadio visivo della barba (per UI/testi).
export function beardStage(mm) {
  if (mm < 0.3) return 'rasata';
  if (mm < 1.5) return 'ombra';
  if (mm < 4) return 'barba corta';
  if (mm < 12) return 'barba media';
  if (mm < 30) return 'barba folta';
  return 'barba lunga';
}
export function hairStage(mm) {
  if (mm < 5) return 'rasati';
  if (mm < 20) return 'corti';
  if (mm < 60) return 'medi';
  if (mm < 120) return 'lunghi';
  return 'molto lunghi';
}
