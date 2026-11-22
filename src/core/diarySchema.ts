/**
 * 다이어리 저장 모양. 진행 상황 저장(GameStore)의 diary 서랍에 들어간다. 주인: 다이어리 기능.
 *
 * 사진은 복사하지 않고 사진 보관함의 id만 적는다(참조). 사진이 앨범에서 지워져도
 * 이 기록은 그대로 두고, 그릴 때 "지워진 사진"으로 보여준다. 그래서 다이어리가 깨지지 않는다.
 *
 * 페이지에 붙인 것은 모두 items 목록에 하나씩 독립된 물건으로 들어간다:
 * 사진(photo), 글(text), 스티커(sticker), 마스킹테이프(tape).
 * 새 종류를 더할 때: 아래 인터페이스 하나 + ITEM_READERS에 읽는 법 하나 + 다이어리 화면에 그리는 법.
 */

/** 페이지에 대한 비율(0~1)로 적은 자리. rot = 기울기(도). z = 겹칠 때 위아래 순서(클수록 위). */
export interface ItemLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  z: number;
}

export interface PhotoItem {
  id: string;
  kind: 'photo';
  /** 사진 보관함(IndexedDB)의 사진 id */
  photoId: string;
  layout: ItemLayout;
}

export interface TextItem {
  id: string;
  kind: 'text';
  text: string;
  layout: ItemLayout;
}

export interface StickerItem {
  id: string;
  kind: 'sticker';
  /** 꾸미기 목록(data/diaryDecor.ts STICKERS)의 id */
  stickerId: string;
  layout: ItemLayout;
}

export interface TapeItem {
  id: string;
  kind: 'tape';
  /** 꾸미기 목록(data/diaryDecor.ts TAPES)의 id */
  tapeId: string;
  layout: ItemLayout;
}

export type DiaryItem = PhotoItem | TextItem | StickerItem | TapeItem;
export type DiaryItemKind = DiaryItem['kind'];
export type ItemOf<K extends DiaryItemKind> = Extract<DiaryItem, { kind: K }>;

export interface DiaryPage {
  /** 이 페이지의 날짜 (예: 2026-11-20). 하루에 한 페이지. */
  dayKey: string;
  createdAt: number;
  updatedAt: number;
  /** 속지 종이 종류 (data/diaryDecor.ts PAPERS의 id) */
  paper: string;
  items: DiaryItem[];
}

export interface DiaryData {
  /** 날짜 → 페이지. 기록이 있는 날만 들어 있다. */
  pages: Record<string, DiaryPage>;
}

export const createEmptyDiary = (): DiaryData => ({ pages: {} });

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const finite = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

function readLayout(raw: unknown): ItemLayout {
  const l = isObject(raw) ? raw : {};
  return {
    x: finite(l.x, 0),
    y: finite(l.y, 0),
    w: Math.max(0.01, finite(l.w, 0.5)),
    h: Math.max(0.01, finite(l.h, 0.5)),
    rot: finite(l.rot, 0),
    z: finite(l.z, 0),
  };
}

type Base = { id: string; layout: ItemLayout };
const str = (v: unknown): v is string => typeof v === 'string';

/** 종류별로 저장된 값을 읽는 법. 필요한 칸이 없으면 null(그 물건만 버린다). */
const ITEM_READERS: { [K in DiaryItemKind]: (raw: Record<string, unknown>, base: Base) => ItemOf<K> | null } = {
  photo: (r, b) => (str(r.photoId) ? { ...b, kind: 'photo', photoId: r.photoId } : null),
  text: (r, b) => (str(r.text) ? { ...b, kind: 'text', text: r.text } : null),
  sticker: (r, b) => (str(r.stickerId) ? { ...b, kind: 'sticker', stickerId: r.stickerId } : null),
  tape: (r, b) => (str(r.tapeId) ? { ...b, kind: 'tape', tapeId: r.tapeId } : null),
};

function readItem(raw: unknown): DiaryItem | null {
  if (!isObject(raw) || typeof raw.id !== 'string' || typeof raw.kind !== 'string') return null;
  const reader = ITEM_READERS[raw.kind as DiaryItemKind] as ((r: Record<string, unknown>, b: Base) => DiaryItem | null) | undefined;
  // 모르는 종류는 버린다 (깨진 기록 때문에 다이어리 전체가 안 열리는 일을 막기 위해)
  return reader ? reader(raw, { id: raw.id, layout: readLayout(raw.layout) }) : null;
}

/** 어떤 값이 와도 올바른 다이어리 모양으로 고친다. 깨진 페이지·물건만 빼고 나머지는 살린다. */
export function readDiary(raw: unknown, defaultPaper: string): DiaryData {
  const pages: Record<string, DiaryPage> = {};
  const rawPages = isObject(raw) && isObject(raw.pages) ? raw.pages : {};
  for (const [key, value] of Object.entries(rawPages)) {
    if (!DAY_KEY.test(key) || !isObject(value)) continue;
    const items = Array.isArray(value.items) ? value.items.map(readItem).filter((i): i is DiaryItem => i !== null) : [];
    // 같은 id가 두 번 나오면 뒤의 것은 버린다 (한 물건을 고칠 때 다른 물건이 같이 바뀌지 않게)
    const seen = new Set<string>();
    pages[key] = {
      dayKey: key,
      createdAt: finite(value.createdAt, 0),
      updatedAt: finite(value.updatedAt, 0),
      paper: typeof value.paper === 'string' ? value.paper : defaultPaper,
      items: items.filter((i) => !seen.has(i.id) && !!seen.add(i.id)),
    };
  }
  return { pages };
}
