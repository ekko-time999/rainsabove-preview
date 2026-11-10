import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BoxBatch, addGlowSprite, archedWallGeometry, addArchRing, archBandGeometry, curtainGeometry, contactBatch, makeContactMaterial, contactPatch, mergeStatic } from './utils.js';
import { createSconce } from './foyer.js';
import { buildHorseshoe } from './horseshoe.js';
import { PIT, RAKE, houseFloorY } from './plan.js';

const BACK = -30.6;        // 走廊尽头 / 观众席后墙
const FRONT = -47.6;       // 台口墙面
const CENTER = (BACK + FRONT) / 2;
const HALF_W = 9;
const HEIGHT = 12;
const STAGE_Y = 0.95;      // 台面高度（台唇处）
const STAGE_END = -57.8;
const STAGE_SLOPE = 0.015; // 舞台向观众方向微斜 1.5%
const STAGE_HALF = 12.9;   // 主台 + 两侧各 6m 侧台
/* 台面标高：台唇 0.95m，后端抬起约 1.10m */
const stageFloorY = (z) => STAGE_Y + STAGE_SLOPE * (FRONT - z);

const COLS = 10;
const ROWS = 9;
const SEAT_STEP = 0.66;
const ROW_STEP = 1.15;
const ROW_START = -33.8;

// 全场只保留两种色温倾向：观众席与舞台主光偏暖，舞台纵深补光偏冷
const WARM = 0xffb478;
const COOL = 0x9db8dd;

/* ---------- 座椅：软包坐垫 + 靠背 + 底座 + 扶手，合并成一个可实例化几何体 ---------- */
export function seatGeometry() {
  const parts = [];

  const grade = (geo, v) => {
    const color = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < color.length; i += 3) {
      color[i] = v;
      color[i + 1] = v;
      color[i + 2] = v;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(color, 3));
    return geo;
  };

  const cushion = new RoundedBoxGeometry(0.55, 0.16, 0.5, 1, 0.045);
  cushion.rotateX(-0.035);
  cushion.translate(0, 0.46, 0.03);
  parts.push(grade(cushion, 1));

  const back = new THREE.BoxGeometry(0.55, 0.58, 0.11);
  back.rotateX(-0.1);
  back.translate(0, 0.79, 0.25);
  parts.push(grade(back, 0.9));

  // 靠背顶部的圆滚边，远看是软包轮廓，近看有厚度
  const roll = new THREE.CylinderGeometry(0.052, 0.052, 0.55, 6, 1, false);
  roll.rotateZ(Math.PI / 2);
  roll.rotateX(-0.1);
  roll.translate(0, 1.08, 0.25);
  parts.push(grade(roll, 0.94));

  const base = new THREE.BoxGeometry(0.4, 0.4, 0.34);
  base.translate(0, 0.2, 0.03);
  parts.push(grade(base, 0.48));

  for (const sign of [-1, 1]) {
    const arm = new THREE.BoxGeometry(0.075, 0.1, 0.42);
    arm.translate(sign * 0.3, 0.565, 0.05);
    parts.push(grade(arm, 0.76));

    const post = new THREE.BoxGeometry(0.05, 0.24, 0.11);
    post.translate(sign * 0.3, 0.36, 0.13);
    parts.push(grade(post, 0.5));
  }

  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
}

/* ---------- 排号铜牌：共用一张图集，合并成一次 draw call ---------- */
function rowPlateGeometry(rows, w, h) {
  const geos = [];
  const step = 1 / rows;
  for (let r = 0; r < rows; r++) {
    const u0 = r * step + step * 0.012;
    const u1 = (r + 1) * step - step * 0.012;
    const z = ROW_START - r * ROW_STEP + 0.3;
    for (const sign of [-1, 1]) {
      const geo = new THREE.PlaneGeometry(w, h);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        uv.setX(i, u0 + uv.getX(i) * (u1 - u0));
      }
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(sign * 0.972, 0.73, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, sign === 1 ? -Math.PI / 2 : Math.PI / 2, 0)),
        new THREE.Vector3(1, 1, 1)
      );
      geo.applyMatrix4(m);
      geos.push(geo);
    }
  }
  return mergeGeometries(geos, false);
}

/* ---------- 脚光体积光：多层朝向相机的软片，横向高斯、纵向渐隐、噪声打散 ----------
   用一批实例化四边形近似光柱的散射体积。每个软片都以光轴为骨架、屏幕朝向地铺开，
   边缘 alpha 收到 0，因此不存在任何可辨认的几何直边；再按视线夹角整体衰减，
   正对光轴时几乎看不到边界，斜看才显出体积。 */
