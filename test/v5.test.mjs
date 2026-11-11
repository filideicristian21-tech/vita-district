// Test v0.5 (node --test test/*.test.mjs). Il gioco gira nel browser; qui si provano logica, salvataggi e regole del repo.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as L4 from '../js/0.4.0/layout.js';
import { LAYOUT as EAST5, measureV3Walkable, measureNewWalkable } from '../js/0.5.0/layout.js';
import { LAYOUT5, FILL_EAST, measureV5Walkable } from '../js/0.5.0/layout5.js';
import * as A from '../js/0.5.0/activities.js';
import { loadState, SAVE_KEY, SAVE_VERSION, backupKey, newState, serialize } from '../js/0.5.0/state.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
function mem() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i], get length() { return m.size; } };
}
const NOW = new Date(2026, 10, 11, 12).getTime();

test('mappa: area camminabile v0.5 ≥ 1,4 × v0.4 (mare e nuovi palazzi esclusi)', () => {
  const v4 = L4.measureV3Walkable(1) + L4.measureNewWalkable(L4.LAYOUT, 1);
  const east5 = measureNewWalkable({ ...EAST5, buildings: [...EAST5.buildings, ...FILL_EAST] }, 1);
  const v5 = measureV3Walkable(1) + east5 + measureV5Walkable(LAYOUT5, 1);
  assert.ok(Math.abs(v4 - 114346) < 3000, `v4 ${v4}`);
  assert.ok(v5 / v4 >= 1.4, `v4 ${v4} v5 ${v5} ×${(v5 / v4).toFixed(2)}`);
  console.log(`# area v0.4 ${v4} m² → v0.5 ${v5} m² (×${(v5 / v4).toFixed(2)})`);
});

test('salvataggi: v1–v4 migrano senza perdere crediti, garage, capelli, vestiti, record', () => {
  const base = {
    money: 77, player: { x: 10, z: 5, yaw: 0 }, tutorialDone: true,
    grooming: { hairMm: 42, beardMm: 6, beardShape: 'goatee', checkpoint: NOW - 1000 },
    records: { fishCaught: 3, bestFishG: 900, bestFishName: 'Orata', basketRounds: 2, basketBest: 5, basketMade: 7 },
  };
  for (const v of [1, 2, 3, 4]) {
    const raw = { ...base, version: v };
    if (v >= 2) raw.wardrobe = { owned: ['top_navy', 'bot_charcoal', 'top_camel'], top: 'top_camel', bottom: 'bot_charcoal' };
    if (v >= 3) raw.garage = { owned: ['vela', 'bruma'], selected: 'bruma', car: { x: 8, z: 3, yaw: 1 } };
    if (v >= 4) raw.jobs = { paints: ['bruma:mare'], checked: { vela: true }, courierPaid: ['belvedere'], courier: null, album: {}, boccePaid: [1, 2] };
    const store = mem(); store.setItem(SAVE_KEY, JSON.stringify(raw)); store.setItem('altra.app', 'x');
    const r = loadState(store, NOW);
    assert.notEqual(r.status, 'fresh', `v${v}`);
    assert.equal(r.state.money, 77, `v${v} money`);
    assert.equal(r.state.grooming.hairMm >= 42, true, `v${v} hair`);
    assert.equal(r.state.records.bestFishG, 900, `v${v} records`);
    if (v >= 2) assert.equal(r.state.wardrobe.top, 'top_camel');
    if (v >= 3) assert.deepEqual(r.state.garage.owned, ['vela', 'bruma']);
    if (v >= 4) { assert.deepEqual(r.state.jobs.courierPaid, ['belvedere']); assert.deepEqual(r.state.jobs.boccePaid, [1, 2]); }
    if (v < 4) assert.equal(store.getItem(backupKey(v)), JSON.stringify(raw), `backup v${v}`);
    assert.equal(store.getItem('altra.app'), 'x');
    const out = JSON.parse(serialize(r.state));
    assert.equal(out.version, SAVE_VERSION);
    assert.equal(SAVE_VERSION, 4); // la v0.4 deve poter riaprire un salvataggio fatto con la v0.5
  }
});

