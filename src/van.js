import * as THREE from 'three';
import { heightAt, WATER_LEVEL } from './terrain.js';


const VAN_LENGTH = 4.6;

// Kenney Car Kit van (CC0). Wheels are separate nodes, so they can spin and steer.
function buildVanModel(source) {
  const root = new THREE.Group();
  const model = source.clone();
  const box0 = new THREE.Box3().setFromObject(model);
  const s = VAN_LENGTH / box0.getSize(new THREE.Vector3()).z;
  model.scale.setScalar(s);
  model.position.y = -box0.min.y * s;

  const body = new THREE.Group();
  root.add(body);
  const wheels = [];
  const wheelNodes = [];
  model.traverse((o) => { if (o.name.startsWith('wheel-')) wheelNodes.push(o); });
  for (const w of wheelNodes) {
    // pivot (steer) -> spinner (roll) -> original wheel mesh
    const pivot = new THREE.Group();
    pivot.position.copy(w.position);
    const spinner = new THREE.Group();
    w.parent.add(pivot);
    pivot.add(spinner);
    w.position.set(0, 0, 0);
    spinner.add(w);
    wheels.push({ pivot, wheel: spinner, front: w.name.includes('front') });
  }
  const bodyNode = model.getObjectByName('body');
  root.add(model);
  // Lean/bounce only the body; wheels stay planted.
  if (bodyNode) {
    body.position.copy(bodyNode.position).multiplyScalar(s);
    body.position.y += model.position.y;
    model.remove(bodyNode);
    bodyNode.position.set(0, 0, 0);
    bodyNode.scale.multiplyScalar(s);
    body.add(bodyNode);
  }

  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const top = box.max.y, front = box.max.z, back = box.min.z;
  const halfW = (box.max.x - box.min.x) / 2;

  // Roof rack with surfboard and luggage: it's an adventure van.
  const roof = new THREE.Group();
  roof.position.y = top - body.position.y;
  const rack = box3(halfW * 1.4, 0.08, VAN_LENGTH * 0.6, '#333');
  rack.position.set(0, 0.05, -0.2);
  const board = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.28, 2.6, 4, 10),
    new THREE.MeshLambertMaterial({ color: '#ff9f1c' })
  );
  board.rotation.x = Math.PI / 2;
  board.scale.set(1, 1, 0.25);
  board.position.set(-halfW * 0.38, 0.16, -0.2);
  board.castShadow = true;
  const bag = box3(0.6, 0.4, 0.8, '#8d5a2b');
  bag.position.set(halfW * 0.4, 0.28, 0.2);
  roof.add(rack, board, bag);
  body.add(roof);

  const headlights = [];
  for (const side of [-halfW * 0.6, halfW * 0.6]) {
    const spot = new THREE.SpotLight('#fff3c4', 0, 60, 0.5, 0.5, 1.2);
    spot.position.set(side, 0.9, front);
    const target = new THREE.Object3D();
    target.position.set(side, 0, front + 14);
    root.add(spot, target);
    spot.target = target;
    headlights.push(spot);
  }

  return { root, body, wheels, headlights, wheelRadius: 0.3 * s, bodyY: body.position.y, length: front - back };
}

function box3(w, h, d, color) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  m.castShadow = true;
  return m;
}

export class Van {
  constructor(scene, model) {
    const m = buildVanModel(model);
    this.wheelRadius = m.wheelRadius;
    this.bodyY = m.bodyY;
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

  // onRoad: 0..1, driving off-road on grass lowers top speed a little.
  update(dt, input, colliders, hasFuel, onRoad = 1) {
    const throttle = hasFuel ? input.throttle : Math.min(0, input.throttle) * 0.3;
    const boost = input.boost && hasFuel && throttle > 0 ? 1.45 : 1;
    const top = this.maxSpeed * boost * (0.82 + 0.18 * onRoad);

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
    this.wheelSpin += (this.speed / this.wheelRadius) * dt;
    for (const w of this.wheels) {
      w.wheel.rotation.x = this.wheelSpin;
      if (w.front) w.pivot.rotation.y = this.steer;
    }
    // Body lean and a bit of bounce for character.
    this.body.rotation.z += (-this.steer * Math.min(1, Math.abs(this.speed) / 25) * 0.12 - this.body.rotation.z) * Math.min(1, 6 * dt);
    this.body.position.y = this.bodyY + Math.sin(performance.now() * 0.02) * 0.015 * Math.min(1, Math.abs(this.speed) / 10);
  }

  setHeadlights(intensity) {
    for (const h of this.headlights) h.intensity = intensity;
  }
}
