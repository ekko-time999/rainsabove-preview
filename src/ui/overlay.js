// 文字面板 · 方案 A：一排透光灯箱海报，选中后灯箱墙后退压暗，正文从中央浮起。
// 只依赖原生 DOM；键盘可达（Esc / Tab 焦点陷阱），手机竖屏只有「列表 ↔ 全屏正文」一种形态。
import { STOP_BY_ID, SPACES, NAV } from '../core/stops.js';
import { entriesOf, STOP_COLLECTIONS } from '../content/index.js';
import { renderMarkdown } from '../content/markdown.js';

const COPY = {
  foyer: { kicker: '门厅 · 灯箱墙', en: 'FOYER LIGHTBOX', title: '节目单', sub: '推门而入 · 移步换景' },
  backstage: { kicker: '后台 · 灯箱墙', en: 'BACKSTAGE LIGHTBOX', title: '节目单', sub: '幕后的手记与工作稿' },
  stage: { kicker: '首演台 · 灯箱墙', en: 'PREMIERE LIGHTBOX', title: '节目单', sub: '今夜只演一件' },
  workshop: { kicker: '绘景棚 · 灯箱墙', en: 'SCENE SHOP LIGHTBOX', title: '节目单', sub: '画布、地胶与排练' },
  screening: { kicker: '放映厅 · 灯箱墙', en: 'SCREENING LIGHTBOX', title: '节目单', sub: '只放自己收的片' },
  box: { kicker: '包厢 · 灯箱墙', en: 'PRIVATE BOX LIGHTBOX', title: '节目单', sub: '挂在包厢墙上的朋友' },
  about: { kicker: '办公室 · 灯箱墙', en: 'ABOUT LIGHTBOX', title: '节目单', sub: '经历、联络与近况' }
};

const NOTES = {
  foyer: '推门，取票，等第一遍铃',
  backstage: '灯没全亮，手记先写好了',
  stage: '首演台，今夜只演一件',
  workshop: '一半在画景，一半在排练',
  screening: '一块小银幕，只放自己收的片',
  box: '包厢墙上，挂着朋友的站点',
  about: '后台西侧，写字桌与旧海报'
};

const EMPTY_GLYPH = `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.2"><path d="M15 53V27c0-9 7.6-15 17-15s17 6 17 15v26"/><path d="M24 53V31c0-5 3.6-9 8-9s8 4 8 9v22"/><path d="M9 53h46"/><path d="M32 45v8" opacity=".55"/></g></svg>`;

// 演示开关：?demo=empty / ?demo=single，只为验证空态与单条态的版式。
const DEMO = new URLSearchParams(location.search).get('demo');

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(value) {
  return String(value || '').replace(/-/g, '.');
}

