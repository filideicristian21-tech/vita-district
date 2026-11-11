// Area raggiungibile a piedi (m²): BFS su griglia 1 m dal punto di partenza, nel gioco vero (collisioni reali).
// Cella valida: il cerchio del pedone (r 0,3 m) non tocca niente e non è in mare. Passaggio valido: anche il punto a metà è libero.
// Uso: PUPPETEER=... node test/e2e/reach.mjs http://127.0.0.1:8765/v0.4.0.html
import fs from 'node:fs';
import { open } from './h.mjs';
const url = process.argv[2];
const { b, p } = await open(url, { w: 932, h: 430 });
if (process.env.DUMP) await p.evaluate(() => { window.__dumpReach = 1; });
const r = await p.evaluate(() => {
  const v = window.__vd, w = v.world; const minX = -260, maxX = 520, minZ = -190, maxZ = 190;
  const W = maxX - minX + 1, H = maxZ - minZ + 1; const st = new Int8Array(W * H); // 0 ignoto, 1 libero, -1 pieno
  const sea = (x, z) => (x > -96 ? z < -177.4 : z < -178);
  const freeAt = (x, z) => { if (sea(x, z)) return false; const q = { x, z }; w.resolve(q, 0.3, 0.12); return Math.hypot(q.x - x, q.z - z) < 0.03; };
  const cell = (i, k) => { const id = k * W + i; if (!st[id]) st[id] = freeAt(minX + i, minZ + k) ? 1 : -1; return st[id] === 1; };
  const p0 = v.player.root.position; const i0 = Math.round(p0.x - minX), k0 = Math.round(p0.z - minZ);
  const seen = new Uint8Array(W * H); const q = [[i0, k0]]; seen[k0 * W + i0] = 1; let n = 0;
  if (!cell(i0, k0)) return { err: 'start blocked' };
  while (q.length) {
    const [i, k] = q.pop(); n++;
    for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, c = k + dk; if (a < 0 || c < 0 || a >= W || c >= H) continue; const id = c * W + a; if (seen[id]) continue;
      if (!cell(a, c)) continue;
      if (!freeAt(minX + i + di / 2, minZ + k + dk / 2)) continue;
      seen[id] = 1; q.push([a, c]);
    }
  }
  let bits = ''; if (window.__dumpReach) for (let id = 0; id < W * H; id++) bits += seen[id] ? '1' : (st[id] === -1 ? '2' : '0');
  return { m2: n, start: [+p0.x.toFixed(1), +p0.z.toFixed(1)], W, H, bits };
});
if (process.env.DUMP) fs.writeFileSync(process.env.DUMP, JSON.stringify(r));
console.log(url, JSON.stringify({ m2: r.m2, start: r.start, err: r.err }));
await b.close();
