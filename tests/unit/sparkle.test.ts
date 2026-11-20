import { describe, expect, it } from 'vitest';
import { createNewSave } from '../../src/core/saveSchema';
import { applyStroke, isPetRewardAvailable } from '../../src/features/economy/sparkle';

describe('쓰다듬기 보상 [확정: 하루 첫 쓰다듬기만]', () => {
  it('그날 첫 쓰다듬기에 스파클을 준다', () => {
    const s = createNewSave(0);
    expect(applyStroke(s, '2026-11-20', 10)).toBe(10);
    expect(s.wallet.sparkle).toBe(10);
    expect(s.petting.lastRewardDay).toBe('2026-11-20');
  });

  it('같은 날 두 번째부터는 쓰다듬기는 되지만 스파클은 없다', () => {
    const s = createNewSave(0);
    applyStroke(s, '2026-11-20', 10);
    for (let i = 0; i < 50; i++) expect(applyStroke(s, '2026-11-20', 10)).toBe(0);
    expect(s.wallet.sparkle).toBe(10);
    expect(s.petting.totalStrokes).toBe(51);
  });

  it('다음 날이 되면 다시 첫 보상을 받는다', () => {
    const s = createNewSave(0);
    applyStroke(s, '2026-11-20', 10);
    expect(isPetRewardAvailable(s, '2026-11-21')).toBe(true);
    expect(applyStroke(s, '2026-11-21', 10)).toBe(10);
    expect(s.wallet.sparkle).toBe(20);
  });
});
