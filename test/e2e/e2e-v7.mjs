// E2E v0.7 in Chrome headless (SwiftShader). Richiede il server di test che attiva TEST_HOOK al volo
// (vedi test/e2e/README.md). Uso: node test/e2e/e2e-v7.mjs http://127.0.0.1:8765/v0.7.0.html 932 430
import { open, sleep } from './h.mjs';
const url = process.argv[2] || 'http://127.0.0.1:8765/v0.7.0.html';
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
    const ids = ['hudLeft', 'topBtns', 'mini', 'btnAct', 'swStyle', 'swDive', 'dBlinks', 'hint', 'objective', 'dExit', 'dSteer', 'speedo', 'dTop', 'dPedals', 'unstuck', 'cRetry', 'game', 'joyGhost'];
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
await run('v7 partenza', async () => {
  const r = await ev(() => { const v = window.__vd; return { money: v.state.money, owned: v.state.life.homes.owned, main: v.state.life.homes.main, status: v.status, flag: v.state.life.grants.start100k, clock: document.getElementById('clock').textContent }; });
  ok('nuova partita: 100.000 crediti, soffitta tua, orologio Giorno 1', r.money === 100000 && r.owned.join() === 'soffitta' && r.main === 'soffitta' && r.flag === true && /Giorno 1/.test(r.clock), r);
});


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
  ok('salvataggio in acqua → si riparte dalla battigia, schema 5', r.z === -172 && r.v === 5 && r.st === 'walk', r);
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

