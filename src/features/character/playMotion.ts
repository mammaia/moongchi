import { BALANCE } from '../../data/balance';
import type { Area, PlayProp, Point, Rng } from './brain';
import type { GaitPose } from './gait';

/**
 * 강아지처럼 놀기의 동작 계산. 화면 없이 숫자만 계산해서 테스트할 수 있다.
 * 놀기 동안 "다음 동작 고르기 → 그 동작을 0~1 진행도로 그리기"를 반복한다.
 */
const P = BALANCE.character.play;

export type PlayMoveKind = 'fetch' | 'bow' | 'pounce' | 'toss' | 'shake';

export interface PlayMove {
  kind: PlayMoveKind;
  durationMs: number;
  /** 뭉치 출발·도착 위치 */
  from: Point;
  to: Point;
  /** 장난감 출발·도착 위치 */
  toyFrom: Point;
  toyTo: Point;
  /** 장난감이 있는 쪽 (-1 왼쪽, 1 오른쪽) */
  facing: 1 | -1;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const clampTo = (p: Point, a: Area, margin = 0): Point => ({
  x: clamp(p.x, a.minX - margin, a.maxX + margin),
  y: clamp(p.y, a.minY - margin, a.maxY + margin),
});
const between = (rng: Rng, [lo, hi]: readonly [number, number]) => lo + (hi - lo) * rng();
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 장난감 옆, 뭉치가 놀기 좋은 자리 (장난감의 왼쪽 또는 오른쪽, 뭉치가 있던 쪽) */
export function spotBeside(m: Point, toy: Point, area: Area): Point {
  const side = m.x <= toy.x ? -1 : 1;
  return clampTo({ x: toy.x + side * P.reachPx, y: toy.y - 4 }, area);
}

/** 장난감을 처음 꺼낼 때 둘 자리: 뭉치 옆, 방 가운데 쪽 */
export function placeNewToy(m: Point, area: Area): Point {
  const midX = (area.minX + area.maxX) / 2;
  const side = m.x <= midX ? 1 : -1;
  return clampTo({ x: m.x + side * P.reachPx, y: m.y + 4 }, area, P.toyMarginPx);
}

/** 다음 놀이 동작을 고른다. 장난감이 멀면 먼저 쫓아가고, 같은 동작은 연달아 하지 않는다. */
export function planPlayMove(rng: Rng, m: Point, toy: Point, area: Area, prop: PlayProp, last: PlayMoveKind | null): PlayMove {
  const facing: 1 | -1 = toy.x >= m.x ? 1 : -1;
  const base = { from: m, toyFrom: toy, facing };
  const dist = Math.hypot(toy.x - m.x, toy.y - m.y);
  if (dist > P.reachPx * 1.25) {
    const to = spotBeside(m, toy, area);
    const runDist = Math.hypot(to.x - m.x, to.y - m.y);
    return { ...base, kind: 'fetch', durationMs: Math.max(250, (runDist / P.runSpeed) * 1000), to, toyTo: toy };
  }

  const weights = Object.entries(P.moves).map(([k, v]) => {
    let w: number = v.weight;
    if (k === last) w = 0;
    if (k === 'shake' && prop === 'sock') w *= 1.5; // 양말은 물고 흔들기 좋다
    return [k as Exclude<PlayMoveKind, 'fetch'>, w] as const;
  });
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let roll = rng() * total;
  let kind: Exclude<PlayMoveKind, 'fetch'> = 'bow';
  for (const [k, w] of weights) {
    roll -= w;
    if (roll < 0 && w > 0) {
      kind = k;
      break;
    }
  }
  const ms = P.moves[kind].ms;

  if (kind === 'pounce') {
    // 장난감 쪽으로 폴짝, 장난감은 같은 방향으로 툭 튕겨 나간다.
    const dx = toy.x - m.x || facing;
    const dy = toy.y - m.y;
    const len = Math.hypot(dx, dy) || 1;
    const to = clampTo({ x: toy.x - (dx / len) * P.reachPx * 0.5, y: toy.y - (dy / len) * P.reachPx * 0.5 }, area);
    const knock = between(rng, P.knockPx);
    const toyTo = clampTo(
      { x: toy.x + (dx / len) * knock, y: toy.y + (dy / len) * knock * 0.5 + (rng() - 0.5) * 12 },
      area,
      P.toyMarginPx,
    );
    return { ...base, kind, durationMs: ms, to, toyTo };
  }
  if (kind === 'toss') {
    // 물어서 휙 던진다. 주로 앞쪽(장난감이 있던 쪽)으로.
    const angle = (facing > 0 ? 0 : Math.PI) + (rng() - 0.5) * 1.6;
    const d = between(rng, P.tossPx);
    const toyTo = clampTo({ x: m.x + Math.cos(angle) * d, y: m.y + Math.sin(angle) * d * 0.5 }, area, P.toyMarginPx);
    return { ...base, kind, durationMs: ms, to: m, toyTo };
  }
  if (kind === 'shake') {
    // 물고 흔든 뒤 발 앞에 떨어뜨린다.
    const toyTo = clampTo({ x: m.x + facing * P.reachPx * 0.8, y: m.y + 5 }, area, P.toyMarginPx);
    return { ...base, kind, durationMs: ms, to: m, toyTo };
  }
  return { ...base, kind: 'bow', durationMs: ms, to: m, toyTo: toy };
}

/** 장난감을 물었을 때의 위치 (뭉치 입 앞) */
export const mouthOf = (m: Point, facing: 1 | -1): Point => ({ x: m.x + facing * P.reachPx * 0.75, y: m.y + 10 });

export interface PlayFrame {
  mungchi: Point;
  toy: Point;
  /** 장난감이 바닥에서 뜬 높이 */
  toyLift: number;
  /** 장난감 회전 (도, 이 동작 동안 더해지는 양) */
  toySpin: number;
  pose: GaitPose;
}

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const pose = (hop = 0, tilt = 0, scaleX = 1, scaleY = 1): GaitPose => ({ hop, tilt, scaleX, scaleY });

/** 동작 진행도 t(0~1)에서의 모습 */
export function playFrame(move: PlayMove, t: number): PlayFrame {
  t = clamp(t, 0, 1);
  const f = move.facing;
  const at = (a: Point, b: Point, k: number): Point => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) });

  switch (move.kind) {
    case 'fetch': {
      // 신나서 콩콩 뛰어간다
      const k = easeInOut(t);
      const steps = Math.max(2, Math.round(move.durationMs / 140));
      const air = Math.abs(Math.sin(t * steps * Math.PI));
      return { mungchi: at(move.from, move.to, k), toy: move.toyFrom, toyLift: 0, toySpin: 0, pose: pose(air * 5, Math.sin(t * steps * Math.PI) * 4, 1, 1 + air * 0.04) };
    }
    case 'bow': {
      // 앞으로 납작 엎드리고 엉덩이(몸 전체)를 좌우로 흔든다
      const down = Math.sin(Math.min(1, t / 0.25) * Math.PI / 2) * (t > 0.8 ? (1 - t) / 0.2 : 1);
      const wiggle = Math.sin(t * Math.PI * 8) * 5 * down;
      return { mungchi: move.from, toy: move.toyFrom, toyLift: 0, toySpin: 0, pose: pose(0, f * 10 * down + wiggle, 1 + 0.1 * down, 1 - 0.14 * down) };
    }
    case 'pounce': {
      // 웅크렸다(0~0.25) 폴짝(0.25~0.75) 착지(0.75~1). 착지할 때 장난감이 튕겨 나간다.
      if (t < 0.25) {
        const c = t / 0.25;
        return { mungchi: move.from, toy: move.toyFrom, toyLift: 0, toySpin: 0, pose: pose(0, f * 4 * c, 1 + 0.08 * c, 1 - 0.12 * c) };
      }
      if (t < 0.75) {
        const j = (t - 0.25) / 0.5;
        return { mungchi: at(move.from, move.to, j), toy: move.toyFrom, toyLift: 0, toySpin: 0, pose: pose(Math.sin(j * Math.PI) * 16, f * 8, 0.94, 1.08) };
      }
      const l = (t - 0.75) / 0.25;
      const k = easeOut(l);
      return { mungchi: move.to, toy: at(move.toyFrom, move.toyTo, k), toyLift: Math.sin(l * Math.PI) * 6, toySpin: 220 * k * f, pose: pose(0, f * 3 * (1 - l), 1 + 0.1 * (1 - l), 1 - 0.12 * (1 - l)) };
    }
    case 'toss': {
      // 물고(0~0.3) 고개를 휙(0.3~0.4) 하면 장난감이 포물선으로 날아간다(0.35~1). 뭉치는 신나서 폴짝.
      const mouth = mouthOf(move.from, f);
      if (t < 0.3) {
        const k = easeOut(t / 0.3);
        return { mungchi: move.from, toy: at(move.toyFrom, mouth, k), toyLift: 10 * k, toySpin: 0, pose: pose(0, f * 6 * k, 1.04, 0.96) };
      }
      const fly = clamp((t - 0.35) / 0.65, 0, 1);
      const flick = t < 0.45 ? Math.sin(((t - 0.3) / 0.15) * Math.PI) : 0;
      const hop = t > 0.5 ? Math.sin(clamp((t - 0.5) / 0.3, 0, 1) * Math.PI) * 7 : 0;
      return {
        mungchi: move.from,
        toy: at(mouth, move.toyTo, fly),
        toyLift: 10 * (1 - fly) + Math.sin(fly * Math.PI) * 42,
        toySpin: 400 * fly * f,
        pose: pose(hop, -f * 14 * flick, 1, 1 + 0.05 * flick),
      };
    }
    case 'shake': {
      // 물고(0~0.15) 도리도리(0.15~0.85) 떨어뜨리기(0.85~1)
      const mouth = mouthOf(move.from, f);
      if (t < 0.15) {
        const k = easeOut(t / 0.15);
        return { mungchi: move.from, toy: at(move.toyFrom, mouth, k), toyLift: 8 * k, toySpin: 0, pose: pose(0, f * 5 * k, 1, 1) };
      }
      if (t < 0.85) {
        const s = (t - 0.15) / 0.7;
        const shake = Math.sin(s * Math.PI * 10) * 13 * (1 - s * 0.4);
        return { mungchi: move.from, toy: { x: mouth.x + Math.sin(s * Math.PI * 10) * 7, y: mouth.y }, toyLift: 8, toySpin: shake * 2, pose: pose(Math.abs(shake) * 0.15, shake, 1, 1) };
      }
      const d = (t - 0.85) / 0.15;
      return { mungchi: move.from, toy: at(mouth, move.toyTo, d), toyLift: 8 * (1 - d), toySpin: 0, pose: pose(0, 0, 1, 1) };
    }
  }
}
