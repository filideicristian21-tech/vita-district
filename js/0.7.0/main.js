// VITA DISTRICT — loop di gioco, input, UI.
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import * as S from './state.js';
import { Avatar } from './avatar.js';
import { World, WATER_TIME } from './world.js';
import { PLACES } from './places.js';
import { MapUI } from './map.js';
import { stepWalker, walkerPos } from './collide.js';
import { newCar, stepCar, fwdSpeed, kmh, carCircles, exitSpot } from './car.js';
import { buildCar, setWheels, setShiny, carLOD, setBlink, ENV_K } from './carmodel.js';
import * as Life from './life.js';
import { NIGHT, lightPools, nightSky } from './nightfx.js';
import { DIALOGS, dialogHTML, NIGHT_HELLO } from './dialog.js';
import * as A from './activities.js';
import { LAYOUT } from './layout.js';
import { LAYOUT5, SEA, seabedY, inSwimX } from './layout5.js';
import { applySwimPose, SWIM, SWIM_STYLES, swimRoll, swimSurge, waterState } from './rig.js';

const $ = (id) => document.getElementById(id);
const storage = (() => { try { const t = '__vd_test'; localStorage.setItem(S.KEY_PREFIX + t, '1'); localStorage.removeItem(S.KEY_PREFIX + t); return localStorage; } catch { return null; } })();
const memStore = { _m: new Map(), getItem(k) { return this._m.get(k) ?? null; }, setItem(k, v) { this._m.set(k, v); }, removeItem(k) { this._m.delete(k); }, key(i) { return [...this._m.keys()][i]; }, get length() { return this._m.size; } };
const store = storage || memStore;

// ---------- Stato ----------
let { state, status, credited, readOnly, topup } = S.loadState(store, Date.now());
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
const phoneLike = matchMedia('(pointer:coarse)').matches || Math.min(window.innerWidth, window.innerHeight) < 500;
// v0.5: risoluzione adattiva. Telefono: parte da 1.25 (era 1), sale fino a 1.5 se resta fluido, scende fino a 1 se fatica.
const PR_MAX = Math.min(window.devicePixelRatio || 1, phoneLike ? 1.5 : 1.75), PR_MIN = Math.min(1, PR_MAX);
let pixelRatio = Math.min(PR_MAX, phoneLike ? 1.25 : 1.5);
renderer.setPixelRatio(pixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// v0.6 (Teco): 3 livelli di qualità. «auto» = media sul telefono, alta sul computer; scende a bassa da sola se resta lento.
// Salvato a parte (localStorage 'vd.quality'), non tocca il salvataggio di gioco.
const QUALITY = {
  alta: { shadow: true, map: 2048, far: 240, detail: 95, pr: 1.75 },
  media: { shadow: true, map: 1024, far: 150, detail: 75, pr: 1.5 },
  bassa: { shadow: false, map: 512, far: 115, detail: 55, pr: 1.0 },
};
let qualityPref = 'auto'; try { qualityPref = localStorage.getItem('vd.quality') || 'auto'; } catch (e) { /* niente storage */ }
if (!QUALITY[qualityPref] && qualityPref !== 'auto') qualityPref = 'auto';
let qualityTier = qualityPref === 'auto' ? (phoneLike ? 'media' : 'alta') : qualityPref;
const scene = new THREE.Scene();
// nebbia leggera color cielo; oltre la nebbia non si disegna niente (camera.far e culling delle celle allineati)
const FOG_FAR = phoneLike ? 175 : 230;
scene.fog = new THREE.Fog('#c9d3d8', phoneLike ? 60 : 75, FOG_FAR);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, FOG_FAR + 30);

