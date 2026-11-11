// v0.5: Ponente (ovest, con spiaggia e pineta) e Colle dei Limoni (nord). Geometria pura, niente THREE.
// Coordinate in metri: x est, +z nord. La spiaggia scende verso il mare a sud di z=-166.
import { LAYOUT as EAST, BOUNDS } from './layout.js';

function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
const hits = (rects, x0, x1, z0, z1, pad = 0) => rects.some(([a, b, c, d]) => x0 < b + pad && x1 > a - pad && z0 < d + pad && z1 > c - pad);
const inside = (r, x, z) => x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1;

export const ROADS5 = [
  { x0: -250, x1: -96, z0: -4, z1: 4, name: 'Via del Porto' },
  { x0: -104, x1: -96, z0: -146, z1: 130, name: 'Via della Salina' },
  { x0: -176, x1: -168, z0: -146, z1: 176, name: 'Via dei Pini' },
  { x0: -250, x1: -96, z0: -146, z1: -138, name: 'Lungomare di Ponente' },
  { x0: -250, x1: 268, z0: 78, z1: 86, name: 'Via delle Vele' },
  { x0: -250, x1: 268, z0: 122, z1: 130, name: 'Via dei Limoni' },
  { x0: -250, x1: 164, z0: 168, z1: 176, name: 'Viale del Colle' },
  { x0: -51, x1: -45, z0: 74, z1: 176, name: 'Via delle Reti' },
  { x0: 45, x1: 51, z0: 74, z1: 176, name: 'Via dei Fanali' },
  { x0: 156, x1: 164, z0: 66, z1: 176, name: 'Via del Bullone' },
  { x0: 248, x1: 256, z0: 66, z1: 130, name: 'Via Scirocco' },
];
// Terreno a livello marciapiede (y 0.12), sabbia, prati, piazze.
export const LAND5 = [
  { x0: -250, x1: -96, z0: -150, z1: 134 },   // Ponente
  { x0: -250, x1: 268, z0: 66, z1: 134 },     // Colle, fascia sud
  { x0: -250, x1: 168, z0: 134, z1: 178 },    // Colle, fascia nord
];
export const SAND5 = [{ x0: -250, x1: -96, z0: -182, z1: -150 }];
export const BEACH = { x0: -250, x1: -96, z0: -182, z1: -150, flat: -166, edge: -178, low: -0.75 };
export const PINETA = { x0: -232, x1: -194, z0: 18, z1: 114 };
export const PIAZZA_LIMONI = { x0: -38, x1: 38, z0: 134, z1: 164 };
export const LAVAGGIO = { x0: 104, x1: 130, z0: 134, z1: 152, bay: { x: 112, z: 141, yaw: 0 } };
export const KIOSK = { x0: -144, x1: -136, z0: -158, z1: -153 };
export const GRASS5 = [PINETA];
export const PLAZAS5 = [PIAZZA_LIMONI];

// Zone libere da edifici (parco, piazza, autolavaggio, chiosco) + bordo v0.3 a nord.
const RESERVED5 = [
  [PINETA.x0 - 1, PINETA.x1 + 1, PINETA.z0 - 1, PINETA.z1 + 1],
  [PIAZZA_LIMONI.x0 - 1, PIAZZA_LIMONI.x1 + 1, PIAZZA_LIMONI.z0 - 1, PIAZZA_LIMONI.z1 + 2],
  [LAVAGGIO.x0 - 1, LAVAGGIO.x1 + 1, LAVAGGIO.z0 - 2, LAVAGGIO.z1 + 1],
  [-96, 97, 60, 78],      // retro del rione v0.3 (fondali a z 63..74) e marciapiede di Via delle Vele
  [97, 268, 60, 74.5],    // retro dei quartieri est
];
const walls = (x0, x1, z0, z1) => ({ x0, x1, z0, z1 });
// Recinto del mondo v0.5 (alto 50 m). Il mare: a sud del molo (v0.3/est) e oltre la battigia (ovest).
export const WALLS5 = [
  walls(-400, -250, -400, 400),
  walls(516, 700, -400, 400),
  walls(-400, 168, 178, 400),
  walls(168, 700, 134, 400),
  walls(268, 700, 72.5, 400),
  walls(-400, -96, -400, -178),
  walls(-96, 700, -400, -177.4),
];

