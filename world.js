import * as THREE from './vendor/three.module.js';

const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(1, 0, 0);
const clamp = THREE.MathUtils.clamp;

function seeded(seed = 3271) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function asphaltTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(256, 256);
  const random = seeded(32);
  for (let i = 0; i < image.data.length; i += 4) {
    const n = 54 + random() * 31;
    image.data[i] = n; image.data[i + 1] = n + 2; image.data[i + 2] = n + 5; image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function signTexture(title, subtitle, accent = '#b9ff71') {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#101821'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = accent; ctx.fillRect(0, 0, 12, 256);
  ctx.fillStyle = '#f3f5f6'; ctx.font = 'bold 88px Arial'; ctx.textAlign = 'center';
  ctx.fillText(title, 512, 118);
  ctx.fillStyle = '#a3adb9'; ctx.font = '28px Arial'; ctx.fillText(subtitle, 512, 186);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function disposeGroup(group) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  group.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => materials.add(m));
  });
  materials.forEach(m => { if (m.map) textures.add(m.map); m.dispose(); });
  geometries.forEach(g => g.dispose()); textures.forEach(t => t.dispose());
  group.removeFromParent();
}

function stripGeometry(samples, offset, width, lift = 0, dashed = false) {
  const p = [], uv = [], indices = [];
  let count = 0;
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i], b = samples[i + 1];
    if (a.gap || b.gap || (dashed && Math.floor(a.s / 8) % 2)) continue;
    for (const frame of [a, b]) {
      for (const edge of [-1, 1]) {
        const v = frame.p.clone().addScaledVector(frame.side, offset + edge * width / 2).addScaledVector(frame.normal, lift);
        p.push(v.x, v.y, v.z);
        uv.push(frame.s / 10, (offset + edge * width / 2) / 10);
      }
    }
    indices.push(count, count + 2, count + 1, count + 1, count + 2, count + 3);
    count += 4;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function roadSides(samples, width, thickness) {
  const p = [], indices = [];
  let n = 0;
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i], b = samples[i + 1];
    if (a.gap || b.gap) continue;
    for (const sign of [-1, 1]) {
      for (const frame of [a, b]) {
        for (const h of [0, -thickness]) {
          const v = frame.p.clone().addScaledVector(frame.side, sign * width / 2).addScaledVector(frame.normal, h);
          p.push(v.x, v.y, v.z);
        }
      }
      indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); n += 4;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setIndex(indices); g.computeVertexNormals(); return g;
}

function instanceBoxes(group, transforms, material, castShadow = true) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
  const object = new THREE.Object3D();
  transforms.forEach((item, i) => {
    object.position.copy(item.position);
    object.quaternion.copy(item.quaternion || new THREE.Quaternion());
    object.scale.copy(item.scale);
    object.updateMatrix(); mesh.setMatrixAt(i, object.matrix);
  });
  mesh.castShadow = castShadow; mesh.receiveShadow = true;
  group.add(mesh); return mesh;
}

function addArch(group, frame, title, subtitle, color, width) {
  const arch = new THREE.Group();
  const matrix = new THREE.Matrix4().makeBasis(frame.tangent, frame.normal, frame.side);
  arch.quaternion.setFromRotationMatrix(matrix); arch.position.copy(frame.p);
  const metal = new THREE.MeshStandardMaterial({ color: 0x29333e, metalness: .75, roughness: .38 });
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(.55, 7.5, .6), metal);
    pillar.position.set(0, 3.75, side * (width / 2 + .35)); pillar.castShadow = true; arch.add(pillar);
    const accent = new THREE.Mesh(new THREE.BoxGeometry(.6, 5.5, .1), new THREE.MeshBasicMaterial({ color }));
    accent.position.set(-.02, 3.7, side * (width / 2 + .69)); arch.add(accent);
  }
  const sign = new THREE.Mesh(new THREE.BoxGeometry(.35, 2.5, width + 1.2), metal);
  sign.position.y = 7; sign.castShadow = true; arch.add(sign);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(width + .3, 2.25), new THREE.MeshBasicMaterial({ map: signTexture(title, subtitle, '#' + new THREE.Color(color).getHexString()), side: THREE.DoubleSide }));
  label.rotation.y = -Math.PI / 2; label.position.set(-.19, 7, 0); arch.add(label);
  group.add(arch);
}

