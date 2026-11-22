import { describe, expect, it } from 'vitest';
import { createEmptyDiary, readDiary, type DiaryData, type ItemLayout } from '../../src/core/diarySchema';
import { SAVE_VERSION, migrate } from '../../src/core/saveSchema';
import { DIARY } from '../../src/data/diary';
import { PAPERS, STICKERS, TAPES } from '../../src/data/diaryDecor';
import {
  addPhoto,
  addSticker,
  addTape,
  addText,
  clampLayout,
  findItem,
  fitPhotoBox,
  formatDiaryDate,
  groupForPicker,
  isEntryComplete,
  pageDays,
  pagePhotos,
  pageTexts,
  photoRefs,
  pinchChange,
  removeItem,
  reorderItem,
  replacePhoto,
  setItemLayout,
  setItemText,
  setPaper,
  sortedItems,
  stepDay,
  swipeDirection,
  transformLayout,
} from '../../src/features/diary/rules';

let n = 0;
const id = () => `i${++n}`;
const DAY = '2026-11-20';
const PORTRAIT = { width: 780, height: 1400 };

/** 물건이 기울인 모양까지 포함해 페이지(0~1) 안에 있다 */
const inside = (l: ItemLayout) => {
  const r = (l.rot * Math.PI) / 180;
  const A = DIARY.pageAspect;
  const hw = (l.w * Math.abs(Math.cos(r)) + l.h * A * Math.abs(Math.sin(r))) / 2;
  const hh = (l.w * Math.abs(Math.sin(r)) + l.h * A * Math.abs(Math.cos(r))) / 2 / A;
  const cx = l.x + l.w / 2;
  const cy = l.y + l.h / 2;
  const e = 1e-9;
  expect(cx - hw).toBeGreaterThanOrEqual(-e);
  expect(cy - hh).toBeGreaterThanOrEqual(-e);
  expect(cx + hw).toBeLessThanOrEqual(1 + e);
  expect(cy + hh).toBeLessThanOrEqual(1 + e);
};

describe('꾸미기 목록', () => {
  it('속지 3종, 스티커 10종, 마스킹테이프 5종이고 id가 겹치지 않는다', () => {
    expect(PAPERS).toHaveLength(3);
    expect(STICKERS).toHaveLength(10);
    expect(TAPES).toHaveLength(5);
    for (const list of [PAPERS, STICKERS, TAPES]) expect(new Set(list.map((x) => x.id)).size).toBe(list.length);
    expect(PAPERS.map((p) => p.id)).toContain(DIARY.defaultPaper);
  });
});

