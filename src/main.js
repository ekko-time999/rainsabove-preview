import './style.css';
import * as THREE from 'three';
import { detectQuality } from './core/quality.js';
import { createEngine } from './core/engine.js';
import { createMaterials } from './world/materials.js';
import { buildWorld } from './world/world.js';
import { CameraRig } from './core/cameraRig.js';
import { Tour } from './core/tour.js';
import { updateTweens } from './core/anim.js';
import {
  STOP_BY_ID,
  STOPS,
  NAV,
  ZONES,
  ZONE_BY_ID,
  SPACES,
  zoneAt,
  MAIN_LINE,
  routeBetween,
  isUpperSpace,
  LEVEL_GROUND,
  LEVEL_UPPER,
  constrainWalk,
  resolveWalkLevel,
  spaceAt
} from './core/stops.js';
import { createHUD } from './ui/hud.js';
import { createOverlay } from './ui/overlay.js';
import { createOrb } from './ui/orb.js';
import { createPreviewBar } from './ui/previewBar.js';
import { createAudio } from './core/audio.js';
import { createShow } from './core/show.js';
import { tween, easeInOutSine, easeOutCubic } from './core/anim.js';
import { contentManifest, loadStopEntries } from './content/index.js';

const quality = detectQuality();
const engine = createEngine(quality);
const mats = createMaterials(quality);
// ?shell=a | b | c | legacy：外形切换，默认 C（定稿），A/B 保留回看
const shellParam = new URLSearchParams(location.search).get('shell') || 'c';
const world = buildWorld(engine.scene, mats, quality, engine.renderer, { shellScheme: shellParam });
const canvas = engine.renderer.domElement;

// 声音全部由 Web Audio 现场合成；演出态调度只管灯光与幕布
const audio = createAudio(quality);
const show = createShow({ world, audio });

const foyerStop = STOP_BY_ID.foyer;
const camera = engine.camera;
camera.position.set(0, 1.62, 8.8);
camera.lookAt(0, 2.72, 0.24);

const liveBounds = {
  minX: -5.3,
  maxX: 5.3,
  minZ: MAIN_LINE.minZ,
  maxZ: MAIN_LINE.maxZ
};
const rig = new CameraRig(camera, canvas, { bounds: liveBounds });
let tour;
let overlay;
let orb;
let level = LEVEL_GROUND;

// 可走区域每帧夹取：地面与二楼各一套，邻接区域重叠，边界与标高连续
rig.constrain = (x, z) => constrainWalk(x, z, level);

// 当前所在空间：二楼按区域判断，地面层按位置换算
function currentSpaceId() {
  if (!tour?.started) return 'foyer';
  if (level === LEVEL_UPPER) return spaceAt(rig.position.x, rig.position.z, level) || 'gallery';
  // 地面层：办公室短廊与后台共用 z 段，先看可行走区带的空间标记，再回落到区段
  return spaceAt(rig.position.x, rig.position.z, level) || zoneAt(rig.position.z).id;
}

// 统一入口：任意空间之间直接生成路线，跨层走楼梯，不再经门厅中转
function go(id) {
  if (!tour.started || tour.playing) return false;
  if (overlay?.isOpen() || orb?.isOpen()) return false;
  if (!STOP_BY_ID[id] && !NAV[id]) return false;
  const from = currentSpaceId();
  if (id === from) return false;
  // 离开时把当前区域收一点，目的地先压到半亮，抵达时再亮起来
  const fromArea = areaOf(from);
  const toArea = areaOf(id);
  if (fromArea !== toArea) {
    dimArea(fromArea, 0.62, 0.5);
    presetArea(toArea, 0.56);
  }
  return tour.travelTo(id, routeBetween(from, id));
}

/* ---------- 分区灯光淡入：进入空间时渐亮，离开时渐暗 ---------- */
const AREA_OF_SPACE = {
  foyer: 'foyer',
  corridor: 'corridor',
  auditorium: 'auditorium',
  stage: 'auditorium',
  gallery: 'upper',
  backstage: 'backstage',
  workshop: 'workshop',
  screening: 'screening',
  box: 'box',
  about: 'office',
  office: 'office'
};
const areaValues = {};

