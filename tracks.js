import { Vector3 } from './vendor/three.module.js';

export const TRACKS = [
  { id: 'proving', name: '赤砂试验场', subtitle: 'DESERT PROVING GROUND', difficulty: '入门', color: '#ffb15b', description: '宽阔直道、起伏路面和一道小飞跃。先练习喷气与平稳着陆。', goalTime: 34, environment: 'desert', width: 18, gravity: 9.81 },
  { id: 'loop', name: '天际回环', subtitle: 'SKYLINE LOOP', difficulty: '进阶', color: '#57dbff', description: '穿越完整的垂直回环，再跳过断桥。保持速度，或开启吸附辅助。', goalTime: 39, environment: 'dusk', width: 15, gravity: 9.81 },
  { id: 'inverted', name: '逆重力走廊', subtitle: 'INVERTED HIGHWAY', difficulty: '挑战', color: '#bd9cff', description: '沿桥底倒挂行驶，再穿过高架波浪。吸附开启时可稳定通过天花板。', goalTime: 44, environment: 'industrial', width: 16, gravity: 9.81 },
  { id: 'lunar', name: '月面远征', subtitle: 'LUNAR EXPEDITION', difficulty: '低重力', color: '#a8e7ee', description: '低重力的实验赛道。长距离腾空与缓慢落地，适合练习连续翻转。', goalTime: 40, environment: 'moon', width: 17, gravity: 6.5 },
  { id: 'extreme', name: '极限零界', subtitle: 'ZERO LIMIT', difficulty: '专家', color: '#ff607b', description: '连续断桥、巨大回环与高空倒挂。控制喷气储量，让每次落地都准确。', goalTime: 58, environment: 'night', width: 13, gravity: 9.81 },
];

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const UP = new Vector3(0, 1, 0);
const SIDE = new Vector3(0, 0, 1);

// Analytic pieces are tessellated by arc length for a stable physics/rendering API.
// The local normal follows the road all the way through an inverted segment.
class RoadBuilder {
  constructor(width) {
    this.width = width;
    this.points = [];
    this.gaps = [];
    this.features = [];
    this.laneShifts = [];
    this.x = 0;
    this.y = 5;
    this.angle = 0;
    this.s = 0;
    this.add(0, 5, 0);
  }

  add(x, y, angle) {
    const p = new Vector3(x, y, 0);
    const previous = this.points[this.points.length - 1];
    if (previous) this.s += p.distanceTo(previous.p);
    const tangent = new Vector3(Math.cos(angle), Math.sin(angle), 0);
    this.points.push({ p, tangent, normal: new Vector3(-tangent.y, tangent.x, 0), side: SIDE.clone(), s: this.s, width: this.width, gap: false });
    this.x = x;
    this.y = y;
    this.angle = angle;
  }

  line(length) {
    const { x, y, angle } = this;
    const count = Math.ceil(length / 1.3);
    for (let i = 1; i <= count; i++) {
      const distance = length * i / count;
      this.add(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance, angle);
    }
    return this;
  }

  turn(radians, radius) {
    const { x, y, angle } = this;
    const signedRadius = radius * Math.sign(radians);
    const count = Math.ceil(Math.abs(radians) * radius / 0.85);
    for (let i = 1; i <= count; i++) {
      const a = angle + radians * i / count;
      this.add(x + signedRadius * (Math.sin(a) - Math.sin(angle)), y - signedRadius * (Math.cos(a) - Math.cos(angle)), a);
    }
    return this;
  }

  hill(length, height) {
    const { x, y } = this;
    const count = Math.ceil(length / 1.1);
    for (let i = 1; i <= count; i++) {
      const t = i / count;
      const yy = height * Math.sin(Math.PI * t) ** 2;
      const slope = height * Math.PI / length * Math.sin(2 * Math.PI * t);
      this.add(x + length * t, y + yy, Math.atan(slope));
    }
    return this;
  }

