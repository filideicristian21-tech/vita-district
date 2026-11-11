// v0.7 — vita in città: orologio di gioco, case, lavori con stipendio. Logica pura (niente DOM), testabile in Node.
// Crediti di gioco finti, senza valore reale. Nessun Date.now() qui: il tempo di gioco avanza solo mentre si gioca.

export const DAY_LEN_MS = 5 * 60 * 1000;           // decisione di Cristian: una giornata intera (giorno + notte) = 5 minuti reali
export const HOUR_MS = DAY_LEN_MS / 24;             // un'ora di gioco = 12,5 s reali
export const START_CREDITS = 100000;
export const START_HOUR = 8;                        // la partita nuova comincia alle 8:00 del giorno 1
export const MAX_TICK_MS = 1000;                    // un singolo avanzamento non può saltare più di 1 s (niente salti da pausa o background)

// Case: dalla più piccola (la tua all'inizio) alla villa. Indirizzi e agenzia inventati.
// door = punto davanti alla porta (sul marciapiede), face = yaw guardando fuori dalla porta.
export const HOUSES = {
  soffitta: { name: 'Soffitta del Pozzo', kind: 'monolocale', zone: 'Via del Porto', price: 20000, rooms: 1, desc: 'Piccola ma tua: a due passi dalla piazza.',
    door: { x: -34, z: 7.2 }, face: Math.PI },
  bilocale: { name: 'Bilocale Condominio Nord', kind: 'bilocale', zone: 'Laghetto', price: 45000, rooms: 2, desc: 'Due stanze luminose, il laghetto sotto casa.',
    door: { x: 6, z: 39.2 }, face: Math.PI },
  salina: { name: 'Casetta della Salina', kind: 'casa a schiera', zone: 'Contrada Salina', price: 90000, rooms: 3, desc: 'Casetta con cortile, la spiaggia a un minuto.',
    door: { x: -112.8, z: -134.8 }, face: Math.PI }, // v0.7 (Atlas): porta sul Lungomare, non nel vicolo sul retro
  attico: { name: 'Attico dei Fanali', kind: 'attico', zone: 'Colle', price: 160000, rooms: 4, desc: 'Ultimo piano con terrazzo e vista sul campanile.',
    door: { x: 56.6, z: 112.5 }, face: -Math.PI / 2 },
  villa: { name: 'Villa dei Limoni', kind: 'villa', zone: 'Pineta', price: 300000, rooms: 7, desc: 'Loggia ad archi, piscina, cipressi e il rione ai tuoi piedi.',
    door: { x: -234, z: 99.2 }, face: Math.PI },
};
export const HOUSE_IDS = Object.keys(HOUSES);
export const STARTER_HOME = 'soffitta';
export const RESALE = 0.7; // rivendita al 70%: comprare e rivendere non crea crediti