// ======================= v0.7 =======================
await run('v7 orologio', async () => {
  const r = await ev(async () => { const v = window.__vd; const L = v.state.life; const a = L.clock.gameMs; const real = Date.now; Date.now = () => real() + 9e9; // l'orologio di sistema salta avanti di 100 giorni
    await new Promise((res) => setTimeout(res, 1500)); Date.now = real; return { d: L.clock.gameMs - a }; });
  ok('orologio di gioco avanza col tempo giocato, non con Date.now', r.d > 500 && r.d < 3000, r);
});
await run('v7 giorno e notte', async () => {
  const day = await ev(async () => { const v = window.__vd; v.teleport(-20, 0, 0); v.setHour(12); await new Promise((r) => setTimeout(r, 400)); return { n: v.NIGHT.value, pools: v.pools, stars: v.stars, fog: v.world.scene.fog.color.getHexString(), sun: +v.world.scene.children.find((o) => o.isDirectionalLight).intensity.toFixed(2) }; });
  const night = await ev(async () => { const v = window.__vd; v.setHour(23); await new Promise((r) => setTimeout(r, 400)); return { n: v.NIGHT.value, pools: v.pools, stars: v.stars, fog: v.world.scene.fog.color.getHexString(), sun: +v.world.scene.children.find((o) => o.isDirectionalLight).intensity.toFixed(2), clock: document.getElementById('clock').textContent, calls: v.renderer.info.render.calls }; });
  ok('mezzogiorno: niente luci notturne', day.n === 0 && !day.pools && !day.stars && day.sun > 2.5, day);
  ok('notte: lampioni, pozze di luce, stelle, nebbia scura, orologio 🌙', night.n > 0.9 && night.pools && night.stars && night.fog !== day.fog && night.sun < 1 && /🌙/.test(night.clock), night);
  const u = await ev(async () => { const v = window.__vd; v.teleport(-170, -222, Math.PI); v.step(1.5); if (v.swim.style !== 'sott') v.toggleDive(); v.move(0, -1, false); v.step(2); v.move(0, 0);
    for (let i = 0; i < 30 && !v.underwater; i++) await new Promise((r) => setTimeout(r, 200)); const under = v.underwater; v.toggleDive(); v.step(3);
    for (let i = 0; i < 30 && v.underwater; i++) await new Promise((r) => setTimeout(r, 200)); return { under, after: v.underwater, fog: v.world.scene.fog.color.getHexString() }; });
  ok('FOG0 segue la notte: risalendo la nebbia torna quella notturna (Cranc)', u.under && !u.after && u.fog === night.fog, u);
  const sh = await ev(() => { const v = window.__vd; v.teleport(-170, -205, 0); v.step(0.5); if (v.swim.style !== 'sott') v.toggleDive(); const st0 = v.swim.style; v.move(0, -1, false); for (let i = 0; i < 40 && v.swim.state !== 'walk'; i++) v.step(1); v.move(0, 0); return { st0, style: v.swim.style, state: v.swim.state }; });
  ok('stile «sott» non resta attivo a riva (Cranc)', sh.state === 'walk' && sh.style !== 'sott', sh);
  await ev(() => window.__vd.setHour(10));
});
await run('v7 sassi sommersi', async () => {
  const r = await ev(() => { const v = window.__vd; const sub = v.world.circles.filter((c) => c.y1 !== undefined); if (!sub.length) return { n: 0 };
    const c = sub[0]; const q = { x: c.x + c.r * 0.3, z: c.z }; v.world.resolve(q, 0.3, c.y1 - 1); const pushed = Math.hypot(q.x - c.x, q.z - c.z) >= c.r + 0.29;
    const q2 = { x: c.x + c.r * 0.3, z: c.z }; v.world.resolve(q2, 0.3, c.y1 + 0.5); const over = Math.abs(q2.x - (c.x + c.r * 0.3)) < 1e-6;
    return { n: sub.length, pushed, over }; });
  ok('sassi sommersi solidi per chi è alla loro altezza, superabili da sopra (Cranc)', r.n > 0 && r.pushed && r.over, r);
});
await run('v7 frecce', async () => {
  await ev(() => { const v = window.__vd; v.closeAll(); v.placeCar(-120, 82, -Math.PI / 2); v.teleport(-120, 84.4, Math.PI); v.enterCar(); });
  await sleep(500); await hud('in auto con frecce');
  const L = await ev(async () => { const v = window.__vd; v.setBlinker('L'); await new Promise((r) => setTimeout(r, 700)); const m = v.world.scene.children.find((o) => o.isGroup && o.userData.blinkU && o.visible && o.userData.blinkOn);
    const seen = new Set(); for (let i = 0; i < 16; i++) { await new Promise((r) => setTimeout(r, 90)); seen.add(m.userData.blinkU.uL.value + ':' + m.userData.blinkU.uR.value); }
    return { blink: v.blink, btn: document.getElementById('dBlinkL').classList.contains('on'), vis: m.userData.blink.visible, seen: [...seen].sort(), hudArrow: !!document.querySelector('#speedo .tind.l.lit') }; });
  ok('freccia sinistra: lampeggia solo a sinistra, tasto acceso, freccia nel tachimetro', L.blink === 'L' && L.btn && L.vis && L.seen.includes('1:0') && L.seen.includes('0:0') && !L.seen.some((x) => x.endsWith(':1')) && L.hudArrow, L);
  const R = await ev(async () => { const v = window.__vd; v.setBlinker('R'); await new Promise((r) => setTimeout(r, 700)); const m = v.world.scene.children.find((o) => o.isGroup && o.userData.blinkOn && o.visible); const seen = new Set();
    for (let i = 0; i < 16; i++) { await new Promise((r) => setTimeout(r, 90)); seen.add(m.userData.blinkU.uL.value + ':' + m.userData.blinkU.uR.value); } return { blink: v.blink, seen: [...seen].sort() }; });
  ok('freccia destra: lampeggia solo a destra', R.blink === 'R' && R.seen.includes('0:1') && !R.seen.some((x) => x.startsWith('1:')), R);
  // svolta a destra di ~90° e poi dritto: la freccia si spegne da sola
  // svolta a destra: sterzo a destra finché l'auto ha girato di ~90°, poi dritto → la freccia si spegne da sola
  const auto = await ev(async () => { const v = window.__vd; v.placeCar(-164, 80.5, -Math.PI / 2); const y0 = v.car.yaw; v.setDrive({ gas: 0.5, steerR: 1 });
    let turned = 0; for (let i = 0; i < 120 && turned < 1.4; i++) { await new Promise((r) => setTimeout(r, 100)); turned = Math.abs(Math.atan2(Math.sin(v.car.yaw - y0), Math.cos(v.car.yaw - y0))); }
    const during = v.blink; v.setDrive({ steerR: 0, gas: 0, brake: 1 }); for (let i = 0; i < 40 && v.blink; i++) await new Promise((r) => setTimeout(r, 100)); v.setDrive({ brake: 0 });
    return { during, turned: +turned.toFixed(2), blink: v.blink, car: v.car }; });
  ok('dopo la svolta la freccia si spegne da sola', auto.during === 'R' && auto.turned > 1.04 && auto.blink === null, auto);
  const H = await ev(async () => { const v = window.__vd; v.setBlinker('H'); await new Promise((r) => setTimeout(r, 700)); const m = v.world.scene.children.find((o) => o.isGroup && o.userData.blinkOn && o.visible); const seen = new Set();
    for (let i = 0; i < 16; i++) { await new Promise((r) => setTimeout(r, 90)); seen.add(m.userData.blinkU.uL.value + ':' + m.userData.blinkU.uR.value); }
    const ex = v.tryExit(); await new Promise((r) => setTimeout(r, 400)); return { seen: [...seen].sort(), ex, after: v.blink, parkedVis: m.userData.blink.visible, btn: document.getElementById('dHazard').classList.contains('on') }; });
  ok('quattro frecce: lampeggiano insieme e restano accese da parcheggiata', H.seen.includes('1:1') && H.seen.includes('0:0') && !H.seen.includes('1:0') && H.ex && H.after === 'H' && H.parkedVis, H);
  const n = await ev(async () => { const v = window.__vd; v.setHour(22); v.enterCar(); v.setBlinker('H'); await new Promise((r) => setTimeout(r, 900)); const hs = v.headSpot; v.tryExit(); v.setHour(10); await new Promise((r) => setTimeout(r, 900)); return { hs, off: v.headSpot }; });
  ok('di notte il faro dell\'auto guidata è acceso (unica luce in più)', n.hs > 10 && n.off === 0, n);
});
await run('v7 case', async () => {
  await ev(() => { const v = window.__vd; if (v.driving) v.tryExit(); });
  const r = await ev(async () => { const v = window.__vd; const W = () => new Promise((r) => setTimeout(r, 120)); v.closeAll(); v.teleport(-20, -6.4, Math.PI); await W(); const near = v.nearest; v.openAgency(); await W();
    const cards = document.querySelectorAll('#panelBody .house').length; const villaDis = document.querySelector('[data-buy="villa"]').disabled;
    v.state.money = 299999; const fail = v.Life.buyHouse(v.state, 'villa'); const m1 = v.state.money; v.state.money = 100000; v.openAgency(); await W();
    document.querySelector('[data-buy="bilocale"]').click(); await W(); const ctext = document.getElementById('confirmText').textContent; document.getElementById('confirmYes').click(); await W();
    const sv = JSON.parse(localStorage.getItem('vitaDistrict.v1.save'));
    return { near, cards, villaDis, fail: fail.ok, m1, ctext, money: v.state.money, owned: v.state.life.homes.owned, main: v.state.life.homes.main, saved: sv.life.homes, sign: v.world.houseSigns.bilocale.material === v.world.signMats.own }; });
  ok('agenzia: 5 case, villa troppo cara (299.999 non bastano, saldo intatto)', r.near === 'agency' && r.cards === 5 && r.villaDis && r.fail === false && r.m1 === 299999, r);
  ok('compra il bilocale: conferma con saldo prima/dopo, −45.000, casa principale, salvato, cartello «Casa tua»', /100\.000 → 55\.000/.test(r.ctext) && r.money === 55000 && r.owned.join() === 'soffitta,bilocale' && r.main === 'bilocale' && r.saved.main === 'bilocale' && r.sign, r);
  await ev(() => { const v = window.__vd; v.closeAll(); v.teleport(6, 37.6, Math.PI); }); await sleep(1600);
  await ev(() => { const v = window.__vd; v.openHouse('bilocale'); });
  const s = await ev(async () => { const v = window.__vd; const W = () => new Promise((r) => setTimeout(r, 120)); v.setHour(12); v.openHouse('bilocale'); await W(); const dis = document.getElementById('hSleep').disabled; const day0 = v.Life.gameDay(v.state.life);
    v.setHour(22); v.openHouse('bilocale'); await W(); document.getElementById('hSleep').click(); await W(); const q = v.player.root.position;
    return { dis, day0, day: v.Life.gameDay(v.state.life), hour: +v.Life.gameHour(v.state.life).toFixed(1), pos: [+q.x.toFixed(1), +q.z.toFixed(1)] }; });
  ok('dormire: di giorno no, di notte sì → 7:00 del giorno dopo, davanti a casa', s.dis && s.day === s.day0 + 1 && s.hour === 7 && Math.abs(s.pos[0] - 6) < 0.5 && Math.abs(s.pos[1] - 38) < 0.5, s);
});
await run('v7 lavoro', async () => {
  const r = await ev(async () => { const v = window.__vd; const W = () => new Promise((r) => setTimeout(r, 120)); v.closeAll(); v.setHour(10); v.openBarber(); await W();
    const btn = !!document.getElementById('jobBtn'); document.getElementById('jobBtn').click(); await W(); document.getElementById('jTake').click(); await W();
    const m0 = v.state.money; document.getElementById('jStart').click(); await W();
    const steps = []; for (let i = 0; i < 3; i++) { if (document.getElementById('tGo')) { v.forceTask(1); document.getElementById('tGo').click(); steps.push('bar'); } else { document.querySelector('[data-o="0"]').click(); steps.push('pick'); } await W(); }
    const slip = document.getElementById('panelBody').textContent; const paid = v.state.money - m0;
    v.closeAll(); v.openJob('barbiere'); await W(); const again = document.getElementById('jStart').disabled; const st2 = v.Life.startShift(v.state, 'barbiere');
    v.Life.takeJob(v.state, 'barista'); v.setHour(12); const other = v.Life.startShift(v.state, 'barista');
    v.state.life.clock.gameMs += v.Life.DAY_LEN_MS; v.setHour(10); const next = v.Life.startShift(v.state, 'barista'); v.Life.takeJob(v.state, 'barbiere'); v.state.life.work.shift = null; v.closeAll();
    return { btn, steps, paid, slip: /Busta paga/.test(slip), again, st2: st2.ok, other: other.ok, next: next.ok, shifts: v.state.life.work.shifts, payslips: v.state.life.work.payslips.length }; });
  ok('barbiere da Tonino: 3 compiti, busta paga 9.500 + mancia 1.900', r.btn && r.steps.join() === 'bar,pick,bar' && r.paid === 11400 && r.slip, r);
  ok('una paga per giorno: stesso giorno no (né qui né in un altro lavoro), il giorno dopo sì', r.again && r.st2 === false && r.other === false && r.next === true, r);
});
await run('v7 hud notte', async () => { await ev(() => window.__vd.setHour(22)); await sleep(400); await hud('notte'); await ev(() => window.__vd.setHour(10)); });

