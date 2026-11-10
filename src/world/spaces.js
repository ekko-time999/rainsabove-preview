import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BoxBatch, addGlowSprite, contactBatch, makeContactMaterial, mergeStatic } from './utils.js';
import { seatGeometry } from './auditorium.js';
import { OFFICE, WORKSHOP } from './plan.js';
import { PALETTE } from './materials.js';

const LEVEL = 4.03;
const STAGE_Y = 0.95;

function darkPlaster(mats, hex) {
  const m = mats.plaster.clone();
  m.color.setHex(hex);
  m.roughness = 0.94;
  return m;
}

/* 后台通告板：一张程序化图，钉着排期、演员表与便签，近看能读出“纸”的层次 */
function callBoardTexture() {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 420;
  const g = c.getContext('2d');
  g.fillStyle = '#1b1410';
  g.fillRect(0, 0, 640, 420);

  const papers = [
    [38, 34, 236, 300, '#e4d6b8', -0.02],
    [300, 46, 150, 196, '#ddcdaa', 0.03],
    [474, 60, 128, 150, '#e9dcc0', -0.04],
    [304, 268, 298, 108, '#d8c7a4', 0.015]
  ];
  for (const [x, y, w, h, fill, rot] of papers) {
    g.save();
    g.translate(x + w / 2, y + h / 2);
    g.rotate(rot);
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(-w / 2 + 4, -h / 2 + 6, w, h);
    g.fillStyle = fill;
    g.fillRect(-w / 2, -h / 2, w, h);
    g.strokeStyle = 'rgba(70,52,34,0.35)';
    g.lineWidth = 1;
    g.strokeRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10);
    g.restore();
  }

  // 排期表：方格与手写行
  g.strokeStyle = 'rgba(54,40,28,0.45)';
  g.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.moveTo(48, 84 + i * 40);
    g.lineTo(262, 84 + i * 40);
    g.stroke();
  }
  g.fillStyle = 'rgba(48,34,22,0.85)';
  g.font = '700 26px "Songti SC", "SimSun", serif';
  g.fillText('本周排期', 48, 64);
  g.font = '400 16px Georgia, serif';
  const rows = [
    ['11.04', '乐队 · 合乐'],
    ['11.05', '第一幕 走位'],
    ['11.06', '服装 · 试装'],
    ['11.07', '带景连排'],
    ['11.08', '首演']
  ];
  rows.forEach(([d, t], i) => {
    g.fillStyle = 'rgba(66,48,32,0.7)';
    g.fillText(d, 52, 106 + i * 40);
    g.fillStyle = 'rgba(42,30,20,0.88)';
    g.fillText(t, 108, 106 + i * 40);
  });

  // 演员表：竖排小字
  g.fillStyle = 'rgba(46,32,20,0.88)';
  g.font = '700 18px "Songti SC", "SimSun", serif';
  g.fillText('演员表', 314, 74);
  g.font = '400 14px "Songti SC", "SimSun", serif';
  const cast = ['夜航者 · 林', '引座员 · 周', '乐队 · 四重奏', '替角 · 陈', '舞台监督 · 许'];
  cast.forEach((line, i) => {
    g.fillStyle = 'rgba(54,38,24,0.78)';
    g.fillText(line, 314, 102 + i * 24);
  });

  // 便签：钉头与两行短句
  g.fillStyle = 'rgba(52,36,22,0.82)';
  g.font = '400 13px "Songti SC", "SimSun", serif';
  g.fillText('镜前灯泡换过', 482, 92);
  g.fillText('别动 3 号衣架', 482, 112);
  g.fillText('幕间 10 分钟', 482, 132);

  // 大张的走位示意：几条墨线
  g.strokeStyle = 'rgba(54,40,28,0.5)';
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(320, 292);
  g.bezierCurveTo(380, 276, 440, 330, 520, 300);
  g.stroke();
  g.beginPath();
  g.arc(392, 316, 16, 0, Math.PI * 2);
  g.stroke();

  // 钉头：每张纸一到两枚
  for (const [x, y] of [[56, 48], [250, 48], [316, 60], [436, 60], [486, 74], [590, 74], [322, 282], [590, 282]]) {
    g.fillStyle = 'rgba(210,170,104,0.9)';
    g.beginPath();
    g.arc(x, y, 4.5, 0, Math.PI * 2);
    g.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* 化妆镜：一层冷灰的镜面，叠着灯泡与室内陈设的模糊倒影，近看不会读成木板 */
function mirrorTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#15161a');
  grad.addColorStop(0.34, '#2f3138');
  grad.addColorStop(0.56, '#5c5852');
  grad.addColorStop(0.72, '#35312e');
  grad.addColorStop(1, '#141213');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 256);

  // 反射的灯泡：一排暖色光斑，越靠边越暗
  for (let i = 0; i < 8; i++) {
    const x = 44 + i * 60;
    const halo = g.createRadialGradient(x, 46, 2, x, 46, 26);
    halo.addColorStop(0, 'rgba(255,214,168,0.5)');
    halo.addColorStop(1, 'rgba(255,190,130,0)');
    g.fillStyle = halo;
    g.fillRect(x - 30, 16, 60, 60);
  }

  // 房间的模糊剪影：门洞、衣架、台面在镜里只是一块更深的色块
  g.save();
  g.shadowColor = 'rgba(10,8,8,0.55)';
  g.shadowBlur = 26;
  g.fillStyle = 'rgba(12,10,10,0.26)';
  g.fillRect(300, 96, 58, 118);
  g.fillStyle = 'rgba(12,10,10,0.18)';
  g.fillRect(84, 104, 74, 110);
  g.restore();
  g.fillStyle = 'rgba(228,206,172,0.12)';
  g.fillRect(0, 176, 512, 7);

  // 竖向擦痕与边缘暗角
  for (let i = 0; i < 24; i++) {
    g.fillStyle = `rgba(255,246,230,${0.015 + Math.random() * 0.02})`;
    g.fillRect(Math.random() * 512, 0, 1, 256);
  }
  const vign = g.createLinearGradient(0, 0, 512, 0);
  vign.addColorStop(0, 'rgba(8,7,8,0.5)');
  vign.addColorStop(0.14, 'rgba(8,7,8,0)');
  vign.addColorStop(0.86, 'rgba(8,7,8,0)');
  vign.addColorStop(1, 'rgba(8,7,8,0.5)');
  g.fillStyle = vign;
  g.fillRect(0, 0, 512, 256);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* ---------- 后台：舞台塔之后的化妆间 ----------
   陈设：灯泡镜化妆台、戏服架、道具与化妆箱、缝纫台、通告排期板。
   draw call 预算 25（静置机位实测 20）。新增皮箱、纸品与接触阴影各一批；
   台面毛巾、粉盒、节目单叠复用既有 velvet/paper/gold 批次，不增 draw call。 */
