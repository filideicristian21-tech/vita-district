// Collisioni pure (testabili in Node): cerchio giocatore vs box e cerchi; raggio camera vs box.
export function resolve(boxes, circles, p, radius, yFeet = 0) {
  for (let it = 0; it < 4; it++) {
    for (const b of boxes) {
      if (yFeet + 1.6 < b.y0 || yFeet + 0.3 > b.y1) continue;
      const cx = Math.max(b.x0, Math.min(p.x, b.x1)), cz = Math.max(b.z0, Math.min(p.z, b.z1));
      const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        if (d2 > 1e-8) { const d = Math.sqrt(d2), push = radius - d; p.x += (dx / d) * push; p.z += (dz / d) * push; }
        else {
          const o = [[p.x - b.x0, -1, 0], [b.x1 - p.x, 1, 0], [p.z - b.z0, 0, -1], [b.z1 - p.z, 0, 1]].sort((a, c) => a[0] - c[0])[0];
          p.x += o[1] * (o[0] + radius); p.z += o[2] * (o[0] + radius);
        }
      }
    }
    for (const c of circles) {
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = radius + c.r;
      if (d < m) {
        if (d > 1e-6) { p.x += (dx / d) * (m - d); p.z += (dz / d) * (m - d); }
        else { p.x = c.x + m; } // centri coincidenti: spinta deterministica verso est
      }
    }
  }
  return p;
}
export function rayDistance(boxes, origin, dir, maxD) {
  let best = maxD;
  const o = [origin.x, origin.y, origin.z], d = [dir.x, dir.y, dir.z];
  for (const b of boxes) {
    let t0 = 0, t1 = best; let hit = true;
    const mn = [b.x0, b.y0, b.z0], mx = [b.x1, b.y1, b.z1];
    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-9) { if (o[a] < mn[a] || o[a] > mx[a]) { hit = false; break; } continue; }
      let ta = (mn[a] - o[a]) / d[a], tb = (mx[a] - o[a]) / d[a]; if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) { hit = false; break; }
    }
    if (hit && t0 < best && t0 >= 0) best = t0;
  }
  return best;
}
// Avanzamento di un passante su un segmento andata/ritorno: se bloccato NON avanza.
export function stepWalker(w, dt, blocked) {
  if (blocked) return w;
  const [a, b] = w.path; const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  w.t += (w.speed * dt / len) * w.dir;
  if (w.t > 1) { w.t = 1; w.dir = -1; } if (w.t < 0) { w.t = 0; w.dir = 1; }
  return w;
}
export function walkerPos(w) { const [a, b] = w.path; return { x: a[0] + (b[0] - a[0]) * w.t, z: a[1] + (b[1] - a[1]) * w.t }; }
