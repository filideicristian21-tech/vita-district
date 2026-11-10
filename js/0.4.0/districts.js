// Quartieri v0.4 in gruppi da 48 m: il merge della v0.3 non li assorbe, così il frustum li scarta.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAYOUT } from './layout.js';

const CELL = 48;
const PLASTER = ['#c9bdaa', '#d8c7a6', '#bfa48a', '#cfc9bd', '#b9a28f', '#d6b89a', '#8d8a84', '#6e7270'];

function cellOf(cells, x, z) {
  const ix = Math.floor(x / CELL), iz = Math.floor(z / CELL);
  const id = ix + ',' + iz;
  let g = cells.get(id);
  if (!g) {
    g = new THREE.Group();
    g.name = 'cell-' + id;
    g.userData.bucket = new Map();
    cells.set(id, g);
  }
  return g;
}
function put(group, mesh) {
  const mat = mesh.material;
  const key = (mat.uuid || 'm') + (mesh.castShadow ? 'c' : 'n');
  const b = group.userData.bucket;
  if (!b.has(key)) b.set(key, { mat, cast: mesh.castShadow, geos: [] });
  mesh.updateMatrix();
  const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  g.applyMatrix4(mesh.matrix);
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  b.get(key).geos.push(g);
  mesh.geometry.dispose();
}
function plane(w, d, tile) {
  const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * d / tile);
  return g;
}
function addQuad(group, mat, w, d, x, y, z) {
  const m = new THREE.Mesh(plane(w, d, 4), mat);
  m.position.set(x, y, z); m.receiveShadow = true; m.castShadow = false;
  put(group, m);
}
function addBox(group, mat, w, h, d, x, y, z, cast = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true;
  put(group, m);
}

