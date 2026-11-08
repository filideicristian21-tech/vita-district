// Regressione: una visita con i file della v0.1 in cache non deve mescolarsi con la v0.3.
// GitHub Pages risponde Cache-Control: max-age=600 e la query string non è una chiave di cache distinta.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const V1 = '5933ab0';
const LEGACY_JS = ['avatar.js', 'main.js', 'map.js', 'places.js', 'state.js', 'world.js'];

function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function gitText(spec) {
  return execFileSync('git', ['show', spec], { cwd: root, encoding: 'utf8' });
}

test('entry pages share one versioned graph and do not name v0.1 files', () => {
  const index = read('index.html');
  assert.equal(index, read('v0.3.0.html'));
  assert.equal(read('style.css'), read('style.0.3.0.css'));
  assert.match(index, /id="verStamp">v0\.3\.0</);
  assert.match(index, /id="buildStamp">v0\.3\.0</);
  assert.match(index, /href="\.\/style\.0\.3\.0\.css"/);
  assert.match(index, /src="\.\/js\/0\.3\.0\/main\.js"/);
  assert.doesNotMatch(index, /href="\.\/style\.css"/);
  assert.doesNotMatch(index, /src="\.\/js\/main\.js"/);
  assert.equal(fs.existsSync(path.join(root, 'js/main.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.nojekyll')), true);

  const seen = new Set();
  const walk = (rel) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    const text = read(rel);
    for (const spec of text.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const target = spec[1];
      if (target === 'three' || target.startsWith('three/')) continue;
      assert.equal(target.startsWith('./'), true, `${rel} imports ${target}`);
      const next = path.posix.normalize(path.posix.join(path.posix.dirname(rel), target));
      assert.equal(next.startsWith('js/0.3.0/'), true, next);
      assert.equal(LEGACY_JS.includes(path.posix.basename(next)) && !next.includes('/0.3.0/'), false);
      walk(next);
    }
  };
  walk('js/0.3.0/main.js');
  for (const name of ['state.js', 'world.js', 'car.js', 'dialog.js', 'map.js', 'places.js']) {
    assert.equal(seen.has(`js/0.3.0/${name}`), true, name);
  }
  const main = read('js/0.3.0/main.js');
  assert.match(main, /Prototipo v0\.3\.0 \(20261108-0035\)/);
  assert.match(main, /migrationGuide/);
  assert.match(read('js/0.3.0/map.js'), /playerCarMarker/);
  assert.match(read('js/0.3.0/map.js'), /'dealer'/);
});

test('v1 save migrates in place: credits stay, Vela is marked, other keys stay', async () => {
  const { loadState, migrationGuide, playerCarMarker, SAVE_KEY, backupKey, CAR_HOME, resetSave } = await import('../js/0.3.0/state.js');
  const now = 1_700_000_000_000;
  const raw = JSON.stringify({
    version: 1,
    money: 87,
    player: { x: -67, z: 14, yaw: 1 },
    tutorialDone: true,
    inventory: { coffee: 1, croissant: 0, candy: 2 },
    grooming: { hairMm: 22, beardMm: 3, beardShape: 'full', checkpoint: now - 5000 },
  });
  const store = memory();
  store.setItem('notes.app', 'non toccare');
  store.setItem(SAVE_KEY, raw);
  const loaded = loadState(store, now);
  assert.equal(loaded.status, 'migrated');
  assert.equal(loaded.state.money, 87);
  assert.equal(loaded.state.player.x, -67);
  assert.equal(loaded.state.player.z, 14);
  assert.equal(loaded.state.inventory.coffee, 1);
  assert.equal(loaded.state.inventory.candy, 2);
  assert.deepEqual(loaded.state.garage.owned, ['vela']);
  assert.equal(loaded.state.garage.selected, 'vela');
  assert.equal(loaded.state.garage.car.x, CAR_HOME.x);
  assert.equal(loaded.state.garage.car.z, CAR_HOME.z);
  assert.equal(loaded.state.waypoint, null);
  assert.equal(store.getItem('notes.app'), 'non toccare');
  assert.equal(store.getItem(backupKey(1)), raw);
  assert.equal(migrationGuide(loaded.state, loaded.status), true);
  assert.equal(loaded.state.waypoint, 'dealer');
  assert.equal(migrationGuide(loaded.state, loaded.status), false);
  const marker = playerCarMarker(loaded.state);
  assert.equal(marker.car, true);
  assert.equal(marker.short, 'Vela');
  assert.equal(marker.x, CAR_HOME.x);
  assert.equal(marker.z, CAR_HOME.z);
  assert.equal(typeof resetSave, 'function');
  assert.equal(store.getItem('notes.app'), 'non toccare');

  const keep = memory();
  keep.setItem(SAVE_KEY, JSON.stringify({ version: 1, money: 40, waypoint: 'cafe', player: { x: 1, z: 2, yaw: 0 } }));
  const again = loadState(keep, now);
  assert.equal(again.state.waypoint, 'cafe');
  assert.equal(migrationGuide(again.state, again.status), false);
  assert.equal(again.state.waypoint, 'cafe');
  assert.equal(again.state.money, 40);
  assert.equal(playerCarMarker({}), null);
});

