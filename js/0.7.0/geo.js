// Costruttore geometrico leggero: accumula quad indicizzati in array tipizzati (niente BoxGeometry per pezzo).
// Attributi: position, normal, uv (in metri/tile), color (tinta), tile (indice atlante facciate).
import * as THREE from 'three';

export class GB {
  constructor(opts = {}) { this.p = []; this.n = []; this.uv = []; this.c = []; this.t = []; this.i = []; this.color = !!opts.color; this.tile = !!opts.tile; this.vc = 0; }
  get empty() { return this.i.length === 0; }
  // quad a,b,c,d in senso antiorario visto dal lato della normale; uvs: 4 coppie
  quad(a, b, c, d, nrm, uvs, col = [1, 1, 1], tile = 0) {
    const v = this.vc;
    for (const q of [a, b, c, d]) this.p.push(q[0], q[1], q[2]);
    for (let k = 0; k < 4; k++) this.n.push(nrm[0], nrm[1], nrm[2]);
    for (const u of uvs) this.uv.push(u[0], u[1]);
    if (this.color) for (let k = 0; k < 4; k++) this.c.push(col[0], col[1], col[2]);
    if (this.tile) for (let k = 0; k < 4; k++) this.t.push(tile);
    this.i.push(v, v + 1, v + 2, v, v + 2, v + 3); this.vc += 4;
  }
  tri(a, b, c, nrm, uvs, col = [1, 1, 1], tile = 0) {
    const v = this.vc;
    for (const q of [a, b, c]) this.p.push(q[0], q[1], q[2]);
    for (let k = 0; k < 3; k++) this.n.push(nrm[0], nrm[1], nrm[2]);
    for (const u of uvs) this.uv.push(u[0], u[1]);
    if (this.color) for (let k = 0; k < 3; k++) this.c.push(col[0], col[1], col[2]);
    if (this.tile) for (let k = 0; k < 3; k++) this.t.push(tile);
    this.i.push(v, v + 1, v + 2); this.vc += 3;
  }
  // parallelepipedo allineato agli assi; faces: stringa di facce da emettere tra 'nsewtb' (n=+z, s=-z, e=+x, w=-x, t=top, b=bottom)
  box(x0, x1, y0, y1, z0, z1, { tile = 3, col, faces = 'nsewt', t = 0 } = {}) {
    const T = tile;
    if (faces.includes('t')) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [[x0 / T, -z1 / T], [x1 / T, -z1 / T], [x1 / T, -z0 / T], [x0 / T, -z0 / T]], col, t);
    if (faces.includes('b')) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [[x0 / T, z0 / T], [x1 / T, z0 / T], [x1 / T, z1 / T], [x0 / T, z1 / T]], col, t);
    if (faces.includes('n')) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [[x0 / T, y0 / T], [x1 / T, y0 / T], [x1 / T, y1 / T], [x0 / T, y1 / T]], col, t);
    if (faces.includes('s')) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [[-x1 / T, y0 / T], [-x0 / T, y0 / T], [-x0 / T, y1 / T], [-x1 / T, y1 / T]], col, t);
    if (faces.includes('e')) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [[-z1 / T, y0 / T], [-z0 / T, y0 / T], [-z0 / T, y1 / T], [-z1 / T, y1 / T]], col, t);
    if (faces.includes('w')) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [[z0 / T, y0 / T], [z1 / T, y0 / T], [z1 / T, y1 / T], [z0 / T, y1 / T]], col, t);
  }
  // rettangolo verticale su una faccia: f = {nx,nz} normale, origine (ox,oz) sul piano, u lungo la faccia (verso destra guardando la faccia), off = distanza dal piano
  wallQuad(f, u0, u1, y0, y1, off, { tile = 3, col, t = 0, uvBox = null } = {}) {
    const rx = f.nz, rz = -f.nx; // destra guardando la facciata da fuori
    const P = (u, y) => [f.ox + rx * u + f.nx * off, y, f.oz + rz * u + f.nz * off];
    const uv = uvBox || [[(f.u0 + u0) / tile, y0 / tile], [(f.u0 + u1) / tile, y0 / tile], [(f.u0 + u1) / tile, y1 / tile], [(f.u0 + u0) / tile, y1 / tile]];
    this.quad(P(u0, y0), P(u1, y0), P(u1, y1), P(u0, y1), [f.nx, 0, f.nz], uv, col, t);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.color) g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (this.tile) g.setAttribute('aTile', new THREE.Float32BufferAttribute(this.t, 1));
    g.setIndex(this.vc > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
}
// Facce di un edificio rettangolare: origine all'angolo sinistro visto da fuori, u cresce verso destra.
export function faces(b) {
  return {
    s: { id: 's', nx: 0, nz: -1, ox: b.x1, oz: b.z0, len: b.x1 - b.x0, u0: -b.x1 },
    n: { id: 'n', nx: 0, nz: 1, ox: b.x0, oz: b.z1, len: b.x1 - b.x0, u0: b.x0 },
    e: { id: 'e', nx: 1, nz: 0, ox: b.x1, oz: b.z1, len: b.z1 - b.z0, u0: -b.z1 },
    w: { id: 'w', nx: -1, nz: 0, ox: b.x0, oz: b.z0, len: b.z1 - b.z0, u0: b.z0 },
  };
}
export const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
export function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
