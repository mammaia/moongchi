import type { Clock } from './core/clock';
import type { EventBus } from './core/events';
import type { PhotoLibrary } from './core/photoLibrary';
import type { SaveSystem } from './core/saveSystem';
import type { GameStore } from './core/store';

/** 모든 기능이 함께 쓰는 공통 기반 묶음. */
export interface GameContext {
  bus: EventBus;
  store: GameStore;
  clock: Clock;
  saves: SaveSystem;
  /** 사진 보관함 (기기 IndexedDB). 진행 상황 저장과 따로 있다. 주인: 사진 기능 */
  photos: PhotoLibrary;
}
