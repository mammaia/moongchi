import { describe, expect, it } from 'vitest';
import { createEmptyDiary, readDiary } from '../../src/core/diarySchema';
import { SAVE_VERSION, migrate } from '../../src/core/saveSchema';
import { DIARY } from '../../src/data/diary';
import {
  formatDiaryDate,
  groupForPicker,
  pageCaption,
  pageDays,
  pagePhoto,
  photoRefs,
  removePagePhoto,
  setPageCaption,
  setPagePhoto,
  stepDay,
  swipeDirection,
  type PageDefaults,
} from '../../src/features/diary/rules';

const D: PageDefaults = {
  paper: DIARY.defaultPaper,
  photoLayout: DIARY.photoLayout,
  captionLayout: DIARY.captionLayout,
  captionMaxLength: DIARY.captionMaxLength,
};
let n = 0;
const id = () => `i${++n}`;

describe('다이어리 기록', () => {
  it('사진을 붙이면 그 날 페이지가 생기고 사진 id만 적는다', () => {
    const diary = createEmptyDiary();
    setPagePhoto(diary, '2026-11-20', 'p-1', 100, D, id);
    const page = diary.pages['2026-11-20']!;
    expect(page.paper).toBe(DIARY.defaultPaper);
    expect(pagePhoto(page)).toMatchObject({ kind: 'photo', photoId: 'p-1', layout: { ...DIARY.photoLayout } });
  });

  it('사진을 바꾸면 자리(위치·크기)는 그대로 두고 사진만 바뀐다', () => {
    const diary = createEmptyDiary();
    setPagePhoto(diary, '2026-11-20', 'p-1', 100, D, id);
    pagePhoto(diary.pages['2026-11-20'])!.layout.x = 0.3; // 나중에 옮긴 자리
    setPagePhoto(diary, '2026-11-20', 'p-2', 200, D, id);
    const photos = diary.pages['2026-11-20']!.items.filter((i) => i.kind === 'photo');
    expect(photos).toHaveLength(1);
    expect(photos[0]).toMatchObject({ photoId: 'p-2', layout: { x: 0.3 } });
    expect(diary.pages['2026-11-20']!.updatedAt).toBe(200);
  });

  it('글을 쓰고 고칠 수 있고, 최대 글자 수를 넘으면 자른다', () => {
    const diary = createEmptyDiary();
    setPageCaption(diary, '2026-11-20', '뭉치가 양말을 물고 왔다', 1, D, id);
    setPageCaption(diary, '2026-11-20', '뭉치가 양말을 물고 도망갔다', 2, D, id);
    expect(pageCaption(diary.pages['2026-11-20'])!.text).toBe('뭉치가 양말을 물고 도망갔다');
    setPageCaption(diary, '2026-11-20', '가'.repeat(DIARY.captionMaxLength + 20), 3, D, id);
    expect([...pageCaption(diary.pages['2026-11-20'])!.text]).toHaveLength(DIARY.captionMaxLength);
  });

  it('사진을 떼도 글은 남고, 둘 다 없으면 페이지가 정리된다', () => {
    const diary = createEmptyDiary();
    setPagePhoto(diary, '2026-11-20', 'p-1', 1, D, id);
    setPageCaption(diary, '2026-11-20', '안녕', 2, D, id);
    removePagePhoto(diary, '2026-11-20', 3);
    expect(pagePhoto(diary.pages['2026-11-20'])).toBeUndefined();
    expect(pageCaption(diary.pages['2026-11-20'])!.text).toBe('안녕');
    setPageCaption(diary, '2026-11-20', '   ', 4, D, id);
    expect(diary.pages['2026-11-20']).toBeUndefined();
  });

  it('빈 글만 쓰면 페이지를 만들지 않는다', () => {
    const diary = createEmptyDiary();
    setPageCaption(diary, '2026-11-20', '', 1, D, id);
    expect(diary.pages).toEqual({});
  });

  it('다이어리가 쓰는 사진 목록을 알 수 있다', () => {
    const diary = createEmptyDiary();
    setPagePhoto(diary, '2026-11-19', 'p-a', 1, D, id);
    setPagePhoto(diary, '2026-11-20', 'p-b', 1, D, id);
    expect(photoRefs(diary)).toEqual(
      expect.arrayContaining([
        { dayKey: '2026-11-19', photoId: 'p-a' },
        { dayKey: '2026-11-20', photoId: 'p-b' },
      ]),
    );
  });
});