function buildSoftShafts(full) {
  const layers = full
    ? [
        { roll: -0.28, rad: 0.92, strength: 0.8, len: 2.9, seed: 0.0 },
        { roll: 0.02, rad: 1.26, strength: 0.52, len: 3.25, seed: 1.7 },
        { roll: 0.3, rad: 0.74, strength: 0.62, len: 2.7, seed: 3.1 }
      ]
    : [
        { roll: -0.24, rad: 1.06, strength: 0.72, len: 3.0, seed: 0.4 },
        { roll: 0.22, rad: 0.8, strength: 0.55, len: 2.75, seed: 2.6 }
      ];

  const axis = new THREE.Vector3(0, 0.864, -0.502);
  const originY = STAGE_Y + 0.16;
  const originZ = FRONT + 0.14;
  const quad = new THREE.PlaneGeometry(1, 1, 1, 8);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.attributes.position);
  geo.setAttribute('uv', quad.attributes.uv);

  const count = 9 * layers.length;
  const origins = new Float32Array(count * 3);
  const axes = new Float32Array(count * 3);
  const lens = new Float32Array(count);
  const rads = new Float32Array(count);
  const rolls = new Float32Array(count);
  const seeds = new Float32Array(count);
  const strengths = new Float32Array(count);

  let k = 0;
  for (let i = -4; i <= 4; i++) {
    const jitter = ((i + 4) % 3 - 1) * 0.045;
    for (const l of layers) {
      origins[k * 3] = i * 1.3;
      origins[k * 3 + 1] = originY;
      origins[k * 3 + 2] = originZ;

      axes[k * 3] = axis.x + jitter * 0.5;
      axes[k * 3 + 1] = axis.y;
      axes[k * 3 + 2] = axis.z + jitter;

      lens[k] = l.len;
      rads[k] = l.rad;
      rolls[k] = l.roll + jitter * 1.4;
      seeds[k] = l.seed + (i + 4) * 0.63;
      strengths[k] = l.strength;
      k++;
    }
  }

  geo.setAttribute('aOrigin', new THREE.InstancedBufferAttribute(origins, 3));
  geo.setAttribute('aAxis', new THREE.InstancedBufferAttribute(axes, 3));
  geo.setAttribute('aLen', new THREE.InstancedBufferAttribute(lens, 1));
  geo.setAttribute('aRad', new THREE.InstancedBufferAttribute(rads, 1));
  geo.setAttribute('aRoll', new THREE.InstancedBufferAttribute(rolls, 1));
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  geo.setAttribute('aStrength', new THREE.InstancedBufferAttribute(strengths, 1));
  geo.instanceCount = count;
  quad.dispose();

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xffd7ad) },
      uOpacity: { value: 0.36 },
      uTime: { value: 0 }
    },
    vertexShader: /* glsl */ `
      attribute vec3 aOrigin;
      attribute vec3 aAxis;
      attribute float aLen;
      attribute float aRad;
      attribute float aRoll;
      attribute float aSeed;
      attribute float aStrength;

      varying float vU;
      varying float vT;
      varying float vViewFade;
      varying float vDistFade;
      varying float vSeed;
      varying float vStrength;

      void main() {
        float t = uv.y;
        float u = uv.x * 2.0 - 1.0;

        vec3 originV = (modelViewMatrix * vec4(aOrigin, 1.0)).xyz;
        vec3 axisV = normalize((modelViewMatrix * vec4(aAxis, 0.0)).xyz);

        // 屏幕朝向：取光轴与视线的公垂方向，作为软片的横向展开方向
        vec3 w = cross(axisV, vec3(0.0, 0.0, 1.0));
        float wl = length(w);
        w = wl > 1e-4 ? w / wl : vec3(1.0, 0.0, 0.0);

        // 每层绕光轴轻微滚转，叠出体积感而不是一张薄片
        float c = cos(aRoll);
        float s = sin(aRoll);
        vec3 spread = normalize(w * c + cross(axisV, w) * s);

        // 由灯口向外张开，根部很窄
        float halfW = aRad * (0.10 + 0.90 * pow(t, 1.45));

        vec3 posV = originV + axisV * (t * aLen) + spread * (u * halfW * 1.7);

        vU = u;
        vT = t;
        vSeed = aSeed;
        vStrength = aStrength;
        // 视线与光轴越接近，越不出现边界（正对时体积几乎消失）
        vViewFade = pow(clamp(1.0 - abs(axisV.z), 0.0, 1.0), 1.1);
        // 离得越远越淡，避免远处还是一片糊光
        vDistFade = 1.0 / (1.0 + length(originV) * 0.014);

        gl_Position = projectionMatrix * vec4(posV, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uTime;

      varying float vU;
      varying float vT;
      varying float vViewFade;
      varying float vDistFade;
      varying float vSeed;
      varying float vStrength;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float noise2(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      void main() {
        // 横向高斯衰减，并在软片边界前完全收到 0，杜绝直边
        float radial = exp(-3.1 * vU * vU);
        radial *= smoothstep(1.0, 0.7, abs(vU));

        // 纵向：根部快速亮起、远端慢慢淡出
        float vertical = smoothstep(0.0, 0.1, vT) * smoothstep(1.0, 0.52, vT);
        vertical *= 0.55 + 0.45 * smoothstep(0.0, 0.34, vT);

        // 缓慢飘动的噪声把边缘打散
        float n1 = noise2(vec2(vU * 2.4 + vSeed * 5.0, vT * 5.5 - uTime * 0.16 + vSeed * 3.0));
        float n2 = noise2(vec2(vU * 6.2 - vSeed * 2.0, vT * 13.0 + uTime * 0.23));
        float grain = clamp(0.72 + 0.4 * n1 + 0.16 * (n2 - 0.5), 0.4, 1.18);

        float alpha = uOpacity * radial * vertical * grain * vViewFade * vDistFade * vStrength;
        if (alpha < 0.002) discard;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  return { mesh, mat };
}

/* ---------- 地面光池：舞台脚光与观众席走道，合并成一张贴花 ---------- */
function lightPoolGeometry() {
  const geos = [];
  const add = (w, d, x, y, z) => {
    const geo = new THREE.PlaneGeometry(w, d);
    geo.rotateX(-Math.PI / 2);
    geo.translate(x, y, z);
    geos.push(geo);
  };

  for (const x of [-4.6, -2.3, 0, 2.3, 4.6]) {
    add(3.6, 2.8, x, stageFloorY(-49.5) + 0.006, -49.5);
  }
  // 走道光池跟随坡面：按 z 采样位移
  const addRaked = (w, d, x, z) => {
    const geo = new THREE.PlaneGeometry(w, d, 1, 4);
    geo.rotateX(-Math.PI / 2);
    geo.translate(x, 0, z);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      p.setY(i, houseFloorY(p.getZ(i)) + 0.04);
    }
    geos.push(geo);
  };
  for (const z of [-35.2, -40.0, -44.8]) {
    addRaked(2.8, 2.6, 0, z);
  }
  for (const sign of [-1, 1]) {
    addRaked(3.0, 2.4, sign * 4.4, -41.2);
  }
  return mergeGeometries(geos, false);
}

/* ---------- 后墙盲拱：带半圆顶的嵌板 ---------- */
function archPanelGeometry(width, rectH, depth) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(-width / 2, rectH);
  shape.absarc(0, rectH, width / 2, Math.PI, 0, true);
  shape.lineTo(width / 2, 0);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 20 });
}

/* 观众厅：draw call 预算 42（静置机位实测 39，含座椅与包厢）。
   主厅的三角形大多是拱券与座椅，合批不省面数，只省调用。
   首演台前区新增节目单架、谱台与地灯，纸品并作一批，地灯只加一盏点光。 */
export function buildAuditorium(scene, mats, quality) {
  const group = new THREE.Group();
  scene.add(group);

  const full = quality.tier === 'full';

  const gold = new BoxBatch(mats.gold);
  const goldDeep = new BoxBatch(mats.goldDeep, { castShadow: full });
  const wood = new BoxBatch(mats.wood, { castShadow: full });

  // 大理石墙裙单独一份材质，纹理拉开，不与木作、金饰混在一起
  const marbleMat = mats.marble.clone();
  marbleMat.map = mats.marbleMap.clone();
  marbleMat.map.repeat.set(7, 1);
  marbleMat.map.needsUpdate = true;
  const marble = new BoxBatch(marbleMat);

  const seam = new BoxBatch(mats.plasterDark);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd8ad, toneMapped: true });
  const bulbs = new BoxBatch(bulbMat, { receiveShadow: false });
  const coveMat = new THREE.MeshBasicMaterial({ color: 0x5e3a1c, toneMapped: true });
  const cove = new BoxBatch(coveMat, { receiveShadow: false });
  // 台口内侧的冷色导光条：与暖色主光形成唯一的第二种色温
  const coolMat = new THREE.MeshBasicMaterial({ color: 0x3d5a76, toneMapped: true });
  const coolTrim = new BoxBatch(coolMat, { receiveShadow: false });
  const paperMat = new THREE.MeshStandardMaterial({ color: 0xe7d9bd, roughness: 0.94, metalness: 0 });
  const paper = new BoxBatch(paperMat);

  const glassMat = mats.warmGlass.clone();
  const glows = [];

  // 观众席墙面比门厅更暗，压低环境底光，让主光只落在关键面上
  const audPlaster = mats.plaster.clone();
  audPlaster.color.setHex(0x231410);
  audPlaster.roughness = 0.94;
  const audCeiling = mats.ceiling.clone();
  audCeiling.color.setHex(0x180e0a);

  /* ---------- 地面：前区平台 + 乐池 + 5.6% 缓坡 ---------- */
  const floorMat = mats.floorHouse || mats.floor;

  // 沿 z 采样地面标高，做成随坡的平面（贴花、地毯、金线共用）
  function rakedPlane(w, d, x, z, yOff, segs = 6) {
    const geo = new THREE.PlaneGeometry(w, d, 1, segs);
    geo.rotateX(-Math.PI / 2);
    geo.translate(x, 0, z);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      p.setY(i, houseFloorY(p.getZ(i)) + yOff);
    }
    geo.computeVertexNormals();
    return geo;
  }

  // 台唇前的窄条 / 乐池后缘到第一排的平台 / 乐池两侧的平台
  const flatA = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, PIT.Z0 - FRONT), floorMat);
  flatA.rotation.x = -Math.PI / 2;
  flatA.position.set(0, 0.012, (FRONT + PIT.Z0) / 2);
  flatA.receiveShadow = true;
  group.add(flatA);

  const flatB = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, RAKE.FLAT_Z - PIT.Z1), floorMat);
  flatB.rotation.x = -Math.PI / 2;
  flatB.position.set(0, 0.012, (PIT.Z1 + RAKE.FLAT_Z) / 2);
  flatB.receiveShadow = true;
  group.add(flatB);

  for (const sign of [-1, 1]) {
    const side = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF_W - PIT.HALF, PIT.Z0 - PIT.Z1),
      floorMat
    );
    side.rotation.x = -Math.PI / 2;
    side.position.set(sign * (PIT.HALF + HALF_W) / 2, 0.012, (PIT.Z0 + PIT.Z1) / 2);
    side.receiveShadow = true;
    group.add(side);
  }

  // 缓坡：从 -45.8 抬 0.60，线性升到后墙 1.45
  const rakeGeo = new THREE.PlaneGeometry(HALF_W * 2, RAKE.REAR_Z - RAKE.FLAT_Z, 1, 30);
  rakeGeo.rotateX(-Math.PI / 2);
  rakeGeo.translate(0, 0, (RAKE.REAR_Z + RAKE.FLAT_Z) / 2);
  const rp = rakeGeo.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    rp.setY(i, houseFloorY(rp.getZ(i)) + 0.012);
  }
  rakeGeo.computeVertexNormals();
  const floor = new THREE.Mesh(rakeGeo, floorMat);
  floor.receiveShadow = true;
  group.add(floor);

  // 坡起点的踏步立面 + 金色踏口
  wood.add(HALF_W * 2, RAKE.STEP, 0.16, 0, RAKE.STEP / 2, RAKE.FLAT_Z - 0.06);
  gold.add(HALF_W * 2 - 0.2, 0.04, 0.06, 0, RAKE.STEP + 0.01, RAKE.FLAT_Z - 0.14);

  // 前沿 0.6m 抬升拆成两级 0.3m 踏步：下踏步落在前区平台上，
  // 上踏步直接借台唇立面，脚感与 walkFloorY 的两级标高一致
  wood.add(HALF_W * 2, 0.30, Math.abs(RAKE.STEP_HIGH_Z - RAKE.STEP_LOW_Z), 0, 0.15, (RAKE.STEP_LOW_Z + RAKE.STEP_HIGH_Z) / 2);
  goldDeep.add(HALF_W * 2 - 0.2, 0.028, 0.06, 0, 0.308, RAKE.STEP_LOW_Z + 0.02);
  goldDeep.add(HALF_W * 2 - 0.2, 0.028, 0.06, 0, RAKE.STEP + 0.008, RAKE.STEP_HIGH_Z + 0.02);

  /* ---------- 乐池：下沉 1.8m，中央留技术走桥 ---------- */
  const pitWallMat = audPlaster.clone();
  pitWallMat.color.setHex(0x1a100c);
  const pitFloorY = -PIT.DEPTH;
  const pitFloor = new THREE.Mesh(new THREE.PlaneGeometry(PIT.HALF * 2, PIT.Z1 - PIT.Z0), mats.floorHouse || mats.floor);
  pitFloor.rotation.x = -Math.PI / 2;
  pitFloor.position.set(0, pitFloorY, (PIT.Z0 + PIT.Z1) / 2);
  pitFloor.receiveShadow = true;
  group.add(pitFloor);

  const pitW = PIT.HALF * 2;
  const pitD = PIT.Z0 - PIT.Z1;
  const pitH = PIT.DEPTH;
  const pitRs = [
    [pitW, pitH, 0.12, 0, pitFloorY + pitH / 2, PIT.Z0],
    [pitW, pitH, 0.12, 0, pitFloorY + pitH / 2, PIT.Z1],
    [0.12, pitH, pitD, -PIT.HALF, pitFloorY + pitH / 2, (PIT.Z0 + PIT.Z1) / 2],
    [0.12, pitH, pitD, PIT.HALF, pitFloorY + pitH / 2, (PIT.Z0 + PIT.Z1) / 2]
  ];
  for (const [w, h, d, x, y, z] of pitRs) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), pitWallMat);
    wall.position.set(x, y, z);
    wall.receiveShadow = true;
    group.add(wall);
  }

  // 坑底：乐谱架与座椅的剪影，只在暗部里留个轮廓
  for (const x of [-4.4, -3.2, -2.0, 2.0, 3.2, 4.4]) {
    goldDeep.add(0.035, 0.66, 0.035, x, pitFloorY + 0.33, -46.85);
    wood.add(0.36, 0.05, 0.26, x, pitFloorY + 0.66, -46.75);
    wood.add(0.30, 0.05, 0.30, x, pitFloorY + 0.03, -47.1);
  }
  // 技术走桥：巡游路径从这里跨过乐池
  const bridge = new THREE.Mesh(
    new THREE.BoxGeometry(PIT.BRIDGE_HALF * 2, 0.1, pitD + 0.18),
    mats.wood
  );
  bridge.position.set(0, -0.05, (PIT.Z0 + PIT.Z1) / 2);
  bridge.receiveShadow = true;
  group.add(bridge);
  wood.add(0.05, 0.02, pitD, -PIT.BRIDGE_HALF + 0.03, 0.012, (PIT.Z0 + PIT.Z1) / 2);

  // 坑口一圈矮栏杆：后缘与两侧，桥面两侧各留一道扶手
  for (let x = -PIT.HALF + 0.3; x <= PIT.HALF - 0.29; x += 0.46) {
    if (Math.abs(x) < PIT.BRIDGE_HALF + 0.12) continue;
    gold.add(0.032, 0.88, 0.032, x, 0.44, PIT.Z1 + 0.02);
  }
  gold.add(PIT.HALF - PIT.BRIDGE_HALF - 0.3, 0.06, 0.06, -(PIT.HALF + PIT.BRIDGE_HALF + 0.3) / 2, 0.88, PIT.Z1 + 0.02);
  gold.add(PIT.HALF - PIT.BRIDGE_HALF - 0.3, 0.06, 0.06, (PIT.HALF + PIT.BRIDGE_HALF + 0.3) / 2, 0.88, PIT.Z1 + 0.02);
  for (const sign of [-1, 1]) {
    // 走桥两侧在踏步范围内由踏步立柱替代，这里只保留坑口外沿栏杆
    for (let z = PIT.Z0 + 0.25; z < PIT.Z1 - 0.1; z += 0.4) {
      gold.add(0.032, 0.88, 0.032, sign * PIT.HALF, 0.44, z);
    }
    gold.add(0.06, 0.06, pitD, sign * PIT.HALF, 0.88, (PIT.Z0 + PIT.Z1) / 2);
  }

  /* ---------- 中央地毯与金线：随坡面铺 ---------- */
  const runner = new THREE.Mesh(
    rakedPlane(1.72, RAKE.REAR_Z - RAKE.FLAT_Z, 0, (RAKE.REAR_Z + RAKE.FLAT_Z) / 2, 0.033, 26),
    mats.carpet
  );
  runner.receiveShadow = true;
  group.add(runner);

  const runnerLines = mergeGeometries([
    rakedPlane(0.05, RAKE.REAR_Z - RAKE.FLAT_Z, -0.88, (RAKE.REAR_Z + RAKE.FLAT_Z) / 2, 0.047, 26),
    rakedPlane(0.05, RAKE.REAR_Z - RAKE.FLAT_Z, 0.88, (RAKE.REAR_Z + RAKE.FLAT_Z) / 2, 0.047, 26)
  ], false);
  group.add(new THREE.Mesh(runnerLines, mats.gold));

  // 防滑条：坡道上每隔 2.2m 一道，提示这里是有坡度的地面
  const antiSlip = [];
  for (let z = -43.2; z <= -34.6; z += 2.15) {
    const g = new THREE.PlaneGeometry(1.66, 0.06);
    g.rotateX(-Math.PI / 2);
    g.translate(0, houseFloorY(z) + 0.045, z);
    antiSlip.push(g);
  }
  group.add(new THREE.Mesh(mergeGeometries(antiSlip, false), mats.goldDeep));

  // 桥面与平台的地毯
  const bridgeRunner = new THREE.Mesh(new THREE.PlaneGeometry(1.5, pitD - 0.1), mats.carpet);
  bridgeRunner.rotation.x = -Math.PI / 2;
  bridgeRunner.position.set(0, 0.009, (PIT.Z0 + PIT.Z1) / 2);
  bridgeRunner.receiveShadow = true;
  group.add(bridgeRunner);

  /* ---------- 侧墙 / 顶棚 / 后墙 ---------- */
  const sideGeo = new THREE.BoxGeometry(0.35, HEIGHT, FRONT - BACK);
  for (const sign of [-1, 1]) {
    const wall = new THREE.Mesh(sideGeo, audPlaster);
    wall.position.set(sign * 9.17, HEIGHT / 2, CENTER);
    wall.receiveShadow = true;
    group.add(wall);
  }

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, FRONT - BACK), audCeiling);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, HEIGHT, CENTER);
  group.add(ceiling);

  /* ---------- 马蹄形观众厅：弧墙 / 三层包厢 / 环廊 / 186 席 ---------- */
  const horseshoe = buildHorseshoe({
    group,
    mats,
    full,
    batches: { gold, goldDeep, wood, marble, seam, bulbs, cove, coolTrim },
    seatGeo: seatGeometry(),
    audPlaster,
    glows
  });

  /* ---------- 舞台侧下方与包厢投影的柔和遮蔽 ---------- */
  const aoMat = makeContactMaterial(mats, 0.55);
  const aoGeos = [];
  for (const sign of [-1, 1]) {
    for (const z of [-50.6, -53.4]) {
      aoGeos.push(contactPatch(sign * 4.0, stageFloorY(z) + 0.012, z, 2.3, 0.9, true));
    }
  }
  const aoMesh = new THREE.Mesh(mergeGeometries(aoGeos, false), aoMat);
  aoMesh.renderOrder = 1;
  group.add(aoMesh);

  /* ---------- 顶棚横梁 ---------- */
  for (const z of [-33.5, -36.7, -39.9, -43.1, -46.3]) {
    wood.add(17.6, 0.26, 0.42, 0, 11.82, z);
    goldDeep.add(17.7, 0.05, 0.5, 0, 11.64, z);
  }

  /* ---------- 台口墙与拱饰 ---------- */
  // 台口墙厚 0.8m：拱洞侧壁因此有厚度，不再是薄片
  const PROS_DEPTH = 0.8;
  const PROS_Z = -48.4;
  const proscenium = new THREE.Mesh(
    archedWallGeometry(18, HEIGHT, 6, 6.4, 2.6, PROS_DEPTH, 44),
    audPlaster
  );
  proscenium.position.z = PROS_Z;
  proscenium.receiveShadow = true;
  group.add(proscenium);

  // 台口墙内侧返墙与洞口侧壁，读出 0.8m 的厚度
  for (const sign of [-1, 1]) {
    seam.add(0.1, 6.4, PROS_DEPTH, sign * 5.98, 3.2, PROS_Z + PROS_DEPTH / 2);
    goldDeep.add(0.06, 6.3, PROS_DEPTH + 0.1, sign * 5.95, 3.15, PROS_Z + PROS_DEPTH / 2);
  }
  seam.add(12.0, 0.1, PROS_DEPTH, 0, 9.02, PROS_Z + PROS_DEPTH / 2);

  addArchRing(goldDeep, 6.2, 6.4, 2.6, 0.38, 0.18, -47.56, 40);
  addArchRing(gold, 6.46, 6.4, 2.6, 0.14, 0.24, -47.48, 40);
  addArchRing(coolTrim, 6.3, 6.4, 2.62, 0.045, 0.07, -47.53, 40);
  for (const sign of [-1, 1]) {
    coolTrim.add(0.035, 6.3, 0.05, sign * 6.3, 3.16, -47.53);
  }

  for (const sign of [-1, 1]) {
    wood.add(0.7, 9.1, 0.5, sign * 6.9, 4.55, -47.5);
    marble.add(0.78, 0.5, 0.58, sign * 6.9, 0.26, -47.5);
    gold.add(0.9, 0.28, 0.62, sign * 6.9, 9.3, -47.46);
    goldDeep.add(0.98, 0.12, 0.7, sign * 6.9, 9.52, -47.44);
  }
  gold.add(14.4, 0.22, 0.36, 0, 9.72, -47.48);
  goldDeep.add(15.0, 0.3, 0.42, 0, 9.96, -47.46);

  const crest = new THREE.Mesh(new THREE.CircleGeometry(0.62, 40), mats.crest);
  crest.position.set(0, 10.62, -47.42);
  group.add(crest);

  /* ---------- 防火幕：平时收在台口上方，露出下沿、双导轨与卷扬五金 ---------- */
  const ironMat = new THREE.MeshStandardMaterial({
    color: 0x45443e,
    roughness: 0.52,
    metalness: 0.66
  });
  const iron = new BoxBatch(ironMat, { castShadow: full, receiveShadow: true });
  const FIRE_Z = PROS_Z - 0.18;
  iron.add(12.6, 1.98, 0.09, 0, 9.57, FIRE_Z);            // 铁幕主体：下沿 8.58 → 10.56
  iron.add(12.64, 0.18, 0.15, 0, 8.60, FIRE_Z);           // 下沿加重杆
  gold.add(12.66, 0.03, 0.17, 0, 8.52, FIRE_Z);           // 下沿金线
  for (const sign of [-1, 1]) {
    for (const dz of [-0.08, 0.08]) {
      iron.add(0.05, 9.6, 0.05, sign * 5.90, 5.76, FIRE_Z + dz); // 双导轨
    }
    goldDeep.add(0.09, 0.05, 0.24, sign * 5.90, 0.98, FIRE_Z);     // 导轨落地的底座
  }
  // 顶部卷筒与吊索
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 12.4, 12, 1), ironMat);
  drum.rotation.z = Math.PI / 2;
  drum.position.set(0, 10.38, FIRE_Z - 0.12);
  group.add(drum);
  for (const x of [-4.6, -1.6, 1.6, 4.6]) {
    iron.add(0.025, 0.42, 0.025, x, 10.2, FIRE_Z - 0.12);
  }
  iron.build(group);

  /* ---------- 垂落的幕布 ---------- */
  const curtainL = new THREE.Mesh(curtainGeometry(4.6, 8.6, 9, 0.2), mats.velvet);
  curtainL.position.set(-4.05, STAGE_Y + 4.3, -48.95);
  curtainL.name = 'curtain-l';
  // 幕布要在运行时改变换，不参与静态合批（代价是多 1 个 draw call）
  curtainL.userData.noMerge = true;
  group.add(curtainL);
  const curtainR = curtainL.clone();
  curtainR.name = 'curtain-r';
  curtainR.position.x = 4.05;
  curtainR.userData.noMerge = true;
  group.add(curtainR);

  const valance = new THREE.Mesh(curtainGeometry(13.2, 1.0, 13, 0.19), mats.velvet);
  valance.position.set(0, 8.74, -48.86);
  group.add(valance);

  // 台上方的黑色空档用一道深色横幕填住，避免台口上方出现“洞”
  const teaserMat = new THREE.MeshStandardMaterial({
    map: mats.velvet.map,
    color: 0x8c2f35,
    roughness: 0.92,
    emissive: 0x4a1014,
    emissiveIntensity: 1.4,
    side: THREE.DoubleSide
  });
  const teaser = new THREE.Mesh(curtainGeometry(13.0, 4.0, 14, 0.14), teaserMat);
  teaser.position.set(0, 8.1, -54.0);
  group.add(teaser);

  // 檐幕下沿的金色流苏
  gold.add(13.3, 0.055, 0.08, 0, 8.24, -48.84);
  for (let x = -6.3; x <= 6.31; x += 0.46) {
    goldDeep.add(0.04, 0.15, 0.045, x, 8.13, -48.82);
  }

  gold.add(13.4, 0.1, 0.12, 0, 9.28, -48.9);
  goldDeep.add(13.6, 0.08, 0.18, 0, 9.4, -48.88);
  cove.add(12.9, 0.045, 0.045, 0, 9.24, -48.78);

  /* ---------- 舞台：地面 / 台唇 / 后墙 / 侧幕 ---------- */
  const stageWood = mats.wood.clone();
  stageWood.map = mats.woodMap.clone();
  stageWood.map.repeat.set(4, 3);
  stageWood.map.needsUpdate = true;

  // 主台与两侧侧台共用一块台面：横向 25.8m（两侧各 6m 侧台），纵向向观众微斜 1.5%
  const stageGeo = new THREE.PlaneGeometry(STAGE_HALF * 2, FRONT - STAGE_END, 1, 12);
  stageGeo.rotateX(-Math.PI / 2);
  stageGeo.translate(0, 0, (FRONT + STAGE_END) / 2);
  const sp = stageGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) sp.setY(i, stageFloorY(sp.getZ(i)));
  stageGeo.computeVertexNormals();
  const stageFloor = new THREE.Mesh(stageGeo, stageWood);
  stageFloor.receiveShadow = true;
  group.add(stageFloor);

  // 台面走位标记与胶带痕迹：跟着舞台斜度铺，只作极浅的贴花
  const tapeMat = new THREE.MeshBasicMaterial({
    color: 0xe8dfc6,
    transparent: true,
    opacity: 0.46,
    depthWrite: false
  });
  const tapeGeos = [];
  const tapeStrip = (w, d, x, z) => {
    const geo = new THREE.PlaneGeometry(w, d, 1, 2);
    geo.rotateX(-Math.PI / 2);
    geo.translate(x, 0, z);
    // 沿 z 铺的胶带要贴着 1.5% 的斜面，否则一端埋进台面、另一端浮空
    const tp = geo.attributes.position;
    for (let i = 0; i < tp.count; i++) tp.setY(i, stageFloorY(tp.getZ(i)) + 0.006);
    geo.computeVertexNormals();
    tapeGeos.push(geo);
  };
  for (const x of [-5.4, -2.7, 0, 2.7, 5.4]) tapeStrip(0.045, 8.6, x, -52.7);
  for (const z of [-49.6, -51.2, -53.4, -55.6]) tapeStrip(12.2, 0.04, -1.2, z);
  tapeStrip(1.6, 0.05, -7.6, -50.8);
  tapeStrip(1.6, 0.05, 7.6, -50.8);
  const tapeMesh = new THREE.Mesh(mergeGeometries(tapeGeos, false), tapeMat);
  tapeMesh.renderOrder = 2;
  group.add(tapeMesh);

  // 几处深色胶带斑：演员站位与换景的痕迹
  const spikeMat = new THREE.MeshBasicMaterial({
    color: 0x2a2521,
    transparent: true,
    opacity: 0.2,
    depthWrite: false
  });
  const spikeGeos = [];
  const spike = (w, d, x, z) => {
    const geo = new THREE.PlaneGeometry(w, d, 1, 2);
    geo.rotateX(-Math.PI / 2);
    geo.translate(x, stageFloorY(z) + 0.007, z);
    spikeGeos.push(geo);
  };
  for (const [x, z] of [[1.8, -50.9], [-1.4, -53.1], [3.2, -55.0], [-3.6, -52.0]]) {
    spike(0.42, 0.05, x, z);
    spike(0.05, 0.42, x, z);
  }
  const spikeMesh = new THREE.Mesh(mergeGeometries(spikeGeos, false), spikeMat);
  spikeMesh.renderOrder = 3;
  group.add(spikeMesh);

  // 台唇立面：中央按走桥宽度断开，让技术走桥经五级踏步上台
  const LIP_HALF = 13.4 / 2;
  const lipGap = PIT.BRIDGE_HALF;
  for (const sign of [-1, 1]) {
    const w = LIP_HALF - lipGap;
    const lip = new THREE.Mesh(new THREE.BoxGeometry(w, STAGE_Y, 0.16), mats.wood);
    lip.position.set(sign * (lipGap + w / 2), STAGE_Y / 2, FRONT + 0.05);
    lip.receiveShadow = true;
    group.add(lip);
    gold.add(w, 0.14, 0.22, sign * (lipGap + w / 2), STAGE_Y - 0.03, FRONT + 0.08);
    goldDeep.add(w + 0.1, 0.08, 0.26, sign * (lipGap + w / 2), STAGE_Y + 0.08, FRONT + 0.06);
  }

  /* 走桥到舞台的五级木踏步：
     起于前区平台边 -46.4，止于台口 -47.6；总高 0.95、踏面 0.24，
     与可行走面的标高函数逐级一致，避免相机悬空爬坡。 */
  const STEP_N = 5;
  const STEP_Z0 = -46.4;
  const STEP_TREAD = (STEP_Z0 - FRONT) / STEP_N;
  const STEP_RISE = STAGE_Y / STEP_N;
  for (let i = 1; i <= STEP_N; i++) {
    const top = STEP_RISE * i;
    const h = top + PIT.DEPTH;
    const cz = STEP_Z0 - STEP_TREAD * (i - 0.5);
    wood.add(PIT.BRIDGE_HALF * 2, h, STEP_TREAD + 0.01, 0, (top - PIT.DEPTH) / 2, cz);
    goldDeep.add(PIT.BRIDGE_HALF * 2 + 0.04, 0.03, 0.06, 0, top + 0.012, STEP_Z0 - STEP_TREAD * (i - 1) + 0.03);
  }
  // 踏步两侧的短立柱与分段扶手（不做斜杆，避免与其它构件的面交叉）
  for (const sign of [-1, 1]) {
    for (let i = 1; i <= STEP_N; i++) {
      const top = STEP_RISE * i;
      const cz = STEP_Z0 - STEP_TREAD * (i - 0.5);
      gold.add(0.035, 0.92, 0.035, sign * (PIT.BRIDGE_HALF + 0.02), top + 0.46, cz);
      gold.add(0.05, 0.05, STEP_TREAD, sign * (PIT.BRIDGE_HALF + 0.02), top + 0.92, cz);
    }
  }

  // 背墙比侧墙略亮一档，让洗墙光能托出舞台进深，而不是一片死黑。
  // 右侧留一道实门通后台，伴奏与道具从这里进出，巡游路径也只走这道门
  const stageWallMat = mats.plaster.clone();
  stageWallMat.color.setHex(0x35221a);
  stageWallMat.roughness = 0.9;
  const doorL = 3.9;
  const doorR = 5.3;
  const doorTop = STAGE_Y + 2.5;
  // 背墙随侧台一起加宽到 ±13.2：右侧通后台，更东侧一道门通创意工坊
  const BWH = 13.2;
  const shopDoorL = 9.2;
  const shopDoorR = 10.6;
  const backPanels = [
    [doorL + BWH, 9.7, (-BWH + doorL) / 2, STAGE_Y + 4.85],
    [shopDoorL - doorR, 9.7, (doorR + shopDoorL) / 2, STAGE_Y + 4.85],
    [BWH - shopDoorR, 9.7, (shopDoorR + BWH) / 2, STAGE_Y + 4.85],
    [doorR - doorL, 10.65 - doorTop, (doorL + doorR) / 2, (doorTop + 10.65) / 2],
    [shopDoorR - shopDoorL, 10.65 - doorTop, (shopDoorL + shopDoorR) / 2, (doorTop + 10.65) / 2]
  ];
  for (const [w, h, x, y] of backPanels) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.4), stageWallMat);
    panel.position.set(x, y, STAGE_END - 0.2);
    panel.receiveShadow = true;
    group.add(panel);
  }

  // 后台门套：木门框 + 金线，门前垂一角丝绒
  wood.add(0.16, 2.55, 0.36, doorL - 0.1, STAGE_Y + 1.25, STAGE_END - 0.02);
  wood.add(0.16, 2.55, 0.36, doorR + 0.1, STAGE_Y + 1.25, STAGE_END - 0.02);
  wood.add(doorR - doorL + 0.5, 0.16, 0.36, (doorL + doorR) / 2, doorTop + 0.08, STAGE_END - 0.02);
  goldDeep.add(0.05, 2.4, 0.06, doorL - 0.02, STAGE_Y + 1.2, STAGE_END + 0.15);
  goldDeep.add(0.05, 2.4, 0.06, doorR + 0.02, STAGE_Y + 1.2, STAGE_END + 0.15);
  const portiere = new THREE.Mesh(curtainGeometry(0.52, 2.4, 5, 0.12), mats.velvet);
  portiere.position.set(doorL + 0.24, STAGE_Y + 1.2, STAGE_END + 0.16);
  group.add(portiere);

  // 创意工坊门套：同样是木框 + 金线，门内是一间亮着工作灯的大房
  wood.add(0.16, 2.55, 0.36, shopDoorL - 0.08, STAGE_Y + 1.25, STAGE_END - 0.02);
  wood.add(0.16, 2.55, 0.36, shopDoorR + 0.08, STAGE_Y + 1.25, STAGE_END - 0.02);
  wood.add(shopDoorR - shopDoorL + 0.44, 0.16, 0.36, (shopDoorL + shopDoorR) / 2, doorTop + 0.08, STAGE_END - 0.02);
  goldDeep.add(0.05, 2.4, 0.06, shopDoorL, STAGE_Y + 1.2, STAGE_END + 0.15);
  goldDeep.add(0.05, 2.4, 0.06, shopDoorR, STAGE_Y + 1.2, STAGE_END + 0.15);
  // 舞台后端 1.10m 到工坊 0.95m 的门槛
  wood.add(1.4, 0.12, 0.5, (shopDoorL + shopDoorR) / 2, STAGE_Y + 0.06, STAGE_END + 0.24);
  goldDeep.add(1.44, 0.03, 0.06, (shopDoorL + shopDoorR) / 2, STAGE_Y + 0.13, STAGE_END + 0.48);
  // 门槛两侧都收边，侧台明步的踏口不再露毛边
  goldDeep.add(1.44, 0.03, 0.06, (shopDoorL + shopDoorR) / 2, STAGE_Y + 0.13, STAGE_END + 0.01);

  // 背墙墙裙与檐口：给舞台一个可读的建筑轮廓
  goldDeep.add(doorL + BWH, 0.16, 0.14, (doorL - BWH) / 2, STAGE_Y + 0.28, STAGE_END + 0.03);
  goldDeep.add(shopDoorL - doorR, 0.16, 0.14, (doorR + shopDoorL) / 2, STAGE_Y + 0.28, STAGE_END + 0.03);
  goldDeep.add(BWH - shopDoorR, 0.16, 0.14, (shopDoorR + BWH) / 2, STAGE_Y + 0.28, STAGE_END + 0.03);
  goldDeep.add(BWH * 2 - 0.6, 0.14, 0.14, 0, 9.42, STAGE_END + 0.03);
  goldDeep.add(0.12, 8.1, 0.1, -12.9, 5.2, STAGE_END + 0.03);
  goldDeep.add(0.12, 8.1, 0.1, 12.9, 5.2, STAGE_END + 0.03);

  // 两侧各 6m 侧台：墙体退到 ±12.9，可与主台整片布景换场
  for (const sign of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.4, 9.7, 10.4), mats.plasterDark);
    side.position.set(sign * STAGE_HALF, STAGE_Y + 4.85, (FRONT + STAGE_END) / 2);
    side.receiveShadow = true;
    group.add(side);
  }

  const stageCeil = new THREE.Mesh(new THREE.PlaneGeometry(STAGE_HALF * 2 + 0.4, 10.4), mats.plasterDark);
  stageCeil.rotation.x = Math.PI / 2;
  stageCeil.position.set(0, 10.6, (FRONT + STAGE_END) / 2);
  group.add(stageCeil);

  // 背墙壁柱：站在台上时提供可读的纵深层次
  for (const x of [-6.3, -2.9, 2.9, 6.3]) {
    wood.add(0.26, 7.6, 0.12, x, STAGE_Y + 4.2, STAGE_END + 0.04);
    goldDeep.add(0.34, 0.1, 0.18, x, 9.16, STAGE_END + 0.02);
    goldDeep.add(0.34, 0.1, 0.18, x, 1.18, STAGE_END + 0.02);
  }

  // 侧幕：向画面内收，站上舞台时能框住金框
  for (const sign of [-1, 1]) {
    for (const z of [-50.6, -53.4]) {
      const leg = new THREE.Mesh(curtainGeometry(2.0, 7.9, 7, 0.14), mats.velvet);
      leg.position.set(sign * 4.0, STAGE_Y + 3.95, z);
      group.add(leg);
    }
  }

  // 金色大画框：首演台只挂一件当前主推的作品，其余舞台保持空
  const frameZ = -56.6;
  const frameW = 4.6;
  const frameH = 5.2;
  const frameY = 3.6;
  const backPanel = new THREE.Mesh(new THREE.PlaneGeometry(frameW - 0.34, frameH - 0.34), mats.velvetWall);
  backPanel.position.set(0, frameY, frameZ + 0.02);
  group.add(backPanel);

  // 当前主推：一幅《夜航》，画布本身微微发光，靠一盏单独的造型灯打亮
  const artCanvas = document.createElement('canvas');
  artCanvas.width = 640;
  artCanvas.height = 720;
  const ag = artCanvas.getContext('2d');
  const sky = ag.createLinearGradient(0, 0, 0, 720);
  sky.addColorStop(0, '#160c09');
  sky.addColorStop(0.45, '#3d1411');
  sky.addColorStop(0.72, '#6b2a1c');
  sky.addColorStop(1, '#160a08');
  ag.fillStyle = sky;
  ag.fillRect(0, 0, 640, 720);
  const moonGlow = ag.createRadialGradient(432, 236, 6, 432, 236, 150);
  moonGlow.addColorStop(0, 'rgba(244,213,160,0.55)');
  moonGlow.addColorStop(1, 'rgba(244,213,160,0)');
  ag.fillStyle = moonGlow;
  ag.fillRect(282, 86, 300, 300);
  ag.fillStyle = '#ecd2a2';
  ag.beginPath();
  ag.arc(432, 236, 62, 0, Math.PI * 2);
  ag.fill();
  ag.strokeStyle = 'rgba(214,179,120,0.55)';
  ag.lineWidth = 2;
  ag.beginPath();
  ag.moveTo(0, 492);
  ag.lineTo(640, 492);
  ag.stroke();
  // 一个站在台口的人影，边缘留一道暖光
  ag.fillStyle = '#0c0706';
  ag.beginPath();
  ag.ellipse(214, 402, 17, 20, 0, 0, Math.PI * 2);
  ag.fill();
  ag.beginPath();
  ag.moveTo(184, 492);
  ag.bezierCurveTo(186, 440, 202, 424, 214, 424);
  ag.bezierCurveTo(230, 424, 246, 442, 248, 492);
  ag.closePath();
  ag.fill();
  ag.strokeStyle = 'rgba(214,179,120,0.35)';
  ag.lineWidth = 1.5;
  ag.beginPath();
  ag.moveTo(232, 440);
  ag.bezierCurveTo(242, 452, 246, 470, 247, 492);
  ag.stroke();
  // 台板与吊杆的几笔
  ag.strokeStyle = 'rgba(20,12,9,0.6)';
  ag.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    ag.beginPath();
    ag.moveTo(80 + i * 150, 510);
    ag.lineTo(80 + i * 150, 620);
    ag.stroke();
  }
  ag.fillStyle = 'rgba(236,222,198,0.62)';
  ag.font = '400 20px "Songti SC", "Noto Serif SC", serif';
  ag.textAlign = 'center';
  ag.fillText('夜 航 · NIGHT CROSSING', 320, 668);
  const artTex = new THREE.CanvasTexture(artCanvas);
  artTex.colorSpace = THREE.SRGBColorSpace;
  artTex.anisotropy = 8;
  const artMat = new THREE.MeshStandardMaterial({
    map: artTex,
    emissive: new THREE.Color(0x2c1210),
    emissiveMap: artTex,
    emissiveIntensity: 0.35,
    roughness: 0.9
  });
  const artwork = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 3.9), artMat);
  artwork.position.set(0, 3.32, frameZ + 0.06);
  group.add(artwork);
  // 画作内圈一道细金线
  goldDeep.add(3.62, 0.03, 0.04, 0, 5.29, frameZ + 0.08);
  goldDeep.add(3.62, 0.03, 0.04, 0, 1.36, frameZ + 0.08);
  goldDeep.add(0.03, 3.96, 0.04, -1.79, 3.32, frameZ + 0.08);
  goldDeep.add(0.03, 3.96, 0.04, 1.79, 3.32, frameZ + 0.08);
  gold.add(frameW + 0.34, 0.32, 0.34, 0, frameY + frameH / 2, frameZ);
  gold.add(frameW + 0.34, 0.32, 0.34, 0, frameY - frameH / 2, frameZ);
  gold.add(0.32, frameH, 0.34, -frameW / 2, frameY, frameZ);
  gold.add(0.32, frameH, 0.34, frameW / 2, frameY, frameZ);
  goldDeep.add(frameW + 0.55, 0.12, 0.4, 0, frameY + frameH / 2 + 0.22, frameZ - 0.02);
  goldDeep.add(frameW + 0.55, 0.12, 0.4, 0, frameY - frameH / 2 - 0.22, frameZ - 0.02);

  const stageCrest = new THREE.Mesh(new THREE.CircleGeometry(0.48, 36), mats.crest);
  stageCrest.position.set(0, frameY + frameH / 2 + 0.02, frameZ + 0.2);
  group.add(stageCrest);

  /* ---------- 首演台前区：节目单架 / 谱台 / 地灯 ----------
     都落在 stageFloorY 上，避免 1.5% 的台面斜度让脚轮悬空 */
  const psX = -3.02;
  const psZ = -55.42;
  const psY = stageFloorY(psZ);
  for (const s of [-1, 1]) {
    wood.add(0.055, 0.96, 0.055, psX + s * 0.19, psY + 0.48, psZ);
    wood.add(0.055, 0.72, 0.055, psX + s * 0.19, psY + 0.36, psZ + 0.22, 0, 0.3);
  }
  wood.add(0.52, 0.03, 0.36, psX, psY + 0.94, psZ + 0.02, 0, -0.26);
  wood.add(0.5, 0.03, 0.28, psX, psY + 0.6, psZ + 0.1, 0, -0.26);
  for (let i = 0; i < (full ? 6 : 3); i++) {
    paper.add(0.3, 0.008, 0.22, psX, psY + 0.965 + i * 0.009, psZ + 0.02, 0, -0.26);
  }
  goldDeep.add(0.52, 0.012, 0.02, psX, psY + 0.95, psZ + 0.2, 0, -0.26);

  const msX = 3.04;
  const msZ = -55.32;
  const msY = stageFloorY(msZ);
  goldDeep.add(0.028, 1.08, 0.028, msX, msY + 0.54, msZ);
  goldDeep.add(0.44, 0.022, 0.022, msX, msY + 0.04, msZ);
  goldDeep.add(0.022, 0.022, 0.44, msX, msY + 0.04, msZ);
  const msDesk = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.3), paperMat);
  msDesk.position.set(msX, msY + 1.1, msZ + 0.03);
  msDesk.rotation.x = -0.34;
  group.add(msDesk);
  goldDeep.add(0.02, 0.03, 0.46, msX, msY + 0.98, msZ - 0.12);
  gold.add(0.03, 0.03, 0.03, msX, msY + 1.16, msZ + 0.03);

  const flX = 3.55;
  const flZ = -54.55;
  const flY = stageFloorY(flZ);
  goldDeep.add(0.3, 0.025, 0.3, flX, flY + 0.012, flZ);
  goldDeep.add(0.04, 1.44, 0.04, flX, flY + 0.72, flZ);
  goldDeep.add(0.16, 0.02, 0.16, flX, flY + 1.45, flZ);
  const shadeGeo = new THREE.ConeGeometry(0.25, 0.28, 18, 1, true);
  const flShade = new THREE.Mesh(shadeGeo, mats.gold);
  flShade.position.set(flX, flY + 1.58, flZ);
  group.add(flShade);
  const flDisc = new THREE.Mesh(
    new THREE.CircleGeometry(0.19, 20),
    new THREE.MeshBasicMaterial({ color: 0xffd9a4, toneMapped: true })
  );
  flDisc.rotation.x = Math.PI / 2;
  flDisc.position.set(flX, flY + 1.47, flZ);
  group.add(flDisc);
  glows.push(addGlowSprite(mats, group, flX, flY + 1.44, flZ, 0.9, 0.34));
  const stageLamp = new THREE.PointLight(0xffc286, 4.6, 4.2, 2);
  stageLamp.position.set(flX, flY + 1.42, flZ);
  group.add(stageLamp);

  contactBatch(group, mats, [
    [psX, psY + 0.007, psZ, 0.7, 0.6],
    [msX, msY + 0.007, msZ, 0.55, 0.55],
    [flX, flY + 0.007, flZ, 0.5, 0.5]
  ], 0.34);

  /* ---------- 灯具：顶排 / 脚光 ---------- */
  const haloPositions = [];
  for (const z of [-50.6, -54.0]) {
    const pipe = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.07, 0.07), mats.goldDeep);
    pipe.position.set(0, 9.5, z);
    group.add(pipe);
    bulbs.add(11.0, 0.035, 0.035, 0, 9.44, z);
    for (let i = -4; i <= 4; i++) {
      goldDeep.add(0.16, 0.06, 0.14, i * 1.25, 9.56, z);
      haloPositions.push(i * 1.25, 9.4, z);
    }
  }

  const footBar = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.09, 0.09), mats.goldDeep);
  footBar.position.set(0, STAGE_Y + 0.12, FRONT + 0.12);
  group.add(footBar);
  for (let i = -4; i <= 4; i++) {
    const x = i * 1.3;
    goldDeep.add(0.2, 0.05, 0.2, x, STAGE_Y + 0.06, FRONT + 0.15);
    bulbs.add(0.11, 0.05, 0.11, x, STAGE_Y + 0.14, FRONT + 0.16);
    haloPositions.push(x, STAGE_Y + 0.16, FRONT + 0.18);
  }
  for (const [x, y, z] of [[-5.6, 8.6, -48.8], [5.6, 8.6, -48.8]]) {
    addGlowSprite(mats, group, x, y, z, 0.9, 0.22);
  }

  // 所有灯具光晕合并进一个 Points，一次 draw call
  const haloGeo = new THREE.BufferGeometry();
  haloGeo.setAttribute('position', new THREE.Float32BufferAttribute(haloPositions, 3));
  const haloMat = new THREE.PointsMaterial({
    map: mats.glowMap,
    color: 0xffc99a,
    size: 0.6,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.52,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: true
  });
  const halos = new THREE.Points(haloGeo, haloMat);
  halos.frustumCulled = false;
  group.add(halos);

  /* ---------- 让光看得见：软片体积光 + 地面光池 ---------- */
  const shafts = buildSoftShafts(full);
  group.add(shafts.mesh);

  const poolMat = new THREE.MeshBasicMaterial({
    map: mats.glowMap,
    color: 0xffb478,
    transparent: true,
    opacity: 0.17,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: true
  });
  const pools = new THREE.Mesh(lightPoolGeometry(), poolMat);
  pools.renderOrder = 2;
  group.add(pools);

  gold.build(group);
  goldDeep.build(group);
  wood.build(group);
  marble.build(group);
  seam.build(group);
  bulbs.build(group);
  cove.build(group);
  coolTrim.build(group);
  paper.build(group);

  /* ---------- 灯光层级 ---------- */
  // zone 只用于演出态：观众席灯（house）与舞台灯（stage）分开收放
  const lights = [];
  const register = (light, zone = 'house') => {
    lights.push({ light, base: light.intensity, zone });
    return light;
  };
  register(stageLamp, 'stage');
  const addSpot = (light, zone = 'house') => {
    group.add(light);
    group.add(light.target);
    return register(light, zone);
  };

  // 观众席不用整片补光，改为左右两侧成簇的点光源；位置收进新的收分墙内
  const clusterZ = full ? [-37.0, -43.4] : [-40.2];
  for (const sign of [-1, 1]) {
    for (const z of clusterZ) {
      const cluster = new THREE.PointLight(WARM, full ? 14 : 24, full ? 8.5 : 15, 2);
      cluster.position.set(sign * 4.1, full ? 4.4 : 4.05, z);
      group.add(cluster);
      register(cluster);
    }
  }

  // 观众席顶部主光：唯一一盏开阴影的观众席灯，负责座椅之间与挑台下方的可信暗部
  const houseKey = addSpot(new THREE.SpotLight(WARM, 18, 24, 0.78, 0.9, 2));
  houseKey.position.set(0, 9.9, -34.6);
  houseKey.target.position.set(0, 0.2, -42.4);
  houseKey.castShadow = quality.shadows;
  if (quality.shadows) {
    houseKey.shadow.mapSize.set(1024, 1024);
    houseKey.shadow.bias = -0.0005;
    houseKey.shadow.normalBias = 0.025;
    houseKey.shadow.camera.near = 1.0;
    houseKey.shadow.camera.far = 26;
  }

  // 尾端弧墙洗光：低位掠射，让三座拱门的券边与护墙板从暗部里浮出来
  const backWash = addSpot(new THREE.SpotLight(0xffc08a, 260, 16, 0.95, 0.95, 2));
  backWash.position.set(0, 1.95, -33.6);
  backWash.target.position.set(0, 4.4, -30.7);

  // 乐池底部只留一盏极弱的冷光，勾出乐谱架的轮廓
  const pitLight = new THREE.PointLight(0x8a97a8, 2.4, 6, 2);
  pitLight.position.set(0, -1.4, -46.9);
  group.add(pitLight);
  register(pitLight);

  // 面光：从观众席后上方压到台口，只留走位需要的亮度
  const stageFront = addSpot(new THREE.SpotLight(WARM, 30, 32, 0.6, 0.92, 2), 'stage');
  stageFront.position.set(0, 10.4, -43.4);
  stageFront.target.position.set(0, 2.2, -52.8);

  // 顶排：原来整片压亮，现在只留底子，真正的高光交给画作
  const stageTop = addSpot(new THREE.SpotLight(WARM, 38, 26, 0.85, 0.88, 2), 'stage');
  stageTop.position.set(0, 9.6, -53.0);
  stageTop.target.position.set(0, 1.2, -53.2);

  // 侧光：从两侧交叉打亮侧幕与台面转折
  if (full) {
    for (const sign of [-1, 1]) {
      const side = addSpot(new THREE.SpotLight(WARM, 12, 22, 0.92, 1, 2), 'stage');
      side.position.set(sign * 7.5, 7.2, -51.6);
      side.target.position.set(0, 2.2, -53.4);
    }
  }

  // 后区暖洗：只在下缘留一点，背墙其余部分留在暗里
  const stageBackWash = addSpot(new THREE.SpotLight(WARM, 22, 20, 0.95, 1, 2), 'stage');
  stageBackWash.position.set(0, 8.6, -50.0);
  stageBackWash.target.position.set(0, 3.2, -57.4);

  // 冷补：只落在台口上沿与幕布上段，用第二种色温拉开纵深
  const coolRim = addSpot(new THREE.SpotLight(COOL, 52, 20, 0.5, 1, 2), 'stage');
  coolRim.position.set(0, 10.8, -43.6);
  coolRim.target.position.set(0, 8.5, -49.1);

  const stageFill = new THREE.PointLight(WARM, 12, 16, 2);
  stageFill.position.set(0, 2.8, -51.0);
  group.add(stageFill);
  register(stageFill, 'stage');

  // 只打画作的造型光：舞台上唯一一件被完整照亮的东西
  const artSpot = addSpot(new THREE.SpotLight(0xffd2a4, 36, 15, 0.3, 0.85, 2), 'stage');
  artSpot.position.set(0, 7.4, -52.4);
  artSpot.target.position.set(0, 3.4, -56.7);

  const foot = new THREE.PointLight(WARM, 9, 8, 2);
  foot.position.set(0, 1.3, FRONT + 0.26);
  group.add(foot);
  register(foot, 'stage');

  let level = 1;
  let houseLevel = 1;
  let stageLevel = 1;
  let shaftTime = 0;

  // 灯按 zone 分两路：观众席主光与舞台灯各有自己的演出态系数
  function apply() {
    const h = level * houseLevel;
    const s = level * stageLevel;
    for (const { light, base, zone } of lights) {
      light.intensity = base * (zone === 'stage' ? s : h);
    }
    const mix = (h + s) * 0.5;
    glows.forEach((g) => {
      g.material.opacity = (g.userData.baseOpacity || 0.5) * (0.25 + 0.75 * mix);
    });
    glassMat.emissiveIntensity = 2.2 * (0.35 + 0.65 * h);
    haloMat.opacity = 0.52 * (0.3 + 0.7 * h);
    poolMat.opacity = 0.17 * (0.25 + 0.75 * s);
    shafts.mat.uniforms.uOpacity.value = 0.36 * (0.25 + 0.75 * s);
  }

  function setLevel(v) {
    level = v;
    apply();
  }

  function setShow({ house = 1, stage = 1 } = {}) {
    houseLevel = house;
    stageLevel = stage;
    apply();
  }

  setLevel(1);

  /* ---------- 幕布开合：两条不同刚度的弹簧，先滑开再收拢，收尾带惯性 ----------
     平移与收拢用不同刚度，所以开口处会先被拉开、褶皱随后才跟上；
     速度项再给一点微小倾角，读起来是布被拖动而不是匀速平移。 */
  const OPEN_X = 4.05;   // 开：两片各就位，中间留 3.5m 台口
  const SHUT_X = 3.175;  // 闭：两片合拢到中线
  const OPEN_S = 1.0;
  const SHUT_S = 1.38;   // 闭：横向拉宽，盖住整幅台口

  const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = reduceQuery.matches;
  if (reduceQuery.addEventListener) {
    reduceQuery.addEventListener('change', (e) => { reduced = e.matches; });
  }

  // 初始闭合：进场时幕布是落下的，等三遍铃结束再拉开
  let curtainTarget = 0;
  let slidePos = 0;
  let slideVel = 0;
  let gatherPos = 0;
  let gatherVel = 0;

  function setCurtain(open) {
    curtainTarget = open ? 1 : 0;
  }

  // 需要与灯光硬同步时用（例如降低动态效果下直接落位）
  function snapCurtain(open) {
    curtainTarget = slidePos = gatherPos = open ? 1 : 0;
    slideVel = 0;
    gatherVel = 0;
    applyCurtain();
  }

  function applyCurtain() {
    const x = SHUT_X + (OPEN_X - SHUT_X) * slidePos;
    curtainL.position.x = -x;
    curtainR.position.x = x;
    const sx = SHUT_S + (OPEN_S - SHUT_S) * gatherPos;
    curtainL.scale.x = sx;
    curtainR.scale.x = sx;
    const tilt = Math.max(-0.013, Math.min(0.013, slideVel * 0.0022));
    curtainL.rotation.z = tilt;
    curtainR.rotation.z = -tilt;
  }

  // 首帧之前就落到闭合位置，避免开场闪一下开着的台口
  applyCurtain();

  function stepCurtain(dt) {
    if (reduced) {
      // 降低动态效果：刚度拉高、阻尼略过临界，约 0.4s 内收住，不做过冲
      const kx = 260, cx = 34, ks = 240, cs = 32;
      const n = Math.min(3, Math.ceil(dt / 0.012));
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        slideVel += ((curtainTarget - slidePos) * kx - slideVel * cx) * h;
        slidePos += slideVel * h;
        gatherVel += ((curtainTarget - gatherPos) * ks - gatherVel * cs) * h;
        gatherPos += gatherVel * h;
      }
    } else {
      // 平移快（约 0.9s 落稳，带轻微过冲），收拢慢（约 1.3s，略过阻尼）
      const kx = 26, cx = 7.2, ks = 18, cs = 9.5;
      const n = Math.min(4, Math.ceil(dt / 0.012));
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        slideVel += ((curtainTarget - slidePos) * kx - slideVel * cx) * h;
        slidePos += slideVel * h;
        gatherVel += ((curtainTarget - gatherPos) * ks - gatherVel * cs) * h;
        gatherPos += gatherVel * h;
      }
    }
    // 落到极近时钳住，避免弹簧尾巴无限小地抖动
    if (Math.abs(curtainTarget - slidePos) < 0.0006 && Math.abs(slideVel) < 0.002) {
      slidePos = curtainTarget;
      slideVel = 0;
    }
    if (Math.abs(curtainTarget - gatherPos) < 0.0006 && Math.abs(gatherVel) < 0.002) {
      gatherPos = curtainTarget;
      gatherVel = 0;
    }
    applyCurtain();
  }

  function update(dt) {
    shaftTime += dt;
    shafts.mat.uniforms.uTime.value = shaftTime;
    if (dt > 0) stepCurtain(Math.min(dt, 0.05));
  }

  mergeStatic(group);

  return {
    group,
    floor,
    seats: horseshoe.seats,
    stageFloor,
    setLevel,
    setShow,
    setCurtain,
    snapCurtain,
    update,
    get level() { return level; },
    get houseLevel() { return houseLevel; },
    get stageLevel() { return stageLevel; },
    get curtainOpen() { return slidePos; }
  };
}
