import type { SaveData } from '../../core/saveSchema';

/**
 * 쓰다듬기 한 번을 처리한다. [확정] 쓰다듬기는 무제한, 스파클은 하루 첫 번만.
 * @returns 이번에 받은 스파클 (0이면 보상 없음)
 */
export function applyStroke(draft: SaveData, today: string, rewardAmount: number): number {
  draft.petting.totalStrokes += 1;
  if (draft.petting.lastRewardDay === today) return 0;
  draft.petting.lastRewardDay = today;
  draft.wallet.sparkle += rewardAmount;
  return rewardAmount;
}

export function isPetRewardAvailable(state: Readonly<SaveData>, today: string): boolean {
  return state.petting.lastRewardDay !== today;
}

/**
 * 다이어리 사진+글 기록 완료를 처리한다. [확정] 하루 첫 기록에만 스파클.
 * [가정] "오늘" 페이지 기록만 센다 (지난 페이지를 고쳐서 매일 보상을 받는 일 방지). 그 판단은 부르는 쪽에서 한다.
 * @returns 이번에 받은 스파클 (0이면 보상 없음)
 */
export function applyDiaryEntry(draft: SaveData, today: string, rewardAmount: number): number {
  if (draft.diaryReward.lastRewardDay === today) return 0;
  draft.diaryReward.lastRewardDay = today;
  draft.wallet.sparkle += rewardAmount;
  return rewardAmount;
}

export function isDiaryRewardAvailable(state: Readonly<SaveData>, today: string): boolean {
  return state.diaryReward.lastRewardDay !== today;
}