function buildBackstage(scene, mats, full, glows) {
  const group = new THREE.Group();
  scene.add(group);

  const W = 12.4;
  const Z0 = -58.3;
  const Z1 = -65.8;
  const MIDZ = (Z0 + Z1) / 2;
  const CEIL = 7.4;

  const wallMat = darkPlaster(mats, 0x24160f);
  const wood = new BoxBatch(mats.wood);
  const gold = new BoxBatch(mats.gold);
  const goldDeep = new BoxBatch(mats.goldDeep);
  const velvet = new BoxBatch(mats.velvet);
  const leatherMat = new THREE.MeshStandardMaterial({ color: 0x3b2419, roughness: 0.58, metalness: 0.04 });
  const paperMat = new THREE.MeshStandardMaterial({ color: 0xe5d7ba, roughness: 0.95, metalness: 0 });
  const leather = new BoxBatch(leatherMat);
  const paper = new BoxBatch(paperMat);
  const floorMat = mats.wood.clone();
  floorMat.color.setHex(0x4a3626);
  floorMat.map = mats.woodMap.clone();
  floorMat.map.repeat.set(6, 4);
  floorMat.map.needsUpdate = true;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, Z0 - Z1), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, STAGE_Y, MIDZ);
  floor.receiveShadow = true;
  group.add(floor);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, Z0 - Z1), wallMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, CEIL, MIDZ);
  group.add(ceil);

  for (const sign of [-1, 1]) {
    if (sign === -1) {
      // 后台西墙为办公室短廊开一道 2.7m 宽的洞，上方留过梁
      const wallH = CEIL - STAGE_Y;
      const zN = OFFICE.CORR_Z1;   // -62.6
      const zS = OFFICE.CORR_Z0;   // -65.3
      const headY = STAGE_Y + 2.5;   // 3.45m，与短廊吊顶同高
      for (const [za, zb] of [[Z0, zN], [zS, Z1]]) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(0.24, wallH, Math.abs(za - zb)), wallMat);
        seg.position.set(-W / 2, STAGE_Y + wallH / 2, (za + zb) / 2);
        seg.receiveShadow = true;
        group.add(seg);
      }
      const header = new THREE.Mesh(new THREE.BoxGeometry(0.24, CEIL - headY, zN - zS), wallMat);
      header.position.set(-W / 2, (CEIL + headY) / 2, (zN + zS) / 2);
      header.receiveShadow = true;
      group.add(header);
    } else {
      // 东墙为创意工坊开一道通后台的门，门洞与工坊西墙对齐，上方留过梁
      const wallH = CEIL - STAGE_Y;
      const zN = WORKSHOP.BACK_DOOR_Z1;   // -62.4
      const zS = WORKSHOP.BACK_DOOR_Z0;   // -63.8
      const headY = STAGE_Y + 2.5;
      for (const [za, zb] of [[Z0, zN], [zS, Z1]]) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(0.24, wallH, Math.abs(za - zb)), wallMat);
        seg.position.set(W / 2, STAGE_Y + wallH / 2, (za + zb) / 2);
        seg.receiveShadow = true;
        group.add(seg);
      }
      const header = new THREE.Mesh(new THREE.BoxGeometry(0.24, CEIL - headY, zN - zS), wallMat);
      header.position.set(W / 2, (CEIL + headY) / 2, (zN + zS) / 2);
      header.receiveShadow = true;
      group.add(header);
    }
  }
  const back = new THREE.Group();
  // 后墙并非整块板：右侧开 3m×4m 的装卸门，左侧留 1m×2.1m 的人员出口
  const LOAD_W = 3.0, LOAD_H = 4.0, LOAD_X = 2.6;
  const PD_W = 1.0, PD_H = 2.1, PD_X = -4.6;
  const lx0 = LOAD_X - LOAD_W / 2, lx1 = LOAD_X + LOAD_W / 2;
  const px0 = PD_X - PD_W / 2, px1 = PD_X + PD_W / 2;
  const wallH = CEIL - STAGE_Y;
  const backPanels = [
    [-W / 2, px0, STAGE_Y, wallH],
    [px1, lx0, STAGE_Y, wallH],
    [lx1, W / 2, STAGE_Y, wallH],
    [px0, px1, STAGE_Y + PD_H, wallH - PD_H],
    [lx0, lx1, STAGE_Y + LOAD_H, wallH - LOAD_H]
  ];
  for (const [x0, x1, yb, h] of backPanels) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, h, 0.24), wallMat);
    panel.position.set((x0 + x1) / 2, yb + h / 2, Z1);
    panel.receiveShadow = true;
    back.add(panel);
  }
  group.add(back);

  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x47484a,
    roughness: 0.52,
    metalness: 0.62
  });
  const steel = new BoxBatch(steelMat);
  // 装卸门卷帘升到 2.6m 净高：只留顶部卷起的帘片，门下净空可通行
  const rollBottom = STAGE_Y + 2.6;
  const rollTop = STAGE_Y + LOAD_H;
  steel.add(LOAD_W - 0.04, rollTop - rollBottom - 0.03, 0.08, LOAD_X, (rollBottom + rollTop) / 2, Z1 + 0.14);
  for (let i = 0; i < 4; i++) {
    steel.add(LOAD_W - 0.12, 0.03, 0.04, LOAD_X, rollBottom + 0.20 + i * 0.36, Z1 + 0.19);
  }
  steel.add(LOAD_W + 0.36, 0.26, 0.3, LOAD_X, STAGE_Y + LOAD_H + 0.18, Z1 + 0.18);
  goldDeep.add(LOAD_W + 0.3, 0.06, 0.34, LOAD_X, STAGE_Y + LOAD_H + 0.34, Z1 + 0.18);
  gold.add(0.16, 0.16, 0.16, LOAD_X + LOAD_W / 2 - 0.6, rollBottom + 0.85, Z1 + 0.22);
  // 人员门：木门 + 绿色出口标识
  wood.add(PD_W, PD_H, 0.06, PD_X, STAGE_Y + PD_H / 2, Z1 + 0.15);
  goldDeep.add(PD_W + 0.16, 0.06, 0.1, PD_X, STAGE_Y + PD_H + 0.05, Z1 + 0.16);
  const exitMat = new THREE.MeshBasicMaterial({ color: 0x5fa87a, toneMapped: true });
  const exitSign = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.12), exitMat);
  exitSign.position.set(PD_X, STAGE_Y + PD_H + 0.26, Z1 + 0.18);
  back.add(exitSign);
  const exitHalo = addGlowSprite(mats, back, PD_X, STAGE_Y + PD_H + 0.24, Z1 + 0.3, 0.5, 0.16);
  glows.push(exitHalo);

  // 室外装卸平台：门外的混凝土台，与外壳的装卸平台标高接平（1.05m）
  const dockMat = new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 0.96, metalness: 0.03 });
  const dock = new THREE.Mesh(new THREE.BoxGeometry(LOAD_W + 1.8, 0.10, 0.9), dockMat);
  dock.position.set(LOAD_X, STAGE_Y + 0.05, Z1 - 0.25);
  dock.receiveShadow = true;
  group.add(dock);
  // 门槛收边：压过门洞 0.10m 高差，脚印落在 1.05m 的室外平台上
  goldDeep.add(LOAD_W, 0.02, 0.08, LOAD_X, STAGE_Y + 0.11, Z1 - 0.02);

  // 舞台台面（后端 1.10m）到后台地面（0.95m）的过门门槛
  wood.add(1.5, 0.12, 0.52, 4.6, STAGE_Y + 0.06, (Z0 + (-57.8)) / 2);
  goldDeep.add(1.52, 0.03, 0.06, 4.6, STAGE_Y + 0.13, Z0 - 0.03);

  /* 化妆台：靠尽头墙，镜面 + 裸灯泡 + 台面 */
  wood.add(3.3, 0.78, 0.72, -2.4, STAGE_Y + 0.39, Z1 + 0.5);
  gold.add(3.38, 0.05, 0.8, -2.4, STAGE_Y + 0.8, Z1 + 0.5);
  const mirrorMat = new THREE.MeshStandardMaterial({
    map: mirrorTexture(),
    color: 0xdfe3e4,
    emissive: 0x241d18,
    emissiveIntensity: 0.45,
    roughness: 0.12,
    metalness: 0.08
  });
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.25), mirrorMat);
  mirror.position.set(-2.4, STAGE_Y + 1.7, Z1 + 0.13);
  group.add(mirror);
  goldDeep.add(3.16, 0.08, 0.1, -2.4, STAGE_Y + 2.36, Z1 + 0.12);
  goldDeep.add(0.08, 1.35, 0.1, -3.96, STAGE_Y + 1.7, Z1 + 0.12);
  goldDeep.add(0.08, 1.35, 0.1, -0.84, STAGE_Y + 1.7, Z1 + 0.12);

  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd3a0, toneMapped: true });
  const bulbGeos = [];
  const bulbPoints = [];
  for (let i = 0; i < 8; i++) {
    const x = -3.78 + i * 0.4;
    bulbGeos.push(new THREE.SphereGeometry(0.045, 6, 5).translate(x, STAGE_Y + 2.28, Z1 + 0.2));
    bulbPoints.push(x, STAGE_Y + 2.28, Z1 + 0.3);
  }
  group.add(new THREE.Mesh(mergeGeometries(bulbGeos, false), bulbMat));

  // 镜前的一只矮凳
  wood.add(0.55, 0.42, 0.42, -2.4, STAGE_Y + 0.21, Z1 + 1.35);
  velvet.add(0.58, 0.1, 0.44, -2.4, STAGE_Y + 0.46, Z1 + 1.35);

  /* 衣架与戏服：右侧 */
  const rackX = 3.9;
  gold.add(0.06, 1.6, 0.06, rackX - 1.1, STAGE_Y + 1.6, -60.6);
  gold.add(0.06, 1.6, 0.06, rackX + 1.1, STAGE_Y + 1.6, -60.6);
  goldDeep.add(2.3, 0.05, 0.05, rackX, STAGE_Y + 2.38, -60.6);
  for (let i = 0; i < 5; i++) {
    const z = -60.35 + i * 0.22;
    velvet.add(0.55, 1.0 - (i % 2) * 0.16, 0.16, rackX - 0.72 + i * 0.36, STAGE_Y + 1.82, z);
    gold.add(0.03, 0.12, 0.03, rackX - 0.72 + i * 0.36, STAGE_Y + 2.36, z);
  }

  /* 道具台与箱子：左侧 */
  wood.add(1.5, 0.72, 0.8, -5.0, STAGE_Y + 0.36, -62.2);
  goldDeep.add(1.56, 0.04, 0.86, -5.0, STAGE_Y + 0.74, -62.2);
  for (let i = 0; i < 3; i++) {
    wood.add(0.5, 0.36, 0.5, -1.3 + i * 0.5, STAGE_Y + 0.18, -63.6);
    gold.add(0.52, 0.035, 0.52, -1.3 + i * 0.5, STAGE_Y + 0.37, -63.6);
    // 箱面贴纸：不用贴图，一张浅色纸片加一道墨线就够读
    paper.add(0.18, 0.11, 0.006, -1.3 + i * 0.5, STAGE_Y + 0.22, -63.85);
    leather.add(0.24, 0.018, 0.02, -1.3 + i * 0.5, STAGE_Y + 0.12, -63.85);
  }

  /* 化妆台台面小件：粉罐、笔筒、摊开的台本 */
  const TABLE_Y = STAGE_Y + 0.79;
  for (const [x, z] of [[-3.55, -65.06], [-3.32, -65.02], [-3.08, -65.08]]) {
    paper.add(0.075, 0.055, 0.075, x, TABLE_Y + 0.028, z);
    gold.add(0.08, 0.022, 0.08, x, TABLE_Y + 0.066, z);
  }
  const brushCupGeo = new THREE.CylinderGeometry(0.042, 0.036, 0.12, 10).translate(-2.92, TABLE_Y + 0.06, -65.02);
  const brushCup = new THREE.Mesh(brushCupGeo, steelMat);
  group.add(brushCup);
  const brushGeos = [];
  const brushCount = full ? 5 : 2;
  for (let i = 0; i < brushCount; i++) {
    const a = (i / brushCount) * Math.PI * 2;
    const geo = new THREE.CylinderGeometry(0.006, 0.005, 0.22, 5)
      .translate(-2.92 + Math.cos(a) * 0.02, TABLE_Y + 0.2, -65.02 + Math.sin(a) * 0.02);
    brushGeos.push(geo);
  }
  group.add(new THREE.Mesh(mergeGeometries(brushGeos, false), mats.wood));
  for (let i = 0; i < brushCount; i++) {
    const a = (i / brushCount) * Math.PI * 2;
    leather.add(0.012, 0.03, 0.012, -2.92 + Math.cos(a) * 0.02, TABLE_Y + 0.31, -65.02 + Math.sin(a) * 0.02);
  }
  paper.add(0.3, 0.012, 0.22, -1.55, TABLE_Y + 0.008, -65.12);
  leather.add(0.3, 0.012, 0.012, -1.55, TABLE_Y + 0.022, -65.23);

  // 台面右段：叠毛巾、带铜盖的粉盒、一叠节目单，别让长台面空着
  for (let i = 0; i < 3; i++) {
    velvet.add(0.26, 0.028, 0.2, -2.06, TABLE_Y + 0.016 + i * 0.03, -65.06 + (i % 2) * 0.012);
  }
  paper.add(0.16, 0.09, 0.16, -1.7, TABLE_Y + 0.045, -65.04);
  gold.add(0.172, 0.022, 0.172, -1.7, TABLE_Y + 0.1, -65.04);
  gold.add(0.03, 0.022, 0.03, -1.7, TABLE_Y + 0.12, -65.04);
  for (let i = 0; i < 4; i++) paper.add(0.22, 0.008, 0.16, -1.24, TABLE_Y + 0.006 + i * 0.009, -65.08);
  leather.add(0.03, 0.012, 0.05, -1.24, TABLE_Y + 0.048, -65.08);

  /* 缝纫台：西墙，黑机身、木台面、布料卷与纸样 */
  wood.add(0.62, 0.76, 1.15, -5.78, STAGE_Y + 0.38, -60.55);
  goldDeep.add(0.66, 0.04, 1.2, -5.78, STAGE_Y + 0.78, -60.55);
  for (const [dx, dz] of [[-0.26, -0.5], [0.26, -0.5], [-0.26, 0.5], [0.26, 0.5]]) {
    wood.add(0.07, 0.74, 0.07, -5.78 + dx, STAGE_Y + 0.37, -60.55 + dz);
  }
  const SEW = STAGE_Y + 0.8;
  steel.add(0.38, 0.03, 0.24, -5.8, SEW + 0.015, -60.95);
  steel.add(0.16, 0.26, 0.16, -5.8, SEW + 0.16, -60.95);
  steel.add(0.3, 0.06, 0.09, -5.76, SEW + 0.3, -60.86);
  steel.add(0.09, 0.14, 0.09, -5.66, SEW + 0.2, -60.8);
  if (full) {
    const wheelGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.025, 12)
      .rotateZ(Math.PI / 2)
      .translate(-5.92, SEW + 0.24, -60.83);
    group.add(new THREE.Mesh(wheelGeo, steelMat));
    for (let i = 0; i < 3; i++) {
      gold.add(0.03, 0.05, 0.03, -5.7 + i * 0.05, SEW + 0.05, -60.68);
    }
  }
  velvet.add(0.2, 0.15, 0.46, -5.74, SEW + 0.1, -60.12);
  paper.add(0.34, 0.008, 0.42, -5.56, SEW + 0.012, -60.3);

  /* 道具台上的化妆箱：皮革箱、铜扣、叠放的毛巾 */
  leather.add(0.42, 0.16, 0.3, -5.32, STAGE_Y + 0.84, -62.3);
  leather.add(0.34, 0.12, 0.26, -5.3, STAGE_Y + 0.98, -62.32);
  gold.add(0.44, 0.014, 0.32, -5.32, STAGE_Y + 0.93, -62.3);
  gold.add(0.36, 0.012, 0.28, -5.3, STAGE_Y + 1.05, -62.32);
  for (const [x, y] of [[-5.46, 0.9], [-5.18, 0.9], [-5.16, 1.02]]) {
    gold.add(0.04, 0.03, 0.02, x, STAGE_Y + y, -62.15);
  }
  velvet.add(0.26, 0.05, 0.2, -4.62, STAGE_Y + 0.79, -62.24);
  velvet.add(0.22, 0.045, 0.17, -4.62, STAGE_Y + 0.84, -62.25);

  /* 通告与排期：东墙，木框 + 程序化印刷面 */
  const boardMat = new THREE.MeshStandardMaterial({ map: callBoardTexture(), roughness: 0.92, metalness: 0 });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 0.95), boardMat);
  board.rotation.y = -Math.PI / 2;
  board.position.set(W / 2 - 0.13, STAGE_Y + 1.78, -61.4);
  group.add(board);
  wood.add(0.06, 1.05, 0.07, W / 2 - 0.14, STAGE_Y + 1.78, -62.15);
  wood.add(0.06, 1.05, 0.07, W / 2 - 0.14, STAGE_Y + 1.78, -60.65);
  wood.add(0.06, 0.07, 1.57, W / 2 - 0.14, STAGE_Y + 2.29, -61.4);
  wood.add(0.06, 0.07, 1.57, W / 2 - 0.14, STAGE_Y + 1.27, -61.4);
  goldDeep.add(0.1, 0.045, 1.6, W / 2 - 0.16, STAGE_Y + 2.34, -61.4);
  const boardGlow = addGlowSprite(mats, group, W / 2 - 0.35, STAGE_Y + 2.05, -61.4, 1.3, 0.12);
  glows.push(boardGlow);

  /* 接触阴影：家具腿脚与箱底压暗，避免“浮在地上” */
  contactBatch(group, mats, [
    [-2.4, STAGE_Y + 0.005, -65.15, 3.5, 1.05],
    [-2.4, STAGE_Y + 0.005, -64.6, 0.85, 0.6],
    [3.9, STAGE_Y + 0.005, -60.6, 2.5, 0.9],
    [-5.0, STAGE_Y + 0.005, -62.2, 1.75, 1.0],
    [-0.8, STAGE_Y + 0.005, -63.6, 2.0, 0.8],
    [-5.78, STAGE_Y + 0.005, -60.55, 0.95, 1.45],
    [5.55, STAGE_Y + 0.005, -61.4, 0.95, 1.4]
  ]);


  /* 吊杆与控制台：靠右墙 */
  for (let i = 0; i < 4; i++) {
    const z = -59.4 - i * 1.5;
    goldDeep.add(0.05, 2.0, 0.05, 4.65, CEIL - 0.9, z);
    gold.add(W * 0.0 + 1.9, 0.045, 0.045, 4.4, CEIL - 1.0, z);
  }
  wood.add(0.7, 0.5, 1.1, 5.55, STAGE_Y + 0.55, -61.4);
  goldDeep.add(0.74, 0.05, 1.16, 5.55, STAGE_Y + 0.82, -61.4);
  for (let i = 0; i < 4; i++) {
    gold.add(0.04, 0.06, 0.04, 5.3, STAGE_Y + 0.86, -61.8 + i * 0.24);
  }

  /* 地面标记线 */
  const markMat = new THREE.MeshBasicMaterial({ color: 0x9aa39a, transparent: true, opacity: 0.3 });
  const marks = [];
  for (const x of [-2.0, -1.0, 0.0, 1.0, 2.0]) {
    marks.push(new THREE.PlaneGeometry(0.035, 5.6).rotateX(-Math.PI / 2).translate(x, STAGE_Y + 0.006, -61.9));
  }
  marks.push(new THREE.PlaneGeometry(6.4, 0.035).rotateX(-Math.PI / 2).translate(0, STAGE_Y + 0.006, -62.4));
  marks.push(new THREE.PlaneGeometry(4.6, 0.045).rotateX(-Math.PI / 2).translate(0, STAGE_Y + 0.007, -59.7));
  const markMesh = new THREE.Mesh(mergeGeometries(marks, false), markMat);
  markMesh.renderOrder = 1;
  group.add(markMesh);

  // 墙脚线与工作灯槽：在后墙两个门洞处断开，不横穿门口
  for (const [x0, x1] of [[-W / 2, px0], [px1, lx0], [lx1, W / 2]]) {
    goldDeep.add(x1 - x0, 0.08, 0.08, (x0 + x1) / 2, STAGE_Y + 0.06, Z1 + 0.16);
  }
  for (const sign of [-1, 1]) {
    if (sign === -1) {
      for (const [za, zb] of [[Z0, OFFICE.CORR_Z1], [OFFICE.CORR_Z0, Z1]]) {
        goldDeep.add(0.08, 0.08, Math.abs(za - zb), sign * (W / 2 - 0.18), STAGE_Y + 0.06, (za + zb) / 2);
      }
    } else {
      goldDeep.add(0.08, 0.08, Z0 - Z1, sign * (W / 2 - 0.18), STAGE_Y + 0.06, MIDZ);
    }
  }

  /* 极弱工作灯：一盏顶灯 + 两盏镜前侧灯 */
  const lights = [];
  const addLight = (light) => { group.add(light); lights.push({ light, base: light.intensity }); };
  const work = new THREE.PointLight(0xffb783, 5.5, 9, 2);
  work.position.set(0, CEIL - 0.6, -61.6);
  addLight(work);
  for (const x of [-3.2, -1.6]) {
    const l = new THREE.PointLight(0xffc896, 3.4, 4.5, 2);
    l.position.set(x, STAGE_Y + 2.1, Z1 + 1.0);
    addLight(l);
  }
  const halo = addGlowSprite(mats, group, -2.4, STAGE_Y + 2.6, Z1 + 0.6, 1.6, 0.28);
  glows.push(halo);

  /* 缝纫台局部工作灯：铜臂挑出，搪瓷罩只压住桌面这一小块 */
  goldDeep.add(0.78, 0.03, 0.03, -5.92, STAGE_Y + 2.42, -60.55);
  goldDeep.add(0.024, 0.16, 0.024, -5.3, STAGE_Y + 2.36, -60.55);
  const sewShade = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.19, 16), mats.brass);
  sewShade.position.set(-5.3, STAGE_Y + 2.24, -60.55);
  group.add(sewShade);
  const sewLamp = new THREE.PointLight(0xffbc86, 0.9, 2.4, 2);
  sewLamp.position.set(-5.3, STAGE_Y + 2.14, -60.55);
  addLight(sewLamp);
  glows.push(addGlowSprite(mats, group, -5.3, STAGE_Y + 2.16, -60.55, 0.5, 0.22));

  const haloGeo = new THREE.BufferGeometry();
  haloGeo.setAttribute('position', new THREE.Float32BufferAttribute(bulbPoints, 3));
  const bulbHalo = new THREE.Points(haloGeo, new THREE.PointsMaterial({
    map: mats.glowMap,
    color: 0xffcf9c,
    size: 0.22,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  }));
  group.add(bulbHalo);

  gold.build(group);
  goldDeep.build(group);
  wood.build(group);
  velvet.build(group);
  leather.build(group);
  paper.build(group);
  steel.build(group);

  mergeStatic(group);

  return { group, lights, bulbHalo };
}

