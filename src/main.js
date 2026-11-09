import * as THREE from 'three';
import { createTerrain, heightAt, colorAt, LANDMARKS, WORLD_SIZE } from './terrain.js';
import { Van } from './van.js';
import { buildWorld } from './world.js';
import { GameAudio } from './audio.js';
import { loadAssets } from './assets.js';
import { createGrass } from './grass.js';
import { roadWeight } from './roads.js';

// ---------- Renderer & scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#87ceeb', 120, 520);
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 2000);

const hemi = new THREE.HemisphereLight('#cfe8ff', '#5a7d3a', 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff4d6', 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 400 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);

const starGeo = new THREE.BufferGeometry();
const starPos = [];
for (let i = 0; i < 1500; i++) {
  const v = new THREE.Vector3().randomDirection();
  v.y = Math.abs(v.y);
  starPos.push(...v.multiplyScalar(900).toArray());
}
starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#fff', size: 2, sizeAttenuation: false, transparent: true, fog: false }));
scene.add(stars);

const playBtn = document.getElementById('play');
const assets = await loadAssets((p) => { playBtn.textContent = `Memuat aset... ${Math.round(p * 100)}%`; });
const { mesh: terrain, water, heightTex, splatTex, gridN } = createTerrain(assets.textures);
scene.add(terrain, water);
const world = buildWorld(scene, assets);
const van = new Van(scene, assets.van);
const isTouch = matchMedia('(pointer: coarse)').matches;
const grass = createGrass({ heightTex, splatTex, gridN, worldSize: WORLD_SIZE, count: isTouch ? 25000 : 60000 });
scene.add(grass.mesh);
const grassLight = new THREE.Color(1, 1, 1);
playBtn.textContent = 'Mulai Petualangan';
playBtn.disabled = false;
const audio = new GameAudio();

// ---------- Missions ----------
const START = { x: LANDMARKS.village.x - 4, z: LANDMARKS.village.z + 12, heading: Math.PI * 0.8 };
const MISSIONS = [
  { key: 'lake', text: 'Pergi memancing ke Danau Biru', radius: 22, at: { x: LANDMARKS.lake.x + 55, z: LANDMARKS.lake.z - 40 } },
  { key: 'lighthouse', text: 'Lihat matahari di Mercusuar Tua', radius: 20 },
  { key: 'peak', text: 'Taklukkan Puncak Elang!', radius: 16 },
  { key: 'ruins', text: 'Temukan kristal di Reruntuhan Kuno', radius: 22 },
  { key: 'village', text: 'Pulang ke Desa Pelangi', radius: 22 },
];
for (const m of MISSIONS) m.at ??= LANDMARKS[m.key];

const state = {
  running: false,
  paused: false,
  missionIdx: 0,
  coins: 0,
  score: 0,
  fuel: 100,
  time: 0,
  dayTime: 0.3,
  camMode: 0,
  stranded: 0,
  freeRoam: false,
};

// ---------- Input ----------
const keys = new Set();
const touchKeys = new Set();
const KEYMAP = {
  KeyW: 'gas', ArrowUp: 'gas', KeyS: 'brake', ArrowDown: 'brake',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'boost', ShiftRight: 'boost', Space: 'handbrake',
};
window.addEventListener('keydown', (e) => {
  if (KEYMAP[e.code]) { keys.add(KEYMAP[e.code]); e.preventDefault(); }
  if (!state.running) return;
  if (e.code === 'KeyH') audio.horn();
  if (e.code === 'KeyC') state.camMode = (state.camMode + 1) % 3;
  if (e.code === 'KeyR') resetVan();
  if (e.code === 'KeyM') toast(audio.toggleMute() ? '🔇 Suara mati' : '🔊 Suara nyala');
  if (e.code === 'KeyG') toast((grass.mesh.visible = !grass.mesh.visible) ? '🌿 Rumput nyala' : '🌿 Rumput mati (lebih ringan)');
});
window.addEventListener('keyup', (e) => KEYMAP[e.code] && keys.delete(KEYMAP[e.code]));
window.addEventListener('blur', () => keys.clear());

for (const btn of document.querySelectorAll('#touch button')) {
  const k = btn.dataset.key;
  const on = (e) => { e.preventDefault(); touchKeys.add(k); btn.classList.add('on'); };
  const off = (e) => { e.preventDefault(); touchKeys.delete(k); btn.classList.remove('on'); };
  btn.addEventListener('pointerdown', on);
  btn.addEventListener('pointerup', off);
  btn.addEventListener('pointerleave', off);
  btn.addEventListener('pointercancel', off);
}

function readInput() {
  const has = (k) => keys.has(k) || touchKeys.has(k);
  return {
    throttle: (has('gas') ? 1 : 0) - (has('brake') ? 1 : 0),
    steer: (has('left') ? 1 : 0) - (has('right') ? 1 : 0),
    brake: has('handbrake'),
    boost: has('boost'),
  };
}

// ---------- HUD ----------
const $ = (id) => document.getElementById(id);
let toastTimer = 0;
function toast(msg, dur = 2.2) {
  $('toast').innerHTML = msg;
  $('toast').classList.add('show');
  toastTimer = dur;
}

const minimap = $('minimap');
const mctx = minimap.getContext('2d');
const MAP = minimap.width;
const mapBg = document.createElement('canvas');
mapBg.width = mapBg.height = MAP;
{
  const bctx = mapBg.getContext('2d');
  const img = bctx.createImageData(MAP, MAP);
  const col = new THREE.Color();
  for (let py = 0; py < MAP; py++) {
    for (let px = 0; px < MAP; px++) {
      const x = (px / MAP - 0.5) * WORLD_SIZE, z = (py / MAP - 0.5) * WORLD_SIZE;
      const h = heightAt(x, z);
      if (h < 0) col.set(h < -3 ? '#2b6ca3' : '#3a8fd1');
      else colorAt(x, z, h, col);
      const i = (py * MAP + px) * 4;
      img.data[i] = col.r * 255; img.data[i + 1] = col.g * 255; img.data[i + 2] = col.b * 255; img.data[i + 3] = 255;
    }
  }
  bctx.putImageData(img, 0, 0);
}
const toMap = (x, z) => [(x / WORLD_SIZE + 0.5) * MAP, (z / WORLD_SIZE + 0.5) * MAP];

function drawMinimap() {
  mctx.save();
  mctx.clearRect(0, 0, MAP, MAP);
  mctx.beginPath();
  mctx.arc(MAP / 2, MAP / 2, MAP / 2, 0, Math.PI * 2);
  mctx.clip();
  mctx.drawImage(mapBg, 0, 0);
  for (const it of world.items) {
    if (!it.active) continue;
    const [x, y] = toMap(it.x, it.z);
    mctx.fillStyle = it.type === 'coin' ? '#ffd23f' : '#e53935';
    mctx.fillRect(x - 1, y - 1, 2.5, 2.5);
  }
  const [gx, gy] = toMap(world.gas.x, world.gas.z);
  mctx.font = '11px sans-serif';
  mctx.fillText('⛽', gx - 6, gy + 4);
  const m = MISSIONS[state.missionIdx];
  if (m && !state.freeRoam) {
    const [tx, ty] = toMap(m.at.x, m.at.z);
    mctx.fillStyle = '#ff006e';
    mctx.beginPath();
    mctx.arc(tx, ty, 5 + Math.sin(state.time * 6) * 1.5, 0, Math.PI * 2);
    mctx.fill();
  }
  const [vx, vy] = toMap(van.pos.x, van.pos.z);
  mctx.translate(vx, vy);
  mctx.rotate(-van.heading + Math.PI);
  mctx.fillStyle = '#fff';
  mctx.strokeStyle = '#000';
  mctx.beginPath();
  mctx.moveTo(0, -7); mctx.lineTo(5, 5); mctx.lineTo(-5, 5); mctx.closePath();
  mctx.fill(); mctx.stroke();
  mctx.restore();
}

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function updateHud() {
  $('speed-val').textContent = Math.round(Math.abs(van.speed) * 3.6);
  $('fuel-fill').style.width = `${state.fuel}%`;
  $('fuel-fill').classList.toggle('low', state.fuel < 20);
  $('coins').textContent = `${state.coins}/${world.items.filter(i => i.type === 'coin').length}`;
  $('score').textContent = state.score;
  $('timer').textContent = fmtTime(state.time);
  const hours = (state.dayTime * 24 + 24) % 24;
  const isDay = hours > 6 && hours < 18.5;
  $('clock').textContent = `${isDay ? '☀️' : '🌙'} ${String(Math.floor(hours)).padStart(2, '0')}:${String(Math.floor((hours % 1) * 60)).padStart(2, '0')}`;

  const m = MISSIONS[state.missionIdx];
  if (state.freeRoam || !m) {
    $('mission-step').textContent = '';
    $('mission-text').textContent = 'Jelajah bebas — kumpulkan semua koin!';
    $('mission-dist').textContent = '';
    $('compass').classList.add('hidden');
    world.beacon.visible = false;
    return;
  }
  const dx = m.at.x - van.pos.x, dz = m.at.z - van.pos.z;
  $('mission-step').textContent = `${state.missionIdx + 1}/${MISSIONS.length}`;
  $('mission-text').textContent = m.text;
  $('mission-dist').textContent = `📍 ${LANDMARKS[m.key].name} · ${Math.round(Math.hypot(dx, dz))} m`;
  $('compass').classList.remove('hidden');
  const angle = Math.atan2(dx, dz) - van.heading;
  $('arrow').style.transform = `rotate(${-angle}rad)`;
  world.beacon.visible = true;
  world.beacon.position.set(m.at.x, heightAt(m.at.x, m.at.z), m.at.z);
}

// ---------- Game logic ----------
function resetVan() {
  const fwd = van.forward();
  const x = van.pos.x - fwd.x * 3, z = van.pos.z - fwd.z * 3;
  van.reset(x, z, van.heading);
  van.grounded = true;
  toast('🔧 Van diperbaiki');
}

function towToVillage() {
  van.reset(START.x, START.z, START.heading);
  state.fuel = 50;
  state.score = Math.max(0, state.score - 200);
  state.stranded = 0;
  $('stranded').classList.add('hidden');
  state.paused = false;
  toast('🚚 Diderek ke desa');
}

function completeMission() {
  const m = MISSIONS[state.missionIdx];
  state.score += 500;
  audio.fanfare();
  state.missionIdx++;
  if (state.missionIdx >= MISSIONS.length) {
    state.paused = true;
    const total = world.items.filter(i => i.type === 'coin').length;
    $('win-text').innerHTML = `Kamu menjelajahi seluruh Pulau Pelangi dalam <b>${fmtTime(state.time)}</b>!<br>Koin: <b>${state.coins}/${total}</b> · Skor: <b>${state.score}</b>`;
    $('win').classList.remove('hidden');
  } else {
    toast(`✅ ${LANDMARKS[m.key].name} tercapai! +500<br><small>Berikutnya: ${MISSIONS[state.missionIdx].text}</small>`, 3.5);
  }
}

function updateItems(dt) {
  for (const it of world.items) {
    if (!it.active) {
      if (it.type === 'fuel') {
        it.respawn -= dt;
        if (it.respawn <= 0) { it.active = true; it.mesh.visible = true; }
      }
      continue;
    }
    it.mesh.rotation.y += dt * 2.5;
    it.mesh.position.y = it.baseY + Math.sin(state.time * 3 + it.x) * 0.3;
    const dx = it.x - van.pos.x, dz = it.z - van.pos.z;
    if (dx * dx + dz * dz < 9 && Math.abs(it.baseY - van.pos.y) < 5) {
      it.active = false;
      it.mesh.visible = false;
      if (it.type === 'coin') {
        state.coins++;
        state.score += 100;
        audio.coin();
      } else {
        state.fuel = Math.min(100, state.fuel + 35);
        it.respawn = 45;
        audio.fuel();
        toast('⛽ +35 bensin', 1.2);
      }
    }
  }
}

function updateDayNight(dt) {
  state.dayTime = (state.dayTime + dt / 300) % 1;
  const a = (state.dayTime - 0.25) * Math.PI * 2; // 0.25 = sunrise
  const elev = Math.sin(a);
  const dayK = THREE.MathUtils.smoothstep(elev, -0.15, 0.25);
  sun.position.set(van.pos.x + Math.cos(a) * 150, van.pos.y + Math.max(elev, 0.05) * 200, van.pos.z + 60);
  sun.target.position.copy(van.pos);
  sun.intensity = 2.2 * dayK;
  hemi.intensity = 0.25 + 0.7 * dayK;
  grassLight.setScalar(0.18 + 0.95 * dayK).lerp(sun.color, 0.15 * dayK);

  const night = new THREE.Color('#0b1430');
  const dusk = new THREE.Color('#ff9a62');
  const day = new THREE.Color('#87ceeb');
  const sky = night.clone().lerp(day, dayK);
  const duskK = Math.max(0, 1 - Math.abs(elev) / 0.3) * 0.6;
  sky.lerp(dusk, duskK);
  scene.background = sky;
  scene.fog.color.copy(sky);
  sun.color.set('#fff4d6').lerp(dusk, duskK);
  stars.material.opacity = 1 - dayK;
  van.setHeadlights(dayK < 0.6 ? 60 * (1 - dayK) : 0);
}

const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
function updateCamera(dt) {
  const fwd = van.forward();
  let desired, look;
  if (state.camMode === 2) {
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(van.quat);
    const f = new THREE.Vector3(0, 0, 1).applyQuaternion(van.quat);
    desired = van.pos.clone().addScaledVector(up, 2.3).addScaledVector(f, 1.2);
    look = desired.clone().addScaledVector(f, 10);
    camera.position.copy(desired);
    camLook.copy(look);
    camera.lookAt(look);
    return;
  }
  const dist = state.camMode === 0 ? 10 : 18;
  const height = state.camMode === 0 ? 4.5 : 9;
  desired = van.pos.clone().addScaledVector(fwd, -dist - Math.abs(van.speed) * 0.08);
  desired.y += height;
  const minY = heightAt(desired.x, desired.z) + 1.5;
  if (desired.y < minY) desired.y = minY;
  look = van.pos.clone().addScaledVector(fwd, 4);
  look.y += 1.8;
  const k = 1 - Math.exp(-5 * dt);
  camPos.lerp(desired, k);
  camLook.lerp(look, 1 - Math.exp(-10 * dt));
  camera.position.copy(camPos);
  if (van.bumped > 0) camera.position.y += (Math.random() - 0.5) * van.bumped * 0.6;
  camera.lookAt(camLook);
  camera.fov = THREE.MathUtils.lerp(camera.fov, 62 + Math.abs(van.speed) * 0.35, 0.05);
  camera.updateProjectionMatrix();
}

let lastBump = 0;
function step(dt) {
  const input = readInput();
  const hasFuel = state.fuel > 0;
  van.update(dt, input, world.colliders, hasFuel, roadWeight(van.pos.x, van.pos.z));
  if (van.bumped > 0.35 && state.time - lastBump > 0.5) { audio.bump(); lastBump = state.time; }

  // Fuel consumption
  if (hasFuel && input.throttle !== 0) {
    state.fuel -= dt * (0.55 + (input.boost && input.throttle > 0 ? 1.4 : 0));
    if (state.fuel <= 0) { state.fuel = 0; toast('⚠️ Bensin habis!'); }
  }
  const gdx = world.gas.x - van.pos.x, gdz = world.gas.z - van.pos.z;
  if (gdx * gdx + gdz * gdz < 100 && Math.abs(van.speed) < 4 && state.fuel < 100) {
    state.fuel = Math.min(100, state.fuel + dt * 30);
    if (toastTimer <= 0) toast('⛽ Mengisi bensin...', 0.6);
  }
  if (state.fuel <= 0 && Math.abs(van.speed) < 0.5) {
    state.stranded += dt;
    if (state.stranded > 2) { state.paused = true; $('stranded').classList.remove('hidden'); }
  } else state.stranded = 0;

  const m = MISSIONS[state.missionIdx];
  if (m && !state.freeRoam && Math.hypot(m.at.x - van.pos.x, m.at.z - van.pos.z) < m.radius) completeMission();

  updateItems(dt);
  audio.setEngine(Math.min(1, Math.abs(van.speed) / 45), Math.abs(input.throttle), hasFuel);
}

const clock = new THREE.Timer();
const grassCenter = new THREE.Vector3();
function loop() {
  requestAnimationFrame(loop);
  clock.update();
  const dt = Math.min(clock.getDelta(), 1 / 30);
  if (state.running && !state.paused) {
    state.time += dt;
    step(dt);
  }
  world.animate(clock.getElapsed());
  // Centre the grass field ahead of the van so more of it is in view.
  grassCenter.copy(van.pos).addScaledVector(van.forward(), 18);
  grass.update(clock.getElapsed(), grassCenter, van.pos, grassLight);
  updateDayNight(state.running && !state.paused ? dt : 0);
  updateCamera(dt);
  if (state.running) {
    updateHud();
    drawMinimap();
  }
  water.position.y = Math.sin(clock.getElapsed() * 0.8) * 0.08;
  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) $('toast').classList.remove('show');
  }
  renderer.render(scene, camera);
}