const prefersReduced = () =>
  Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

function areaOf(id) {
  return AREA_OF_SPACE[id] || 'foyer';
}

function setArea(area, value) {
  areaValues[area] = value;
  world.setAreaFade(area, value);
}

function dimArea(area, to, duration) {
  const from = areaValues[area] ?? 1;
  if (Math.abs(from - to) < 0.005) return;
  const d = prefersReduced() ? duration * 0.5 : duration;
  tween({
    duration: d,
    ease: easeInOutSine,
    onUpdate: (v) => setArea(area, from + (to - from) * v)
  });
}

function presetArea(area, value) {
  setArea(area, value);
}

function liftArea(area) {
  const from = areaValues[area] ?? 1;
  if (from >= 0.995) return;
  tween({
    duration: prefersReduced() ? 0.45 : 1.0,
    ease: easeOutCubic,
    onUpdate: (v) => setArea(area, from + (1 - from) * v)
  });
}

function audioZoneOf(id) {
  if (id === 'about') return 'office';
  if (id === 'gallery') return 'upper';
  return id;
}

rig.onLookStart = () => {
  canvas.style.cursor = 'grabbing';
  hud.noteActivity();
};
rig.onLookEnd = () => {
  if (document.body.dataset.phase === 'explore') canvas.style.cursor = 'grab';
};

const hud = createHUD({
  onEnter: () => enterFoyer(),
  onNext: (id) => go(id),
  onEnterStop: (id) => overlay?.open(id),
  onDirectory: () => overlay?.openDirectory()
});

tour = new Tour({
  camera,
  rig,
  world,
  onPhase: (phase) => {
    hud.setPhase(phase);
    if (phase === 'cinematic') {
      canvas.style.cursor = 'default';
      hud.setExits(null, false);
      hud.setEnterPrompt(null, false);
      exitsVisible = false;
      enterVisible = false;
    } else if (phase === 'explore') {
      canvas.style.cursor = 'grab';
      // 进入漫游后，操作提示几秒后自行淡出，不长期压住画面
      window.clearTimeout(hintTimer);
      hintTimer = window.setTimeout(() => hud.dimHints(), 4600);
      // 从链接直达某篇：等镜头落稳后直接展开正文，不先弹灯箱墙再收
      if (!deepLinkDone) {
        deepLinkDone = true;
        window.setTimeout(() => overlay?.openFromLocation(), 620);
      }
    }
  },
  onEntered: () => {
    canvas.style.cursor = 'grab';
  },
  onArrived: (id) => {
    level = isUpperSpace(id) ? LEVEL_UPPER : LEVEL_GROUND;
    lastZoneId = '';
    // 落点灯光渐亮；观众厅第一次抵达时自动走一遍开场（三遍铃 + 开幕）
    liftArea(areaOf(id));
    audio.setZone(audioZoneOf(id));
    if (!autoPreshowDone && (id === 'auditorium' || id === 'stage')) {
      autoPreshowDone = true;
      window.setTimeout(() => {
        if (show.startPreshow()) syncShow();
      }, 1100);
    }
  }
});

hud.bindDpad((dir, active) => rig.setTouchMove(dir, active));

/* ---------- 声音与演出控制 ---------- */
const soundBtn = document.getElementById('sound-btn');
const curtainBtn = document.getElementById('curtain-btn');
const showBtn = document.getElementById('show-btn');

let autoPreshowDone = false;
let deepLinkDone = false;
let lastAudioZone = 'foyer';

// 第一次手势才建立/恢复 AudioContext，之前不发声
function unlockAudio() {
  audio.unlock().then((running) => {
    if (!running) return;
    audio.setZone(audioZoneOf(currentSpaceId()));
  });
}
window.addEventListener('pointerdown', unlockAudio, true);
window.addEventListener('keydown', unlockAudio, true);

function syncSound() {
  const muted = audio.isMuted();
  soundBtn.classList.toggle('is-muted', muted);
  soundBtn.setAttribute('aria-pressed', String(muted));
  soundBtn.setAttribute('aria-label', muted ? '声音：已静音' : '声音：开启');
}

