import * as THREE from 'three';
import { BoxBatch, mergeStatic } from './utils.js';
import { PALETTE } from './materials.js';

/* ============================================================
   建筑外壳：按内部实际体量包出体量与屋顶
   - 平面沿用内部控制线：门厅 ±7.5、走廊 ±2.35、马蹄厅 ±8→4.6、
     舞台主台 ±6.3 / 侧台 ±12.9、后台 ±6.2、工坊 6.2..12.6、办公室 -12.4..-8.6
   - 外壳只是包在内部之外的一层体量，不改任何室内构件与光位
   - 屋顶按音乐剧院做法：门厅四坡顶 + 采光亭，连廊坡顶 + 天窗，
     观众厅鼓座 + 穹顶 + 采光亭，舞台塔脊部通风体，工坊北向天窗
   - 立面只做一个视觉焦点（既有门廊与招牌），其余靠基座、二层线脚、
     窗洞、檐口与照明分层
   ============================================================ */

export const SHELL = {
  FRONT: { z0: 0.95, z1: -16.9, half: 10.4, eave: 11.1, ridge: 13.9, inset: 3.6 },
  LINK: { z0: -16.9, z1: -30.45, half: 5.85, eave: 8.35, ridge: 9.85, inset: 0.9 },
  // 观众厅外墙在平面里微微外弧：内 ±9.17 的直墙，外皮 10.15→10.75→10.15
  HOUSE: {
    z0: -30.45, z1: -47.8, half: 10.15, bow: 0.6, eave: 12.9, wallTop: 13.45,
    drumZ: -39.0, drumR: 7.1, drumTop: 16.65, domeH: 4.2,
    lanternR: 0.95, lanternTop: 22.9
  },
  STAGE: {
    z0: -47.8, z1: -57.95,
    towerHalf: 6.95, towerEave: 17.1, towerRidge: 18.7,
    wingHalf: 13.35, wingEave: 11.35
  },
  BACK: { z0: -57.95, z1: -66.2, half: 6.65, eave: 8.45, ridge: 9.85, inset: 2.2 },
  WORKSHOP: { x0: 6.2, x1: 12.6, z0: -58.3, z1: -65.8, eave: 5.95, ridge: 6.7 },
  OFFICE: { x0: -12.4, x1: -8.6, z0: -66.4, z1: -62.0, eave: 4.35, ridge: 5.6 },
  DOCK: { z: -66.2, cx: 2.6, halfW: 2.9, depth: 2.6, top: 1.05, doorW: 3.6, doorH: 3.9 },
  STAGE_DOOR: { x: -13.35, z: -51.4, w: 2.0, depth: 1.15, h: 3.5 },
  // 放映厅凸出连廊西侧的二层体量
  SCREEN: { x0: -9.0, x1: -5.85, z0: -28.7, z1: -22.9, top: 8.0 },
  // 四座方形塔楼：把门厅、观众厅、舞台三段的转角钉住
  TOWERS: {
    front: { x: 11.55, z: -16.35, size: 2.6, eave: 12.35, cap: 1.5 },
    rear: { x: 11.95, z: -46.95, size: 2.85, eave: 14.55, cap: 1.75 }
  }
};

