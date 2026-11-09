import * as THREE from 'three';

export const WORLD_SIZE = 900;
export const WATER_LEVEL = 0;

// Deterministic value noise so the island is the same every run.
function hash(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function noise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz);
  const c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

function fbm(x, z) {
  let v = 0, amp = 1, freq = 1, norm = 0;
  for (let i = 0; i < 5; i++) {
    v += noise(x * freq, z * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return v / norm;
}

const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export const LANDMARKS = {
  village: { x: 0, z: 40, name: 'Desa Pelangi' },
  lake: { x: -170, z: 130, name: 'Danau Biru' },
  lighthouse: { x: -250, z: -235, name: 'Mercusuar Tua' },
  peak: { x: 230, z: -200, name: 'Puncak Elang' },
  ruins: { x: 215, z: 215, name: 'Reruntuhan Kuno' },
};

function rawHeight(x, z) {
  // Island falloff: land in the middle, sea at the edges.
  const d = Math.hypot(x, z * 1.08);
  const island = 1 - smooth(270, 400, d);
  let h = (fbm(x * 0.008 + 10, z * 0.008 + 3) - 0.35) * 34;
  h += fbm(x * 0.03, z * 0.03) * 4;
  h = h * island + island * 6 - (1 - island) * 14;

  const p = LANDMARKS.peak;
  const dp = Math.hypot(x - p.x, z - p.z);
  h += 62 * Math.exp(-(dp * dp) / (2 * 70 * 70));

  const l = LANDMARKS.lake;
  const dl = Math.hypot(x - l.x, z - l.z);
  h -= 22 * (1 - smooth(30, 75, dl));
  return h;
}

// Flat pads so buildings and the start area sit nicely.
const FLAT_ZONES = [
  { ...LANDMARKS.village, r: 55, fade: 35, h: 4 },
  { x: LANDMARKS.lake.x + 55, z: LANDMARKS.lake.z - 40, r: 12, fade: 15, h: 1.6 },
  { ...LANDMARKS.lighthouse, r: 16, fade: 20, h: 6 },
  { ...LANDMARKS.ruins, r: 30, fade: 25, h: null },
  { ...LANDMARKS.peak, r: 10, fade: 25, h: null },
];
for (const z of FLAT_ZONES) if (z.h === null) z.h = rawHeight(z.x, z.z);

export function heightAt(x, z) {
  let h = rawHeight(x, z);
  for (const f of FLAT_ZONES) {
    const d = Math.hypot(x - f.x, z - f.z);
    const t = 1 - smooth(f.r, f.r + f.fade, d);
    if (t > 0) h = h + (f.h - h) * t;
  }
  return h;
}

const C = {
  deep: new THREE.Color('#2e5d8a'),
  sand: new THREE.Color('#e3cf8f'),
  grass: new THREE.Color('#6fb24a'),
  grassDark: new THREE.Color('#3f8a3a'),
  dirt: new THREE.Color('#8b6b45'),
  rock: new THREE.Color('#8a8580'),
  snow: new THREE.Color('#f4f7fb'),
};

export function colorAt(x, z, h, out = new THREE.Color()) {
  if (h < 1.2) return out.copy(h < -2 ? C.deep : C.sand);
  if (h < 2.5) return out.copy(C.sand).lerp(C.grass, (h - 1.2) / 1.3);
  if (h > 48) return out.copy(C.rock).lerp(C.snow, Math.min(1, (h - 48) / 6));
  if (h > 32) return out.copy(C.grassDark).lerp(C.rock, (h - 32) / 16);
  const n = noise(x * 0.05, z * 0.05);
  out.copy(C.grass).lerp(C.grassDark, n * 0.8);
  if (n > 0.82) out.lerp(C.dirt, 0.5);
  return out;
}

export function createTerrain() {
  const seg = 240;
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  }
  // Non-indexed so flat shading gets a single colour per face (low-poly look).
  const flat = geo.toNonIndexed();
  const p = flat.attributes.position;
  const colors = new Float32Array(p.count * 3);
  const col = new THREE.Color();
  for (let i = 0; i < p.count; i += 3) {
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
    const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    colorAt(cx, cz, cy, col);
    for (let k = 0; k < 3; k++) col.toArray(colors, (i + k) * 3);
  }
  flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  flat.computeVertexNormals();
  const mesh = new THREE.Mesh(
    flat,
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
  );
  mesh.receiveShadow = true;

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000),
    new THREE.MeshPhongMaterial({
      color: '#3a8fd1', transparent: true, opacity: 0.82, shininess: 90,
    })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_LEVEL;
  return { mesh, water };
}