function syncShow() {
  const on = show.getMode() !== 'daily';
  showBtn.classList.toggle('is-on', on);
  showBtn.setAttribute('aria-pressed', String(on));
  const label = showBtn.querySelector('.stage-tool-label');
  if (label) label.textContent = on ? '落幕' : '演出';
  showBtn.setAttribute('aria-label', on ? '落幕：回到日常照明' : '开始演出：三遍铃与开幕');

  const open = show.getCurtainOpen();
  curtainBtn.classList.toggle('is-on', !open);
  curtainBtn.setAttribute('aria-pressed', String(!open));
  curtainBtn.setAttribute('aria-label', open ? '合上幕布' : '拉开幕布');
}

function toggleShow() {
  unlockAudio();
  autoPreshowDone = true;
  show.toggle();
  syncShow();
}

function toggleCurtain() {
  unlockAudio();
  autoPreshowDone = true;
  show.toggleCurtain();
  syncShow();
}

function toggleMute() {
  audio.setMuted(!audio.isMuted());
  syncSound();
}

soundBtn.addEventListener('click', toggleMute);
curtainBtn.addEventListener('click', toggleCurtain);
showBtn.addEventListener('click', toggleShow);
syncSound();
syncShow();

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
  if (!tour.started || tour.playing || overlay.isOpen() || orb.isOpen()) return;
  if (e.code === 'KeyP') {
    e.preventDefault();
    toggleShow();
  } else if (e.code === 'KeyC') {
    e.preventDefault();
    toggleCurtain();
  } else if (e.code === 'KeyM') {
    e.preventDefault();
    toggleMute();
  }
});

/* ---------- 竖屏取景：单独视场角 + 压平的落点视线 ---------- */
let hintTimer = 0;

function isPortraitView() {
  return window.innerWidth < 760 && window.innerHeight > window.innerWidth;
}

function applyViewport() {
  const portrait = isPortraitView();
  tour.portrait = portrait;
  document.body.dataset.view = portrait ? 'portrait' : 'landscape';
  engine.resize();
}

applyViewport();
window.addEventListener('resize', applyViewport);
window.addEventListener('orientationchange', () => setTimeout(applyViewport, 260));
if (window.visualViewport) window.visualViewport.addEventListener('resize', applyViewport);

/* ---------- 预览标识：仅预览构建创建，正式构建这里什么都不做 ---------- */
createPreviewBar();

/* ---------- 内容浮层：节目单 / 档案卡 ---------- */
overlay = createOverlay({
  onTravel: (id) => go(id),
  getCurrent: () => currentSpaceId(),
  onOpenChange: (open) => {
    if (open) {
      rig.setEnabled(false);
      hud.setEnterPrompt(null, false);
      hud.setExits(null, false);
      exitsVisible = false;
      enterVisible = false;
      canvas.style.cursor = 'default';
    } else if (tour.started && !tour.playing) {
      rig.setEnabled(true);
      canvas.style.cursor = 'grab';
    }
  }
});

/* ---------- 角落玻璃球：鸟瞰台 ---------- */
orb = createOrb({
  quality,
  mats,
  onEnter: (id) => go(id),
  onOpenChange: (open) => {
    document.body.dataset.orb = open ? 'open' : 'closed';
    if (open) {
      rig.setEnabled(false);
      hud.setEnterPrompt(null, false);
      hud.setExits(null, false);
      exitsVisible = false;
      enterVisible = false;
      canvas.style.cursor = 'default';
    } else if (tour.started && !tour.playing && !overlay.isOpen()) {
      rig.setEnabled(true);
      canvas.style.cursor = 'grab';
    }
  }
});

window.addEventListener('keydown', (e) => {
  if (e.code !== 'KeyE' || e.metaKey || e.ctrlKey || e.altKey) return;
  if (overlay.isOpen() || tour.playing || !tour.started) return;
  if (!enterVisible || !enterStopId) return;
  e.preventDefault();
  overlay.open(enterStopId);
});

let entered = false;
function enterFoyer() {
  if (entered) return;
  entered = true;
  unlockAudio();
  tour.start();
}

/* ---------- 直接轻推门扇也能进入 ---------- */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function hitAt(e, meshes) {
  const rect = canvas.getBoundingClientRect();
  ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  return raycaster.intersectObjects(meshes, false).length > 0;
}

