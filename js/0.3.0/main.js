// VITA DISTRICT — loop di gioco, input, UI.
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import * as S from './state.js';
import { Avatar } from './avatar.js';
import { World } from './world.js';
import { PLACES } from './places.js';
import { MapUI } from './map.js';
import { stepWalker, walkerPos } from './collide.js';
import { newCar, stepCar, fwdSpeed, kmh, carCircles, exitSpot } from './car.js';
import { buildCar, setWheels } from './carmodel.js';
import { DIALOGS, dialogHTML } from './dialog.js';

const $ = (id) => document.getElementById(id);
const storage = (() => { try { const t = '__vd_test'; localStorage.setItem(S.KEY_PREFIX + t, '1'); localStorage.removeItem(S.KEY_PREFIX + t); return localStorage; } catch { return null; } })();
const memStore = { _m: new Map(), getItem(k) { return this._m.get(k) ?? null; }, setItem(k, v) { this._m.set(k, v); }, removeItem(k) { this._m.delete(k); }, key(i) { return [...this._m.keys()][i]; }, get length() { return this._m.size; } };
const store = storage || memStore;

// ---------- Stato ----------
let { state, status, credited, readOnly } = S.loadState(store, Date.now());
let dirty = false;
const markDirty = () => { dirty = true; };
if (S.migrationGuide(state, status)) markDirty();
// readOnly: salvataggio di una versione più nuova del gioco, o partita aperta in un'altra scheda → non sovrascrivere.
function saveNow() {
  if (readOnly) { dirty = false; return false; }
  if (driving) syncDrivePose();
  const ok = S.saveState(store, state);
  if (ok) { dirty = false; saveNow.warned = false; } else if (!saveNow.warned) { saveNow.warned = true; toast('Salvataggio non riuscito (memoria piena o bloccata): riprovo tra poco.', 5000); }
  return ok;
}
window.addEventListener('storage', (e) => {
  if (e.key === S.SAVE_KEY && !readOnly) { readOnly = true; toast('Il gioco è stato salvato da un\'altra scheda: qui non salvo più. Ricarica la pagina per riprendere.', 7000); }
});

// ---------- Renderer ----------
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(pixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#c3ccd0', 55, 175);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);

const hemi = new THREE.HemisphereLight('#d6e4f0', '#5e5244', 0.45); scene.add(hemi);
const sun = new THREE.DirectionalLight('#ffe8cc', 3.0);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
const SC = sun.shadow.camera; SC.left = -26; SC.right = 26; SC.top = 26; SC.bottom = -26; SC.near = 1; SC.far = 140;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun); scene.add(sun.target);
const SUN_DIR = new THREE.Vector3(-0.55, 0.72, 0.42).normalize();

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h;
  camera.fov = h > w ? 66 : 52; // in verticale serve più campo
  camera.updateProjectionMatrix();
  checkRotate();
}
// Invito a ruotare: solo su dispositivi touch in verticale; non blocca (si può giocare comunque).
let rotateDismissed = (() => { try { return sessionStorage.getItem('vd.rot') === '1'; } catch { return false; } })();
function checkRotate() {
  const el = document.getElementById('rotate'); if (!el) return;
  const touch = matchMedia('(pointer:coarse)').matches;
  el.classList.toggle('hidden', !(touch && innerHeight > innerWidth && !rotateDismissed));
}
window.addEventListener('resize', resize); window.addEventListener('orientationchange', () => setTimeout(resize, 250)); resize();
$('rotateAnyway').onclick = () => { rotateDismissed = true; try { sessionStorage.setItem('vd.rot', '1'); } catch { /* ok */ } checkRotate(); };

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
    scene.environment = hdr; scene.background = hdr; scene.backgroundIntensity = 1.0; scene.environmentIntensity = 0.7; scene.backgroundBlurriness = 0.02;
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
  applyOutfit();
  buildRod();
  carryBox = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.32), new THREE.MeshStandardMaterial({ color: '#a77b4f', roughness: 0.9 }));
  carryBox.position.set(0, 1.08, 0.32); carryBox.castShadow = true; player.root.add(carryBox);
  const tape = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.02, 0.08), new THREE.MeshStandardMaterial({ color: '#d9cba8' })); tape.position.y = 0.151; carryBox.add(tape);

  const npcDefs = [
    { id: 'tonino', url: 'pendolare.glb', x: -69.6, z: 15.6, ry: Math.PI / 2, tint: { Suit: '#e9e5dc', Tie: '#7a2e2a' }, anim: 'Idle' },
    { id: 'marta', url: 'cassiera.glb', x: -5, z: -17.75, ry: 0, tint: { White: '#f3efe6' }, anim: 'Idle' },
    { id: 'rocco', url: 'hoodie.glb', x: 64.2, z: 6.4, ry: Math.PI, tint: { Purple: '#3e5d3a' }, anim: 'Idle' },
    { id: 'bice', url: 'anziana.glb', x: 71.4, z: -7.3, ry: 0, tint: { Shirt: '#7b5a8a', Hair: '#cfcfcf', HairBase: '#bdbdbd' }, anim: 'Idle', h: 1.6 },
    { id: 'ugo', url: 'padrone.glb', x: -7, z: 25.85, ry: Math.PI, tint: { Shirt: '#6b6a5e', Hair: '#d6d6d6', Skin: '#c99a7c' }, anim: 'Sitting', y: 0.0 },
    { id: 'saverio', url: 'pendolare.glb', x: -35.4, z: -88.6, ry: -Math.PI / 2, tint: { Suit: '#2c3a4a', Tie: '#c9a24a' }, anim: 'Idle' },
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
    a.mixer.timeScale = w.speed / 1.3; // passo coerente con la velocità
  }
  buildCars();
  mapUI = new MapUI(world, state, { onWaypoint: setWaypoint, getPlayer: () => player.root.position, getYaw: () => player.root.rotation.y });
  $('loading').classList.add('hidden');
  if (status === 'future') toast('Questo salvataggio è di una versione più nuova del gioco: non lo tocco. Partita temporanea, non salvata.', 7000);
  else if (status === 'migrated') toast('Salvataggio aggiornato alla v0.3 (copia di sicurezza conservata). Novità: la tua Vela è parcheggiata sul Porto, e a sud c\'è l\'Autosalone Miraggio.', 7000);
  else if (status === 'migrated-nobackup') toast('Non riesco a fare la copia di sicurezza del vecchio salvataggio: gioco in sola lettura per non perderlo.', 7000);
  else if (status === 'corrupt') toast('Salvataggio illeggibile: nuova partita (il file vecchio è stato messo da parte, non cancellato).', 5000);
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
const cam = { yaw: Math.PI + state.player.yaw, pitch: 0.28, dist: 3.4, curDist: 3.4, lastLook: -10, sYaw: Math.PI + state.player.yaw, sPitch: 0.28 };
let joyId = null, joyOrigin = null, lookId = null, lookLast = null, mouseLook = false;
const touchEl = $('touch'), joyEl = $('joy'), knob = $('joyKnob');
let uiOpen = null; // 'map' | 'panel' | 'confirm' | 'menu'
let viewMode = 'follow'; // 'follow' | 'face'
let snapFace = false;