export function buildLayout5() {
  const r = rng(505);
  const roads = ROADS5;
  const onRoad = (x0, x1, z0, z1) => roads.some((rd) => x0 < rd.x1 + 1 && x1 > rd.x0 - 1 && z0 < rd.z1 + 1 && z1 > rd.z0 - 1);
  const inLand = (x0, x1, z0, z1) => LAND5.some((l) => x0 >= l.x0 - 0.01 && x1 <= l.x1 + 0.01 && z0 >= l.z0 - 0.01 && z1 <= l.z1 + 0.01);
  const buildings = [];
  const add = (b) => {
    if (hits(RESERVED5, b.x0, b.x1, b.z0, b.z1, 0.4) || onRoad(b.x0, b.x1, b.z0, b.z1) || !inLand(b.x0, b.x1, b.z0, b.z1)) return;
    if (buildings.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.z0 < o.z1 && b.z1 > o.z0)) return;
    buildings.push(b);
  };
  const H = () => 6.4 + Math.floor(r() * 4) * 3.2;
  const rowX = (xa, xb, zEdge, depth, north) => {
    let x = xa;
    while (x < xb - 8) {
      const w = Math.min(xb - x, 10 + r() * 8);
      const z0 = north ? zEdge : zEdge - depth, z1 = north ? zEdge + depth : zEdge;
      add({ x0: x, x1: x + w, z0, z1, h: H(), front: north ? 's' : 'n', shop: r() < 0.4 });
      x += w + (r() < 0.25 ? 3.6 : 0.2);
    }
  };
  const rowZ = (za, zb, xEdge, depth, east) => {
    let z = za;
    while (z < zb - 8) {
      const w = Math.min(zb - z, 10 + r() * 8);
      const x0 = east ? xEdge : xEdge - depth, x1 = east ? xEdge + depth : xEdge;
      add({ x0, x1, z0: z, z1: z + w, h: H(), front: east ? 'w' : 'e', shop: r() < 0.3 });
      z += w + (r() < 0.25 ? 3.6 : 0.2);
    }
  };
  // --- Ponente ---
  rowX(-246, -106, 8, 12, true); rowX(-246, -106, -8, 12, false);
  rowX(-246, -106, -134, 11, true);
  rowZ(-132, -10, -180, 11, false); rowZ(10, 116, -180, 11, false);
  rowZ(-132, -10, -164, 11, true); rowZ(10, 116, -164, 11, true);
  rowZ(-132, -10, -108, 11, false); rowZ(10, 116, -108, 11, false);
  rowX(-160, -112, -16, 11, false); rowX(-160, -112, 20, 11, true);
  rowZ(-120, -20, -246, 10, true);
  // --- Colle dei Limoni ---
  rowX(-246, 264, 90, 11, true); rowX(-246, 264, 118, 11, false);
  rowX(-246, 160, 134, 11, true); rowX(-246, 160, 164, 11, false);
  rowZ(134, 164, -55, 10, false); rowZ(134, 164, -41, 10, true); rowZ(134, 164, 41, 10, false); rowZ(134, 164, 55, 10, true);
  rowZ(134, 164, 152, 10, false);
  rowZ(134, 164, -180, 10, false); rowZ(134, 164, -164, 10, true);
  // fondali fuori dal recinto: la città continua oltre i muri (solo vista, senza collisione)
  const backdrop = [];
  const rb = rng(77);
  for (let x = -248; x < 166; x += 12 + rb() * 6) backdrop.push({ x0: x, x1: x + 11, z0: 181, z1: 192, h: 9.6 + Math.floor(rb() * 3) * 3.2, front: 's', backdrop: true });
  for (let z = -140; z < 176; z += 12 + rb() * 6) backdrop.push({ x0: -264, x1: -253, z0: z, z1: z + 11, h: 9.6 + Math.floor(rb() * 3) * 3.2, front: 'e', backdrop: true });
  buildings.push(
    { x0: KIOSK.x0, x1: KIOSK.x1, z0: KIOSK.z0, z1: KIOSK.z1, h: 3.4, special: 'kiosk', front: 's', flat: true },
    { x0: LAVAGGIO.x0 + 16, x1: LAVAGGIO.x1, z0: LAVAGGIO.z0 + 10, z1: LAVAGGIO.z1, h: 4.2, special: 'lavaggio', front: 'w', flat: true },
  );
  const spots = {
    pina: { x: -196, z: -160.6 },
    tower: { x: -196, z: -163.5 },
    kiosk: { x: -140, z: -159.6 },
    spiaggia: { x: -170, z: -166 },
    limoni: { x: 0, z: 149 },
    lavaggio: { x: LAVAGGIO.bay.x, z: LAVAGGIO.bay.z },
    dario: { x: 125.5, z: 136.2 },
    pineta: { x: -213, z: 66 },
  };
  // Conchiglie: 8 punti sulla sabbia asciutta; ogni giorno se ne usano 5.
  const shells = [[-238, -170], [-221, -174], [-205, -168], [-182, -175], [-158, -171], [-131, -175], [-116, -169], [-104, -173]].map(([x, z], i) => ({ id: i, x, z }));
  return { roads, land: LAND5, sand: SAND5, grass: GRASS5, plazas: PLAZAS5, water: [], buildings, backdrop, spots, shells };
}

