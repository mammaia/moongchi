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
   * 물건이 연 기능 화면(예: 책상 → 다이어리)을 다 써서 방으로 돌아가고 싶다.
   * 방 화면이 듣고 확대를 풀며 'hotspot:closed'를 알린다.
   */
  'hotspot:done': { id: string };
  /** 다이어리 페이지 기록이 바뀌었다 (사진 붙이기/떼기, 글 쓰기). */
  'diary:changed': { dayKey: string };
  /**
   * 뭉치의 행동이 바뀌었다. 기억, 사진, 친밀도 같은 이후 기능이 듣고 쓸 수 있다.
   * settling = 행동 사이에 잠깐 멈춰 있는 중.
   */
  'mungchi:activity': { activity: MungchiActivity; previous: MungchiActivity; settling: boolean; at: number };
  /** 앱을 뒤로 보냈다가(다른 앱, 화면 끔) 다시 돌아왔다. awayMs = 밖에 있던 시간 */
  'app:resumed': { awayMs: number };
  /** 사진을 앨범에 저장했다 / 지웠다. 이후 다이어리가 듣고 붙여 둔 사진을 정리할 수 있다. */
  'photo:saved': { id: string; takenAt: number; dayKey: string };
  'photo:deleted': { id: string; dayKey: string };
  /** 개발자 패널: 뭉치에게 이 행동을 바로 시키기 */
  'dev:force-activity': { activity: MungchiAutoActivity };
};

/** 뭉치가 스스로 하는 행동: 가만히 있기, 짧게 이동하기, 혼자 놀기, 잠들기, 침대에 올라가기, 책상 뒤에 숨기 */
export type MungchiAutoActivity = 'idle' | 'wander' | 'play' | 'sleep' | 'climb' | 'hide';
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
