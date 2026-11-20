/**
 * 기기 저장소를 감싼 얇은 층. 테스트에서는 메모리 저장소로 바꿔 끼운다.
 * 시크릿 모드 등에서 저장소 접근이 막혀도 게임이 멈추지 않도록 모든 접근을 감싼다.
 */
export interface KeyValueStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export function createBrowserStorage(): KeyValueStorage {
  return {
    get(key) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch (error) {
        console.warn('[storage] 저장 실패', error);
      }
    },
    remove(key) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* 무시 */
      }
    },
  };
}

export function createMemoryStorage(initial: Record<string, string> = {}): KeyValueStorage {
  const data = new Map(Object.entries(initial));
  return {
    get: (key) => data.get(key) ?? null,
    set: (key, value) => void data.set(key, value),
    remove: (key) => void data.delete(key),
  };
}