touchEl.addEventListener('pointerdown', (e) => {
  if (uiOpen) return;
  touchEl.setPointerCapture(e.pointerId);
  const leftSide = e.clientX < window.innerWidth * (window.innerWidth > window.innerHeight ? 0.4 : 0.5);
  if (e.pointerType === 'mouse') { lookId = e.pointerId; lookLast = { x: e.clientX, y: e.clientY }; mouseLook = true; return; }
  if (leftSide && joyId === null && !driving) {
    joyId = e.pointerId; joyOrigin = { x: e.clientX, y: e.clientY };
    joyEl.style.left = e.clientX + 'px'; joyEl.style.top = e.clientY + 'px'; joyEl.classList.remove('hidden');
    knob.style.transform = 'translate(0,0)'; document.body.classList.add('joyActive');
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
    cam.yaw -= dx * k; cam.pitch = THREE.MathUtils.clamp(cam.pitch + dy * k, -0.25, 1.15); cam.lastLook = clock.elapsedTime;
    if (Math.abs(dx) + Math.abs(dy) > 2) hintEvent('look');
  }
});
function endPointer(e) {
  if (e.pointerId === joyId) { joyId = null; input.mx = input.mz = 0; input.run = false; joyEl.classList.add('hidden'); document.body.classList.remove('joyActive'); }
  if (e.pointerId === lookId) { lookId = null; mouseLook = false; }
}
touchEl.addEventListener('pointerup', endPointer); touchEl.addEventListener('pointercancel', endPointer); touchEl.addEventListener('lostpointercapture', endPointer);
touchEl.addEventListener('wheel', (e) => { cam.dist = THREE.MathUtils.clamp(cam.dist + e.deltaY * 0.003, 2.2, 6); }, { passive: true });
function resetInputs() { joyId = null; lookId = null; input.mx = input.mz = 0; input.run = false; input.keys.clear(); joyEl.classList.add('hidden'); document.body.classList.remove('joyActive'); }
window.addEventListener('blur', resetInputs);
document.addEventListener('visibilitychange', () => { if (document.hidden) { resetInputs(); state.player = playerPose(); S.settleGrowth(state, Date.now()); saveNow(); } else { settle(); } });
window.addEventListener('pagehide', () => { state.player = playerPose(); saveNow(); });
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === 'escape') { if (uiOpen === 'game') endGame(); else if (uiOpen) closeAll(); else openMenu(); return; }
  if (driving && !uiOpen) { input.keys.add(k); if (k === 'e' || k === 'f') tryExit(); if (k === 'm') openMap(); if (k === 'c') recenter(); if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault(); return; }
  if (uiOpen === 'game' && (k === ' ' || k === 'enter' || k === 'e')) { e.preventDefault(); gameAction(); return; }
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
    { id: 'shop', x: 24, z: -7.2, r: 2.4, label: 'Entra in Sartoria', run: openShop },
    { id: 'fish', x: world.fishSpot.x, z: world.fishSpot.z, r: 2.2, label: '🎣 Pesca', run: startFishing },
    { id: 'basket', x: world.shotSpot.x, z: world.shotSpot.z, r: 2.6, label: '🏀 Tiri liberi', run: startBasket },
  ];
  if (parked) list.push({ id: 'car', x: parked.x, z: parked.z, r: parked.spec.len / 2 + 1.4, label: `🚗 Sali · ${parked.spec.name}`, run: enterCar });
  list.push({ id: 'dealer', x: -36.4, z: -89.2, r: 2.8, label: 'Parla con Saverio · Autosalone', run: () => openDealer() });
  if (!(state.delivery && state.delivery.target === 'bice')) list.push({ id: 'bice', x: 71.4, z: -6.2, r: 2.2, label: 'Parla con la Signora Bice', run: () => openTalk('bice') });
  for (const b of world.benchSpots) if (!(b.x === -7 && b.z === 26)) list.push({ id: 'bench', x: b.x + Math.sin(b.ry) * 0.6, z: b.z + Math.cos(b.ry) * 0.6, r: 1.5, label: '🪑 Siediti', run: () => sitOn(b) });
  if (state.delivery) {
    const p = PLACES['dl_' + state.delivery.target];
    list.push({ id: 'deliver', x: p.door.x, z: p.door.z + (p.door.z > 0 ? -1 : 1), r: 2.4, label: 'Consegna il pacco', run: () => deliver(state.delivery.target) });
  }
  return list;
}
let nearest = null;
function updateInteract() {
  const p = player.root.position; nearest = null; let best = 1e9;
  if (driving) { $('btnAct').classList.add('hidden'); return; }
  for (const it of interactables()) {
    const d = Math.hypot(p.x - it.x, p.z - it.z);
    if (d < it.r && d < best) {
      // niente interazioni attraverso i muri
      const o = new THREE.Vector3(p.x, 1.3, p.z), dir = new THREE.Vector3(it.x - p.x, 0, it.z - p.z);
      const len = dir.length(); dir.normalize();
      if (len > 0.3 && it.id !== 'car' && world.rayDistance(o, dir, len) < len - 0.35) continue;
      best = d; nearest = it;
    }
  }
  const b = $('btnAct');
  if (sitting && !uiOpen) { b.textContent = 'Alzati'; b.classList.remove('hidden'); return; }
  if (nearest && !uiOpen) { b.textContent = nearest.label; b.classList.remove('hidden'); }
  else b.classList.add('hidden');
}
let actLock = 0;
function doInteract() {
  if (sitting) { standUp(); return; }
  updateInteract(); // mai agire su un bersaglio vecchio
  if (!nearest || uiOpen || performance.now() < actLock) return; actLock = performance.now() + 400; resetInputs(); nearest.run();
}
$('btnAct').addEventListener('click', doInteract);