// Lavori: stipendio per giornata di gioco, un turno pagato al giorno (in tutto, quindi anche per lavoro).
export const JOBS = {
  barista:   { name: 'Barista', place: 'Caffè Sottovento', boss: 'Marta', wage: 3750, from: 6, to: 20, icon: '☕' },
  bagnino:   { name: 'Bagnino', place: 'Lido Conchiglia', boss: 'Pina', wage: 4000, from: 9, to: 19, icon: '🛟' },
  barbiere:  { name: 'Barbiere', place: 'Barberia Lama d\'Oro', boss: 'Tonino', wage: 4750, from: 9, to: 19, icon: '💈' },
  meccanico: { name: 'Meccanico', place: 'Officina Bullone Felice', boss: 'Gino', wage: 5500, from: 8, to: 18, icon: '🔧', needShifts: 3 },
};
export const JOB_IDS = Object.keys(JOBS);
export const TASKS_PER_SHIFT = 3;
export const TASK_HOURS = 1; // ogni compito del turno fa passare un'ora di gioco

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
// 9.500 e non 9500 (l'italiano di Intl non raggruppa le 4 cifre): Anchor
export const fmtCr = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export function newLife() {
  return {
    clock: { gameMs: START_HOUR * HOUR_MS },
    grants: { start100k: true },
    homes: { owned: [STARTER_HOME], main: STARTER_HOME, wakeAtHome: false },
    work: { job: null, shifts: {}, paidDays: {}, lastPaidDay: -1, shift: null, payslips: [] },
    firsts: { pay: false, villa: false },
  };
}
// Copia difensiva dal salvataggio: solo id noti, numeri finiti, mai valori che creano crediti.
export function copyLife(src) {
  const L = newLife();
  if (!src || typeof src !== 'object') { L.grants.start100k = false; return L; } // salvataggio vecchio: il bonus va ancora dato
  const c = src.clock; if (c && isNum(c.gameMs) && c.gameMs >= 0) L.clock.gameMs = Math.floor(c.gameMs);
  L.grants.start100k = !!(src.grants && src.grants.start100k === true);
  const h = src.homes;
  if (h && Array.isArray(h.owned)) {
    const owned = [...new Set(h.owned.filter((id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(HOUSES, id)))];
    if (!owned.includes(STARTER_HOME)) owned.unshift(STARTER_HOME);
    L.homes.owned = owned;
    if (owned.includes(h.main)) L.homes.main = h.main;
    L.homes.wakeAtHome = h.wakeAtHome === true;
  }
  const w = src.work;
  if (w && typeof w === 'object') {
    if (JOB_IDS.includes(w.job)) L.work.job = w.job;
    for (const id of JOB_IDS) {
      if (w.shifts && Number.isInteger(w.shifts[id]) && w.shifts[id] >= 0) L.work.shifts[id] = w.shifts[id];
      if (w.paidDays && Number.isInteger(w.paidDays[id])) L.work.paidDays[id] = w.paidDays[id];
    }
    if (Number.isInteger(w.lastPaidDay)) L.work.lastPaidDay = w.lastPaidDay;
    const s = w.shift;
    if (s && JOB_IDS.includes(s.job) && Number.isInteger(s.day) && Number.isInteger(s.done) && s.done >= 0 && s.done < TASKS_PER_SHIFT)
      L.work.shift = { job: s.job, day: s.day, done: s.done, tip: isNum(s.tip) ? Math.max(0, Math.min(0.2 * TASKS_PER_SHIFT, s.tip)) : 0 };
    if (Array.isArray(w.payslips)) L.work.payslips = w.payslips.filter((p) => p && JOB_IDS.includes(p.job) && Number.isInteger(p.day) && isNum(p.pay)).slice(-10);
  }
  if (src.firsts && typeof src.firsts === 'object') { L.firsts.pay = src.firsts.pay === true; L.firsts.villa = src.firsts.villa === true; }
  // v0.7 (Nexus): giorni pagati «nel futuro» (orologio manomesso o azzerato) non devono bloccare i turni per giorni
  const today = Math.floor(L.clock.gameMs / DAY_LEN_MS);
  if (L.work.lastPaidDay > today) L.work.lastPaidDay = today - 1;
  for (const id of JOB_IDS) if ((L.work.paidDays[id] ?? -1) > today) L.work.paidDays[id] = today - 1;
  if (L.work.shift && L.work.shift.day > today) L.work.shift = null;
  return L;
}

// ---------- orologio ----------
export const gameDay = (life) => Math.floor(life.clock.gameMs / DAY_LEN_MS);          // 0 = giorno 1
export const gameHour = (life) => ((life.clock.gameMs % DAY_LEN_MS) / HOUR_MS);       // 0..24
export function clockLabel(life) { const h = gameHour(life); const hh = Math.floor(h), mm = Math.floor((h - hh) * 60 / 10) * 10; return `Giorno ${gameDay(life) + 1} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; }
export function tick(life, dtMs) { if (!isNum(dtMs) || dtMs <= 0) return; life.clock.gameMs += Math.min(dtMs, MAX_TICK_MS); }
// luce del giorno 0..1 (alba 5-7, tramonto 17-19): sole su dalle 6 alle 18
export function daylight(life) { const h = gameHour(life); const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }; return sm(5.5, 8, h) * (1 - sm(16.5, 19, h)); } // v0.7 (Study): alba un po' più tarda
export const isNight = (life) => { const h = gameHour(life); return h >= 19 || h < 5; }; // v0.7 (Forge): coincide con la luce (daylight = 0)

// ---------- crediti iniziali ----------
// Salvataggi vecchi: una volta sola il saldo sale ad ALMENO 100.000 (mai al ribasso). Il flag è nello stesso salvataggio dei crediti.
export function grantStart(state) {
  if (state.life.grants.start100k) return 0;
  const before = state.money; state.money = Math.max(state.money, START_CREDITS); state.life.grants.start100k = true;
  return state.money - before;
}

// ---------- case ----------
export function buyHouse(state, id) {
  const h = HOUSES[id]; if (!h || !Object.prototype.hasOwnProperty.call(HOUSES, id)) return { ok: false, reason: 'Casa sconosciuta.' };
  const H = state.life.homes;
  if (H.owned.includes(id)) return { ok: false, reason: 'È già tua.', owned: true };
  if (state.money < h.price) return { ok: false, reason: `Mancano ${fmtCr(h.price - state.money)} crediti.`, missing: h.price - state.money };
  state.money -= h.price; H.owned.push(id); H.main = id; H.wakeAtHome = false;
  return { ok: true, price: h.price };
}
export function sellHouse(state, id) {
  const H = state.life.homes;
  if (!H.owned.includes(id)) return { ok: false, reason: 'Non è tua.' };
  if (id === STARTER_HOME) return { ok: false, reason: 'La soffitta iniziale non si vende: te l\'hanno regalata.' }; // v0.7 (Cranc/Ledger): niente crediti dal nulla
  if (H.owned.length < 2) return { ok: false, reason: 'È la tua unica casa: tienila.' };
  const pay = Math.round(HOUSES[id].price * RESALE); H.owned = H.owned.filter((x) => x !== id); state.money += pay;
  if (H.main === id) H.main = H.owned.reduce((a, b) => (HOUSES[b].price > HOUSES[a].price ? b : a), H.owned[0]);
  return { ok: true, pay };
}
export function setMainHome(state, id) { const H = state.life.homes; if (!H.owned.includes(id)) return false; H.main = id; return true; }
export function homeSpot(state) { const h = HOUSES[state.life.homes.main] || HOUSES[STARTER_HOME]; return { x: h.door.x + Math.sin(h.face) * 1.2, z: h.door.z + Math.cos(h.face) * 1.2, yaw: h.face }; }
// Dormire: solo di sera/notte e solo a casa tua. Ti svegli alle 7:00 del giorno dopo (o di oggi se è già dopo mezzanotte).
export function sleep(state, houseId) {
  const L = state.life; if (!L.homes.owned.includes(houseId)) return { ok: false, reason: 'Puoi dormire solo a casa tua.' };
  if (!isNight(L)) return { ok: false, reason: 'È ancora giorno: si va a letto dalle 19:00.' };
  const day = gameDay(L) + (gameHour(L) >= 19 ? 1 : 0);
  L.clock.gameMs = day * DAY_LEN_MS + 7 * HOUR_MS; L.homes.main = houseId; L.homes.wakeAtHome = true;
  if (L.work.shift && L.work.shift.day !== day) L.work.shift = null; // il turno lasciato a metà non si porta al giorno dopo
  return { ok: true, day };
}

// ---------- lavori ----------
export function totalShifts(life) { return Object.values(life.work.shifts).reduce((a, b) => a + b, 0); }
export function canTake(life, id) { const j = JOBS[id]; if (!j) return { ok: false, reason: 'Lavoro sconosciuto.' }; const need = j.needShifts || 0; const have = totalShifts(life) - (life.work.shifts[id] || 0);
  return need && have < need ? { ok: false, reason: `Si sblocca dopo ${need} turni in un altro lavoro (${have}/${need}).` } : { ok: true }; }
export function takeJob(state, id) {
  const L = state.life; const c = canTake(L, id); if (!c.ok) return c;
  if (L.work.job === id) return { ok: false, reason: 'È già il tuo lavoro.' };
  L.work.job = id; if (L.work.shift && L.work.shift.job !== id) L.work.shift = null; return { ok: true };
}
export function quitJob(state) { state.life.work.job = null; state.life.work.shift = null; }
export function wageFor(life, id) { const n = life.work.shifts[id] || 0; const lvl = n >= 12 ? 1.2 : n >= 5 ? 1.1 : 1; return Math.round(JOBS[id].wage * lvl); }
export function shiftStatus(state, id) {
  const L = state.life, j = JOBS[id], day = gameDay(L), h = gameHour(L);
  if (L.work.job !== id) return { can: false, reason: `Prima accetta il lavoro da ${j.name.toLowerCase()}.` };
  if (L.work.lastPaidDay >= day || (L.work.paidDays[id] ?? -1) >= day) return { can: false, done: true, reason: 'Per oggi hai già fatto il tuo turno. Torna domani.' };
  if (h < j.from || h >= j.to) return { can: false, reason: `Orario: dalle ${j.from}:00 alle ${j.to}:00. Ora sono le ${Math.floor(h)}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}.` };
  if (h + TASKS_PER_SHIFT * TASK_HOURS > j.to + 1e-9) return { can: false, reason: `Troppo tardi per un turno intero (3 ore): l'ultimo comincia alle ${j.to - TASKS_PER_SHIFT * TASK_HOURS}:00.` }; // v0.7 (Cranc)
  return { can: true };
}
export function startShift(state, id) {
  const st = shiftStatus(state, id); if (!st.can) return { ok: false, reason: st.reason };
  const L = state.life, day = gameDay(L);
  if (!L.work.shift || L.work.shift.job !== id || L.work.shift.day !== day) L.work.shift = { job: id, day, done: 0, tip: 0 };
  return { ok: true, shift: L.work.shift };
}
// Un compito fatto: quality 0..1 dà la mancia (fino al 20% a compito). Ogni compito fa passare un'ora di gioco.
// Al terzo compito si paga, una volta sola per giornata (controllo e scrittura nella stessa funzione).
export function finishTask(state, quality) {
  const L = state.life, s = L.work.shift; if (!s) return { ok: false, reason: 'Nessun turno in corso.' };
  const day = gameDay(L); if (s.day !== day) { L.work.shift = null; return { ok: false, reason: 'Il turno era di ieri: ricomincia.' }; }
  const q = isNum(quality) ? Math.max(0, Math.min(1, quality)) : 0;
  s.done += 1; s.tip += 0.2 * q; // mancia media fino al 20%
  L.clock.gameMs += TASK_HOURS * HOUR_MS;
  if (s.done < TASKS_PER_SHIFT) return { ok: true, done: s.done };
  return payShift(state, s, day);
}
function payShift(state, s, day) {
  const L = state.life; const id = s.job;
  if (L.work.lastPaidDay >= day || (L.work.paidDays[id] ?? -1) >= day) { L.work.shift = null; return { ok: false, reason: 'Già pagato oggi.' }; }
  const base = wageFor(L, id); const tip = Math.round(base * Math.min(0.2, s.tip / TASKS_PER_SHIFT));
  const pay = base + tip;
  state.money += pay; L.work.paidDays[id] = day; L.work.lastPaidDay = day; L.work.shifts[id] = (L.work.shifts[id] || 0) + 1; L.work.shift = null;
  L.work.payslips = [...L.work.payslips, { job: id, day, pay, base, tip }].slice(-10);
  const first = !L.firsts.pay; L.firsts.pay = true;
  return { ok: true, paid: true, pay, base, tip, day, first };
}

// Agenzia immobiliare (nome inventato) e lotto della villa (dentro la Pineta, alberi tolti lì)
export const AGENCY = { name: 'Immobiliare Faro & Mare', x: -20, z: -7.2, face: 0 };
export const VILLA_LOT = { x0: -246, x1: -214, z0: 90, z1: 118 };