describe('다이어리 물건 붙이기 (각각 독립된 물건)', () => {
  it('사진을 붙이면 그 날 페이지가 생기고 사진 id만 적는다. 틀은 페이지 안', () => {
    const diary = createEmptyDiary();
    const pid = addPhoto(diary, DAY, 'p-1', PORTRAIT, 100, DIARY, id)!;
    const page = diary.pages[DAY]!;
    expect(page.paper).toBe(DIARY.defaultPaper);
    expect(findItem(page, pid)).toMatchObject({ kind: 'photo', photoId: 'p-1' });
    inside(findItem(page, pid)!.layout);
  });

  it('사진·글·스티커·테이프를 여러 개 붙일 수 있고, 같은 종류는 조금씩 비켜 놓인다', () => {
    const diary = createEmptyDiary();
    const a = addPhoto(diary, DAY, 'p-1', PORTRAIT, 1, DIARY, id)!;
    const b = addPhoto(diary, DAY, 'p-2', PORTRAIT, 2, DIARY, id)!;
    addText(diary, DAY, '첫 줄', 3, DIARY, id);
    addText(diary, DAY, '둘째 글', 4, DIARY, id);
    addSticker(diary, DAY, 'heart', 1, 5, DIARY, id);
    addTape(diary, DAY, 'mint-dot', 0.2, 6, DIARY, id);
    const page = diary.pages[DAY]!;
    expect(page.items.map((i) => i.kind)).toEqual(['photo', 'photo', 'text', 'text', 'sticker', 'tape']);
    expect(findItem(page, a)!.layout.x).not.toBe(findItem(page, b)!.layout.x);
    // 겹침 순서: 나중에 붙인 것이 위
    expect(sortedItems(page).map((i) => i.layout.z)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const item of page.items) inside(item.layout);
    expect(page.items.find((i) => i.kind === 'sticker')).toMatchObject({ stickerId: 'heart' });
    expect(page.items.find((i) => i.kind === 'tape')).toMatchObject({ tapeId: 'mint-dot' });
  });

  it('페이지가 가득 차면 더 붙지 않는다', () => {
    const diary = createEmptyDiary();
    for (let i = 0; i < DIARY.maxItemsPerPage; i++) expect(addSticker(diary, DAY, 'star', 1, i, DIARY, id)).not.toBeNull();
    expect(addSticker(diary, DAY, 'star', 1, 99, DIARY, id)).toBeNull();
    expect(diary.pages[DAY]!.items).toHaveLength(DIARY.maxItemsPerPage);
  });

  it('글을 쓰고 고칠 수 있고, 최대 글자 수를 넘으면 자르고, 비우면 그 글만 떼어진다', () => {
    const diary = createEmptyDiary();
    const t = addText(diary, DAY, '뭉치가 양말을 물고 왔다', 1, DIARY, id)!;
    addSticker(diary, DAY, 'sock', 1, 1, DIARY, id);
    setItemText(diary, DAY, t, '뭉치가 양말을 물고 도망갔다', 2, DIARY);
    expect(pageTexts(diary.pages[DAY])[0]!.text).toBe('뭉치가 양말을 물고 도망갔다');
    setItemText(diary, DAY, t, '가'.repeat(DIARY.textMaxLength + 20), 3, DIARY);
    expect([...pageTexts(diary.pages[DAY])[0]!.text]).toHaveLength(DIARY.textMaxLength);
    setItemText(diary, DAY, t, '   ', 4, DIARY);
    expect(pageTexts(diary.pages[DAY])).toHaveLength(0);
    expect(diary.pages[DAY]!.items).toHaveLength(1); // 스티커는 그대로
  });

  it('빈 글은 붙이지 않고 페이지도 만들지 않는다', () => {
    const diary = createEmptyDiary();
    expect(addText(diary, DAY, '  ', 1, DIARY, id)).toBeNull();
    expect(diary.pages).toEqual({});
  });

  it('물건을 다 떼고 속지도 기본이면 페이지가 정리된다. 속지를 바꾼 페이지는 남는다', () => {
    const diary = createEmptyDiary();
    const s = addSticker(diary, DAY, 'sun', 1, 1, DIARY, id)!;
    removeItem(diary, DAY, s, 2, DIARY);
    expect(diary.pages[DAY]).toBeUndefined();
    setPaper(diary, DAY, 'pink-dot', 3, DIARY);
    expect(diary.pages[DAY]).toMatchObject({ paper: 'pink-dot', items: [] });
    setPaper(diary, DAY, DIARY.defaultPaper, 4, DIARY);
    expect(diary.pages[DAY]).toBeUndefined();
  });

  it('사진 바꾸기: 너비·가운데·윗변·기울기는 그대로, 높이만 새 사진 비율로', () => {
    const diary = createEmptyDiary();
    const p = addPhoto(diary, DAY, 'p-1', PORTRAIT, 1, DIARY, id)!;
    const before = { ...findItem(diary.pages[DAY], p)!.layout };
    replacePhoto(diary, DAY, p, 'p-2', { width: 400, height: 400 }, 2, DIARY);
    const item = findItem(diary.pages[DAY], p)!;
    expect(item).toMatchObject({ photoId: 'p-2' });
    expect(item.layout.w).toBeCloseTo(before.w);
    expect(item.layout.x + item.layout.w / 2).toBeCloseTo(before.x + before.w / 2);
    expect(item.layout.y).toBe(before.y);
    expect(item.layout.rot).toBe(before.rot);
    expect(item.layout.h).toBeLessThan(before.h);
  });

  it('맨 위로 / 맨 아래로', () => {
    const diary = createEmptyDiary();
    const a = addPhoto(diary, DAY, 'p', PORTRAIT, 1, DIARY, id)!;
    const b = addTape(diary, DAY, 'pink-stripe', 0.2, 1, DIARY, id)!;
    const c = addSticker(diary, DAY, 'star', 1, 1, DIARY, id)!;
    reorderItem(diary, DAY, a, 'front', 2);
    expect(sortedItems(diary.pages[DAY]).map((i) => i.id)).toEqual([b, c, a]);
    reorderItem(diary, DAY, c, 'back', 3);
    expect(sortedItems(diary.pages[DAY]).map((i) => i.id)).toEqual([c, b, a]);
  });

  it('다이어리가 쓰는 사진 목록을 알 수 있다', () => {
    const diary = createEmptyDiary();
    addPhoto(diary, '2026-11-19', 'p-a', undefined, 1, DIARY, id);
    addPhoto(diary, DAY, 'p-b', undefined, 1, DIARY, id);
    addPhoto(diary, DAY, 'p-c', undefined, 1, DIARY, id);
    expect(photoRefs(diary)).toEqual([
      { dayKey: '2026-11-19', photoId: 'p-a' },
      { dayKey: DAY, photoId: 'p-b' },
      { dayKey: DAY, photoId: 'p-c' },
    ]);
  });
});

