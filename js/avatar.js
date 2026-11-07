// Avatar umano: modello rigged CC0 (Quaternius "Man in Long Sleeves") + capelli e barba
// procedurali a "conchiglie" (shell) adattati alla testa, che crescono con la lunghezza in mm.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const loader = new GLTFLoader();
const cache = new Map();
export function loadGLB(url) {
  if (!cache.has(url)) cache.set(url, new Promise((res, rej) => loader.load(url, res, undefined, rej)));
  return cache.get(url);
}

// Texture di "ciocche": rumore per ciocca, usato con alphaTest per strato.
function strandTexture(size = 256, seed = 7) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d'); const img = ctx.createImageData(size, size);
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < size * size; i++) {
    const v = rnd();
    const shade = 200 + Math.floor(rnd() * 55);
    img.data[i * 4] = shade; img.data[i * 4 + 1] = shade; img.data[i * 4 + 2] = shade;
    img.data[i * 4 + 3] = Math.floor(v * 255);
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false;
  return t;
}
let STRAND_TEX = null;

const HAIR_COLOR = new THREE.Color('#2a1d16');
const SHELLS = 10;

// Maschere direzionali nello spazio-testa normalizzato (x destra, y su, z avanti).
function hairMask(d, lenMm) {
  // attaccatura: alta sulla fronte, bassa sulla nuca; lunghi → scendono di più dietro/lati
  const az = Math.atan2(d.x, d.z);           // 0 = fronte, ±PI = nuca
  const front = Math.cos(az) * 0.5 + 0.5;    // 1 fronte, 0 nuca
  const longExtra = Math.min(lenMm, 200) / 200;
  const limit = THREE.MathUtils.lerp(-0.62 - longExtra * 0.5, 0.6, Math.pow(front, 2.2));
  // orecchie libere ai lati
  const side = Math.abs(d.x);
  const ear = side > 0.8 && d.y < 0.05 && d.y > -0.45 && front > 0.25 && front < 0.75 ? 1 : 0;
  const m = THREE.MathUtils.smoothstep(d.y, limit - 0.06, limit + 0.06);
  return ear && lenMm < 60 ? 0 : m;
}
function beardMask(d, shape) {
  const az = Math.atan2(d.x, d.z); const front = Math.cos(az);
  if (front < 0.05) return 0;
  const mouthUp = -0.40, mouthLow = -0.56;   // fascia della bocca
  const onFrontCenter = Math.abs(d.x) < 0.42;
  let m = 0;
  if (shape === 'full') {
    // guance + mascella + mento, lascia libero zigomo e collo basso
    const cheekTop = THREE.MathUtils.lerp(-0.22, -0.36, THREE.MathUtils.smoothstep(0.45 - Math.abs(d.x), 0, 0.25));
    m = THREE.MathUtils.smoothstep(-d.y, -cheekTop - 0.02, -cheekTop + 0.08);
    if (front < 0.3) m *= THREE.MathUtils.smoothstep(front, 0.05, 0.3);
    if (d.y < -0.92) m *= 0.0;
    // labbra libere
    if (d.y < mouthUp + 0.04 && d.y > mouthLow + 0.06 && Math.abs(d.x) < 0.2 && front > 0.85) m *= 0.0;
  } else if (shape === 'goatee') {
    const chin = d.y < mouthLow + 0.08 && d.y > -0.95 && Math.abs(d.x) < 0.3 && front > 0.7;
    const must = d.y < mouthUp + 0.12 && d.y > mouthUp + 0.03 && Math.abs(d.x) < 0.28 && front > 0.75;
    m = chin || must ? 1 : 0;
  } else if (shape === 'mustache') {
    m = d.y < mouthUp + 0.17 && d.y > mouthUp + 0.07 && Math.abs(d.x) < 0.3 && front > 0.75 ? 1 : 0;
  }
  return onFrontCenter || shape === 'full' ? m : 0;
}

export class Avatar {
  constructor() { this.root = new THREE.Group(); this.mixer = null; this.actions = {}; this.current = null; }

