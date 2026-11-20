import { describe, expect, it } from 'vitest';
import { createMemoryPhotoLibrary, PHOTO_RECORD_VERSION, type PhotoRecord } from '../../src/core/photoLibrary';
import { SAVE_VERSION, createNewSave } from '../../src/core/saveSchema';
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

  it('사진은 진행 상황 저장과 따로라서 저장 형식이 바뀌지 않는다', () => {
    expect(SAVE_VERSION).toBe(1);
    expect(Object.keys(createNewSave(0)).sort()).toEqual(['character', 'petting', 'progress', 'version', 'wallet']);
  });
});