// ---------- UI helpers ----------
function toast(msg, ms = 2600) { const t = $('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), ms); }
function openPanel(html, { face = false, talk = null } = {}) {
  $('panelBody').innerHTML = (talk ? `<button class="pill talk" id="pTalk">💬 Parla con ${esc(DIALOGS[talk].name)}</button>` : '') + html;
  if (talk) $('pTalk').onclick = () => openTalk(talk, true); $('panel').classList.remove('hidden'); uiOpen = 'panel'; resetInputs();
  const vm = face === 'body' ? 'body' : face ? 'face' : 'follow';
  if (vm !== 'follow' && viewMode !== vm) snapFace = true; viewMode = vm; $('btnAct').classList.add('hidden');
  $('panelBody').scrollTop = 0; document.body.classList.add('ui');
}
function closeAll() {
  ['panel', 'mapView', 'confirm'].forEach((id) => $(id).classList.add('hidden'));
  if (viewMode === 'face' || viewMode === 'body') cam.yaw = cam.sYaw = player.root.rotation.y + Math.PI; // uscita senza salto
  talk = null; dealerSel = null;
  document.body.classList.toggle('ui', !!sitting);
  uiOpen = null; paused = false; viewMode = 'follow'; shopSel = null; player.setGrooming(S.visibleLengths(state)); applyOutfit(); refreshHUD(); updateInteract();
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
  $('look').textContent = `✂ ${L.hairMm.toFixed(0)} mm · barba ${L.beardMm.toFixed(1)} mm`;
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
    <small>L'anteprima è gratis: paghi solo con «Conferma taglio». Un taglio non allunga mai: per uno stile più lungo bisogna lasciar crescere.</small>
    <div class="foot"><div class="price">Totale: ${price} crediti <small>(hai ${state.money}) · crediti di gioco</small></div>
    <div class="row"><button class="pill" id="bCancel">Annulla</button><button class="pill primary" id="bOk" ${price === 0 || state.money < price ? 'disabled' : ''}>Conferma taglio · ${price} cr</button></div></div>
    ${demoBoxHTML()}
  `, { face: true, talk: 'tonino' });
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
   <small>Crediti di gioco, senza valore reale.</small>`, { talk: 'marta' });
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
    <small>Consegne completate: ${state.stats.deliveries}</small>`, { talk: 'rocco' });
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
function talkUgo() { openTalk('ugo'); }
// ---------- Dialoghi a scelte (modulo dialog.js) ----------
let talk = null; // { id, asked, from }
function openTalk(id, fromPanel = false) {
  const prev = fromPanel && { tonino: openBarber, marta: openCafe, rocco: openDepot, saverio: () => openDealer() }[id];
  talk = { id, asked: [], back: prev || null };
  const h = new Date().getHours();
  talk.hello = id === 'ugo' ? (h < 13 ? 'Il porto si sveglia prima di tutti. Poi tocca a me, poi al caffè.' : 'Questo rione sembra piccolo, ma ogni vicolo ha una storia. Basta avere tempo di ascoltarla.') : null;
  renderTalk();
}
function renderTalk() {
  const t = talk; const keepCar = viewMode === 'car';
  openPanel(dialogHTML(t.id, t.asked, t.hello), keepCar ? { face: false } : {});
  if (keepCar) viewMode = 'car';
  const body = $('panelBody');
  body.querySelectorAll('[data-q]').forEach((b) => { b.onclick = () => { t.asked.push(+b.dataset.q); renderTalk(); body.scrollTop = body.scrollHeight; }; });
  body.querySelector('[data-bye]').onclick = () => { talk = null; closeAll(); toast(`${DIALOGS[t.id].name}: «${DIALOGS[t.id].bye}»`, 3200); };
  body.querySelector('[data-back]').onclick = () => { const back = t.back; talk = null; if (back) back(); else closeAll(); };
}

// ---------- Menu / pausa ----------
let paused = false;
function openMenu() {
  paused = true;
  openPanel(`<h2>⏸ Pausa</h2>
   <div class="stat"><span>Crediti</span><span>${state.money}</span><span>Inventario</span><span>☕ ${state.inventory.coffee} · 🍬 ${state.inventory.candy} · 🐟 ${state.inventory.fish || 0}${state.delivery ? ' · 📦 1 pacco' : ''}</span>
   <span>Statistiche</span><span>${state.stats.deliveries} consegne · ${state.stats.haircuts} tagli · ${state.stats.coffees} caffè</span>
   <span>Record</span><span>🎣 ${state.records.fishCaught} pesci${state.records.bestFishName ? ` (max ${esc(state.records.bestFishName)} ${state.records.bestFishG} g)` : ''} · 🏀 miglior serie ${state.records.basketBest}/${S.BASKET.shots}</span>
   <span>Salvataggio</span><span>${readOnly ? 'SOLA LETTURA (versione più nuova o altra scheda): non salvo.' : storage ? 'in questo browser (localStorage). Cancellando i dati del sito lo perdi.' : 'NON disponibile: solo in memoria.'}</span></div>
   <div class="row"><button class="pill primary" id="mResume">▶ Riprendi</button><button class="pill" id="mSave">💾 Salva ora</button><button class="pill" id="mMirror">🪞 Specchio e crescita</button>
   ${state.inventory.coffee > 0 ? '<button class="pill" id="mDrink">☕ Bevi caffè</button>' : ''}</div>
   <h3>Comandi</h3><small>${matchMedia('(pointer:coarse)').matches ? 'Pollice sinistro: cammina (fino al bordo = corsa). Pollice destro: gira la visuale. Tasto in basso a destra: interagisci. In auto: ◀ ▶ a sinistra, Frena/Accelera a destra, D/R da fermi, Scendi in alto a sinistra.' : 'WASD/frecce, Shift corsa, trascina col mouse, rotella zoom, E interagisci, M mappa, Esc menu. In auto: W gas, S freno (tenuto da fermi = retromarcia), A/D sterzo, C ricentra, E scendi.'}</small>
   <div class="row"><button class="pill" id="mTut">Rivedi guida</button>${document.fullscreenEnabled ? '<button class="pill" id="mFull">⛶ Schermo intero</button>' : ''}<button class="pill danger" id="mReset">Elimina progressi…</button></div>
   <h3>Crediti e licenze</h3><small>three.js (MIT). Personaggi: Quaternius (CC0). Texture e cielo: ambientCG, Poly Haven (CC0). Lampioni e cespugli: Poly Haven (CC0). Auto: Quaternius, RGS_Dev (CC0). Volti, abiti, vetrine, laghetto e campetto: procedurali. Dettagli in README.md / LICENSES.md.</small><br>
   <small>Prototipo v0.3.0 (20261108-0035) · grafica web semplificata, non fotorealistica. Auto e marchi inventati (procedurali), nessun logo reale.</small>`);
  $('mResume').onclick = () => closeAll();
  $('mSave').onclick = () => { state.player = playerPose(); toast(saveNow() ? 'Salvato in questo browser.' : 'Salvataggio non riuscito.'); };
  $('mMirror').onclick = () => { paused = false; openMirror(); };
  if ($('mDrink')) $('mDrink').onclick = () => { S.consume(state, 'coffee'); drink(); saveNow(); closeAll(); };
  $('mTut').onclick = () => { closeAll(); state.tutorialDone = false; startTutorial(); };
  if ($('mFull')) $('mFull').onclick = () => { (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => toast('Schermo intero non disponibile qui.')); };
  $('mReset').onclick = () => confirmBox('Vuoi eliminare i progressi di VITA DISTRICT salvati in questo browser (posizione, crediti, inventario, look, consegne)? L\'operazione non è annullabile. Gli altri siti e giochi non vengono toccati.', 'Elimina progressi', () => {
    if (S.resetSave(store) < 0) { toast('Non sono riuscito a eliminare i progressi (memoria del browser non accessibile).', 5000); return; }
    if (driving) leaveCar(player.root.position.x, player.root.position.z, true);
    state = S.newState(Date.now()); mapUI.state = state; boostUntil = 0; readOnly = false; placeParked();
    player.root.position.set(state.player.x, 0.12, state.player.z); player.setGrooming(S.visibleLengths(state)); applyOutfit();
    saveNow(); closeAll(); toast('Progressi eliminati. Nuova partita.');
  });
}
$('btnMenu').onclick = () => { if (uiOpen === 'game') endGame(); if (uiOpen === 'panel' || uiOpen === 'map') closeAll(); openMenu(); };
function openMap() { if (uiOpen === 'game') endGame(); if (sitting) standUp(); closeAll(); uiOpen = 'map'; resetInputs(); $('mapView').classList.remove('hidden'); mapUI.open(); hintEvent('mapOpen'); }
$('btnMap').onclick = openMap; $('mini').addEventListener('click', openMap);
$('mapClose').onclick = closeAll; $('mapCenter').onclick = () => mapUI.center();

// ---------- Tutorial (Anchor) ----------
const TOUCH = matchMedia('(pointer:coarse)').matches;
const TUT = [
  { id: 'move', text: TOUCH ? 'Pollice sinistro: trascina per camminare.' : 'WASD o frecce per camminare.' },
  { id: 'look', text: TOUCH ? 'Pollice destro: trascina per guardarti intorno.' : 'Trascina col mouse per girare la visuale.' },
  { id: 'mapOpen', text: 'Tocca la minimappa: scegli dove andare.' },
  { id: 'map', text: 'Segui il segnale dorato. Barba e capelli crescono anche a gioco chiuso.' },
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

// ---------- Abiti (Sartoria Marea) ----------
function applyOutfit(top = state.wardrobe.top, bottom = state.wardrobe.bottom) { player.setOutfit(S.ITEMS[top], S.ITEMS[bottom]); }
let shopSel = null;
function openShop(line) {
  if (sitting) standUp();
  player.root.position.set(24, 0.12, -6.6); player.root.rotation.y = 0; player.play('Idle'); // davanti alla vetrina, rivolto verso la strada (camera)
  if (!shopSel) shopSel = { top: state.wardrobe.top, bottom: state.wardrobe.bottom };
  applyOutfit(shopSel.top, shopSel.bottom);
  const W = state.wardrobe;
  const btn = (id) => { const it = S.ITEMS[id]; const own = W.owned.includes(id); const on = W.top === id || W.bottom === id; const sel = shopSel.top === id || shopSel.bottom === id;
    return `<button data-i="${id}" class="${sel ? 'sel' : ''}"><span class="sw" style="background:${it.color}"></span>${esc(it.name)}<br><small>${on ? 'indossato' : own ? 'nel tuo armadio' : it.price + ' cr'}</small></button>`; };
  const tops = Object.keys(S.ITEMS).filter((k) => S.ITEMS[k].slot === 'top').map(btn).join('');
  const bots = Object.keys(S.ITEMS).filter((k) => S.ITEMS[k].slot === 'bottom').map(btn).join('');
  const toBuy = [shopSel.top, shopSel.bottom].filter((id) => !W.owned.includes(id));
  const cost = toBuy.reduce((t, id) => t + S.ITEMS[id].price, 0);
  const changed = shopSel.top !== W.top || shopSel.bottom !== W.bottom;
  openPanel(`<h2>👕 Sartoria Marea</h2>
    <div class="say">${esc(line || (state.wardrobe.owned.length <= 2 ? '«Prova pure, lo specchio è gratis. Paghi solo quello che porti via.»' : '«Bentornato! Ti tengo da parte il tuo armadio, cambi quando vuoi.»'))}</div>
    <h3>Sopra</h3><div class="opts grid">${tops}</div>
    <h3>Sotto</h3><div class="opts grid">${bots}</div>
    <div class="foot"><div class="price">${toBuy.length ? `Da pagare: ${cost} crediti` : changed ? 'Già tuoi: cambio gratis' : 'Questo è quello che indossi'} <small>(hai ${state.money})</small></div>
    <div class="row"><button class="pill" id="sCancel">Esci senza cambiare</button><button class="pill primary" id="sOk" ${!changed || state.money < cost ? 'disabled' : ''}>${toBuy.length ? `Compra e indossa · ${cost} cr` : 'Indossa'}</button></div></div>
    <small>L'anteprima è sul tuo personaggio. Il cambio resta salvato. Crediti di gioco, senza valore reale.</small>`, { face: 'body' });
  $('panelBody').querySelectorAll('[data-i]').forEach((b) => b.onclick = () => { const it = S.ITEMS[b.dataset.i]; shopSel[it.slot === 'top' ? 'top' : 'bottom'] = b.dataset.i; openShop(line); });
  $('sCancel').onclick = () => { shopSel = null; closeAll(); };
  $('sOk').onclick = (e) => {
    e.target.disabled = true;
    for (const id of toBuy) { const r = S.buyItem(state, id); if (!r.ok) { toast(r.reason); openShop(line); return; } }
    S.equipItem(state, shopSel.top); S.equipItem(state, shopSel.bottom); saveNow(); refreshHUD();
    toast(toBuy.length ? `Comprato: −${cost} crediti. Salvato.` : 'Cambio fatto. Salvato.');
    openShop('«Ti sta bene. Davvero, non lo dico a tutti.»');
  };
}

// ---------- Panchine ----------
let sitting = null;
function sitOn(b) {
  sitting = b; player.root.position.set(b.x + Math.sin(b.ry) * 0.12, 0.12, b.z + Math.cos(b.ry) * 0.12); player.root.rotation.y = b.ry;
  player.play('Sitting', 0.4); cam.yaw = b.ry + Math.PI; toast('Ti siedi. Il rione scorre. (tocca «Alzati» per ripartire)'); updateInteract();
}
function standUp() { const b = sitting; sitting = null; if (b) player.root.position.set(b.x + Math.sin(b.ry) * 0.75, 0.12, b.z + Math.cos(b.ry) * 0.75); player.play('Idle'); updateInteract(); }

// ---------- Minigiochi: infrastruttura ----------
let game = null; // { kind, phase, t0, ... }
const gEl = { root: $('game'), title: $('gTitle'), info: $('gInfo'), bar: $('gBar'), zone: $('gZone'), zone2: $('gZone2'), mark: $('gMark'), act: $('gAct'), score: $('gScore') };
function gShow(title) { closeAll(); uiOpen = 'game'; resetInputs(); gEl.root.classList.remove('hidden'); gEl.title.textContent = title; $('btnAct').classList.add('hidden'); $('hint').classList.add('hidden'); }
function gZone(z0, z1, inner) { gEl.zone.style.left = z0 * 100 + '%'; gEl.zone.style.width = (z1 - z0) * 100 + '%';
  if (inner) { gEl.zone2.style.left = inner[0] * 100 + '%'; gEl.zone2.style.width = (inner[1] - inner[0]) * 100 + '%'; gEl.zone2.style.display = ''; } else gEl.zone2.style.display = 'none'; }
function gMark(v) { gEl.mark.style.left = (v * 100).toFixed(2) + '%'; }
$('gExit').onclick = () => endGame();
gEl.act.addEventListener('pointerdown', (e) => { e.preventDefault(); gameAction(); });
function endGame(msg) {
  if (!game) return; const g = game; game = null;
  gEl.root.classList.add('hidden'); uiOpen = null; viewMode = 'follow';
  rod.visible = false; line.visible = false; world.bobber.visible = false;
  if (g.kind === 'basket') { world.ball.position.set(world.shotSpot.x + 4.4, 0.24, world.shotSpot.z - 8); }
  cam.yaw = cam.sYaw = player.root.rotation.y + Math.PI; player.play('Idle');
  if (msg) toast(msg, 3500); refreshHUD(); updateInteract(); if (!showHint._off) showHint();
}

// ---------- Pesca ----------
let rod, line;
function buildRod() {
  rod = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.018, 2.2, 6), new THREE.MeshStandardMaterial({ color: '#3a2a1c', roughness: 0.5 }));
  stick.position.y = 1.1; rod.add(stick);
  const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 12), new THREE.MeshStandardMaterial({ color: '#9aa3a8', metalness: 0.7, roughness: 0.3 }));
  reel.rotation.z = Math.PI / 2; reel.position.set(0.04, 0.3, 0); rod.add(reel);
  rod.visible = false; scene.add(rod);
  line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#e8e8e8', transparent: true, opacity: 0.7 }));
  line.visible = false; line.frustumCulled = false; scene.add(line);
}
const FISH_ZONE = [0.4, 0.6];
function startFishing() {
  const f = world.fishSpot; player.root.position.set(f.x, 0.12, f.z); player.root.rotation.y = f.ry; player.play('Idle');
  game = { kind: 'fish', phase: 'cast', t0: clock.elapsedTime, hits: 0, taps: 0, bobZ: f.z + 3.2 };
  gShow('🎣 Laghetto dei Gelsi');
  gEl.score.textContent = `Pescati: ${state.records.fishCaught}`;
  gEl.info.textContent = 'Lancia la lenza e aspetta che il galleggiante vada sotto.';
  gEl.bar.style.visibility = 'hidden'; gEl.act.textContent = 'Lancia'; gEl.act.disabled = false;
  rod.visible = true; hintEvent('none');
}
function fishUpdate(t) {
  const g = game; const f = world.fishSpot; const bob = world.bobber;
  bob.position.set(f.x + 0.3, 0.16, g.bobZ);
  if (g.phase === 'wait') {
    bob.position.y += Math.sin(t * 2.2) * 0.012;
    if (t > g.biteAt) { g.phase = 'bite'; g.biteEnd = t + 1.3; gEl.info.innerHTML = '<b>Abbocca!</b> Tocca subito per ferrare!'; gEl.act.textContent = 'Ferra!'; }
  } else if (g.phase === 'bite') {
    bob.position.y = 0.16 - 0.06 - Math.abs(Math.sin(t * 18)) * 0.04;
    if (t > g.biteEnd) { g.phase = 'cast'; gEl.info.textContent = 'Troppo lento: il pesce ha mangiato l\'esca ed è sparito. Ritenta.'; gEl.act.textContent = 'Rilancia'; bob.visible = false; }
  } else if (g.phase === 'reel') {
    const pos = S.oscillator((t - g.reelT0) * 1000, g.period); g.pos = pos; gMark(pos);
    bob.position.z = g.bobZ - (g.hits / 3) * 2.6; bob.position.y = 0.16 + Math.sin(t * 12) * 0.02;
  }
  // canna in mano e lenza
  const hand = player.model.getObjectByName('PalmR') || player.model.getObjectByName('Palm.R') || player.headBone; const hp = new THREE.Vector3(); hand.getWorldPosition(hp);
  rod.position.copy(hp); rod.rotation.set(0, player.root.rotation.y, 0); rod.rotateX(g.phase === 'reel' ? 0.75 : 0.95);
  rod.updateMatrixWorld(); const tip = new THREE.Vector3(0, 2.2, 0).applyMatrix4(rod.matrixWorld);
  const pa = line.geometry.attributes.position; pa.setXYZ(0, tip.x, tip.y, tip.z); pa.setXYZ(1, bob.position.x, bob.position.y, bob.position.z); pa.needsUpdate = true;
  line.visible = bob.visible;
}
function fishAction(t) {
  const g = game;
  if (g.phase === 'cast') {
    g.phase = 'wait'; g.biteAt = t + 2 + Math.random() * 3.5; world.bobber.visible = true; g.hits = 0; g.taps = 0;
    gEl.info.textContent = 'Galleggiante in acqua… aspetta che vada sotto.'; gEl.act.textContent = 'Aspetta…'; gEl.bar.style.visibility = 'hidden';
  } else if (g.phase === 'wait') {
    g.phase = 'cast'; world.bobber.visible = false; gEl.info.textContent = 'Troppo presto: hai spaventato i pesci. Rilancia.'; gEl.act.textContent = 'Rilancia';
  } else if (g.phase === 'bite') {
    g.phase = 'reel'; g.reelT0 = t; g.period = 1300 - Math.random() * 300;
    gEl.bar.style.visibility = 'visible'; gZone(FISH_ZONE[0], FISH_ZONE[1]);
    gEl.info.textContent = 'Recupera: tocca quando la linea bianca è nella fascia verde (3 colpi).'; gEl.act.textContent = 'Recupera';
  } else if (g.phase === 'reel') {
    if (g.forced != null) { g.pos = g.forced; g.forced = null; }
    g.taps++; const hit = S.fishHit(g.pos, FISH_ZONE); if (hit) g.hits++;
    g.prec = (g.prec || 0) + (hit ? 1 - Math.abs(g.pos - 0.5) / 0.1 : 0);
    gEl.info.textContent = hit ? `Preso il ritmo! (${g.hits}/3)` : `Fuori tempo… (${g.hits}/3, errori ${g.taps - g.hits}/2)`;
    if (g.hits >= 3) {
      const q = Math.max(0, Math.min(1, g.prec / 3)); const fish = S.rollFish(Math.random, q); const best = S.recordFish(state, fish, Math.max(Date.now(), state.lastOpId + 1)); saveNow();
      g.phase = 'cast'; world.bobber.visible = false; gEl.bar.style.visibility = 'hidden';
      gEl.info.innerHTML = `<b>${esc(fish.name)} da ${fish.grams} g!</b> +${fish.reward} crediti${best ? ' · 🏆 nuovo record!' : ''}`;
      gEl.score.textContent = `Pescati: ${state.records.fishCaught}`; gEl.act.textContent = 'Lancia ancora'; player.play('Clapping', 0.2); setTimeout(() => game && game.kind === 'fish' && player.play('Idle'), 1600);
      refreshHUD();
    } else if (g.taps - g.hits >= 2) {
      g.phase = 'cast'; world.bobber.visible = false; gEl.bar.style.visibility = 'hidden';
      gEl.info.textContent = 'La lenza si è allentata: il pesce è scappato. Rilancia.'; gEl.act.textContent = 'Rilancia';
    } else g.period *= 0.9; // ogni colpo il pesce tira più veloce
  }
}

