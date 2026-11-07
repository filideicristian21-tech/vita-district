// VITA DISTRICT — loop di gioco, input, UI.
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import * as S from './state.js';
import { Avatar } from './avatar.js';
import { World } from './world.js';
import { PLACES } from './places.js';
import { MapUI } from './map.js';

const $ = (id) => document.getElementById(id);
const storage = (() => { try { const t = '__vd_test'; localStorage.setItem(S.KEY_PREFIX + t, '1'); localStorage.removeItem(S.KEY_PREFIX + t); return localStorage; } catch { return null; } })();
const memStore = { _m: new Map(), getItem(k) { return this._m.get(k) ?? null; }, setItem(k, v) { this._m.set(k, v); }, removeItem(k) { this._m.delete(k); }, key(i) { return [...this._m.keys()][i]; }, get length() { return this._m.size; } };
const store = storage || memStore;

// ---------- Stato ----------
let { state, status, credited } = S.loadState(store, Date.now());
let dirty = false;
const markDirty = () => { dirty = true; };
function saveNow() { const ok = S.saveState(store, state); dirty = false; return ok; }

// ---------- Renderer ----------
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(pixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#bcc6cc', 60, 190);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);

const hemi = new THREE.HemisphereLight('#cfe0ee', '#6b5e4c', 0.55); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff1dc', 2.6);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
const SC = sun.shadow.camera; SC.left = -32; SC.right = 32; SC.top = 32; SC.bottom = -32; SC.near = 1; SC.far = 140;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun); scene.add(sun.target);
const SUN_DIR = new THREE.Vector3(-0.55, 0.72, 0.42).normalize();

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();

// ---------- Mondo, giocatore, PNG ----------
const world = new World(scene, renderer);
const player = new Avatar();
const npcs = [];
let carryBox = null;
let mapUI;

const PLAYER_TINT = { Skin: '#c48c6c', Shirt: '#2d3a48', Pants: '#3b3f45', Eyes: '#1a1a1a' };

async function boot() {
  $('loadMsg').textContent = 'Carico cielo e materiali…';
  try {
    const hdr = await new RGBELoader().loadAsync('./assets/tex/sky_kloofendal_1k.hdr');
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = hdr; scene.background = hdr; scene.backgroundIntensity = 0.9; scene.environmentIntensity = 0.75;
  } catch { scene.background = new THREE.Color('#b8d1df'); }
  $('loadMsg').textContent = 'Costruisco il Rione Marea…';
  await world.build();
  $('loadMsg').textContent = 'Preparo i personaggi…';
  await player.load('./assets/chars/padrone.glb', { isPlayer: true, tint: PLAYER_TINT });
  scene.add(player.root);
  player.root.position.set(state.player.x, world.groundHeight(state.player.x, state.player.z), state.player.z);
  player.root.rotation.y = state.player.yaw;
  player.update(0.016);
  player.setGrooming(S.visibleLengths(state));
  carryBox = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.32), new THREE.MeshStandardMaterial({ color: '#a77b4f', roughness: 0.9 }));
  carryBox.position.set(0, 1.08, 0.32); carryBox.castShadow = true; player.root.add(carryBox);
  const tape = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.02, 0.08), new THREE.MeshStandardMaterial({ color: '#d9cba8' })); tape.position.y = 0.151; carryBox.add(tape);

  const npcDefs = [
    { id: 'tonino', url: 'pendolare.glb', x: -69.6, z: 15.6, ry: Math.PI / 2, tint: { Suit: '#e9e5dc', Tie: '#7a2e2a' }, anim: 'Idle' },
    { id: 'marta', url: 'cassiera.glb', x: -5, z: -17.75, ry: 0, tint: { White: '#f3efe6' }, anim: 'Idle' },
    { id: 'rocco', url: 'hoodie.glb', x: 64.2, z: 6.4, ry: Math.PI, tint: { Purple: '#3e5d3a' }, anim: 'Idle' },
    { id: 'bice', url: 'anziana.glb', x: 71.4, z: -7.3, ry: 0, tint: { Shirt: '#7b5a8a', Hair: '#cfcfcf', HairBase: '#bdbdbd' }, anim: 'Idle', h: 1.6 },
    { id: 'ugo', url: 'padrone.glb', x: -7, z: 25.85, ry: Math.PI, tint: { Shirt: '#6b6a5e', Hair: '#d6d6d6', Skin: '#c99a7c' }, anim: 'Sitting', y: 0.0 },
  ];
  for (const d of npcDefs) {
    const a = new Avatar(); await a.load('./assets/chars/' + d.url, { tint: d.tint, height: d.h || 1.74 });
    a.root.position.set(d.x, 0.12 + (d.y || 0), d.z); a.root.rotation.y = d.ry; a.play(d.anim); scene.add(a.root);
    a.id = d.id; npcs.push(a);
    if (d.id !== 'ugo') world.circles.push({ x: d.x, z: d.z, r: 0.35 });
  }
  // passanti che camminano sui marciapiedi
  const walkers = [
    { url: 'hoodie.glb', tint: { Purple: '#8a6d3b', LightBlue: '#2f3640' }, path: [[-40, 5.6], [40, 5.6]], speed: 1.25 },
    { url: 'cassiera.glb', tint: { White: '#2f4858' }, path: [[42, -5.6], [-38, -5.6]], speed: 1.15 },
    { url: 'pendolare.glb', tint: { Suit: '#3b3b44' }, path: [[-43.6, -60], [-43.6, 60]], speed: 1.35 },
  ];
  for (const w of walkers) {
    const a = new Avatar(); await a.load('./assets/chars/' + w.url, { tint: w.tint, height: 1.72 });
    a.root.position.set(w.path[0][0], 0.12, w.path[0][1]); a.play('Walk'); scene.add(a.root);
    a.walk = { ...w, t: Math.random(), dir: 1 }; npcs.push(a);
  }
  mapUI = new MapUI(world, state, { onWaypoint: setWaypoint, getPlayer: () => player.root.position, getYaw: () => player.root.rotation.y });
  $('loading').classList.add('hidden');
  if (status === 'corrupt') toast('Salvataggio illeggibile: nuova partita (il vecchio file non è stato usato).', 5000);
  else if (status === 'unavailable' || !storage) toast('Salvataggio non disponibile in questo browser: i progressi restano solo finché la pagina è aperta.', 6000);
  else if (status === 'loaded' && credited > 60 * 60 * 1000) toast(`Bentornato! Sono passati ${fmtDur(credited)}: barba e capelli sono cresciuti.`, 5000);
  if (state.grooming.clockAnomaly) toast("L'orologio del dispositivo è indietro rispetto all'ultimo salvataggio: crescita in pausa finché non si riallinea.", 6000);
  if (!state.tutorialDone) startTutorial();
  refreshHUD();
  requestAnimationFrame(loop);
}

