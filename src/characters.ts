import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Bristol characters. All surfaces are actual lit geometry; only lettering is a texture. */
export type Expression =
  | 'happy'
  | 'nervous'
  | 'panic'
  | 'surprised'
  | 'sad'
  | 'relieved';

const TAU = Math.PI * 2;

function material(
  color: THREE.ColorRepresentation,
  roughness = 0.35,
  metalness = 0,
) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness,
    clearcoat: 0.18,
    clearcoatRoughness: 0.35,
  });
}

function mesh(
  geometry: THREE.BufferGeometry,
  mat: THREE.Material,
  parent: THREE.Object3D,
  position = [0, 0, 0],
  scale = [1, 1, 1],
) {
  const m = new THREE.Mesh(geometry, mat);
  m.position.set(position[0], position[1], position[2]);
  m.scale.set(scale[0], scale[1], scale[2]);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function group(parent?: THREE.Object3D, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent?.add(g);
  return g;
}

/** Batch only static siblings. Articulated groups and mutable facial features stay separate. */
function batchStaticParts(root: THREE.Object3D) {
  for (const child of root.children) batchStaticParts(child);
  const batches = new Map<THREE.Material, THREE.Mesh[]>();
  for (const child of root.children) {
    if (
      !(child instanceof THREE.Mesh) ||
      Array.isArray(child.material) ||
      child.userData.rigMutable ||
      !child.visible
    )
      continue;
    const list = batches.get(child.material) ?? [];
    list.push(child);
    batches.set(child.material, list);
  }
  for (const [mat, members] of batches) {
    if (members.length < 2 || (mat as THREE.MeshStandardMaterial).map) continue;
    const prepared = members.map((member) => {
      member.updateMatrix();
      const geometry = member.geometry.index
        ? member.geometry.toNonIndexed()
        : member.geometry.clone();
      for (const attribute of Object.keys(geometry.attributes))
        if (attribute !== 'position' && attribute !== 'normal')
          geometry.deleteAttribute(attribute);
      geometry.applyMatrix4(member.matrix);
      return geometry;
    });
    const geometry = mergeGeometries(prepared, false);
    prepared.forEach((g) => g.dispose());
    if (!geometry) continue;
    const merged = new THREE.Mesh(geometry, mat);
    merged.castShadow = true;
    merged.receiveShadow = true;
    merged.name = 'Batched static character sculpt';
    for (const member of members) {
      root.remove(member);
      member.geometry.dispose();
    }
    root.add(merged);
  }
}

function sphere(
  parent: THREE.Object3D,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  detail = 24,
) {
  return mesh(
    new THREE.SphereGeometry(1, detail, Math.round(detail * 0.7)),
    mat,
    parent,
    [x, y, z],
    [sx, sy, sz],
  );
}

function curve(points: number[][], closed = false) {
  return new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
    closed,
    'centripetal',
  );
}

function cord(
  parent: THREE.Object3D,
  points: number[][],
  radius: number,
  mat: THREE.Material,
  segments = 28,
  radial = 8,
) {
  return mesh(
    new THREE.TubeGeometry(curve(points), segments, radius, radial, false),
    mat,
    parent,
  );
}

