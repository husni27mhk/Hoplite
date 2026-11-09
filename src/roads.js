import * as THREE from 'three';

// Dirt roads from the village to every mission location.
export const ROAD_PATHS = [
  [[0, 40], [-30, 62], [-70, 78], [-112, 92]],
  [[0, 40], [-25, 0], [-70, -60], [-130, -120], [-190, -180], [-238, -224]],
  [[0, 40], [40, -10], [100, -60], [150, -110], [190, -160], [222, -193]],
  [[0, 40], [50, 90], [110, 140], [160, 185], [200, 205]],
];

export const ROAD_HALF_WIDTH = 3.2;
const SHOULDER = 9; // distance over which terrain blends back to natural height
const STAMP = 14;

let N = 0, size = 0, cell = 0;
let dist, target;
export const roadSamples = [];

export function initRoads(baseHeight, worldSize, grid = 1024) {
  N = grid;
  size = worldSize;
  cell = size / N;
  dist = new Float32Array(N * N).fill(1e6);
  target = new Float32Array(N * N);

  for (const pts of ROAD_PATHS) {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    const count = Math.ceil(curve.getLength());
    const samples = curve.getSpacedPoints(count).map((p) => ({ x: p.x, z: p.z, h: baseHeight(p.x, p.z) }));
    // Smooth the height profile so the road is drivable instead of following every bump.
    const win = 22;
    const smoothed = samples.map((_, i) => {
      let s = 0, n = 0;
      for (let k = Math.max(0, i - win); k <= Math.min(samples.length - 1, i + win); k++) { s += samples[k].h; n++; }
      return s / n;
    });
    samples.forEach((s, i) => { s.h = Math.max(smoothed[i], 1.4); });
    roadSamples.push(samples);

    const r = Math.ceil(STAMP / cell);
    for (const s of samples) {
      const cx = Math.floor((s.x / size + 0.5) * N), cz = Math.floor((s.z / size + 0.5) * N);
      for (let gz = cz - r; gz <= cz + r; gz++) {
        if (gz < 0 || gz >= N) continue;
        for (let gx = cx - r; gx <= cx + r; gx++) {
          if (gx < 0 || gx >= N) continue;
          const wx = (gx / N - 0.5) * size, wz = (gz / N - 0.5) * size;
          const d = Math.hypot(wx - s.x, wz - s.z);
          const i = gz * N + gx;
          if (d < dist[i]) { dist[i] = d; target[i] = s.h; }
        }
      }
    }
  }
}

function bilinear(arr, x, z) {
  const gx = Math.min(N - 1.001, Math.max(0, (x / size + 0.5) * N));
  const gz = Math.min(N - 1.001, Math.max(0, (z / size + 0.5) * N));
  const ix = Math.floor(gx), iz = Math.floor(gz);
  const fx = gx - ix, fz = gz - iz;
  const i = iz * N + ix;
  const a = arr[i], b = arr[i + 1], c = arr[i + N], d = arr[i + N + 1];
  return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
}

const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export function roadDistance(x, z) {
  return bilinear(dist, x, z);
}

/** Blends natural terrain height towards the smoothed road profile. */
export function applyRoad(x, z, h) {
  const d = bilinear(dist, x, z);
  if (d > ROAD_HALF_WIDTH + SHOULDER) return h;
  const w = 1 - smooth(ROAD_HALF_WIDTH + 1, ROAD_HALF_WIDTH + SHOULDER, d);
  return h + (bilinear(target, x, z) - h) * w;
}

/** 1 on the road surface, fading to 0 at the edge. */
export function roadWeight(x, z) {
  return 1 - smooth(ROAD_HALF_WIDTH - 0.6, ROAD_HALF_WIDTH + 1.2, bilinear(dist, x, z));
}
