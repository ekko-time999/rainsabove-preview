/* ============================================================
   程序化声音：Web Audio 合成，不加载任何外部音频文件。
   - 开场铃：加性正弦分音 + 噪声起振瞬态，经厅堂混响送出
   - 底噪：两段滤波噪声（低频空气 + 高频吐息）与一管楼道低鸣
   - 脚步：带通噪声短脉冲 + 低频“落跟”正弦
   - 过场：短促的带通扫频，像换气
   - 混响：按空间生成不同长度的脉冲响应（ConvolverNode）
   音量分 master / sfx / amb 三档，预留单类音量接口。
   ============================================================ */

const STORE_KEY = 'rainsabove.sound';

// 每个空间的混响性格：时长、衰减指数、高频阻尼、湿声比例、底噪亮度
const ROOMS = {
  foyer: { len: 1.55, decay: 2.6, damp: 0.3, wet: 0.5, tone: 420, amb: 0.55 },
  corridor: { len: 0.5, decay: 3.6, damp: 0.5, wet: 0.26, tone: 620, amb: 0.4 },
  auditorium: { len: 2.0, decay: 2.2, damp: 0.2, wet: 0.64, tone: 340, amb: 0.7 },
  stage: { len: 1.8, decay: 2.2, damp: 0.22, wet: 0.6, tone: 380, amb: 0.6 },
  upper: { len: 1.5, decay: 2.6, damp: 0.28, wet: 0.56, tone: 400, amb: 0.55 },
  backstage: { len: 0.82, decay: 3.2, damp: 0.62, wet: 0.4, tone: 300, amb: 0.45 },
  workshop: { len: 0.72, decay: 3.4, damp: 0.52, wet: 0.34, tone: 460, amb: 0.42 },
  screening: { len: 1.15, decay: 2.8, damp: 0.38, wet: 0.46, tone: 380, amb: 0.5 },
  box: { len: 1.6, decay: 2.4, damp: 0.26, wet: 0.56, tone: 400, amb: 0.5 },
  office: { len: 0.6, decay: 3.6, damp: 0.5, wet: 0.3, tone: 520, amb: 0.36 }
};

const clamp01 = (v) => Math.max(0, Math.min(1, v));