const hemi = new THREE.HemisphereLight('#d6e4f0', '#6a5a48', 0.25); scene.add(hemi); // v0.5 (Forge): meno luce piatta, più cielo HDR
const sun = new THREE.DirectionalLight('#ffe8cc', 3.0);
sun.castShadow = true; sun.shadow.mapSize.set(phoneLike ? 1024 : 2048, phoneLike ? 1024 : 2048);
const SH = phoneLike ? 22 : 28; const SC = sun.shadow.camera; SC.left = -SH; SC.right = SH; SC.top = SH; SC.bottom = -SH; SC.near = 1; SC.far = 140;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun); scene.add(sun.target);
function applyQuality(tier) {
  qualityTier = tier; const Q = QUALITY[tier];
  sun.castShadow = Q.shadow;
  if (sun.shadow.mapSize.x !== Q.map) { sun.shadow.mapSize.set(Q.map, Q.map); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  const prMax = Math.min(PR_MAX, Q.pr); if (pixelRatio > prMax) { pixelRatio = Math.max(PR_MIN, prMax); renderer.setPixelRatio(pixelRatio); if (typeof resize === 'function') resize(); }
}
applyQuality(qualityTier);
const SUN_DIR = new THREE.Vector3(-0.55, 0.72, 0.42).normalize(); // v0.7: aggiornata dal ciclo giorno/notte (sole di giorno, luna di notte)

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
  $('loadMsg').textContent = 'Accendo il cielo…';
  try {
    const hdr = await new RGBELoader().loadAsync('./assets/tex/sky_kloofendal_1k.hdr');
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = hdr; scene.background = hdr; scene.backgroundIntensity = 1.0; scene.environmentIntensity = 0.9; scene.backgroundBlurriness = 0.02;
  } catch { scene.background = new THREE.Color('#b8d1df'); }
  $('loadMsg').textContent = 'Costruisco il rione…';
  await world.build();
  $('loadMsg').textContent = 'Chiamo gli abitanti…';
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
    { id: 'gino', url: 'hoodie.glb', x: LAYOUT.spots.gino.x, z: LAYOUT.spots.gino.z, ry: Math.PI, tint: { Purple: '#4a4038', LightBlue: '#6e5a48' }, anim: 'Idle' },
    { id: 'lia', url: 'cassiera.glb', x: LAYOUT.spots.lia.x, z: LAYOUT.spots.lia.z, ry: 0, tint: { White: '#d7c4a3' }, anim: 'Idle' },
    { id: 'nadia', url: 'cassiera.glb', x: LAYOUT.spots.nadia.x, z: LAYOUT.spots.nadia.z, ry: Math.PI, tint: { White: '#efe6d6' }, anim: 'Idle' },
    { id: 'ottavio', url: 'padrone.glb', x: LAYOUT.spots.ottavio.x, z: LAYOUT.spots.ottavio.z, ry: Math.PI / 2, tint: { Shirt: '#3e5d4a', Hair: '#cfcfcf' }, anim: 'Idle' },
    // v0.5
    { id: 'pina', url: 'cassiera.glb', x: LAYOUT5.spots.pina.x, z: LAYOUT5.spots.pina.z, ry: 0, tint: { White: '#d0473a' }, anim: 'Idle' },
    { id: 'dario', url: 'hoodie.glb', x: LAYOUT5.spots.dario.x, z: LAYOUT5.spots.dario.z, ry: -Math.PI / 2, tint: { Purple: '#2f8fc0', LightBlue: '#2b3440' }, anim: 'Idle' },
    { id: 'assunta', url: 'cassiera.glb', x: -14, z: 141.3, ry: Math.PI, tint: { White: '#f6efd8' }, anim: 'Idle' },
  ];
  for (const d of npcDefs) {
    const a = new Avatar(); await a.load('./assets/chars/' + d.url, { tint: d.tint, height: d.h || 1.74 });
    a.root.position.set(d.x, world.groundHeight(d.x, d.z) + (d.y || 0), d.z); a.root.rotation.y = d.ry; a.play(d.anim); scene.add(a.root);
    a.id = d.id; npcs.push(a);
    world.circles.push({ x: d.x, z: d.z, r: 0.35 }); // v0.5 (Cranc): anche Nonno Ugo seduto è solido
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
  buildShells();
  setupNight();
  // v0.7: nuova partita = si parte davanti alla tua soffitta; dopo una dormita, davanti alla casa dove hai dormito
  if (status === 'new' || state.life.homes.wakeAtHome) { const h = Life.homeSpot(state); player.root.position.set(h.x, world.groundHeight(h.x, h.z), h.z); player.root.rotation.y = h.yaw; cam.yaw = cam.sYaw = h.yaw + Math.PI;
    if (state.life.homes.wakeAtHome) { state.life.homes.wakeAtHome = false; markDirty(); } state.player = playerPose(); }
  world.setHouseSigns(state.life.homes.owned);
  safeStart();
  mapUI = new MapUI(world, state, { onWaypoint: setWaypoint, getPlayer: () => player.root.position, getYaw: () => player.root.rotation.y });
  $('loading').classList.add('hidden');
  if (status === 'future') toast('Questo salvataggio è di una versione più nuova del gioco: non lo tocco. Partita temporanea, non salvata.', 7000);
  else if (status === 'migrated') toast('Salvataggio aggiornato (copia di sicurezza conservata). La Vela è sul Porto, l\'autosalone a sud; a est le Officine, a ovest la spiaggia, a nord il Colle dei Limoni.', 8000);
  else if (status === 'migrated-nobackup') toast('Non riesco a fare la copia di sicurezza del vecchio salvataggio: gioco in sola lettura per non perderlo.', 7000);
  else if (status === 'corrupt') toast('Salvataggio illeggibile: nuova partita (il file vecchio è stato messo da parte, non cancellato).', 5000);
  else if (status === 'unavailable' || !storage) toast('Salvataggio non disponibile in questo browser: i progressi restano solo finché la pagina è aperta.', 6000);
  else if (status === 'loaded' && credited > 60 * 60 * 1000) toast(`Bentornato! Sono passati ${fmtDur(credited)}: barba e capelli sono cresciuti.`, 5000);
  if (state.grooming.clockAnomaly) toast("L'orologio del dispositivo è indietro rispetto all'ultimo salvataggio: crescita in pausa finché non si riallinea.", 6000);
  if (!state.tutorialDone) startTutorial();
  else if (!state.jobs.seen5 && status !== 'migrated') setTimeout(() => toast('Novità v0.5: a ovest la Contrada Salina con la spiaggia, a nord il Colle dei Limoni col campanile.', 6500), 1200);
  if (!state.jobs.seen5) { state.jobs.seen5 = true; markDirty(); }
  if (topup > 0) { const saved = saveNow(); setTimeout(() => toast(saved ? `Novità v0.7: saldo portato ad almeno 100.000 crediti di gioco (+${cr(topup)}), una volta sola. I progressi restano.` : `Bonus attivo (+${cr(topup)} crediti di gioco), ma il salvataggio non è riuscito: riprovo da solo.`, 7000), 2200); } // v0.7 (Guard G4)
  if (!state.jobs.seen7) { state.jobs.seen7 = true; markDirty(); setTimeout(() => toast('Novità v0.7: giorno e notte (5 min a giornata), case in vendita all\'Immobiliare Faro & Mare in piazza, lavori da Tonino, Marta, Pina e Gino. In auto: frecce e quattro frecce.', 8000), status === 'new' ? 1500 : 11000); }
  if (!state.jobs.seen6 && status === 'new') { state.jobs.seen6 = true; markDirty(); }
  if (!state.jobs.seen6) { state.jobs.seen6 = true; markDirty(); setTimeout(() => toast('Novità v0.6: alla Spiaggia di Ponente si entra in mare e si nuota (libero, rana, dorso, sott\'acqua).', 6500), status === 'migrated' ? 9000 : 8000); }
  refreshHUD();
  requestAnimationFrame(loop);
}
// v0.5: se il salvataggio mette il personaggio (o l'auto) dentro un muro — es. dopo un giro con una versione più vecchia —
// lo riporto sulla strada più vicina invece di lasciarlo incastrato.
function blockedAt(x, z, r) { const q = { x, z }; world.resolve(q, r, 0.12); return Math.hypot(q.x - x, q.z - z) > 0.05; }
function nearestRoadSpot(x, z, clear = (px, pz) => !blockedAt(px, pz, 0.4)) {
  let best = null;
  for (const r of world.roads) {
    if (r.y) continue;
    const alongX = (r.x1 - r.x0) > (r.z1 - r.z0);
    const cx = alongX ? THREE.MathUtils.clamp(x, r.x0 + 3, r.x1 - 3) : (r.x0 + r.x1) / 2;
    const cz = alongX ? (r.z0 + r.z1) / 2 : THREE.MathUtils.clamp(z, r.z0 + 3, r.z1 - 3);
    for (const off of [0, 5, -5, 10, -10, 16, -16]) {
      const px = alongX ? cx + off : cx, pz = alongX ? cz : cz + off;
      if (!clear(px, pz)) continue;
      const d = Math.hypot(px - x, pz - z); if (!best || d < best.d) best = { x: px, z: pz, d, yaw: alongX ? Math.PI / 2 : 0 };
      break;
    }
  }
  return best;
}
function safeStart() {
  const p = player.root.position;
  if (blockedAt(p.x, p.z, 0.32)) { const b = nearestRoadSpot(p.x, p.z); if (b) { p.set(b.x, world.groundHeight(b.x, b.z), b.z); state.player = playerPose(); markDirty(); safeStart.moved = true; } }
  if (parked && carCircles(parked).some((c) => { const q = { x: c.x, z: c.z }; world.resolve(q, c.r, -0.1); return Math.hypot(q.x - c.x, q.z - c.z) > 0.05; })) {
    // i cerchi dell'auto parcheggiata sono già nel mondo: li tolgo durante il controllo
    parkedCircles.forEach((c) => Object.assign(c, OUT, { r: 0.1 }));
    const b = nearestRoadSpot(parked.x, parked.z, (px, pz) => !blockedAt(px, pz, 1.4));
    if (b) { placeParkedAt(b.x - (b.yaw ? 0 : 1.4), b.z + (b.yaw ? -1.4 : 0), b.yaw); markDirty(); }
    else placeParked();
  }
}
function rescueFoot() {
  if (driving) return unstuck();
  if (sitting) standUp();
  const p = player.root.position; const b = nearestRoadSpot(p.x, p.z);
  if (!b) { toast('Qui non trovo spazio. Spostati un po\' e riprova.'); return; }
  p.set(b.x, world.groundHeight(b.x, b.z), b.z); camInit = false; state.player = playerPose(); saveNow(); toast('Ti riporto in strada.');
}
// ---------- v0.5: conchiglie della Spiaggia di Ponente ----------
const shellMeshes = [];
function buildShells() {
  const g = new THREE.SphereGeometry(0.11, 10, 6); g.scale(1, 0.45, 0.8);
  const mats = ['#f3e6d8', '#f2c9b8', '#e9d9c0'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45 }));
  for (const sh of LAYOUT5.shells) {
    const m = new THREE.Mesh(g, mats[sh.id % 3]); m.position.set(sh.x, world.groundHeight(sh.x, sh.z) + 0.03, sh.z); m.rotation.y = sh.id * 1.3; m.castShadow = false;
    m.userData.id = sh.id; scene.add(m); shellMeshes.push(m);
  }
  refreshShells();
}
function refreshShells() {
  const t = A.shellsToday(state, Date.now());
  for (const m of shellMeshes) m.visible = t.today.includes(m.userData.id) && !t.got.includes(m.userData.id);
}
function pickShell(id) {
  const r = A.pickShell(state, id, Date.now()); refreshShells();
  if (!r.ok) return;
  saveNow(); refreshHUD();
  toast(r.reward ? `🐚 ${r.count}/${A.SHELLS_PER_DAY}: tutte! Pina ti dà +${r.reward} crediti finti.` : `🐚 Conchiglia ${r.count}/${A.SHELLS_PER_DAY}.`);
}
// ---------- v0.5: Gelateria e Autolavaggio ----------
function openGelato(line) {
  const n = state.inventory.gelato || 0;
  openPanel(`<h2>🍦 Gelateria Nuvola di Limone</h2><div class="say">«${esc(line || 'Limone, fico, nocciola o fragola? Un cono costa 4 crediti finti.')}»</div>
    <div class="opts"><button class="pill primary" id="gEat">Cono da mangiare subito · 4 cr</button><button class="pill" id="gTake">Da portare via · 4 cr</button>${n ? `<button class="pill" id="gUse">Mangia quello che hai (${n})</button>` : ''}</div>
    <div class="row foot"><button class="pill" id="gClose">Chiudi</button></div><small>Il gelato ti fa camminare più svelto per due minuti, come il caffè.</small>`, { talk: 'assunta' });
  const buy = (eat) => { const r = S.buy(state, 'gelato'); if (!r.ok) return toast(r.reason); if (eat) { S.consume(state, 'gelato'); drink('🍦 Fresco! Passo svelto per 2 minuti.'); } saveNow(); refreshHUD(); openGelato(eat ? 'Buono, eh? Il segreto è il limone di stamattina.' : 'Tienilo in tasca, ma non al sole.'); };
  $('gEat').onclick = () => buy(true); $('gTake').onclick = () => buy(false);
  if ($('gUse')) $('gUse').onclick = () => { S.consume(state, 'gelato'); drink('🍦 Fresco! Passo svelto per 2 minuti.'); saveNow(); closeAll(); };
  $('gClose').onclick = closeAll;
}
function carInWash() { const b = world.washBay; const c = parked; return !!(b && c && Math.abs(c.x - b.x) < b.hw && Math.abs(c.z - b.z) < b.hd); }
function openWash(line) {
  const id = state.garage.selected; const name = S.CARS[id].name; const inBay = carInWash(); const shiny = A.isShiny(state, id, Date.now());
  openPanel(`<h2>🧽 Autolavaggio Schiuma</h2><div class="say">«${esc(line || (inBay ? `La ${name} è sotto il portale. Sei crediti finti e te la lucido.` : 'Porta la macchina sotto il portale, scendi e torna da me.'))}»</div>
    <div class="row foot"><button class="pill primary" id="wGo" ${inBay ? '' : 'disabled'}>Lava la ${esc(name)} · ${A.WASH_PRICE} cr</button><button class="pill" id="wClose">Chiudi</button></div>
    <small>${shiny ? 'È già lucida: un altro lavaggio allunga solo la lucentezza.' : 'Solo estetica: carrozzeria più lucida per un giorno. Non ripara niente.'}</small>`, { talk: 'dario' });
  $('wClose').onclick = closeAll;
  $('wGo').onclick = () => {
    const r = A.washCar(state, id, Date.now(), Math.max(Date.now(), state.lastOpId + 1));
    if (!r.ok) return toast(r.reason === 'money' ? 'Crediti insufficienti.' : 'Non ora.');
    saveNow(); refreshHUD(); if (carMesh) setShiny(carMesh, true);
    openWash(`Fatto! Guarda come brilla. −${r.price} crediti finti.`);
  };
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
function releaseDrive() { Object.assign(drv, { steerL: 0, steerR: 0, gas: 0, brake: 0 }); document.querySelectorAll('#drive .on').forEach((el) => el.classList.remove('on')); }
window.addEventListener('blur', resetInputs);
document.addEventListener('visibilitychange', () => { if (document.hidden) { resetInputs(); releaseDrive(); state.player = playerPose(); S.settleGrowth(state, Date.now()); saveNow(); } else { settle(); } });
window.addEventListener('pagehide', () => { state.player = playerPose(); saveNow(); });
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === 'escape') { if (uiOpen === 'game') endGame(); else if (uiOpen) closeAll(); else openMenu(); return; }
  if (driving && !uiOpen) { input.keys.add(k); if (k === 'q') setBlinker('L'); if (k === 'r') setBlinker('R'); if (k === 'x') setBlinker('H'); if (k === 'e' || k === 'f') tryExit(); if (k === 'm') openMap(); if (k === 'c') recenter(); if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault(); return; }
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
    { id: 'gino', x: LAYOUT.spots.gino.x, z: LAYOUT.spots.gino.z, r: 2.6, label: '🔧 Gino · Officina (lavoro)', run: () => openJob('meccanico') },
    { id: 'paint', x: LAYOUT.spots.bay.x + 4, z: LAYOUT.spots.bay.z, r: 2.4, label: '🎨 Vernice', run: openPaint },
    { id: 'workshop', x: LAYOUT.spots.bay.x, z: LAYOUT.spots.bay.z, r: 3.4, label: '🔧 Controllo bulloni', run: startWorkshop },
    { id: 'lia', x: LAYOUT.spots.lia.x, z: LAYOUT.spots.lia.z, r: 2.6, label: 'Parla con Lia', run: openCourier },
    { id: 'nadia', x: LAYOUT.spots.nadia.x, z: LAYOUT.spots.nadia.z, r: 2.6, label: 'Parla con Nadia', run: () => openTalk('nadia') },
    { id: 'photo', x: LAYOUT.spots.belvedere.x, z: LAYOUT.spots.belvedere.z, r: 3.4, label: '📷 Inquadra i Giardini', run: () => startPhoto('giardini') },
    { id: 'photo2', x: LAYOUT.spots.faroView.x, z: LAYOUT.spots.faroView.z, r: 3.4, label: '📷 Inquadra il Faro', run: () => startPhoto('faro') },
    { id: 'ottavio', x: LAYOUT.spots.ottavio.x, z: LAYOUT.spots.ottavio.z, r: 2.6, label: 'Parla con Ottavio', run: () => openTalk('ottavio') },
    { id: 'bocce', x: LAYOUT.spots.bocce.x, z: LAYOUT.spots.bocce.z, r: 3.2, label: '🟢 Bocce', run: startBocce },
    // v0.5
    { id: 'pina', x: LAYOUT5.spots.pina.x, z: LAYOUT5.spots.pina.z + 0.4, r: 2.6, label: '🛟 Pina · Lido (lavoro da bagnino)', run: () => openJob('bagnino') },
    { id: 'assunta', x: world.gelato.x, z: world.gelato.z, r: 2.4, label: '🍦 Gelato da Assunta', run: () => openGelato() },
    { id: 'dario', x: LAYOUT5.spots.dario.x, z: LAYOUT5.spots.dario.z, r: 2.8, label: '🧽 Parla con Dario', run: () => openWash() },
  ];
  if (shellMeshes.length) for (const m of shellMeshes) if (m.visible) list.push({ id: 'shell', x: m.position.x, z: m.position.z, r: 1.6, label: '🐚 Raccogli la conchiglia', run: () => pickShell(m.userData.id) });
  if (parked) list.push({ id: 'car', x: parked.x, z: parked.z, r: parked.spec.len / 2 + 1.4, bias: 1.6, label: `🚗 Sali · ${parked.spec.name}`, run: enterCar });
  list.push({ id: 'dealer', x: -36.4, z: -89.2, r: 2.8, label: 'Parla con Saverio · Autosalone', run: () => openDealer() });
  // v0.7: agenzia immobiliare e porte delle case
  list.push({ id: 'agency', x: Life.AGENCY.x, z: Life.AGENCY.z, r: 2.6, label: '🏠 Immobiliare Faro & Mare', run: () => openAgency() });
  for (const [hid, h] of Object.entries(Life.HOUSES)) { const own = state.life.homes.owned.includes(hid);
    list.push({ id: 'house_' + hid, x: h.door.x, z: h.door.z, r: 2.4, label: own ? `🏠 Casa tua · ${h.name}` : `🏷 In vendita · ${h.name}`, run: () => openHouse(hid) }); }
  if (!(state.delivery && state.delivery.target === 'bice')) list.push({ id: 'bice', x: 71.4, z: -6.2, r: 2.2, label: 'Parla con la Signora Bice', run: () => openTalk('bice') });
  for (const b of world.benchSpots) if (!(b.x === -7 && b.z === 26)) list.push({ id: 'bench', x: b.x + Math.sin(b.ry) * 0.6, z: b.z + Math.cos(b.ry) * 0.6, r: 1.5, label: '🪑 Siediti', run: () => sitOn(b) });
  if (state.jobs && state.jobs.courier && !driving) list.push({ id: 'drop', x: A.COURIER.drop.x, z: A.COURIER.drop.z, r: A.COURIER.drop.r, label: 'Consegna il pacco al Belvedere', run: deliverCourier });
  if (state.delivery) {
    const p = PLACES['dl_' + state.delivery.target];
    list.push({ id: 'deliver', x: p.door.x, z: p.door.z + (p.door.z > 0 ? -1 : 1), r: 2.4, label: 'Consegna il pacco', run: () => deliver(state.delivery.target) });
  }
  return list;
}
let nearest = null;
function updateInteract() {
  const p = player.root.position; nearest = null; let best = 1e9;
  if (driving || swimming()) { $('btnAct').classList.add('hidden'); return; }
  for (const it of interactables()) {
    const d0 = Math.hypot(p.x - it.x, p.z - it.z);
    const d = d0 + (it.bias || 0); // v0.5: l'auto cede il tasto a chi è vicino (es. «Controllo bulloni» in officina)
    if (d0 < it.r && d < best) {
      // niente interazioni attraverso i muri
      const o = new THREE.Vector3(p.x, 1.3, p.z), dir = new THREE.Vector3(it.x - p.x, 0, it.z - p.z);
      const len = dir.length(); dir.normalize();
      if (len > 0.3 && it.id !== 'car' && world.rayDistance(o, dir, len) < len - 0.45) continue; // 0.45: il cerchio solido del personaggio stesso (0.35) non conta come muro
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
  if (talk) $('pTalk').onclick = () => openTalk(talk, true); $('panel').classList.remove('hidden'); uiOpen = 'panel'; resetInputs(); releaseDrive();
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
function confirmBox(text, yesLabel, onYes, kind = 'danger') {
  $('confirmText').textContent = text; $('confirmYes').textContent = yesLabel; $('confirmYes').className = 'pill ' + kind; // v0.7 (Anchor/Spark): comprare non è «pericoloso»
  $('confirm').classList.remove('hidden'); const prev = uiOpen; uiOpen = 'confirm';
  $('confirmNo').onclick = () => { $('confirm').classList.add('hidden'); uiOpen = prev; };
  $('confirmYes').onclick = () => { $('confirm').classList.add('hidden'); uiOpen = prev; onYes(); };
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const cr = Life.fmtCr; // 9.500, non 9500 (Anchor)
function refreshHUD() {
  $('money').textContent = `${cr(state.money)} crediti`;
  { const n = Life.isNight(state.life); const hh = Life.gameHour(state.life); const ic = n ? '🌙' : (hh < 7.5 || hh >= 17.5) ? '🌅' : '☀️'; const el = $('clock'); if (el) { el.textContent = `${ic} ${Life.clockLabel(state.life)}`; el.classList.toggle('night', n); } }
  const L = S.visibleLengths(state);
  $('look').textContent = `✂ ${L.hairMm.toFixed(0)} mm · barba ${L.beardMm.toFixed(1)} mm`;
  const db = $('demoBadge'); if (state.grooming.demoDays > 0) { db.textContent = `DEMO: +${state.grooming.demoDays} gg simulati`; db.classList.remove('hidden'); } else db.classList.add('hidden');
  const ob = $('objective'); let txt = '';
  if (state.delivery) txt = `📦 Porta il pacco a: ${PLACES['dl_' + state.delivery.target].name} (+${state.delivery.reward})`;
  if (state.waypoint && PLACES[state.waypoint]) {
    const p = PLACES[state.waypoint]; const d = Math.round(Math.hypot(player.root.position.x - p.x, player.root.position.z - p.z));
    txt += (txt ? '<br>' : '') + `◆ ${esc(p.short)} · ${d} m`;
  }
  const run = state.jobs && state.jobs.courier;
  if (run) txt += (txt ? '<br>' : '') + (run.spoiled ? '📦 Rotta Sicura: premio perso. «↺ Riprova» per ricominciare.' : `📦 Rotta Sicura · cancello ${Math.min(run.gate, 3)}/3 · sforamenti ${run.strikes || 0}/${A.COURIER_STRIKES - 1}`);
  $('cRetry').classList.toggle('hidden', !(run && (run.spoiled || run.strikes > 0 || run.gate > 0)));
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
  addJobButton('barbiere');
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
  addJobButton('barista');
}
function drink(msg = '☕ Che botta! Passo svelto per 2 minuti.') { boostUntil = performance.now() + 120000; toast(msg); refreshHUD(); }

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
  const prev = fromPanel && { tonino: openBarber, marta: openCafe, rocco: openDepot, saverio: () => openDealer(), pina: () => openJob('bagnino'), gino: () => openJob('meccanico') }[id];
  talk = { id, asked: [], back: prev || null };
  const h = Life.gameHour(state.life); // v0.7 (Lumen): ora di gioco, non quella del telefono
  if (Life.isNight(state.life) && NIGHT_HELLO[id]) { talk.hello = NIGHT_HELLO[id]; renderTalk(); return; }
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
   <div class="stat"><span>Crediti</span><span>${cr(state.money)} (di gioco, senza valore reale)</span><span>Ora</span><span>${Life.clockLabel(state.life)} · un giorno di gioco = 5 minuti reali; l'orologio scorre anche da fermi (si ferma solo in pausa)</span><span>Casa</span><span>${esc(Life.HOUSES[state.life.homes.main].name)} · ne hai ${state.life.homes.owned.length}</span><span>Lavoro</span><span>${state.life.work.job ? esc(Life.JOBS[state.life.work.job].name) + ` · ${Life.totalShifts(state.life)} turni` : 'nessuno (Tonino, Marta, Pina e Gino cercano gente)'}</span><span>Inventario</span><span>☕ ${state.inventory.coffee} · 🍦 ${state.inventory.gelato || 0} · 🍬 ${state.inventory.candy} · 🐟 ${state.inventory.fish || 0}${state.delivery ? ' · 📦 1 pacco' : ''}</span>
   <span>Statistiche</span><span>${state.stats.deliveries} consegne · ${state.stats.haircuts} tagli · ${state.stats.coffees} caffè</span>
   <span>Record</span><span>🎣 ${state.records.fishCaught} pesci${state.records.bestFishName ? ` (max ${esc(state.records.bestFishName)} ${state.records.bestFishG} g)` : ''} · 🏀 miglior serie ${state.records.basketBest}/${S.BASKET.shots}</span>
   <span>Salvataggio</span><span>${readOnly ? 'SOLA LETTURA (versione più nuova o altra scheda): non salvo.' : storage ? 'in questo browser (localStorage). Cancellando i dati del sito lo perdi.' : 'NON disponibile: solo in memoria.'}</span></div>
   <div class="row"><button class="pill primary" id="mResume">▶ Riprendi</button><button class="pill" id="mSave">💾 Salva ora</button><button class="pill" id="mMirror">🪞 Specchio e crescita</button>
   ${state.inventory.coffee > 0 ? '<button class="pill" id="mDrink">☕ Bevi caffè</button>' : ''}</div>
   <h3>Comandi</h3><small>${matchMedia('(pointer:coarse)').matches ? 'Pollice sinistro: cammina (fino al bordo = corsa). Pollice destro: gira la visuale. Tasto in basso a destra: interagisci. In auto: ◀ ▶ a sinistra, Frena/Accelera a destra, D/R da fermi, Scendi in alto a sinistra. ⬅ ➡ frecce: si spengono da sole dopo la curva. ⚠ quattro frecce: restano accese anche da parcheggiato.' : 'WASD/frecce, Shift corsa, trascina col mouse, rotella zoom, E interagisci, M mappa, Esc menu. In auto: W gas, S freno (tenuto da fermi = retromarcia), A/D sterzo, C ricentra, E scendi.'}</small>
   <div class="row"><button class="pill" id="mTut">Rivedi guida</button><button class="pill" id="mStuck">🧭 Sono bloccato</button>${document.fullscreenEnabled ? '<button class="pill" id="mFull">⛶ Schermo intero</button>' : ''}<button class="pill" id="mQual">🎚 Qualità: ${qualityPref === 'auto' ? `auto (${qualityTier})` : qualityTier}</button><button class="pill danger" id="mReset">Elimina progressi…</button></div>
   <h3>Crediti e licenze</h3><small>three.js (MIT). Personaggi: Quaternius (CC0). Texture e cielo: ambientCG, Poly Haven (CC0). Lampioni e cespugli: Poly Haven (CC0). Auto: Quaternius, RGS_Dev (CC0). Tegole, sabbia, mattoni, intonaco: Poly Haven (CC0). Volti, abiti, vetrine, alberi, insegne, mare e campanile: procedurali. Dettagli in README.md / LICENSES.md.</small><br>
   <small>Prototipo v0.7.0 · giorno e notte, case da comprare, lavori con paga giornaliera, frecce dell'auto. Crediti di gioco senza valore reale; auto, agenzie e marchi inventati. iPhone reale non verificato.</small>`);
  $('mResume').onclick = () => closeAll();
  $('mSave').onclick = () => { state.player = playerPose(); toast(saveNow() ? 'Salvato in questo browser.' : 'Salvataggio non riuscito.'); };
  $('mMirror').onclick = () => { paused = false; openMirror(); };
  if ($('mDrink')) $('mDrink').onclick = () => { S.consume(state, 'coffee'); drink(); saveNow(); closeAll(); };
  $('mTut').onclick = () => { closeAll(); state.tutorialDone = false; startTutorial(); };
  $('mStuck').onclick = () => { closeAll(); rescueFoot(); };
  $('mQual').onclick = () => { const order = ['auto', 'alta', 'media', 'bassa']; qualityPref = order[(order.indexOf(qualityPref) + 1) % order.length];
    try { localStorage.setItem('vd.quality', qualityPref); } catch (e) { /* niente storage */ }
    applyQuality(qualityPref === 'auto' ? (phoneLike ? 'media' : 'alta') : qualityPref);
    $('mQual').textContent = `🎚 Qualità: ${qualityPref === 'auto' ? `auto (${qualityTier})` : qualityTier}`; };
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
function openMap() { if (uiOpen === 'game') endGame(); if (sitting) standUp(); closeAll(); uiOpen = 'map'; resetInputs(); releaseDrive(); $('mapView').classList.remove('hidden'); mapUI.open(); hintEvent('mapOpen'); }
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
function gShow(title) { closeAll(); uiOpen = 'game'; resetInputs(); releaseDrive(); gEl.root.classList.remove('hidden'); gEl.title.textContent = title; $('btnAct').classList.add('hidden'); $('hint').classList.add('hidden'); }
function gZone(z0, z1, inner) { gEl.zone.style.left = z0 * 100 + '%'; gEl.zone.style.width = (z1 - z0) * 100 + '%';
  if (inner) { gEl.zone2.style.left = inner[0] * 100 + '%'; gEl.zone2.style.width = (inner[1] - inner[0]) * 100 + '%'; gEl.zone2.style.display = ''; } else gEl.zone2.style.display = 'none'; }
function gMark(v) { gEl.mark.style.left = (v * 100).toFixed(2) + '%'; }
$('gExit').onclick = () => endGame();
gEl.act.addEventListener('pointerdown', (e) => { e.preventDefault(); gameAction(); });
function endGame(msg) {
  if (!game) return; const g = game; game = null;
  const extra = $('wBolts'); if (extra) extra.remove();
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
function nearBay() {
  const b = LAYOUT.spots.bay; const c = parked || car;
  return c && Math.hypot(c.x - b.x, c.z - b.z) < 4.2;
}
function startWorkshop() {
  if (driving) return toast('Scendi dall\'auto nel piazzale, poi controlla i bulloni.');
  if (!nearBay()) return toast('Avvicina la tua auto al piazzale dell\'officina.');
  game = { kind: 'workshop', job: A.newWorkshop(), carId: state.garage.selected };
  gShow('🔧 Bullone Felice');
  gEl.bar.style.visibility = 'hidden';
  paintWorkshop();
}
function paintWorkshop() {
  const j = game.job;
  const bolts = [1, 2, 3, 4].map((n, i) => `<button class="pill" data-b="${i}" ${j.bolts[i] >= 180 ? 'disabled' : ''}>Bullone ${n} · ${Math.round(j.bolts[i])}°</button>`).join('');
  gEl.info.innerHTML = j.done ? '<b>Controllo completato.</b> Nessun costo: non è una riparazione vera.' : `Ordine in croce: 1, 3, 2, 4. Poi «Ruota +30°».`;
  gEl.score.textContent = j.done ? 'fatto' : `passo ${j.next + 1}/4`;
  gEl.act.textContent = j.done ? 'Chiudi' : 'Ruota +30°';
  gEl.act.disabled = false;
  let box = $('wBolts');
  if (!box) { box = document.createElement('div'); box.id = 'wBolts'; box.className = 'opts'; gEl.info.after(box); }
  box.innerHTML = bolts;
  box.querySelectorAll('[data-b]').forEach((b) => { b.onclick = () => { game.bolt = +b.dataset.b; paintWorkshop(); }; });
}
function workshopAction() {
  const j = game.job;
  if (j.done) { const r = A.claimWorkshop(state, game.carId); saveNow(); endGame(r.already ? 'Controllo già registrato.' : 'Controllo registrato. Non hai speso crediti.'); return; }
  if (game.bolt == null) return toast('Scegli il bullone giusto.');
  const res = A.workshopTurn(j, game.bolt, 30);
  if (!res.ok && res.reason === 'order') toast('Ordine in croce: il prossimo è il numero ' + (j.order[j.next] + 1) + '.');
  paintWorkshop();
}
function openCourier() {
  const run = state.jobs.courier;
  const paid = state.jobs.courierPaid.includes('belvedere');
  const body = paid ? 'Questo pacco è già stato consegnato senza correre. Non si ripaga.'
    : run ? (run.spoiled ? 'Sei andato sopra i 36 km/h tre volte: il premio stavolta non scatta. Puoi rifare il percorso, gratis.' : `Cancello ${run.gate}/3 verso il Belvedere. Sotto i 36 km/h: il tachimetro diventa giallo vicino al limite e rosso sopra.`)
    : 'Un pacco fino al Belvedere passando dai 3 cancelli segnati. Premio 40 crediti se resti sotto i 36 km/h: due piccoli sforamenti si perdonano, al terzo niente premio. La Vela basta.';
  openPanel(`<h2>📦 Rotta Sicura</h2><div class="say">«${esc(body)}»</div>
    <div class="row foot"><button class="pill primary" id="cGo">${paid ? 'Chiudi' : run ? (run.spoiled ? 'Rifai il percorso' : 'Annulla incarico') : 'Accetta · 40 cr finti'}</button>
    <button class="pill" id="cTalk">Parla con Lia</button></div>
    <small>Niente timer e niente multa. I crediti non sono denaro.</small>`, { talk: 'lia' });
  $('cTalk').onclick = () => openTalk('lia', true);
  $('cGo').onclick = () => {
    if (paid) return closeAll();
    if (run && run.spoiled) { A.courierRetry(state); saveNow(); closeAll(); toast('Percorso azzerato: ripassa dai 3 cancelli, senza fretta.'); return; }
    if (run) { A.courierCancel(state); saveNow(); closeAll(); toast('Incarico annullato. Nessun premio.'); return; }
    const res = A.courierStart(state);
    if (!res.ok) return toast(res.reason === 'foot' ? 'Hai già una consegna a piedi.' : res.reason === 'car' ? 'Ti serve un\'auto: la Vela è gratis.' : 'Non ora.');
    saveNow(); closeAll(); toast('Pacco preso. Segui la Rotta fino al Belvedere, sotto i 36 km/h.');
  };
}
function deliverCourier() {
  const res = A.courierFinish(state, player.root.position.x, player.root.position.z);
  if (!res.ok && res.reason === 'speed') return toast('Tre sforamenti sopra i 36 km/h: niente premio. Tocca «↺ Riprova» o parla con Lia.');
  if (!res.ok && res.reason === 'route') return toast('Ti manca un tratto della Rotta Sicura.');
  if (!res.ok && res.reason === 'far') return toast('Avvicinati al Belvedere e scendi dall\'auto.');
  if (!res.ok) return;
  saveNow(); toast(`Consegnato. +${res.reward} crediti finti.`);
}
function startPhoto(id) {
  if (driving) return toast('Scendi e fermati per inquadrare.');
  const pose = () => ({ x: player.root.position.x, z: player.root.position.z, yaw: player.root.rotation.y });
  const target = A.PHOTO_TARGETS[id];
  const dir = new THREE.Vector3(target.x - pose().x, 0, target.z - pose().z);
  const len = dir.length(); dir.normalize();
  const blocked = len > 0.5 && world.rayDistance(new THREE.Vector3(pose().x, 1.4, pose().z), dir, len) < len - 1.2;
  const ev = A.photoEvaluate(pose(), id, blocked);
  game = { kind: 'photo', id, ev };
  gShow('📷 Inquadratura');
  gEl.bar.style.visibility = 'hidden';
  const msg = { close: 'Avvicinati un poco.', far: 'Sei troppo lontano.', aim: 'Gira lo sguardo verso il soggetto.', blocked: 'Il soggetto è coperto.', target: 'Soggetto sconosciuto.' };
  gEl.info.innerHTML = ev.ok ? `<b>${esc(target.name)}</b> è nell'inquadratura. Lo scatto resta solo nel gioco.` : (msg[ev.reason] || 'Spostati.');
  gEl.score.textContent = ev.ok ? 'pronto' : 'non ancora';
  gEl.act.textContent = ev.ok ? 'Scatta' : 'Chiudi';
}
function photoAction() {
  if (!game.ev.ok) { endGame(); return; }
  const r = A.claimPhoto(state, game.id, game.ev.score);
  saveNow();
  endGame(r.first ? 'Scheda aggiunta all\'album del gioco. Nessun credito, nessuna foto sul telefono.' : 'Inquadratura già in album. Non si ripete un premio.');
}
// v0.5: le bocce si vedono sul campo (pallino giallo + 3 bocce). Il lancio parte dalla testata ovest verso est.
const bocceBalls = new THREE.Group(); bocceBalls.name = 'bocceBalls';
{
  const g = new THREE.SphereGeometry(1, 16, 10);
  const pal = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#f2c94c', roughness: 0.4 })); pal.scale.setScalar(0.05); bocceBalls.add(pal);
  for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#8c949a', roughness: 0.25, metalness: 0.8 })); m.scale.setScalar(0.1); m.castShadow = false; m.visible = false; bocceBalls.add(m); }
  scene.add(bocceBalls);
}
const BOCCE_ORIGIN = { x: 378, z: -28 };
function placeBocce(throws) {
  const [pal, ...balls] = bocceBalls.children; pal.position.set(BOCCE_ORIGIN.x + 8, 0.2, BOCCE_ORIGIN.z);
  balls.forEach((m, i) => { const t = throws[i]; m.visible = !!t; if (t) { const l = A.bocceLand(t.angle, t.power); m.position.set(BOCCE_ORIGIN.x + l.z, 0.25, BOCCE_ORIGIN.z + THREE.MathUtils.clamp(-l.x * 0.6, -1.8, 1.8)); } });
}
placeBocce([]);
function startBocce() {
  if (driving) return toast('Alle bocce si gioca a piedi.');
  game = { kind: 'bocce', throws: [], angle: 0, power: 0.45, roundId: Math.max(Date.now(), state.lastOpId + 1) };
  placeBocce([]);
  gShow('🟢 Il Pallino d\'Oro');
  gEl.bar.style.visibility = 'hidden';
  paintBocce();
}
function paintBocce() {
  const g = game;
  gEl.score.textContent = `lanci ${g.throws.length}/3`;
  gEl.info.innerHTML = g.throws.length ? `Distanze dal pallino: ${A.bocceDistances(g.throws.map((t) => A.bocceLand(t.angle, t.power))).map((d) => d.toFixed(1)).join(' · ')} m` : 'Tre lanci. Direzione e forza, senza limite di tempo.';
  gEl.act.textContent = g.throws.length >= 3 ? 'Chiudi e incassa' : 'Lancia';
  let box = $('wBolts');
  if (!box) { box = document.createElement('div'); box.id = 'wBolts'; box.className = 'opts'; gEl.info.after(box); }
  box.innerHTML = `<button class="pill" id="bL">◀</button><button class="pill" id="bR">▶</button><button class="pill" id="bM">− forza</button><button class="pill" id="bP">+ forza</button>`;
  $('bL').onclick = () => { g.angle = Math.max(-1, g.angle - 0.15); toast('Direzione ' + g.angle.toFixed(2)); };
  $('bR').onclick = () => { g.angle = Math.min(1, g.angle + 0.15); toast('Direzione ' + g.angle.toFixed(2)); };
  $('bM').onclick = () => { g.power = Math.max(0.05, g.power - 0.1); toast('Forza ' + Math.round(g.power * 100) + '%'); };
  $('bP').onclick = () => { g.power = Math.min(1, g.power + 0.1); toast('Forza ' + Math.round(g.power * 100) + '%'); };
}
function bocceAction() {
  const g = game;
  if (g.throws.length >= 3) {
    const r = A.claimBocce(state, g.roundId, g.throws);
    if (r.ok) { state.lastOpId = Math.max(state.lastOpId, g.roundId); saveNow(); }
    endGame(r.ok ? (r.already ? 'Partita già contata.' : `+${r.reward} crediti finti. La più vicina è a ${Math.min(...r.distances).toFixed(1)} m.`) : 'Lanci non validi.');
    return;
  }
  g.throws.push({ angle: g.angle, power: g.power });
  placeBocce(g.throws);
  paintBocce();
}
function openPaint() {
  const id = state.garage.selected;
  const buttons = A.PAINTS.map((p) => `<button class="pill" data-p="${p.id}"><span class="sw" style="background:${p.hex}"></span>${esc(p.name)} · ${state.jobs.paints.includes(id + ':' + p.id) ? 'già tua' : p.price + ' cr'}</button>`).join('');
  openPanel(`<h2>🎨 Vernice</h2><p>Crediti finti, una volta per colore. Poi si riapplica gratis.</p><div class="opts">${buttons}</div><div class="row foot"><button class="pill" id="pClose">Annulla</button></div>`, { talk: 'gino' });
  $('pClose').onclick = closeAll;
  $('panelBody').querySelectorAll('[data-p]').forEach((b) => b.onclick = () => {
    const r = A.buyPaint(state, id, b.dataset.p);
    if (!r.ok) return toast(r.reason === 'money' ? 'Crediti insufficienti.' : 'Non posso verniciare questa.');
    if (carMeshes[id]) { scene.remove(carMeshes[id]); delete carMeshes[id]; }
    if (parked) placeParked();
    saveNow(); refreshHUD();
    toast(r.reused ? 'Colore già pagato: riapplicato.' : `Verniciata. −${r.price} crediti finti.`);
    openPaint();
  });
}
function gameAction() {
  if (!game) return; const t = clock.elapsedTime;
  if (game.kind === 'fish') fishAction(t);
  else if (game.kind === 'basket') { if (game.phase === 'done') { endGame(); startBasket(); } else basketAction(t); }
  else if (game.kind === 'workshop') workshopAction();
  else if (game.kind === 'photo') photoAction();
  else if (game.kind === 'bocce') bocceAction();
}

// ---------- Loop ----------
const clock = new THREE.Clock();
const tmpV = new THREE.Vector3(), camTarget = new THREE.Vector3(), camPos = new THREE.Vector3(), headPos = new THREE.Vector3(), camTargetSm = new THREE.Vector3();
let dnTimer = 1, settleTimer = 0, saveTimer = 0, hudTimer = 0, miniTimer = 0, fpsAcc = 0, fpsN = 0, lowFps = 0, camInit = false;
let groundY = 0.12;
function playerPose() { if (driving) return { ...footPose }; const p = player.root.position; const wet = depthAt(p.x, p.z) > 0.3; // mai salvare in acqua (Guard/Nexus): si riparte sulla battigia
  return { x: +(wet ? THREE.MathUtils.clamp(p.x, -236, -112) : p.x).toFixed(3), z: +(wet ? SEA.shoreZ : p.z).toFixed(3), yaw: +player.root.rotation.y.toFixed(3) }; }
function settle() { S.settleGrowth(state, Date.now()); player.setGrooming(S.visibleLengths(state)); markDirty(); refreshHUD(); }
const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

function loop() {
  requestAnimationFrame(loop);
  const raw = clock.getDelta(); const dt = Math.min(raw, 0.05);
  const t = clock.elapsedTime;
  // FPS adattivo misurato sul tempo REALE (non sul dt limitato)
  fpsAcc += raw; fpsN++;
  if (fpsAcc > 2) { const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; window.__fps = fps;
    if (fps < 28 && pixelRatio > PR_MIN) { lowFps++; if (lowFps >= 2) { pixelRatio = Math.max(PR_MIN, pixelRatio - 0.25); renderer.setPixelRatio(pixelRatio); resize(); lowFps = 0; } }
    else if (fps > 52 && pixelRatio < Math.min(PR_MAX, QUALITY[qualityTier].pr) && !loop.cappedUp) { lowFps--; if (lowFps <= -3) { pixelRatio = Math.min(PR_MAX, QUALITY[qualityTier].pr, pixelRatio + 0.25); renderer.setPixelRatio(pixelRatio); resize(); lowFps = 0; } }
    else lowFps = 0;
    if (fps < 28 && lowFps === 0 && pixelRatio === PR_MIN) loop.cappedUp = true; // dopo un calo non risale più (niente altalena)
    // v0.6: in «auto», se anche a risoluzione minima resta sotto 24 fps per ~6 s, scende di un livello (senza ombre in «bassa»)
    if (qualityPref === 'auto' && fps < 24 && pixelRatio === PR_MIN && qualityTier !== 'bassa') { loop.slowN = (loop.slowN || 0) + 1; if (loop.slowN >= 3) { applyQuality(qualityTier === 'alta' ? 'media' : 'bassa'); loop.slowN = 0; } }
    else loop.slowN = 0;
  }

  const p = player.root.position;
  if (driving) updateDriving(dt);
  if (driving && !uiOpen && state.jobs && state.jobs.courier) {
    const run = state.jobs.courier; const g0 = run.gate;
    const st = A.courierSample(run, kmh(car), dt); A.courierGate(run, car.x, car.z);
    if (st === 'strike') toast(`Oltre i 36 km/h: sforamento ${run.strikes}/${A.COURIER_STRIKES - 1}. Rallenta, il pacco è fragile.`, 3200);
    else if (st === 'spoiled' && !run._told) { run._told = true; toast('Terzo sforamento: premio perso. Tocca «↺ Riprova» per ricominciare la Rotta.', 4500); }
    if (run.gate !== g0) { toast(run.gate >= A.COURIER.gates.length ? 'Ultimo cancello! Ora al Belvedere: accosta e scendi.' : `Cancello ${run.gate}/3 ✓`); markDirty(); }
  }
  WATER_TIME.value = t;
  // v0.7: orologio di gioco (salvato). Avanza solo con la pagina visibile e senza pausa: mai Date.now per paghe e giorni.
  if (!paused && !document.hidden && uiOpen !== 'map' && uiOpen !== 'confirm') { const d0 = Life.gameDay(state.life); Life.tick(state.life, raw * 1000); if (Life.gameDay(state.life) !== d0) { toast(`☀️ Giorno ${Life.gameDay(state.life) + 1}: i turni di lavoro sono di nuovo aperti.`, 3500); markDirty(); } }
  blinkUpdate(t);
  const moving = driving ? false : updatePlayer(dt);
  if (!moving && !sitting && !game && player.current && /Walk|Run/.test(player.current.getClip().name)) player.play('Idle');
  const gy = world.groundHeight(p.x, p.z); groundY += (gy - groundY) * Math.min(1, dt * 12); p.y = sitting ? 0.12 : groundY;
  if (!driving && swim.w > 0.001) { // a nuoto i fianchi stanno sotto il pelo dell'acqua, con un piccolo dondolio
    const st = swim.style === 'sott' ? SWIM.sott : Math.hypot(swim.vx, swim.vz) > 0.25 ? SWIM[swim.style] : SWIM.fermo;
    swim.yS = swim.yS === undefined ? groundY : swim.yS; const want = SEA.y - HIP - st.depth + Math.sin(t * 1.6) * 0.04;
    swim.yS += (want - swim.yS) * Math.min(1, dt * (swim.style === 'sott' ? 1.5 : 4));
    p.y = THREE.MathUtils.lerp(groundY, Math.max(swim.yS, groundY - 0.3), swim.w);
  } else swim.yS = undefined;
  carryBox.visible = !!state.delivery && !game;
  if (driving) { carMesh.position.set(car.x, groundY - 0.12 + 0.02, car.z); carMesh.rotation.y = car.yaw; }

  if (!paused) { if (!driving) { player.update(dt); swimVisual(dt); } cullNPCs(); for (const n of npcs) { if (n.walk) walkNPC(n, dt); if (n.root.visible) n.update(dt); } }
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
    if (swim.w > 0.01) camTarget.y = THREE.MathUtils.lerp(camTarget.y, swim.style === 'sott' ? p.y + HIP + 0.3 : SEA.y + 0.5, swim.w); // a nuoto la camera guarda la testa, non i piedi
    if (!camInit) { camTargetSm.copy(camTarget); camInit = true; } else camTargetSm.lerp(camTarget, Math.min(1, dt * 10));
    // spalla: leggero spostamento a destra per vedere la strada davanti
    const side = portrait ? 0 : 0.38; const rx = Math.cos(cam.sYaw), rz = -Math.sin(cam.sYaw);
    const tgt = tmpV.set(camTargetSm.x - rx * side, camTargetSm.y, camTargetSm.z - rz * side);
    const pitchUse = swim.style === 'sott' && swim.w > 0.5 ? Math.min(cam.sPitch, 0.08) : cam.sPitch; // in immersione la camera resta sott'acqua
    const cp = Math.cos(pitchUse); const dir = camPos.set(Math.sin(cam.sYaw) * cp, Math.sin(pitchUse), Math.cos(cam.sYaw) * cp);
    const want = (game ? (game.kind === 'basket' ? 3.0 : 4.2) : cam.dist) + 0.6 * swim.w;
    let free = world.rayDistance(tgt, dir, want + 0.3) - 0.3;
    const maxByGround = dir.y < 0 ? (tgt.y - 0.25) / -dir.y : 1e9;
    free = Math.max(0.6, Math.min(free, maxByGround, want));
    cam.curDist = free < cam.curDist ? free : cam.curDist + (free - cam.curDist) * Math.min(1, dt * 3);
    camera.position.copy(tgt).addScaledVector(dir, cam.curDist);
    if (game && game.kind === 'basket') camera.lookAt(world.hoop.x, world.hoop.y - 0.6, world.hoop.z); else camera.lookAt(tgt);
  }
  underwaterFx();
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
  if (saveTimer > 4) { saveTimer = 0; markDirty(); if (dirty) { state.player = playerPose(); saveNow(); } }
  dnTimer += raw; if (dnTimer > 0.25) { dnTimer = 0; dayNight(); }
  if (driving || headSpot.intensity > 0) headlightFollow();
  if (!renderer.shadowMap.autoUpdate && (loop.sf = (loop.sf || 0) + 1) % 8 === 0) renderer.shadowMap.needsUpdate = true;
  if (nightSkyObj && nightSkyObj.stars.visible) { nightSkyObj.stars.position.copy(camera.position); nightSkyObj.moon.position.copy(camera.position).addScaledVector(moonDir, 160); nightSkyObj.moon.lookAt(camera.position); }
  if (hudTimer > 0.25) { hudTimer = 0; if (!uiOpen) refreshHUD(); updateInteract(); document.body.classList.toggle('ui', !!uiOpen || !!sitting); document.body.classList.toggle('driving', driving); }
  if (miniTimer > 0.15) { miniTimer = 0; mapUI.drawMini($('mini')); if (uiOpen === 'map') mapUI.draw(); }
  { const Q = QUALITY[qualityTier]; world.cull(camera, Math.min(Q.far, FOG_FAR + 10), Q.detail); }
  { const cp = camera.position; for (const m of Object.values(carMeshes)) if (m && m.visible) carLOD(m, m.position.distanceTo(cp));
    for (const m of world.displayCars || []) carLOD(m, m.position.distanceTo(cp)); }
  gateBeaconUpdate(t);
  renderer.render(scene, camera);
}
// ======================= v0.7: GIORNO E NOTTE =======================
// Un giorno di gioco intero (giorno + notte) = 5 minuti reali (decisione di Cristian). Nessuna luce vera in più per lampioni e finestre:
// tutto con l'emissivo (uniform NIGHT). Unica luce aggiunta: il faro dell'auto guidata, creato all'avvio (niente ricompilazioni).
const DN = { day: new THREE.Color('#ffe8cc'), dusk: new THREE.Color('#ff9a5c'), moon: new THREE.Color('#a9bedb'),
  hemiDay: new THREE.Color('#d6e4f0'), hemiNight: new THREE.Color('#3a4e72'), fogDay: new THREE.Color('#c9d3d8'), fogDusk: new THREE.Color('#e7b999'), fogNight: new THREE.Color('#1f2a38') };
const tmpC = new THREE.Color(); const moonDir = new THREE.Vector3(0, 1, 0);
let nightSkyObj = null, pools = null, dnLast = -1;
// Teco: la SpotLight conta in ogni shader anche a intensità 0 → solo su qualità alta, decisa all'avvio (niente ricompilazioni).
// Su media/bassa: una pozza di luce additiva davanti all'auto (1 draw call, solo di notte in guida).
const HEAD_SPOT = qualityTier === 'alta';
const headSpot = new THREE.SpotLight('#fff1d6', 0, 34, 0.55, 0.55, 1.4); headSpot.castShadow = false; if (HEAD_SPOT) { scene.add(headSpot); scene.add(headSpot.target); }
let headPool = null;
const envMats = new Map();
function collectEnvMats() { scene.traverse((o) => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of ms) if (m && 'envMapIntensity' in m && !envMats.has(m)) envMats.set(m, m.envMapIntensity); }); } // i materiali nuovi non sono ancora scalati: base = valore attuale
function setupNight() {
  collectEnvMats(); setTimeout(collectEnvMats, 4000); // anche auto e PNG caricati dopo
  nightSkyObj = nightSky(); scene.add(nightSkyObj.stars); scene.add(nightSkyObj.moon);
  pools = lightPools(world.lampAll || []); scene.add(pools);
  if (!HEAD_SPOT) { const hm = pools.material.clone(); hm.opacity = 0; headPool = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 10).rotateX(-Math.PI / 2), hm); headPool.visible = false; headPool.renderOrder = 3; headPool.frustumCulled = false; scene.add(headPool); }
  setupNight.done = true; dayNight(true);
}
function dayNight(force = false) {
  const L = state.life; const h = Life.gameHour(L); const d = Life.daylight(L);
  dnLast = d;
  // v0.7 (Spark): il caldo dell'alba e del tramonto dipende dall'ora (picchi alle 6:45 e 18:45), non solo dalla luce
  const tw = Math.max(Math.exp(-(((h - 6.75) / 0.75) ** 2)), Math.exp(-(((h - 18.75) / 0.75) ** 2)));
  const night = THREE.MathUtils.clamp(1 - d * 1.6, 0, 1);
  NIGHT.value = night;
  // sole (6→18) o luna (18→6): arco da est a ovest
  // v0.7 (Forge/Study): sole 5→19, luna 19→5, come daylight(): niente salto di luce e ombre mentre è ancora chiaro
  const isDay = h >= 5 && h < 19; const ph = isDay ? (h - 5) / 14 : (((h - 19) + 24) % 24) / 10;
  const az = THREE.MathUtils.clamp(ph, 0, 1) * Math.PI;
  SUN_DIR.set(Math.cos(az) * 0.85, Math.max(0.15, Math.sin(az)), 0.42).normalize();
  moonDir.set(Math.cos(az) * 0.6, Math.max(0.25, Math.sin(az) * 0.8), 0.42).normalize(); if (isDay) moonDir.set(0, -1, 0);
  tmpC.copy(DN.moon).lerp(DN.day, d).lerp(DN.dusk, tw * 0.65); sun.color.copy(tmpC); sun.intensity = 0.5 + 2.5 * d;
  hemi.color.copy(DN.hemiNight).lerp(DN.hemiDay, d); hemi.intensity = Math.max(0.26, 0.12 + 0.13 * d); // Spark: il personaggio non è una sagoma nera
  if (scene.environment && !fxUnder) scene.backgroundIntensity = 0.06 + 0.94 * d;
  const envK = 0.15 + 0.85 * d; // three r160: niente scene.environmentIntensity → scala l'envMapIntensity di ogni materiale (base salvata)
  ENV_K.value = envK;
  if (Math.abs(envK - (dayNight.envK ?? -1)) > 0.01 || force) { dayNight.envK = envK; for (const [m, base] of envMats) m.envMapIntensity = (m.userData.envBase ?? base) * envK; }
  renderer.toneMappingExposure = 0.9 + 0.1 * d;
  FOG0.color.copy(DN.fogNight).lerp(DN.fogDay, d).lerp(DN.fogDusk, tw * 0.8 * Math.min(1, d * 3));
  if (!fxUnder) scene.fog.color.copy(FOG0.color); // sott'acqua resta la nebbia verde; tornando su si riprende il ciclo
  for (const m of world.lampGlass || []) m.emissiveIntensity = 2.6 * night;
  if (world.villaGlass) world.villaGlass.emissiveIntensity = 0.9 * night; if (world._villaWall) { if (!dayNight.wallE) { dayNight.wallE = true; world._villaWall.emissive.set('#3a2a18'); } world._villaWall.emissiveIntensity = 0.25 * night; }
  if (world.signMats) for (const m of Object.values(world.signMats)) m.emissiveIntensity = 0.12 + 0.4 * night; // cartelli leggibili di notte (Spark) if (world.villaPool) world.villaPool.emissiveIntensity = 0.9 * night;
  if (world.nightShop) world.nightShop.emissiveIntensity = 0.34 + 0.6 * night;
  if (pools) { pools.visible = night > 0.02; pools.material.opacity = 0.45 * night; }
  const starA = THREE.MathUtils.clamp((0.15 - d) / 0.15, 0, 1); // Study: stelle solo a sole calato
  if (nightSkyObj) { const sv = starA > 0.02; nightSkyObj.stars.visible = sv; nightSkyObj.moon.visible = night > 0.05 && !isDay; nightSkyObj.stars.material.opacity = starA; nightSkyObj.moon.material.opacity = Math.min(1, night * 1.3); }
  headSpot.intensity = HEAD_SPOT && driving && night > 0.05 ? 60 * night : 0;
  if (headPool) { headPool.visible = driving && night > 0.05; headPool.material.opacity = 0.55 * night; }
  // Teco: di notte la mappa delle ombre si aggiorna ogni 8 fotogrammi (non si tocca castShadow: ricompilerebbe)
  renderer.shadowMap.autoUpdate = night < 0.6;
  if (carMesh && carMesh.userData.lights) carMesh.userData.lights.material.color.setScalar(1 + 0.8 * night); // fari e fanali più vivi di notte
}
const hsFwd = new THREE.Vector3();
function headlightFollow() {
  const c = car || parked; if (!c) return; hsFwd.set(Math.sin(c.yaw), 0, Math.cos(c.yaw));
  const y = world.groundHeight(c.x, c.z);
  headSpot.position.set(c.x + hsFwd.x * (c.spec.len / 2), y + 0.75, c.z + hsFwd.z * (c.spec.len / 2));
  headSpot.target.position.set(c.x + hsFwd.x * 16, y, c.z + hsFwd.z * 16);
  if (headPool && headPool.visible) { headPool.position.set(c.x + hsFwd.x * (c.spec.len / 2 + 5.2), y + 0.06, c.z + hsFwd.z * (c.spec.len / 2 + 5.2)); headPool.rotation.y = c.yaw; }
}

