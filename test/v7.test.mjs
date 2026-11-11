// Test v0.7 (node --test test/*.test.mjs): orologio di gioco, case, lavori, bonus 100.000, schema 5, regole del repo.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as Life from '../js/0.7.0/life.js';
import { loadState, newState, SAVE_KEY, SAVE_VERSION, backupKey, serialize, CARS } from '../js/0.7.0/state.js';
import * as Old from '../js/0.6.0/state.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
function mem() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i], get length() { return m.size; } };
}
const NOW = new Date(2026, 10, 11, 12).getTime();
const v4save = (money) => ({ version: 4, money, player: { x: -160, z: -152, yaw: 0 }, tutorialDone: true, grooming: { hairMm: 30, beardMm: 4, beardShape: 'full', checkpoint: NOW - 1000 },
  garage: { owned: ['vela', 'pode'], selected: 'pode', car: { x: 8, z: 3, yaw: 1 } }, jobs: { paints: [], checked: {}, courierPaid: ['belvedere'], courier: null, album: {}, boccePaid: [4], seen5: true, seen6: true } });
const atHour = (st, day, h) => { st.life.clock.gameMs = day * Life.DAY_LEN_MS + h * Life.HOUR_MS; };

test('nuova partita: 100.000 crediti, soffitta, giorno 1 alle 8:00, schema 5', () => {
  const s = newState(NOW);
  assert.equal(SAVE_VERSION, 5); assert.equal(s.money, 100000);
  assert.deepEqual(s.life.homes.owned, ['soffitta']); assert.equal(s.life.homes.main, 'soffitta'); assert.equal(s.life.grants.start100k, true);
  assert.equal(Life.gameDay(s.life), 0); assert.equal(Life.gameHour(s.life), 8); assert.equal(Life.clockLabel(s.life), 'Giorno 1 · 08:00');
});

test('salvataggio v4 (v0.6): copia identica, bonus una volta sola fino a 100.000, niente perso', () => {
  const orig = JSON.stringify(v4save(7)); const store = mem(); store.setItem(SAVE_KEY, orig);
  const r = loadState(store, NOW);
  assert.equal(r.status, 'migrated'); assert.equal(store.getItem(backupKey(4)), orig); assert.equal(r.topup, 99993); assert.equal(r.state.money, 100000);
  assert.deepEqual(r.state.garage.owned, ['vela', 'pode']); assert.deepEqual(r.state.jobs.courierPaid, ['belvedere']);
  store.setItem(SAVE_KEY, serialize(r.state));
  const r2 = loadState(store, NOW); assert.equal(r2.status, 'loaded'); assert.ok(!r2.topup); assert.equal(r2.state.money, 100000);
  assert.equal(store.getItem(backupKey(4)), orig, 'la copia non viene sovrascritta');
  // il saldo alto non scende mai
  const rich = mem(); rich.setItem(SAVE_KEY, JSON.stringify(v4save(150000))); const r3 = loadState(rich, NOW);
  assert.equal(r3.state.money, 150000); assert.ok(!r3.topup); assert.equal(r3.state.life.grants.start100k, true);
  // il flag sta nello stesso salvataggio dei crediti
  const out = JSON.parse(serialize(r.state)); assert.equal(out.version, 5); assert.equal(out.life.grants.start100k, true);
});

test('se la copia di sicurezza non riesce, sola lettura (mai sovrascrivere)', () => {
  const store = mem(); store.setItem(SAVE_KEY, JSON.stringify(v4save(7)));
  const bad = { ...store, getItem: store.getItem, removeItem: store.removeItem, key: store.key, setItem: (k, v) => { if (k.includes('backup')) throw new Error('pieno'); store.setItem(k, v); } };
  const r = loadState(bad, NOW); assert.equal(r.readOnly, true);
});

test('la v0.6 apre un salvataggio v0.7 in sola lettura (dati v0.7 protetti)', () => {
  const s = newState(NOW); const store = mem(); store.setItem(Old.SAVE_KEY, serialize(s));
  const r = Old.loadState(store, NOW); assert.equal(r.status, 'future'); assert.equal(r.readOnly, true);
});

test('orologio: avanza solo col tick (max 1 s alla volta), mai con Date.now', () => {
  const s = newState(NOW); const a = s.life.clock.gameMs;
  Life.tick(s.life, 16); Life.tick(s.life, 60 * 60 * 1000); Life.tick(s.life, -5); Life.tick(s.life, NaN);
  assert.equal(s.life.clock.gameMs - a, 16 + 1000);
  assert.equal(/Date\.now|new Date/.test(read('js/0.7.0/life.js').replace(/\/\/.*$/gm, '')), false);
  assert.equal(Life.DAY_LEN_MS, 300000); assert.equal(Life.HOUR_MS, 12500); // decisione di Cristian: giornata intera (giorno + notte) = 5 minuti
  atHour(s, 0, 6); const sunrise = s.life.clock.gameMs; atHour(s, 0, 18); assert.equal(s.life.clock.gameMs - sunrise, 150000); // 2,5 minuti dall'alba al tramonto
  atHour(s, 0, 13); assert.equal(Life.daylight(s.life), 1); atHour(s, 0, 23); assert.equal(Life.daylight(s.life), 0); assert.equal(Life.isNight(s.life), true);
});