test('cached v0.1 URLs cannot satisfy the v0.3 page', { skip: fs.existsSync('/usr/local/bin/google-chrome') ? false : 'Chrome non installato: il controllo del grafo resta coperto dal test sui file' }, async () => {
  const v1State = gitText(`${V1}:js/state.js`);
  assert.match(v1State, /SAVE_VERSION = 1/);
  assert.doesNotMatch(v1State, /Autosalone|garage/);
  const server = await startMixServer();
  try {
    const legacy = await server.get('/js/state.js?v=0.3.0');
    assert.match(legacy, /SAVE_VERSION = 1/);
    const current = await server.get('/js/0.3.0/state.js?ignored=1');
    assert.match(current, /SAVE_VERSION = 3/);
    assert.match(current, /migrationGuide/);
    const chrome = await runChrome(server.origin);
    assert.equal(chrome.stamp, 'v0.3.0');
    assert.equal(chrome.build, 'v0.3.0');
    assert.equal(chrome.registrations, 0);
    assert.equal(chrome.module.endsWith('/js/0.3.0/main.js'), true);
    const paths = chrome.urls.map((u) => new URL(u).pathname);
    for (const name of LEGACY_JS) assert.equal(paths.includes(`/js/${name}`), false, name);
    assert.equal(paths.includes('/style.css'), false);
    assert.equal(paths.includes('/js/0.3.0/main.js'), true);
    assert.equal(paths.includes('/js/0.3.0/state.js'), true);
    assert.equal(paths.includes('/js/0.3.0/car.js'), true);
    assert.equal(paths.includes('/style.0.3.0.css'), true);
    assert.match(chrome.bodies['/js/0.3.0/main.js'], /Prototipo v0\.3\.0/);
    assert.match(chrome.bodies['/js/0.3.0/state.js'], /SAVE_VERSION = 3/);
    assert.match(chrome.seedBody, /SAVE_VERSION = 1/);
  } finally {
    await server.close();
  }
});

function memory() {
  const m = new Map();
  return {
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { m.set(k, String(v)); },
    removeItem(k) { m.delete(k); },
    key(i) { return [...m.keys()][i]; },
    get length() { return m.size; },
  };
}

