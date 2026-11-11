import * as THREE from 'three';
// v0.7 — notte senza luci vere (Teco/Forge): un solo uniform condiviso NIGHT (0 = giorno, 1 = notte piena).
// Finestre, lanterne e insegne si accendono con l'emissivo nello shader: nessuna luce in più, nessuna ricompilazione.
export const NIGHT = { value: 0 };
const WARM = 'vec3(1.0, 0.78, 0.5)';
// Finestre istanziate (v0.3): il seme viene dalla posizione dell'istanza, ~35% accese.
export function litInstancedGlass(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = NIGHT;
    sh.vertexShader = 'varying float vSeed;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  vSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
#else
  vSeed = 1.0;
#endif`);
    sh.fragmentShader = 'uniform float uNight;\nvarying float vSeed;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += uNight * step(vSeed, 0.35) * ${WARM} * (0.45 + 0.75 * fract(vSeed * 37.0));`);
  };
  mat.customProgramCacheKey = () => 'vd7litInst';
}
// Finestre dei quartieri v0.4/v0.5 (vertex color): quelle già «calde» di giorno + ~22% delle altre.
// v0.7 (Forge): il seme viene dalla posizione nel mondo (geometria già in coordinate mondo), così non si accendono «a blocchi» per colore.
export function litVertexGlass(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = NIGHT;
    sh.vertexShader = 'varying vec2 vWin;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  { vec4 wp = modelMatrix * vec4(transformed, 1.0); vWin = floor(wp.xz / 1.4 + 0.5) + floor(wp.y / 3.0) * 17.0; }`);
    sh.fragmentShader = 'uniform float uNight;\nvarying vec2 vWin;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  #ifdef USE_COLOR
  float seedW = fract(sin(dot(vWin, vec2(12.9898, 78.233))) * 43758.5453);
  float litW = max(step(0.05, vColor.r - vColor.b), step(seedW, 0.22));
  totalEmissiveRadiance += uNight * litW * ${WARM} * (0.45 + 0.7 * fract(seedW * 37.0));
  #endif`);
  };
  mat.customProgramCacheKey = () => 'vd7litVert';
}
// Lampione leggero: il vertex color chiaro (lanterna) si accende di notte.
export function litLantern(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = NIGHT;
    sh.fragmentShader = 'uniform float uNight;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  #ifdef USE_COLOR
  totalEmissiveRadiance += uNight * step(0.8, vColor.r) * vec3(1.0, 0.81, 0.54) * 2.2;
  #endif`);
  };
  mat.customProgramCacheKey = () => 'vd7lantern';
}
// Pozze di luce a terra sotto i lampioni: una InstancedMesh per tutta la città (1 draw call), additiva.
export function lightPools(points) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,199,122,1)'); gr.addColorStop(0.45, 'rgba(255,186,110,0.45)'); /* #FFC77A (Spark) */ gr.addColorStop(1, 'rgba(255,170,100,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  // v0.7 (Forge): additivo + nebbia = quadrati velati in lontananza; si spengono a mano tra 60 e 140 m
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying float vVD;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vVD = -mvPosition.z;');
    sh.fragmentShader = 'varying float vVD;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', '#include <opaque_fragment>\n  gl_FragColor.a *= 1.0 - smoothstep(60.0, 140.0, vVD);');
  };
  mat.customProgramCacheKey = () => 'vd7pools';
  const geo = new THREE.PlaneGeometry(7, 7).rotateX(-Math.PI / 2);
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, points.length)); const m = new THREE.Matrix4();
  points.forEach(([x, y, z], i) => { m.makeTranslation(x, y, z); im.setMatrixAt(i, m); });
  im.count = points.length; im.computeBoundingSphere(); im.renderOrder = 3; im.visible = false; im.name = 'lightPools';
  return im;
}
// Cielo di notte: stelle (Points) e luna (disco). Seguono la camera, niente nebbia.
export function nightSky() {
  const n = 700, pos = new Float32Array(n * 3); let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) { const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2; const y = 0.08 + Math.abs(u) * 0.92; const r = Math.sqrt(1 - y * y); pos.set([Math.cos(a) * r * 170, y * 170, Math.sin(a) * r * 170], i * 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: '#dfe8ff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  stars.frustumCulled = false; stars.renderOrder = -1; stars.visible = false;
  const moon = new THREE.Mesh(new THREE.CircleGeometry(5, 24), new THREE.MeshBasicMaterial({ color: '#eef2ff', transparent: true, opacity: 0, fog: false, depthWrite: false }));
  moon.visible = false; moon.renderOrder = -1;
  return { stars, moon };
}
