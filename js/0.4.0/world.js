// Costruzione del quartiere: strade, marciapiedi, piazza, edifici, arredo, collisioni.
import * as THREE from 'three';
import { loadGLB } from './avatar.js';
import { PLACES } from './places.js';
import { resolveWorld, rayWorld, buildGrid } from './collide.js';
import { buildDistricts, cullDistricts } from './districts.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TL = new THREE.TextureLoader();
function tex(name, srgb = true) {
  const t = TL.load(`./assets/tex/${name}.jpg`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function pbr(name, opts = {}, anti = 0) {
  const m = new THREE.MeshStandardMaterial({ map: tex(name + '_albedo'), normalMap: tex(name + '_normal', false),
    roughness: 0.9, metalness: 0, ...opts });
  if (anti) antiTile(m, anti);
  return m;
}
// Anti-ripetizione: secondo campionamento ruotato/scalato miscelato con rumore in coordinate mondo,
// più variazione cromatica a bassa frequenza (macchie, usura). Costo: 1 lettura texture in più.
function antiTile(mat, strength) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uAnti = { value: strength };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vWP; uniform float uAnti;
float ah(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float an(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(ah(i),ah(i+vec2(1,0)),f.x),mix(ah(i+vec2(0,1)),ah(i+vec2(1,1)),f.x),f.y); }`)
      .replace('#include <map_fragment>', `#ifdef USE_MAP
  vec4 tA = texture2D(map, vMapUv);
  vec2 ruv = mat2(0.8, -0.6, 0.6, 0.8) * vMapUv * 0.73 + vec2(0.37, 0.11);
  vec4 tB = texture2D(map, ruv);
  float nb = smoothstep(0.35, 0.65, an(vWP.xz * 0.11));
  vec4 sampledDiffuseColor = mix(tA, tB, nb * 0.85);
  float macro = an(vWP.xz * 0.045) * 0.6 + an(vWP.xz * 0.17) * 0.4;
  sampledDiffuseColor.rgb *= 1.0 + (macro - 0.5) * 0.38 * uAnti;
  sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, sampledDiffuseColor.rgb * vec3(0.92, 0.95, 1.0), smoothstep(0.6, 0.85, an(vWP.xz * 0.07 + 13.0)) * 0.5 * uAnti);
  diffuseColor *= sampledDiffuseColor;
#endif`);
  };
  mat.customProgramCacheKey = () => 'anti' + strength;
}
// Box con UV in metri (una ripetizione ogni `tile` metri).
function boxGeo(w, h, d, tile = 3) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv; const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile);
  }
  return g;
}
function planeGeo(w, d, tile) {
  const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * d / tile);
  return g;
}
function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

