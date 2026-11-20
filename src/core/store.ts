import type { SaveData } from './saveSchema';

type Listener = (state: Readonly<SaveData>) => void;

/**
 * 게임 상태 저장소. 게임의 현재 상태는 여기 한 곳에만 있다.
 * 바꿀 때는 update()를 쓰고, 바뀌면 구독자에게 알리고 자동 저장을 예약한다.
 */
export class GameStore {
  private state: SaveData;
  private listeners = new Set<Listener>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    initial: SaveData,
    private readonly persist: (state: SaveData) => void,
    private readonly saveDelayMs = 300,
  ) {
    this.state = initial;
  }

  get(): Readonly<SaveData> {
    return this.state;
  }

  update(change: (draft: SaveData) => void): void {
    const draft = structuredClone(this.state);
    change(draft);
    this.state = draft;
    for (const listener of [...this.listeners]) {
      try {
        listener(this.state);
      } catch (error) {
        console.error('[store] 구독자 오류', error);
      }
    }
    this.scheduleSave();
  }

  /** 상태를 통째로 바꾼다 (저장 지우기 등). */
  replace(next: SaveData): void {
    this.update((draft) => Object.assign(draft, structuredClone(next)));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 예약된 저장을 지금 바로 한다 (앱을 닫을 때). */
  flush(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    this.persist(this.state);
  }

  private scheduleSave(): void {
    if (this.saveDelayMs <= 0) {
      this.persist(this.state);
      return;
    }
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), this.saveDelayMs);
  }
}
