import { describe, expect, it } from 'vitest';
import { Clock } from '../../src/core/clock';
import { createMemoryStorage } from '../../src/core/storage';

describe('게임 시계', () => {
  it('날짜 넘기기는 저장되어 새로고침 후에도 유지된다', () => {
    const storage = createMemoryStorage();
    const fixed = new Date(2026, 10, 20, 9, 0).getTime();
    const clock = new Clock(storage, () => fixed);
    expect(clock.dayKey()).toBe('2026-11-20');
    clock.advanceDays(1);
    expect(clock.dayKey()).toBe('2026-11-21');
    expect(new Clock(storage, () => fixed).dayKey()).toBe('2026-11-21');
    clock.resetOffset();
    expect(new Clock(storage, () => fixed).dayKey()).toBe('2026-11-20');
  });

  it('자정 직전과 직후는 다른 날이다', () => {
    const clock = new Clock();
    expect(clock.dayKey(new Date(2026, 10, 20, 23, 59).getTime())).toBe('2026-11-20');
    expect(clock.dayKey(new Date(2026, 10, 21, 0, 0).getTime())).toBe('2026-11-21');
  });
});
