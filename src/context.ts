import type { Clock } from './core/clock';
import type { EventBus } from './core/events';
import type { SaveSystem } from './core/saveSystem';
import type { GameStore } from './core/store';

/** 모든 기능이 함께 쓰는 공통 기반 묶음. */
export interface GameContext {
  bus: EventBus;
  store: GameStore;
  clock: Clock;
  saves: SaveSystem;
}