describe('다이어리 넘기기', () => {
  const diary = createEmptyDiary();
  setPageCaption(diary, '2026-11-15', 'a', 1, D, id);
  setPageCaption(diary, '2026-11-18', 'b', 1, D, id);

  it('기록한 날 + 오늘을 날짜순으로 넘긴다', () => {
    const days = pageDays(diary, '2026-11-20');
    expect(days).toEqual(['2026-11-15', '2026-11-18', '2026-11-20']);
    expect(stepDay(days, '2026-11-20', -1)).toBe('2026-11-18');
    expect(stepDay(days, '2026-11-15', -1)).toBeNull();
    expect(stepDay(days, '2026-11-20', 1)).toBeNull();
  });

  it('지금 보던 빈 페이지가 목록에서 빠져도 가까운 날로 넘어간다', () => {
    const days = pageDays(diary, '2026-11-20');
    expect(stepDay(days, '2026-11-16', 1)).toBe('2026-11-18');
    expect(stepDay(days, '2026-11-16', -1)).toBe('2026-11-15');
  });

  it('오른쪽으로 밀면 이전, 왼쪽으로 밀면 다음. 세로 움직임이나 짧은 움직임은 무시', () => {
    expect(swipeDirection(80, 5, 50)).toBe(-1);
    expect(swipeDirection(-80, 5, 50)).toBe(1);
    expect(swipeDirection(30, 0, 50)).toBe(0);
    expect(swipeDirection(70, 90, 50)).toBe(0);
  });

  it('날짜 표시', () => {
    expect(formatDiaryDate('2026-11-20')).toEqual({ year: '2026', date: '11월 20일', weekday: '금요일' });
  });

  it('사진 고르기: 이 페이지 날짜를 맨 위, 나머지는 최근부터', () => {
    const groups = groupForPicker(
      [
        { dayKey: '2026-11-20', takenAt: 3 },
        { dayKey: '2026-11-18', takenAt: 1 },
        { dayKey: '2026-11-19', takenAt: 2 },
      ],
      '2026-11-18',
    );
    expect(groups.map((g) => g.dayKey)).toEqual(['2026-11-18', '2026-11-20', '2026-11-19']);
  });
});

describe('다이어리 저장', () => {
  it('버전 1 저장(다이어리 이전)도 그대로 열리고 빈 다이어리가 생긴다', () => {
    const v1 = {
      version: 1,
      wallet: { sparkle: 30 },
      petting: { lastRewardDay: '2026-11-19', totalStrokes: 12 },
      character: { x: 100, y: 200 },
      progress: { createdAt: 5, lastSeenAt: 6 },
    };
    const s = migrate(v1, 99);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.wallet.sparkle).toBe(30);
    expect(s.petting.totalStrokes).toBe(12);
    expect(s.character).toEqual({ x: 100, y: 200 });
    expect(s.diary).toEqual({ pages: {} });
  });

  it('깨진 페이지·모르는 물건만 빼고 나머지 기록은 살린다', () => {
    const diary = readDiary(
      {
        pages: {
          '2026-11-20': {
            createdAt: 1,
            updatedAt: 2,
            items: [
              { id: 'a', kind: 'photo', photoId: 'p-1', layout: { x: 0.1, y: 0.2, w: 0.5, h: 0.5, rot: 0, z: 1 } },
              { id: 'b', kind: 'text', text: '좋은 날' },
              { id: 'c', kind: 'alien' },
              'garbage',
            ],
          },
          'not-a-day': { items: [] },
          '2026-11-21': 'broken',
        },
      },
      'cream-grid',
    );
    expect(Object.keys(diary.pages)).toEqual(['2026-11-20']);
    const page = diary.pages['2026-11-20']!;
    expect(page.paper).toBe('cream-grid');
    expect(page.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(pageCaption(page)!.layout.w).toBeGreaterThan(0);
  });

  it('다이어리 서랍이 깨져 있어도 게임 저장 전체는 열린다', () => {
    const s = migrate({ version: 2, wallet: { sparkle: 3 }, diary: 'oops' }, 1);
    expect(s.wallet.sparkle).toBe(3);
    expect(s.diary).toEqual({ pages: {} });
  });
});