function signTexture(text, sub, bg = '#1d2328', fg = '#f2f1ec', accent = '#e6bb70') {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 192;
  const x = c.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, 1024, 192);
  x.strokeStyle = accent; x.lineWidth = 6; x.strokeRect(10, 10, 1004, 172);
  x.fillStyle = fg; x.font = '600 76px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 512, sub ? 80 : 96);
  if (sub) { x.fillStyle = accent; x.font = '400 36px Georgia, serif'; x.fillText(sub, 512, 146); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export class World {
  constructor(scene, renderer) {
    this.scene = scene; this.renderer = renderer;
    this.group = new THREE.Group(); scene.add(this.group);
    this.boxes = [];     // collisori {x0,x1,z0,z1,y0,y1}
    this.circles = [];   // collisori {x,z,r}
    this.roads = [];     // rettangoli carreggiata (altezza 0)
    this.mapShapes = []; // per la mappa 2D
    this.doorMarkers = {};
  }
  addBox(x0, x1, z0, z1, y0 = 0, y1 = 3) { this.boxes.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y0, y1 }); }
  mesh(geo, mat, x, y, z, { cast = true, recv = true, ry = 0 } = {}) {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry;
    m.castShadow = cast; m.receiveShadow = recv; this.group.add(m); return m;
  }
  groundHeight(x, z) {
    const h = this.hill;
    if (h && x > h.x0 && x < h.x1 && z > h.ramp0 && z < h.z1) {
      if (z < h.ramp1) return 0.12 + ((z - h.ramp0) / (h.ramp1 - h.ramp0)) * h.y;
      return h.y;
    }
    for (const r of this.roads) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return r.y || 0;
    return 0.12;
  }

  async build() {
    const M = this.mats = {
      asphalt: pbr('asphalt', { roughness: 0.95 }, 1),
      paving: pbr('paving', { roughness: 0.92 }, 0.8),
      cobble: pbr('cobble', { roughness: 0.95 }, 0.8),
      grass: pbr('grass', { roughness: 1 }, 1),
      stone: pbr('stonebase', { roughness: 0.9 }),
      wood: pbr('wood', { roughness: 0.7 }),
      floorBar: pbr('floor_bar', { roughness: 0.5, color: '#a89880' }),
      marble: pbr('marble', { roughness: 0.35 }),
      curb: new THREE.MeshStandardMaterial({ color: '#9a9a94', roughness: 0.9 }),
      line: new THREE.MeshStandardMaterial({ color: '#e9e6dc', roughness: 0.8 }),
      glass: new THREE.MeshStandardMaterial({ color: '#2b3a44', roughness: 0.08, metalness: 0.6, envMapIntensity: 1.4 }),
      shopGlass: new THREE.MeshStandardMaterial({ color: '#b8cbd4', roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.16, envMapIntensity: 1.6, depthWrite: false }),
      frame: new THREE.MeshStandardMaterial({ color: '#d8d2c6', roughness: 0.6 }),
      metal: new THREE.MeshStandardMaterial({ color: '#343a3e', roughness: 0.45, metalness: 0.7 }),
      door: new THREE.MeshStandardMaterial({ color: '#5a3d2b', roughness: 0.6 }),
      water: new THREE.MeshStandardMaterial({ color: '#3d6b78', roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.85 }),
      interiorWall: new THREE.MeshStandardMaterial({ color: '#b9ab95', roughness: 0.9 }),
      ceiling: new THREE.MeshStandardMaterial({ color: '#d8d0c2', roughness: 0.95, side: THREE.DoubleSide, emissive: '#8a8070', emissiveIntensity: 0.45 }),
      bark: new THREE.MeshStandardMaterial({ color: '#4b3a2c', roughness: 1 }),
    };
    this.facadeMats = ['#c9bdaa', '#d8c7a6', '#bfa48a', '#cfc9bd', '#b9a28f', '#d6b89a', '#c4b6a2'].map((c, i) =>
      pbr(i % 2 ? 'plaster' : 'facade', { color: c, roughness: 0.95 }));

    this.buildGround();
    this.buildBuildings();
    this.buildPiazza();
    await this.buildProps();
    this.buildBounds();
    buildDistricts(this);
    this.instanceClones();
    this.mergeStatic();
    return this;
  }
  sealColliders() {
    this.grid = buildGrid(this.boxes, this.circles, 16);
  }
  cull(camera) { cullDistricts(this, camera); }

  buildGround() {
    const M = this.mats;
    // carreggiate (y=0)
    this.mesh(planeGeo(200, 160, 5), M.asphalt, 0, 0, 0, { cast: false });
    this.mesh(planeGeo(200, 104, 5), M.asphalt, 0, 0, -132, { cast: false }); // v0.3: quartiere sud
    const roads = [
      { x0: -96, x1: 96, z0: -4, z1: 4 },      // Via del Porto (E-O)
      { x0: -51, x1: -45, z0: -172, z1: 76 },  // Via delle Reti (N-S ovest, prolungata a sud)
      { x0: 45, x1: 51, z0: -172, z1: 76 },    // Via dei Fanali (N-S est, prolungata a sud)
      { x0: -51, x1: 51, z0: -172, z1: -164 }, // v0.3 Lungomare: chiude l'anello
    ];
    this.roads = roads;
    // isolati rialzati (marciapiede 12 cm) — tutto ciò che non è carreggiata
    const blocks = [[-96, -51, -172, -4], [-45, 45, -164, -4], [51, 96, -172, -4], [-96, -51, 4, 76], [-45, 45, 4, 76], [51, 96, 4, 76], [-96, 96, -178, -172]];
    for (const [x0, x1, z0, z1] of blocks) {
      const w = x1 - x0, d = z1 - z0;
      const g = boxGeo(w, 0.12, d, 2.2);
      this.mesh(g, M.paving, (x0 + x1) / 2, 0.06, (z0 + z1) / 2, { cast: false });
      // cordolo
      const cg = [[w, 0.14, 0.18, (x0 + x1) / 2, z0 + 0.09], [w, 0.14, 0.18, (x0 + x1) / 2, z1 - 0.09]];
      for (const [cw, ch, cd, cx, cz] of cg) this.mesh(new THREE.BoxGeometry(cw, ch, cd), M.curb, cx, 0.07, cz, { cast: false });
      for (const cx of [x0 + 0.09, x1 - 0.09]) this.mesh(new THREE.BoxGeometry(0.18, 0.14, d), M.curb, cx, 0.07, (z0 + z1) / 2, { cast: false });
      this.mapShapes.push({ type: 'block', x0, x1, z0, z1 });
    }
    roads.forEach((r) => this.mapShapes.push({ type: 'road', ...r }));
    // segnaletica: linea tratteggiata centrale e strisce pedonali
    const dash = new THREE.PlaneGeometry(2, 0.14); dash.rotateX(-Math.PI / 2);
    const dashes = new THREE.InstancedMesh(dash, M.line, 200); let n = 0; const m4 = new THREE.Matrix4();
    for (let x = -92; x < 92; x += 5) { if (Math.abs(x + 48) < 5 || Math.abs(x - 48) < 5) continue; m4.makeTranslation(x, 0.006, 0); dashes.setMatrixAt(n++, m4); }
    const rotY = new THREE.Matrix4().makeRotationY(Math.PI / 2);
    for (const sx of [-48, 48]) for (let z = -162; z < 72; z += 5) { if (Math.abs(z) < 7) continue; m4.makeTranslation(sx, 0.006, z).multiply(rotY); dashes.setMatrixAt(n++, m4); }
    for (let x = -42; x < 43; x += 5) { m4.makeTranslation(x, 0.006, -168); dashes.setMatrixAt(n++, m4); }
    dashes.count = n; dashes.receiveShadow = true; this.group.add(dashes);
    const stripe = new THREE.PlaneGeometry(0.5, 3); stripe.rotateX(-Math.PI / 2);
    const zebra = new THREE.InstancedMesh(stripe, M.line, 200); n = 0;
    const crossings = [{ x: -5, z: 0, along: 'z', len: 8 }, { x: -40, z: 0, along: 'z', len: 8 }, { x: 40, z: 0, along: 'z', len: 8 }, { x: -48, z: 10, along: 'x', len: 6 }, { x: 48, z: -10, along: 'x', len: 6 }];
    for (const c of crossings) {
      for (let k = -c.len / 2 + 0.4; k < c.len / 2; k += 1.0) {
        if (c.along === 'z') m4.makeTranslation(c.x, 0.007, c.z + k).multiply(rotY); else m4.makeTranslation(c.x + k, 0.007, c.z);
        zebra.setMatrixAt(n++, m4);
      }
      this.mapShapes.push({ type: 'crossing', ...c });
    }
    zebra.count = n; zebra.receiveShadow = true; this.group.add(zebra);
  }

  // Edificio generico o con interno (piano terra percorribile).
  building(x0, x1, z0, z1, h, o = {}) {
    const M = this.mats; const r = this.rand;
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, base = 0.12;
    const fmat = o.mat || this.facadeMats[Math.floor(r() * this.facadeMats.length)];
    const floorH = 3.2;
    if (!o.interior) {
      this.mesh(boxGeo(w, h, d, 3), fmat, cx, base + h / 2, cz);
      this.addBox(x0, x1, z0, z1, 0, h + base);
    } else {
      const t = 0.25, gh = 3.4; const door = o.door; // {side:'n'|'s', at, width}
      const wall = (wx0, wx1, wz0, wz1) => {
        const ww = wx1 - wx0, wd = wz1 - wz0;
        this.mesh(boxGeo(ww, gh, wd, 3), fmat, (wx0 + wx1) / 2, base + gh / 2, (wz0 + wz1) / 2);
        // finitura interna chiara
        this.addBox(wx0, wx1, wz0, wz1, 0, gh + base);
      };
      const dz = door.side === 's' ? z0 : z1; const dz0 = door.side === 's' ? z0 : z1 - t, dz1 = dz0 + t;
      const ga = door.at - door.width / 2, gb = door.at + door.width / 2;
      wall(x0, ga, dz0, dz1); wall(gb, x1, dz0, dz1);
      // architrave sopra la porta
      this.mesh(boxGeo(door.width, gh - 2.4, t, 3), fmat, door.at, base + 2.4 + (gh - 2.4) / 2, dz0 + t / 2);
      this.addBox(ga, gb, dz0, dz1, 2.4 + base, gh + base);
      const oz0 = door.side === 's' ? z1 - t : z0, oz1 = oz0 + t;
      wall(x0, x1, oz0, oz1); wall(x0, x0 + t, z0, z1); wall(x1 - t, x1, z0, z1);
      // pareti interne chiare
      const inner = new THREE.Mesh(new THREE.BoxGeometry(w - 2 * t - 0.02, gh - 0.02, d - 2 * t - 0.02), M.interiorWall);
      inner.material = M.interiorWall.clone(); inner.material.side = THREE.BackSide;
      inner.position.set(cx, base + gh / 2, cz); inner.receiveShadow = true; this.group.add(inner);
      // pavimento interno e solaio
      this.mesh(planeGeo(w - 2 * t, d - 2 * t, 1.5), o.floor || M.wood, cx, base + 0.005, cz, { cast: false });
      this.mesh(boxGeo(w, h - gh, d, 3), fmat, cx, base + gh + (h - gh) / 2, cz);
      const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w - 2 * t, d - 2 * t), M.ceiling); ceil.rotation.x = Math.PI / 2; ceil.position.set(cx, base + gh - 0.02, cz); this.group.add(ceil);
      this.addBox(x0, x1, z0, z1, gh + base - 0.05, h + base);
      // luce interna (senza ombre)
      const pl = new THREE.PointLight('#ffe2b8', 2.2, 11, 1.8); pl.position.set(cx, base + gh - 0.4, cz); this.group.add(pl);
      // vetrina sul lato porta
      const gz = dz + (door.side === 's' ? -0.03 : 0.03);
      for (const [a, b] of [[x0 + 0.8, ga - 0.5], [gb + 0.5, x1 - 0.8]]) if (b - a > 1) {
        this.mesh(new THREE.BoxGeometry(b - a, 1.7, 0.05), M.glass, (a + b) / 2, base + 1.65, gz, { cast: false });
        this.mesh(new THREE.BoxGeometry(b - a + 0.12, 0.08, 0.12), M.frame, (a + b) / 2, base + 0.76, gz, { cast: false });
      }
    }
    // finestre ai piani
    const startFloor = o.interior || o.shop ? 1 : 0;
    const floors = Math.floor((h - 0.5) / floorH);
    const faces = [
      { len: w, nx: 0, nz: -1, px: (u) => [x0 + u, z0], ry: Math.PI },
      { len: w, nx: 0, nz: 1, px: (u) => [x0 + u, z1], ry: 0 },
      { len: d, nx: -1, nz: 0, px: (u) => [x0, z0 + u], ry: -Math.PI / 2 },
      { len: d, nx: 1, nz: 0, px: (u) => [x1, z0 + u], ry: Math.PI / 2 },
    ];
    for (const f of faces) {
      const nWin = Math.floor((f.len - 1.5) / 3.2);
      if (nWin < 1) continue;
      const step = f.len / nWin;
      for (let fl = startFloor; fl < floors; fl++) for (let k = 0; k < nWin; k++) {
        const [px, pz] = f.px(step * (k + 0.5));
        if (o.door && fl === 0 && Math.abs((f.nz ? px : pz) - o.door.at) < 1.6) continue;
        this.windows.push({ x: px + f.nx * 0.03, y: base + fl * floorH + 1.65, z: pz + f.nz * 0.03, ry: f.ry, ground: fl === 0 });
      }
    }
    if (o.shop && o.front && !o.special) this.storefront(x0, x1, o.front === 's' ? z0 : z1, o.front);
    // cornicione
    this.mesh(boxGeo(w + 0.3, 0.35, d + 0.3, 3), M.stone, cx, base + h + 0.17, cz);
    this.mesh(boxGeo(w + 0.36, 0.16, d + 0.36, 3), M.stone, cx, base + floorH, cz, { cast: false });
    this.mapShapes.push({ type: 'building', x0, x1, z0, z1, special: o.special || null });
  }

  // Vetrina di negozio: interno dipinto illuminato dietro il vetro, telaio, insegna, zoccolo in pietra.
  storefront(x0, x1, z, side, kind) {
    const M = this.mats; const r = this.rand; const w = x1 - x0; if (w < 5) return;
    const kinds = this.shopKinds; const k = kind != null ? kind : Math.floor(r() * kinds.length);
    const sgn = side === 's' ? -1 : 1, ry = side === 's' ? Math.PI : 0;
    const ww = Math.min(w - 1.6, 7.5), cx = (x0 + x1) / 2;
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(ww, 2.0), kinds[k].mat); disp.position.set(cx, 0.12 + 1.55, z + sgn * 0.01); disp.rotation.y = ry; this.group.add(disp);
    this.mesh(new THREE.BoxGeometry(ww, 2.0, 0.03), M.shopGlass, cx, 0.12 + 1.55, z + sgn * 0.05, { cast: false, recv: false });
    this.mesh(new THREE.BoxGeometry(ww + 0.25, 0.14, 0.14), M.metal, cx, 0.12 + 2.62, z + sgn * 0.06, { cast: false });
    this.mesh(new THREE.BoxGeometry(ww + 0.25, 0.5, 0.16), M.stone, cx, 0.12 + 0.25, z + sgn * 0.07, { cast: false });
    for (const ex of [-1, 1]) this.mesh(new THREE.BoxGeometry(0.12, 2.6, 0.14), M.metal, cx + ex * (ww / 2 + 0.06), 0.12 + 1.3, z + sgn * 0.06, { cast: false });
    this.sign(kinds[k].name, kinds[k].sub, cx, 3.25, z + sgn * 0.09, ry, Math.min(ww, 4.4));
  }
  makeShopKinds() {
    const draw = (bg, shelf, items, seed) => {
      const c = document.createElement('canvas'); c.width = 512; c.height = 160; const g = c.getContext('2d'); const r = rng(seed);
      const grd = g.createLinearGradient(0, 0, 0, 160); grd.addColorStop(0, bg[0]); grd.addColorStop(1, bg[1]); g.fillStyle = grd; g.fillRect(0, 0, 512, 160);
      // luce calda dall'alto
      const lg = g.createRadialGradient(256, -20, 10, 256, -20, 300); lg.addColorStop(0, '#fff3d0aa'); lg.addColorStop(1, '#fff3d000'); g.fillStyle = lg; g.fillRect(0, 0, 512, 160);
      for (const y of [52, 98, 142]) { g.fillStyle = shelf; g.fillRect(0, y, 512, 6); g.fillStyle = '#00000033'; g.fillRect(0, y + 6, 512, 4);
        for (let x = 6; x < 506;) { const iw = 8 + r() * 22, ih = 14 + r() * 26; g.fillStyle = items[Math.floor(r() * items.length)]; g.fillRect(x, y - ih, iw, ih); g.fillStyle = '#ffffff22'; g.fillRect(x, y - ih, 3, ih); x += iw + 2 + r() * 6; } }
      // riflesso del vetro
      g.fillStyle = '#ffffff10'; g.beginPath(); g.moveTo(60, 0); g.lineTo(140, 0); g.lineTo(60, 160); g.lineTo(-20, 160); g.fill();
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
    };
    const mk = (name, sub, tex) => ({ name, sub, mat: new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.32, roughness: 0.9 }) });
    this.shopKinds = [
      mk('PANIFICIO', 'pane caldo · dal 1962', draw(['#6b4a2c', '#3a2716'], '#8a6a48', ['#c98d4a', '#e0b070', '#a96a32', '#f0d9a8'], 3)),
      mk('FIORI MAREA', 'piante · composizioni', draw(['#3d4a35', '#20281d'], '#5a4a38', ['#d04a5a', '#f2c94c', '#f6f1e9', '#9b59b6', '#5a8f3c'], 5)),
      mk('LIBRERIA', 'usato e nuovo', draw(['#4a3b33', '#251c17'], '#6b4f3a', ['#7a2e2a', '#2f4f5f', '#c9b48a', '#3e5d3a', '#d6d0c4'], 9)),
      mk('FERRAMENTA', 'chiavi · attrezzi', draw(['#4b5258', '#24292d'], '#7a7f84', ['#c0392b', '#e67e22', '#95a5a6', '#2c3e50', '#f1c40f'], 13)),
      mk('FARMACIA', 'aperta 8-20', draw(['#dfe7e3', '#9fb2aa'], '#b8c4c0', ['#ffffff', '#2e8b57', '#7fb2d9', '#e6e1d8'], 17)),
    ];
    this.clothesTex = (() => {
      const c = document.createElement('canvas'); c.width = 512; c.height = 220; const g = c.getContext('2d');
      const grd = g.createLinearGradient(0, 0, 0, 220); grd.addColorStop(0, '#e9e1d6'); grd.addColorStop(1, '#9d9287'); g.fillStyle = grd; g.fillRect(0, 0, 512, 220);
      g.fillStyle = '#6b5a4a'; g.fillRect(0, 196, 512, 24);
      const cols = ['#26313f', '#e9e4d8', '#7d8c6a', '#8b8d90', '#a47d55', '#a5573d', '#3b5374', '#b5a284'];
      // manichino con giacca, a sinistra e a destra
      const mannequin = (x, top, bot) => { g.fillStyle = '#d8cfc2'; g.beginPath(); g.ellipse(x, 30, 13, 16, 0, 0, 7); g.fill(); g.fillRect(x - 4, 44, 8, 8);
        g.fillStyle = top; g.beginPath(); g.moveTo(x - 30, 54); g.lineTo(x + 30, 54); g.lineTo(x + 40, 110); g.lineTo(x + 26, 112); g.lineTo(x + 24, 128); g.lineTo(x - 24, 128); g.lineTo(x - 26, 112); g.lineTo(x - 40, 110); g.closePath(); g.fill();
        g.fillStyle = bot; g.fillRect(x - 23, 128, 21, 66); g.fillRect(x + 2, 128, 21, 66); g.fillStyle = '#0003'; g.fillRect(x - 1, 60, 2, 66); };
      mannequin(70, '#a47d55', '#34373c'); mannequin(442, '#e9e4d8', '#3b5374');
      // stender con camicie appese
      g.fillStyle = '#555'; g.fillRect(140, 52, 232, 4);
      for (let i = 0; i < 9; i++) { const x = 156 + i * 25, col = cols[i % cols.length];
        g.strokeStyle = '#444'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, 54); g.lineTo(x, 62); g.stroke();
        g.fillStyle = col; g.beginPath(); g.moveTo(x - 12, 64); g.lineTo(x + 12, 64); g.lineTo(x + 14, 140); g.lineTo(x - 14, 140); g.closePath(); g.fill();
        g.fillStyle = '#0002'; g.fillRect(x + 8, 64, 6, 76); }
      // pile di maglie piegate
      for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) { g.fillStyle = cols[(i * 3 + k) % cols.length]; g.fillRect(170 + i * 50, 186 - k * 10, 40, 9); }
      const lg = g.createRadialGradient(256, -30, 10, 256, -30, 320); lg.addColorStop(0, '#fff6dd88'); lg.addColorStop(1, '#fff6dd00'); g.fillStyle = lg; g.fillRect(0, 0, 512, 220);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; })();
  }

  sign(text, sub, x, y, z, ry, w = 4.2) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.1875), new THREE.MeshStandardMaterial({ map: signTexture(text, sub), roughness: 0.6, emissive: '#ffffff', emissiveIntensity: 0.08, emissiveMap: null }));
    m.position.set(x, y, z); m.rotation.y = ry; this.group.add(m); return m;
  }
  awning(x, z, w, side, color) {
    const g = new THREE.BoxGeometry(w, 0.05, 1.4); const m = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
    const a = this.mesh(g, m, x, 0.12 + 2.75, z + (side === 's' ? -0.65 : 0.65));
    a.rotation.x = side === 's' ? -0.32 : 0.32;
    const az = z + (side === 's' ? -1.4 : 0), bz = z + (side === 's' ? 0 : 1.4);
    this.addBox(x - w / 2, x + w / 2, az, bz, 2.55, 3.2); // la camera non passa attraverso le tende
  }
  door(x, z, side) {
    const M = this.mats; const dz = side === 's' ? -0.06 : 0.06;
    this.mesh(new THREE.BoxGeometry(1.3, 2.3, 0.1), M.door, x, 0.12 + 1.15, z + dz, { cast: false });
    this.mesh(new THREE.BoxGeometry(1.6, 0.12, 0.5), M.stone, x, 0.18, z + (side === 's' ? -0.3 : 0.3), { cast: false });
    // numero civico/luce
    this.mesh(new THREE.BoxGeometry(0.25, 0.25, 0.08), new THREE.MeshStandardMaterial({ color: '#fff2cc', emissive: '#ffcf80', emissiveIntensity: 0.6 }), x + 1.0, 0.12 + 2.1, z + dz, { cast: false });
  }

  buildBuildings() {
    this.rand = rng(42); const r = this.rand; this.windows = []; this.makeShopKinds();
    const P = PLACES;
    // speciali
    this.building(-76, -59, 8, 20, 9.6, { interior: true, door: { side: 's', at: -68, width: 1.8 }, special: 'barber', floor: this.mats.floorBar, mat: this.facadeMats[1] });
    this.sign("BARBIERE", "Lama d'Oro · Tonino", -68, 3.95, 7.9, Math.PI, 5);
    this.awning(-72.5, 8, 5, 's', '#7a2e2a'); this.awning(-63.5, 8, 5, 's', '#7a2e2a');
    // palo da barbiere
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.1, 16), new THREE.MeshStandardMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 256; const x = c.getContext('2d'); for (let i = -4; i < 12; i++) { x.fillStyle = ['#c0392b', '#f4f4f4', '#2c5aa0', '#f4f4f4'][((i % 4) + 4) % 4]; x.beginPath(); x.moveTo(0, i * 32); x.lineTo(64, i * 32 - 40); x.lineTo(64, i * 32 - 8); x.lineTo(0, i * 32 + 32); x.fill(); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })(), roughness: 0.3 }));
    pole.position.set(-66.2, 2.0, 7.85); this.group.add(pole); this.barberPole = pole;

    this.building(-14, 4, -19, -8, 9.6, { interior: true, door: { side: 'n', at: -5, width: 1.8 }, special: 'cafe', floor: this.mats.floorBar, mat: this.facadeMats[5] });
    this.sign('CAFFÈ SOTTOVENTO', 'il caffè del giorno · Marta', -5, 3.95, -7.9, 0, 5.4);
    this.awning(-10.5, -8, 6, 'n', '#2f4f5f'); this.awning(0.5, -8, 6, 'n', '#2f4f5f');

    this.building(59, 73, 8, 19, 6.8, { shop: true, special: 'depot', mat: this.facadeMats[3] });
    this.sign('CONSEGNE LAMPO', 'ordini · bici cargo · Rocco', 66, 3.9, 7.9, Math.PI, 5);
    // serranda
    this.mesh(new THREE.BoxGeometry(5, 2.8, 0.08), new THREE.MeshStandardMaterial({ color: '#6f767a', roughness: 0.5, metalness: 0.6 }), 66, 0.12 + 1.4, 7.94, { cast: false });

    // Sartoria (cambio abiti): vetrina con manichini
    this.building(18, 30, -19, -8, 9.6, { special: 'shop', shop: true, mat: this.facadeMats[6] });
    this.storefront(18, 23.2, -8, 'n', 0); // vetrina laterale (panificio accanto alla porta)
    { const ww = 4.6, cx = 26.6, z = -8;
      const disp = new THREE.Mesh(new THREE.PlaneGeometry(ww, 2.0), new THREE.MeshStandardMaterial({ map: this.clothesTex, emissiveMap: this.clothesTex, emissive: '#ffffff', emissiveIntensity: 0.38, roughness: 0.9 }));
      disp.position.set(cx, 1.67, z + 0.01); this.group.add(disp);
      this.mesh(new THREE.BoxGeometry(ww, 2.0, 0.03), this.mats.shopGlass, cx, 1.67, z + 0.05, { cast: false, recv: false });
      this.mesh(new THREE.BoxGeometry(ww + 0.25, 0.5, 0.16), this.mats.stone, cx, 0.37, z + 0.07, { cast: false });
      this.manneq = [[25.4, -8.45], [27.8, -8.45]]; }
    this.door(24, -8, 'n');
    this.sign('SARTORIA MAREA', 'abiti uomo · prova gratis', 24, 3.95, -7.9, 0, 5);
    this.awning(26.6, -8, 4.8, 'n', '#5c3a5e');
    this.building(63, 78, -20, -8, 10.2, { special: 'dl_bice', mat: this.facadeMats[0] }); this.door(70, -8, 'n');
    this.building(-80, -64, -19, -8, 7.0, { shop: true, special: 'dl_lab', mat: this.facadeMats[4] }); this.door(-72, -8, 'n');
    this.sign('LABORATORIO', 'riparazioni · vicolo', -72, 3.6, -7.92, 0, 3.6);
    this.building(-14, 14, 40, 53, 13.2, { special: 'dl_condo', mat: this.facadeMats[2] }); this.door(0, 40, 's');
    this.sign('CONDOMINIO NORD', 'civici 10-14', 0, 3.2, 39.92, Math.PI, 3.4);

    // riempimento isolati lungo i fronti stradali (con vicoli occasionali)
    const reserved = [[-45, -12, -103, -80], [-31, 31, -153, -99], [17.4, 30.6, -19, -8], [-33, -20, 39, 56], [20, 34, 39, 56], [-76, -59, 8, 20], [-14, 4, -19, -8], [59, 73, 8, 19], [63, 78, -20, -8], [-80, -64, -19, -8], [-14, 14, 40, 53], [-24, 24, 7, 38]];
    const free = (x0, x1, z0, z1) => !reserved.some(([a, b, c, d]) => x0 < b + 0.6 && x1 > a - 0.6 && z0 < d + 0.6 && z1 > c - 0.6);
    const rowX = (xa, xb, z0, depth, north) => {
      let x = xa;
      while (x < xb - 5) {
        const w = Math.min(xb - x, 9 + r() * 8); const h = 6.6 + Math.floor(r() * 3) * 3.2;
        const zz0 = north ? z0 : z0 - depth, zz1 = north ? z0 + depth : z0;
        if (free(x, x + w, zz0, zz1)) this.building(x, x + w, zz0, zz1, h, { shop: r() < 0.45, front: north ? 's' : 'n' });
        x += w + (r() < 0.25 ? 3.2 : 0);
      }
    };
    const rowZ = (za, zb, x0, depth, east) => {
      let z = za;
      while (z < zb - 5) {
        const w = Math.min(zb - z, 9 + r() * 8); const h = 6.6 + Math.floor(r() * 3) * 3.2;
        const xx0 = east ? x0 : x0 - depth, xx1 = east ? x0 + depth : x0;
        if (free(xx0, xx1, z, z + w)) this.building(xx0, xx1, z, z + w, h, {});
        z += w + (r() < 0.25 ? 3.2 : 0);
      }
    };
    // isolati nord (fronte a z=8) e sud (fronte a z=-8)
    rowX(-93, -54, 8, 11, true); rowX(-42, 42, 8, 11, true); rowX(54, 93, 8, 11, true);
    rowX(-93, -54, -8, 11, false); rowX(-42, 42, -8, 11, false); rowX(54, 93, -8, 11, false);
    // fronti sulle traverse
    rowZ(22, 72, -53.2, 10, false); rowZ(22, 72, -42.8, 10, true); rowZ(22, 72, 42.8, 10, false); rowZ(22, 72, 53.2, 10, true);
    rowZ(-72, -22, -53.2, 10, false); rowZ(-72, -22, -42.8, 10, true); rowZ(-72, -22, 42.8, 10, false); rowZ(-72, -22, 53.2, 10, true);
    // fondali sui bordi del mondo
    rowX(-93, 93, 63, 11, true); rowX(-93, -54, -63, 11, false); rowX(-42, 42, -63, 11, false); rowX(54, 93, -63, 11, false);
    rowZ(-60, 60, -93.5, 0.1, true); rowZ(-60, 60, 93.5, 0.1, false);
    // v0.3 quartiere sud: fronti lungo le traverse prolungate e sul Lungomare (il parco e l'autosalone sono riservati)
    rowZ(-160, -80, -53.2, 10, false); rowZ(-160, -80, 53.2, 10, true);
    rowZ(-160, -80, -42.8, 10, true); rowZ(-160, -80, 42.8, 10, false);
    rowX(-42, 42, -162, 10, true); rowX(-93, -54, -170, 9, true); rowX(54, 93, -170, 9, true);
    rowZ(-165, -66, -93.5, 0.1, true); rowZ(-165, -66, 93.5, 0.1, false);
    this.buildDealer();

    // finestre istanziate
    const n = this.windows.length; const M = this.mats;
    const glass = new THREE.InstancedMesh(new THREE.BoxGeometry(1.15, 1.45, 0.06), M.glass, n);
    const frame = new THREE.InstancedMesh(new THREE.BoxGeometry(1.35, 1.65, 0.04), M.frame, n);
    const sill = new THREE.InstancedMesh(new THREE.BoxGeometry(1.45, 0.07, 0.2), M.stone, n);
    const shutters = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 1.5, 0.04), new THREE.MeshStandardMaterial({ color: '#4f6b5a', roughness: 0.8 }), n * 2);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
    let si = 0;
    this.windows.forEach((wd, i) => {
      q.setFromEuler(e.set(0, wd.ry, 0));
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q), right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
      m4.compose(v.set(wd.x, wd.y, wd.z).addScaledVector(fwd, 0.01), q, one); frame.setMatrixAt(i, m4);
      m4.compose(v.set(wd.x, wd.y, wd.z).addScaledVector(fwd, 0.02), q, one); glass.setMatrixAt(i, m4);
      m4.compose(v.set(wd.x, wd.y - 0.85, wd.z).addScaledVector(fwd, 0.08), q, one); sill.setMatrixAt(i, m4);
      if (!wd.ground && (Math.abs(Math.round(wd.x * 7 + wd.z * 3)) % 3 === 0)) for (const sx of [-1, 1]) {
        m4.compose(v.set(wd.x, wd.y, wd.z).addScaledVector(right, sx * 0.98).addScaledVector(fwd, 0.04), q, one); shutters.setMatrixAt(si++, m4);
      }
    });
    shutters.count = si;
    for (const im of [glass, frame, sill, shutters]) { im.receiveShadow = true; im.castShadow = false; this.group.add(im); }
  }

  buildPiazza() {
    const M = this.mats;
    // pavimentazione in ciottoli e aiuole
    this.mesh(planeGeo(44, 30, 2.5), M.cobble, 0, 0.123, 22, { cast: false });
    for (const [x, z, w, d] of [[-14, 30, 12, 8], [14, 30, 12, 8], [-15, 13, 9, 5], [15, 13, 9, 5]]) {
      this.mesh(boxGeo(w, 0.25, d, 2), M.grass, x, 0.14, z, { cast: false });
      this.mesh(boxGeo(w + 0.3, 0.3, 0.15, 1), M.stone, x, 0.15, z - d / 2, { cast: false }); this.mesh(boxGeo(w + 0.3, 0.3, 0.15, 1), M.stone, x, 0.15, z + d / 2, { cast: false });
      this.mesh(boxGeo(0.15, 0.3, d, 1), M.stone, x - w / 2, 0.15, z, { cast: false }); this.mesh(boxGeo(0.15, 0.3, d, 1), M.stone, x + w / 2, 0.15, z, { cast: false });
      this.addBox(x - w / 2, x + w / 2, z - d / 2, z + d / 2, 0, 0.45);
      this.mapShapes.push({ type: 'grass', x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
    }
    this.mapShapes.push({ type: 'piazza', x0: -22, x1: 22, z0: 7, z1: 37 });
    // fontana (il pozzo)
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.5, 0.6, 40, 1, true), M.stone); ring.position.set(0, 0.42, 21); ring.castShadow = ring.receiveShadow = true; this.group.add(ring);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.42, 0.14, 8, 48), M.stone); rim.rotation.x = Math.PI / 2; rim.position.set(0, 0.72, 21); this.group.add(rim);
    const water = new THREE.Mesh(new THREE.CircleGeometry(2.35, 40), M.water); water.rotation.x = -Math.PI / 2; water.position.set(0, 0.55, 21); this.group.add(water); this.water = water;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.8, 20), M.stone); col.position.set(0, 1.0, 21); col.castShadow = true; this.group.add(col);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.4, 0.3, 24), M.stone); bowl.position.set(0, 1.9, 21); bowl.castShadow = true; this.group.add(bowl);
    this.circles.push({ x: 0, z: 21, r: 2.6 });
    this.mapShapes.push({ type: 'fountain', x: 0, z: 21, r: 2.5 });
    // panchine
    this.benchSpots ||= [];
    for (const [x, z, ry] of [[-7, 26, Math.PI], [7, 26, Math.PI], [-7, 16, 0], [7, 16, 0], [-20, 22, Math.PI / 2], [20, 22, -Math.PI / 2]]) this.bench(x, z, ry);
  }
  bench(x, z, ry) {
    const M = this.mats; const g = new THREE.Group(); g.position.set(x, 0.12, z); g.rotation.y = ry;
    for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.04, 0.12), M.wood); s.position.set(0, 0.45, -0.14 + i * 0.14); s.castShadow = true; g.add(s); }
    for (let i = 0; i < 2; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.03), M.wood); s.position.set(0, 0.62 + i * 0.14, -0.24); s.rotation.x = -0.12; s.castShadow = true; g.add(s); }
    for (const sx of [-0.75, 0.75]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.45), M.metal); l.position.set(sx, 0.22, -0.02); l.castShadow = true; g.add(l); }
    g.userData.flatten = true; this.group.add(g);
    const c = Math.abs(Math.cos(ry)) > 0.5;
    this.addBox(x - (c ? 0.95 : 0.3), x + (c ? 0.95 : 0.3), z - (c ? 0.3 : 0.95), z + (c ? 0.3 : 0.95), 0, 0.9);
    (this.benchSpots ||= []).push({ x, z, ry });
  }

  async normGLB(url, target, axis = 'y') {
    const g = await loadGLB(url); const o = g.scene.clone(true);
    const b = new THREE.Box3().setFromObject(o); const s = b.getSize(new THREE.Vector3());
    const k = target / (axis === 'y' ? s.y : Math.max(s.x, s.z));
    o.scale.setScalar(k); o.position.y = -b.min.y * k;
    o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    const wrap = new THREE.Group(); wrap.add(o); wrap.userData.size = s.clone().multiplyScalar(k); return wrap;
  }

  async buildProps() {
    const r = rng(7);
    // lampioni lungo Via del Porto
    const lamp = await this.normGLB('./assets/props/street_lamp_01.glb', 4.6);
    for (let x = -88; x <= 88; x += 16) for (const z of [-5.9, 5.9]) {
      if (Math.abs(x + 48) < 4 || Math.abs(x - 48) < 4) continue;
      if (z > 0 && Math.abs(x + 8) < 2) continue; // v0.2: il palo copriva la visuale allo spawn
      if (z < 0 && Math.abs(x - 24) < 2) continue; // davanti alla porta della Sartoria
      const l = lamp.clone(true); l.position.set(x + (z > 0 ? 8 : 0), 0.12, z); l.rotation.y = z > 0 ? Math.PI : 0; this.group.add(l);
      this.circles.push({ x: l.position.x, z, r: 0.25 });
    }
    for (let z = -150; z <= -90; z += 30) for (const x of [-52.1, 52.1]) { const l = lamp.clone(true); l.position.set(x, 0.12, z); l.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2; this.group.add(l); this.circles.push({ x, z, r: 0.25 }); }
    for (let x = -36; x <= 36; x += 24) { const l = lamp.clone(true); l.position.set(x, 0.12, -173.2); this.group.add(l); this.circles.push({ x, z: -173.2, r: 0.25 }); }
    // alberi in piazza e lungo le traverse (tronco + chioma da cespuglio Poly Haven)
    const shrub = await this.normGLB('./assets/props/shrub_04.glb', 3.4);
    const shrub2 = await this.normGLB('./assets/props/shrub_02.glb', 1.1);
    const trunkG = new THREE.CylinderGeometry(0.12, 0.2, 3.2, 10);
    const tree = (x, z, s = 1) => {
      const t = new THREE.Mesh(trunkG, this.mats.bark); t.position.set(x, 0.12 + 1.6 * s, z); t.scale.setScalar(s); t.castShadow = true; this.group.add(t);
      for (let k = 0; k < 3; k++) {
        const c = shrub.clone(true); const a = r() * 6.28, rr = k ? 0.7 : 0;
        c.position.set(x + Math.cos(a) * rr * s, 0.12 + (2.0 + (k ? 0.5 : 0)) * s, z + Math.sin(a) * rr * s);
        c.scale.setScalar((k ? 0.95 : 1.25) * s); c.rotation.y = r() * 6.28; this.group.add(c);
      }
      this.circles.push({ x, z, r: 0.35 }); this.mapShapes.push({ type: 'tree', x, z });
    };
    for (const [x, z] of [[-14, 30], [14, 30], [-18, 31], [18, 29]]) tree(x, z, 1.1);
    for (let z = -66; z <= 66; z += 14) { if (Math.abs(z) < 12) continue; tree(-43.6, z + 4, 0.9); tree(43.6, z - 3, 0.9); }
    for (const [x, z] of [[-15, 13], [15, 13], [-12, 13.5], [12, 12.5], [-17, 12.8], [17, 13.2]]) {
      const s = shrub2.clone(true); s.position.set(x, 0.27, z); s.rotation.y = r() * 6.28; this.group.add(s);
    }
    // auto parcheggiate (statiche)
    const carDefs = [['corallo', 4.3], ['sedan', 4.6], ['van', 4.9]];
    const cars = [];
    for (const [n, len] of carDefs) cars.push(await this.normGLB(`./assets/props/${n}.glb`, len, 'len'));
    const spots = [[-86, 2.9], [-78, 2.9], [-30, 2.9], [-22, -2.9], [24, 2.9], [32, -2.9], [62, -2.9], [80, 2.9], [-48, 30], [48, -36], [-48, -52]];
    spots.forEach(([x, z], i) => {
      const c = cars[i % cars.length].clone(true); const sz = c.userData.size;
      const longX = sz.x >= sz.z; const vertical = Math.abs(x) === 48;
      c.position.set(x + (vertical ? 1.9 : 0), 0, z);
      c.rotation.y = (longX ? 0 : Math.PI / 2) + (vertical ? Math.PI / 2 : 0) + (z < 0 ? Math.PI : 0);
      this.group.add(c);
      const L = Math.max(sz.x, sz.z) / 2, W = Math.min(sz.x, sz.z) / 2;
      const along = vertical ? 'z' : 'x';
      if (along === 'x') this.addBox(c.position.x - L, c.position.x + L, z - W, z + W, 0, 1.6);
      else this.addBox(c.position.x - W, c.position.x + W, z - L, z + L, 0, 1.6);
      this.mapShapes.push({ type: 'car', x: c.position.x, z, along, L, W });
    });
    this.buildInteriors();
    this.buildActivities(shrub2);
  }

  buildInteriors() {
    const M = this.mats;
    // barberia: poltrona, specchio, bancone
    const chairMat = new THREE.MeshStandardMaterial({ color: '#8c1f1f', roughness: 0.45 });
    const chair = new THREE.Group(); chair.position.set(-68, 0.12, 16.6);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.65), chairMat); seat.position.y = 0.6; chair.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.14), chairMat); back.position.set(0, 1.05, 0.28); chair.add(back);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.3, 0.5, 16), M.metal); base.position.y = 0.25; chair.add(base);
    chair.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); this.group.add(chair);
    this.addBox(-68.4, -67.6, 16.3, 17.0, 0, 1.4);
    const mirror = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshStandardMaterial({ color: '#c8d4dc', roughness: 0.02, metalness: 1 }));
    mirror.position.set(-68, 1.75, 19.7); mirror.rotation.y = Math.PI; this.group.add(mirror);
    this.mesh(new THREE.BoxGeometry(2.6, 0.9, 0.5), M.wood, -68, 0.57, 19.45);
    this.addBox(-69.3, -66.7, 19.2, 19.75, 0, 1);
    for (const x of [-73.5, -72.3]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.45, 0.5), new THREE.MeshStandardMaterial({ color: '#4a3326', roughness: 0.6 })); s.position.set(x, 0.35, 9.2); this.group.add(s); }
    this.addBox(-74, -71.8, 8.9, 9.5, 0, 0.6);
    // bar: bancone e tavolini
    this.mesh(boxGeo(6, 1.05, 0.7, 1.5), M.marble, -5, 0.12 + 0.52, -16.8);
    this.addBox(-8, -2, -17.2, -16.4, 0, 1.2);
    const cm = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 0.45), M.metal); cm.position.set(-4, 1.4, -17); this.group.add(cm);
    const table = (x, z) => {
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.03, 20), M.marble); top.position.set(x, 0.12 + 0.74, z); top.castShadow = true; this.group.add(top);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.2, 0.74, 10), M.metal); leg.position.set(x, 0.12 + 0.37, z); this.group.add(leg);
      this.circles.push({ x, z, r: 0.45 });
    };
    table(-10, -12); table(-11, -14.5); table(2, -6.2); table(-12, -6.2);
  }

  buildActivities(shrub2) {
    const M = this.mats; const r = rng(99);
    // ---- Laghetto (pesca) ----
    const PX = -27, PZ = 48;
    this.mesh(planeGeo(13, 15, 2), M.grass, PX, 0.124, PZ, { cast: false });
    this.mapShapes.push({ type: 'grass', x0: PX - 6.5, x1: PX + 6.5, z0: PZ - 7.5, z1: PZ + 7.5 });
    const pondG = new THREE.CircleGeometry(1, 48); pondG.scale(4.6, 5.4, 1);
    const pondMat = new THREE.MeshStandardMaterial({ color: '#2f5560', roughness: 0.06, metalness: 0.2, transparent: true, opacity: 0.9, envMapIntensity: 1.3 });
    const pond = new THREE.Mesh(pondG, pondMat); pond.rotation.x = -Math.PI / 2; pond.position.set(PX, 0.14, PZ); pond.receiveShadow = true; this.group.add(pond); this.pond = pond;
    const bed = new THREE.Mesh(new THREE.CircleGeometry(1, 48).scale(4.7, 5.5, 1), new THREE.MeshStandardMaterial({ color: '#2a2f22', roughness: 1 })); bed.rotation.x = -Math.PI / 2; bed.position.set(PX, 0.128, PZ); this.group.add(bed);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 64), M.stone); rim.scale.set(4.75, 5.55, 2.2); rim.rotation.x = Math.PI / 2; rim.position.set(PX, 0.15, PZ); rim.receiveShadow = true; this.group.add(rim);
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 10) this.circles.push({ x: PX + Math.cos(a) * 3.3, z: PZ + Math.sin(a) * 4.0, r: 1.35 });
    this.circles.push({ x: PX, z: PZ, r: 3.2 });
    // pontile
    this.mesh(boxGeo(1.4, 0.1, 2.6, 1), M.wood, PX, 0.22, PZ - 5.6, { cast: true });
    for (const [dx, dz] of [[-0.6, -6.7], [0.6, -6.7], [-0.6, -4.5], [0.6, -4.5]]) this.mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8), M.wood, PX + dx, 0.05, PZ + dz);
    // canne palustri
    const reedG = new THREE.CylinderGeometry(0.012, 0.02, 1, 4); reedG.translate(0, 0.5, 0);
    const reeds = new THREE.InstancedMesh(reedG, new THREE.MeshStandardMaterial({ color: '#6d7a3e', roughness: 0.9 }), 160);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    let n = 0;
    for (let i = 0; i < 160; i++) { const a = r() * Math.PI * 2; if (Math.sin(a) < -0.75) continue; const k = 0.9 + r() * 0.12;
      q.setFromEuler(e.set((r() - 0.5) * 0.25, 0, (r() - 0.5) * 0.25)); const hgt = 0.7 + r() * 0.9;
      m4.compose(v.set(PX + Math.cos(a) * 4.6 * k, 0.1, PZ + Math.sin(a) * 5.4 * k), q, sc.set(1, hgt, 1)); reeds.setMatrixAt(n++, m4); }
    reeds.count = n; reeds.castShadow = true; this.group.add(reeds);
    for (const [x, z] of [[PX - 5.5, PZ + 5], [PX + 5.6, PZ - 3], [PX - 5.8, PZ - 4.5]]) { const s2 = shrub2.clone(true); s2.position.set(x, 0.15, z); s2.rotation.y = r() * 6; this.group.add(s2); }
    this.bench(PX + 4.2, PZ - 6.6, 0);
    this.fishSpot = { x: PX, z: PZ - 6.3, ry: 0 };
    this.bobber = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshStandardMaterial({ color: '#d63a2f', roughness: 0.4 }));
    this.bobber.visible = false; this.scene.add(this.bobber);
    this.mapShapes.push({ type: 'fountain', x: PX, z: PZ, r: 4.8 });
    // ---- Campetto (basket) ----
    const CX = 27, CZ = 47;
    const courtTex = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 352; const g = c.getContext('2d');
      g.fillStyle = '#2f5d6b'; g.fillRect(0, 0, 256, 352); g.fillStyle = '#b6553a'; g.fillRect(14, 14, 228, 324);
      g.strokeStyle = '#f2efe6'; g.lineWidth = 3; g.strokeRect(14, 14, 228, 324);
      g.strokeRect(88, 14, 80, 110); g.beginPath(); g.arc(128, 124, 40, 0, Math.PI); g.stroke();
      g.beginPath(); g.arc(128, 40, 112, 0.18, Math.PI - 0.18); g.stroke(); g.beginPath(); g.moveTo(14, 338); g.lineTo(242, 338); g.stroke();
      g.beginPath(); g.arc(128, 338, 40, Math.PI, 0); g.stroke();
      for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`; g.fillRect(Math.random() * 256, Math.random() * 352, 2, 2); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; })();
    const court = new THREE.Mesh(new THREE.PlaneGeometry(11, 15), new THREE.MeshStandardMaterial({ map: courtTex, roughness: 0.85 }));
    court.rotation.x = -Math.PI / 2; court.rotation.z = Math.PI; court.position.set(CX, 0.125, CZ); court.receiveShadow = true; this.group.add(court);
    this.mapShapes.push({ type: 'piazza', x0: CX - 5.5, x1: CX + 5.5, z0: CZ - 7.5, z1: CZ + 7.5 });
    // canestro (lato nord)
    const HZ = CZ + 6.4; this.hoop = { x: CX, y: 3.05 + 0.12, z: HZ - 0.55 };
    this.mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.6, 12), M.metal, CX, 0.12 + 1.8, HZ + 0.6);
    this.mesh(new THREE.BoxGeometry(0.08, 0.08, 0.8), M.metal, CX, 0.12 + 3.4, HZ + 0.25);
    const bb = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.05, 0.05), new THREE.MeshStandardMaterial({ color: '#f4f4f0', roughness: 0.4, transparent: true, opacity: 0.92 })); bb.position.set(CX, 0.12 + 3.45, HZ - 0.15); bb.castShadow = true; this.group.add(bb);
    const sq = new THREE.Mesh(new THREE.PlaneGeometry(0.59, 0.45), new THREE.MeshBasicMaterial({ color: '#c0392b', side: THREE.DoubleSide })); sq.position.set(CX, 0.12 + 3.3, HZ - 0.18); sq.rotation.y = Math.PI; this.group.add(sq);
    const sq2 = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.36), new THREE.MeshBasicMaterial({ color: '#f4f4f0', side: THREE.DoubleSide })); sq2.position.set(CX, 0.12 + 3.3, HZ - 0.181); sq2.rotation.y = Math.PI; this.group.add(sq2);
    const rimM = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.012, 6, 24), new THREE.MeshStandardMaterial({ color: '#d35400', roughness: 0.4, metalness: 0.4 }));
    rimM.rotation.x = Math.PI / 2; rimM.position.set(this.hoop.x, this.hoop.y, this.hoop.z); this.group.add(rimM);
    const net = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.15, 0.4, 12, 1, true), new THREE.MeshStandardMaterial({ color: '#f2f2f2', wireframe: true }));
    net.position.set(this.hoop.x, this.hoop.y - 0.2, this.hoop.z); this.group.add(net); this.net = net;
    this.circles.push({ x: CX, z: HZ + 0.6, r: 0.25 });
    this.shotSpot = { x: CX, z: CZ + 1.6, ry: 0 };
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 14), new THREE.MeshStandardMaterial({ color: '#c8642a', roughness: 0.7 }));
    this.ball.castShadow = true; this.ball.position.set(CX + 4.4, 0.24, CZ - 6.4); this.scene.add(this.ball);
    // recinzione bassa sui lati
    const fenceM = new THREE.MeshStandardMaterial({ color: '#59636a', roughness: 0.5, metalness: 0.6 });
    for (const sx of [-1, 1]) {
      for (const y of [0.55, 1.1]) this.mesh(new THREE.CylinderGeometry(0.025, 0.025, 15, 6).rotateX(Math.PI / 2), fenceM, CX + sx * 5.6, 0.12 + y, CZ, { cast: false });
      for (let zz = -7.5; zz <= 7.5; zz += 2.5) this.mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.2, 6), fenceM, CX + sx * 5.6, 0.72, CZ + zz);
    }
    for (const sx of [-1, 1]) this.addBox(CX + sx * 5.6 - 0.05, CX + sx * 5.6 + 0.05, CZ - 7.5, CZ + 7.5, 0, 1.2);
    this.bench(CX - 4.6, CZ - 6.9, 0);
  }

  // v0.3: Autosalone «Miraggio» (piazzale con 3 auto esposte) e Parco del Faro
  buildDealer() {
    const M = this.mats;
    this.building(-34, -13, -101, -82, 7.2, { special: 'dealer', shop: true, mat: this.facadeMats[3] });
    // vetrata dello showroom sul lato ovest
    this.mesh(new THREE.BoxGeometry(0.06, 2.6, 15), M.shopGlass, -34.05, 1.5, -91.5, { cast: false, recv: false });
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(15, 2.6), new THREE.MeshStandardMaterial({ color: '#efe9de', emissive: '#fff4e0', emissiveIntensity: 0.55, roughness: 0.9 }));
    inner.rotation.y = -Math.PI / 2; inner.position.set(-33.98, 1.5, -91.5); this.group.add(inner);
    this.mesh(new THREE.BoxGeometry(0.2, 0.18, 15.4), M.metal, -34.1, 2.86, -91.5, { cast: false });
    const sg = this.sign('AUTOSALONE MIRAGGIO', 'auto nuove · prova gratis', -34.12, 3.6, -91.5, -Math.PI / 2, 6.4);
    // piazzale in pietra chiara
    this.mesh(planeGeo(10.6, 18, 2), M.marble, -39.5, 0.125, -91.5, { cast: false });
    this.displaySpots = [{ x: -39.5, z: -86, yaw: -Math.PI / 2 - 0.5 }, { x: -39.5, z: -91.5, yaw: -Math.PI / 2 - 0.5 }, { x: -39.5, z: -97, yaw: -Math.PI / 2 - 0.5 }];
    this.dealerSpot = { x: -35.6, z: -91.5 };
    this.mapShapes.push({ type: 'piazza', x0: -44.8, x1: -34.2, z0: -100.5, z1: -82.5 });
    // Parco del Faro: prato, viali, alberi semplici uniti (poche draw call), panchine
    const PX = 0, PZ = -126;
    this.mesh(planeGeo(60, 52, 2), M.grass, PX, 0.124, PZ, { cast: false });
    this.mesh(planeGeo(4, 52, 2), M.cobble, PX, 0.127, PZ, { cast: false });
    this.mesh(planeGeo(60, 4, 2), M.cobble, PX, 0.128, PZ, { cast: false });
    this.mapShapes.push({ type: 'grass', x0: -30, x1: 30, z0: -152, z1: -100 });
    const r = rng(1234); const trunks = [], crowns = [];
    for (let i = 0; i < 26; i++) {
      const x = PX + (r() - 0.5) * 54, z = PZ + (r() - 0.5) * 46; if (Math.abs(x - PX) < 3.5 || Math.abs(z - PZ) < 3.5) continue;
      const s = 0.8 + r() * 0.6;
      const t = new THREE.CylinderGeometry(0.12 * s, 0.2 * s, 2.6 * s, 7); t.translate(x, 0.12 + 1.3 * s, z); trunks.push(t);
      for (let k = 0; k < 3; k++) { const c = new THREE.IcosahedronGeometry((1.2 + r() * 0.6) * s, 1); c.translate(x + (r() - 0.5) * 1.2 * s, 0.12 + (2.6 + r() * 1.2) * s, z + (r() - 0.5) * 1.2 * s); crowns.push(c); }
      this.circles.push({ x, z, r: 0.3 }); this.mapShapes.push({ type: 'tree', x, z });
    }
    const crownMat = new THREE.MeshStandardMaterial({ color: '#4f6b3a', roughness: 0.95, flatShading: true });
    const tm = new THREE.Mesh(mergeGeometries(trunks.map((g) => g.toNonIndexed())), M.bark); tm.castShadow = true; this.group.add(tm);
    const cm = new THREE.Mesh(mergeGeometries(crowns), crownMat); cm.castShadow = true; cm.receiveShadow = true; this.group.add(cm);
    this.bench(-4, -116, -Math.PI / 2); this.bench(4, -136, Math.PI / 2); this.bench(-12, -128.4, Math.PI);
    // faro sul molo (punto di riferimento visibile da lontano)
    const fm = new THREE.MeshStandardMaterial({ color: '#efe9de', roughness: 0.7 }), fr = new THREE.MeshStandardMaterial({ color: '#a33a2f', roughness: 0.7 });
    this.mesh(new THREE.CylinderGeometry(1.0, 1.4, 10, 16), fm, 70, 5.12, -174.5); this.mesh(new THREE.CylinderGeometry(1.05, 1.05, 1.4, 16), fr, 70, 7.2, -174.5);
    this.mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.2, 12), new THREE.MeshStandardMaterial({ color: '#ffe6a0', emissive: '#ffcf60', emissiveIntensity: 0.8 }), 70, 10.7, -174.5);
    this.circles.push({ x: 70, z: -174.5, r: 1.5 });
  }

  // Unisce le mesh statiche con lo stesso materiale: molte meno draw call su mobile.
  // v0.3 (Teco): i cloni GLB (lampioni, chiome, cespugli, auto parcheggiate) diventano InstancedMesh per parte;
  // i gruppi di primitive (panchine) vengono appiattiti così mergeStatic li unisce per materiale.
  instanceClones() {
    this.group.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.group.matrixWorld).invert();
    const groups = new Map();
    for (const o of [...this.group.children]) {
      if (o.isMesh) continue;
      const meshes = []; o.traverse((m) => { if (m.isMesh && !m.isSkinnedMesh) meshes.push(m); });
      if (!meshes.length) continue;
      if (o.userData.flatten) { for (const m of meshes) { const w = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld); m.removeFromParent(); w.decompose(m.position, m.quaternion, m.scale); this.group.add(m); } this.group.remove(o); continue; }
      const key = meshes.map((m) => m.geometry.uuid + ':' + (Array.isArray(m.material) ? 'multi' : m.material.uuid)).join('|');
      if (key.includes('multi')) continue;
      if (!groups.has(key)) groups.set(key, []); groups.get(key).push({ o, meshes });
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      list[0].meshes.forEach((m0, j) => {
        const im = new THREE.InstancedMesh(m0.geometry, m0.material, list.length);
        list.forEach(({ meshes }, i) => im.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(inv, meshes[j].matrixWorld)));
        im.castShadow = m0.castShadow; im.receiveShadow = m0.receiveShadow; im.computeBoundingSphere(); this.group.add(im);
      });
      for (const { o } of list) this.group.remove(o);
    }
  }

  mergeStatic() {
    const byMat = new Map(); const skip = new Set([this.water, this.barberPole, this.pond, this.net, this.sea]);
    for (const m of [...this.group.children]) {
      if (!m.isMesh || m.isInstancedMesh || skip.has(m) || Array.isArray(m.material)) continue;
      const g = m.geometry; if (!g.attributes.uv || !g.attributes.normal) continue;
      m.updateMatrix(); const gg = (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(m.matrix);
      for (const k of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(k)) gg.deleteAttribute(k);
      gg.clearGroups();
      const key = m.material.uuid + (m.castShadow ? 'c' : 'n');
      if (!byMat.has(key)) byMat.set(key, { mat: m.material, cast: m.castShadow, geos: [] });
      byMat.get(key).geos.push(gg); this.group.remove(m);
    }
    for (const { mat, cast, geos } of byMat.values()) {
      const merged = mergeGeometries(geos, false); if (!merged) continue;
      const mm = new THREE.Mesh(merged, mat); mm.castShadow = cast; mm.receiveShadow = true; mm.matrixAutoUpdate = false; this.group.add(mm);
    }
  }

  buildBounds() {
    const B = 94.5;
    const east = 516;
    this.addBox(-200, -B, -200, 200, 0, 50); this.addBox(east, east + 80, -200, 200, 0, 50);
    this.addBox(-200, 200, -300, -177.4, 0, 50); this.addBox(-200, 200, 74.5, 200, 0, 50);
    // transenne a fine strada
    const mat = new THREE.MeshStandardMaterial({ color: '#d9d4c7', roughness: 0.7 });
    const red = new THREE.MeshStandardMaterial({ color: '#b2322b', roughness: 0.7 });
    const barrier = (x, z, ry, len) => { const b = this.mesh(new THREE.BoxGeometry(len, 0.25, 0.08), red, x, 0.9, z, { ry }); const b2 = this.mesh(new THREE.BoxGeometry(len, 0.08, 0.2), mat, x, 0.12, z, { ry }); };
    barrier(-93.8, 0, Math.PI / 2, 8);
    for (const x of [-48, 48]) barrier(x, 73.8, 0, 6);
    // v0.3 waterfront: parapetto del molo e mare
    const rail = new THREE.MeshStandardMaterial({ color: '#c9c4b6', roughness: 0.6 });
    this.mesh(new THREE.BoxGeometry(190, 0.12, 0.16), rail, 0, 1.08, -177.6, { cast: false });
    this.mesh(new THREE.BoxGeometry(190, 0.5, 0.3), this.mats.stone, 0, 0.37, -177.6);
    for (let x = -93; x <= 93; x += 3) this.mesh(new THREE.BoxGeometry(0.1, 0.8, 0.1), rail, x, 0.6, -177.6, { cast: false });
    this.mesh(new THREE.BoxGeometry(200, 3, 0.5), this.mats.stone, 0, -1.4, -178);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(600, 160), new THREE.MeshStandardMaterial({ color: '#2d5866', roughness: 0.08, metalness: 0.25, envMapIntensity: 1.3 }));
    sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.9, -258); this.group.add(sea); this.sea = sea;
    this.mapShapes.push({ type: 'water', x0: -94, x1: 94, z0: -200, z1: -178 });
  }

  resolve(p, radius, yFeet = 0) { return resolveWorld(this, p, radius, yFeet); }
  rayDistance(origin, dir, maxD) { return rayWorld(this, origin, dir, maxD); }
}
