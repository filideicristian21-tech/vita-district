// Geometria pura della v0.4 (niente THREE): area percorribile e punti delle attività.
// La v0.3 resta com'è a ovest di x=97. Il nuovo territorio è a est, collegato da Via del Porto e dal Lungomare.

export const BOUNDS = { minX: -94, maxX: 514, minZ: -176, maxZ: 74 };

const RESERVED = [
  [146, 188, -60, -30], // officina
  [200, 238, -132, -102], // corriere
  [312, 458, -58, 8], // prato dei giardini
  [400, 468, 40, 68], // belvedere
];

function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

function hits(rects, x0, x1, z0, z1, pad = 0) {
  return rects.some(([a, b, c, d]) => x0 < b + pad && x1 > a - pad && z0 < d + pad && z1 > c - pad);
}

export function buildLayout() {
  const r = rng(404);
  const roads = [
    { x0: 97, x1: 508, z0: -4, z1: 4, name: 'Via del Porto' },
    { x0: 97, x1: 508, z0: -172, z1: -164, name: 'Lungomare' },
    { x0: 108, x1: 492, z0: -90, z1: -82, name: 'Via delle Cale' },
    { x0: 156, x1: 164, z0: -172, z1: 68, name: 'Via del Bullone' },
    { x0: 248, x1: 256, z0: -172, z1: 68, name: 'Via Scirocco' },
    { x0: 356, x1: 364, z0: -172, z1: 68, name: 'Via dei Giardini' },
    { x0: 452, x1: 460, z0: -172, z1: 68, name: 'Via del Belvedere' },
  ];
  const land = { x0: 102, x1: 504, z0: -160, z1: 66 };
  const water = [{ x0: 348, x1: 402, z0: -46, z1: -16 }];
  const onRoad = (x0, x1, z0, z1) => roads.some((rd) => x0 < rd.x1 && x1 > rd.x0 && z0 < rd.z1 && z1 > rd.z0);
  const buildings = [];
  const rowX = (xa, xb, zEdge, depth, north) => {
    let x = xa;
    while (x < xb - 8) {
      const w = Math.min(xb - x, 11 + r() * 7);
      const z0 = north ? zEdge : zEdge - depth;
      const z1 = north ? zEdge + depth : zEdge;
      if (!hits(RESERVED, x, x + w, z0, z1, 0.4) && !onRoad(x, x + w, z0, z1)) {
        buildings.push({ x0: x, x1: x + w, z0, z1, h: 6.4 + Math.floor(r() * 3) * 3.2 });
      }
      x += w + (r() < 0.28 ? 3.4 : 0.3);
    }
  };
  const rowZ = (za, zb, xEdge, depth, east) => {
    let z = za;
    while (z < zb - 8) {
      const w = Math.min(zb - z, 11 + r() * 7);
      const x0 = east ? xEdge : xEdge - depth;
      const x1 = east ? xEdge + depth : xEdge;
      if (!hits(RESERVED, x0, x1, z, z + w, 0.4) && !onRoad(x0, x1, z, z + w)) {
        buildings.push({ x0, x1, z0: z, z1: z + w, h: 6.4 + Math.floor(r() * 3) * 3.2 });
      }
      z += w + (r() < 0.28 ? 3.4 : 0.3);
    }
  };
  rowX(110, 500, 8, 12, true);
  rowX(110, 500, -8, 12, false);
  rowX(110, 240, -78, 11, true);
  rowX(110, 300, -94, 11, false);
  rowX(110, 500, -160, 10, true);
  rowZ(-150, -100, 148, 11, false);
  rowZ(-150, -20, 172, 11, true);
  rowZ(-150, 50, 240, 11, false);
  rowZ(12, 60, 248, 11, true);
  rowZ(-150, 20, 348, 10, false);
  rowZ(16, 60, 372, 10, true);
  buildings.push(
    { x0: 152, x1: 180, z0: -56, z1: -34, h: 7.2, special: 'officina' },
    { x0: 206, x1: 230, z0: -126, z1: -106, h: 6.4, special: 'corriere' },
  );
  return {
    roads, land, water, buildings,
    hill: { x0: 404, x1: 464, z0: 42, z1: 66, y: 2.4, ramp0: 30, ramp1: 42 },
    spots: {
      officina: { x: 166, z: -30.5 },
      bay: { x: 166, z: -24, yaw: Math.PI },
      gino: { x: 166, z: -32.2 },
      corriere: { x: 218, z: -104 },
      lia: { x: 218, z: -108.5 },
      bocce: { x: 386, z: -28 },
      ottavio: { x: 392, z: -22 },
      belvedere: { x: 430, z: 54 },
      nadia: { x: 436, z: 50 },
      faroView: { x: 140, z: -158 },
    },
  };
}

function inside(rect, x, z) {
  return x >= rect.x0 && x < rect.x1 && z >= rect.z0 && z < rect.z1;
}

// Metri quadri percorribili del solo ampliamento (strade e isolati nuovi, meno edifici e acqua).
export function measureNewWalkable(layout = buildLayout(), step = 1) {
  const { land, roads, buildings, water } = layout;
  let n = 0;
  for (let x = 97; x < 512; x += step) {
    for (let z = -176; z < 72; z += step) {
      const onLand = inside(land, x, z);
      const onRoad = roads.some((rd) => inside(rd, x, z));
      if (!onLand && !onRoad) continue;
      if (buildings.some((b) => x >= b.x0 && x < b.x1 && z >= b.z0 && z < b.z1)) continue;
      if (water.some((w) => inside(w, x, z))) continue;
      n += step * step;
    }
  }
  return n;
}