// ---- salvataggio e ricarica nel quartiere nuovo ----
await run('reload', async () => {
  const lifeBefore = await ev(() => JSON.stringify(window.__vd.state.life.homes));
  const before = await ev(() => { const v = window.__vd; v.teleport(-160, -152, 0); v.state.player = { x: -160, z: -152, yaw: 0 }; v.saveNow(); return { money: v.state.money, garage: v.state.garage.owned, shells: v.state.jobs.shells }; });
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => document.getElementById('loading').classList.contains('hidden'), { timeout: 120000 });
  await sleep(1200);
  const after = await ev(() => { const v = window.__vd; const q = v.player.root.position; return { money: v.state.money, garage: v.state.garage.owned, shells: v.state.jobs.shells, pos: [q.x, q.z], status: v.status }; });
  const lifeAfter = await ev(() => ({ homes: JSON.stringify(window.__vd.state.life.homes), topup: window.__vd.topup, v: JSON.parse(localStorage.getItem('vitaDistrict.v1.save')).version }));
  ok('ricarica: case possedute restano, nessun bonus ripetuto, schema 5', lifeAfter.homes === lifeBefore && !lifeAfter.topup && lifeAfter.v === 5, { lifeBefore, lifeAfter });
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
  const r = await p.evaluate(() => { const v = window.__vd; const s = v.state; const q = v.player.root.position; return { topup: v.topup, money: s.money, owned: s.garage.owned, sel: s.garage.selected, hair: +s.grooming.hairMm.toFixed(1), top: s.wardrobe.top, fish: s.records.fishCaught, jobs: s.jobs, status: v.status, backup: Object.keys(localStorage).filter((k) => k.includes('backup')), pos: [+q.x.toFixed(1), +q.z.toFixed(1)] }; });
  const keep = r.money === Math.max(100000, save.money) && r.topup === Math.max(0, 100000 - save.money) && JSON.stringify(r.owned) === JSON.stringify(save.garage.owned) && r.hair >= save.grooming.hairMm && r.top === 'top_camel' && r.fish === 3;
  ok(`migrazione ${tag}: niente perso`, keep && (tag === 'v3' ? r.status === 'migrated' && r.backup.includes('vitaDistrict.backup.v3') : r.status === 'migrated' && r.backup.includes('vitaDistrict.backup.v4') && r.jobs.courierPaid.includes('belvedere') && r.jobs.boccePaid.length === 3 && (tag !== 'v5' || (r.jobs.washed && r.jobs.washed.pode && r.jobs.seen5))), r);
  const bk = await p.evaluate((k) => localStorage.getItem(k), 'vitaDistrict.backup.v' + save.version);
  ok(`migrazione ${tag}: copia di sicurezza identica all'originale`, bk === JSON.stringify(save), bk && bk.length);
  await p.reload({ waitUntil: 'load' }); await p.waitForFunction(() => document.getElementById('loading').classList.contains('hidden'), { timeout: 120000 }); await sleep(800);
  const r2 = await p.evaluate(() => ({ money: window.__vd.state.money, topup: window.__vd.topup, status: window.__vd.status }));
  ok(`migrazione ${tag}: bonus 100.000 una volta sola (ricarica: +0)`, r2.money === r.money && !r2.topup && r2.status === 'loaded', r2);
  await b.close();
}
// salvataggio ricco: il bonus non abbassa mai
{
  const rich = { ...v5, money: 150000 };
  ({ b, p } = await open(url, { w: W, h: H, save: { 'vitaDistrict.v1.save': JSON.stringify(rich) } }));
  const r = await p.evaluate(() => ({ money: window.__vd.state.money, topup: window.__vd.topup, flag: window.__vd.state.life.grants.start100k }));
  ok('salvataggio con 150.000: resta 150.000, flag impostato', r.money === 150000 && !r.topup && r.flag === true, r);
  await b.close();
}
console.log(res.join('\n'));
console.log(`\n${res.length - fails}/${res.length} PASS`);
const errs = logs.filter((l) => !/ABORTED|favicon|404 \(File not found\)/.test(l));
console.log(errs.length ? 'CONSOLE:\n' + errs.join('\n') : 'CONSOLE: nessun errore');
process.exit(fails ? 1 : 0);
