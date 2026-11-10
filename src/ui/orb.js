import * as THREE from 'three';
import { houseFloorY } from '../world/plan.js';
import { SHELL, hipRoofGeometry, gableRoofGeometry, mansardRoofGeometry } from '../world/shell.js';
import { mergeStatic } from '../world/utils.js';

/* ============================================================
   角落玻璃球 / 鸟瞰台
   - 一颗常驻角落的玻璃球：球内是建筑简模，随视角反向缓转
   - 点击后铜圈掀开，建筑放到深色木台上，变成可旋转的鸟瞰台
   - 鸟瞰台使用独立渲染器与独立场景，展开时主场景暂停渲染
   ============================================================ */

const SPACES = [
  { id: 'foyer', label: '门厅', nav: 'foyer', anchor: [0, 15.4, -5.2], mark: [0, 2.2, -6.5] },
  { id: 'corridor', label: '走廊', nav: 'foyer', anchor: null, mark: [0, 2.2, -23] },
  { id: 'auditorium', label: '观众席', nav: 'auditorium', anchor: [0, 16.2, -33.8], mark: [5.2, 2.4, -37] },
  { id: 'stage', label: '舞台', nav: 'stage', anchor: [0, 20.8, -52.4], mark: [0, 2.4, -53] },
  { id: 'workshop', label: '创意工坊', nav: 'workshop', ready: true, anchor: [8.4, 8.6, -62.4], mark: [8.4, 2.2, -62.4] },
  { id: 'backstage', label: '后台', nav: 'backstage', ready: true, anchor: [0, 11.6, -63], mark: [0, 2.2, -63] },
  { id: 'screening', label: '放映厅', nav: 'screening', ready: true, anchor: [-9.7, 9.8, -25.6], mark: [-7.6, 4.4, -25.6] },
  { id: 'gallery', label: '二楼楼座', nav: 'gallery', anchor: [7.4, 15.8, -37.4], mark: [6.4, 4.4, -37.6] },
  { id: 'box', label: '包厢', nav: 'box', anchor: [11.2, 14.4, -41.0], mark: [7.2, 4.4, -41.0] },
  { id: 'about', label: '主理人办公室', nav: 'about', ready: true, anchor: [-10.6, 7.6, -64.2], mark: [-10.5, 2.0, -64.2] }
];

/* ---------- 贴图小工具 ---------- */
function makeSignTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 320;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = '#0e0a07';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(190,150,90,0.5)';
  g.lineWidth = 6;
  g.strokeRect(10, 10, c.width - 20, c.height - 20);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#e3c28b';
  g.font = '400 132px "Songti SC", "STSong", "SimSun", serif';
  g.fillText('泫', c.width / 2 - 88, 128);
  g.fillText('咏', c.width / 2 + 88, 128);
  g.fillStyle = 'rgba(216,188,142,0.85)';
  g.font = '300 32px Georgia, "Times New Roman", serif';
  g.letterSpacing = '10px';
  g.fillText('RAINSABOVE', c.width / 2, 248);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeLabelTexture(text) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.font = '500 30px Georgia, "Times New Roman", serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(214,186,132,0.8)';
  g.fillText(text, c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    opacity: 0.65,
    toneMapped: false
  }));
  sprite.scale.set(7, 1.75, 1);
  return sprite;
}

function glowSprite(mats, parent, x, y, z, scale, opacity, color) {
  const mat = mats.glow.clone();
  mat.opacity = opacity;
  if (color) mat.color.set(color);
  const s = new THREE.Sprite(mat);
  s.position.set(x, y, z);
  s.scale.set(scale, scale, 1);
  s.userData.baseOpacity = opacity;
  parent.add(s);
  return s;
}

