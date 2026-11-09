import * as THREE from 'three';
import { heightAt, LANDMARKS, WATER_LEVEL } from './terrain.js';

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

function house(color, roof) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(6, 4, 6), lambert(color), 0, 2, 0));
  const r = mesh(new THREE.ConeGeometry(5.2, 3, 4), lambert(roof), 0, 5.5, 0);
  r.rotation.y = Math.PI / 4;
  g.add(r);
  g.add(mesh(new THREE.BoxGeometry(1.4, 2.4, 0.2), lambert('#6b4226'), 0, 1.2, 3.05));
  return g;
}

function buildVillage(colliders) {
  const g = new THREE.Group();
  const { x, z } = LANDMARKS.village;
  const y = heightAt(x, z);
  const spots = [
    [-22, -10, '#f4d35e', '#c0392b'], [-22, 14, '#9ad1d4', '#34495e'],
    [22, -12, '#f7a072', '#7d3c98'], [24, 16, '#ffffff', '#2e86c1'],
    [0, -30, '#c5e99b', '#a04000'],
  ];
  for (const [dx, dz, c, r] of spots) {
    const h = house(c, r);
    h.position.set(x + dx, y, z + dz);
    h.rotation.y = Math.atan2(-dx, -dz);
    g.add(h);
    colliders.push({ x: x + dx, z: z + dz, r: 4.3 });
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
  const hut = house('#d7b98e', '#5d4037');
  hut.scale.setScalar(0.7);
  hut.position.set(bx + 4, y, bz + 4);
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
  const trunks = [], crowns = [], rocks = [], palms = [];
  const tooClose = (x, z) => avoid.some(a => Math.hypot(x - a.x, z - a.z) < a.r);
  for (let i = 0; i < 4000 && trunks.length < 650; i++) {
    const x = (rand() - 0.5) * 760, z = (rand() - 0.5) * 760;
    const h = heightAt(x, z);
    if (h < 2.6 || h > 40 || tooClose(x, z)) continue;
    const s = 0.8 + rand() * 0.9;
    trunks.push({ x, z, y: h, s });
    crowns.push({ x, z, y: h, s, hue: rand() });
    colliders.push({ x, z, r: 0.7 * s });
  }
  for (let i = 0; i < 2000 && palms.length < 70; i++) {
    const x = (rand() - 0.5) * 820, z = (rand() - 0.5) * 820;
    const h = heightAt(x, z);
    if (h < 1 || h > 2.6 || tooClose(x, z)) continue;
    palms.push({ x, z, y: h, s: 0.8 + rand() * 0.5, r: rand() * Math.PI });
    colliders.push({ x, z, r: 0.5 });
  }
  for (let i = 0; i < 2000 && rocks.length < 180; i++) {
    const x = (rand() - 0.5) * 760, z = (rand() - 0.5) * 760;
    const h = heightAt(x, z);
    if (h < 1 || tooClose(x, z)) continue;
    const s = 0.6 + rand() * 2;
    rocks.push({ x, z, y: h, s, r: rand() * 6 });
    if (s > 1.2) colliders.push({ x, z, r: s * 0.9 });
  }

  const group = new THREE.Group();
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();

  const trunkMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.4, 3, 6), lambert('#6d4c41'), trunks.length);
  const crownGeo = new THREE.ConeGeometry(2.2, 5.5, 7);
  const crownMesh = new THREE.InstancedMesh(crownGeo, lambert('#ffffff', { flatShading: true }), crowns.length);
  trunks.forEach((t, i) => {
    m4.compose(new THREE.Vector3(t.x, t.y + 1.5 * t.s, t.z), q.identity(), new THREE.Vector3(t.s, t.s, t.s));
    trunkMesh.setMatrixAt(i, m4);
  });
  crowns.forEach((c, i) => {
    m4.compose(new THREE.Vector3(c.x, c.y + 5.2 * c.s, c.z), q.identity(), new THREE.Vector3(c.s, c.s, c.s));
    crownMesh.setMatrixAt(i, m4);
    crownMesh.setColorAt(i, col.setHSL(0.27 + c.hue * 0.08, 0.55, 0.28 + c.hue * 0.12));
  });

  const palmTrunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.3, 6, 6), lambert('#a1887f'), palms.length);
  const leafGeo = new THREE.ConeGeometry(3, 1.2, 6);
  const palmLeaf = new THREE.InstancedMesh(leafGeo, lambert('#43a047', { flatShading: true }), palms.length);
  palms.forEach((p, i) => {
    q.setFromEuler(new THREE.Euler(0.15, p.r, 0));
    m4.compose(new THREE.Vector3(p.x, p.y + 3 * p.s, p.z), q, new THREE.Vector3(p.s, p.s, p.s));
    palmTrunk.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(p.x, p.y + 6.2 * p.s, p.z + 0.4), q.identity(), new THREE.Vector3(p.s, p.s, p.s));
    palmLeaf.setMatrixAt(i, m4);
  });

  const rockMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1), lambert('#8e8e8e', { flatShading: true }), rocks.length);
  rocks.forEach((r, i) => {
    q.setFromEuler(new THREE.Euler(r.r, r.r * 2, 0));
    m4.compose(new THREE.Vector3(r.x, r.y + r.s * 0.3, r.z), q, new THREE.Vector3(r.s, r.s * 0.7, r.s));
    rockMesh.setMatrixAt(i, m4);
  });

  for (const m of [trunkMesh, crownMesh, palmTrunk, palmLeaf, rockMesh]) {
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
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

export function buildWorld(scene) {
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