function hitDoor(e) {
  return hitAt(e, world.entrance.doorMeshes);
}

// 门厅左墙上的实体节目板：点板即开浮层
function hitBoard(e) {
  return hitAt(e, world.foyer.programmeMeshes);
}

let downX = 0;
let downY = 0;
canvas.addEventListener('pointerdown', (e) => {
  downX = e.clientX;
  downY = e.clientY;
});

canvas.addEventListener('pointermove', (e) => {
  if (rig.dragging) return;
  if (!tour.started) {
    canvas.style.cursor = hitDoor(e) ? 'pointer' : 'default';
    return;
  }
  if (tour.playing || overlay.isOpen() || orb.isOpen()) return;
  canvas.style.cursor = hitBoard(e) ? 'pointer' : 'grab';
});

canvas.addEventListener('pointerup', (e) => {
  if (!tour.started) {
    if (hitDoor(e)) enterFoyer();
    return;
  }
  if (tour.playing || overlay.isOpen() || orb.isOpen()) return;
  if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
  if (hitBoard(e)) overlay.openDirectory();
});

/* ---------- 沿主动线推进：分区的可走范围与方位出口 ---------- */
let lastZoneId = '';
let stillTime = 0;
let exitStillTime = 0;
let exitsVisible = false;
let enterVisible = false;
let enterStopId = null;

// 其余可达空间相对当前站位与镜头朝向的方位，分桶与滞回交给 HUD
function exitState() {
  const yaw = currentYaw();
  const from = currentSpaceId();
  const px = rig.position.x;
  const pz = rig.position.z;
  const items = [];
  for (const s of SPACES) {
    if (s.id === from) continue;
    const pose = (STOP_BY_ID[s.nav] || NAV[s.nav])?.pose?.position;
    if (!pose) continue;
    const dx = pose[0] - px;
    const dz = pose[2] - pz;
    if (Math.hypot(dx, dz) < 0.5) continue;
    // 与 currentYaw() 同一套约定：0 朝 -z，+90° 朝 -x
    items.push({ id: s.nav, label: s.label, bearing: Math.atan2(-dx, -dz) });
  }
  return { yaw, items };
}

// 五个空间各自的浮层入口（内容映射由 STOPS / STOP_COLLECTIONS 决定）
const ENTERABLE = {
  foyer: { id: 'foyer', label: '站点导览' },
  stage: { id: 'stage', label: '首演台' },
  workshop: { id: 'workshop', label: '绘景棚' },
  backstage: { id: 'backstage', label: '主理人随笔' },
  screening: { id: 'screening', label: '私藏' },
  box: { id: 'box', label: '友链' },
  about: { id: 'about', label: '主理人办公室' }
};

function updateExploration(dt) {
  // 先按楼梯位置决定层级，再夹取可走区域并给出落脚标高
  level = resolveWalkLevel(rig.position.x, rig.position.z, level);
  rig.update(dt);

  const z = rig.position.z;
  const space = currentSpaceId();
  const zone = ZONE_BY_ID[space] || zoneAt(z);

  if (zone.id !== lastZoneId) {
    lastZoneId = zone.id;
    hud.setZone(zone);
    stillTime = 0;
  }

  const still = rig.velocity.length() < 0.08 && !rig.dragging;
  stillTime = still ? stillTime + dt : 0;

  // 方位入口：站定后浮现。环视时人没动，仍保留按钮，按朝向换方位
  const exitStill = rig.velocity.length() < 0.08;
  exitStillTime = exitStill ? exitStillTime + dt : 0;
  if (exitStillTime > 1.1) {
    hud.setExits(exitState(), true);
    exitsVisible = true;
  } else if (exitsVisible) {
    exitsVisible = false;
    hud.setExits(null, false);
  }

  // 到站提示：五个空间各有内容入口，复用同一套浮层
  const enterable = ENTERABLE[space] || null;
  if (enterable) {
    const want = stillTime > 0.8;
    if (want !== enterVisible || enterable.id !== enterStopId) {
      enterVisible = want;
      enterStopId = enterable.id;
      hud.setEnterPrompt(enterable, want);
    }
  } else if (enterVisible || enterStopId) {
    enterVisible = false;
    enterStopId = null;
    hud.setEnterPrompt(null, false);
  }
}