function fmtDur(ms) {
  const h = ms / 3600000; if (h < 48) return `${Math.round(h)} ore`; return `${Math.round(h / 24)} giorni`;
}

// ---------- Input ----------
const input = { mx: 0, mz: 0, run: false, keys: new Set() };
const cam = { yaw: Math.PI + state.player.yaw, pitch: 0.32, dist: 3.6, curDist: 3.6 };
let joyId = null, joyOrigin = null, lookId = null, lookLast = null, mouseLook = false;
const touchEl = $('touch'), joyEl = $('joy'), knob = $('joyKnob');
let uiOpen = null; // 'map' | 'panel' | 'confirm' | 'menu'
let viewMode = 'follow'; // 'follow' | 'face'
let snapFace = false;

touchEl.addEventListener('pointerdown', (e) => {
  if (uiOpen) return;
  touchEl.setPointerCapture(e.pointerId);
  const leftSide = e.clientX < window.innerWidth * 0.45;
  if (e.pointerType === 'mouse') { lookId = e.pointerId; lookLast = { x: e.clientX, y: e.clientY }; mouseLook = true; return; }
  if (leftSide && joyId === null) {
    joyId = e.pointerId; joyOrigin = { x: e.clientX, y: e.clientY };
    joyEl.style.left = e.clientX + 'px'; joyEl.style.top = e.clientY + 'px'; joyEl.classList.remove('hidden');
    knob.style.transform = 'translate(0,0)';
    hintEvent('move');
  } else if (lookId === null) { lookId = e.pointerId; lookLast = { x: e.clientX, y: e.clientY }; }
});
touchEl.addEventListener('pointermove', (e) => {
  if (e.pointerId === joyId) {
    let dx = e.clientX - joyOrigin.x, dy = e.clientY - joyOrigin.y; const d = Math.hypot(dx, dy), R = 55;
    if (d > R) { dx *= R / d; dy *= R / d; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    input.mx = dx / R; input.mz = dy / R; input.run = d > R * 0.92;
  } else if (e.pointerId === lookId) {
    const dx = e.clientX - lookLast.x, dy = e.clientY - lookLast.y; lookLast = { x: e.clientX, y: e.clientY };
    const k = e.pointerType === 'mouse' ? 0.005 : 0.0075;
    cam.yaw -= dx * k; cam.pitch = THREE.MathUtils.clamp(cam.pitch + dy * k, -0.25, 1.15);
    if (Math.abs(dx) + Math.abs(dy) > 2) hintEvent('look');
  }
});
function endPointer(e) {
  if (e.pointerId === joyId) { joyId = null; input.mx = input.mz = 0; input.run = false; joyEl.classList.add('hidden'); }
  if (e.pointerId === lookId) { lookId = null; mouseLook = false; }
}
touchEl.addEventListener('pointerup', endPointer); touchEl.addEventListener('pointercancel', endPointer); touchEl.addEventListener('lostpointercapture', endPointer);
touchEl.addEventListener('wheel', (e) => { cam.dist = THREE.MathUtils.clamp(cam.dist + e.deltaY * 0.003, 2.2, 6); }, { passive: true });
function resetInputs() { joyId = null; lookId = null; input.mx = input.mz = 0; input.run = false; input.keys.clear(); joyEl.classList.add('hidden'); }
window.addEventListener('blur', resetInputs);
document.addEventListener('visibilitychange', () => { if (document.hidden) { resetInputs(); state.player = playerPose(); S.settleGrowth(state, Date.now()); saveNow(); } else { settle(); } });
window.addEventListener('pagehide', () => { state.player = playerPose(); saveNow(); });
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === 'escape') { if (uiOpen) closeAll(); else openMenu(); return; }
  if (uiOpen) return;
  input.keys.add(k);
  if (k === 'e' || k === 'enter') doInteract();
  if (k === 'm') openMap();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
});
window.addEventListener('keyup', (e) => input.keys.delete(e.key.toLowerCase()));

