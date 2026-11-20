import { migrate, type SaveData } from './saveSchema';
import type { KeyValueStorage } from './storage';

export const SAVE_KEY = 'moongchi.save';

/** 저장 파일을 읽고 쓰는 곳. 형식 변환은 saveSchema가 맡는다. */
export class SaveSystem {
  constructor(private readonly storage: KeyValueStorage) {}

  load(now: number): SaveData {
    const text = this.storage.get(SAVE_KEY);
    if (!text) return migrate(null, now);
    try {
      return migrate(JSON.parse(text), now);
    } catch {
      console.warn('[save] 저장 파일이 깨져 새로 시작합니다.');
      return migrate(null, now);
    }
  }

  write(data: SaveData): void {
    this.storage.set(SAVE_KEY, JSON.stringify(data));
  }

  clear(): void {
    this.storage.remove(SAVE_KEY);
  }
}
