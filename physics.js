import * as THREE from './vendor/three.module.js';

const TAU = Math.PI * 2;
const CLEARANCE = 0.85;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const finite = value => Number.isFinite(value) ? value : 0;

/** Playable stunt physics: tyre contact follows the ribbon; flight is ballistic.
 *  Magnetic assistance is deliberately a game mechanic, not a Tesla specification.
 *  All integration uses bounded 120 Hz substeps, independently of rendering rate.
 */
export class Simulator {
  constructor(track) {
    this.track = track;
    this.reset();
  }

  reset() {
    const start = this.track.sample(3);
    this.state = {
      pos: start.p.clone().addScaledVector(start.normal, CLEARANCE),
      vel: new THREE.Vector3(),
      angle: Math.atan2(start.tangent.y, start.tangent.x), angularVelocity: 0,
      speed: 0, s: 3, lane: 0, grounded: true, fuel: 100,
      damage: { body: 0, suspension: 0, battery: 0, thrusters: 0 }, health: 100,
      elapsed: 0, score: 0, flips: 0, airtime: 0, maxSpeed: 0,
      finished: false, failed: false, reason: '', checkpoint: 0,
      jetActive: false, magnetActive: true, lastEvent: '试车就绪', eventTimer: 2,
    };
    this._laneVelocity = 0;
    this._airSpin = 0;
    this._flightFlips = 0;
    this._maxS = 3;
    this._cleanLandings = 0;
    this._airTimeThisJump = 0;
    this._contactCooldown = 0;
    this._sideHitCooldown = 0;
    this._hintS = 3;
    this._checkpointIndex = -1;
    this._previous = new THREE.Vector3();
    this._scratch = new THREE.Vector3();
    return this.state;
  }

  step(dt, input = {}) {
    if (this.state.finished || !Number.isFinite(dt) || dt <= 0) return this.state;
    const safeDt = Math.min(dt, 0.1);
    const count = Math.ceil(safeDt * 120);
    const controls = {
      throttle: clamp(finite(input.throttle ?? 0), 0, 1),
      brake: clamp(finite(input.brake ?? 0), 0, 1),
      steer: clamp(finite(input.steer ?? 0), -1, 1),
      flip: clamp(finite(input.flip ?? 0), -1, 1),
      jet: !!input.jet, magnet: input.magnet !== false,
    };
    for (let i = 0; i < count && !this.state.finished; i++) this._step(safeDt / count, controls);
    return this.state;
  }

