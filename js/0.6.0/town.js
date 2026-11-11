// v0.5: quartieri costruiti a celle da 80 m (est v0.4, Contrada Salina a ovest, Colle dei Limoni a nord).
// Ogni cella unisce la geometria per materiale (poche draw call) e viene scartata per frustum e distanza.
// Facciate: un solo materiale con atlante 2×2 (intonaco, intonaco dipinto, mattoni, intonaco d'argilla) + tinta per vertice.
import * as THREE from 'three';
import { GB, faces, hex, rng } from './geo.js';
import { LAYOUT as EAST } from './layout.js';
import { LAYOUT5, FILL_EAST, BEACH, PINETA, PIAZZA_LIMONI, LAVAGGIO, KIOSK, WALLS5, SEA, seabedY } from './layout5.js';

const CELL = 80; // v0.5: 80 m (con 48 m le draw call al centro erano ~300)
const BASE = 0.12;
const GF = 3.6, FH = 3.1;
// tinte desaturate da cittadina di mare (Spark, idee-v5): una calce ogni 3–4 facciate
const TINTS = ['#e8e0d0', '#dcc9a6', '#e8e0d0', '#d2ae78', '#d9a58f', '#e8e0d0', '#c98d6e', '#e3cf94', '#a9c1c6', '#aeb8a0', '#ecd2a8', '#f1e2c2'];
const SHUTTERS = ['#3f5a4a', '#3c5568', '#6e7a70', '#4d6b55', '#6b4a32', '#3f5a4a'];
const AWN = ['#7a2e2a', '#2f4f5f', '#3e5d3a', '#b08a3a', '#5c3a5e', '#a5573d', '#285a6e'];
export const SIGNS = ['FORNO LA MOLLICA', 'FIORI MAREA', 'LIBRERIA', 'FERRAMENTA BULLONE', 'FARMACIA DEL PORTO', 'PESCHERIA DUE RETI', 'TABACCHI E GIORNALI N. 7', 'FOCACCERIA', 'ALIMENTARI', 'MERCERIA', 'NOLEGGIO BICI', 'BAR DEL MOLO',
  'OFFICINA BULLONE FELICE', 'ROTTA SICURA', 'LIDO CONCHIGLIA', 'AUTOLAVAGGIO SCHIUMA', 'GELATERIA NUVOLA DI LIMONE', 'TRATTORIA DA NINO', 'OTTICA', 'CALZOLAIO'];
const SIGN_SUB = ['pane caldo', 'piante e composizioni', 'usato e nuovo', 'chiavi e attrezzi', 'aperta 8-20', 'pescato del giorno', 'giornali e riviste', 'focaccia calda', 'frutta e verdura', 'bottoni e filati', 'bici a ore', 'caffè e cornetti',
  'gomme e bulloni', 'pacchi senza fretta', 'ombrelloni e lettini', 'a mano e a spazzole', 'gelato artigianale', 'cucina di casa', 'occhiali e lenti', 'riparazioni'];

