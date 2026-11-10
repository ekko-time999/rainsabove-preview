// 轻量 Markdown 渲染：标题、段落、列表、引用、代码块、链接、图片、行内格式。
// 先转义 HTML，再生成受控标签；链接只允许 http(s)、mailto、站内锚点与相对路径。

const SAFE_URL = /^(https?:|mailto:|\/|#|\.\/|\.\.\/)/i;

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isSafeUrl(url) {
  return SAFE_URL.test(url) && !/["'<>\s]/.test(url);
}

function inline(source) {
  let out = escapeHtml(source);

  // 行内代码先取出，避免被后面的强调规则改写
  const codes = [];
  out = out.replace(/`([^`]+)`/g, (_m, code) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });

  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, url) => {
    if (!isSafeUrl(url)) return alt;
    return `<img src="${url}" alt="${alt}" loading="lazy" />`;
  });

  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (m, text, url, title) => {
    if (!isSafeUrl(url)) return text;
    const external = /^https?:/i.test(url);
    const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a href="${url}"${attrs}${title ? ` title="${title}"` : ''}>${text}</a>`;
  });

  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');

  out = out.replace(/\u0000(\d+)\u0000/g, (_m, i) => `<code>${codes[Number(i)]}</code>`);
  return out;
}

function isBlockStart(line) {
  return (
    /^\s*(```|~~~)/.test(line) ||
    /^#{1,6}\s+/.test(line) ||
    /^\s*(---|\*\*\*|___)\s*$/.test(line) ||
    /^\s*>/.test(line) ||
    /^\s*[-*+]\s+/.test(line) ||
    /^\s*\d+\.\s+/.test(line) ||
    /^\s*!\[[^\]]*\]\(placeholder:/.test(line)
  );
}

export function renderMarkdown(source) {
  const lines = String(source || '').replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    // 代码块
    const fence = line.match(/^\s*(```|~~~)\s*([\w-]*)\s*$/);
    if (fence) {
      const marker = fence[1];
      const lang = fence[2];
      const buffer = [];
      i++;
      while (i < lines.length && !new RegExp(`^\\s*${marker}\\s*$`).test(lines[i])) {
        buffer.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      const cls = lang ? ` class="lang-${escapeHtml(lang)}"` : '';
      const attr = lang ? ` data-lang="${escapeHtml(lang)}"` : '';
      html.push(`<pre${attr}><code${cls}>${escapeHtml(buffer.join('\n'))}</code></pre>`);
      continue;
    }

    // 图片占位：![说明](placeholder:槽位名)，渲染成 16:9 的图位框，换真图时改一行即可
    const placeholder = line.match(/^\s*!\[([^\]]*)\]\(placeholder:([^)\s]+)\)\s*$/);
    if (placeholder) {
      html.push(
        `<figure class="doc-figure is-placeholder" data-slot="${escapeHtml(placeholder[2])}">` +
          `<span class="doc-figure-frame" aria-hidden="true"></span>` +
          `<figcaption><b>图片占位</b>${placeholder[1] ? ` · ${escapeHtml(placeholder[1])}` : ''}` +
          `<em>${escapeHtml(placeholder[2])}</em></figcaption>` +
          `</figure>`
      );
      i++;
      continue;
    }

    // 浮层里文章标题已在头部，正文从 h2 起：# 与 ## 都作节标题，### 起逐级下探
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = Math.min(4, Math.max(2, heading[1].length));
      html.push(`<h${level}>${inline(heading[2].trim())}</h${level}>`);
      i++;
      continue;
    }

    // 分隔线
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      html.push('<hr />');
      i++;
      continue;
    }

    // 引用：连续的多行合并成一段引用块
    if (/^\s*>/.test(line)) {
      const buffer = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        buffer.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      html.push(`<blockquote>${renderMarkdown(buffer.join('\n'))}</blockquote>`);
      continue;
    }

    // 列表
    if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items = [];
      while (i < lines.length) {
        const item = lines[i].match(/^\s*([-*+]|\d+\.)\s+(.*)$/);
        if (item) {
          const itemOrdered = /\d+\./.test(item[1]);
          if (itemOrdered !== ordered) break;
          items.push(item[2]);
          i++;
          continue;
        }
        // 缩进的续行并入上一条
        if (items.length && lines[i].trim() && /^\s{2,}/.test(lines[i])) {
          items[items.length - 1] += ` ${lines[i].trim()}`;
          i++;
          continue;
        }
        break;
      }
      const tag = ordered ? 'ol' : 'ul';
      const list = items.map((text) => `<li>${inline(text)}</li>`).join('');
      html.push(`<${tag}>${list}</${tag}>`);
      continue;
    }

    // 段落：连续的非空行
    const buffer = [line.trim()];
    i++;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      buffer.push(lines[i].trim());
      i++;
    }
    html.push(`<p>${inline(buffer.join(' '))}</p>`);
  }

  return html.join('\n');
}
