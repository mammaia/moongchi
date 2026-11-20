/**
 * 다이어리 규칙 (Phaser·브라우저 없이 계산만). tests/unit/diary.test.ts에서 테스트한다.
 * 저장 서랍(diary)을 바꾸는 함수는 store.update 안에서 draft에 대고 부른다.
 */
import type { DiaryData, DiaryPage, ItemLayout, PhotoItem, TextItem } from '../../core/diarySchema';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export interface PageDefaults {
  paper: string;
  photoLayout: Omit<ItemLayout, 'z'>;
  captionLayout: Omit<ItemLayout, 'z'>;
  captionMaxLength: number;
}

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

export const pagePhoto = (page: DiaryPage | undefined): PhotoItem | undefined =>
  page?.items.find((i): i is PhotoItem => i.kind === 'photo');
export const pageCaption = (page: DiaryPage | undefined): TextItem | undefined =>
  page?.items.find((i): i is TextItem => i.kind === 'text');

function ensurePage(diary: DiaryData, dayKey: string, now: number, paper: string): DiaryPage {
  let page = diary.pages[dayKey];
  if (!page) {
    page = { dayKey, createdAt: now, updatedAt: now, paper, items: [] };
    diary.pages[dayKey] = page;
  }
  page.updatedAt = now;
  return page;
}

/** 아무것도 안 붙은 페이지는 지운다. 오늘 페이지는 지워져도 계속 넘겨볼 수 있다. */
function prune(diary: DiaryData, dayKey: string): void {
  const page = diary.pages[dayKey];
  if (page && page.items.length === 0) delete diary.pages[dayKey];
}

const nextZ = (page: DiaryPage) => page.items.reduce((z, i) => Math.max(z, i.layout.z), 0) + 1;

/** 사진 붙이기. 이미 사진이 있으면 자리는 그대로 두고 사진만 바꾼다. */
export function setPagePhoto(
  diary: DiaryData,
  dayKey: string,
  photoId: string,
  now: number,
  defaults: PageDefaults,
  makeId: () => string = () => makeItemId(now),
): void {
  const page = ensurePage(diary, dayKey, now, defaults.paper);
  const existing = pagePhoto(page);
  if (existing) existing.photoId = photoId;
  else page.items.push({ id: makeId(), kind: 'photo', photoId, layout: { ...defaults.photoLayout, z: nextZ(page) } });
}

/** 사진 떼기. 글은 남는다. */
export function removePagePhoto(diary: DiaryData, dayKey: string, now: number): void {
  const page = diary.pages[dayKey];
  if (!page) return;
  page.items = page.items.filter((i) => i.kind !== 'photo');
  page.updatedAt = now;
  prune(diary, dayKey);
}

/** 글 쓰기/고치기. 최대 글자 수를 넘으면 자른다. 비우면 글 칸을 뺀다. */
export function setPageCaption(
  diary: DiaryData,
  dayKey: string,
  text: string,
  now: number,
  defaults: PageDefaults,
  makeId: () => string = () => makeItemId(now),
): void {
  const clipped = [...text].slice(0, defaults.captionMaxLength).join('');
  if (clipped.trim() === '') {
    const page = diary.pages[dayKey];
    if (!page) return;
    page.items = page.items.filter((i) => i.kind !== 'text');
    page.updatedAt = now;
    prune(diary, dayKey);
    return;
  }
  const page = ensurePage(diary, dayKey, now, defaults.paper);
  const existing = pageCaption(page);
  if (existing) existing.text = clipped;
  else page.items.push({ id: makeId(), kind: 'text', text: clipped, layout: { ...defaults.captionLayout, z: nextZ(page) } });
}

/** 다이어리가 쓰고 있는 사진 목록. (나중에 앨범에서 지울 때 "다이어리에 붙은 사진" 안내에 쓸 수 있다) */
export function photoRefs(diary: Readonly<DiaryData>): { dayKey: string; photoId: string }[] {
  return Object.values(diary.pages).flatMap((page) =>
    page.items.filter((i): i is PhotoItem => i.kind === 'photo').map((i) => ({ dayKey: page.dayKey, photoId: i.photoId })),
  );
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