function tagsOf(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function readingMinutes(body) {
  const text = String(body || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\s+/g, '');
  return Math.max(1, Math.round(text.length / 360));
}

/* ---------- 已读记录：本机 localStorage，只做列表里的未读/已读区分 ---------- */
const READ_KEY = 'rainsabove:read:v1';
let readCache = null;

function readSet() {
  if (readCache) return readCache;
  try {
    readCache = new Set(JSON.parse(localStorage.getItem(READ_KEY) || '[]'));
  } catch {
    readCache = new Set();
  }
  return readCache;
}

function isRead(stopId, slug) {
  return readSet().has(`${stopId}/${slug}`);
}

function markRead(stopId, slug) {
  const set = readSet();
  const key = `${stopId}/${slug}`;
  if (set.has(key)) return;
  set.add(key);
  try {
    localStorage.setItem(READ_KEY, JSON.stringify([...set].slice(-240)));
  } catch {
    /* 隐私模式下忽略 */
  }
}

// 深链：#stage/lantern-study 或 ?entry=stage/lantern-study
function parseDeepLink() {
  let raw = new URLSearchParams(location.search).get('entry') || '';
  if (!raw) raw = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  if (!raw) return null;
  raw = raw.replace(/^entry\//, '').replace(/^stop:/, '');
  const parts = raw.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const [stopId, slug] = parts;
  if (!STOP_BY_ID[stopId] || !STOP_COLLECTIONS[stopId]) return null;
  const entry = entriesOf(STOP_COLLECTIONS[stopId]).find((item) => item.slug === slug);
  return entry ? { stopId, slug } : null;
}

export function createOverlay({ onTravel, onOpenChange, getCurrent } = {}) {
  const root = document.createElement('div');
  root.className = 'overlay';
  root.hidden = true;
  root.dataset.state = 'list';
  root.innerHTML = `
    <div class="overlay-scrim" data-close></div>

    <div class="panel-bar">
      <button class="panel-toggle" type="button" aria-label="收起节目单">
        <svg class="icon-grid" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 5h16M4 12h16M4 19h10" />
        </svg>
        <span class="panel-toggle-label">收起</span>
      </button>
    </div>

    <section class="wall" aria-label="灯箱墙">
      <header class="wall-head">
        <p class="wall-kicker"><span class="wall-kicker-text"></span><i></i><em class="wall-kicker-en"></em></p>
        <h1 class="wall-title">节目单<em>PROGRAMME</em></h1>
        <p class="wall-sub"></p>
        <button class="wall-close" type="button" data-close aria-label="关闭节目单">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          <span>关闭</span>
        </button>
      </header>
      <div class="wall-row" role="group" aria-label="灯箱海报"></div>
      <footer class="wall-foot">
        <p class="wall-note"><i></i><span class="wall-note-text"></span></p>
        <button class="wall-all" type="button" data-directory>全部空间 →</button>
      </footer>
    </section>

    <article class="reading" role="dialog" aria-modal="true" aria-labelledby="reading-title" tabindex="-1">
      <div class="reading-sheet">
        <span class="reading-ribbon" aria-hidden="true"></span>
        <div class="reading-top">
          <button class="reading-back" type="button" data-wall>
            <span class="reading-back-arrow" aria-hidden="true">←</span>
            <span>节目单</span>
          </button>
          <span class="reading-top-run"></span>
          <button class="reading-close" type="button" data-close>关闭</button>
        </div>
        <div class="reading-scroll">
          <header class="reading-run"><span class="run-left"></span><span class="run-no"></span></header>
          <p class="reading-meta"></p>
          <h2 id="reading-title" class="reading-title"></h2>
          <p class="reading-dek"></p>
          <span class="reading-rule" aria-hidden="true"></span>
          <div class="reading-cover"></div>
          <div class="reading-link"></div>
          <div class="reading-doc"></div>
          <nav class="reading-nav" aria-label="篇目切换"></nav>
          <footer class="reading-foot"><span class="reading-end"></span><span class="reading-count"></span></footer>
        </div>
      </div>
    </article>`;
  document.getElementById('app').appendChild(root);

  const scrim = root.querySelector('.overlay-scrim');
  const toggle = root.querySelector('.panel-toggle');
  const toggleLabel = root.querySelector('.panel-toggle-label');
  const wall = root.querySelector('.wall');
  const wallKicker = root.querySelector('.wall-kicker-text');
  const wallKickerEn = root.querySelector('.wall-kicker-en');
  const wallTitle = root.querySelector('.wall-title');
  const wallSub = root.querySelector('.wall-sub');
  const wallRow = root.querySelector('.wall-row');
  const wallNoteText = root.querySelector('.wall-note-text');
  const wallAll = root.querySelector('.wall-all');
  const reading = root.querySelector('.reading');
  const readTopRun = root.querySelector('.reading-top-run');
  const readScroll = root.querySelector('.reading-scroll');
  const readRunLeft = root.querySelector('.run-left');
  const readRunNo = root.querySelector('.run-no');
  const readMeta = root.querySelector('.reading-meta');
  const readTitle = root.querySelector('.reading-title');
  const readDek = root.querySelector('.reading-dek');
  const readCover = root.querySelector('.reading-cover');
  const readLink = root.querySelector('.reading-link');
  const readDoc = root.querySelector('.reading-doc');
  const readNav = root.querySelector('.reading-nav');
  const readEnd = root.querySelector('.reading-end');
  const readCount = root.querySelector('.reading-count');

  let open = false;
  let view = 'list';
  let activeStop = null;
  let activeSlug = null;
  let hideTimer = 0;
  let lastFocus = null;

  // 每个空间记住：上次选中的篇目、灯箱墙横向滚动、每篇正文的滚动位置
  const lastSlug = new Map();
  const wallScroll = new Map();
  const readScrollMemory = new Map();

  const scrollKey = (stopId, slug) => `${stopId}/${slug}`;

  function focusables() {
    const scope = view === 'reading' ? reading : wall;
    const list = [...scope.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')];
    if (toggle.offsetParent !== null) list.unshift(toggle);
    return list.filter(
      (el) =>
        el.offsetParent !== null &&
        !el.closest('[hidden]') &&
        getComputedStyle(el).visibility !== 'hidden'
    );
  }

  function syncToggle() {
    const isReading = view === 'reading';
    toggleLabel.textContent = isReading ? '节目单' : '收起';
    toggle.setAttribute('aria-label', isReading ? '回到节目单灯箱墙' : '收起节目单');
    root.dataset.state = view;
    document.body.dataset.panel = view;
  }

  function instantOnce() {
    root.classList.add('is-instant');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => root.classList.remove('is-instant'));
    });
  }

  function show() {
    if (!open) {
      open = true;
      lastFocus = document.activeElement;
      document.body.dataset.overlay = 'open';
      onOpenChange?.(true);
    }
    window.clearTimeout(hideTimer);
    root.hidden = false;
    void root.offsetWidth;
    root.classList.add('is-open');
    requestAnimationFrame(() => {
      if (view === 'reading') reading.focus({ preventScroll: true });
      else {
        const selected = wallRow.querySelector('.lightbox.is-selected');
        (selected || wall.querySelector('.wall-close') || toggle).focus({ preventScroll: true });
      }
    });
  }

  function close() {
    if (!open) return;
    if (view === 'reading') saveReadingScroll();
    saveWallScroll();
    open = false;
    root.classList.remove('is-open');
    delete document.body.dataset.overlay;
    delete document.body.dataset.panel;
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      if (!open) root.hidden = true;
    }, 380);
    onOpenChange?.(false);
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
    lastFocus = null;
  }

  function setView(next, { instant = false } = {}) {
    view = next;
    if (instant) instantOnce();
    syncToggle();
  }

  function saveWallScroll() {
    if (activeStop) wallScroll.set(activeStop, wallRow.scrollLeft);
  }

  function saveReadingScroll() {
    if (view === 'reading' && activeStop && activeSlug) {
      readScrollMemory.set(scrollKey(activeStop, activeSlug), readScroll.scrollTop);
    }
  }

  /* ---------- 灯箱海报 ---------- */

  function listOf(stopId) {
    const entries = entriesOf(STOP_COLLECTIONS[stopId]);
    if (DEMO === 'empty') return [];
    if (DEMO === 'single' && entries.length > 1) return entries.slice(0, 1);
    return entries;
  }

  function unreadCount(stopId, entries = listOf(stopId)) {
    return entries.filter((entry) => !isRead(stopId, entry.slug)).length;
  }

  function posterMarkup(entry, index, stopId) {
    const stop = STOP_BY_ID[stopId];
    const unread = !isRead(stopId, entry.slug);
    const selected = lastSlug.get(stopId) === entry.slug;
    const date = fmtDate(entry.data.date);
    const tags = tagsOf(entry.data.tags);
    const no = String(index + 1).padStart(2, '0');
    return `
      <button class="lightbox${unread ? ' is-unread' : ' is-read'}${selected ? ' is-selected' : ''}"
        type="button" data-slug="${esc(entry.slug)}"
        aria-label="${unread ? '未读' : '已读'} · ${esc(entry.data.title || entry.slug)}${date ? ` · ${esc(date)}` : ''}">
        <span class="lb-frame">
          <span class="lb-poster">
            <span class="lb-ghost" aria-hidden="true">${no}</span>
            <span class="lb-kicker">${esc(stop.label)} · ${esc(stop.en)}</span>
            <span class="lb-main">
              <span class="lb-title">${esc(entry.data.title || entry.slug)}</span>
              <span class="lb-rule" aria-hidden="true"></span>
              <span class="lb-date">${esc(date || '未标日期')}</span>
              <span class="lb-tag">${tags.length ? tags.slice(0, 2).map((tag) => `#${esc(tag)}`).join('  ') : ''}</span>
            </span>
            <span class="lb-badge">${unread ? '未读' : '已读'}</span>
          </span>
        </span>
      </button>`;
  }

  function spacePosterMarkup(space, currentId) {
    const current = space.id === currentId;
    const stop = STOP_BY_ID[space.id];
    const entries = stop ? listOf(space.id) : [];
    const unread = stop ? unreadCount(space.id, entries) : 0;
    const state = stop
      ? entries.length
        ? `${entries.length} 篇${unread ? ` · ${unread} 未读` : ''}`
        : '筹备中 · 空场'
      : '过场空间';
    return `
      <button class="lightbox is-space${current ? ' is-selected' : ''}" type="button"
        data-space="${esc(space.nav)}"${current ? ' aria-current="true"' : ''}
        aria-label="${current ? '当前所在' : '前往'} · ${esc(space.label)}">
        <span class="lb-frame">
          <span class="lb-poster">
            <span class="lb-ghost" aria-hidden="true">${esc(space.no)}</span>
            <span class="lb-kicker">${esc(space.section)}</span>
            <span class="lb-main">
              <span class="lb-title">${esc(space.label)}</span>
              <span class="lb-en">${esc(space.en)}</span>
              <span class="lb-rule" aria-hidden="true"></span>
              <span class="lb-date">${esc(state)}</span>
              <span class="lb-tag">${current ? '当前所在' : esc(NOTES[space.id] || '')}</span>
            </span>
            <span class="lb-badge">${current ? '所在' : '前往'}</span>
          </span>
        </span>
      </button>`;
  }

  function emptyMarkup(stopId) {
    const folder = STOP_COLLECTIONS[stopId];
    return `
      <div class="wall-empty">
        <span class="empty-mark">${EMPTY_GLYPH}</span>
        <p class="empty-kicker">空场 · NO ENTRIES</p>
        <p class="empty-title">这一站还没有开演</p>
        <p class="empty-note">在 <code>content/${esc(folder)}/</code> 放一篇 Markdown，灯箱会自动亮起。</p>
        <button class="empty-go" type="button" data-directory>看看其他空间 →</button>
      </div>`;
  }

  function setWallHead(kicker, en, title, sub, note) {
    wallKicker.textContent = kicker;
    wallKickerEn.textContent = en;
    wallTitle.innerHTML = `${esc(title)}<em>PROGRAMME</em>`;
    wallSub.textContent = sub;
    wallNoteText.textContent = note;
  }

  function restoreWallScroll(stopId) {
    requestAnimationFrame(() => {
      wallRow.scrollLeft = wallScroll.get(stopId) || 0;
      const selected = wallRow.querySelector('.lightbox.is-selected');
      if (selected && wallRow.scrollWidth > wallRow.clientWidth) {
        const row = wallRow.getBoundingClientRect();
        const box = selected.getBoundingClientRect();
        if (box.right > row.right || box.left < row.left) {
          wallRow.scrollLeft += box.left - row.left - (row.width - box.width) / 2;
        }
      }
    });
  }

  function renderStop(stopId) {
    const stop = STOP_BY_ID[stopId];
    if (!stop) return;
    saveWallScroll();
    activeStop = stopId;
    activeSlug = lastSlug.get(stopId) || null;
    const copy = COPY[stopId] || { kicker: stop.label, en: stop.en, title: '节目单', sub: stop.en };
    const entries = listOf(stopId);
    const unread = unreadCount(stopId, entries);
    const current = stopId === getCurrent?.();
    const state = entries.length
      ? [current ? '当前所在' : '', `${entries.length} 条`, unread ? `${unread} 未读` : '全部已读']
      : [current ? '当前所在' : '', '0 条', '空场 · 待开演'];
    setWallHead(copy.kicker, copy.en, copy.title, state.filter(Boolean).join(' · '), '');
    wallSub.textContent = [copy.sub, state.filter(Boolean).join(' · ')].filter(Boolean).join(' · ');
    wallNoteText.textContent = entries.length
      ? `一排灯箱 · ${entries.length} 张海报 · 点开为对开节目册`
      : '一排灯箱 · 暂无海报';
    wallAll.hidden = false;
    wallRow.innerHTML = entries.length
      ? entries.map((entry, index) => posterMarkup(entry, index, stopId)).join('')
      : emptyMarkup(stopId);
    wallRow.classList.toggle('is-single', entries.length === 1);
    setView('list');
    show();
    restoreWallScroll(stopId);
  }

  function renderDirectory() {
    saveWallScroll();
    activeStop = null;
    activeSlug = null;
    const currentId = getCurrent?.();
    setWallHead(
      '节目单 · 全部空间',
      'ALL SPACES',
      '全部空间',
      `${SPACES.length} 处 · 点开灯箱即前往`,
      `一排灯箱 · ${SPACES.length} 个空间 · 点开即前往`
    );
    wallSub.textContent = `${SPACES.length} 处 · 点开灯箱即前往`;
    wallAll.hidden = true;
    wallRow.innerHTML = SPACES.map((space) => spacePosterMarkup(space, currentId)).join('');
    wallRow.classList.remove('is-single');
    setView('list');
    show();
    requestAnimationFrame(() => {
      wallRow.scrollLeft = 0;
    });
  }

  /* ---------- 阅读态 ---------- */

  function renderReading(stopId, slug, { instant = false } = {}) {
    const stop = STOP_BY_ID[stopId];
    const type = STOP_COLLECTIONS[stopId];
    if (!stop || !type) return;
    const entries = listOf(stopId);
    const index = entries.findIndex((item) => item.slug === slug);
    if (index < 0) {
      renderStop(stopId);
      return;
    }
    const entry = entries[index];
    saveWallScroll();
    activeStop = stopId;
    activeSlug = slug;
    lastSlug.set(stopId, slug);
    markRead(stopId, slug);

    const date = fmtDate(entry.data.date);
    const tags = tagsOf(entry.data.tags);
    const minutes = readingMinutes(entry.body);
    const no = String(index + 1).padStart(2, '0');
    const total = String(entries.length).padStart(2, '0');

    readTitle.textContent = entry.data.title || entry.slug;
    readRunLeft.textContent = `${stop.label} · ${stop.en}`;
    readRunNo.textContent = `${no} / ${total}`;
    readTopRun.textContent = `${stop.en} · ${no}`;
    readMeta.innerHTML = [
      `<span class="read-date">${esc(date || '未标日期')}</span>`,
      tags.length ? `<span class="read-tags">${tags.map((tag) => `<span>#${esc(tag)}</span>`).join('')}</span>` : '',
      entry.data.placeholder ? '<span class="read-flag">占位文案</span>' : '',
      `<span class="read-time">约 ${minutes} 分钟</span>`
    ]
      .filter(Boolean)
      .join('');
    readDek.textContent = entry.data.summary || '';
    readDek.hidden = !entry.data.summary;

    const cover =
      entry.data.cover && /^(https?:|\/|\.\/)/.test(entry.data.cover)
        ? `<img class="read-cover" src="${esc(entry.data.cover)}" alt="" loading="lazy" />`
        : '';
    readCover.innerHTML = cover;

    const link =
      entry.data.link && /^https?:/i.test(entry.data.link)
        ? `<a class="read-link" href="${esc(entry.data.link)}" target="_blank" rel="noopener noreferrer">
            <span>${esc(entry.data.linkLabel || '前往站点')}</span>
            <b>${esc(entry.data.link.replace(/^https?:\/\//i, '').replace(/\/$/, ''))}</b>
            <i aria-hidden="true">↗</i>
          </a>`
        : '';
    readLink.innerHTML = link;

    readDoc.innerHTML = renderMarkdown(entry.body);

    const prev = entries[index - 1] || null;
    const next = entries[index + 1] || null;
    readNav.innerHTML = `
      <button class="read-step is-prev" type="button" data-slug="${prev ? esc(prev.slug) : ''}"${prev ? '' : ' disabled'}>
        <span class="step-kicker">上一篇</span>
        <span class="step-title">${prev ? esc(prev.data.title || prev.slug) : '已是第一篇'}</span>
      </button>
      <button class="read-index" type="button" data-wall>
        <span>节目单</span>
      </button>
      <button class="read-step is-next" type="button" data-slug="${next ? esc(next.slug) : ''}"${next ? '' : ' disabled'}>
        <span class="step-kicker">下一篇</span>
        <span class="step-title">${next ? esc(next.data.title || next.slug) : '已是最后一篇'}</span>
      </button>`;

    readEnd.textContent = `全文完 · ${stop.label}`;
    readCount.textContent = `${no} / ${total} · RAINSABOVE`;

    setView('reading', { instant });
    show();
    requestAnimationFrame(() => {
      readScroll.scrollTop = readScrollMemory.get(scrollKey(stopId, slug)) || 0;
      if (!instant) readScroll.focus({ preventScroll: true });
    });
  }

  function backToWall() {
    if (!activeStop) {
      renderDirectory();
      return;
    }
    saveReadingScroll();
    if (activeSlug) lastSlug.set(activeStop, activeSlug);
    renderStop(activeStop);
  }

  function stepEntry(slug) {
    if (!slug || !activeStop) return;
    saveReadingScroll();
    renderReading(activeStop, slug);
  }

  /* ---------- 跳转 ---------- */

  function goToSpace(id) {
    if (!STOP_BY_ID[id] && !NAV[id]) return;
    close();
    requestAnimationFrame(() => onTravel?.(id));
  }

  function goToStop(stopId) {
    goToSpace(stopId);
  }

  function openStop(stopId) {
    renderStop(stopId);
  }

  function openFromLocation() {
    const link = parseDeepLink();
    if (!link) return false;
    renderReading(link.stopId, link.slug, { instant: true });
    return true;
  }

  /* ---------- 事件 ---------- */

  root.addEventListener('click', (event) => {
    if (event.target.closest('[data-close]')) {
      close();
      return;
    }
    if (event.target.closest('[data-wall]')) {
      backToWall();
      return;
    }
    if (event.target.closest('.panel-toggle')) {
      if (view === 'reading') backToWall();
      else close();
      return;
    }
    if (event.target.closest('.wall-all') || event.target.closest('[data-directory]')) {
      renderDirectory();
      return;
    }
    const entryBtn = event.target.closest('.lightbox[data-slug]');
    if (entryBtn && activeStop) {
      renderReading(activeStop, entryBtn.dataset.slug);
      return;
    }
    const spaceBtn = event.target.closest('.lightbox[data-space]');
    if (spaceBtn) {
      goToSpace(spaceBtn.dataset.space);
      return;
    }
    const step = event.target.closest('.read-step[data-slug]');
    if (step && !step.disabled) {
      stepEntry(step.dataset.slug);
      return;
    }
    const anchor = event.target.closest('a[href]');
    if (anchor && anchor.getAttribute('href').startsWith('#stop:')) {
      event.preventDefault();
      const raw = anchor.getAttribute('href').slice(6);
      const [stopId, slug] = raw.split('/');
      if (slug) renderReading(stopId, slug);
      else goToStop(stopId);
    }
  });

  scrim.addEventListener('click', close);

  document.addEventListener('keydown', (event) => {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (view === 'reading') backToWall();
      else close();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusables();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  // 窗口尺寸变化时，正在阅读的正文不丢失位置
  window.addEventListener('resize', () => {
    if (open && view === 'reading') saveReadingScroll();
  });

  return {
    open: openStop,
    openDirectory: renderDirectory,
    openEntry: (stopId, slug) => (slug ? renderReading(stopId, slug) : openStop(stopId)),
    openFromLocation,
    backToWall,
    close,
    isOpen: () => open,
    getView: () => view
  };
}
