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
  assert.equal(Life.DAY_LEN_MS, 600000); // 10 minuti: 5 giorno→notte, 5 notte→giorno
  atHour(s, 0, 6); const sunrise = s.life.clock.gameMs; atHour(s, 0, 18); assert.equal(s.life.clock.gameMs - sunrise, 300000);
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
  assert.equal(p.paid, true); assert.equal(p.pay, 9500 + 1900); assert.equal(s.money, 100000 + 11400); assert.equal(Life.gameHour(s.life), 13);
  assert.equal(Life.startShift(s, 'barbiere').ok, false); Life.takeJob(s, 'barista'); assert.equal(Life.startShift(s, 'barista').ok, false, 'niente seconda paga nello stesso giorno');
  // doppio finishTask senza turno: nessun credito
  const m = s.money; assert.equal(Life.finishTask(s, 1).ok, false); assert.equal(s.money, m);
  atHour(s, 1, 21); assert.equal(Life.startShift(s, 'barista').ok, false, 'fuori orario');
  atHour(s, 1, 9); assert.equal(Life.startShift(s, 'barista').ok, true);
  // turno iniziato ieri non si paga oggi
  atHour(s, 2, 9); assert.equal(Life.finishTask(s, 1).ok, false);
  for (let d = 3; d < 6; d++) { atHour(s, d, 9); Life.startShift(s, 'barista'); for (let i = 0; i < 3; i++) Life.finishTask(s, 0); }
  assert.ok(Life.totalShifts(s.life) >= 3); assert.equal(Life.takeJob(s, 'meccanico').ok, true);
  assert.equal(Life.wageFor(s.life, 'barbiere'), 9500);
  // salvataggio manomesso: niente valori che creano crediti
  const c = Life.copyLife({ ...s.life, work: { ...s.life.work, shift: { job: 'barista', day: 5, done: 2, tip: 999 } } });
  assert.ok(c.work.shift.tip <= 0.6 + 1e-9);
  assert.equal(Life.copyLife({ homes: { owned: ['villa', 'xxx'], main: 'villa' } }).homes.owned.join(), 'soffitta,villa');
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
