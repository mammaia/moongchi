import { describe, expect, it } from 'vitest';
import { createMemoryPhotoLibrary, PHOTO_RECORD_VERSION, type PhotoRecord } from '../../src/core/photoLibrary';
import { SAVE_VERSION, createNewSave } from '../../src/core/saveSchema';
import { FULL_CROP, cropToPixels, isFullCrop, moveCrop, resizeCrop } from '../../src/features/photo/crop';
import { fitWidth, formatDayLabel, formatTakenAt, formatTime, groupByDay, makePhotoId } from '../../src/features/photo/rules';

const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const photo = (id: string, dayKey: string, takenAt: number): PhotoRecord => ({
  v: PHOTO_RECORD_VERSION,
  id,
  takenAt,
  dayKey,
  width: 780,
  height: 1400,
  thumb: new Blob(['t']),
  image: new Blob(['image-' + id]),
  meta: { activity: 'play' },
});

describe('사진 규칙', () => {
  it('날짜와 시간을 한국어로 보여준다', () => {
    expect(formatDayLabel('2026-11-20')).toBe('2026년 11월 20일 (금)');
    expect(formatTime(at(2026, 11, 20, 21, 5))).toBe('오후 9:05');
    expect(formatTime(at(2026, 11, 20, 0, 30))).toBe('오전 12:30');
    expect(formatTime(at(2026, 11, 20, 12, 0))).toBe('오후 12:00');
    expect(formatTakenAt('2026-11-20', at(2026, 11, 20, 9, 7))).toBe('2026년 11월 20일 (금) 오전 9:07');
  });

  it('앨범은 날짜별로 묶고 최근 날짜·최근 사진이 먼저 온다', () => {
    const groups = groupByDay([
      { id: 'a', dayKey: '2026-11-19', takenAt: at(2026, 11, 19, 10) },
      { id: 'b', dayKey: '2026-11-20', takenAt: at(2026, 11, 20, 8) },
      { id: 'c', dayKey: '2026-11-20', takenAt: at(2026, 11, 20, 22) },
      { id: 'd', dayKey: '2026-10-31', takenAt: at(2026, 10, 31, 22) },
    ]);
    expect(groups.map((g) => g.dayKey)).toEqual(['2026-11-20', '2026-11-19', '2026-10-31']);
    expect(groups[0].photos.map((p) => p.id)).toEqual(['c', 'b']);
    expect(groups[0].label).toBe('2026년 11월 20일 (금)');
    expect(groupByDay([])).toEqual([]);
  });

  it('사진 id는 같은 순간에 찍어도 겹치지 않는다', () => {
    let n = 0;
    const rand = () => (n++ % 10) / 10;
    const ids = new Set(Array.from({ length: 10 }, () => makePhotoId(1000, rand)));
    expect(ids.size).toBe(10);
    expect(makePhotoId(1000, () => 0)).toMatch(/^p-[0-9a-z]+-[0-9a-z]{6}$/);
  });

  it('썸네일 크기는 비율을 지키고 작은 사진은 키우지 않는다', () => {
    expect(fitWidth(780, 1400, 240)).toEqual({ width: 240, height: 431 });
    expect(fitWidth(100, 200, 240)).toEqual({ width: 100, height: 200 });
    expect(fitWidth(0, 10, 240)).toEqual({ width: 0, height: 0 });
  });
});

describe('사진 보관함 (메모리판으로 동작 확인)', () => {
  it('저장, 최신순 목록, 꺼내기, 지우기', async () => {
    const lib = createMemoryPhotoLibrary();
    await lib.add(photo('old', '2026-11-19', 100));
    await lib.add(photo('new', '2026-11-20', 200));
    const list = await lib.list();
    expect(list.map((p) => p.id)).toEqual(['new', 'old']);
    expect('image' in list[0]).toBe(false); // 목록에는 큰 사진을 싣지 않는다
    expect(await (await lib.get('old'))!.image.text()).toBe('image-old');
    await lib.remove('old');
    expect((await lib.list()).map((p) => p.id)).toEqual(['new']);
    expect(await lib.get('old')).toBeNull();
  });

  it('사진은 진행 상황 저장과 따로라서 저장에 사진 칸이 없다 (다이어리는 사진 id만 적는다)', () => {
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(1);
    expect(Object.keys(createNewSave(0)).sort()).toEqual(['character', 'diary', 'petting', 'progress', 'version', 'wallet']);
  });
});

describe('사진 자르기 [가정: 찍은 뒤 미리보기에서 자르기]', () => {
  const min = 0.2;
  it('처음에는 사진 전체', () => {
    expect(isFullCrop(FULL_CROP)).toBe(true);
    expect(cropToPixels(FULL_CROP, 780, 1400)).toEqual({ sx: 0, sy: 0, sw: 780, sh: 1400 });
  });

  it('모서리를 끌면 반대쪽 모서리는 그대로 두고 크기가 바뀐다', () => {
    const r = resizeCrop(FULL_CROP, 'se', -0.5, -0.25, min, min);
    expect(r).toEqual({ x: 0, y: 0, w: 0.5, h: 0.75 });
    const r2 = resizeCrop(r, 'nw', 0.1, 0.25, min, min);
    expect(r2.x).toBeCloseTo(0.1);
    expect(r2.y).toBeCloseTo(0.25);
    expect(r2.x + r2.w).toBeCloseTo(0.5);
    expect(r2.y + r2.h).toBeCloseTo(0.75);
    expect(isFullCrop(r2)).toBe(false);
  });

  it('최소 크기보다 작아지거나 사진 밖으로 나가지 않는다', () => {
    const tiny = resizeCrop(FULL_CROP, 'ne', -5, 5, min, min);
    expect(tiny.w).toBeCloseTo(min);
    expect(tiny.h).toBeCloseTo(min);
    expect(tiny.y + tiny.h).toBeCloseTo(1);
    const out = resizeCrop({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 }, 'nw', -3, -3, min, min);
    expect(out).toEqual({ x: 0, y: 0, w: 0.7, h: 0.7 });
  });

  it('틀을 옮겨도 사진 밖으로 나가지 않는다', () => {
    const r = { x: 0.2, y: 0.2, w: 0.5, h: 0.5 };
    const moved = moveCrop(r, 0.1, -0.05);
    expect(moved.x).toBeCloseTo(0.3);
    expect(moved.y).toBeCloseTo(0.15);
    expect(moveCrop(r, 9, 9)).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
    expect(moveCrop(r, -9, -9)).toEqual({ x: 0, y: 0, w: 0.5, h: 0.5 });
  });

  it('픽셀로 바꿀 때 사진 안쪽, 최소 1픽셀', () => {
    expect(cropToPixels({ x: 0.5, y: 0.25, w: 0.5, h: 0.5 }, 780, 1400)).toEqual({ sx: 390, sy: 350, sw: 390, sh: 700 });
    expect(cropToPixels({ x: 1, y: 1, w: 0, h: 0 }, 10, 10)).toEqual({ sx: 9, sy: 9, sw: 1, sh: 1 });
  });
});
