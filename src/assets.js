import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const BASE = import.meta.env.BASE_URL;

export const HOUSE_TYPES = ['a', 'c', 'e', 'g', 'k', 'm', 'p'];
export const BROADLEAF = ['tree_oak', 'tree_default', 'tree_detailed', 'tree_fat'];
export const PINES = ['tree_pineRoundA', 'tree_pineRoundC', 'tree_pineTallA'];
export const PALMS = ['tree_palmTall', 'tree_palmBend', 'tree_palmDetailedTall'];
export const ROCKS = ['rock_largeA', 'rock_largeC', 'rock_largeE', 'rock_tallB', 'stone_largeA'];
export const SMALL_PLANTS = ['plant_bushLarge', 'plant_bush', 'flower_redA', 'flower_yellowA', 'flower_purpleA', 'mushroom_redGroup'];

const TEXTURES = ['grass', 'meadow', 'dirt', 'sand', 'rock', 'snow'];

// Kenney's minty "leafsGreen" clashes with photo textures; pull it toward natural greens.
const LEAF_COLORS = {
  leafsGreen: '#4c8a2e',
  leafsDark: '#2f5e2a',
  leafsFall: '#c7782c',
  grass: '#5d8f2c',
  dirt: '#7d6248',
  stone: '#9a9c9a',
};

function toLambert(m) {
  const color = LEAF_COLORS[m.name] ? new THREE.Color(LEAF_COLORS[m.name]) : m.color;
  const lam = new THREE.MeshLambertMaterial({ color, map: m.map ?? null, name: m.name });
  return lam;
}

function prepare(scene) {
  const cache = new Map();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const swap = (m) => {
      if (!cache.has(m)) cache.set(m, toLambert(m));
      return cache.get(m);
    };
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
  });
  return scene;
}

export async function loadAssets(onProgress) {
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => onProgress?.(loaded / total);
  const gltf = new GLTFLoader(manager);
  const texLoader = new THREE.TextureLoader(manager);

  const glb = (path) => gltf.loadAsync(BASE + path).then((g) => prepare(g.scene));
  const tex = (name) => texLoader.loadAsync(`${BASE}textures/${name}.jpg`).then((t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  });

  const nature = [...BROADLEAF, ...PINES, ...PALMS, ...ROCKS, ...SMALL_PLANTS];
  const [van, houses, natureModels, textures] = await Promise.all([
    glb('models/car/van.glb'),
    Promise.all(HOUSE_TYPES.map((t) => glb(`models/city/building-type-${t}.glb`))),
    Promise.all(nature.map((n) => glb(`models/nature/${n}.glb`))),
    Promise.all(TEXTURES.map(tex)),
  ]);

  return {
    van,
    houses,
    nature: Object.fromEntries(nature.map((n, i) => [n, natureModels[i]])),
    textures: Object.fromEntries(TEXTURES.map((n, i) => [n, textures[i]])),
  };
}

/** Wraps a model so its footprint is centred, its base sits at y=0 and its size matches. */
export function fitModel(model, { height, length, width }) {
  const inner = model.clone();
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner);
  const size = box.getSize(new THREE.Vector3());
  const s = height ? height / size.y : length ? length / size.z : width / size.x;
  const center = box.getCenter(new THREE.Vector3());
  inner.position.set(-center.x, -box.min.y, -center.z);
  const outer = new THREE.Group();
  outer.add(inner);
  outer.scale.setScalar(s);
  return outer;
}

/**
 * Draws many copies of a (multi-mesh) model with one InstancedMesh per part.
 * `transforms` is an array of Matrix4 placing a unit-fitted model in the world.
 */
export function instanceModel(fitted, transforms, { castShadow = true } = {}) {
  const group = new THREE.Group();
  if (!transforms.length) return group;
  fitted.updateMatrixWorld(true);
  const tmp = new THREE.Matrix4();
  fitted.traverse((o) => {
    if (!o.isMesh) return;
    const inst = new THREE.InstancedMesh(o.geometry, o.material, transforms.length);
    transforms.forEach((t, i) => inst.setMatrixAt(i, tmp.multiplyMatrices(t, o.matrixWorld)));
    inst.castShadow = castShadow;
    inst.receiveShadow = true;
    inst.computeBoundingSphere();
    group.add(inst);
  });
  return group;
}