export const LAYOUT5 = buildLayout5();

// v0.5: i quartieri a est della v0.4 erano radi (isolati quasi vuoti). Qui si chiudono i fronti strada
// con case a schiera, lasciando liberi parco, bocce, Officina, Corriere, Belvedere, laghetto e porte del Corriere.
export const NOFILL_EAST = [
  { x0: 296, x1: 452, z0: -82, z1: -4 }, { x0: 396, x1: 470, z0: 24, z1: 70 }, { x0: 118, x1: 162, z0: -166, z1: -138 },
  { x0: 146, x1: 186, z0: -36, z1: -10 }, { x0: 196, x1: 240, z0: -114, z1: -92 },
];
const GATES_EAST = [[252, -86], [360, 0], [430, 36], [166, -24], [218, -104]];
export function fillEast(E = EAST) {
  const r = rng(909); const out = [];
  const xs = [[102, 156], [164, 248], [256, 356], [364, 452], [460, 504]];
  const zs = [[-164, -90], [-82, -4], [4, 66]];
  const ok = (b) => {
    if (b.x0 < 102 || b.x1 > 506 || b.z1 > 66) return false;
    if (NOFILL_EAST.some((q) => b.x0 < q.x1 && b.x1 > q.x0 && b.z0 < q.z1 && b.z1 > q.z0)) return false;
    if (E.water.some((w) => b.x0 < w.x1 + 4 && b.x1 > w.x0 - 4 && b.z0 < w.z1 + 4 && b.z1 > w.z0 - 4)) return false;
    if (E.roads.some((w) => b.x0 < w.x1 + 3 && b.x1 > w.x0 - 3 && b.z0 < w.z1 + 3 && b.z1 > w.z0 - 3)) return false;
    if ([...E.buildings, ...out].some((o) => b.x0 < o.x1 + 1.2 && b.x1 > o.x0 - 1.2 && b.z0 < o.z1 + 1.2 && b.z1 > o.z0 - 1.2)) return false;
    if (GATES_EAST.some(([x, z]) => x > b.x0 - 10 && x < b.x1 + 10 && z > b.z0 - 10 && z < b.z1 + 10)) return false;
    return true;
  };
  const H = () => 6.4 + Math.floor(r() * 3) * 3.2;
  for (const [ax, bx] of xs) for (const [az, bz] of zs) {
    const ix0 = ax + 3.2, ix1 = bx - 3.2, iz0 = az + 3.2, iz1 = bz - 3.2;
    const d = 10 + Math.floor(r() * 3);
    for (const north of [false, true]) {
      let x = ix0;
      while (x < ix1 - 8) {
        const w = Math.min(ix1 - x, 9 + r() * 7);
        const b = north ? { x0: x, x1: x + w, z0: iz1 - d, z1: iz1, front: 'n' } : { x0: x, x1: x + w, z0: iz0, z1: iz0 + d, front: 's' };
        Object.assign(b, { h: H(), shop: !north && az === 4 ? r() < 0.5 : r() < 0.15, dist: 'est', fill: true });
        if (ok(b)) { out.push(b); x += w + (r() < 0.2 ? 3.6 : 0.2); } else x += 4;
      }
    }
    for (const east of [false, true]) {
      let z = iz0 + d + 1.2;
      while (z < iz1 - d - 1.2 - 8) {
        const w = Math.min(iz1 - d - 1.2 - z, 9 + r() * 7);
        const b = east ? { x0: ix1 - d, x1: ix1, z0: z, z1: z + w, front: 'e' } : { x0: ix0, x1: ix0 + d, z0: z, z1: z + w, front: 'w' };
        Object.assign(b, { h: H(), shop: false, dist: 'est', fill: true });
        if (ok(b)) { out.push(b); z += w + (r() < 0.2 ? 3.6 : 0.2); } else z += 4;
      }
    }
  }
  return out;
}
export const FILL_EAST = fillEast();

