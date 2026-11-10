import * as THREE from 'three';
import { BoxBatch, addGlowSprite, contactBatch, curtainGeometry, mergeStatic } from './utils.js';
import { OFFICE } from './plan.js';
import { PALETTE } from './materials.js';

/* ---------- 主理人办公室：后台西侧一层附属间 ----------
   后台西墙开一条短廊（x -6.2 → -8.6），尽头是磨砂玻璃门与小铜牌。
   办公室朝短廊开一扇内窗，站在窗后能看见演员进出与化妆区。
   陈设：写字桌、摊开的台本与排期本、留声机、立式钢琴与两只谱架、
   西墙的历年演出旧海报与手写履历。 */

const { X0, X1, Z0, Z1, DOOR_Z, DOOR_HALF, WIN_Z, WIN_HALF, FLOOR, CEIL } = OFFICE;
const CORR_X0 = OFFICE.CORR_X0;
const CORR_Z0 = OFFICE.CORR_Z0;
const CORR_Z1 = OFFICE.CORR_Z1;
const CORR_CEIL = OFFICE.CORR_CEIL;

const WALL = 0.16;             // 墙体厚度
const H = CEIL - FLOOR;        // 室内净高 3.0m
const DOOR_HEAD = FLOOR + 2.15;
const WIN_SILL = FLOOR + 1.0;  // 1.95
const WIN_TOP = FLOOR + 2.2;   // 3.15
const DOOR_S = DOOR_Z - DOOR_HALF;
const DOOR_N = DOOR_Z + DOOR_HALF;
const WIN_S = WIN_Z - WIN_HALF;
const WIN_N = WIN_Z + WIN_HALF;

