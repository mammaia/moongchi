import { BALANCE } from '../../data/balance';
import type { GameContext } from '../../context';
import { applyDiaryEntry, applyStroke } from './sparkle';

/** 경제 기능을 게임에 끼운다. 쓰다듬기·다이어리 기록 알림을 받아 스파클을 준다. */
export function installEconomy({ bus, store, clock }: GameContext): void {
  bus.on('pet:stroked', () => {
    let granted = 0;
    store.update((draft) => {
      granted = applyStroke(draft, clock.dayKey(), BALANCE.petting.firstPetOfDaySparkle);
    });
    if (granted > 0) {
      bus.emit('sparkle:changed', {
        balance: store.get().wallet.sparkle,
        delta: granted,
        reason: 'first-pet-of-day',
      });
    }
  });

  // 다이어리: 하루 첫 사진+글 기록. [가정] 오늘 페이지만 센다.
  bus.on('diary:entry-recorded', ({ dayKey }) => {
    const today = clock.dayKey();
    if (dayKey !== today || store.get().diaryReward.lastRewardDay === today) return;
    let granted = 0;
    store.update((draft) => {
      granted = applyDiaryEntry(draft, today, BALANCE.diary.firstEntryOfDaySparkle);
    });
    if (granted > 0) {
      store.flush();
      bus.emit('sparkle:changed', { balance: store.get().wallet.sparkle, delta: granted, reason: 'first-diary-of-day' });
    }
  });
}