export function createAudio(quality) {
  const lite = quality.tier !== 'full';
  let stored = null;
  try { stored = localStorage.getItem(STORE_KEY); } catch { /* 隐私模式 */ }
  let muted = stored === 'muted';

  let ctx = null;
  let master = null;
  let sfx = null;
  let amb = null;
  let verb = null;
  let wetGain = null;
  let send = null;
  let noise = null;
  let bedStarted = false;
  let zone = 'foyer';
  let ambTone = null;
  let lastStep = 0;
  let lastTransition = 0;
  let volume = 0.85;
  const irCache = new Map();

  const irSpec = (name) => {
    const room = ROOMS[name] || ROOMS.foyer;
    return lite ? { ...room, len: room.len * 0.55 } : room;
  };

  // 用噪声 + 指数衰减做一个脉冲响应，damp 越低尾巴越暗
  function buildIR(name) {
    const spec = irSpec(name);
    const key = `${name}:${spec.len.toFixed(2)}`;
    if (irCache.has(key)) return irCache.get(key);
    const rate = ctx.sampleRate;
    const len = Math.max(1, Math.floor(rate * spec.len));
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      const fade = Math.max(24, rate * 0.01);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        lp += ((Math.random() * 2 - 1) - lp) * spec.damp;
        const onset = i < fade ? i / fade : 1;
        d[i] = lp * Math.pow(1 - t, spec.decay) * onset;
      }
    }
    irCache.set(key, buf);
    return buf;
  }

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC({ latencyHint: 'interactive' });
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(ctx.destination);

    sfx = ctx.createGain();
    sfx.gain.value = 0.9;
    sfx.connect(master);

    amb = ctx.createGain();
    amb.gain.value = 0.5;
    amb.connect(master);

    verb = ctx.createConvolver();
    verb.buffer = buildIR(zone);
    wetGain = ctx.createGain();
    wetGain.gain.value = irSpec(zone).wet;
    verb.connect(wetGain).connect(master);

    send = ctx.createGain();
    send.gain.value = 0.85;
    send.connect(verb);

    // 底噪用的 2 秒噪声循环
    const nLen = Math.floor(ctx.sampleRate * 2);
    noise = ctx.createBuffer(1, nLen, ctx.sampleRate);
    const nd = noise.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < nLen; i++) {
      const white = Math.random() * 2 - 1;
      brown = (brown + white * 0.06) * 0.995;
      nd[i] = brown * 2.4 + white * 0.12;
    }
    return ctx;
  }

  function startBed() {
    if (bedStarted || !ctx) return;
    bedStarted = true;
    const t = ctx.currentTime;
    const spec = irSpec(zone);

    const low = ctx.createBufferSource();
    low.buffer = noise;
    low.loop = true;
    ambTone = ctx.createBiquadFilter();
    ambTone.type = 'lowpass';
    ambTone.frequency.value = spec.tone;
    ambTone.Q.value = 0.4;
    const lowGain = ctx.createGain();
    lowGain.gain.value = 0.05 * spec.amb;
    low.connect(ambTone).connect(lowGain).connect(amb);
    lowGain.connect(send);
    low.start(t);

    if (!lite) {
      // 高频“吐息”，只在近处可闻
      const air = ctx.createBufferSource();
      air.buffer = noise;
      air.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1450;
      bp.Q.value = 0.7;
      const airGain = ctx.createGain();
      airGain.gain.value = 0.012 * spec.amb;
      air.connect(bp).connect(airGain).connect(amb);
      air.start(t, 0.4);
    }

    // 极低的房间嗡鸣，给底噪一个“有体积”的底部
    const hum = ctx.createOscillator();
    hum.type = 'sine';
    hum.frequency.value = 57;
    const humGain = ctx.createGain();
    humGain.gain.value = 0.006;
    hum.connect(humGain).connect(amb);
    hum.start(t);
  }

  async function unlock() {
    const c = ensure();
    if (!c) return false;
    if (c.state === 'suspended') {
      try { await c.resume(); } catch { /* 仍被策略拦着，下次手势再试 */ }
    }
    startBed();
    return c.state === 'running';
  }

  /* 切后台时挂起，回前台恢复。只在音频真的跑起来过之后才动，
     没有用户手势建过 AudioContext 的话什么都不做。 */
  async function suspend() {
    if (!ctx || ctx.state !== 'running') return false;
    try { await ctx.suspend(); } catch { /* 浏览器不接受挂起，忽略 */ }
    return ctx.state === 'suspended';
  }

  async function resume() {
    if (!ctx || ctx.state !== 'suspended') return false;
    try { await ctx.resume(); } catch { /* 仍被策略拦着，下次手势再试 */ }
    return ctx.state === 'running';
  }

  function setMuted(v) {
    muted = !!v;
    try { localStorage.setItem(STORE_KEY, muted ? 'muted' : 'on'); } catch { /* ignore */ }
    if (master && ctx) {
      master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.06);
    }
    return muted;
  }

  function setZone(next) {
    const name = ROOMS[next] ? next : 'foyer';
    if (name === zone) return;
    const prev = zone;
    zone = name;
    if (!ctx) return;
    const spec = irSpec(zone);
    verb.buffer = buildIR(zone);
    wetGain.gain.setTargetAtTime(spec.wet, ctx.currentTime, 0.25);
    if (ambTone) ambTone.frequency.setTargetAtTime(spec.tone, ctx.currentTime, 0.3);
    amb.gain.setTargetAtTime(0.5 * spec.amb, ctx.currentTime, 0.35);
    if (prev !== name) transition();
  }

  /* ---------- 铃 ---------- */
  function bell(gain = 1, when = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + 0.02 + when;
    const f0 = 622;
    const partials = lite
      ? [[1, 0.9, 2.2], [2.01, 0.42, 1.7], [3.02, 0.2, 1.2]]
      : [[1, 1, 2.5], [2.01, 0.52, 1.9], [2.98, 0.3, 1.45], [4.17, 0.14, 0.95], [5.44, 0.07, 0.62]];
    const out = ctx.createGain();
    out.gain.value = 0.42 * gain;
    out.connect(sfx);
    out.connect(send);
    for (const [ratio, amp, dec] of partials) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f0 * ratio;
      osc.detune.value = (Math.random() - 0.5) * 4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(amp, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dec);
      osc.connect(g).connect(out);
      osc.start(t0);
      osc.stop(t0 + dec + 0.05);
    }
    // 铃舌击打的瞬态
    const hit = ctx.createBufferSource();
    hit.buffer = noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 2800;
    hp.Q.value = 1.1;
    const hg = ctx.createGain();
    hg.gain.setValueAtTime(0.09 * gain, t0);
    hg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07);
    hit.connect(hp).connect(hg).connect(out);
    hit.start(t0, Math.random() * 1.2, 0.09);
  }

  // 开场三遍铃：间隔 2.7s，音量逐遍收一点，最后一遍略短
  function bells() {
    if (!ctx) return 8.2;
    bell(1, 0);
    bell(0.86, 2.7);
    bell(0.72, 5.35);
    return 5.35 + 2.4;
  }

  /* ---------- 脚步 ---------- */
  function step(power = 1) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 720 + Math.random() * 320;
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.032 * power, t + 0.014);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    src.connect(bp).connect(g);
    g.connect(sfx);
    if (!lite) g.connect(send);
    src.start(t, Math.random() * 1.4, 0.12);

    const heel = ctx.createOscillator();
    heel.type = 'sine';
    heel.frequency.setValueAtTime(118, t);
    heel.frequency.exponentialRampToValueAtTime(66, t + 0.085);
    const hg = ctx.createGain();
    hg.gain.setValueAtTime(0.0001, t);
    hg.gain.exponentialRampToValueAtTime(0.028 * power, t + 0.008);
    hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    heel.connect(hg).connect(sfx);
    heel.start(t);
    heel.stop(t + 0.13);
  }

  // 由主循环喂速度：走得越快，落步越密、越重
  function setMotion(speed) {
    if (!ctx || muted || speed < 0.35) return;
    const t = ctx.currentTime;
    const interval = speed > 2.4 ? 0.36 : 0.5;
    if (t - lastStep < interval) return;
    lastStep = t;
    step(clamp01(0.55 + speed / 6));
  }

  /* ---------- 过场与幕布 ---------- */
  function transition() {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    // 走动时区段边界可能来回抖，过渡音留 1.2s 冷却，免得连发
    if (t - lastTransition < 1.2) return;
    lastTransition = t;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(360, t);
    bp.frequency.exponentialRampToValueAtTime(1500, t + 0.12);
    bp.frequency.exponentialRampToValueAtTime(420, t + 0.34);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
    src.connect(bp).connect(g);
    g.connect(sfx);
    g.connect(send);
    src.start(t, Math.random(), 0.4);

    const glide = ctx.createOscillator();
    glide.type = 'sine';
    glide.frequency.setValueAtTime(300, t);
    glide.frequency.exponentialRampToValueAtTime(212, t + 0.3);
    const gg = ctx.createGain();
    gg.gain.setValueAtTime(0.0001, t);
    gg.gain.exponentialRampToValueAtTime(0.022, t + 0.07);
    gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    glide.connect(gg).connect(sfx);
    glide.start(t);
    glide.stop(t + 0.34);
  }

  // 幕布拖行的摩擦声：低通噪声，起收都很软
  function fabric(duration = 3.2) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    lp.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.028, t + duration * 0.22);
    g.gain.linearRampToValueAtTime(0.018, t + duration * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(lp).connect(g);
    g.connect(sfx);
    g.connect(send);
    src.start(t);
    src.stop(t + duration + 0.05);
  }

  return {
    unlock,
    suspend,
    resume,
    setMuted,
    isMuted: () => muted,
    toggleMute: () => setMuted(!muted),
    setZone,
    bell,
    bells,
    step,
    setMotion,
    transition,
    fabric,
    setMasterVolume: (v) => {
      volume = clamp01(v);
      if (master && ctx && !muted) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
    },
    setBusVolume: (bus, v) => {
      const node = bus === 'amb' ? amb : bus === 'sfx' ? sfx : null;
      if (node && ctx) node.gain.setTargetAtTime(clamp01(v), ctx.currentTime, 0.05);
    },
    getState: () => ({ ready: !!ctx, running: ctx?.state || 'suspended', zone, muted, lite })
  };
}
