import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BoxBatch, archBandGeometry, curtainGeometry, addGlowSprite, makeContactMaterial, contactPatch, mergeStatic } from './utils.js';
import { STOPS } from '../core/stops.js';
import { entriesOf, STOP_COLLECTIONS } from '../content/index.js';

export function createSconce(mats, glassMat) {
  const g = new THREE.Group();
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.52, 0.14), mats.gold);
  back.position.set(0, 0, 0);
  g.add(back);

  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.34, 8), mats.gold);
  arm.rotation.z = Math.PI / 2;
  arm.position.set(0.2, -0.08, 0);
  g.add(arm);

  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.014, 6, 18), mats.brass);
  loop.position.set(0.42, -0.1, 0);
  loop.rotation.y = Math.PI / 2;
  g.add(loop);

  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.045, 0.09, 12), mats.gold);
  cup.position.set(0.42, 0.04, 0);
  g.add(cup);

  const shade = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), glassMat);
  shade.scale.set(1, 1.15, 1);
  shade.position.set(0.42, 0.24, 0);
  shade.userData.sconceShade = true;   // 收集起来统一实例化
  g.add(shade);

  const glow = addGlowSprite(mats, g, 0.42, 0.24, 0, 0.72, 0.36);
  return { group: g, glow };
}

/* 壁灯的玻璃罩：形状与材质完全一致，逐个画是白费；
   收成一枚 InstancedMesh，灯位仍然各自独立。 */
export function instanceSconceShades(group, glassMat) {
  const shades = [];
  group.traverse((o) => {
    if (o.isMesh && !o.isInstancedMesh && o.userData.sconceShade) shades.push(o);
  });
  if (shades.length < 2) return null;
  group.updateMatrixWorld(true);
  const geo = shades[0].geometry;
  const mesh = new THREE.InstancedMesh(geo, glassMat, shades.length);
  mesh.frustumCulled = false;
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const m = new THREE.Matrix4();
  shades.forEach((o, i) => {
    m.multiplyMatrices(inv, o.matrixWorld);
    mesh.setMatrixAt(i, m);
    o.parent.remove(o);
  });
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
  return mesh;
}

function createUrn(mats) {
  const g = new THREE.Group();
  const garnet = new THREE.MeshPhysicalMaterial({
    color: 0x3a1114,
    roughness: 0.24,
    metalness: 0.05,
    clearcoat: 1,
    clearcoatRoughness: 0.25,
    envMapIntensity: 0.9,
    sheen: 0.4,
    sheenColor: new THREE.Color(0xb05050)
  });

  const profile = [
    [0.0, 0.0],
    [0.17, 0.02],
    [0.21, 0.08],
    [0.13, 0.14],
    [0.2, 0.22],
    [0.32, 0.42],
    [0.34, 0.6],
    [0.3, 0.76],
    [0.23, 0.86],
    [0.28, 0.92],
    [0.25, 0.97],
    [0.18, 1.0]
  ].map(([x, y]) => new THREE.Vector2(x, y));

  const urn = new THREE.Mesh(new THREE.LatheGeometry(profile, 28), garnet);
  urn.castShadow = true;
  urn.receiveShadow = true;
  g.add(urn);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.018, 6, 24), mats.gold);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 1.0;
  g.add(rim);

  const band = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.014, 6, 24), mats.gold);
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.36;
  g.add(band);

  for (const dir of [-1, 1]) {
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.016, 6, 18, Math.PI * 1.2), mats.gold);
    handle.position.set(dir * 0.33, 0.66, 0);
    handle.rotation.y = Math.PI / 2;
    handle.rotation.z = dir * 0.5;
    g.add(handle);
  }

  return g;
}

/* 门厅：draw call 预算 32（静置机位实测 28，合批后）。
   超过就先合批，再谈新增陈设。 */