  // The invisible centerline inside a gap only helps progress / recovery;
  // physics must not treat any sample with gap=true as a contact surface.
  jump(width = 28, angle = 0.34, radius = 30) {
    this.turn(angle, radius);
    const { x, y } = this;
    const start = this.s;
    const slope = Math.tan(angle);
    const count = Math.ceil(width / 0.9);
    for (let i = 1; i <= count; i++) {
      const dx = width * i / count;
      this.add(x + dx, y + slope * dx * (1 - dx / width), Math.atan(slope * (1 - 2 * dx / width)));
    }
    this.gaps.push({ start, end: this.s });
    this.features.push({ s: start, type: 'jump', label: '喷气飞跃' });
    this.turn(angle, radius);
    return this;
  }

  loop(radius = 29) {
    const start = this.s;
    this.turn(Math.PI * 2, radius);
    this.features.push({ s: start, end: this.s, type: 'loop', label: '垂直回环' });
    // A planar full loop necessarily crosses its own approach/exit. A modest
    // helical lane change gives the two road decks real physical clearance.
    this.laneShifts.push({ start, end: this.s, delta: Math.max(24, this.width + 8) });
    return this;
  }

  ceiling(length = 100) {
    const start = this.s;
    this.turn(Math.PI, 28).line(length).turn(Math.PI, 20);
    this.features.push({ s: start, end: this.s, type: 'inverted', label: '倒挂路段' });
    this.laneShifts.push({ start, end: this.s, delta: Math.max(24, this.width + 8) });
    // The second half-loop exits 16 m above the approach road, so the
    // returning bridge is genuinely separated from the lower level. Its lateral
    // shift also clears the rising half-loop when it crosses that X position.
    return this;
  }

  descend(length, drop) {
    const { x, y } = this;
    const count = Math.ceil(length / 1.1);
    for (let i = 1; i <= count; i++) {
      const t = i / count;
      const smooth = t * t * (3 - 2 * t);
      const slope = -drop * 6 * t * (1 - t) / length;
      this.add(x + t * length, y - drop * smooth, Math.atan(slope));
    }
    return this;
  }
}

