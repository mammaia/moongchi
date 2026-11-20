import { BALANCE } from '../../data/balance';
import { MUNGCHI_SPOTS } from '../../data/room';
import { point } from '../room/perspective';
import type { Point, Rng } from './brain';
import type { GaitPose } from './gait';
import type { Face } from './playMotion';

/**
 * 가구 쓰기(침대에 올라가기, 책상 뒤에 숨기)의 동작 계산. 화면 없이 숫자만 계산해서 테스트할 수 있다.
 * 순서: 가구 앞까지 걸어가기(approach, 걷기 계산 재사용) → 들어가기(enter) → 머물기(stay) → 나오기(exit)
 */
const F = BALANCE.character.furniture;

export type FurnitureKind = 'climb' | 'hide';
export type FurniturePhase = 'enter' | 'stay' | 'exit';

export interface FurniturePlan {
  kind: FurnitureKind;
  /** 가구 앞 바닥 (여기까지는 평소처럼 걸어간다) */
  approach: Point;
  /** 가구 자리의 바닥 위치 */
  spot: Point;
  /** 가구 자리에서 바닥보다 올라간 높이 (침대 위, 화면 px) */
  spotLift: number;
  /** 숨었다가 빼꼼 내다보는 자리 */
  peek: Point;
  stayMs: number;
}

export interface FurnitureFrame {
  pos: Point;
  lift: number;
  pose: GaitPose;
  face: Face;
  /** 눈이 보는 쪽 (-1 왼쪽, 1 오른쪽) */
  look: number;
}

const floor = (p: { u: number; t: number }): Point => point(p.u, p.t);
const between = (rng: Rng, [lo, hi]: readonly [number, number]) => lo + (hi - lo) * rng();
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const at = (a: Point, b: Point, k: number): Point => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) });
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const pose = (hop = 0, tilt = 0, scaleX = 1, scaleY = 1): GaitPose => ({ hop, tilt, scaleX, scaleY });

export function planFurniture(kind: FurnitureKind, rng: Rng): FurniturePlan {
  if (kind === 'climb') {
    const s = MUNGCHI_SPOTS.bed;
    const spot = floor(s.on);
    return {
      kind,
      approach: floor(s.approach),
      spot,
      spotLift: spot.y - point(s.on.u, s.on.t, s.on.h).y,
      peek: spot,
      stayMs: between(rng, F.climb.stayMs),
    };
  }
  const s = MUNGCHI_SPOTS.desk;
  return { kind, approach: floor(s.approach), spot: floor(s.hide), spotLift: 0, peek: floor(s.peek), stayMs: between(rng, F.hide.stayMs) };
}

export function phaseMs(plan: FurniturePlan, phase: FurniturePhase): number {
  if (phase === 'stay') return plan.stayMs;
  if (plan.kind === 'climb') return F.climb.jumpMs;
  return phase === 'enter' ? F.hide.sneakMs : F.hide.sneakMs * 0.8;
}

/** 폴짝 뛰기: 웅크림(0~0.25) → 공중(0.25~0.85) → 착지(0.85~1) */
function jump(from: Point, fromLift: number, to: Point, toLift: number, t: number, facing: number): FurnitureFrame {
  if (t < 0.25) {
    const c = t / 0.25;
    return { pos: from, lift: fromLift, pose: pose(0, 0, 1 + 0.08 * c, 1 - 0.14 * c), face: 'normal', look: facing };
  }
  if (t < 0.85) {
    const j = (t - 0.25) / 0.6;
    return { pos: at(from, to, j), lift: lerp(fromLift, toLift, j) + Math.sin(j * Math.PI) * 22, pose: pose(0, facing * 6, 0.93, 1.1), face: 'open', look: facing };
  }
  const l = (t - 0.85) / 0.15;
  return { pos: to, lift: toLift, pose: pose(0, 0, 1 + 0.1 * (1 - l), 1 - 0.14 * (1 - l)), face: 'joy', look: facing };
}

/** phase를 시작하고 elapsedMs가 지났을 때의 모습 */
export function furnitureFrame(plan: FurniturePlan, phase: FurniturePhase, elapsedMs: number): FurnitureFrame {
  const t = clamp01(elapsedMs / phaseMs(plan, phase));
  const inward = plan.spot.x >= plan.approach.x ? 1 : -1;

  if (plan.kind === 'climb') {
    if (phase === 'enter') return jump(plan.approach, 0, plan.spot, plan.spotLift, t, inward);
    if (phase === 'exit') return jump(plan.spot, plan.spotLift, plan.approach, 0, t, -inward);
    // 침대 위에서 신나서 통통 (트램펄린처럼)
    const k = elapsedMs / F.climb.bounceMs;
    const air = Math.abs(Math.sin(k * Math.PI));
    const ground = Math.pow(1 - air, 3);
    return {
      pos: plan.spot,
      lift: plan.spotLift + air * F.climb.bouncePx,
      pose: pose(0, Math.sin(k * Math.PI) * 4, 1 + 0.08 * ground, 1 - 0.1 * ground + 0.04 * air),
      face: Math.floor(k) % 2 === 0 ? 'joy' : 'grin',
      look: 1,
    };
  }

  // 책상 뒤에 숨기
  if (phase === 'enter' || phase === 'exit') {
    const from = phase === 'enter' ? plan.approach : plan.spot;
    const to = phase === 'enter' ? plan.spot : plan.approach;
    const steps = 6;
    const air = Math.abs(Math.sin(t * steps * Math.PI));
    // 살금살금: 몸을 낮추고 작게 종종걸음
    return {
      pos: at(from, to, t),
      lift: air * 2,
      pose: pose(0, Math.sin(t * steps * Math.PI) * 3, 1.05, 0.92),
      face: phase === 'enter' ? 'normal' : 'grin',
      look: phase === 'enter' ? inward : -inward,
    };
  }
  // 숨어 있다가 주기마다 왼쪽으로 빼꼼
  const cycle = elapsedMs % F.hide.peekEveryMs;
  const hiddenMs = F.hide.peekEveryMs - F.hide.peekMs;
  if (cycle < hiddenMs) {
    return { pos: plan.spot, lift: 0, pose: pose(0, 0, 1.04, 0.94), face: 'normal', look: -inward };
  }
  const p = Math.sin(((cycle - hiddenMs) / F.hide.peekMs) * Math.PI);
  return { pos: at(plan.spot, plan.peek, p), lift: 0, pose: pose(0, -inward * 8 * p, 1, 1), face: p > 0.5 ? 'grin' : 'normal', look: -inward };
}