/* ---------- 放映厅：二楼左侧的小厅 ----------
   draw call 预算 24（静置机位实测 20 / 近景机位 22）。
   银幕、帘、片目板、胶片盒各自一份，胶片盒已并成两只（盒身 + 铜箍）。
   前区增设一台可走近看的 35mm 放映机陈列，镜头玻璃与铜件单独成批。 */
function buildScreening(scene, mats, full, glows, seatGeo) {
  const group = new THREE.Group();
  scene.add(group);

  const X0 = -8.7;
  const X1 = -2.62;
  const Z0 = -23.1;
  const Z1 = -28.5;
  const MIDZ = (Z0 + Z1) / 2;
  const MIDX = (X0 + X1) / 2;
  const DOOR_Z = -25.6;   // 近墙门洞中心：-26.3..-24.9
  const CEIL = LEVEL + 4.4;   // 抬高到 8.43m，为后部放映机房留出净空

  const wallMat = darkPlaster(mats, 0x1c1310);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(-(X0 - X1), Z0 - Z1), mats.carpet);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(MIDX, LEVEL + 0.004, MIDZ);
  floor.receiveShadow = true;
  group.add(floor);

  /* 门洞门槛：上层走廊楼板到 x=-2.26 为止，厅内地面从 x=-2.62 起，
     中间 0.36m 是空的（细缝探针 14/154 命中空档）。补一块 1cm 门槛板：
     板高 0.10m，中心比楼面低 4cm，顶面正好落在 LEVEL+0.010
     （比厅内地毯 +0.004 高 6mm、比走廊楼板 +0 高 1cm），
     既读作门槛，也不会造成 >2cm 的高差突变或与两侧楼板共面 z-fighting。 */
  const threshold = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.10, 0.86), mats.wood
  );
  threshold.position.set(-2.44, LEVEL - 0.040, DOOR_Z);
  threshold.receiveShadow = true;
  group.add(threshold);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(-(X0 - X1), Z0 - Z1), wallMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(MIDX, CEIL, MIDZ);
  group.add(ceil);

  for (const z of [Z0, Z1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(-(X0 - X1), CEIL - LEVEL, 0.2), wallMat);
    wall.position.set(MIDX, (CEIL + LEVEL) / 2, z);
    wall.receiveShadow = true;
    group.add(wall);
  }
  const far = new THREE.Mesh(new THREE.BoxGeometry(0.2, CEIL - LEVEL, Z0 - Z1), wallMat);
  far.position.set(X0, (CEIL + LEVEL) / 2, MIDZ);
  far.receiveShadow = true;
  group.add(far);

  const gold = new BoxBatch(mats.gold);
  const goldDeep = new BoxBatch(mats.goldDeep);
  const wood = new BoxBatch(mats.wood);
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x3b3d40, roughness: 0.46, metalness: 0.6 });
  const steel = new BoxBatch(steelMat);
  const brass = new BoxBatch(mats.brass);
  const lensMat = new THREE.MeshStandardMaterial({
    color: 0xffd9a0,
    emissive: 0xffb863,
    emissiveIntensity: 0.85,
    roughness: 0.12,
    metalness: 0.15
  });

  /* 小银幕：尽端墙，暗银幕面只带一点放映余光 */
  const screenMat = new THREE.MeshStandardMaterial({
    color: 0xcfc7b6,
    emissive: 0x3a3024,
    emissiveIntensity: 0.55,
    roughness: 0.92,
    metalness: 0.02
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.35, 1.9), screenMat);
  screen.rotation.y = Math.PI / 2;
  screen.position.set(X0 + 0.14, LEVEL + 1.55, MIDZ);
  group.add(screen);
  // 银幕框：竖梃在两侧、横梃在上下，深度方向才是 3.55m
  for (const s of [-1, 1]) {
    gold.add(0.06, 2.12, 0.1, X0 + 0.18, LEVEL + 1.55, MIDZ + s * 1.78);
    goldDeep.add(0.08, 2.26, 0.12, X0 + 0.24, LEVEL + 1.55, MIDZ + s * 1.86);
  }
  gold.add(0.06, 0.12, 3.55, X0 + 0.18, LEVEL + 2.56, MIDZ);
  gold.add(0.06, 0.12, 3.55, X0 + 0.18, LEVEL + 0.54, MIDZ);
  wood.add(0.5, 0.1, 4.6, X0 + 0.2, LEVEL + 0.06, MIDZ);

  /* 侧墙吸音板：错缝排布，避免整面平墙 */
  const panelMat = mats.velvetWall.clone();
  panelMat.color.setHex(0x2c1a16);
  const panels = [];
  for (const z of [Z0 - 0.01, Z1 + 0.01]) {
    for (let i = 0; i < 3; i++) {
      const x = -3.6 - i * 1.9;
      const plane = new THREE.PlaneGeometry(1.55, 1.15);
      plane.rotateY(z === Z0 ? Math.PI : 0);
      plane.translate(x, LEVEL + 1.7 + (i % 2) * 0.35, z);
      panels.push(plane);
    }
  }
  const panelMesh = new THREE.Mesh(mergeGeometries(panels, false), panelMat);
  group.add(panelMesh);
  for (let i = 0; i < 3; i++) {
    goldDeep.add(1.62, 0.035, 0.04, -3.6 - i * 1.9, LEVEL + 2.3 + (i % 2) * 0.35, Z0 - 0.02);
    goldDeep.add(1.62, 0.035, 0.04, -3.6 - i * 1.9, LEVEL + 2.3 + (i % 2) * 0.35, Z1 + 0.02);
  }

  /* 放映窗：只做一圈木框与金内衬，窗洞本身透空，机房里的机身从窗内透出剪影 */
  const PW = 0.78;   // 窗洞净宽（沿 z）
  const PH = 0.50;   // 窗洞净高
  /* 机房底板随顶层楼板由 6.64 抬到 6.995（板底 = 7.10-0.105），
     窗洞与机身必须一起上移，否则窗洞下半截会落到机房地板以下。 */
  const BOOTH_FLOOR = 6.995;
  const RIG_Y = LEVEL + 3.415;        // 7.445，镜头轴线
  const PCY = RIG_Y;                  // 窗洞与镜头同轴
  const PZ = -25.6;  // 窗洞与机房同心
  wood.add(0.16, 0.09, PW + 0.26, X1 - 0.14, PCY + PH / 2 + 0.035, PZ);
  wood.add(0.16, 0.09, PW + 0.26, X1 - 0.14, PCY - PH / 2 - 0.035, PZ);
  wood.add(0.16, PH, 0.13, X1 - 0.14, PCY, PZ - PW / 2 - 0.055);
  wood.add(0.16, PH, 0.13, X1 - 0.14, PCY, PZ + PW / 2 + 0.055);
  goldDeep.add(0.05, 0.035, PW + 0.06, X1 - 0.23, PCY + PH / 2 + 0.01, PZ);
  goldDeep.add(0.05, 0.035, PW + 0.06, X1 - 0.23, PCY - PH / 2 - 0.01, PZ);
  goldDeep.add(0.05, PH, 0.035, X1 - 0.23, PCY, PZ - PW / 2 - 0.02);
  goldDeep.add(0.05, PH, 0.035, X1 - 0.23, PCY, PZ + PW / 2 + 0.02);

  /* 近端墙：把放映机房挡在墙后，墙上只留入口门洞与放映窗 */
  {
    const wallShape = new THREE.Shape();
    wallShape.moveTo(Z1, 0);
    wallShape.lineTo(Z0, 0);
    wallShape.lineTo(Z0, CEIL - LEVEL);
    wallShape.lineTo(Z1, CEIL - LEVEL);
    wallShape.closePath();
    const doorHole = new THREE.Path();
    doorHole.moveTo(-26.3, 0);
    doorHole.lineTo(-24.9, 0);
    doorHole.lineTo(-24.9, 2.2);
    doorHole.lineTo(-26.3, 2.2);
    doorHole.closePath();
    wallShape.holes.push(doorHole);
    const portHole = new THREE.Path();
    portHole.moveTo(-25.99, PCY - PH / 2 - LEVEL);
    portHole.lineTo(-25.21, PCY - PH / 2 - LEVEL);
    portHole.lineTo(-25.21, PCY + PH / 2 - LEVEL);
    portHole.lineTo(-25.99, PCY + PH / 2 - LEVEL);
    portHole.closePath();
    wallShape.holes.push(portHole);
    const nearWall = new THREE.Mesh(new THREE.ShapeGeometry(wallShape), wallMat);
    nearWall.rotation.y = -Math.PI / 2;
    nearWall.position.set(X1, LEVEL, 0);
    nearWall.receiveShadow = true;
    group.add(nearWall);
  }

  /* 门套与半开丝绒帘：挡住走廊直射光，中央留 0.68m 缝与东侧过道对齐 */
  for (const s of [-1, 1]) {
    wood.add(0.12, 2.28, 0.10, X1 - 0.08, LEVEL + 1.14, DOOR_Z + s * 0.73);
    goldDeep.add(0.13, 2.30, 0.03, X1 - 0.10, LEVEL + 1.14, DOOR_Z + s * 0.80);
  }
  wood.add(0.12, 0.16, 1.56, X1 - 0.08, LEVEL + 2.28, DOOR_Z);
  goldDeep.add(0.13, 0.03, 1.58, X1 - 0.10, LEVEL + 2.21, DOOR_Z);
  for (const s of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.14, 0.36), mats.velvet);
    panel.position.set(X1 - 0.08, LEVEL + 1.07, DOOR_Z + s * 0.52);
    group.add(panel);
  }
  gold.add(0.05, 0.05, 1.46, X1 - 0.09, LEVEL + 2.21, DOOR_Z);

  /* 放映机房：藏在近端墙后、走廊吊顶上方的小室，只有放映窗透光 */
  const BX0 = X1;          // 与厅内隔墙共用
  const BX1 = -2.02;       // 走廊墙内侧，进深 0.6m
  const BZ0 = -26.4;
  const BZ1 = -24.8;
  const BY0 = BOOTH_FLOOR;    // 机房底板板底 6.995 = 顶层楼板 7.10 - 0.105
  const BY1 = CEIL - 0.08;
  const boothMat = darkPlaster(mats, 0x17100d);
  const bmz = (BZ0 + BZ1) / 2;
  const bmx = (BX0 + BX1) / 2;
  // 后墙、两侧、顶板与底板各一片，围出一个可读的小机房
  const booth = new THREE.Group();
  const bFloor = new THREE.Mesh(new THREE.BoxGeometry(BX1 - BX0, 0.06, BZ1 - BZ0), boothMat);
  bFloor.position.set(bmx, BY0 + 0.03, bmz);
  booth.add(bFloor);
  const bCeil = new THREE.Mesh(new THREE.BoxGeometry(BX1 - BX0, 0.06, BZ1 - BZ0), boothMat);
  bCeil.position.set(bmx, BY1, bmz);
  booth.add(bCeil);
  const bRear = new THREE.Mesh(new THREE.BoxGeometry(0.06, BY1 - BY0, BZ1 - BZ0), boothMat);
  bRear.position.set(BX1, (BY0 + BY1) / 2, bmz);
  booth.add(bRear);
  for (const z of [BZ0, BZ1]) {
    const bw = new THREE.Mesh(new THREE.BoxGeometry(BX1 - BX0, BY1 - BY0, 0.06), boothMat);
    bw.position.set(bmx, (BY0 + BY1) / 2, z);
    booth.add(bw);
  }
  // 放映机机身与镜头剪影：只有轮廓，靠窗内的一点暖光勾出来
  const rig = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, 0.44), boothMat);
  rig.position.set(BX0 + 0.34, RIG_Y, MIDZ);
  booth.add(rig);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.16, 10), boothMat);
  lens.rotation.z = Math.PI / 2;
  lens.position.set(BX0 + 0.14, RIG_Y, MIDZ);
  booth.add(lens);
  // 镜头铜圈与玻璃面：从厅内抬头能认出这是一台放映机，而不只是黑盒子
  brass.add(0.03, 0.12, 0.12, BX0 + 0.055, RIG_Y, MIDZ);
  brass.add(0.02, 0.15, 0.15, BX0 + 0.085, RIG_Y, MIDZ);
  const boothLensGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.012, 14).rotateZ(Math.PI / 2)
    .translate(BX0 + 0.045, RIG_Y, MIDZ);
  group.add(new THREE.Mesh(boothLensGeo, lensMat));
  const rew = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 12), boothMat);
  rew.rotation.x = Math.PI / 2;
  rew.position.set(BX1 - 0.2, RIG_Y - 0.05, MIDZ - 0.4);
  booth.add(rew);
  group.add(booth);
  // 放映机向银幕的一束弱光：只有光斑，不做任何可辨认的几何光锥
  const beam = new THREE.SpotLight(0xffd9a8, 16, 9, 0.16, 0.85, 2);
  beam.position.set(BX0 + 0.16, RIG_Y, MIDZ);
  beam.target.position.set(X0 + 0.2, LEVEL + 1.55, MIDZ);
  group.add(beam);
  group.add(beam.target);

  /* 座椅：三排，面向银幕（-x） */
  const seatMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.02,
    emissive: new THREE.Color(0x22080a),
    emissiveIntensity: 0.18,
    envMapIntensity: 0.18
  });
  const seatCount = 18;
  const seats = new THREE.InstancedMesh(seatGeo, seatMat, seatCount);
  seats.frustumCulled = false;
  seats.castShadow = full;
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color().setRGB(0.4, 0.1, 0.11);
  let si = 0;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 6; c++) {
      dummy.position.set(-3.72 - r * 1.15, LEVEL, MIDZ - 1.55 + c * 0.62);
      dummy.rotation.set(0, Math.PI / 2, 0);
      dummy.scale.setScalar(0.86);
      dummy.updateMatrix();
      seats.setMatrixAt(si, dummy.matrix);
      seats.setColorAt(si, tint);
      si++;
    }
  }
  seats.instanceMatrix.needsUpdate = true;
  if (seats.instanceColor) seats.instanceColor.needsUpdate = true;
  group.add(seats);

  /* 两台胶片盘架在机身顶上，一小一大 */
  const reelMat = new THREE.MeshStandardMaterial({ color: 0x4b443a, roughness: 0.5, metalness: 0.55 });
  for (const [r, dz] of [[0.15, -0.16], [0.11, 0.14]]) {
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.035, 18), reelMat);
    reel.rotation.x = Math.PI / 2;
    reel.position.set(BX0 + 0.42, LEVEL + 3.21, MIDZ + dz);
    booth.add(reel);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.05, 10), mats.brass);
    hub.rotation.x = Math.PI / 2;
    hub.position.set(BX0 + 0.42, LEVEL + 3.21, MIDZ + dz);
    booth.add(hub);
  }
  // 机身侧面的一条暖光缝，勾出放映机的轮廓
  const boothGlow = new THREE.PointLight(0xffb877, 2.2, 2.2, 2);
  boothGlow.position.set(BX0 + 0.3, RIG_Y + 0.28, MIDZ);
  group.add(boothGlow);
  glows.push(addGlowSprite(mats, group, BX0 + 0.2, RIG_Y + 0.28, MIDZ, 0.7, 0.16));

  /* 银幕两侧的遮光帘：深红丝绒，落到地面 */
  for (const dz of [-2.05, 2.05]) {
    const drape = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.5, 0.62), mats.velvet);
    drape.position.set(X0 + 0.18, LEVEL + 1.75, MIDZ + dz);
    drape.receiveShadow = full;
    group.add(drape);
    goldDeep.add(0.12, 0.06, 0.68, X0 + 0.17, LEVEL + 3.48, MIDZ + dz);
  }

  /* 片目板：钉在近端墙内侧，正对座椅 */
  const listCanvas = document.createElement('canvas');
  listCanvas.width = 512;
  listCanvas.height = 340;
  {
    const g = listCanvas.getContext('2d');
    g.fillStyle = '#1a1310';
    g.fillRect(0, 0, 512, 340);
    g.strokeStyle = 'rgba(200,162,102,0.5)';
    g.lineWidth = 3;
    g.strokeRect(14, 14, 484, 312);
    g.fillStyle = '#c8a266';
    g.font = '600 34px Georgia, "Times New Roman", serif';
    g.fillText('本周片目', 36, 62);
    g.font = '400 15px Georgia, "Times New Roman", serif';
    g.fillStyle = 'rgba(206,186,156,0.55)';
    g.fillText('SCREENING · TWO NIGHTS', 36, 88);
    g.font = '400 20px Georgia, "Times New Roman", serif';
    const items = [
      ['11.08', '安静的几帧'],
      ['11.08', '雨停之前'],
      ['11.09', '红色片单'],
      ['11.09', '幕间']
    ];
    items.forEach(([d, t], i) => {
      const y = 132 + i * 42;
      g.fillStyle = 'rgba(206,186,156,0.45)';
      g.fillText(d, 36, y);
      g.fillStyle = 'rgba(226,208,180,0.86)';
      g.fillText(t, 132, y);
      g.strokeStyle = 'rgba(200,162,102,0.18)';
      g.beginPath();
      g.moveTo(36, y + 12);
      g.lineTo(476, y + 12);
      g.stroke();
    });
  }
  const listTex = new THREE.CanvasTexture(listCanvas);
  listTex.colorSpace = THREE.SRGBColorSpace;
  const listBoard = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 0.8),
    new THREE.MeshStandardMaterial({ map: listTex, roughness: 0.92, emissive: new THREE.Color(0x2a1c12), emissiveIntensity: 0.35 })
  );
  listBoard.rotation.y = -Math.PI / 2;
  listBoard.position.set(X1 - 0.05, LEVEL + 1.65, MIDZ + 1.6);
  group.add(listBoard);
  goldDeep.add(0.06, 0.9, 0.05, X1 - 0.04, LEVEL + 1.65, MIDZ + 0.98);
  goldDeep.add(0.06, 0.9, 0.05, X1 - 0.04, LEVEL + 1.65, MIDZ + 2.22);
  goldDeep.add(0.06, 0.05, 1.3, X1 - 0.04, LEVEL + 2.07, MIDZ + 1.6);

  /* 地上的胶片盒：三只扁圆铁盒，散在末排座椅脚边 */
  const caseMat = new THREE.MeshStandardMaterial({ color: 0x554b3e, roughness: 0.55, metalness: 0.5 });
  for (const [x, z, r] of [[-2.95, -24.28, 0.17], [-3.02, -24.66, 0.15], [-2.9, -25.02, 0.13]]) {
    const box = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.075, 16), caseMat);
    box.position.set(x, LEVEL + 0.04, z);
    group.add(box);
    const band = new THREE.Mesh(new THREE.TorusGeometry(r * 0.99, 0.008, 4, 16), mats.brass);
    band.rotation.x = Math.PI / 2;
    band.position.set(x, LEVEL + 0.078, z);
    group.add(band);
  }

  /* 前区陈列：一台 35mm 放映机与两只胶片盒，走到跟前能看清镜头与齿盘 */
  const DX = -6.72;
  const DZ = -27.94;
  wood.add(0.54, 0.86, 0.54, DX, LEVEL + 0.43, DZ);
  goldDeep.add(0.58, 0.035, 0.58, DX, LEVEL + 0.88, DZ);
  goldDeep.add(0.5, 0.028, 0.5, DX, LEVEL + 0.016, DZ);
  steel.add(0.5, 0.08, 0.56, DX, LEVEL + 0.92, DZ);
  steel.add(0.4, 0.3, 0.48, DX, LEVEL + 1.06, DZ);
  steel.add(0.2, 0.2, 0.32, DX + 0.27, LEVEL + 1.0, DZ);
  brass.add(0.44, 0.03, 0.52, DX, LEVEL + 1.22, DZ);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.086, 0.15, 14), mats.brass);
  barrel.rotation.z = Math.PI / 2;
  barrel.position.set(DX + 0.42, LEVEL + 1.1, DZ);
  group.add(barrel);
  const dispLens = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.012, 16), lensMat);
  dispLens.rotation.z = Math.PI / 2;
  dispLens.position.set(DX + 0.5, LEVEL + 1.1, DZ);
  group.add(dispLens);
  // 两只齿盘：轴向朝厅内，盘面上的十字轮辐用铜条拼出来
  for (const [r, dz] of [[0.19, -0.15], [0.14, 0.16]]) {
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.026, 20), mats.brass);
    reel.rotation.x = Math.PI / 2;
    reel.position.set(DX - 0.04, LEVEL + 1.36, DZ + dz);
    group.add(reel);
    for (const off of full ? [-0.014, 0.014] : []) {
      brass.add(r * 1.75, 0.014, 0.008, DX - 0.04, LEVEL + 1.36, DZ + dz + off);
      brass.add(0.014, r * 1.75, 0.008, DX - 0.04, LEVEL + 1.36, DZ + dz + off);
    }
  }
  // 头顶的导片臂
  steel.add(0.03, 0.22, 0.03, DX - 0.04, LEVEL + 1.27, DZ + 0.16);
  steel.add(0.03, 0.16, 0.03, DX - 0.04, LEVEL + 1.3, DZ - 0.15);
  // 踏板与铭牌
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 256;
  labelCanvas.height = 96;
  {
    const g = labelCanvas.getContext('2d');
    g.fillStyle = '#17110d';
    g.fillRect(0, 0, 256, 96);
    g.strokeStyle = 'rgba(206,166,102,0.75)';
    g.lineWidth = 3;
    g.strokeRect(7, 7, 242, 82);
    g.fillStyle = '#d8b77c';
    g.font = '600 24px Georgia, serif';
    g.textAlign = 'center';
    g.fillText('35 mm', 128, 42);
    g.font = '400 17px "Songti SC", "SimSun", serif';
    g.fillStyle = 'rgba(216,183,124,0.82)';
    g.fillText('私藏放映机 · 不借出', 128, 70);
  }
  const labelTex = new THREE.CanvasTexture(labelCanvas);
  labelTex.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(0.32, 0.12),
    new THREE.MeshBasicMaterial({ map: labelTex, toneMapped: true })
  );
  label.rotation.y = Math.PI / 2;
  label.position.set(DX + 0.275, LEVEL + 0.64, DZ);
  group.add(label);
  brass.add(0.012, 0.145, 0.355, DX + 0.272, LEVEL + 0.64, DZ);
  // 镜头里的余光
  const lensGlow = addGlowSprite(mats, group, DX + 0.56, LEVEL + 1.1, DZ, 0.42, 0.18);
  glows.push(lensGlow);
  // 陈列旁边的两只胶片盒
  for (const [x, z, r] of [[-7.42, -27.42, 0.15], [-7.38, -27.68, 0.12]]) {
    const box = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.075, 16), caseMat);
    box.position.set(x, LEVEL + 0.04, z);
    group.add(box);
    const band = new THREE.Mesh(new THREE.TorusGeometry(r * 0.99, 0.008, 4, 16), mats.brass);
    band.rotation.x = Math.PI / 2;
    band.position.set(x, LEVEL + 0.078, z);
    group.add(band);
  }

  const contactMat = makeContactMaterial(mats, 0.4);
  const contactGeo = new THREE.PlaneGeometry(1, 1);
  contactGeo.rotateX(-Math.PI / 2);
  const contact = new THREE.InstancedMesh(contactGeo, contactMat, seatCount + 3);
  contact.frustumCulled = false;
  contact.renderOrder = 1;
  let ci = 0;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 6; c++) {
      dummy.position.set(-3.55 - r * 1.15, LEVEL + 0.014, MIDZ - 1.55 + c * 0.62);
      dummy.rotation.set(0, Math.PI / 2, 0);
      dummy.scale.set(0.62, 1, 0.52);
      dummy.updateMatrix();
      contact.setMatrixAt(ci++, dummy.matrix);
    }
  }
  for (const [x, z, w, d] of [[DX, DZ, 0.8, 0.8], [-7.42, -27.42, 0.42, 0.42], [-7.38, -27.68, 0.36, 0.36]]) {
    dummy.position.set(x, LEVEL + 0.016, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(w, 1, d);
    dummy.updateMatrix();
    contact.setMatrixAt(ci++, dummy.matrix);
  }
  contact.instanceMatrix.needsUpdate = true;
  group.add(contact);

  /* 暗部：只留几点低强度光与壁灯光晕 */
  const lights = [];
  const addLight = (light) => { group.add(light); lights.push({ light, base: light.intensity }); };
  const screenGlow = new THREE.PointLight(0xffcf9c, 4.2, 6.5, 2);
  screenGlow.position.set(X0 + 1.0, LEVEL + 1.5, MIDZ);
  addLight(screenGlow);
  const portLight = new THREE.PointLight(PALETTE.warm, 2.2, 2.6, 2);
  // 从机房后上方打回机身，窗内是剪影轮廓而不是一片橙色平光
  portLight.position.set(BX1 - 0.08, BY1 - 0.95, MIDZ - 0.1);
  addLight(portLight);
  const boxGlow = new THREE.PointLight(0x7f8fa0, 1.4, 3.0, 2);
  boxGlow.position.set(BX1 - 0.25, BY1 - 0.4, MIDZ);
  addLight(boxGlow);
  lights.push({ light: beam, base: beam.intensity });
  const floorGlow = new THREE.PointLight(0x8d6a4a, 1.8, 5.5, 2);
  floorGlow.position.set(MIDX, LEVEL + 0.6, MIDZ);
  addLight(floorGlow);

  /* 陈列灯：铜罩压在放映机上方，走到跟前才看清镜头、齿盘与铭牌 */
  const exShade = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.16, 14), mats.brass);
  exShade.position.set(DX, LEVEL + 2.62, DZ);
  group.add(exShade);
  const exLight = new THREE.SpotLight(0xffd9ae, 5.5, 4.5, 0.5, 0.65, 2);
  exLight.position.set(DX, LEVEL + 2.52, DZ);
  exLight.target.position.set(DX, LEVEL + 1.0, DZ);
  group.add(exLight.target);
  addLight(exLight);
  glows.push(addGlowSprite(mats, group, DX, LEVEL + 2.5, DZ, 0.36, 0.16));

  // 放映窗不再叠发光贴图：亮部由机房内的实光透出，窗口里才看得见机身剪影
  const screenHalo = addGlowSprite(mats, group, X0 + 0.55, LEVEL + 1.55, MIDZ, 1.15, 0.12);
  glows.push(screenHalo);

  // 门内侧的暗色门套，与走廊门洞对齐
  goldDeep.add(0.06, 2.16, 0.06, X1 + 0.01, LEVEL + 1.08, -24.9);
  goldDeep.add(0.06, 2.16, 0.06, X1 + 0.01, LEVEL + 1.08, -26.3);
  goldDeep.add(0.06, 0.06, 1.46, X1 + 0.01, LEVEL + 2.16, -25.6);

  gold.build(group);
  goldDeep.build(group);
  wood.build(group);
  steel.build(group);
  brass.build(group);

  mergeStatic(group);

  return { group, lights };
}