// Area percorribile del solo ampliamento v0.5 (stessa regola della v0.4: terra o strada, meno impronte e acqua).
export function measureV5Walkable(layout = LAYOUT5, step = 1) {
  let n = 0;
  const all = [...layout.land, ...layout.sand];
  const solid = layout.buildings.filter((b) => !b.backdrop);
  for (let x = -250 + step / 2; x < 268; x += step) {
    for (let z = -182 + step / 2; z < 178; z += step) {
      if (x >= -96 && z < 74) continue;                        // territorio v0.3 / v0.4 già contato
      if (x >= 97 && z < 66) continue;
      const onGround = all.some((r) => inside(r, x, z)) || layout.roads.some((r) => inside(r, x, z));
      if (!onGround) continue;
      if (layout.sand.some((r) => inside(r, x, z)) && z < BEACH.edge) continue; // oltre la battigia
      if (solid.some((b) => inside(b, x, z))) continue;
      n += step * step;
    }
  }
  return n;
}

const P = LAYOUT5.spots;
export const PLACES5 = {
  spiaggia: { id: 'spiaggia', name: 'Spiaggia di Ponente', short: 'Spiaggia', icon: '🏖', x: P.spiaggia.x, z: P.spiaggia.z, door: { x: P.spiaggia.x, z: P.spiaggia.z }, color: '#e8d3a0' },
  lido: { id: 'lido', name: 'Lido Conchiglia · Pina', short: 'Lido', icon: '🐚', x: P.pina.x, z: P.pina.z, door: { x: P.pina.x, z: P.pina.z }, color: '#f0a070' },
  chiosco: { id: 'chiosco', name: 'Chiosco Onda', short: 'Chiosco', icon: '🍧', x: P.kiosk.x, z: P.kiosk.z, door: { x: P.kiosk.x, z: P.kiosk.z }, color: '#7fc8d0' },
  pineta: { id: 'pineta', name: 'Pineta di Ponente', short: 'Pineta', icon: '🌲', x: P.pineta.x, z: P.pineta.z, door: { x: P.pineta.x, z: P.pineta.z }, color: '#6f9a58' },
  limoni: { id: 'limoni', name: 'Piazza dei Limoni', short: 'Limoni', icon: '🍋', x: P.limoni.x, z: P.limoni.z, door: { x: P.limoni.x, z: P.limoni.z - 12 }, color: '#e8d860' },
  lavaggio: { id: 'lavaggio', name: 'Autolavaggio Schiuma', short: 'Lavaggio', icon: '🧽', x: P.lavaggio.x, z: P.lavaggio.z, door: { x: P.lavaggio.x, z: P.lavaggio.z }, color: '#8ec5e8' },
};
export { EAST, BOUNDS, inside };