/* ---------- 简模：外壳 + interiors + 窗带 ---------- */
function buildMiniModel(mats, detail) {
  const group = new THREE.Group();

  const stone = new THREE.MeshStandardMaterial({
    color: 0xbfae92,
    roughness: 0.92,
    metalness: 0.04,
    side: THREE.DoubleSide
  });
  const stoneLight = new THREE.MeshStandardMaterial({
    color: 0xd2c3a8,
    roughness: 0.88,
    metalness: 0.04,
    side: THREE.DoubleSide
  });
  // 定稿 C：石墨黑屋面 + 暖米色石灰岩
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x373d45,
    roughness: 0.55,
    metalness: 0.3,
    emissive: 0x161a20,
    emissiveIntensity: 0.62,
    side: THREE.DoubleSide
  });
  const ribMat = new THREE.MeshStandardMaterial({
    color: 0x38332b,
    roughness: 0.98,
    metalness: 0.0,
    side: THREE.DoubleSide
  });
  const copperEdge = new THREE.MeshStandardMaterial({
    color: 0xc2a06a,
    roughness: 0.32,
    metalness: 0.52,
    emissive: 0x3a2a12,
    emissiveIntensity: 0.85
  });
  const interior = new THREE.MeshStandardMaterial({
    color: 0x2d231b,
    roughness: 0.95,
    side: THREE.DoubleSide
  });
  const seatMat = new THREE.MeshStandardMaterial({
    color: 0x4a171b,
    roughness: 0.9,
    side: THREE.DoubleSide
  });
  const brass = new THREE.MeshStandardMaterial({
    color: 0x8d6a3c,
    roughness: 0.5,
    metalness: 0.55
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x14110d,
    roughness: 0.7,
    metalness: 0.15
  });

  const windows = {};
  const spill = {};

  function box(w, h, d, x, y, z, mat, ry = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    if (ry) mesh.rotation.y = ry;
    group.add(mesh);
    return mesh;
  }

  function windowBand(space, x, y, z, w, h, ry = 0) {
    if (!windows[space]) {
      windows[space] = new THREE.MeshBasicMaterial({
        color: 0xffb46a,
        transparent: true,
        opacity: 0.9,
        toneMapped: false,
        side: THREE.DoubleSide
      });
    }
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), windows[space]);
    mesh.position.set(x, y, z);
    if (ry) mesh.rotation.y = ry;
    group.add(mesh);
    return mesh;
  }

  /* ---------- 外壳：与主场景共用 SHELL 的真实体量 ---------- */
  const F = SHELL.FRONT;
  const L = SHELL.LINK;
  const H = SHELL.HOUSE;
  const T = SHELL.STAGE;
  const B = SHELL.BACK;
  const WS = SHELL.WORKSHOP;
  const OF = SHELL.OFFICE;
  const S = SHELL.SCREEN;
  const D = SHELL.DOCK;
  const SD = SHELL.STAGE_DOOR;

  const warmMat = new THREE.MeshBasicMaterial({ color: 0xffb46a, toneMapped: false });
  const domeMat = new THREE.MeshStandardMaterial({
    color: 0x30363e,
    roughness: 0.5,
    metalness: 0.16,
    emissive: 0x161a20,
    emissiveIntensity: 0.9,
    side: THREE.DoubleSide
  });

  function roof(w, d, h, inset, x, y, z) {
    const mesh = new THREE.Mesh(hipRoofGeometry(w, d, h, inset), roofMat);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }

  function gableRoof(w, d, h, x, y, z) {
    const mesh = new THREE.Mesh(gableRoofGeometry(w, d, h), roofMat);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }

  function mansardRoof(w, d, hLower, hUpper, inset, inset2, x, y, z) {
    const mesh = new THREE.Mesh(mansardRoofGeometry(w, d, hLower, hUpper, inset, inset2), roofMat);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }

  function houseOuterX(z) {
    const t = (z - H.z0) / (H.z1 - H.z0);
    return H.half + H.bow * Math.sin(Math.PI * Math.max(0, Math.min(1, t)));
  }

  /* 基座：各体量各一块台基，轮廓读得出来 */
  box(F.half * 2 + 0.8, 0.8, F.z0 - F.z1 + 0.6, 0, 0.4, (F.z0 + F.z1) / 2, stoneLight);
  box(L.half * 2 + 0.6, 0.7, L.z0 - L.z1, 0, 0.35, (L.z0 + L.z1) / 2, stoneLight);
  box(H.half * 2 + 1.0, 0.9, H.z0 - H.z1 + 0.6, 0, 0.45, (H.z0 + H.z1) / 2, stoneLight);
  box(T.wingHalf * 2 + 0.9, 0.9, T.z0 - T.z1 + 0.5, 0, 0.45, (T.z0 + T.z1) / 2, stoneLight);
  box(B.half * 2 + 0.7, 0.8, B.z0 - B.z1 + 0.4, 0, 0.4, (B.z0 + B.z1) / 2, stoneLight);
  box(WS.x1 - WS.x0 + 0.5, 0.5, WS.z0 - WS.z1 + 0.4, (WS.x0 + WS.x1) / 2, 0.25, (WS.z0 + WS.z1) / 2, stoneLight);
  box(OF.x1 - OF.x0 + 0.4, 0.4, OF.z0 - OF.z1 + 0.4, (OF.x0 + OF.x1) / 2, 0.2, (OF.z0 + OF.z1) / 2, stoneLight);

  /* 门厅：定稿 C 的体量——左高右低、中央拱门、低翼竖肋、平缓四坡顶 */
  const frontEave = F.eave;
  for (const sign of [-1, 1]) {
    box(0.7, frontEave, F.z0 - F.z1, sign * F.half, frontEave / 2, (F.z0 + F.z1) / 2, stone);
    box(F.half - L.half, frontEave, 0.6, sign * (F.half + L.half) / 2, frontEave / 2, F.z1, stone);
  }
  // 低翼（右）：密排竖肋 + 檐口金线
  box(F.half - 2.5, frontEave, 0.5, (F.half + 2.5) / 2, frontEave / 2, F.z0 + 0.25, stone);
  for (let x = 3.2; x <= F.half - 0.5; x += 0.62) {
    box(0.18, 8.2, 0.16, x, 5.3, F.z0 + 0.5, ribMat);
  }
  box(F.half - 2.8, 0.14, 0.2, (F.half + 2.5) / 2, frontEave - 0.1, F.z0 + 0.52, brass);
  // 高翼（左）：三组壁龛 + 石质雕像体块
  box(F.half - 2.4, 12.6, 0.6, -(F.half + 2.5) / 2, 6.3, F.z0 + 0.3, stone);
  for (const x of [-8.5, -6.3, -4.1]) {
    box(1.5, 3.0, 0.03, x, 5.5, F.z0 + 0.62, dark);
    box(0.5, 0.4, 0.4, x, 4.25, F.z0 + 0.66, stoneLight);
    box(0.34, 1.15, 0.3, x, 5.3, F.z0 + 0.66, stoneLight);
    box(0.24, 0.28, 0.26, x, 6.02, F.z0 + 0.66, stoneLight);
  }
  for (let x = -(F.half - 0.5); x <= -3.2; x += 0.62) {
    if ([-8.5, -6.3, -4.1].some((nx) => Math.abs(x - nx) < 1.25)) continue;
    box(0.18, 10.4, 0.16, x, 6.4, F.z0 + 0.55, ribMat);
  }
  // 中央拱门：深色门洞 + 半环拱圈 + 门柱 + 门后暖光
  box(5.3, 6.5, 0.3, 0, 3.95, F.z0 + 0.5, dark);
  const archRing = new THREE.Mesh(new THREE.TorusGeometry(2.65, 0.32, 6, 20, Math.PI), stoneLight);
  archRing.position.set(0, 7.2, F.z0 + 0.72);
  group.add(archRing);
  box(0.5, 6.2, 0.5, -2.95, 3.1, F.z0 + 0.62, stone);
  box(0.5, 6.2, 0.5, 2.95, 3.1, F.z0 + 0.62, stone);
  const doorBack = new THREE.MeshBasicMaterial({ color: 0x8a4a1e, toneMapped: false });
  box(4.6, 4.2, 0.06, 0, 3.0, F.z0 + 0.64, doorBack);
  box(3.5, 4.0, 0.12, 0, 2.9, F.z0 + 0.72, dark);
  box(0.08, 3.7, 0.1, 0, 2.9, F.z0 + 0.8, brass);
  // 阁楼与檐口石线
  box(5.0, 3.4, 0.5, 0, 9.6, F.z0 + 0.4, stone);
  box(5.2, 0.36, 0.6, 0, 11.4, F.z0 + 0.4, stoneLight);

  // 台阶（简模只保留三级）
  for (let i = 0; i < 3; i++) {
    box(7.6 - i * 0.6, 0.16, 0.5, 0, 0.08 + (2 - i) * 0.16, F.z0 + 1.55 + i * 0.5, stoneLight);
  }

  const fMidZ = (F.z0 + F.z1) / 2;
  roof(F.half * 2 + 0.9, F.z0 - F.z1 + 0.7, 1.9, 3.2, 0, frontEave, fMidZ);
  // 檐口亮石压顶：与 C 一样靠明度差勾边
  box(F.half * 2 + 0.8, 0.22, 0.3, 0, frontEave - 0.08, F.z0 + 0.1, stoneLight);
  box(0.3, 0.22, F.z0 - F.z1 - 4.2, 0, frontEave + 1.86, fMidZ, stoneLight);

  // 室内楼板：马蹄形平面（台口侧宽 16m，尾端收窄后半圆）
  const houseShape = new THREE.Shape();
  houseShape.moveTo(-8, 47.6);
  houseShape.lineTo(8, 47.6);
  houseShape.lineTo(4.6, 35.1);
  houseShape.absarc(0, 35.1, 4.6, 0, Math.PI, true);
  houseShape.lineTo(-8, 47.6);
  const houseGeo = new THREE.ShapeGeometry(houseShape, 16);
  houseGeo.rotateX(-Math.PI / 2);
  // 简模里把 1.45m 的池座坡面压缩成约 0.44m 的视觉抬升，读得出坡向又不会顶到一层包厢
  const hp = houseGeo.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    hp.setY(i, 1.52 + houseFloorY(hp.getZ(i)) * 0.3);
  }
  houseGeo.computeVertexNormals();
  const houseFloor = new THREE.Mesh(houseGeo, interior);
  group.add(houseFloor);

  // 收分侧墙与尾部半圆弧墙
  const sideLen = Math.hypot(3.4, 12.5);
  const sideYaw = Math.atan2(3.4, 12.5);
  for (const sign of [-1, 1]) {
    box(0.24, 8.6, sideLen, sign * 6.3, 5.9, -41.35, interior, -sign * sideYaw);
  }
  const apseGeo = new THREE.CylinderGeometry(4.6, 4.6, 8.6, 16, 1, true, -Math.PI / 2, Math.PI);
  const apse = new THREE.Mesh(apseGeo, interior);
  apse.position.set(0, 5.9, -35.1);
  group.add(apse);

  // 三层包厢：越上层越浅；顶层敞开
  for (const sign of [-1, 1]) {
    for (let t = 0; t < 3; t++) {
      const y = 2.02 + t * 2.01;
      const ry = -sign * sideYaw;
      box(1.0, 0.14, sideLen, sign * (6.3 - 0.964 * 2.2), y, -41.35, interior, ry);
      if (detail && t < 3) {
        const rx = sign * (6.3 - 0.964 * (t === 2 ? 2.76 : 2.92));
        box(0.1, 0.85, sideLen, rx, y + 0.52, -41.35, brass, ry);
        box(0.12, 0.06, sideLen, rx, y + 0.95, -41.35, brass, ry);
      }
    }
  }

  // 二楼环廊：尾端平台 + 两侧弧廊，再接墙外包厢后廊
  const ringGeo = new THREE.RingGeometry(2.85, 4.6, 16, 1, 0, Math.PI);
  ringGeo.rotateX(Math.PI / 2);
  const ringProm = new THREE.Mesh(ringGeo, interior);
  ringProm.position.set(0, 4.03, -35.1);
  group.add(ringProm);
  box(7.4, 0.26, 1.7, 0, 4.03, -31.42, interior);
  box(0.16, 0.95, 7.4, 0, 4.5, -32.3, brass, Math.PI / 2);

  // 观众席：同心弧座块，三条弧带随马蹄形收窄；标高按池座坡面逐带抬起
  const bands = [
    { r: 9.6, w: 3.1, a: 0.52 },
    { r: 12.7, w: 3.2, a: 0.40 },
    { r: 15.9, w: 3.2, a: 0.28 }
  ];
  for (const band of bands) {
    const g = new THREE.RingGeometry(band.r, band.r + band.w, 18, 1, Math.PI / 2 - band.a, band.a * 2);
    g.rotateX(Math.PI / 2);
    const mesh = new THREE.Mesh(g, seatMat);
    // 弧带中点约在 z = -55 + r；简模里坡面压缩到 0.3，避免顶到一层包厢
    mesh.position.set(0, 1.52 + houseFloorY(-55.0 + band.r) * 0.3, -55.0);
    group.add(mesh);
  }

  // 舞台与台口
  box(13.4, 1.0, 9.6, 0, 1.9, -52.4, interior);
  box(0.8, 9.0, 0.9, -6.7, 6.3, -47.9, stoneLight);
  box(0.8, 9.0, 0.9, 6.7, 6.3, -47.9, stoneLight);
  box(13.4, 1.2, 0.9, 0, 10.4, -47.9, stoneLight);
  const curtain = box(12.6, 8.2, 0.12, 0, 5.6, -48.3, new THREE.MeshStandardMaterial({
    color: 0x4b1418,
    roughness: 0.95,
    side: THREE.DoubleSide
  }));
  curtain.position.z = -48.4;

  /* 连廊：低体量 + 放映厅凸块 + 屋脊天窗 */
  const lMid = (L.z0 + L.z1) / 2;
  box(0.55, L.eave, L.z0 - L.z1, L.half, L.eave / 2, lMid, stone);
  box(0.5, S.top, S.z1 - S.z0, S.x0, S.top / 2, (S.z0 + S.z1) / 2, stone);
  box(S.x1 - S.x0 + 0.5, S.top, 0.5, (S.x0 + S.x1) / 2, S.top / 2, S.z0, stone);
  box(S.x1 - S.x0 + 0.5, S.top, 0.5, (S.x0 + S.x1) / 2, S.top / 2, S.z1, stone);
  box(S.x1 - S.x0 + 0.4, 0.28, S.z1 - S.z0 + 0.3, (S.x0 + S.x1) / 2, S.top + 0.14, (S.z0 + S.z1) / 2, stoneLight);
  box(0.55, L.eave, L.z0 - S.z1, -L.half, L.eave / 2, (L.z0 + S.z1) / 2, stone);
  box(0.55, L.eave, S.z0 - L.z1, -L.half, L.eave / 2, (S.z0 + L.z1) / 2, stone);
  for (const sign of [-1, 1]) {
    box(H.half - L.half, L.eave, 0.55, sign * (H.half + L.half) / 2, L.eave / 2, L.z1, stone);
  }
  roof(L.half * 2 + 0.7, L.z0 - L.z1 + 0.5, L.ridge - L.eave, L.inset, 0, L.eave, lMid);
  for (const z of [-19.8, -23.4, -27.0]) {
    box(0.26, 0.5, 2.2, 0, L.ridge + 0.28, z, warmMat);
    box(0.34, 0.1, 2.4, 0, L.ridge + 0.06, z, brass);
  }
  // 放映厅内部（只在剖切里看）
  box(3.0, 0.2, 5.4, -7.4, 4.03, -25.8, interior);
  box(0.12, 3.4, 5.4, -8.9, 5.73, -25.8, interior);

  /* 观众厅：外弧墙 + 鼓座 + 穹顶 + 采光亭 */
  const curveSeg = 16;
  const plan = new THREE.Shape();
  plan.moveTo(H.half, -H.z0);
  for (let i = 1; i <= curveSeg; i++) {
    const t = i / curveSeg;
    const z = H.z0 + (H.z1 - H.z0) * t;
    plan.lineTo(houseOuterX(z), -z);
  }
  plan.lineTo(-H.half, -H.z1);
  for (let i = curveSeg - 1; i >= 0; i--) {
    const t = i / curveSeg;
    const z = H.z0 + (H.z1 - H.z0) * t;
    plan.lineTo(-houseOuterX(z), -z);
  }
  plan.closePath();
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
  plan.holes.push(hole);
  const shellGeo = new THREE.ExtrudeGeometry(plan, {
    depth: H.eave,
    bevelEnabled: false,
    curveSegments: 12
  });
  shellGeo.rotateX(-Math.PI / 2);
  group.add(new THREE.Mesh(shellGeo, stone));

  // 尾端与台口侧的收头
  for (const sign of [-1, 1]) {
    box(H.half - L.half + 0.3, H.eave, 0.5, sign * (H.half + L.half) / 2, H.eave / 2, H.z0, stone);
    box(H.half - T.towerHalf + 0.2, H.eave, 0.5, sign * (H.half + T.towerHalf) / 2, H.eave / 2, H.z1, stone);
  }
  box(H.half * 2, H.eave - L.eave, 0.5, 0, (H.eave + L.eave) / 2, H.z0, stone);
  // 两道铜线脚跟着外弧走：把二层与包厢的高度读出来
  for (const [yy, thick] of [[4.12, 0.22], [6.38, 0.15]]) {
    for (const sign of [-1, 1]) {
      const segs = 10;
      for (let i = 0; i < segs; i++) {
        const za = H.z0 + (H.z1 - H.z0) * (i / segs);
        const zb = H.z0 + (H.z1 - H.z0) * ((i + 1) / segs);
        const xa = sign * (houseOuterX(za) + 0.06);
        const xb = sign * (houseOuterX(zb) + 0.06);
        const len = Math.hypot(xb - xa, zb - za);
        box(0.2, thick, len + 0.06, (xa + xb) / 2, yy, (za + zb) / 2, brass, Math.atan2(xb - xa, zb - za));
      }
    }
  }
  roof(H.half * 2 + 1.0, H.z0 - H.z1 + 0.8, 1.6, 5.4, 0, H.wallTop, (H.z0 + H.z1) / 2);

  const drum = new THREE.Mesh(
    new THREE.CylinderGeometry(H.drumR, H.drumR + 0.22, H.drumTop - H.wallTop, 28),
    stoneLight
  );
  drum.position.set(0, (H.drumTop + H.wallTop) / 2, H.drumZ);
  group.add(drum);
  // 鼓座窗：一圈暖光
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.4, 0.14), warmMat);
    w.position.set(
      Math.sin(a) * (H.drumR + 0.05),
      (H.wallTop + H.drumTop) / 2,
      H.drumZ + Math.cos(a) * (H.drumR + 0.05)
    );
    w.rotation.y = a;
    group.add(w);
  }
  // 穹顶：整圆石墨顶，与定稿 C 一致，不再留掀角与铜线
  const TAU = Math.PI * 2;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(H.drumR, 32, 14, 0, TAU, 0, Math.PI / 2),
    domeMat
  );
  dome.scale.set(1, H.domeH / H.drumR, 1);
  dome.position.set(0, H.drumTop, H.drumZ);
  group.add(dome);

  const lantern = new THREE.Mesh(
    new THREE.CylinderGeometry(H.lanternR, H.lanternR + 0.12, 1.55, 12),
    stoneLight
  );
  lantern.position.set(0, H.drumTop + H.domeH - 0.2, H.drumZ);
  group.add(lantern);
  const lanternGlass = new THREE.Mesh(
    new THREE.CylinderGeometry(H.lanternR + 0.04, H.lanternR + 0.1, 0.62, 12),
    warmMat
  );
  lanternGlass.position.set(0, H.drumTop + H.domeH - 0.28, H.drumZ);
  group.add(lanternGlass);
  const lanternCap = new THREE.Mesh(
    new THREE.ConeGeometry(H.lanternR + 0.28, 1.25, 12),
    domeMat
  );
  lanternCap.position.set(0, H.drumTop + H.domeH + 1.2, H.drumZ);
  group.add(lanternCap);
  const finial = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.1, 8), brass);
  finial.position.set(0, H.drumTop + H.domeH + 2.3, H.drumZ);
  group.add(finial);

  /* 舞台塔与侧台 */
  const tMid = (T.z0 + T.z1) / 2;
  for (const sign of [-1, 1]) {
    box(0.65, T.towerEave, T.z0 - T.z1, sign * T.towerHalf, T.towerEave / 2, tMid, stone);
    box(0.6, T.wingEave, T.z0 - T.z1, sign * T.wingHalf, T.wingEave / 2, tMid, stone);
    box(T.wingHalf - T.towerHalf, T.wingEave, 0.55, sign * (T.wingHalf + T.towerHalf) / 2, T.wingEave / 2, T.z0, stone);
    box(T.wingHalf - T.towerHalf, T.wingEave, 0.55, sign * (T.wingHalf + T.towerHalf) / 2, T.wingEave / 2, T.z1, stone);
    roof(
      T.wingHalf - T.towerHalf + 0.5,
      T.z0 - T.z1 + 0.5,
      0.8,
      1.2,
      sign * (T.wingHalf + T.towerHalf) / 2,
      T.wingEave,
      tMid
    );
  }
  box(T.towerHalf * 2 + 0.7, T.towerEave - B.eave, 0.6, 0, (T.towerEave + B.eave) / 2, T.z1, stone);
  gableRoof(T.towerHalf * 2 + 1.0, T.z0 - T.z1 + 0.7, T.towerRidge - T.towerEave, 0, T.towerEave, tMid);
  // 脊部通风体
  box(2.4, 1.35, T.z0 - T.z1 - 5.4, 0, T.towerRidge + 0.55, tMid, stoneLight);
  for (const sign of [-1, 1]) {
    box(0.12, 0.9, T.z0 - T.z1 - 5.8, sign * 1.22, T.towerRidge + 0.55, tMid, warmMat);
  }

  /* 舞台人员门：凸出的门斗 */
  box(SD.depth, SD.h, SD.w, SD.x - SD.depth / 2, SD.h / 2, SD.z, stone);
  box(SD.depth + 0.1, 0.14, SD.w + 0.2, SD.x - SD.depth / 2, SD.h - 0.07, SD.z, brass);
  box(0.1, 2.45, 1.1, SD.x - SD.depth - 0.02, 1.32, SD.z, dark);
  box(0.2, 0.26, 0.2, SD.x - SD.depth - 0.16, 3.05, SD.z, warmMat);
  box(1.5, 0.16, SD.w + 0.6, SD.x - SD.depth - 0.7, 0.08, SD.z, stoneLight);

  /* 后台与装卸台 */
  const bMid = (B.z0 + B.z1) / 2;
  box(0.65, B.eave, B.z0 - B.z1, -B.half, B.eave / 2, bMid, stone);
  box(0.65, B.eave, 0.4, B.half, B.eave / 2, B.z0 - 0.2, stone);
  box(B.half * 2, B.eave, 0.6, 0, B.eave / 2, B.z1, stone);
  roof(B.half * 2 + 0.9, B.z0 - B.z1 + 0.5, B.ridge - B.eave, B.inset, 0, B.eave, bMid);
  // 站台、卷帘门、雨棚
  box(D.halfW * 2 + 1.0, D.top, D.depth + 0.6, D.cx, D.top / 2, D.z - (D.depth + 0.6) / 2, stoneLight);
  box(D.doorW, D.doorH, 0.16, D.cx, D.top + D.doorH / 2, D.z - 0.02, dark);
  for (let i = 0; i < 5; i++) {
    box(D.doorW - 0.5, 0.05, 0.06, D.cx, D.top + 0.4 + i * 0.68, D.z - 0.1, brass);
  }
  box(D.halfW * 2 + 1.2, 0.28, 1.5, D.cx, 3.7, D.z - 0.55, stoneLight);
  box(D.halfW * 1.5, 0.05, 0.16, D.cx, 3.55, D.z - 1.2, warmMat);

  /* 创意工坊与主理人办公室 */
  box(0.55, WS.eave, WS.z1 - WS.z0, WS.x1, WS.eave / 2, (WS.z0 + WS.z1) / 2, stone);
  box(WS.x1 - WS.x0 - 0.3, WS.eave, 0.5, (WS.x0 + WS.x1) / 2, WS.eave / 2, WS.z0, stone);
  box(WS.x1 - WS.x0 - 0.3, WS.eave, 0.5, (WS.x0 + WS.x1) / 2, WS.eave / 2, WS.z1, stone);
  roof(
    WS.x1 - WS.x0 + 0.5,
    WS.z0 - WS.z1 + 0.4,
    WS.ridge - WS.eave,
    1.4,
    (WS.x0 + WS.x1) / 2,
    WS.eave,
    (WS.z0 + WS.z1) / 2
  );
  box(1.4, 0.55, WS.z0 - WS.z1 - 2.2, (WS.x0 + WS.x1) / 2, WS.ridge + 0.25, (WS.z0 + WS.z1) / 2, interior);
  box(0.3, 0.3, WS.z0 - WS.z1 - 2.6, (WS.x0 + WS.x1) / 2, WS.ridge + 0.3, (WS.z0 + WS.z1) / 2, warmMat);

  box(0.5, OF.eave, OF.z0 - OF.z1, OF.x0, OF.eave / 2, (OF.z0 + OF.z1) / 2, stone);
  box(OF.x1 - OF.x0, OF.eave, 0.5, (OF.x0 + OF.x1) / 2, OF.eave / 2, OF.z1, stone);
  box(OF.x1 - OF.x0, OF.eave, 0.5, (OF.x0 + OF.x1) / 2, OF.eave / 2, OF.z0, stone);
  roof(
    OF.x1 - OF.x0 + 0.5,
    OF.z0 - OF.z1 + 0.4,
    OF.ridge - OF.eave,
    1.0,
    (OF.x0 + OF.x1) / 2,
    OF.eave,
    (OF.z0 + OF.z1) / 2
  );
  box(0.65, 2.2, 0.65, -11.4, OF.ridge + 0.7, -64.8, stone);
  box(OF.x1 - B.half, 2.6, 2.2, (OF.x1 + B.half) / 2, 1.3, -63.6, stone);

  /* 四座转角塔楼：把门厅、观众厅、舞台三段的转角钉住 */
  const TW = SHELL.TOWERS;
  for (const key of ['front', 'rear']) {
    const t = TW[key];
    for (const sign of [-1, 1]) {
      const x = sign * t.x;
      box(t.size + 0.4, 0.9, t.size + 0.4, x, 0.45, t.z, stoneLight);
      box(t.size, t.eave, t.size, x, t.eave / 2, t.z, stone);
      box(t.size + 0.26, 0.16, t.size + 0.26, x, t.eave - 0.1, t.z, copperEdge);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(t.size * 0.73, t.cap, 4), roofMat);
      cap.rotation.y = Math.PI / 4;
      cap.position.set(x, t.eave + t.cap / 2, t.z);
      group.add(cap);
      box(0.16, 0.7, 0.16, x, t.eave + t.cap + 0.2, t.z, brass);
    }
  }

  /* 立面壁柱：门厅 5 道、连廊 3 道、观众厅沿弧 5 道，中段节奏立起来 */
  for (const sign of [-1, 1]) {
    for (const z of [-1.6, -5.2, -8.8, -12.4, -15.8]) {
      box(0.32, 8.1, 0.36, sign * (F.half + 0.2), 6.2, z, stoneLight);
    }
    for (const z of [-18.2, -23.0, -27.8]) {
      box(0.3, 7.0, 0.34, sign * (L.half + 0.16), 4.9, z, stoneLight);
    }
    for (const z of [-31.7, -35.0, -38.2, -41.4, -44.6]) {
      box(0.34, 11.2, 0.38, sign * (houseOuterX(z) + 0.2), 6.3, z, stoneLight);
    }
  }

  /* 窗带：按空间分组，当前所在空间的窗最亮 */
  windowBand('foyer', 0, 2.2, F.z0 + 0.52, 0.16, 4.0, 0);
  for (const sign of [-1, 1]) {
    for (const z of [-3.4, -7.0, -10.6, -14.2]) {
      windowBand('foyer', sign * (F.half + 0.36), 6.7, z, 2.6, 2.8, Math.PI / 2);
    }
  }
  for (const z of [-19.4, -23.0, -26.6]) {
    windowBand('corridor', L.half + 0.29, 5.5, z, 2.2, 2.3, Math.PI / 2);
  }
  windowBand('screening', S.x0 - 0.26, 5.7, -25.8, 4.4, 1.9, Math.PI / 2);
  for (const sign of [-1, 1]) {
    for (const z of [-33.4, -36.6, -39.8, -43.0, -46.2]) {
      const x = sign * (houseOuterX(z) + 0.03);
      windowBand('auditorium', x, 2.55, z, 2.4, 3.1, Math.PI / 2);
      windowBand('auditorium', x, 8.15, z, 2.2, 2.7, Math.PI / 2);
    }
  }
  windowBand('gallery', houseOuterX(-36.8) + 0.08, 9.7, -36.8, 1.8, 1.4, Math.PI / 2);
  windowBand('box', houseOuterX(-41.2) + 0.08, 9.0, -41.2, 1.8, 1.4, Math.PI / 2);
  for (const sign of [-1, 1]) {
    for (const z of [-50.2, -53.0, -55.8]) {
      windowBand('stage', sign * (T.wingHalf + 0.31), 9.3, z, 2.0, 1.8, Math.PI / 2);
    }
  }
  for (const z of [-60.8, -64.2]) {
    windowBand('backstage', -B.half - 0.34, 4.9, z, 1.8, 2.0, Math.PI / 2);
  }
  windowBand('backstage', D.cx, D.top + 1.5, D.z - 0.12, D.doorW - 0.5, D.doorH - 1.4, 0);
  windowBand('workshop', WS.x1 + 0.29, 3.6, -62.0, 5.0, 1.5, Math.PI / 2);
  windowBand('about', OF.x0 - 0.27, 2.6, -64.2, 3.2, 1.1, Math.PI / 2);

  function spillAt(space, x, y, z, scale) {
    if (!spill[space]) spill[space] = [];
    const s = glowSprite(mats, group, x, y, z, scale, 0.0, 0xffb46a);
    spill[space].push(s);
    return s;
  }
  spillAt('foyer', 0, 4.6, F.z0 + 1.1, 10);
  for (const sign of [-1, 1]) {
    spillAt('auditorium', sign * (H.half + 1.3), 7.1, -38.6, 8.5);
    spillAt('stage', sign * (T.wingHalf + 1.1), 9.3, -53.0, 7.5);
  }
  spillAt('corridor', L.half + 1.0, 5.6, -23.2, 6);
  spillAt('backstage', 0, 4.4, D.z - 1.4, 7);
  spillAt('workshop', WS.x1 + 1.0, 3.9, -62.0, 5.5);
  spillAt('screening', S.x0 - 1.0, 5.7, -25.8, 7);
  spillAt('gallery', H.half + 1.1, 9.8, -36.8, 5);
  spillAt('box', H.half + 1.1, 9.1, -41.2, 5);
  spillAt('about', OF.x0 - 1.0, 2.8, -64.2, 6);

  /* 细部：只做门廊与招牌这个视觉焦点 */
  if (detail) {
    // 拱门金线：一道，克制
    const ringGold = new THREE.Mesh(new THREE.TorusGeometry(2.78, 0.06, 5, 24, Math.PI), brass);
    ringGold.position.set(0, 7.2, F.z0 + 0.78);
    group.add(ringGold);
    box(F.half * 2 + 0.4, 0.14, 0.56, 0, frontEave - 0.06, F.z0 + 0.05, brass);
    // 招牌：阁楼正中，中文主字在上、RAINSABOVE 副行在下
    const signMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(3.9, 1.22),
      new THREE.MeshBasicMaterial({ map: makeSignTexture(), toneMapped: false })
    );
    signMesh.position.set(0, 9.6, F.z0 + 0.66);
    group.add(signMesh);
    box(4.15, 1.45, 0.12, 0, 9.6, F.z0 + 0.58, stoneLight);
    // 门廊两盏灯
    glowSprite(mats, group, -3.5, 4.1, F.z0 + 1.5, 2.0, 0.5, 0xffc78e);
    glowSprite(mats, group, 3.5, 4.1, F.z0 + 1.5, 2.0, 0.5, 0xffc78e);
    // 穹顶铜肋与铜箍
    const ribGeo = new THREE.TorusGeometry(H.drumR + 0.02, 0.075, 5, 30, Math.PI);
    for (let i = 0; i < 8; i++) {
      const rib = new THREE.Mesh(ribGeo, brass);
      rib.scale.set(1, H.domeH / H.drumR, 1);
      rib.position.set(0, H.drumTop, H.drumZ);
      rib.rotation.y = (i / 8) * Math.PI;
      group.add(rib);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(H.drumR + 0.12, 0.1, 6, 40), brass);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, H.drumTop - 0.08, H.drumZ);
    group.add(ring);
    // 侧台高窗棂
    for (const sign of [-1, 1]) {
      for (const z of [-50.2, -53.0, -55.8]) {
        box(0.06, 1.9, 0.1, sign * (T.wingHalf + 0.34), 9.3, z, brass);
      }
    }
  }

  // 简模全为静止件：按材质合批，控制鸟瞰台的 draw call
  mergeStatic(group);

  return { group, windows, spill };
}

