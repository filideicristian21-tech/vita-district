import { PLACES } from './places.js';
import { BOUNDS as MAP_BOUNDS } from './layout.js';
import { emptyJobs } from './activities.js';
// VITA DISTRICT — stato di gioco puro (nessun DOM, testabile in Node).
// Tutti i timestamp sono millisecondi Unix UTC (Date.now()).

export const SAVE_KEY = 'vitaDistrict.v1.save';
export const KEY_PREFIX = 'vitaDistrict.';
export const SAVE_VERSION = 4;
export const BACKUP_KEY = 'vitaDistrict.backup.v1'; // backup dei salvataggi v1 (ogni versione ha il suo: backupKey(v))
export const backupKey = (v) => `vitaDistrict.backup.v${v}`;
// Confini del mondo v0.3 (unica definizione: mondo, mappa, validazione)
export const BOUNDS = MAP_BOUNDS;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const CLOCK_REALIGN_MS = 2 * DAY_MS;

// Crescita media realistica (valori orientativi, non medici).
export const GROWTH = {
  hairMmPerDay: 0.40,   // capelli ~1,2 cm al mese
  beardMmPerDay: 0.40,  // barba: ombra in 1-2 giorni, corta in ~1 settimana
  hairMaxMm: 250,
  beardMaxMm: 120,
  offlineCapMs: 60 * DAY_MS, // massimo tempo offline riconosciuto per singolo rientro
};

export const PRICES = { coffee: 5, croissant: 4, beard: 10, hair: 20, combo: 25, gelato: 4 };
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
  { id: 'fioraio', name: 'Fioraio dei Limoni — Colle', reward: 45, line: '«I vasi nuovi! Senza una crepa. Sali spesso quassù, il campanile si vede da tutto il rione.»' },
];

