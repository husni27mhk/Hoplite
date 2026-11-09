import * as THREE from 'three';
import { heightAt, WATER_LEVEL } from './terrain.js';

const box = (w, h, d, color, opts = {}) => {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color, ...opts })
  );
  m.castShadow = true;
  return m;
};

function buildVanModel() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.55;
  root.add(body);

  // Classic two-tone camper van: orange bottom, cream top.
  const lower = box(2.2, 1.0, 4.6, '#e8702a');
  lower.position.y = 0.6;
  const upper = box(2.2, 1.1, 4.4, '#f6ecd4');
  upper.position.set(0, 1.65, -0.05);
  const nose = box(2.2, 0.9, 0.3, '#f6ecd4');
  nose.position.set(0, 0.75, 2.4);
  const bumperF = box(2.3, 0.25, 0.25, '#555');
  bumperF.position.set(0, 0.2, 2.45);
  const bumperB = bumperF.clone();
  bumperB.position.z = -2.4;
  body.add(lower, upper, nose, bumperF, bumperB);

  const glass = { color: '#7fc6e8', transparent: true, opacity: 0.85 };
  const windshield = box(2.0, 0.75, 0.08, glass.color, glass);
  windshield.position.set(0, 1.7, 2.17);
  windshield.rotation.x = -0.12;
  body.add(windshield);
  for (const side of [-1, 1]) {
    for (const z of [1.3, 0, -1.3]) {
      const w = box(0.06, 0.6, 1.0, glass.color, glass);
      w.position.set(side * 1.11, 1.75, z);
      body.add(w);
    }
  }

  // V-shaped front logo panel
  const logo = new THREE.Mesh(
    new THREE.CircleGeometry(0.28, 20),
    new THREE.MeshLambertMaterial({ color: '#ffffff' })
  );
  logo.position.set(0, 0.95, 2.56);
  body.add(logo);

  // Headlights
  const lightMat = new THREE.MeshBasicMaterial({ color: '#fff6c8' });
  for (const side of [-0.75, 0.75]) {
    const hl = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16), lightMat);
    hl.position.set(side, 0.75, 2.56);
    body.add(hl);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: '#c0182a' });
  for (const side of [-0.85, 0.85]) {
    const tl = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.4), tailMat);
    tl.position.set(side, 0.8, -2.32);
    tl.rotation.y = Math.PI;
    body.add(tl);
  }

  // Roof rack with surfboard and luggage
  const rack = box(1.9, 0.08, 3.2, '#333');
  rack.position.set(0, 2.3, -0.2);
  const board = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.3, 2.8, 4, 10),
    new THREE.MeshLambertMaterial({ color: '#2ab3a6' })
  );
  board.rotation.x = Math.PI / 2;
  board.scale.set(1, 1, 0.25);
  board.position.set(-0.45, 2.42, -0.2);
  board.castShadow = true;
  const bag = box(0.7, 0.45, 0.9, '#a0522d');
  bag.position.set(0.5, 2.55, 0.3);
  body.add(rack, board, bag);

  // Spare wheel on the back
  const spare = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.45, 0.25, 16),
    new THREE.MeshLambertMaterial({ color: '#222' })
  );
  spare.rotation.x = Math.PI / 2;
  spare.position.set(0, 1.5, -2.45);
  body.add(spare);

  // Wheels
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.35, 18);
  wheelGeo.rotateZ(Math.PI / 2);
  const tire = new THREE.MeshLambertMaterial({ color: '#1d1d1d' });
  const hub = new THREE.MeshLambertMaterial({ color: '#dddddd' });
  for (const [x, z, front] of [[-1.05, 1.5, true], [1.05, 1.5, true], [-1.05, -1.5, false], [1.05, -1.5, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.48, z);
    const wheel = new THREE.Mesh(wheelGeo, tire);
    wheel.castShadow = true;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.37, 12).rotateZ(Math.PI / 2), hub);
    wheel.add(cap);
    pivot.add(wheel);
    root.add(pivot);
    wheels.push({ pivot, wheel, front });
  }

  // Headlight beams
  const headlights = [];
  for (const side of [-0.75, 0.75]) {
    const spot = new THREE.SpotLight('#fff3c4', 0, 60, 0.5, 0.5, 1.2);
    spot.position.set(side, 1.3, 2.6);
    const target = new THREE.Object3D();
    target.position.set(side, 0, 14);
    root.add(spot, target);
    spot.target = target;
    headlights.push(spot);
  }

  return { root, body, wheels, headlights };
}

export class Van {
  constructor(scene) {
    const m = buildVanModel();
    this.mesh = m.root;
    this.body = m.body;
    this.wheels = m.wheels;
    this.headlights = m.headlights;
    scene.add(this.mesh);

    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.speed = 0;
    this.vy = 0;
    this.steer = 0;
    this.grounded = true;
    this.wheelSpin = 0;
    this.maxSpeed = 32;
    this.quat = new THREE.Quaternion();
    this.bumped = 0;
  }

  reset(x, z, heading = 0) {
    this.pos.set(x, heightAt(x, z) + 0.5, z);
    this.heading = heading;
    this.speed = 0;
    this.vy = 0;
  }

