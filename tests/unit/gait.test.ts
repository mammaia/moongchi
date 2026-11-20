import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import { gaitPose, walkSpeedFactor } from '../../src/features/character/gait';

const W = BALANCE.character.walk;

describe('뭉치 걸음걸이', () => {
  it('출발 전에는 갈 방향을 먼저 보고 움직이지 않는다', () => {
    expect(walkSpeedFactor(0, 0, 60)).toBe(0);
    expect(walkSpeedFactor(W.lookFirstMs - 1, 0, 60)).toBe(0);
    expect(walkSpeedFactor(W.lookFirstMs, 0, 60)).toBeGreaterThan(0);
  });

  it('천천히 출발해서 중간엔 제 속도, 도착할 때 다시 느려진다', () => {
    const t = W.lookFirstMs + W.accelMs;
    const start = walkSpeedFactor(W.lookFirstMs + 50, 0, 80);
    const middle = walkSpeedFactor(t, 40, 80);
    const end = walkSpeedFactor(t, 79, 80);
    expect(start).toBeLessThan(middle);
    expect(end).toBeLessThan(middle);
    expect(middle).toBe(1);
    // 아주 느려지긴 해도 멈추지는 않아서 반드시 도착한다
    expect(end).toBeGreaterThan(0);
  });

  it('걸음마다 좌우로 번갈아 뒤뚱거리고, 땅에 닿을 땐 살짝 납작해진다', () => {
    const left = gaitPose(W.stepPx * 0.5, 1);
    const right = gaitPose(W.stepPx * 1.5, 1);
    expect(Math.sign(left.tilt)).toBe(-Math.sign(right.tilt));
    expect(left.hop).toBeCloseTo(W.hopPx);
    const ground = gaitPose(W.stepPx, 1);
    expect(ground.hop).toBeCloseTo(0);
    expect(ground.scaleY).toBeLessThan(1);
  });

  it('느릴수록 동작도 작아진다 (멈춰 있으면 원래 모양)', () => {
    const still = gaitPose(W.stepPx * 0.5, 0);
    expect(still.hop).toBe(0);
    expect(still.tilt).toBe(0);
    expect(still.scaleY).toBe(1);
    expect(gaitPose(W.stepPx * 0.5, 0.5).hop).toBeLessThan(gaitPose(W.stepPx * 0.5, 1).hop);
  });
});