// ======================= v0.7: CASE =======================
function houseCard(hid, inAgency = true) {
  const h = Life.HOUSES[hid]; const H = state.life.homes; const own = H.owned.includes(hid); const main = H.main === hid;
  const after = state.money - h.price;
  const st = own ? (main ? '<b class="ok">Casa principale</b>' : '<b class="ok">Tua</b>') : after >= 0 ? `ti restano ${cr(after)} cr` : `<b class="no">mancano ${cr(-after)} cr</b>`;
  return `<div class="house ${own ? 'own' : ''}"><div class="hh"><b>${esc(h.name)}</b><span>${esc(h.kind)} · ${esc(h.zone)} · ${h.rooms} ${h.rooms === 1 ? 'stanza' : 'stanze'}</span></div>
    <small>${esc(h.desc)}</small><div class="hp"><span class="price">${cr(h.price)} cr</span><span>${st}</span></div>
    <div class="row">${own ? (main ? '' : `<button class="pill" data-main="${hid}">Rendila principale</button>`) + (H.owned.length > 1 && hid !== Life.STARTER_HOME ? `<button class="pill" data-sell="${hid}">Vendi · ${cr(Math.round(h.price * Life.RESALE))} cr</button>` : '')
      : `<button class="pill primary" data-buy="${hid}" ${after < 0 ? 'disabled' : ''}>${after < 0 ? `Mancano ${cr(-after)} cr` : `Compra · ${cr(h.price)} cr`}</button>`}${inAgency ? `<button class="pill" data-go="${hid}">◆ Sulla mappa</button>` : ''}</div></div>`;
}
function bindHouseButtons(back) {
  const body = $('panelBody');
  body.querySelectorAll('[data-buy]').forEach((b) => b.onclick = () => buyHouseFlow(b.dataset.buy, back));
  body.querySelectorAll('[data-main]').forEach((b) => b.onclick = () => { Life.setMainHome(state, b.dataset.main); saveNow(); toast(`Casa principale: ${Life.HOUSES[b.dataset.main].name}. Qui ti risvegli e riparti.`); back(); });
  body.querySelectorAll('[data-sell]').forEach((b) => b.onclick = () => { const id = b.dataset.sell; const h = Life.HOUSES[id];
    confirmBox(`Vendere ${h.name} per ${cr(Math.round(h.price * Life.RESALE))} crediti di gioco (70% del prezzo)?`, 'Vendi', () => { const r = Life.sellHouse(state, id); if (!r.ok) return toast(r.reason); world.setHouseSigns(state.life.homes.owned); saveNow(); refreshHUD(); toast(`Venduta: +${cr(r.pay)} crediti.`); back(); }); });
  body.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => { const h = Life.HOUSES[b.dataset.go]; houseWaypoint(b.dataset.go, h); closeAll(); toast(`◆ ${h.name} segnata sulla mappa.`); });
}
function houseWaypoint(id) { state.waypoint = 'house_' + id; markDirty(); }
function buyHouseFlow(id, back) {
  const h = Life.HOUSES[id]; const after = state.money - h.price;
  if (after < 0) return toast(`Ti mancano ${cr(-after)} crediti. Lavora qualche giornata e torna qui.`);
  confirmBox(`Comprare «${h.name}»? Prezzo ${cr(h.price)} cr · saldo ${cr(state.money)} → ${cr(after)} cr. Ti risveglierai qui. Solo crediti di gioco, nessun denaro reale.`, `Compra · ${cr(h.price)} cr`, () => {
    const r = Life.buyHouse(state, id); if (!r.ok) return toast(r.reason);
    world.setHouseSigns(state.life.homes.owned); saveNow(); refreshHUD(); updateInteract();
    if (id === 'villa' && !state.life.firsts.villa) { state.life.firsts.villa = true; saveNow(); return villaKeys(); } // v0.7 (Hook): un momento solo per la villa
    toast(`🔑 ${h.name} è tua! −${cr(r.price)} crediti. Ora è la tua casa principale.`, 4200); back();
  }, 'primary');
}
function villaKeys() {
  const h = Life.HOUSES.villa; houseWaypoint('villa', h);
  openPanel(`<h2>🍋 Le chiavi della Villa dei Limoni</h2><div class="say">«Loggia ad archi, piscina, cipressi e il rione ai tuoi piedi. Dalla soffitta a qui: complimenti, te la sei guadagnata.» <small>— Immobiliare Faro & Mare</small></div>
    <small>La villa è la tua casa principale: ti risvegli lì. È segnata sulla mappa.</small><div class="row"><button class="pill primary" id="vOk">Vado a vederla</button></div>`);
  $('vOk').onclick = closeAll; toast('🔑 Villa dei Limoni: è tua!', 4000);
}
function openAgency() {
  const H = state.life.homes;
  openPanel(`<h2>🏠 Immobiliare Faro & Mare</h2>
    <div class="say">${Life.isNight(state.life) ? '«Buonasera! Stavo chiudendo, ma per una casa la luce la riaccendo. Prezzi in crediti di gioco, chiavi subito.»' : '«Buongiorno! Dalla soffitta alla villa coi limoni: qui c\'è tutto il rione. Prezzi in crediti di gioco, chiavi subito.»'} <small>— Clelia</small></div>
    <div class="stat"><span>Saldo</span><span>${cr(state.money)} crediti</span><span>Casa principale</span><span>${esc(Life.HOUSES[H.main].name)}</span></div>
    <div class="houses">${Life.HOUSE_IDS.map((id) => houseCard(id)).join('')}</div>
    <small>Chi compra si risveglia nella casa nuova. Rivendita al 70% (la soffitta iniziale non si vende). Acquisto simulato · solo crediti di gioco · nessun denaro reale.</small>
    <div class="row"><button class="pill" id="agClose">Chiudi</button></div>`);
  bindHouseButtons(openAgency); $('agClose').onclick = closeAll;
}
function openHouse(id) {
  const h = Life.HOUSES[id]; const own = state.life.homes.owned.includes(id); const night = Life.isNight(state.life);
  openPanel(`<h2>${own ? '🏠' : '🏷'} ${esc(h.name)}</h2>
    ${houseCard(id, false)}
    ${own ? `<div class="stat"><span>Ora</span><span>${Life.clockLabel(state.life)}</span><span>Riposo</span><span>${night ? 'Puoi dormire fino alle 7:00.' : 'Puoi andare a letto dalle 19:00 alle 5:00.'}</span></div>
    <div class="row"><button class="pill primary" id="hSleep" ${night ? '' : 'disabled'}>🛏 Dormi fino alle 7:00</button></div>` : '<small>Per comprarla puoi anche passare dall\'Immobiliare Faro & Mare in piazza.</small>'}
    <div class="row"><button class="pill" id="hClose">Chiudi</button></div>`);
  bindHouseButtons(() => openHouse(id)); $('hClose').onclick = closeAll;
  if ($('hSleep')) $('hSleep').onclick = () => { const r = Life.sleep(state, id); if (!r.ok) return toast(r.reason);
    state.life.homes.wakeAtHome = false; const sp = Life.homeSpot(state); player.root.position.set(sp.x, world.groundHeight(sp.x, sp.z), sp.z); player.root.rotation.y = sp.yaw; cam.yaw = cam.sYaw = sp.yaw + Math.PI; camInit = false;
    state.player = playerPose(); dayNight(true); saveNow(); closeAll(); toast(`🌅 Buongiorno! Giorno ${r.day + 1}, ore 7:00.`, 3500); };
}

