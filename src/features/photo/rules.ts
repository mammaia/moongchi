/**
 * 사진 규칙 (Phaser·브라우저 없이 계산만). tests/unit/photo.test.ts에서 테스트한다.
 */

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 사진 id: 찍은 시각 + 무작위 글자. 같은 순간에 두 장 찍어도 겹치지 않는다. */
export function makePhotoId(takenAt: number, random: () => number = Math.random): string {
  const tail = Math.floor(random() * 36 ** 6)
    .toString(36)
    .padStart(6, '0');
  return `p-${Math.max(0, Math.floor(takenAt)).toString(36)}-${tail}`;
}

/** "2026-11-20" → "2026년 11월 20일 (금)" */
export function formatDayLabel(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  if (!y || !m || !d) return dayKey;
  const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return `${y}년 ${m}월 ${d}일 (${weekday})`;
}

/** 기기 시간대 기준 "오후 9:05" */
export function formatTime(time: number): string {
  const date = new Date(time);
  const h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, '0');
  const half = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${half} ${h12}:${m}`;
}

/** 미리보기·확대 화면에 쓰는 "2026년 11월 20일 (금) 오후 9:05" */
export function formatTakenAt(dayKey: string, takenAt: number): string {
  return `${formatDayLabel(dayKey)} ${formatTime(takenAt)}`;
}

export interface DayGroup<T> {
  dayKey: string;
  label: string;
  photos: T[];
}

/** 앨범: 날짜별로 묶는다. 최근 날짜가 위, 같은 날 안에서는 최근 사진이 앞. */
export function groupByDay<T extends { dayKey: string; takenAt: number }>(photos: readonly T[]): DayGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const photo of photos) {
    const list = groups.get(photo.dayKey) ?? [];
    list.push(photo);
    groups.set(photo.dayKey, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([dayKey, list]) => ({
      dayKey,
      label: formatDayLabel(dayKey),
      photos: list.sort((a, b) => b.takenAt - a.takenAt),
    }));
}

/** 가로 maxWidth 안에 비율을 지켜 들어가는 크기 (작은 사진은 키우지 않는다) */
export function fitWidth(width: number, height: number, maxWidth: number): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  if (width <= maxWidth) return { width: Math.round(width), height: Math.round(height) };
  const scale = maxWidth / width;
  return { width: Math.round(maxWidth), height: Math.max(1, Math.round(height * scale)) };
}