test('case: prezzi in crediti di gioco, acquisto atomico, villa non comprabile con 299.999', () => {
  const s = newState(NOW);
  const prices = Life.HOUSE_IDS.map((id) => Life.HOUSES[id].price); assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
  assert.equal(Life.HOUSES.villa.price, 300000); assert.equal(Life.HOUSES.soffitta.price, 20000);
  s.money = 299999; const f = Life.buyHouse(s, 'villa'); assert.equal(f.ok, false); assert.equal(s.money, 299999); assert.deepEqual(s.life.homes.owned, ['soffitta']);
  assert.equal(Life.buyHouse(s, 'nope').ok, false); assert.equal(Life.buyHouse(s, '__proto__').ok, false); assert.equal(Life.buyHouse(s, 'soffitta').ok, false);
  s.money = 100000; const ok = Life.buyHouse(s, 'bilocale'); assert.equal(ok.ok, true); assert.equal(s.money, 55000); assert.equal(s.life.homes.main, 'bilocale');
  assert.equal(Life.buyHouse(s, 'bilocale').ok, false); assert.equal(s.money, 55000);
  const sold = Life.sellHouse(s, 'bilocale'); assert.equal(sold.pay, 31500); assert.equal(s.life.homes.main, 'soffitta');
  assert.equal(Life.sellHouse(s, 'soffitta').ok, false, 'l\'unica casa non si vende');
  // le auto stanno nello stesso ordine di grandezza
  assert.ok(CARS.bruma.price >= 5000 && CARS.pode.price > CARS.bruma.price && CARS.pode.price < Life.HOUSES.bilocale.price);
});

test('dormire: solo di notte e solo a casa tua → 7:00 del giorno dopo', () => {
  const s = newState(NOW); atHour(s, 0, 12);
  assert.equal(Life.sleep(s, 'soffitta').ok, false); atHour(s, 0, 22); assert.equal(Life.sleep(s, 'villa').ok, false);
  const r = Life.sleep(s, 'soffitta'); assert.equal(r.ok, true); assert.equal(Life.gameDay(s.life), 1); assert.equal(Life.gameHour(s.life), 7); assert.equal(s.life.homes.wakeAtHome, true);
  atHour(s, 2, 3); Life.sleep(s, 'soffitta'); assert.equal(Life.gameDay(s.life), 2); assert.equal(Life.gameHour(s.life), 7);
});

test('lavori: un turno pagato per giornata di gioco (in tutto), orari, sblocco meccanico', () => {
  const s = newState(NOW); atHour(s, 0, 10);
  assert.equal(Life.startShift(s, 'barbiere').ok, false, 'prima si accetta il lavoro');
  assert.equal(Life.takeJob(s, 'meccanico').ok, false, 'meccanico bloccato');
  assert.equal(Life.takeJob(s, 'barbiere').ok, true);
  assert.equal(Life.startShift(s, 'barbiere').ok, true);
  Life.finishTask(s, 1); Life.finishTask(s, 1); const p = Life.finishTask(s, 1);
  assert.equal(p.paid, true); assert.equal(p.pay, 4750 + 950); assert.equal(s.money, 100000 + 5700); assert.equal(Life.gameHour(s.life), 13);
  assert.equal(Life.startShift(s, 'barbiere').ok, false); Life.takeJob(s, 'barista'); assert.equal(Life.startShift(s, 'barista').ok, false, 'niente seconda paga nello stesso giorno');
  // doppio finishTask senza turno: nessun credito
  const m = s.money; assert.equal(Life.finishTask(s, 1).ok, false); assert.equal(s.money, m);
  atHour(s, 1, 21); assert.equal(Life.startShift(s, 'barista').ok, false, 'fuori orario');
  atHour(s, 1, 9); assert.equal(Life.startShift(s, 'barista').ok, true);
  // turno iniziato ieri non si paga oggi
  atHour(s, 2, 9); assert.equal(Life.finishTask(s, 1).ok, false);
  for (let d = 3; d < 6; d++) { atHour(s, d, 9); Life.startShift(s, 'barista'); for (let i = 0; i < 3; i++) Life.finishTask(s, 0); }
  assert.ok(Life.totalShifts(s.life) >= 3); assert.equal(Life.takeJob(s, 'meccanico').ok, true);
  assert.equal(Life.wageFor(s.life, 'barbiere'), 4750);
  // salvataggio manomesso: niente valori che creano crediti
  const c = Life.copyLife({ ...s.life, work: { ...s.life.work, shift: { job: 'barista', day: 5, done: 2, tip: 999 } } });
  assert.ok(c.work.shift.tip <= 0.6 + 1e-9);
  assert.equal(Life.copyLife({ homes: { owned: ['villa', 'xxx'], main: 'villa' } }).homes.owned.join(), 'soffitta,villa');
});

