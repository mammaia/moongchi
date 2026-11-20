import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import {
  arrived,
  decideNext,
  force,
  initialBrain,
  petted,
  pickWanderTarget,
  tick,
  weightsFor,
  type BrainState,
} from '../../src/features/character/brain';

const area = { minX: 100, maxX: 200, minY: 500, maxY: 600 };
const here = { x: 150, y: 550 };
const B = BALANCE.character.behaviors;
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};
/** 테스트마다 같은 결과가 나오는 가짜 난수 */
const seeded = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

/** 잠들 수 있고 아무 제약 없는, "막 멈춤이 끝난" 상태 */
const ready = (now = 1_000_000): BrainState => ({ ...initialBrain(0), until: now, noSleepUntil: 0 });

/** 화면 없이 뭉치의 하루를 빠르게 돌려 본다. wander는 2초 뒤 도착했다고 친다. */
function simulate(ms: number, rng = seeded(7)) {
  let b = initialBrain(0);
  const log: BrainState[] = [b];
  for (let t = 0; t <= ms; t += 250) {
    let next = tick(b, t, rng, here, area);
    if (next.activity === 'wander' && t - next.since >= 2000) next = arrived(next, t, rng);
    if (next !== b) log.push(next);
    b = next;
  }
  return log;
}

describe('뭉치 자율 행동: 고르기', () => {
  it('네 가지 행동(가만히, 짧게 이동, 혼자 놀기, 잠들기)을 모두 고를 수 있다', () => {
    const w = weightsFor(ready(), 1_000_000);
    expect(w.idle).toBeGreaterThan(0);
    expect(w.wander).toBeGreaterThan(0);
    expect(w.play).toBeGreaterThan(0);
    expect(w.sleep).toBeGreaterThan(0);
    const seen = new Set(simulate(30 * 60_000).map((b) => b.activity));
    expect([...seen].sort()).toEqual(['idle', 'play', 'sleep', 'wander']);
  });

  it('행동 시간이 끝나기 전에는 바꾸지 않는다', () => {
    const b = initialBrain(0);
    expect(tick(b, b.until - 1, Math.random, here, area)).toBe(b);
  });

  it('큰 행동이 끝나면 바로 다음 행동으로 가지 않고 잠깐 멈춘다', () => {
    const playing = force(ready(), 'play', 0, seq(0.5), here, area);
    const next = decideNext(playing, playing.until, seq(0.5), here, area);
    expect(next.activity).toBe('idle');
    expect(next.settling).toBe(true);
    const ms = next.until - next.since;
    expect(ms).toBeGreaterThanOrEqual(BALANCE.character.settleMs[0]);
    expect(ms).toBeLessThanOrEqual(BALANCE.character.settleMs[1]);
  });

  it('행동마다 정해진 시간 범위 동안 계속한다', () => {
    for (const a of ['idle', 'play', 'sleep'] as const) {
      const b = force(ready(), a, 0, seq(0.3), here, area);
      expect(b.until - b.since).toBeGreaterThanOrEqual(B[a].durationMs[0]);
      expect(b.until - b.since).toBeLessThanOrEqual(B[a].durationMs[1]);
    }
  });

  it('같은 행동을 정해진 횟수보다 많이 연달아 고르지 않는다', () => {
    const b = { ...ready(), history: Array(B.wander.maxInARow).fill('wander') };
    expect(weightsFor(b, 1_000_000).wander).toBe(0);
    // 시뮬레이션 전체에서도 지켜진다
    const chosen = simulate(60 * 60_000).slice(1).filter((s) => !s.settling && s.activity !== 'happy');
    let streak = 1;
    for (let i = 1; i < chosen.length; i++) {
      streak = chosen[i].activity === chosen[i - 1].activity ? streak + 1 : 1;
      expect(streak).toBeLessThanOrEqual(B[chosen[i].activity as 'idle'].maxInARow);
    }
  });

  it('잠에서 깬 뒤 한동안은 다시 잠들지 않는다', () => {
    const sleeping = force(ready(), 'sleep', 0, seq(0.5), here, area);
    const woke = decideNext(sleeping, sleeping.until, seq(0.5), here, area);
    expect(weightsFor(woke, sleeping.until + 1000).sleep).toBe(0);
    // 그사이 다른 행동을 했다면, 쉬는 시간이 지난 뒤엔 다시 잘 수 있다
    const later = { ...woke, history: [...woke.history, 'idle' as const] };
    expect(weightsFor(later, sleeping.until + B.sleep.cooldownMs).sleep).toBeGreaterThan(0);
  });

  it('게임을 켜자마자는 잠들지 않는다', () => {
    const b = initialBrain(0);
    expect(weightsFor(b, 1000).sleep).toBe(0);
    expect(weightsFor(b, BALANCE.character.noSleepAfterStartMs).sleep).toBeGreaterThan(0);
  });

  it('30분 동안 행동이 너무 자주 바뀌지 않는다 (평균 3초 이상)', () => {
    const log = simulate(30 * 60_000);
    expect((30 * 60_000) / log.length).toBeGreaterThan(3000);
  });
});