function keyMove() {
  let x = 0, z = 0; const K = input.keys;
  if (K.has('w') || K.has('arrowup')) z -= 1; if (K.has('s') || K.has('arrowdown')) z += 1;
  if (K.has('a') || K.has('arrowleft')) x -= 1; if (K.has('d') || K.has('arrowright')) x += 1;
  return { x, z, run: K.has('shift') };
}

// ---------- Interazioni ----------
function interactables() {
  const list = [
    { id: 'tonino', x: -68.6, z: 15.4, r: 2.6, label: 'Parla con Tonino', run: openBarber },
    { id: 'marta', x: -5, z: -16, r: 2.5, label: 'Ordina da Marta', run: openCafe },
    { id: 'rocco', x: 64.2, z: 6.4, r: 2.4, label: 'Parla con Rocco', run: openDepot },
    { id: 'ugo', x: -7, z: 25, r: 2.4, label: 'Saluta Nonno Ugo', run: talkUgo },
  ];
  if (state.delivery) {
    const p = PLACES['dl_' + state.delivery.target];
    list.push({ id: 'deliver', x: p.door.x, z: p.door.z + (p.door.z > 0 ? -1 : 1), r: 2.4, label: 'Consegna il pacco', run: () => deliver(state.delivery.target) });
  }
  return list;
}
let nearest = null;
function updateInteract() {
  const p = player.root.position; nearest = null; let best = 1e9;
  for (const it of interactables()) {
    const d = Math.hypot(p.x - it.x, p.z - it.z);
    if (d < it.r && d < best) {
      // niente interazioni attraverso i muri
      const o = new THREE.Vector3(p.x, 1.3, p.z), dir = new THREE.Vector3(it.x - p.x, 0, it.z - p.z);
      const len = dir.length(); dir.normalize();
      if (len > 0.3 && world.rayDistance(o, dir, len) < len - 0.35) continue;
      best = d; nearest = it;
    }
  }
  const b = $('btnAct');
  if (nearest && !uiOpen) { b.textContent = nearest.label; b.classList.remove('hidden'); }
  else b.classList.add('hidden');
}
let actLock = 0;
function doInteract() { if (!nearest || uiOpen || performance.now() < actLock) return; actLock = performance.now() + 400; resetInputs(); nearest.run(); }
$('btnAct').addEventListener('click', doInteract);