// ---------- Basket ----------
const AIM_ZONE = [0.5 - S.BASKET.aimTol / 2, 0.5 + S.BASKET.aimTol / 2];
function startBasket() {
  const sp = world.shotSpot; player.root.position.set(sp.x, 0.12, sp.z); player.root.rotation.y = sp.ry; player.play('Idle');
  game = { kind: 'basket', phase: 'aim', shot: 0, made: 0, t0: clock.elapsedTime, roundId: Math.max(Date.now(), state.lastOpId + 1) };
  gShow('🏀 Campetto del Molo'); gEl.bar.style.visibility = 'visible'; basketAimPhase();
}
function basketAimPhase() {
  const g = game; g.phase = 'aim'; g.phaseT0 = clock.elapsedTime;
  gEl.score.textContent = `Tiro ${g.shot + 1}/${S.BASKET.shots} · canestri ${g.made}`;
  gEl.info.textContent = '1) Mira: ferma la linea al centro.'; gEl.act.textContent = 'Mira'; gEl.act.disabled = false;
  gZone(0.5 - S.BASKET.aimTol / 2, 0.5 + S.BASKET.aimTol / 2, [0.5 - S.BASKET.aimTol * 0.2, 0.5 + S.BASKET.aimTol * 0.2]);
}
function basketUpdate(t, dt) {
  const g = game; const ball = world.ball; const hp = new THREE.Vector3();
  if (g.phase === 'aim' || g.phase === 'power') {
    const pos = S.oscillator((t - g.phaseT0) * 1000, g.phase === 'aim' ? 1500 : 1250); g.pos = pos; gMark(pos);
    player.model.getObjectByName('Head').getWorldPosition(hp);
    const fw = new THREE.Vector3(Math.sin(player.root.rotation.y), 0, Math.cos(player.root.rotation.y));
    ball.position.copy(hp).addScaledVector(fw, 0.35); ball.position.y -= 0.35;
  } else if (g.phase === 'fly') {
    const k = Math.min(1, (t - g.flyT0) / g.flyDur);
    const p = g.from.clone().lerp(g.to, k); p.y += Math.sin(Math.PI * k) * g.arc; ball.position.copy(p); ball.rotation.x -= dt * 8;
    if (k >= 1) { g.phase = 'drop'; g.vy = g.res.made ? -1.5 : 1.2; g.vel = g.res.made ? new THREE.Vector3(0, 0, -0.4) : g.missVel; if (g.res.made) world.net.scale.y = 1.35; }
  } else if (g.phase === 'drop') {
    g.vy -= 9.8 * dt; ball.position.y += g.vy * dt; ball.position.addScaledVector(g.vel, dt);
    world.net.scale.y += (1 - world.net.scale.y) * Math.min(1, dt * 6);
    if (ball.position.y < 0.24) { ball.position.y = 0.24; if (Math.abs(g.vy) > 1.5) g.vy = -g.vy * 0.55; else { g.vy = 0; nextShot(); } }
  }
}
function basketAction(t) {
  const g = game;
  if (g.forced != null) { g.pos = g.forced; g.forced = null; }
  if (g.phase === 'aim') { g.aim = (g.pos - 0.5) * 2; g.phase = 'power'; g.phaseT0 = t; gEl.info.textContent = '2) Potenza: ferma la linea nella fascia verde.';
    gEl.act.textContent = 'Tira!'; const ip = S.BASKET.idealPower, tol = S.BASKET.powerTol; gZone(ip - tol, ip + tol, [ip - tol * 0.45, ip + tol * 0.45]); return; }
  if (g.phase === 'power') {
    g.power = g.pos; const res = S.evalShot(g.aim, g.power); g.res = res; if (res.made) g.made++;
    player.play('Jump', 0.1); setTimeout(() => game && player.play('Idle', 0.3), 700);
    const h = world.hoop; g.from = world.ball.position.clone();
    const miss = { short: [0, -0.7, -0.6], long: [0, 0.35, 0.45], left: [0.45, 0, 0], right: [-0.45, 0, 0], invalid: [0, -1, -1] }[res.kind] || [0, 0, 0];
    // aim<0 = sinistra del tiratore (che guarda +z): sinistra = +x
    g.to = new THREE.Vector3(h.x + (res.made ? 0 : miss[0]), h.y + 0.12 + (res.made ? 0 : miss[1] * 0.3), h.z + (res.made ? 0 : miss[2]));
    g.arc = 1.6; g.flyT0 = t; g.flyDur = 1.0; g.phase = 'fly';
    g.missVel = new THREE.Vector3(miss[0] * 2, 0, res.kind === 'long' ? 1.2 : -1.5);
    const txt = { swish: 'Ciuff! Solo rete.', 'rim-in': 'Ferro… e dentro!', short: 'Corto: più potenza.', long: 'Lungo: meno potenza.', left: 'Fuori a sinistra.', right: 'Fuori a destra.' }[res.kind] || '';
    gEl.info.textContent = txt; gEl.act.textContent = '…'; gEl.act.disabled = true;
  }
}
function nextShot() {
  const g = game; g.shot++;
  if (g.shot >= S.BASKET.shots) {
    const r = S.finishBasketRound(state, g.made, g.roundId); if (r.ok) saveNow();
    g.phase = 'done'; gEl.act.disabled = false; gEl.act.textContent = 'Nuova serie';
    gEl.score.textContent = `${g.made}/${S.BASKET.shots}`;
    gEl.info.innerHTML = `<b>Serie finita: ${g.made}/${S.BASKET.shots}</b> · +${r.reward || 0} crediti${r.best ? ' · 🏆 record!' : ''}`;
    if (g.made >= 3) player.play('Clapping', 0.2); refreshHUD();
    return;
  }
  basketAimPhase();
}
function gameAction() {
  if (!game) return; const t = clock.elapsedTime;
  if (game.kind === 'fish') fishAction(t);
  else if (game.kind === 'basket') { if (game.phase === 'done') { endGame(); startBasket(); } else basketAction(t); }
}