describe('옮기기·크기·기울기 (페이지 밖으로 사라지지 않게)', () => {
  const base: ItemLayout = { x: 0.3, y: 0.3, w: 0.3, h: 0.2, rot: 0, z: 1 };

  it('멀리 끌어도 페이지 안에 멈춘다', () => {
    for (const [dx, dy] of [
      [5, 0],
      [-5, 0],
      [0, 5],
      [0, -5],
      [3, -3],
    ]) {
      const l = transformLayout(base, { dx, dy }, 'sticker', DIARY);
      inside(l);
      expect(l.w).toBeCloseTo(base.w);
    }
  });

  it('키우고 줄여도 종류별 범위 안, 가로세로 비율은 그대로', () => {
    const big = transformLayout(base, { scale: 10 }, 'sticker', DIARY);
    expect(big.w).toBeCloseTo(DIARY.sizes.sticker.maxW);
    expect(big.h / big.w).toBeCloseTo(base.h / base.w);
    inside(big);
    const small = transformLayout(base, { scale: 0.01 }, 'sticker', DIARY);
    expect(small.w).toBeCloseTo(DIARY.sizes.sticker.minW);
    expect(small.h / small.w).toBeCloseTo(base.h / base.w);
    // 세로로 긴 사진은 높이가 페이지를 넘지 않게
    const tall = transformLayout({ ...base, w: 0.5, h: 0.6 }, { scale: 3 }, 'photo', DIARY);
    expect(tall.h).toBeLessThanOrEqual(1);
    inside(tall);
  });

  it('가운데를 기준으로 키우고, 기울기는 -180~180도로 정리한다', () => {
    const l = transformLayout(base, { scale: 1.5, rotate: 200 }, 'sticker', DIARY);
    expect(l.x + l.w / 2).toBeCloseTo(base.x + base.w / 2);
    expect(l.y + l.h / 2).toBeCloseTo(base.y + base.h / 2);
    expect(l.rot).toBeCloseTo(-160);
  });

  it('저장된 자리가 이상해도 바로잡는다', () => {
    inside(clampLayout({ x: -3, y: 9, w: 0.2, h: 0.2, rot: 720, z: 1 }, 'tape', DIARY));
  });

  it('기울인 채 모서리로 끌어도 기울어진 귀퉁이까지 페이지 안에 남는다', () => {
    const big: ItemLayout = { x: 0.2, y: 0.2, w: 0.7, h: 0.6, rot: 25, z: 1 };
    for (const [dx, dy] of [
      [5, 5],
      [-5, -5],
    ]) inside(transformLayout(big, { dx, dy, rotate: 10 }, 'photo', DIARY));
    // 기울인 모양이 페이지보다 크면 줄여서 넣는다
    const huge = transformLayout(big, { scale: 3, rotate: 20 }, 'photo', DIARY);
    inside(huge);
    expect(huge.h / huge.w).toBeCloseTo(big.h / big.w);
  });

  it('두 손가락: 벌린 만큼 키우고, 돌린 만큼 기울인다', () => {
    const c = pinchChange({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 200 });
    expect(c.scale).toBeCloseTo(2);
    expect(c.rotate).toBeCloseTo(90);
  });

  it('한 물건을 옮겨도 같은 페이지의 다른 물건과 다른 날짜 페이지는 바뀌지 않는다', () => {
    const diary = createEmptyDiary();
    const s = addSticker(diary, DAY, 'heart', 1, 1, DIARY, id)!;
    addTape(diary, DAY, 'sky-plain', 0.2, 1, DIARY, id);
    addSticker(diary, '2026-11-21', 'heart', 1, 1, DIARY, () => s); // 다른 날에 같은 id가 있어도
    const before: DiaryData = structuredClone(diary);
    const moved = transformLayout(findItem(diary.pages[DAY], s)!.layout, { dx: 0.2, dy: 0.1 }, 'sticker', DIARY);
    setItemLayout(diary, DAY, s, moved, 2, DIARY);
    expect(diary.pages['2026-11-21']).toEqual(before.pages['2026-11-21']);
    expect(diary.pages[DAY]!.items[1]).toEqual(before.pages[DAY]!.items[1]);
    expect(findItem(diary.pages[DAY], s)!.layout).toMatchObject({ x: moved.x, y: moved.y, z: 1 });
  });
});

describe('하루 첫 사진+글 기록 조건', () => {
  it('사진 1장 이상 + 글이 있어야 완료', () => {
    const diary = createEmptyDiary();
    expect(isEntryComplete(diary.pages[DAY], DIARY)).toBe(false);
    addPhoto(diary, DAY, 'p', PORTRAIT, 1, DIARY, id);
    addSticker(diary, DAY, 'star', 1, 1, DIARY, id);
    expect(isEntryComplete(diary.pages[DAY], DIARY)).toBe(false);
    addText(diary, DAY, '좋은 날', 2, DIARY, id);
    expect(isEntryComplete(diary.pages[DAY], DIARY)).toBe(true);
    removeItem(diary, DAY, pagePhotos(diary.pages[DAY])[0]!.id, 3, DIARY);
    expect(isEntryComplete(diary.pages[DAY], DIARY)).toBe(false);
  });
});