function mountainGeometry(random, radius, height, segments = 8) {
  const positions = [0, height, 0];
  for (let j = 0; j < segments; j++) {
    const angle = j / segments * Math.PI * 2;
    const r = radius * (.75 + random() * .5);
    positions.push(Math.cos(angle) * r, random() * height * .13, Math.sin(angle) * r);
  }
  const indices = [];
  for (let j = 0; j < segments; j++) indices.push(0, j + 1, (j + 1) % segments + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setIndex(indices); g.computeVertexNormals();
  return g;
}

export function createWorld(scene, track, quality = 'high') {
  const group = new THREE.Group(); group.name = 'Test facility and course'; scene.add(group);
  const lunar = /lunar|moon/i.test(track.id);
  const canyon = /canyon|extreme/i.test(track.id);
  const random = seeded(6573 + String(track.id).length * 32);
  const trackWidth = track.width || 15;
  const color = track.color || 0x9eff85;
  const samples = track.samples;
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x77818b, roughness: .94, metalness: .07, map: asphaltTexture(), side: THREE.DoubleSide });
  const road = new THREE.Mesh(stripGeometry(samples, 0, trackWidth), asphalt);
  road.receiveShadow = true; road.castShadow = true; group.add(road);
  const structureMat = new THREE.MeshStandardMaterial({ color: 0x414b54, metalness: .5, roughness: .66, side: THREE.DoubleSide });
  const underside = new THREE.Mesh(stripGeometry(samples, 0, trackWidth, -.65), structureMat);
  underside.castShadow = true; group.add(underside);
  const sides = new THREE.Mesh(roadSides(samples, trackWidth, .65), structureMat); sides.castShadow = true; group.add(sides);
  const white = new THREE.MeshStandardMaterial({ color: 0xc2ced1, roughness: .8, side: THREE.DoubleSide });
  const glow = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xe9a443, roughness: .62, side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    group.add(new THREE.Mesh(stripGeometry(samples, side * (trackWidth / 2 - .5), .13, .035), white));
    group.add(new THREE.Mesh(stripGeometry(samples, side * (trackWidth / 2 - .15), .14, .065), glow));
    group.add(new THREE.Mesh(stripGeometry(samples, side * (trackWidth / 2 + .09), .28, .35), yellow));
  }
  group.add(new THREE.Mesh(stripGeometry(samples, 0, .13, .035, true), white));
  const beams = [], supports = [], studs = [];
  for (let s = 4; s < track.length; s += 8) {
    const f = track.sample(s);
    if (f.gap) continue;
    const orientation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.tangent, f.normal, f.side));
    for (const side of [-1, 1]) {
      beams.push({ position: f.p.clone().addScaledVector(f.side, side * (trackWidth / 2 + .1)).addScaledVector(f.normal, .16), quaternion: orientation, scale: new THREE.Vector3(.2, .7, .24) });
      studs.push({ position: f.p.clone().addScaledVector(f.side, side * (trackWidth / 2 - .19)).addScaledVector(f.normal, .09), quaternion: orientation, scale: new THREE.Vector3(.65, .05, .22) });
    }
    if (s % 32 < 8 && f.p.y > 3 && f.normal.y > .5) {
      const height = Math.max(.1, f.p.y - .7);
      supports.push({ position: new THREE.Vector3(f.p.x, height / 2, f.p.z), scale: new THREE.Vector3(1.3, height, trackWidth * .65) });
    }
  }
  instanceBoxes(group, beams, structureMat);
  instanceBoxes(group, supports, new THREE.MeshStandardMaterial({ color: lunar ? 0x67696e : 0x74746f, roughness: .95 }));
  instanceBoxes(group, studs, new THREE.MeshBasicMaterial({ color }), false);
  addArch(group, track.sample(12), 'FLIGHT LAB', 'ROADSTER / EXPERIMENTAL TEST PROGRAM', color, trackWidth);
  addArch(group, track.sample(Math.max(20, track.length - 20)), 'FINISH', 'CONTROL THE IMPOSSIBLE', color, trackWidth);
  for (const fraction of [.26, .52, .78]) {
    const f = track.sample(track.length * fraction);
    if (!f.gap && f.normal.y > .7) addArch(group, f, String(Math.round(fraction * 100)).padStart(2, '0') + ' / SECTOR', 'THRUST • ROTATE • LAND', color, trackWidth);
  }
  // Painted launch/landing zone bars make jumps readable at speed.
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    if (a.gap === b.gap) continue;
    const frame = a.gap ? b : a;
    for (let offset = 0; offset < 3; offset++) {
      const f = track.sample(frame.s + (a.gap ? 1 : -1) * (2 + offset * 1.3));
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(.35, .04, trackWidth - 1.1), yellow);
      stripe.position.copy(f.p).addScaledVector(f.normal, .055);
      stripe.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.tangent, f.normal, f.side));
      group.add(stripe);
    }
  }
  const minX = Math.min(...samples.map(s => s.p.x));
  const maxX = Math.max(...samples.map(s => s.p.x));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX + 1600, 1800, 1, 1), new THREE.MeshStandardMaterial({ color: lunar ? 0x656874 : canyon ? 0x93715a : 0xb9a58a, roughness: 1, metalness: 0 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set((maxX + minX) / 2, -.22, 0); ground.receiveShadow = true; group.add(ground);
  // Huge, layered ridges with intentionally restrained faceting.
  const mountainMats = [0, 1, 2].map(i => new THREE.MeshStandardMaterial({ color: lunar ? [0x454d5b, 0x575e6a, 0x69717d][i] : [0x776c65, 0x968270, 0xae9780][i], roughness: 1, flatShading: true }));
  for (let i = 0; i < 44; i++) {
    const side = i % 2 ? 1 : -1;
    const radius = 50 + random() * 105;
    const peak = 30 + random() * (canyon ? 150 : 80);
    const mountain = new THREE.Mesh(mountainGeometry(random, radius, peak, 9), mountainMats[i % 3]);
    mountain.position.set(minX - 250 + random() * (maxX - minX + 500), -.3, side * (120 + random() * 310));
    mountain.rotation.y = random() * Math.PI; group.add(mountain);
  }
  const rockCount = quality === 'low' ? 90 : 230;
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: lunar ? 0x454955 : 0x8c8072, roughness: 1, flatShading: true }), rockCount);
  const rock = new THREE.Object3D();
  for (let i = 0; i < rockCount; i++) {
    const size = .4 + random() * 4.5;
    rock.position.set(minX - 140 + random() * (maxX - minX + 280), size * .24 - .2, (i % 2 ? 1 : -1) * (20 + random() * 180));
    rock.scale.set(size * (1 + random()), size * .6, size); rock.rotation.set(random(), random(), random());
    rock.updateMatrix(); rocks.setMatrixAt(i, rock.matrix);
  }
  rocks.castShadow = quality !== 'low'; rocks.receiveShadow = true; group.add(rocks);
  // Test hangars, solar arrays, and service tower near the starting grid.
  const facilityMat = new THREE.MeshStandardMaterial({ color: 0x868d91, roughness: .7, metalness: .3 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x172432, roughness: .3, metalness: .7 });
  for (let i = 0; i < 3; i++) {
    const hangar = new THREE.Mesh(new THREE.BoxGeometry(24, 8, 18), facilityMat);
    hangar.position.set(minX - 30 + i * 29, 3.9, -85); hangar.castShadow = true; hangar.receiveShadow = true; group.add(hangar);
    const door = new THREE.Mesh(new THREE.BoxGeometry(18, 5.8, .12), darkMat);
    door.position.copy(hangar.position).add(new THREE.Vector3(0, -.9, 9.08)); group.add(door);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(20, .16, .2), new THREE.MeshBasicMaterial({ color }));
    edge.position.copy(hangar.position).add(new THREE.Vector3(0, 2.7, 9.16)); group.add(edge);
  }
  const panelTransforms = [];
  for (let i = 0; i < 24; i++) {
    panelTransforms.push({ position: new THREE.Vector3(minX + (i % 8) * 7, 2, 42 + Math.floor(i / 8) * 6), scale: new THREE.Vector3(5, .1, 3.5), quaternion: new THREE.Quaternion().setFromAxisAngle(FORWARD, -.25) });
  }
  instanceBoxes(group, panelTransforms, new THREE.MeshStandardMaterial({ color: 0x1d3a4c, metalness: .6, roughness: .24 }));
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(.35, .75, 33, 8), structureMat);
  tower.position.set(minX - 40, 16, 28); tower.castShadow = true; group.add(tower);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(.6, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff5d3b }));
  beacon.position.copy(tower.position).y = 33; group.add(beacon);
  return {
    group,
    update(time) { beacon.visible = Math.sin(time * 2) > -.35; },
    dispose() { disposeGroup(group); }
  };
}