/* ---------- 转台度量 ----------
   简模按世界坐标量一遍三角面：几何中心用来定枢轴，绕竖轴的
   最大投影半径用来给底板留出包裹余量。 */
const FLOOR_GAP = 0.004;

function measureModel(group) {
  group.updateMatrixWorld(true);
  const p = new THREE.Vector3();
  const box = new THREE.Box3();
  group.traverse((o) => {
    const pos = o.isMesh && o.geometry?.attributes?.position;
    if (!pos) return;
    for (let i = 0; i < pos.count; i++) {
      box.expandByPoint(p.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld));
    }
  });
  const center = box.getCenter(new THREE.Vector3());
  let radius = 0;
  group.traverse((o) => {
    const pos = o.isMesh && o.geometry?.attributes?.position;
    if (!pos) return;
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      radius = Math.max(radius, Math.hypot(p.x - center.x, p.z - center.z));
    }
  });
  return { box, center, radius };
}

/* ---------- 玻璃球内的场景 ---------- */
function createMiniScene(mats) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0806, 0.0058);

  // 建筑与底板同挂一个转台：枢轴取建筑几何中心，拖动时整座剧院连同
  // 底板一起转身，任何角度下两者的相对变换都不变，不会出现穿板
  const model = buildMiniModel(mats, false);
  const xray = createXray(model);
  const metrics = measureModel(model.group);
  const pivot = new THREE.Group();
  pivot.position.copy(metrics.center);
  pivot.rotation.order = 'YXZ';
  scene.add(pivot);
  model.group.position.sub(metrics.center);
  pivot.add(model.group);

  const hemi = new THREE.HemisphereLight(0x7d90a8, 0x1a110c, 0.95);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xa9bdd8, 1.6);
  key.position.set(-40, 52, 46);
  key.target.position.set(0, 8, -28);
  scene.add(key);
  scene.add(key.target);
  const warm = new THREE.DirectionalLight(0xffa464, 0.55);
  warm.position.set(28, 16, 12);
  warm.target.position.set(0, 8, -28);
  scene.add(warm);
  scene.add(warm.target);

  // 球底座：底板也是转台的子节点，顶面与建筑底面贴合，半径覆盖旋转圆盘
  const floorTop = metrics.box.min.y - FLOOR_GAP;
  const baseR = Math.max(42, metrics.radius + 1.5);
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(baseR, baseR + 2, 0.5, 48),
    new THREE.MeshStandardMaterial({ color: 0x100b08, roughness: 0.75, metalness: 0.1 })
  );
  base.position.set(0, floorTop - 0.25 - metrics.center.y, 0);
  base.name = 'orbBase';
  pivot.add(base);

  // 玩家位置：一小团暖白火光，始终朝相机呈现
  const marker = new THREE.Group();
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xfff1d6,
    toneMapped: false,
    depthTest: false,
    transparent: true
  });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.9, 14, 10), coreMat);
  core.renderOrder = 9;
  marker.add(core);
  const halo = glowSprite(mats, marker, 0, 0, 0, 4.2, 0.85, 0xffefd2);
  halo.material.depthTest = false;
  halo.renderOrder = 10;
  pivot.add(marker);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 400);
  camera.position.set(52, 54, 96);
  const look = metrics.center.clone();
  look.y += 1.5;
  camera.lookAt(look);

  /* 「跟着走」视点：与主场景同 FOV，挂在 scene 根下，不受转台 pivot
     旋转影响。位置与朝向由 tour.follow 每帧硬同步，俯仰恒为 0。 */
  const followCamera = new THREE.PerspectiveCamera(58, 1, 0.08, 400);
  followCamera.rotation.order = 'YXZ';
  followCamera.position.set(0, 1.64, -3);
  scene.add(followCamera);
  // 缩微模型只布了外部天光/主光，视点进到建筑内部会是一片黑。
  // 给跟随相机挂一盏暖色头灯（只在跟随态点亮），沿途体块才看得出来。
  const headLamp = new THREE.PointLight(0xffd8a8, 2.8, 34, 1.3);
  headLamp.position.set(0, 0.55, 0.15);
  followCamera.add(headLamp);
  // 跟随态补光：建筑内壁原本几乎无光，只在跟随态点亮
  const followAmbient = new THREE.AmbientLight(0xffd2a0, 0.85);
  followAmbient.visible = false;
  scene.add(followAmbient);

  return {
    scene, camera, followCamera, headLamp, followAmbient, xray, pivot, model, marker,
    halo, core, base, center: metrics.center, metrics
  };
}

