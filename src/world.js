import * as THREE from 'three';
import { heightAt, LANDMARKS, WATER_LEVEL } from './terrain.js';
import { roadDistance } from './roads.js';
import { fitModel, instanceModel, BROADLEAF, PINES, PALMS, ROCKS, SMALL_PLANTS } from './assets.js';

const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Seeded RNG keeps prop placement stable between sessions.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

let ASSETS = null;

// Kenney City Kit Suburban houses (CC0).
function house(type, width = 11) {
  return fitModel(ASSETS.houses[type % ASSETS.houses.length], { width });
}

function buildVillage(colliders) {
  const g = new THREE.Group();
  const { x, z } = LANDMARKS.village;
  const y = heightAt(x, z);
  const spots = [
    [-30, -12, 0], [-30, 16, 1], [30, -14, 2], [32, 16, 3],
    [-8, -34, 4], [14, -34, 5], [-28, 40, 6],
  ];
  for (const [dx, dz, type] of spots) {
    const h = house(type);
    h.position.set(x + dx, y, z + dz);
    // Kenney buildings face +Z; turn each front door toward the plaza.
    h.rotation.y = Math.atan2(-dx, -dz);
    g.add(h);
    colliders.push({ x: x + dx, z: z + dz, r: 5.2 });
  }
  // Gas station
  const gas = new THREE.Group();
  gas.add(mesh(new THREE.BoxGeometry(10, 0.4, 6), lambert('#e74c3c'), 0, 5, 0));
  for (const px of [-4.5, 4.5]) gas.add(mesh(new THREE.CylinderGeometry(0.25, 0.25, 5), lambert('#ecf0f1'), px, 2.5, 0));
  gas.add(mesh(new THREE.BoxGeometry(1, 2, 0.8), lambert('#f1c40f'), 0, 1, 0));
  gas.position.set(x + 8, y, z + 30);
  g.add(gas);
  colliders.push({ x: x + 8, z: z + 30, r: 0.9 });
  // Well in the middle
  g.add(mesh(new THREE.CylinderGeometry(1.5, 1.5, 1.2, 12), lambert('#95a5a6'), x, y + 0.6, z));
  colliders.push({ x, z, r: 1.6 });
  return { group: g, gas: { x: x + 8, z: z + 30 } };
}

function buildLakeDock() {
  const g = new THREE.Group();
  const { x, z } = LANDMARKS.lake;
  const bx = x + 55, bz = z - 40;
  const y = heightAt(bx, bz);
  const hut = house(3, 8);
  hut.position.set(bx + 7, y, bz + 6);
  hut.rotation.y = -Math.PI * 0.75;
  g.add(hut);
  const dock = mesh(new THREE.BoxGeometry(3, 0.3, 18), lambert('#8d6e63'), bx - 9, WATER_LEVEL + 0.6, bz + 9);
  dock.rotation.y = Math.PI / 4;
  g.add(dock);
  const boat = mesh(new THREE.BoxGeometry(2, 0.7, 4.5), lambert('#e74c3c'), bx - 15, WATER_LEVEL + 0.2, bz + 10);
  boat.rotation.y = 0.6;
  g.add(boat);
  return g;
}

function buildLighthouse(colliders) {
  const g = new THREE.Group();
  const { x, z } = LANDMARKS.lighthouse;
  const y = heightAt(x, z);
  for (let i = 0; i < 6; i++) {
    const r0 = 3 - i * 0.25, r1 = 3 - (i + 1) * 0.25;
    g.add(mesh(new THREE.CylinderGeometry(r1, r0, 3.5, 16), lambert(i % 2 ? '#ffffff' : '#d62828'), x, y + 1.75 + i * 3.5, z));
  }
  const top = y + 21;
  g.add(mesh(new THREE.CylinderGeometry(1.8, 1.8, 2.4, 12), lambert('#fff59d', { emissive: '#ffd54f', emissiveIntensity: 0.6 }), x, top + 1.2, z));
  g.add(mesh(new THREE.ConeGeometry(2.3, 2.2, 12), lambert('#222'), x, top + 3.5, z));
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(4, 60, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: '#fff7c2', transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide })
  );
  beam.geometry.translate(0, -30, 0);
  beam.rotation.z = Math.PI / 2;
  const pivot = new THREE.Group();
  pivot.position.set(x, top + 1.2, z);
  pivot.add(beam);
  g.add(pivot);
  colliders.push({ x, z, r: 3.2 });
  return { group: g, pivot };
}

