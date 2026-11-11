// Test v0.6 (node --test test/*.test.mjs): mare, fondale, stati in acqua, salvataggi, regole del repo.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SEA, SEABED, seabedY, inSwimX, WALLS5 } from '../js/0.6.0/layout5.js';
import { BOUNDS } from '../js/0.6.0/layout.js';
import { loadState, SAVE_KEY, SAVE_VERSION, backupKey, serialize } from '../js/0.6.0/state.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
function mem() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i], get length() { return m.size; } };
}
const NOW = new Date(2026, 10, 11, 12).getTime();
// rig.js importa three (solo browser): prendo la funzione pura dal sorgente
const waterState = new Function(read('js/0.6.0/rig.js').match(/export function waterState\(prev, depth\) \{[\s\S]*?\n\}/)[0].replace('export ', '') + '; return waterState;')();

test('fondale: scende in modo continuo dalla battigia, mai sotto il piano profondo, acqua a y -0,9', () => {
  assert.equal(SEA.y, -0.9);
  let prev = Infinity;
  for (let z = -178; z >= -262; z -= 0.5) { const y = seabedY(z); assert.ok(Number.isFinite(y)); assert.ok(y <= prev + 1e-9, `z ${z}`); assert.ok(y > -7, `z ${z} y ${y}`); prev = y; }
  assert.ok(seabedY(-178) > SEA.y, 'la battigia è asciutta');
  assert.ok(SEA.y - seabedY(SEA.buoyZ) > 2.2, 'alle boe ci si può tuffare');
  assert.deepEqual(SEABED[0], [-178, -0.75]);
  assert.ok(inSwimX(-170) && !inSwimX(0));
});

test('confini: boe a -230, muro a -231,5, auto ferme a -149,5, niente muro a -178', () => {
  assert.equal(SEA.buoyZ, -230); assert.equal(SEA.wallZ, -231.5); assert.equal(SEA.carZ, -149.5);
  assert.ok(BOUNDS.minZ <= -231.5);
  const wallsAt178 = WALLS5.filter((w) => Math.abs(w.z0 - -178) < 0.01 && Math.abs(w.z1 - -178) < 0.01 && w.x0 < -110 && w.x1 > -240);
  assert.equal(wallsAt178.length, 0, JSON.stringify(wallsAt178));
});

test('stati in acqua con isteresi: niente sfarfallio tra guado e nuoto', () => {
  assert.equal(waterState('walk', 0.2), 'walk'); assert.equal(waterState('walk', 0.5), 'wade'); assert.equal(waterState('wade', 1.1), 'wade');
  assert.equal(waterState('wade', 1.2), 'swim'); assert.equal(waterState('swim', 1.0), 'swim'); assert.equal(waterState('swim', 0.9), 'wade');
  assert.equal(waterState('wade', 0.32), 'wade'); assert.equal(waterState('wade', 0.25), 'walk');
});

test('salvataggi v1–v4 (e v0.5) aprono in v0.6 senza perdite; schema resta 4', () => {
  assert.equal(SAVE_VERSION, 4);
  const v5 = { version: 4, money: 321, player: { x: -160, z: -152, yaw: 0 }, tutorialDone: true, grooming: { hairMm: 30, beardMm: 4, beardShape: 'full', checkpoint: NOW - 1000 },
    garage: { owned: ['vela', 'pode'], selected: 'pode', car: { x: 8, z: 3, yaw: 1 } }, jobs: { paints: [], checked: {}, courierPaid: ['belvedere'], courier: null, album: {}, boccePaid: [4], washed: { pode: NOW - 5000 }, seen5: true } };
  const store = mem(); store.setItem(SAVE_KEY, JSON.stringify(v5));
  const r = loadState(store, NOW);
  assert.equal(r.status, 'loaded'); assert.equal(r.state.money, 321); assert.deepEqual(r.state.garage.owned, ['vela', 'pode']);
  assert.equal(r.state.jobs.washed.pode, NOW - 5000); assert.equal(r.state.jobs.seen5, true);
  const out = JSON.parse(serialize(r.state)); assert.equal(out.version, 4);
  const v3 = { version: 3, money: 9, player: { x: 1, z: 2, yaw: 0 }, grooming: { hairMm: 42, beardMm: 6, beardShape: 'goatee', checkpoint: NOW }, wardrobe: { owned: ['top_navy', 'bot_charcoal'], top: 'top_navy', bottom: 'bot_charcoal' }, garage: { owned: ['vela'], selected: 'vela', car: { x: 8, z: 3, yaw: 1 } } };
  const s3 = mem(); s3.setItem(SAVE_KEY, JSON.stringify(v3)); const r3 = loadState(s3, NOW);
  assert.equal(r3.status, 'migrated'); assert.equal(s3.getItem(backupKey(3)), JSON.stringify(v3)); assert.equal(r3.state.money, 9);
});

test('codice spedito v0.6: TEST_HOOK spento, niente rete/microfono, testi onesti, percorsi giusti', () => {
  assert.match(read('js/0.6.0/main.js'), /const TEST_HOOK = false;/);
  const html = read('v0.6.0.html');
  assert.match(html, /js\/0\.6\.0\/main\.js/); assert.match(html, /style\.0\.6\.0\.css/);
  for (const f of fs.readdirSync(path.join(root, 'js/0.6.0'))) {
    const t = read('js/0.6.0/' + f);
    assert.equal(/getUserMedia|fetch\(\s*['"]https?:|XMLHttpRequest|WebSocket|sendBeacon/.test(t), false, f);
    assert.equal(/fotorealistic|photoreal|unreal|\bAAA\b/i.test(t), false, f);
    assert.equal(/js\/0\.[345]\.0/.test(t), false, f);
  }
  assert.equal(/fotorealistic|photoreal|unreal|\bAAA\b/i.test(html), false);
});

test('v0.3, v0.4 e v0.5 non toccate rispetto a main', { skip: !fs.existsSync(path.join(root, '.git')) }, () => {
  let base = 'main';
  try { execSync('git rev-parse --verify main', { cwd: root, stdio: 'ignore' }); } catch { base = 'origin/main'; }
  const out = execSync(`git diff --name-only ${base} -- v0.3.0.html v0.4.0.html v0.5.0.html js/0.3.0 js/0.4.0 js/0.5.0 style.0.3.0.css style.0.4.0.css style.0.5.0.css`, { cwd: root }).toString().trim();
  assert.equal(out, '', out);
});