/** Smooth tapering sweep, including a rounded tip; used for the actual furry tail and ear tufts. */
function taperedTube(
  path: THREE.CatmullRomCurve3,
  profile: (t: number) => number,
  segments = 48,
  radial = 14,
  aspect = 1,
) {
  const frames = path.computeFrenetFrames(segments, false);
  const positions: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments,
      p = path.getPointAt(t),
      r = profile(t);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU;
      const c = Math.cos(a) * r,
        s = Math.sin(a) * r * aspect;
      const n = frames.normals[i],
        b = frames.binormals[i];
      positions.push(
        p.x + n.x * c + b.x * s,
        p.y + n.y * c + b.y * s,
        p.z + n.z * c + b.z * s,
      );
      uvs.push(t, j / radial);
      if (i < segments && j < radial) {
        const q = i * (radial + 1) + j;
        indices.push(
          q,
          q + 1,
          q + radial + 1,
          q + 1,
          q + radial + 2,
          q + radial + 1,
        );
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function roundedShape(w: number, h: number, r: number) {
  const s = new THREE.Shape(),
    x = -w / 2,
    y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function softBox(
  parent: THREE.Object3D,
  mat: THREE.Material,
  w: number,
  h: number,
  depth: number,
  radius: number,
  position: number[],
) {
  const geo = new THREE.ExtrudeGeometry(
    roundedShape(w - radius * 2, h - radius * 2, radius),
    {
      depth: Math.max(0.005, depth - radius * 2),
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: radius,
      bevelThickness: radius,
      curveSegments: 10,
    },
  );
  geo.translate(0, 0, -depth / 2 + radius);
  return mesh(geo, mat, parent, position);
}

function brandTexture(compact = false) {
  const canvas = document.createElement('canvas');
  canvas.width = compact ? 512 : 1024;
  canvas.height = compact ? 512 : 256;
  const ctx = canvas.getContext('2d')!;
  if (compact) {
    ctx.fillStyle = '#b71331';
    ctx.beginPath();
    ctx.arc(256, 200, 126, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff8eb';
    ctx.font = 'bold 210px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Б', 255, 270);
    ctx.fillStyle = '#a5112b';
    ctx.font = 'bold 67px Arial, sans-serif';
    ctx.fillText('Бристоль', 256, 421);
  } else {
    ctx.fillStyle = '#fff7e9';
    ctx.beginPath();
    ctx.arc(109, 128, 91, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#e92c32';
    ctx.font = 'bold 151px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Б', 108, 184);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff7e9';
    ctx.font = 'bold 170px Arial, sans-serif';
    ctx.fillText('ристоль', 205, 188);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** The printed lettering follows the front curvature, instead of being a floating flat card. */
function curvedLabel(
  parent: THREE.Object3D,
  texture: THREE.Texture,
  w: number,
  h: number,
  y: number,
  z: number,
  curvature: number,
) {
  const geo = new THREE.PlaneGeometry(w, h, 24, 2),
    pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++)
    pos.setZ(i, -curvature * Math.pow(pos.getX(i) / (w / 2), 2));
  geo.computeVertexNormals();
  const label = mesh(
    geo,
    new THREE.MeshStandardMaterial({
      map: texture,
      transparent: true,
      roughness: 0.5,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
    parent,
    [0, y, z],
  );
  label.castShadow = false;
  return label;
}

/** A continuous, plump shopping-bag shell with shoulder pleats and an actual open top. */
function bagShell() {
  const ringCount = 42,
    slices = 80,
    vertices: number[] = [],
    indices: number[] = [],
    uvs: number[] = [];
  for (let iy = 0; iy <= ringCount; iy++) {
    const v = iy / ringCount;
    const lowerRound =
      0.78 + 0.22 * Math.sin((Math.min(v / 0.14, 1) * Math.PI) / 2);
    const width = (1.06 - 0.22 * v + 0.08 * Math.sin(v * Math.PI)) * lowerRound;
    const depth =
      (0.29 + 0.06 * Math.sin(v * Math.PI) - 0.048 * v) * lowerRound;
    for (let j = 0; j <= slices; j++) {
      const a = (j / slices) * TAU,
        co = Math.cos(a),
        si = Math.sin(a);
      const xn = Math.sign(co) * Math.pow(Math.abs(co), 0.69);
      const shoulder = THREE.MathUtils.smoothstep(Math.abs(xn), 0.62, 0.97);
      // The edge rises into the same broad shoulder/strap shape as the original T-shirt bag.
      const top = 2.68 + 0.34 * shoulder;
      const y = 0.31 + v * (top - 0.31);
      let x = xn * width;
      let z = Math.sign(si) * Math.pow(Math.abs(si), 0.7) * depth;
      // Shallow organic compression creases; no hard raised seam or squared planar corner.
      const diagonal = 0.84 - 0.18 * v;
      const fold =
        (0.014 * Math.exp(-Math.pow((Math.abs(xn) - diagonal) / 0.047, 2)) -
          0.008 *
            Math.exp(-Math.pow((Math.abs(xn) - diagonal - 0.056) / 0.051, 2)) +
          0.008 *
            Math.exp(-Math.pow((Math.abs(xn) - 0.92 + 0.065 * v) / 0.032, 2))) *
        Math.sin(Math.PI * v * 0.93);
      z -= Math.sign(si) * fold;
      x +=
        Math.sign(co) *
        0.006 *
        Math.sin(v * 10 + a * 3) *
        Math.sin(v * Math.PI);
      vertices.push(x, y, z);
      uvs.push(j / slices, v);
      if (iy < ringCount && j < slices) {
        const n = iy * (slices + 1) + j;
        indices.push(
          n,
          n + slices + 1,
          n + 1,
          n + 1,
          n + slices + 1,
          n + slices + 2,
        );
      }
    }
  }
  // Rounded bottom is closed, upper opening remains open.
  const center = vertices.length / 3;
  vertices.push(0, 0.31, 0);
  uvs.push(0.5, 0.5);
  for (let j = 0; j < slices; j++) indices.push(center, j, j + 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function bagHandle(parent: THREE.Object3D, mat: THREE.Material, x: number) {
  const segments = 64,
    around = 16,
    verts: number[] = [],
    indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = -Math.PI / 2 + (i / segments) * Math.PI;
    const rise = Math.max(0, Math.cos(a)),
      depthSide = Math.sin(a);
    const width = 0.06 + 0.08 * Math.sqrt(rise);
    for (let j = 0; j <= around; j++) {
      const b = (j / around) * TAU,
        cx = Math.cos(b),
        sn = Math.sin(b);
      const px = x + cx * width;
      // Each strap edge starts inside the U-shaped shoulder at its own height,
      // so the handle grows out of the bag instead of ending in a separate patch.
      const baseX = Math.min(0.995, Math.abs(x + cx * 0.06) / 0.84);
      const baseY =
        2.68 + 0.34 * THREE.MathUtils.smoothstep(baseX, 0.62, 0.97) - 0.11;
      const frontZ =
        0.24 * Math.pow(Math.sqrt(1 - Math.pow(baseX, 2 / 0.69)), 0.7);
      const py = baseY + (3.44 - baseY) * rise;
      const pz = depthSide * ((frontZ - 0.065) * (1 - rise) + 0.31 * rise);
      verts.push(px, py + rise * sn * 0.042, pz + depthSide * sn * 0.042);
      if (i < segments && j < around) {
        const n = i * (around + 1) + j;
        indices.push(
          n,
          n + 1,
          n + around + 1,
          n + 1,
          n + around + 2,
          n + around + 1,
        );
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return mesh(geo, mat, parent);
}

type Eye = {
  root: THREE.Group;
  gaze: THREE.Group;
  brow: THREE.Group;
  baseY: number;
};

function createEye(
  parent: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  whites: THREE.Material,
  iris: THREE.Material,
  pupil: THREE.Material,
  shine: THREE.Material,
  browMat: THREE.Material,
  size = 1,
): Eye {
  const root = group(parent, x, y, z);
  sphere(root, whites, 0, 0, 0, 0.28 * size, 0.34 * size, 0.145 * size, 28);
  const gaze = group(root, 0.025 * size, -0.025 * size, 0.128 * size);
  sphere(gaze, iris, 0, 0, 0, 0.11 * size, 0.13 * size, 0.048 * size, 20);
  sphere(
    gaze,
    pupil,
    0.009 * size,
    0,
    0.041 * size,
    0.055 * size,
    0.084 * size,
    0.022 * size,
    18,
  );
  sphere(
    gaze,
    shine,
    -0.022 * size,
    0.043 * size,
    0.063 * size,
    0.027 * size,
    0.032 * size,
    0.011 * size,
    12,
  );
  sphere(
    gaze,
    shine,
    0.032 * size,
    -0.047 * size,
    0.06 * size,
    0.01 * size,
    0.012 * size,
    0.007 * size,
    10,
  );
  const brow = group(parent, x, y + 0.43 * size, z + 0.014 * size);
  cord(
    brow,
    [
      [-0.25 * size, -0.035 * size, 0],
      [-0.12 * size, 0.04 * size, 0.04 * size],
      [0.04 * size, 0.055 * size, 0.047 * size],
      [0.22 * size, -0.012 * size, 0],
    ],
    0.058 * size,
    browMat,
    20,
    8,
  );
  return { root, gaze, brow, baseY: y };
}

function mouthShape(kind: Expression) {
  const s = new THREE.Shape();
  if (kind === 'panic' || kind === 'surprised') {
    s.absellipse(
      0,
      -0.02,
      kind === 'panic' ? 0.29 : 0.22,
      kind === 'panic' ? 0.32 : 0.24,
      0,
      TAU,
      false,
      0,
    );
  } else if (kind === 'sad') {
    s.moveTo(-0.31, -0.06);
    s.bezierCurveTo(-0.13, 0.11, 0.13, 0.11, 0.31, -0.06);
    s.bezierCurveTo(0.16, -0.035, -0.12, -0.035, -0.31, -0.06);
  } else if (kind === 'nervous') {
    s.moveTo(-0.36, 0.025);
    s.bezierCurveTo(-0.08, -0.02, 0.19, 0.1, 0.34, 0.06);
    s.bezierCurveTo(0.2, -0.17, -0.16, -0.17, -0.36, 0.025);
  } else if (kind === 'relieved') {
    s.moveTo(-0.35, 0.07);
    s.bezierCurveTo(-0.14, -0.035, 0.17, -0.04, 0.36, 0.08);
    s.bezierCurveTo(0.17, -0.2, -0.17, -0.2, -0.35, 0.07);
  } else {
    s.moveTo(-0.47, 0.15);
    s.bezierCurveTo(-0.29, 0.03, 0.18, -0.055, 0.4, -0.055);
    s.bezierCurveTo(0.43, -0.34, -0.26, -0.47, -0.47, 0.15);
  }
  return s;
}

function createBagMouth(
  parent: THREE.Group,
  kind: Expression,
  red: THREE.Material,
  dark: THREE.Material,
  teeth: THREE.Material,
  tongue: THREE.Material,
) {
  const root = group(parent, 0.05, 1.83, 0.337);
  const shape = mouthShape(kind);
  mesh(
    new THREE.ExtrudeGeometry(shape, {
      depth: 0.025,
      steps: 1,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.018,
      bevelThickness: 0.018,
      curveSegments: 18,
    }),
    dark,
    root,
  );
  const outline = shape.getPoints(48).map((p) => [p.x, p.y, 0.012]);
  outline.push(outline[0]);
  cord(root, outline, 0.03, red, 50, 8);
  if (kind !== 'sad') {
    const tooth = softBox(
      root,
      teeth,
      kind === 'nervous' ? 0.35 : 0.17,
      0.13,
      0.045,
      0.025,
      [
        kind === 'nervous' ? -0.02 : -0.17,
        kind === 'panic' ? 0.21 : -0.025,
        0.052,
      ],
    );
    tooth.rotation.z = -0.19;
    if (kind !== 'nervous') {
      sphere(
        root,
        tongue,
        0.01,
        kind === 'panic' ? -0.25 : kind === 'surprised' ? -0.2 : -0.275,
        0.047,
        kind === 'surprised' ? 0.12 : 0.205,
        0.08,
        0.055,
        24,
      );
      if (kind === 'happy')
        sphere(root, tongue, -0.075, -0.251, 0.058, 0.09, 0.078, 0.048, 18);
    }
  }
  return root;
}

function mitten(parent: THREE.Group, red: THREE.Material, side: number) {
  sphere(parent, red, 0, 0, 0, 0.25, 0.24, 0.175, 28);
  for (let i = 0; i < 3; i++) {
    const finger = sphere(
      parent,
      red,
      side * (-0.112 + i * 0.112),
      -0.125 - Math.sin(i * 0.9) * 0.025,
      0.072,
      0.091,
      0.138,
      0.103,
      22,
    );
    finger.rotation.z = side * (i - 1) * -0.12;
  }
  const thumb = sphere(
    parent,
    red,
    -side * 0.2,
    0.07,
    0.065,
    0.093,
    0.166,
    0.104,
    22,
  );
  thumb.rotation.z = -side * 0.82;
}

export type BagCharacter = {
  root: THREE.Group;
  body: THREE.Group;
  face: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  arms: { left: THREE.Group; right: THREE.Group };
  hands: { left: THREE.Group; right: THREE.Group };
  feet: { left: THREE.Group; right: THREE.Group };
  eyes: { left: Eye; right: Eye };
  groceries: THREE.Group;
  handles: THREE.Group;
  setExpression: (expression: Expression) => void;
  setBlink: (amount: number) => void;
  lookAt: (x: number, y: number) => void;
};

export function createBag(): BagCharacter {
  const root = group();
  root.name = 'Bristol shopping bag';
  const body = group(root);
  body.name = 'Soft bag body';
  const red = material('#f42d20', 0.34),
    seamRed = material('#df251f', 0.38);
  const whites = material('#fff8e6', 0.25),
    iris = material('#733519', 0.3),
    black = material('#180c11', 0.38);
  const eyeShine = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const tongue = material('#ff7771', 0.32),
    browRed = material('#b61624', 0.4);
  const shell = mesh(bagShell(), red, body);
  shell.name = 'Continuous open bag shell';
  // Interior folds and lower dark well make the opening read in perspective.
  const lining = material('#aa1523', 0.68);
  sphere(body, lining, 0, 2.43, -0.015, 0.79, 0.095, 0.235, 32);
  const rimPoints: number[][] = [];
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * TAU,
      c = Math.cos(a),
      s = Math.sin(a);
    const xn = Math.sign(c) * Math.pow(Math.abs(c), 0.69);
    rimPoints.push([
      xn * 0.84,
      2.68 + 0.34 * THREE.MathUtils.smoothstep(Math.abs(xn), 0.62, 0.97),
      Math.sign(s) * Math.pow(Math.abs(s), 0.7) * 0.242,
    ]);
  }
  cord(body, rimPoints, 0.024, red, 64, 10);
  const handles = group(body);
  bagHandle(handles, red, -0.77);
  bagHandle(handles, red, 0.77);

  const groceries = group(body);
  groceries.name = 'Groceries in the open top';
  groceries.position.y = 0.2;
  const bottle = group(groceries, -0.44, 2.2, -0.035);
  bottle.rotation.z = 0.12;
  const blue = material('#1396cc', 0.22),
    blueCap = material('#087ba7', 0.33);
  mesh(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.13, 0),
        new THREE.Vector2(0.17, 0.1),
        new THREE.Vector2(0.17, 0.37),
        new THREE.Vector2(0.11, 0.48),
        new THREE.Vector2(0.078, 0.51),
        new THREE.Vector2(0.078, 0.66),
      ],
      24,
    ),
    blue,
    bottle,
  );
  mesh(
    new THREE.CylinderGeometry(0.092, 0.092, 0.095, 24),
    blueCap,
    bottle,
    [0, 0.65, 0],
  );
  for (let i = 0; i < 3; i++)
    mesh(new THREE.TorusGeometry(0.17, 0.008, 5, 24), blueCap, bottle, [
      0,
      0.17 + i * 0.075,
      0,
    ]).rotation.x = Math.PI / 2;
  const can = group(groceries, 0.1, 2.41, -0.02);
  can.rotation.z = -0.13;
  const gold = material('#dda537', 0.26, 0.65);
  mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.37, 28), gold, can);
  mesh(
    new THREE.TorusGeometry(0.224, 0.013, 7, 28),
    gold,
    can,
    [0, 0.19, 0],
  ).rotation.x = Math.PI / 2;
  mesh(
    new THREE.TorusGeometry(0.075, 0.012, 6, 18),
    material('#b98926', 0.32, 0.7),
    can,
    [0, 0.201, 0],
  ).rotation.x = Math.PI / 2;
  const packet = group(groceries, 0.4, 2.66, -0.18);
  packet.rotation.z = -0.23;
  packet.rotation.y = 0.15;
  softBox(packet, material('#579b36', 0.5), 0.42, 0.77, 0.18, 0.05, [0, 0, 0]);
  softBox(
    packet,
    material('#f7d263', 0.45),
    0.43,
    0.095,
    0.2,
    0.018,
    [0, 0.33, 0],
  );
  softBox(
    packet,
    material('#e97834', 0.42),
    0.44,
    0.25,
    0.205,
    0.016,
    [0, 0.095, 0],
  );
  for (let i = 0; i < 4; i++)
    sphere(
      packet,
      material('#f5d264', 0.6),
      -0.11 + i * 0.065,
      0.07 + Math.sin(i) * 0.05,
      0.11,
      0.047,
      0.064,
      0.015,
      10,
    );

  const face = group(body);
  face.name = 'Expressive face';
  const eyeLeft = createEye(
    face,
    -0.225,
    2.215,
    0.304,
    whites,
    iris,
    black,
    eyeShine,
    browRed,
    0.91,
  );
  const eyeRight = createEye(
    face,
    0.3,
    2.197,
    0.308,
    whites,
    iris,
    black,
    eyeShine,
    browRed,
    0.865,
  );
  eyeLeft.gaze.scale.setScalar(0.85);
  eyeRight.gaze.scale.setScalar(0.85);
  eyeLeft.gaze.position.x = 0.058;
  eyeRight.gaze.position.x = -0.052;
  // The original face is molded directly into the plastic, without separate cheek bubbles.
  const mouths = {} as Record<Expression, THREE.Group>;
  const expressions: Expression[] = [
    'happy',
    'nervous',
    'panic',
    'surprised',
    'sad',
    'relieved',
  ];
  for (const expression of expressions)
    mouths[expression] = createBagMouth(
      face,
      expression,
      red,
      black,
      whites,
      tongue,
    );
  curvedLabel(body, brandTexture(), 1.72, 0.43, 1.065, 0.343, 0.079);

  const arms = {
    left: group(body, -0.92, 1.76, 0.015),
    right: group(body, 0.92, 1.76, 0.015),
  };
  const hands = { left: group(), right: group() };
  for (const [key, side] of [
    ['left', -1],
    ['right', 1],
  ] as const) {
    const arm = arms[key];
    mesh(
      taperedTube(
        curve([
          [0, 0, 0],
          [side * 0.24, -0.23, 0.06],
          [side * 0.28, -0.49, 0.18],
          [side * 0.1, -0.64, 0.32],
        ]),
        (t) => 0.132 + 0.018 * Math.sin(t * Math.PI),
        36,
        14,
      ),
      red,
      arm,
    );
    const hand = hands[key];
    arm.add(hand);
    hand.position.set(side * 0.1, -0.64, 0.32);
    hand.rotation.z = -side * 0.32;
    mitten(hand, red, side);
  }
  const feet = {
    left: group(root, -0.73, 0.35, 0.13),
    right: group(root, 0.73, 0.35, 0.13),
  };
  for (const [key, side] of [
    ['left', -1],
    ['right', 1],
  ] as const) {
    const foot = feet[key];
    foot.rotation.y = side * 0.12;
    foot.rotation.z = -side * 0.2;
    sphere(foot, red, 0, 0.05, 0.14, 0.335, 0.42, 0.275, 32);
    sphere(foot, red, -side * 0.07, 0.15, -0.11, 0.25, 0.255, 0.26, 28);
    sphere(foot, seamRed, 0, 0.035, 0.384, 0.277, 0.35, 0.046, 30);
  }

  let current: Expression = 'happy',
    blink = 0;
  const eyeScale: Record<Expression, [number, number]> = {
    happy: [1, 0.97],
    nervous: [0.97, 0.84],
    panic: [1.17, 1.19],
    surprised: [1.11, 1.12],
    sad: [0.83, 0.83],
    relieved: [0.75, 0.75],
  };
  const browRot: Record<Expression, [number, number]> = {
    happy: [-0.13, 0.13],
    nervous: [-0.31, -0.12],
    panic: [-0.28, 0.27],
    surprised: [-0.06, 0.06],
    sad: [-0.39, 0.39],
    relieved: [-0.13, 0.13],
  };
  function setBlink(amount: number) {
    blink = THREE.MathUtils.clamp(amount, 0, 1);
    eyeLeft.root.scale.y = eyeScale[current][0] * (1 - blink * 0.95);
    eyeRight.root.scale.y = eyeScale[current][1] * (1 - blink * 0.95);
  }
  function setExpression(expression: Expression) {
    current = expression;
    for (const key of expressions) mouths[key].visible = key === expression;
    eyeLeft.brow.rotation.z = browRot[expression][0];
    eyeRight.brow.rotation.z = browRot[expression][1];
    const raise =
      expression === 'panic' || expression === 'surprised'
        ? 0.045
        : expression === 'sad'
          ? -0.025
          : 0;
    eyeLeft.brow.position.y = 2.575 + raise;
    eyeRight.brow.position.y = 2.55 + raise;
    setBlink(blink);
  }
  function lookAt(x: number, y: number) {
    const gx = THREE.MathUtils.clamp(x, -1, 1) * 0.05,
      gy = THREE.MathUtils.clamp(y, -1, 1) * 0.045;
    eyeLeft.gaze.position.x = 0.058 + gx;
    eyeRight.gaze.position.x = -0.052 + gx;
    eyeLeft.gaze.position.y = -0.023 + gy;
    eyeRight.gaze.position.y = -0.028 + gy;
  }
  setExpression('happy');
  batchStaticParts(root);
  return {
    root,
    body,
    face,
    leftArm: arms.left,
    rightArm: arms.right,
    leftLeg: feet.left,
    rightLeg: feet.right,
    arms,
    hands,
    feet,
    eyes: { left: eyeLeft, right: eyeRight },
    groceries,
    handles,
    setExpression,
    setBlink,
    lookAt,
  };
}

export type BagRig = BagCharacter;

/** A pointed, fleshy ear, with continuous convex surface and a separate warm inner ear. */
function earGeometry(
  width: number,
  height: number,
  depth: number,
  bend: number,
) {
  const rows = 26,
    slices = 24,
    vertices: number[] = [],
    indices: number[] = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows,
      r = (0.72 + 0.28 * Math.sin(Math.PI * t)) * Math.pow(1 - t, 0.85);
    for (let j = 0; j <= slices; j++) {
      const a = (j / slices) * TAU;
      vertices.push(
        bend * t * t + Math.cos(a) * width * r,
        t * height,
        Math.sin(a) * depth * r,
      );
      if (i < rows && j < slices) {
        const n = i * (slices + 1) + j;
        indices.push(
          n,
          n + slices + 1,
          n + 1,
          n + 1,
          n + slices + 1,
          n + slices + 2,
        );
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function squirrelHand(
  parent: THREE.Group,
  fur: THREE.Material,
  tan: THREE.Material,
  side: number,
) {
  sphere(parent, fur, 0, 0, 0, 0.17, 0.18, 0.11, 20);
  for (let i = 0; i < 3; i++) {
    const f = sphere(
      parent,
      fur,
      -0.1 + i * 0.095,
      -0.115,
      0.055,
      0.061,
      0.13,
      0.065,
      14,
    );
    f.rotation.z = (i - 1) * -0.2;
  }
  sphere(
    parent,
    fur,
    -side * 0.17,
    0.015,
    0.055,
    0.072,
    0.11,
    0.07,
    16,
  ).rotation.z = -side * 0.6;
  sphere(parent, tan, 0, -0.013, -0.089, 0.1, 0.12, 0.015, 16);
}

export type SquirrelCharacter = {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  tail: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  arms: { left: THREE.Group; right: THREE.Group };
  forearms: { left: THREE.Group; right: THREE.Group };
  hands: { left: THREE.Group; right: THREE.Group };
  legs: { left: THREE.Group; right: THREE.Group };
  feet: { left: THREE.Group; right: THREE.Group };
  eyes: { left: Eye; right: Eye };
  setExpression: (
    expression: 'sneaky' | 'gleeful' | 'shocked' | 'defeated',
  ) => void;
  setBlink: (amount: number) => void;
  lookAt: (x: number, y: number) => void;
};

export function createSquirrel(): SquirrelCharacter {
  const root = group();
  root.name = 'Bristol mischievous squirrel';
  const fur = material('#ce5816', 0.64),
    furLight = material('#e17620', 0.62);
  const cream = material('#f2ce8b', 0.69),
    muzzleCream = material('#ffe0a2', 0.59),
    innerEar = material('#b85d41', 0.73);
  const brown = material('#673015', 0.62),
    noseMat = material('#54210e', 0.3);
  const white = material('#fff9e8', 0.45),
    shirtMat = material('#fffaf0', 0.79),
    seamMat = material('#e5ddd0', 0.81);
  const iris = material('#a96820', 0.29),
    pupil = material('#170c06', 0.23),
    shine = new THREE.MeshBasicMaterial({ color: '#fff' });
  const denim = material('#16768b', 0.79),
    denimSeam = material('#08586c', 0.85);
  const body = group(root);
  body.name = 'Squirrel torso';

  // The high volume, curled tail is behind the body, with a raised cream stripe following its curl.
  const tail = group(body, 0.05, 0.08, -0.12);
  tail.name = 'Articulated curled tail';
  tail.scale.x = 0.82;
  const tailPoints = [
    [0.15, 0.58, -0.42],
    [0.76, 0.72, -0.47],
    [1.1, 1.24, -0.48],
    [1.18, 1.87, -0.44],
    [1.06, 2.4, -0.36],
    [1.42, 2.7, -0.26],
    [1.78, 2.46, -0.19],
    [1.67, 2.14, -0.15],
    [1.43, 2.2, -0.12],
  ];
  const tailPath = curve(tailPoints);
  const tailRadius = (t: number) => {
    const profile = [0.17, 0.3, 0.37, 0.4, 0.42, 0.41, 0.33, 0.23, 0.018];
    const q = t * (profile.length - 1),
      n = Math.floor(q),
      a = q - n;
    return THREE.MathUtils.lerp(
      profile[Math.min(n, profile.length - 1)],
      profile[Math.min(n + 1, profile.length - 1)],
      a,
    );
  };
  mesh(taperedTube(tailPath, tailRadius, 72, 16, 0.82), fur, tail);
  const stripePoints = tailPoints.map((p, i) => [
    p[0] - 0.065,
    p[1],
    p[2] + tailRadius(i / (tailPoints.length - 1)) * 0.77,
  ]);
  mesh(
    taperedTube(
      curve(stripePoints),
      (t) => Math.max(0.003, tailRadius(t) * 0.41),
      72,
      10,
      0.3,
    ),
    cream,
    tail,
  );
  // Sparse sculpted fur points break the silhouette without a costly hair simulation.
  for (let i = 0; i < 10; i++) {
    const t = 0.16 + i * 0.064,
      p = tailPath.getPointAt(t),
      r = tailRadius(t);
    const left = i % 2 === 0 ? 1 : -1;
    const tuftPath = curve([
      [p.x + left * r * 0.79, p.y, p.z],
      [p.x + left * r * 1.02, p.y + 0.035, p.z],
      [p.x + left * r * 1.04, p.y + 0.085, p.z - 0.025],
    ]);
    mesh(
      taperedTube(
        tuftPath,
        (q) => Math.max(0.002, 0.043 * Math.pow(1 - q, 0.85)),
        12,
        9,
      ),
      fur,
      tail,
    );
  }

  sphere(body, fur, 0, 1.22, 0, 0.56, 0.69, 0.39, 28);
  // One smooth sleeveless shirt volume (not stacked spheres), with a visible collar and hem.
  const shirtProfile = new THREE.SplineCurve([
    new THREE.Vector2(0.47, 0.72),
    new THREE.Vector2(0.52, 0.76),
    new THREE.Vector2(0.54, 0.91),
    new THREE.Vector2(0.52, 1.2),
    new THREE.Vector2(0.48, 1.47),
    new THREE.Vector2(0.36, 1.65),
    new THREE.Vector2(0.26, 1.67),
  ]).getPoints(36);
  const shirtGeo = new THREE.LatheGeometry(shirtProfile, 40);
  mesh(shirtGeo, shirtMat, body, [0, 0, 0], [1, 1, 0.73]);
  const hem = mesh(
    new THREE.TorusGeometry(0.507, 0.018, 9, 40),
    seamMat,
    body,
    [0, 0.77, 0],
    [1, 0.73, 1],
  );
  hem.rotation.x = Math.PI / 2;
  const collar = mesh(
    new THREE.TorusGeometry(0.265, 0.027, 7, 28),
    seamMat,
    body,
    [0, 1.662, 0],
    [1, 0.8, 1],
  );
  collar.rotation.x = Math.PI / 2;
  curvedLabel(body, brandTexture(true), 0.7, 0.7, 1.23, 0.397, 0.088);

  // Shorts and separate rolled hems give the lower body a recognisable dressed silhouette.
  softBox(body, denim, 0.88, 0.42, 0.61, 0.13, [0, 0.65, 0.01]);
  for (const side of [-1, 1]) {
    sphere(body, denim, side * 0.29, 0.56, 0.015, 0.3, 0.23, 0.33, 24);
    cord(
      body,
      [
        [side * 0.09, 0.4, 0.275],
        [side * 0.28, 0.37, 0.3],
        [side * 0.46, 0.41, 0.235],
      ],
      0.022,
      denimSeam,
      15,
      6,
    );
    cord(
      body,
      [
        [side * 0.02, 0.75, 0.333],
        [side * 0.055, 0.67, 0.361],
        [side * 0.07, 0.58, 0.35],
      ],
      0.018,
      cream,
      12,
      6,
    );
  }

  const legs = {
    left: group(body, -0.31, 0.59, 0.01),
    right: group(body, 0.31, 0.59, 0.01),
  };
  const feet = { left: group(), right: group() };
  for (const [key, side] of [
    ['left', -1],
    ['right', 1],
  ] as const) {
    const leg = legs[key];
    sphere(leg, fur, 0, -0.25, 0.01, 0.15, 0.29, 0.15, 22);
    const foot = feet[key];
    leg.add(foot);
    foot.position.set(side * 0.04, -0.43, 0.12);
    foot.rotation.y = side * 0.13;
    sphere(foot, fur, 0, 0, 0.06, 0.23, 0.13, 0.31, 22);
    for (let i = 0; i < 3; i++)
      sphere(
        foot,
        muzzleCream,
        -0.135 + i * 0.133,
        -0.005,
        0.29,
        0.078,
        0.084,
        0.097,
        16,
      );
    sphere(foot, brown, 0, -0.108, 0.06, 0.115, 0.016, 0.17, 16);
  }

  const arms = {
    left: group(body, -0.46, 1.45, 0),
    right: group(body, 0.46, 1.45, 0),
  };
  const forearms = { left: group(), right: group() },
    hands = { left: group(), right: group() };
  for (const [key, side] of [
    ['left', -1],
    ['right', 1],
  ] as const) {
    const arm = arms[key];
    // Sleeveless armhole visible around the fur shoulder.
    sphere(arm, fur, side * 0.075, -0.09, 0.002, 0.21, 0.23, 0.2, 22);
    cord(
      arm,
      [
        [side * 0.06, -0.02, 0],
        [side * 0.24, -0.22, 0.02],
        [side * 0.3, -0.39, 0.09],
      ],
      0.115,
      fur,
      18,
      10,
    );
    const elbow = forearms[key];
    arm.add(elbow);
    elbow.position.set(side * 0.3, -0.39, 0.09);
    cord(
      elbow,
      [
        [0, 0, 0],
        [-side * 0.095, -0.12, 0.1],
        [-side * 0.11, -0.27, 0.18],
      ],
      0.105,
      fur,
      16,
      10,
    );
    const hand = hands[key];
    elbow.add(hand);
    hand.position.set(-side * 0.11, -0.28, 0.18);
    hand.rotation.z = -side * 0.1;
    squirrelHand(hand, fur, cream, side);
  }

  const head = group(body, 0, 2.06, 0.03);
  head.name = 'Squirrel expressive head';
  const headGeo = new THREE.SphereGeometry(1, 48, 36),
    headPos = headGeo.attributes.position;
  for (let i = 0; i < headPos.count; i++) {
    const y = headPos.getY(i),
      wideCheeks = 1 + 0.2 * Math.exp(-Math.pow((y + 0.24) / 0.48, 2));
    headPos.setX(i, headPos.getX(i) * 0.72 * wideCheeks);
    headPos.setY(i, y * 0.6);
    headPos.setZ(i, headPos.getZ(i) * 0.55);
  }
  headGeo.computeVertexNormals();
  mesh(headGeo, furLight, head);
  // One continuous, broad cheek/muzzle sculpt replaces the intersecting cheek balls.
  const cheekGeo = new THREE.SphereGeometry(1, 48, 32),
    cheekPos = cheekGeo.attributes.position;
  for (let i = 0; i < cheekPos.count; i++) {
    const y = cheekPos.getY(i),
      flare = 0.86 + 0.14 * THREE.MathUtils.smoothstep(y, -0.65, 0.25);
    cheekPos.setX(i, cheekPos.getX(i) * 0.8 * flare);
    cheekPos.setY(i, y * 0.33);
    cheekPos.setZ(i, cheekPos.getZ(i) * 0.275 * (1 - 0.08 * y));
  }
  cheekGeo.computeVertexNormals();
  mesh(cheekGeo, cream, head, [0, -0.235, 0.355]);
  for (const side of [-1, 1]) {
    // Cheek tufts merge into the wide cheek line, rather than reading as separate spikes.
    for (let i = 0; i < 2; i++) {
      mesh(
        taperedTube(
          curve([
            [side * 0.66, -0.005 - i * 0.12, 0.16],
            [side * (0.8 + i * 0.015), 0.005 - i * 0.095, 0.17],
            [side * (0.88 + i * 0.005), 0.035 - i * 0.095, 0.145],
          ]),
          (t) => Math.max(0.001, 0.064 * (1 - t)),
          16,
          10,
        ),
        i === 1 ? cream : furLight,
        head,
      );
    }
  }

  const eyeLeft = createEye(
    head,
    -0.3,
    0.115,
    0.488,
    white,
    iris,
    pupil,
    shine,
    brown,
    0.76,
  );
  const eyeRight = createEye(
    head,
    0.3,
    0.115,
    0.488,
    white,
    iris,
    pupil,
    shine,
    brown,
    0.76,
  );
  // The irises keep their amber roundness inside a narrow, angled squint.
  eyeLeft.gaze.scale.set(1.12, 1.9, 1.05);
  eyeRight.gaze.scale.set(1.12, 1.9, 1.05);
  eyeLeft.brow.scale.set(1.14, 1.22, 1.24);
  eyeRight.brow.scale.set(1.14, 1.22, 1.24);
  eyeLeft.root.rotation.z = -0.2;
  eyeRight.root.rotation.z = 0.16;
  // Upper eyelid ridges and forehead brow volumes shape a mischievous, non-generic face.
  for (const side of [-1, 1]) {
    cord(
      head,
      [
        [side * 0.075, 0.2, 0.487],
        [side * 0.25, 0.37, 0.427],
        [side * 0.48, 0.25, 0.373],
      ],
      0.048,
      fur,
      32,
      12,
    );
  }
  const muzzle = group(head, 0, -0.125, 0.475);
  sphere(muzzle, muzzleCream, -0.125, -0.05, 0.03, 0.195, 0.145, 0.18, 24);
  sphere(muzzle, muzzleCream, 0.125, -0.05, 0.03, 0.195, 0.145, 0.18, 24);
  const nose = sphere(muzzle, noseMat, 0, 0.078, 0.165, 0.17, 0.111, 0.115, 32);
  const npos = nose.geometry.attributes.position;
  for (let i = 0; i < npos.count; i++)
    npos.setX(i, npos.getX(i) * (0.7 + (0.3 * (npos.getY(i) + 1)) / 2));
  nose.geometry.computeVertexNormals();
  sphere(
    muzzle,
    material('#84411d', 0.27),
    -0.028,
    0.127,
    0.253,
    0.05,
    0.017,
    0.009,
    16,
  );
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++)
      sphere(
        muzzle,
        brown,
        side * (0.13 + (i % 2) * 0.05),
        -0.014 - Math.floor(i / 2) * 0.05,
        0.19 - (i % 2) * 0.025,
        0.008,
        0.008,
        0.005,
        8,
      );
  }
  const smile = group(head, 0, -0.29, 0.615);
  const smirkShape = new THREE.Shape();
  smirkShape.moveTo(-0.34, 0.055);
  smirkShape.bezierCurveTo(-0.12, -0.018, 0.17, -0.005, 0.37, 0.115);
  smirkShape.bezierCurveTo(0.19, -0.14, -0.19, -0.16, -0.34, 0.055);
  const smirkGeo = new THREE.ExtrudeGeometry(smirkShape, {
    depth: 0.016,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.01,
    bevelThickness: 0.007,
    curveSegments: 22,
  });
  const smirkPos = smirkGeo.attributes.position;
  for (let i = 0; i < smirkPos.count; i++)
    smirkPos.setZ(
      i,
      smirkPos.getZ(i) + 0.034 - 0.12 * Math.pow(smirkPos.getX(i) / 0.4, 2),
    );
  smirkGeo.computeVertexNormals();
  mesh(smirkGeo, brown, smile);
  cord(
    smile,
    [
      [-0.39, 0.105, -0.05],
      [-0.24, -0.008, 0.018],
      [0, -0.035, 0.054],
      [0.24, 0.012, 0.018],
      [0.4, 0.145, -0.06],
    ],
    0.022,
    brown,
    32,
    7,
  );
  for (const side of [-1, 1]) {
    const tooth = softBox(smile, white, 0.112, 0.16, 0.06, 0.022, [
      side * 0.061,
      -0.071,
      0.065,
    ]);
    tooth.rotation.z = side * 0.04;
  }
  const surpriseMouth = sphere(
    head,
    pupil,
    0,
    -0.33,
    0.641,
    0.12,
    0.15,
    0.022,
    30,
  );
  surpriseMouth.visible = false;
  surpriseMouth.userData.rigMutable = true;

  for (const side of [-1, 1]) {
    const ear = group(head, side * 0.46, 0.36, -0.04);
    ear.rotation.z = -side * 0.12;
    mesh(earGeometry(0.18, 0.81, 0.115, side * 0.075), furLight, ear);
    mesh(
      earGeometry(0.108, 0.58, 0.024, side * 0.055),
      innerEar,
      ear,
      [0, 0.095, 0.055],
    );
    for (let i = 0; i < 3; i++) {
      const tuft = curve([
        [side * 0.065, 0.69, 0],
        [side * (0.075 + (i - 1) * 0.035), 0.84 + (i % 2) * 0.035, 0],
        [side * (0.085 + (i - 1) * 0.115), 0.99 - Math.abs(i - 1) * 0.06, 0.01],
      ]);
      mesh(
        taperedTube(tuft, (t) => Math.max(0.001, 0.037 * (1 - t)), 16, 10),
        furLight,
        ear,
      );
    }
  }
  for (let i = 0; i < 3; i++) {
    const x = -0.095 + i * 0.08;
    mesh(
      taperedTube(
        curve([
          [x, 0.5, 0.035],
          [x + 0.02, 0.66 + (i % 2) * 0.04, -0.01],
          [x + 0.09, 0.72 + (i % 2) * 0.04, -0.045],
        ]),
        (t) => Math.max(0.001, 0.059 * (1 - t)),
        20,
        12,
      ),
      fur,
      head,
    );
  }

  let eyeHeight = 0.37,
    blink = 0;
  function setBlink(amount: number) {
    blink = THREE.MathUtils.clamp(amount, 0, 1);
    eyeLeft.root.scale.y = eyeHeight * (1 - blink * 0.94);
    eyeRight.root.scale.y = eyeHeight * (1 - blink * 0.94);
  }
  function setExpression(
    expression: 'sneaky' | 'gleeful' | 'shocked' | 'defeated',
  ) {
    eyeHeight =
      expression === 'shocked'
        ? 0.72
        : expression === 'gleeful'
          ? 0.4
          : expression === 'defeated'
            ? 0.42
            : 0.37;
    const z =
      expression === 'sneaky'
        ? -0.35
        : expression === 'gleeful'
          ? -0.3
          : expression === 'defeated'
            ? 0.18
            : 0.01;
    eyeLeft.brow.rotation.z = z;
    eyeRight.brow.rotation.z = -z;
    const by =
      expression === 'shocked'
        ? 0.43
        : expression === 'defeated'
          ? 0.31
          : 0.295;
    eyeLeft.brow.position.y = by;
    eyeRight.brow.position.y = by;
    surpriseMouth.visible = expression === 'shocked';
    smile.visible = expression !== 'shocked';
    smile.rotation.z = expression === 'defeated' ? -0.04 : 0;
    setBlink(blink);
  }
  function lookAt(x: number, y: number) {
    const gx = THREE.MathUtils.clamp(x, -1, 1) * 0.06,
      gy = THREE.MathUtils.clamp(y, -1, 1) * 0.04;
    eyeLeft.gaze.position.x = 0.012 + gx;
    eyeRight.gaze.position.x = -0.01 + gx;
    eyeLeft.gaze.position.y = -0.01 + gy;
    eyeRight.gaze.position.y = -0.01 + gy;
  }
  setExpression('sneaky');
  batchStaticParts(root);
  return {
    root,
    body,
    head,
    tail,
    leftArm: arms.left,
    rightArm: arms.right,
    leftLeg: legs.left,
    rightLeg: legs.right,
    arms,
    forearms,
    hands,
    legs,
    feet,
    eyes: { left: eyeLeft, right: eyeRight },
    setExpression,
    setBlink,
    lookAt,
  };
}

export type SquirrelRig = SquirrelCharacter;

/** Dispose all unique character geometries, materials and label textures on scene teardown. */
export function disposeCharacter(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>(),
    textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    const list = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const mat of list) {
      materials.add(mat);
      const map = (mat as THREE.MeshStandardMaterial).map;
      if (map) textures.add(map);
    }
  });
  geometries.forEach((g) => g.dispose());
  textures.forEach((t) => t.dispose());
  materials.forEach((m) => m.dispose());
}
