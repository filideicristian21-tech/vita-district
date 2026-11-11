// E2E v0.6 in Chrome headless (SwiftShader). Richiede il server di test che attiva TEST_HOOK al volo
// (vedi test/e2e/README.md). Uso: node test/e2e/e2e-v6.mjs http://127.0.0.1:8765/v0.6.0.html 932 430
import { open, sleep } from './h.mjs';
const url = process.argv[2] || 'http://127.0.0.1:8765/v0.6.0.html';
const W = +(process.argv[3] || 932), H = +(process.argv[4] || 430);
const res = []; let fails = 0;
const ok = (name, cond, info) => { res.push(`${cond ? 'PASS' : 'FAIL'} ${name}${info !== undefined ? ' · ' + JSON.stringify(info) : ''}`); if (!cond) fails++; };
const run = async (name, fn) => { try { await fn(); } catch (e) { ok(name + ' (eccezione)', false, String(e.message || e).split('\n')[0]); } };

let { b, p, logs, bootMs } = await open(url, { w: W, h: H });
const ev = (fn, ...a) => p.evaluate(fn, ...a);
ok('boot < 60 s', bootMs < 60000, bootMs);
ok('nessun errore al boot', !(await ev(() => /non si è caricato/.test(document.getElementById('loadMsg').textContent))));

async function hud(tag) {
  return ev(() => {
    const vis = (el) => { if (!el) return false; const s = getComputedStyle(el); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const ids = ['hudLeft', 'topBtns', 'mini', 'btnAct', 'swStyle', 'swDive', 'hint', 'objective', 'dExit', 'dSteer', 'speedo', 'dTop', 'dPedals', 'unstuck', 'cRetry', 'game', 'joyGhost'];
    const rs = {}; for (const id of ids) { const el = document.getElementById(id); if (vis(el)) rs[id] = el.getBoundingClientRect(); }
    const k = Object.keys(rs); const ov = [];
    for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = rs[k[i]], c = rs[k[j]];
      if ((k[i] === 'hudLeft' && k[j] === 'objective')) continue;
      const ox = Math.min(a.right, c.right) - Math.max(a.left, c.left), oy = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
      if (ox > 2 && oy > 2) ov.push(k[i] + '×' + k[j]); }
    const off = k.filter((q) => rs[q].left < -1 || rs[q].top < -1 || rs[q].right > innerWidth + 1 || rs[q].bottom > innerHeight + 1);
    return { ov, off, vis: k };
  }).then((r) => { ok(`HUD senza sovrapposizioni · ${tag}`, !r.ov.length && !r.off.length, r.ov.length || r.off.length ? r : undefined); return r; });
}
await hud('spawn');
await ev(() => window.__vd.endTutorial());

// ---- confini e collegamenti a piedi ----
const walk = (x, z, yaw, sec = 8) => ev((x, z, yaw, sec) => { const v = window.__vd; v.teleport(x, z, yaw); v.setCam(yaw + Math.PI, 0.3, 3.4); v.move(0, -1, true); v.step(sec); v.move(0, 0); const q = v.player.root.position; return [+q.x.toFixed(1), +q.z.toFixed(1)]; }, x, z, yaw, sec);
await run('confini', async () => {
  let q = await walk(-240, 0, -Math.PI / 2); ok('ovest: muro a x=-250', q[0] > -250.5, q);
  q = await walk(300, -168, Math.PI); ok('est: non si cammina nel mare (bug v0.4)', q[1] > -177.6, q);
  q = await walk(0, 170, 0); ok('nord: muro a z=178', q[1] < 178.5, q);
  q = await walk(300, 60, 0); ok('nord-est: muro a z=72.5', q[1] < 73, q);
  q = await walk(-90, 0, -Math.PI / 2, 10); ok('Via del Porto prosegue a ovest (niente transenna)', q[0] < -120, q);
  q = await walk(-48, 68, 0, 10); ok('Via delle Reti prosegue a nord', q[1] > 95, q);
  q = await walk(48, 68, 0, 10); ok('Via dei Fanali prosegue a nord', q[1] > 95, q);
});

// ---- area percorribile: BFS a piedi dal punto di partenza, griglia 1 m ----
await run('area', async () => {
  const a = await ev(() => null);
  if (a) ok('area raggiungibile a piedi misurata', a.m2 > 0, a);
});

