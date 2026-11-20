import { BALANCE } from '../../data/balance';

/**
 * 뭉치의 머릿속. 화면과 상관없이 "지금 무엇을 할지"만 정한다.
 * 그래서 화면 없이도 자동 테스트할 수 있다.
 */
export type Activity = 'idle' | 'wander' | 'sleep' | 'happy';

export interface Point {
  x: number;
  y: number;
}

export interface Area {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface BrainState {
  activity: Activity;
  /** 이 행동을 끝낼 시각. wander는 도착하면 끝난다. */
  until: number;
  target: Point | null;
}

export type Rng = () => number;

const C = BALANCE.character;
const between = (rng: Rng, [lo, hi]: readonly [number, number]) => lo + (hi - lo) * rng();

export function initialBrain(now: number): BrainState {
  return { activity: 'idle', until: now + C.idleMs[0], target: null };
}

export function decideNext(now: number, rng: Rng, area: Area): BrainState {
  const roll = rng();
  if (roll < C.choice.idle) {
    return { activity: 'idle', until: now + between(rng, C.idleMs), target: null };
  }
  if (roll < C.choice.idle + C.choice.wander) {
    const target = {
      x: area.minX + (area.maxX - area.minX) * rng(),
      y: area.minY + (area.maxY - area.minY) * rng(),
    };
    // 도착 신호를 못 받아도 멈추지 않게 넉넉한 제한 시간을 둔다.
    return { activity: 'wander', until: now + 20000, target };
  }
  return { activity: 'sleep', until: now + between(rng, C.sleepMs), target: null };
}

/** 시간이 지나 지금 행동이 끝났으면 다음 행동을 고른다. */
export function tick(brain: BrainState, now: number, rng: Rng, area: Area): BrainState {
  if (now < brain.until) return brain;
  return decideNext(now, rng, area);
}

/** 목적지에 도착했다. 잠깐 멍하니 서 있는다. */
export function arrived(brain: BrainState, now: number): BrainState {
  if (brain.activity !== 'wander') return brain;
  return { activity: 'idle', until: now + C.idleMs[0], target: null };
}

/** 쓰다듬어졌다. 자고 있었어도 깨서 좋아한다. */
export function petted(_brain: BrainState, now: number): BrainState {
  return { activity: 'happy', until: now + C.happyMs, target: null };
}
