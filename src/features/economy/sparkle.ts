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
