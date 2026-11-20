import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, createNewSave, migrate } from '../../src/core/saveSchema';
import { SAVE_KEY, SaveSystem } from '../../src/core/saveSystem';
import { createMemoryStorage } from '../../src/core/storage';
import { GameStore } from '../../src/core/store';

describe('저장', () => {
  it('저장이 없으면 새 게임으로 시작한다', () => {
    const saves = new SaveSystem(createMemoryStorage());
    const s = saves.load(123);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.wallet.sparkle).toBe(0);
    expect(s.progress.createdAt).toBe(123);
  });

  it('쓴 그대로 다시 읽힌다', () => {
    const storage = createMemoryStorage();
    const saves = new SaveSystem(storage);
    const s = createNewSave(1);
    s.wallet.sparkle = 42;
    s.petting.lastRewardDay = '2026-11-20';
    saves.write(s);
    expect(new SaveSystem(storage).load(2)).toEqual(s);
  });

  it('깨진 저장 파일이 있어도 멈추지 않고 새로 시작한다', () => {
    const saves = new SaveSystem(createMemoryStorage({ [SAVE_KEY]: '{not json' }));
    expect(saves.load(5).wallet.sparkle).toBe(0);
  });

  it('빠진 칸과 이상한 값은 기본값으로 고친다', () => {
    const s = migrate({ version: 1, wallet: { sparkle: -5 }, petting: { lastRewardDay: 7 } }, 9);
    expect(s.wallet.sparkle).toBe(0);
    expect(s.petting.lastRewardDay).toBeNull();
    expect(s.character).toEqual({ x: null, y: null });
  });

  it('상태를 바꾸면 자동으로 저장된다', () => {
    const storage = createMemoryStorage();
    const saves = new SaveSystem(storage);
    const store = new GameStore(saves.load(0), (st) => saves.write(st), 0);
    store.update((d) => void (d.wallet.sparkle = 7));
    expect(saves.load(0).wallet.sparkle).toBe(7);
  });
});
