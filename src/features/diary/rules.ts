/**
 * 다이어리 규칙 (Phaser·브라우저 없이 계산만). tests/unit/diary.test.ts에서 테스트한다.
 * 저장 서랍(diary)을 바꾸는 함수는 store.update 안에서 draft에 대고 부른다.
 *
 * 모든 함수는 날짜(dayKey)와 물건 id로 그 페이지의 그 물건만 고친다. 그래서 한 페이지를 꾸며도
 * 다른 페이지는 바뀌지 않는다. 자리는 항상 clampLayout을 거쳐서 페이지 밖으로 나가지 않는다.
 */
import type { DiaryData, DiaryItem, DiaryItemKind, DiaryPage, ItemLayout, PhotoItem, TextItem } from '../../core/diarySchema';
import type { DiaryConfig } from '../../data/diary';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

type Box = { x: number; y: number; w: number; h: number };
type Cfg = DiaryConfig;
/** 새 물건 = id·z 없이 종류별 값 + 자리 */
type NewItem = DiaryItem extends infer T ? (T extends DiaryItem ? Omit<T, 'id' | 'layout'> : never) : never;

// ───────── 자리 계산 ─────────

/** 사진 틀(폴라로이드)의 세로/가로 비율을 페이지 비율 단위로: h = w * k / pageAspect */
function photoK(photoW: number, photoH: number, cfg: Pick<Cfg, 'photoFrame'>): number {
  const ratio = photoW > 0 && photoH > 0 ? photoH / photoW : 1;
  const f = cfg.photoFrame;
  return (1 - f.side * 2) * ratio + f.top + f.bottom;
}

/**
 * 사진 비율에 맞는 사진 틀 크기. 틀 안의 사진 칸이 사진과 같은 비율이 되어 잘리는 부분이 없다.
 * 가운데(centerX)와 윗변(top)은 지키고, photoMax를 넘지 않게 줄인다.
 */
