import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { measureNewWalkable, measureV3Walkable, LAYOUT, BOUNDS } from '../js/0.4.0/layout.js';
import * as A from '../js/0.4.0/activities.js';
import { loadState, SAVE_KEY, backupKey, recordFish, buyCar, newState } from '../js/0.4.0/state.js';
import { buildGrid, resolve, resolveWorld } from '../js/0.4.0/collide.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function mem() {
  const m = new Map();
  return {
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { m.set(k, String(v)); },
    removeItem(k) { m.delete(k); },
    key(i) { return [...m.keys()][i]; },
    get length() { return m.size; },
  };
}

test('walkable area is at least 3x v0.3, sea not counted', () => {
  const v3 = measureV3Walkable(2);
  const added = measureNewWalkable(LAYOUT, 2);
  assert.ok(v3 > 20000, v3);
  assert.ok((v3 + added) / v3 >= 3, `v3 ${v3} added ${added}`);
  assert.equal(LAYOUT.buildings.length > 40, true);
  assert.ok(BOUNDS.maxX > 400 && BOUNDS.minX === -94);
});

test('v0.3 entry stays on the 0.3 graph and v0.4 does not import it', () => {
  const old = read('v0.3.0.html');
  const cur = read('v0.4.0.html');
  assert.match(old, /js\/0\.3\.0\/main\.js/);
  assert.match(old, /style\.0\.3\.0\.css/);
  assert.doesNotMatch(old, /0\.4\.0/);
  assert.match(cur, /js\/0\.4\.0\/main\.js/);
  assert.match(cur, /style\.0\.4\.0\.css/);
  assert.match(cur, /id="verStamp">v0\.4\.0</);
  assert.equal(read('index.html').includes('js/0.3.0/main.js'), true);
  for (const file of fs.readdirSync(path.join(root, 'js/0.4.0'))) {
    const text = read('js/0.4.0/' + file);
    assert.equal(text.includes('js/0.3.0'), false, file);
    assert.equal(text.includes('getUserMedia'), false, file);
  }
  const ids = ['btnAct', 'btnMap', 'btnMenu', 'dGas', 'dBrake', 'dLeft', 'dRight', 'dExit', 'gAct', 'gExit', 'confirmYes', 'hintNext'];
  for (const id of ids) assert.match(cur, new RegExp(`id="${id}"`));
});

test('migration keeps v1/v2/v3 progress and refuses a future save', () => {
  const now = 1_700_000_000_000;
  const v3 = {
    version: 3, money: 7, player: { x: 12, z: -20, yaw: 0.4 }, tutorialDone: true,
    garage: { owned: ['vela', 'bruma', 'pode'], selected: 'pode', car: { x: 8, z: 3, yaw: 1 } },
    wardrobe: { owned: ['top_navy', 'bot_charcoal', 'top_linen'], top: 'top_linen', bottom: 'bot_charcoal' },
    grooming: { hairMm: 30, beardMm: 4, beardShape: 'goatee', checkpoint: now },
    records: { fishCaught: 2, bestFishG: 500, bestFishName: 'Cefalo', basketRounds: 1, basketBest: 4, basketMade: 4 },
    inventory: { coffee: 1, candy: 2 },
  };
  const store = mem();
  store.setItem('notes.app', 'keep');
  store.setItem(SAVE_KEY, JSON.stringify(v3));
  const a = loadState(store, now);
  assert.equal(a.status, 'migrated');
  assert.equal(a.state.money, 7);
  assert.equal(a.state.garage.selected, 'pode');
  assert.deepEqual(a.state.garage.owned, ['vela', 'bruma', 'pode']);
  assert.equal(a.state.wardrobe.top, 'top_linen');
  assert.equal(a.state.grooming.hairMm, 30);
  assert.equal(a.state.records.basketBest, 4);
  assert.equal(a.state.jobs.courier, null);
  assert.equal(store.getItem('notes.app'), 'keep');
  assert.equal(store.getItem(backupKey(3)), JSON.stringify(v3));
  const again = loadState(store, now);
  assert.equal(again.status, 'migrated');
  const future = mem();
  future.setItem(SAVE_KEY, JSON.stringify({ ...v3, version: 9 }));
  const fut = loadState(future, now);
  assert.equal(fut.status, 'future');
  assert.equal(fut.readOnly, true);
  assert.equal(future.getItem(SAVE_KEY).includes('"version":9'), true);
});