// ---------------- Materiali ----------------
function shopAtlas(world) {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 1024; const g = c.getContext('2d');
  const kinds = [
    [['#6b4a2c', '#3a2716'], '#8a6a48', ['#c98d4a', '#e0b070', '#a96a32', '#f0d9a8']],
    [['#3d4a35', '#20281d'], '#5a4a38', ['#d04a5a', '#f2c94c', '#f6f1e9', '#9b59b6', '#5a8f3c']],
    [['#4a3b33', '#251c17'], '#6b4f3a', ['#7a2e2a', '#2f4f5f', '#c9b48a', '#3e5d3a', '#d6d0c4']],
    [['#4b5258', '#24292d'], '#7a7f84', ['#c0392b', '#e67e22', '#95a5a6', '#2c3e50', '#f1c40f']],
    [['#dfe7e3', '#9fb2aa'], '#b8c4c0', ['#ffffff', '#2e8b57', '#7fb2d9', '#e6e1d8']],
    [['#cfd8dc', '#7d8f96'], '#9aa9ae', ['#b0bec5', '#ff8a65', '#ffccbc', '#90a4ae', '#eceff1']],
    [['#5d4c3c', '#2e241b'], '#7a6a58', ['#e8e2d0', '#d84315', '#1565c0', '#f9a825', '#ffffff']],
    [['#f3e9d2', '#bfae8a'], '#a08a66', ['#f6d36b', '#f8e9b0', '#ffb3c1', '#c8e6c9', '#ffffff']],
  ];
  const r = rng(11);
  kinds.forEach(([bg, shelf, items], i) => {
    const x0 = (i % 2) * 512, y0 = Math.floor(i / 2) * 256;
    const grd = g.createLinearGradient(0, y0, 0, y0 + 256); grd.addColorStop(0, bg[0]); grd.addColorStop(1, bg[1]); g.fillStyle = grd; g.fillRect(x0, y0, 512, 256);
    const lg = g.createRadialGradient(x0 + 256, y0 - 30, 10, x0 + 256, y0 - 30, 330); lg.addColorStop(0, '#fff3d0aa'); lg.addColorStop(1, '#fff3d000'); g.fillStyle = lg; g.fillRect(x0, y0, 512, 256);
    for (const y of [80, 150, 222]) { g.fillStyle = shelf; g.fillRect(x0, y0 + y, 512, 8); g.fillStyle = '#00000033'; g.fillRect(x0, y0 + y + 8, 512, 5);
      for (let x = 6; x < 506;) { const iw = 9 + r() * 24, ih = 16 + r() * 34; g.fillStyle = items[Math.floor(r() * items.length)]; g.fillRect(x0 + x, y0 + y - ih, iw, ih); g.fillStyle = '#ffffff22'; g.fillRect(x0 + x, y0 + y - ih, 3, ih); x += iw + 2 + r() * 7; } }
    // persona dietro il bancone (sagoma) e riflesso del vetro
    g.fillStyle = '#00000055'; g.beginPath(); g.ellipse(x0 + 360, y0 + 120, 16, 20, 0, 0, 7); g.fill(); g.fillRect(x0 + 336, y0 + 140, 48, 80);
    g.fillStyle = '#ffffff12'; g.beginPath(); g.moveTo(x0 + 60, y0); g.lineTo(x0 + 150, y0); g.lineTo(x0 + 60, y0 + 256); g.lineTo(x0 - 30, y0 + 256); g.fill();
  });
  // insegne: colonna destra 2×10
  SIGNS.forEach((txt, i) => {
    const x0 = 1024 + (i % 2) * 512, y0 = Math.floor(i / 2) * 102;
    const bgc = ['#1d2328', '#2a3a2c', '#3a2620', '#f1ead8', '#22343f'][i % 5]; const light = bgc === '#f1ead8';
    g.fillStyle = bgc; g.fillRect(x0, y0, 512, 102);
    g.strokeStyle = light ? '#7a5a3a' : '#e6bb70'; g.lineWidth = 4; g.strokeRect(x0 + 6, y0 + 6, 500, 90);
    g.fillStyle = light ? '#3a2a1c' : '#f2f1ec'; g.textAlign = 'center'; g.textBaseline = 'middle';
    let fs = 44; g.font = `600 ${fs}px Georgia, serif`; while (g.measureText(txt).width > 470 && fs > 18) { fs -= 2; g.font = `600 ${fs}px Georgia, serif`; }
    g.fillText(txt, x0 + 256, y0 + 42);
    g.fillStyle = light ? '#7a5a3a' : '#e6bb70'; g.font = '400 22px Georgia, serif'; g.fillText(SIGN_SUB[i] || '', x0 + 256, y0 + 78);
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true;
  return t;
}
function louverTex() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, 64, 128);
  for (let y = 4; y < 128; y += 8) { g.fillStyle = '#9a9a9a'; g.fillRect(4, y, 56, 2); g.fillStyle = '#ffffff'; g.fillRect(4, y + 2, 56, 2); }
  g.fillStyle = '#bdbdbd'; g.fillRect(0, 0, 4, 128); g.fillRect(60, 0, 4, 128); g.fillRect(0, 0, 64, 3); g.fillRect(0, 125, 64, 3);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const ATLAS_GLSL = `
varying float vTile; varying vec3 vWPf;
vec4 atlasTex(sampler2D t, vec2 uv) {
  vec2 f = fract(uv); float m = 0.01;
  vec2 q = vec2(mod(vTile, 2.0), 1.0 - floor(vTile / 2.0 + 0.01));
  vec2 a = (q + m + f * (1.0 - 2.0 * m)) * 0.5;
  return textureGrad(t, a, dFdx(uv) * 0.5, dFdy(uv) * 0.5);
}
float fh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float fn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(fh(i),fh(i+vec2(1,0)),f.x),mix(fh(i+vec2(0,1)),fh(i+vec2(1,1)),f.x),f.y); }`;
function facadeMaterial(tl) {
  const m = new THREE.MeshStandardMaterial({ map: tl('facadeatlas_albedo'), normalMap: tl('facadeatlas_normal', false), vertexColors: true, roughness: 0.93, metalness: 0 });
  m.normalScale.set(0.8, 0.8);
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aTile; varying float vTile; varying vec3 vWPf;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvTile = aTile; vWPf = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>' + ATLAS_GLSL)
      .replace('#include <map_fragment>', THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )', 'atlasTex( map, vMapUv )') + `
  // sporco: base scura vicino al marciapiede, colature leggere, macchie grandi
  float grime = 1.0 - 0.22 * (1.0 - smoothstep(0.1, 1.4, vWPf.y));
  float streak = fn(vec2(vWPf.x * 1.7 + vWPf.z * 1.7, vWPf.y * 0.08));
  float blot = fn(vWPf.xz * 0.05 + vWPf.y * 0.03);
  diffuseColor.rgb *= grime * (0.93 + 0.1 * streak) * (0.94 + 0.12 * blot);`)
      .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace('texture2D( normalMap, vNormalMapUv )', 'atlasTex( normalMap, vNormalMapUv )'));
  };
  m.customProgramCacheKey = () => 'facadeAtlas5';
  return m;
}
export function townMaterials(world) {
  const M = world.mats; const tl = world.texLoad.bind(world);
  const roof = world.makePbr('roof', { roughness: 0.82 }, 0.6); roof.vertexColors = true;
  const sand = world.makePbr('sand', { roughness: 1, color: '#e6d2ac' }, 1); sand.vertexColors = true;
  const atlas = shopAtlas(world);
  return {
    facade: facadeMaterial(tl),
    roof, sand,
    stone: M.stone,
    painted: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 }),
    iron: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.6 }),
    louver: new THREE.MeshStandardMaterial({ map: louverTex(), vertexColors: true, roughness: 0.7 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.05, metalness: 0.5, envMapIntensity: 1.25 }),
    foliage: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 }),
    shop: new THREE.MeshStandardMaterial({ map: atlas, emissiveMap: atlas, emissive: '#ffffff', emissiveIntensity: 0.34, roughness: 0.75 }),
    asphalt: M.asphalt, paving: M.paving, cobble: M.cobble, grass: M.grass, line: M.line, curb: M.curb,
    clay: new THREE.MeshStandardMaterial({ color: '#b08968', roughness: 0.95 }),
  };
}
const KEYS = {
  facade: { color: true, tile: true, cast: true }, roof: { color: true, cast: true }, sand: { color: true },
  stone: { cast: false }, painted: { color: true, cast: true }, iron: { color: true, cast: false }, louver: { color: true, detail: true },
  glass: { color: true, detail: true }, foliage: { color: true, cast: true }, shop: { detail: true },
  asphalt: {}, paving: {}, cobble: {}, grass: {}, line: { detail: true }, curb: {}, clay: {},
};

// ---------------- Celle ----------------
const ALIAS = { iron: 'painted', clay: 'painted' };
class Cells {
  constructor() { this.map = new Map(); }
  at(x, z) {
    const id = Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
    let c = this.map.get(id);
    if (!c) { c = { id, gb: new Map(), group: new THREE.Group() }; c.group.name = 'cell5-' + id; this.map.set(id, c); }
    return c;
  }
  gb(x, z, key) {
    key = ALIAS[key] || key; // v0.5: meno materiali per cella = meno draw call
    const c = this.at(x, z); let g = c.gb.get(key);
    if (!g) { const k = KEYS[key]; g = new GB({ color: !!k.color, tile: !!k.tile }); c.gb.set(key, g); }
    return g;
  }
}

// ---------------- Terreno ----------------
function cutsOf(rect, rects, axis) {
  const s = new Set([rect[axis + '0'], rect[axis + '1']]);
  for (const r of rects) for (const v of [r[axis + '0'], r[axis + '1']]) if (v > rect[axis + '0'] && v < rect[axis + '1']) s.add(v);
  return [...s].sort((a, b) => a - b);
}
const inR = (r, x, z) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
function groundPieces(rect, roads, zones) {
  const all = [...roads, ...zones.map((z) => z.r)];
  const xs = cutsOf(rect, all, 'x'), zs = cutsOf(rect, all, 'z');
  const out = [];
  for (let j = 0; j < zs.length - 1; j++) {
    let run = null;
    for (let i = 0; i < xs.length - 1; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
      let type = roads.some((r) => inR(r, cx, cz)) ? 'road' : 'paving';
      if (type !== 'road') for (const z of zones) if (inR(z.r, cx, cz)) { type = z.type; break; }
      if (run && run.type === type) { run.x1 = xs[i + 1]; continue; }
      if (run) out.push(run);
      run = { type, x0: xs[i], x1: xs[i + 1], z0: zs[j], z1: zs[j + 1] };
    }
    if (run) out.push(run);
  }
  return out.filter((p) => p.type !== 'road' && p.type !== 'none');
}

export function buildTown(world) {
  const TM = townMaterials(world);
  const cells = new Cells();
  const roads = [...EAST.roads, ...LAYOUT5.roads];
  const anyRoad = (x, z, pad = 0) => roads.some((r) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad);
  for (const rd of roads) { world.roads.push(rd); world.mapShapes.push({ type: 'road', ...rd }); }

  // --- terreno: rettangoli disgiunti (niente sovrapposizioni con la v0.3) ---
  const GROUND = [
    { x0: -250, x1: -96, z0: -150, z1: 178 },
    { x0: -96, x1: 96, z0: 76, z1: 178 },
    { x0: 96, x1: 168, z0: 66, z1: 178 },
    { x0: 168, x1: 268, z0: 66, z1: 134 },
    { x0: 268, x1: 516, z0: 66, z1: 72.5 },
    { x0: 96, x1: 516, z0: -177.4, z1: 66 },
  ];
  const zones = [
    { r: { x0: 312, x1: 458, z0: -58, z1: 8 }, type: 'grass' },
    { r: EAST.water[0], type: 'none' },
    { r: { x0: EAST.hill.x0, x1: EAST.hill.x1, z0: EAST.hill.ramp0, z1: EAST.hill.z1 }, type: 'none' },
    { r: PINETA, type: 'grass' },
    { r: PIAZZA_LIMONI, type: 'cobble' },
    { r: { x0: LAVAGGIO.x0, x1: LAVAGGIO.x1, z0: LAVAGGIO.z0 - 4, z1: LAVAGGIO.z1 }, type: 'cobble' },
    { r: { x0: 96, x1: 516, z0: -177.4, z1: -172 }, type: 'cobble' },
  ];
  for (const G of GROUND) {
    for (const p of groundPieces(G, roads, zones)) {
      const cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2;
      const key = p.type === 'grass' ? 'grass' : p.type === 'cobble' ? 'cobble' : 'paving';
      // pezzi grandi: spezzati in celle per il culling
      for (let x = p.x0; x < p.x1 - 0.01; x = Math.min(p.x1, (Math.floor(x / CELL) + 1) * CELL)) {
        const xe = Math.min(p.x1, (Math.floor(x / CELL) + 1) * CELL);
        for (let z = p.z0; z < p.z1 - 0.01; z = Math.min(p.z1, (Math.floor(z / CELL) + 1) * CELL)) {
          const ze = Math.min(p.z1, (Math.floor(z / CELL) + 1) * CELL);
          const g = cells.gb((x + xe) / 2, (z + ze) / 2, key);
          g.box(x, xe, 0, BASE, z, ze, { tile: key === 'grass' ? 4 : key === 'cobble' ? 2.5 : 2.2, faces: 't' });
          // bordo/cordolo verso la strada
          const curb = cells.gb((x + xe) / 2, (z + ze) / 2, 'curb');
          if (z === p.z0 && anyRoad((x + xe) / 2, z - 0.5)) curb.box(x, xe, 0, BASE + 0.02, z, z + 0.2, { tile: 1, faces: 'st' });
          if (ze === p.z1 && anyRoad((x + xe) / 2, ze + 0.5)) curb.box(x, xe, 0, BASE + 0.02, ze - 0.2, ze, { tile: 1, faces: 'nt' });
          if (x === p.x0 && anyRoad(x - 0.5, (z + ze) / 2)) curb.box(x, x + 0.2, 0, BASE + 0.02, z, ze, { tile: 1, faces: 'wt' });
          if (xe === p.x1 && anyRoad(xe + 0.5, (z + ze) / 2)) curb.box(xe - 0.2, xe, 0, BASE + 0.02, z, ze, { tile: 1, faces: 'et' });
        }
      }
      if (p.type === 'grass') world.mapShapes.push({ type: 'grass', x0: p.x0, x1: p.x1, z0: p.z0, z1: p.z1 });
      else if (p.type === 'cobble') world.mapShapes.push({ type: 'piazza', x0: p.x0, x1: p.x1, z0: p.z0, z1: p.z1 });
      else world.mapShapes.push({ type: 'block', x0: p.x0, x1: p.x1, z0: p.z0, z1: p.z1 });
    }
  }
  // --- strade: asfalto, mezzeria tratteggiata, strisce pedonali agli incroci ---
  for (const rd of roads) {
    const alongX = rd.x1 - rd.x0 > rd.z1 - rd.z0;
    const L = alongX ? rd.x1 - rd.x0 : rd.z1 - rd.z0;
    const step = CELL / 2;
    for (let s = 0; s < L; s += step) {
      const e = Math.min(L, s + step);
      const x0 = alongX ? rd.x0 + s : rd.x0, x1 = alongX ? rd.x0 + e : rd.x1, z0 = alongX ? rd.z0 : rd.z0 + s, z1 = alongX ? rd.z1 : rd.z0 + e;
      cells.gb((x0 + x1) / 2, (z0 + z1) / 2, 'asphalt').box(x0, x1, -0.01, 0, z0, z1, { tile: 5, faces: 't' });
    }
    const mid = alongX ? (rd.z0 + rd.z1) / 2 : (rd.x0 + rd.x1) / 2;
    for (let s = 2; s < L - 2; s += 5) {
      const x = alongX ? rd.x0 + s : mid, z = alongX ? mid : rd.z0 + s;
      if (roads.some((o) => o !== rd && inR({ x0: o.x0 - 3, x1: o.x1 + 3, z0: o.z0 - 3, z1: o.z1 + 3 }, x, z))) continue;
      const g = cells.gb(x, z, 'line');
      if (alongX) g.box(x - 1, x + 1, 0, 0.006, z - 0.07, z + 0.07, { tile: 1, faces: 't' }); else g.box(x - 0.07, x + 0.07, 0, 0.006, z - 1, z + 1, { tile: 1, faces: 't' });
    }
  }
  const H = roads.filter((r) => r.x1 - r.x0 > r.z1 - r.z0), V = roads.filter((r) => !(r.x1 - r.x0 > r.z1 - r.z0));
  for (const h of H) for (const v of V) {
    const I = { x0: Math.max(h.x0, v.x0), x1: Math.min(h.x1, v.x1), z0: Math.max(h.z0, v.z0), z1: Math.min(h.z1, v.z1) };
    if (I.x0 >= I.x1 || I.z0 >= I.z1) continue;
    const zebra = (x0, x1, z0, z1, alongX) => { const g = cells.gb((x0 + x1) / 2, (z0 + z1) / 2, 'line');
      if (alongX) for (let x = x0 + 0.5; x < x1 - 0.3; x += 1.0) g.box(x, x + 0.5, 0, 0.007, z0, z1, { tile: 1, faces: 't' });
      else for (let z = z0 + 0.5; z < z1 - 0.3; z += 1.0) g.box(x0, x1, 0, 0.007, z, z + 0.5, { tile: 1, faces: 't' }); };
    if (h.x0 < I.x0 - 8) zebra(I.x0 - 4.2, I.x0 - 1.2, I.z0 + 0.4, I.z1 - 0.4, false);
    if (h.x1 > I.x1 + 8) zebra(I.x1 + 1.2, I.x1 + 4.2, I.z0 + 0.4, I.z1 - 0.4, false);
    if (v.z0 < I.z0 - 8) zebra(I.x0 + 0.4, I.x1 - 0.4, I.z0 - 4.2, I.z0 - 1.2, true);
    if (v.z1 > I.z1 + 8) zebra(I.x0 + 0.4, I.x1 - 0.4, I.z1 + 1.2, I.z1 + 4.2, true);
  }

  // --- spiaggia: sabbia in pendenza fino al mare ---
  {
    // v0.6: la sabbia continua sott'acqua fino a z -262 (fondale vero, niente vuoto sotto il mare)
    const B = BEACH; const nx = 32; const ZS = -262;
    // righe allineate ai cambi di pendenza: la mesh e groundHeight() coincidono al centimetro
    const zs = [...new Set([...Array.from({ length: 29 }, (_, k) => B.z1 - k * 4), B.flat, B.edge, -196, -204, -228, -232, ZS].map((z) => Math.max(ZS, z)))].sort((a, b) => a - b);
    const nz = zs.length - 1;
    const hAt = (z) => z >= B.flat ? BASE : z >= B.edge ? BASE + (B.low - BASE) * (B.flat - z) / (B.flat - B.edge) : seabedY(z);
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const x0 = B.x0 + (B.x1 - B.x0) * i / nx, x1 = B.x0 + (B.x1 - B.x0) * (i + 1) / nx;
      const z0 = zs[j], z1 = zs[j + 1];
      const g = cells.gb((x0 + x1) / 2, (z0 + z1) / 2, 'sand');
      const col = (z) => { const y = hAt(z); const wet = THREE.MathUtils.smoothstep(-y, 0.25, 0.75); const deep = THREE.MathUtils.clamp((SEA.y - y) / 5, 0, 1);
        return [0.96 * (1 - 0.38 * wet) * (1 - 0.35 * deep), 0.88 * (1 - 0.4 * wet) * (1 - 0.18 * deep), 0.74 * (1 - 0.4 * wet) * (1 - 0.05 * deep)]; };
      const y0 = hAt(z0), y1 = hAt(z1); const dz = z1 - z0, dy = y1 - y0; const ln = Math.hypot(dz, dy); const nrm = [0, dz / ln, -dy / ln];
      const T = 3;
      const v = this_quadSand(g, x0, x1, z0, z1, y0, y1, nrm, T, col(z0), col(z1));
    }
    world.beach = B; world.beachHeight = hAt;
    world.mapShapes.push({ type: 'sand', x0: B.x0, x1: B.x1, z0: B.edge - 1.5, z1: B.z1 });
  }

  // --- edifici ---
  const allB = [...EAST.buildings.map((b) => ({ ...b, dist: 'est' })), ...FILL_EAST, ...LAYOUT5.buildings, ...LAYOUT5.backdrop];
  const r = rng(2025);
  for (const b of allB) building(cells, world, b, allB, r);
  // landmark: campanile della Piazza dei Limoni (riferimento visivo a nord, il Faro è a sud)
  tower(cells, world, 0, 160);

  // --- arredo ---
  const lampPts = [], treePts = [], carPts = [];
  const blocked = (x, z, pad) => allB.some((b) => !b.backdrop && x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad);
  const noProp = [
    { x0: LAVAGGIO.x0 - 4, x1: LAVAGGIO.x1 + 4, z0: 118, z1: LAVAGGIO.z1 }, { x0: 150, x1: 182, z0: -32, z1: -14 }, { x0: 200, x1: 236, z0: -112, z1: -96 },
    { x0: EAST.hill.x0 - 2, x1: EAST.hill.x1 + 2, z0: 26, z1: 68 }, { x0: 370, x1: 400, z0: -34, z1: -20 },
  ];
  const free = (x, z) => !noProp.some((q) => inR(q, x, z));
  for (const rd of roads) {
    const alongX = rd.x1 - rd.x0 > rd.z1 - rd.z0; const L = alongX ? rd.x1 - rd.x0 : rd.z1 - rd.z0;
    const nearCross = (x, z) => roads.some((o) => o !== rd && inR({ x0: o.x0 - 7, x1: o.x1 + 7, z0: o.z0 - 7, z1: o.z1 + 7 }, x, z));
    const isWide = ['Via dei Limoni', 'Via delle Vele', 'Lungomare di Ponente', 'Via dei Pini', 'Via del Porto', 'Lungomare'].includes(rd.name);
    for (const side of [-1, 1]) {
      for (let s = 10; s < L - 6; s += 12) {
        const k = Math.round(s / 12);
        const off = side < 0 ? -0.8 : 0.8;
        const x = alongX ? rd.x0 + s : (side < 0 ? rd.x0 + off : rd.x1 + off), z = alongX ? (side < 0 ? rd.z0 + off : rd.z1 + off) : rd.z0 + s;
        if (x < -96 && x > -250 || z > 74 || x > 96) { /* solo quartieri v0.4/v0.5 */ } else continue;
        if (nearCross(x, z) || blocked(x, z, 0.6) || !free(x, z) || x < -249 || x > 515) continue;
        if (!world.onGroundAt(x, z)) continue;
        if ((k + (side > 0 ? 1 : 0)) % 2 === 0) lampPts.push([x, z, alongX ? (side < 0 ? 0 : Math.PI) : (side < 0 ? Math.PI / 2 : -Math.PI / 2)]);
        else if (isWide) { const t = alongX ? [x, z + side * 0.5] : [x + side * 0.5, z]; if (!blocked(t[0], t[1], 1.2)) treePts.push([...t, 'street']); }
        // auto parcheggiate sul lato della carreggiata
        if (r() < 0.32 && !(rd.name === 'Lungomare' || rd.name === 'Via delle Cale')) {
          const pz = alongX ? (side < 0 ? rd.z0 + 1.15 : rd.z1 - 1.15) : rd.z0 + s + 6, px = alongX ? rd.x0 + s + 6 : (side < 0 ? rd.x0 + 1.15 : rd.x1 - 1.15);
          if (!nearCross(px, pz) && free(px, pz) && s + 6 < L - 8) carPts.push([px, pz, alongX ? Math.PI / 2 * (side < 0 ? 1 : -1) : (side < 0 ? 0 : Math.PI), alongX]);
        }
      }
    }
  }
  // pineta: pini a ombrello
  const rp = rng(31);
  for (let i = 0; i < 70; i++) { const x = PINETA.x0 + 3 + rp() * (PINETA.x1 - PINETA.x0 - 6), z = PINETA.z0 + 3 + rp() * (PINETA.z1 - PINETA.z0 - 6); if (Math.abs(x - (PINETA.x0 + PINETA.x1) / 2) < 2.5) continue; if (treePts.some((t) => Math.hypot(t[0] - x, t[1] - z) < 6)) continue; treePts.push([x, z, 'pine']); }
  // parco dei Giardini (v0.4): alberi più credibili
  for (const [x, z] of [[330, -40], [360, -10], [410, -36], [440, -8], [340, 0], [420, -50], [325, -20], [445, -30], [350, -52], [405, 2]]) treePts.push([x, z, 'park']);
  for (const [x, z] of [[168, -18], [220, -96], [430, 48], [-30, 138], [30, 138], [-30, 160], [30, 160]]) treePts.push([x, z, x > -40 && x < 40 && z > 130 ? 'lemon' : 'park']);
  for (const t of treePts) tree(cells, world, t[0], t[1], t[2], rp);
  world.lampPts5 = lampPts; world.carPts5 = carPts;
  for (const [x, z] of lampPts) world.circles.push({ x, z, r: 0.25 });

  // --- luoghi speciali ---
  beachProps(cells, world, rp);
  piazzaLimoni(cells, world, rp);
  carWash(cells, world);
  eastSpecials(cells, world, TM);
  // panchine nella pineta e sul lungomare di ponente
  for (const [x, z, ry] of [[-213, 40, 0], [-213, 92, Math.PI], [-200, 66, -Math.PI / 2], [-226, 66, Math.PI / 2], [-150, -151.2, Math.PI], [-125, -151.2, Math.PI], [-225, -151.2, Math.PI]]) bench(cells, world, x, z, ry);
  for (const w of WALLS5) world.addBox(w.x0, w.x1, w.z0, w.z1, 0, 50);

  // --- finalizza: mesh per cella ---
  const list = [];
  for (const c of cells.map.values()) {
    for (const [key, g] of c.gb) {
      if (g.empty) continue;
      const mesh = new THREE.Mesh(g.geometry(), TM[key]);
      mesh.castShadow = !!KEYS[key].cast; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
      mesh.userData.detail = !!KEYS[key].detail;
      c.group.add(mesh);
    }
    c.gb = null;
    const box = new THREE.Box3().setFromObject(c.group);
    if (box.isEmpty()) continue;
    c.group.userData.box = box; c.group.userData.details = c.group.children.filter((m) => m.userData.detail);
    world.scene.add(c.group); list.push(c.group);
  }
  world.cells5 = list; world.TM = TM;
  return list;
}
function this_quadSand(g, x0, x1, z0, z1, y0, y1, nrm, T, c0, c1) {
  const v = g.vc;
  for (const [x, y, z] of [[x0, y0, z0], [x1, y0, z0], [x1, y1, z1], [x0, y1, z1]]) { g.p.push(x, y, z); g.n.push(nrm[0], nrm[1], nrm[2]); g.uv.push(x / T, z / T); }
  for (const c of [c0, c0, c1, c1]) g.c.push(c[0], c[1], c[2]);
  g.i.push(v, v + 2, v + 1, v, v + 3, v + 2); g.vc += 4;
}

// ---------------- Edificio ----------------
function blindFaces(b, all) {
  const out = new Set();
  for (const o of all) {
    if (o === b || o.backdrop) continue;
    const ox = Math.min(b.x1, o.x1) - Math.max(b.x0, o.x0), oz = Math.min(b.z1, o.z1) - Math.max(b.z0, o.z0);
    if (oz > (b.z1 - b.z0) * 0.4) { if (o.x0 >= b.x1 - 0.1 && o.x0 - b.x1 < 1.2) out.add('e'); if (o.x1 <= b.x0 + 0.1 && b.x0 - o.x1 < 1.2) out.add('w'); }
    if (ox > (b.x1 - b.x0) * 0.4) { if (o.z0 >= b.z1 - 0.1 && o.z0 - b.z1 < 1.2) out.add('n'); if (o.z1 <= b.z0 + 0.1 && b.z0 - o.z1 < 1.2) out.add('s'); }
  }
  return out;
}
function building(cells, world, b, all, r) {
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  const G = (k) => cells.gb(cx, cz, k);
  const seed = Math.abs(Math.round(cx * 13.7 + cz * 7.1)) + 1; const R = rng(seed * 31);
  const tile = b.special === 'kiosk' ? 1 : b.special ? 0 : [0, 1, 1, 2, 3, 0, 3][Math.floor(R() * 7)];
  const tint = hex(b.special === 'kiosk' ? '#f4efe4' : tile === 2 ? ['#ffffff', '#f0e6dc', '#e8ddd0'][Math.floor(R() * 3)] : TINTS[Math.floor(R() * TINTS.length)]);
  const small = b.special === 'kiosk' || b.special === 'lavaggio';
  const nUp = small ? 0 : Math.max(1, Math.round((b.h - GF) / FH));
  const H = small ? b.h : GF + nUp * FH + 0.3;
  const top = BASE + H;
  const F = faces(b);
  const blind = b.backdrop ? new Set(['n', 's', 'e', 'w'].filter((k) => k !== b.front)) : blindFaces(b, all);
  const shutterCol = hex(SHUTTERS[Math.floor(R() * SHUTTERS.length)]);
  const hasShutters = R() < 0.75 && tile !== 2;
  const frameCol = hex(R() < 0.75 ? '#ece6da' : '#5a4636');
  const balc = !small && nUp >= 1 && R() < 0.5;
  const flat = b.flat || R() < 0.38;
  // corpo
  for (const f of Object.values(F)) G('facade').wallQuad(f, 0, f.len, BASE, top, 0, { tile: 3, col: tint, t: tile });
  if (!b.backdrop) world.addBox(b.x0, b.x1, b.z0, b.z1, 0, top);
  // zoccolo, marcapiano, cornicione
  for (const f of Object.values(F)) {
    if (b.backdrop && f.id !== b.front) continue;
    G('stone').wallQuad(f, -0.04, f.len + 0.04, BASE, BASE + 0.85, 0.04, { tile: 2 });
    if (!small) {
      G('stone').wallQuad(f, -0.06, f.len + 0.06, BASE + GF - 0.1, BASE + GF + 0.08, 0.06, { tile: 2 });
      G('stone').wallQuad(f, -0.22, f.len + 0.22, top - 0.3, top, 0.22, { tile: 2 });
    }
  }
  // finestre e porte
  for (const f of Object.values(F)) {
    if (blind.has(f.id) || f.len < 3.4) continue;
    const isFront = f.id === b.front;
    const n = Math.max(1, Math.floor((f.len - 1.0) / 2.9)); const step = f.len / n;
    const shopFront = isFront && (b.shop || b.special) && f.len > 5;
    const doorK = Math.floor(n / 2);
    for (let fl = -1; fl < nUp; fl++) {
      if (b.backdrop && fl < 0) continue;
      for (let k = 0; k < n; k++) {
        const u = step * (k + 0.5);
        if (fl < 0) {
          if (small) continue;
          if (shopFront) continue;
          if (isFront && k === doorK) { door(G, f, u); continue; }
          windowAt(G, f, u, BASE + 1.75, 1.0, 1.25, { frameCol, shutterCol, shutters: false, R, ground: true });
          continue;
        }
        const y0 = BASE + GF + fl * FH;
        const isBalc = balc && fl === 0 && (n <= 3 || k % 2 === 0) && !b.backdrop;
        if (isBalc) { windowAt(G, f, u, y0 + 1.25, 1.1, 2.25, { frameCol, shutterCol, shutters: hasShutters, R }); balcony(G, f, u, y0); }
        else windowAt(G, f, u, y0 + 1.55, 1.05, 1.45, { frameCol, shutterCol, shutters: hasShutters, R });
      }
    }
    if (shopFront) storefront(G, world, f, b, R);
  }
  // tetto
  if (flat) {
    const g = G('painted'); const c = hex('#8a857c');
    g.box(b.x0, b.x1, top - 0.05, top - 0.04, b.z0, b.z1, { faces: 't', col: c });
    // parapetto
    const pz = 0.25, ph = 0.6;
    for (const [x0, x1, z0, z1] of [[b.x0, b.x1, b.z0, b.z0 + pz], [b.x0, b.x1, b.z1 - pz, b.z1], [b.x0, b.x0 + pz, b.z0, b.z1], [b.x1 - pz, b.x1, b.z0, b.z1]]) {
      G('facade').box(x0, x1, top, top + ph, z0, z1, { tile: 3, col: tint, t: tile, faces: 'nsew' });
      G('stone').box(x0 - 0.05, x1 + 0.05, top + ph, top + ph + 0.08, z0 - 0.05, z1 + 0.05, { tile: 2, faces: 't' });
    }
    if (!small && R() < 0.7) { const x = b.x0 + 1.5 + R() * (b.x1 - b.x0 - 3), z = b.z0 + 1.5 + R() * (b.z1 - b.z0 - 3); G('facade').box(x - 0.4, x + 0.4, top, top + 1.4, z - 0.4, z + 0.4, { col: tint, t: tile, faces: 'nsewt' }); }
  } else {
    roofHip(G('roof'), b.x0, b.x1, b.z0, b.z1, top, R);
  }
  if (!b.backdrop) world.mapShapes.push({ type: 'building', x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, special: b.special || null });
}
function windowAt(G, f, u, yc, w, h, o) {
  const fc = o.frameCol; const R = o.R;
  const closed = o.shutters && R() < 0.14;
  G('painted').wallQuad(f, u - w / 2 - 0.09, u + w / 2 + 0.09, yc - h / 2 - 0.09, yc + h / 2 + 0.09, 0.02, { col: fc });
  if (closed) { G('louver').wallQuad(f, u - w / 2, u + w / 2, yc - h / 2, yc + h / 2, 0.035, { col: o.shutterCol, uvBox: [[0, 0], [2, 0], [2, 1], [0, 1]] }); }
  else {
    const lit = R() < 0.18; const gc = lit ? [0.55, 0.45, 0.32] : [0.35 + R() * 0.12, 0.42 + R() * 0.1, 0.5 + R() * 0.1];
    G('glass').wallQuad(f, u - w / 2, u + w / 2, yc - h / 2, yc + h / 2, 0.03, { col: gc });
    G('painted').wallQuad(f, u - 0.03, u + 0.03, yc - h / 2, yc + h / 2, 0.036, { col: fc });
    G('painted').wallQuad(f, u - w / 2, u + w / 2, yc + h * 0.22, yc + h * 0.22 + 0.05, 0.036, { col: fc });
    if (o.shutters) for (const s of [-1, 1]) {
      const a = s < 0 ? u - w / 2 - w / 2 - 0.1 : u + w / 2 + 0.1; G('louver').wallQuad(f, a, a + w / 2, yc - h / 2, yc + h / 2 + 0.05, 0.035, { col: o.shutterCol, uvBox: [[0, 0], [1, 0], [1, 1], [0, 1]] });
    }
  }
  // davanzale
  const y0 = yc - h / 2 - 0.09;
  G('stone').wallQuad(f, u - w / 2 - 0.16, u + w / 2 + 0.16, y0 - 0.07, y0, 0.14, { tile: 1 });
  sillTop(G('stone'), f, u - w / 2 - 0.16, u + w / 2 + 0.16, y0, 0.14);
  if (!o.ground && R() < 0.5) G('stone').wallQuad(f, u - w / 2 - 0.14, u + w / 2 + 0.14, yc + h / 2 + 0.1, yc + h / 2 + 0.24, 0.04, { tile: 1 });
}
function sillTop(g, f, u0, u1, y, d) {
  const rx = f.nz, rz = -f.nx; const P = (u, off) => [f.ox + rx * u + f.nx * off, y, f.oz + rz * u + f.nz * off];
  g.quad(P(u0, d), P(u1, d), P(u1, 0), P(u0, 0), [0, 1, 0], [[0, 0], [1, 0], [1, 0.1], [0, 0.1]]);
}
function balcony(G, f, u, y0) {
  const w = 1.9, d = 0.85, t = 0.14; const rx = f.nz, rz = -f.nx;
  const P = (uu, off, y) => [f.ox + rx * uu + f.nx * off, y, f.oz + rz * uu + f.nz * off];
  const g = G('stone'); const a = u - w / 2, b = u + w / 2, yb = y0 + 0.02, yt = y0 + 0.02 + t;
  g.quad(P(a, d, yt), P(b, d, yt), P(b, 0, yt), P(a, 0, yt), [0, 1, 0], [[0, 0], [1, 0], [1, 0.5], [0, 0.5]]);
  g.quad(P(a, d, yb), P(b, d, yb), P(b, d, yt), P(a, d, yt), [f.nx, 0, f.nz], [[0, 0], [1, 0], [1, 0.1], [0, 0.1]]);
  g.quad(P(a, 0, yb), P(b, 0, yb), P(b, d, yb), P(a, d, yb), [0, -1, 0], [[0, 0], [1, 0], [1, 0.5], [0, 0.5]]);
  // ringhiera in ferro: corrimano, bacchette verticali
  const ir = G('iron'); const col = [0.12, 0.12, 0.12]; const rh = 1.0;
  const bar = (u0, u1, o0, o1, ya, yb2) => { // faccia frontale e laterale di un'asta sottile
    ir.quad(P(u0, o1, ya), P(u1, o1, ya), P(u1, o1, yb2), P(u0, o1, yb2), [f.nx, 0, f.nz], [[0, 0], [1, 0], [1, 1], [0, 1]], col);
    ir.quad(P(u1, o1, ya), P(u1, o0, ya), P(u1, o0, yb2), P(u1, o1, yb2), [rx, 0, rz], [[0, 0], [1, 0], [1, 1], [0, 1]], col);
    ir.quad(P(u0, o0, ya), P(u0, o1, ya), P(u0, o1, yb2), P(u0, o0, yb2), [-rx, 0, -rz], [[0, 0], [1, 0], [1, 1], [0, 1]], col);
  };
  bar(a + 0.02, b - 0.02, d - 0.06, d - 0.02, yt + rh - 0.05, yt + rh);
  bar(a + 0.02, b - 0.02, d - 0.06, d - 0.02, yt + 0.08, yt + 0.11);
  for (let uu = a + 0.08; uu < b - 0.05; uu += 0.16) bar(uu, uu + 0.025, d - 0.05, d - 0.03, yt, yt + rh);
  for (const uu of [a + 0.02, b - 0.05]) for (let o = 0.1; o < d - 0.08; o += 0.17) bar(uu, uu + 0.03, o, o + 0.025, yt, yt + rh);
  bar(a + 0.02, a + 0.05, 0, d - 0.02, yt + rh - 0.05, yt + rh); bar(b - 0.05, b - 0.02, 0, d - 0.02, yt + rh - 0.05, yt + rh);
}
function door(G, f, u) {
  G('stone').wallQuad(f, u - 0.95, u + 0.95, BASE, BASE + 2.75, 0.03, { tile: 1.2 });
  G('painted').wallQuad(f, u - 0.68, u + 0.68, BASE, BASE + 2.45, 0.045, { col: hex('#4a3122') });
  G('painted').wallQuad(f, u - 0.03, u + 0.03, BASE + 0.1, BASE + 2.3, 0.05, { col: hex('#2e1e14') });
  G('iron').wallQuad(f, u + 0.32, u + 0.42, BASE + 1.05, BASE + 1.15, 0.055, { col: [0.7, 0.6, 0.35] });
}
function storefront(G, world, f, b, R) {
  const sw = Math.min(f.len - 1.6, 6.8), u = f.len / 2;
  const specialSign = { officina: 12, corriere: 13, kiosk: 14, lavaggio: 15 }[b.special];
  const si = specialSign != null ? specialSign : Math.floor(R() * 12);
  const ii = specialSign != null ? 3 : [0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 6][si % 12];
  if (b.special === 'officina') {
    G('iron').wallQuad(f, u - 2.6, u + 2.6, BASE, BASE + 3.1, 0.04, { col: hex('#6f767a') });
    for (let y = BASE + 0.2; y < BASE + 3.0; y += 0.22) G('iron').wallQuad(f, u - 2.6, u + 2.6, y, y + 0.03, 0.05, { col: hex('#4f5558') });
  } else if (b.special !== 'lavaggio') {
    G('painted').wallQuad(f, u - sw / 2 - 0.12, u + sw / 2 + 0.12, BASE + 0.45, BASE + 3.0, 0.02, { col: hex('#2b2f33') });
    const ix = (ii % 2) * 0.25, iy = 1 - (Math.floor(ii / 2) + 1) * 0.25;
    G('shop').wallQuad(f, u - sw / 2, u + sw / 2, BASE + 0.55, BASE + 2.9, 0.035, { uvBox: [[ix, iy], [ix + 0.25, iy], [ix + 0.25, iy + 0.25], [ix, iy + 0.25]] });
    G('stone').wallQuad(f, u - sw / 2 - 0.15, u + sw / 2 + 0.15, BASE, BASE + 0.5, 0.06, { tile: 1.5 });
    // tenda
    const ac = hex(AWN[Math.floor(R() * AWN.length)]); const rx = f.nz, rz = -f.nx;
    const P = (uu, off, y) => [f.ox + rx * uu + f.nx * off, y, f.oz + rz * uu + f.nz * off];
    const a = u - sw / 2 - 0.15, c = u + sw / 2 + 0.15, y1 = BASE + 3.15, y2 = BASE + 2.6, d = 1.35;
    const nY = d, nU = (y1 - y2); const ln = Math.hypot(nY, nU);
    G('painted').quad(P(a, d, y2), P(c, d, y2), P(c, 0, y1), P(a, 0, y1), [f.nx * nU / ln, nY / ln, f.nz * nU / ln], [[0, 0], [1, 0], [1, 1], [0, 1]], ac);
    G('painted').quad(P(a, d, y2 - 0.28), P(c, d, y2 - 0.28), P(c, d, y2), P(a, d, y2), [f.nx, 0, f.nz], [[0, 0], [1, 0], [1, 1], [0, 1]], ac.map((v) => v * 0.85));
    const ex = [P(a, 0, 0), P(c, d, 0)]; world.addBox(Math.min(ex[0][0], ex[1][0]), Math.max(ex[0][0], ex[1][0]), Math.min(ex[0][2], ex[1][2]), Math.max(ex[0][2], ex[1][2]), 2.5, 3.2);
  }
  // insegna
  const sx = 0.5 + (si % 2) * 0.25, sy = 1 - (Math.floor(si / 2) + 1) * (102 / 1024);
  const swd = Math.min(sw, 4.6);
  G('shop').wallQuad(f, u - swd / 2, u + swd / 2, BASE + 3.22, BASE + 3.22 + swd * 0.2, 0.08, { uvBox: [[sx, sy], [sx + 0.25, sy], [sx + 0.25, sy + 102 / 1024], [sx, sy + 102 / 1024]] });
}
function roofHip(g, x0, x1, z0, z1, y, R) {
  const o = 0.45; const a0 = x0 - o, a1 = x1 + o, b0 = z0 - o, b1 = z1 + o;
  const w = a1 - a0, d = b1 - b0; const slope = 0.5 + R() * 0.12;
  const tint = hex(['#ffffff', '#f2e4dc', '#e6d6cc', '#fff4e8'][Math.floor(R() * 4)]);
  const T = 2.2;
  const face = (A, B, C, D) => { // trapezio/triangolo con normale calcolata
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = D[0] - A[0], vy = D[1] - A[1], vz = D[2] - A[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const uvp = (P) => { const along = Math.abs(nx) > Math.abs(nz) ? P[2] : P[0]; const up = Math.hypot(P[0] - A[0] * 0, 0) * 0 + (P[1] - y) / Math.max(0.2, ny) ; return [along / T, up / T]; };
    if (D) g.quad(A, B, C, D, [nx, ny, nz], [uvp(A), uvp(B), uvp(C), uvp(D)], tint); 
  };
  if (w >= d) {
    const rh = (d / 2) * slope, zc = (b0 + b1) / 2; const r0 = a0 + d / 2, r1 = a1 - d / 2;
    face([a1, y, b0], [a0, y, b0], [r0, y + rh, zc], [r1, y + rh, zc]);            // sud
    face([a0, y, b1], [a1, y, b1], [r1, y + rh, zc], [r0, y + rh, zc]);            // nord
    tri(g, [a0, y, b0], [a0, y, b1], [r0, y + rh, zc], tint, T, y);             // ovest
    tri(g, [a1, y, b1], [a1, y, b0], [r1, y + rh, zc], tint, T, y);             // est
  } else {
    const rh = (w / 2) * slope, xc = (a0 + a1) / 2; const r0 = b0 + w / 2, r1 = b1 - w / 2;
    face([a0, y, b0], [a0, y, b1], [xc, y + rh, r1], [xc, y + rh, r0]);            // ovest
    face([a1, y, b1], [a1, y, b0], [xc, y + rh, r0], [xc, y + rh, r1]);            // est
    tri(g, [a1, y, b0], [a0, y, b0], [xc, y + rh, r0], tint, T, y);
    tri(g, [a0, y, b1], [a1, y, b1], [xc, y + rh, r1], tint, T, y);
  }
  // sottogronda
  g.quad([a0, y - 0.01, b0], [a1, y - 0.01, b0], [a1, y - 0.01, b1], [a0, y - 0.01, b1], [0, -1, 0], [[0, 0], [0.1, 0], [0.1, 0.1], [0, 0.1]], [0.55, 0.5, 0.45]);
}
function tri(g, A, B, C, tint, T, y) {
  const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
  const uvp = (P) => [(Math.abs(nx) > Math.abs(nz) ? P[2] : P[0]) / T, (P[1] - y) / Math.max(0.2, ny) / T];
  g.tri(A, B, C, [nx, ny, nz], [uvp(A), uvp(B), uvp(C)], tint);
}

// ---------------- Alberi ----------------
function blob(g, cx, cy, cz, rx, ry, rz, col, R, seg = 7) {
  // ellissoide a bassa risoluzione con normali "sferiche" morbide e colore più chiaro in alto
  const rows = 5;
  const pts = [];
  for (let i = 0; i <= rows; i++) { const th = (i / rows) * Math.PI; const row = [];
    for (let j = 0; j <= seg; j++) { const ph = (j / seg) * Math.PI * 2; const jit = i === 0 || i === rows ? 1 : 0.86 + R() * 0.28;
      const nx = Math.sin(th) * Math.cos(ph), ny = Math.cos(th), nz = Math.sin(th) * Math.sin(ph);
      row.push([cx + nx * rx * jit, cy + ny * ry * jit, cz + nz * rz * jit, nx, ny, nz]); }
    if (i > 0 && i < rows) row[seg] = row[0];
    pts.push(row); }
  for (let i = 0; i < rows; i++) for (let j = 0; j < seg; j++) {
    const a = pts[i][j], b = pts[i][j + 1], c = pts[i + 1][j + 1], d = pts[i + 1][j];
    const v = g.vc;
    for (const q of [a, b, c, d]) { g.p.push(q[0], q[1], q[2]); g.n.push(q[3], q[4], q[5]); g.uv.push(0, 0);
      const k = 0.62 + 0.38 * (q[4] * 0.5 + 0.5); g.c.push(col[0] * k, col[1] * k, col[2] * k); }
    g.i.push(v, v + 1, v + 2, v, v + 2, v + 3); g.vc += 4;
  }
}
function trunk(g, x, z, y0, y1, r0, r1, col) {
  const n = 6;
  for (let i = 0; i < n; i++) { const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2; const am = (a0 + a1) / 2;
    g.quad([x + Math.cos(a1) * r0, y0, z + Math.sin(a1) * r0], [x + Math.cos(a0) * r0, y0, z + Math.sin(a0) * r0], [x + Math.cos(a0) * r1, y1, z + Math.sin(a0) * r1], [x + Math.cos(a1) * r1, y1, z + Math.sin(a1) * r1],
      [Math.cos(am), 0, Math.sin(am)], [[0, 0], [1, 0], [1, 1], [0, 1]], col); }
}
const _tri = (g, A, B, C, n, col) => g.tri(A, B, C, n, [[0, 0], [1, 0], [0, 1]], col);
function tree(cells, world, x, z, kind, R) {
  const fol = cells.gb(x, z, 'foliage'), bark = cells.gb(x, z, 'painted');
  const s = 0.85 + R() * 0.35; const y = world.groundHeightAt ? world.groundHeightAt(x, z) : BASE;
  if (kind === 'pine') {
    const h = (7 + R() * 3) * s; const lean = (R() - 0.5) * 0.8;
    trunk(bark, x, z, y, y + h, 0.22 * s, 0.14 * s, hex('#6a4b36'));
    const g = [0.22, 0.32, 0.18];
    blob(fol, x + lean, y + h + 0.4, z, 3.6 * s, 1.0 * s, 3.4 * s, g, R, 9);
    blob(fol, x + lean + 1.2 * s, y + h + 0.1, z + 0.8, 2.2 * s, 0.8 * s, 2.0 * s, [0.25, 0.35, 0.2], R, 7);
    blob(fol, x + lean - 1.4 * s, y + h + 0.2, z - 0.7, 2.0 * s, 0.75 * s, 2.2 * s, [0.2, 0.3, 0.17], R, 7);
  } else if (kind === 'lemon') {
    // vaso in pietra + alberello con limoni
    cells.gb(x, z, 'stone').box(x - 0.6, x + 0.6, y, y + 0.7, z - 0.6, z + 0.6, { tile: 1, faces: 'nsewt' });
    trunk(bark, x, z, y + 0.7, y + 2.0, 0.08, 0.06, hex('#5c4632'));
    blob(fol, x, y + 2.6, z, 1.1, 0.9, 1.1, [0.26, 0.42, 0.2], R, 8);
    for (let i = 0; i < 9; i++) { const a = R() * 6.28, h = y + 2.2 + R() * 0.9; blob(fol, x + Math.cos(a) * 0.95, h, z + Math.sin(a) * 0.95, 0.09, 0.11, 0.09, [1.0, 0.85, 0.15], R, 4); }
    world.circles.push({ x, z, r: 0.7 }); world.mapShapes.push({ type: 'tree', x, z });
    return;
  } else {
    const h = (2.6 + R() * 0.8) * s;
    trunk(bark, x, z, y, y + h + 0.6, 0.17 * s, 0.1 * s, hex('#5a4535'));
    const base = kind === 'street' ? [0.27, 0.38, 0.2] : [0.25, 0.37, 0.19];
    blob(fol, x, y + h + 1.3 * s, z, 1.9 * s, 1.7 * s, 1.9 * s, base, R, 8);
    for (let k = 0; k < 3; k++) { const a = R() * 6.28; blob(fol, x + Math.cos(a) * 1.1 * s, y + h + (0.9 + R() * 1.2) * s, z + Math.sin(a) * 1.1 * s, 1.3 * s, 1.1 * s, 1.3 * s, base.map((v) => v * (0.9 + R() * 0.2)), R, 7); }
  }
  world.circles.push({ x, z, r: 0.3 });
  world.mapShapes.push({ type: 'tree', x, z });
}
function bench(cells, world, x, z, ry) {
  const g = cells.gb(x, z, 'painted'); const ir = cells.gb(x, z, 'iron');
  const c = Math.abs(Math.cos(ry)) > 0.5; const L = 0.9, D = 0.25;
  const wood = hex('#8a6440');
  const bx = (a0, a1, y0, y1, b0, b1, gg, col) => c ? gg.box(x + a0, x + a1, y0, y1, z + b0, z + b1, { col, faces: 'nsewt' }) : gg.box(x + b0, x + b1, y0, y1, z + a0, z + a1, { col, faces: 'nsewt' });
  const sgn = c ? Math.cos(ry) : Math.sin(ry);
  for (let i = 0; i < 3; i++) bx(-L, L, BASE + 0.43, BASE + 0.47, -D + i * 0.17 - 0.02, -D + i * 0.17 + 0.1, g, wood);
  bx(-L, L, BASE + 0.62, BASE + 0.82, -sgn * 0.3 - 0.02, -sgn * 0.3 + 0.02, g, wood);
  for (const a of [-L + 0.1, L - 0.14]) bx(a, a + 0.05, BASE, BASE + 0.45, -D, D, ir, [0.15, 0.15, 0.16]);
  world.addBox(x - (c ? L : 0.3), x + (c ? L : 0.3), z - (c ? 0.3 : L), z + (c ? 0.3 : L), 0, 0.9);
  (world.benchSpots ||= []).push({ x, z, ry });
}

// ---------------- Luoghi ----------------
function tower(cells, world, x, z) {
  const G = (k) => cells.gb(x, z, k); const w = 2.7, h = 27, y = BASE;
  const brick = [1, 0.96, 0.92];
  for (const f of Object.values(faces({ x0: x - w, x1: x + w, z0: z - w, z1: z + w }))) {
    G('facade').wallQuad(f, 0, f.len, y, y + h, 0, { tile: 3, col: brick, t: 2 });
    G('stone').wallQuad(f, -0.08, f.len + 0.08, y, y + 1.2, 0.08, { tile: 2 });
    G('stone').wallQuad(f, -0.15, f.len + 0.15, y + h - 6.2, y + h - 5.9, 0.15, { tile: 2 });
    G('stone').wallQuad(f, -0.2, f.len + 0.2, y + h - 0.3, y + h, 0.2, { tile: 2 });
    // cella campanaria (aperture scure) e orologio
    for (const u of [f.len * 0.3, f.len * 0.7]) { G('painted').wallQuad(f, u - 0.55, u + 0.55, y + h - 5.4, y + h - 1.6, 0.03, { col: [0.06, 0.06, 0.07] }); G('stone').wallQuad(f, u - 0.7, u + 0.7, y + h - 1.6, y + h - 1.3, 0.05, { tile: 1 }); }
    clock(G, f, f.len / 2, y + h - 8.4);
  }
  // cuspide
  const r = G('roof'); const t = y + h, a = w + 0.3, k = 4.5;
  for (const [A, B] of [[[x - a, t, z - a], [x + a, t, z - a]], [[x + a, t, z - a], [x + a, t, z + a]], [[x + a, t, z + a], [x - a, t, z + a]], [[x - a, t, z + a], [x - a, t, z - a]]]) tri(r, B, A, [x, t + k, z], [1, 0.95, 0.9], 2, t);
  world.addBox(x - w, x + w, z - w, z + w, 0, h);
  world.mapShapes.push({ type: 'building', x0: x - w, x1: x + w, z0: z - w, z1: z + w, special: 'tower' });
}
function clock(G, f, u, yc) {
  const g = G('painted'); const rx = f.nz, rz = -f.nx; const P = (uu, yy, off) => [f.ox + rx * uu + f.nx * off, yy, f.oz + rz * uu + f.nz * off];
  const n = 16, R1 = 1.15;
  for (let i = 0; i < n; i++) { const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
    g.tri(P(u, yc, 0.06), P(u + Math.cos(a0) * R1, yc + Math.sin(a0) * R1, 0.06), P(u + Math.cos(a1) * R1, yc + Math.sin(a1) * R1, 0.06), [f.nx, 0, f.nz], [[0, 0], [1, 0], [0, 1]], [0.93, 0.9, 0.82]); }
  // lancette (le 10 e 10, ferme: è un orologio di paese)
  g.wallQuad(f, u - 0.04, u + 0.04, yc, yc + 0.85, 0.08, { col: [0.08, 0.08, 0.08] });
  g.wallQuad(f, u - 0.6, u, yc - 0.03, yc + 0.03, 0.08, { col: [0.08, 0.08, 0.08] });
}
function beachProps(cells, world, R) {
  const cols = [['#c0392b', '#f4efe4'], ['#2f6f8f', '#f4efe4'], ['#e0a030', '#f4efe4'], ['#3e7d5a', '#f4efe4']];
  let i = 0;
  for (let x = -236; x <= -108; x += 7.5) for (const z of [-158.5, -165]) {
    if (Math.abs(x + 196) < 5 || Math.abs(x + 140) < 5 && z > -160) continue;
    i++;
    const y = world.beachHeight(z); const g = cells.gb(x, z, 'painted'); const c = cols[(i + (z < -160 ? 1 : 0)) % cols.length].map(hex);
    g.box(x - 0.03, x + 0.03, y, y + 2.3, z - 0.03, z + 0.03, { col: [0.85, 0.85, 0.82], faces: 'nsew' });
    const n = 10, r = 1.35, ht = y + 2.35, hb = y + 1.95;
    for (let k = 0; k < n; k++) { const a0 = k / n * Math.PI * 2, a1 = (k + 1) / n * Math.PI * 2;
      const A = [x, ht + 0.12, z], B = [x + Math.cos(a1) * r, hb, z + Math.sin(a1) * r], C = [x + Math.cos(a0) * r, hb, z + Math.sin(a0) * r];
      g.tri(A, B, C, [Math.cos((a0 + a1) / 2) * 0.3, 0.95, Math.sin((a0 + a1) / 2) * 0.3], [[0, 0], [1, 0], [0, 1]], c[k % 2]);
      g.tri(A, C, B, [0, -1, 0], [[0, 0], [1, 0], [0, 1]], c[k % 2].map((v) => v * 0.7)); }
    world.circles.push({ x, z, r: 0.12 });
    // lettino
    const lx = x + 1.6; const ly = world.beachHeight(z - 0.4);
    g.box(lx - 0.35, lx + 0.35, ly + 0.28, ly + 0.36, z - 1.0, z + 0.4, { col: hex('#f2f0ea'), faces: 'nsewt' });
    g.box(lx - 0.35, lx + 0.35, ly + 0.36, ly + 0.9, z + 0.35, z + 0.45, { col: hex('#f2f0ea'), faces: 'nsewt' });
    world.addBox(lx - 0.35, lx + 0.35, z - 1.0, z + 0.45, 0, 0.6);
  }
  // torretta del bagnino
  const tx = -196, tz = -163.5, ty = world.beachHeight(tz); const g = cells.gb(tx, tz, 'painted'); const w = hex('#f4efe4'), red = hex('#c0392b');
  for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) g.box(tx + dx - 0.07, tx + dx + 0.07, ty, ty + 2.4, tz + dz - 0.07, tz + dz + 0.07, { col: w, faces: 'nsew' });
  g.box(tx - 1.1, tx + 1.1, ty + 2.4, ty + 2.55, tz - 1.1, tz + 1.1, { col: w });
  g.box(tx - 1.1, tx + 1.1, ty + 2.55, ty + 3.4, tz - 1.1, tz - 1.0, { col: red, faces: 'nsewt' });
  g.box(tx - 0.05, tx + 0.05, ty + 2.55, ty + 5.2, tz + 0.95, tz + 1.05, { col: w, faces: 'nsew' });
  g.box(tx + 0.05, tx + 1.0, ty + 4.4, ty + 5.1, tz + 0.99, tz + 1.01, { col: red, faces: 'ns' });
  world.addBox(tx - 1.1, tx + 1.1, tz - 1.1, tz + 1.1, 0, 3.4);
  world.mapShapes.push({ type: 'building', x0: tx - 1.1, x1: tx + 1.1, z0: tz - 1.1, z1: tz + 1.1, special: 'tower' });
}
function piazzaLimoni(cells, world, R) {
  const P = PIAZZA_LIMONI; const cx = 0, cz = 149;
  // fontana ottagonale
  const g = cells.gb(cx, cz, 'stone'); const n = 8, r0 = 3.2, r1 = 3.0;
  for (let k = 0; k < n; k++) { const a0 = k / n * Math.PI * 2, a1 = (k + 1) / n * Math.PI * 2; const am = (a0 + a1) / 2;
    const A = [cx + Math.cos(a0) * r0, BASE, cz + Math.sin(a0) * r0], B = [cx + Math.cos(a1) * r0, BASE, cz + Math.sin(a1) * r0];
    g.quad(B, A, [A[0], BASE + 0.6, A[2]], [B[0], BASE + 0.6, B[2]], [Math.cos(am), 0, Math.sin(am)], [[0, 0], [1, 0], [1, 0.3], [0, 0.3]]);
    g.quad(B.map((v, i) => i === 1 ? BASE + 0.6 : v), A.map((v, i) => i === 1 ? BASE + 0.6 : v), [cx + Math.cos(a0) * r1, BASE + 0.6, cz + Math.sin(a0) * r1], [cx + Math.cos(a1) * r1, BASE + 0.6, cz + Math.sin(a1) * r1], [0, 1, 0], [[0, 0], [1, 0], [1, 0.1], [0, 0.1]]);
  }
  g.box(cx - 0.35, cx + 0.35, BASE, BASE + 2.2, cz - 0.35, cz + 0.35, { tile: 1, faces: 'nsewt' });
  g.box(cx - 1.0, cx + 1.0, BASE + 1.6, BASE + 1.75, cz - 1.0, cz + 1.0, { tile: 1, faces: 'nsewtb' });
  world.circles.push({ x: cx, z: cz, r: 3.3 });
  world.fountains5 = [{ x: cx, z: cz, r: 2.95, y: BASE + 0.45 }];
  world.mapShapes.push({ type: 'fountain', x: cx, z: cz, r: 3.2 });
  // bancarelle del mercato
  const stall = (x, z, col) => { const p = cells.gb(x, z, 'painted'); const c = hex(col);
    p.box(x - 1.4, x + 1.4, BASE, BASE + 0.9, z - 0.7, z + 0.7, { col: hex('#8a6440'), faces: 'nsewt' });
    for (const dx of [-1.35, 1.35]) for (const dz of [-0.65, 0.65]) p.box(x + dx - 0.04, x + dx + 0.04, BASE, BASE + 2.4, z + dz - 0.04, z + dz + 0.04, { col: [0.3, 0.3, 0.3], faces: 'nsew' });
    p.box(x - 1.6, x + 1.6, BASE + 2.4, BASE + 2.48, z - 0.95, z + 0.95, { col: c, faces: 'nsewtb' });
    for (let i = 0; i < 10; i++) { const fx = x - 1.2 + (i % 5) * 0.6, fz = z - 0.35 + Math.floor(i / 5) * 0.7; p.box(fx - 0.22, fx + 0.22, BASE + 0.9, BASE + 1.05, fz - 0.25, fz + 0.25, { col: hex(['#e8c43a', '#d9542b', '#7aa33a', '#f2ead2', '#b33a3a'][i % 5]), faces: 'nsewt' }); }
    world.addBox(x - 1.45, x + 1.45, z - 0.75, z + 0.75, 0, 1.2);
  };
  [[-26, 140, '#2f6f8f'], [-26, 146, '#c0392b'], [26, 140, '#3e7d5a'], [26, 146, '#e0a030'], [-26, 152, '#5c3a5e']].forEach(([x, z, c]) => stall(x, z, c));
  // chiosco gelateria
  const gx = -14, gz = 140; const p = cells.gb(gx, gz, 'painted');
  p.box(gx - 1.6, gx + 1.6, BASE, BASE + 1.05, gz - 0.8, gz + 0.8, { col: hex('#f3e9c8'), faces: 'nsewt' });
  p.box(gx - 1.7, gx + 1.7, BASE + 2.5, BASE + 2.6, gz - 1.2, gz + 1.0, { col: hex('#e8d860'), faces: 'nsewtb' });
  for (const dx of [-1.6, 1.6]) p.box(gx + dx - 0.05, gx + dx + 0.05, BASE, BASE + 2.5, gz + 0.7, gz + 0.8, { col: [0.9, 0.9, 0.88], faces: 'nsew' });
  for (let i = 0; i < 6; i++) p.box(gx - 1.3 + i * 0.5, gx - 0.95 + i * 0.5, BASE + 1.05, BASE + 1.13, gz - 0.6, gz - 0.2, { col: hex(['#f8e9b0', '#ffb3c1', '#c8e6c9', '#6b3a2a', '#ffffff', '#f6d36b'][i]), faces: 'nsewt' });
  world.addBox(gx - 1.65, gx + 1.65, gz - 0.85, gz + 0.85, 0, 1.2);
  world.gelato = { x: gx, z: gz - 1.6 };
  for (const [x, z, ry] of [[-10, 158, Math.PI], [10, 158, Math.PI], [-10, 140, 0], [10, 140, 0]]) bench(cells, world, x, z, ry);
}
function carWash(cells, world) {
  const L = LAVAGGIO; const x0 = 106, x1 = 118, z0 = L.z0 + 1, z1 = L.z0 + 13; const h = 4.2; // v0.5: portale staccato dall'ufficio di Dario
  const s = cells.gb(112, 141, 'stone'); const p = cells.gb(112, 141, 'painted');
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [x0, (z0 + z1) / 2], [x1, (z0 + z1) / 2]]) { s.box(x - 0.25, x + 0.25, BASE, BASE + h, z - 0.25, z + 0.25, { tile: 1, faces: 'nsew' }); world.addBox(x - 0.25, x + 0.25, z - 0.25, z + 0.25, 0, h); }
  p.box(x0 - 0.6, x1 + 0.6, BASE + h, BASE + h + 0.4, z0 - 0.6, z1 + 0.6, { col: hex('#e9eef0'), faces: 'nsewtb' });
  p.box(x0 - 0.62, x1 + 0.62, BASE + h + 0.05, BASE + h + 0.35, z0 - 0.62, z0 - 0.58, { col: hex('#2f8fc0'), faces: 's' });
  // spazzole laterali (ferme): cilindri blu
  for (const bx of [x0 + 1.2, x1 - 1.2]) { const g = cells.gb(112, 141, 'foliage'); blob(g, bx, BASE + 1.5, (z0 + z1) / 2, 0.55, 1.4, 0.55, [0.2, 0.45, 0.85], rng(5), 8); }
  for (const [a, b] of [[x0 - 0.1, x0 + 0.1], [x1 - 0.1, x1 + 0.1]]) cells.gb(112, 141, 'iron').box(a, b, BASE + 0.2, BASE + 0.35, z0, z1, { col: [0.5, 0.5, 0.52], faces: 'nsewt' });
  world.washBay = { x: (x0 + x1) / 2, z: (z0 + z1) / 2, hw: (x1 - x0) / 2 - 1.2, hd: (z1 - z0) / 2 };
  world.mapShapes.push({ type: 'building', x0, x1, z0, z1, special: 'wash' });
}
function eastSpecials(cells, world, TM) {
  const L = EAST;
  // laghetto dei Giardini
  const w = L.water[0]; world.pond5 = w;
  for (const ww of L.water) world.addBox(ww.x0, ww.x1, ww.z0, ww.z1, 0, 0.4);
  world.mapShapes.push({ type: 'water', x0: w.x0, x1: w.x1, z0: w.z0, z1: w.z1 });
  const st = cells.gb((w.x0 + w.x1) / 2, (w.z0 + w.z1) / 2, 'stone');
  st.box(w.x0 - 0.4, w.x1 + 0.4, 0, BASE + 0.1, w.z0 - 0.4, w.z0, { tile: 1, faces: 'nsewt' }); st.box(w.x0 - 0.4, w.x1 + 0.4, 0, BASE + 0.1, w.z1, w.z1 + 0.4, { tile: 1, faces: 'nsewt' });
  st.box(w.x0 - 0.4, w.x0, 0, BASE + 0.1, w.z0, w.z1, { tile: 1, faces: 'nsewt' }); st.box(w.x1, w.x1 + 0.4, 0, BASE + 0.1, w.z0, w.z1, { tile: 1, faces: 'nsewt' });
  // terrazza del Belvedere
  const hill = L.hill; const hc = cells.gb((hill.x0 + hill.x1) / 2, (hill.z0 + hill.z1) / 2, 'stone');
  hc.box(hill.x0, hill.x1, 0, hill.y, hill.ramp1, hill.z1, { tile: 2, faces: 'nsewt' });
  // rampa
  const ys = BASE, ye = hill.y; const dz = hill.ramp1 - hill.ramp0, dy = ye - ys, ln = Math.hypot(dz, dy);
  hc.quad([hill.x0, ye, hill.ramp1], [hill.x1, ye, hill.ramp1], [hill.x1, ys, hill.ramp0], [hill.x0, ys, hill.ramp0], [0, dz / ln, -dy / ln], [[0, 0], [10, 0], [10, 4], [0, 4]]);
  for (const sx of [hill.x0, hill.x1]) { const nx = sx === hill.x0 ? -1 : 1; hc.quad(...(nx < 0 ? [[sx, 0, hill.ramp0], [sx, 0, hill.ramp1], [sx, ye, hill.ramp1], [sx, ys, hill.ramp0]] : [[sx, 0, hill.ramp1], [sx, 0, hill.ramp0], [sx, ys, hill.ramp0], [sx, ye, hill.ramp1]]), [nx, 0, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]); }
  // parapetto della terrazza
  const ir = cells.gb((hill.x0 + hill.x1) / 2, hill.z1, 'iron');
  ir.box(hill.x0, hill.x1, hill.y, hill.y + 1.0, hill.z1 - 0.12, hill.z1 - 0.06, { col: [0.2, 0.2, 0.2], faces: 'nst' });
  world.hill = hill; world.layout = EAST;
  // campo da bocce
  const b = cells.gb(386, -28, 'clay'); b.box(377, 395, BASE, BASE + 0.03, -30.1, -25.9, { col: hex('#b08968'), faces: 't' });
  const wd = cells.gb(386, -28, 'painted'); for (const [x0, x1, z0, z1] of [[376.8, 395.2, -30.3, -30.1], [376.8, 395.2, -25.9, -25.7], [376.8, 377, -30.1, -25.9], [395, 395.2, -30.1, -25.9]]) wd.box(x0, x1, BASE, BASE + 0.2, z0, z1, { col: hex('#7a5a3a'), faces: 'nsewt' });
  world.mapShapes.push({ type: 'piazza', x0: 377, x1: 395, z0: -30, z1: -26 });
  // molo est (bug v0.4: a est del rione si finiva in mare)
  const q = cells.gb(300, -177, 'stone');
  for (let x = 96; x < 516; x += 24) { const xe = Math.min(516, x + 24); const qq = cells.gb((x + xe) / 2, -177.6, 'stone'); qq.box(x, xe, -2.9, 0.62, -177.75, -177.45, { tile: 2, faces: 'nst' });
    const ir2 = cells.gb((x + xe) / 2, -177.6, 'iron'); ir2.box(x, xe, 1.02, 1.1, -177.62, -177.56, { col: [0.75, 0.74, 0.7], faces: 'nst' });
    for (let px = x + 1.5; px < xe; px += 3) ir2.box(px - 0.04, px + 0.04, 0.62, 1.02, -177.63, -177.55, { col: [0.75, 0.74, 0.7], faces: 'nsew' }); }
  void q;
}
export function roofHipExport(g, x0, x1, z0, z1, y, R) { return roofHip(g, x0, x1, z0, z1, y, R); }