export function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export function newState(now) {
  return {
    version: SAVE_VERSION,
    createdAt: now,
    player: { x: -1.5, z: 8.4, yaw: 0 }, // v0.2: sul marciapiede, visuale libera verso la piazza
    money: START_MONEY,
    inventory: { coffee: 0, croissant: 0, candy: 0, fish: 0, gelato: 0 },
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
    wardrobe: { owned: ['top_navy', 'bot_charcoal'], top: 'top_navy', bottom: 'bot_charcoal' },
    records: { fishCaught: 0, bestFishG: 0, bestFishName: null, basketRounds: 0, basketBest: 0, basketMade: 0 },
    garage: { owned: ['vela'], selected: 'vela', car: { ...CAR_HOME }, paint: {} },
    jobs: emptyJobs(),
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
  if (dt < 0) {
    g.clockAnomaly = true;
    // checkpoint molto nel futuro (es. orologio portato avanti e poi corretto): riallineo per non bloccare la crescita per sempre.
    if (-dt > CLOCK_REALIGN_MS) g.checkpoint = now;
    return 0;
  }
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

const HAIR_IDS = new Set(['keep', 'buzz', 'short', 'medium', 'trim']);
const BEARD_IDS = new Set(['keep', 'shave', 'stubble', 'groomed', 'goatee', 'mustache']);
export function haircutPrice(hairId, beardId) {
  if (!HAIR_IDS.has(hairId) || !BEARD_IDS.has(beardId)) return 0; // stile sconosciuto: niente addebito
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

const SHOP_ITEMS = new Set(['coffee', 'croissant', 'gelato']);
export function buy(state, item) {
  if (!SHOP_ITEMS.has(item)) return { ok: false, reason: 'Articolo non in vendita.' };
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
  if (!s || typeof s !== 'object' || !Number.isInteger(s.version)) return null; // schema intero (1.5 rifiutato)
  if (s.version > SAVE_VERSION || s.version < 1) return null;
  const base = newState(now);
  const out = base;
  const p = s.player || {};
  if (isNum(p.x) && isNum(p.z)) { out.player.x = clamp(p.x, BOUNDS.minX, BOUNDS.maxX); out.player.z = clamp(p.z, BOUNDS.minZ, BOUNDS.maxZ); }
  if (isNum(p.yaw)) out.player.yaw = p.yaw;
  if (Object.prototype.hasOwnProperty.call(s, 'money') && !isNum(s.money)) out.money = 0;
  else if (isNum(s.money)) out.money = Math.max(0, Math.floor(s.money));
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
  if (typeof s.waypoint === 'string' && Object.prototype.hasOwnProperty.call(PLACES, s.waypoint)) out.waypoint = s.waypoint; // solo luoghi esistenti
  out.tutorialDone = !!s.tutorialDone;
  // v2: guardaroba e record (assenti nei salvataggi v1 → valori iniziali)
  const w = s.wardrobe;
  if (w && Array.isArray(w.owned)) {
    const owned = w.owned.filter((id) => ITEM_IDS.has(id));
    for (const d of ['top_navy', 'bot_charcoal']) if (!owned.includes(d)) owned.push(d);
    out.wardrobe.owned = [...new Set(owned)];
    if (owned.includes(w.top) && ITEMS[w.top].slot === 'top') out.wardrobe.top = w.top;
    if (owned.includes(w.bottom) && ITEMS[w.bottom].slot === 'bottom') out.wardrobe.bottom = w.bottom;
  }
  const r = s.records || {};
  for (const k of ['fishCaught', 'bestFishG', 'basketRounds', 'basketBest', 'basketMade']) if (isNum(r[k])) out.records[k] = Math.max(0, Math.floor(r[k]));
  if (typeof r.bestFishName === 'string' && r.bestFishName.length < 40) out.records.bestFishName = r.bestFishName;
  if (s.inventory && isNum(s.inventory.fish)) out.inventory.fish = Math.max(0, Math.floor(s.inventory.fish));
  // v3: garage (assente in v1/v2 → Vela in regalo parcheggiata vicino alla piazza)
  const gr = s.garage;
  if (gr && Array.isArray(gr.owned)) {
    const owned = [...new Set(gr.owned.filter((id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(CARS, id)))];
    if (!owned.includes('vela')) owned.unshift('vela');
    out.garage.owned = owned;
    if (owned.includes(gr.selected)) out.garage.selected = gr.selected;
    const c = gr.car || {};
    if (isNum(c.x) && isNum(c.z) && isNum(c.yaw)) out.garage.car = { x: clamp(c.x, BOUNDS.minX + 2, BOUNDS.maxX - 2), z: clamp(c.z, BOUNDS.minZ + 2, BOUNDS.maxZ - 2), yaw: c.yaw };
    if (gr.paint && typeof gr.paint === 'object') {
      for (const id of Object.keys(CARS)) if (typeof gr.paint[id] === 'string' && /^#[0-9a-fA-F]{6}$/.test(gr.paint[id])) out.garage.paint[id] = gr.paint[id];
    }
  }
  out.jobs = copyJobs(s.jobs);
  if (isNum(s.createdAt)) out.createdAt = s.createdAt;
  if (isNum(s.lastOpId) && s.lastOpId >= 0 && s.lastOpId <= now + DAY_MS) out.lastOpId = s.lastOpId; // id assurdi non bloccano le operazioni
  return out;
}

export function serialize(state) { return JSON.stringify({ ...state, version: SAVE_VERSION }); }

// ---------- v0.2: guardaroba ----------
export const ITEMS = {
  top_navy:     { slot: 'top', name: 'Maglia blu notte', price: 0, color: '#26313f', fabric: 'knit' },
  top_linen:    { slot: 'top', name: 'Camicia di lino bianca', price: 30, color: '#e9e4d8', fabric: 'linen' },
  top_sage:     { slot: 'top', name: 'Polo verde salvia', price: 25, color: '#7d8c6a', fabric: 'pique' },
  top_hoodie:   { slot: 'top', name: 'Felpa grigio melange', price: 35, color: '#8b8d90', fabric: 'knit' },
  top_camel:    { slot: 'top', name: 'Giacca cammello', price: 60, color: '#a47d55', fabric: 'wool' },
  top_terra:    { slot: 'top', name: 'Maglia terracotta', price: 20, color: '#a5573d', fabric: 'knit' },
  bot_charcoal: { slot: 'bottom', name: 'Pantaloni antracite', price: 0, color: '#34373c', fabric: 'twill' },
  bot_denim:    { slot: 'bottom', name: 'Jeans blu', price: 30, color: '#3b5374', fabric: 'denim' },
  bot_sand:     { slot: 'bottom', name: 'Chino sabbia', price: 25, color: '#b5a284', fabric: 'twill' },
  bot_black:    { slot: 'bottom', name: 'Pantaloni neri eleganti', price: 40, color: '#1e1f22', fabric: 'wool' },
};
const ITEM_IDS = new Set(Object.keys(ITEMS));
export function buyItem(state, id) {
  const it = ITEMS[id]; if (!it) return { ok: false, reason: 'Capo sconosciuto.' };
  if (state.wardrobe.owned.includes(id)) return { ok: false, reason: 'Ce l\'hai già.' };
  if (state.money < it.price) return { ok: false, reason: `Crediti insufficienti: servono ${it.price}.` };
  state.money -= it.price; state.wardrobe.owned.push(id); state.wardrobe[it.slot === 'top' ? 'top' : 'bottom'] = id;
  return { ok: true, price: it.price };
}
export function equipItem(state, id) {
  const it = ITEMS[id]; if (!it || !state.wardrobe.owned.includes(id)) return false;
  state.wardrobe[it.slot === 'top' ? 'top' : 'bottom'] = id; return true;
}

// ---------- v0.2: pesca (timing) ----------
export const FISH = [
  { name: 'Cefalo', min: 250, max: 900, pricePerKg: 8 },
  { name: 'Carpa', min: 600, max: 2600, pricePerKg: 5 },
  { name: 'Persico', min: 120, max: 600, pricePerKg: 14 },
  { name: 'Tinca', min: 300, max: 1500, pricePerKg: 9 },
];
// Indicatore che oscilla 0..1..0 con periodo `period` ms: posizione a tempo t (ms dall'inizio).
export function oscillator(tMs, period) { const ph = (tMs % period) / period; return ph < 0.5 ? ph * 2 : 2 - ph * 2; }
// Recupero: 3 colpi nella fascia; ogni colpo valuta la posizione.
export function fishHit(pos, zone) { return pos >= zone[0] && pos <= zone[1]; }
export function rollFish(rnd, quality) { // quality 0..1 (colpi precisi → pesci più grandi)
  const f = FISH[Math.floor(rnd() * FISH.length) % FISH.length];
  const g = Math.round(f.min + (f.max - f.min) * Math.min(1, 0.25 * rnd() + 0.75 * quality));
  return { name: f.name, grams: g, reward: Math.max(2, Math.round(g / 1000 * f.pricePerKg)) };
}
export function recordFish(state, fish, catchId) {
  // v3 (Ledger): premio ricalcolato dal catalogo, mai preso dal chiamante; ogni cattura liquidata una sola volta
  const def = FISH.find((f) => f.name === fish?.name);
  if (!def || !Number.isInteger(fish.grams) || fish.grams < def.min || fish.grams > def.max) return null;
  if (!Number.isFinite(catchId) || catchId <= state.lastOpId) return null;
  state.lastOpId = catchId;
  fish = { ...fish, reward: Math.max(2, Math.round(fish.grams / 1000 * def.pricePerKg)) };
  const r = state.records; r.fishCaught += 1; state.inventory.fish = (state.inventory.fish || 0) + 1;
  state.money += fish.reward;
  if (fish.grams > r.bestFishG) { r.bestFishG = fish.grams; r.bestFishName = fish.name; return true; }
  return false;
}

// ---------- v0.2: basket (mira + potenza) ----------
// aim: -1..1 (0 = centro), power: 0..1 (ideale ~0.62 dalla lunetta). Esito deterministico.
export const BASKET = { idealPower: 0.62, powerTol: 0.07, aimTol: 0.16, shots: 5, perBasket: 2 };
export function evalShot(aim, power) {
  const da = Math.abs(aim), dp = power - BASKET.idealPower;
  if (!Number.isFinite(da) || !Number.isFinite(dp)) return { made: false, kind: 'invalid' };
  if (da <= BASKET.aimTol * 0.4 && Math.abs(dp) <= BASKET.powerTol * 0.45) return { made: true, kind: 'swish' };
  if (da <= BASKET.aimTol && Math.abs(dp) <= BASKET.powerTol) return { made: true, kind: 'rim-in' };
  if (dp < -BASKET.powerTol) return { made: false, kind: 'short' };
  if (dp > BASKET.powerTol) return { made: false, kind: 'long' };
  return { made: false, kind: aim < 0 ? 'left' : 'right' };
}
export function finishBasketRound(state, made, roundId) {
  // v3 (Ledger): conteggio intero 0..tiri, ID obbligatorio e mai riusato
  if (!Number.isInteger(made) || made < 0 || made > BASKET.shots) return { ok: false };
  if (!isNum(roundId) || roundId <= state.lastOpId) return { ok: false };
  const r = state.records; r.basketRounds += 1; r.basketMade += made;
  const best = made > r.basketBest; if (best) r.basketBest = made;
  const reward = made * BASKET.perBasket; state.money += reward;
  if (roundId != null) state.lastOpId = roundId;
  return { ok: true, reward, best };
}

// Storage astratto (localStorage nel browser, mock nei test).
export function loadState(storage, now) {
  let raw = null;
  try { raw = storage.getItem(SAVE_KEY); } catch { return { state: newState(now), status: 'unavailable' }; }
  if (raw == null) return { state: newState(now), status: 'new' };
  let ver = null; try { ver = JSON.parse(raw).version; } catch { /* corrotto */ }
  if (isNum(ver) && ver > SAVE_VERSION) return { state: newState(now), status: 'future', readOnly: true }; // non sovrascrivere un salvataggio più nuovo
  const s = validate(raw, now);
  if (!s) {
    let kept = false;
    try { storage.setItem(KEY_PREFIX + 'corrupt.' + now, raw); kept = storage.getItem(KEY_PREFIX + 'corrupt.' + now) === raw; } catch { kept = false; }
    return { state: newState(now), status: 'corrupt', readOnly: !kept };
  }
  let migrated = false;
  if (ver < SAVE_VERSION) {
    try { if (storage.getItem(backupKey(ver)) == null) storage.setItem(backupKey(ver), raw); } catch { /* ignora */ }
    let ok = false; try { ok = storage.getItem(backupKey(ver)) != null; } catch { /* no */ }
    if (!ok) return { state: s, status: 'migrated-nobackup', credited: settleGrowth(s, now), readOnly: true }; // senza copia di sicurezza non sovrascrivo l'originale
    migrated = true;
  }
  const credited = settleGrowth(s, now);
  return { state: s, status: migrated ? 'migrated' : 'loaded', credited };
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
    for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k && k.startsWith(KEY_PREFIX)) return -1; }
  } catch { return -1; } // -1 = reset NON riuscito
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

// ---------- v0.3: auto (nomi e forme inventati, nessun marchio reale) ----------
// Handling arcade: vMax m/s, acc m/s², brake m/s², steer rad, steerRate rad/s, grip (1/s, recupero laterale), wb passo m.
export const CARS = {
  vela:  { name: 'Vela', kind: 'compatta', price: 0, color: '#7fa7b5', desc: 'Piccola e agile: sterzo pronto, perfetta nei vicoli.',
    vMax: 30, acc: 5.2, brake: 9, rev: 6, steer: 0.62, steerRate: 2.6, grip: 7.5, wb: 2.35, len: 3.6, wid: 1.7, wheelR: 0.29 },
  bruma: { name: 'Bruma', kind: 'SUV', price: 90, color: '#5b6b4a', desc: 'Alta e pesante: accelera piano, frena lunga, non scivola mai.',
    vMax: 37, acc: 3.6, brake: 7, rev: 5, steer: 0.5, steerRate: 1.6, grip: 9, wb: 2.85, len: 4.6, wid: 1.95, wheelR: 0.38 },
  pode:  { name: 'Pode', kind: 'sportiva', price: 150, color: '#244c58', desc: 'Bassa e veloce: scatta forte, in curva veloce il retro scivola.',
    vMax: 52, acc: 7.8, brake: 11, rev: 6, steer: 0.55, steerRate: 2.2, grip: 3.2, wb: 2.55, len: 4.25, wid: 1.88, wheelR: 0.335 },
};
export const CAR_HOME = { x: 8, z: 2.6, yaw: Math.PI / 2 }; // parcheggio di Via del Porto davanti alla piazza
// Al primo aggiornamento da una partita v1/v2, segna l'autosalone se non c'è già una destinazione.
// Non tocca i salvataggi che hanno già un waypoint, e non cancella altre chiavi.
function copyJobs(src) {
  const jobs = emptyJobs();
  if (!src || typeof src !== 'object') return jobs;
  if (Array.isArray(src.paints)) jobs.paints = src.paints.filter((id) => typeof id === 'string' && id.length < 40);
  if (src.checked && typeof src.checked === 'object') for (const id of Object.keys(CARS)) if (src.checked[id] === true) jobs.checked[id] = true;
  if (Array.isArray(src.courierPaid)) jobs.courierPaid = src.courierPaid.filter((id) => id === 'belvedere');
  if (Array.isArray(src.boccePaid)) jobs.boccePaid = src.boccePaid.filter((id) => Number.isFinite(id)).slice(-40); // v0.5 (Ledger): si tengono gli ULTIMI 40 id, non i primi
  if (src.seen5 === true) jobs.seen5 = true;
  if (src.album && typeof src.album === 'object') {
    for (const id of ['faro', 'giardini']) {
      const score = src.album[id] && src.album[id].score;
      if (Number.isFinite(score)) jobs.album[id] = { score: Math.max(0, Math.min(1, score)) };
    }
  }
  if (src.courier && src.courier.id === 'belvedere' && !jobs.courierPaid.includes('belvedere')) {
    jobs.courier = { id: 'belvedere', spoiled: !!src.courier.spoiled, gate: Math.max(0, Math.min(3, src.courier.gate | 0)), strikes: Math.max(0, Math.min(3, src.courier.strikes | 0)) };
  }
  // v0.5 (campi opzionali: un salvataggio v0.4 non li ha, la v0.4 li ignora)
  const sh = src.shells;
  if (sh && typeof sh === 'object' && typeof sh.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sh.day) && Array.isArray(sh.got)) {
    jobs.shells = { day: sh.day, got: [...new Set(sh.got.filter((i) => Number.isInteger(i) && i >= 0 && i < 8))], paid: !!sh.paid };
  }
  if (src.washed && typeof src.washed === 'object') for (const id of Object.keys(CARS)) if (Number.isFinite(src.washed[id])) jobs.washed[id] = src.washed[id];
  return jobs;
}
export function migrationGuide(state, status) {
  if (status !== 'migrated' || !state || state.waypoint) return false;
  state.waypoint = 'dealer';
  return true;
}
export function playerCarMarker(state) {
  const g = state && state.garage;
  const spec = g && CARS[g.selected];
  const c = g && g.car;
  if (!spec || !c || !isNum(c.x) || !isNum(c.z)) return null;
  return { id: 'mycar', name: `La tua ${spec.name}`, short: spec.name, icon: '🚙', x: c.x, z: c.z, color: spec.color, car: true };
}
export function buyCar(state, id) {
  const c = CARS[id]; if (!c || !Object.prototype.hasOwnProperty.call(CARS, id)) return { ok: false, reason: 'Modello sconosciuto.' };
  if (state.garage.owned.includes(id)) return { ok: false, reason: 'È già nel tuo garage.', owned: true };
  if (state.money < c.price) return { ok: false, reason: `Crediti insufficienti: servono ${c.price}.` };
  state.money -= c.price; state.garage.owned.push(id); state.garage.selected = id;
  return { ok: true, price: c.price };
}
export function selectCar(state, id) {
  if (!state.garage.owned.includes(id)) return false;
  state.garage.selected = id; return true;
}