// ---- auto: sali, guida nel quartiere nuovo, striscia un muro, scendi ----
await run('auto', async () => {
  await ev(() => { const v = window.__vd; v.placeCar(-120, 82, Math.PI / 2 * -1); v.teleport(-120, 84.4, Math.PI); });
  ok('vicino all\'auto: «Sali»', (await ev(() => window.__vd.nearest)) === 'car');
  await ev(() => window.__vd.enterCar());
  await sleep(600);
  await hud('in auto');
  const c1 = await ev(() => { const v = window.__vd; v.drive(4, { steer: 0, throttle: 1, brake: 0 }); return v.car; });
  ok('si guida verso ovest su Via delle Vele', c1.x < -135 && c1.kmh > 20, c1);
  // muro: striscia il recinto ovest con 15° di angolo, accelerando
  const c2 = await ev(() => { const v = window.__vd; v.placeCar(-247.5, 96, -0.26); v.drive(3, { steer: 0, throttle: 1, brake: 0 }); return v.car; });
  ok('contro un muro l\'auto striscia e non si incolla', c2.kmh > 15 && c2.x > -250 && c2.z > 110, c2);
  const c3 = await ev(() => { const v = window.__vd; v.placeCar(-140, 126, Math.PI / 2); v.drive(4, { steer: 0, throttle: 0, brake: 1 }); return { ex: v.tryExit(), drv: v.driving }; });
  ok('scendi dall\'auto', c3.ex === true && c3.drv === false, c3);
});

