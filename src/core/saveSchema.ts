/**
 * 저장 파일의 모양.
 * 서랍(필드)마다 주인 기능이 하나씩 있다. 새 기능이 서랍을 추가할 때는
 * 1) SAVE_VERSION을 올리고 2) migrations에 이전 버전 → 새 버전 변환을 추가한다.
 * 그래야 업데이트 후에도 기존 플레이어의 저장이 그대로 열린다.
 */
import { DIARY } from '../data/diary';
import { createEmptyDiary, readDiary, type DiaryData } from './diarySchema';

export const SAVE_VERSION = 3;

export interface SaveData {
  version: typeof SAVE_VERSION;
  /** 주인: 경제 */
  wallet: { sparkle: number };
  /** 주인: 경제 (쓰다듬기 보상) */
  petting: { lastRewardDay: string | null; totalStrokes: number };
  /** 주인: 캐릭터 */
  character: { x: number | null; y: number | null };
  /** 주인: 진행 */
  progress: { createdAt: number; lastSeenAt: number };
  /** 주인: 다이어리. 사진은 id만 적는다 (사진 자체는 사진 보관함에). */
  diary: DiaryData;
  /** 주인: 경제 (다이어리 하루 첫 기록 보상) */
  diaryReward: { lastRewardDay: string | null };
}

export function createNewSave(now: number): SaveData {
  return {
    version: SAVE_VERSION,
    wallet: { sparkle: 0 },
    petting: { lastRewardDay: null, totalStrokes: 0 },
    character: { x: null, y: null },
    progress: { createdAt: now, lastSeenAt: now },
    diary: createEmptyDiary(),
    diaryReward: { lastRewardDay: null },
  };
}

/** 버전 n 저장을 n+1로 바꾸는 함수들. 예: migrations[1] = (v1) => v2 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const migrations: Record<number, (old: any) => any> = {
  // 1 → 2: 다이어리 서랍이 생겼다. 기존 기록은 그대로, 빈 다이어리를 더한다.
  1: (old) => ({ ...old, version: 2, diary: createEmptyDiary() }),
  // 2 → 3: 다이어리 v0.2 (꾸미기). 페이지 기록(사진·글과 자리)은 모양이 같아서 그대로 쓰고,
  // 다이어리 첫 기록 보상 서랍을 더한다. 스티커·테이프는 새 종류라 옛 기록에는 없다.
  2: (old) => ({ ...old, version: 3, diaryReward: { lastRewardDay: null } }),
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * 어떤 데이터가 들어와도 올바른 최신 저장 모양으로 만든다.
 * 깨진 저장은 새 게임으로, 옛 버전은 변환 후, 빠진 칸은 기본값으로 채운다.
 */
export function migrate(raw: unknown, now: number): SaveData {
  if (!isObject(raw) || typeof raw.version !== 'number') return createNewSave(now);
  if (raw.version > SAVE_VERSION) {
    console.warn('[save] 더 새로운 버전의 저장입니다. 읽을 수 있는 부분만 읽습니다.');
  }
  let data: Record<string, unknown> = raw;
  while (typeof data.version === 'number' && data.version < SAVE_VERSION) {
    const step = migrations[data.version];
    if (!step) return createNewSave(now);
    data = step(data);
  }

  const base = createNewSave(now);
  const wallet = isObject(data.wallet) ? data.wallet : {};
  const petting = isObject(data.petting) ? data.petting : {};
  const character = isObject(data.character) ? data.character : {};
  const progress = isObject(data.progress) ? data.progress : {};
  const diaryReward = isObject(data.diaryReward) ? data.diaryReward : {};

  return {
    version: SAVE_VERSION,
    wallet: { sparkle: Math.max(0, Math.floor(num(wallet.sparkle, base.wallet.sparkle))) },
    petting: {
      lastRewardDay: typeof petting.lastRewardDay === 'string' ? petting.lastRewardDay : null,
      totalStrokes: Math.max(0, Math.floor(num(petting.totalStrokes, 0))),
    },
    character: { x: numOrNull(character.x), y: numOrNull(character.y) },
    progress: {
      createdAt: num(progress.createdAt, base.progress.createdAt),
      lastSeenAt: num(progress.lastSeenAt, base.progress.lastSeenAt),
    },
    diary: readDiary(data.diary, DIARY.defaultPaper),
    diaryReward: { lastRewardDay: typeof diaryReward.lastRewardDay === 'string' ? diaryReward.lastRewardDay : null },
  };
}