  _step(dt, controls) {
    const st = this.state;
    const gravity = this.track.gravity ?? this.track.grav ?? 9.81;
    st.elapsed += dt;
    st.eventTimer = Math.max(0, st.eventTimer - dt);
    this._contactCooldown = Math.max(0, this._contactCooldown - dt);
    this._sideHitCooldown = Math.max(0, this._sideHitCooldown - dt);
    st.jetActive = controls.jet && st.fuel > 0 && st.damage.thrusters < 95;
    st.magnetActive = controls.magnet && st.grounded;

    if (st.grounded) {
      let surface = this.track.sample(st.s);
      const driveHealth = 1 - st.damage.battery * 0.004;
      const acceleration = controls.throttle * 17 * driveHealth
        - controls.brake * 32 - st.speed * 0.07 - st.speed * st.speed * 0.0016
        - gravity * surface.tangent.y;
      st.speed = clamp(st.speed + acceleration * dt, 0, 62);
      this._laneVelocity += (controls.steer * (3.5 + st.speed * 0.08) - this._laneVelocity) * Math.min(1, dt * 7);
      st.lane += this._laneVelocity * dt;
      st.s = Math.min(this.track.length, st.s + st.speed * dt);
      this._hintS = st.s;
      surface = this.track.sample(st.s);
      st.angle += wrap(Math.atan2(surface.tangent.y, surface.tangent.x) - st.angle);
      st.angularVelocity = 0;

      const edge = surface.width / 2 - 1.05;
      if (Math.abs(st.lane) > edge && !surface.gap) {
        st.lane = Math.sign(st.lane) * edge;
        const impact = Math.abs(this._laneVelocity);
        this._laneVelocity *= -0.35;
        if (impact > 2 && this._sideHitCooldown <= 0) {
          this._damage({ body: impact * 0.7 + st.speed * 0.06, suspension: impact * 0.3 });
          st.speed *= 0.91;
          this._sideHitCooldown = 1.1;
          this._event('护栏擦碰 · 车身受损');
        }
      }

      st.pos.copy(surface.p).addScaledVector(surface.normal, CLEARANCE).addScaledVector(surface.side, st.lane);
      st.vel.copy(surface.tangent).multiplyScalar(st.speed).addScaledVector(surface.side, this._laneVelocity);
      // Positive normal curvature is a loop whose inside normal points to its centre.
      const after = this.track.sample(Math.min(st.s + 0.75, this.track.length));
      const curvature = this._scratch.copy(after.tangent).sub(surface.tangent).dot(surface.normal) / 0.75;
      const requiredNormalForce = st.speed * st.speed * curvature + gravity * surface.normal.y;
      const detachByGravity = !controls.magnet && requiredNormalForce < -0.7;
      if (st.jetActive || surface.gap || detachByGravity) {
        this._takeOff(surface, st.jetActive ? 2.4 : 0);
        if (st.jetActive) this._event('推进器点火');
      } else {
        st.fuel = Math.min(100, st.fuel + 17 * dt);
      }
    }

    if (!st.grounded) {
      this._previous.copy(st.pos);
      st.airtime += dt;
      this._airTimeThisJump += dt;
      const oldAngle = st.angle;
      const torque = controls.flip * (7.5 - st.damage.thrusters * 0.025);
      st.angularVelocity += (torque - st.angularVelocity * (Math.abs(controls.flip) > 0.1 ? 1.8 : 2.1)) * dt;
      st.angularVelocity = clamp(st.angularVelocity, -4.4, 4.4);
      st.angle += st.angularVelocity * dt;
      this._airSpin += st.angle - oldAngle;
      const spins = Math.floor((Math.abs(this._airSpin) + 1e-5) / TAU);
      if (spins > this._flightFlips) {
        st.flips += spins - this._flightFlips;
        this._flightFlips = spins;
        this._event(`${spins > 1 ? '连续' : '空中'}翻转 +600`);
      }

      st.vel.y -= gravity * dt;
      if (st.jetActive) {
        const force = 28 * (1 - st.damage.thrusters * 0.005);
        st.vel.x -= Math.sin(st.angle) * force * dt;
        st.vel.y += Math.cos(st.angle) * force * dt;
        st.fuel = Math.max(0, st.fuel - 25 * dt);
      }
      st.vel.z += controls.steer * 6 * dt;
      st.vel.z *= Math.exp(-0.2 * dt);
      st.vel.x *= Math.exp(-0.012 * dt);
      st.pos.addScaledVector(st.vel, dt);
      st.speed = st.vel.length();

      const hintSurface = this.track.sample(clamp(this._hintS, 0, this.track.length));
      this._hintS = clamp(this._hintS + st.vel.dot(hintSurface.tangent) * dt, 0, this.track.length);
      const contact = this.track.nearest(st.pos, this._hintS);
      if (contact) {
        this._hintS = contact.s;
        st.s = clamp(contact.s, 0, this.track.length);
        st.lane = contact.lateral;
        const height = Number.isFinite(contact.height) ? contact.height : this._scratch.copy(st.pos).sub(contact.p).dot(contact.normal);
        const previousHeight = this._scratch.copy(this._previous).sub(contact.p).dot(contact.normal);
        const normalSpeed = st.vel.dot(contact.normal);
        const withinRoad = Math.abs(contact.lateral) < contact.width / 2 - 0.35;
        if (!contact.gap && withinRoad && this._contactCooldown <= 0
          && height <= CLEARANCE && height > -1.8
          && previousHeight > -0.25 && normalSpeed < 0.5) {
          this._land(contact, normalSpeed);
        }
        if (Math.abs(contact.lateral) > 65 || contact.distance > 180) this._finish('偏离试验场', true);
      }
      if (st.pos.y < -28) this._finish('坠落 · 测试终止', true);
    }

    this._maxS = Math.max(this._maxS, st.s);
    st.maxSpeed = Math.max(st.maxSpeed, st.speed);
    const checkpoints = this.track.checkpoints ?? [];
    for (let i = this._checkpointIndex + 1; i < checkpoints.length; i++) {
      const checkpoint = typeof checkpoints[i] === 'number' ? checkpoints[i] : checkpoints[i].s;
      if (st.s >= checkpoint && st.grounded) {
        this._checkpointIndex = i;
        st.checkpoint = i + 1;
        this._event(`检查点 ${i + 1} / ${checkpoints.length}`);
      } else break;
    }
    st.score = this._score();
    if (!st.finished && st.health <= 10) this._finish('车辆严重损坏', true);
    if (!st.finished && st.s >= this.track.length - 2 && st.grounded) this._finish('测试完成', false);
    if (!st.finished && st.elapsed >= 180) this._finish('测试时间结束', true);
    st.magnetActive = controls.magnet && st.grounded;
  }

