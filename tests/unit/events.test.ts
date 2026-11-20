import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/core/events';

describe('이벤트 알림판', () => {
  it('한 기능이 오류를 내도 다른 기능은 알림을 받는다', () => {
    const bus = new EventBus();
    const ok = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    bus.on('pet:stroked', () => {
      throw new Error('고장');
    });
    bus.on('pet:stroked', ok);
    bus.emit('pet:stroked', { at: 1 });
    expect(ok).toHaveBeenCalledOnce();
  });
});