// ---------- Loop ----------
const clock = new THREE.Clock();
const tmpV = new THREE.Vector3(), camTarget = new THREE.Vector3(), camPos = new THREE.Vector3(), headPos = new THREE.Vector3(), camTargetSm = new THREE.Vector3();
let settleTimer = 0, saveTimer = 0, hudTimer = 0, miniTimer = 0, fpsAcc = 0, fpsN = 0, lowFps = 0, camInit = false;
let groundY = 0.12;
function playerPose() { if (driving) return { ...footPose }; const p = player.root.position; return { x: +p.x.toFixed(3), z: +p.z.toFixed(3), yaw: +player.root.rotation.y.toFixed(3) }; }
function settle() { S.settleGrowth(state, Date.now()); player.setGrooming(S.visibleLengths(state)); markDirty(); refreshHUD(); }
const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

function loop() {
  requestAnimationFrame(loop);
  const raw = clock.getDelta(); const dt = Math.min(raw, 0.05);
  const t = clock.elapsedTime;
  // FPS adattivo misurato sul tempo REALE (non sul dt limitato)
  fpsAcc += raw; fpsN++;
  if (fpsAcc > 2) { const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; window.__fps = fps;
    if (fps < 28 && pixelRatio > 1) { lowFps++; if (lowFps >= 2) { pixelRatio = Math.max(1, pixelRatio - 0.25); renderer.setPixelRatio(pixelRatio); resize(); lowFps = 0; } } else lowFps = 0; }

  const p = player.root.position;
  if (driving) updateDriving(dt);
  const moving = driving ? false : updatePlayer(dt);
  if (!moving && !sitting && !game && player.current && /Walk|Run/.test(player.current.getClip().name)) player.play('Idle');
  const gy = world.groundHeight(p.x, p.z); groundY += (gy - groundY) * Math.min(1, dt * 12); p.y = sitting ? 0.12 : groundY;
  carryBox.visible = !!state.delivery && !game;
  if (driving) { carMesh.position.set(car.x, groundY - 0.12 + 0.02, car.z); carMesh.rotation.y = car.yaw; }

  if (!paused) { if (!driving) player.update(dt); cullNPCs(); for (const n of npcs) { if (n.walk) walkNPC(n, dt); if (n.root.visible) n.update(dt); } }
  if (world.water) world.water.material.opacity = 0.82 + Math.sin(t * 2) * 0.03;
  if (world.barberPole) world.barberPole.rotation.y += dt * 1.5;
  if (game && game.kind === 'fish') fishUpdate(t);
  if (game && game.kind === 'basket') basketUpdate(t, dt);

  // ---- camera ----
  const portrait = window.innerHeight > window.innerWidth;
  if (viewMode === 'car') {
    const d = world.displaySpots[dealerIdx()];
    camPos.set(d.x - 7.4, 2.3, d.z + 3.4);
    if (snapFace) { camera.position.copy(camPos); snapFace = false; } else camera.position.lerp(camPos, Math.min(1, dt * 4));
    camera.lookAt(d.x - 0.4, 0.75, d.z);
    const panel = $('panelBody').getBoundingClientRect(); const W = window.innerWidth, H = window.innerHeight;
    camera.setViewOffset(W, H, portrait ? 0 : Math.max(0, (W - (panel.width ? panel.left : W)) / 2), portrait ? Math.max(0, (H - (panel.height ? panel.top : H)) / 2) : 0, W, H);
  } else if (driving) {
    camera.clearViewOffset(); chaseCamera(dt, t);
  } else if (viewMode === 'face' || viewMode === 'body') {
    player.headBone.getWorldPosition(headPos);
    const body = viewMode === 'body';
    const fy = player.root.rotation.y; const fd = body ? (portrait ? 3.6 : 2.6) : (portrait ? 1.6 : 0.95);
    const ty = body ? headPos.y - 0.62 : headPos.y - 0.02;
    camPos.set(headPos.x + Math.sin(fy) * fd, body ? headPos.y - 0.35 : headPos.y + 0.04, headPos.z + Math.cos(fy) * fd);
    if (snapFace) { camera.position.copy(camPos); snapFace = false; } else camera.position.lerp(camPos, Math.min(1, dt * 6));
    camera.lookAt(headPos.x, ty, headPos.z);
    // il personaggio sta nella parte libera dello schermo (a sinistra del pannello, o sopra in verticale)
    const panel = $('panelBody').getBoundingClientRect(); const W = window.innerWidth, H = window.innerHeight;
    const offX = portrait ? 0 : Math.max(0, (W - (panel.width ? panel.left : W)) / 2);
    const offY = portrait ? Math.max(0, (H - (panel.height ? panel.top : H)) / 2) : 0;
    camera.setViewOffset(W, H, offX, offY, W, H);
  } else {
    camera.clearViewOffset();
    if (game) {
      // camera di gioco: alle spalle, verso il bersaglio
      const fy = player.root.rotation.y + Math.PI; cam.yaw = lerpAngle(cam.yaw, fy, Math.min(1, dt * 3)); cam.pitch += ((game.kind === 'basket' ? 0.12 : 0.5) - cam.pitch) * Math.min(1, dt * 3);
    } else if (moving && t - cam.lastLook > 1.6 && lookId === null) {
      // ricentraggio dolce dietro al personaggio mentre cammina (solo se il pollice destro è libero)
      cam.yaw = lerpAngle(cam.yaw, player.root.rotation.y + Math.PI, Math.min(1, dt * 0.9));
    }
    // smorzamento input camera
    const k = Math.min(1, dt * 14); cam.sYaw = lerpAngle(cam.sYaw, cam.yaw, k); cam.sPitch += (cam.pitch - cam.sPitch) * k;
    camTarget.set(p.x, p.y + (portrait ? 1.5 : 1.45), p.z);
    if (!camInit) { camTargetSm.copy(camTarget); camInit = true; } else camTargetSm.lerp(camTarget, Math.min(1, dt * 10));
    // spalla: leggero spostamento a destra per vedere la strada davanti
    const side = portrait ? 0 : 0.38; const rx = Math.cos(cam.sYaw), rz = -Math.sin(cam.sYaw);
    const tgt = tmpV.set(camTargetSm.x - rx * side, camTargetSm.y, camTargetSm.z - rz * side);
    const cp = Math.cos(cam.sPitch); const dir = camPos.set(Math.sin(cam.sYaw) * cp, Math.sin(cam.sPitch), Math.cos(cam.sYaw) * cp);
    const want = game ? (game.kind === 'basket' ? 3.0 : 4.2) : cam.dist;
    let free = world.rayDistance(tgt, dir, want + 0.3) - 0.3;
    const maxByGround = dir.y < 0 ? (tgt.y - 0.25) / -dir.y : 1e9;
    free = Math.max(0.6, Math.min(free, maxByGround, want));
    cam.curDist = free < cam.curDist ? free : cam.curDist + (free - cam.curDist) * Math.min(1, dt * 3);
    camera.position.copy(tgt).addScaledVector(dir, cam.curDist);
    if (game && game.kind === 'basket') camera.lookAt(world.hoop.x, world.hoop.y - 0.6, world.hoop.z); else camera.lookAt(tgt);
  }
  // sole che segue il giocatore (ombre nitide solo vicino), agganciato a griglia per evitare sfarfallio
  const sx = Math.round(p.x / 2) * 2, sz = Math.round(p.z / 2) * 2;
  sun.position.set(sx + SUN_DIR.x * 60, SUN_DIR.y * 60, sz + SUN_DIR.z * 60); sun.target.position.set(sx, 0, sz);

  // waypoint
  const wp = state.waypoint && PLACES[state.waypoint];
  if (wp) { beacon.visible = true; beacon.position.set(wp.x, 0.12, wp.z); beacon.children[1].scale.setScalar(1 + Math.sin(t * 3) * 0.12);
    if (Math.hypot(p.x - wp.x, p.z - wp.z) < 2.2 && !wp.delivery) { state.waypoint = null; toast(`Sei arrivato: ${wp.name}`); markDirty(); }
  } else beacon.visible = false;

  settleTimer += dt; saveTimer += dt; hudTimer += dt; miniTimer += dt;
  if (settleTimer > 10) { settleTimer = 0; S.settleGrowth(state, Date.now()); if (!(uiOpen && viewMode === 'face')) player.setGrooming(S.visibleLengths(state)); }
  if (saveTimer > 4) { saveTimer = 0; if (dirty) { state.player = playerPose(); saveNow(); } }
  if (hudTimer > 0.25) { hudTimer = 0; if (!uiOpen) refreshHUD(); updateInteract(); document.body.classList.toggle('ui', !!uiOpen || !!sitting); document.body.classList.toggle('driving', driving); }
  if (miniTimer > 0.15) { miniTimer = 0; mapUI.drawMini($('mini')); if (uiOpen === 'map') mapUI.draw(); }
  renderer.render(scene, camera);
}
function updatePlayer(dt) {
  const p = player.root.position;
  let moving = false;
  if (!uiOpen && !paused && !game) {
    const km = keyMove();
    let mx = input.mx + km.x, mz = input.mz + km.z; const mag = Math.min(1, Math.hypot(mx, mz));
    if (mag > 0.12) {
      if (sitting) standUp();
      const ang = Math.atan2(mx, mz) + cam.yaw; // relativo alla camera
      const run = input.run || km.run;
      let speed = (run ? 4.6 : 1.55 + 0.6 * mag) * (boostUntil > performance.now() ? 1.25 : 1);
      if (!run) speed *= Math.max(0.5, mag);
      const dx = Math.sin(ang) * speed * dt, dz = Math.cos(ang) * speed * dt;
      p.x += dx; p.z += dz; world.resolve(p, 0.32, groundY);
      let dy = ang - player.root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      player.root.rotation.y += dy * Math.min(1, dt * 9);
      player.play(run ? 'Run' : 'Walk'); moving = true;
      const a = player.actions[run ? 'Run' : 'Walk']; if (a) a.timeScale = run ? speed / 4.6 : THREE.MathUtils.clamp(speed / 1.6, 0.55, 1.3);
      markDirty();
    }
  }
  return moving;
}
function walkNPC(n, dt) {
  const w = n.walk; const cur = walkerPos(w);
  const p = player.root.position; const blocked = Math.hypot(p.x - cur.x, p.z - cur.z) < (driving ? 1.8 : 1.1);
  stepWalker(w, dt, blocked); // fermo = non accumula percorso
  const { x, z } = walkerPos(w); const [a, b] = w.path;
  if (blocked) { n.play('Idle'); return; } n.play('Walk');
  n.root.position.set(x, 0.12, z);
  const ry = Math.atan2((b[0] - a[0]) * w.dir, (b[1] - a[1]) * w.dir); n.root.rotation.y = lerpAngle(n.root.rotation.y, ry, Math.min(1, dt * 5));
}