  forward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  update(dt, input, colliders, hasFuel) {
    const throttle = hasFuel ? input.throttle : Math.min(0, input.throttle) * 0.3;
    const boost = input.boost && hasFuel && throttle > 0 ? 1.45 : 1;
    const top = this.maxSpeed * boost;

    if (this.grounded) {
      if (throttle > 0) {
        if (this.speed < 0) this.speed += 40 * dt;
        else if (this.speed < top) this.speed += 16 * boost * throttle * dt;
      } else if (throttle < 0) {
        if (this.speed > 0) this.speed -= 38 * dt;
        else if (this.speed > -10) this.speed -= 12 * dt;
      }
      if (input.brake) this.speed *= 1 - Math.min(1, 3.2 * dt);
      this.speed *= 1 - 0.35 * dt;
      if (throttle === 0 && Math.abs(this.speed) < 0.4) this.speed = 0;
      if (this.speed > top) this.speed -= 20 * dt;
    }

    const steerTarget = input.steer * 0.55;
    this.steer += (steerTarget - this.steer) * Math.min(1, 8 * dt);
    const speedFactor = Math.min(1, Math.abs(this.speed) / 6);
    const turn = (this.steer * this.speed / 3.0) * (input.brake ? 1.5 : 1);
    this.heading += turn * dt * (0.35 + 0.65 * speedFactor) * (this.grounded ? 1 : 0.3);

    const fwd = this.forward();
    const nx = this.pos.x + fwd.x * this.speed * dt;
    const nz = this.pos.z + fwd.z * this.speed * dt;

    // Deep water and the world edge act as walls.
    const gh = heightAt(nx, nz);
    if (gh < WATER_LEVEL - 1.4 || Math.hypot(nx, nz) > 430) {
      this.speed *= -0.3;
      this.bumped = 0.4;
    } else {
      this.pos.x = nx;
      this.pos.z = nz;
    }

    for (const c of colliders) {
      const dx = this.pos.x - c.x, dz = this.pos.z - c.z;
      const min = c.r + 1.6;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        this.pos.x = c.x + (dx / d) * min;
        this.pos.z = c.z + (dz / d) * min;
        if (Math.abs(this.speed) > 6) this.bumped = 0.4;
        this.speed *= 0.4;
      }
    }

    // Vertical: follow terrain, but leave the ground on crests to allow jumps.
    const ground = heightAt(this.pos.x, this.pos.z);
    if (this.grounded) {
      if (ground < this.pos.y - 0.6 && Math.abs(this.speed) > 14) {
        this.grounded = false;
      } else {
        const newVy = (ground - this.pos.y) / Math.max(dt, 1e-4);
        this.vy = newVy;
        this.pos.y = ground;
      }
    }
    if (!this.grounded) {
      this.vy -= 30 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= ground) {
        this.pos.y = ground;
        this.vy = 0;
        this.grounded = true;
      }
    }

    // Slope slows climbing and helps descending.
    if (this.grounded) {
      const ahead = heightAt(this.pos.x + fwd.x * 2, this.pos.z + fwd.z * 2);
      const behind = heightAt(this.pos.x - fwd.x * 2, this.pos.z - fwd.z * 2);
      const slope = (ahead - behind) / 4;
      this.speed -= slope * 14 * dt;
    }

    this.updateOrientation(dt, fwd);
    this.updateVisuals(dt);
    this.bumped = Math.max(0, this.bumped - dt);
  }

  updateOrientation(dt, fwd) {
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
    const x = this.pos.x, z = this.pos.z;
    const hf = heightAt(x + fwd.x * 1.6, z + fwd.z * 1.6);
    const hb = heightAt(x - fwd.x * 1.6, z - fwd.z * 1.6);
    const hr = heightAt(x - right.x * 1.1, z - right.z * 1.1);
    const hl = heightAt(x + right.x * 1.1, z + right.z * 1.1);
    const f = new THREE.Vector3(fwd.x * 3.2, hf - hb, fwd.z * 3.2).normalize();
    const l = new THREE.Vector3(right.x * 2.2, hl - hr, right.z * 2.2).normalize();
    const up = new THREE.Vector3().crossVectors(f, l).normalize();
    if (up.y < 0) up.negate();
    const side = new THREE.Vector3().crossVectors(up, f).normalize();
    const mat = new THREE.Matrix4().makeBasis(side, up, f);
    const target = new THREE.Quaternion().setFromRotationMatrix(mat);
    this.quat.slerp(target, Math.min(1, (this.grounded ? 10 : 2) * dt));
    this.mesh.quaternion.copy(this.quat);
    this.mesh.position.copy(this.pos);
  }

  updateVisuals(dt) {
    this.wheelSpin += (this.speed / 0.48) * dt;
    for (const w of this.wheels) {
      w.wheel.rotation.x = this.wheelSpin;
      if (w.front) w.pivot.rotation.y = this.steer;
    }
    // Body lean and a bit of bounce for character.
    this.body.rotation.z += (-this.steer * Math.min(1, Math.abs(this.speed) / 25) * 0.12 - this.body.rotation.z) * Math.min(1, 6 * dt);
    this.body.position.y = 0.55 + Math.sin(performance.now() * 0.02) * 0.015 * Math.min(1, Math.abs(this.speed) / 10);
  }

  setHeadlights(intensity) {
    for (const h of this.headlights) h.intensity = intensity;
  }
}
