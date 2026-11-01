import * as THREE from './vendor/three.module.js';

const TAU = Math.PI * 2;
const CLEARANCE = 0.60;
const LENGTH = 2.28, WIDTH = 1.15, ROOF = 0.70, ROAD_DEPTH = 0.65;
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const finite = value => Number.isFinite(value) ? value : 0;

/** Road contact uses front/rear support and an oriented vehicle hull. Flight
 * uses gravity, local-up thrust and separate pitch/roll angular momentum.
 * A/D is longitudinal-axis roll; pitch is never driven by the flip input.
 * Magnetic adhesion is a game assist, not a production-vehicle claim. */
export class Simulator {
  constructor(track) { this.track = track; this._buildColliders(); this.reset(); }

  _buildColliders() {
    this._surfaces = [];
    const samples = this.track.samples;
    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i], b = samples[i + 1];
      const frame = this.track.sample((a.s + b.s) / 2);
      if (frame.gap || a.gap || b.gap) continue;
      this._surfaces.push({ ...frame, halfLength: a.p.distanceTo(b.p) / 2, aS: a.s, bS: b.s });
    }
    this._ends = [];
    for (const gap of this.track.gaps ?? []) {
      for (const [s, sign] of [[gap.start, 1], [gap.end, -1]]) {
        const frame = this.track.sample(s);
        this._ends.push({ ...frame, outward: frame.tangent.clone().multiplyScalar(sign) });
      }
    }
  }

  reset() {
    const start = this.track.sample(3);
    this._baseQuaternion = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(start.tangent, start.normal, start.side));
    this.state = {
      pos: start.p.clone().addScaledVector(start.normal, CLEARANCE), vel: new THREE.Vector3(),
      angle: Math.atan2(start.tangent.y, start.tangent.x), angularVelocity: 0, yaw: 0,
      roll: 0, rollVelocity: 0, quaternion: this._baseQuaternion.clone(),
      forward: start.tangent.clone(), up: start.normal.clone(), side: start.side.clone(),
      speed: 0, s: 3, lane: 0, grounded: true, fuel: 100,
      damage: { body: 0, suspension: 0, battery: 0, thrusters: 0 }, health: 100,
      elapsed: 0, score: 0, flips: 0, airtime: 0, maxSpeed: 0,
      finished: false, failed: false, reason: '', checkpoint: 0,
      jetActive: false, magnetActive: true, lastEvent: '试车就绪', eventTimer: 2,
    };
    this._laneVelocity = this._airSpin = this._flightFlips = this._cleanLandings = 0;
    this._airTimeThisJump = this._impactCooldown = this._sideHitCooldown = 0;
    this._maxS = this._hintS = 3;
    this._checkpointIndex = -1;
    this._previous = new THREE.Vector3();
    this._previousQuaternion = this.state.quaternion.clone();
    this._scratch = new THREE.Vector3();
    this._matrix = new THREE.Matrix4();
    this._rotation = new THREE.Quaternion();
    return this.state;
  }

  step(dt, input = {}) {
    if (this.state.finished || !Number.isFinite(dt) || dt <= 0) return this.state;
    const safeDt = Math.min(dt, 0.1), count = Math.ceil(safeDt * 120);
    const controls = {
      throttle: clamp(finite(input.throttle ?? 0), 0, 1), brake: clamp(finite(input.brake ?? 0), 0, 1),
      steer: clamp(finite(input.steer ?? 0), -1, 1), flip: clamp(finite(input.flip ?? 0), -1, 1),
      jet: !!input.jet, magnet: input.magnet !== false,
    };
    for (let i = 0; i < count && !this.state.finished; i++) this._step(safeDt / count, controls);
    return this.state;
  }

  _updateOrientation() {
    const st = this.state;
    st.quaternion.copy(this._baseQuaternion).multiply(this._rotation.setFromAxisAngle(X, st.roll)).normalize();
    st.forward.copy(X).applyQuaternion(st.quaternion);
    st.up.copy(Y).applyQuaternion(st.quaternion);
    st.side.copy(Z).applyQuaternion(st.quaternion);
    st.yaw = Math.atan2(-st.forward.z, st.forward.x);
  }

  // Extent from model origin toward -normal. Includes roof, nose and side panels.
  _support(normal, quaternion = this.state.quaternion) {
    const local = normal.clone().applyQuaternion(quaternion.clone().invert());
    return Math.abs(local.x) * LENGTH + Math.abs(local.z) * WIDTH
      + Math.abs(local.y) * (local.y >= 0 ? CLEARANCE : ROOF);
  }

  _step(dt, controls) {
    const st = this.state, gravity = this.track.gravity ?? this.track.grav ?? 9.81;
    st.elapsed += dt;
    st.eventTimer = Math.max(0, st.eventTimer - dt);
    this._impactCooldown = Math.max(0, this._impactCooldown - dt);
    this._sideHitCooldown = Math.max(0, this._sideHitCooldown - dt);
    st.jetActive = controls.jet && st.fuel > 0 && st.damage.thrusters < 95;
    st.magnetActive = controls.magnet && st.grounded;
    if (st.grounded) this._drive(dt, controls, gravity);
    if (!st.grounded && !st.finished) this._fly(dt, controls, gravity);
    this._maxS = Math.max(this._maxS, st.s);
    st.maxSpeed = Math.max(st.maxSpeed, st.speed);
    const checkpoints = this.track.checkpoints ?? [];
    for (let i = this._checkpointIndex + 1; i < checkpoints.length; i++) {
      const cp = typeof checkpoints[i] === 'number' ? checkpoints[i] : checkpoints[i].s;
      if (st.s >= cp && st.grounded) { this._checkpointIndex = i; st.checkpoint = i + 1; this._event(`检查点 ${i + 1} / ${checkpoints.length}`); }
      else break;
    }
    st.score = this._score();
    if (!st.finished && st.health <= 10) this._finish('车辆严重损坏', true);
    if (!st.finished && st.s >= this.track.length - 2 && st.grounded) this._finish('测试完成', false);
    if (!st.finished && st.elapsed >= 180) this._finish('测试时间结束', true);
    st.magnetActive = controls.magnet && st.grounded;
  }

  _drive(dt, controls, gravity) {
    const st = this.state, before = this.track.sample(st.s);
    const acceleration = controls.throttle * 17 * (1 - st.damage.battery * 0.004)
      - controls.brake * 32 - st.speed * 0.07 - st.speed ** 2 * 0.0016 - gravity * before.tangent.y;
    st.speed = clamp(st.speed + acceleration * dt, 0, 62);
    this._laneVelocity += (controls.steer * (3.5 + st.speed * 0.08) - this._laneVelocity) * Math.min(1, dt * 7);
    st.lane += this._laneVelocity * dt;
    st.s = Math.min(this.track.length, st.s + st.speed * dt);
    this._hintS = st.s;
    const surface = this.track.sample(st.s);
    if (surface.gap) {
      st.pos.addScaledVector(before.tangent, st.speed * dt).addScaledVector(before.side, this._laneVelocity * dt);
      st.vel.copy(before.tangent).multiplyScalar(st.speed).addScaledVector(before.side, this._laneVelocity);
      this._takeOff(before, 0);
      return;
    }
    const front = this.track.sample(st.s + 1.48), rear = this.track.sample(st.s - 1.48);
    const tangent = front.gap || rear.gap ? surface.tangent.clone() : front.p.clone().sub(rear.p).normalize();
    const normal = surface.normal.clone().addScaledVector(tangent, -surface.normal.dot(tangent)).normalize();
    const side = tangent.clone().cross(normal).normalize();
    const previousForward = X.clone().applyQuaternion(this._baseQuaternion);
    const previousSide = Z.clone().applyQuaternion(this._baseQuaternion);
    const target = new THREE.Quaternion().setFromRotationMatrix(this._matrix.makeBasis(tangent, normal, side));
    this._baseQuaternion.slerp(target, 1 - Math.exp(-28 * dt));
    const currentForward = X.clone().applyQuaternion(this._baseQuaternion);
    const pitchChange = Math.atan2(previousForward.clone().cross(currentForward).dot(previousSide), previousForward.dot(currentForward));
    st.angularVelocity = pitchChange / dt;
    st.angle += pitchChange;
    const rollTarget = Math.round(st.roll / TAU) * TAU - controls.steer * 0.035;
    st.rollVelocity += ((rollTarget - st.roll) * 65 - st.rollVelocity * 15) * dt;
    st.roll += st.rollVelocity * dt;
    this._updateOrientation();
    const edge = surface.width / 2 - this._support(surface.side) - 0.08;
    if (Math.abs(st.lane) > edge) {
      st.lane = Math.sign(st.lane) * Math.max(0.1, edge);
      const impact = Math.abs(this._laneVelocity);
      this._laneVelocity *= -0.35;
      if (impact > 2 && this._sideHitCooldown <= 0) {
        this._damage({ body: impact * 0.7 + st.speed * 0.06, suspension: impact * 0.3 });
        st.speed *= 0.91; this._sideHitCooldown = 1.1; this._event('护栏擦碰 · 车身受损');
      }
    }
    st.pos.copy(surface.p).addScaledVector(surface.side, st.lane).addScaledVector(surface.normal, this._support(surface.normal) + 0.012);
    for (const support of [front, rear]) {
      if (support.gap) continue;
      const h = st.pos.clone().sub(support.p).dot(support.normal);
      const penetration = this._support(support.normal) - h;
      if (penetration > 0) st.pos.addScaledVector(surface.normal, penetration / Math.max(0.65, surface.normal.dot(support.normal)) + 0.005);
    }
    st.vel.copy(surface.tangent).multiplyScalar(st.speed).addScaledVector(surface.side, this._laneVelocity);
    const after = this.track.sample(Math.min(st.s + 0.75, this.track.length));
    const curvature = after.tangent.clone().sub(surface.tangent).dot(surface.normal) / 0.75;
    const requiredForce = st.speed ** 2 * curvature + gravity * surface.normal.y;
    if (st.jetActive || (!controls.magnet && requiredForce < -0.7)) {
      this._takeOff(surface, st.jetActive ? 2.4 : 0);
      if (st.jetActive) this._event('推进器点火');
    } else st.fuel = Math.min(100, st.fuel + 17 * dt);
  }

  _takeOff(surface, impulse) {
    const st = this.state;
    st.grounded = false; st.magnetActive = false;
    st.vel.addScaledVector(st.up, impulse);
    st.angularVelocity *= 0.32;
    this._airSpin = this._flightFlips = this._airTimeThisJump = 0;
  }

  _fly(dt, controls, gravity) {
    const st = this.state;
    this._previous.copy(st.pos); this._previousQuaternion.copy(st.quaternion);
    st.airtime += dt; this._airTimeThisJump += dt;
    const baseForward = X.clone().applyQuaternion(this._baseQuaternion);
    const baseSide = Z.clone().applyQuaternion(this._baseQuaternion);
    let pitchTorque = 0;
    if (!st.jetActive && st.vel.lengthSq() > 16) {
      const flow = st.vel.clone().normalize();
      const flowError = Math.atan2(baseForward.clone().cross(flow).dot(baseSide), baseForward.dot(flow));
      pitchTorque = clamp(flowError, -0.65, 0.65) * 1.5;
    }
    st.angularVelocity += (pitchTorque - st.angularVelocity * 1.8) * dt;
    const pitchDelta = st.angularVelocity * dt;
    st.angle += pitchDelta;
    this._baseQuaternion.multiply(this._rotation.setFromAxisAngle(Z, pitchDelta)).normalize();
    const rollTorque = controls.flip * (7.5 - st.damage.thrusters * 0.025);
    st.rollVelocity += (rollTorque - st.rollVelocity * (Math.abs(controls.flip) > 0.1 ? 1.8 : 2.1)) * dt;
    st.rollVelocity = clamp(st.rollVelocity, -4.4, 4.4);
    const rollDelta = st.rollVelocity * dt;
    st.roll += rollDelta; this._airSpin += rollDelta;
    this._updateOrientation();
    const spins = Math.floor((Math.abs(this._airSpin) + 1e-5) / TAU);
    if (spins > this._flightFlips) { st.flips += spins - this._flightFlips; this._flightFlips = spins; this._event(`${spins > 1 ? '连续' : '空中'}横滚 +600`); }
    st.vel.y -= gravity * dt;
    if (st.jetActive) {
      st.vel.addScaledVector(st.up, 28 * (1 - st.damage.thrusters * 0.005) * dt);
      st.fuel = Math.max(0, st.fuel - 25 * dt);
    }
    st.vel.addScaledVector(baseSide, controls.steer * 6 * dt);
    st.vel.x *= Math.exp(-0.012 * dt); st.vel.z *= Math.exp(-0.05 * dt);
    st.pos.addScaledVector(st.vel, dt); st.speed = st.vel.length();
    const hint = this.track.sample(this._hintS);
    this._hintS = clamp(this._hintS + st.vel.dot(hint.tangent) * dt, 0, this.track.length);
    const nearest = this.track.nearest(st.pos, this._hintS);
    if (nearest) {
      this._hintS = nearest.s; st.s = nearest.s; st.lane = nearest.lateral;
      if (Math.abs(nearest.lateral) > 65 || nearest.distance > 180) this._finish('偏离试验场', true);
    }
    this._collideHull();
    // The visible terrain is solid too: stop the hull at its surface before
    // either the vehicle or chase camera can travel underneath the ground.
    if (!st.finished && !st.grounded && st.pos.y - this._support(Y) <= -0.22) {
      st.pos.y = -0.22 + this._support(Y) + 0.015;
      st.vel.y = Math.max(0, st.vel.y);
      this._finish('坠落 · 撞击地面', true);
    }
  }

  _collideHull() {
    const st = this.state;
    let topContact = null, bestPenetration = 0;
    for (const surface of this._surfaces) {
      const dx = st.pos.x - surface.p.x, dy = st.pos.y - surface.p.y, dz = st.pos.z - surface.p.z;
      if (dx * dx + dy * dy + dz * dz > (surface.width / 2 + 4) ** 2) continue;
      const delta = st.pos.clone().sub(surface.p);
      const along = delta.dot(surface.tangent), lateral = delta.dot(surface.side);
      if (Math.abs(along) > surface.halfLength + this._support(surface.tangent) + 0.02
        || Math.abs(lateral) > surface.width / 2 + this._support(surface.side)) continue;
      const height = delta.dot(surface.normal);
      const previousHeight = this._previous.clone().sub(surface.p).dot(surface.normal);
      const bottom = this._support(surface.normal), penetration = bottom - height;
      const normalSpeed = st.vel.dot(surface.normal);
      const previousBottom = this._support(surface.normal, this._previousQuaternion);
      const sweptFromAbove = previousHeight >= previousBottom - 0.02;
      if ((height > -0.3 || sweptFromAbove) && penetration >= -0.015 && normalSpeed <= 1.2
        && previousHeight >= previousBottom - 0.15 && penetration > bestPenetration) {
        topContact = { ...surface, lateral, height, normalSpeed, along }; bestPenetration = penetration;
      }
      const undersideNormal = surface.normal.clone().negate();
      const undersideHeight = -height - ROAD_DEPTH, undersideSupport = this._support(undersideNormal);
      const sweptFromBelow = -previousHeight - ROAD_DEPTH >= this._support(undersideNormal, this._previousQuaternion) - 0.02;
      if (height < -ROAD_DEPTH / 2 && undersideHeight < undersideSupport
        && (undersideHeight > -0.35 || sweptFromBelow) && previousHeight < -ROAD_DEPTH / 2 && st.vel.dot(undersideNormal) < 0) {
        st.pos.addScaledVector(undersideNormal, undersideSupport - undersideHeight + 0.015);
        this._impactWall(undersideNormal, '撞击桥底');
      }
      if (height - bottom < 0.40 && height + this._support(surface.normal.clone().negate()) > 0) {
        const edge = surface.width / 2 - this._support(surface.side) - 0.03;
        const prevLane = this._previous.clone().sub(surface.p).dot(surface.side);
        if (Math.abs(lateral) > edge && Math.abs(prevLane) <= surface.width / 2 + 0.2 && lateral * st.vel.dot(surface.side) > 0) {
          const inward = surface.side.clone().multiplyScalar(-Math.sign(lateral));
          st.pos.addScaledVector(inward, Math.abs(lateral) - edge + 0.02); this._impactWall(inward, '护栏撞击');
        }
      }
    }
    if (topContact && !st.finished) {
      st.pos.addScaledVector(topContact.normal, bestPenetration + 0.015);
      const centerFrame = (this.track.nearestSolid ?? this.track.nearest).call(this.track, st.pos, topContact.s);
      if (centerFrame && Math.abs(centerFrame.along ?? 0) < 0.3 && Math.abs(centerFrame.lateral) < centerFrame.width / 2 - 0.5) this._land({ ...centerFrame, normalSpeed: topContact.normalSpeed });
      else {
        const vn = st.vel.dot(topContact.normal);
        if (vn < 0) st.vel.addScaledVector(topContact.normal, -vn * 1.05);
        st.angularVelocity *= 0.5;
      }
    }
    if (st.grounded || st.finished) return;
    for (const edge of this._ends) {
      const delta = st.pos.clone().sub(edge.p);
      const along = delta.dot(edge.outward), height = delta.dot(edge.normal), lateral = delta.dot(edge.side);
      const front = this._support(edge.outward), below = this._support(edge.normal), above = this._support(edge.normal.clone().negate());
      const previousAlong = this._previous.clone().sub(edge.p).dot(edge.outward);
      if (along > -0.15 && along < front && previousAlong >= front - 0.8
        && height - below < -0.03 && height + above > -ROAD_DEPTH
        && Math.abs(lateral) < edge.width / 2 + this._support(edge.side) && st.vel.dot(edge.outward) < 0) {
        st.pos.addScaledVector(edge.outward, front - along + 0.02); this._impactWall(edge.outward, '撞击断桥边缘');
      }
    }
  }

  _impactWall(normal, message) {
    const st = this.state, speed = Math.max(0, -st.vel.dot(normal));
    st.vel.addScaledVector(normal, speed * 1.12);
    if (this._impactCooldown > 0 || speed < 2) return;
    this._damage({ body: speed * 1.9, suspension: speed * 0.65, battery: Math.max(0, speed - 10), thrusters: speed * 0.4 });
    this._impactCooldown = 0.3; this._event(message);
    if (speed > 27) this._finish(`${message} · 严重碰撞`, true);
  }

  _land(surface) {
    const st = this.state, impact = Math.abs(surface.normalSpeed);
    const alignment = clamp(st.up.dot(surface.normal), -1, 1), angleError = Math.acos(alignment), severity = Math.max(0, impact - 7);
    if (this._impactCooldown <= 0) {
      this._damage({ body: severity * 1.05 + Math.max(0, angleError - 0.48) * (8 + impact * 0.8),
        suspension: severity * 1.5 + Math.max(0, angleError - 0.3) * 5 + Math.max(0, Math.abs(st.rollVelocity) - 2) * 3,
        battery: Math.max(0, impact - 13) * 0.8, thrusters: Math.max(0, impact - 12) * 0.65 + Math.max(0, angleError - 1.2) * 6 });
      this._impactCooldown = 0.18;
    }
    if (alignment < 0.15 && impact > 4) {
      this._damage({ body: 28, suspension: 14, battery: 8, thrusters: 8 });
      st.vel.addScaledVector(surface.normal, -Math.min(0, st.vel.dot(surface.normal)));
      this._finish(alignment < -0.3 ? '翻覆事故 · 车顶着地' : '侧翻事故 · 车身着地', true); return;
    }
    if (alignment < 0.45 || st.forward.dot(surface.tangent) < 0.25) {
      st.vel.addScaledVector(surface.normal, Math.max(0, -st.vel.dot(surface.normal)) * 1.12);
      st.rollVelocity *= 0.75; st.angularVelocity *= 0.6; return;
    }
    st.s = surface.s; st.lane = surface.lateral;
    st.speed = clamp(st.vel.dot(surface.tangent) * (1 - Math.min(0.5, angleError * 0.1 + severity * 0.012)), 0, 62);
    this._laneVelocity = clamp(st.vel.dot(surface.side), -9, 9);
    st.vel.copy(surface.tangent).multiplyScalar(st.speed).addScaledVector(surface.side, this._laneVelocity);
    st.grounded = true; st.jetActive = false;
    if (this._airTimeThisJump > 0.3) {
      if (impact < 10 && angleError < 0.4) { this._cleanLandings++; this._event('精准着陆 +250'); }
      else this._event(severity > 1 || angleError > 0.5 ? '硬着陆 · 检查车辆损伤' : '着陆成功');
    }
  }

  _damage(parts) {
    const st = this.state;
    for (const [part, amount] of Object.entries(parts)) st.damage[part] = clamp(st.damage[part] + amount, 0, 100);
    st.health = clamp(100 - st.damage.body * 0.45 - st.damage.suspension * 0.25 - st.damage.battery * 0.18 - st.damage.thrusters * 0.12, 0, 100);
  }
  _score() {
    const st = this.state;
    let points = Math.max(0, this._maxS - 3) * 4 + st.flips * 600 + st.airtime * 40 + this._cleanLandings * 250 + st.maxSpeed * 3 - (100 - st.health) * 8;
    if (st.finished && !st.failed) points += 2500 + Math.max(0, 100 - st.elapsed) * 15;
    return Math.max(0, Math.round(points));
  }
  _event(message) { this.state.lastEvent = message; this.state.eventTimer = 2.3; }
  _finish(reason, failed) {
    if (this.state.finished) return;
    const st = this.state;
    st.finished = true; st.failed = failed; st.reason = reason; st.jetActive = false;
    if (failed && reason.includes('坠落')) this._damage({ body: 65, suspension: 70, battery: 40, thrusters: 40 });
    st.score = this._score(); this._event(reason);
  }
  getResult() {
    const st = this.state, completed = st.finished && !st.failed;
    const grade = !completed ? 'D' : st.health >= 92 && st.elapsed < (this.track.goalTime ?? 70) ? 'S' : st.health >= 78 ? 'A' : st.health >= 50 ? 'B' : 'C';
    return { score: st.score, grade, time: st.elapsed, flips: st.flips, airtime: st.airtime, maxSpeed: st.maxSpeed * 3.6, health: st.health, damage: { ...st.damage }, reason: st.reason, completed };
  }
}