// ======================= v0.7: LAVORI =======================
const TASKS = {
  barbiere: [{ t: 'Prima di radere la barba cosa fai?', k: 'pick', opts: ['Panno caldo e schiuma', 'Acqua gelata', 'Phon'], ok: 0 }, { t: 'Rifinisci il contorno della barba col rasoio', k: 'bar' }, { t: 'Sfuma la nuca', k: 'bar' }],
  barista: [{ t: 'Monta il latte del cappuccino', k: 'bar' }, { t: 'Il signore vuole un caffè «macchiato freddo». Cosa aggiungi?', k: 'pick', opts: ['Panna montata', 'Una goccia di latte freddo', 'Acqua tonica'], ok: 1 }, { t: 'Estrai l\'espresso: ferma al momento giusto (un buon espresso esce in 25–30 secondi)', k: 'bar' }],
  bagnino: [{ t: 'Apri gli ombrelloni in fila', k: 'bar' }, { t: 'Bandiera rossa sul pennone: cosa vuol dire?', k: 'pick', opts: ['Bagno vietato', 'Mare calmo', 'Gelati gratis'], ok: 0 }, { t: 'Un bambino è oltre le boe: fischia al momento giusto!', k: 'bar' }],
  meccanico: [{ t: 'Serra i bulloni della ruota a croce (a stella)', k: 'bar' }, { t: 'Spia dell\'olio accesa: cosa controlli?', k: 'pick', opts: ['L\'autoradio', 'Il livello dell\'olio', 'I tergicristalli'], ok: 1 }, { t: 'Gonfia le gomme a 2,3 bar (è scritto sul montante della portiera)', k: 'bar' }],
};
const JOB_TALK = { barbiere: 'tonino', barista: 'marta', bagnino: 'pina', meccanico: 'gino' };
// v0.7 (Lumen): una voce per ogni datore di lavoro: [non assunto, turno disponibile, fatto oggi, chiuso]
const JOB_LINES = {
  barbiere: ['Vuoi imparare? Prima la scopa, poi le forbici. Così ho fatto anch\'io.', 'Eccoti. Tre clienti e la giornata è pagata.', 'Per oggi basta: le forbici si riposano.', 'Bottega chiusa. Torna dalle 9.'],
  barista: ['Mi serve qualcuno al banco. Sorridi e ricordati i nomi.', 'Grembiule e via: tre ordini e sei a posto.', 'Turno fatto. Il caffè di fine giornata te lo offro io.', 'Siamo chiusi. Apro alle 6, se hai sonno.'],
  bagnino: ['Cerco una mano in spiaggia: ombrelloni, bandiere, occhi aperti.', 'Fischietto al collo: tre compiti e sei pagato.', 'Per oggi la spiaggia è a posto. Grazie.', 'Lido chiuso. Ci vediamo dalle 9.'],
  meccanico: ['Prima impara altrove, poi vieni da me: qui i bulloni non perdonano.', 'Tuta addosso. Tre lavori e la giornata è pagata.', 'Basta per oggi: lavati le mani, eh.', 'Officina chiusa. Apro alle 8.'],
};
const FIRST_PAY = { barbiere: 'La prima busta non si spende. Si guarda.', barista: 'Il primo stipendio! Te lo meriti, e pure un cornetto.', bagnino: 'Primo stipendio da bagnino: il mare ringrazia.', meccanico: 'Primo stipendio: le mani sporche pagano.' };
function addJobButton(id) {
  const j = Life.JOBS[id]; const mine = state.life.work.job === id; const st = mine && Life.shiftStatus(state, id);
  const b = document.createElement('button'); b.className = 'pill job'; b.id = 'jobBtn';
  b.textContent = `💼 Lavoro da ${j.name.toLowerCase()}${mine ? (st.can ? ' · turno disponibile' : st.done ? ' · fatto per oggi' : '') : ` · ${cr(Life.wageFor(state.life, id))} cr al giorno`}`;
  b.onclick = () => openJob(id); const body = $('panelBody'); const t = $('pTalk'); if (t) t.after(b); else body.prepend(b);
}
function openJob(id) {
  const j = Life.JOBS[id]; const L = state.life; const mine = L.work.job === id; const can = Life.canTake(L, id); const st = Life.shiftStatus(state, id);
  const n = L.work.shifts[id] || 0; const wage = Life.wageFor(L, id);
  const last = L.work.payslips.filter((p) => p.job === id).slice(-3).reverse().map((p) => `Giorno ${p.day + 1}: +${cr(p.pay)} cr (paga ${cr(p.base)} + mancia ${cr(p.tip)})`).join('<br>');
  openPanel(`<h2>${j.icon} ${esc(j.name)} · ${esc(j.place)}</h2>
    ${L.work.shift && L.work.shift.job === id && L.work.shift.day < Life.gameDay(L) ? '<small class="warn">Il turno di ieri non era finito: è perso, oggi si riparte da capo.</small>' : ''}
    <div class="say">«${esc(JOB_LINES[id][!mine ? 0 : st.can ? 1 : st.done ? 2 : 3])}» <small>— ${esc(j.boss)}</small></div>
    <div class="stat"><span>Paga</span><span>${cr(wage)} cr al giorno + mancia fino al 20%${n >= 5 ? ' · anzianità inclusa' : ''}</span>
    <span>Orario</span><span>${j.from}:00–${j.to}:00 · adesso: ${Life.clockLabel(L).split('· ')[1]}</span>
    <span>Regola</span><span>Un turno pagato al giorno, in qualsiasi lavoro. Un giorno di gioco = 5 minuti reali.</span>
    <span>Turni fatti</span><span>${n}${n < 5 ? ' · bonus +10% dal 5° turno, +20% dal 12°' : ''}</span></div>
    ${last ? `<h3>Buste paga</h3><small>${last}</small>` : ''}
    <div class="row">${mine ? `<button class="pill primary" id="jStart" ${st.can ? '' : 'disabled'}>▶ Inizia il turno</button><button class="pill" id="jQuit">Lascia il lavoro</button>`
      : `<button class="pill primary" id="jTake" ${can.ok ? '' : 'disabled'}>Accetta il lavoro</button>`}<button class="pill" id="jClose">Chiudi</button></div>
    ${!mine && !can.ok ? `<small>${esc(can.reason)}</small>` : ''}${mine && !st.can ? `<small>${esc(st.reason)}</small>` : ''}
    ${!mine && L.work.job ? `<small>Ora lavori da ${esc(Life.JOBS[L.work.job].name.toLowerCase())}: accettando cambi lavoro.</small>` : ''}
    <small>Crediti di gioco, senza valore reale.</small>`, { talk: JOB_TALK[id] });
  if ($('jTake')) $('jTake').onclick = () => { const r = Life.takeJob(state, id); if (!r.ok) return toast(r.reason); saveNow(); toast(`Assunto come ${j.name.toLowerCase()}!`); openJob(id); };
  if ($('jQuit')) $('jQuit').onclick = () => confirmBox(`Lasciare il lavoro da ${j.name.toLowerCase()}? I turni fatti restano.`, 'Lascia il lavoro', () => { Life.quitJob(state); saveNow(); openJob(id); });
  if ($('jStart')) $('jStart').onclick = () => { const r = Life.startShift(state, id); if (!r.ok) return toast(r.reason); markDirty(); runTask(id); };
  $('jClose').onclick = closeAll;
}
let taskTimer = null; const TASK_TOL = 0.11; // zona verde ±0,11 (CSS 39–61%): al bordo verde la qualità vale 0,5
function runTask(id) {
  const s = state.life.work.shift; if (!s) return openJob(id);
  const task = TASKS[id][s.done % TASKS[id].length]; const j = Life.JOBS[id];
  cancelAnimationFrame(taskTimer);
  const head = `<h2>${j.icon} Turno · compito ${s.done + 1}/${Life.TASKS_PER_SHIFT}</h2><div class="say">${esc(task.t)}</div>`;
  if (task.k === 'pick') {
    openPanel(`${head}<div class="opts">${task.opts.map((o, i) => `<button data-o="${i}">${esc(o)}</button>`).join('')}</div><small>Ogni compito fa passare un'ora di gioco.</small>`, { talk: null });
    $('panelBody').querySelectorAll('[data-o]').forEach((b) => { b.disabled = true; setTimeout(() => { b.disabled = false; }, 250); }); // doppio tocco (Nexus)
    $('panelBody').querySelectorAll('[data-o]').forEach((b) => b.onclick = () => taskDone(id, +b.dataset.o === task.ok ? 1 : 0.25, +b.dataset.o === task.ok ? 'Giusto!' : 'Mmh, non proprio.'));
    return;
  }
  openPanel(`${head}<div class="jbar"><div class="zone"></div><div class="mk" id="tMk"></div></div>
    <div class="row"><button class="pill primary big" id="tGo">✋ Ora!</button></div><small>Ferma il cursore nella zona verde: più sei preciso, più mancia.</small>`, { talk: null });
  // v0.7 (Nexus): posizione calcolata all'istante del tocco (non dall'ultimo fotogramma), animazione in rAF
  const t0 = performance.now(); const posAt = (ms) => 0.5 - 0.5 * Math.cos((ms - t0) / 1000 * 2.4);
  const anim = () => { const mk = $('tMk'); if (!mk) return; mk.style.left = `${(posAt(performance.now()) * 100).toFixed(1)}%`; taskTimer = requestAnimationFrame(anim); }; taskTimer = requestAnimationFrame(anim);
  const go = $('tGo'); go.disabled = true; setTimeout(() => { go.disabled = false; }, 250);
  go.addEventListener('pointerdown', (e) => { e.preventDefault(); if (go.disabled) return; go.disabled = true; cancelAnimationFrame(taskTimer); const p = posAt(e.timeStamp || performance.now());
    const q = taskForced ?? Math.max(0, 1 - Math.abs(p - 0.5) / (TASK_TOL * 2)); taskForced = null; taskDone(id, q, q > 0.8 ? 'Perfetto!' : q > 0.4 ? 'Buono.' : 'Così così.'); }, { once: true });
  go.onclick = (e) => { if (e.detail === 0 && !go.disabled) go.dispatchEvent(new PointerEvent('pointerdown')); }; // tastiera/test
}
let taskForced = null;
let taskLock = 0;
function taskDone(id, q, msg) {
  if (performance.now() < taskLock) return; taskLock = performance.now() + 450; // v0.7 (Nexus): un tocco doppio non salta un compito
  const r = Life.finishTask(state, q); markDirty();
  if (!r.ok) { saveNow(); toast(r.reason); return openJob(id); }
  if (!r.paid) { toast(`${msg} ${r.done}/${Life.TASKS_PER_SHIFT}`, 1300); return runTask(id); }
  saveNow(); refreshHUD();
  openPanel(`<h2>💰 ${r.first ? 'Il tuo primo stipendio' : 'Busta paga'} · Giorno ${r.day + 1}</h2>${r.first ? `<div class="say">«${esc(FIRST_PAY[id])}» <small>— ${esc(Life.JOBS[id].boss)}</small></div>` : ''}<div class="stat"><span>Lavoro</span><span>${esc(Life.JOBS[id].name)}</span><span>Paga</span><span>${cr(r.base)} crediti</span><span>Mancia</span><span>${cr(r.tip)} crediti</span><span>Totale</span><span><b>+${cr(r.pay)} crediti</b></span><span>Saldo</span><span>${cr(state.money)} crediti</span></div>
    <small>Prossimo turno pagato: domani (giorno ${r.day + 2}). Crediti di gioco, senza valore reale.</small><div class="row"><button class="pill primary" id="pOk">Grazie!</button></div>`);
  $('pOk').onclick = closeAll; toast(`${msg} Turno finito: +${cr(r.pay)} crediti.`, 3000);
}

