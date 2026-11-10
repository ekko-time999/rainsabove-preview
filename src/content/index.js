// 内容层入口：正文与 front matter 在构建时由 scripts/content-index.mjs 扫描，
// 以虚拟模块 virtual:content-index 内联进 bundle，因此单文件预览也能读到内容。
import CONTENT from 'virtual:content-index';

export const COLLECTIONS = ['pages', 'posts', 'works', 'collections', 'guests', 'about', 'workshop'];

// 七个停靠点对应的内容集合
export const STOP_COLLECTIONS = {
  foyer: 'pages',
  backstage: 'posts',
  stage: 'works',
  workshop: 'workshop',
  screening: 'collections',
  box: 'guests',
  about: 'about'
};

export const TYPE_STOP = {
  pages: 'foyer',
  posts: 'backstage',
  works: 'stage',
  workshop: 'workshop',
  collections: 'screening',
  guests: 'box',
  about: 'about'
};

export const contentManifest = COLLECTIONS.flatMap((type) =>
  (CONTENT[type] || []).map((entry) => entry.path)
);

export function entriesOf(type, { includeDrafts = false } = {}) {
  const list = (CONTENT[type] || []).map((entry) => ({ ...entry, collection: type }));
  return includeDrafts ? list : list.filter((entry) => !entry.data.draft);
}

export function findEntry(type, slug) {
  return entriesOf(type).find((entry) => entry.slug === slug) || null;
}

export function recentEntries(limit = 5) {
  return COLLECTIONS.filter((type) => type !== 'pages')
    .flatMap((type) => entriesOf(type))
    .filter((entry) => entry.data.date)
    .sort((a, b) => (String(a.data.date) < String(b.data.date) ? 1 : -1))
    .slice(0, limit);
}

export async function loadEntries(type) {
  return entriesOf(type);
}

export async function loadStopEntries(stopId) {
  return entriesOf(STOP_COLLECTIONS[stopId]);
}