test('revisioni v0.7: soffitta non vendibile, turno intero entro l\'orario, giorni futuri azzerati, notte 19–5, cifre raggruppate', () => {
  const s = newState(NOW); atHour(s, 0, 10);
  assert.equal(Life.buyHouse(s, 'bilocale').ok, true);
  const m = s.money; assert.equal(Life.sellHouse(s, 'soffitta').ok, false, 'Cranc/Ledger: la soffitta regalata non dà crediti'); assert.equal(s.money, m);
  assert.equal(Life.sellHouse(s, 'bilocale').ok, true);
  Life.takeJob(s, 'barbiere'); atHour(s, 0, 16.5); assert.equal(Life.startShift(s, 'barbiere').can ?? Life.startShift(s, 'barbiere').ok, false, 'Cranc: alle 16:30 un turno di 3 ore sforerebbe le 19');
  atHour(s, 0, 16); assert.equal(Life.startShift(s, 'barbiere').ok, true);
  const c = Life.copyLife({ ...s.life, clock: { gameMs: 2 * Life.DAY_LEN_MS }, work: { ...s.life.work, lastPaidDay: 999, paidDays: { barbiere: 999 }, shift: { job: 'barbiere', day: 999, done: 0, tip: 0 } } });
  assert.equal(c.work.lastPaidDay, 1); assert.equal(c.work.paidDays.barbiere, 1); assert.equal(c.work.shift, null, 'Nexus: niente blocco di giorni futuri');
  atHour(s, 0, 19); assert.equal(Life.isNight(s.life), true); atHour(s, 0, 18.9); assert.equal(Life.isNight(s.life), false); atHour(s, 1, 4.9); assert.equal(Life.isNight(s.life), true);
  assert.equal(Life.fmtCr(9500), '9.500'); assert.equal(Life.fmtCr(100000), '100.000'); assert.equal(Life.fmtCr(300), '300');
  // Ledger B3: un salvataggio v5 senza la chiave money non torna a 100.000
  const k = mem(); const v5 = JSON.parse(serialize(newState(NOW))); delete v5.money; k.setItem(SAVE_KEY, JSON.stringify(v5));
  assert.equal(loadState(k, NOW).state.money, 0);
  // Nexus: le quattro frecce si salvano solo come booleano vero
  const v5b = JSON.parse(serialize(newState(NOW))); v5b.garage.car = { x: 1, z: 2, yaw: 0, hazard: 'si' }; k.setItem(SAVE_KEY, JSON.stringify(v5b));
  assert.equal(loadState(k, NOW).state.garage.car.hazard, undefined); v5b.garage.car.hazard = true; k.setItem(SAVE_KEY, JSON.stringify(v5b));
  assert.equal(loadState(k, NOW).state.garage.car.hazard, true);  // Atlas: il ◆ della casa resta dopo una ricarica; la Salina si apre sul Lungomare
  const v5c = JSON.parse(serialize(newState(NOW))); v5c.waypoint = 'house_villa'; k.setItem(SAVE_KEY, JSON.stringify(v5c));
  assert.equal(loadState(k, NOW).state.waypoint, 'house_villa');
  assert.deepEqual(Life.HOUSES.salina.door, { x: -112.8, z: -134.8 }); assert.equal(Life.HOUSES.salina.face, Math.PI);
});

test('codice spedito v0.7: TEST_HOOK spento, niente rete/microfono, testi onesti, percorsi giusti', () => {
  assert.match(read('js/0.7.0/main.js'), /const TEST_HOOK = false;/);
  const html = read('v0.7.0.html');
  assert.match(html, /js\/0\.7\.0\/main\.js/); assert.match(html, /style\.0\.7\.0\.css/);
  for (const f of fs.readdirSync(path.join(root, 'js/0.7.0'))) {
    const t = read('js/0.7.0/' + f);
    assert.equal(/getUserMedia|fetch\(\s*['"]https?:|XMLHttpRequest|WebSocket|sendBeacon/.test(t), false, f);
    assert.equal(/fotorealistic|photoreal|unreal|\bAAA\b/i.test(t), false, f);
    assert.equal(/js\/0\.[3456]\.0/.test(t), false, f);
  }
  assert.equal(/fotorealistic|photoreal|unreal|\bAAA\b/i.test(html), false);
  assert.match(read('js/0.7.0/main.js'), /senza valore reale/);
});

test('v0.3–v0.6 non toccate rispetto a main', { skip: !fs.existsSync(path.join(root, '.git')) }, () => {
  let base = 'origin/main'; // il main locale può essere rimasto indietro
  try { execSync('git rev-parse --verify origin/main', { cwd: root, stdio: 'ignore' }); } catch { base = 'main'; }
  const out = execSync(`git diff --name-only ${base} -- v0.3.0.html v0.4.0.html v0.5.0.html v0.6.0.html js/0.3.0 js/0.4.0 js/0.5.0 js/0.6.0 style.0.3.0.css style.0.4.0.css style.0.5.0.css style.0.6.0.css`, { cwd: root }).toString().trim();
  assert.equal(out, '', out);
});
