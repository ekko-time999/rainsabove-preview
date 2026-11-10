// 新建一篇内容：npm run new -- post "标题"
// 也可打印 GitHub 网页一键新建链接：npm run links
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE_DIR = path.join(root, 'content', '_templates');
const OWNER = 'ekko-time999';
const REPO = 'rainsabove';
const BRANCH = 'main';

const TYPES = {
  post: { dir: 'posts', template: 'post', label: '随笔' },
  work: { dir: 'works', template: 'work', label: '作品' },
  collection: { dir: 'collections', template: 'collection', label: '片单' },
  guest: { dir: 'guests', template: 'guest', label: '友链' },
  about: { dir: 'about', template: 'about', label: '关于' },
  page: { dir: 'pages', template: 'page', label: '页面' },
  workshop: { dir: 'workshop', template: 'workshop', label: '绘景' }
};

const ALIASES = {
  posts: 'post',
  works: 'work',
  collections: 'collection',
  guests: 'guest',
  pages: 'page',
  随笔: 'post',
  作品: 'work',
  片单: 'collection',
  友链: 'guest',
  关于: 'about',
  页面: 'page',
  绘景: 'workshop'
};

function localDate() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 中文标题保留原字，只去掉文件名非法字符；空格转连字符
function slugify(title) {
  return (
    String(title)
      .trim()
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/[，。、；：！？“”‘’（）《》【】·…—]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'untitled'
  );
}

function parseArgs(argv) {
  const positionals = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--links') flags.links = true;
    else if (arg === '--help' || arg === '-h') flags.help = true;
    else if (arg.startsWith('--date=')) flags.date = arg.slice(7);
    else if (arg.startsWith('--slug=')) flags.slug = arg.slice(7);
    else if (arg === '--date' || arg === '--slug') {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) fail(`参数 ${arg} 后面缺少值`);
      flags[key] = next;
      i++;
    } else positionals.push(arg);
  }
  return { positionals, flags };
}

function usage() {
  console.log(
    [
      '用法：',
      '  npm run new -- <类型> "标题" [--date 2026-11-09] [--slug custom-slug]',
      '  npm run links            # 打印 GitHub 网页一键新建链接',
      '',
      '类型：' + Object.keys(TYPES).map((k) => `${k}（${TYPES[k].label}）`).join('、'),
      '别名：' + Object.keys(ALIASES).join('、')
    ].join('\n')
  );
}

function fail(message) {
  console.error(`[new] ${message}`);
  process.exit(1);
}

function readTemplate(name) {
  const file = path.join(TEMPLATE_DIR, `${name}.md`);
  if (!fs.existsSync(file)) fail(`模板不存在：content/_templates/${name}.md`);
  return fs.readFileSync(file, 'utf8');
}

function fillTemplate(template, { title, date }) {
  return template
    .replace(/^title:.*$/m, `title: ${title}`)
    .replace(/^date:.*$/m, `date: ${date}`);
}

function printLinks() {
  const date = localDate();
  for (const [key, type] of Object.entries(TYPES)) {
    const template = readTemplate(type.template);
    const body = fillTemplate(template, { title: '标题写在这里', date });
    const filename = `content/${type.dir}/${date}-标题.md`;
    const url =
      `https://github.com/${OWNER}/${REPO}/new/${BRANCH}` +
      `?filename=${encodeURIComponent(filename)}&value=${encodeURIComponent(body)}`;
    console.log(`${type.label}（${key}）\n${url}\n`);
  }
}

const { positionals, flags } = parseArgs(process.argv.slice(2));

if (flags.help || (!flags.links && positionals.length === 0)) {
  usage();
  process.exit(flags.help ? 0 : 1);
}

if (flags.links) {
  printLinks();
  process.exit(0);
}

const rawType = positionals[0];
const typeKey = ALIASES[rawType] || rawType;
const type = TYPES[typeKey];
if (!type) fail(`未知类型 "${rawType}"，可用：${Object.keys(TYPES).join('、')}`);

const title = (positionals[1] || '').trim();
if (!title) fail('缺少标题，例如：npm run new -- post "灯亮之前"');

const date = flags.date || localDate();
if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
  fail(`--date 必须是 YYYY-MM-DD，当前是 "${date}"`);
}

const dir = path.join(root, 'content', type.dir);
fs.mkdirSync(dir, { recursive: true });

const filename = `${date}-${slugify(flags.slug || title)}.md`;
const target = path.join(dir, filename);
if (fs.existsSync(target)) fail(`文件已存在：content/${type.dir}/${filename}`);

fs.writeFileSync(target, fillTemplate(readTemplate(type.template), { title, date }), 'utf8');

console.log(`[new] 已创建 content/${type.dir}/${filename}`);
console.log('[new] 写完正文后，把 draft: true 改成 false，再提交推送：');
console.log(`      git add content/${type.dir}/${filename} && git commit -m "content: ${title}" && git push`);
