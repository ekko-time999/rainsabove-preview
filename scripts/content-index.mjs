// 构建时扫描 content/ 下的 Markdown，生成带 front matter 的索引，
// 并以虚拟模块 virtual:content-index 注入正文，保证单文件预览也能读到内容。
import fs from 'node:fs';
import path from 'node:path';

export const COLLECTIONS = ['pages', 'posts', 'works', 'collections', 'guests', 'about', 'workshop'];

// front matter 规范：与 content/README.md 中的字段表保持一致。
// required 缺失会中断构建；optional 可省略；未列出的字段只告警，避免拼写错误悄悄生效。
export const SCHEMAS = {
  pages: {
    required: ['title', 'date', 'summary'],
    optional: ['tags', 'cover', 'draft', 'placeholder']
  },
  posts: {
    required: ['title', 'date', 'summary'],
    optional: ['tags', 'cover', 'draft', 'placeholder']
  },
  works: {
    required: ['title', 'date', 'summary'],
    optional: ['tags', 'cover', 'draft', 'placeholder']
  },
  collections: {
    required: ['title', 'date', 'summary'],
    optional: ['tags', 'cover', 'draft', 'placeholder']
  },
  guests: {
    required: ['title', 'date', 'summary', 'link'],
    optional: ['tags', 'cover', 'draft', 'placeholder', 'linkLabel']
  },
  about: {
    required: ['title', 'date', 'summary'],
    optional: ['tags', 'cover', 'draft', 'placeholder']
  },
  workshop: {
    required: ['title', 'date', 'summary'],
    optional: ['tags', 'cover', 'draft', 'placeholder']
  }
};

export function parseFrontMatter(raw) {
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (!text.startsWith('---')) return { data: {}, body: text.trim() };
  const end = text.indexOf('\n---', 3);
  if (end === -1) return { data: {}, body: text.trim() };
  const head = text.slice(3, end).trim();
  const body = text.slice(end + 4).replace(/^\s*\n/, '').trim();
  const data = {};

  for (const line of head.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const m = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const [, key, value] = m;
    let v = value.trim();
    if (/^\[.*\]$/.test(v)) {
      v = v
        .slice(1, -1)
        .split(/[,，]/)
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    } else if (/^-?\d+(\.\d+)?$/.test(v)) {
      v = Number(v);
    } else if (v === 'true' || v === 'false') {
      v = v === 'true';
    } else {
      v = v.replace(/^['"]|['"]$/g, '');
    }
    data[key] = v;
  }
  return { data, body };
}

function walk(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    // 以 _ 或 . 开头的目录不作为内容集合（_templates 放模板）
    if (item.name.startsWith('_') || item.name.startsWith('.')) continue;
    const full = path.join(dir, item.name);
    if (item.isDirectory()) walk(full, out);
    else out.push(full);
  }
}

export function scanContent(root) {
  const base = path.join(root, 'content');
  const index = {};
  for (const name of COLLECTIONS) index[name] = [];
  if (!fs.existsSync(base)) return index;

  const files = [];
  walk(base, files);

  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    const rel = path.relative(base, file).split(path.sep).join('/');
    // content/ 根目录下的 md（如 README.md）是说明文档，不算内容
    if (!rel.includes('/')) continue;
    const collection = rel.split('/')[0];
    if (!index[collection]) index[collection] = [];
    const raw = fs.readFileSync(file, 'utf8');
    const { data, body } = parseFrontMatter(raw);
    index[collection].push({
      path: `/content/${rel}`,
      slug: path.basename(file, '.md'),
      data,
      body
    });
  }

  for (const key of Object.keys(index)) {
    index[key].sort((a, b) => {
      const da = String(a.data.date || '');
      const db = String(b.data.date || '');
      return da < db ? 1 : da > db ? -1 : 0;
    });
  }

  return index;
}

// 构建期校验：必填缺失 / 日期不合法 / cover 文件不存在 / 字段拼错，都要在终端说清楚。
export function validateContent(root, index) {
  const errors = [];
  const warnings = [];
  const publicDir = path.join(root, 'public');

  for (const type of COLLECTIONS) {
    const schema = SCHEMAS[type];
    const seen = new Map();

    for (const entry of index[type] || []) {
      const where = `content/${type}/${path.basename(entry.path)}`;
      const data = entry.data || {};

      for (const key of schema.required) {
        const v = data[key];
        if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) {
          errors.push(`${where} 缺少必填字段 "${key}"`);
        }
      }

      if (data.date !== undefined && data.date !== '') {
        const ok = typeof data.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.date);
        if (!ok || Number.isNaN(Date.parse(data.date))) {
          errors.push(`${where} 的 date 必须是 YYYY-MM-DD，当前是 "${data.date}"`);
        }
      }

      for (const key of ['draft', 'placeholder']) {
        if (data[key] !== undefined && typeof data[key] !== 'boolean') {
          errors.push(`${where} 的 ${key} 只能是 true / false，当前是 "${data[key]}"`);
        }
      }

      if (data.tags !== undefined && !Array.isArray(data.tags)) {
        warnings.push(`${where} 的 tags 建议写成 [标签甲, 标签乙]`);
      }

      if (data.cover !== undefined && data.cover !== '') {
        const cover = String(data.cover);
        if (!/^https?:\/\//i.test(cover)) {
          const rel = cover.replace(/^\.?\//, '');
          if (!fs.existsSync(path.join(publicDir, rel))) {
            errors.push(`${where} 的 cover 找不到文件："${cover}"（图片放 public/images/ 下，写 ./images/文件名）`);
          }
        }
      }

      if (type === 'guests' && typeof data.link === 'string' && data.link && !/^https?:\/\//i.test(data.link)) {
        errors.push(`${where} 的 link 必须是 https:// 开头的完整地址`);
      }

      const allowed = new Set([...schema.required, ...schema.optional]);
      for (const key of Object.keys(data)) {
        if (!allowed.has(key)) warnings.push(`${where} 有未识别字段 "${key}"，请检查拼写`);
      }

      if (seen.has(entry.slug)) {
        errors.push(`${where} 与 ${seen.get(entry.slug)} 文件名重复（slug 需唯一）`);
      } else {
        seen.set(entry.slug, where);
      }
    }
  }

  return { errors, warnings };
}

function assertContent(root) {
  const { errors, warnings } = validateContent(root, scanContent(root));
  for (const w of warnings) console.warn(`[content] 警告：${w}`);
  if (errors.length) {
    throw new Error(
      ['内容校验未通过（修改 content/ 后重试，规范见 content/README.md）：', ...errors.map((e) => `  ✗ ${e}`)].join('\n')
    );
  }
}

export function contentIndexPlugin() {
  const VIRTUAL = 'virtual:content-index';
  const RESOLVED = '\0' + VIRTUAL;
  let root = process.cwd();

  return {
    name: 'content-index',
    enforce: 'pre',
    configResolved(config) {
      root = config.root;
    },
    resolveId(id) {
      return id === VIRTUAL ? RESOLVED : null;
    },
    load(id) {
      if (id !== RESOLVED) return null;
      assertContent(root);
      const index = scanContent(root);
      const files = [];
      walk(path.join(root, 'content'), files);
      files.forEach((f) => this.addWatchFile(f));
      return `const CONTENT = ${JSON.stringify(index)};\nexport default CONTENT;\n`;
    }
  };
}
