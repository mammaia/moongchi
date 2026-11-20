import { BALANCE } from '../../data/balance';
import type { GameContext } from '../../context';
import { applyStroke } from './sparkle';

/** 경제 기능을 게임에 끼운다. 쓰다듬기 알림을 받아 스파클을 준다. */
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
}