test('bad money is not a fresh 120, and fish ids must be finite', () => {
  const now = 1_700_000_000_000;
  const store = mem();
  store.setItem(SAVE_KEY, JSON.stringify({ version: 3, money: 'tanti', player: { x: 0, z: 0, yaw: 0 } }));
  const bad = loadState(store, now);
  assert.equal(bad.state.money, 0);
  const state = newState(now);
  assert.equal(recordFish(state, { name: 'Cefalo', grams: 400 }, null), null);
  assert.equal(state.money, 120);
  assert.equal(recordFish(state, { name: 'Cefalo', grams: 400 }, Number.NaN), null);
  assert.equal(recordFish(state, { name: 'Cefalo', grams: 400 }, 5), true);
  assert.equal(recordFish(state, { name: 'Cefalo', grams: 400 }, 5), null);
});

test('activities pay once, cancel pays nothing, photos store no image', () => {
  const now = 1_700_000_000_000;
  const state = newState(now);
  state.money = 20;
  assert.equal(A.courierStart(state).ok, true);
  for (const g of A.COURIER.gates) A.courierGate(state.jobs.courier, g.x, g.z);
  A.courierSample(state.jobs.courier, 50);
  assert.equal(A.courierFinish(state, A.COURIER.drop.x, A.COURIER.drop.z).reason, 'speed');
  assert.equal(state.money, 20);
  assert.equal(A.courierRetry(state), true);
  for (const g of A.COURIER.gates) A.courierGate(state.jobs.courier, g.x, g.z);
  A.courierCancel(state);
  assert.equal(state.jobs.courier, null);
  assert.equal(A.courierStart(state).ok, true);
  for (const g of A.COURIER.gates) A.courierGate(state.jobs.courier, g.x, g.z);
  const paid = A.courierFinish(state, A.COURIER.drop.x, A.COURIER.drop.z);
  assert.equal(paid.reward, 40);
  assert.equal(state.money, 60);
  assert.equal(A.courierStart(state).reason, 'done');
  const photo = A.claimPhoto(state, 'faro', 0.8);
  assert.equal(photo.first, true);
  assert.equal(state.jobs.album.faro.score, 0.8);
  assert.equal(JSON.stringify(state.jobs.album).includes('base64'), false);
  assert.equal(A.claimPhoto(state, 'faro', 0.9).first, false);
  assert.equal(state.money, 60);
  const throws = [{ angle: 0, power: 0.5 }, { angle: 0.2, power: 0.4 }, { angle: -0.1, power: 0.6 }];
  assert.equal(A.claimBocce(state, 9, throws.slice(0, 2)).ok, false);
  assert.equal(A.claimBocce(state, 9, throws).reward, 8);
  assert.equal(A.claimBocce(state, 9, throws).already, true);
  assert.equal(state.money, 68);
  const job = A.newWorkshop();
  assert.equal(A.workshopTurn(job, 1, 180).reason, 'order');
  for (const bolt of job.order) {
    let guard = 0;
    while (job.bolts[bolt] < 180 && guard++ < 8) A.workshopTurn(job, bolt, 30);
  }
  assert.equal(job.done, true);
  assert.equal(A.claimWorkshop(state, 'vela').already, false);
  assert.equal(A.claimWorkshop(state, 'vela').already, true);
  assert.equal(A.buyPaint(state, 'vela', 'mare').price, 15);
  assert.equal(state.money, 53);
  assert.equal(A.buyPaint(state, 'vela', 'mare').price, 0);
  assert.equal(state.money, 53);
  const broke = newState(now); broke.money = 3;
  assert.equal(A.buyPaint(broke, 'vela', 'mare').reason, 'money');
  assert.equal(broke.money, 3);
  assert.equal(buyCar(state, 'bruma').ok, false);
});

test('collision grid matches the full resolver', () => {
  const boxes = [];
  const circles = [];
  for (let i = 0; i < 30; i++) boxes.push({ x0: i * 7, x1: i * 7 + 3, z0: -i * 4, z1: -i * 4 + 2, y0: 0, y1: 4 });
  for (let i = 0; i < 20; i++) circles.push({ x: 20 + i * 3, z: 8 + (i % 5), r: 0.4 });
  const grid = buildGrid(boxes, circles, 16);
  const world = { boxes, circles, grid, liveCircles: [{ x: 4, z: 4, r: 0.5 }] };
  for (let n = 0; n < 40; n++) {
    const p0 = { x: (n * 13) % 80, z: (n * 5) % 40 };
    const full = { ...p0 };
    const near = { ...p0 };
    resolve(boxes, circles.concat(world.liveCircles), full, 0.35, 0);
    resolveWorld(world, near, 0.35, 0);
    assert.ok(Math.hypot(full.x - near.x, full.z - near.z) < 1e-6, n);
  }
});
