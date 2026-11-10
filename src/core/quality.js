// 画质分级：桌面全开，移动端自动降级
export function detectQuality() {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 620;
  const mobile = coarse || small || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const dpr = window.devicePixelRatio || 1;
  const forceLite = /(?:^|[?&])lite(?:[=&]|$)/.test(location.search);
  // ?full：移动端/小窗口也按全档跑。只为验收时同机位同尺寸对照两档成本，
  // 不改变真机默认（默认仍是移动端走 lite）。
  const forceFull = /(?:^|[?&])full(?:[=&]|$)/.test(location.search);

  if (forceLite || (mobile && !forceFull)) {
    return {
      tier: 'lite',
      pixelRatio: Math.min(dpr, 1.5),
      shadows: false,
      aniso: 4,
      crystalCount: 52,
      dustCount: 180,
      shadowSize: 512,
      chandelierArms: 6
    };
  }

  return {
    tier: 'full',
    pixelRatio: Math.min(dpr, 1.75),
    shadows: true,
    aniso: 8,
    crystalCount: 128,
    dustCount: 520,
    shadowSize: 2048,
    chandelierArms: 8
  };
}
