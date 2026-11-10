/**
 * 预览标识条。
 *
 * 只在 `VITE_PREVIEW=1` 的构建里出现（预览仓库的 Actions 会带上这个变量），
 * 正式站构建不会创建任何 DOM，也不会多出一个 draw call。
 *
 * 它是纯 DOM 覆盖层，和 #scene 画布同级，不参与 three.js 场景，
 * 因此不会进入 3D canvas，也不会改变任何渲染状态。
 * 关闭只作用于当前页面生命周期：刷新后重新出现，不写 localStorage。
 */
const FLAG = import.meta.env.VITE_PREVIEW;

export function createPreviewBar() {
  if (FLAG !== '1') return null;

  const app = document.getElementById('app');
  if (!app) return null;

  const bar = document.createElement('div');
  bar.className = 'preview-bar';
  bar.setAttribute('role', 'note');
  bar.setAttribute('aria-label', '预览版标识');

  const dot = document.createElement('span');
  dot.className = 'preview-bar-dot';
  dot.setAttribute('aria-hidden', 'true');

  const text = document.createElement('span');
  text.className = 'preview-bar-text';
  text.textContent = '预览版 · 非正式站点';

  const close = document.createElement('button');
  close.className = 'preview-bar-close';
  close.type = 'button';
  close.setAttribute('aria-label', '关闭预览标识');
  close.textContent = '×';
  close.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    bar.hidden = true;
  });
  // 关闭按钮之外不拦截指针，避免影响拖拽环视与移动
  close.addEventListener('pointerdown', (e) => e.stopPropagation());

  bar.append(dot, text, close);
  app.appendChild(bar);

  return {
    el: bar,
    isOn: () => !bar.hidden,
    setOn(v) {
      bar.hidden = !v;
    }
  };
}
