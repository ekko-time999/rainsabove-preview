export function createHUD({ onEnter, onNext, onEnterStop, onDirectory }) {
  const loader = document.getElementById('loader');
  const startScreen = document.getElementById('start-screen');
  const enterBtn = document.getElementById('enter-btn');
  const caption = document.getElementById('caption');
  const hints = document.querySelector('.hints');
  const dpad = document.getElementById('dpad');
  const body = document.body;

  const actNo = document.querySelector('.act-no');
  const actName = document.querySelector('.act-name');
  const stopNo = document.querySelector('.stop-no');
  const stopLabel = document.querySelector('.stop-text b');
  const stopEn = document.querySelector('.stop-text em');
  const railItems = [...document.querySelectorAll('.rail-item')];
  const dirNav = document.getElementById('dir-nav');
  const enterStop = document.getElementById('enter-stop');
  const enterLabel = document.getElementById('enter-stop-label');
  const guideBtn = document.getElementById('guide-btn');

  let started = false;
  let captionTimer = 0;
  let moveHandler = null;
  let activityShown = false;
  let currentZone = null;
  let enterId = null;
  const swapTimers = new WeakMap();

  /* ---------- 方位化出口 ----------
     四个相对方位：前 0、左 +90°、右 -90°、后 180°。
     分格边界本来在 ±45°/±135°，换格要再多跨 22.5° 才生效，
     站在分界线上小幅摆头不会来回跳。 */
  const DIRS = [
    { key: 'front', label: '前方', center: 0 },
    { key: 'left', label: '左侧', center: Math.PI / 2 },
    { key: 'right', label: '右侧', center: -Math.PI / 2 },
    { key: 'back', label: '后方', center: Math.PI }
  ];
  const DIR_HALF = Math.PI / 4;
  const DIR_HYST = Math.PI / 8;
  const dirBuckets = new Map();
  let dirSignature = '';
  let dirVisible = false;

  function wrapAngle(a) {
    return Math.atan2(Math.sin(a), Math.cos(a));
  }

  function bucketFor(rel, prev) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < DIRS.length; i++) {
      const d = Math.abs(wrapAngle(rel - DIRS[i].center));
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    if (prev !== undefined) {
      const keep = Math.abs(wrapAngle(rel - DIRS[prev].center));
      if (keep <= DIR_HALF + DIR_HYST) return prev;
    }
    return best;
  }

  function renderExits(groups) {
    const frag = document.createDocumentFragment();
    groups.forEach((items, index) => {
      if (!items.length) return;
      for (const item of items) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dir-btn';
        btn.dataset.stop = item.id;
        btn.setAttribute('aria-label', `${DIRS[index].label} · ${item.label}`);
        const where = document.createElement('span');
        where.className = 'dir-where';
        where.textContent = DIRS[index].label;
        const name = document.createElement('span');
        name.className = 'dir-name';
        name.textContent = item.label;
        btn.append(where, name);
        frag.append(btn);
      }
    });
    dirNav.replaceChildren(frag);
  }

  function setExits(state, visible) {
    if (!dirNav) return;
    const items = state?.items || [];
    if (!items.length) {
      dirSignature = '';
      dirBuckets.clear();
      dirNav.replaceChildren();
      dirNav.classList.remove('is-on');
      dirNav.setAttribute('aria-hidden', 'true');
      dirVisible = false;
      return;
    }

    const yaw = state.yaw || 0;
    const groups = [[], [], [], []];
    for (const item of items) {
      const rel = wrapAngle(item.bearing - yaw);
      const bucket = bucketFor(rel, dirBuckets.get(item.id));
      dirBuckets.set(item.id, bucket);
      groups[bucket].push({ ...item, d: Math.abs(wrapAngle(rel - DIRS[bucket].center)) });
    }
    // 同一方位内按偏离正中的角度排序，正对镜头的排前面
    groups.forEach((group) => group.sort((a, b) => a.d - b.d));

    const signature = groups.map((g) => g.map((it) => `${it.id}:${it.label}`).join(',')).join('|');
    if (signature !== dirSignature) {
      dirSignature = signature;
      renderExits(groups);
    }

    if (visible !== dirVisible) {
      dirVisible = visible;
      dirNav.classList.toggle('is-on', visible);
      dirNav.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }
  }

  function enter() {
    if (started) return;
    started = true;
    onEnter?.();
  }

  enterBtn.addEventListener('click', enter);

  if (dirNav) {
    dirNav.addEventListener('click', (e) => {
      const btn = e.target.closest('.dir-btn');
      if (btn?.dataset.stop) onNext?.(btn.dataset.stop);
    });
  }

  if (enterStop) {
    enterStop.addEventListener('click', () => {
      if (enterId && enterStop.classList.contains('is-on')) onEnterStop?.(enterId);
    });
  }

  if (guideBtn) {
    guideBtn.addEventListener('click', () => onDirectory?.());
  }

  function ready() {
    body.dataset.phase = 'entrance';
    loader.setAttribute('aria-hidden', 'true');
    // 重新触发开场文字的入场动画
    if (startScreen) {
      const animated = startScreen.querySelectorAll(
        '.start-overline, .start-title, .start-rule, .start-sub, .enter-btn, .start-hint'
      );
      animated.forEach((el) => {
        el.style.animation = 'none';
      });
      void startScreen.offsetWidth;
      animated.forEach((el) => {
        el.style.animation = '';
      });
    }
  }

  function setPhase(phase) {
    body.dataset.phase = phase;
  }

  function swapText(el, text) {
    if (!el || el.textContent === text) return;
    el.classList.add('is-swap');
    window.clearTimeout(swapTimers.get(el));
    swapTimers.set(
      el,
      window.setTimeout(() => {
        el.textContent = text;
        el.classList.remove('is-swap');
        swapTimers.delete(el);
      }, 200)
    );
  }

  function setZone(zone, announce = true) {
    if (!zone || currentZone === zone.id) return;
    currentZone = zone.id;

    if (actNo) swapText(actNo, zone.act);
    if (actName) swapText(actName, zone.label);
    if (stopNo) swapText(stopNo, zone.no);
    if (stopLabel) swapText(stopLabel, zone.label);
    if (stopEn) swapText(stopEn, zone.en);

    railItems.forEach((item) => {
      item.classList.toggle('is-active', item.dataset.stop === zone.id);
      item.classList.toggle('is-upcoming', Boolean(zone.next) && item.dataset.stop === zone.next);
    });

    if (announce) showCaption(`${zone.label} · ${zone.caption}`, 5200);
  }

  function setEnterPrompt(target, visible) {
    if (!enterStop) return;
    if (!target) {
      enterStop.classList.remove('is-on');
      enterStop.setAttribute('aria-hidden', 'true');
      return;
    }
    if (target.id !== enterId) {
      enterId = target.id;
      if (enterLabel) enterLabel.textContent = target.label;
      enterStop.dataset.kind = target.label === '站点导览' ? 'guide' : 'note';
      enterStop.setAttribute('aria-label', `打开${target.label}`);
    }
    enterStop.classList.toggle('is-on', visible);
    enterStop.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }

  function showCaption(text, duration = 4600) {
    if (!caption) return;
    window.clearTimeout(captionTimer);
    caption.textContent = text;
    // 先收起再出现，形成呼吸式过渡
    caption.classList.remove('is-on');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => caption.classList.add('is-on'));
    });
    captionTimer = window.setTimeout(() => caption.classList.remove('is-on'), duration);
  }

  function noteActivity() {
    if (activityShown || !hints) return;
    activityShown = true;
    hints.classList.add('is-dim');
  }

  // 进入漫游几秒后由 main 触发：操作提示自行淡出
  function dimHints() {
    if (!hints) return;
    hints.classList.add('is-dim');
    activityShown = true;
  }

  function bindDpad(handler) {
    moveHandler = handler;
    if (!dpad) return;
    dpad.querySelectorAll('.pad').forEach((btn) => {
      const dir = btn.dataset.move;
      const set = (active) => {
        btn.classList.toggle('is-active', active);
        moveHandler?.(dir, active);
        if (active) noteActivity();
      };
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        btn.setPointerCapture?.(e.pointerId);
        set(true);
      });
      const off = (e) => {
        e.preventDefault();
        set(false);
      };
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
      btn.addEventListener('pointerleave', off);
    });
  }

  window.addEventListener('keydown', (e) => {
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(e.code)) {
      noteActivity();
    }
  });

  return { ready, setPhase, setZone, setExits, setEnterPrompt, showCaption, bindDpad, noteActivity, dimHints, enter };
}