test('Rotta Sicura: 1,5 s sopra i 36 km/h perdonati, 3 sforamenti annullano il premio, Riprova azzera', () => {
  const s = newState(NOW); s.money = 0;
  assert.equal(A.courierStart(s).ok, true);
  const run = s.jobs.courier;
  const feed = (k, secs, dt = 0.1) => { let o; for (let t = 0; t < secs - 1e-9; t += dt) o = A.courierSample(run, k, dt); return o; };
  assert.equal(feed(40, 1.4), 'over'); assert.equal(run.strikes, 0);
  feed(30, 1); feed(40, 1.4); feed(30, 0.2); assert.equal(run.strikes, 0, 'brevi sforamenti separati non contano');
  feed(45, 2); assert.equal(run.strikes, 1);
  feed(45, 5); assert.equal(run.strikes, 1, 'uno sforamento lungo conta una volta');
  feed(30, 0.5); feed(45, 2); assert.equal(run.strikes, 2); assert.equal(run.spoiled, false);
  feed(30, 0.5); feed(45, 2); assert.equal(run.spoiled, true);
  assert.equal(A.courierSample(run, 45, 10), 'spoiled');
  assert.equal(A.courierSample(run, 45, 1e9) !== 'ok', true);
  for (const g of A.COURIER.gates) A.courierGate(run, g.x, g.z);
  assert.equal(A.courierFinish(s, A.COURIER.drop.x, A.COURIER.drop.z).reason, 'speed'); assert.equal(s.money, 0);
  assert.equal(A.courierRetry(s), true);
  assert.equal(s.jobs.courier.strikes, 0); assert.equal(s.jobs.courier.spoiled, false); assert.equal(s.jobs.courier.gate, 0);
  for (const g of A.COURIER.gates) A.courierGate(s.jobs.courier, g.x, g.z);
  assert.equal(A.courierFinish(s, A.COURIER.drop.x, A.COURIER.drop.z).reward, 40); assert.equal(s.money, 40);
  assert.equal(A.courierSample(null, 99, 1), 'ok'); assert.equal(A.courierSample({}, NaN, 1), 'ok');
});

test('conchiglie: 5 al giorno, +12 una sola volta, si ricomincia il giorno dopo', () => {
  const s = newState(NOW); const m0 = s.money;
  const t = A.shellsToday(s, NOW); assert.equal(t.today.length, A.SHELLS_PER_DAY);
  const not = [...Array(8).keys()].find((i) => !t.today.includes(i));
  assert.equal(A.pickShell(s, not, NOW).ok, false);
  let last; for (const id of t.today) { last = A.pickShell(s, id, NOW); assert.equal(A.pickShell(s, id, NOW).reason, 'got'); }
  assert.equal(last.reward, A.SHELL_REWARD); assert.equal(s.money, m0 + 12);
  const tomorrow = NOW + 86400000; const t2 = A.shellsToday(s, tomorrow);
  assert.equal(t2.got.length, 0); assert.equal(t2.paid, false);
  assert.deepEqual(A.shellsOfDay('2026-11-11'), A.shellsOfDay('2026-11-11'));
});

test('lavaggio: 6 crediti, operazione ripetuta non paga due volte, lucido 24 h', () => {
  const s = newState(NOW); const m0 = s.money; const op = s.lastOpId + 1;
  assert.equal(A.washCar(s, 'vela', NOW, op).ok, true); assert.equal(s.money, m0 - A.WASH_PRICE);
  assert.equal(A.washCar(s, 'vela', NOW, op).reason, 'op'); assert.equal(s.money, m0 - 6);
  assert.equal(A.washCar(s, 'bruma', NOW, op + 1).reason, 'car');
  assert.equal(A.isShiny(s, 'vela', NOW + 3600e3), true); assert.equal(A.isShiny(s, 'vela', NOW + 25 * 3600e3), false);
  s.money = 3; assert.equal(A.washCar(s, 'vela', NOW, op + 2).reason, 'money'); assert.equal(s.money, 3);
});

test('codice spedito: TEST_HOOK spento, niente microfono/camera, niente rete, testi onesti', () => {
  assert.match(read('js/0.5.0/main.js'), /const TEST_HOOK = false;/);
  const html = read('v0.5.0.html');
  assert.match(html, /js\/0\.5\.0\/main\.js/); assert.match(html, /style\.0\.5\.0\.css/);
  for (const f of fs.readdirSync(path.join(root, 'js/0.5.0'))) {
    const t = read('js/0.5.0/' + f);
    assert.equal(/getUserMedia|fetch\(\s*['"]https?:|XMLHttpRequest|WebSocket|sendBeacon/.test(t), false, f);
    assert.equal(/fotorealistic|photoreal|unreal|\bAAA\b/i.test(t), false, f);
    assert.equal(t.includes('js/0.4.0') || t.includes('js/0.3.0'), false, f);
  }
  assert.equal(/fotorealistic|photoreal|unreal|\bAAA\b/i.test(html), false);
});

test('v0.3 e v0.4 non toccate rispetto a main', { skip: !fs.existsSync(path.join(root, '.git')) }, () => {
  let base = 'main';
  try { execSync('git rev-parse --verify main', { cwd: root, stdio: 'ignore' }); } catch { base = 'origin/main'; }
  const out = execSync(`git diff --name-only ${base} -- v0.3.0.html v0.4.0.html js/0.3.0 js/0.4.0 style.0.3.0.css style.0.4.0.css`, { cwd: root }).toString().trim();
  assert.equal(out, '', out);
});
