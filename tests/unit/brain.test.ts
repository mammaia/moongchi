import { describe, expect, it } from 'vitest';
import { arrived, decideNext, initialBrain, petted, tick } from '../../src/features/character/brain';

const area = { minX: 100, maxX: 200, minY: 500, maxY: 600 };
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('뭉치 행동', () => {
  it('확률에 따라 쉬기, 돌아다니기, 자기를 고른다', () => {
    expect(decideNext(0, seq(0.1, 0.5), area).activity).toBe('idle');
    expect(decideNext(0, seq(0.6, 0.5, 0.5), area).activity).toBe('wander');
    expect(decideNext(0, seq(0.95, 0.5), area).activity).toBe('sleep');
  });

  it('돌아다닐 목적지는 항상 바닥 범위 안이다', () => {
    for (let i = 0; i < 100; i++) {
      const b = decideNext(0, seq(0.6, Math.random(), Math.random()), area);
      expect(b.target!.x).toBeGreaterThanOrEqual(100);
      expect(b.target!.x).toBeLessThanOrEqual(200);
      expect(b.target!.y).toBeGreaterThanOrEqual(500);
      expect(b.target!.y).toBeLessThanOrEqual(600);
    }
  });

  it('행동 시간이 끝나기 전에는 바꾸지 않는다', () => {
    const b = initialBrain(0);
    expect(tick(b, b.until - 1, Math.random, area)).toBe(b);
  });

  it('자고 있어도 쓰다듬으면 깨서 좋아한다', () => {
    const sleeping = decideNext(0, seq(0.95, 0.5), area);
    expect(petted(sleeping, 10).activity).toBe('happy');
  });

  it('목적지에 도착하면 멈춰 선다', () => {
    const w = decideNext(0, seq(0.6, 0.5, 0.5), area);
    expect(arrived(w, 5).activity).toBe('idle');
  });
});