/* ---------- 玻璃球读数：所在空间 + 朝向 ---------- */
const _lookDir = new THREE.Vector3();

function currentYaw() {
  _lookDir.set(0, 0, -1).applyQuaternion(camera.quaternion);
  return Math.atan2(-_lookDir.x, -_lookDir.z);
}

function currentPlaceId() {
  if (!tour.started) return 'foyer';
  const space = currentSpaceId();
  if (space === 'corridor') return 'auditorium';
  return space;
}

/* ---------- 启动与渲染循环 ---------- */
let readyShown = false;
let startedAt = performance.now();
let lastTime = startedAt;

/* ---------- 切后台停帧 ----------
   页面隐藏时浏览器会掐掉 rAF，但部分移动浏览器在切走的那一两帧里还会照常
   调度，音频上下文更是完全照跑。这里显式停：整帧直接返回，音频挂起。
   回来时把演出时钟整体后移同样的时长，否则 time 会一次跳过几十秒，
   体积光、粒子相位、演出时间轴都会闪一下。 */
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenAt = performance.now();
    audio.suspend();
    return;
  }
  if (hiddenAt) {
    const gap = performance.now() - hiddenAt;
    startedAt += gap;
    hiddenAt = 0;
  }
  lastTime = 0;          // 下一帧重新起算 dt，不把后台时长当一帧
  audio.resume();
});

engine.renderer.compile(engine.scene, camera);

function idleCamera(time) {
  camera.position.set(
    Math.sin(time * 0.18) * 0.055,
    1.62 + Math.sin(time * 0.52) * 0.008,
    8.8 + Math.cos(time * 0.13) * 0.035
  );
  camera.lookAt(0, 2.72 + Math.sin(time * 0.41) * 0.012, 0.24);
}

function frame(now) {
  requestAnimationFrame(frame);
  // 后台：不更新、不渲染、不提交绘制。rAF 名义上会被浏览器停掉，
  // 但停不干净的那一两帧不必再花 10ms 去画一张没人看的画面。
  if (document.hidden) {
    lastTime = now;
    return;
  }
  if (!lastTime) lastTime = now;
  const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;
  const time = (now - startedAt) / 1000;

  updateTweens(dt);
  world.update(dt, time);

  if (tour.started) {
    const free = !tour.playing && !overlay.isOpen() && !orb.isOpen();
    if (free) updateExploration(dt);
    // 换空间时换一套混响，并让脚步声跟着移动速度走
    const zoneNow = audioZoneOf(currentSpaceId());
    if (zoneNow !== lastAudioZone) {
      lastAudioZone = zoneNow;
      audio.setZone(zoneNow);
    }
    if (free) audio.setMotion(rig.velocity.length());
  } else {
    idleCamera(time);
  }

  orb.update(dt, {
    placeId: currentPlaceId(),
    x: camera.position.x,
    z: camera.position.z,
    yaw: currentYaw(),
    time,
    // 转场路径的实时采样点与水平切线：球内/鸟瞰台视点据此严格同步
    follow: tour.follow
  });

  // 鸟瞰台展开时主场景暂停渲染，两套渲染器不会同时跑
  if (!orb.isOpen()) engine.render();

  if (!readyShown && time > 1.0) {
    readyShown = true;
    hud.ready();
  }
}

requestAnimationFrame(frame);

// 给后续阶段预留的访问入口
window.__proscenium = {
  quality,
  engine,
  scene: engine.scene,
  camera,
  world,
  tour,
  rig,
  orb,
  audio,
  show,
  stops: STOPS,
  nav: NAV,
  zones: ZONES,
  overlay,
  contentManifest,
  loadStopEntries,
  go,
  setShellScheme: (id) => world.setShellScheme(id),
  getShellScheme: () => world.getShellScheme(),
  // 验收用：主循环时钟。切后台回来时 time 不应跳，dt 不应变成后台时长
  getClock: () => ({ time: (performance.now() - startedAt) / 1000, lastDt: lastTime ? (performance.now() - lastTime) / 1000 : null, hidden: document.hidden })
};