/* ---------- 鸟瞰台场景 ---------- */
function createStageScene(mats, quality) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0806, 0.0048);

  const model = buildMiniModel(mats, true);
  const xray = createXray(model);
  // 与球内一致：枢轴落在建筑几何中心，模型反向平移回原位，
  // 台面、铜圈、接触暗部全部挂到同一个转台组，绕轴旋转时相对变换恒定
  const metrics = measureModel(model.group);
  const pivot = new THREE.Group();
  pivot.position.copy(metrics.center);
  pivot.add(model.group);
  model.group.position.sub(metrics.center);
  scene.add(pivot);

  /* 木台：深色台面 + 接触暗部 + 一圈细铜线 */
  const tableMat = new THREE.MeshStandardMaterial({
    color: 0x1a110b,
    roughness: 0.58,
    metalness: 0.12
  });
  const tableR = Math.max(43, metrics.radius + 1.5);
  const tableY = metrics.box.min.y - FLOOR_GAP;
  const table = new THREE.Mesh(new THREE.CircleGeometry(tableR, 64), tableMat);
  table.rotation.x = -Math.PI / 2;
  table.position.set(0, tableY - metrics.center.y, 0);
  table.receiveShadow = quality.tier === 'full';
  pivot.add(table);

  const tableRing = new THREE.Mesh(
    new THREE.TorusGeometry(tableR - 0.4, 0.22, 8, 96),
    new THREE.MeshStandardMaterial({ color: 0x7a5a30, roughness: 0.45, metalness: 0.6 })
  );
  tableRing.rotation.x = Math.PI / 2;
  tableRing.position.set(0, tableY + 0.14 - metrics.center.y, 0);
  pivot.add(tableRing);

  const shadowMat = new THREE.MeshBasicMaterial({
    map: mats.glowMap,
    color: 0x000000,
    transparent: true,
    opacity: 0.45,
    depthWrite: false
  });
  const contact = new THREE.Mesh(new THREE.CircleGeometry(tableR - 1.2, 48), shadowMat);
  contact.rotation.x = -Math.PI / 2;
  contact.position.set(0, tableY + 0.03 - metrics.center.y, 0);
  pivot.add(contact);

  /* 灯光：冷天光 + 暖室内，窗带自发光 */
  const hemi = new THREE.HemisphereLight(0x8094ac, 0x160f0b, 1.0);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xc0d2ea, 2.1);
  key.position.set(-46, 68, 52);
  key.target.position.set(0, 7, -28);
  if (quality.tier === 'full') {
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 20;
    key.shadow.camera.far = 180;
    key.shadow.camera.left = -50;
    key.shadow.camera.right = 50;
    key.shadow.camera.top = 50;
    key.shadow.camera.bottom = -50;
    key.shadow.bias = -0.001;
  }
  scene.add(key);
  scene.add(key.target);

  const rim = new THREE.DirectionalLight(0xffa060, 0.8);
  rim.position.set(36, 24, -20);
  rim.target.position.set(0, 8, -28);
  scene.add(rim);
  scene.add(rim.target);

  if (quality.tier === 'full') {
    model.group.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }

  /* 七个锚点：一簇灯火；未开放的只提示，不进入 */
  const anchors = [];
  const hitMeshes = [];
  const hitMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false
  });

  for (const space of SPACES) {
    if (!space.anchor) continue;
    const g = new THREE.Group();
    g.position.set(...space.anchor);
    scene.add(g);

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffe9c8, toneMapped: false, transparent: true })
    );
    g.add(core);
    const halo = glowSprite(mats, g, 0, 0, 0, 4.4, 0.45, 0xffd9a4);
    const sat1 = glowSprite(mats, g, 0.7, 0.35, 0.2, 1.3, 0.3, 0xffc27a);
    const sat2 = glowSprite(mats, g, -0.6, -0.1, -0.3, 1.1, 0.26, 0xffc27a);

    const hit = new THREE.Mesh(new THREE.SphereGeometry(2.6, 8, 6), hitMat);
    hit.userData = { kind: 'space', space };
    g.add(hit);
    hitMeshes.push(hit);

    // 从锚点垂下一截短铜针
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, -2.0, 0)
    ]);
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({
      color: 0x9c793f,
      transparent: true,
      opacity: 0.32
    }));
    g.add(line);

    anchors.push({ space, group: g, core, halo, sat1, sat2, hit });
  }

  /* 局部热点：只留大门入口；细部放大机位已收敛为正/侧/顶三个 */
  const parts = [
    { id: 'door', label: '大门 · 回到门厅', pos: [0, 2.4, 3.4], radius: 3.2, enter: 'foyer' }
  ];
  const hotspots = [];
  for (const part of parts) {
    const hit = new THREE.Mesh(new THREE.SphereGeometry(part.radius, 8, 6), hitMat);
    hit.position.set(...part.pos);
    hit.userData = { kind: 'part', part };
    scene.add(hit);
    hitMeshes.push(hit);
    hotspots.push(hit);

    const pin = glowSprite(mats, scene, part.pos[0], part.pos[1], part.pos[2], 1.15, 0.22, 0xffdfb0);
    pin.renderOrder = 2;
  }

  /* 楼层标 */
  const labels = [];
  const label1 = makeLabelTexture('L1 · 门厅与观众席');
  label1.position.set(-13.8, 1.2, -18);
  scene.add(label1);
  labels.push(label1);
  const label2 = makeLabelTexture('L2 · 楼座');
  label2.position.set(13.8, 4.4, -38);
  scene.add(label2);
  labels.push(label2);
  const label3 = makeLabelTexture('屋面 · 穹顶');
  label3.position.set(13.8, 13.8, -26);
  scene.add(label3);
  labels.push(label3);

  /* 剖切：沿 x=0 切掉一半，铜线描边 */
  const cutPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
  const clipMaterials = [];
  // 只裁建筑本体：桌面、接触阴影、命中球与锚点都不参与剖切
  model.group.traverse((o) => {
    if (!o.isMesh) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms) {
      if (!m) continue;
      if (!m.userData) m.userData = {};
      m.userData.clipReady = true;
      if (!clipMaterials.includes(m)) clipMaterials.push(m);
    }
  });

  const cutGroup = new THREE.Group();
  const cutMat = new THREE.LineBasicMaterial({
    color: 0xb08a4a,
    transparent: true,
    opacity: 0.75
  });
  // 剖切线沿 x=0 的真实剖面：门厅坡顶、低连廊、外弧厅+穹顶、舞台塔、后台与装卸台
  const y0 = 0.1;
  const section = [
    [3.6, y0], [1.3, y0], [1.3, SHELL.FRONT.eave],
    [-2.65, SHELL.FRONT.ridge], [-13.3, SHELL.FRONT.ridge],
    [-16.9, SHELL.FRONT.eave], [-16.9, SHELL.LINK.eave],
    [-17.8, SHELL.LINK.ridge], [-29.55, SHELL.LINK.ridge],
    [-30.45, SHELL.LINK.eave], [-30.45, SHELL.HOUSE.eave],
    [-31.9, SHELL.HOUSE.wallTop], [-31.9, SHELL.HOUSE.drumTop],
    [-34.2, 19.25], [-36.4, 20.5], [-39.0, 20.85], [-41.6, 20.5], [-43.8, 19.25],
    [-46.1, SHELL.HOUSE.drumTop], [-46.1, SHELL.HOUSE.wallTop],
    [-47.8, SHELL.HOUSE.eave], [-47.8, SHELL.STAGE.towerEave],
    [-50.1, SHELL.STAGE.towerRidge], [-50.4, 19.9], [-55.15, 19.9],
    [-55.65, SHELL.STAGE.towerRidge], [-57.95, SHELL.STAGE.towerEave],
    [-57.95, SHELL.BACK.eave], [-60.15, SHELL.BACK.ridge], [-63.8, SHELL.BACK.ridge],
    [-66.2, SHELL.BACK.eave], [-66.2, SHELL.DOCK.top],
    [-68.8, SHELL.DOCK.top], [-68.8, y0], [3.6, y0]
  ];
  const pts = [];
  for (let i = 0; i < section.length - 1; i++) {
    pts.push([0, section[i][1], section[i][0]], [0, section[i + 1][1], section[i + 1][0]]);
  }
  const lineGeo = new THREE.BufferGeometry().setFromPoints(
    pts.map((p) => new THREE.Vector3(...p))
  );
  cutGroup.add(new THREE.LineSegments(lineGeo, cutMat));
  cutGroup.visible = false;
  scene.add(cutGroup);

  const camera = new THREE.PerspectiveCamera(31, 1, 0.2, 500);

  // 鸟瞰台的「跟着走」视点：与玻璃球用同一套参数，行为一致
  const followCamera = new THREE.PerspectiveCamera(
    58, window.innerWidth / Math.max(1, window.innerHeight), 0.08, 400
  );
  followCamera.rotation.order = 'YXZ';
  followCamera.position.set(0, 1.64, -3);
  scene.add(followCamera);
  const headLamp = new THREE.PointLight(0xffd8a8, 2.8, 34, 1.3);
  headLamp.position.set(0, 0.55, 0.15);
  followCamera.add(headLamp);
  const followAmbient = new THREE.AmbientLight(0xffd2a0, 0.85);
  followAmbient.visible = false;
  scene.add(followAmbient);

  return {
    scene,
    camera,
    followCamera,
    headLamp,
    followAmbient,
    xray,
    pivot,
    model,
    table,
    tableRing,
    contact,
    center: metrics.center,
    metrics,
    anchors,
    hotspots,
    hitMeshes,
    labels,
    clipMaterials,
    cutPlane,
    cutGroup
  };
}