/* 四坡顶：檐口在 y=0，屋脊沿 z，脊高 h，两端收进 inset */
export function hipRoofGeometry(w, d, h, inset) {
  const hw = w / 2;
  const hd = d / 2;
  const verts = [
    -hw, 0, -hd, hw, 0, -hd, hw, 0, hd, -hw, 0, hd,
    0, h, -hd + inset, 0, h, hd - inset
  ];
  const idx = [
    0, 3, 5, 0, 5, 4,   // 西坡
    1, 4, 5, 1, 5, 2,   // 东坡
    0, 4, 1,            // 北歇山
    3, 2, 5             // 南歇山
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/* 双坡顶：山墙朝端头，屋脊沿 z */
export function gableRoofGeometry(w, d, h) {
  const hw = w / 2;
  const hd = d / 2;
  const verts = [
    -hw, 0, -hd, hw, 0, -hd, hw, 0, hd, -hw, 0, hd,
    0, h, -hd, 0, h, hd
  ];
  const idx = [
    2, 1, 4, 2, 4, 5,   // 东坡
    0, 3, 5, 0, 5, 4,   // 西坡
    1, 0, 4,            // 北山墙
    3, 2, 5             // 南山墙
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/* 孟莎顶：下段陡坡收进后接一段浅坡脊，檐口在 y=0 */
export function mansardRoofGeometry(w, d, hLower, hUpper, inset, inset2 = inset * 0.45) {
  const hw = w / 2;
  const hd = d / 2;
  const mw = Math.max(0.4, hw - inset);
  const md = Math.max(0.4, hd - inset);
  const tw = Math.max(0.2, mw - inset2);
  const td = Math.max(0.2, md - inset2);
  const y1 = hLower;
  const y2 = hLower + hUpper;
  const verts = [
    -hw, 0, -hd, hw, 0, -hd, hw, 0, hd, -hw, 0, hd,
    -mw, y1, -md, mw, y1, -md, mw, y1, md, -mw, y1, md,
    0, y2, -td, 0, y2, td
  ];
  const idx = [
    0, 4, 5, 0, 5, 1,   // north lower
    3, 2, 6, 3, 6, 7,   // south lower
    2, 1, 5, 2, 5, 6,   // east lower
    4, 0, 3, 4, 3, 7,   // west lower
    4, 7, 9, 4, 9, 8,   // west upper
    6, 5, 8, 6, 8, 9,   // east upper
    5, 4, 8,            // north hip
    7, 6, 9             // south hip
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/* 观众厅外弧线：t=0 靠台口，t=1 靠尾端；返回外皮 x 与切线角 */
function houseOuterX(z) {
  const t = (z - SHELL.HOUSE.z0) / (SHELL.HOUSE.z1 - SHELL.HOUSE.z0);
  return SHELL.HOUSE.half + SHELL.HOUSE.bow * Math.sin(Math.PI * Math.max(0, Math.min(1, t)));
}

export function buildShell(scene, mats, quality) {
  const group = new THREE.Group();
  group.name = 'shell';
  scene.add(group);

  const wallStone = mats.stone.clone();
  wallStone.color.setHex(0x8d7e6d);
  wallStone.roughness = 0.92;
  // 极低的自发光只作为夜景里的石材基色，避免远处体量塌成纯黑
  wallStone.emissive = new THREE.Color(0x241a11);
  wallStone.emissiveIntensity = 1.0;

  const wallDark = mats.stone.clone();
  wallDark.color.setHex(0x4c4238);
  wallDark.roughness = 0.94;
  wallDark.emissive = new THREE.Color(0x140d08);
  wallDark.emissiveIntensity = 0.6;

  const stoneLight = mats.stone.clone();
  stoneLight.color.setHex(0xa9977f);
  stoneLight.roughness = 0.86;
  stoneLight.emissive = new THREE.Color(0x281c12);
  stoneLight.emissiveIntensity = 0.9;

  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x2a5144,
    roughness: 0.58,
    metalness: 0.42,
    envMapIntensity: 0.7,
    emissive: new THREE.Color(0x12332b),
    emissiveIntensity: 1.0,
    side: THREE.DoubleSide
  });
  const domeMat = new THREE.MeshStandardMaterial({
    color: 0x487b6b,
    roughness: 0.46,
    metalness: 0.62,
    envMapIntensity: 1.0,
    emissive: new THREE.Color(0x0d1d18),
    emissiveIntensity: 0.8,
    side: THREE.DoubleSide
  });
  // 铜带与折面边缘：比屋面更亮的铜绿，夜里只让边缘读出来
  const copperEdgeMat = new THREE.MeshStandardMaterial({
    color: 0x9ed4b8,
    roughness: 0.28,
    metalness: 0.86,
    envMapIntensity: 1.1,
    emissive: new THREE.Color(0x2a5445),
    emissiveIntensity: 1.35
  });
  // 裂缝两侧的铜框：比铜带收一档，近看不至于发成霓虹
  const copperFrameMat = new THREE.MeshStandardMaterial({
    color: 0x6f9d89,
    roughness: 0.42,
    metalness: 0.7,
    emissive: new THREE.Color(0x152e26),
    emissiveIntensity: 0.7
  });
  const copperRibMat = new THREE.MeshStandardMaterial({
    color: 0x74a995,
    roughness: 0.3,
    metalness: 0.8,
    emissive: new THREE.Color(0x142a23),
    emissiveIntensity: 1.0
  });
  const doorMat = new THREE.MeshStandardMaterial({
    color: 0x17110c,
    roughness: 0.82,
    metalness: 0.15
  });
  // 窗光分三档，避免整栋楼一个亮度；实例化窗片用白底 + 每实例色
  const glowDim = new THREE.MeshBasicMaterial({ color: 0x2c1a0e, toneMapped: false });
  const glowMid = new THREE.MeshBasicMaterial({ color: 0x71441f, toneMapped: false });
  const glowHot = new THREE.MeshBasicMaterial({ color: 0xb87b3c, toneMapped: false });
  const winMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const glowMats = [
    { mat: glowDim, base: 0x2c1a0e },
    { mat: glowMid, base: 0x71441f },
    { mat: glowHot, base: 0xb87b3c }
  ];
  // 拱窗上部的半圆光片与石券边
  const archGlowMat = new THREE.MeshBasicMaterial({ color: 0x6a3f1c, toneMapped: false });
  // 裂缝里的暖光：比普通窗光更亮，远看是一道透出来的光缝
  const crackMat = new THREE.MeshBasicMaterial({ color: 0xffa85c, toneMapped: false });
  const archTrimMat = new THREE.MeshStandardMaterial({
    color: 0xa3917a,
    roughness: 0.88,
    metalness: 0.04,
    side: THREE.DoubleSide
  });
  glowMats.push({ mat: archGlowMat, base: 0x6a3f1c });
  glowMats.push({ mat: crackMat, base: 0xffa85c });

  const gold = new BoxBatch(mats.gold);
  const goldDeep = new BoxBatch(mats.goldDeep);

  function box(w, h, d, x, y, z, mat = wallStone, ry = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    if (ry) mesh.rotation.y = ry;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  function roof(w, d, h, inset, x, y, z) {
    const mesh = new THREE.Mesh(hipRoofGeometry(w, d, h, inset), roofMat);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }

  /* ---------- 窗洞：一块暗框 + 一片暖光，各自实例化 ---------- */
  const windows = [];
  function addWindow(x, y, z, w, h, nx, lit = 0.35) {
    windows.push({ x, y, z, w, h, nx, lit });
  }

  // 拱窗：在矩形窗顶补半圆光片与石券
  function archHead(x, y, z, w, nx) {
    const r = w * 0.5;
    const geo = new THREE.CircleGeometry(r, 14, 0, Math.PI);
    geo.rotateY(nx > 0 ? Math.PI / 2 : -Math.PI / 2);
    const glow = new THREE.Mesh(geo, archGlowMat);
    glow.position.set(x + nx * 0.19, y + r, z);
    group.add(glow);
    const trim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.075, 5, 14, Math.PI), archTrimMat);
    trim.rotation.y = nx > 0 ? Math.PI / 2 : -Math.PI / 2;
    trim.position.set(x + nx * 0.2, y + r, z);
    group.add(trim);
  }

  // 竖向壁柱：按墙面切向旋转，读得出中段的拱窗节奏
  function pilaster(x, y, z, h, nx, ry = 0, w = 0.4, d = 0.42) {
    const mesh = box(nx === 0 ? w : d, h, nx === 0 ? d : w, x, y, z, stoneLight, ry);
    return mesh;
  }

  // 檐口灯槽：只照亮顶部一条线
  function corniceStrip(w, x, y, z, ry = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.075, 0.11), glowDim);
    mesh.position.set(x, y, z);
    if (ry) mesh.rotation.y = ry;
    mesh.userData.shellGlow = 0.3;
    group.add(mesh);
    return mesh;
  }

  function gableRoofMesh(w, d, h, x, y, z) {
    const mesh = new THREE.Mesh(gableRoofGeometry(w, d, h), roofMat);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }

  function mansardRoofMesh(w, d, hLower, hUpper, inset, inset2, x, y, z) {
    const mesh = new THREE.Mesh(mansardRoofGeometry(w, d, hLower, hUpper, inset, inset2), roofMat);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }

  function tube(points, radius, mat) {
    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(24, points.length * 14), radius, 6, false), mat);
    group.add(mesh);
    return mesh;
  }

  /* ---------- 1. 门厅体（入口立面之后的大体量） ---------- */
  const F = SHELL.FRONT;
  const fMid = (F.z0 + F.z1) / 2;
  for (const sign of [-1, 1]) {
    box(0.7, F.eave, F.z0 - F.z1, sign * F.half, F.eave / 2, fMid);
    // 与连廊交接的南向回墙
    box(F.half - SHELL.LINK.half, F.eave, 0.6, sign * (F.half + SHELL.LINK.half) / 2, F.eave / 2, F.z1);
    // 侧立面二层窗：只点亮其中两扇，其余留暗
    for (const z of [-3.4, -7.0, -10.6, -14.2]) {
      const lit = z === -7.0 ? 0.3 : z === -14.2 ? 0.14 : 0.04;
      addWindow(sign * (F.half + 0.36), 6.7, z, 1.35, 2.8, sign, lit);
    }
  }
  // 立面之上的阁楼层：中央留出裂缝，两侧石带错动收头
  for (const sign of [-1, 1]) {
    const bw = F.half - 1.2;
    box(bw, F.eave - 8.65, 0.44, sign * (1.2 + bw / 2), (F.eave + 8.65) / 2, 0.72, wallDark);
    goldDeep.add(bw, 0.16, 0.5, sign * (1.2 + bw / 2), 8.72, 0.74);
    gold.add(bw, 0.14, 0.62, sign * (1.2 + bw / 2), F.eave - 0.06, 0.74);
  }
  // 中央裂缝：两侧铜边、顶部铜楣，缝内只留一条暖光
  for (const sign of [-1, 1]) {
    box(0.14, 6.05, 0.4, sign * 1.24, 8.02, 0.86, copperFrameMat);
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.12, 5.7, 0.1), crackMat);
    slit.position.set(sign * 1.34, 8.0, 1.04);
    slit.userData.shellGlow = 0.22;
    group.add(slit);
  }
  box(2.7, 0.2, 0.4, 0, 11.04, 0.86, copperFrameMat);
  // 基座与两道石带
  box(F.half * 2 + 0.5, 0.78, F.z0 - F.z1 + 0.5, 0, 0.39, fMid, wallDark);
  goldDeep.add(F.half * 2 + 0.6, 0.09, 0.1, 0, 0.82, F.z0 + 0.04);
  for (const y of [1.55, 2.15]) {
    box(F.half * 2 + 0.18, 0.09, F.z0 - F.z1 + 0.12, 0, y, fMid, stoneLight);
  }
  // 侧立面：底层小窗 + 壁柱 + 拱窗
  for (const sign of [-1, 1]) {
    for (const z of [-4.6, -9.2, -13.8]) {
      addWindow(sign * (F.half + 0.36), 2.45, z, 0.95, 1.25, sign, z === -9.2 ? 0.16 : 0.03);
    }
    for (const z of [-3.4, -7.0, -10.6, -14.2]) {
      archHead(sign * (F.half + 0.36), 8.1, z, 1.35, sign);
    }
    for (const z of [-1.6, -5.2, -8.8, -12.4, -15.8]) {
      pilaster(sign * (F.half + 0.2), 6.2, z, 8.1, sign);
    }
    corniceStrip(F.z0 - F.z1 - 1.2, sign * (F.half + 0.24), F.eave - 0.35, fMid, Math.PI / 2);
  }
  // 孟莎顶 + 老虎窗 + 采光亭
  const mh = F.ridge - F.eave;
  mansardRoofMesh(
    F.half * 2 + 0.9, F.z0 - F.z1 + 0.7,
    mh * 0.72, mh * 0.28, 1.9, 0.85,
    0, F.eave, fMid
  );
  goldDeep.add(0.14, 0.14, F.z0 - F.z1 - 2.6, 0, F.ridge + 0.02, fMid);
  // 孟莎顶折线处一道铜箍
  const midY = F.eave + mh * 0.72;
  for (const sign of [-1, 1]) {
    goldDeep.add(0.12, 0.12, F.z0 - F.z1 - 3.8, sign * (F.half - 1.86), midY, fMid);
    goldDeep.add(F.half * 2 - 3.8, 0.12, 0.12, 0, midY, sign > 0 ? F.z0 - 1.7 : F.z1 + 1.7);
  }
  for (const sign of [-1, 1]) {
    for (const z of [-4.5, -8.2, -11.9]) {
      box(0.9, 1.5, 1.3, sign * (F.half - 0.55), F.eave + 1.05, z, stoneLight);
      const dw = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.82, 0.78), glowMid);
      dw.position.set(sign * (F.half - 0.06), F.eave + 1.05, z);
      dw.userData.shellGlow = 0.24;
      group.add(dw);
      const dcap = new THREE.Mesh(gableRoofGeometry(1.5, 1.1, 0.55), roofMat);
      dcap.rotation.y = Math.PI / 2;
      dcap.position.set(sign * (F.half - 0.55), F.eave + 1.8, z);
      group.add(dcap);
      goldDeep.add(0.62, 0.08, 0.1, sign * (F.half + 0.02), F.eave + 1.05, z);
    }
  }
  for (const x of [-4.2, 4.2]) {
    box(1.35, 1.45, 0.9, x, F.eave + 1.0, 1.0, stoneLight);
    const dw = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.78, 0.06), glowMid);
    dw.position.set(x, F.eave + 1.0, 1.47);
    dw.userData.shellGlow = 0.2;
    group.add(dw);
    const dcap = new THREE.Mesh(gableRoofGeometry(1.55, 1.0, 0.52), roofMat);
    dcap.position.set(x, F.eave + 1.72, 1.0);
    group.add(dcap);
    goldDeep.add(1.0, 0.08, 0.1, x, F.eave + 1.0, 1.53);
  }
  const cupolaZ = -8.2;
  const cupola = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.85, 1.9, 8), stoneLight);
  cupola.position.set(0, F.ridge + 0.9, cupolaZ);
  group.add(cupola);
  const cupolaGlass = new THREE.Mesh(new THREE.CylinderGeometry(1.73, 1.73, 0.62, 8), glowMid);
  cupolaGlass.position.set(0, F.ridge + 1.05, cupolaZ);
  cupolaGlass.userData.shellGlow = 0.55;
  group.add(cupolaGlass);
  const cupolaCap = new THREE.Mesh(
    new THREE.SphereGeometry(1.9, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    domeMat
  );
  cupolaCap.scale.set(1, 0.62, 1);
  cupolaCap.position.set(0, F.ridge + 1.85, cupolaZ);
  group.add(cupolaCap);
  const cupolaFinial = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 8), mats.brass);
  cupolaFinial.position.set(0, F.ridge + 3.0, cupolaZ);
  group.add(cupolaFinial);

  /* ---------- 2. 连廊（前厅到观众厅之间的低体量） ---------- */
  const L = SHELL.LINK;
  const lMid = (L.z0 + L.z1) / 2;
  for (const sign of [-1, 1]) {
    if (sign < 0) continue;   // 西侧由放映厅体量接替
    box(0.55, L.eave, L.z0 - L.z1, sign * L.half, L.eave / 2, lMid);
    for (const z of [-19.4, -23.0, -26.6]) {
      addWindow(sign * (L.half + 0.29), 5.5, z, 1.25, 2.3, sign, z === -23.0 ? 0.2 : 0.05);
      archHead(sign * (L.half + 0.29), 6.65, z, 1.25, sign);
    }
    for (const z of [-18.2, -21.2, -24.8, -27.8, -29.8]) {
      pilaster(sign * (L.half + 0.18), 4.9, z, 7.0, sign, 0, 0.34, 0.36);
    }
    corniceStrip(L.z0 - L.z1 - 0.8, sign * (L.half + 0.22), L.eave - 0.3, lMid, Math.PI / 2);
  }
  // 放映厅：连廊西侧凸出的二层体量，带三扇窗
  const S = SHELL.SCREEN;
  const sMidZ = (S.z0 + S.z1) / 2;
  box(0.5, S.top, S.z1 - S.z0, S.x0, S.top / 2, sMidZ);
  box(S.x1 - S.x0 + 0.5, S.top, 0.5, (S.x0 + S.x1) / 2, S.top / 2, S.z0);
  box(S.x1 - S.x0 + 0.5, S.top, 0.5, (S.x0 + S.x1) / 2, S.top / 2, S.z1);
  for (const z of [-24.6, -26.1, -27.6]) {
    addWindow(S.x0 - 0.26, 5.7, z, 1.1, 2.0, -1, z === -26.1 ? 0.26 : 0.05);
  }
  // 连廊西墙（放映厅前后两段）
  for (const [za, zb] of [[L.z0, S.z1], [S.z0, L.z1]]) {
    box(0.55, L.eave, za - zb, -L.half, L.eave / 2, (za + zb) / 2);
  }
  // 与观众厅交接的回墙
  for (const sign of [-1, 1]) {
    box(SHELL.HOUSE.half - L.half, L.eave, 0.55, sign * (SHELL.HOUSE.half + L.half) / 2, L.eave / 2, L.z1);
  }
  box(L.half * 2, 0.78, L.z0 - L.z1, 0, 0.39, lMid, wallDark);
  roof(L.half * 2 + 0.7, L.z0 - L.z1 + 0.5, L.ridge - L.eave, L.inset, 0, L.eave, lMid);
  // 连廊屋脊天窗
  for (const z of [-19.8, -23.4, -27.0]) {
    const sky = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.55, 2.2), glowDim);
    sky.position.set(0, L.ridge + 0.3, z);
    sky.userData.shellGlow = 0.34;
    group.add(sky);
    goldDeep.add(0.34, 0.1, 2.4, 0, L.ridge + 0.06, z);
  }

  /* ---------- 3. 观众厅：外弧墙 + 鼓座穹顶 ---------- */
  const H = SHELL.HOUSE;
  const planShape = new THREE.Shape();
  const curveSeg = 22;
  planShape.moveTo(H.half, -H.z0);
  for (let i = 1; i <= curveSeg; i++) {
    const t = i / curveSeg;
    const z = H.z0 + (H.z1 - H.z0) * t;
    planShape.lineTo(houseOuterX(z), -z);
  }
  planShape.lineTo(-H.half, -H.z1);
  for (let i = curveSeg - 1; i >= 0; i--) {
    const t = i / curveSeg;
    const z = H.z0 + (H.z1 - H.z0) * t;
    planShape.lineTo(-houseOuterX(z), -z);
  }
  planShape.closePath();
  const hole = new THREE.Path();
  const insetW = 0.62;
  hole.moveTo(H.half - insetW, -H.z0);
  for (let i = 1; i <= curveSeg; i++) {
    const t = i / curveSeg;
    const z = H.z0 + (H.z1 - H.z0) * t;
    hole.lineTo(houseOuterX(z) - insetW, -z);
  }
  hole.lineTo(-(H.half - insetW), -H.z1);
  for (let i = curveSeg - 1; i >= 0; i--) {
    const t = i / curveSeg;
    const z = H.z0 + (H.z1 - H.z0) * t;
    hole.lineTo(-(houseOuterX(z) - insetW), -z);
  }
  hole.closePath();
  planShape.holes.push(hole);

  const wallGeo = new THREE.ExtrudeGeometry(planShape, {
    depth: H.eave,
    bevelEnabled: false,
    curveSegments: 18
  });
  wallGeo.rotateX(-Math.PI / 2);
  const houseWall = new THREE.Mesh(wallGeo, wallStone);
  houseWall.receiveShadow = true;
  group.add(houseWall);

  // 尾端回墙：两侧落到连廊顶，中央只留连廊以上的部分
  for (const sign of [-1, 1]) {
    box(H.half - L.half + 0.3, H.eave, 0.5, sign * (H.half + L.half) / 2, H.eave / 2, H.z0);
  }
  box(H.half * 2, H.eave - L.eave, 0.5, 0, (H.eave + L.eave) / 2, H.z0);
  // 台口侧回墙（舞台塔与侧台之间）
  for (const sign of [-1, 1]) {
    box(H.half - SHELL.STAGE.towerHalf + 0.2, H.eave, 0.5, sign * (H.half + SHELL.STAGE.towerHalf) / 2, H.eave / 2, H.z1);
  }
  // 基座与檐口
  box(H.half * 2 + 0.8, 0.9, H.z0 - H.z1 + 0.6, 0, 0.45, (H.z0 + H.z1) / 2, wallDark);
  gold.add(H.half * 2 + 0.9, 0.16, H.z0 - H.z1 + 0.7, 0, H.wallTop - 0.1, (H.z0 + H.z1) / 2);

  // 三层包厢在立面上的外弧线脚：跟随外墙弧线分成小段
  const segs = 14;
  for (const sign of [-1, 1]) {
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs;
      const t1 = (i + 1) / segs;
      const z0 = H.z0 + (H.z1 - H.z0) * t0;
      const z1 = H.z0 + (H.z1 - H.z0) * t1;
      const x0 = sign * houseOuterX(z0);
      const x1 = sign * houseOuterX(z1);
      const zc = (z0 + z1) / 2;
      const xc = (x0 + x1) / 2;
      const len = Math.hypot(x1 - x0, z1 - z0) + 0.06;
      const yaw = Math.atan2(x1 - x0, z1 - z0);
      // 二层主line脚（包厢外弧）与顶层细线脚
      goldDeep.add(0.36, 0.24, len, xc + sign * 0.16, 4.12, zc, yaw);
      goldDeep.add(0.22, 0.08, len, xc + sign * 0.1, 6.38, zc, yaw);
    }
  }
  // 观众厅侧窗：下层高拱窗 + 上层拱窗
  for (const sign of [-1, 1]) {
    for (const z of [-33.2, -36.4, -39.6, -42.8, -45.0]) {
      const x = sign * (houseOuterX(z) + 0.02);
      const lower = z === -36.4 ? 0.16 : z === -42.8 ? 0.26 : 0.03;
      const upper = z === -39.6 ? 0.13 : z === -33.2 ? 0.06 : 0.02;
      addWindow(x, 2.55, z, 1.45, 3.3, sign, lower);
      addWindow(x, 8.15, z, 1.3, 2.9, sign, upper);
      archHead(x, 4.2, z, 1.45, sign);
      archHead(x, 9.6, z, 1.3, sign);
    }
    // 壁柱按外弧切线转向，中段节奏立起来
    for (const z of [-31.7, -34.8, -38.0, -41.2, -44.4, -46.4]) {
      const xa = sign * houseOuterX(z - 0.4);
      const xb = sign * houseOuterX(z + 0.4);
      const yaw = Math.atan2(xb - xa, 0.8);
      pilaster(sign * (houseOuterX(z) + 0.2), 6.3, z, 11.2, sign, yaw, 0.38, 0.44);
    }
    // 檐口灯槽沿弧线分段
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs;
      const t1 = (i + 1) / segs;
      const za = H.z0 + (H.z1 - H.z0) * t0;
      const zb = H.z0 + (H.z1 - H.z0) * t1;
      const xa = sign * houseOuterX(za);
      const xb = sign * houseOuterX(zb);
      const yaw = Math.atan2(xb - xa, zb - za);
      const len = Math.hypot(xb - xa, zb - za);
      corniceStrip(len + 0.06, (xa + xb) / 2 + sign * 0.2, H.eave - 0.28, (za + zb) / 2, yaw);
    }
  }

  // 低坡屋面 + 鼓座 + 穹顶 + 采光亭
  roof(H.half * 2 + 1.0, H.z0 - H.z1 + 0.8, 1.6, 5.4, 0, H.wallTop, (H.z0 + H.z1) / 2);
  const drum = new THREE.Mesh(
    new THREE.CylinderGeometry(H.drumR, H.drumR + 0.22, H.drumTop - H.wallTop, 40),
    stoneLight
  );
  drum.position.set(0, (H.drumTop + H.wallTop) / 2, H.drumZ);
  group.add(drum);
  // 鼓座窗：一圈暖光
  const drumWinGeo = new THREE.BoxGeometry(0.16, 1.5, 0.9);
  const drumWin = new THREE.InstancedMesh(drumWinGeo, winMat, 16);
  const mWin = new THREE.Matrix4();
  const qWin = new THREE.Quaternion();
  const cWin = new THREE.Color();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const x = Math.sin(a) * (H.drumR + 0.06);
    const z = H.drumZ + Math.cos(a) * (H.drumR + 0.06);
    qWin.setFromEuler(new THREE.Euler(0, a, 0));
    mWin.compose(new THREE.Vector3(x, (H.wallTop + H.drumTop) / 2, z), qWin, new THREE.Vector3(1, 1, 1));
    drumWin.setMatrixAt(i, mWin);
    const v = i % 3 === 0 ? 0.78 : 0.34;
    cWin.setRGB(v, v * 0.6, v * 0.28);
    drumWin.setColorAt(i, cWin);
  }
  drumWin.instanceMatrix.needsUpdate = true;
  if (drumWin.instanceColor) drumWin.instanceColor.needsUpdate = true;
  group.add(drumWin);
  // 铜箍
  const drumRing = new THREE.Mesh(
    new THREE.TorusGeometry(H.drumR + 0.12, 0.1, 6, 48),
    mats.brass
  );
  drumRing.rotation.x = Math.PI / 2;
  drumRing.position.set(0, H.drumTop - 0.08, H.drumZ);
  group.add(drumRing);
  const drumRing2 = drumRing.clone();
  drumRing2.position.y = H.wallTop + 0.2;
  group.add(drumRing2);

  // 穹顶：前右一侧斜切，折面像被掀起的幕角
  const TAU = Math.PI * 2;
  const gapA = 1.756;
  const gapB = 2.956;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(H.drumR, 48, 20, gapB, TAU - (gapB - gapA), 0, Math.PI / 2),
    domeMat
  );
  dome.scale.set(1, H.domeH / H.drumR, 1);
  dome.position.set(0, H.drumTop, H.drumZ);
  group.add(dome);

  const rimPoint = (phi) => new THREE.Vector3(
    -H.drumR * Math.cos(phi),
    H.drumTop,
    H.drumZ + H.drumR * Math.sin(phi)
  );
  const p1 = rimPoint(gapA);
  const p2 = rimPoint(gapB);
  const foldMid = (gapA + gapB) / 2;
  const apex = new THREE.Vector3(
    -H.drumR * 1.16 * Math.cos(foldMid),
    H.drumTop + H.domeH * 1.22,
    H.drumZ + H.drumR * 1.16 * Math.sin(foldMid)
  );
  const crown = new THREE.Vector3(0, H.drumTop + H.domeH, H.drumZ);
  const foldGeo = new THREE.BufferGeometry();
  foldGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, apex.x, apex.y, apex.z,
    p1.x, p1.y, p1.z, apex.x, apex.y, apex.z, crown.x, crown.y, crown.z,
    apex.x, apex.y, apex.z, p2.x, p2.y, p2.z, crown.x, crown.y, crown.z
  ], 3));
  foldGeo.computeVertexNormals();
  const fold = new THREE.Mesh(foldGeo, domeMat);
  group.add(fold);
  // 折面外缘与切口边缘：夜里只让铜绿边线亮出来
  tube([p1, apex, p2], 0.11, copperEdgeMat);
  const domeEdge = (phi) => {
    const pts = [];
    for (let i = 0; i <= 9; i++) {
      const th = (i / 9) * (Math.PI / 2);
      pts.push(new THREE.Vector3(
        -(H.drumR + 0.03) * Math.cos(phi) * Math.sin(th),
        H.drumTop + (H.domeH + 0.03) * Math.cos(th),
        H.drumZ + (H.drumR + 0.03) * Math.sin(phi) * Math.sin(th)
      ));
    }
    return pts;
  };
  tube(domeEdge(gapA), 0.085, copperEdgeMat);
  tube(domeEdge(gapB), 0.085, copperEdgeMat);
  // 保留少量铜肋，避开折面开口
  for (const phi of [0.3, 0.95, 3.35, 4.0]) {
    tube(domeEdge(phi), 0.065, copperRibMat);
  }
  // 采光亭
  const lantern = new THREE.Mesh(
    new THREE.CylinderGeometry(H.lanternR, H.lanternR + 0.12, 1.55, 12),
    stoneLight
  );
  lantern.position.set(0, H.drumTop + H.domeH - 0.2, H.drumZ);
  group.add(lantern);
  const lanternGlass = new THREE.Mesh(
    new THREE.CylinderGeometry(H.lanternR + 0.04, H.lanternR + 0.1, 0.62, 12),
    glowHot
  );
  lanternGlass.position.set(0, H.drumTop + H.domeH - 0.28, H.drumZ);
  lanternGlass.userData.shellGlow = 0.75;
  group.add(lanternGlass);
  const lanternCap = new THREE.Mesh(
    new THREE.ConeGeometry(H.lanternR + 0.28, 1.25, 12),
    domeMat
  );
  lanternCap.position.set(0, H.drumTop + H.domeH + 1.2, H.drumZ);
  group.add(lanternCap);
  const finial = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.1, 8), mats.brass);
  finial.position.set(0, H.drumTop + H.domeH + 2.3, H.drumZ);
  group.add(finial);

  /* ---------- 4. 舞台塔与侧台 ---------- */
  const T = SHELL.STAGE;
  const tMid = (T.z0 + T.z1) / 2;
  for (const sign of [-1, 1]) {
    box(0.65, T.towerEave, T.z0 - T.z1, sign * T.towerHalf, T.towerEave / 2, tMid);
    // 侧台外墙
    box(0.6, T.wingEave, T.z0 - T.z1, sign * T.wingHalf, T.wingEave / 2, tMid);
    // 侧台前回墙（观众厅屋面之上外露）
    box(T.wingHalf - T.towerHalf, T.wingEave, 0.55, sign * (T.wingHalf + T.towerHalf) / 2, T.wingEave / 2, T.z0);
    // 侧台后回墙
    box(T.wingHalf - T.towerHalf, T.wingEave, 0.55, sign * (T.wingHalf + T.towerHalf) / 2, T.wingEave / 2, T.z1);
    // 侧台高侧窗
    for (const z of [-50.2, -53.0, -55.8]) {
      addWindow(sign * (T.wingHalf + 0.31), 9.3, z, 1.55, 1.8, sign, z === -53.0 ? 0.16 : 0.04);
      archHead(sign * (T.wingHalf + 0.31), 10.2, z, 1.55, sign);
    }
    for (const z of [-48.9, -51.6, -54.4, -57.1]) {
      pilaster(sign * (T.wingHalf + 0.2), 6.4, z, 9.0, sign, 0, 0.36, 0.4);
    }
    corniceStrip(T.z0 - T.z1 - 0.8, sign * (T.wingHalf + 0.22), T.wingEave - 0.3, tMid, Math.PI / 2);
    // 塔身上段壁柱与高窗（侧台屋面以上）
    for (const z of [-49.4, -52.6, -55.8]) {
      pilaster(sign * (T.towerHalf + 0.18), 13.9, z, 5.9, sign, 0, 0.34, 0.42);
      addWindow(sign * (T.towerHalf + 0.28), 14.1, z, 0.8, 1.5, sign, z === -52.6 ? 0.1 : 0.02);
    }
    corniceStrip(T.z0 - T.z1 - 0.7, sign * (T.towerHalf + 0.22), T.towerEave - 0.3, tMid, Math.PI / 2);
  }
  // 舞台塔背墙（后台屋面以上外露）
  box(T.towerHalf * 2 + 0.7, T.towerEave - SHELL.BACK.eave, 0.6, 0, (T.towerEave + SHELL.BACK.eave) / 2, T.z1);
  box(T.towerHalf * 2 + 0.8, 0.95, T.z0 - T.z1 + 0.5, 0, 0.48, tMid, wallDark);
  // 侧台屋面
  for (const sign of [-1, 1]) {
    roof(T.wingHalf - T.towerHalf + 0.5, T.z0 - T.z1 + 0.5, 0.8, 1.2, sign * (T.wingHalf + T.towerHalf) / 2, T.wingEave, tMid);
  }
  // 塔身檐口与双坡顶
  gold.add(T.towerHalf * 2 + 0.9, 0.16, T.z0 - T.z1 + 0.7, 0, T.towerEave - 0.08, tMid);
  gableRoofMesh(T.towerHalf * 2 + 1.0, T.z0 - T.z1 + 0.7, T.towerRidge - T.towerEave, 0, T.towerEave, tMid);
  goldDeep.add(0.16, 0.16, T.z0 - T.z1 + 0.7, 0, T.towerRidge + 0.02, tMid);
  // 脊部通风体：一排格栅
  box(2.4, 1.35, T.z0 - T.z1 - 5.4, 0, T.towerRidge + 0.55, tMid, stoneLight);
  for (const sign of [-1, 1]) {
    const louver = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.9, T.z0 - T.z1 - 5.8), glowDim);
    louver.position.set(sign * 1.22, T.towerRidge + 0.55, tMid);
    louver.userData.shellGlow = 0.18;
    group.add(louver);
  }
  goldDeep.add(2.7, 0.12, T.z0 - T.z1 - 5.2, 0, T.towerRidge + 1.25, tMid);

  /* 舞台侧门（人员门）：做成一个凸出的小门斗 */
  const SD = SHELL.STAGE_DOOR;
  box(SD.depth, SD.h, SD.w, SD.x - SD.depth / 2, SD.h / 2, SD.z);
  goldDeep.add(SD.depth + 0.1, 0.16, SD.w + 0.2, SD.x - SD.depth / 2, SD.h - 0.08, SD.z);
  goldDeep.add(0.14, 2.9, 0.12, SD.x - SD.depth - 0.02, 1.6, SD.z - SD.w / 2 + 0.16);
  goldDeep.add(0.14, 2.9, 0.12, SD.x - SD.depth - 0.02, 1.6, SD.z + SD.w / 2 - 0.16);
  const sdDoor = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.45, 1.1), doorMat);
  sdDoor.position.set(SD.x - SD.depth - 0.02, 1.32, SD.z);
  group.add(sdDoor);
  const sdLamp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.22), glowHot);
  sdLamp.position.set(SD.x - SD.depth - 0.16, 3.05, SD.z);
  sdLamp.userData.shellGlow = 0.8;
  group.add(sdLamp);
  box(1.5, 0.16, SD.w + 0.6, SD.x - SD.depth - 0.7, 0.08, SD.z, stoneLight);

  /* ---------- 5. 后台与装卸台 ---------- */
  const B = SHELL.BACK;
  const bMid = (B.z0 + B.z1) / 2;
  const D = SHELL.DOCK;
  // 后台东侧与工坊共墙，只保留工坊之前的一小段外皮
  box(0.6, B.eave, 0.4, B.half, B.eave / 2, B.z0 - 0.2);
  box(0.6, B.eave, B.z0 - B.z1, -B.half, B.eave / 2, bMid);
  for (const z of [-60.8, -64.2]) {
    addWindow(-B.half - 0.34, 5.5, z, 1.15, 1.9, -1, z === -64.2 ? 0.2 : 0.05);
    archHead(-B.half - 0.34, 6.45, z, 1.15, -1);
  }
  corniceStrip(B.z0 - B.z1 - 1.2, -B.half - 0.24, B.eave - 0.3, bMid, Math.PI / 2);
  corniceStrip(B.half * 2 - 1.0, 0, B.eave - 0.3, B.z1 - 0.28);
  // 后墙：装卸门两侧与门上
  const dx0 = D.cx - D.doorW / 2;
  const dx1 = D.cx + D.doorW / 2;
  box(B.half - dx1 + 0.1, B.eave, 0.6, (B.half + dx1) / 2, B.eave / 2, B.z1);
  box(B.half + dx0 + 0.1, B.eave, 0.6, (-B.half + dx0) / 2, B.eave / 2, B.z1);
  box(D.doorW, B.eave - 5.15, 0.6, D.cx, (B.eave + 5.15) / 2, B.z1);
  // 装卸门：卷帘 + 门套 + 雨棚 + 站台
  const roll = new THREE.Mesh(new THREE.BoxGeometry(D.doorW, D.doorH, 0.12), doorMat);
  roll.position.set(D.cx, D.top + D.doorH / 2, B.z1 - 0.03);
  group.add(roll);
  for (let i = 0; i < 7; i++) {
    goldDeep.add(D.doorW - 0.1, 0.045, 0.16, D.cx, D.top + 0.3 + i * 0.55, B.z1 - 0.08);
  }
  goldDeep.add(D.doorW + 0.34, 0.14, 0.2, D.cx, D.top + D.doorH + 0.12, B.z1 - 0.02);
  box(D.doorW + 0.9, 0.22, 1.2, D.cx, 5.55, B.z1 - 0.66, stoneLight);
  goldDeep.add(D.doorW + 1.0, 0.12, 1.25, D.cx, 5.68, B.z1 - 0.66);
  const dockLamp = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.34), glowHot);
  dockLamp.position.set(D.cx, 5.44, B.z1 - 0.62);
  dockLamp.userData.shellGlow = 0.6;
  group.add(dockLamp);
  // 站台
  box(D.halfW * 2, D.top, D.depth, D.cx, D.top / 2, B.z1 - D.depth / 2, wallDark);
  goldDeep.add(D.halfW * 2 + 0.1, 0.1, 0.12, D.cx, D.top + 0.01, B.z1 - D.depth + 0.06);
  for (const sx of [-1, 1]) {
    box(0.16, D.top, D.depth, D.cx + sx * (D.halfW - 0.08), D.top / 2, B.z1 - D.depth / 2, stoneLight);
  }
  box(1.4, 0.55, 1.1, D.cx - D.halfW - 0.7, 0.28, B.z1 - D.depth + 0.55, stoneLight);
  // 后台屋面
  roof(B.half * 2 + 0.9, B.z0 - B.z1 + 0.6, B.ridge - B.eave, B.inset, 0, B.eave, bMid);
  goldDeep.add(0.12, 0.12, B.z0 - B.z1 - B.inset * 2 + 0.4, 0, B.ridge + 0.02, bMid);

  /* ---------- 6. 创意工坊（东侧低体量 + 北向天窗） ---------- */
  const W = SHELL.WORKSHOP;
  const wMidX = (W.x0 + W.x1) / 2;
  const wMidZ = (W.z0 + W.z1) / 2;
  box(0.55, W.eave, W.z0 - W.z1, W.x1, W.eave / 2, wMidZ);
  box(W.x1 - W.x0 + 0.4, W.eave, 0.55, wMidX, W.eave / 2, W.z1);
  box(W.x1 - W.x0 + 0.4, W.eave, 0.55, wMidX, W.eave / 2, W.z0);
  box(W.x1 - W.x0 + 0.3, 0.62, W.z0 - W.z1 + 0.4, wMidX, 0.31, wMidZ, wallDark);
  for (const z of [-60.4, -63.6]) {
    addWindow(W.x1 + 0.29, 3.5, z, 2.2, 1.7, 1, z === -63.6 ? 0.5 : 0.08);
    archHead(W.x1 + 0.29, 4.35, z, 2.2, 1);
  }
  corniceStrip(W.z0 - W.z1 - 0.8, W.x1 + 0.24, W.eave - 0.28, wMidZ, Math.PI / 2);
  roof(W.x1 - W.x0 + 0.6, W.z0 - W.z1 + 0.6, W.ridge - W.eave, 1.0, wMidX, W.eave, wMidZ);
  // 北向天窗带：抬高的采光体，北面一条暖光
  box(4.7, 1.1, 2.0, wMidX, W.ridge + 0.45, wMidZ, stoneLight);
  const north = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.7, 0.12), glowMid);
  north.position.set(wMidX, W.ridge + 0.45, W.z0 - 0.96);
  north.userData.shellGlow = 0.4;
  group.add(north);
  goldDeep.add(4.9, 0.1, 2.2, wMidX, W.ridge + 1.02, wMidZ);

  /* ---------- 7. 主理人办公室（西侧低体量 + 连通廊） ---------- */
  const O = SHELL.OFFICE;
  const oMidX = (O.x0 + O.x1) / 2;
  const oMidZ = (O.z0 + O.z1) / 2;
  box(0.5, O.eave, O.z0 - O.z1, O.x0, O.eave / 2, oMidZ);
  box(O.x1 - O.x0 + 0.3, O.eave, 0.5, oMidX, O.eave / 2, O.z1);
  box(O.x1 - O.x0 + 0.3, O.eave, 0.5, oMidX, O.eave / 2, O.z0);
  box(O.x1 - O.x0 + 0.2, 0.58, O.z0 - O.z1 + 0.3, oMidX, 0.29, oMidZ, wallDark);
  addWindow(O.x0 - 0.26, 2.55, O.z1 + 2.4, 1.15, 1.5, -1, 0.5);
  archHead(O.x0 - 0.26, 3.3, O.z1 + 2.4, 1.15, -1);
  corniceStrip(O.z0 - O.z1 - 0.6, O.x0 - 0.2, O.eave - 0.28, oMidZ, Math.PI / 2);
  roof(O.x1 - O.x0 + 0.5, O.z0 - O.z1 + 0.5, O.ridge - O.eave, 0.8, oMidX, O.eave, oMidZ);
  // 烟囱
  box(0.55, 1.3, 0.55, O.x0 + 0.9, O.ridge - 0.25, O.z0 + 1.3, wallDark);
  goldDeep.add(0.66, 0.1, 0.66, O.x0 + 0.9, O.ridge + 0.41, O.z0 + 1.3);
  // 办公室与后台之间的低连廊（内部短廊两侧外皮）
  const connW = O.x1 - SHELL.BACK.half;      // -8.6 .. -6.65
  box(connW, 3.7, 2.7, (O.x1 + SHELL.BACK.half) / 2, 1.85, -63.95, wallStone);
  box(connW + 0.4, 0.28, 3.1, (O.x1 + SHELL.BACK.half) / 2, 3.84, -63.95, stoneLight);

  /* ---------- 8. 四座转角塔楼：把三段体量钉住 ---------- */
  const TW = SHELL.TOWERS;
  for (const key of ['front', 'rear']) {
    const t = TW[key];
    for (const sign of [-1, 1]) {
      const x = sign * t.x;
      box(t.size + 0.5, 0.9, t.size + 0.5, x, 0.45, t.z, wallDark);
      box(t.size, t.eave, t.size, x, t.eave / 2, t.z, wallStone);
      goldDeep.add(t.size + 0.24, 0.14, t.size + 0.24, x, t.eave - 0.12, t.z);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(t.size * 0.73, t.cap, 4), roofMat);
      cap.rotation.y = Math.PI / 4;
      cap.position.set(x, t.eave + t.cap / 2, t.z);
      group.add(cap);
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.7, 6), mats.brass);
      fin.position.set(x, t.eave + t.cap + 0.22, t.z);
      group.add(fin);
      addWindow(sign * (t.x + t.size / 2 + 0.03), t.eave * 0.66, t.z, 0.72, 2.2, sign, key === 'front' ? 0.08 : 0.13);
      archHead(sign * (t.x + t.size / 2 + 0.03), t.eave * 0.66 + 1.1, t.z, 0.72, sign);
      corniceStrip(t.size * 0.84, sign * (t.x + t.size / 2 + 0.05), t.eave - 0.3, t.z, Math.PI / 2);
    }
  }

  /* ---------- 9. 铜带：从门厅裂缝底部绕过观众厅外弧，收在舞台塔檐口 ---------- */
  const bandPts = [
    new THREE.Vector3(-1.9, 0.45, 1.9),
    new THREE.Vector3(-1.92, 2.6, 1.92),
    new THREE.Vector3(-1.95, 4.7, 1.86),
    new THREE.Vector3(-2.5, 5.5, 1.5),
    new THREE.Vector3(-5.4, 5.55, 1.22),
    new THREE.Vector3(-8.9, 5.5, 0.98),
    new THREE.Vector3(-10.72, 5.7, 0.35),
    new THREE.Vector3(-10.95, 6.5, -4.5),
    new THREE.Vector3(-10.82, 7.2, -10.5),
    new THREE.Vector3(-10.7, 7.7, -14.8),
    new THREE.Vector3(-10.68, 7.9, -16.55),
    new THREE.Vector3(-9.0, 8.0, -17.0),
    new THREE.Vector3(-7.2, 8.1, -17.05),
    new THREE.Vector3(-6.18, 8.2, -17.35),
    new THREE.Vector3(-6.18, 8.35, -20.0),
    new THREE.Vector3(-6.18, 8.55, -24.0),
    new THREE.Vector3(-6.2, 8.75, -28.8),
    new THREE.Vector3(-7.4, 8.85, -30.35),
    new THREE.Vector3(-9.3, 8.95, -30.45),
    new THREE.Vector3(-10.45, 9.1, -31.2),
    new THREE.Vector3(-10.8, 9.65, -34.0),
    new THREE.Vector3(-10.98, 10.6, -38.5),
    new THREE.Vector3(-10.85, 11.6, -42.5),
    new THREE.Vector3(-10.58, 12.6, -45.8),
    new THREE.Vector3(-11.7, 13.7, -48.8),
    new THREE.Vector3(-12.6, 14.8, -51.4),
    new THREE.Vector3(-13.7, 15.9, -53.6),
    new THREE.Vector3(-13.7, 16.9, -55.4),
    new THREE.Vector3(-10.2, 17.02, -55.45),
    new THREE.Vector3(-7.1, 17.05, -55.2)
  ];
  tube(bandPts, 0.17, copperEdgeMat);

  /* ---------- 窗洞实例化 ---------- */
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x2a211a,
    roughness: 0.9
  });
  const frameGeo = new THREE.BoxGeometry(0.18, 1, 1);
  const frames = new THREE.InstancedMesh(frameGeo, frameMat, windows.length);
  const glowGeo = new THREE.BoxGeometry(0.08, 1, 1);
  const glows = new THREE.InstancedMesh(glowGeo, winMat, windows.length);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  const windowWarm = new THREE.Color(0xffb46a);
  windows.forEach((win, i) => {
    // 暗框：贴在墙面外 5cm，薄边朝法线
    m.compose(
      new THREE.Vector3(win.x + win.nx * 0.05, win.y, win.z),
      new THREE.Quaternion(),
      new THREE.Vector3(1, win.h * 0.96, win.w * 0.94)
    );
    frames.setMatrixAt(i, m);
    // 暖光片：贴在框外
    m.compose(
      new THREE.Vector3(win.x + win.nx * 0.16, win.y, win.z),
      new THREE.Quaternion(),
      new THREE.Vector3(1, win.h * 0.8, win.w * 0.8)
    );
    glows.setMatrixAt(i, m);
    const v = Math.min(1, win.lit * 1.7);
    c.copy(windowWarm).multiplyScalar(v);
    glows.setColorAt(i, c);
  });
  frames.instanceMatrix.needsUpdate = true;
  glows.instanceMatrix.needsUpdate = true;
  if (glows.instanceColor) glows.instanceColor.needsUpdate = true;
  group.add(frames, glows);

  /* ---------- 立面照明：只在墙脚与檐下做层次，不做整片洗亮 ---------- */
  const uplights = [];
  const up = (x, y, z, tx, ty, tz, intensity, angle = 0.75) => {
    const light = new THREE.SpotLight(PALETTE.warm, intensity, 26, angle, 0.92, 2);
    light.position.set(x, y, z);
    light.target.position.set(tx, ty, tz);
    scene.add(light);
    scene.add(light.target);
    uplights.push({ light, base: intensity });
    return light;
  };
  // 门厅正立面：两道墙脚窄光束把错动幕板与裂缝托出来，光斑压在墙面，不扫到屋顶
  up(-8.2, 0.3, 7.2, -8.2, 5.6, 0.9, 60, 0.72);
  up(8.2, 0.3, 7.2, 8.2, 5.6, 0.9, 60, 0.72);
  up(0, 0.3, 8.8, 0, 5.8, 0.9, 26, 0.5);
  // 两幅幕板各补一道贴墙窄光束，只洗到板上沿，读数出高低差，不整面平打
  up(-6.35, 0.3, 3.1, -6.35, 10.15, 1.75, 30, 0.3);
  up(6.5, 0.3, 2.9, 6.5, 8.75, 1.3, 26, 0.3);
  // 观众厅外弧墙脚两道窄光束
  up(-11.6, 0.25, -33.2, -9.9, 7.6, -33.6, 52);
  up(11.6, 0.25, -33.2, 9.9, 7.6, -33.6, 52);
  // 后台装卸雨棚下的一盏小灯
  up(D.cx, 4.9, B.z1 - 1.4, D.cx, 1.0, B.z1 - 2.4, 14);

  gold.build(group);
  goldDeep.build(group);

  // 新体量全部是静止件，按材质合批
  mergeStatic(group);

  // 外壳的夜读层次只跟外部灯光等级走：窗光与墙脚窄光束一起收放
  function setLevel(v) {
    const k = Math.max(0, Math.min(1, v));
    const s = 0.3 + 0.7 * k;
    for (const g of glowMats) g.mat.color.setHex(g.base).multiplyScalar(s);
    winMat.color.setScalar(s);
    for (const u of uplights) u.light.intensity = u.base * (0.3 + 0.7 * k);
  }
  setLevel(1);

  return { group, setLevel, windows: windows.length };
}
