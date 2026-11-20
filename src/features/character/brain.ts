import { BALANCE } from '../../data/balance';

/**
 * 뭉치의 머릿속. 화면과 상관없이 "지금 무엇을 할지"만 정한다.
 * 그래서 화면 없이도 자동 테스트할 수 있다.
 *
 * 행동은 두 종류다.
 * - 자율 행동: 아무도 건드리지 않을 때 스스로 고르는 행동 (가만히 있기, 짧게 이동하기, 혼자 놀기, 잠들기)
 * - 반응: 사용자 상호작용에 대한 행동 (지금은 쓰다듬기에 좋아하기 하나). 반응은 언제나 자율 행동보다 먼저다.
 *
 * 자연스러운 간격을 위한 규칙
 * 1) 한 행동은 정해진 시간 동안 계속한다. 매 순간 다시 고르지 않는다.
 * 2) 행동 하나가 끝나면 잠깐 멈춰 있다가(settle) 다음 행동을 고른다.
 * 3) 같은 행동은 정해진 횟수 이상 연달아 고르지 않는다.
 * 4) 잠, 놀이처럼 큰 행동은 끝난 뒤 한동안 다시 고르지 않는다 (cooldown).
 * 5) 켜자마자, 쓰다듬어진 직후에는 잠들지 않는다.
 */
export type AutoActivity = 'idle' | 'wander' | 'play' | 'sleep';
export type Reaction = 'happy';
export type Activity = AutoActivity | Reaction;
export type PlayProp = (typeof BALANCE.character.playProps)[number];

export const AUTO_ACTIVITIES: readonly AutoActivity[] = ['idle', 'wander', 'play', 'sleep'];

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
  /** 이 행동을 시작한 시각 */
  since: number;
  /** 이 행동을 끝낼 시각. wander는 도착하면 더 일찍 끝난다. */
  until: number;
  /** wander의 목적지 */
  target: Point | null;
  /** play에 쓰는 소품 */
  prop: PlayProp | null;
  /** 행동 사이의 잠깐 멈춤(또는 쓰다듬기 뒤 바라보기)이면 true. 연속 횟수 계산에서 빠진다. */
  settling: boolean;
  /** 최근에 스스로 고른 행동 (오래된 것 → 최근 것, 최대 5개) */
  history: AutoActivity[];
  /** 행동별로 마지막에 끝난 시각 (cooldown 계산용) */
  lastEnded: Partial<Record<AutoActivity, number>>;
  /** 이 시각 전에는 잠들지 않는다 */
  noSleepUntil: number;
}

/** 다음 행동을 고를 때 참고하는 상황. 나중 시스템이 판단에 쓸 수 있다. */
export interface Situation {
  now: number;
  /** 방금 끝난 행동 */
  previous: Activity;
  history: readonly AutoActivity[];
}

/**
 * 확장 지점: 행동 비중에 곱할 배율을 돌려주는 함수.
 * 친밀도, 기억, 장난감, 날씨 같은 이후 시스템은 이 함수를 하나씩 추가해서 성격을 바꾼다.
 * 예) 비 오는 날엔 잠 ×1.5, 장난감이 있으면 놀기 ×2, 친밀도가 높으면 가만히 있기(주인 바라보기) ×1.3
 * 0을 돌려주면 그 행동은 이번에 고르지 않는다.
 */
export type WeightModifier = (activity: AutoActivity, situation: Situation) => number;

export type Rng = () => number;

const C = BALANCE.character;
const HISTORY_SIZE = 5;
const between = (rng: Rng, [lo, hi]: readonly [number, number]) => lo + (hi - lo) * rng();
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function initialBrain(now: number): BrainState {
  return {
    activity: 'idle',
    since: now,
    until: now + C.behaviors.idle.durationMs[0],
    target: null,
    prop: null,
    settling: false,
    history: [],
    lastEnded: {},
    noSleepUntil: now + C.noSleepAfterStartMs,
  };
}

/** 지금 행동을 끝내며 기록을 남긴 상태 (다음 행동을 정하기 전 단계). */
function finishCurrent(brain: BrainState, now: number): BrainState {
  if (brain.activity === 'happy') return brain;
  return { ...brain, lastEnded: { ...brain.lastEnded, [brain.activity]: now } };
}

/** 같은 행동을 연달아 몇 번 골랐는지 */
function streakOf(history: readonly AutoActivity[], activity: AutoActivity): number {
  let n = 0;
  for (let i = history.length - 1; i >= 0 && history[i] === activity; i--) n++;
  return n;
}

/** 각 자율 행동의 이번 비중. 규칙상 고를 수 없는 행동은 0. */
export function weightsFor(brain: BrainState, now: number, modifiers: readonly WeightModifier[] = []): Record<AutoActivity, number> {
  const situation: Situation = { now, previous: brain.activity, history: brain.history };
  const out = {} as Record<AutoActivity, number>;
  for (const a of AUTO_ACTIVITIES) {
    const def = C.behaviors[a];
    let w: number = def.weight;
    const ended = brain.lastEnded[a];
    if (ended !== undefined && now - ended < def.cooldownMs) w = 0;
    if (streakOf(brain.history, a) >= def.maxInARow) w = 0;
    if (a === 'sleep' && now < brain.noSleepUntil) w = 0;
    for (const m of modifiers) w *= Math.max(0, m(a, situation));
    out[a] = Number.isFinite(w) ? w : 0;
  }
  return out;
}