function posterTexture(title, year, hue) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 352;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 40, 352);
  grd.addColorStop(0, `hsl(${hue}, 34%, 26%)`);
  grd.addColorStop(1, `hsl(${hue}, 30%, 10%)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 352);

  g.strokeStyle = 'rgba(228,192,132,0.8)';
  g.lineWidth = 5;
  g.strokeRect(10, 10, 236, 332);
  g.strokeStyle = 'rgba(228,192,132,0.3)';
  g.lineWidth = 1.5;
  g.strokeRect(19, 19, 218, 314);

  g.fillStyle = 'rgba(228,192,132,0.55)';
  g.fillRect(70, 42, 116, 2);
  for (let i = 0; i < 6; i++) {
    g.fillRect(78 + i * 20, 48, 6, 6);
  }

  g.fillStyle = '#eccd97';
  g.textAlign = 'center';
  g.font = '700 26px Georgia, "Times New Roman", serif';
  g.fillText(title, 128, 132);
  g.fillStyle = 'rgba(236,205,151,0.72)';
  g.font = 'italic 15px Georgia, serif';
  g.fillText('OPERA · GALA', 128, 156);
  g.fillStyle = 'rgba(236,205,151,0.6)';
  g.fillRect(96, 176, 64, 1.5);
  g.font = '400 16px Georgia, serif';
  g.fillText(year, 128, 202);

  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let i = 0; i < 8; i++) {
    g.beginPath();
    g.moveTo(30 + i * 25, 260);
    g.quadraticCurveTo(42 + i * 25, 300, 30 + i * 25, 330);
    g.lineTo(55 + i * 25, 330);
    g.quadraticCurveTo(43 + i * 25, 300, 55 + i * 25, 260);
    g.closePath();
    g.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function cvTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 320;
  const g = c.getContext('2d');
  g.fillStyle = '#e7d9bd';
  g.fillRect(0, 0, 256, 320);
  g.strokeStyle = 'rgba(150,124,88,0.5)';
  g.lineWidth = 2;
  g.strokeRect(14, 14, 228, 292);

  g.fillStyle = 'rgba(70,48,30,0.8)';
  g.save();
  g.translate(26, 50);
  g.rotate(-0.05);
  g.font = 'italic 700 19px Georgia, serif';
  g.fillText('履 历', 0, 0);
  g.restore();

  g.strokeStyle = 'rgba(64,44,28,0.6)';
  for (let r = 0; r < 12; r++) {
    const y = 86 + r * 18;
    const w = r === 0 ? 150 : 120 + ((r * 23) % 78);
    g.beginPath();
    g.lineWidth = 1.2;
    g.moveTo(30, y);
    g.bezierCurveTo(60, y - 2, 90 + ((r * 17) % 30), y + 2, 30 + w, y - 1);
    g.stroke();
  }

  g.strokeStyle = 'rgba(64,44,28,0.7)';
  g.beginPath();
  g.moveTo(150, 292);
  g.bezierCurveTo(170, 282, 190, 300, 214, 288);
  g.lineWidth = 2.2;
  g.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* 书架上的旧相片：深褐调、椭圆晕影、一个侧身剪影 */
function portraitTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 320;
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 0, 320);
  bg.addColorStop(0, '#b39a76');
  bg.addColorStop(0.55, '#8a7355');
  bg.addColorStop(1, '#4a3a29');
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 320);

  const vig = g.createRadialGradient(128, 138, 30, 128, 138, 168);
  vig.addColorStop(0, 'rgba(255,236,204,0.22)');
  vig.addColorStop(0.6, 'rgba(36,24,14,0.05)');
  vig.addColorStop(1, 'rgba(20,12,6,0.62)');
  g.fillStyle = vig;
  g.fillRect(0, 0, 256, 320);

  // 肩与头
  g.fillStyle = 'rgba(38,26,17,0.82)';
  g.beginPath();
  g.ellipse(128, 152, 44, 52, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(52, 320);
  g.quadraticCurveTo(70, 212, 128, 202);
  g.quadraticCurveTo(186, 212, 204, 320);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(214,190,156,0.32)';
  g.beginPath();
  g.ellipse(118, 146, 26, 34, -0.2, 0, Math.PI * 2);
  g.fill();

  // 相纸边与手写字
  g.strokeStyle = 'rgba(232,214,182,0.7)';
  g.lineWidth = 2;
  g.strokeRect(16, 16, 224, 288);
  g.fillStyle = 'rgba(44,30,18,0.75)';
  g.font = 'italic 15px Georgia, serif';
  g.textAlign = 'center';
  g.fillText('1962 · 首演夜', 128, 292);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* 主理人办公室：draw call 预算 30（静置机位实测 26 / 近景机位 25）。
   房间小、材料杂（海报、履历、台本各有贴图），合批只并同材质件。
   本轮新增打字机、书架上的相框、窗边丝绒帘与一张接触阴影。 */
export function buildOffice(scene, mats, quality) {
  const group = new THREE.Group();
  scene.add(group);
  const full = quality.tier === 'full';

  const wood = new BoxBatch(mats.wood, { castShadow: full });
  const gold = new BoxBatch(mats.gold);
  const goldDeep = new BoxBatch(mats.goldDeep);
  const brass = new BoxBatch(mats.brass);
  const velvet = new BoxBatch(mats.velvet);
  const paperMat = new THREE.MeshStandardMaterial({ color: 0xe9dcc0, roughness: 0.94, metalness: 0 });
  const inkMat = new THREE.MeshStandardMaterial({ color: 0x35281c, roughness: 0.86, metalness: 0 });
  const leatherMat = new THREE.MeshStandardMaterial({ color: 0x3d2317, roughness: 0.55, metalness: 0.05 });
  const paper = new BoxBatch(paperMat);
  const ink = new BoxBatch(inkMat);
  const leather = new BoxBatch(leatherMat);
  const machineMat = new THREE.MeshStandardMaterial({ color: 0x2b2723, roughness: 0.38, metalness: 0.55 });
  const machine = new BoxBatch(machineMat);
  const glows = [];
  const lights = [];

  const frostedMat = new THREE.MeshStandardMaterial({
    color: 0xb9c6cc,
    roughness: 0.62,
    metalness: 0,
    emissive: 0x3c464c,
    emissiveIntensity: 0.55,
    transparent: true,
    opacity: 0.62,
    side: THREE.DoubleSide,
    depthWrite: false
  });

  /* ---------- 房间壳体 ---------- */
  // 地面
  const floorGeo = new THREE.PlaneGeometry(X0 - X1, Z1 - Z0);
  floorGeo.rotateX(-Math.PI / 2);
  floorGeo.translate((X0 + X1) / 2, FLOOR, (Z0 + Z1) / 2);
  const floorMat = mats.wood.clone();
  floorMat.color.setHex(0x8a6a46);
  floorMat.map = mats.woodMap.clone();
  floorMat.map.repeat.set(3, 4);
  floorMat.map.needsUpdate = true;
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.receiveShadow = true;
  group.add(floor);
  // 地板铜线收边
  goldDeep.add(X0 - X1 - 0.5, 0.014, 0.03, (X0 + X1) / 2, FLOOR + 0.010, Z1 - 0.6);
  goldDeep.add(X0 - X1 - 0.5, 0.014, 0.03, (X0 + X1) / 2, FLOOR + 0.010, Z0 + 0.4);
  goldDeep.add(0.03, 0.014, Z1 - Z0 - 1.0, X1 + 0.6, FLOOR + 0.010, (Z0 + Z1) / 2);
  goldDeep.add(0.03, 0.014, Z1 - Z0 - 1.0, X0 - 0.5, FLOOR + 0.010, (Z0 + Z1) / 2);

  // 天花
  const ceilGeo = new THREE.PlaneGeometry(X0 - X1, Z1 - Z0);
  ceilGeo.rotateX(Math.PI / 2);
  ceilGeo.translate((X0 + X1) / 2, CEIL, (Z0 + Z1) / 2);
  group.add(new THREE.Mesh(ceilGeo, mats.ceiling));

  // 东墙（朝短廊）：门与内窗都在这一面
  const eastPanels = [
    [Z0, DOOR_S],
    [DOOR_N, WIN_S],
    [WIN_N, Z1]
  ];
  for (const [za, zb] of eastPanels) {
    if (zb - za < 0.02) continue;
    const seg = new THREE.Mesh(new THREE.BoxGeometry(WALL, H, zb - za), mats.plaster);
    seg.position.set(X0, FLOOR + H / 2, (za + zb) / 2);
    seg.receiveShadow = true;
    group.add(seg);
  }
  // 门上过梁
  const doorHead = new THREE.Mesh(new THREE.BoxGeometry(WALL, CEIL - DOOR_HEAD, DOOR_HALF * 2), mats.plaster);
  doorHead.position.set(X0, (CEIL + DOOR_HEAD) / 2, DOOR_Z);
  doorHead.receiveShadow = true;
  group.add(doorHead);
  // 窗下墙与窗上墙
  const sillWall = new THREE.Mesh(new THREE.BoxGeometry(WALL, WIN_SILL - FLOOR, WIN_HALF * 2), mats.plaster);
  sillWall.position.set(X0, (FLOOR + WIN_SILL) / 2, WIN_Z);
  sillWall.receiveShadow = true;
  group.add(sillWall);
  const winHead = new THREE.Mesh(new THREE.BoxGeometry(WALL, CEIL - WIN_TOP, WIN_HALF * 2), mats.plaster);
  winHead.position.set(X0, (CEIL + WIN_TOP) / 2, WIN_Z);
  winHead.receiveShadow = true;
  group.add(winHead);

  // 西、南、北三面实墙
  const west = new THREE.Mesh(new THREE.BoxGeometry(WALL, H, Z1 - Z0), mats.plaster);
  west.position.set(X1, FLOOR + H / 2, (Z0 + Z1) / 2);
  west.receiveShadow = true;
  group.add(west);
  for (const z of [Z0, Z1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(X0 - X1, H, WALL), mats.plaster);
    wall.position.set((X0 + X1) / 2, FLOOR + H / 2, z);
    wall.receiveShadow = true;
    group.add(wall);
  }

  // 墙脚线与顶角线：沿三面实墙连续，东墙在门窗处断开
  goldDeep.add(X0 - X1 - 0.1, 0.09, 0.09, (X0 + X1) / 2, FLOOR + 0.07, Z0 + WALL / 2 + 0.04);
  goldDeep.add(X0 - X1 - 0.1, 0.09, 0.09, (X0 + X1) / 2, FLOOR + 0.07, Z1 - WALL / 2 - 0.04);
  goldDeep.add(0.09, 0.09, Z1 - Z0 - 0.1, X1 + WALL / 2 + 0.04, FLOOR + 0.07, (Z0 + Z1) / 2);
  for (const [za, zb] of eastPanels) {
    if (zb - za < 0.02) continue;
    goldDeep.add(0.09, 0.09, zb - za, X0 - WALL / 2 - 0.04, FLOOR + 0.07, (za + zb) / 2);
  }
  // 顶角檐口
  gold.add(X0 - X1 - 0.12, 0.09, 0.1, (X0 + X1) / 2, CEIL - 0.06, Z0 + WALL / 2 + 0.05);
  gold.add(X0 - X1 - 0.12, 0.09, 0.1, (X0 + X1) / 2, CEIL - 0.06, Z1 - WALL / 2 - 0.05);
  gold.add(0.1, 0.09, Z1 - Z0 - 0.12, X1 + WALL / 2 + 0.05, CEIL - 0.06, (Z0 + Z1) / 2);

  /* ---------- 磨砂玻璃门与小铜牌 ----------
     门扇向短廊一侧敞开 66°，门洞保持通行；不再用整片玻璃封死洞口 */
  const doorPivot = new THREE.Group();
  doorPivot.position.set(X0, 0, DOOR_S);
  doorPivot.rotation.y = 1.15;
  const doorGlass = new THREE.Mesh(new THREE.BoxGeometry(0.05, DOOR_HEAD - FLOOR, DOOR_HALF * 2), frostedMat);
  doorGlass.position.set(0, (FLOOR + DOOR_HEAD) / 2, DOOR_HALF);
  doorPivot.add(doorGlass);
  group.add(doorPivot);
  // 门框与门梃
  for (const z of [DOOR_S, DOOR_N]) {
    wood.add(0.2, 2.22, 0.1, X0, FLOOR + 1.1, z);
    gold.add(0.22, 0.04, 0.12, X0, DOOR_HEAD + 0.01, z);
  }
  wood.add(0.22, 0.1, DOOR_HALF * 2 + 0.2, X0, DOOR_HEAD + 0.05, DOOR_Z);
  goldDeep.add(0.24, 0.06, DOOR_HALF * 2 + 0.26, X0, DOOR_HEAD + 0.13, DOOR_Z);
  // 铜把手与小铜牌（朝短廊一侧）
  brass.add(0.06, 0.14, 0.05, X0 + 0.07, FLOOR + 1.02, DOOR_N - 0.12);
  const plateMat = new THREE.MeshStandardMaterial({
    color: 0xc9a05a,
    metalness: 0.9,
    roughness: 0.32,
    emissive: 0x2a1a08,
    emissiveIntensity: 0.55
  });
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.15), plateMat);
  plaque.rotation.y = Math.PI / 2;
  plaque.position.set(X0 + WALL / 2 + 0.01, FLOOR + 1.62, DOOR_S - 0.2);
  group.add(plaque);

  /* ---------- 内窗（朝短廊，可见后台的进进出出） ---------- */
  const winGlass = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, WIN_TOP - WIN_SILL, WIN_HALF * 2),
    new THREE.MeshStandardMaterial({
      color: 0xc9d6dd,
      roughness: 0.12,
      metalness: 0.1,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  winGlass.position.set(X0, (WIN_SILL + WIN_TOP) / 2, WIN_Z);
  group.add(winGlass);
  // 窗台板与窗套
  wood.add(0.24, 0.07, WIN_HALF * 2 + 0.24, X0 - 0.04, WIN_SILL - 0.02, WIN_Z);
  goldDeep.add(0.26, 0.025, WIN_HALF * 2 + 0.28, X0 - 0.04, WIN_SILL + 0.03, WIN_Z);
  gold.add(0.16, 0.05, WIN_HALF * 2 + 0.2, X0, WIN_TOP + 0.02, WIN_Z);
  for (const z of [WIN_S, WIN_Z, WIN_N]) {
    gold.add(0.05, WIN_TOP - WIN_SILL, 0.035, X0 - 0.03, (WIN_SILL + WIN_TOP) / 2, z);
  }
  for (const z of [WIN_S, WIN_N]) {
    wood.add(0.18, WIN_TOP - WIN_SILL + 0.1, 0.09, X0, (WIN_SILL + WIN_TOP) / 2, z);
  }

  /* ---------- 短廊：后台西墙 → 办公室门 ---------- */
  const CW = X0 - CORR_X0;             // 2.4m
  const CLEN = CORR_Z1 - CORR_Z0;      // 2.7m
  const CH = CORR_CEIL - FLOOR;        // 2.5m
  const CMIDX = (CORR_X0 + X0) / 2;
  const CMIDZ = (CORR_Z0 + CORR_Z1) / 2;

  const corrFloorGeo = new THREE.PlaneGeometry(CW, CLEN);
  corrFloorGeo.rotateX(-Math.PI / 2);
  corrFloorGeo.translate(CMIDX, FLOOR, CMIDZ);
  const corrFloor = new THREE.Mesh(corrFloorGeo, floorMat);
  corrFloor.receiveShadow = true;
  group.add(corrFloor);
  goldDeep.add(CW - 0.3, 0.012, 0.035, CMIDX, FLOOR + 0.010, CORR_Z0 + 0.55);
  goldDeep.add(CW - 0.3, 0.012, 0.035, CMIDX, FLOOR + 0.010, CORR_Z1 - 0.55);

  const corrCeilGeo = new THREE.PlaneGeometry(CW, CLEN);
  corrCeilGeo.rotateX(Math.PI / 2);
  corrCeilGeo.translate(CMIDX, CORR_CEIL, CMIDZ);
  group.add(new THREE.Mesh(corrCeilGeo, mats.plasterDark));

  for (const z of [CORR_Z0, CORR_Z1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(CW, CH, WALL), mats.plaster);
    wall.position.set(CMIDX, FLOOR + CH / 2, z);
    wall.receiveShadow = true;
    group.add(wall);
    goldDeep.add(CW - 0.1, 0.09, 0.1, CMIDX, FLOOR + 0.07, z + (z > CMIDZ ? -1 : 1) * (WALL / 2 + 0.03));
    gold.add(CW - 0.14, 0.08, 0.1, CMIDX, CORR_CEIL - 0.05, z + (z > CMIDZ ? -1 : 1) * (WALL / 2 + 0.03));
  }
  // 走廊尽头的门洞套：与后台西墙的开洞对齐
  for (const z of [CORR_Z0, CORR_Z1]) {
    wood.add(0.2, CH + 0.08, 0.12, CORR_X0, FLOOR + CH / 2, z);
    gold.add(0.24, 0.05, 0.14, CORR_X0, CORR_CEIL + 0.02, z);
  }
  wood.add(0.22, 0.12, CLEN, CORR_X0, CORR_CEIL + 0.04, CMIDZ);
  goldDeep.add(0.26, 0.05, CLEN + 0.1, CORR_X0, CORR_CEIL + 0.12, CMIDZ);
  // 走廊侧一块小铜牌，朝后台
  brass.add(0.05, 0.2, 0.7, CORR_X0 + 0.12, CORR_CEIL - 0.32, CMIDZ - 0.55);

  /* ---------- 写字桌（居中偏东，面向门） ---------- */
  const deskX = -10.05;
  const deskZ = -64.55;
  const deskY = FLOOR + 0.75;
  wood.add(0.74, 0.055, 1.62, deskX, deskY, deskZ);
  goldDeep.add(0.77, 0.018, 1.65, deskX, deskY + 0.022, deskZ);
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      wood.add(0.055, deskY - FLOOR, 0.055, deskX + a * 0.3, FLOOR + (deskY - FLOOR) / 2, deskZ + b * 0.74);
    }
  }
  wood.add(0.6, 0.32, 0.42, deskX, FLOOR + 0.3, deskZ - 0.5);
  brass.add(0.05, 0.03, 0.12, deskX, FLOOR + 0.3, deskZ - 0.5);

  // 摊开的台本
  const scriptY = deskY + 0.08;
  for (const s of [-1, 1]) {
    paper.add(0.36, 0.012, 0.4, deskX - 0.06, scriptY, deskZ + 0.32 + s * 0.2, 0, 0.055 * s);
    for (let i = 0; i < 5; i++) {
      ink.add(0.26, 0.003, 0.010, deskX - 0.08 + (i % 2) * 0.01, scriptY + 0.009, deskZ + 0.32 + s * 0.2 - 0.14 + i * 0.065, 0, 0.055 * s);
    }
  }
  goldDeep.add(0.008, 0.014, 0.44, deskX - 0.06, scriptY, deskZ + 0.32);

  // 摊开的排期本
  const bookZ = deskZ - 0.32;
  leather.add(0.34, 0.026, 0.46, deskX + 0.16, scriptY - 0.01, bookZ);
  paper.add(0.30, 0.010, 0.42, deskX + 0.16, scriptY + 0.008, bookZ);
  ink.add(0.012, 0.004, 0.42, deskX + 0.16, scriptY + 0.016, bookZ);
  for (let i = 0; i < 6; i++) {
    ink.add(0.2, 0.003, 0.008, deskX + 0.16, scriptY + 0.017, bookZ - 0.15 + i * 0.06);
  }

  // 椅子
  const chairY = FLOOR + 0.45;
  leather.add(0.46, 0.07, 0.46, deskX - 0.62, chairY, deskZ);
  wood.add(0.07, 0.62, 0.46, deskX - 0.83, chairY + 0.32, deskZ);
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      wood.add(0.04, chairY - FLOOR, 0.04, deskX - 0.62 + a * 0.18, FLOOR + (chairY - FLOOR) / 2, deskZ + b * 0.18);
    }
  }

  /* ---------- 桌面小件：台灯、茶杯、钢笔 ---------- */
  const dlX = deskX + 0.24;
  const dlZ = deskZ - 0.6;
  brass.add(0.13, 0.02, 0.13, dlX, deskY + 0.035, dlZ);
  brass.add(0.018, 0.34, 0.018, dlX, deskY + 0.2, dlZ);
  const dlShade = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.12, 16, 1, true), mats.brass);
  dlShade.position.set(dlX - 0.05, deskY + 0.38, dlZ);
  dlShade.rotation.z = 0.52;
  group.add(dlShade);
  glows.push(addGlowSprite(mats, group, dlX - 0.07, deskY + 0.33, dlZ, 0.48, 0.4));
  const deskLight = new THREE.PointLight(0xffb877, 6.5, 3.0, 2);
  deskLight.position.set(dlX - 0.08, deskY + 0.36, dlZ);
  group.add(deskLight);
  lights.push({ light: deskLight, base: 6.5 });

  // 茶杯：一只矮杯加托盘，杯口还留着一点茶
  const cupX = deskX + 0.28;
  const cupZ = deskZ + 0.62;
  const cup = new THREE.Mesh(
    new THREE.CylinderGeometry(0.042, 0.036, 0.075, 14, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xd8cbb4, roughness: 0.55, side: THREE.DoubleSide })
  );
  cup.position.set(cupX, deskY + 0.045, cupZ);
  group.add(cup);
  const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.008, 16), mats.gold);
  saucer.position.set(cupX, deskY + 0.012, cupZ);
  group.add(saucer);
  const tea = new THREE.Mesh(
    new THREE.CircleGeometry(0.036, 14),
    new THREE.MeshStandardMaterial({ color: 0x3b2415, roughness: 0.35 })
  );
  tea.rotation.x = -Math.PI / 2;
  tea.position.set(cupX, deskY + 0.055, cupZ);
  group.add(tea);

  // 钢笔横在台本边上
  brass.add(0.14, 0.008, 0.012, deskX + 0.02, scriptY + 0.022, deskZ + 0.52, 0, 0.5);

  /* ---------- 北墙书架：零散台本与节目单 ---------- */
  const shX = -9.85;
  const shZ = Z1 - WALL / 2 - 0.27;
  wood.add(1.42, 0.04, 0.34, shX, FLOOR + 1.9, shZ);
  wood.add(1.42, 0.04, 0.34, shX, FLOOR + 0.06, shZ);
  for (const dx of [-0.69, 0.69]) {
    wood.add(0.04, 1.9, 0.34, shX + dx, FLOOR + 0.95, shZ);
  }
  for (const y of [0.5, 0.94, 1.38]) {
    wood.add(1.38, 0.035, 0.32, shX, FLOOR + y, shZ);
    let bx = shX - 0.6;
    for (let i = 0; i < 9; i++) {
      const w = 0.035 + (i % 3) * 0.012;
      const h = 0.2 + ((i * 7) % 5) * 0.016;
      const batch = i % 3 === 0 ? leather : i % 2 === 0 ? paper : ink;
      batch.add(w, h, 0.2, bx + w / 2, FLOOR + y + h / 2 + 0.02, shZ + 0.02);
      bx += w + 0.028;
    }
  }
  // 最上一层横放几本节目单
  for (let i = 0; i < 4; i++) {
    paper.add(0.24, 0.018, 0.17, shX - 0.3 + i * 0.19, FLOOR + 1.44 + i * 0.02, shZ + 0.02);
  }

  /* ---------- 窗台：一小盆常春藤 ---------- */
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.058, 0.11, 12),
    new THREE.MeshStandardMaterial({ color: 0x8a5438, roughness: 0.85 })
  );
  const potX = X0 - 0.11;
  const potZ = WIN_Z - WIN_HALF + 0.34;
  pot.position.set(potX, WIN_SILL + 0.06, potZ);
  group.add(pot);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f4a2c, roughness: 0.9, side: THREE.DoubleSide });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.2, 5), leafMat);
    leaf.position.set(potX + Math.cos(a) * 0.05, WIN_SILL + 0.2, potZ + Math.sin(a) * 0.05);
    leaf.rotation.set(Math.sin(a) * 0.5, 0, Math.cos(a) * 0.5);
    group.add(leaf);
  }

  /* ---------- 留声机（西北角） ---------- */
  const gpx = -11.88;
  const gpz = -62.55;
  wood.add(0.48, 0.72, 0.44, gpx, FLOOR + 0.36, gpz);
  goldDeep.add(0.52, 0.03, 0.48, gpx, FLOOR + 0.73, gpz);
  const turntable = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.018, 20), mats.brass);
  turntable.position.set(gpx, FLOOR + 0.76, gpz);
  group.add(turntable);
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.46, 18, 1, true), mats.gold);
  horn.position.set(gpx + 0.12, FLOOR + 1.08, gpz);
  horn.rotation.order = 'YXZ';
  horn.rotation.z = -0.75;
  horn.rotation.x = -0.35;
  group.add(horn);
  const hornBase = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.2, 10), mats.brass);
  hornBase.position.set(gpx + 0.06, FLOOR + 0.9, gpz);
  hornBase.rotation.z = 0.6;
  group.add(hornBase);

  /* ---------- 立式钢琴（靠西墙） ---------- */
  const pianoX = -12.06;
  const pianoZ = -65.4;
  wood.add(0.5, 1.16, 1.45, pianoX, FLOOR + 0.58, pianoZ);
  goldDeep.add(0.53, 0.05, 1.49, pianoX, FLOOR + 1.16, pianoZ);
  wood.add(0.26, 0.09, 1.36, pianoX + 0.32, FLOOR + 0.74, pianoZ);
  paper.add(0.2, 0.02, 1.28, pianoX + 0.32, FLOOR + 0.795, pianoZ);
  for (let i = 0; i < 9; i++) {
    ink.add(0.12, 0.03, 0.055, pianoX + 0.29, FLOOR + 0.815, pianoZ - 0.6 + i * 0.15);
  }
  leather.add(0.03, 0.42, 0.86, pianoX + 0.17, FLOOR + 1.36, pianoZ);
  gold.add(0.035, 0.03, 0.9, pianoX + 0.17, FLOOR + 1.58, pianoZ);
  // 谱板上摊着两本翻开的谱，别让那块立面读成一个空盒子
  for (const [dz, rz] of [[-0.2, 0.05], [0.17, -0.04]]) {
    paper.add(0.014, 0.3, 0.28, pianoX + 0.2, FLOOR + 1.33, pianoZ + dz, 0, 0, rz);
    for (let i = 0; i < 3; i++) {
      ink.add(0.004, 0.006, 0.2, pianoX + 0.209, FLOOR + 1.28 + i * 0.045, pianoZ + dz, 0, 0, rz);
    }
  }
  for (const s of [-1, 1]) {
    brass.add(0.14, 0.02, 0.09, pianoX + 0.56, FLOOR + 0.16, pianoZ + s * 0.16);
  }

  // 两只谱架
  for (const z of [-64.55, -63.75]) {
    const sx = -11.35;
    brass.add(0.025, 1.06, 0.025, sx, FLOOR + 0.53, z);
    brass.add(0.02, 0.02, 0.3, sx, FLOOR + 0.06, z);
    brass.add(0.3, 0.02, 0.02, sx, FLOOR + 0.06, z);
    const desk = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.28), leatherMat);
    desk.position.set(sx, FLOOR + 0.92, z);
    desk.rotation.set(0, -Math.PI / 2, 0);
    desk.rotation.x = -0.32;
    group.add(desk);
    gold.add(0.02, 0.025, 0.42, sx, FLOOR + 0.77, z);
  }

  /* ---------- 西墙旧海报 ---------- */
  const posters = [
    { title: 'LA TRAVIATA', year: '1962', hue: 352, z: -62.75 },
    { title: 'FIGARO', year: '1978', hue: 26, z: -63.55 },
    { title: 'CARMEN', year: '1991', hue: 205, z: -64.32 }
  ];
  for (const p of posters) {
    const tex = posterTexture(p.title, p.year, p.hue);
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.88, metalness: 0, emissive: 0x1a0e06, emissiveIntensity: 0.35 });
    const w = 0.44;
    const h = 0.6;
    const geo = new THREE.PlaneGeometry(w, h);
    geo.rotateY(Math.PI / 2);
    geo.translate(X1 + WALL / 2 + 0.012, FLOOR + 2.42, p.z);
    group.add(new THREE.Mesh(geo, m));
    for (const s of [-1, 1]) {
      gold.add(0.035, h + 0.08, 0.045, X1 + WALL / 2 + 0.02, FLOOR + 2.42, p.z + s * (w / 2 + 0.03));
    }
    for (const s of [-1, 1]) {
      gold.add(0.035, 0.045, w + 0.1, X1 + WALL / 2 + 0.02, FLOOR + 2.42 + s * (h / 2 + 0.03), p.z);
    }
  }

  // 手写履历：北墙
  const cvGeo = new THREE.PlaneGeometry(0.58, 0.72);
  cvGeo.rotateY(Math.PI);
  cvGeo.translate(-11.95, FLOOR + 2.38, Z1 - WALL / 2 - 0.012);
  group.add(new THREE.Mesh(cvGeo, new THREE.MeshStandardMaterial({ map: cvTexture(), roughness: 0.92, metalness: 0 })));
  for (const s of [-1, 1]) {
    goldDeep.add(0.05, 0.8, 0.035, -11.95 + s * 0.32, FLOOR + 2.38, Z1 - WALL / 2 - 0.02);
  }
  for (const s of [-1, 1]) {
    goldDeep.add(0.68, 0.05, 0.035, -11.95, FLOOR + 2.38 + s * 0.39, Z1 - WALL / 2 - 0.02);
  }

  // 窗边便签
  for (const [ly, lw] of [[2.32, 0.2], [2.08, 0.16]]) {
    paper.add(0.012, lw, lw * 0.9, X0 - 0.1, FLOOR + ly, -64.05);
    ink.add(0.004, 0.006, lw * 0.6, X0 - 0.11, FLOOR + ly, -64.05);
  }

  /* ---------- 打字台：书架与留声机之间 ---------- */
  const twX = -11.05;
  const twZ = -62.6;
  const twY = FLOOR + 0.72;
  wood.add(0.72, 0.045, 0.5, twX, twY, twZ);
  goldDeep.add(0.75, 0.016, 0.53, twX, twY + 0.026, twZ);
  for (const [dx, dz] of [[-0.32, -0.2], [0.32, -0.2], [-0.32, 0.2], [0.32, 0.2]]) {
    wood.add(0.045, twY - FLOOR, 0.045, twX + dx, FLOOR + (twY - FLOOR) / 2, twZ + dz);
  }
  // 机身、键盘、滚筒与吐出的纸
  machine.add(0.36, 0.05, 0.26, twX, twY + 0.05, twZ - 0.02);
  machine.add(0.32, 0.11, 0.2, twX, twY + 0.13, twZ - 0.05);
  for (let r = 0; r < (full ? 3 : 1); r++) {
    for (let c = 0; c < 7; c++) {
      paper.add(0.022, 0.008, 0.016, twX - 0.096 + c * 0.032, twY + 0.196, twZ - 0.005 + r * 0.028);
    }
  }
  const platen = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.34, 10), mats.brass);
  platen.rotation.z = Math.PI / 2;
  platen.position.set(twX, twY + 0.235, twZ - 0.11);
  group.add(platen);
  paper.add(0.22, 0.005, 0.19, twX, twY + 0.33, twZ - 0.16, 0, -0.22);
  brass.add(0.03, 0.03, 0.026, twX - 0.18, twY + 0.235, twZ - 0.11);
  brass.add(0.03, 0.03, 0.026, twX + 0.18, twY + 0.235, twZ - 0.11);
  machine.add(0.05, 0.02, 0.03, twX - 0.15, twY + 0.21, twZ - 0.02);
  machine.add(0.05, 0.02, 0.03, twX + 0.15, twY + 0.21, twZ - 0.02);
  // 旁边一叠纸与一只笔
  paper.add(0.24, 0.035, 0.3, twX + 0.24, twY + 0.045, twZ - 0.04);
  brass.add(0.13, 0.008, 0.012, twX + 0.24, twY + 0.068, twZ + 0.02, 0, 0.4);
  // 一张矮凳
  leather.add(0.34, 0.06, 0.3, twX, FLOOR + 0.44, twZ + 0.42);
  for (const [dx, dz] of [[-0.13, -0.11], [0.13, -0.11], [-0.13, 0.11], [0.13, 0.11]]) {
    wood.add(0.035, 0.42, 0.035, twX + dx, FLOOR + 0.21, twZ + 0.42 + dz);
  }

  /* ---------- 书架顶的相框 ---------- */
  const photoMat = new THREE.MeshStandardMaterial({ map: portraitTexture(), roughness: 0.9, metalness: 0 });
  for (const [fx, fw, fh] of [[-10.16, 0.2, 0.26], [-9.78, 0.16, 0.21]]) {
    const fy = FLOOR + 1.92 + fh / 2 + 0.005;
    const fz = shZ + 0.03;
    const photo = new THREE.Mesh(new THREE.PlaneGeometry(fw - 0.03, fh - 0.03), photoMat);
    photo.position.set(fx, fy, fz + 0.008);
    group.add(photo);
    brass.add(fw, 0.014, 0.014, fx, fy + fh / 2, fz);
    brass.add(fw, 0.014, 0.014, fx, fy - fh / 2, fz);
    brass.add(0.014, fh, 0.014, fx - fw / 2, fy, fz);
    brass.add(0.014, fh, 0.014, fx + fw / 2, fy, fz);
    brass.add(0.02, 0.14, 0.012, fx, fy + 0.02, fz - 0.012);
  }

  /* ---------- 窗边丝绒帘：两根挂杆、两幅帘与铜束带 ---------- */
  const rodGeo = new THREE.CylinderGeometry(0.014, 0.014, WIN_HALF * 2 + 0.5, 8).rotateX(Math.PI / 2)
    .translate(X0 - 0.1, FLOOR + 2.42, WIN_Z);
  group.add(new THREE.Mesh(rodGeo, mats.brass));
  for (const s of [-1, 1]) {
    const finial = new THREE.SphereGeometry(0.028, 8, 6).translate(X0 - 0.1, FLOOR + 2.42, WIN_Z + s * (WIN_HALF + 0.25));
    group.add(new THREE.Mesh(finial, mats.brass));
    const panel = curtainGeometry(0.34, 2.32, full ? 5 : 3, 0.05);
    panel.rotateY(-Math.PI / 2);
    panel.translate(X0 - 0.1, FLOOR + 1.2, WIN_Z + s * (WIN_HALF + 0.1));
    group.add(new THREE.Mesh(panel, mats.velvet));
    goldDeep.add(0.08, 0.04, 0.12, X0 - 0.14, FLOOR + 0.86, WIN_Z + s * (WIN_HALF + 0.1));
  }

  /* ---------- 接触阴影：桌、椅、书架、打字台与琴脚 ---------- */
  contactBatch(group, mats, [
    [deskX, FLOOR + 0.006, deskZ, 0.95, 1.85],
    [deskX - 0.62, FLOOR + 0.006, deskZ, 0.6, 0.6],
    [shX, FLOOR + 0.006, shZ, 1.55, 0.5],
    [-11.05, FLOOR + 0.006, -62.48, 0.9, 0.95],
    [gpx, FLOOR + 0.006, gpz, 0.62, 0.6],
    [pianoX, FLOOR + 0.006, pianoZ, 0.7, 1.6],
    [-11.35, FLOOR + 0.006, -64.55, 0.4, 0.4],
    [-11.35, FLOOR + 0.006, -63.75, 0.4, 0.4]
  ], 0.34);

  /* ---------- 地毯 ---------- */
  const rugGeo = new THREE.PlaneGeometry(2.2, 3.0);
  rugGeo.rotateX(-Math.PI / 2);
  rugGeo.translate(-10.4, FLOOR + 0.013, -64.5);
  const rug = new THREE.Mesh(rugGeo, mats.carpet);
  rug.receiveShadow = true;
  group.add(rug);

  /* ---------- 吊灯与灯光 ---------- */
  const lampX = -10.5;
  const lampZ = -64.4;
  brass.add(0.02, CEIL - 3.28, 0.02, lampX, (CEIL + 3.28) / 2, lampZ);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.18, 18, 1, true), mats.brass);
  shade.position.set(lampX, 3.2, lampZ);
  group.add(shade);
  // 吊灯只留灯罩，不点：房间里只剩台灯与窗光
  glows.push(addGlowSprite(mats, group, lampX, 3.12, lampZ, 0.55, 0.16));

  // 短廊尽头的一盏灯，把门与铜牌照亮
  const corrLamp = new THREE.PointLight(PALETTE.warm, 8, 5.2, 2);
  corrLamp.position.set(-7.4, 3.0, -64.7);
  group.add(corrLamp);
  lights.push({ light: corrLamp, base: 8 });
  glows.push(addGlowSprite(mats, group, -8.35, 2.5, -64.7, 0.42, 0.42));

  // 窗边补一盏偏冷的光，暗示走廊另一头的后台
  const winLight = new THREE.PointLight(0xcfd8ff, 3.5, 5, 2);
  winLight.position.set(X0 - 0.35, 2.5, WIN_Z);
  group.add(winLight);
  lights.push({ light: winLight, base: 3.5 });

  /* ---------- 合并 ---------- */
  wood.build(group);
  gold.build(group);
  goldDeep.build(group);
  brass.build(group);
  paper.build(group);
  ink.build(group);
  leather.build(group);
  machine.build(group);
  velvet.build(group);

  let level = 1;
  function setLevel(v) {
    level = v;
    lights.forEach(({ light, base }) => { light.intensity = base * v; });
    glows.forEach((g) => { g.material.opacity = (g.userData.baseOpacity || 0.5) * (0.25 + 0.75 * v); });
    frostedMat.emissiveIntensity = 0.55 * (0.35 + 0.65 * v);
  }
  setLevel(1);

  mergeStatic(group);

  return { group, setLevel, get level() { return level; } };
}