function lowerBound(samples, value) {
  let lo = 0;
  let hi = samples.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (samples[mid].s < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function buildTrack(id = 'proving') {
  const descriptor = TRACKS.find(track => track.id === id) || TRACKS[0];
  const road = new RoadBuilder(descriptor.width);
  switch (descriptor.id) {
    case 'proving':
      road.line(110).hill(100, 7).line(65).jump(24, 0.30).line(75).hill(75, 5).line(135);
      break;
    case 'loop':
      road.line(160).loop(29).line(130).jump(30, 0.36).line(90).hill(90, 9).line(120);
      break;
    case 'inverted':
      road.line(230).ceiling(110).line(125).hill(70, 7).descend(100, 16).line(145);
      break;
    case 'lunar':
      road.line(105).hill(85, 9).line(45).jump(45, 0.36).line(80).hill(95, 14).line(35).jump(52, 0.40).line(145);
      break;
    case 'extreme':
      road.line(105).jump(31, 0.37).line(65).loop(31).line(80).ceiling(75).line(90).descend(75, 16).jump(36, 0.40).line(150);
      break;
  }

  const samples = road.points;
  const planarDistances = samples.map(point => point.s);
  let spatialLength = 0;
  // Quintic easing has zero first and second derivatives at either seam. The
  // full frame is right-handed: tangent × normal = side, initially +Z.
  for (let i = 0; i < samples.length; i++) {
    const point = samples[i];
    let z = 0;
    let dzds = 0;
    for (const shift of road.laneShifts) {
      const t = clamp((point.s - shift.start) / (shift.end - shift.start), 0, 1);
      z += shift.delta * t ** 3 * (10 + t * (-15 + 6 * t));
      dzds += shift.delta * 30 * t * t * (1 - t) ** 2 / (shift.end - shift.start);
    }
    point.p.z = z;
    point.tangent.z = dzds;
    point.tangent.normalize();
    point.side.copy(point.tangent).cross(point.normal).normalize();
    if (i > 0) spatialLength += point.p.distanceTo(samples[i - 1].p);
    point.s = spatialLength;
  }
  const remapDistance = distance => {
    let lo = 0;
    let hi = planarDistances.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (planarDistances[mid] < distance) lo = mid + 1;
      else hi = mid;
    }
    const index = clamp(lo - 1, 0, samples.length - 2);
    const t = clamp((distance - planarDistances[index]) / Math.max(1e-8, planarDistances[index + 1] - planarDistances[index]), 0, 1);
    return samples[index].s + (samples[index + 1].s - samples[index].s) * t;
  };
  for (const gap of road.gaps) { gap.start = remapDistance(gap.start); gap.end = remapDistance(gap.end); }
  for (const feature of road.features) {
    feature.s = remapDistance(feature.s);
    if (Number.isFinite(feature.end)) feature.end = remapDistance(feature.end);
  }
  const length = spatialLength;
  const gaps = road.gaps;
  const isGap = s => gaps.some(gap => s > gap.start + 0.02 && s < gap.end - 0.02);
  for (const point of samples) point.gap = isGap(point.s);

  function sample(distance) {
    const s = clamp(Number.isFinite(distance) ? distance : 0, 0, length);
    const index = clamp(lowerBound(samples, s) - 1, 0, samples.length - 2);
    const a = samples[index];
    const b = samples[index + 1];
    const t = clamp((s - a.s) / Math.max(1e-6, b.s - a.s), 0, 1);
    const tangent = a.tangent.clone().lerp(b.tangent, t).normalize();
    const normal = a.normal.clone().lerp(b.normal, t);
    normal.addScaledVector(tangent, -normal.dot(tangent)).normalize();
    const side = new Vector3().crossVectors(tangent, normal).normalize();
    return { p: a.p.clone().lerp(b.p, t), tangent, normal, side, s, width: descriptor.width, gap: isGap(s), index };
  }

  function findNearest(position, hintS, solidOnly = false) {
    // Restrict correspondence to the current route neighborhood: at a loop
    // bridge, the physically nearest other level is not necessarily the road
    // the driver is following. Actual road intersections are separated in Z.
    const hinted = Number.isFinite(hintS);
    const minS = hinted ? Math.max(0, hintS - 85) : 0;
    const maxS = hinted ? Math.min(length, hintS + 95) : length;
    const startIndex = Math.max(0, lowerBound(samples, minS) - 1);
    const endIndex = Math.min(samples.length - 2, lowerBound(samples, maxS));
    let best = Infinity;
    let bestS = clamp(hintS || 0, 0, length);
    const segment = new Vector3();
    const delta = new Vector3();
    const point = new Vector3();
    for (let i = startIndex; i <= endIndex; i++) {
      const a = samples[i];
      const b = samples[i + 1];
      if (solidOnly && (a.gap || b.gap || isGap((a.s + b.s) / 2))) continue;
      segment.subVectors(b.p, a.p);
      delta.subVectors(position, a.p);
      const t = clamp(delta.dot(segment) / Math.max(1e-8, segment.lengthSq()), 0, 1);
      point.copy(a.p).addScaledVector(segment, t);
      const s = a.s + (b.s - a.s) * t;
      const distanceSquared = point.distanceToSquared(position);
      // A small progress preference removes nearest-segment chatter.
      const cost = distanceSquared + (hinted ? Math.abs(s - hintS) * 0.002 : 0);
      if (cost < best) { best = cost; bestS = s; }
    }
    if (!Number.isFinite(best)) return null;
    const frame = sample(bestS);
    delta.subVectors(position, frame.p);
    const height = delta.dot(frame.normal);
    const lateral = delta.dot(frame.side);
    const along = delta.dot(frame.tangent);
    const edgeDistance = descriptor.width / 2 - Math.abs(lateral);
    return { ...frame, height, lateral, along, edgeDistance, distance: delta.length(), distanceToSurface: Math.hypot(height, Math.min(0, edgeDistance), along) };
  }

  const nearest = (position, hintS) => findNearest(position, hintS, false);
  const nearestSolid = (position, hintS) => findNearest(position, hintS, true);

  // Checkpoints always sit on solid road, never at the end of a gap.
  const checkpoints = [0.22, 0.48, 0.74].map(fraction => {
    let s = length * fraction;
    const gap = gaps.find(item => s > item.start - 8 && s < item.end + 8);
    if (gap) s = Math.min(length - 40, gap.end + 12);
    return s;
  });

  return { ...descriptor, grav: descriptor.gravity, length, width: descriptor.width, samples, gaps, checkpoints, features: road.features, sample, nearest, nearestSolid, start: sample(5), finish: sample(length - 8), up: UP.clone() };
}