// ======================= v0.3: AUTO =======================
// Auto parcheggiata (solida per il pedone) e auto guidata. Una sola auto del giocatore in scena + 3 in esposizione.
let driving = false, car = null, carMesh = null, parked = null, footPose = { ...state.player };
const carMeshes = {}; // id → Group (riutilizzati)
const parkedCircles = [0, 1, 2].map(() => ({ x: 1e6, z: 1e6, r: 0.1 }));
const drv = { steerL: 0, steerR: 0, gas: 0, brake: 0, gearR: false, kbStopT: 0, lookT: -10, warnT: 0 };
const OUT = { x: 1e6, z: 1e6 };
function carMeshFor(id) { if (!carMeshes[id]) { carMeshes[id] = buildCar(id, S.CARS[id]); scene.add(carMeshes[id]); } return carMeshes[id]; }
function buildCars() {
  world.circles.push(...parkedCircles);
  // esposizione: Vela, Bruma, Pode davanti all'Autosalone (solide)
  world.displayCars = ['vela', 'bruma', 'pode'].map((id, i) => { const d = world.displaySpots[i]; const m = buildCar(id, S.CARS[id]); m.position.set(d.x, 0.14, d.z); m.rotation.y = d.yaw; scene.add(m);
    for (const c of carCircles(newCar(S.CARS[id], d.x, d.z, d.yaw))) world.circles.push(c); return m; });
  placeParked();
}
function placeParked() {
  for (const m of Object.values(carMeshes)) m.visible = false;
  const g = state.garage; const spec = S.CARS[g.selected];
  parked = newCar(spec, g.car.x, g.car.z, g.car.yaw);
  carMesh = carMeshFor(g.selected); carMesh.visible = true; carMesh.position.set(parked.x, world.groundHeight(parked.x, parked.z) - 0.1, parked.z); carMesh.rotation.y = parked.yaw;
  setWheels(carMesh, 0, 0, 0);
  carCircles(parked).forEach((c, i) => Object.assign(parkedCircles[i], c));
}
function obstacles() { const out = []; for (const n of npcs) if (n.id !== 'ugo') out.push(n.root.position); return out; }
const carWorld = () => ({ boxes: world.boxes, circles: world.circles, obstacles: obstacles(), bounds: S.BOUNDS });
function enterCar() {
  if (!parked || driving) return;
  if (sitting) standUp();
  footPose = playerPose();
  car = parked; parked = null; parkedCircles.forEach((c) => Object.assign(c, OUT, { r: 0.1 }));
  driving = true; drv.gearR = false; Object.assign(drv, { steerL: 0, steerR: 0, gas: 0, brake: 0, kbStopT: 0 });
  player.root.visible = false; resetInputs(); closeAll();
  cam.yaw = cam.sYaw = car.yaw + Math.PI; cam.pitch = cam.sPitch = 0.26; drv.lookT = -10; cam.curDist = car.spec.len * 1.25 + 2.4; camInit = false;
  document.body.classList.add('driving'); updateDriveUI(); refreshHUD();
  toast(TOUCH ? `${car.spec.name}: Accelera a destra, ◀ ▶ a sinistra. Da fermo, D/R per la retromarcia.` : `${car.spec.name}: W gas, S freno (tieni S da fermo per la retro), A/D sterzo, E per scendere.`, 4200);
  hintEvent('drive');
}
function syncDrivePose() {
  state.garage.car = { x: +car.x.toFixed(2), z: +car.z.toFixed(2), yaw: +car.yaw.toFixed(3) };
  const sp = exitSpot({ ...car, vx: 0, vz: 0 }, carWorld(), (o, d, l) => world.rayDistance(o, d, l));
  if (sp.ok) footPose = { x: +sp.x.toFixed(3), z: +sp.z.toFixed(3), yaw: car.yaw };
  state.player = { ...footPose };
}
function tryExit() {
  if (!driving) return false;
  const sp = exitSpot(car, carWorld(), (o, d, l) => world.rayDistance(o, d, l));
  if (!sp.ok) { toast(sp.reason === 'fast' ? 'Rallenta e fermati per scendere.' : 'Qui non c\'è spazio per aprire la portiera: accosta in un punto più libero.', 2600); return false; }
  leaveCar(sp.x, sp.z); return true;
}
function leaveCar(x, z, silent = false) {
  car.vx = car.vz = 0; car.steer = 0;
  state.garage.car = { x: +car.x.toFixed(2), z: +car.z.toFixed(2), yaw: +car.yaw.toFixed(3) };
  parked = car; car = null; driving = false;
  carCircles(parked).forEach((c, i) => Object.assign(parkedCircles[i], c));
  player.root.visible = true; player.root.position.set(x, world.groundHeight(x, z), z);
  player.root.rotation.y = Math.atan2(x - parked.x, z - parked.z); player.play('Idle');
  cam.yaw = cam.sYaw = player.root.rotation.y + Math.PI; camInit = false;
  document.body.classList.remove('driving'); $('unstuck').classList.add('hidden');
  footPose = playerPose(); state.player = footPose; markDirty(); if (!silent) saveNow(); updateInteract();
}
// «Rimetti in strada»: riporta l'auto ferma sulla corsia più vicina, allineata alla strada. Nessuna penalità.
function unstuck() {
  if (!driving) return;
  const roads = world.mapShapes.filter((m) => m.type === 'road');
  let best = null;
  for (const r of roads) {
    const alongX = (r.x1 - r.x0) > (r.z1 - r.z0);
    const cx = alongX ? THREE.MathUtils.clamp(car.x, r.x0 + 4, r.x1 - 4) : (r.x0 + r.x1) / 2 + 1.4;
    const cz = alongX ? (r.z0 + r.z1) / 2 - 1.4 : THREE.MathUtils.clamp(car.z, r.z0 + 4, r.z1 - 4);
    for (const off of [0, 6, -6, 12, -12]) {
      const x = alongX ? cx + off : cx, z = alongX ? cz : cz + off; const yaw = alongX ? Math.PI / 2 : 0;
      const test = newCar(car.spec, x, z, yaw);
      const free = carCircles(test).every((c) => { const q = { x: c.x, z: c.z }; world.resolve(q, c.r, 0.12); return Math.hypot(q.x - c.x, q.z - c.z) < 1e-4; });
      const d = Math.hypot(x - car.x, z - car.z);
      if (free && (!best || d < best.d)) best = { x, z, yaw, d };
      if (free) break;
    }
  }
  if (!best) { toast('Non trovo un punto libero: prova a scendere e risalire.'); return; }
  Object.assign(car, { x: best.x, z: best.z, yaw: Math.cos(car.yaw - best.yaw) >= 0 ? best.yaw : best.yaw + Math.PI, vx: 0, vz: 0, steer: 0, stuckT: 0 });
  cam.yaw = cam.sYaw = car.yaw + Math.PI; $('unstuck').classList.add('hidden'); toast('Auto rimessa in strada.');
}
function recenter() { drv.lookT = -10; cam.yaw = car ? car.yaw + Math.PI : cam.yaw; cam.pitch = 0.26; }
function driveInput(dt) {
  const K = input.keys; const v = fwdSpeed(car); const stopped = Math.abs(v) < 0.3;
  let steer = drv.steerL - drv.steerR; if (K.has('a') || K.has('arrowleft')) steer += 1; if (K.has('d') || K.has('arrowright')) steer -= 1;
  let thr = drv.gas, brk = drv.brake;
  const kf = K.has('w') || K.has('arrowup'), kb = K.has('s') || K.has('arrowdown') || K.has(' ');
  // tastiera: S frena; tenuta da fermi per 0.35 s inserisce la R (mai retromarcia immediata dalla frenata)
  if (kb) { if (!drv.gearR) { brk = 1; drv.kbStopT = stopped ? drv.kbStopT + dt : 0; if (drv.kbStopT > 0.35 && !K.has(' ')) { drv.gearR = true; drv.kbStopT = 0; } } else thr = 1; } else drv.kbStopT = 0;
  if (kf) { if (drv.gearR) { if (stopped) drv.gearR = false; else brk = 1; } if (!drv.gearR) thr = 1; }
  return { steer: Math.max(-1, Math.min(1, steer)), throttle: thr, brake: brk, reverse: drv.gearR };
}
function updateDriving(dt) {
  if (uiOpen || paused) return; // pausa sicura: auto ferma nel tempo finché c'è un pannello aperto
  const inp = driveInput(dt);
  stepCar(car, inp, dt, carWorld());
  const p = player.root.position; p.x = car.x; p.z = car.z; player.root.rotation.y = car.yaw;
  const v = fwdSpeed(car); const roll = THREE.MathUtils.clamp(-car.steer * v * Math.abs(v) * 0.0009, -0.05, 0.05);
  setWheels(carMesh, car.wheelRot, car.steer, roll);
  if (car.stuckT > 2.2) $('unstuck').classList.remove('hidden');
  if (car.hit && Math.abs(v) > 6 && clock.elapsedTime - drv.warnT > 2) { drv.warnT = clock.elapsedTime; }
  markDirty(); updateDriveUI();
}
function updateDriveUI() {
  if (!car) return; const v = fwdSpeed(car); const stopped = Math.abs(v) < 1;
  $('speedo').innerHTML = `<b>${kmh(car)}</b> km/h <span class="gear ${drv.gearR ? 'r' : ''}">${drv.gearR ? 'R' : 'D'}</span>`;
  const g = $('dGear'); g.textContent = drv.gearR ? 'R → D' : 'D → R'; g.disabled = !stopped; g.classList.toggle('dim', !stopped);
}
function chaseCamera(dt, t) {
  const v = fwdSpeed(car);
  const look = t - drv.lookT < 1.6 || lookId !== null;
  const behind = car.yaw + (v < -0.5 ? 0 : Math.PI); // in retromarcia guarda avanti al senso di marcia
  if (!look) { cam.yaw = lerpAngle(cam.yaw, behind, Math.min(1, dt * 2.6)); cam.pitch += (0.26 - cam.pitch) * Math.min(1, dt * 2); }
  const k = Math.min(1, dt * 10); cam.sYaw = lerpAngle(cam.sYaw, cam.yaw, k); cam.sPitch += (cam.pitch - cam.sPitch) * k;
  const tgt = camTarget.set(car.x, 1.55 + (car.spec.kind === 'SUV' ? 0.25 : 0), car.z);
  if (!camInit) { camTargetSm.copy(tgt); camInit = true; } else camTargetSm.lerp(tgt, Math.min(1, dt * 12));
  const cp = Math.cos(cam.sPitch); const dir = camPos.set(Math.sin(cam.sYaw) * cp, Math.sin(cam.sPitch), Math.cos(cam.sYaw) * cp);
  const want = car.spec.len * 1.25 + 2.4 + Math.min(2.2, Math.abs(v) * 0.06);
  let free = world.rayDistance(camTargetSm, dir, want + 0.3) - 0.3; free = Math.max(1.2, Math.min(free, want));
  cam.curDist = free < cam.curDist ? free : cam.curDist + (free - cam.curDist) * Math.min(1, dt * 2.5);
  camera.position.copy(camTargetSm).addScaledVector(dir, cam.curDist);
  camera.lookAt(camTargetSm.x, camTargetSm.y + 0.15, camTargetSm.z);
  const fov = (window.innerHeight > window.innerWidth ? 66 : 52) + Math.min(8, Math.abs(v) * 0.22);
  if (Math.abs(camera.fov - fov) > 0.1) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix(); }
}
// pedali e sterzo touch: ogni pulsante tiene il suo dito (multi-touch reale)
function holdBtn(id, on, off) {
  const el = $(id); let pid = null;
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); pid = e.pointerId; try { el.setPointerCapture(pid); } catch { /* ok */ } el.classList.add('on'); on(); });
  const end = (e) => { if (e.pointerId !== pid) return; pid = null; el.classList.remove('on'); off(); };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('lostpointercapture', end);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