// ---------- UI helpers ----------
function toast(msg, ms = 2600) { const t = $('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), ms); }
function openPanel(html, { face = false } = {}) {
  $('panelBody').innerHTML = html; $('panel').classList.remove('hidden'); uiOpen = 'panel'; resetInputs();
  if (face && viewMode !== 'face') snapFace = true; viewMode = face ? 'face' : 'follow'; $('btnAct').classList.add('hidden');
  $('panelBody').scrollTop = 0;
}
function closeAll() {
  ['panel', 'mapView', 'confirm'].forEach((id) => $(id).classList.add('hidden'));
  uiOpen = null; viewMode = 'follow'; player.setGrooming(S.visibleLengths(state)); refreshHUD();
}
function confirmBox(text, yesLabel, onYes) {
  $('confirmText').textContent = text; $('confirmYes').textContent = yesLabel;
  $('confirm').classList.remove('hidden'); const prev = uiOpen; uiOpen = 'confirm';
  $('confirmNo').onclick = () => { $('confirm').classList.add('hidden'); uiOpen = prev; };
  $('confirmYes').onclick = () => { $('confirm').classList.add('hidden'); uiOpen = prev; onYes(); };
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function refreshHUD() {
  $('money').textContent = `${state.money} crediti`;
  const L = S.visibleLengths(state);
  $('look').textContent = `Capelli ${S.hairStage(L.hairMm)} ${L.hairMm.toFixed(1)} mm · ${S.beardStage(L.beardMm)} ${L.beardMm.toFixed(1)} mm`;
  const db = $('demoBadge'); if (state.grooming.demoDays > 0) { db.textContent = `DEMO: +${state.grooming.demoDays} gg simulati`; db.classList.remove('hidden'); } else db.classList.add('hidden');
  const ob = $('objective'); let txt = '';
  if (state.delivery) txt = `📦 Porta il pacco a: ${PLACES['dl_' + state.delivery.target].name} (+${state.delivery.reward})`;
  if (state.waypoint && PLACES[state.waypoint]) {
    const p = PLACES[state.waypoint]; const d = Math.round(Math.hypot(player.root.position.x - p.x, player.root.position.z - p.z));
    txt += (txt ? '<br>' : '') + `◆ ${esc(p.short)} · ${d} m`;
  }
  ob.innerHTML = txt; ob.classList.toggle('hidden', !txt);
  $('boost').classList.toggle('hidden', !(boostUntil > performance.now()));
}

// ---------- Waypoint ----------
const beacon = new THREE.Group();
{
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 30, 16, 1, true), new THREE.MeshBasicMaterial({ color: '#e6bb70', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
  col.position.y = 15; beacon.add(col);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.06, 8, 40), new THREE.MeshBasicMaterial({ color: '#e6bb70' })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.2; beacon.add(ring);
  beacon.visible = false; scene.add(beacon);
}
function setWaypoint(id) {
  state.waypoint = id; markDirty();
  if (id && PLACES[id]) toast(`Destinazione segnata: ${PLACES[id].name}`); else toast('Destinazione rimossa');
  hintEvent('map'); refreshHUD();
}

// ---------- Barbiere ----------
let barberSel = { hair: 'keep', beard: 'keep' };
function openBarber() {
  settle();
  const L = S.visibleLengths(state);
  // il giocatore si mette davanti alla poltrona, rivolto verso la vetrina
  player.root.position.set(-68, 0.12, 15.2); player.root.rotation.y = Math.PI; player.play('Idle');
  barberSel = { hair: 'keep', beard: 'keep' };
  const line = L.beardMm > 12 ? '«Ehi, ma quella è una barba o un nido? Siediti, ci penso io. Corta, media o lasciamo vivere il mito?»'
    : state.stats.haircuts === 0 ? '«Sei nuovo del rione? Siediti: capelli, barba o tutti e due? Prima ti faccio vedere, poi decidi.»'
    : '«Bentornato. Cosa sistemiamo oggi?»';
  renderBarber(line);
}
function renderBarber(line) {
  const L = S.visibleLengths(state);
  const prev = S.cutResult(L, barberSel.hair, barberSel.beard);
  player.setGrooming(prev);
  const price = S.haircutPrice(barberSel.hair, barberSel.beard);
  const hairBtns = S.HAIR_STYLES.map((s) => {
    const r = S.cutResult(L, s.id, 'keep').hairMm; const useless = s.id !== 'keep' && r >= L.hairMm - 0.05;
    return `<button data-h="${s.id}" class="${barberSel.hair === s.id ? 'sel' : ''}" ${useless ? 'disabled title="Già più corti di così"' : ''}>${esc(s.name)}</button>`; }).join('');
  const beardBtns = S.BEARD_STYLES.map((s) => {
    const r = S.cutResult(L, 'keep', s.id); const useless = s.id !== 'keep' && r.beardMm >= L.beardMm - 0.05 && r.shape === L.shape;
    return `<button data-b="${s.id}" class="${barberSel.beard === s.id ? 'sel' : ''}" ${useless ? 'disabled title="Niente da tagliare"' : ''}>${esc(s.name)}</button>`; }).join('');
  openPanel(`
    <h2>✂ Barberia «Lama d'Oro»</h2>
    <div class="say">${esc(line)}</div>
    <div class="stat"><span>Ora</span><span>capelli ${L.hairMm.toFixed(1)} mm · barba ${L.beardMm.toFixed(1)} mm (${esc(S.beardStage(L.beardMm))})</span>
    <span>Anteprima</span><span>capelli ${prev.hairMm.toFixed(1)} mm · barba ${prev.beardMm.toFixed(1)} mm</span></div>
    <h3>Capelli (${S.PRICES.hair} cr)</h3><div class="opts">${hairBtns}</div>
    <h3>Barba (${S.PRICES.beard} cr · insieme ai capelli ${S.PRICES.combo} cr)</h3><div class="opts">${beardBtns}</div>
    <div class="price">Totale: ${price} crediti <small>(hai ${state.money}) · crediti di gioco, senza valore reale</small></div>
    <small>L'anteprima è gratis: paghi solo con «Conferma taglio». Un taglio non allunga mai: per uno stile più lungo bisogna lasciar crescere.</small>
    <div class="row"><button class="pill" id="bCancel">Annulla</button><button class="pill primary" id="bOk" ${price === 0 || state.money < price ? 'disabled' : ''}>Conferma taglio · ${price} cr</button></div>
    ${demoBoxHTML()}
  `, { face: true });
  $('panelBody').querySelectorAll('[data-h]').forEach((b) => b.onclick = () => { barberSel.hair = b.dataset.h; renderBarber(line); });
  $('panelBody').querySelectorAll('[data-b]').forEach((b) => b.onclick = () => { barberSel.beard = b.dataset.b; renderBarber(line); });
  $('bCancel').onclick = () => closeAll();
  $('bOk').onclick = (e) => {
    e.target.disabled = true;
    const opId = Math.max(Date.now(), state.lastOpId + 1);
    const r = S.applyHaircut(state, barberSel.hair, barberSel.beard, Date.now(), opId);
    if (!r.ok) { toast(r.reason); renderBarber(line); return; }
    saveNow(); barberSel = { hair: 'keep', beard: 'keep' };
    player.setGrooming(S.visibleLengths(state)); refreshHUD();
    renderBarber('«Guardati. Adesso sì che sembri uno che paga l\'affitto in tempo.»');
    toast(`Taglio fatto: −${r.price} crediti. Salvato.`);
  };
  wireDemo(() => renderBarber(line));
}
function demoBoxHTML() {
  return `<div class="demoBox"><b>MODALITÀ DEMO</b> <small>— tempo simulato, separato dalla crescita reale</small><br>
  <small>Ogni tocco aggiunge 24 ore simulate: +${S.GROWTH.hairMmPerDay} mm capelli e +${S.GROWTH.beardMmPerDay} mm barba. Giorni demo: ${state.grooming.demoDays}.</small>
  <div class="row"><button class="pill" id="demoDay">DEMO: avanza 1 giorno</button><button class="pill" id="demoWeek">DEMO: +7 giorni</button><button class="pill" id="demoReset" ${state.grooming.demoDays ? '' : 'disabled'}>Ripristina demo</button></div></div>`;
}
function wireDemo(rerender) {
  const add = (n) => { for (let i = 0; i < n; i++) S.demoAdvanceDay(state); markDirty(); player.setGrooming(S.visibleLengths(state)); refreshHUD(); rerender(); };
  const d1 = $('demoDay'), d7 = $('demoWeek'), dr = $('demoReset');
  if (d1) d1.onclick = () => add(1); if (d7) d7.onclick = () => add(7);
  if (dr) dr.onclick = () => { S.demoReset(state); markDirty(); player.setGrooming(S.visibleLengths(state)); refreshHUD(); rerender(); };
}

// ---------- Specchio ----------
function openMirror() {
  settle();
  const L = S.visibleLengths(state); const g = state.grooming;
  const nextBeard = [[0.3, 'ombra'], [1.5, 'barba corta'], [4, 'barba media'], [12, 'barba folta'], [30, 'barba lunga']].find(([mm]) => g.beardMm < mm);
  const days = nextBeard ? (nextBeard[0] - g.beardMm) / S.GROWTH.beardMmPerDay : 0;
  player.setGrooming(L);
  openPanel(`<h2>🪞 Specchio</h2>
   <div class="stat"><span>Capelli</span><span>${L.hairMm.toFixed(2)} mm · ${esc(S.hairStage(L.hairMm))}</span>
   <span>Barba</span><span>${L.beardMm.toFixed(2)} mm · ${esc(S.beardStage(L.beardMm))} · forma ${esc({ full: 'piena', goatee: 'pizzetto', mustache: 'baffi' }[L.shape])}</span>
   <span>Crescita</span><span>${S.GROWTH.hairMmPerDay} mm/giorno capelli · ${S.GROWTH.beardMmPerDay} mm/giorno barba, anche a gioco chiuso (max ${S.GROWTH.offlineCapMs / S.DAY_MS} giorni per rientro)</span>
   <span>Ultimo taglio</span><span>${g.lastCutAt ? new Date(g.lastCutAt).toLocaleString('it-IT') : 'mai'}</span>
   ${nextBeard ? `<span>Prossimo stadio</span><span>${esc(nextBeard[1])} tra circa ${days < 1 ? Math.max(1, Math.round(days * 24)) + ' ore' : days.toFixed(1) + ' giorni'} (tempo reale)</span>` : ''}</div>
   ${g.clockAnomaly ? '<p class="say">Orologio del dispositivo indietro rispetto al salvataggio: crescita in pausa finché non torna in pari.</p>' : ''}
   ${demoBoxHTML()}
   <div class="row"><button class="pill primary" id="mClose">Chiudi</button></div>`, { face: true });
  $('mClose').onclick = closeAll; wireDemo(openMirror);
}

// ---------- Caffè ----------
let boostUntil = 0;
function openCafe() {
  const first = state.stats.coffees === 0;
  openPanel(`<h2>☕ Caffè Sottovento</h2>
   <div class="say">${first ? '«Il solito? No, aspetta, tu ancora un solito non ce l\'hai. Torna domani e te lo invento io.»' : '«Eccolo, il solito. Ormai sei del rione.»'}</div>
   <div class="stat"><span>Caffè</span><span>${S.PRICES.coffee} crediti · lo bevi subito o lo porti via (inventario)</span>
   <span>Effetto</span><span>passo più svelto per 2 minuti</span><span>Inventario</span><span>${state.inventory.coffee} caffè da asporto</span></div>
   <div class="row"><button class="pill primary" id="cDrink">Bevi al banco · ${S.PRICES.coffee} cr</button><button class="pill" id="cTake">Da asporto · ${S.PRICES.coffee} cr</button><button class="pill" id="cClose">Esci</button></div>
   <small>Crediti di gioco, senza valore reale.</small>`);
  $('cDrink').onclick = () => { const r = S.buy(state, 'coffee'); if (!r.ok) return toast(r.reason); S.consume(state, 'coffee'); drink(); saveNow(); openCafe(); };
  $('cTake').onclick = () => { const r = S.buy(state, 'coffee'); if (!r.ok) return toast(r.reason); saveNow(); toast('Caffè nel tuo inventario.'); openCafe(); };
  $('cClose').onclick = closeAll;
}
function drink() { boostUntil = performance.now() + 120000; toast('☕ Che botta! Passo svelto per 2 minuti.'); refreshHUD(); }

// ---------- Consegne ----------
function openDepot() {
  const d = state.delivery;
  const list = S.DELIVERY_SPOTS.map((s) => { const p = PLACES['dl_' + s.id]; const dist = Math.round(Math.hypot(p.x - 64, p.z - 6.4));
    return `<button data-d="${s.id}" ${d ? 'disabled' : ''}>${esc(s.name)}<br><small>~${dist} m in linea d'aria · +${s.reward} crediti</small></button>`; }).join('');
  openPanel(`<h2>📦 Consegne Lampo</h2>
    <div class="say">${d ? '«Il pacco ce l\'hai già. Segui il segnale sulla mappa, suona e aspetta.»' : '«Pacco per la signora Bice, terzo piano senza ascensore. È fragile, e lei pure: suona due volte e aspetta. Oppure ne ho altri, scegli tu.»'}</div>
    <h3>Incarichi (uno alla volta, premio alla consegna)</h3><div class="opts">${list}</div>
    <div class="row">${d ? '<button class="pill" id="dCancel">Annulla consegna (gratis)</button>' : ''}<button class="pill" id="dClose">Chiudi</button></div>
    <small>Consegne completate: ${state.stats.deliveries}</small>`);
  $('panelBody').querySelectorAll('[data-d]').forEach((b) => b.onclick = () => {
    const r = S.acceptDelivery(state, b.dataset.d); if (!r.ok) return toast(r.reason);
    saveNow(); closeAll(); toast(`Pacco preso! Destinazione: ${r.spot.name}. È segnata sulla mappa.`, 3500);
  });
  if (d) $('dCancel').onclick = () => { S.cancelDelivery(state); saveNow(); openDepot(); };
  $('dClose').onclick = closeAll;
}
function deliver(id) {
  const spot = S.DELIVERY_SPOTS.find((s) => s.id === id);
  const r = S.completeDelivery(state, id); if (!r.ok) return toast(r.reason);
  saveNow();
  openPanel(`<h2>Consegna completata</h2><div class="say">${esc(spot.line)}</div><p>+${r.reward} crediti${id === 'bice' ? ' · 🍬 caramella alla menta' : ''}</p>
   <div class="row"><button class="pill primary" id="okD">Continua</button></div>`);
  $('okD').onclick = closeAll;
}
function talkUgo() {
  const h = new Date().getHours();
  const line = h < 13 ? '«Il porto si sveglia prima di tutti. Poi tocca a me, poi al caffè.»' : '«Questo rione sembra piccolo, ma ogni vicolo ha una storia. Basta avere tempo di ascoltarla.»';
  openPanel(`<h2>Nonno Ugo</h2><div class="say">${line}</div><div class="row"><button class="pill primary" id="okU">Ciao, nonno</button></div>`);
  $('okU').onclick = closeAll;
}

// ---------- Menu / pausa ----------
let paused = false;
function openMenu() {
  paused = true;
  openPanel(`<h2>⏸ Pausa</h2>
   <div class="stat"><span>Crediti</span><span>${state.money}</span><span>Inventario</span><span>☕ ${state.inventory.coffee} · 🍬 ${state.inventory.candy}${state.delivery ? ' · 📦 1 pacco' : ''}</span>
   <span>Statistiche</span><span>${state.stats.deliveries} consegne · ${state.stats.haircuts} tagli · ${state.stats.coffees} caffè</span>
   <span>Salvataggio</span><span>${storage ? 'in questo browser (localStorage). Cancellando i dati del sito lo perdi.' : 'NON disponibile: solo in memoria.'}</span></div>
   <div class="row"><button class="pill primary" id="mResume">▶ Riprendi</button><button class="pill" id="mSave">💾 Salva ora</button><button class="pill" id="mMirror">🪞 Specchio e crescita</button>
   ${state.inventory.coffee > 0 ? '<button class="pill" id="mDrink">☕ Bevi caffè</button>' : ''}</div>
   <h3>Comandi</h3><small>iPhone: trascina a sinistra per camminare (fino al bordo = corsa), trascina a destra per girare la visuale, tasto in basso a destra per interagire. PC: WASD/frecce, Shift corsa, trascina col mouse, rotella zoom, E interagisci, M mappa, Esc menu.</small>
   <div class="row"><button class="pill" id="mTut">Rivedi guida</button><button class="pill danger" id="mReset">Elimina progressi…</button></div>
   <h3>Crediti e licenze</h3><small>three.js (MIT). Personaggi: Quaternius (CC0). Texture e cielo: ambientCG, Poly Haven (CC0). Lampioni e cespugli: Poly Haven (CC0). Auto: Quaternius, RGS_Dev (CC0). Dettagli in README.md / LICENSES.md.</small><br>
   <small>Prototipo v0.1.0 (20261107-2038) · non è Unreal Engine · grafica semplificata.</small>`);
  $('mResume').onclick = () => { paused = false; closeAll(); };
  $('mSave').onclick = () => { state.player = playerPose(); toast(saveNow() ? 'Salvato in questo browser.' : 'Salvataggio non riuscito.'); };
  $('mMirror').onclick = () => { paused = false; openMirror(); };
  if ($('mDrink')) $('mDrink').onclick = () => { S.consume(state, 'coffee'); drink(); saveNow(); paused = false; closeAll(); };
  $('mTut').onclick = () => { paused = false; closeAll(); state.tutorialDone = false; startTutorial(); };
  $('mReset').onclick = () => confirmBox('Vuoi eliminare i progressi di VITA DISTRICT salvati in questo browser (posizione, crediti, inventario, look, consegne)? L\'operazione non è annullabile. Gli altri siti e giochi non vengono toccati.', 'Elimina progressi', () => {
    S.resetSave(store); state = S.newState(Date.now()); mapUI.state = state;
    player.root.position.set(state.player.x, 0.12, state.player.z); player.setGrooming(S.visibleLengths(state));
    saveNow(); paused = false; closeAll(); toast('Progressi eliminati. Nuova partita.');
  });
}
$('btnMenu').onclick = () => { if (uiOpen === 'panel' || uiOpen === 'map') closeAll(); openMenu(); };
function openMap() { closeAll(); uiOpen = 'map'; resetInputs(); $('mapView').classList.remove('hidden'); mapUI.open(); hintEvent('mapOpen'); }
$('btnMap').onclick = openMap; $('mini').addEventListener('click', openMap);
$('mapClose').onclick = closeAll; $('mapCenter').onclick = () => mapUI.center();

// ---------- Tutorial (Anchor) ----------
const TUT = [
  { id: 'move', text: 'Trascina il dito a sinistra per camminare (PC: WASD).' },
  { id: 'look', text: 'Trascina nella zona a destra per guardarti intorno (PC: trascina col mouse).' },
  { id: 'mapOpen', text: 'Apri «Mappa»: il triangolo indica dove sei. Tocca il Barbiere per segnarlo.' },
  { id: 'map', text: "Segui il segnale dorato fino alla Barberia «Lama d'Oro» e premi «Parla con Tonino». Capelli e barba crescono anche a gioco chiuso." },
];
let tutStep = -1;
function startTutorial() { tutStep = 0; showHint(); }
function showHint() {
  if (tutStep < 0 || tutStep >= TUT.length) { $('hint').classList.add('hidden'); return; }
  $('hintText').textContent = TUT[tutStep].text; $('hint').classList.remove('hidden');
}
function hintEvent(id) { if (tutStep >= 0 && TUT[tutStep] && TUT[tutStep].id === id) { tutStep++; if (tutStep >= TUT.length) endTutorial(); else setTimeout(showHint, 600); } }
function endTutorial() { tutStep = -1; state.tutorialDone = true; markDirty(); $('hint').classList.add('hidden'); }
$('hintNext').onclick = () => { tutStep++; if (tutStep >= TUT.length) endTutorial(); else showHint(); };
$('hintSkip').onclick = endTutorial;

// ---------- Loop ----------
const clock = new THREE.Clock();
const tmpV = new THREE.Vector3(), camTarget = new THREE.Vector3(), camPos = new THREE.Vector3(), headPos = new THREE.Vector3();
let settleTimer = 0, saveTimer = 0, hudTimer = 0, miniTimer = 0, fpsAcc = 0, fpsN = 0, lowFps = 0;
let groundY = 0.12;
function playerPose() { const p = player.root.position; return { x: +p.x.toFixed(3), z: +p.z.toFixed(3), yaw: +player.root.rotation.y.toFixed(3) }; }
function settle() { S.settleGrowth(state, Date.now()); player.setGrooming(S.visibleLengths(state)); markDirty(); refreshHUD(); }

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  // FPS adattivo: se resta basso, riduco risoluzione e ombre
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 2) { const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; window.__fps = fps;
    if (fps < 28 && pixelRatio > 1) { lowFps++; if (lowFps >= 2) { pixelRatio = Math.max(1, pixelRatio - 0.25); renderer.setPixelRatio(pixelRatio); resize(); lowFps = 0; } } else lowFps = 0; }

  const p = player.root.position;
  const moving = updatePlayer(dt);
  if (!moving) player.play('Idle');
  const gy = world.groundHeight(p.x, p.z); groundY += (gy - groundY) * Math.min(1, dt * 12); p.y = groundY;
  carryBox.visible = !!state.delivery;

  if (!paused) { player.update(dt); for (const n of npcs) { n.update(dt); if (n.walk) walkNPC(n, dt); } }
  if (world.water) world.water.material.opacity = 0.82 + Math.sin(t * 2) * 0.03;
  if (world.barberPole) world.barberPole.rotation.y += dt * 1.5;

  // camera
  if (viewMode === 'face') {
    player.headBone.getWorldPosition(headPos);
    const fy = player.root.rotation.y; const fd = window.innerHeight > window.innerWidth ? 1.6 : 0.95; camPos.set(headPos.x + Math.sin(fy) * fd, headPos.y + 0.04, headPos.z + Math.cos(fy) * fd);
    if (snapFace) { camera.position.copy(camPos); snapFace = false; } else camera.position.lerp(camPos, Math.min(1, dt * 6)); camera.lookAt(headPos.x, headPos.y - 0.02, headPos.z);
    const portrait = window.innerHeight > window.innerWidth; camera.setViewOffset(window.innerWidth, window.innerHeight,
      portrait ? 0 : window.innerWidth * 0.2, portrait ? window.innerHeight * 0.22 : 0, window.innerWidth, window.innerHeight);
  } else {
    camera.clearViewOffset();
    camTarget.set(p.x, p.y + 1.55, p.z);
    const cp = Math.cos(cam.pitch);
    tmpV.set(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp);
    let free = world.rayDistance(camTarget, tmpV, cam.dist + 0.3) - 0.3;
    // non scendere sotto il terreno
    const maxByGround = tmpV.y < 0 ? (camTarget.y - 0.25) / -tmpV.y : 1e9;
    free = Math.max(0.6, Math.min(free, maxByGround, cam.dist));
    cam.curDist = free < cam.curDist ? free : cam.curDist + (free - cam.curDist) * Math.min(1, dt * 4);
    camera.position.copy(camTarget).addScaledVector(tmpV, cam.curDist);
    camera.lookAt(camTarget);
    // giocatore semitrasparente se la camera è molto vicina
  }
  // sole che segue il giocatore (ombre solo vicino)
  sun.position.set(p.x + SUN_DIR.x * 60, SUN_DIR.y * 60, p.z + SUN_DIR.z * 60); sun.target.position.set(p.x, 0, p.z);

  // waypoint
  const wp = state.waypoint && PLACES[state.waypoint];
  if (wp) { beacon.visible = true; beacon.position.set(wp.x, 0.12, wp.z); beacon.children[1].scale.setScalar(1 + Math.sin(t * 3) * 0.12);
    if (Math.hypot(p.x - wp.x, p.z - wp.z) < 2.2 && !wp.delivery) { state.waypoint = null; toast(`Sei arrivato: ${wp.name}`); markDirty(); }
  } else beacon.visible = false;

  settleTimer += dt; saveTimer += dt; hudTimer += dt; miniTimer += dt;
  if (settleTimer > 10) { settleTimer = 0; S.settleGrowth(state, Date.now()); if (!(uiOpen && viewMode === 'face')) player.setGrooming(S.visibleLengths(state)); }
  if (saveTimer > 4) { saveTimer = 0; if (dirty) { state.player = playerPose(); saveNow(); } }
  if (hudTimer > 0.5) { hudTimer = 0; if (!uiOpen) refreshHUD(); updateInteract(); }
  if (miniTimer > 0.15) { miniTimer = 0; mapUI.drawMini($('mini')); if (uiOpen === 'map') mapUI.draw(); }
  renderer.render(scene, camera);
}
function updatePlayer(dt) {
  const p = player.root.position;
  let moving = false;
  if (!uiOpen && !paused) {
    const km = keyMove();
    let mx = input.mx + km.x, mz = input.mz + km.z; const mag = Math.min(1, Math.hypot(mx, mz));
    if (mag > 0.12) {
      const ang = Math.atan2(mx, mz) + cam.yaw; // relativo alla camera
      const run = input.run || km.run;
      let speed = (run ? 4.6 : 1.55 + 0.6 * mag) * (boostUntil > performance.now() ? 1.25 : 1);
      if (!run) speed *= Math.max(0.5, mag);
      const dx = Math.sin(ang) * speed * dt, dz = Math.cos(ang) * speed * dt;
      p.x += dx; p.z += dz; world.resolve(p, 0.32, groundY);
      // rotazione morbida verso la direzione di marcia
      let dy = ang - player.root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      player.root.rotation.y += dy * Math.min(1, dt * 10);
      player.play(run ? 'Run' : 'Walk'); moving = true;
      const a = player.actions[run ? 'Run' : 'Walk']; if (a) a.timeScale = run ? 1 : THREE.MathUtils.clamp(speed / 1.6, 0.6, 1.3);
      markDirty();
    }
  }
  return moving;
}
function walkNPC(n, dt) {
  const w = n.walk; const [a, b] = w.path; const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  w.t += (w.speed * dt / len) * w.dir; if (w.t > 1) { w.t = 1; w.dir = -1; } if (w.t < 0) { w.t = 0; w.dir = 1; }
  const x = a[0] + (b[0] - a[0]) * w.t, z = a[1] + (b[1] - a[1]) * w.t;
  // si ferma se il giocatore è davanti
  const p = player.root.position; if (Math.hypot(p.x - x, p.z - z) < 1.1) { n.play('Idle'); return; } n.play('Walk');
  n.root.position.set(x, 0.12, z); n.root.rotation.y = Math.atan2((b[0] - a[0]) * w.dir, (b[1] - a[1]) * w.dir);
}

// API di test (solo build locale; disattivata nella release pubblica da build.sh)
const TEST_HOOK = false;
if (TEST_HOOK) window.__vd = {
  get state() { return state; }, S, PLACES, world, player, camera,
  teleport(x, z, yaw = 0) { player.root.position.set(x, world.groundHeight(x, z), z); player.root.rotation.y = yaw; cam.yaw = yaw + Math.PI; },
  setCam(yaw, pitch, dist) { cam.yaw = yaw; cam.pitch = pitch; if (dist) cam.dist = dist; },
  openBarber, openMirror, openCafe, openDepot, openMap, openMenu, closeAll, doInteract, get nearest() { updateInteract(); return nearest && nearest.id; },
  move(mx, mz, run = false) { input.mx = mx; input.mz = mz; input.run = run; },
  saveNow, endTutorial, renderer,
  step(sec) { for (let t = 0; t < sec; t += 1 / 30) updatePlayer(1 / 30); player.play('Idle'); },
};

boot().catch((e) => { $('loadMsg').textContent = 'Errore di caricamento: ' + e.message; console.error(e); });
