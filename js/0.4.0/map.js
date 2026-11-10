// Mappa grande (marker cliccabili, waypoint) e minimappa. Coordinate mondo: x est, +z nord.
import { PLACES, WORLD_BOUNDS as B } from './places.js';
import { playerCarMarker } from './state.js';

const COLORS = { bg: '#3a4246', block: '#8d8a82', road: '#5f7480', building: '#4a4f54', grass: '#6f8a58', piazza: '#a39a88', crossing: '#d8d8d0', tree: '#4f6b3a', car: '#2e3438', fountain: '#6fa0b0', water: '#3d6b78' };

export class MapUI {
  constructor(world, state, cb) {
    this.world = world; this.state = state; this.cb = cb;
    this.scale = 4; // px per metro nella texture base
    this.base = this.renderBase();
    this.view = { cx: 0, cy: 0, zoom: 1 };
    this.selected = null;
    this.bindPan();
  }
  W2P(x, z) { return [(x - B.minX) * this.scale, (B.maxZ - z) * this.scale]; }
  renderBase() {
    const c = document.createElement('canvas'); const s = this.scale;
    c.width = (B.maxX - B.minX) * s; c.height = (B.maxZ - B.minZ) * s;
    const g = c.getContext('2d'); g.fillStyle = COLORS.road; g.fillRect(0, 0, c.width, c.height);
    const rect = (sh, col) => { const [x0, y0] = this.W2P(sh.x0, sh.z1); const [x1, y1] = this.W2P(sh.x1, sh.z0); g.fillStyle = col; g.fillRect(x0, y0, x1 - x0, y1 - y0); };
    const shapes = this.world.mapShapes;
    g.fillStyle = COLORS.water; { const [x0, y0] = this.W2P(B.minX, -177.5); g.fillRect(x0, y0, c.width, c.height - y0); }
    shapes.filter((m) => m.type === 'block').forEach((m) => rect(m, COLORS.block));
    shapes.filter((m) => m.type === 'piazza').forEach((m) => rect(m, COLORS.piazza));
    shapes.filter((m) => m.type === 'grass').forEach((m) => rect(m, COLORS.grass));
    shapes.filter((m) => m.type === 'building').forEach((m) => { rect(m, m.special ? '#5b5246' : COLORS.building); g.strokeStyle = '#2b2f33'; g.lineWidth = 1; const [x0, y0] = this.W2P(m.x0, m.z1); const [x1, y1] = this.W2P(m.x1, m.z0); g.strokeRect(x0, y0, x1 - x0, y1 - y0); });
    g.fillStyle = COLORS.crossing;
    shapes.filter((m) => m.type === 'crossing').forEach((m) => { for (let k = -m.len / 2 + 0.4; k < m.len / 2; k += 1) { const [px, py] = m.along === 'z' ? this.W2P(m.x - 1.5, m.z + k) : this.W2P(m.x + k, m.z + 1.5); m.along === 'z' ? g.fillRect(px, py, 3 * s, 0.5 * s) : g.fillRect(px, py, 0.5 * s, 3 * s); } });
    shapes.filter((m) => m.type === 'tree').forEach((m) => { const [px, py] = this.W2P(m.x, m.z); g.fillStyle = COLORS.tree; g.beginPath(); g.arc(px, py, 1.6 * s, 0, 7); g.fill(); });
    shapes.filter((m) => m.type === 'fountain').forEach((m) => { const [px, py] = this.W2P(m.x, m.z); g.fillStyle = COLORS.fountain; g.beginPath(); g.arc(px, py, m.r * s, 0, 7); g.fill(); });
    shapes.filter((m) => m.type === 'car').forEach((m) => { g.fillStyle = COLORS.car; const [px, py] = this.W2P(m.x, m.z); const w = (m.along === 'x' ? m.L : m.W) * 2 * s, h = (m.along === 'x' ? m.W : m.L) * 2 * s; g.fillRect(px - w / 2, py - h / 2, w, h); });
    // nomi delle vie
    g.fillStyle = '#e8eef2'; g.font = `600 ${3.2 * s}px sans-serif`; g.textAlign = 'center';
    let [px, py] = this.W2P(-70, 0); g.fillText('Via del Porto', px, py + 1.1 * s); [px, py] = this.W2P(70, 0); g.fillText('Via del Porto', px, py + 1.1 * s);
    g.save(); [px, py] = this.W2P(-48, 40); g.translate(px, py); g.rotate(-Math.PI / 2); g.fillText('Via delle Reti', 0, 1.1 * s); g.restore();
    [px, py] = this.W2P(0, -168); g.fillText('Lungomare', px, py + 1.1 * s);
    g.save(); [px, py] = this.W2P(48, -40); g.translate(px, py); g.rotate(-Math.PI / 2); g.fillText('Via dei Fanali', 0, 1.1 * s); g.restore();
    return c;
  }
  bindPan() {
    const wrap = document.getElementById('mapWrap'); let last = null, id = null;
    wrap.addEventListener('pointerdown', (e) => { if (e.target.closest('.mk')) return; id = e.pointerId; last = { x: e.clientX, y: e.clientY }; wrap.setPointerCapture(id); });
    wrap.addEventListener('pointermove', (e) => { if (e.pointerId !== id) return; const k = this.fit * this.view.zoom; this.view.cx -= (e.clientX - last.x) / k; this.view.cy -= (e.clientY - last.y) / k; last = { x: e.clientX, y: e.clientY }; this.draw(); });
    const end = (e) => { if (e.pointerId === id) id = null; };
    wrap.addEventListener('pointerup', end); wrap.addEventListener('pointercancel', end);
    wrap.addEventListener('wheel', (e) => { this.view.zoom = Math.min(4, Math.max(0.8, this.view.zoom * (e.deltaY < 0 ? 1.15 : 0.87))); this.draw(); }, { passive: true });
  }
  open() { this.center(); this.selected = null; document.getElementById('mapCard').classList.add('hidden'); }
  center() { const p = this.cb.getPlayer(); const [x, y] = this.W2P(p.x, p.z); this.view.cx = x; this.view.cy = y; this.view.zoom = 1.6; this.draw(); }
  markers() {
    const st = this.state; const out = ['barber', 'cafe', 'depot', 'shop', 'pond', 'court', 'dealer', 'park', 'piazza', 'officina', 'corriere', 'bocce', 'belvedere'].map((k) => PLACES[k]).filter(Boolean);
    if (st.delivery) out.push(PLACES['dl_' + st.delivery.target]);
    const car = playerCarMarker(st);
    if (car) out.push(car);
    return out;
  }
  draw() {
    const cv = document.getElementById('bigMap'); const wrap = document.getElementById('mapWrap');
    const W = wrap.clientWidth, H = wrap.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
    this.fit = Math.min(W / this.base.width, H / this.base.height);
    const k = this.fit * this.view.zoom;
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = COLORS.bg; g.fillRect(0, 0, W, H);
    // non uscire dai bordi della mappa
    const bw = this.base.width * k, bh = this.base.height * k;
    if (bw > W) this.view.cx = Math.min(Math.max(this.view.cx, W / 2 / k), this.base.width - W / 2 / k); else this.view.cx = this.base.width / 2;
    if (bh > H) this.view.cy = Math.min(Math.max(this.view.cy, H / 2 / k), this.base.height - H / 2 / k); else this.view.cy = this.base.height / 2;
    const ox = W / 2 - this.view.cx * k, oy = H / 2 - this.view.cy * k;
    g.imageSmoothingEnabled = true; g.drawImage(this.base, ox, oy, this.base.width * k, this.base.height * k);
    const toScr = (x, z) => { const [px, py] = this.W2P(x, z); return [ox + px * k, oy + py * k]; };
    // linea verso destinazione
    const st = this.state; const p = this.cb.getPlayer();
    if (st.waypoint && PLACES[st.waypoint]) { const w = PLACES[st.waypoint]; const [a, b] = toScr(p.x, p.z), [c, d] = toScr(w.x, w.z);
      g.strokeStyle = '#e6bb70'; g.setLineDash([6, 6]); g.lineWidth = 3; g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#e6bb70'; g.save(); g.translate(c, d); g.rotate(Math.PI / 4); g.fillRect(-7, -7, 14, 14); g.restore(); }
    // giocatore
    const [px, py] = toScr(p.x, p.z); this.arrow(g, px, py, this.cb.getYaw(), 11, '#ffffff', 'Tu');
    // marker HTML cliccabili
    const box = document.getElementById('mapMarkers');
    const html = this.markers().map((m) => { const [x, y] = toScr(m.x, m.z); return `<button class="mk ${this.selected === m.id ? 'sel' : ''}" data-id="${m.id}" style="left:${x}px;top:${y}px;border-color:${m.color}">${m.icon} ${m.short}</button>`; }).join('');
    if (box._html !== html) { box.innerHTML = html; box._html = html;
      box.querySelectorAll('.mk').forEach((b) => b.onclick = (e) => { e.stopPropagation(); this.select(b.dataset.id); }); }
  }
  arrow(g, x, y, yaw, r, col, label) {
    // yaw=0 → il personaggio guarda +z (nord) → su sullo schermo
    g.save(); g.translate(x, y); g.rotate(-yaw + Math.PI);
    g.fillStyle = col; g.strokeStyle = '#151b20'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, r); g.lineTo(r * 0.7, -r * 0.7); g.lineTo(0, -r * 0.3); g.lineTo(-r * 0.7, -r * 0.7); g.closePath(); g.fill(); g.stroke(); g.restore();
    if (label) { g.fillStyle = '#fff'; g.font = '600 12px sans-serif'; g.textAlign = 'center'; g.fillText(label, x, y - r - 4); }
  }
  select(id) {
    this.selected = id; const m = this.markers().find((x) => x.id === id) || PLACES[id]; const p = this.cb.getPlayer();
    const d = Math.round(Math.hypot(p.x - m.x, p.z - m.z));
    const card = document.getElementById('mapCard'); card.classList.remove('hidden');
    if (m.car) {
      card.innerHTML = `<b>${m.icon} ${m.name}</b><br><small>${d} m · parcheggiata qui. Avvicinati e tocca Interagisci per salire.</small><div class="row">
        <button class="pill primary" id="mkDealer">◆ Segna l'Autosalone</button><button class="pill" id="mkX">Chiudi</button></div>`;
      document.getElementById('mkDealer').onclick = () => { this.cb.onWaypoint('dealer'); this.select('dealer'); };
      document.getElementById('mkX').onclick = () => { card.classList.add('hidden'); this.selected = null; this.draw(); };
      this.draw();
      return;
    }
    const isWp = this.state.waypoint === id;
    card.innerHTML = `<b>${m.icon} ${m.name}</b><br><small>${d} m in linea d'aria</small><div class="row">
      <button class="pill primary" id="mkSet">${isWp ? 'Rimuovi destinazione' : '◆ Segna destinazione'}</button><button class="pill" id="mkX">Chiudi</button></div>`;
    document.getElementById('mkSet').onclick = () => { this.cb.onWaypoint(isWp ? null : id); this.select(id); };
    document.getElementById('mkX').onclick = () => { card.classList.add('hidden'); this.selected = null; this.draw(); };
    this.draw();
  }
  drawMini(cv) {
    const g = cv.getContext('2d'); const W = cv.width, H = cv.height; const p = this.cb.getPlayer();
    const k = 1.5; // zoom: px canvas per px base
    const [px, py] = this.W2P(p.x, p.z);
    g.save(); g.clearRect(0, 0, W, H); g.beginPath(); g.arc(W / 2, H / 2, W / 2, 0, 7); g.clip();
    g.fillStyle = COLORS.bg; g.fillRect(0, 0, W, H);
    g.drawImage(this.base, W / 2 - px * k, H / 2 - py * k, this.base.width * k, this.base.height * k);
    const toScr = (x, z) => { const [a, b] = this.W2P(x, z); return [W / 2 + (a - px) * k, H / 2 + (b - py) * k]; };
    for (const m of this.markers()) { let [x, y] = toScr(m.x, m.z); const dx = x - W / 2, dy = y - H / 2, d = Math.hypot(dx, dy), R = W / 2 - 16;
      if (d > R) { x = W / 2 + dx / d * R; y = H / 2 + dy / d * R; }
      g.fillStyle = '#151b20dd'; g.beginPath(); g.arc(x, y, 15, 0, 7); g.fill(); g.strokeStyle = m.color; g.lineWidth = 3; g.stroke();
      g.font = '16px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(m.icon, x, y + 1); }
    const st = this.state;
    if (st.waypoint && PLACES[st.waypoint]) { const w = PLACES[st.waypoint]; const [x, y] = toScr(w.x, w.z); g.strokeStyle = '#e6bb70'; g.lineWidth = 4; g.setLineDash([8, 8]); g.beginPath(); g.moveTo(W / 2, H / 2); g.lineTo(x, y); g.stroke(); g.setLineDash([]); }
    this.arrow(g, W / 2, H / 2, this.cb.getYaw(), 16, '#ffffff');
    g.restore();
    g.fillStyle = '#fff'; g.font = '600 20px sans-serif'; g.textAlign = 'center'; g.fillText('N', W / 2, 22);
  }
}
