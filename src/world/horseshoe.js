import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addGlowSprite, makeContactMaterial } from './utils.js';
import { HOUSE, RAKE, halfWidth, wallYaw, apsePoint, houseFloorY } from './plan.js';

const WARM_GLOW = 0xffc48a;

/* ---------- 二楼护栏统一标准 ----------
   扶手中心 = 本层楼面 + 1.12m，扶手顶 = +1.15m（判据要求 >= 1.10m，留 5cm 余量）。
   一律用 0.032m 细立柱（间距 <= 0.36m）+ 0.06m 细扶手，不做实栏板：
   楼座看舞台的视线从柱间穿过，门厅拱洞也不会被读成一道过梁。
   原来各处的 0.85 / 0.90 / 0.95 / 1.00m 全部按此收口。 */
const GUARD = 1.12;

/* ---------- 把一面带三座拱门的直墙弯成半圆弧墙 ---------- */
function bentApseWall() {
  const R = HOUSE.APSE_R;
  const arcLen = Math.PI * R;
  const height = 12;
  const shape = new THREE.Shape();
  shape.moveTo(-arcLen / 2, 0);
  shape.lineTo(arcLen / 2, 0);
  shape.lineTo(arcLen / 2, height);
  shape.lineTo(-arcLen / 2, height);
  shape.closePath();

  // 中央拱门是上下两层共用的主门洞：门洞一直升到二楼环廊的吊顶（6.9m），
  // 二楼楼座才有 >=2.87m 的净高与通透的回望视线。两侧门仍按一层尺度。
  const doors = [
    { cx: -4.8, halfW: 1.3, spring: 4.3 },
    { cx: 4.8, halfW: 1.3, spring: 4.3 },
    { cx: 0, halfW: 2.0, spring: 4.9 }
  ];
  for (const { cx, halfW, spring } of doors) {
    const hole = new THREE.Path();
    hole.moveTo(cx - halfW, 0);
    hole.lineTo(cx - halfW, spring);
    hole.absarc(cx, spring, halfW, Math.PI, 0, true);
    hole.lineTo(cx + halfW, 0);
    hole.closePath();
    shape.holes.push(hole);
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.42,
    bevelEnabled: false,
    curveSegments: 12
  });

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i);
    const y = pos.getY(i);
    const w = pos.getZ(i);
    const a = u / R;
    const r = R + w;
    pos.setXYZ(i, r * Math.sin(a), y, HOUSE.TAIL + r * Math.cos(a));
  }
  geo.computeVertexNormals();
  return { geo, doors };
}

function bendFlatGeometry(geo) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i);
    const y = pos.getY(i);
    const w = pos.getZ(i);
    const a = u / HOUSE.APSE_R;
    const r = HOUSE.APSE_R + w;
    pos.setXYZ(i, r * Math.sin(a), y, HOUSE.TAIL + r * Math.cos(a));
  }
  geo.computeVertexNormals();
  return geo;
}

/* ---------- 沿墙的局部坐标：localX 向厅内，localZ 沿墙 ---------- */
function frameAt(sign, z) {
  const yaw = wallYaw(sign, z);
  return {
    x: sign * halfWidth(z),
    z,
    yaw,
    nx: -sign * Math.cos(yaw),
    nz: sign * Math.sin(yaw),
    tx: Math.sin(yaw),
    tz: Math.cos(yaw)
  };
}

function place(f, lx, lz) {
  return [f.x + f.nx * lx + f.tx * lz, f.z + f.nz * lx + f.tz * lz];
}

/* ---------- 侧墙：每间包厢后侧开一道门洞，直通墙外后廊 ---------- */
const BOX_DOOR_HALF = 0.47;
const BOX_DOOR_H = 2.02;