/* ---------- 跟随态的路线光带 ----------
   视点本身严格落在路径采样点上；这条线只是把「从哪儿走到哪儿、还剩多少、
   朝哪边走」画出来：走过的段压暗，前方段发亮。挂在 scene 根下（不受
   转台 pivot 影响），depthTest=false 保证在建筑内部也看得见。 */
const ROUTE_SEGMENTS = 120;
const ROUTE_DONE = new THREE.Color(0x6b4a2a);
const ROUTE_AHEAD = new THREE.Color(0xffd9a0);
function createRouteLine(scene) {
  const geo = new THREE.BufferGeometry();
  const n = ROUTE_SEGMENTS + 1;
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * n), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(3 * n), 3));
  const mat = new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.92,
    depthTest: false, depthWrite: false
  });
  const line = new THREE.Line(geo, mat);
  line.renderOrder = 12;
  line.frustumCulled = false;
  line.visible = false;
  line.userData.path = null;
  scene.add(line);
  return line;
}

/* 跟随态 X 光：缩微模型是实心体块，没有内部空间，视点落在路径点上
   会被整块包在墙里，只看到一面深棕内壁。跟随态把模型材质临时切成
   低不透明度的线框，既能看穿建筑，又保留结构轮廓；自由查看时还原。
   材质都是 buildMiniModel 内部新建的，不与主场景共享。 */