/* ---------- 可进入的特邀包厢：只补铭牌与一盏可读的灯 ----------
   draw call 预算 10（静置机位实测 9 / 近景机位 8）。
   座位由马蹄廊实例化生成；这里只加小桌、节目单、酒水与栏杆收头。 */
function buildGuestBox(scene, mats, glows) {
  const group = new THREE.Group();
  scene.add(group);

  const goldDeep = new BoxBatch(mats.goldDeep);
  const wood = new BoxBatch(mats.wood);
  const brass = new BoxBatch(mats.brass);
  const paperMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc2, roughness: 0.95, metalness: 0 });
  const paper = new BoxBatch(paperMat);
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x93a894,
    roughness: 0.12,
    metalness: 0.05,
    transparent: true,
    opacity: 0.55,
    depthWrite: false
  });

  const wallX = 5.88;
  const z = -40.2;
  goldDeep.add(0.05, 0.32, 0.62, wallX, LEVEL + 1.56, z);
  wood.add(0.02, 0.26, 0.54, wallX - 0.04, LEVEL + 1.56, z);
  const crest = new THREE.Mesh(new THREE.CircleGeometry(0.16, 18), mats.crest);
  crest.rotation.y = -Math.PI / 2;
  crest.position.set(wallX - 0.065, LEVEL + 1.68, z);
  group.add(crest);

  /* 包厢内：小方桌、摊开的节目单、一瓶酒与两只杯 */
  const TX = 4.68;
  const TZ = -40.66;
  wood.add(0.32, 0.045, 0.32, TX, LEVEL + 0.56, TZ);
  for (const [dx, dz] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]]) {
    wood.add(0.032, 0.54, 0.032, TX + dx, LEVEL + 0.27, TZ + dz);
  }
  brass.add(0.26, 0.02, 0.02, TX, LEVEL + 0.12, TZ - 0.12);
  brass.add(0.26, 0.02, 0.02, TX, LEVEL + 0.12, TZ + 0.12);
  brass.add(0.02, 0.02, 0.26, TX - 0.12, LEVEL + 0.12, TZ);
  brass.add(0.02, 0.02, 0.26, TX + 0.12, LEVEL + 0.12, TZ);
  paper.add(0.17, 0.008, 0.24, TX + 0.02, LEVEL + 0.587, TZ);
  paper.add(0.015, 0.15, 0.1, TX + 0.1, LEVEL + 0.66, TZ - 0.02);
  brass.add(0.012, 0.02, 0.11, TX + 0.108, LEVEL + 0.74, TZ - 0.02);

  const glassGeos = [];
  glassGeos.push(new THREE.CylinderGeometry(0.04, 0.04, 0.225, 12).translate(TX - 0.085, LEVEL + 0.67, TZ - 0.035));
  glassGeos.push(new THREE.CylinderGeometry(0.026, 0.028, 0.082, 10).translate(TX + 0.04, LEVEL + 0.62, TZ + 0.08));
  glassGeos.push(new THREE.CylinderGeometry(0.026, 0.028, 0.082, 10).translate(TX + 0.09, LEVEL + 0.62, TZ - 0.1));
  group.add(new THREE.Mesh(mergeGeometries(glassGeos, false), glassMat));
  brass.add(0.026, 0.048, 0.026, TX - 0.085, LEVEL + 0.8, TZ - 0.035);
  paper.add(0.07, 0.065, 0.006, TX - 0.085, LEVEL + 0.685, TZ + 0.005);

  /* 栏杆收头：入口两侧的铜柱与地面铜条，补足内侧细节 */
  const postGeos = [];
  for (const dz of [-0.66, 0.66]) {
    postGeos.push(new THREE.CylinderGeometry(0.028, 0.034, 0.96, 10).translate(4.28, LEVEL + 0.48, z + dz));
    postGeos.push(new THREE.SphereGeometry(0.048, 10, 8).translate(4.28, LEVEL + 0.99, z + dz));
    postGeos.push(new THREE.BoxGeometry(0.1, 0.03, 0.1).translate(4.28, LEVEL + 0.03, z + dz));
  }
  group.add(new THREE.Mesh(mergeGeometries(postGeos, false), mats.brass));
  brass.add(0.5, 0.014, 0.024, 4.28, LEVEL + 0.018, z);
  for (const dz of [-0.54, 0.54]) {
    brass.add(0.03, 0.03, 0.09, 4.28, LEVEL + 0.92, z + dz);
  }
  // 侧墙内侧的铜挂钩：大衣与围巾有地方挂
  for (const dz of [-0.68, 0.68]) {
    brass.add(0.1, 0.025, 0.025, 5.62, LEVEL + 1.42, z + dz);
    brass.add(0.025, 0.06, 0.025, 5.58, LEVEL + 1.39, z + dz);
  }

  contactBatch(group, mats, [
    [TX, LEVEL + 0.006, TZ, 0.56, 0.56],
    [4.28, LEVEL + 0.006, z - 0.66, 0.2, 0.2],
    [4.28, LEVEL + 0.006, z + 0.66, 0.2, 0.2]
  ], 0.34);

  const lamp = new THREE.PointLight(0xffbe86, 4.2, 4.6, 2);
  lamp.position.set(4.9, LEVEL + 2.1, z);
  group.add(lamp);
  const halo = addGlowSprite(mats, group, 4.85, LEVEL + 2.05, z, 1.1, 0.32);
  glows.push(halo);

  goldDeep.build(group);
  wood.build(group);
  brass.build(group);
  paper.build(group);

  mergeStatic(group);

  return { group, lamp };
}