holdBtn('dLeft', () => { drv.steerL = 1; }, () => { drv.steerL = 0; });
holdBtn('dRight', () => { drv.steerR = 1; }, () => { drv.steerR = 0; });
holdBtn('dGas', () => { drv.gas = 1; }, () => { drv.gas = 0; });
holdBtn('dBrake', () => { drv.brake = 1; }, () => { drv.brake = 0; });
$('dGear').onclick = () => { if (!car || Math.abs(fwdSpeed(car)) >= 1) return toast('Fermati per cambiare tra D e R.'); drv.gearR = !drv.gearR; updateDriveUI(); };
$('dExit').onclick = () => tryExit();
$('dCam').onclick = () => recenter();
$('unstuck').onclick = () => unstuck();
window.addEventListener('blur', () => Object.assign(drv, { steerL: 0, steerR: 0, gas: 0, brake: 0 }));
// trascinare la visuale in auto: segna il momento per non ricentrare subito
touchEl.addEventListener('pointermove', (e) => { if (driving && e.pointerId === lookId) drv.lookT = clock.elapsedTime; });

// ---------- Autosalone Miraggio ----------
let dealerSel = null;
const DEALER_LINES = { pode: 'Questa non la guidi, la indossi. Però in curva mano leggera: il retro scappa.', vela: 'Piccola ma furba. Nel rione la parcheggi dove gli altri girano tre volte.', bruma: 'Alta e tranquilla: frena bene e non si scompone. Nei vicoli però con calma.' };
const DEALER_ORDER = ['vela', 'bruma', 'pode'];
const dealerIdx = () => Math.max(0, DEALER_ORDER.indexOf(dealerSel || 'vela'));
function bar(v, max) { return `<i class="sb"><i style="width:${Math.round(Math.min(1, v / max) * 100)}%"></i></i>`; }
function openDealer(line) {
  if (driving) return;
  if (sitting) standUp();
  if (!dealerSel) dealerSel = state.garage.selected;
  player.root.position.set(-37.2, 0.12, -89.6); player.root.rotation.y = -Math.PI / 2;
  const id = dealerSel, c = S.CARS[id], G = state.garage, own = G.owned.includes(id), sel = G.selected === id;
  const tabs = DEALER_ORDER.map((k) => `<button data-c="${k}" class="${k === id ? 'sel' : ''}"><span class="sw" style="background:${S.CARS[k].color}"></span>${esc(S.CARS[k].name)}<br><small>${G.owned.includes(k) ? (G.selected === k ? 'in uso' : 'tua') : S.CARS[k].price + ' cr'}</small></button>`).join('');
  const action = sel ? `<button class="pill" disabled>✓ È la tua auto in uso</button>`
    : own ? `<button class="pill primary" id="kUse">Usa la ${esc(c.name)} (gratis)</button>`
    : `<button class="pill primary" id="kBuy" ${state.money < c.price ? 'disabled' : ''}>Prendi con ${c.price} crediti</button>`;
  const short = !own && state.money < c.price ? `<small class="warn">Crediti insufficienti. Completa altre consegne per guadagnare crediti.</small>` : '';
  openPanel(`<h2>🚗 Autosalone Miraggio</h2>
    <div class="notice">Acquisto simulato · solo crediti di gioco · nessun denaro reale</div>
    <div class="say">«${esc(line || DEALER_LINES[id])}»</div>
    <div class="opts grid cars3">${tabs}</div>
    <div class="carcard"><b>${esc(c.name)}</b> <span class="muted">· ${esc(c.kind)}</span><p>${esc(c.desc)}</p>
      <div class="stat"><span>Velocità</span><span>${bar(c.vMax, 52)}</span><span>Scatto</span><span>${bar(c.acc, 7.8)}</span><span>Curva stretta</span><span>${bar(c.steer * c.steerRate, 1.7)}</span><span>Aderenza</span><span>${bar(c.grip, 9)}</span><span>Prezzo</span><span>${c.price ? c.price + ' crediti (una volta sola)' : 'gratis · già nel tuo garage'}</span><span>Hai</span><span>${state.money} crediti</span></div></div>${short}
    <div class="row foot">${action}<button class="pill" id="kClose">Chiudi</button></div>
    <small>La tua auto in uso ti aspetta parcheggiata: quando ne scegli un'altra, la trovi qui davanti, su Via delle Reti.</small>`, { talk: 'saverio' });
  viewMode = 'car'; snapFace = true;
  const body = $('panelBody');
  body.querySelectorAll('[data-c]').forEach((b) => { b.onclick = () => { dealerSel = b.dataset.c; openDealer(); }; });
  if ($('kUse')) $('kUse').onclick = () => { S.selectCar(state, id); swapToDealer(); saveNow(); openDealer(`La ${c.name} è pronta qui fuori. Le chiavi sono già nel quadro.`); };
  if ($('kBuy')) $('kBuy').onclick = () => confirmBox(`Prendere la ${c.name} per ${c.price} crediti di gioco? È un acquisto simulato: nessun denaro reale. Resta tua per sempre.`, `Prendi · ${c.price} cr`, () => {
    const r = S.buyCar(state, id);
    if (!r.ok) { openDealer('Ci manca un po\'. Fai qualche consegna da Rocco e torna: questa te la lucido nel frattempo.'); return; }
    swapToDealer(); const saved = saveNow(); refreshHUD(); openDealer(saved ? `Firmato! La ${c.name} è tua. È parcheggiata qui fuori, su Via delle Reti.` : `La ${c.name} è tua per questa sessione, ma il salvataggio non è riuscito: se chiudi la pagina potresti perderla.`);
  });
  $('kClose').onclick = closeAll;
}
// la nuova auto scelta compare parcheggiata in strada davanti all'autosalone
function placeParkedAt(x, z, yaw) { state.garage.car = { x, z, yaw }; placeParked(); }
function swapToDealer() { state.garage.car = { x: -46.6, z: -93, yaw: Math.PI }; markDirty(); placeParked(); }