export function buildDistricts(world) {
  const L = LAYOUT;
  const cells = new Map();
  const M = world.mats;
  const plaster = PLASTER.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.92 }));
  const yard = new THREE.MeshStandardMaterial({ color: '#8a8478', roughness: 0.95 });
  const grass = M.grass;
  const asphalt = M.asphalt;
  const waterMat = new THREE.MeshStandardMaterial({ color: '#3d6b78', roughness: 0.18, metalness: 0.05, transparent: true, opacity: 0.9 });
  for (let x = 96; x < 516; x += CELL) {
    for (let z = -176; z < 72; z += CELL) {
      const cx = x + CELL / 2, cz = z + CELL / 2;
      const onRoad = L.roads.some((rd) => cx > rd.x0 - 8 && cx < rd.x1 + 8 && cz > rd.z0 - 8 && cz < rd.z1 + 8);
      const inPark = cx > 312 && cx < 458 && cz > -58 && cz < 8;
      const mat = onRoad && !inPark ? asphalt : inPark ? grass : M.paving;
      const g = cellOf(cells, cx, cz);
      addQuad(g, mat, CELL, CELL, cx, onRoad ? 0.002 : 0.12, cz);
    }
  }
  for (const rd of L.roads) {
    world.roads.push(rd);
    world.mapShapes.push({ type: 'road', ...rd });
  }
  world.mapShapes.push({ type: 'grass', x0: 312, x1: 458, z0: -58, z1: 8 });
  world.mapShapes.push({ type: 'water', x0: 348, x1: 402, z0: -46, z1: -16 });
  const pond = cellOf(cells, 375, -31);
  addQuad(pond, waterMat, 54, 30, 375, 0.14, -31);
  for (const w of L.water) world.addBox(w.x0, w.x1, w.z0, w.z1, 0, 0.4);

  for (const b of L.buildings) {
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const g = cellOf(cells, cx, cz);
    const mat = b.special === 'officina' ? plaster[7] : b.special === 'corriere' ? plaster[6] : plaster[Math.abs(Math.round(cx + cz)) % 6];
    addBox(g, mat, b.x1 - b.x0, b.h, b.z1 - b.z0, cx, 0.12 + b.h / 2, cz);
    world.addBox(b.x0, b.x1, b.z0, b.z1, 0, b.h);
    const nWin = Math.max(1, Math.floor((b.x1 - b.x0) / 3.2));
    g.userData.wins = g.userData.wins || [];
    for (let i = 0; i < nWin; i++) g.userData.wins.push([b.x0 + ((i + 0.5) * (b.x1 - b.x0)) / nWin, 0.12 + 1.7, b.z0 - 0.06]);
    if (b.special) {
      addBox(g, M.door, 1.0, 2.15, 0.12, cx, 0.12 + 1.08, b.z1 + 0.02, false);
    }
  }

  const hill = L.hill;
  const hg = cellOf(cells, (hill.x0 + hill.x1) / 2, (hill.z0 + hill.z1) / 2);
  addQuad(hg, M.stone, hill.x1 - hill.x0, hill.z1 - hill.ramp0, (hill.x0 + hill.x1) / 2, hill.y, (hill.ramp0 + hill.z1) / 2);
  addBox(hg, M.stone, hill.x1 - hill.x0, hill.y, 0.4, (hill.x0 + hill.x1) / 2, hill.y / 2, hill.ramp0, false);
  world.hill = hill;

  const bocce = cellOf(cells, 386, -28);
  const clay = new THREE.MeshStandardMaterial({ color: '#b08968', roughness: 0.95 });
  addQuad(bocce, clay, 18, 4.2, 386, 0.15, -28);
  world.mapShapes.push({ type: 'piazza', x0: 376, x1: 396, z0: -32, z1: -24 });

  const trunkG = new THREE.CylinderGeometry(0.14, 0.22, 2.4, 6);
  const crownG = new THREE.IcosahedronGeometry(1.3, 0);
  const crownMat = new THREE.MeshStandardMaterial({ color: '#4f6b3a', roughness: 0.95, flatShading: true });
  const trees = [[330, -40], [360, -10], [410, -36], [440, -8], [340, 0], [420, -50], [168, -18], [220, -96], [430, 48]];
  for (const [x, z] of trees) {
    const g = cellOf(cells, x, z);
    const t = new THREE.Mesh(trunkG, M.bark); t.position.set(x, 1.3, z); t.castShadow = true; g.add(t);
    const c = new THREE.Mesh(crownG, crownMat); c.position.set(x, 3.1, z); c.castShadow = true; g.add(c);
    world.circles.push({ x, z, r: 0.35 });
    world.mapShapes.push({ type: 'tree', x, z });
  }

  const winG = new THREE.BoxGeometry(1.05, 1.35, 0.08);
  for (const g of cells.values()) {
    const wins = g.userData.wins || [];
    if (wins.length) {
      const mesh = new THREE.InstancedMesh(winG, M.glass, wins.length);
      wins.forEach((p, i) => { const m4 = new THREE.Matrix4(); m4.setPosition(p[0], p[1], p[2]); mesh.setMatrixAt(i, m4); });
      mesh.castShadow = false; mesh.receiveShadow = true; g.add(mesh);
    }
    for (const { mat, cast, geos } of g.userData.bucket.values()) {
      if (!geos.length) continue;
      const geo = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = cast; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
      g.add(mesh);
    }
    g.userData.bucket = null;
    const box = new THREE.Box3().setFromObject(g);
    if (box.isEmpty()) box.set(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
    g.userData.box = box;
    world.scene.add(g);
  }
  world.v4cells = [...cells.values()];
  world.layout = L;
  return L;
}

export function cullDistricts(world, camera) {
  if (!world.v4cells) return;
  if (!world._fr) { world._fr = new THREE.Frustum(); world._pm = new THREE.Matrix4(); }
  world._pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  world._fr.setFromProjectionMatrix(world._pm);
  for (const g of world.v4cells) g.visible = world._fr.intersectsBox(g.userData.box);
}