export function fitPhotoBox(
  photoW: number,
  photoH: number,
  centerX: number,
  top: number,
  cfg: Pick<Cfg, 'pageAspect' | 'photoMax' | 'photoFrame'>,
  maxW: number = cfg.photoMax.w,
): Box {
  const k = photoK(photoW, photoH, cfg);
  const w = Math.min(maxW, (cfg.photoMax.h * cfg.pageAspect) / k);
  const h = (w * k) / cfg.pageAspect;
  return { x: centerX - w / 2, y: top, w, h };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 각도를 -180 ~ 180도로 */
export function normalizeDeg(deg: number): number {
  const d = ((((deg + 180) % 360) + 360) % 360) - 180;
  return Object.is(d, -0) ? 0 : d;
}

/**
 * 기울인 물건이 실제로 차지하는 네모의 반 너비·반 높이 (페이지 비율).
 * 페이지는 세로가 가로의 pageAspect배라서, 화면 픽셀로 돌려 계산한 뒤 다시 비율로 바꾼다.
 */
function rotatedHalf(w: number, h: number, rot: number, aspect: number): { hw: number; hh: number } {
  const r = (rot * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  const wPx = w; // 페이지 너비 = 1
  const hPx = h * aspect; // 페이지 높이 = aspect
  return { hw: (wPx * c + hPx * s) / 2, hh: (wPx * s + hPx * c) / 2 / aspect };
}

/**
 * 자리를 바로잡는다: 종류별 크기 범위 안으로 (가로세로 비율 유지), 그리고 페이지 안으로.
 * 페이지 밖으로 나가 사라지는 일이 없도록, 기울인 모양까지 포함해 물건 전체가 페이지(0~1) 안에 있게 한다.
 */
export function clampLayout(layout: ItemLayout, kind: DiaryItemKind, cfg: Pick<Cfg, 'sizes' | 'pageAspect'>): ItemLayout {
  const lim = cfg.sizes[kind];
  const rot = normalizeDeg(layout.rot);
  let s = 1;
  if (layout.w * s < lim.minW) s = lim.minW / layout.w;
  if (layout.w * s > lim.maxW) s = lim.maxW / layout.w;
  // 기울인 모양이 페이지보다 크면 줄인다
  const unit = rotatedHalf(layout.w, layout.h, rot, cfg.pageAspect);
  s = Math.min(s, 0.5 / unit.hw, 0.5 / unit.hh);
  const w = layout.w * s;
  const h = layout.h * s;
  const { hw, hh } = rotatedHalf(w, h, rot, cfg.pageAspect);
  const cx = clamp(layout.x + layout.w / 2, hw, 1 - hw);
  const cy = clamp(layout.y + layout.h / 2, hh, 1 - hh);
  return { x: cx - w / 2, y: cy - h / 2, w, h, rot, z: layout.z };
}

/**
 * 손가락 움직임을 자리에 반영한다. 가운데를 (dx, dy)만큼 옮기고(페이지 비율),
 * 가운데를 기준으로 scale배 키우고 rotate도 돌린다. 결과는 항상 clampLayout을 거친다.
 */
export function transformLayout(
  start: ItemLayout,
  change: { dx?: number; dy?: number; scale?: number; rotate?: number },
  kind: DiaryItemKind,
  cfg: Pick<Cfg, 'sizes' | 'pageAspect'>,
): ItemLayout {
  const s = Number.isFinite(change.scale) && change.scale! > 0 ? change.scale! : 1;
  const w = start.w * s;
  const h = start.h * s;
  const cx = start.x + start.w / 2 + (change.dx ?? 0);
  const cy = start.y + start.h / 2 + (change.dy ?? 0);
  return clampLayout({ x: cx - w / 2, y: cy - h / 2, w, h, rot: start.rot + (change.rotate ?? 0), z: start.z }, kind, cfg);
}

// ───────── 페이지 ─────────

/** 물건 id: 시각 + 무작위 글자 */
export function makeItemId(now: number, random: () => number = Math.random): string {
  const tail = Math.floor(random() * 36 ** 5)
    .toString(36)
    .padStart(5, '0');
  return `i-${Math.max(0, Math.floor(now)).toString(36)}-${tail}`;
}

/** "2026-11-20" → { year: '2026', date: '11월 20일', weekday: '금요일' } */
export function formatDiaryDate(dayKey: string): { year: string; date: string; weekday: string } {
  const [y, m, d] = dayKey.split('-').map(Number);
  if (!y || !m || !d) return { year: '', date: dayKey, weekday: '' };
  return { year: String(y), date: `${m}월 ${d}일`, weekday: `${WEEKDAYS[new Date(y, m - 1, d).getDay()]}요일` };
}

/**
 * 넘겨볼 수 있는 날짜들 (오래된 날 → 최근). 기록이 있는 날 + 오늘. [가정]
 * 개발자 패널로 날짜를 되돌린 경우처럼 "오늘"보다 뒤에 기록이 있어도 보여준다.
 */
export function pageDays(diary: Readonly<DiaryData>, today: string): string[] {
  return [...new Set([...Object.keys(diary.pages), today])].sort();
}

/** 앞(-1) / 뒤(+1) 날짜. 끝이면 null. */
export function stepDay(days: readonly string[], current: string, dir: -1 | 1): string | null {
  const i = days.indexOf(current);
  if (i < 0) {
    // 지금 보던 날짜가 목록에 없으면(빈 페이지를 떠난 경우) 그 날짜 기준으로 가까운 날을 찾는다.
    const later = days.filter((d) => (dir > 0 ? d > current : d < current));
    return later.length === 0 ? null : dir > 0 ? later[0]! : later[later.length - 1]!;
  }
  return days[i + dir] ?? null;
}

/** 겹친 순서대로 (아래 → 위) */
export const sortedItems = (page: DiaryPage | undefined): DiaryItem[] =>
  page ? [...page.items].sort((a, b) => a.layout.z - b.layout.z) : [];
export const findItem = (page: DiaryPage | undefined, id: string): DiaryItem | undefined =>
  page?.items.find((i) => i.id === id);
export const pagePhotos = (page: DiaryPage | undefined): PhotoItem[] =>
  page?.items.filter((i): i is PhotoItem => i.kind === 'photo') ?? [];
export const pageTexts = (page: DiaryPage | undefined): TextItem[] =>
  page?.items.filter((i): i is TextItem => i.kind === 'text') ?? [];

/** 스파클 보상 조건 "사진+글 기록 완료": 사진 1장 이상 + 비어 있지 않은 글 1칸 이상. [가정] 최소 글자 수는 data */
export function isEntryComplete(page: DiaryPage | undefined, cfg: Pick<Cfg, 'entryMinTextLength'>): boolean {
  return pagePhotos(page).length > 0 && pageTexts(page).some((t) => [...t.text.trim()].length >= cfg.entryMinTextLength);
}

function ensurePage(diary: DiaryData, dayKey: string, now: number, cfg: Pick<Cfg, 'defaultPaper'>): DiaryPage {
  let page = diary.pages[dayKey];
  if (!page) {
    page = { dayKey, createdAt: now, updatedAt: now, paper: cfg.defaultPaper, items: [] };
    diary.pages[dayKey] = page;
  }
  page.updatedAt = now;
  return page;
}

/** 아무것도 안 붙고 속지도 기본인 페이지는 지운다. 오늘 페이지는 지워져도 계속 넘겨볼 수 있다. */
function prune(diary: DiaryData, dayKey: string, cfg: Pick<Cfg, 'defaultPaper'>): void {
  const page = diary.pages[dayKey];
  if (page && page.items.length === 0 && page.paper === cfg.defaultPaper) delete diary.pages[dayKey];
}

const nextZ = (page: DiaryPage) => page.items.reduce((z, i) => Math.max(z, i.layout.z), 0) + 1;

/** 같은 종류를 또 붙일 때 조금씩 비켜 놓기 (0, 1, 2, 3, 4, 0, ...) */
const cascade = (page: DiaryPage | undefined, kind: DiaryItemKind, cfg: Pick<Cfg, 'cascadeStep'>) =>
  ((page?.items.filter((i) => i.kind === kind).length ?? 0) % 5) * cfg.cascadeStep;

/**
 * 물건 하나를 붙인다. 자리는 페이지 안으로 바로잡는다.
 * @returns 새 물건 id. 페이지가 가득 찼으면 null.
 */
export function addItem(
  diary: DiaryData,
  dayKey: string,
  item: NewItem,
  layout: Omit<ItemLayout, 'z'>,
  now: number,
  cfg: Cfg,
  makeId: () => string = () => makeItemId(now),
): string | null {
  if ((diary.pages[dayKey]?.items.length ?? 0) >= cfg.maxItemsPerPage) return null;
  const page = ensurePage(diary, dayKey, now, cfg);
  let id = makeId();
  while (page.items.some((i) => i.id === id)) id = makeItemId(now);
  const full = clampLayout({ ...layout, z: nextZ(page) }, item.kind, cfg);
  page.items.push({ ...item, id, layout: full } as DiaryItem);
  return id;
}

/** 사진 붙이기. 사진 크기를 알면 틀을 사진 비율에 맞춘다. */
export function addPhoto(
  diary: DiaryData,
  dayKey: string,
  photoId: string,
  size: { width: number; height: number } | undefined,
  now: number,
  cfg: Cfg,
  makeId?: () => string,
): string | null {
  const off = cascade(diary.pages[dayKey], 'photo', cfg);
  const base = cfg.photoLayout;
  const box = size ? fitPhotoBox(size.width, size.height, base.x + base.w / 2, base.y, cfg) : base;
  return addItem(diary, dayKey, { kind: 'photo', photoId }, { ...box, x: box.x + off, y: box.y + off, rot: base.rot }, now, cfg, makeId);
}

/** 글 붙이기. 빈 글은 붙이지 않는다. 최대 글자 수를 넘으면 자른다. */
export function addText(diary: DiaryData, dayKey: string, text: string, now: number, cfg: Cfg, makeId?: () => string): string | null {
  const clipped = clipText(text, cfg);
  if (clipped.trim() === '') return null;
  const off = cascade(diary.pages[dayKey], 'text', cfg);
  const l = cfg.textLayout;
  return addItem(diary, dayKey, { kind: 'text', text: clipped }, { ...l, x: l.x + off, y: l.y - off * 2 }, now, cfg, makeId);
}

/** 스티커 붙이기. aspect = 그림의 세로/가로 비율 */
export function addSticker(
  diary: DiaryData,
  dayKey: string,
  stickerId: string,
  aspect: number,
  now: number,
  cfg: Cfg,
  makeId?: () => string,
): string | null {
  const off = cascade(diary.pages[dayKey], 'sticker', cfg);
  const l = cfg.stickerLayout;
  const h = (l.w * aspect) / cfg.pageAspect;
  return addItem(diary, dayKey, { kind: 'sticker', stickerId }, { ...l, h, x: l.x - off, y: l.y + off }, now, cfg, makeId);
}

/** 마스킹테이프 붙이기. aspect = 테이프의 세로/가로 비율 */
export function addTape(
  diary: DiaryData,
  dayKey: string,
  tapeId: string,
  aspect: number,
  now: number,
  cfg: Cfg,
  makeId?: () => string,
): string | null {
  const off = cascade(diary.pages[dayKey], 'tape', cfg);
  const l = cfg.tapeLayout;
  const h = (l.w * aspect) / cfg.pageAspect;
  return addItem(diary, dayKey, { kind: 'tape', tapeId }, { ...l, h, x: l.x + off * 2, y: l.y + off * 3 }, now, cfg, makeId);
}

function editItem(diary: DiaryData, dayKey: string, id: string, now: number, change: (item: DiaryItem) => void): boolean {
  const page = diary.pages[dayKey];
  const item = findItem(page, id);
  if (!page || !item) return false;
  change(item);
  page.updatedAt = now;
  return true;
}

/** 물건의 자리를 바꾼다 (옮기기·크기·기울기). z(겹침 순서)는 그대로 둔다. */
export function setItemLayout(diary: DiaryData, dayKey: string, id: string, layout: ItemLayout, now: number, cfg: Cfg): void {
  editItem(diary, dayKey, id, now, (item) => {
    item.layout = clampLayout({ ...layout, z: item.layout.z }, item.kind, cfg);
  });
}

export const clipText = (text: string, cfg: Pick<Cfg, 'textMaxLength'>) => [...text].slice(0, cfg.textMaxLength).join('');

/** 글 고치기. 비우면 그 글 칸을 뗀다. */
export function setItemText(diary: DiaryData, dayKey: string, id: string, text: string, now: number, cfg: Cfg): void {
  const clipped = clipText(text, cfg);
  if (clipped.trim() === '') {
    removeItem(diary, dayKey, id, now, cfg);
    return;
  }
  editItem(diary, dayKey, id, now, (item) => {
    if (item.kind === 'text') item.text = clipped;
  });
}

/** 사진 바꾸기. 너비·가운데·윗변·기울기는 그대로, 높이만 새 사진 비율에 맞춘다. */
export function replacePhoto(
  diary: DiaryData,
  dayKey: string,
  id: string,
  photoId: string,
  size: { width: number; height: number } | undefined,
  now: number,
  cfg: Cfg,
): void {
  editItem(diary, dayKey, id, now, (item) => {
    if (item.kind !== 'photo') return;
    item.photoId = photoId;
    if (!size) return;
    const l = item.layout;
    const box = fitPhotoBox(size.width, size.height, l.x + l.w / 2, l.y, { ...cfg, photoMax: { w: l.w, h: 1 } }, l.w);
    item.layout = clampLayout({ ...l, ...box }, 'photo', cfg);
  });
}

/** 물건 떼기. 사진을 떼도 앨범의 사진은 그대로다. */
export function removeItem(diary: DiaryData, dayKey: string, id: string, now: number, cfg: Pick<Cfg, 'defaultPaper'>): void {
  const page = diary.pages[dayKey];
  if (!page) return;
  page.items = page.items.filter((i) => i.id !== id);
  page.updatedAt = now;
  prune(diary, dayKey, cfg);
}

/** 맨 위로 / 맨 아래로. z를 1부터 차례대로 다시 매긴다. */
export function reorderItem(diary: DiaryData, dayKey: string, id: string, to: 'front' | 'back', now: number): void {
  const page = diary.pages[dayKey];
  const item = findItem(page, id);
  if (!page || !item) return;
  const rest = sortedItems(page).filter((i) => i.id !== id);
  const order = to === 'front' ? [...rest, item] : [item, ...rest];
  order.forEach((i, n) => (i.layout.z = n + 1));
  page.updatedAt = now;
}

/** 속지 바꾸기 (이 페이지만) */
export function setPaper(diary: DiaryData, dayKey: string, paper: string, now: number, cfg: Pick<Cfg, 'defaultPaper'>): void {
  ensurePage(diary, dayKey, now, cfg).paper = paper;
  prune(diary, dayKey, cfg);
}

/** 다이어리가 쓰고 있는 사진 목록. (나중에 앨범에서 지울 때 "다이어리에 붙은 사진" 안내에 쓸 수 있다) */
export function photoRefs(diary: Readonly<DiaryData>): { dayKey: string; photoId: string }[] {
  return Object.values(diary.pages).flatMap((page) => pagePhotos(page).map((i) => ({ dayKey: page.dayKey, photoId: i.photoId })));
}

/** 사진 고르기 화면: 날짜별로 묶기. 이 페이지 날짜를 맨 위에, 나머지는 최근 날짜부터. */
export function groupForPicker<T extends { dayKey: string; takenAt: number }>(
  photos: readonly T[],
  pageDay: string,
): { dayKey: string; photos: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const p of photos) groups.set(p.dayKey, [...(groups.get(p.dayKey) ?? []), p]);
  return [...groups.entries()]
    .sort(([a], [b]) => (a === pageDay ? -1 : b === pageDay ? 1 : a < b ? 1 : a > b ? -1 : 0))
    .map(([dayKey, list]) => ({ dayKey, photos: list.sort((a, b) => b.takenAt - a.takenAt) }));
}

/** 옆으로 민 거리로 넘길 방향을 정한다. 세로로 더 많이 움직였으면(스크롤) 넘기지 않는다. */
export function swipeDirection(dx: number, dy: number, threshold: number): -1 | 1 | 0 {
  if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.2) return 0;
  // 오른쪽으로 밀면 이전 날짜(-1), 왼쪽으로 밀면 다음 날짜(+1). 책장 넘기기와 같다.
  return dx > 0 ? -1 : 1;
}

/**
 * 두 손가락(또는 크기 손잡이)의 움직임 → 키우기 배율과 돌린 각도.
 * a0→a1은 시작 때 두 점, b0→b1은 지금 두 점 (화면 픽셀).
 */
export function pinchChange(
  a0: { x: number; y: number },
  a1: { x: number; y: number },
  b0: { x: number; y: number },
  b1: { x: number; y: number },
): { scale: number; rotate: number } {
  const d0 = Math.hypot(a1.x - a0.x, a1.y - a0.y);
  const d1 = Math.hypot(b1.x - b0.x, b1.y - b0.y);
  const ang0 = Math.atan2(a1.y - a0.y, a1.x - a0.x);
  const ang1 = Math.atan2(b1.y - b0.y, b1.x - b0.x);
  return { scale: d0 > 0 ? d1 / d0 : 1, rotate: normalizeDeg(((ang1 - ang0) * 180) / Math.PI) };
}