// ---------- Ottimizzazione mirata (Teco): PNG fuori vista o lontani non vengono disegnati né animati ----------
const frustum = new THREE.Frustum(), projM = new THREE.Matrix4(), npcSphere = new THREE.Sphere(new THREE.Vector3(), 1.3);
function cullNPCs() {
  camera.updateMatrixWorld(); projM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(projM);
  for (const n of npcs) { npcSphere.center.set(n.root.position.x, n.root.position.y + 0.9, n.root.position.z);
    n.root.visible = camera.position.distanceTo(npcSphere.center) < 110 && frustum.intersectsSphere(npcSphere); }
}

// API di test (solo build locale; disattivata nella release pubblica da build.sh)
const TEST_HOOK = false;
if (TEST_HOOK) window.__vd = {
  get state() { return state; }, S, PLACES, world, player, camera,
  teleport(x, z, yaw = 0) { if (sitting) standUp(); player.root.position.set(x, world.groundHeight(x, z), z); player.root.rotation.y = yaw; cam.yaw = cam.sYaw = yaw + Math.PI; camInit = false; updateInteract(); },
  setCam(yaw, pitch, dist) { cam.yaw = cam.sYaw = yaw; cam.pitch = cam.sPitch = pitch; if (dist) cam.dist = cam.curDist = dist; },
  openBarber, openMirror, openCafe, openDepot, openMap, openMenu, openShop, closeAll, doInteract, startFishing, startBasket, gameAction, endGame,
  get game() { return game && { kind: game.kind, phase: game.phase, shot: game.shot, made: game.made, hits: game.hits }; },
  get nearest() { updateInteract(); return nearest && nearest.id; }, get sitting() { return !!sitting; }, get uiOpen() { return uiOpen; }, get paused() { return paused; },
  move(mx, mz, run = false) { input.mx = mx; input.mz = mz; input.run = run; },
  // forza l'esito del prossimo tocco nei minigiochi (posizione 0..1) e del tempo di abboccata
  forcePos(v) { if (game) game.forced = v; }, forceBite() { if (game) game.biteAt = 0; },
  saveNow, endTutorial, renderer, get readOnly() { return readOnly; },
  step(sec) { for (let t = 0; t < sec; t += 1 / 30) updatePlayer(1 / 30); },
  // v0.3
  enterCar, tryExit, unstuck, openDealer, openTalk, recenter, npcs, get driving() { return driving; },
  get car() { const c = car || parked; return c && { id: state.garage.selected, x: c.x, z: c.z, yaw: c.yaw, v: fwdSpeed(c), kmh: kmh(c), gearR: drv.gearR, stuckT: c.stuckT, steer: c.steer, driving }; },
  setDrive(o) { Object.assign(drv, o); }, keys: input.keys,
  drive(sec, inp) { for (let t = 0; t < sec; t += 1 / 30) { stepCar(car, inp, 1 / 30, carWorld()); } const p = player.root.position; p.x = car.x; p.z = car.z; },
  placeCar(x, z, yaw) { const c = car || parked; Object.assign(c, { x, z, yaw, vx: 0, vz: 0 }); if (!driving) placeParkedAt(x, z, yaw); },
};

boot().catch((e) => { $('loadMsg').textContent = 'Errore di caricamento: ' + e.message; console.error(e); });