/** 짧게 이동하기의 목적지: 지금 자리에서 가까운, 바닥 범위 안의 한 점. */
export function pickWanderTarget(from: Point, rng: Rng, area: Area): Point {
  const angle = rng() * Math.PI * 2;
  // 너무 짧으면 움직였는지 모르니 최대 거리의 절반 이상은 간다.
  const dist = C.wanderMaxDistance * (0.5 + 0.5 * rng());
  return {
    x: clamp(from.x + Math.cos(angle) * dist, area.minX, area.maxX),
    y: clamp(from.y + Math.sin(angle) * dist * 0.6, area.minY, area.maxY),
  };
}

function start(brain: BrainState, activity: AutoActivity, now: number, rng: Rng, from: Point, area: Area): BrainState {
  const def = C.behaviors[activity];
  return {
    ...brain,
    activity,
    since: now,
    until: now + between(rng, def.durationMs),
    target: activity === 'wander' ? pickWanderTarget(from, rng, area) : null,
    prop: activity === 'play' ? C.playProps[Math.floor(rng() * C.playProps.length) % C.playProps.length] : null,
    settling: false,
    history: [...brain.history, activity].slice(-HISTORY_SIZE),
  };
}

function settle(brain: BrainState, now: number, ms: readonly [number, number], rng: Rng): BrainState {
  return { ...brain, activity: 'idle', since: now, until: now + between(rng, ms), target: null, prop: null, settling: true };
}

/**
 * 지금 행동이 끝났을 때 다음 행동을 정한다.
 * 큰 행동 뒤에는 먼저 잠깐 멈추고, 멈춤이 끝나면 비중에 따라 하나를 고른다.
 */
export function decideNext(
  brain: BrainState,
  now: number,
  rng: Rng,
  from: Point,
  area: Area,
  modifiers: readonly WeightModifier[] = [],
): BrainState {
  const prev = brain.activity;
  const b = finishCurrent(brain, now);
  if (prev === 'happy') return settle(b, now, C.pet.attentiveMs, rng);
  if (prev !== 'idle') return settle(b, now, C.settleMs, rng);

  const weights = weightsFor(b, now, modifiers);
  const total = AUTO_ACTIVITIES.reduce((sum, a) => sum + weights[a], 0);
  if (total <= 0) return start(b, 'idle', now, rng, from, area);
  let roll = rng() * total;
  for (const a of AUTO_ACTIVITIES) {
    roll -= weights[a];
    if (roll < 0 && weights[a] > 0) return start(b, a, now, rng, from, area);
  }
  // 반올림 오차로 끝까지 왔을 때: 고를 수 있는 마지막 행동
  const last = [...AUTO_ACTIVITIES].reverse().find((a) => weights[a] > 0) ?? 'idle';
  return start(b, last, now, rng, from, area);
}

/** 시간이 지나 지금 행동이 끝났으면 다음 행동을 고른다. 아니면 그대로 둔다. */
export function tick(
  brain: BrainState,
  now: number,
  rng: Rng,
  from: Point,
  area: Area,
  modifiers: readonly WeightModifier[] = [],
): BrainState {
  if (now < brain.until) return brain;
  return decideNext(brain, now, rng, from, area, modifiers);
}

/** 목적지에 도착했다. 잠깐 멈춰 선다. */
export function arrived(brain: BrainState, now: number, rng: Rng): BrainState {
  if (brain.activity !== 'wander') return brain;
  return settle(finishCurrent(brain, now), now, C.settleMs, rng);
}

/**
 * 쓰다듬어졌다. 무엇을 하고 있었든(자는 중이어도) 멈추고 좋아한다.
 * 하던 행동은 끝난 것으로 기록되고, 좋아하기가 끝나면 그 자리에서 잠깐 주인을 바라본 뒤 다시 스스로 행동한다.
 * 계속 쓰다듬으면 좋아하는 시간이 늘어나 자율 행동이 끼어들지 않는다.
 */
export function petted(brain: BrainState, now: number): BrainState {
  const b = brain.activity === 'happy' ? brain : finishCurrent(brain, now);
  return {
    ...b,
    activity: 'happy',
    since: brain.activity === 'happy' ? brain.since : now,
    until: now + C.pet.happyMs,
    target: null,
    prop: null,
    settling: false,
    noSleepUntil: Math.max(b.noSleepUntil, now + C.pet.noSleepMs),
  };
}

/** 개발·테스트용: 정해진 행동을 바로 시작한다. */
export function force(brain: BrainState, activity: AutoActivity, now: number, rng: Rng, from: Point, area: Area): BrainState {
  return start(finishCurrent(brain, now), activity, now, rng, from, area);
}

/**
 * 낮잠. 평소에는 스스로 잠들지 않고(잠 비중 0), 앱을 나갔다 들어왔을 때나
 * 다이어리·조리를 하는 동안에만 이렇게 잠깐 잔다. 쓰다듬으면 바로 깬다.
 */
export function nap(brain: BrainState, now: number, rng: Rng): BrainState {
  if (brain.activity === 'sleep') return brain;
  return {
    ...finishCurrent(brain, now),
    activity: 'sleep',
    since: now,
    until: now + between(rng, C.nap.durationMs),
    target: null,
    prop: null,
    settling: false,
  };
}

/** 하던 행동을 그만두고 잠깐 멈춘다 (예: 앱에 돌아왔을 때 놀던 장난감이 치워졌다). */
export function calmDown(brain: BrainState, now: number, rng: Rng): BrainState {
  if (brain.activity === 'idle' || brain.activity === 'sleep') return brain;
  return settle(finishCurrent(brain, now), now, C.settleMs, rng);
}