// ---------- v0.6: a piedi, in acqua bassa e a nuoto ----------
// Profondità = livello del mare − fondale (stessa funzione usata dalla mesh). Solo davanti alla Spiaggia di Ponente.
function depthAt(x, z) { return inSwimX(x) && z < -168 ? Math.max(0, SEA.y - world.groundHeight(x, z)) : 0; }
const swim = { state: 'walk', style: 'rana', ph: 0, w: 0, vx: 0, vz: 0, dive: false, told: {}, roll: 0 };
let walkSpeed = 0, lastYaw = 0, leanSm = 0, rollSm = 0;
function swimming() { return swim.state === 'swim'; }
// sott'acqua: nebbia verde-azzurra corta, sfondo in tinta, vignetta CSS (niente post-process). Tornando su si ripristina tutto.
const FOG0 = { color: scene.fog.color.clone(), near: scene.fog.near, far: scene.fog.far }; let fxUnder = false, bg0 = null;
function underwaterFx() {
  const c = camera.position; const under = c.y < SEA.y - 0.05 && inSwimX(c.x) && c.z < -178.5;
  if (under === fxUnder) return; fxUnder = under; document.body.classList.toggle('under', under);
  if (under) { bg0 = scene.background; scene.fog.color.set('#1e5a63'); scene.fog.near = 1; scene.fog.far = 24; scene.background = scene.fog.color; }
  else { scene.fog.color.copy(FOG0.color); scene.fog.near = FOG0.near; scene.fog.far = FOG0.far; scene.background = bg0; dayNight(true); } // v0.7 (Cranc): FOG0 segue giorno e notte
}
function updatePlayer(dt) {
  const p = player.root.position;
  let moving = false;
  const depth = depthAt(p.x, p.z);
  const prevState = swim.state;
  swim.state = driving ? 'walk' : waterState(swim.state, depth);
  if (swim.state !== prevState) onWaterChange(prevState, swim.state);
  const inSwim = swim.state === 'swim';
  swim.w += ((inSwim ? 1 : 0) - swim.w) * Math.min(1, dt / 0.35 * 2.2); // transizione ~0,35 s
  if (!uiOpen && !paused && !game) {
    const km = keyMove();
    let mx = input.mx + km.x, mz = input.mz + km.z; const mag = Math.min(1, Math.hypot(mx, mz));
    const ang = Math.atan2(mx, mz) + cam.yaw; // relativo alla camera
    if (inSwim) {
      const st = SWIM[mag > 0.12 ? swim.style : 'fermo'] || SWIM.rana;
      const want = mag > 0.12 ? st.speed * Math.max(0.45, mag) * swimSurge(swim.style, swim.ph) : 0;
      const tx = Math.sin(ang) * want, tz = Math.cos(ang) * want; const k = 1 - Math.exp(-2.5 * dt); // inerzia dell'acqua
      swim.vx += (tx - swim.vx) * k; swim.vz += (tz - swim.vz) * k;
      // boe: oltre si viene spinti dolcemente verso riva (mai un muro secco, mai pericolo)
      if (p.z < SEA.buoyZ + 4) { swim.vz += (SEA.buoyZ + 4 - p.z) * 0.9 * dt; if (!swim.told.buoy) { swim.told.buoy = 1; toast('Le boe segnano il limite. Da qui si torna verso riva.'); } }
      else if (p.z > SEA.buoyZ + 12) swim.told.buoy = 0;
      if (swim.style === 'sott' && depth < 1.6) { swim.style = swim.prevStyle && swim.prevStyle !== 'sott' ? swim.prevStyle : 'rana'; toast('Troppo basso: risali.', 1400); updateSwimUI(); } // v0.7 (Cranc)
      const x0 = p.x, z0 = p.z; p.x += swim.vx * dt; p.z += swim.vz * dt; world.resolve(p, 0.4, p.y + HIP - 0.35); // v0.7: i sassi sommersi bloccano chi nuota alla loro altezza
      const moved = Math.hypot(p.x - x0, p.z - z0);
      if (mag > 0.12) { let dy = ang - player.root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); player.root.rotation.y += dy * Math.min(1, dt * 3); }
      const cps = (mag > 0.12 ? SWIM[swim.style] : SWIM.fermo).cps * (0.7 + 0.5 * Math.min(1, moved / Math.max(dt, 1e-4) / 1.2));
      swim.ph = (swim.ph + dt * cps) % 1;
      if (player.loco) player.locomote(dt, 0, 0); else player.play('Idle');
      moving = moved > 0.002; if (moving) markDirty();
      return moving;
    }
    if (mag > 0.12) {
      if (sitting) standUp();
      const run = (input.run || km.run) && swim.state !== 'wade';
      let target = (run ? 4.6 : 1.55 + 0.6 * mag) * (boostUntil > performance.now() ? 1.25 : 1);
      if (!run) target *= Math.max(0.5, mag);
      if (swim.state === 'wade') target *= THREE.MathUtils.lerp(1, 0.55, THREE.MathUtils.clamp((depth - 0.35) / 0.7, 0, 1)); // acqua alle ginocchia/fianchi
      else if (inSwimX(p.x) && p.z < -150 && p.z > -178) target *= 0.85; // sabbia asciutta un po' più lenta (Cranc)
      // curve strette: rallenta finché il corpo non è girato (niente scivolata laterale)
      let dy = ang - player.root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      target *= THREE.MathUtils.lerp(0.35, 1, Math.max(0, Math.cos(dy)));
      walkSpeed += (target - walkSpeed) * Math.min(1, dt * (target > walkSpeed ? 3.5 : 6)); // ~0,3 s per partire, ~0,2 per fermarsi
      const dx = Math.sin(ang) * walkSpeed * dt, dz = Math.cos(ang) * walkSpeed * dt;
      const x0 = p.x, z0 = p.z;
      p.x += dx; p.z += dz; world.resolve(p, 0.32, groundY);
      const moved = Math.hypot(p.x - x0, p.z - z0);
      player.root.rotation.y += dy * Math.min(1, dt * 9);
      player.locomote(dt, moved / Math.max(dt, 1e-4), moved);
      moving = moved > 0.004;
      markDirty();
    } else {
      walkSpeed = 0;
      if (!sitting && player.loco) player.locomote(dt, 0, 0);
    }
  }
  return moving;
}
function onWaterChange(a, b) {
  if (b === 'swim') {
    swim.vx = Math.sin(player.root.rotation.y) * 0.6; swim.vz = Math.cos(player.root.rotation.y) * 0.6; swim.dive = false; swim.ph = 0;
    if (!state.jobs.swimHint) { state.jobs.swimHint = true; markDirty(); toast('Sei in acqua: muovi lo stick per nuotare. Cambia stile col tasto a destra.', 6000); }
    else toast(`Stile: ${SWIM[swim.style].name}`);
  }
  if (a === 'swim' && b !== 'swim') { swim.dive = false; if (swim.style === 'sott') swim.style = swim.prevStyle && swim.prevStyle !== 'sott' ? swim.prevStyle : 'rana'; } // v0.7 (Cranc): a riva non si resta «in immersione»
  if (b === 'walk' && a !== 'walk' && performance.now() - (onWaterChange.landT || -1e9) > 30000) { onWaterChange.landT = performance.now(); toast('Di nuovo a terra.', 1600); } // v0.7 (Cranc): niente raffica di toast sulla battigia
  updateSwimUI();
}
function updateSwimUI() {
  const on = swimming() && !driving;
  $('swStyle').classList.toggle('hidden', !on); $('swDive').classList.toggle('hidden', !on);
  if (on) { $('swStyle').textContent = `🏊 ${SWIM[swim.style === 'sott' ? 'rana' : swim.style].name} ▸`; $('swDive').textContent = swim.style === 'sott' ? '⬆ Risali' : '🤿 Immergiti'; }
  document.body.classList.toggle('swimming', on);
}
function cycleSwimStyle() {
  const order = ['libero', 'rana', 'dorso']; const cur = swim.style === 'sott' ? 'rana' : swim.style;
  swim.style = order[(order.indexOf(cur) + 1) % order.length]; swim.prevStyle = swim.style; toast(`Stile: ${SWIM[swim.style].name}`, 1500); updateSwimUI();
}
function toggleDive() {
  if (swim.style === 'sott') { swim.style = swim.prevStyle || 'rana'; toast('Risali in superficie.', 1400); }
  else { if (depthAt(player.root.position.x, player.root.position.z) < 2.2) return toast('Qui è troppo basso per immergersi: vai un po\' più al largo.'); swim.prevStyle = swim.style; swim.style = 'sott'; swim.diveT = 0; toast("Sott'acqua: il fondale è di sabbia. Tocca «Risali» quando vuoi.", 2600); }
  updateSwimUI();
}
$('swStyle').addEventListener('click', cycleSwimStyle);
$('swDive').addEventListener('click', toggleDive);
// posa del nuoto: dopo il mixer (sopra l'Idle). Corpo inclinato intorno ai fianchi; testa fuori dall'acqua negli stili di superficie.
const HIP = 0.98;
function swimVisual(dt) {
  const b = player.body; if (!b) return;
  const w = swim.w; const moving = Math.hypot(swim.vx, swim.vz) > 0.25;
  const style = moving || swim.style === 'sott' ? swim.style : 'fermo';
  // corsa: leggera inclinazione in avanti con la velocità e in curva (Study/Nexus), solo a terra
  const yawRate = (player.root.rotation.y - lastYaw) / Math.max(dt, 1e-4); lastYaw = player.root.rotation.y;
  const k = player.loco ? player.loco.k : 0; const mv = player.loco ? 1 - player.loco.wI : 0;
  leanSm += ((0.03 + 0.1 * k) * mv - leanSm) * Math.min(1, dt * 8);
  rollSm += (THREE.MathUtils.clamp(-yawRate * 0.035 * mv, -0.14, 0.14) - rollSm) * Math.min(1, dt * 8);
  const pitch = THREE.MathUtils.lerp(leanSm, (SWIM[style] || SWIM.rana).pitch, w);
  const roll = THREE.MathUtils.lerp(rollSm, swimRoll(style, swim.ph), w);
  b.rotation.set(pitch, 0, roll, 'XZY');
  // perno ai fianchi quando nuota, alle caviglie quando corre (si inclina "dalle caviglie")
  const piv = HIP * w; const c = Math.cos(pitch), s0 = Math.sin(pitch);
  b.position.set(0, piv - piv * c, -piv * s0); // rotazione intorno al punto (0, piv, 0) invece che ai piedi
  if (w > 0.01) applySwimPose(player.rig, style, swim.ph, w);
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
const drv = { steerL: 0, steerR: 0, gas: 0, brake: 0, gearR: false, kbStopT: 0, lookT: -10, warnT: 0, blink: null, turned: 0, straightT: 0 };
const OUT = { x: 1e6, z: 1e6 };
function carColor(id) { return (state.garage.paint && state.garage.paint[id]) || S.CARS[id].color; }
function carMeshFor(id) {
  const color = carColor(id);
  const prev = carMeshes[id];
  if (!prev || prev.userData.paint !== color) {
    if (prev) scene.remove(prev);
    carMeshes[id] = buildCar(id, S.CARS[id], color);
    carMeshes[id].userData.paint = color;
    scene.add(carMeshes[id]);
    if (setupNight.done) { collectEnvMats(); dayNight(true); } // auto nuova o riverniciata: riflesso scalato subito (Forge)
  }
  return carMeshes[id];
}
function buildCars() {
  world.liveCircles = parkedCircles;
  // esposizione: Vela, Bruma, Pode davanti all'Autosalone (solide)
  world.displayCars = ['vela', 'bruma', 'pode'].map((id, i) => { const d = world.displaySpots[i]; const m = buildCar(id, S.CARS[id]); m.position.set(d.x, 0.14, d.z); m.rotation.y = d.yaw; scene.add(m);
    for (const c of carCircles(newCar(S.CARS[id], d.x, d.z, d.yaw))) world.circles.push(c); return m; });
  placeParked();
  world.sealColliders();
}
function placeParked() {
  for (const m of Object.values(carMeshes)) m.visible = false;
  const g = state.garage; const spec = S.CARS[g.selected];
  parked = newCar(spec, g.car.x, g.car.z, g.car.yaw);
  carMesh = carMeshFor(g.selected); carMesh.visible = true; carMesh.position.set(parked.x, world.groundHeight(parked.x, parked.z) - 0.1, parked.z); carMesh.rotation.y = parked.yaw;
  setWheels(carMesh, 0, 0, 0); setShiny(carMesh, A.isShiny(state, g.selected, Date.now()));
  carCircles(parked).forEach((c, i) => Object.assign(parkedCircles[i], c));
  if (!driving) drv.blink = g.car.hazard === true ? 'H' : null; // quattro frecce salvate (Nexus)
}
// ---------- v0.5: cancelli della Rotta Sicura visibili in auto ----------
const gateBeacon = new THREE.Group();
{
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.12, 8, 48), new THREE.MeshBasicMaterial({ color: '#7fd0a0', transparent: true, opacity: 0.85 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.25; gateBeacon.add(ring);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 24, 12, 1, true), new THREE.MeshBasicMaterial({ color: '#7fd0a0', transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }));
  col.position.y = 12; gateBeacon.add(col); gateBeacon.visible = false; scene.add(gateBeacon);
}
function gateBeaconUpdate(t) {
  const run = state.jobs && state.jobs.courier; const g = run && !run.spoiled && A.COURIER.gates[run.gate];
  gateBeacon.visible = !!g; if (g) { gateBeacon.position.set(g.x, 0, g.z); gateBeacon.children[0].scale.setScalar(1 + Math.sin(t * 2.5) * 0.05); }
}
function obstacles() { const out = []; for (const n of npcs) out.push(n.root.position); return out; }
const CAR_LIMIT = [{ x0: SEA.x0 - 6, x1: SEA.x1 + 4, zMin: SEA.carZ }]; // v0.6 (Atlas): auto ferme a z -149,5 davanti alla spiaggia
const carWorld = () => ({ boxes: world.boxes, circles: world.circles, obstacles: obstacles(), bounds: S.BOUNDS, grid: world.grid, liveCircles: world.liveCircles, carLimit: CAR_LIMIT });
function enterCar() {
  if (!parked || driving) return;
  if (sitting) standUp();
  footPose = playerPose(); if (state.garage.car) delete state.garage.car.hazard;
  car = parked; parked = null; parkedCircles.forEach((c) => Object.assign(c, OUT, { r: 0.1 }));
  driving = true; drv.gearR = false; Object.assign(drv, { steerL: 0, steerR: 0, gas: 0, brake: 0, kbStopT: 0 });
  player.root.visible = false; resetInputs(); closeAll();
  cam.yaw = cam.sYaw = car.yaw + Math.PI; cam.pitch = cam.sPitch = 0.26; drv.lookT = -10; cam.curDist = car.spec.len * 1.25 + 2.4; camInit = false;
  document.body.classList.add('driving'); updateDriveUI(); refreshHUD();
  toast(TOUCH ? `${car.spec.name}: Accelera a destra, ◀ ▶ per sterzare, ⬅ ➡ frecce. Da fermo, D/R per la retromarcia.` : `${car.spec.name}: W gas, S freno (tieni S da fermo per la retro), A/D sterzo, E per scendere.`, 4200);
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
  if (drv.blink !== 'H') drv.blink = null; // le quattro frecce restano accese da parcheggiati, le frecce no
  if (drv.blink === 'H') state.garage.car.hazard = true; // salvate (Nexus)
  carCircles(parked).forEach((c, i) => Object.assign(parkedCircles[i], c));
  player.root.visible = true; player.root.position.set(x, world.groundHeight(x, z), z);
  player.root.rotation.y = Math.atan2(x - parked.x, z - parked.z); player.play('Idle');
  cam.yaw = cam.sYaw = player.root.rotation.y + Math.PI; camInit = false;
  camera.fov = window.innerHeight > window.innerWidth ? 66 : 52; camera.updateProjectionMatrix();
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
  // v0.5 (Cranc): anche su touch tenere Frena da fermi per mezzo secondo inserisce la R, come S sulla tastiera
  if (drv.brake && !drv.gearR) { drv.tStopT = stopped ? (drv.tStopT || 0) + dt : 0; if (drv.tStopT > 0.5) { drv.gearR = true; drv.tStopT = 0; drv.brake = 0; document.querySelectorAll('#dBrake.on').forEach((el) => el.classList.remove('on')); toast('R inserita: Accelera per andare indietro. D/R per tornare avanti.', 2600); } } else drv.tStopT = 0;
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
  // v0.7: la freccia si spegne da sola dopo una svolta (>60°) quando lo sterzo torna dritto, come su un'auto vera
  if (drv.blink === 'L' || drv.blink === 'R') {
    const dy = Math.atan2(Math.sin(car.yaw - (drv.yaw0 ?? car.yaw)), Math.cos(car.yaw - (drv.yaw0 ?? car.yaw))); drv.yaw0 = car.yaw; drv.turned = Math.max(0, drv.turned + dy * (drv.blink === 'L' ? 1 : -1) * Math.sign(fwdSpeed(car) || 1)); // v0.7 (Nexus/Forge): conta solo la svolta nel verso della freccia
    drv.straightT = Math.abs(car.steer) < 0.08 ? drv.straightT + dt : 0;
    if (drv.turned > Math.PI / 3 && drv.straightT > 0.3) { drv.blink = null; updateDriveUI(); }
  }
  if (car.stuckT > 2.2) $('unstuck').classList.remove('hidden');
  if (car.autoBrake && Math.abs(v) > 1.5 && clock.elapsedTime - drv.warnT > 3.5) { drv.warnT = clock.elapsedTime; toast('Frenata automatica: c\'è qualcuno davanti.', 1800); }
  markDirty(); updateDriveUI();
}
function updateDriveUI() {
  if (!car) return; const v = fwdSpeed(car); const stopped = Math.abs(v) < 1;
  const k = kmh(car); const run = state.jobs && state.jobs.courier;
  const lim = run && !run.spoiled ? `<span class="lim ${k > A.COURIER_KMH ? 'over' : k > A.COURIER_KMH - 5 ? 'near' : ''}">36</span>` : '';
  const key = `${k}|${drv.gearR}|${drv.blink}|${lim}`; if (key === updateDriveUI.key) return; updateDriveUI.key = key; // v0.7 (Nexus): niente innerHTML a ogni fotogramma
  $('speedo').innerHTML = `<i class="tind l ${drv.blink === 'L' || drv.blink === 'H' ? 'lit' : ''}">◀</i><b>${k}</b> km/h <span class="gear ${drv.gearR ? 'r' : ''}">${drv.gearR ? 'R' : 'D'}</span>${lim}<i class="tind r ${drv.blink === 'R' || drv.blink === 'H' ? 'lit' : ''}">▶</i>`;
  for (const [bid, bk] of [['dBlinkL', 'L'], ['dBlinkR', 'R'], ['dHazard', 'H']]) { $(bid).classList.toggle('on', drv.blink === bk); $(bid).setAttribute('aria-pressed', String(drv.blink === bk)); }
  $('speedo').classList.toggle('over', !!(run && !run.spoiled && k > A.COURIER_KMH));
  const g = $('dGear'); g.textContent = drv.gearR ? 'R → D' : 'D → R'; g.disabled = !stopped; g.classList.toggle('dim', !stopped);
}
function chaseCamera(dt, t) {
  const v = fwdSpeed(car);
  const look = t - drv.lookT < 1.6 || lookId !== null;
  if (v < -0.8) drv.revHold = 0.4; else if (v > 0.45) drv.revHold = 0; else drv.revHold = Math.max(0, (drv.revHold || 0) - dt);
  const behind = car.yaw + ((drv.revHold || 0) > 0 ? 0 : Math.PI);
  if (!look) { cam.yaw = lerpAngle(cam.yaw, behind, Math.min(1, dt * 2.6)); cam.pitch += (0.26 - cam.pitch) * Math.min(1, dt * 2); }
  const k = Math.min(1, dt * 10); cam.sYaw = lerpAngle(cam.sYaw, cam.yaw, k); cam.sPitch += (cam.pitch - cam.sPitch) * k;
  const tgt = camTarget.set(car.x, 1.15 + (car.spec.wheelR || 0.32) + (car.spec.kind === 'SUV' ? 0.35 : 0.15), car.z);
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
// v0.7 (Nexus): frecce su tasti propri sopra il tachimetro (◀ ▶ restano lo sterzo)
function setBlinker(k) {
  drv.blink = drv.blink === k ? null : k; drv.turned = 0; drv.straightT = 0; drv.yaw0 = car ? car.yaw : 0;
  updateDriveUI(); if (!driving) return;
  toast(drv.blink === 'H' ? '⚠ Quattro frecce accese' : drv.blink === 'L' ? '⬅ Freccia a sinistra' : drv.blink === 'R' ? '➡ Freccia a destra' : 'Frecce spente', 1100);
}
for (const [id, k] of [['dBlinkL', 'L'], ['dBlinkR', 'R'], ['dHazard', 'H']]) $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); setBlinker(k); });
function blinkUpdate(t) {
  if (!carMesh) return; const on = !!drv.blink; const ph = on && (t * 1.5) % 1 < 0.55 ? 1 : 0; // 1,5 lampeggi al secondo
  setBlink(carMesh, ph && (drv.blink === 'L' || drv.blink === 'H') ? 1 : 0, ph && (drv.blink === 'R' || drv.blink === 'H') ? 1 : 0, on);
  if (driving && on) { const lit = !!ph; if (lit !== blinkUpdate.lit) { blinkUpdate.lit = lit; document.body.classList.toggle('blinkOn', lit); } }
  else if (blinkUpdate.lit) { blinkUpdate.lit = false; document.body.classList.remove('blinkOn'); }
}
$('dCam').onclick = () => recenter();
$('unstuck').onclick = () => unstuck();
$('cRetry').onclick = () => { if (A.courierRetry(state)) { if (state.jobs.courier) state.jobs.courier._told = false; saveNow(); refreshHUD(); toast('Rotta azzerata: ripassa dai 3 cancelli verdi, senza fretta.'); } };
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
  const short = !own && state.money < c.price ? `<small class="warn">Crediti insufficienti. Lavora qualche giornata (barista, bagnino, barbiere, meccanico) e torna qui.</small>` : '';
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
  swim, depthAt, cycleSwimStyle, toggleDive, SEA, get swimming() { return swimming(); }, get underwater() { return fxUnder; }, CAR_LIMIT, get quality() { return qualityTier; }, setQuality(t) { qualityPref = t; applyQuality(t === 'auto' ? (phoneLike ? 'media' : 'alta') : t); },
  get car() { const c = car || parked; return c && { id: state.garage.selected, x: c.x, z: c.z, yaw: c.yaw, v: fwdSpeed(c), kmh: kmh(c), gearR: drv.gearR, stuckT: c.stuckT, steer: c.steer, driving }; },
  setDrive(o) { Object.assign(drv, o); }, keys: input.keys,
  drive(sec, inp) { for (let t = 0; t < sec; t += 1 / 30) { stepCar(car, inp, 1 / 30, carWorld()); } const p = player.root.position; p.x = car.x; p.z = car.z; },
  pickShell, openGelato, openWash, rescueFoot, carInWash, get shells() { return A.shellsToday(state, Date.now()); }, shellMeshes, A, refreshHUD, updateDriveUI, get status() { return status; },
  // v0.7
  Life, NIGHT, dayNight, openAgency, openHouse, openJob, runTask, setBlinker, get blink() { return drv.blink; }, get topup() { return topup; },
  forceTask(q) { taskForced = q; }, taskDone, setHour(h) { const L = state.life; L.clock.gameMs = Life.gameDay(L) * Life.DAY_LEN_MS + h * Life.HOUR_MS; dayNight(true); refreshHUD(); },
  get headSpot() { return HEAD_SPOT ? headSpot.intensity : (headPool && headPool.visible ? 100 * headPool.material.opacity : 0); }, headMode: HEAD_SPOT ? 'spot' : 'pool', get pools() { return pools && pools.visible; }, get stars() { return nightSkyObj && nightSkyObj.stars.visible; },
  placeCar(x, z, yaw) { const c = car || parked; Object.assign(c, { x, z, yaw, vx: 0, vz: 0 }); if (!driving) placeParkedAt(x, z, yaw); },
};

boot().catch((e) => {
  console.error(e);
  $('loadMsg').innerHTML = 'Il rione non si è caricato. Controlla la connessione e tocca <button class="pill primary" id="loadRetry">Riprova</button><br><small>Dettagli: ' + esc(e && e.message || e) + '</small>';
  const b = document.getElementById('loadRetry'); if (b) b.onclick = () => location.reload();
});