export function buildFoyer(scene, mats, quality) {
  const group = new THREE.Group();
  scene.add(group);

  const gold = new BoxBatch(mats.gold);
  const goldDeep = new BoxBatch(mats.goldDeep);
  const wood = new BoxBatch(mats.wood);
  const velvetPanels = new BoxBatch(mats.velvetWall);
  const sconceGlows = [];
  const glassMat = mats.warmGlass.clone();

  /* ---------- 地面 ---------- */
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 16.6), mats.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0.012, -8.3);
  floor.receiveShadow = true;
  group.add(floor);

  // 中央红丝绒地毯，两侧留出抛光大理石
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 14.6), mats.velvet);
  carpet.rotation.x = -Math.PI / 2;
  carpet.position.set(0, 0.032, -8.3);
  carpet.receiveShadow = true;
  group.add(carpet);
  gold.add(0.06, 0.02, 14.6, -1.5, 0.044, -8.3);
  gold.add(0.06, 0.02, 14.6, 1.5, 0.044, -8.3);
  gold.add(3.02, 0.02, 0.06, 0, 0.044, -1.02);
  gold.add(3.02, 0.02, 0.06, 0, 0.044, -15.58);

  /* ---------- 顶棚 ---------- */
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(14, 16.6), mats.ceiling);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 10.8, -8.3);
  group.add(ceiling);

  /* ---------- 两侧墙与入口墙 ---------- */
  const sideGeo = new THREE.BoxGeometry(0.5, 10.8, 16.6);
  for (const sign of [-1, 1]) {
    const wall = new THREE.Mesh(sideGeo, mats.plaster);
    wall.position.set(sign * 7.25, 5.4, -8.3);
    wall.receiveShadow = true;
    group.add(wall);
  }

  const entranceWallMat = mats.plaster;
  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(5.7, 10.8, 0.8), entranceWallMat);
  leftWall.position.set(-4.65, 5.4, 0.4);
  leftWall.receiveShadow = true;
  group.add(leftWall);

  const rightWall = leftWall.clone();
  rightWall.position.x = 4.65;
  group.add(rightWall);

  // 入口墙上部不再封实：正立面中缝要能透进来看见吊灯与弧墙暖光
  // 缝内是一整片背光琥珀玻璃，外面看是透光的裂缝，里面看是门上的采光窗
  const crackGlass = new THREE.MeshBasicMaterial({
    color: 0xb9702f,
    toneMapped: false,
    transparent: true,
    opacity: 0.62,
    side: THREE.DoubleSide
  });
  const crackPanel = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 5.6), crackGlass);
  crackPanel.position.set(0, 7.9, 0.42);
  group.add(crackPanel);
  const crackMullion = new BoxBatch(mats.brass);
  crackMullion.add(0.07, 5.6, 0.07, -0.9, 7.9, 0.4);
  crackMullion.add(0.07, 5.6, 0.07, 0.9, 7.9, 0.4);
  crackMullion.add(3.5, 0.07, 0.07, 0, 9.0, 0.4);
  crackMullion.build(group);

  /* ---------- 尽头拱形墙 ---------- */
  const wallShape = new THREE.Shape();
  wallShape.moveTo(-7.5, 0);
  wallShape.lineTo(7.5, 0);
  wallShape.lineTo(7.5, 10.8);
  wallShape.lineTo(-7.5, 10.8);
  wallShape.closePath();

  /* 墙洞是本层入廊的第一道卡口：原来是半径 2.2 的半圆，冠只有 6.60，
     比走廊里的木门套（6.70）还低 0.10——上一轮 Z12 量在门套上，
     把这道墙洞漏掉了。这里改成竖椭圆：半跨仍是 2.2，竖向半径 2.55，
     冠抬到 6.95（净高 2.914），与门套 2.95 一起过 2.85 的判据。
     起拱线仍留在 4.4，不做「高跷拱」，门厅的构图不变。 */
  const ARCH_RY = 2.55;
  const hole = new THREE.Path();
  hole.moveTo(-2.2, 0);
  hole.lineTo(-2.2, 4.4);
  hole.absellipse(0, 4.4, 2.2, ARCH_RY, Math.PI, 0, true);
  hole.lineTo(2.2, 0);
  hole.closePath();
  wallShape.holes.push(hole);

  const farGeo = new THREE.ExtrudeGeometry(wallShape, {
    depth: 0.7,
    bevelEnabled: false,
    curveSegments: 32
  });
  const farWall = new THREE.Mesh(farGeo, mats.plaster);
  farWall.position.z = -17.2;
  farWall.receiveShadow = true;
  group.add(farWall);

  /* ---------- 台口拱饰 ---------- */
  // 三道拱饰随墙洞一起竖向拉开（2.55/2.2 = 1.159），起拱线不变
  const ARCH_SY = ARCH_RY / 2.2;
  const archA = new THREE.Mesh(archBandGeometry(2.2, 2.6, 0.2), mats.goldDeep);
  archA.position.set(0, 4.4, -16.62);
  archA.scale.y = ARCH_SY;
  group.add(archA);

  const archB = new THREE.Mesh(archBandGeometry(2.6, 2.92, 0.28), mats.marble);
  archB.position.set(0, 4.4, -16.7);
  archB.scale.y = ARCH_SY;
  archB.receiveShadow = true;
  group.add(archB);

  const archC = new THREE.Mesh(archBandGeometry(2.14, 2.2, 0.16), mats.brass);
  archC.position.set(0, 4.4, -16.5);
  archC.scale.y = ARCH_SY;
  group.add(archC);

  for (const sign of [-1, 1]) {
    gold.add(0.5, 0.35, 0.55, sign * 3.32, 0.18, -16.45);
    gold.add(0.42, 0.2, 0.46, sign * 3.32, 0.4, -16.45);
    wood.add(0.46, 6.4, 0.4, sign * 3.32, 3.7, -16.46);
    gold.add(0.56, 0.24, 0.48, sign * 3.32, 7.02, -16.45);
    goldDeep.add(0.62, 0.12, 0.52, sign * 3.32, 7.2, -16.45);
    gold.add(0.1, 5.6, 0.04, sign * 3.56, 3.7, -16.24);
  }

  // 拱顶饰章
  const crest = new THREE.Mesh(new THREE.CircleGeometry(0.46, 40), mats.crest);
  crest.position.set(0, 8.75, -16.48);
  group.add(crest);

  const crestRing = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.022, 6, 40), mats.gold);
  crestRing.position.set(0, 8.75, -16.46);
  group.add(crestRing);

  // 丝绒帘挂在洞口两侧的墙面上，不再探入洞口：门洞净宽保持 ±2.2m 全通
  for (const sign of [-1, 1]) {
    const curtain = new THREE.Mesh(curtainGeometry(0.8, 6.2, 4, 0.09), mats.velvet);
    curtain.position.set(sign * 2.65, 3.1, -16.44);
    curtain.castShadow = true;
    group.add(curtain);
  }

  /* ---------- 门厅墙面：护墙板 / 饰板 / 壁柱 ---------- */
  const bayEdges = [-0.2, -1.9, -5.6, -9.3, -13.0, -16.4];

  for (const sign of [-1, 1]) {
    const faceX = sign * 6.96;
    const frameX = sign * 6.88;

    for (let i = 0; i < bayEdges.length - 1; i++) {
      const zA = bayEdges[i];
      const zB = bayEdges[i + 1];
      const span = Math.abs(zB - zA) - 0.06;
      const zc = (zA + zB) / 2;
      const pw = Math.max(0.9, span - 0.9);

      // 护墙板
      wood.add(0.14, 1.95, span, faceX, 1.12, zc);
      gold.add(0.16, 0.07, span, faceX, 2.12, zc);
      goldDeep.add(0.18, 0.12, span, faceX, 0.14, zc);

      // 丝绒饰板
      velvetPanels.add(0.07, 4.55, pw, faceX, 4.55, zc);
      gold.add(0.1, 4.9, 0.13, frameX, 4.55, zc - pw / 2 - 0.07);
      gold.add(0.1, 4.9, 0.13, frameX, 4.55, zc + pw / 2 + 0.07);
      gold.add(0.1, 0.14, pw + 0.24, frameX, 6.95, zc);
      gold.add(0.1, 0.14, pw + 0.24, frameX, 2.15, zc);

      // 上部深色镜板
      if (i >= 1) {
        const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.9, Math.min(2.4, pw)), mats.mirrorDark);
        mirror.position.set(faceX, 9.0, zc);
        group.add(mirror);
        gold.add(0.09, 2.1, 0.09, frameX, 9.0, zc - Math.min(1.2, pw / 2) - 0.06);
        gold.add(0.09, 2.1, 0.09, frameX, 9.0, zc + Math.min(1.2, pw / 2) + 0.06);
        gold.add(0.09, 0.09, pw + 0.1, frameX, 10.0, zc);
        gold.add(0.09, 0.09, pw + 0.1, frameX, 8.0, zc);
      }
    }

    // 壁柱
    for (const z of bayEdges) {
      wood.add(0.5, 7.4, 0.34, sign * 6.8, 3.85, z);
      gold.add(0.7, 0.38, 0.5, sign * 6.78, 0.21, z);
      goldDeep.add(0.58, 0.1, 0.42, sign * 6.79, 0.44, z);
      gold.add(0.68, 0.2, 0.5, sign * 6.78, 7.52, z);
      goldDeep.add(0.58, 0.14, 0.42, sign * 6.79, 7.36, z);
      gold.add(0.035, 5.4, 0.03, sign * 6.56, 4.0, z + 0.19);
    }

    // 壁灯
    for (const z of [-5.6, -9.3, -13.0]) {
      const sconce = createSconce(mats, glassMat);
      sconce.group.position.set(sign * 6.74, 3.95, z);
      sconce.group.rotation.y = sign === 1 ? Math.PI : 0;
      group.add(sconce.group);
      sconceGlows.push(sconce.glow);
    }
  }

  // 长条檐口与顶部线脚
  for (const sign of [-1, 1]) {
    gold.add(0.32, 0.14, 16.4, sign * 6.86, 7.64, -8.3);
    goldDeep.add(0.5, 0.16, 16.4, sign * 6.74, 7.74, -8.3);
    gold.add(0.12, 0.16, 16.4, sign * 6.58, 7.86, -8.3);
    goldDeep.add(0.4, 0.1, 16.4, sign * 6.9, 9.98, -8.3);
    gold.add(0.06, 0.06, 16.4, sign * 6.6, 7.94, -8.3);
  }

  // 入口墙线脚
  gold.add(14.0, 0.14, 0.34, 0, 7.64, -0.12);
  goldDeep.add(14.0, 0.16, 0.48, 0, 7.74, -0.2);

  // 入口门套与山花
  for (const sign of [-1, 1]) {
    gold.add(0.18, 5.4, 0.2, sign * 1.93, 2.7, 0.06);
    gold.add(0.12, 5.6, 0.3, sign * 2.12, 2.8, 0.02);
    goldDeep.add(0.24, 0.28, 0.34, sign * 2.1, 5.3, 0.02);
  }
  gold.add(4.4, 0.16, 0.3, 0, 5.18, 0.04);

  const pedimentShape = new THREE.Shape();
  pedimentShape.moveTo(-2.35, 0);
  pedimentShape.lineTo(0, 0.66);
  pedimentShape.lineTo(2.35, 0);
  pedimentShape.closePath();
  const pediment = new THREE.Mesh(
    new THREE.ExtrudeGeometry(pedimentShape, { depth: 0.12, bevelEnabled: false }),
    mats.goldDeep
  );
  pediment.position.set(0, 5.42, 0.02);
  group.add(pediment);

  const pedimentLine = new THREE.Mesh(
    new THREE.ExtrudeGeometry(pedimentShape, { depth: 0.04, bevelEnabled: false }),
    mats.gold
  );
  pedimentLine.scale.set(0.94, 0.94, 1);
  pedimentLine.position.set(0, 5.44, 0.14);
  group.add(pedimentLine);

  // 门楣上方座钟
  const clockRing = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.032, 8, 40), mats.gold);
  clockRing.position.set(0, 7.0, 0.09);
  group.add(clockRing);
  const clock = new THREE.Mesh(new THREE.CircleGeometry(0.36, 40), mats.clock);
  clock.position.set(0, 7.0, 0.1);
  group.add(clock);

  /* ---------- 顶棚藻井 ---------- */
  for (const x of [-4.8, -2.4, 0, 2.4, 4.8]) {
    wood.add(0.22, 0.32, 16.4, x, 10.58, -8.3);
    goldDeep.add(0.08, 0.04, 16.4, x + 0.17, 10.56, -8.3);
  }
  for (const z of [-2.1, -5.7, -9.3, -12.9, -15.6]) {
    wood.add(13.9, 0.32, 0.22, 0, 10.58, z);
    goldDeep.add(13.9, 0.04, 0.08, 0, 10.56, z + 0.17);
  }
  const medallion = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.05, 8, 44), mats.gold);
  medallion.rotation.x = Math.PI / 2;
  medallion.position.set(0, 10.72, -8.3);
  group.add(medallion);
  const ceilingCrest = new THREE.Mesh(new THREE.CircleGeometry(0.55, 40), mats.crest);
  ceilingCrest.rotation.x = Math.PI / 2;
  ceilingCrest.position.set(0, 10.71, -8.3);
  group.add(ceilingCrest);

  /* ---------- 长椅两端的瓮 ---------- */
  const urns = createUrn(mats);
  const pedestalGeo = new THREE.BoxGeometry(0.58, 1.0, 0.58);
  for (const [x, z] of [[-5.75, -1.75], [5.75, -1.75], [-5.75, -14.55], [5.75, -14.55]]) {
    const pedestal = new THREE.Mesh(pedestalGeo, mats.marble);
    pedestal.position.set(x, 0.5, z);
    pedestal.castShadow = true;
    pedestal.receiveShadow = true;
    group.add(pedestal);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.1, 0.68), mats.gold);
    cap.position.set(x, 1.02, z);
    group.add(cap);
    const inst = urns.clone();
    inst.position.set(x, 1.06, z);
    group.add(inst);
  }

  /* ---------- 接触阴影：基座落地处的柔和暗部 ---------- */
  const pedestalSpots = [[-5.75, -1.75], [5.75, -1.75], [-5.75, -14.55], [5.75, -14.55]];
  const pedestalShadow = new THREE.Mesh(
    mergeGeometries(
      pedestalSpots.map(([x, z]) => contactPatch(x, 0.021, z, 1.16, 1.16, true)),
      false
    ),
    makeContactMaterial(mats, 0.38)
  );
  pedestalShadow.renderOrder = 1;
  group.add(pedestalShadow);

  /* ---------- 门厅节目板：一块真的挂在左墙上的木框板 ----------
     六行板块名、一句简介与“几篇 · 最近日期”，下面一行小字指向浮层里的最近更新。
     走近或直接点它，都能打开节目板浮层。 */
  const boardCanvas = document.createElement('canvas');
  boardCanvas.width = 1024;
  boardCanvas.height = 860;
  const bg = boardCanvas.getContext('2d');
  bg.fillStyle = '#100b09';
  bg.fillRect(0, 0, 1024, 860);
  bg.strokeStyle = 'rgba(214,179,120,0.55)';
  bg.lineWidth = 3;
  bg.strokeRect(28, 28, 968, 804);
  bg.strokeStyle = 'rgba(214,179,120,0.2)';
  bg.lineWidth = 1;
  bg.strokeRect(42, 42, 940, 776);

  bg.textAlign = 'center';
  // 顶端品牌行：中文主字在上、RAINSABOVE 副行在下
  bg.fillStyle = '#e4d4b6';
  bg.font = '400 34px "Songti SC", "Noto Serif SC", serif';
  bg.fillText('泫 咏', 512, 84);
  bg.fillStyle = 'rgba(214,179,120,0.62)';
  bg.font = '400 14px Georgia, "Times New Roman", serif';
  bg.fillText('R A I N S A B O V E', 512, 110);
  bg.fillStyle = '#e4d4b6';
  bg.font = '400 30px "Songti SC", "Noto Serif SC", serif';
  bg.fillText('门 厅 节 目 板', 512, 152);
  bg.fillStyle = 'rgba(214,179,120,0.5)';
  bg.font = '400 15px Georgia, serif';
  bg.fillText('P R O G R A M M E', 512, 174);
  bg.strokeStyle = 'rgba(214,179,120,0.28)';
  bg.beginPath();
  bg.moveTo(190, 190);
  bg.lineTo(834, 190);
  bg.stroke();

  const dateShort = (date) => {
    const m = String(date || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[2]}.${m[3]}` : String(date || '');
  };
  const statusOf = (stop) => {
    const entries = entriesOf(STOP_COLLECTIONS[stop.id]);
    if (!entries.length) return '筹备中';
    const latest = entries.reduce((a, b) => (String(b.data.date || '') > String(a.data.date || '') ? b : a));
    return `${entries.length} 篇 · ${dateShort(latest.data.date)}`;
  };

  const STATUS_NOTE = {
    foyer: '推门，取票，等第一遍铃',
    backstage: '灯没全亮，戏服先挂好了',
    stage: '今夜只演一件，其余留给黑',
    workshop: '一半在画景，一半在排练',
    screening: '一块小银幕，只放自己收的片',
    box: '三层弧墙上的八间小包厢',
    about: '后台西侧，写字桌与旧海报'
  };

  const rowTop = 198;
  const rowH = 82;
  STOPS.forEach((stop, i) => {
    const y = rowTop + i * rowH;
    bg.textAlign = 'left';
    bg.fillStyle = 'rgba(214,179,120,0.7)';
    bg.font = '400 15px Georgia, serif';
    bg.fillText(stop.numeral, 74, y + 42);

    bg.fillStyle = '#e9ddc7';
    bg.font = '400 30px "Songti SC", "Noto Serif SC", serif';
    bg.fillText(stop.label, 132, y + 38);
    bg.fillStyle = 'rgba(233,221,199,0.32)';
    bg.font = '400 12px Georgia, serif';
    bg.fillText(stop.en, 134, y + 60);

    bg.fillStyle = 'rgba(233,221,199,0.44)';
    bg.font = '400 16px "Songti SC", "Noto Serif SC", serif';
    bg.fillText(STATUS_NOTE[stop.id] || '', 330, y + 54);

    bg.textAlign = 'right';
    bg.fillStyle = 'rgba(214,179,120,0.58)';
    bg.font = '400 14px "Songti SC", "Noto Serif SC", serif';
    bg.fillText(statusOf(stop), 934, y + 54);

    bg.strokeStyle = 'rgba(214,179,120,0.16)';
    bg.beginPath();
    bg.moveTo(74, y + 78);
    bg.lineTo(934, y + 78);
    bg.stroke();
  });

  bg.textAlign = 'center';
  bg.fillStyle = 'rgba(233,221,199,0.32)';
  bg.font = '400 15px "Songti SC", "Noto Serif SC", serif';
  bg.fillText('下方三条最近更新 · 点板即开', 512, 812);

  const boardTex = new THREE.CanvasTexture(boardCanvas);
  boardTex.colorSpace = THREE.SRGBColorSpace;
  boardTex.anisotropy = 8;
  const boardMat = new THREE.MeshStandardMaterial({
    map: boardTex,
    emissive: new THREE.Color(0x2a1c12),
    emissiveMap: boardTex,
    emissiveIntensity: 0.22,
    roughness: 0.84
  });
  const BOARD_Y = 2.7;   // 板面 1.40–4.00m，站在门厅里平视即可读全
  const board = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.6), boardMat);
  board.rotation.y = Math.PI / 2;
  // 整块板连同木框前移到墙面金线之外，否则墙饰的金框会横穿板面
  board.position.set(-6.58, BOARD_Y, -7.45);
  board.userData.noMerge = true;   // 实体节目板要能单独点选
  group.add(board);

  wood.add(0.12, 2.76, 0.14, -6.66, BOARD_Y, -9.12);
  wood.add(0.12, 2.76, 0.14, -6.66, BOARD_Y, -5.78);
  wood.add(0.12, 0.12, 3.46, -6.66, BOARD_Y + 1.36, -7.45);
  wood.add(0.12, 0.12, 3.46, -6.66, BOARD_Y - 1.36, -7.45);
  goldDeep.add(0.1, 0.035, 3.36, -6.58, BOARD_Y + 1.28, -7.45);
  goldDeep.add(0.1, 0.035, 3.36, -6.58, BOARD_Y - 1.28, -7.45);
  // 画灯：一小段黄铜杆，给板面一束暖光
  gold.add(0.06, 0.08, 0.5, -6.52, BOARD_Y + 1.44, -7.45);
  const boardLight = new THREE.PointLight(0xffc78f, 4.5, 4.2, 2);
  boardLight.position.set(-6.2, BOARD_Y + 1.0, -7.45);
  group.add(boardLight);

  gold.build(group);
  goldDeep.build(group);
  wood.build(group);
  velvetPanels.build(group);

  // 墙脚暖光灯带
  const coveMat = new THREE.MeshStandardMaterial({
    color: 0x1b0d07,
    emissive: new THREE.Color(0xff9f58),
    emissiveIntensity: 0.45,
    roughness: 0.7
  });
  const coveGeo = new THREE.BoxGeometry(0.055, 0.055, 15.8);
  for (const sign of [-1, 1]) {
    const strip = new THREE.Mesh(coveGeo, coveMat);
    strip.position.set(sign * 6.52, 7.9, -8.3);
    group.add(strip);
  }
  const coveFront = new THREE.Mesh(new THREE.BoxGeometry(13.4, 0.055, 0.055), coveMat);
  coveFront.position.set(0, 7.9, -16.25);
  group.add(coveFront);

  instanceSconceShades(group, glassMat);
  // 静态件合批：同材质、同阴影、同渲染次序的构件并成一份
  mergeStatic(group);

  return {
    group,
    floorMesh: floor,
    coveMat,
    sconceGlows,
    programmeMeshes: [board],
    setAmbientDetail(v) {
      coveMat.emissiveIntensity = 0.45 * v;
      sconceGlows.forEach((g) => {
        g.material.opacity = (g.userData.baseOpacity || 0.5) * (0.25 + 0.75 * v);
      });
      glassMat.emissiveIntensity = 2.2 * (0.35 + 0.65 * v);
    }
  };
}