// Ring-based bodywork: the different cross-sections create a low nose,
// muscular shoulders, and a narrow cockpit without an external model download.
function bodyGeometry(sections) {
  const vertices = [], indices = [];
  for (const [x, low, high, width] of sections) {
    vertices.push(x, low, -width * .88, x, high - .07, -width, x, high, -width * .68,
      x, high, width * .68, x, high - .07, width, x, low, width * .88);
  }
  for (let i = 0; i < sections.length - 1; i++) for (let j = 0; j < 6; j++) {
    const a = i * 6 + j, b = i * 6 + (j + 1) % 6, c = (i + 1) * 6 + j, d = (i + 1) * 6 + (j + 1) % 6;
    indices.push(a, b, c, b, d, c);
  }
  for (const end of [0, sections.length - 1]) {
    const base = end * 6;
    for (let j = 1; j < 5; j++) indices.push(base, base + j, base + j + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

export function createCar() {
  const group = new THREE.Group(); group.name = 'Rocket Roadster';
  const red = new THREE.MeshPhysicalMaterial({ color: 0xc71c2b, metalness: .32, roughness: .34, clearcoat: .55, clearcoatRoughness: .26, envMapIntensity: .55, side: THREE.DoubleSide });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x090e13, metalness: .08, roughness: .64, envMapIntensity: .35 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x07131b, metalness: .12, roughness: .24, clearcoat: .4, clearcoatRoughness: .22, envMapIntensity: .4, side: THREE.DoubleSide });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x121315, roughness: .95 });
  const alloy = new THREE.MeshStandardMaterial({ color: 0x414c58, metalness: .65, roughness: .44, envMapIntensity: .5 });
  const rimWell = new THREE.MeshStandardMaterial({ color: 0x14191e, metalness: .25, roughness: .58, envMapIntensity: .35 });
  const bright = new THREE.MeshBasicMaterial({ color: 0xe5faff });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff223d });
  const panels = [];
  const body = new THREE.Mesh(bodyGeometry([
    [-2.22, -.32, .2, .91], [-1.62, -.28, .35, 1.05], [-.75, -.25, .27, .98],
    [.5, -.25, .23, .95], [1.48, -.27, .28, 1.04], [2.2, -.32, .06, .87]
  ]), red);
  body.castShadow = true; body.receiveShadow = true; group.add(body); panels.push(body);
  const underbody = new THREE.Mesh(bodyGeometry([[-2.28, -.4, -.25, .92], [-1, -.38, -.22, 1], [1.6, -.39, -.25, .99], [2.25, -.4, -.3, .86]]), carbon);
  underbody.castShadow = true; group.add(underbody);
  const canopy = new THREE.Mesh(bodyGeometry([[-1.18, .23, .27, .76], [-.92, .25, .49, .7], [-.56, .25, .65, .66], [.15, .25, .65, .63], [.45, .23, .52, .68], [.92, .23, .26, .77]]), glass);
  canopy.castShadow = true; group.add(canopy);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(.72, .014, 1.08), glass);
  roof.position.set(-.2, .657, 0); group.add(roof);
  // Hood accent, mirrors, side sills, and vent blades.
  // The long nose is one uninterrupted painted surface.
  for (const sign of [-1, 1]) {
    const sill = new THREE.Mesh(new THREE.BoxGeometry(2.3, .15, .14), carbon);
    sill.position.set(-.1, -.27, sign * 1.01); group.add(sill);
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(.3, .12, .27), red);
    mirror.position.set(.42, .35, sign * 1.04); group.add(mirror); panels.push(mirror);
    for (let j = 0; j < 3; j++) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(.34, .035, .16), carbon);
      vent.position.set(-1.78 + j * .18, .357, sign * .75); vent.rotation.z = -.1; group.add(vent);
    }
    const frontLight = new THREE.Mesh(new THREE.BoxGeometry(.04, .052, .54), bright);
    frontLight.position.set(2.16, .045, sign * .54); frontLight.rotation.y = sign * -.15; group.add(frontLight);
    const frontIntake = new THREE.Mesh(new THREE.BoxGeometry(.04, .14, .46), carbon);
    frontIntake.position.set(2.19, -.18, sign * .49); group.add(frontIntake);
  }
  const taillight = new THREE.Mesh(new THREE.BoxGeometry(.032, .047, 1.68), tailMat);
  taillight.position.set(-2.235, .13, 0); group.add(taillight);
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(.38, .055, 2.02), carbon);
  spoiler.position.set(-1.92, .45, 0); group.add(spoiler);
  for (const z of [-.61, .61]) {
    const stand = new THREE.Mesh(new THREE.BoxGeometry(.08, .25, .06), carbon);
    stand.position.set(-1.93, .32, z); group.add(stand);
  }
  const wheels = [];
  for (const x of [-1.48, 1.45]) for (const z of [-1.01, 1.01]) {
    const wheel = new THREE.Group(); wheel.position.set(x, -.23, z); group.add(wheel); wheels.push(wheel);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(.37, .37, .29, 24), tireMat);
    tire.rotation.x = Math.PI / 2; tire.castShadow = true; wheel.add(tire);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(.235, .235, .298, 20), rimWell);
    rim.rotation.x = Math.PI / 2; wheel.add(rim);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, .325, 12), carbon);
    hub.rotation.x = Math.PI / 2; wheel.add(hub);
    for (const side of [-1, 1]) for (let j = 0; j < 5; j++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(.405, .029, .015), alloy);
      spoke.rotation.z = j * Math.PI / 5; spoke.position.z = side * .153; wheel.add(spoke);
    }
  }
  const jets = [];
  const jetBlue = new THREE.MeshBasicMaterial({ color: 0x5edcff, transparent: true, opacity: .72, depthWrite: false, blending: THREE.AdditiveBlending });
  const jetCore = new THREE.MeshBasicMaterial({ color: 0xe3faff, transparent: true, opacity: .92, depthWrite: false, blending: THREE.AdditiveBlending });
  for (const x of [-1.17, 1.17]) for (const z of [-.61, .61]) {
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(.1, .17, .17, 12), alloy);
    nozzle.position.set(x, -.4, z); group.add(nozzle);
    const jet = new THREE.Group(); jet.position.set(x, -.49, z); group.add(jet); jets.push(jet);
    const plume = new THREE.Mesh(new THREE.ConeGeometry(.21, 1.5, 12, 1, true), jetBlue);
    plume.rotation.z = Math.PI; plume.position.y = -.75; jet.add(plume);
    const core = new THREE.Mesh(new THREE.ConeGeometry(.095, 1.05, 10), jetCore);
    core.rotation.z = Math.PI; core.position.y = -.48; jet.add(core);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.12, .02, 6, 12), jetCore);
    ring.rotation.x = Math.PI / 2; jet.add(ring); jet.visible = false;
  }
  const smoke = new THREE.Group(); group.add(smoke);
  const smokeMaterial = new THREE.MeshBasicMaterial({ color: 0x3c4149, transparent: true, opacity: .32, depthWrite: false });
  const smokePuffs = [];
  for (let i = 0; i < 7; i++) {
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(.22, 1), smokeMaterial); smoke.add(puff); smokePuffs.push(puff);
  }
  const paintStart = new THREE.Color(0xc71c2b), paintDamaged = new THREE.Color(0x472c2c);
  let previousTime = 0;
  return {
    group,
    update({ speed = 0, jet = false, damage = 0, time = 0, steer = 0 } = {}) {
      const dt = clamp(time - previousTime, 0, .1); previousTime = time;
      for (const wheel of wheels) wheel.rotation.z -= speed * dt / .37;
      for (let i = 0; i < jets.length; i++) {
        jets[i].visible = !!jet;
        jets[i].scale.y = .82 + Math.sin(time * 47 + i * 2) * .17;
        jets[i].scale.x = jets[i].scale.z = .91 + Math.cos(time * 31 + i) * .08;
      }
      let d = typeof damage === 'number' ? damage : (damage.total ?? damage.body ?? damage.chassis ?? 0);
      if (d > 1) d /= 100;
      d = clamp(d, 0, 1);
      red.color.copy(paintStart).lerp(paintDamaged, d * .75);
      body.scale.y = 1 - d * .15;
      body.rotation.x = Math.sin(d * 3) * d * .025;
      panels.slice(1).forEach((panel, i) => { panel.rotation.x = d * (i % 2 ? -.25 : .2); });
      spoiler.rotation.z = d * .12;
      smoke.visible = d > .35;
      smokeMaterial.opacity = Math.max(0, d - .3) * .38;
      smokePuffs.forEach((puff, i) => {
        const phase = (time * .65 + i / smokePuffs.length) % 1;
        puff.position.set(-1.25 - phase * .5, .4 + phase * 2.6, Math.sin(time + i * 2.3) * phase * .4);
        puff.scale.setScalar(.25 + phase * 2.5); puff.rotation.y = time + i;
      });
    },
    dispose() { disposeGroup(group); }
  };
}
