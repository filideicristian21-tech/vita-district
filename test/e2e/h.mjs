// puppeteer-core non è una dipendenza del gioco: indicare il percorso con PUPPETEER=/percorso/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js
const puppeteer = (await import(process.env.PUPPETEER || 'puppeteer-core')).default;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function open(url, { w = 932, h = 430, save = null, clear = true } = {}) {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new',
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage();
  await p.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const logs = [];
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(m.type() + ': ' + m.text()); });
  p.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
  p.on('response', (r) => { if (r.status() >= 400) logs.push('HTTP' + r.status() + ' ' + r.url()); });
  p.on('requestfailed', (r) => logs.push('REQFAIL: ' + r.url() + ' ' + (r.failure() && r.failure().errorText)));
  const origin = new URL(url).origin;
  if (clear || save) {
    await p.goto(origin + '/README.md');
    await p.evaluate((s) => { localStorage.clear(); if (s) for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, save);
  }
  const t0 = Date.now();
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForFunction(() => document.getElementById('loading').classList.contains('hidden') || /Errore|non si è caricato/.test(document.getElementById('loadMsg').textContent), { timeout: 120000 });
  const bootMs = Date.now() - t0;
  await sleep(1500);
  return { b, p, logs, bootMs };
}
export const ev = (p, fn, ...a) => p.evaluate(fn, ...a);