function createXray(model) {
  const saved = [];
  const seen = new Set();
  model.group.traverse((o) => {
    if (!o.isMesh) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms) {
      if (!m || seen.has(m)) continue;
      seen.add(m);
      saved.push({
        m, transparent: m.transparent, opacity: m.opacity,
        depthWrite: m.depthWrite, side: m.side, wireframe: !!m.wireframe
      });
    }
  });
  let applied = false;
  return {
    materials: saved.length,
    set(on) {
      if (on === applied) return;
      applied = on;
      for (const s of saved) {
        s.m.transparent = on ? true : s.transparent;
        s.m.opacity = on ? 0.5 : s.opacity;
        s.m.depthWrite = on ? false : s.depthWrite;
        s.m.side = on ? THREE.DoubleSide : s.side;
        s.m.wireframe = on ? true : s.wireframe;
        s.m.needsUpdate = true;
      }
    }
  };
}

const _routePt = new THREE.Vector3();
function fillRouteLine(line, path, u) {
  if (!path) return;
  if (line.userData.path !== path) {
    const pos = line.geometry.attributes.position.array;
    for (let i = 0; i <= ROUTE_SEGMENTS; i++) {
      path.getPointAt(i / ROUTE_SEGMENTS, _routePt);
      pos[i * 3] = _routePt.x;
      pos[i * 3 + 1] = _routePt.y - 0.28;  // 压到脚下当导轨，固定俯角下正好在视野里
      pos[i * 3 + 2] = _routePt.z;
    }
    line.geometry.attributes.position.needsUpdate = true;
    line.geometry.computeBoundingSphere();
    line.userData.path = path;
  }
  const col = line.geometry.attributes.color.array;
  for (let i = 0; i <= ROUTE_SEGMENTS; i++) {
    const c = i / ROUTE_SEGMENTS <= u ? ROUTE_DONE : ROUTE_AHEAD;
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  line.geometry.attributes.color.needsUpdate = true;
}

/* ---------- 空间亮度：当前最亮，离开后缓慢衰减 ---------- */
function createLevels() {
  const levels = {};
  for (const s of SPACES) levels[s.id] = 0.06;
  return levels;
}

function updateLevels(scene, levels, placeId, dt) {
  const rise = 2.4;
  const decay = 1 / 95;   // 约一分半回到底色，接近“几分钟”的观感
  for (const s of SPACES) {
    const target = s.id === placeId ? 1 : 0.06;
    const k = target > levels[s.id] ? rise : decay;
    levels[s.id] += (target - levels[s.id]) * (1 - Math.exp(-k * dt));
    const kk = levels[s.id];
    const wm = scene.model.windows[s.id];
    if (wm) {
      wm.color.setRGB(0.1 + 0.9 * kk, 0.05 + 0.5 * kk, 0.02 + 0.25 * kk);
    }
    const sp = scene.model.spill[s.id];
    if (sp) {
      for (const sprite of sp) {
        sprite.material.opacity = (sprite.userData.baseOpacity || 0.5) * (0.06 + 0.94 * kk) * 0.85;
      }
    }
  }
}

/* ---------- 角落玻璃球 + 鸟瞰台 ---------- */
export function createOrb({ quality, mats, onEnter, onOpenChange }) {
  const root = document.createElement('button');
  root.type = 'button';
  root.className = 'orb-root';
  root.setAttribute('aria-label', '打开剧院鸟瞰台');
  root.innerHTML = `
    <span class="orb-shadow"></span>
    <span class="orb-ring">
      <span class="orb-glass" data-glass></span>
      <span class="orb-glint"></span>
      <span class="orb-ringline is-a"></span>
      <span class="orb-ringline is-b"></span>
      <i class="orb-rivet r1"></i><i class="orb-rivet r2"></i><i class="orb-rivet r3"></i>
      <i class="orb-rivet r4"></i><i class="orb-rivet r5"></i><i class="orb-rivet r6"></i>
    </span>
    <span class="orb-base">
      <span class="orb-dial">
        <i>N</i><i>E</i><i>S</i><i>W</i>
        <em class="orb-needle" data-needle></em>
      </span>
    </span>
    <span class="orb-place" data-place>门厅</span>
  `;
  document.body.appendChild(root);

  const glassEl = root.querySelector('[data-glass]');
  const placeEl = root.querySelector('[data-place]');
  const needleEl = root.querySelector('[data-needle]');

  /* ---------- 球内渲染 ---------- */
  const mini = createMiniScene(mats);
  const miniRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  miniRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.tier === 'full' ? 2 : 1.5));
  miniRenderer.setSize(112, 112, false);
  miniRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  miniRenderer.toneMappingExposure = 1.3;
  glassEl.appendChild(miniRenderer.domElement);
  const miniLevels = createLevels();
  const miniRoute = createRouteLine(mini.scene);
  let miniAccum = 0;
  let miniRenders = 0;
  let pivotYaw = 0;

  /* ---------- 球内模型：拖动自由旋转 + 松手惯性 ---------- */
  let manualYaw = 0;
  let manualPitch = 0;
  let yawVel = 0;
  let pitchVel = 0;
  let followPause = false;
  let resetting = false;
  let drag = null;
  let suppressClick = false;
  let lastPlace = null;
  const MINI_PITCH_LIMIT = 0.52;

  /* ---------- 跟随 vs 自由查看：玻璃球与鸟瞰台共用同一份状态 ----------
     行走是自动的，拖动是查看用的：用户一拖动就暂停跟随（freeView=true），
     松手 1.2s 后恢复；方位盘可一键立即恢复。
     orbClock 由 update(dt) 累加，与 updateTweens(dt) 同源，逐帧驱动
     验收时也能精确复现恢复时刻，不依赖真实墙钟。 */
  let freeView = false;
  let resumeAt = -1;
  let orbClock = 0;
  let wasTraveling = false;
  const RESUME_DELAY = 1.2;

  function resetMiniView() {
    // 方位盘复位：立即回到自动跟随，不做瞬切
    resetting = true;
    followPause = false;
    freeView = false;
    resumeAt = -1;
    yawVel = 0;
    pitchVel = 0;
  }

  root.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.orb-dial')) return; // 方位盘只负责复位
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
    yawVel = 0;
    pitchVel = 0;
    resetting = false;
  });

  root.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.moved += Math.hypot(dx, dy);
    if (drag.moved < 4) return;
    root.setPointerCapture?.(e.pointerId);
    followPause = true;
    // 拖动查看优先：暂停自动跟随，松手后再按 RESUME_DELAY 恢复
    freeView = true;
    resumeAt = -1;
    const k = 0.0062;
    manualYaw -= dx * k;
    manualPitch = THREE.MathUtils.clamp(manualPitch - dy * k * 0.85, -MINI_PITCH_LIMIT, MINI_PITCH_LIMIT);
    // 估算角速度（rad/s），松手后按此滑行
    yawVel = THREE.MathUtils.clamp(-dx * k * 60, -4.2, 4.2);
    pitchVel = THREE.MathUtils.clamp(-dy * k * 0.85 * 60, -3.0, 3.0);
  });

  function endOrbDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const moved = drag.moved;
    drag = null;
    // 拖过就不算点击：避免松手顺手展开鸟瞰台
    if (moved >= 4) {
      suppressClick = true;
      resumeAt = orbClock + RESUME_DELAY;
      setTimeout(() => { suppressClick = false; }, 60);
    }
  }
  root.addEventListener('pointerup', endOrbDrag);
  root.addEventListener('pointercancel', endOrbDrag);

  // 方位盘：一键回正并恢复自动跟随
  root.querySelector('.orb-dial')?.addEventListener('click', (e) => {
    e.stopPropagation();
    resetMiniView();
  });

  /* ---------- 鸟瞰台（懒建） ---------- */
  let stage = null;
  let openFlag = false;
  let closeTimer = 0;

  function ensureStage() {
    if (stage) return stage;

    const stageEl = document.createElement('div');
    stageEl.className = 'orb-stage';
    stageEl.setAttribute('aria-hidden', 'true');
    stageEl.innerHTML = `
      <div class="orb-stage-surface"></div>
      <div class="orb-stage-canvas" data-stage-canvas></div>
      <header class="orb-stage-head">
        <span class="orb-stage-kicker">Rainsabove · BIRD'S EYE</span>
        <h2 class="orb-stage-title">鸟瞰台</h2>
        <button class="orb-close" type="button" data-act="close" aria-label="收起鸟瞰台">收起</button>
      </header>
      <div class="orb-stage-hint">拖拽旋转 · 滚轮 / 双指缩放 · 点击光点进入</div>
      <div class="orb-stage-bar">
        <button class="orb-chip" type="button" data-preset="front">正立面</button>
        <button class="orb-chip" type="button" data-preset="side">侧立面</button>
        <button class="orb-chip" type="button" data-preset="roof">屋顶俯视</button>
        <span class="orb-divider"></span>
        <button class="orb-chip" type="button" data-act="cut">剖切</button>
      </div>
      <div class="orb-tip" data-tip></div>
      <div class="orb-toast" data-toast></div>
    `;
    document.body.appendChild(stageEl);

    const canvasHost = stageEl.querySelector('[data-stage-canvas]');
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.tier === 'full' ? 2 : 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.32;
    renderer.localClippingEnabled = true;
    if (quality.tier === 'full') {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    canvasHost.appendChild(renderer.domElement);

    const scene = createStageScene(mats, quality);
    const levels = createLevels();
    const routeLine = createRouteLine(scene.scene);

    const state = {
      root: stageEl,
      canvasHost,
      renderer,
      scene,
      levels,
      theta: 0.02,
      phi: 1.22,
      radius: 96,
      tTheta: 0.02,
      tPhi: 1.22,
      tRadius: 96,
      spinTheta: 0,
      spinPhi: 0,
      focus: new THREE.Vector3(0, 7.2, -26),
      tFocus: new THREE.Vector3(0, 7.2, -26),
      cut: false,
      pointers: new Map(),
      mode: null,
      pinchDist: 0,
      moved: 0,
      downTime: 0,
      engaged: false,
      hover: null
    };

    const tip = stageEl.querySelector('[data-tip]');
    const toast = stageEl.querySelector('[data-toast]');
    const cutBtn = stageEl.querySelector('[data-act="cut"]');

    /* ----- 轨道相机 ----- */
    function positionCamera() {
      const cam = scene.camera;
      const sp = Math.sin(state.phi);
      cam.position.set(
        state.focus.x + state.radius * sp * Math.sin(state.theta),
        state.focus.y + state.radius * Math.cos(state.phi),
        state.focus.z + state.radius * sp * Math.cos(state.theta)
      );
      cam.lookAt(state.focus);
    }

    function resize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h, false);
      scene.camera.aspect = w / h;
      scene.camera.updateProjectionMatrix();
      scene.followCamera.aspect = w / Math.max(1, h);
      scene.followCamera.updateProjectionMatrix();
      positionCamera();
    }

    const PRESETS = {
      front: { focus: [0, 9.5, -30], theta: 0.02, phi: 1.18, radius: 118 },
      side: { focus: [0, 9.5, -30], theta: 1.52, phi: 1.16, radius: 112 },
      roof: { focus: [0, 8, -31], theta: 0.35, phi: 0.54, radius: 122 },
      cut: { focus: [0, 9, -32], theta: 1.15, phi: 1.0, radius: 112 }
    };

    function applyPreset(id) {
      const p = PRESETS[id];
      if (!p) return;
      state.tFocus.set(...p.focus);
      state.tTheta = p.theta;
      state.tPhi = p.phi;
      state.tRadius = p.radius;
      state.spinTheta = 0;
      state.spinPhi = 0;
    }

    // 打开时的默认三分之四视角：能同时读到门厅、外弧厅与穹顶
    const HOME = { focus: [0, 9, -30], theta: 0.62, phi: 0.96, radius: 124 };

    function setCut(on) {
      state.cut = on;
      cutBtn.classList.toggle('is-on', on);
      for (const m of scene.clipMaterials) {
        m.clippingPlanes = on ? [scene.cutPlane] : null;
        m.clipShadows = on;
        m.needsUpdate = true;
      }
      scene.cutGroup.visible = on;
      if (on) applyPreset('cut');
    }

    /* ----- 悬停 / 点击 ----- */
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    function pick(clientX, clientY) {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, scene.camera);
      const hit = raycaster.intersectObjects(scene.hitMeshes, false)[0];
      return hit ? hit.object.userData : null;
    }

    function showTip(text, x, y) {
      if (!text) {
        tip.classList.remove('is-on');
        return;
      }
      tip.textContent = text;
      tip.style.left = `${x}px`;
      tip.style.top = `${y}px`;
      tip.classList.add('is-on');
    }

    function toastMsg(text) {
      toast.textContent = text;
      toast.classList.add('is-on');
      clearTimeout(toast._t);
      toast._t = setTimeout(() => toast.classList.remove('is-on'), 2200);
    }

    function enterSpace(nav) {
      if (!nav) return;
      close();
      setTimeout(() => onEnter?.(nav), 700);
    }

    function activate(data) {
      if (!data) return;
      if (data.kind === 'part') {
        const part = data.part;
        if (part.enter) {
          enterSpace(part.enter);
        } else if (part.preset) {
          applyPreset(part.preset);
        }
        return;
      }
      if (data.kind === 'space') {
        const space = data.space;
        if (space.ready === false) {
          toastMsg(`${space.label}正在筹备，尚未接通`);
          return;
        }
        enterSpace(space.nav);
      }
    }

    /* ----- 输入 ----- */
    const canvas = renderer.domElement;
    canvas.style.touchAction = 'none';

    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture?.(e.pointerId);
      state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      state.moved = 0;
      state.engaged = false;
      state.downTime = performance.now();
      state.spinTheta = 0;
      state.spinPhi = 0;
      if (state.pointers.size === 2) {
        const pts = [...state.pointers.values()];
        state.mode = 'pinch';
        state.pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      } else {
        state.mode = 'rotate';
      }
      showTip(null);
    });

    canvas.addEventListener('pointermove', (e) => {
      const p = state.pointers.get(e.pointerId);
      if (p) {
        const dx = e.clientX - p.x;
        const dy = e.clientY - p.y;
        p.x = e.clientX;
        p.y = e.clientY;
        state.moved += Math.hypot(dx, dy);

        if (state.mode === 'pinch' && state.pointers.size === 2) {
          freeView = true;
          resumeAt = -1;
          const pts = [...state.pointers.values()];
          const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          if (state.pinchDist > 0) {
            state.tRadius = THREE.MathUtils.clamp(
              state.tRadius * (state.pinchDist / dist), 9, 170
            );
          }
          state.pinchDist = dist;
          return;
        }

        if (state.mode === 'rotate') {
          if (!state.engaged) {
            const dead = e.pointerType === 'touch' ? 6 : 2;
            if (state.moved < dead) return;
            state.engaged = true;
            freeView = true;
            resumeAt = -1;
          }
          state.tTheta -= dx * 0.0052;
          state.tPhi = THREE.MathUtils.clamp(state.tPhi - dy * 0.0042, 0.2, 1.42);
          // 记录角速度，松手后继续滑行（估算为 rad/s）
          state.spinTheta = THREE.MathUtils.clamp(-dx * 0.0052 * 60, -3.6, 3.6);
          state.spinPhi = THREE.MathUtils.clamp(-dy * 0.0042 * 60, -2.4, 2.4);
        }
        return;
      }

      // 鼠标悬停：显示锚点名称
      if (e.pointerType === 'mouse' && state.mode === null) {
        const data = pick(e.clientX, e.clientY);
        if (data) {
          const text = data.kind === 'space' ? data.space.label : data.part.label;
          const ready = data.kind === 'space' && data.space.ready === false;
          showTip(ready ? `${text} · 筹备中` : text, e.clientX + 16, e.clientY - 12);
          canvas.style.cursor = 'pointer';
        } else {
          showTip(null);
          canvas.style.cursor = 'grab';
        }
      }
    });

    function endPointer(e) {
      const p = state.pointers.get(e.pointerId);
      if (!p) return;
      const dragged = state.moved >= 7;
      state.pointers.delete(e.pointerId);
      if (state.pointers.size === 1) {
        state.mode = 'rotate';
        state.moved = 999;
      } else if (state.pointers.size === 0) {
        state.mode = null;
      }
      const click = state.moved < 7 && performance.now() - state.downTime < 500;
      if (click) {
        const data = pick(e.clientX, e.clientY);
        activate(data);
      }
      if (dragged && state.pointers.size === 0) resumeAt = orbClock + RESUME_DELAY;
    }
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      state.tRadius = THREE.MathUtils.clamp(state.tRadius * (1 + e.deltaY * 0.0011), 9, 170);
    }, { passive: false });

    /* ----- 界面按钮 ----- */
    stageEl.querySelector('[data-act="close"]').addEventListener('click', () => close());
    stageEl.addEventListener('click', (e) => {
      const preset = e.target.closest('[data-preset]');
      if (preset) applyPreset(preset.dataset.preset);
      const act = e.target.closest('[data-act="cut"]');
      if (act) setCut(!state.cut);
    });

    window.addEventListener('resize', () => {
      if (openFlag) resize();
    });

    const keyHandler = (e) => {
      if (!openFlag) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', keyHandler);

    stage = {
      ...state,
      el: stageEl,
      // 与 mini.followCamera 对称：scene 是 createStageScene 的返回对象，
      // 跟随视点挂在它上面，这里提到 stage 上供 update/render 直接使用
      followCamera: scene.followCamera,
      headLamp: scene.headLamp,
      followAmbient: scene.followAmbient,
      xray: scene.xray,
      routeLine,
      resize,
      applyPreset,
      setCut,
      positionCamera,
      tip,
      open() {
        stageEl.setAttribute('aria-hidden', 'false');
        stageEl.classList.add('is-open');
        resize();
        state.tFocus.set(...HOME.focus);
        state.tTheta = HOME.theta;
        state.tPhi = HOME.phi;
        state.tRadius = HOME.radius;
        state.spinTheta = 0;
        state.spinPhi = 0;
        stageEl.querySelector('[data-act="close"]')?.focus({ preventScroll: true });
      },
      close() {
        stageEl.classList.remove('is-open');
        stageEl.setAttribute('aria-hidden', 'true');
      },
      update(dt, placeId, time) {
        // 松手后按角速度继续滑行，自然衰减；不做回正
        if (state.pointers.size === 0) {
          state.tTheta += state.spinTheta * dt;
          state.tPhi = THREE.MathUtils.clamp(state.tPhi + state.spinPhi * dt, 0.2, 1.42);
          const damp = Math.exp(-2.2 * dt);
          state.spinTheta *= damp;
          state.spinPhi *= damp;
          if (Math.abs(state.spinTheta) < 0.01) state.spinTheta = 0;
          if (Math.abs(state.spinPhi) < 0.01) state.spinPhi = 0;
        }
        const k = 1 - Math.exp(-4.2 * dt);
        state.theta += (state.tTheta - state.theta) * k;
        state.phi += (state.tPhi - state.phi) * k;
        state.radius += (state.tRadius - state.radius) * k;
        state.focus.lerp(state.tFocus, k);
        positionCamera();

        updateLevels(scene, levels, placeId, dt);

        for (const a of scene.anchors) {
          const lv = levels[a.space.id] || 0.06;
          const pulse = 0.9 + Math.sin(time * 1.6 + a.space.anchor[2] * 0.2) * 0.08;
          a.halo.material.opacity = (0.3 + 0.6 * lv) * pulse;
          a.sat1.material.opacity = (0.16 + 0.34 * lv) * pulse;
          a.sat2.material.opacity = (0.13 + 0.3 * lv) * pulse;
          a.core.scale.setScalar(0.8 + 0.9 * lv);
          a.group.scale.setScalar(1 + 0.06 * lv);
        }
      },
      render(cam) {
        renderer.render(scene.scene, cam || scene.camera);
      }
    };

    return stage;
  }

  function open() {
    if (openFlag) return;
    ensureStage();
    openFlag = true;
    clearTimeout(closeTimer);

    const ring = root.querySelector('.orb-ring');
    const r = (ring || root).getBoundingClientRect();
    stage.el.style.transformOrigin = `${((r.left + r.width * 0.5) / window.innerWidth) * 100}% ${((r.top + r.height * 0.5) / window.innerHeight) * 100}%`;
    root.classList.add('is-open');
    stage.open();
    onOpenChange?.(true);
  }

  function close() {
    if (!openFlag) return;
    openFlag = false;
    root.classList.remove('is-open');
    stage?.close();
    onOpenChange?.(false);
    closeTimer = setTimeout(() => {
      root.querySelector('.orb-ring')?.focus({ preventScroll: true });
    }, 640);
  }

  root.addEventListener('click', (e) => {
    if (suppressClick) return;
    // 点方位盘只复位，不展开
    if (e.target.closest?.('.orb-dial')) return;
    open();
  });

  /* ---------- 每帧 ---------- */
  function update(dt, info) {
    orbClock += dt;
    const current = SPACES.find((s) => s.id === info.placeId) || SPACES[0];
    placeEl.textContent = current.label;

    /* 球不可见就别算也别画。这三种情况下 CSS 已经把 .orb-root 的 opacity 压到 0：
       落地页（loading/entrance）、内容浮层盖住（data-overlay=open）、页面切后台。
       此前这里照旧每帧积分拖拽惯性、每 1/30s 提交一次约 200 次 draw call 的
       缩微场景渲染——用户一个像素都看不见。鸟瞰台展开时 openFlag 为真，
       走下面的 stage 分支，不受这一条影响。 */
    const phase = document.body.dataset.phase;
    const visible =
      (phase === 'explore' || phase === 'cinematic') &&
      document.body.dataset.overlay !== 'open' &&
      !document.hidden;
    if (!visible && !openFlag) {
      // 位置/朝向的跟随关系照旧记下来，重新可见时不会因为「换了空间」而抖一下
      lastPlace = info.placeId;
      wasTraveling = !!(info.follow && info.follow.traveling);
      freeView = false;
      resumeAt = -1;
      return;
    }

    const follow = info.follow;
    const traveling = !!(follow && follow.traveling);
    // 新一次转场开始：无论上次是否停留在自由查看，都回到自动跟随
    if (traveling && !wasTraveling) {
      freeView = false;
      resumeAt = -1;
    }
    wasTraveling = traveling;
    // 松手 1.2s 后恢复自动跟随（玻璃球与鸟瞰台共用同一状态）
    if (freeView && resumeAt >= 0 && orbClock >= resumeAt) {
      freeView = false;
      resumeAt = -1;
    }

    // 每帧都同步，即使正在自由查看：恢复时无需追赶、不会跳变或漂移。
    // 两套场景取同一个 point/yaw，放大态与缩小态行为完全一致。
    const followOn = !!(follow && follow.enabled) && !freeView;
    if (follow && follow.enabled) {
      mini.followCamera.position.copy(follow.point);
      mini.followCamera.rotation.set(follow.pitch, follow.yaw, 0, 'YXZ');
      mini.followCamera.updateMatrixWorld(true);
      if (stage) {
        stage.followCamera.position.copy(follow.point);
        stage.followCamera.rotation.set(follow.pitch, follow.yaw, 0, 'YXZ');
        stage.followCamera.updateMatrixWorld(true);
      }
    }

    // 路线光带 / 头灯只在跟随态启用，自由查看时保持原来的展示外观
    miniRoute.visible = followOn;
    mini.headLamp.visible = followOn;
    mini.followAmbient.visible = followOn;
    mini.xray.set(followOn);
    if (followOn && follow.path) fillRouteLine(miniRoute, follow.path, follow.u);
    if (stage) {
      stage.routeLine.visible = followOn;
      stage.headLamp.visible = followOn;
      stage.followAmbient.visible = followOn;
      stage.xray.set(followOn);
      if (followOn && follow.path) fillRouteLine(stage.routeLine, follow.path, follow.u);
    }

    // 换空间：手动偏转收回，自动跟随恢复
    if (lastPlace !== info.placeId) {
      lastPlace = info.placeId;
      if (followPause || manualYaw || manualPitch) resetting = true;
      followPause = false;
    }

    if (followOn) {
      // 跟随态：缩微模型必须与主场景坐标一一对应，把转台偏转平滑收回 0。
      // 只影响模型外观，不动视点（视点严格在路径采样点上）。
      const k = 1 - Math.exp(-9 * dt);
      pivotYaw -= pivotYaw * k;
      manualYaw -= manualYaw * k;
      manualPitch -= manualPitch * k;
      yawVel = 0;
      pitchVel = 0;
      resetting = false;
      followPause = false;
    } else {
      // 球内模型反向缓转：只在未手动接管时跟随视线
      const targetYaw = -info.yaw * 0.72 - Math.atan2(info.x || 0, (info.z || 0) + 28) * 0.22;
      if (!followPause) pivotYaw += (targetYaw - pivotYaw) * (1 - Math.exp(-3.2 * dt));

      // 松手后的惯性：一路滑停，不回正
      if (!drag) {
        manualYaw += yawVel * dt;
        manualPitch += pitchVel * dt;
        const damp = Math.exp(-3.4 * dt);
        yawVel *= damp;
        pitchVel *= damp;
        if (Math.abs(yawVel) < 0.02) yawVel = 0;
        if (Math.abs(pitchVel) < 0.02) pitchVel = 0;
      }
      if (manualPitch > MINI_PITCH_LIMIT) { manualPitch = MINI_PITCH_LIMIT; pitchVel = 0; }
      if (manualPitch < -MINI_PITCH_LIMIT) { manualPitch = -MINI_PITCH_LIMIT; pitchVel = 0; }

      if (resetting) {
        const k = 1 - Math.exp(-7.5 * dt);
        manualYaw += -manualYaw * k;
        manualPitch += -manualPitch * k;
        if (Math.abs(manualYaw) < 0.004 && Math.abs(manualPitch) < 0.004) {
          manualYaw = 0;
          manualPitch = 0;
          resetting = false;
        }
      }
    }

    mini.pivot.rotation.y = pivotYaw + manualYaw;
    mini.pivot.rotation.x = manualPitch;
    // 方位针指向「正在朝哪边走」：跟随态取路径切线，自由查看取主视线
    const shownYaw = followOn ? follow.yaw : info.yaw;
    needleEl.style.transform = `translate(-50%, -50%) rotate(${(-shownYaw * 180 / Math.PI).toFixed(1)}deg)`;

    updateLevels(mini, miniLevels, info.placeId, dt);

    const mark = current.anchor || current.mark;
    if (mark) mini.marker.position.set(mark[0] - mini.center.x, mark[1] - mini.center.y, mark[2] - mini.center.z);
    const level = miniLevels[info.placeId] ?? 0.06;
    const pulse = 1 + Math.sin(info.time * 2.0) * 0.09;
    mini.core.scale.setScalar((0.85 + 0.5 * level) * pulse);
    mini.halo.material.opacity = 0.45 + 0.5 * level;
    mini.halo.scale.setScalar((3.4 + 2.2 * level) * pulse);

    // 玻璃球暂停渲染：鸟瞰台展开、内容浮层打开或页面隐藏时。
    // 自动跟随用 followCamera（沿路径推进），自由查看用原来的远景展示相机。
    if (!openFlag) {
      miniAccum += dt;
      if (miniAccum > 1 / 30) {
        miniAccum = 0;
        miniRenderer.render(mini.scene, followOn ? mini.followCamera : mini.camera);
        miniRenders++;
      }
    }

    if (openFlag && stage) {
      stage.update(dt, info.placeId, info.time);
      stage.render(followOn ? stage.followCamera : null);
    }
  }

  return {
    root,
    update,
    open,
    close,
    isOpen: () => openFlag,
    // 验收接口：只读暴露两套场景的变换与几何、以及跟随状态
    inspect: () => ({ mini, stage, freeView, orbClock, resumeAt, miniRenders }),
    // 验收接口：驱动「拖动暂停 / 延时恢复」这条状态机，避免依赖合成指针事件
    debugFreeView: (on, resumeIn = -1) => {
      freeView = !!on;
      resumeAt = resumeIn >= 0 ? orbClock + resumeIn : -1;
    }
  };
}

