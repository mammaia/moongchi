/**
 * 이벤트 알림판.
 * 기능끼리는 서로의 코드를 직접 부르지 않고, 여기로 "이런 일이 있었다"를 알린다.
 * 한 기능의 처리에서 오류가 나도 다른 기능은 계속 동작하도록 각 처리를 따로 감싼다.
 */
export type GameEvents = {
  /** 플레이어가 뭉치를 한 번 쓰다듬었다. */
  'pet:stroked': { at: number };
  /** 스파클 잔액이 바뀌었다. */
  'sparkle:changed': { balance: number; delta: number; reason: SparkleReason };
  /** 방 안의 물건을 눌러 자세히 보기를 열었다/닫았다. */
  'hotspot:opened': { id: string };
  'hotspot:closed': { id: string };
  /**
   * 뭉치의 행동이 바뀌었다. 기억, 사진, 친밀도 같은 이후 기능이 듣고 쓸 수 있다.
   * settling = 행동 사이에 잠깐 멈춰 있는 중.
   */
  'mungchi:activity': { activity: MungchiActivity; previous: MungchiActivity; settling: boolean; at: number };
  /** 개발자 패널: 뭉치에게 이 행동을 바로 시키기 */
  'dev:force-activity': { activity: MungchiAutoActivity };
};

/** 뭉치가 스스로 하는 행동: 가만히 있기, 짧게 이동하기, 혼자 놀기, 잠들기 */
export type MungchiAutoActivity = 'idle' | 'wander' | 'play' | 'sleep';
/** 스스로 하는 행동 + 사용자에 대한 반응(쓰다듬기에 좋아하기) */
export type MungchiActivity = MungchiAutoActivity | 'happy';

export type SparkleReason = 'first-pet-of-day' | 'dev';

type Handler<P> = (payload: P) => void;

export class EventBus<E extends Record<string, unknown> = GameEvents> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(type: K, handler: Handler<E[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as Handler<never>);
    return () => set!.delete(handler as Handler<never>);
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const handler of [...set]) {
      try {
        (handler as Handler<E[K]>)(payload);
      } catch (error) {
        console.error(`[events] '${String(type)}' 처리 중 오류`, error);
      }
    }
  }
}