// 侧墙每间包厢后侧都开一道后门，直通墙外后廊
function sideWallGeometry(sideLen, wallHeight, sign) {
  const midZ = (HOUSE.FRONT + HOUSE.TAIL) / 2;
  const duPerZ = sideLen / (HOUSE.TAIL - HOUSE.FRONT);
  const shape = new THREE.Shape();
  shape.moveTo(-sideLen / 2, 0);
  shape.lineTo(sideLen / 2, 0);
  shape.lineTo(sideLen / 2, wallHeight);
  shape.lineTo(-sideLen / 2, wallHeight);
  shape.closePath();
  for (let tier = 0; tier < 3; tier++) {
    const base = HOUSE.TIER_Y[tier] + 0.06;
    for (let b = 0; b < HOUSE.BOX_COUNT; b++) {
      const z = HOUSE.BOX_Z0 + b * HOUSE.BOX_STEP;
      // 左墙的局部 x 轴与 z 轴反向，按世界坐标换算后再取反
      const u = (sign < 0 ? -1 : 1) * (z - midZ) * duPerZ;
      const hole = new THREE.Path();
      hole.moveTo(u - BOX_DOOR_HALF, base);
      hole.lineTo(u + BOX_DOOR_HALF, base);
      hole.lineTo(u + BOX_DOOR_HALF, base + BOX_DOOR_H);
      hole.lineTo(u - BOX_DOOR_HALF, base + BOX_DOOR_H);
      hole.closePath();
      shape.holes.push(hole);
    }
  }
  return new THREE.ShapeGeometry(shape);
}