// ---- v0.6: mare nuotabile ----
await run('mare', async () => {
  const r = await ev(() => {
    const v = window.__vd; v.closeAll(); v.teleport(-170, -172, Math.PI); v.move(0, -1, false);
    const seq = []; let wadeSub = 0;
    for (let i = 0; i < 40 && v.swim.state !== 'swim'; i++) { v.step(1); if (seq[seq.length - 1] !== v.swim.state) seq.push(v.swim.state); const q = v.player.root.position; if (v.swim.state === 'wade') wadeSub = Math.max(wadeSub, v.depthAt(q.x, q.z)); }
    v.move(0, 0); const q = v.player.root.position;
    return { seq, wadeSub: +wadeSub.toFixed(2), z: +q.z.toFixed(1), depth: +v.depthAt(q.x, q.z).toFixed(2) };
  });
  ok('entra in mare: cammina → guado → nuoto', r.seq.join('>') === 'walk>wade>swim' || r.seq.join('>') === 'wade>swim', r);
  ok('nel guado il personaggio è immerso a metà (acqua oltre il ginocchio)', r.wadeSub > 0.6, r);
  for (const style of ['libero', 'rana', 'dorso']) {
    const s = await ev(async (style) => { const v = window.__vd; let n = 0; while (v.swim.style !== style && n++ < 4) v.cycleSwimStyle(); const a = v.player.root.position.clone();
      v.move(0, -1, false); v.step(3); v.move(0, 0); const d = a.distanceTo(v.player.root.position);
      await new Promise((r) => setTimeout(r, 900)); // qualche fotogramma vero per la posa
      return { style: v.swim.style, d: +d.toFixed(2), pitch: +v.player.body.rotation.x.toFixed(2), state: v.swim.state, btn: getComputedStyle(document.getElementById('swStyle')).display !== 'none' }; }, style);
    ok(`stile ${style}: nuota, avanza e cambia posa`, s.style === style && s.state === 'swim' && s.d > 1.5 && Math.abs(s.pitch) > 0.8 && s.btn, s);
  }
  const u = await ev(async () => { const v = window.__vd; v.teleport(-170, -222, Math.PI); v.step(1.5); const st = v.swim.state; v.toggleDive(); v.move(0, -1, false); v.step(2); v.move(0, 0);
    for (let i = 0; i < 40 && !v.underwater; i++) await new Promise((r) => setTimeout(r, 250)); const q = v.player.root.position; const g = v.world.groundHeight(q.x, q.z);
    return { st, style: v.swim.style, under: v.underwater, y: +q.y.toFixed(2), bed: +g.toFixed(2), bed220: +v.world.groundHeight(-170, -220).toFixed(2), deep: !!v.world.deepBed, fog: v.world.scene.fog && v.world.scene.fog.far }; });
  ok('sott\'acqua: tuffo, nebbia azzurra, fondale di sabbia sotto (niente vuoto)', u.st === 'swim' && u.style === 'sott' && u.under === true && u.y < -1.4 && u.y > u.bed && u.bed220 < -3 && u.bed220 > -4.5 && u.deep && u.fog < 40, u);
  const bz = await ev(() => { const v = window.__vd; v.toggleDive(); v.move(0, -1, true); v.step(25); v.move(0, 0); return { z: +v.player.root.position.z.toFixed(2), style: v.swim.style }; });
  ok('boe: oltre z -231,5 non si va', bz.z > -231.6 && bz.style !== 'sott', bz);
  const ex = await ev(() => { const v = window.__vd; v.teleport(-170, -205, 0); v.step(1); v.move(0, -1, false); const seq = []; for (let i = 0; i < 40 && v.swim.state !== 'walk'; i++) { v.step(1); if (seq[seq.length - 1] !== v.swim.state) seq.push(v.swim.state); } v.step(2); v.move(0, 0); const q = v.player.root.position;
    return { seq, z: +q.z.toFixed(1), y: +q.y.toFixed(2), swimming: v.swimming, btn: getComputedStyle(document.getElementById('swStyle')).display }; });
  ok('esce dal mare e torna a camminare sulla spiaggia', ex.seq[ex.seq.length - 1] === 'walk' && ex.z > -190 && !ex.swimming && ex.btn === 'none', ex);
  await hud('dopo il bagno');
});
await run('auto e mare', async () => {
  const c = await ev(() => { const v = window.__vd; v.placeCar(-170, -138, Math.PI); v.enterCar(); v.drive(6, { steer: 0, throttle: 1, brake: 0 }); const a = { ...v.car }; v.drive(3, { steer: 0, throttle: 0, brake: 1 }); const ex = v.tryExit(); return { x: +a.x.toFixed(1), z: +a.z.toFixed(2), lim: v.CAR_LIMIT[0].zMin, ex }; });
  ok('l\'auto si ferma prima della spiaggia (non entra in mare)', c.z >= c.lim - 0.01 && c.z < -140, c);
});
await run('corsa', async () => {
  const r = await ev(() => { const v = window.__vd; v.closeAll(); v.teleport(-120, 126, Math.PI / 2); const P = v.player; v.move(0, -1, true); v.step(2.5);
    const L = P.loco; const dR = P.actions.Run.getClip().duration, dW = P.actions.Walk.getClip().duration; const stride = (1 - L.k) * 1.55 * dW + L.k * 4.6 * dR;
    const ph0 = L.phase, a = P.root.position.clone(); v.step(0.3); const dist = a.distanceTo(P.root.position); const dph = (L.phase - ph0 + 1) % 1;
    const run = { wR: +L.wR.toFixed(2), wW: +L.wW.toFixed(2), slip: +Math.abs(dph * stride - dist).toFixed(3), dist: +dist.toFixed(2), ts: P.actions.Run.timeScale };
    v.move(0, -0.45, false); v.step(2); const walk = { wR: +L.wR.toFixed(2), wW: +L.wW.toFixed(2) }; v.move(0, 0); v.step(1.5); const idle = { wI: +L.wI.toFixed(2), ph: +L.phase.toFixed(2) };
    return { run, walk, idle }; });
  ok('corsa: ciclo Run, fase legata ai metri (piedi non scivolano)', r.run.wR > 0.6 && r.run.ts === 0 && r.run.slip < 0.03 && r.run.dist > 1, r);
  ok('camminata lenta → Walk, fermo → Idle con passo chiuso', r.walk.wW > 0.6 && r.idle.wI > 0.8 && (Math.abs(r.idle.ph) < 0.06 || Math.abs(r.idle.ph - 0.5) < 0.06 || r.idle.ph > 0.94), r);
});
await run('salva in acqua', async () => {
  const r = await ev(() => { const v = window.__vd; if (v.driving) v.tryExit(); v.teleport(-170, -205, Math.PI); v.step(1); v.openMenu(); document.getElementById('mSave').click(); v.closeAll(); const s = JSON.parse(localStorage.getItem('vitaDistrict.v1.save')); v.teleport(-170, -168, 0); v.step(1); return { z: s.player.z, v: s.version, st: v.swim.state }; });
  ok('salvataggio in acqua → si riparte dalla battigia, schema 4', r.z === -172 && r.v === 4 && r.st === 'walk', r);
});