function startMixServer() {
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.hdr': 'application/octet-stream', '.glb': 'model/gltf-binary', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8' };
  const legacy = new Map(LEGACY_JS.map((name) => [`/js/${name}`, gitText(`${V1}:js/${name}`)]));
  legacy.set('/style.css', gitText(`${V1}:style.css`));
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.includes('..')) { res.writeHead(400); res.end('bad path'); return; }
    const send = (body, type) => {
      res.writeHead(200, { 'content-type': type, 'cache-control': 'max-age=600', 'content-length': Buffer.byteLength(body) });
      res.end(body);
    };
    if (pathname === '/seed.html') {
      send(`<!doctype html><script type="importmap">{"imports":{"three":"./vendor/three.module.min.js","three/addons/":"./vendor/jsm/"}}</script><script type="module" src="./js/main.js"></script>`, types['.html']);
      return;
    }
    if (legacy.has(pathname)) { send(legacy.get(pathname), pathname.endsWith('.css') ? types['.css'] : types['.js']); return; }
    if (pathname === '/') pathname = '/index.html';
    const file = path.join(root, pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('missing'); return; }
    send(fs.readFileSync(file), types[path.extname(file)] || 'application/octet-stream');
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const origin = `http://127.0.0.1:${port}`;
      resolve({
        origin,
        get: (p) => fetch(origin + p).then((r) => r.text()),
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

async function runChrome(origin) {
  const profile = fs.mkdtempSync('/tmp/vd-chrome-');
  const chrome = spawn('/usr/local/bin/google-chrome', [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    '--no-first-run', '--disable-background-networking', '--remote-debugging-port=0',
    `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  chrome.stderr.on('data', (b) => { log += b.toString(); });
  chrome.stdout.on('data', (b) => { log += b.toString(); });
  try {
    const port = await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('chrome did not open a devtools port\n' + log)), 15000);
      const look = () => {
        const m = log.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
        if (m) { clearTimeout(t); resolve(m[1]); } else setTimeout(look, 50);
      };
      look();
    });
    const version = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json());
    const browser = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { browser.addEventListener('open', resolve); browser.addEventListener('error', reject); });
    let seq = 0;
    const pending = new Map();
    const sessions = new Map();
    browser.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method === 'Target.attachedToTarget') {
        sessions.set(msg.params.sessionId, msg.params.sessionId);
      }
    });
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      browser.send(JSON.stringify({ id, method, params, sessionId }));
    });
    const target = await send('Target.createTarget', { url: 'about:blank' });
    const attached = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    const sessionId = attached.sessionId;
    const requests = [];
    const bodiesWanted = new Map();
    browser.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.sessionId !== sessionId || !msg.method) return;
      if (msg.method === 'Network.requestWillBeSent') requests.push(msg.params.request.url);
      if (msg.method === 'Network.responseReceived') {
        const p = new URL(msg.params.response.url).pathname;
        if (p === '/js/0.3.0/main.js' || p === '/js/0.3.0/state.js' || p === '/js/state.js') bodiesWanted.set(msg.params.requestId, p);
      }
    });
    await send('Network.enable', {}, sessionId);
    await send('Page.enable', {}, sessionId);
    await send('Network.setCacheDisabled', { cacheDisabled: false }, sessionId);
    const bodies = {};
    const settle = async (url) => {
      const started = requests.length;
      await send('Page.navigate', { url }, sessionId);
      const deadline = Date.now() + 12000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 150));
        if (requests.length > started && requests.slice(started).some((u) => u.includes(url.includes('seed') ? '/js/state.js' : '/js/0.3.0/state.js'))) {
          await new Promise((r) => setTimeout(r, 400));
          break;
        }
      }
      for (const [requestId, pathname] of bodiesWanted) {
        if (bodies[pathname]) continue;
        try {
          const got = await send('Network.getResponseBody', { requestId }, sessionId);
          bodies[pathname] = got.body;
        } catch { /* body not available yet */ }
      }
    };
    const before = requests.length;
    await settle(origin + '/seed.html');
    const seedBody = bodies['/js/state.js'];
    const mark = requests.length;
    await settle(origin + '/v0.3.0.html');
    const info = await send('Runtime.evaluate', {
      expression: `({stamp: document.querySelector('#verStamp')?.textContent || '', build: document.querySelector('#buildStamp')?.textContent || '', module: document.querySelector('script[type=module]')?.src || '', registrations: 0})`,
      returnByValue: true,
    }, sessionId);
    const regs = await send('Runtime.evaluate', {
      expression: `navigator.serviceWorker.getRegistrations().then(r => r.length)`,
      awaitPromise: true,
      returnByValue: true,
    }, sessionId);
    browser.close();
    return {
      urls: requests.slice(mark),
      bodies,
      seedBody,
      seeded: requests.slice(before, mark),
      ...info.result.value,
      registrations: regs.result.value,
    };
  } finally {
    chrome.kill('SIGKILL');
    fs.rmSync(profile, { recursive: true, force: true });
  }
}