export function buildHorseshoe({
  group,
  mats,
  full,
  batches,
  seatGeo,
  audPlaster,
  glows
}) {
  const { gold, goldDeep, wood, marble, seam, bulbs, cove, coolTrim } = batches;
  const segGeos = [];
  const velvetGeos = [];
  const haloPositions = [];
  const seatMats = [];

  /* ---------- 直段侧墙：向外收分 15°，内侧贴护墙板与檐口 ---------- */
  const wallMat = audPlaster.clone();
  wallMat.side = THREE.DoubleSide;
  wallMat.color.setHex(0x251611);
  const sideLen = Math.hypot(HOUSE.FRONT_HALF - HOUSE.TAIL_HALF, HOUSE.FRONT - HOUSE.TAIL);
  const sideYaw = 0.266;
  for (const sign of [-1, 1]) {
    const wall = new THREE.Mesh(sideWallGeometry(sideLen, 12, sign), wallMat);
    wall.position.set(sign * 6.3, 0, (HOUSE.FRONT + HOUSE.TAIL) / 2);
    wall.rotation.y = -sign * 1.837;
    wall.receiveShadow = true;
    group.add(wall);

    const f = frameAt(sign, (HOUSE.FRONT + HOUSE.TAIL) / 2);
    const midZ = (HOUSE.FRONT + HOUSE.TAIL) / 2;
    const ry = -sign * sideYaw;

    // 护墙板 / 大理石墙裙 / 金线 / 檐口，随墙的斜度一起转
    wood.add(0.12, 1.5, sideLen, sign * 6.24, 0.76, midZ, ry);
    marble.add(0.1, 0.5, sideLen, sign * 6.26, 0.28, midZ, ry);
    goldDeep.add(0.12, 0.05, sideLen, sign * 6.24, 0.55, midZ, ry);
    gold.add(0.14, 0.06, sideLen, sign * 6.22, 1.54, midZ, ry);
    seam.add(0.03, 0.04, sideLen, sign * 6.21, 1.6, midZ, ry);
    gold.add(0.26, 0.12, sideLen, sign * 6.19, 10.44, midZ, ry);
    goldDeep.add(0.34, 0.16, sideLen, sign * 6.16, 10.62, midZ, ry);
    seam.add(0.03, 0.04, sideLen, sign * 6.21, 10.2, midZ, ry);
    cove.add(0.04, 0.04, sideLen, sign * 6.18, 10.34, midZ, ry);

    // 壁柱：立在每间包厢的分缝上
    for (let i = -1; i <= HOUSE.BOX_COUNT; i++) {
      const z = HOUSE.BOX_Z0 + i * HOUSE.BOX_STEP + HOUSE.BOX_STEP / 2;
      if (z > HOUSE.TAIL - 0.3 || z < HOUSE.FRONT + 0.3) continue;
      const ff = frameAt(sign, z);
      const [px, pz] = place(ff, 0.17, 0);
      wood.add(0.34, 9.4, 0.4, px, 5.2, pz, ff.yaw);
      gold.add(0.42, 0.16, 0.5, px, 9.86, pz, ff.yaw);
      goldDeep.add(0.5, 0.08, 0.56, px, 0.55, pz, ff.yaw);
    }
  }

  /* ---------- 尾端弧墙：三座拱门，墙体弯成半圆 ---------- */
  const apse = bentApseWall();
  const apseMesh = new THREE.Mesh(apse.geo, wallMat);
  apseMesh.receiveShadow = true;
  group.add(apseMesh);

  const ringGeos = [];
  for (const { cx, halfW, spring } of apse.doors) {
    const band = new THREE.Shape();
    const ro = halfW + 0.19;
    const ri = halfW + 0.015;
    band.moveTo(cx - ro, 0);
    band.absarc(cx, spring, ro, Math.PI, 0, true);
    band.lineTo(cx + ri, 0);
    band.absarc(cx, spring, ri, 0, Math.PI, false);
    band.closePath();
    const bandGeo = new THREE.ExtrudeGeometry(band, {
      depth: 0.1,
      bevelEnabled: false,
      curveSegments: 14
    });
    // 只保留拱券部分，去掉下段直线
    const flat = bandGeo.clone();
    flat.translate(0, 0, 0);
    ringGeos.push(bendFlatGeometry(flat));
  }
  const ringMesh = new THREE.Mesh(mergeGeometries(ringGeos, false), mats.goldDeep);
  ringMesh.castShadow = full;
  group.add(ringMesh);

  // 弧墙上的护墙板、金线与檐口：分段短盒沿弧线铺
  const arcN = 18;
  for (let i = 0; i < arcN; i++) {
    const t0 = -1 + (2 * i) / arcN;
    const t1 = -1 + (2 * (i + 1)) / arcN;
    const p0 = apsePoint(t0);
    const p1 = apsePoint(t1);
    const mx = (p0.x + p1.x) / 2;
    const mz = (p0.z + p1.z) / 2;
    const len = Math.hypot(p1.x - p0.x, p1.z - p0.z) + 0.03;
    const yaw = Math.atan2(p1.x - p0.x, p1.z - p0.z);
    const nx = Math.sin((t0 + t1) / 2 * Math.PI * 0.5);
    const nz = Math.cos((t0 + t1) / 2 * Math.PI * 0.5);
    const ix = mx - nx * 0.07;
    const iz = mz - nz * 0.07;
    wood.add(0.12, 1.5, len, ix, 0.76, iz, yaw);
    marble.add(0.1, 0.5, len, ix, 0.28, iz, yaw);
    gold.add(0.14, 0.06, len, ix, 1.54, iz, yaw);
    gold.add(0.26, 0.12, len, ix, 10.44, iz, yaw);
    goldDeep.add(0.34, 0.16, len, ix, 10.62, iz, yaw);
  }

  /* ---------- 尾端环廊：8 级踏步，从走廊升到后排门槛 1.45m ---------- */
  const ringZ0 = -27.2;
  const ringZ1 = -30.56;
  const ringSteps = 8;
  const ringRise = RAKE.REAR_Y / ringSteps;              // 0.18125
  const ringTread = (ringZ0 - ringZ1) / ringSteps;       // 0.42
  const ringW = 11.8;
  const stepCarpets = [];
  for (let i = 0; i < ringSteps; i++) {
    const top = (i + 1) * ringRise;
    const zc = ringZ0 - (i + 0.5) * ringTread;
    wood.add(ringW, top, ringTread + 0.02, 0, top / 2, zc);
    gold.add(ringW - 0.5, 0.026, 0.05, 0, top + 0.014, ringZ0 - i * ringTread - 0.03);
    const cg = new THREE.PlaneGeometry(3.4, ringTread + 0.02);
    cg.rotateX(-Math.PI / 2);
    cg.translate(0, top + 0.02, zc);
    stepCarpets.push(cg);
  }
  const stepCarpet = new THREE.Mesh(mergeGeometries(stepCarpets, false), mats.carpet);
  stepCarpet.receiveShadow = true;
  group.add(stepCarpet);

  /* 坡道扶手：沿 8 级踏步两侧各一道，坡向与踏步顶线一致 */
  const ringRailLen = Math.hypot(ringZ0 - ringZ1, RAKE.REAR_Y);
  const ringRailAngle = Math.atan2(RAKE.REAR_Y, ringZ0 - ringZ1);
  for (const sign of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, ringRailLen), mats.brass);
    rail.position.set(sign * 5.0, 0.95 + RAKE.REAR_Y / 2, (ringZ0 + ringZ1) / 2);
    rail.rotation.x = ringRailAngle;
    group.add(rail);
    for (let i = 0; i <= ringSteps; i++) {
      const z = ringZ0 - i * ringTread;
      gold.add(0.055, 0.96, 0.055, sign * 5.0, i * ringRise + 0.48, z);
    }
  }

  const backWallMat = audPlaster.clone();
  backWallMat.color.setHex(0x2a1812);
  for (const sign of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.28, 8.5, 3.5), backWallMat);
    wall.position.set(sign * 6.05, 4.25, -28.9);
    wall.receiveShadow = true;
    group.add(wall);
    wood.add(0.12, 1.5, 3.5, sign * 5.9, 0.78, -28.9);
    gold.add(0.08, 0.06, 3.5, sign * 5.9, 1.55, -28.9);
    gold.add(0.14, 0.12, 3.5, sign * 5.9, 8.1, -28.9);
    // 侧墙端头的回墙，把环廊与走廊侧壁接住
    wood.add(3.7, 1.5, 0.12, sign * 4.05, 0.78, -27.25);
    gold.add(3.7, 0.06, 0.08, sign * 4.05, 1.55, -27.25);
    const sconce = addGlowSprite(mats, group, sign * 5.8, 4.7, -27.6, 0.5, 0.5);
    glows.push(sconce);
  }
  const backCeil = new THREE.Mesh(new THREE.PlaneGeometry(12.4, 3.5), audPlaster);
  backCeil.rotation.x = Math.PI / 2;
  backCeil.position.set(0, 8.5, -28.9);
  group.add(backCeil);
  gold.add(12.4, 0.12, 0.22, 0, 8.42, -30.4);

  /* ---------- 三层包厢 ---------- */
  for (let tier = 0; tier < 3; tier++) {
    const y = HOUSE.TIER_Y[tier];
    const depth = 1.62 - tier * 0.1;
    const boxW = 1.44;
    const seatTint = new THREE.Color().setRGB(
      0.62 - tier * 0.07,
      0.17 - tier * 0.025,
      0.15 - tier * 0.02
    );

    for (const sign of [-1, 1]) {
      for (let b = 0; b < HOUSE.BOX_COUNT; b++) {
        const z = HOUSE.BOX_Z0 + b * HOUSE.BOX_STEP;
        const f = frameAt(sign, z);
        const [fx, fz] = place(f, depth / 2, 0);

        // 楼板
        wood.add(depth, 0.09, boxW, fx, y - 0.045, fz, f.yaw);
        const [gx0, gz0] = place(f, 0.04, boxW / 2);
        gold.add(depth, 0.022, 0.05, gx0, y + 0.02, gz0, f.yaw);
        // 两侧隔墙
        for (const s of [-1, 1]) {
          const [px, pz] = place(f, depth / 2, s * boxW / 2);
          wood.add(depth, 1.92, 0.06, px, y + 0.96, pz, f.yaw);
          goldDeep.add(depth, 0.045, 0.08, px, y + 1.9, pz, f.yaw);
        }

        // 后侧门洞与挂帘：两片分开的帘，帘片再向两侧内收 0.1m，中央留出通行缝
        const curtainW = (boxW - 0.12) / 2 - 0.28;
        for (const cs of [-1, 1]) {
          const plane = new THREE.PlaneGeometry(curtainW, BOX_DOOR_H - 0.06);
          plane.rotateY(Math.atan2(f.nx, f.nz));
          const [cxp, czp] = place(f, 0.075, cs * (0.28 + curtainW / 2));
          plane.translate(cxp, y + 0.06 + (BOX_DOOR_H - 0.06) / 2, czp);
          velvetGeos.push(plane);
        }

        // 门套：两根金柱 + 门头
        for (const s of [-1, 1]) {
          const [dx2, dz2] = place(f, 0.1, s * (BOX_DOOR_HALF + 0.07));
          gold.add(0.07, BOX_DOOR_H + 0.14, 0.07, dx2, y + 0.06 + (BOX_DOOR_H + 0.14) / 2, dz2, f.yaw);
        }
        const [dhx, dhz] = place(f, 0.1, 0);
        gold.add(0.07, 0.07, BOX_DOOR_HALF * 2 + 0.2, dhx, y + BOX_DOOR_H + 0.16, dhz, f.yaw);

        // 厢内两壁：硬木分格 + 丝绒挂帘，避免大面积光滑弧面
        for (const s of [-1, 1]) {
          const [vx, vz] = place(f, depth / 2, s * (boxW / 2 - 0.035));
          const panel = new THREE.PlaneGeometry(depth - 0.16, 1.32);
          panel.rotateY(s > 0 ? f.yaw + Math.PI : f.yaw);
          panel.translate(vx, y + 0.76, vz);
          velvetGeos.push(panel);

          const [bx2, bz2] = place(f, depth / 2, s * (boxW / 2 - 0.015));
          gold.add(depth - 0.1, 0.035, 0.04, bx2, y + 1.44, bz2, f.yaw);
          gold.add(depth - 0.1, 0.035, 0.04, bx2, y + 0.14, bz2, f.yaw);
          const [dbx, dbz] = place(f, depth / 2, s * (boxW / 2 - 0.015));
          gold.add(0.04, 1.34, 0.04, dbx, y + 0.8, dbz, f.yaw);
        }

        // 弧形黄铜栏杆：面向观众厅一侧。48 间包厢一间不漏——
        // 原来 tier===1 且 z≈ACCESS_Z 的两间被 railGap 整段跳过，
        // 那是两处 4m 临空；包厢由后廊进出，前沿本就该有护栏。
        const railLX = depth;
        const bars = tier === 2 ? 4 : 5;
        for (let k = 0; k < bars; k++) {
          const lz = -boxW / 2 + 0.18 + k * (boxW - 0.36) / (bars - 1);
          const [bx, bz] = place(f, railLX, lz);
          gold.add(0.032, GUARD, 0.032, bx, y + GUARD / 2, bz, f.yaw);
        }
        const [rx, rz] = place(f, railLX, 0);
        gold.add(0.1, 0.06, boxW, rx, y + GUARD, rz, f.yaw);
        goldDeep.add(0.09, 0.04, boxW, rx, y + 0.05, rz, f.yaw);

        // 顶棚：由上一层楼板充当，层间净高 2.22/2.63m；顶层敞开

        // 隔墙壁灯：光晕统一收进一个 Points，只留一盏小铜座
        const [gx, gz] = place(f, depth - 0.16, boxW / 2 - 0.12);
        goldDeep.add(0.08, 0.22, 0.1, gx, y + 1.45, gz, f.yaw);
        haloPositions.push(gx, y + 1.54, gz);

        // 每间 3–4 席
        const seats = tier === 2 ? 3 : 4;
        for (let sIdx = 0; sIdx < seats; sIdx++) {
          const lz = sIdx < 2 ? -0.31 + sIdx * 0.62 : (sIdx === 2 ? -0.31 : 0.31);
          const lx = sIdx < 2 ? 0.5 : 0.98;
          const [sx2, sz2] = place(f, lx, lz);
          const dirX = -sx2;
          const dirZ = -52.4 - sz2;
          seatMats.push({
            x: sx2, y, z: sz2, s: tier === 2 ? 0.78 : 0.84,
            ry: Math.atan2(-dirX, -dirZ),
            rake: false,
            color: seatTint
          });
        }
      }
    }
  }

  /* ---------- 包厢后廊：三层都有净宽 1.7m 的墙外走道 ---------- */
  const corrMidZ = HOUSE.BOX_Z0 + (HOUSE.BOX_COUNT - 1) * HOUSE.BOX_STEP / 2;
  // 走道地面前后各多铺 0.1m：前端接上转角，避免与弧廊地板留缝
  const corrLen = HOUSE.BOX_COUNT * HOUSE.BOX_STEP + 1.0;
  for (let tier = 0; tier < 3; tier++) {
    const y = HOUSE.TIER_Y[tier];
    for (const sign of [-1, 1]) {
      const f = frameAt(sign, corrMidZ);
      const [fx, fz] = place(f, -0.86, 0);
      wood.add(1.7, 0.09, corrLen, fx, y - 0.05, fz, f.yaw);

      // 外侧墙
      const [ox, oz] = place(f, -1.77, 0);
      wood.add(0.14, 2.5, corrLen, ox, y + 1.15, oz, f.yaw);
      goldDeep.add(0.06, 0.04, corrLen, ox + f.nx * 0.09, y + 2.3, oz + f.nz * 0.09, f.yaw);

      // 走道尽端的暗光，避免从门洞看过去是一块死黑
      const [lx2, lz2] = place(f, -0.9, corrLen / 2 - 0.4);
      const lamp = addGlowSprite(mats, group, lx2, y + 1.9, lz2, 0.34, 0.34);
      glows.push(lamp);
    }
  }

  /* ---------- 二楼环廊：尾端平台 + 两侧弧廊，再接直段挑台 ---------- */
  const PROM_TOP = HOUSE.LEVEL + 0.002;
  /* 尾端平台：原是一块 x±3.7 的整板，但弧墙朝厅面是 r=4.6 的圆弧，
     在 z=-31.4 只到 x±2.73 —— 每侧约 0.95m 楼板埋在弧墙空腔里。
     stops.js 的 apse 可行走区早已按弧收口，几何没跟着改，于是留下一片
     「看着是地面、其实站在墙背后」的假地面。这里按 12 条 z 带逐条收口，
     门洞喉道保留 >= 2.0m 半宽，保证与上层走廊楼板接得上。 */
  const PLAT_Z0 = -32.27, PLAT_Z1 = -30.53, PLAT_STRIPS = 12;
  for (let i = 0; i < PLAT_STRIPS; i++) {
    const z0 = PLAT_Z0 + (PLAT_Z1 - PLAT_Z0) * i / PLAT_STRIPS;
    const z1 = PLAT_Z0 + (PLAT_Z1 - PLAT_Z0) * (i + 1) / PLAT_STRIPS;
    const zm = (z0 + z1) / 2;
    const dz = zm - HOUSE.TAIL;
    const half = Math.max(2.0, Math.min(3.7,
      Math.sqrt(Math.max(0, HOUSE.APSE_R * HOUSE.APSE_R - dz * dz)) + 0.08));
    wood.add(half * 2, 0.28, z1 - z0 + 0.02, 0, PROM_TOP - 0.14, zm);
  }
  gold.add(4.0, 0.026, 0.05, 0, PROM_TOP, -30.62);

  const innerR = 2.85;
  const outerR = HOUSE.APSE_R;
  for (const dir of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const a0 = dir * (0.17 + i * 0.125);
      const a1 = a0 + dir * 0.125;
      const am = (a0 + a1) / 2;
      const rMid = (innerR + outerR) / 2;
      const arcLen = Math.abs(a1 - a0) * outerR;
      const x = rMid * Math.sin(am);
      const z = HOUSE.TAIL + rMid * Math.cos(am);
      wood.add(arcLen + 0.04, 0.28, outerR - innerR, x, PROM_TOP - 0.14, z, am);
      const xr = innerR * Math.sin(am);
      const zr = HOUSE.TAIL + innerR * Math.cos(am);
      gold.add(arcLen + 0.04, 0.026, 0.05, xr, PROM_TOP, zr, am);
    }
    // 弧廊内缘栏杆：立柱抬到 GUARD，扶手拆成 6 段短弦贴合弧线
    // （原来一整根直弦横切 0.75rad，中段离立柱内缩约 0.2m，读不到扶手）
    for (let i = 0; i < 11; i++) {
      const a = dir * (0.2 + i * 0.075);
      const x = innerR * Math.sin(a);
      const z = HOUSE.TAIL + innerR * Math.cos(a);
      gold.add(0.032, GUARD, 0.032, x, PROM_TOP + GUARD / 2, z, a);
    }
    for (let i = 0; i < 6; i++) {
      const a0 = dir * (0.2 + i * 0.75 / 6);
      const a1 = dir * (0.2 + (i + 1) * 0.75 / 6);
      const am2 = (a0 + a1) / 2;
      const xh = innerR * Math.sin(am2);
      const zh = HOUSE.TAIL + innerR * Math.cos(am2);
      gold.add(Math.abs(a1 - a0) * innerR + 0.05, 0.06, 0.06, xh, PROM_TOP + GUARD, zh, am2);
    }
  }

  // 尾端平台内缘栏杆：中央段收住，两侧各留一段缺口接弧廊
  for (let x = -2.4; x <= 2.41; x += 0.34) {
    gold.add(0.032, GUARD, 0.032, x, PROM_TOP + GUARD / 2, -32.28);
  }
  gold.add(4.9, 0.06, 0.06, 0, PROM_TOP + GUARD, -32.28);
  for (let x = -3.3; x <= 3.31; x += 0.8) {
    wood.add(0.24, 0.16, 0.4, x, PROM_TOP - 0.16, -32.36);
  }

  /* ---------- 环廊外廊：弧墙外侧的半环走道，绕到两侧包厢后廊 ----------
     内圈弧廊接尾端平台，穿过弧墙上的侧拱门（标高 4.03 仍在洞口高度内），
     外侧再接包厢后廊，形成一条完整可走的二层环线。 */
  const AP_R0 = 5.04;
  const AP_R1 = 6.6;
  // 可行走区 outer-r/l 从 |a|=0.94 起，几何原来从 0.96 才铺，
  // 于是 a∈[0.94,0.96] 有一条无楼板的窄缝；退到 0.90 留足搭接。
  const apStart = 0.90;
  const apSeg = 6;
  for (const dir of [-1, 1]) {
    for (let i = 0; i < apSeg; i++) {
      const a0 = dir * (apStart + i * (Math.PI / 2 - apStart) / apSeg);
      const a1 = dir * (apStart + (i + 1) * (Math.PI / 2 - apStart) / apSeg);
      const am = (a0 + a1) / 2;
      const rMid = (AP_R0 + AP_R1) / 2;
      const arcLen = Math.abs(a1 - a0) * rMid + 0.03;
      const x = rMid * Math.sin(am);
      const z = HOUSE.TAIL + rMid * Math.cos(am);
      wood.add(arcLen, 0.12, AP_R1 - AP_R0, x, PROM_TOP - 0.06, z, am);
      // 外缘扶手：弦长必须按 AP_R1 算。原来错用 rMid=5.82 却贴在 r=6.6 上，
      // 每段短约 12%，加上 i<apSeg-1 省掉末段，实测 11 点里 4 点完全没有扶手。
      const railLen = Math.abs(a1 - a0) * AP_R1 + 0.05;
      const xo = AP_R1 * Math.sin(am);
      const zo = HOUSE.TAIL + AP_R1 * Math.cos(am);
      gold.add(railLen, 0.06, 0.06, xo, PROM_TOP + GUARD, zo, am);
      goldDeep.add(railLen, 0.05, 0.05, xo, PROM_TOP + 0.08, zo, am);
    }
    for (let i = 0; i < 12; i++) {
      const a = dir * (apStart + i * (Math.PI / 2 - apStart) / 11);
      const xo = AP_R1 * Math.sin(a);
      const zo = HOUSE.TAIL + AP_R1 * Math.cos(a);
      gold.add(0.032, GUARD, 0.032, xo, PROM_TOP + GUARD / 2, zo, a);
    }
  }

  /* ---------- 侧拱门门槛：把内弧廊与外弧廊真正接起来 ----------
     弧墙厚 0.42m（r 4.6..5.02），门洞在 y=4.03 是通的，但门洞里
     原本一片楼板都没有。0.08m 栅格洪水填充因此把外弧廊与两侧包厢后廊
     判成两个大孤岛。这里在侧门角度范围内铺一圈放射状门槛板；
     板面比相邻楼板低 1.2cm，读作门槛，也避免与搭接处共面 z-fighting。 */
  const TH_R0 = 4.55, TH_R1 = 5.08, TH_A0 = 0.90, TH_A1 = 1.16, TH_SEG = 5;
  const TH_TOP = PROM_TOP - 0.012;
  for (const dir of [-1, 1]) {
    for (let i = 0; i < TH_SEG; i++) {
      const a0 = dir * (TH_A0 + i * (TH_A1 - TH_A0) / TH_SEG);
      const a1 = dir * (TH_A0 + (i + 1) * (TH_A1 - TH_A0) / TH_SEG);
      const am = (a0 + a1) / 2;
      const rM = (TH_R0 + TH_R1) / 2;
      const chord = Math.abs(a1 - a0) * rM + 0.06;
      wood.add(chord, 0.12, TH_R1 - TH_R0,
        rM * Math.sin(am), TH_TOP - 0.06, HOUSE.TAIL + rM * Math.cos(am), am);
    }
  }


  /* ---------- 池座：186 席沿同心弧排开，留中央走道与两条纵走道 ---------- */
  const CX = 0;
  const CZ = -55.0;
  const rows = 12;
  const r0 = 9.6;
  const dr = 1.12;
  const seatGap = 0.60;

  for (let r = 0; r < rows; r++) {
    const rad = r0 + r * dr;
    for (const s of [-1, 1]) {
      for (let a = 0.055; a < 1.3; a += seatGap / rad) {
        const x = s * rad * Math.sin(a);
        const z = CZ + rad * Math.cos(a);
        if (z < HOUSE.FRONT + 0.5 || z > HOUSE.REAR - 0.8) continue;
        if (Math.abs(x) > halfWidth(z) - 0.42) continue;
        if (Math.abs(x) < 0.64) continue;
        const aa = Math.abs(a);
        if (aa > 0.30 && aa < 0.365) continue;
        const dirX = -x;
        const dirZ = -52.4 - z;
        seatMats.push({
          x, y: houseFloorY(z), z, s: 1,
          ry: Math.atan2(-dirX, -dirZ),
          rake: true,
          color: new THREE.Color().setRGB(
            0.54 * (0.2 + 0.8 * (r / rows)),
            0.135 * (0.2 + 0.8 * (r / rows)),
            0.14 * (0.2 + 0.8 * (r / rows))
          )
        });
      }
    }
  }

  /* ---------- 座位实例化 + 接触阴影 ---------- */
  const seatMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.9,
    metalness: 0.02,
    emissive: new THREE.Color(0x2a0a0c),
    emissiveIntensity: full ? 0.1 : 0.26,
    envMapIntensity: 0.22
  });
  const seats = new THREE.InstancedMesh(seatGeo, seatMaterial, seatMats.length);
  seats.castShadow = full;
  seats.receiveShadow = true;
  seats.frustumCulled = false;

  const RAKE_SLOPE = Math.atan2(RAKE.REAR_Y - RAKE.STEP, RAKE.REAR_Z - RAKE.FLAT_Z);
  const dummy = new THREE.Object3D();
  const contactMat = makeContactMaterial(mats, 0.42);
  const contactGeo = new THREE.PlaneGeometry(1, 1);
  contactGeo.rotateX(-Math.PI / 2);
  const contact = new THREE.InstancedMesh(contactGeo, contactMat, seatMats.length);
  contact.frustumCulled = false;
  contact.renderOrder = 1;

  seatMats.forEach((s, i) => {
    dummy.position.set(s.x, s.y, s.z);
    dummy.rotation.set(0, s.ry, 0);
    dummy.scale.setScalar(s.s);
    dummy.updateMatrix();
    seats.setMatrixAt(i, dummy.matrix);
    seats.setColorAt(i, s.color);

    dummy.position.set(s.x, s.y + 0.016, s.z);
    dummy.rotation.set(s.rake ? -RAKE_SLOPE : 0, s.ry, 0);
    dummy.scale.set(0.72 * s.s, 1, 0.62 * s.s);
    dummy.updateMatrix();
    contact.setMatrixAt(i, dummy.matrix);
  });
  seats.instanceMatrix.needsUpdate = true;
  if (seats.instanceColor) seats.instanceColor.needsUpdate = true;
  contact.instanceMatrix.needsUpdate = true;
  group.add(seats);
  group.add(contact);

  /* ---------- 包厢壁灯：一簇光点合并为一次 draw call ---------- */
  const haloGeo = new THREE.BufferGeometry();
  haloGeo.setAttribute('position', new THREE.Float32BufferAttribute(haloPositions, 3));
  const haloMat = new THREE.PointsMaterial({
    map: mats.glowMap,
    color: WARM_GLOW,
    size: 0.46,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: true
  });
  const halos = new THREE.Points(haloGeo, haloMat);
  halos.frustumCulled = false;
  group.add(halos);

  /* ---------- 幕布与挂帘合并 ---------- */
  if (velvetGeos.length) {
    const curtains = new THREE.Mesh(mergeGeometries(velvetGeos, false), mats.velvet);
    curtains.receiveShadow = true;
    group.add(curtains);
  }

  return {
    seats,
    seatCount: seatMats.length,
    haloMat,
    setLevel(v) {
      haloMat.opacity = 0.5 * (0.25 + 0.75 * v);
    }
  };
}