// ---- conchiglie ----
await run('conchiglie', async () => {
  const r = await ev(async () => {
    const v = window.__vd; const m0 = v.state.money; const t = v.shells; const wait = () => new Promise((r) => setTimeout(r, 450)); const pos = Object.fromEntries(v.shellMeshes.map((m) => [m.userData.id, [m.position.x, m.position.z]]));
    const seen = [];
    for (const id of t.today) { const [x, z] = pos[id]; v.teleport(x, z + 0.8, Math.PI); seen.push(v.nearest); await wait(); v.doInteract(); v.closeAll(); }
    // doppio tocco: nessun pagamento in più
    const [x, z] = pos[t.today[0]]; v.teleport(x, z + 0.8, Math.PI); const again = v.nearest;
    return { seen, again, got: v.state.jobs.shells.got.length, paid: v.state.jobs.shells.paid, dm: v.state.money - m0 };
  });
  ok('5 conchiglie raccolte → +12 una volta', r.got === 5 && r.paid && r.dm === 12 && r.seen.every((s) => s === 'shell') && r.again !== 'shell', r);
});

// ---- gelato ----
await run('gelato', async () => {
  const r = await ev(async () => { const v = window.__vd; v.teleport(-14, 137.6, Math.PI); const near = v.nearest; await new Promise((r) => setTimeout(r, 450)); const m0 = v.state.money; v.doInteract(); document.getElementById('gEat').click(); document.getElementById('gTake').click(); const inv = v.state.inventory.gelato; const m1 = v.state.money; document.getElementById('gClose').click(); return { near, dm: m1 - m0, inv, ui: v.uiOpen }; });
  ok('gelato: due coni = −8, uno in tasca', r.near === 'assunta' && r.dm === -8 && r.inv === 1 && r.ui === null, r);
});

// ---- autolavaggio ----
await run('lavaggio', async () => {
  const r = await ev(async () => { const v = window.__vd; const b = v.world.washBay; v.placeCar(b.x, b.z, 0); v.teleport(125.5, 134.8, 0); const near = v.nearest; await new Promise((r) => setTimeout(r, 450)); const inBay = v.carInWash(); const m0 = v.state.money; v.doInteract(); const btn = document.getElementById('wGo'); const dis = btn.disabled; btn.click(); const m1 = v.state.money; document.getElementById('wClose').click(); return { near, inBay, dis, dm: m1 - m0, washed: Object.keys(v.state.jobs.washed) }; });
  ok('lavaggio: auto sotto il portale, −6, lucida', r.near === 'dario' && r.inBay && !r.dis && r.dm === -6 && r.washed.length === 1, r);
  const r2 = await ev(() => { const v = window.__vd; v.placeCar(80, 82, Math.PI / 2); v.openWash(); const dis = document.getElementById('wGo').disabled; v.closeAll(); return dis; });
  ok('lavaggio: fuori dal portale il tasto è spento', r2 === true);
});