export function buildExtraSpaces(scene, mats, quality) {
  const full = quality.tier === 'full';
  const glows = [];
  const seatGeo = seatGeometry();

  const backstage = buildBackstage(scene, mats, full, glows);
  const screening = buildScreening(scene, mats, full, glows, seatGeo);
  const guestBox = buildGuestBox(scene, mats, glows);

  const roomLights = {
    backstage: backstage.lights,
    screening: screening.lights,
    box: [{ light: guestBox.lamp, base: guestBox.lamp.intensity }]
  };
  const lights = [...roomLights.backstage, ...roomLights.screening, ...roomLights.box];
  const roomLevel = { backstage: 1, screening: 1, box: 1 };

  let level = 1;
  function applyLights() {
    for (const room of Object.keys(roomLights)) {
      const v = level * roomLevel[room];
      for (const { light, base } of roomLights[room]) light.intensity = base * v;
    }
  }

  function setLevel(v) {
    level = v;
    applyLights();
    backstage.bulbHalo.material.opacity = 0.5 * (0.3 + 0.7 * v);
    glows.forEach((g) => {
      g.material.opacity = (g.userData.baseOpacity || 0.5) * (0.25 + 0.75 * v);
    });
  }

  // 巡游抵达时按房间单独淡入，三个附房互不牵连
  function setRoomLevel(room, v) {
    if (!(room in roomLevel)) return;
    roomLevel[room] = Math.max(0, Math.min(1, v));
    applyLights();
  }

  setLevel(1);

  return {
    group: new THREE.Group(),
    backstage,
    screening,
    guestBox,
    setLevel,
    setRoomLevel,
    get level() { return level; }
  };
}
