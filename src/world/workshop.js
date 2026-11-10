import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BoxBatch, addGlowSprite, contactBatch, mergeStatic } from './utils.js';
import { WORKSHOP } from './plan.js';
import { PALETTE } from './materials.js';

/* ============================================================
   创意工坊：后台东侧的大开间
   北半间排练（钢琴、谱架、落地镜、走位标记、折叠椅、排期板），
   南半间绘景（立起的大画布、脚手架、颜料桶、木工台、钉在墙上的图纸），
   中间用半高移动隔屏与一排架子分开，人可从缝里穿行。
   ============================================================ */

function canvasTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// 绷好的画布：亚麻底、几笔炭条起稿
function primedCanvasTexture() {
  const c = makeCanvas(768, 768);
  const g = c.getContext('2d');
  g.fillStyle = '#cfc3ac';
  g.fillRect(0, 0, 768, 768);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(90,74,56,${0.05 + Math.random() * 0.09})`;
    g.fillRect(Math.random() * 768, Math.random() * 768, 1 + Math.random() * 2, 1);
  }
  g.strokeStyle = 'rgba(42,34,28,0.55)';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(150, 590);
  g.bezierCurveTo(260, 340, 420, 470, 560, 300);
  g.stroke();
  g.strokeStyle = 'rgba(52,40,30,0.34)';
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(384, 110);
  g.lineTo(384, 690);
  g.stroke();
  g.strokeStyle = 'rgba(70,55,44,0.28)';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(420, 300, 140, 0.2, 2.6);
  g.stroke();
  g.fillStyle = 'rgba(60,48,38,0.2)';
  g.fillRect(150, 610, 420, 16);
  return canvasTexture(c);
}

// 立在架上的大画布：底色压深、铺了大色块，近看能读出画到一半的层次
function bigCanvasTexture() {
  const c = makeCanvas(768, 768);
  const g = c.getContext('2d');
  g.fillStyle = '#8b7f6a';
  g.fillRect(0, 0, 768, 768);
  for (let i = 0; i < 3200; i++) {
    g.fillStyle = `rgba(58,46,34,${0.05 + Math.random() * 0.11})`;
    g.fillRect(Math.random() * 768, Math.random() * 768, 1 + Math.random() * 2.5, 1);
  }

  // 底色：左侧赭石、右上冷灰，笔触边缘留白
  g.fillStyle = 'rgba(122,70,44,0.34)';
  g.beginPath();
  g.moveTo(60, 430);
  g.bezierCurveTo(150, 300, 330, 350, 400, 520);
  g.bezierCurveTo(320, 690, 120, 680, 60, 560);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(76,88,88,0.26)';
  g.beginPath();
  g.ellipse(548, 250, 190, 150, -0.18, 0, Math.PI * 2);
  g.fill();

  // 炭条定形：头、肩、下垂的手臂
  g.strokeStyle = 'rgba(26,20,16,0.86)';
  g.lineWidth = 8;
  g.beginPath();
  g.arc(356, 236, 74, 0.35, Math.PI * 1.92);
  g.stroke();
  g.lineWidth = 9;
  g.beginPath();
  g.moveTo(282, 320);
  g.bezierCurveTo(300, 366, 300, 400, 286, 438);
  g.moveTo(430, 320);
  g.bezierCurveTo(414, 370, 416, 404, 428, 448);
  g.stroke();
  g.beginPath();
  g.moveTo(356, 312);
  g.bezierCurveTo(356, 400, 340, 520, 318, 610);
  g.moveTo(356, 350);
  g.bezierCurveTo(410, 420, 470, 462, 540, 470);
  g.moveTo(340, 360);
  g.bezierCurveTo(270, 430, 210, 470, 148, 486);
  g.stroke();
  g.strokeStyle = 'rgba(30,24,20,0.5)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(150, 590);
  g.bezierCurveTo(260, 340, 420, 470, 560, 300);
  g.stroke();

  // 定位网格、水平基准与边缘色标
  g.strokeStyle = 'rgba(240,230,210,0.16)';
  g.lineWidth = 1.5;
  for (const y of [190, 384, 578]) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(768, y);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(384, 0);
  g.lineTo(384, 768);
  g.stroke();
  const dab = ['#7a4a30', '#b08a52', '#4c5858', '#2f2a24'];
  dab.forEach((col, i) => {
    g.fillStyle = col;
    g.fillRect(78 + i * 34, 706, 26, 18);
  });

  // 四角胶带
  g.fillStyle = 'rgba(214,198,160,0.6)';
  g.fillRect(0, 0, 52, 26);
  g.fillRect(716, 742, 52, 26);
  return canvasTexture(c);
}

// 钉在墙上的工作图：剖面线 + 尺寸线
function draftingTexture() {
  const c = makeCanvas(384, 512);
  const g = c.getContext('2d');
  g.fillStyle = '#d4c9b3';
  g.fillRect(0, 0, 384, 512);
  g.strokeStyle = 'rgba(50,42,34,0.55)';
  g.lineWidth = 1.5;
  g.strokeRect(34, 34, 316, 444);
  g.strokeRect(64, 84, 256, 200);
  for (let i = 0; i < 7; i++) {
    g.beginPath();
    g.moveTo(64, 110 + i * 24);
    g.lineTo(320, 110 + i * 24);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(64, 330);
  g.lineTo(180, 420);
  g.lineTo(320, 330);
  g.stroke();
  g.strokeStyle = 'rgba(120,60,40,0.5)';
  g.beginPath();
  g.moveTo(64, 470);
  g.lineTo(320, 470);
  g.stroke();
  g.beginPath();
  g.moveTo(64, 462);
  g.lineTo(64, 478);
  g.moveTo(320, 462);
  g.lineTo(320, 478);
  g.stroke();
  return canvasTexture(c);
}

// 排练排期板：方格 + 便利贴
function scheduleTexture() {
  const c = makeCanvas(640, 420);
  const g = c.getContext('2d');
  g.fillStyle = '#241d18';
  g.fillRect(0, 0, 640, 420);
  g.strokeStyle = 'rgba(210,190,160,0.18)';
  g.lineWidth = 1;
  for (let i = 1; i < 7; i++) {
    g.beginPath();
    g.moveTo(0, i * 60);
    g.lineTo(640, i * 60);
    g.stroke();
    g.beginPath();
    g.moveTo(i * 91, 0);
    g.lineTo(i * 91, 420);
    g.stroke();
  }
  const notes = [
    ['#c9a06a', 52, 46, 150, 74],
    ['#b9784a', 232, 106, 160, 70],
    ['#d2b98a', 420, 52, 144, 66],
    ['#9d7a56', 250, 240, 162, 62],
    ['#c7a374', 78, 278, 130, 58]
  ];
  g.fillStyle = 'rgba(226,212,190,0.82)';
  g.font = '600 30px Georgia, "Times New Roman", serif';
  g.fillText('排练日程', 36, 40);
  g.fillStyle = 'rgba(226,212,190,0.5)';
  g.font = '400 17px Georgia, "Times New Roman", serif';
  g.fillText('WEEK 45 · 主排练厅', 36, 68);

  // 便利贴先铺，再把日程压在上面，字才不会被盖住
  for (const [color, x, y, w, h] of notes) {
    if (y < 100) continue;
    g.fillStyle = color;
    g.globalAlpha = 0.5;
    g.fillRect(x, y, w, h);
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(40,30,20,0.4)';
    g.strokeRect(x, y, w, h);
    g.fillStyle = 'rgba(40,30,20,0.5)';
    for (let r = 0; r < 3; r++) g.fillRect(x + 10, y + 16 + r * 13, w * (0.35 + Math.random() * 0.4), 1.4);
  }

  const rows = [
    ['11.02', '第一幕 走位'],
    ['11.03', '音乐排练 · 钢琴'],
    ['11.04', '第二幕 走位'],
    ['11.05', '带景连排'],
    ['11.06', '修景 · 换景'],
    ['11.07', '休息']
  ];
  g.font = '400 18px Georgia, "Times New Roman", serif';
  rows.forEach(([day, text], i) => {
    const y = 118 + i * 46;
    g.fillStyle = 'rgba(24,18,14,0.7)';
    g.fillRect(6, y - 20, 628, 26);
    g.fillStyle = 'rgba(226,212,190,0.55)';
    g.fillText(day, 14, y);
    g.fillStyle = 'rgba(238,226,205,0.9)';
    g.fillText(text, 104, y);
  });
  return canvasTexture(c);
}

// 地面颜料痕迹：一张透明底的点状图，贴到地上当污迹
function splatterTexture() {
  const c = makeCanvas(256, 256);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 90; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.pow(Math.random(), 0.6) * 108;
    const s = 1 + Math.random() * 7 * (1 - r / 120);
    g.globalAlpha = 0.35 + Math.random() * 0.5;
    g.beginPath();
    g.ellipse(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, s, s * (0.6 + Math.random() * 0.6), a, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* 创意工坊：draw call 预算 32（静置机位实测 22 / 近景机位 32）。
   材料最多的一间（画布、图纸、排期板、地胶污迹都是独立贴图），
   能并的只有木作、金作与器皿，别为凑数字去动这些贴图件。
   本轮新增靠墙画板（复用画布/图纸材质）、把杆与工作台草图，另加一张接触阴影。 */
export function buildWorkshop(scene, mats, quality) {
  const full = quality.tier === 'full';
  const group = new THREE.Group();
  scene.add(group);

  const { X0, X1, Z0, Z1, FLOOR, CEIL, STAGE_DOOR_X0, STAGE_DOOR_X1, BACK_DOOR_Z0, BACK_DOOR_Z1, WALL, DOOR_TOP } = WORKSHOP;
  const W = X1 - X0;
  const D = Z0 - Z1;
  const MIDX = (X0 + X1) / 2;
  const MIDZ = (Z0 + Z1) / 2;
  const H = CEIL - FLOOR;

  const wallMat = mats.plaster.clone();
  wallMat.color.setHex(0x3d2c22);
  wallMat.roughness = 0.94;
  const wallDark = mats.plaster.clone();
  wallDark.color.setHex(0x2a1d17);
  const ceilMat = mats.ceiling.clone();
  ceilMat.color.setHex(0x2b1e17);

  const wood = new BoxBatch(mats.wood);
  const gold = new BoxBatch(mats.gold);
  const goldDeep = new BoxBatch(mats.goldDeep);
  const trim = new BoxBatch(wallDark);
  const glows = [];
  const lights = [];

  /* ---------- 地面与顶棚 ---------- */
  const floorMat = mats.wood.clone();
  floorMat.color.setHex(0x5a4531);
  floorMat.map = mats.woodMap.clone();
  floorMat.map.repeat.set(4, 5);
  floorMat.map.needsUpdate = true;
  // 地面向北多铺 0.55m，一直伸到舞台门槛下，门口不出现空档
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D + 0.55), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(MIDX, FLOOR, MIDZ + 0.275);
  floor.receiveShadow = true;
  group.add(floor);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(MIDX, CEIL, MIDZ);
  group.add(ceil);

  // 顶棚次梁：三根，把 4.2m 的净高分成可读的几段
  for (const z of [-59.4, -61.9, -64.4]) {
    wood.add(W, 0.18, 0.16, MIDX, CEIL - 0.12, z);
  }

  /* ---------- 四壁 ----------
     北墙（z=Z0）留侧台门洞，西墙（x=X0）留通后台的门洞，
     其余两壁整片；墙脚线与顶线连续，不被门洞以外的构件打断。 */
  const wallThick = WALL;
  // 南墙
  const south = new THREE.Mesh(new THREE.BoxGeometry(W, H, wallThick), wallMat);
  south.position.set(MIDX, FLOOR + H / 2, Z1 + wallThick / 2);
  south.receiveShadow = true;
  group.add(south);
  // 东墙
  const east = new THREE.Mesh(new THREE.BoxGeometry(wallThick, H, D), wallMat);
  east.position.set(X1 - wallThick / 2, FLOOR + H / 2, MIDZ);
  east.receiveShadow = true;
  group.add(east);

  // 北墙：门洞两侧 + 过梁
  const northH = H;
  for (const [xa, xb] of [[X0, STAGE_DOOR_X0], [STAGE_DOOR_X1, X1]]) {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(xb - xa, northH, wallThick), wallMat);
    seg.position.set((xa + xb) / 2, FLOOR + northH / 2, Z0 - wallThick / 2);
    seg.receiveShadow = true;
    group.add(seg);
  }
  const northHeader = new THREE.Mesh(
    new THREE.BoxGeometry(STAGE_DOOR_X1 - STAGE_DOOR_X0, CEIL - DOOR_TOP, wallThick),
    wallMat
  );
  northHeader.position.set((STAGE_DOOR_X0 + STAGE_DOOR_X1) / 2, (CEIL + DOOR_TOP) / 2, Z0 - wallThick / 2);
  northHeader.receiveShadow = true;
  group.add(northHeader);

  // 西墙内衬：结构墙在后台一侧，这层只给工坊一个完整墙面，门洞对齐
  for (const [za, zb] of [[Z0, BACK_DOOR_Z1], [BACK_DOOR_Z0, Z1]]) {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.05, H, Math.abs(za - zb)), wallMat);
    seg.position.set(X0 + wallThick / 2 + 0.025, FLOOR + H / 2, (za + zb) / 2);
    seg.receiveShadow = true;
    group.add(seg);
  }
  const westHeader = new THREE.Mesh(new THREE.BoxGeometry(0.05, CEIL - DOOR_TOP, BACK_DOOR_Z1 - BACK_DOOR_Z0), wallMat);
  westHeader.position.set(X0 + wallThick / 2 + 0.025, (CEIL + DOOR_TOP) / 2, (BACK_DOOR_Z0 + BACK_DOOR_Z1) / 2);
  group.add(westHeader);

  // 门套：北门（侧台来的口）与西门（去后台的口），木竖梃 + 深金过梁
  for (const [x, z] of [[STAGE_DOOR_X0, Z0], [STAGE_DOOR_X1, Z0]]) {
    wood.add(0.16, 2.5, 0.24, x, FLOOR + 1.25, z);
    goldDeep.add(0.18, 0.06, 0.28, x, FLOOR + 2.54, z);
  }
  wood.add(STAGE_DOOR_X1 - STAGE_DOOR_X0 + 0.36, 0.18, 0.26, (STAGE_DOOR_X0 + STAGE_DOOR_X1) / 2, DOOR_TOP + 0.09, Z0);
  for (const z of [BACK_DOOR_Z0, BACK_DOOR_Z1]) {
    wood.add(0.24, 2.5, 0.16, X0, FLOOR + 1.25, z);
    goldDeep.add(0.28, 0.06, 0.18, X0, FLOOR + 2.54, z);
  }
  wood.add(0.26, 0.18, BACK_DOOR_Z1 - BACK_DOOR_Z0 + 0.36, X0, DOOR_TOP + 0.09, (BACK_DOOR_Z0 + BACK_DOOR_Z1) / 2);

  // 墙脚线与顶角线：绕四壁一圈，门洞处断开
  trim.add(W, 0.10, 0.06, MIDX, FLOOR + 0.05, Z1 - 0.03);
  trim.add(W, 0.10, 0.06, MIDX, FLOOR + 0.05, Z0 + 0.03);
  trim.add(W - 0.1, 0.06, 0.02, MIDX, FLOOR + 0.03, Z1 - 0.02);
  trim.add(0.06, 0.10, D, X1 - 0.03, FLOOR + 0.05, MIDZ);
  // 顶角线
  trim.add(W, 0.10, 0.06, MIDX, CEIL - 0.06, Z1 + 0.09);
  trim.add(W, 0.10, 0.06, MIDX, CEIL - 0.06, Z0 - 0.09);
  trim.add(0.06, 0.10, D, X1 - 0.09, CEIL - 0.06, MIDZ);
  trim.add(0.06, 0.10, D, X0 + 0.09, CEIL - 0.06, MIDZ);

  /* ---------- 半高隔屏 + 一排架子：可穿行的分界 ---------- */
  const screenMat = new THREE.MeshStandardMaterial({
    color: 0x7a6248,
    roughness: 0.86,
    metalness: 0.02
  });
  const screens = new BoxBatch(screenMat);
  // 三片半高屏风错位摆放，两侧与中间留 0.65m 以上的通行缝，视线可穿过
  for (const [x, z] of [[7.0, -62.0], [8.75, -62.18], [10.5, -61.96]]) {
    screens.add(1.1, 1.40, 0.055, x, FLOOR + 0.78, z);
    screens.add(1.12, 0.05, 0.12, x, FLOOR + 1.50, z);
    for (const dx of [-0.46, 0.46]) {
      screens.add(0.05, 0.22, 0.22, x + dx, FLOOR + 0.11, z);
    }
  }
  screens.build(group);

  // 架子：靠东侧的一段，四层开架
  const shelfX = 12.0;
  for (const y of [1.3, 1.7, 2.1, 2.5]) {
    wood.add(0.55, 0.035, 1.5, shelfX, FLOOR + y, -62.05);
  }
  for (const z of [-62.8, -61.3]) {
    wood.add(0.55, 1.65, 0.03, shelfX, FLOOR + 0.82, z);
  }
  wood.add(0.58, 0.04, 1.58, shelfX, FLOOR + 1.68, -62.05);

  /* ---------- 北半间：排练 ---------- */
  // 立式钢琴：靠西墙，键盘朝室内
  wood.add(0.55, 1.22, 1.5, 6.78, FLOOR + 0.61, -59.8);
  goldDeep.add(0.58, 0.04, 1.52, 6.78, FLOOR + 1.23, -59.8);
  // 键盘与谱板
  const ivory = new THREE.MeshStandardMaterial({ color: 0xd8cbb0, roughness: 0.42, metalness: 0.02 });
  const keys = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.055, 1.12), ivory);
  keys.position.set(7.11, FLOOR + 0.72, -59.8);
  group.add(keys);
  const keyBar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 1.12), new THREE.MeshStandardMaterial({ color: 0x171310, roughness: 0.65 }));
  keyBar.position.set(7.2, FLOOR + 0.62, -59.8);
  group.add(keyBar);
  wood.add(0.03, 0.42, 1.04, 6.95, FLOOR + 1.0, -59.8, 0, -0.12);

  // 两只谱架，各自夹着一份谱
  const sheetMat = new THREE.MeshStandardMaterial({ color: 0xd9cdb4, roughness: 0.92 });
  for (const [x, z, ry] of [[8.5, -60.7, 0.5], [9.4, -60.1, -0.35]]) {
    gold.add(0.035, 1.24, 0.035, x, FLOOR + 0.62, z);
    gold.add(0.03, 0.03, 0.42, x, FLOOR + 0.02, z, ry);
    gold.add(0.03, 0.03, 0.42, x, FLOOR + 0.02, z + 0, ry, 0, 0.6);
    wood.add(0.62, 0.46, 0.035, x, FLOOR + 1.24, z, ry, -0.35);
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.32), sheetMat);
    sheet.position.set(x + Math.sin(ry) * 0.03, FLOOR + 1.26, z + Math.cos(ry) * 0.03);
    sheet.rotation.y = ry;
    sheet.rotation.x = -0.35;
    group.add(sheet);
  }

  // 落地镜：靠东墙，略向室内转；没有环境贴图，用一张模糊的室内反光读出“镜面”
  const mirrorCanvas = makeCanvas(256, 512);
  const mg = mirrorCanvas.getContext('2d');
  const mirrorGrad = mg.createLinearGradient(0, 0, 0, 512);
  mirrorGrad.addColorStop(0, '#8d7654');
  mirrorGrad.addColorStop(0.42, '#5c4a35');
  mirrorGrad.addColorStop(0.75, '#33261b');
  mirrorGrad.addColorStop(1, '#1c140f');
  mg.fillStyle = mirrorGrad;
  mg.fillRect(0, 0, 256, 512);
  const glowGrad = mg.createRadialGradient(150, 120, 10, 150, 120, 150);
  glowGrad.addColorStop(0, 'rgba(255,214,168,0.32)');
  glowGrad.addColorStop(1, 'rgba(255,214,168,0)');
  mg.fillStyle = glowGrad;
  mg.fillRect(0, 0, 256, 320);
  const mirrorMat = new THREE.MeshStandardMaterial({
    map: canvasTexture(mirrorCanvas),
    roughness: 0.18,
    metalness: 0.35
  });
  wood.add(0.12, 2.12, 1.14, X1 - 0.16, FLOOR + 1.09, -60.1);
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.92), mirrorMat);
  mirror.rotation.y = -Math.PI / 2 - 0.12;
  mirror.position.set(X1 - 0.23, FLOOR + 1.08, -60.1);
  group.add(mirror);

  // 走位标记：地胶上的十字与箭头
  const tapeMat = new THREE.MeshBasicMaterial({ color: 0xb7b2a2, transparent: true, opacity: 0.4 });
  const tapeGeos = [];
  for (const [w, d, x, z] of [
    [0.06, 3.4, 9.4, -60.6],
    [3.4, 0.06, 9.4, -60.6],
    [0.06, 1.2, 8.0, -59.6],
    [1.2, 0.06, 8.0, -59.6],
    [0.06, 1.0, 10.8, -61.5]
  ]) {
    const geo = new THREE.PlaneGeometry(w, d);
    geo.rotateX(-Math.PI / 2);
    geo.translate(x, FLOOR + 0.008, z);
    tapeGeos.push(geo);
  }
  const tape = new THREE.Mesh(mergeGeometries(tapeGeos, false), tapeMat);
  tape.renderOrder = 2;
  group.add(tape);

  // 折叠椅：三把，围成读剧的小圈（座面 + 四条腿 + 靠背）
  const velvet = new BoxBatch(mats.velvet);
  for (const [x, z, ry] of [[7.9, -61.4, 0.35], [8.7, -61.5, -0.15], [10.1, -60.4, -1.0]]) {
    const cos = Math.cos(ry);
    const sin = Math.sin(ry);
    wood.add(0.44, 0.05, 0.42, x, FLOOR + 0.44, z, ry);
    velvet.add(0.41, 0.06, 0.39, x, FLOOR + 0.475, z, ry);
    for (const ox of [-0.17, 0.17]) {
      for (const oz of [-0.16, 0.16]) {
        wood.add(0.035, 0.43, 0.035, x + ox * cos + oz * sin, FLOOR + 0.215, z - ox * sin + oz * cos);
      }
    }
    const bx = x - 0.2 * sin;
    const bz = z - 0.2 * cos;
    wood.add(0.04, 0.44, 0.04, bx, FLOOR + 0.66, bz, ry);
    velvet.add(0.4, 0.34, 0.05, bx, FLOOR + 0.78, bz, ry);
  }

  // 把杆：北墙西段，双层木杆 + 铜托，长度避开舞台门
  // 北墙真正露在室内的是外壳石墙（z=-58.58），工坊自己的墙皮被它挡在后面；
  // z 向北增大，所以离墙要减。杆离石墙 12cm，铜托再往里贴到墙面。
  const BARRE_Z = Z0 - 0.40;
  for (const [y, len] of [[0.62, 2.32], [0.96, 2.32]]) {
    wood.add(len, 0.055, 0.055, 7.72, FLOOR + y, BARRE_Z);
    goldDeep.add(0.05, 0.075, 0.16, 6.66, FLOOR + y, BARRE_Z + 0.06);
    goldDeep.add(0.05, 0.075, 0.16, 8.78, FLOOR + y, BARRE_Z + 0.06);
  }
  for (const x of [6.72, 7.72, 8.72]) {
    goldDeep.add(0.045, 0.9, 0.12, x, FLOOR + 0.48, BARRE_Z + 0.06);
  }
  gold.add(0.06, 0.06, 0.06, 6.56, FLOOR + 0.96, BARRE_Z);
  gold.add(0.06, 0.06, 0.06, 8.88, FLOOR + 0.96, BARRE_Z);

  // 排期板：钉在北墙东段
  const scheduleTex = scheduleTexture();
  const scheduleMat = new THREE.MeshStandardMaterial({
    map: scheduleTex,
    emissiveMap: scheduleTex,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.28,
    roughness: 0.9
  });
  const schedule = new THREE.Mesh(new THREE.PlaneGeometry(1.32, 0.9), scheduleMat);
  schedule.position.set(11.35, FLOOR + 2.0, Z0 - 0.30);
  schedule.rotation.y = Math.PI;
  group.add(schedule);
  wood.add(1.44, 0.06, 0.06, 11.35, FLOOR + 2.47, Z0 - 0.33);
  wood.add(1.44, 0.06, 0.06, 11.35, FLOOR + 1.53, Z0 - 0.33);
  for (const dx of [-0.69, 0.69]) {
    wood.add(0.06, 1.0, 0.06, 11.35 + dx, FLOOR + 2.0, Z0 - 0.33);
  }

  /* ---------- 南半间：绘景 ---------- */
  const canvasTex = primedCanvasTexture();
  const canvasMat = new THREE.MeshStandardMaterial({ map: canvasTex, roughness: 0.95 });
  const bigCanvas = new THREE.Mesh(
    new THREE.PlaneGeometry(2.9, 3.1),
    new THREE.MeshStandardMaterial({ map: bigCanvasTexture(), roughness: 0.95 })
  );
  bigCanvas.position.set(9.55, FLOOR + 1.95, Z1 + 0.32);
  group.add(bigCanvas);
  // 画布边框与托木
  wood.add(3.06, 0.09, 0.1, 9.55, FLOOR + 3.52, Z1 + 0.3);
  wood.add(3.06, 0.09, 0.1, 9.55, FLOOR + 0.38, Z1 + 0.3);
  wood.add(0.09, 3.2, 0.1, 8.06, FLOOR + 1.95, Z1 + 0.3);
  wood.add(0.09, 3.2, 0.1, 11.04, FLOOR + 1.95, Z1 + 0.3);

  // 脚手架：两根立杆 + 横杆 + 踏板，立在画布前
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x4c4034, roughness: 0.5, metalness: 0.4 });
  const pipe = new BoxBatch(pipeMat);
  for (const x of [8.15, 10.95]) {
    for (const z of [-64.5, -63.5]) {
      pipe.add(0.07, 3.4, 0.07, x, FLOOR + 1.7, z);
    }
    pipe.add(0.06, 0.06, 1.05, x, FLOOR + 2.4, -64.0);
  }
  pipe.add(2.86, 0.06, 0.06, 9.55, FLOOR + 2.4, -64.5);
  pipe.add(2.86, 0.06, 0.06, 9.55, FLOOR + 2.4, -63.5);
  // 踏板
  const plankMat = new THREE.MeshStandardMaterial({ color: 0x9a7448, roughness: 0.82 });
  const plank = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.07, 0.62), plankMat);
  plank.position.set(9.55, FLOOR + 2.46, -64.0);
  group.add(plank);

  // 木工台：靠东墙，台上散着工具
  wood.add(0.7, 0.86, 1.7, X1 - 0.5, FLOOR + 0.43, -63.7);
  wood.add(0.82, 0.08, 1.82, X1 - 0.5, FLOOR + 0.9, -63.7);
  const toolMat = new THREE.MeshStandardMaterial({ color: 0x3a3129, roughness: 0.72, metalness: 0.3 });
  const tools = new BoxBatch(toolMat);
  tools.add(0.22, 0.05, 0.3, X1 - 0.5, FLOOR + 0.97, -64.2);
  tools.add(0.1, 0.06, 0.34, X1 - 0.5, FLOOR + 0.97, -63.3);
  tools.build(group);

  // 颜料桶：四只，桶沿挂色
  const paintColors = [0x8e2f2a, 0x33485f, 0xb98a42, 0xcfc6b4];
  // 四只桶同形不同色：一枚 InstancedMesh + 逐实例颜色，比四份材质省三次绘制
  const bucketGeo = new THREE.CylinderGeometry(0.14, 0.11, 0.3, 12);
  const bucketMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0.1 });
  const buckets = new THREE.InstancedMesh(bucketGeo, bucketMat, paintColors.length);
  buckets.castShadow = full;
  const bucketDummy = new THREE.Object3D();
  paintColors.forEach((hex, i) => {
    bucketDummy.position.set(8.25 + i * 0.55, FLOOR + 0.15, -64.75 + (i % 2) * 0.2);
    bucketDummy.updateMatrix();
    buckets.setMatrixAt(i, bucketDummy.matrix);
    buckets.setColorAt(i, new THREE.Color(hex));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.012, 5, 14), mats.goldDeep);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(8.25 + i * 0.55, FLOOR + 0.30, -64.75 + (i % 2) * 0.2);
    group.add(rim);
  });
  buckets.instanceMatrix.needsUpdate = true;
  if (buckets.instanceColor) buckets.instanceColor.needsUpdate = true;
  group.add(buckets);

  // 防污布：画布前的一大块浅灰地布
  const cloth = new THREE.Mesh(
    new THREE.PlaneGeometry(3.3, 2.4),
    new THREE.MeshStandardMaterial({ color: 0x9a9181, roughness: 0.96 })
  );
  cloth.rotation.x = -Math.PI / 2;
  cloth.position.set(9.4, FLOOR + 0.012, -64.4);
  cloth.receiveShadow = true;
  group.add(cloth);

  // 木箱
  wood.add(0.6, 0.55, 0.6, 7.4, FLOOR + 0.28, -65.1);

  // 卷起的旧景片：三卷靠在南墙根，麻绳捆着，顶上有点积灰
  const rollMat = new THREE.MeshStandardMaterial({ color: 0xbcae94, roughness: 0.96 });
  for (const [x, h, tilt] of [[6.78, 2.42, 0.07], [7.14, 2.08, 0.1], [7.46, 2.64, 0.055]]) {
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.165, h, 14), rollMat);
    roll.position.set(x, FLOOR + h / 2, -65.28);
    roll.rotation.x = tilt;
    roll.castShadow = full;
    group.add(roll);
    for (const y of [FLOOR + h * 0.28, FLOOR + h * 0.72]) {
      const rope = new THREE.Mesh(new THREE.TorusGeometry(0.163, 0.012, 5, 16), mats.goldDeep);
      rope.rotation.x = Math.PI / 2 + tilt;
      rope.position.set(x, y, -65.28);
      group.add(rope);
    }
    // 卷口露出的一点旧颜色
    const lip = new THREE.Mesh(new THREE.CircleGeometry(0.15, 14), new THREE.MeshStandardMaterial({ color: 0x6b3a30, roughness: 0.9 }));
    lip.position.set(x, FLOOR + h - 0.005, -65.28);
    lip.rotation.x = -Math.PI / 2 + tilt;
    group.add(lip);
  }

  // 地面颜料痕迹：几片贴在木地板与地布上
  const splat = splatterTexture();
  const splatColors = [0x7d2a24, 0x2d3f52, 0xa87c3a, 0x4a4038];
  [
    [0.85, 8.05, -64.35, 0.9, 0], [0.7, 8.75, -64.62, 0.75, 1],
    [0.55, 9.55, -64.15, 0.6, 2], [0.62, 10.35, -64.8, 0.5, 3],
    [0.45, 11.3, -64.2, 0.45, 0], [0.5, 7.6, -63.55, 0.5, 1]
  ].forEach(([s, x, z, op, ci]) => {
    const mat = new THREE.MeshBasicMaterial({
      map: splat,
      color: splatColors[ci],
      transparent: true,
      opacity: op,
      depthWrite: false
    });
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(s, s), mat);
    patch.rotation.x = -Math.PI / 2;
    patch.rotation.z = Math.random() * Math.PI;
    patch.position.set(x, FLOOR + 0.014, z);
    patch.renderOrder = 3;
    group.add(patch);
  });

  // 刷具：木工台上两只铁罐，插着几支刷子
  const bristleMat = new THREE.MeshStandardMaterial({ color: 0x8a7452, roughness: 0.95 });
  for (const [jx, jz, n] of [[X1 - 0.72, -64.35, 4], [X1 - 0.38, -63.15, 3]]) {
    const jar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.068, 0.17, 12, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x4a443c, roughness: 0.55, metalness: 0.45, side: THREE.DoubleSide })
    );
    jar.position.set(jx, FLOOR + 0.99, jz);
    group.add(jar);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.42, 6), mats.wood);
      handle.position.set(jx + Math.cos(a) * 0.032, FLOOR + 1.19, jz + Math.sin(a) * 0.032);
      handle.rotation.z = Math.cos(a) * 0.14;
      handle.rotation.x = Math.sin(a) * 0.14;
      group.add(handle);
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.075, 6), bristleMat);
      head.position.set(handle.position.x + Math.cos(a) * 0.045, FLOOR + 1.42, handle.position.z + Math.sin(a) * 0.045);
      group.add(head);
    }
  }

  // 钉在东墙上的三张图
  const draftTex = draftingTexture();
  const draftMat = new THREE.MeshStandardMaterial({ map: draftTex, roughness: 0.95 });
  for (const [z, y] of [[-63.2, 2.65], [-63.75, 2.35], [-64.3, 2.1]]) {
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.62), draftMat);
    sheet.rotation.y = -Math.PI / 2;
    sheet.position.set(X1 - 0.24, FLOOR + y, z);
    group.add(sheet);
    goldDeep.add(0.02, 0.03, 0.03, X1 - 0.25, FLOOR + y + 0.3, z - 0.16);
  }

  /* 靠南墙立着的画板与画布：复用画布/图纸材质，斜靠墙根 */
  const leanTilt = -0.28;
  const leanBoard = (x, w, h, mat) => {
    const cz = -65.1;
    const cy = FLOOR + h / 2;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    panel.position.set(x, cy, cz);
    panel.rotation.x = leanTilt;
    group.add(panel);
    const topZ = cz + Math.sin(leanTilt) * (h / 2);
    const botZ = cz - Math.sin(leanTilt) * (h / 2);
    wood.add(w + 0.07, 0.05, 0.05, x, FLOOR + h - 0.01, topZ, 0, leanTilt);
    wood.add(w + 0.07, 0.05, 0.05, x, FLOOR + 0.05, botZ, 0, leanTilt);
    wood.add(0.05, h, 0.05, x - w / 2 - 0.01, cy, cz, 0, leanTilt);
    wood.add(0.05, h, 0.05, x + w / 2 + 0.01, cy, cz, 0, leanTilt);
    goldDeep.add(0.07, 0.02, 0.02, x, FLOOR + 0.02, botZ + 0.03, 0, leanTilt);
  };
  leanBoard(11.44, 0.62, 1.52, canvasMat);
  leanBoard(11.96, 0.48, 1.34, canvasMat);
  leanBoard(12.3, 0.36, 1.16, draftMat);

  /* 工作台上的草图与纸叠：近看能分清草图纸、炭笔与镇纸 */
  const sketch = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.4), draftMat);
  sketch.rotation.set(-Math.PI / 2, 0, 0.14);
  sketch.position.set(11.92, FLOOR + 0.947, -63.34);
  group.add(sketch);
  const sketchPaper = new BoxBatch(sheetMat);
  sketchPaper.add(0.27, 0.055, 0.35, 11.9, FLOOR + 0.972, -62.96, 0.1);
  sketchPaper.add(0.24, 0.012, 0.3, 11.9, FLOOR + 1.006, -62.97, -0.05);
  sketchPaper.build(group);
  wood.add(0.05, 0.03, 0.12, 12.2, FLOOR + 0.96, -63.34, 0.2);

  /* 接触阴影：钢琴、椅子、画布、脚手架与工作台的落地关系 */
  contactBatch(group, mats, [
    [6.9, FLOOR + 0.006, -59.8, 0.85, 1.75],
    [7.9, FLOOR + 0.006, -61.4, 0.62, 0.62],
    [8.7, FLOOR + 0.006, -61.5, 0.62, 0.62],
    [10.1, FLOOR + 0.006, -60.4, 0.62, 0.62],
    [X1 - 0.2, FLOOR + 0.006, -60.1, 0.5, 1.3],
    [7.72, FLOOR + 0.006, BARRE_Z, 2.5, 0.5],
    [9.55, FLOOR + 0.006, -64.0, 3.1, 1.5],
    [9.55, FLOOR + 0.006, -65.25, 3.2, 0.85],
    [X1 - 0.5, FLOOR + 0.006, -63.7, 0.95, 1.95],
    [7.15, FLOOR + 0.006, -65.2, 1.15, 0.65],
    [7.4, FLOOR + 0.006, -65.1, 0.7, 0.7],
    [8.7, FLOOR + 0.006, -64.65, 2.1, 0.75],
    [11.95, FLOOR + 0.006, -65.0, 1.7, 0.55]
  ], 0.3);

  /* ---------- 灯具 ---------- */
  const addLight = (light) => {
    group.add(light);
    lights.push({ light, base: light.intensity });
  };
  const pendant = (x, z, intensity, dist) => {
    goldDeep.add(0.03, 1.0, 0.03, x, CEIL - 0.5, z);
    const shade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.06, 0.22, 16, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x55402c, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide })
    );
    shade.position.set(x, CEIL - 1.02, z);
    group.add(shade);
    const light = new THREE.PointLight(0xffbb84, intensity, dist, 2);
    light.position.set(x, CEIL - 1.16, z);
    addLight(light);
    glows.push(addGlowSprite(mats, group, x, CEIL - 1.12, z, 1.1, 0.34));
  };
  // 排练半只留钢琴上方一圈光；绘景半的照明交给画布前的工作灯
  pendant(8.2, -59.8, 13, 7.5);

  // 工作灯：夹在脚手架立杆上，从画布左侧斜下打
  goldDeep.add(0.05, 0.05, 0.34, 8.15, FLOOR + 3.02, -64.32);
  const lampShade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.07, 0.2, 14, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x3e372e, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide })
  );
  lampShade.position.set(8.15, FLOOR + 3.0, -64.15);
  lampShade.rotation.x = -0.55;
  group.add(lampShade);

  const canvasSpot = new THREE.SpotLight(0xffd6a8, 16, 9, 0.42, 0.7, 2);
  canvasSpot.position.set(8.2, FLOOR + 3.02, -64.05);
  canvasSpot.target.position.set(9.9, FLOOR + 1.7, Z1 + 0.34);
  group.add(canvasSpot);
  group.add(canvasSpot.target);
  lights.push({ light: canvasSpot, base: canvasSpot.intensity });
  glows.push(addGlowSprite(mats, group, 8.15, FLOOR + 2.98, -64.1, 0.9, 0.3));

  // 排练区的一盏弱冷补，给镜面一点可读的反射
  const mirrorFill = new THREE.PointLight(PALETTE.cool, 3.2, 4.5, 2);
  mirrorFill.position.set(X1 - 1.0, FLOOR + 2.4, -60.2);
  addLight(mirrorFill);

  const work = new THREE.PointLight(0xffb07a, 4, 4, 2);
  work.position.set(7.4, FLOOR + 0.9, -64.6);
  addLight(work);

  pipe.build(group);
  gold.build(group);
  goldDeep.build(group);
  wood.build(group);
  velvet.build(group);
  trim.build(group);

  let level = 1;
  function setLevel(v) {
    level = v;
    lights.forEach(({ light, base }) => {
      light.intensity = base * v;
    });
    glows.forEach((g) => {
      g.material.opacity = (g.userData.baseOpacity || 0.5) * (0.25 + 0.75 * v);
    });
  }
  setLevel(1);

  mergeStatic(group);

  return { group, setLevel, get level() { return level; } };
}