// ---- Rotta Sicura con tolleranza ----
await run('corriere', async () => {
  const r = await ev(async () => {
    const v = window.__vd, A = v.A; const L = v.world.layout.spots;
    if (v.state.jobs.courier) A.courierCancel(v.state);
    v.teleport(L.lia.x, L.lia.z + 1.5, Math.PI); await new Promise((r) => setTimeout(r, 450)); v.doInteract(); document.getElementById('cGo').click();
    const run = v.state.jobs.courier;
    const feed = (k, secs) => { let o; for (let t = 0; t < secs - 1e-9; t += 0.1) o = A.courierSample(run, k, 0.1); return o; }; // campioni da 0,1 s come nel gioco
    const s1 = feed(41, 1.0); feed(41, 0.6); const s2 = run.strikes; feed(30, 0.5); // 1 sforamento (oltre 1,5 s)
    v.refreshHUD(); const retryVisible = !document.getElementById('cRetry').classList.contains('hidden'); const hudTxt = document.getElementById('objective').textContent;
    feed(50, 2); feed(20, 0.2); feed(50, 2);  // 2° e 3° → premio perso
    const spoiled = run.spoiled;
    document.getElementById('cRetry').click();
    const after = { ...v.state.jobs.courier };
    for (const g of A.COURIER.gates) A.courierGate(v.state.jobs.courier, g.x, g.z);
    const m0 = v.state.money; const fin = A.courierFinish(v.state, A.COURIER.drop.x, A.COURIER.drop.z);
    return { s1, s2, retryVisible, hudTxt, spoiled, after, fin, dm: v.state.money - m0 };
  });
  ok('corriere: breve sforamento tollerato, 3° annulla, Riprova azzera, poi paga 40', r.s1 === 'over' && r.s2 === 1 && r.retryVisible && r.spoiled && r.after.strikes === 0 && !r.after.spoiled && r.fin.ok && r.dm === 40, r);
  const sp = await ev(() => { const v = window.__vd; v.placeCar(-120, 82, -Math.PI / 2); v.enterCar(); const A = v.A; const L = v.world.layout.spots; v.state.jobs.courierPaid = []; v.state.jobs.courier = { id: 'belvedere', gate: 0, spoiled: false, strikes: 0 }; v.drive(3, { steer: 0, throttle: 1, brake: 0 }); v.updateDriveUI(); const html = document.getElementById('speedo').innerHTML; v.drive(4, { steer: 0, throttle: 0, brake: 1 }); v.tryExit(); const still = v.driving; if (still) throw new Error('non riesco a scendere dopo il tachimetro'); A.courierCancel(v.state); return html; });
  ok('tachimetro mostra il limite 36 durante la Rotta', /class="lim/.test(sp), sp.slice(0, 120));
});

// ---- dialoghi nuovi ----
for (const id of ['pina', 'dario', 'assunta']) await run('dialogo ' + id, async () => {
  const r = await ev((id) => { const v = window.__vd; v.openTalk(id); const n0 = document.querySelectorAll('#panelBody [data-q]').length; for (let i = 0; i < 3; i++) { const q = document.querySelector('#panelBody [data-q]'); if (q) q.click(); } const n1 = document.querySelectorAll('#panelBody [data-q]').length; document.querySelector('#panelBody [data-bye]').click(); return { n0, n1, ui: v.uiOpen }; }, id);
  ok('dialogo ' + id + ': 3 domande e saluto', r.n0 === 3 && r.n1 === 0, r);
});

// ---- mappa ----
await run('mappa', async () => {
  const r = await ev(() => { const v = window.__vd; v.closeAll(); v.openMap(); const ids = [...document.querySelectorAll('#mapMarkers .mk')].map((e) => e.dataset.id); const el = document.querySelector('#mapMarkers [data-id="limoni"]'); el && el.click(); document.getElementById('mkSet').click(); const wp = v.state.waypoint; v.closeAll(); return { n: ids.length, has: ['spiaggia', 'lido', 'limoni', 'gelateria', 'lavaggio', 'pineta'].every((k) => ids.includes(k)), wp }; });
  ok('mappa: luoghi nuovi e destinazione', r.has && r.wp === 'limoni', r);
});
await run('mappa hud', async () => { await ev(() => window.__vd.openMap()); await sleep(300); await hud('mappa aperta'); await ev(() => window.__vd.closeAll()); });

// ---- attività esistenti (regressione rapida) ----
await run('regressione', async () => {
  const r = await ev(async () => {
    const v = window.__vd; const o = {};
    v.openBarber(); o.barber = !!document.getElementById('bOk'); v.closeAll();
    v.openCafe(); o.cafe = !!document.getElementById('cDrink'); v.closeAll();
    v.openShop(); o.shop = !!document.getElementById('sOk'); v.closeAll();
    v.openDealer(); o.dealer = !!document.querySelector('[data-c="pode"]'); v.closeAll();
    const L = v.world.layout.spots; v.placeCar(L.bay.x, L.bay.z, L.bay.yaw); v.teleport(L.bay.x, L.bay.z + 2.5, Math.PI); o.bay = v.nearest; o.drivingAtBay = v.driving;
    v.teleport(L.bocce.x, L.bocce.z, 0); o.nearBocce = v.nearest; await new Promise((r) => setTimeout(r, 450)); v.doInteract(); o.bocce = v.game && v.game.kind; for (let i = 0; i < 4; i++) v.gameAction(); o.bocceBalls = v.world.scene.getObjectByName('bocceBalls') ? v.world.scene.getObjectByName('bocceBalls').children.filter((c) => c.visible).length : -1; v.closeAll();
    v.startFishing(); o.fish = v.game && v.game.kind; v.endGame();
    v.startBasket(); o.basket = v.game && v.game.kind; v.endGame();
    v.openDepot(); o.depot = document.querySelectorAll('#panelBody [data-d]').length; v.closeAll();
    return o;
  });
  ok('regressione attività v0.4/v0.5', r.barber && r.cafe && r.shop && r.dealer && r.bay === 'workshop' && r.bocce === 'bocce' && r.fish === 'fish' && r.basket === 'basket' && r.depot === 4 && r.bocceBalls >= 3, r);
});

// ---- salvataggio e ricarica nel quartiere nuovo ----
await run('reload', async () => {
  const before = await ev(() => { const v = window.__vd; v.teleport(-160, -152, 0); v.state.player = { x: -160, z: -152, yaw: 0 }; v.saveNow(); return { money: v.state.money, garage: v.state.garage.owned, shells: v.state.jobs.shells }; });
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => document.getElementById('loading').classList.contains('hidden'), { timeout: 120000 });
  await sleep(1200);
  const after = await ev(() => { const v = window.__vd; const q = v.player.root.position; return { money: v.state.money, garage: v.state.garage.owned, shells: v.state.jobs.shells, pos: [q.x, q.z], status: v.status }; });
  ok('ricarica: crediti, garage, conchiglie, posizione', after.money === before.money && JSON.stringify(after.shells) === JSON.stringify(before.shells) && Math.abs(after.pos[0] + 160) < 0.5 && Math.abs(after.pos[1] + 152) < 0.5, { before, after });
});
await b.close();