describe('사진 틀 크기 (잘린 사진도 다 보이게)', () => {
  const imageRatio = (box: { w: number; h: number }) => {
    const f = DIARY.photoFrame;
    return (box.h * DIARY.pageAspect - box.w * (f.top + f.bottom)) / (box.w * (1 - f.side * 2));
  };

  for (const [name, w, h] of [
    ['세로 게임 화면', 780, 1400],
    ['정사각형으로 자른 사진', 400, 400],
    ['가로로 길게 자른 사진', 700, 200],
    ['세로로 아주 길게 자른 사진', 160, 1400],
  ] as const) {
    it(`${name}: 틀 안 사진 칸이 사진과 같은 비율이고 최대 크기를 넘지 않는다`, () => {
      const box = fitPhotoBox(w, h, 0.5, 0.11, DIARY);
      expect(imageRatio(box)).toBeCloseTo(h / w, 5);
      expect(box.w).toBeLessThanOrEqual(DIARY.photoMax.w + 1e-9);
      expect(box.h).toBeLessThanOrEqual(DIARY.photoMax.h + 1e-9);
      expect(box.x + box.w / 2).toBeCloseTo(0.5);
      expect(box.y).toBe(0.11);
    });
  }

  it('사진을 키우거나 줄여도 틀 안 사진 비율은 그대로 (테두리도 같이 커진다)', () => {
    const box = fitPhotoBox(780, 1400, 0.5, 0.11, DIARY);
    const l = transformLayout({ ...box, rot: 0, z: 1 }, { scale: 0.5 }, 'photo', DIARY);
    expect(imageRatio(l)).toBeCloseTo(1400 / 780, 5);
  });
});

describe('다이어리 넘기기', () => {
  const diary = createEmptyDiary();
  addText(diary, '2026-11-15', 'a', 1, DIARY, id);
  addText(diary, '2026-11-18', 'b', 1, DIARY, id);

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
    expect(s.diaryReward).toEqual({ lastRewardDay: null });
  });

  it('버전 2 저장(다이어리 v0.1)의 사진·글 기록과 자리는 그대로 옮겨진다', () => {
    const v2Diary = {
      pages: {
        '2026-11-21': {
          dayKey: '2026-11-21',
          createdAt: 10,
          updatedAt: 20,
          paper: 'cream-grid',
          items: [
            { id: 'i-a', kind: 'photo', photoId: 'p-1', layout: { x: 0.24, y: 0.11, w: 0.52, h: 0.56, rot: -2, z: 1 } },
            { id: 'i-b', kind: 'text', text: '뭉치 첫 기록', layout: { x: 0.1, y: 0.71, w: 0.8, h: 0.24, rot: 0, z: 2 } },
          ],
        },
      },
    };
    const s = migrate({ version: 2, wallet: { sparkle: 40 }, diary: v2Diary }, 1);
    expect(s.version).toBe(3);
    expect(s.wallet.sparkle).toBe(40);
    expect(s.diary).toEqual(v2Diary);
    expect(s.diaryReward).toEqual({ lastRewardDay: null });
  });

  it('스티커·테이프·속지도 저장되고 다시 읽힌다', () => {
    const diary = createEmptyDiary();
    addPhoto(diary, DAY, 'p', PORTRAIT, 1, DIARY, id);
    addText(diary, DAY, '좋은 날', 1, DIARY, id);
    addSticker(diary, DAY, 'mungchi', 1, 1, DIARY, id);
    addTape(diary, DAY, 'beige-check', 0.2, 1, DIARY, id);
    setPaper(diary, DAY, 'white-lined', 1, DIARY);
    expect(readDiary(JSON.parse(JSON.stringify(diary)), DIARY.defaultPaper)).toEqual(diary);
  });

  it('깨진 페이지·모르는 물건·겹친 id만 빼고 나머지 기록은 살린다', () => {
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
              { id: 'd', kind: 'sticker' },
              { id: 'e', kind: 'sticker', stickerId: 'heart' },
              { id: 'a', kind: 'tape', tapeId: 'pink-stripe' },
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
    expect(page.items.map((i) => i.id)).toEqual(['a', 'b', 'e']);
    expect(pageTexts(page)[0]!.layout.w).toBeGreaterThan(0);
  });

  it('다이어리 서랍이 깨져 있어도 게임 저장 전체는 열린다', () => {
    const s = migrate({ version: 2, wallet: { sparkle: 3 }, diary: 'oops' }, 1);
    expect(s.wallet.sparkle).toBe(3);
    expect(s.diary).toEqual({ pages: {} });
  });
});