  async load(url, { height = 1.78, isPlayer = false, tint = null, smooth = true } = {}) {
    const smoothed = new Set();
    const gltf = await loadGLB(url);
    const model = SkeletonUtils.clone(gltf.scene);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const s = height / (box.max.y - box.min.y);
    model.scale.setScalar(s);
    model.position.y = -box.min.y * s;
    this.root.add(model);
    this.model = model;
    this.meshes = [];
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
        o.material = o.material.clone();
        if (smooth && /Skin|Shirt|Pants|Suit|Body|Legs|Head|Female|BaseHuman|Casual/.test(o.material.name + o.name) && !smoothed.has(o.geometry.uuid)) {
          // il modello è low-poly a facce piatte: fondo i vertici e ricalcolo normali morbide
          const g = o.geometry.clone(); g.deleteAttribute('normal');
          const m = mergeVertices(g, 1e-4); m.computeVertexNormals(); o.geometry = m; smoothed.add(m.uuid);
        }
        const n = o.material.name;
        o.material.metalness = 0;
        o.material.roughness = /Skin/.test(n) ? 0.62 : /Eye/.test(n) ? 0.3 : 0.88;
        if (tint && tint[n]) o.material.color.set(tint[n]);
        this.meshes.push(o);
      }
      if (o.isBone && o.name === 'Head') this.headBone = o;
    });
    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of gltf.animations) {
      const short = clip.name.split('|').pop().replace(/^(Man|Female)_/, '');
      this.actions[short] = this.mixer.clipAction(clip);
    }
    this.play(this.actions.Idle ? 'Idle' : Object.keys(this.actions)[0]);
    if (isPlayer) this.setupGrooming();
    return this;
  }

  play(name, fade = 0.25) {
    const a = this.actions[name];
    if (!a || this.current === a) return;
    a.reset().fadeIn(fade).play();
    if (this.current) this.current.fadeOut(fade);
    this.current = a;
  }
  update(dt) { this.mixer && this.mixer.update(dt); }

  // ---------- Grooming ----------
  setupGrooming() {
    STRAND_TEX = STRAND_TEX || strandTexture();
    this.root.updateMatrixWorld(true);
    const head = this.headBone;
    const inv = new THREE.Matrix4().copy(head.matrixWorld).invert();
    const pts = [];
    const v = new THREE.Vector3();
    let headIdx = -1;
    for (const m of this.meshes) {
      if (!m.isSkinnedMesh) continue;
      headIdx = m.skeleton.bones.indexOf(head);
      const name = m.material.name;
      if (/Hair/.test(name)) { m.visible = false; continue; } // sostituiti dai capelli procedurali
      if (!/Skin/.test(name)) continue;
      const pos = m.geometry.attributes.position, si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight;
      for (let i = 0; i < pos.count; i++) {
        let w = 0;
        for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === headIdx) w += sw.getComponent(i, k);
        if (w < 0.5) continue;
        v.fromBufferAttribute(pos, i);
        m.applyBoneTransform(i, v);
        v.applyMatrix4(m.matrixWorld).applyMatrix4(inv);
        pts.push(v.clone());
      }
    }
    // centro e semiassi della testa (spazio dell'osso Head)
    const hb = new THREE.Box3().setFromPoints(pts);
    const c = hb.getCenter(new THREE.Vector3());
    const ext = hb.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    // assi: determina quale asse locale punta "su" e "avanti" nel mondo
    const q = new THREE.Quaternion(); head.getWorldQuaternion(q);
    const qi = q.clone().invert();
    const upL = new THREE.Vector3(0, 1, 0).applyQuaternion(qi);
    const fwL = new THREE.Vector3(0, 0, 1).applyQuaternion(qi);
    const rtL = new THREE.Vector3().crossVectors(upL, fwL).normalize();
    // il mento sporge sotto il cranio: il centro sferico va un po' più in alto
    this.headFrame = { c, ext, upL, fwL, rtL, pts };
    // geometria base: sfera, raggio per direzione = shrinkwrap sui vertici della testa
    const geo = new THREE.SphereGeometry(1, 48, 34);
    const P = geo.attributes.position; const n = P.count;
    const dirs = new Float32Array(n * 3), radii = new Float32Array(n), worldDir = [];
    const tmp = new THREE.Vector3(), dl = new THREE.Vector3();
    const rel = pts.map((p) => p.clone().sub(c));
    const relN = rel.map((p) => p.clone().normalize());
    const relL = rel.map((p) => p.length());
    const avgR = (ext.x + ext.y + ext.z) / 3;
    for (let i = 0; i < n; i++) {
      tmp.fromBufferAttribute(P, i).normalize(); // direzione nello spazio "canonico" (x dx, y su, z avanti)
      dl.set(0, 0, 0).addScaledVector(rtL, tmp.x).addScaledVector(upL, tmp.y).addScaledVector(fwL, tmp.z).normalize();
      let best = 0, bestDot = -1, r = 0;
      for (let k = 0; k < relN.length; k++) {
        const dot = relN[k].dot(dl);
        if (dot > 0.985 && relL[k] > r) r = relL[k];
        if (dot > bestDot) { bestDot = dot; best = relL[k]; }
      }
      radii[i] = r > 0 ? r : best || avgR;
      dirs.set([dl.x, dl.y, dl.z], i * 3);
      worldDir.push(tmp.clone());
    }
    // smoothing dei raggi sui vicini (griglia lat/long)
    const W = 49, H = 35;
    for (let it = 0; it < 3; it++) {
      const r2 = radii.slice();
      for (let y = 1; y < H - 1; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, l = y * W + ((x + W - 2) % (W - 1)), rr = y * W + ((x + 1) % (W - 1));
        r2[i] = (radii[i] * 2 + radii[l] + radii[rr] + radii[i - W] + radii[i + W]) / 6;
      }
      radii.set(r2);
    }
    this.groom = { geo, dirs, radii, canon: worldDir, n, avgR };
    this.hairGroup = new THREE.Group(); this.beardGroup = new THREE.Group();
    head.add(this.hairGroup); head.add(this.beardGroup);
    this.hairLayers = this.makeLayers(this.hairGroup, 'hair');
    this.beardLayers = this.makeLayers(this.beardGroup, 'beard');
    // ombra della barba/capelli rasati: strato a contatto, opacità per lunghezza
    this.stubbleHair = this.makeContact(this.hairGroup);
    this.stubbleBeard = this.makeContact(this.beardGroup);
    this._last = '';
  }

  makeLayers(group, kind) {
    const layers = [];
    for (let i = 0; i < SHELLS; i++) {
      const g = new THREE.BufferGeometry();
      g.setIndex(this.groom.geo.index);
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.groom.n * 3), 3));
      g.setAttribute('normal', this.groom.geo.attributes.normal.clone());
      g.setAttribute('uv', this.groom.geo.attributes.uv.clone());
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.groom.n * 4), 4));
      const t = i / (SHELLS - 1);
      const mat = new THREE.MeshStandardMaterial({
        color: HAIR_COLOR.clone().multiplyScalar(0.75 + 0.5 * t), map: STRAND_TEX, vertexColors: true,
        alphaTest: 0.05 + 0.8 * t, roughness: 0.75, metalness: 0, side: THREE.DoubleSide,
      });
      mat.map = STRAND_TEX.clone(); mat.map.needsUpdate = true;
      mat.map.repeat.set(kind === 'hair' ? 26 : 34, kind === 'hair' ? 18 : 24);
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = i === SHELLS - 1; mesh.frustumCulled = false; mesh.renderOrder = 2 + i;
      group.add(mesh); layers.push(mesh);
    }
    return layers;
  }
  makeContact(group) {
    const g = new THREE.BufferGeometry();
    g.setIndex(this.groom.geo.index);
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.groom.n * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.groom.n * 4), 4));
    g.setAttribute('uv', this.groom.geo.attributes.uv.clone());
    const mat = new THREE.MeshStandardMaterial({ color: HAIR_COLOR, vertexColors: true, transparent: true, depthWrite: false,
      roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 1;
    group.add(mesh); return mesh;
  }

  // lengths: {hairMm, beardMm, shape}
  setGrooming(L) {
    if (!this.groom) return;
    const key = `${L.hairMm.toFixed(2)}|${L.beardMm.toFixed(2)}|${L.shape}`;
    if (key === this._last) return; this._last = key;
    const { dirs, radii, canon, n } = this.groom;
    const c = this.headFrame.c; const upL = this.headFrame.upL;
    const scaleMm = this.groom.avgR / 95; // mm → unità locali (testa reale ~95 mm di raggio medio)
    const fill = (layers, contact, maskFn, mm, opts) => {
      const vis = Math.max(0, mm);
      // spessore visivo: cresce con la lunghezza ma si "appiattisce" oltre 30 mm (i capelli lunghi cadono)
      const thick = (Math.min(vis, 30) + Math.max(0, Math.min(vis, 300) - 30) * 0.18) * scaleMm * opts.thick;
      const droop = Math.max(0, vis - opts.droopFrom) * scaleMm * opts.droop;
      const show = vis >= opts.minShell;
      const masks = new Float32Array(n);
      for (let i = 0; i < n; i++) masks[i] = maskFn(canon[i], vis);
      // indice ridotto: solo i triangoli dove ci sono peli (meno triangoli da disegnare)
      const src = this.groom.geo.index.array; const keep = [];
      for (let f = 0; f < src.length; f += 3) if (masks[src[f]] > 0.01 || masks[src[f + 1]] > 0.01 || masks[src[f + 2]] > 0.01) keep.push(src[f], src[f + 1], src[f + 2]);
      const idx = new THREE.BufferAttribute(new Uint16Array(keep), 1);
      layers.forEach((m) => m.geometry.setIndex(idx)); contact.geometry.setIndex(idx);
      layers.forEach((mesh, li) => {
        mesh.visible = show;
        if (!show) return;
        const t = li / (SHELLS - 1);
        const P = mesh.geometry.attributes.position.array, C = mesh.geometry.attributes.color.array;
        for (let i = 0; i < n; i++) {
          const dx = dirs[i * 3], dy = dirs[i * 3 + 1], dz = dirs[i * 3 + 2];
          const r = radii[i] + opts.base * scaleMm + thick * t;
          let x = c.x + dx * r, y = c.y + dy * r, z = c.z + dz * r;
          const cy = canon[i].y;
          const dd = droop * t * t * (cy < 0.5 ? 1 : 0.4);
          x -= upL.x * dd; y -= upL.y * dd; z -= upL.z * dd;
          P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
          const a = masks[i];
          C[i * 4] = C[i * 4 + 1] = C[i * 4 + 2] = 1; C[i * 4 + 3] = a;
        }
        mesh.geometry.attributes.position.needsUpdate = true; mesh.geometry.attributes.color.needsUpdate = true;
        mesh.geometry.computeBoundingSphere();
      });
      // strato a contatto (ombra/rasato): opacità con la lunghezza
      const op = Math.min(1, vis / opts.contactFull);
      contact.visible = op > 0.02;
      const P = contact.geometry.attributes.position.array, C = contact.geometry.attributes.color.array;
      for (let i = 0; i < n; i++) {
        const r = radii[i] + 0.6 * scaleMm;
        P[i * 3] = c.x + dirs[i * 3] * r; P[i * 3 + 1] = c.y + dirs[i * 3 + 1] * r; P[i * 3 + 2] = c.z + dirs[i * 3 + 2] * r;
        C[i * 4] = C[i * 4 + 1] = C[i * 4 + 2] = 1; C[i * 4 + 3] = masks[i] * op * opts.contactAlpha;
      }
      contact.geometry.attributes.position.needsUpdate = true; contact.geometry.attributes.color.needsUpdate = true;
      contact.geometry.computeBoundingSphere();
    };
    fill(this.hairLayers, this.stubbleHair, (d, mm) => hairMask(d, mm), L.hairMm,
      { thick: 0.55, base: 1.5, droop: 0.5, droopFrom: 45, minShell: 4, contactFull: 6, contactAlpha: 0.8 });
    fill(this.beardLayers, this.stubbleBeard, (d) => beardMask(d, L.shape), L.beardMm,
      { thick: 0.7, base: 0.8, droop: 0.6, droopFrom: 15, minShell: 2.5, contactFull: 3, contactAlpha: 0.7 });
  }
}
