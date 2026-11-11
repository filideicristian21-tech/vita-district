// Draw call e triangoli per fotogramma nel gioco vero (ombre comprese), in alcuni punti. Headless: SwiftShader, non un telefono.
import { open, sleep } from './h.mjs';
const url = process.argv[2]; const [W, H] = [+(process.argv[3] || 932), +(process.argv[4] || 430)];
const spots = JSON.parse(process.env.SPOTS || '[["spawn",-1.5,8.4,0]]');
const { b, p } = await open(url, { w: W, h: H });
for (const [n, x, z, yaw] of spots) {
  await p.evaluate((x, z, yaw) => { const v = window.__vd; if (v.driving) v.tryExit(); v.teleport(x, z, yaw); v.setCam(yaw + Math.PI, 0.28, 3.4); }, x, z, yaw);
  await sleep(4000);
  const r = await p.evaluate(() => { const i = window.__vd.renderer.info; return { calls: i.render.calls, tris: i.render.triangles, geo: i.memory.geometries, tex: i.memory.textures }; });
  console.log(url.split('/').pop(), n, JSON.stringify(r));
}
await b.close();