describe('뭉치 자율 행동: 짧게 이동하기', () => {
  it('목적지는 항상 바닥 범위 안이고, 멀리 가지 않는다', () => {
    const rng = seeded(3);
    for (let i = 0; i < 200; i++) {
      const t = pickWanderTarget(here, rng, area);
      expect(t.x).toBeGreaterThanOrEqual(100);
      expect(t.x).toBeLessThanOrEqual(200);
      expect(t.y).toBeGreaterThanOrEqual(500);
      expect(t.y).toBeLessThanOrEqual(600);
      expect(Math.hypot(t.x - here.x, t.y - here.y)).toBeLessThanOrEqual(BALANCE.character.wanderMaxDistance);
    }
  });

  it('목적지에 도착하면 멈춰 선다', () => {
    const w = force(ready(), 'wander', 0, seq(0.5), here, area);
    const a = arrived(w, 5, seq(0.5));
    expect(a.activity).toBe('idle');
    expect(a.settling).toBe(true);
  });
});

describe('뭉치 자율 행동: 혼자 놀기', () => {
  it('놀 때는 임시 소품(휴지심 또는 양말)을 하나 고른다', () => {
    const p = force(ready(), 'play', 0, seq(0.1), here, area);
    expect(BALANCE.character.playProps).toContain(p.prop);
  });

  it('놀고 나면 한동안 다시 놀지 않는다', () => {
    const p = force(ready(), 'play', 0, seq(0.5), here, area);
    const after = decideNext(p, p.until, seq(0.5), here, area);
    expect(weightsFor(after, p.until + 1000).play).toBe(0);
  });
});

describe('뭉치 자율 행동: 쓰다듬기와 충돌하지 않기', () => {
  it('자고 있어도 쓰다듬으면 깨서 좋아한다', () => {
    const sleeping = force(ready(), 'sleep', 0, seq(0.5), here, area);
    const h = petted(sleeping, 10);
    expect(h.activity).toBe('happy');
    expect(h.lastEnded.sleep).toBe(10);
  });

  it('놀거나 걷는 중에도 쓰다듬으면 멈추고 좋아한다', () => {
    for (const a of ['play', 'wander'] as const) {
      const h = petted(force(ready(), a, 0, seq(0.5), here, area), 10);
      expect(h.activity).toBe('happy');
      expect(h.target).toBeNull();
      expect(h.prop).toBeNull();
    }
  });

  it('계속 쓰다듬는 동안은 자율 행동이 끼어들지 않는다', () => {
    let b = petted(ready(0), 0);
    for (let t = 400; t <= 10_000; t += 500) {
      b = tick(b, t, Math.random, here, area);
      expect(b.activity).toBe('happy');
      b = petted(b, t);
    }
  });

  it('쓰다듬기가 끝나면 잠깐 주인을 바라본 뒤 다시 스스로 행동한다', () => {
    const h = petted(ready(0), 0);
    const look = tick(h, h.until, seq(0.5), here, area);
    expect(look.activity).toBe('idle');
    expect(look.settling).toBe(true);
    const next = tick(look, look.until, seq(0.5), here, area);
    expect(next.settling).toBe(false);
  });

  it('쓰다듬어진 직후에는 잠들지 않는다', () => {
    const h = petted(ready(0), 0);
    expect(weightsFor(h, 1000).sleep).toBe(0);
    expect(weightsFor(h, BALANCE.character.pet.noSleepMs).sleep).toBeGreaterThan(0);
  });
});

describe('뭉치 자율 행동: 확장 지점', () => {
  it('나중 시스템(날씨 등)이 배율로 행동 비중을 바꿀 수 있다', () => {
    const rainy = (a: string) => (a === 'sleep' ? 3 : 1);
    const base = weightsFor(ready(), 1_000_000);
    const withRain = weightsFor(ready(), 1_000_000, [rainy]);
    expect(withRain.sleep).toBe(base.sleep * 3);
    expect(withRain.idle).toBe(base.idle);
  });

  it('배율 0이면 그 행동은 고르지 않는다', () => {
    const noPlay = (a: string) => (a === 'play' ? 0 : 1);
    for (let i = 0; i < 50; i++) {
      const b = decideNext(ready(), 1_000_000, Math.random, here, area, [noPlay]);
      expect(b.activity).not.toBe('play');
    }
  });
});
