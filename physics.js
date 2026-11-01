import * as THREE from './vendor/three.module.js';
import { getVehicle } from './vehicles.js';

const TAU = Math.PI * 2;
const CLEARANCE = 0.60;
const LENGTH = 2.28, WIDTH = 1.15, ROOF = 0.70, ROAD_DEPTH = 0.65;
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const finite = value => Number.isFinite(value) ? value : 0;

/** Road contact uses front/rear support and an oriented vehicle hull. Flight
 * uses gravity, local-up thrust and separate pitch/roll angular momentum.
 * Steering uses tyre forces and yaw; flip is independent longitudinal roll.
 * Magnetic adhesion is a game assist, not a production-vehicle claim. */
export class Simulator {
  constructor(track, vehicle = getVehicle('roadster')) {
    this.track = track;
    this.vehicle = typeof vehicle === 'string' ? getVehicle(vehicle) : { ...getVehicle('roadster'), ...vehicle };
    this._buildColliders(); this._buildObstacles(); this.reset();
  }

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
        this._ends.push({ ...frame, outward: frame.tangent.clone().multiplyScalar(sign), solidS: s - sign * 0.8 });
      }
    }
    for (const [index, zone] of (this.track.vanishZones ?? []).entries()) {
      for (const [s, sign] of [[zone.start, 1], [zone.end, -1]]) {
        const frame = this.track.sample(s);
        this._ends.push({ ...frame, outward: frame.tangent.clone().multiplyScalar(sign), dynamicZone: index, solidS: s - sign * 0.8 });
      }
    }
  }

  _buildObstacles() {
    this._obstacles = []; this._obstacleGrid = new Map(); this._largeObstacles = []; this._obstacleCell = 32;
    for (const source of this.track.obstacles ?? []) {
      let obstacle;
      if (source.type === 'sphere') {
        const { center, radius } = source;
        if (!center || !(radius > 0)) continue;
        obstacle = { type: 'sphere', x: center.x, z: center.z, radius,
          minX: center.x - radius, maxX: center.x + radius, minZ: center.z - radius, maxZ: center.z + radius,
          minY: source.minY ?? center.y - radius, maxY: source.maxY ?? center.y + radius };
      } else if (source.min && source.max) {
        obstacle = { type: 'box', minX: source.min.x, maxX: source.max.x, minY: source.min.y, maxY: source.max.y, minZ: source.min.z, maxZ: source.max.z };
      } else continue;
      if (!['minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ'].every(k => Number.isFinite(obstacle[k]))) continue;
      const index = this._obstacles.length; this._obstacles.push(obstacle);
      const x0 = Math.floor(obstacle.minX / 32), x1 = Math.floor(obstacle.maxX / 32), z0 = Math.floor(obstacle.minZ / 32), z1 = Math.floor(obstacle.maxZ / 32);
      if ((x1 - x0 + 1) * (z1 - z0 + 1) > 256) { this._largeObstacles.push(index); continue; }
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        const key = `${x},${z}`; if (!this._obstacleGrid.has(key)) this._obstacleGrid.set(key, []); this._obstacleGrid.get(key).push(index);
      }
    }
  }

  // Swept, oriented-hull extents against a spatially indexed scenery proxy.
  // A contact removes inward velocity while retaining motion along the wall.
  _collideScenery(previous) {
    if (!this._obstacles.length) return;
    const st = this.state, extentX = this._support(X), extentZ = this._support(Z), below = this._support(Y), above = this._support(Y.clone().negate());
    const x0 = Math.floor((Math.min(previous.x, st.pos.x) - extentX - .1) / 32), x1 = Math.floor((Math.max(previous.x, st.pos.x) + extentX + .1) / 32);
    const z0 = Math.floor((Math.min(previous.z, st.pos.z) - extentZ - .1) / 32), z1 = Math.floor((Math.max(previous.z, st.pos.z) + extentZ + .1) / 32);
    const candidates = new Set(this._largeObstacles);
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > 256) this._obstacles.forEach((_, i) => candidates.add(i));
    else for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (const i of this._obstacleGrid.get(`${x},${z}`) ?? []) candidates.add(i);
    let contacted = false;
    for (let pass = 0; pass < 2; pass++) for (const index of candidates) {
      const obstacle = this._obstacles[index];
      if (Math.min(previous.y, st.pos.y) - below >= obstacle.maxY || Math.max(previous.y, st.pos.y) + above <= obstacle.minY) continue;
      const movement = st.pos.clone().sub(previous), normal = new THREE.Vector3(); let t = Infinity, depth = 0;
      if (obstacle.type === 'sphere') {
        const dx = st.pos.x - obstacle.x, dz = st.pos.z - obstacle.z, distance = Math.hypot(dx, dz);
        normal.set(distance > 1e-7 ? dx / distance : -1, 0, distance > 1e-7 ? dz / distance : 0);
        const radius = obstacle.radius + this._support(normal);
        const sx = previous.x - obstacle.x, sz = previous.z - obstacle.z, a = movement.x ** 2 + movement.z ** 2;
        const b = 2 * (sx * movement.x + sz * movement.z), c = sx * sx + sz * sz - radius * radius, discriminant = b * b - 4 * a * c;
        if (c >= 0) {
          if (a > 1e-10 && discriminant >= 0) {
            const hit = (-b - Math.sqrt(discriminant)) / (2 * a);
            if (hit >= 0 && hit <= 1) { t = hit; normal.set(sx + movement.x * t, 0, sz + movement.z * t).normalize(); }
          }
        } else if (distance < radius) { depth = radius - distance; t = 1; }
      } else {
        const minX = obstacle.minX - extentX, maxX = obstacle.maxX + extentX, minZ = obstacle.minZ - extentZ, maxZ = obstacle.maxZ + extentZ;
        const inside = st.pos.x > minX && st.pos.x < maxX && st.pos.z > minZ && st.pos.z < maxZ;
        const wasInside = previous.x > minX && previous.x < maxX && previous.z > minZ && previous.z < maxZ;
        if (wasInside && inside) {
          const distances = [st.pos.x - minX, maxX - st.pos.x, st.pos.z - minZ, maxZ - st.pos.z];
          depth = Math.min(...distances); const side = distances.indexOf(depth); normal.set(side === 0 ? -1 : side === 1 ? 1 : 0, 0, side === 2 ? -1 : side === 3 ? 1 : 0); t = 1;
        } else if (!wasInside) {
          let enter = 0, exit = 1, axis = '', sign = 0, valid = true;
          for (const [key, lo, hi] of [['x', minX, maxX], ['z', minZ, maxZ]]) {
            if (Math.abs(movement[key]) < 1e-10) { if (previous[key] < lo || previous[key] > hi) valid = false; continue; }
            let near = (lo - previous[key]) / movement[key], far = (hi - previous[key]) / movement[key], direction = -1;
            if (near > far) { [near, far] = [far, near]; direction = 1; }
            if (near >= enter) { enter = near; axis = key; sign = direction; } exit = Math.min(exit, far);
          }
          if (valid && enter <= exit && enter >= 0 && enter <= 1 && axis) { t = enter; normal[axis] = sign; }
        }
      }
      if (!Number.isFinite(t)) continue;
      const hitY = THREE.MathUtils.lerp(previous.y, st.pos.y, t);
      if (hitY - below >= obstacle.maxY || hitY + above <= obstacle.minY) continue;
      if (depth > 0) st.pos.addScaledVector(normal, depth + .015);
      else {
        const rest = movement.multiplyScalar(1 - t); rest.addScaledVector(normal, -Math.min(0, rest.dot(normal)));
        st.pos.lerpVectors(previous, st.pos, t).add(rest).addScaledVector(normal, .015);
      }
      this._impactWall(normal, '撞击场景障碍'); st.yawRate *= .55; contacted = true;
    }
    if (contacted) {
      if (st.grounded) {
        const forward = new THREE.Vector3(Math.cos(st.headingError), 0, Math.sin(st.headingError)), side = new THREE.Vector3(-forward.z, 0, forward.x);
        st.speed = clamp(st.vel.dot(forward), 0, this.vehicle.maxSpeed); this._tireLateralVelocity = clamp(st.vel.dot(side), -18, 18);
        const floor = this._terrainFrame(st.pos); st.pos.y = floor.p.y + this._support(floor.normal) / Math.max(.3, floor.normal.y) + .012;
      } else st.speed = st.vel.length();
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
      speed: 0, s: 3, lane: 0, grounded: true, offroad: false, fuel: 100,
      damage: { body: 0, suspension: 0, battery: 0, thrusters: 0 }, health: 100,
      elapsed: 0, score: 0, flips: 0, airtime: 0, maxSpeed: 0,
      finished: false, failed: false, reason: '', checkpoint: 0,
      jetActive: false, magnetActive: true, lastEvent: '试车就绪', eventTimer: 2,
      vehicleId: this.vehicle.id, steerAngle: 0, headingError: 0, yawRate: 0,
      slip: 0, suspension: 0, rollInput: 0, landingImpact: 0, acceleration: 0,
      platforms: (this.track.vanishZones ?? []).map((zone, i) => ({ id: zone.id ?? String(i), triggeredAt: null, remaining: null, vanished: false })),
    };
    this._laneVelocity = this._airSpin = this._flightFlips = this._cleanLandings = 0;
    this._tireLateralVelocity = this._bodyPitch = this._bodyPitchVelocity = this._lateralAcceleration = 0;
    this._airTimeThisJump = this._impactCooldown = this._sideHitCooldown = 0;
    this._maxS = this._hintS = 3;
    this._checkpointIndex = -1;
    this._previous = new THREE.Vector3();
    this._stepStart = new THREE.Vector3();
    this._previousQuaternion = this.state.quaternion.clone();
    this._scratch = new THREE.Vector3();
    this._matrix = new THREE.Matrix4();
    this._rotation = new THREE.Quaternion();
    return this.state;
  }

  isSolid(s) {
    if (this.track.sample(s).gap) return false;
    if (typeof this.track.isSolid === 'function' && !this.track.isSolid(s, this.state.elapsed)) return false;
    return !(this.track.vanishZones ?? []).some((zone, i) => this.state.platforms[i].vanished && s >= zone.start && s <= zone.end);
  }

  _updatePlatforms() {
    for (const [i, zone] of (this.track.vanishZones ?? []).entries()) {
      const status = this.state.platforms[i];
      if (status.triggeredAt === null && this.state.s >= (zone.triggerS ?? zone.start)) {
        status.triggeredAt = this.state.elapsed;
        this._event('前方平台即将消失 · 准备喷气');
      }
      if (status.triggeredAt !== null) {
        status.remaining = Math.max(0, (zone.delay ?? 1.2) - (this.state.elapsed - status.triggeredAt));
        if (!status.vanished && status.remaining <= 1e-8) { status.vanished = true; this._event('平台消失 · 保持飞行'); }
      }
    }
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
    this._stepStart.copy(st.pos);
    st.elapsed += dt;
    this._updatePlatforms();
    st.rollInput = st.grounded ? 0 : controls.flip;
    st.landingImpact *= Math.exp(-dt * 5.5);
    st.suspension *= Math.exp(-dt * 8);
    st.eventTimer = Math.max(0, st.eventTimer - dt);
    this._impactCooldown = Math.max(0, this._impactCooldown - dt);
    this._sideHitCooldown = Math.max(0, this._sideHitCooldown - dt);
    st.jetActive = controls.jet && st.fuel > 0 && st.damage.thrusters < 95;
    st.magnetActive = controls.magnet && st.grounded && !st.offroad;
    if (st.grounded) {
      if (st.offroad) this._driveOffroad(dt, controls, gravity);
      else this._drive(dt, controls, gravity);
    }
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
    if (!st.finished) this._checkFinishGate();
    st.magnetActive = controls.magnet && st.grounded && !st.offroad;
  }

  _drive(dt, controls, gravity) {
    const st = this.state, v = this.vehicle, before = this.track.sample(st.s);
    if (!this.isSolid(st.s)) { this._takeOff(before, 0); return; }
    const previousSpeed = st.speed;
    const traction = v.grip * gravity * (1 - st.damage.suspension * 0.004);
    const acceleration = controls.throttle * v.acceleration * (1 - st.damage.battery * 0.004)
      - controls.brake * v.brake - st.speed * 0.07 - st.speed ** 2 * 0.0016
      - gravity * before.tangent.y * Math.cos(st.headingError);
    st.speed = clamp(st.speed + acceleration * dt, 0, v.maxSpeed);
    st.acceleration = (st.speed - previousSpeed) / dt;

    // Smoothed front-wheel steering feeds a bicycle yaw model. At speed, tyre
    // adhesion limits turning force and the remaining demand becomes slip.
    const steerTarget = controls.steer * v.maxSteer / (1 + st.speed / 22);
    st.steerAngle += (steerTarget - st.steerAngle) * (1 - Math.exp(-v.steerResponse * dt));
    const desiredYawRate = st.speed / v.wheelbase * Math.tan(st.steerAngle) / (1 + (st.speed / 38) ** 2);
    const gripYawRate = traction / Math.max(4, st.speed);
    const yawTarget = clamp(desiredYawRate, -gripYawRate * 1.16, gripYawRate * 1.16);
    st.yawRate += (yawTarget - st.yawRate) * (1 - Math.exp(-v.yawResponse * dt));
    st.headingError = clamp(st.headingError + st.yawRate * dt, -1.12, 1.12);

    // Rotating the chassis does not instantly rotate its velocity. Lateral
    // tyre force pulls that velocity into line, up to the available grip.
    this._tireLateralVelocity -= st.speed * st.yawRate * dt;
    const lateralForce = clamp(-this._tireLateralVelocity * v.cornering, -traction, traction);
    this._tireLateralVelocity += lateralForce * dt;
    this._lateralAcceleration = lateralForce;
    const c = Math.cos(st.headingError), sn = Math.sin(st.headingError);
    const forwardSpeed = st.speed * c - this._tireLateralVelocity * sn;
    this._laneVelocity = st.speed * sn + this._tireLateralVelocity * c;
    const slipTarget = clamp(Math.abs(this._tireLateralVelocity) / (1.5 + st.speed * 0.09)
      + Math.max(0, Math.abs(desiredYawRate) - gripYawRate) * 0.35, 0, 1);
    st.slip += (slipTarget - st.slip) * (1 - Math.exp(-dt * 9));
    st.lane += this._laneVelocity * dt;
    st.s = clamp(st.s + forwardSpeed * dt, 0, this.track.length);
    this._hintS = st.s;
    const surface = this.track.sample(st.s);
    if (!this.isSolid(st.s) || st.s >= this.track.length - 0.05 || st.s <= 0.05) {
      st.pos.addScaledVector(before.tangent, forwardSpeed * dt).addScaledVector(before.side, this._laneVelocity * dt);
      st.vel.copy(before.tangent).multiplyScalar(forwardSpeed).addScaledVector(before.side, this._laneVelocity);
      this._takeOff(before, 0);
      return;
    }
    const front = this.track.sample(st.s + v.wheelbase / 2), rear = this.track.sample(st.s - v.wheelbase / 2);
    const roadTangent = !this.isSolid(front.s) || !this.isSolid(rear.s) ? surface.tangent.clone() : front.p.clone().sub(rear.p).normalize();
    const normal = surface.normal.clone().addScaledVector(roadTangent, -surface.normal.dot(roadTangent)).normalize();
    const roadSide = roadTangent.clone().cross(normal).normalize();
    const tangent = roadTangent.multiplyScalar(c).addScaledVector(roadSide, sn).normalize();
    const side = tangent.clone().cross(normal).normalize();
    const previousForward = X.clone().applyQuaternion(this._baseQuaternion);
    const previousSide = Z.clone().applyQuaternion(this._baseQuaternion);
    const target = new THREE.Quaternion().setFromRotationMatrix(this._matrix.makeBasis(tangent, normal, side));
    const pitchTarget = clamp(st.acceleration * v.bodyPitch, -0.10, 0.075);
    this._bodyPitchVelocity += ((pitchTarget - this._bodyPitch) * v.suspensionRate - this._bodyPitchVelocity * v.suspensionDamping) * dt;
    this._bodyPitch += this._bodyPitchVelocity * dt;
    target.multiply(this._rotation.setFromAxisAngle(Z, this._bodyPitch));
    this._baseQuaternion.slerp(target, 1 - Math.exp(-28 * dt));
    const currentForward = X.clone().applyQuaternion(this._baseQuaternion);
    const pitchChange = Math.atan2(previousForward.clone().cross(currentForward).dot(previousSide), previousForward.dot(currentForward));
    st.angularVelocity = pitchChange / dt;
    st.angle += pitchChange;
    const rollTarget = Math.round(st.roll / TAU) * TAU - lateralForce * v.bodyRoll;
    st.rollVelocity += ((rollTarget - st.roll) * v.suspensionRate - st.rollVelocity * v.suspensionDamping) * dt;
    st.roll += st.rollVelocity * dt;
    st.suspension = clamp(st.suspension + (Math.abs(st.acceleration) * 0.012 + Math.abs(lateralForce) * 0.01) * dt * 6, 0, 1);
    this._updateOrientation();
    const edge = surface.width / 2 - this._support(surface.side) - 0.08;
    if (!this.track.openEdges && Math.abs(st.lane) > edge) {
      st.lane = Math.sign(st.lane) * Math.max(0.1, edge);
      const impact = Math.abs(this._laneVelocity);
      this._laneVelocity *= -0.35;
      st.headingError *= 0.35; st.yawRate *= 0.25;
      this._tireLateralVelocity = this._laneVelocity - st.speed * Math.sin(st.headingError);
      if (impact > 2 && this._sideHitCooldown <= 0) {
        this._damage({ body: impact * 0.7 + st.speed * 0.06, suspension: impact * 0.3 });
        st.speed *= 0.91; this._sideHitCooldown = 1.1; this._event('护栏擦碰 · 车身受损');
      }
    }
    st.pos.copy(surface.p).addScaledVector(surface.side, st.lane).addScaledVector(surface.normal, this._support(surface.normal) + 0.012);
    for (const support of [front, rear]) {
      if (!this.isSolid(support.s)) continue;
      const h = st.pos.clone().sub(support.p).dot(support.normal);
      const penetration = this._support(support.normal) - h;
      if (penetration > 0) st.pos.addScaledVector(surface.normal, penetration / Math.max(0.65, surface.normal.dot(support.normal)) + 0.005);
    }
    st.vel.copy(surface.tangent).multiplyScalar(forwardSpeed).addScaledVector(surface.side, this._laneVelocity);
    if (this.track.openEdges && Math.abs(st.lane) > surface.width / 2 + .05) {
      this._takeOff(surface, 0); this._event('驶离悬空跑道 · 自由探索'); return;
    }
    const after = this.track.sample(Math.min(st.s + 0.75, this.track.length));
    const curvature = after.tangent.clone().sub(surface.tangent).dot(surface.normal) / 0.75;
    const requiredForce = st.speed ** 2 * curvature + gravity * surface.normal.y;
    if (st.jetActive || (!controls.magnet && requiredForce < -0.7)) {
      this._takeOff(surface, st.jetActive ? 2.4 : 0);
      if (st.jetActive) this._event('推进器点火');
    } else st.fuel = Math.min(100, st.fuel + 17 * dt);
  }

  _terrainHeight(x, z) {
    const result = this.track.terrainHeightAt?.(x, z);
    return Number.isFinite(result) ? result : this.track.groundY ?? -0.22;
  }

  _terrainFrame(position) {
    const x = position.x, z = position.z, delta = 0.35;
    const dx = (this._terrainHeight(x + delta, z) - this._terrainHeight(x - delta, z)) / (delta * 2);
    const dz = (this._terrainHeight(x, z + delta) - this._terrainHeight(x, z - delta)) / (delta * 2);
    const normal = new THREE.Vector3(-dx, 1, -dz).normalize();
    const tangent = X.clone().addScaledVector(normal, -normal.x).normalize();
    return { p: new THREE.Vector3(x, this._terrainHeight(x, z), z), normal, tangent, side: tangent.clone().cross(normal).normalize() };
  }

  _driveOffroad(dt, controls, gravity) {
    const st = this.state, v = this.vehicle;
    const surface = this._terrainFrame(st.pos), previousSpeed = st.speed;
    const slope = st.forward.y;
    const acceleration = controls.throttle * v.acceleration * (1 - st.damage.battery * 0.004)
      - controls.brake * v.brake - st.speed * 0.10 - st.speed ** 2 * 0.0018 - gravity * slope;
    st.speed = clamp(st.speed + acceleration * dt, 0, v.maxSpeed);
    st.acceleration = (st.speed - previousSpeed) / dt;
    st.steerAngle += (controls.steer * v.maxSteer / (1 + st.speed / 22) - st.steerAngle) * (1 - Math.exp(-dt * v.steerResponse));
    const grip = v.grip * gravity * 0.88 * (1 - st.damage.suspension * 0.004);
    const desiredYaw = st.speed / v.wheelbase * Math.tan(st.steerAngle) / (1 + (st.speed / 38) ** 2);
    const rateLimit = grip / Math.max(4, st.speed);
    st.yawRate += (clamp(desiredYaw, -rateLimit * 1.16, rateLimit * 1.16) - st.yawRate) * (1 - Math.exp(-dt * v.yawResponse));
    st.headingError += st.yawRate * dt;
    this._tireLateralVelocity -= st.speed * st.yawRate * dt;
    const lateralForce = clamp(-this._tireLateralVelocity * v.cornering, -grip, grip);
    this._tireLateralVelocity += lateralForce * dt;
    const forward = new THREE.Vector3(Math.cos(st.headingError), 0, Math.sin(st.headingError));
    forward.addScaledVector(surface.normal, -forward.dot(surface.normal)).normalize();
    const side = forward.clone().cross(surface.normal).normalize();
    st.vel.copy(forward).multiplyScalar(st.speed).addScaledVector(side, this._tireLateralVelocity);
    st.pos.addScaledVector(st.vel, dt);
    this._bodyPitchVelocity += ((clamp(st.acceleration * v.bodyPitch, -0.1, 0.075) - this._bodyPitch) * v.suspensionRate - this._bodyPitchVelocity * v.suspensionDamping) * dt;
    this._bodyPitch += this._bodyPitchVelocity * dt;
    const target = new THREE.Quaternion().setFromRotationMatrix(this._matrix.makeBasis(forward, surface.normal, side));
    target.multiply(this._rotation.setFromAxisAngle(Z, this._bodyPitch));
    this._baseQuaternion.slerp(target, 1 - Math.exp(-dt * 24));
    const rollTarget = Math.round(st.roll / TAU) * TAU - lateralForce * v.bodyRoll;
    st.rollVelocity += ((rollTarget - st.roll) * v.suspensionRate - st.rollVelocity * v.suspensionDamping) * dt;
    st.roll += st.rollVelocity * dt;
    st.slip += (clamp(Math.abs(this._tireLateralVelocity) / (1.5 + st.speed * 0.09), 0, 1) - st.slip) * (1 - Math.exp(-dt * 9));
    st.suspension = clamp(st.suspension + (Math.abs(st.acceleration) * 0.012 + Math.abs(lateralForce) * 0.01) * dt * 6, 0, 1);
    this._updateOrientation();
    const floor = this._terrainFrame(st.pos);
    st.pos.y = floor.p.y + this._support(floor.normal) / Math.max(0.3, floor.normal.y) + 0.012;
    this._collideScenery(this._stepStart);
    const near = this.track.nearest(st.pos);
    if (near) { st.s = near.s; st.lane = near.lateral; this._hintS = near.s; }
    if (st.jetActive) { this._takeOff(floor, 2.4); this._event('推进器点火'); }
    else st.fuel = Math.min(100, st.fuel + 17 * dt);
  }

  _checkFinishGate() {
    const st = this.state, gate = this.track.finishGate ?? this.track.finish ?? {};
    const frame = this.track.sample(gate.s ?? this.track.length - 8);
    const before = this._stepStart.clone().sub(frame.p).dot(frame.tangent);
    const after = st.pos.clone().sub(frame.p).dot(frame.tangent);
    if (before >= 0 || after < 0 || st.vel.dot(frame.tangent) <= 0.1) return;
    const t = clamp(-before / Math.max(1e-8, after - before), 0, 1);
    const intersection = this._stepStart.clone().lerp(st.pos, t).sub(frame.p);
    const lateral = Math.abs(intersection.dot(frame.side)), height = intersection.dot(frame.normal);
    const width = gate.width ?? frame.width, gateHeight = gate.height ?? 5.9;
    if (lateral + this._support(frame.side) <= width / 2 - 0.1
      && height - this._support(frame.normal) >= -0.2
      && height + this._support(frame.normal.clone().negate()) <= gateHeight) this._finish('测试完成 · 穿过终点门', false);
  }

  recoverToTrack() {
    const st = this.state;
    let best = null, bestDistance = Infinity;
    const gateS = this.track.finishGate?.s ?? this.track.finish?.s ?? this.track.length - 8;
    for (const surface of this._surfaces) {
      if (surface.s < 3 || surface.s > gateS - 10 || !this.isSolid(surface.s)) continue;
      const distance = st.pos.distanceToSquared(surface.p);
      if (distance < bestDistance) { bestDistance = distance; best = surface; }
    }
    if (!best) return false;
    this._baseQuaternion.setFromRotationMatrix(this._matrix.makeBasis(best.tangent, best.normal, best.side));
    Object.assign(st, { grounded: true, offroad: false, s: best.s, lane: 0, speed: 0, roll: 0, rollVelocity: 0,
      angularVelocity: 0, steerAngle: 0, headingError: 0, yawRate: 0, slip: 0, suspension: 0, landingImpact: 0,
      jetActive: false, rollInput: 0, angle: Math.atan2(best.tangent.y, best.tangent.x) });
    st.vel.set(0, 0, 0); this._hintS = best.s;
    this._tireLateralVelocity = this._laneVelocity = this._bodyPitch = this._bodyPitchVelocity = 0;
    this._updateOrientation();
    st.pos.copy(best.p).addScaledVector(best.normal, this._support(best.normal) + 0.02);
    this._event('已返回最近的安全路面');
    return true;
  }

  _takeOff(surface, impulse) {
    const st = this.state;
    st.grounded = false; st.magnetActive = false;
    st.suspension = 0;
    st.vel.addScaledVector(st.up, impulse);
    st.angularVelocity *= 0.32;
    this._airSpin = this._flightFlips = this._airTimeThisJump = 0;
  }

  _fly(dt, controls, gravity) {
    const st = this.state;
    this._previous.copy(st.pos); this._previousQuaternion.copy(st.quaternion);
    st.airtime += dt; this._airTimeThisJump += dt;
    st.rollInput = controls.flip;
    st.steerAngle += (controls.steer * this.vehicle.maxSteer - st.steerAngle) * (1 - Math.exp(-dt * 6));
    st.slip *= Math.exp(-dt * 4);
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
    const rollTorque = controls.flip * (this.vehicle.rollTorque - st.damage.thrusters * 0.025);
    st.rollVelocity += (rollTorque - st.rollVelocity * (Math.abs(controls.flip) > 0.1 ? 1.8 : 2.1)) * dt;
    st.rollVelocity = clamp(st.rollVelocity, -4.4, 4.4);
    const rollDelta = st.rollVelocity * dt;
    st.roll += rollDelta; this._airSpin += rollDelta;
    this._updateOrientation();
    const spins = Math.floor((Math.abs(this._airSpin) + 1e-5) / TAU);
    if (spins > this._flightFlips) { st.flips += spins - this._flightFlips; this._flightFlips = spins; this._event(`${spins > 1 ? '连续' : '空中'}横滚 +600`); }
    st.vel.y -= gravity * dt;
    if (st.jetActive) {
      st.vel.addScaledVector(st.up, this.vehicle.jetForce / this.vehicle.mass * (1 - st.damage.thrusters * 0.005) * dt);
      st.fuel = Math.max(0, st.fuel - this.vehicle.fuelBurn * dt);
    }
    // Steering moves the front wheels in flight, but tyres cannot push on air.
    st.vel.x *= Math.exp(-0.012 * dt); st.vel.z *= Math.exp(-0.05 * dt);
    st.pos.addScaledVector(st.vel, dt); st.speed = st.vel.length();
    const hint = this.track.sample(this._hintS);
    this._hintS = clamp(this._hintS + st.vel.dot(hint.tangent) * dt, 0, this.track.length);
    const nearest = this.track.nearest(st.pos, this._hintS);
    if (nearest) {
      this._hintS = nearest.s; st.s = nearest.s; st.lane = nearest.lateral;
    }
    this._collideHull();
    if (!st.grounded && !st.finished) this._collideScenery(this._previous);
    const terrain = this._terrainFrame(st.pos);
    const height = st.pos.clone().sub(terrain.p).dot(terrain.normal);
    if (!st.finished && !st.grounded && height <= this._support(terrain.normal)) {
      st.pos.addScaledVector(terrain.normal, this._support(terrain.normal) - height + 0.015);
      this._landTerrain(terrain);
    }
  }

  _landTerrain(surface) {
    const st = this.state, impact = Math.max(0, -st.vel.dot(surface.normal));
    const alignment = st.up.dot(surface.normal), severity = Math.max(0, impact - 7);
    st.landingImpact = impact; st.suspension = clamp(impact / 20, 0, 1);
    this._damage({ body: severity * 1.1 + Math.max(0, 0.5 - alignment) * 12,
      suspension: severity * 1.5, battery: Math.max(0, impact - 15) * 0.7, thrusters: Math.max(0, impact - 15) * 0.6 });
    if ((alignment < 0.15 && impact > 4) || impact > 38) {
      st.vel.addScaledVector(surface.normal, Math.max(0, -st.vel.dot(surface.normal)));
      this._finish(alignment < 0.15 ? '地面翻覆事故' : '地面撞击过重', true); return;
    }
    st.headingError = Math.atan2(st.forward.z, st.forward.x);
    const forward = new THREE.Vector3(Math.cos(st.headingError), 0, Math.sin(st.headingError));
    const side = forward.clone().cross(surface.normal).normalize();
    st.speed = clamp(st.vel.dot(forward), 0, this.vehicle.maxSpeed);
    this._tireLateralVelocity = clamp(st.vel.dot(side), -18, 18);
    st.vel.addScaledVector(surface.normal, -st.vel.dot(surface.normal));
    st.grounded = true; st.offroad = true; st.jetActive = false; st.rollInput = 0; st.yawRate = 0;
    this._event(impact > 10 ? '地面硬着陆 · 可继续探索' : '已进入自由探索');
  }

  _collideHull() {
    const st = this.state;
    let topContact = null, bestPenetration = 0;
    for (const surface of this._surfaces) {
      const dx = st.pos.x - surface.p.x, dy = st.pos.y - surface.p.y, dz = st.pos.z - surface.p.z;
      if (dx * dx + dy * dy + dz * dz > (surface.width / 2 + 4) ** 2) continue;
      if (!this.isSolid(surface.s)) continue;
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
      if (!this.track.openEdges && height - bottom < 0.40 && height + this._support(surface.normal.clone().negate()) > 0) {
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
      if (centerFrame && this.isSolid(centerFrame.s) && Math.abs(centerFrame.along ?? 0) < 0.3 && Math.abs(centerFrame.lateral) < centerFrame.width / 2 - 0.5) this._land({ ...centerFrame, normalSpeed: topContact.normalSpeed });
      else {
        const vn = st.vel.dot(topContact.normal);
        if (vn < 0) st.vel.addScaledVector(topContact.normal, -vn * 1.05);
        st.angularVelocity *= 0.5;
      }
    }
    if (st.grounded || st.finished) return;
    for (const edge of this._ends) {
      if (Number.isInteger(edge.dynamicZone) && !st.platforms[edge.dynamicZone].vanished) continue;
      if (!this.isSolid(edge.solidS)) continue;
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
    st.landingImpact = Math.max(st.landingImpact, impact);
    st.suspension = clamp(impact / 20, 0, 1);
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
    st.headingError = clamp(Math.atan2(st.forward.dot(surface.side), st.forward.dot(surface.tangent)), -1.12, 1.12);
    const wheelForward = surface.tangent.clone().multiplyScalar(Math.cos(st.headingError)).addScaledVector(surface.side, Math.sin(st.headingError));
    const wheelSide = wheelForward.clone().cross(surface.normal).normalize();
    this._tireLateralVelocity = clamp(st.vel.dot(wheelSide), -18, 18);
    st.speed = clamp(st.vel.dot(wheelForward) * (1 - Math.min(0.5, angleError * 0.1 + severity * 0.012)), 0, this.vehicle.maxSpeed);
    this._laneVelocity = clamp(st.vel.dot(surface.side), -9, 9);
    st.vel.copy(surface.tangent).multiplyScalar(st.speed).addScaledVector(surface.side, this._laneVelocity);
    st.grounded = true; st.offroad = false; st.jetActive = false; st.rollInput = 0; st.yawRate *= 0.35;
    if (this._airTimeThisJump > 0.3) {
      if (impact < 10 && angleError < 0.4) { this._cleanLandings++; this._event('精准着陆 +250'); }
      else this._event(severity > 1 || angleError > 0.5 ? '硬着陆 · 检查车辆损伤' : '着陆成功');
    }
  }

  _damage(parts) {
    const st = this.state;
    for (const [part, amount] of Object.entries(parts)) st.damage[part] = clamp(st.damage[part] + amount * this.vehicle.damageFactor, 0, 100);
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
    st.finished = true; st.failed = failed; st.reason = reason; st.jetActive = false; st.rollInput = 0;
    if (failed && reason.includes('坠落')) this._damage({ body: 65, suspension: 70, battery: 40, thrusters: 40 });
    st.score = this._score(); this._event(reason);
  }
  getResult() {
    const st = this.state, completed = st.finished && !st.failed;
    const grade = !completed ? 'D' : st.health >= 92 && st.elapsed < (this.track.goalTime ?? 70) ? 'S' : st.health >= 78 ? 'A' : st.health >= 50 ? 'B' : 'C';
    return { score: st.score, grade, time: st.elapsed, flips: st.flips, airtime: st.airtime, maxSpeed: st.maxSpeed * 3.6, health: st.health, damage: { ...st.damage }, reason: st.reason, completed };
  }
}