function startGame() {
  Object.assign(state, { running: true, paused: false, missionIdx: 0, coins: 0, score: 0, fuel: 100, time: 0, dayTime: 0.3, stranded: 0, freeRoam: false });
  for (const it of world.items) { it.active = true; it.mesh.visible = true; }
  van.reset(START.x, START.z, START.heading);
  camPos.copy(van.pos).add(new THREE.Vector3(0, 6, 0)).addScaledVector(van.forward(), -12);
  camLook.copy(van.pos);
  for (const id of ['start', 'win', 'stranded']) $(id).classList.add('hidden');
  $('hud').classList.remove('hidden');
  audio.start();
  toast(`🚐 Ayo berangkat!<br><small>${MISSIONS[0].text}</small>`, 3);
}

$('play').addEventListener('click', startGame);
$('restart').addEventListener('click', startGame);
$('tow').addEventListener('click', towToVillage);
$('free-roam').addEventListener('click', () => {
  state.freeRoam = true;
  state.paused = false;
  $('win').classList.add('hidden');
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Idle attract camera behind the start screen.
van.reset(START.x, START.z, START.heading);
camPos.set(START.x + 20, heightAt(START.x, START.z) + 10, START.z - 20);
camLook.copy(van.pos);
loop();

// Exposed for automated checks in the browser console.
window.__game = { state, van, world, roadWeight, grass, renderer, scene, terrain, camera };