function buildPeakFlag() {
  const g = new THREE.Group();
  const { x, z } = LANDMARKS.peak;
  const y = heightAt(x, z);
  g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 8), lambert('#ddd'), x, y + 4, z));
  const flag = mesh(new THREE.PlaneGeometry(3, 2), lambert('#e63946', { side: THREE.DoubleSide }), x + 1.5, y + 7, z);
  g.add(flag);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const sx = x + Math.cos(a) * 6, sz = z + Math.sin(a) * 6;
    g.add(mesh(new THREE.DodecahedronGeometry(0.6), lambert('#777'), sx, heightAt(sx, sz) + 0.3, sz));
  }
  return { group: g, flag };
}

function buildRuins(colliders) {
  const g = new THREE.Group();
  const { x, z } = LANDMARKS.ruins;
  const stone = lambert('#cdbf9b');
  const y = heightAt(x, z);
  g.add(mesh(new THREE.BoxGeometry(20, 1, 20), stone, x, y - 0.3, z));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const cx = x + Math.cos(a) * 14, cz = z + Math.sin(a) * 14;
    const broken = i % 3 === 1;
    const h = broken ? 3 + (i % 2) * 2 : 9;
    g.add(mesh(new THREE.CylinderGeometry(0.9, 1, h, 10), stone, cx, heightAt(cx, cz) + h / 2, cz));
    colliders.push({ x: cx, z: cz, r: 1.1 });
  }
  const statue = mesh(new THREE.OctahedronGeometry(2.2), lambert('#48cae4', { emissive: '#0096c7', emissiveIntensity: 0.5 }), x, y + 4.5, z);
  g.add(statue);
  g.add(mesh(new THREE.CylinderGeometry(1.5, 2, 2, 8), stone, x, y + 1, z));
  colliders.push({ x, z, r: 2 });
  return { group: g, statue };
}

function scatterNature(colliders, avoid) {
  const rand = rng(1337);
  const N = ASSETS.nature;
  const tooClose = (x, z, pad = 0) => avoid.some(a => Math.hypot(x - a.x, z - a.z) < a.r + pad);
  const offRoad = (x, z, min) => roadDistance(x, z) > min;
  // model name -> list of world matrices
  const buckets = new Map();
  const add = (name, x, y, z, scale, rotY) => {
    if (!buckets.has(name)) buckets.set(name, []);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0));
    buckets.get(name).push(new THREE.Matrix4().compose(new THREE.Vector3(x, y - 0.05, z), q, new THREE.Vector3(scale, scale, scale)));
  };
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  // Trees: broadleaf in the lowlands, pines higher up.
  let trees = 0;
  for (let i = 0; i < 6000 && trees < 700; i++) {
    const x = (rand() - 0.5) * 760, z = (rand() - 0.5) * 760;
    const h = heightAt(x, z);
    if (h < 2.8 || h > 42 || tooClose(x, z) || !offRoad(x, z, 7)) continue;
    const pine = h > 17 + rand() * 6;
    add(pick(pine ? PINES : BROADLEAF), x, h, z, (pine ? 8 : 6.5) + rand() * 4, rand() * Math.PI * 2);
    colliders.push({ x, z, r: 0.8 });
    trees++;
  }
  // Palms along the beach.
  let palms = 0;
  for (let i = 0; i < 4000 && palms < 90; i++) {
    const x = (rand() - 0.5) * 820, z = (rand() - 0.5) * 820;
    const h = heightAt(x, z);
    if (h < 0.8 || h > 2.8 || tooClose(x, z) || !offRoad(x, z, 6)) continue;
    add(pick(PALMS), x, h, z, 7 + rand() * 3, rand() * Math.PI * 2);
    colliders.push({ x, z, r: 0.5 });
    palms++;
  }
  // Rocks, bigger on the mountain.
  let rocks = 0;
  for (let i = 0; i < 4000 && rocks < 220; i++) {
    const x = (rand() - 0.5) * 760, z = (rand() - 0.5) * 760;
    const h = heightAt(x, z);
    if (h < 1 || tooClose(x, z) || !offRoad(x, z, 6)) continue;
    const size = 1.5 + rand() * (h > 25 ? 5 : 3);
    add(pick(ROCKS), x, h, z, size, rand() * Math.PI * 2);
    if (size > 2.5) colliders.push({ x, z, r: size * 0.35 });
    rocks++;
  }
  // Bushes, flowers and mushrooms: decoration only, no collision.
  let plants = 0;
  for (let i = 0; i < 12000 && plants < 2600; i++) {
    const x = (rand() - 0.5) * 760, z = (rand() - 0.5) * 760;
    const h = heightAt(x, z);
    if (h < 2.8 || h > 30 || tooClose(x, z, -20) || !offRoad(x, z, 4.5)) continue;
    const name = pick(SMALL_PLANTS);
    const bush = name.startsWith('plant');
    add(name, x, h, z, bush ? 1.2 + rand() * 1.2 : 0.45 + rand() * 0.4, rand() * Math.PI * 2);
    plants++;
  }

  const group = new THREE.Group();
  for (const [name, mats] of buckets) {
    // Fitted to 1 m tall (rocks 1 m wide) so per-instance scale is in metres.
    const fitted = fitModel(N[name], ROCKS.includes(name) ? { width: 1 } : { height: 1 });
    group.add(instanceModel(fitted, mats, { castShadow: !SMALL_PLANTS.includes(name) }));
  }
  return group;
}

