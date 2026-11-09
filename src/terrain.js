import * as THREE from 'three';
import { initRoads, applyRoad, roadDistance, ROAD_HALF_WIDTH } from './roads.js';

export const WORLD_SIZE = 900;
export const WATER_LEVEL = 0;

// Deterministic value noise so the island is the same every run.
function hash(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function noise(x, z) {
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

function baseHeight(x, z) {
  let h = rawHeight(x, z);
  for (const f of FLAT_ZONES) {
    const d = Math.hypot(x - f.x, z - f.z);
    const t = 1 - smooth(f.r, f.r + f.fade, d);
    if (t > 0) h = h + (f.h - h) * t;
  }
  return h;
}

initRoads(baseHeight, WORLD_SIZE);

export function heightAt(x, z) {
  return applyRoad(x, z, baseHeight(x, z));
}

const PLAZA_R = 16;

/** Surface weights: sand, road dirt, rock, snow (grass is whatever remains). */
export function surfaceAt(x, z, h, slope) {
  const sand = 1 - smooth(1.4, 2.8, h);
  const v = LANDMARKS.village;
  const plaza = 1 - smooth(PLAZA_R - 3, PLAZA_R, Math.hypot(x - v.x, z - v.z));
  const road = Math.max(plaza, 1 - smooth(ROAD_HALF_WIDTH - 0.8, ROAD_HALF_WIDTH + 1.2, roadDistance(x, z)));
  const rock = Math.max(smooth(0.5, 0.85, slope), smooth(34, 46, h) * (0.6 + 0.4 * noise(x * 0.1, z * 0.1)));
  const snow = smooth(49, 55, h + noise(x * 0.2, z * 0.2) * 3);
  return { sand, road, rock, snow };
}

// Minimap colours approximating the textured ground.
const C = {
  deep: new THREE.Color('#2b6ca3'),
  shallow: new THREE.Color('#3a8fd1'),
  sand: new THREE.Color('#c9b48a'),
  grass: new THREE.Color('#5e8a2e'),
  road: new THREE.Color('#a07850'),
  rock: new THREE.Color('#6d6a66'),
  snow: new THREE.Color('#eef2f6'),
};

export function colorAt(x, z, h, out = new THREE.Color()) {
  if (h < 0) return out.copy(h < -3 ? C.deep : C.shallow);
  const slope = Math.hypot(heightAt(x + 1, z) - heightAt(x - 1, z), heightAt(x, z + 1) - heightAt(x, z - 1)) / 2;
  const s = surfaceAt(x, z, h, slope);
  out.copy(C.grass).lerp(C.sand, s.sand).lerp(C.rock, s.rock).lerp(C.snow, s.snow).lerp(C.road, s.road);
  return out;
}

function buildSplatMap(res) {
  // Height grid with one extra row/column so slopes can be taken from neighbours.
  const g = res + 1;
  const hs = new Float32Array(g * g);
  const step = WORLD_SIZE / res;
  for (let j = 0; j < g; j++) {
    for (let i = 0; i < g; i++) {
      hs[j * g + i] = heightAt(-WORLD_SIZE / 2 + i * step, -WORLD_SIZE / 2 + j * step);
    }
  }
  const data = new Uint8Array(res * res * 4);
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const h00 = hs[j * g + i], h10 = hs[j * g + i + 1], h01 = hs[(j + 1) * g + i], h11 = hs[(j + 1) * g + i + 1];
      const h = (h00 + h10 + h01 + h11) / 4;
      const slope = Math.hypot((h10 - h00 + h11 - h01) / 2, (h01 - h00 + h11 - h10) / 2) / step;
      const x = -WORLD_SIZE / 2 + (i + 0.5) * step, z = -WORLD_SIZE / 2 + (j + 0.5) * step;
      const s = surfaceAt(x, z, h, slope);
      const k = (j * res + i) * 4;
      data[k] = s.sand * 255;
      data[k + 1] = s.road * 255;
      data[k + 2] = s.rock * 255;
      data[k + 3] = s.snow * 255;
    }
  }
  const tex = new THREE.DataTexture(data, res, res, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export function createTerrain(textures) {
  const seg = 360;
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const gridN = seg + 1;
  const heights = new Float32Array(pos.count);
  const meadow = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    heights[i] = h;
    meadow[i] = smooth(0.45, 0.75, noise(x * 0.025 + 7, z * 0.025 - 3));
  }
  geo.setAttribute('aMeadow', new THREE.BufferAttribute(meadow, 1));
  geo.computeVertexNormals();

  const heightTex = new THREE.DataTexture(heights, gridN, gridN, THREE.RedFormat, THREE.FloatType);
  heightTex.needsUpdate = true;
  const splatTex = buildSplatMap(512);

  const mat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      tGrass: { value: textures.grass },
      tMeadow: { value: textures.meadow },
      tDirt: { value: textures.dirt },
      tSand: { value: textures.sand },
      tRock: { value: textures.rock },
      tSnow: { value: textures.snow },
      tSplat: { value: splatTex },
      uWorld: { value: WORLD_SIZE },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aMeadow;\nvarying float vMeadow;\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMeadow = aMeadow;\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D tGrass, tMeadow, tDirt, tSand, tRock, tSnow, tSplat;
uniform float uWorld;
varying float vMeadow;
varying vec3 vWPos;
// Two scales per texture hide tiling repetition.
vec3 tex2(sampler2D t, vec2 p, float s) {
  return mix(texture2D(t, p * s).rgb, texture2D(t, p * s * 0.27 + 0.13).rgb, 0.4);
}`)
      .replace('#include <map_fragment>', `
vec4 sp = texture2D(tSplat, vWPos.xz / uWorld + 0.5);
vec2 p = vWPos.xz;
vec3 grass = mix(tex2(tGrass, p, 0.16), tex2(tMeadow, p, 0.11), vMeadow * 0.7) * 1.15;
vec3 col = grass;
col = mix(col, tex2(tSand, p, 0.12), sp.r);
col = mix(col, tex2(tRock, p, 0.08), sp.b);
col = mix(col, tex2(tSnow, p, 0.1) * 1.1, sp.a);
col = mix(col, tex2(tDirt, p, 0.2), sp.g);
diffuseColor.rgb *= col;`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000),
    new THREE.MeshPhongMaterial({ color: '#2f88c9', transparent: true, opacity: 0.8, shininess: 90 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_LEVEL;

  return { mesh, water, heightTex, splatTex, gridN };
}
