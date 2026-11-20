import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import { placeNewToy, planPlayMove, playFrame, type PlayMoveKind } from '../../src/features/character/playMotion';

const area = { minX: 100, maxX: 260, minY: 500, maxY: 620 };
const P = BALANCE.character.play;
const seeded = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};
const inside = (p: { x: number; y: number }, margin = 0) =>
  p.x >= area.minX - margin && p.x <= area.maxX + margin && p.y >= area.minY - margin && p.y <= area.maxY + margin;

/** 놀기를 화면 없이 n번 동작시켜 본다 */
function simulate(n: number, prop: 'sock' | 'tissue-roll' = 'sock') {
  const rng = seeded(11);
  let m = { x: 180, y: 560 };
  let toy = placeNewToy(m, area);
  let last: PlayMoveKind | null = null;
  const moves = [];
  for (let i = 0; i < n; i++) {
    const move = planPlayMove(rng, m, toy, area, prop, last);
    moves.push(move);
    m = move.to;
    toy = move.toyTo;
    last = move.kind;
  }
  return moves;
}

describe('강아지처럼 놀기', () => {
  it('여러 가지 동작(엎드려 흔들기, 덮치기, 던지기, 물고 흔들기, 쫓아가기)을 섞어서 한다', () => {
    const kinds = new Set(simulate(200).map((m) => m.kind));
    expect([...kinds].sort()).toEqual(['bow', 'fetch', 'pounce', 'shake', 'toss']);
  });

  it('같은 동작을 연달아 하지 않는다', () => {
    const moves = simulate(200);
    for (let i = 1; i < moves.length; i++) {
      if (moves[i].kind !== 'fetch') expect(moves[i].kind).not.toBe(moves[i - 1].kind);
    }
  });

  it('장난감이 멀리 가면 먼저 쫓아간다', () => {
    const m = { x: 110, y: 560 };
    const move = planPlayMove(seeded(1), m, { x: 240, y: 560 }, area, 'sock', null);
    expect(move.kind).toBe('fetch');
    expect(Math.hypot(move.to.x - 240, move.to.y - 560)).toBeLessThanOrEqual(P.reachPx + 5);
  });

  it('뭉치와 장난감은 방 밖으로 나가지 않는다', () => {
    for (const move of simulate(300, 'tissue-roll')) {
      expect(inside(move.to)).toBe(true);
      expect(inside(move.toyTo, P.toyMarginPx)).toBe(true);
    }
  });

  it('동작이 끝나면 계획한 자리에 정확히 도착한다', () => {
    for (const move of simulate(60)) {
      const end = playFrame(move, 1);
      expect(end.mungchi.x).toBeCloseTo(move.to.x);
      expect(end.mungchi.y).toBeCloseTo(move.to.y);
      expect(end.toy.x).toBeCloseTo(move.toyTo.x);
      expect(end.toy.y).toBeCloseTo(move.toyTo.y);
      expect(end.toyLift).toBeCloseTo(0);
    }
  });

  it('던진 장난감은 공중으로 떴다가 떨어진다', () => {
    const toss = simulate(200).find((m) => m.kind === 'toss')!;
    expect(playFrame(toss, 0.7).toyLift).toBeGreaterThan(20);
    expect(playFrame(toss, 1).toyLift).toBeCloseTo(0);
  });

  it('놀 때 표정이 바뀐다 (물 때 앙, 덮칠 때 오!, 신나면 헤헤)', () => {
    const moves = simulate(200);
    const faces = new Set<string>();
    for (const m of moves) for (let t = 0; t <= 1; t += 0.05) faces.add(playFrame(m, t).face);
    expect([...faces].sort()).toEqual(['bite', 'grin', 'joy', 'normal', 'open']);
    const shake = moves.find((m) => m.kind === 'shake')!;
    expect(playFrame(shake, 0.5).face).toBe('bite');
    const pounce = moves.find((m) => m.kind === 'pounce')!;
    expect(playFrame(pounce, 0.5).face).toBe('open');
  });
});