function buildCollectibles(scene, avoid) {
  const rand = rng(99);
  const coinGeo = new THREE.CylinderGeometry(1, 1, 0.25, 20).rotateX(Math.PI / 2);
  const coinMat = new THREE.MeshStandardMaterial({ color: '#ffd23f', metalness: 0.7, roughness: 0.3, emissive: '#b8860b', emissiveIntensity: 0.4 });
  const canGeo = new THREE.BoxGeometry(1.2, 1.6, 0.7);
  const canMat = new THREE.MeshLambertMaterial({ color: '#e53935', emissive: '#7f0000', emissiveIntensity: 0.4 });
  const items = [];
  const place = (count, type) => {
    let placed = 0;
    for (let i = 0; i < 5000 && placed < count; i++) {
      const x = (rand() - 0.5) * 700, z = (rand() - 0.5) * 700;
      const h = heightAt(x, z);
      if (h < 2 || h > 55 || avoid.some(a => Math.hypot(x - a.x, z - a.z) < a.r * 0.6)) continue;
      const m = new THREE.Mesh(type === 'coin' ? coinGeo : canGeo, type === 'coin' ? coinMat : canMat);
      m.position.set(x, h + 1.8, z);
      m.castShadow = true;
      scene.add(m);
      items.push({ mesh: m, type, x, z, baseY: h + 1.8, active: true, respawn: 0 });
      placed++;
    }
  };
  place(40, 'coin');
  place(14, 'fuel');
  return items;
}

function buildBeacon() {
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 3, 300, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide })
  );
  beacon.geometry.translate(0, 150, 0);
  return beacon;
}

export function buildWorld(scene, assets) {
  ASSETS = assets;
  const colliders = [];
  const village = buildVillage(colliders);
  const lighthouse = buildLighthouse(colliders);
  const peak = buildPeakFlag();
  const ruins = buildRuins(colliders);
  scene.add(village.group, buildLakeDock(), lighthouse.group, peak.group, ruins.group);

  const avoid = [
    { ...LANDMARKS.village, r: 60 },
    { x: LANDMARKS.lake.x + 55, z: LANDMARKS.lake.z - 40, r: 18 },
    { ...LANDMARKS.lighthouse, r: 18 },
    { ...LANDMARKS.ruins, r: 28 },
    { ...LANDMARKS.peak, r: 14 },
  ];
  scene.add(scatterNature(colliders, avoid));
  const items = buildCollectibles(scene, avoid);
  const beacon = buildBeacon();
  scene.add(beacon);

  return {
    colliders,
    items,
    beacon,
    gas: village.gas,
    animate(t) {
      lighthouse.pivot.rotation.y = t * 0.8;
      peak.flag.rotation.y = Math.sin(t * 3) * 0.25;
      ruins.statue.rotation.y = t;
      ruins.statue.position.y = heightAt(LANDMARKS.ruins.x, LANDMARKS.ruins.z) + 4.5 + Math.sin(t * 2) * 0.4;
    },
  };
}