  _takeOff(surface, impulse) {
    const st = this.state;
    st.grounded = false;
    st.magnetActive = false;
    st.vel.addScaledVector(surface.normal, impulse);
    this._airSpin = 0;
    this._flightFlips = 0;
    this._airTimeThisJump = 0;
    this._contactCooldown = 0.12;
  }

  _land(surface, normalSpeed) {
    const st = this.state;
    const targetAngle = Math.atan2(surface.tangent.y, surface.tangent.x);
    const angleError = Math.abs(wrap(st.angle - targetAngle));
    const impact = Math.abs(normalSpeed);
    const rotationalImpact = Math.abs(st.angularVelocity);
    const severity = Math.max(0, impact - 7);
    this._damage({
      body: severity * 1.15 + Math.max(0, angleError - 0.48) * (8 + impact * 0.8),
      suspension: severity * 1.65 + Math.max(0, angleError - 0.3) * 5 + Math.max(0, rotationalImpact - 2) * 3,
      battery: Math.max(0, impact - 13) * 0.85,
      thrusters: Math.max(0, impact - 12) * 0.7 + Math.max(0, angleError - 1.2) * 6,
    });
    st.pos.copy(surface.p).addScaledVector(surface.normal, CLEARANCE).addScaledVector(surface.side, surface.lateral);
    st.s = surface.s;
    st.lane = surface.lateral;
    if (angleError > 1.55 && impact > 4) {
      this._damage({ body: 28, suspension: 14, battery: 8, thrusters: 8 });
      this._finish('翻覆事故 · 车顶着地', true);
      return;
    }
    st.speed = clamp(st.vel.dot(surface.tangent) * (1 - Math.min(0.65, angleError * 0.16 + severity * 0.015)), 0, 62);
    this._laneVelocity = clamp(st.vel.dot(surface.side), -9, 9);
    st.vel.copy(surface.tangent).multiplyScalar(st.speed).addScaledVector(surface.side, this._laneVelocity);
    st.angle += wrap(targetAngle - st.angle);
    st.angularVelocity = 0;
    st.grounded = true;
    st.jetActive = false;
    if (this._airTimeThisJump > 0.3) {
      if (impact < 10 && angleError < 0.4) {
        this._cleanLandings++;
        this._event('精准着陆 +250');
      } else this._event(severity > 1 || angleError > 0.5 ? '硬着陆 · 检查车辆损伤' : '着陆成功');
    }
    this._contactCooldown = 0.15;
  }

  _damage(parts) {
    const st = this.state;
    for (const [part, amount] of Object.entries(parts)) st.damage[part] = clamp(st.damage[part] + amount, 0, 100);
    st.health = clamp(100 - st.damage.body * 0.45 - st.damage.suspension * 0.25 - st.damage.battery * 0.18 - st.damage.thrusters * 0.12, 0, 100);
  }

  _score() {
    const st = this.state;
    let points = Math.max(0, this._maxS - 3) * 4 + st.flips * 600 + st.airtime * 40
      + this._cleanLandings * 250 + st.maxSpeed * 3 - (100 - st.health) * 8;
    if (st.finished && !st.failed) points += 2500 + Math.max(0, 100 - st.elapsed) * 15;
    return Math.max(0, Math.round(points));
  }

  _event(message) {
    this.state.lastEvent = message;
    this.state.eventTimer = 2.3;
  }

  _finish(reason, failed) {
    if (this.state.finished) return;
    const st = this.state;
    st.finished = true;
    st.failed = failed;
    st.reason = reason;
    st.jetActive = false;
    if (failed && reason.includes('坠落')) this._damage({ body: 65, suspension: 70, battery: 40, thrusters: 40 });
    st.score = this._score();
    this._event(reason);
  }

  getResult() {
    const st = this.state;
    const completed = st.finished && !st.failed;
    const grade = !completed ? 'D' : st.health >= 92 && st.elapsed < (this.track.goalTime ?? 70) ? 'S'
      : st.health >= 78 ? 'A' : st.health >= 50 ? 'B' : 'C';
    return {
      score: st.score, grade, time: st.elapsed, flips: st.flips, airtime: st.airtime,
      maxSpeed: st.maxSpeed * 3.6, health: st.health, damage: { ...st.damage },
      reason: st.reason, completed,
    };
  }
}