// Stessa stima a griglia da 1 m usata per la v0.3 (strade + isolati − impronte, mare escluso).
export function measureV3Walkable(step = 2) {
  const r = rng(42);
  const reserved = [[-45, -12, -103, -80], [-31, 31, -153, -99], [17.4, 30.6, -19, -8], [-33, -20, 39, 56], [20, 34, 39, 56], [-76, -59, 8, 20], [-14, 4, -19, -8], [59, 73, 8, 19], [63, 78, -20, -8], [-80, -64, -19, -8], [-14, 14, 40, 53], [-24, 24, 7, 38]];
  const buildings = [[-76, -59, 8, 20], [-14, 4, -19, -8], [59, 73, 8, 19], [18, 30, -19, -8], [63, 78, -20, -8], [-80, -64, -19, -8], [-14, 14, 40, 53], [-34, -13, -101, -82]];
  const free = (x0, x1, z0, z1) => !reserved.some(([a, b, c, d]) => x0 < b + 0.6 && x1 > a - 0.6 && z0 < d + 0.6 && z1 > c - 0.6);
  const rowX = (xa, xb, z0, depth, north) => {
    let x = xa;
    while (x < xb - 5) {
      const w = Math.min(xb - x, 9 + r() * 8);
      const zz0 = north ? z0 : z0 - depth, zz1 = north ? z0 + depth : z0;
      if (free(x, x + w, zz0, zz1)) buildings.push([x, x + w, zz0, zz1]);
      x += w + (r() < 0.25 ? 3.2 : 0);
    }
  };
  const rowZ = (za, zb, x0, depth, east) => {
    let z = za;
    while (z < zb - 5) {
      const w = Math.min(zb - z, 9 + r() * 8);
      const xx0 = east ? x0 : x0 - depth, xx1 = east ? x0 + depth : x0;
      if (free(xx0, xx1, z, z + w)) buildings.push([xx0, xx1, z, z + w]);
      z += w + (r() < 0.25 ? 3.2 : 0);
    }
  };
  rowX(-93, -54, 8, 11, true); rowX(-42, 42, 8, 11, true); rowX(54, 93, 8, 11, true);
  rowX(-93, -54, -8, 11, false); rowX(-42, 42, -8, 11, false); rowX(54, 93, -8, 11, false);
  rowZ(22, 72, -53.2, 10, false); rowZ(22, 72, -42.8, 10, true); rowZ(22, 72, 42.8, 10, false); rowZ(22, 72, 53.2, 10, true);
  rowZ(-72, -22, -53.2, 10, false); rowZ(-72, -22, -42.8, 10, true); rowZ(-72, -22, 42.8, 10, false); rowZ(-72, -22, 53.2, 10, true);
  rowX(-93, 93, 63, 11, true); rowX(-93, -54, -63, 11, false); rowX(-42, 42, -63, 11, false); rowX(54, 93, -63, 11, false);
  rowZ(-60, 60, -93.5, 0.1, true); rowZ(-60, 60, 93.5, 0.1, false);
  rowZ(-160, -80, -53.2, 10, false); rowZ(-160, -80, 53.2, 10, true);
  rowZ(-160, -80, -42.8, 10, true); rowZ(-160, -80, 42.8, 10, false);
  rowX(-42, 42, -162, 10, true); rowX(-93, -54, -170, 9, true); rowX(54, 93, -170, 9, true);
  rowZ(-165, -66, -93.5, 0.1, true); rowZ(-165, -66, 93.5, 0.1, false);
  const roads = [
    { x0: -96, x1: 96, z0: -4, z1: 4 },
    { x0: -51, x1: -45, z0: -172, z1: 76 },
    { x0: 45, x1: 51, z0: -172, z1: 76 },
    { x0: -51, x1: 51, z0: -172, z1: -164 },
  ];
  const blocks = [[-96, -51, -172, -4], [-45, 45, -164, -4], [51, 96, -172, -4], [-96, -51, 4, 76], [-45, 45, 4, 76], [51, 96, 4, 76], [-96, 96, -178, -172]];
  const scale = step * step;
  let walk = 0;
  for (let x = -94; x <= 94; x += step) for (let z = -190; z <= 74; z += step) {
    if (z < -177.4) continue;
    const road = roads.some((rd) => x > rd.x0 && x < rd.x1 && z > rd.z0 && z < rd.z1);
    const block = blocks.some((b) => x > b[0] && x < b[1] && z > b[2] && z < b[3]);
    const bldg = buildings.some((b) => x > b[0] && x < b[1] && z > b[2] && z < b[3]);
    if ((road || block) && !bldg) walk += scale;
  }
  return walk;
}

export const LAYOUT = buildLayout();

const P = LAYOUT.spots;
export const EXTRA_PLACES = {
  officina: { id: 'officina', name: 'Officina Bullone Felice', short: 'Officina', icon: '🔧', x: P.officina.x, z: P.officina.z, door: { x: P.gino.x, z: P.gino.z }, color: '#8d8a84' },
  corriere: { id: 'corriere', name: 'Rotta Sicura', short: 'Rotta', icon: '📦', x: P.corriere.x, z: P.corriere.z, door: { x: P.lia.x, z: P.lia.z }, color: '#c4a574' },
  bocce: { id: 'bocce', name: 'Bocciofila Il Pallino d\'Oro', short: 'Bocce', icon: '🟢', x: P.bocce.x, z: P.bocce.z, door: { x: P.ottavio.x, z: P.ottavio.z }, color: '#b08968' },
  belvedere: { id: 'belvedere', name: 'Belvedere delle Case', short: 'Belvedere', icon: '📷', x: P.belvedere.x, z: P.belvedere.z, door: { x: P.nadia.x, z: P.nadia.z }, color: '#e6bb70' },
};
