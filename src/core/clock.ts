import type { KeyValueStorage } from './storage';

const OFFSET_KEY = 'moongchi.dev.dayOffset';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 게임 시계. 게임 안의 모든 "지금"과 "오늘"은 여기서 가져온다.
 * 개발자 패널에서 날짜를 넘겨 "다음 날"을 테스트할 수 있다.
 */
export class Clock {
  private dayOffset: number;

  constructor(
    private readonly storage?: KeyValueStorage,
    private readonly realNow: () => number = () => Date.now(),
  ) {
    const saved = Number(storage?.get(OFFSET_KEY) ?? 0);
    this.dayOffset = Number.isFinite(saved) ? saved : 0;
  }

  now(): number {
    return this.realNow() + this.dayOffset * DAY_MS;
  }

  /** 기기 시간대 기준 날짜 문자열 (예: 2026-11-20). */
  dayKey(time: number = this.now()): string {
    const d = new Date(time);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  getDayOffset(): number {
    return this.dayOffset;
  }

  /** 개발용: 날짜를 n일 앞으로 넘긴다. */
  advanceDays(days: number): void {
    this.dayOffset += days;
    this.storage?.set(OFFSET_KEY, String(this.dayOffset));
  }

  resetOffset(): void {
    this.dayOffset = 0;
    this.storage?.remove(OFFSET_KEY);
  }
}