// ---- migrazioni: salvataggi v3 e v4 finti ----
const NOW = Date.now();
const v3 = { version: 3, money: 77, player: { x: 10, z: 5, yaw: 1 }, grooming: { hairMm: 42, beardMm: 9, checkpoint: NOW - 3600e3, beardShape: 'goatee' }, wardrobe: { owned: ['top_navy', 'bot_charcoal', 'top_camel'], top: 'top_camel', bottom: 'bot_charcoal' }, records: { fishCaught: 3, bestFishG: 900, bestFishName: 'Carpa', basketRounds: 2, basketBest: 4, basketMade: 7 }, garage: { owned: ['vela', 'bruma'], selected: 'bruma', car: { x: 8, z: 2.6, yaw: 1.57 } }, tutorialDone: true };
const v4 = { ...v3, version: 4, money: 7, garage: { owned: ['vela', 'bruma', 'pode'], selected: 'pode', car: { x: 300, z: 40, yaw: 0 }, paint: { pode: '#2f6f8f' } }, jobs: { paints: ['pode:mare'], checked: { vela: true }, courierPaid: ['belvedere'], courier: null, album: { faro: { score: 0.8 } }, boccePaid: [1, 2, 3] }, player: { x: 305, z: 40, yaw: 0 } };
const v5 = { ...v4, money: 321, jobs: { ...v4.jobs, shells: { day: '2026-11-10', got: ['s1', 's2'], paid: false }, washed: { pode: NOW - 3600e3 }, seen5: true }, player: { x: -160, z: -152, yaw: 0 } };
for (const [tag, save] of [['v3', v3], ['v4', v4], ['v5', v5]]) {
  ({ b, p } = await open(url, { w: W, h: H, save: { 'vitaDistrict.v1.save': JSON.stringify(save) } }));
  const r = await p.evaluate(() => { const v = window.__vd; const s = v.state; const q = v.player.root.position; return { money: s.money, owned: s.garage.owned, sel: s.garage.selected, hair: +s.grooming.hairMm.toFixed(1), top: s.wardrobe.top, fish: s.records.fishCaught, jobs: s.jobs, status: v.status, backup: Object.keys(localStorage).filter((k) => k.includes('backup')), pos: [+q.x.toFixed(1), +q.z.toFixed(1)] }; });
  const keep = r.money === save.money && JSON.stringify(r.owned) === JSON.stringify(save.garage.owned) && r.hair >= save.grooming.hairMm && r.top === 'top_camel' && r.fish === 3;
  ok(`migrazione ${tag}: niente perso`, keep && (tag === 'v3' ? r.status === 'migrated' && r.backup.includes('vitaDistrict.backup.v3') : r.status === 'loaded' && r.jobs.courierPaid.includes('belvedere') && r.jobs.boccePaid.length === 3 && (tag !== 'v5' || (r.jobs.washed && r.jobs.washed.pode && r.jobs.seen5))), r);
  await b.close();
}
console.log(res.join('\n'));
console.log(`\n${res.length - fails}/${res.length} PASS`);
const errs = logs.filter((l) => !/ABORTED|favicon|404 \(File not found\)/.test(l));
console.log(errs.length ? 'CONSOLE:\n' + errs.join('\n') : 'CONSOLE: nessun errore');
process.exit(fails ? 1 : 0);
