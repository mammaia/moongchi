import Phaser from 'phaser';
import type { GameContext } from '../../context';
import type { MungchiActivity } from '../../core/events';
import { BALANCE } from '../../data/balance';
import { MUNGCHI_FLOOR } from '../../data/room';
import { point } from '../room/perspective';
import { MungchiView } from './MungchiView';
import { gaitPose, walkSpeedFactor } from './gait';
import {
  arrived,
  force,
  initialBrain,
  petted,
  tick,
  type Activity,
  type Area,
  type AutoActivity,
  type BrainState,
  type WeightModifier,
} from './brain';

/** 뭉치가 스스로 돌아다닐 수 있는 바닥 범위 (가구와 겹치지 않는 가운데). */
export const WANDER_AREA: Area = (() => {
  const a = point(MUNGCHI_FLOOR.u[0], MUNGCHI_FLOOR.t[0]);
  const b = point(MUNGCHI_FLOOR.u[1], MUNGCHI_FLOOR.t[1]);
  return { minX: a.x, maxX: b.x, minY: a.y, maxY: b.y };
})();

const inside = (area: Area, x: number | null, y: number | null): boolean =>
  x !== null && y !== null && x >= area.minX && x <= area.maxX && y >= area.minY && y <= area.maxY;

// brain의 행동 이름과 이벤트의 행동 이름이 어긋나면 여기서 타입 오류가 난다.
const _sameNames: MungchiActivity = 'idle' as Activity;
void _sameNames;

/**
 * 뭉치 기능. 머리(brain)가 정한 행동을 그림(view)에 옮기고,
 * 쓰다듬기를 감지해 'pet:stroked'를 알린다. 스파클 계산은 경제 기능이 한다.
 */
export class MungchiController {
  readonly view: MungchiView;
  private brain: BrainState;
  private lastStrokeAt = -Infinity;
  private frozen = false;
  /** 행동 비중을 바꾸는 확장 지점. 친밀도·기억·장난감·날씨가 생기면 여기에 추가한다. */
  private readonly modifiers: WeightModifier[] = [];
  private shown: { activity: Activity; settling: boolean } | null = null;
  /** 지금 걷는 길 (출발점과 출발 시각). 행동이 바뀌면 새로 잡는다. */
  private trip: { from: { x: number; y: number }; since: number } | null = null;

  constructor(scene: Phaser.Scene, private readonly ctx: GameContext) {
    const saved = ctx.store.get().character;
    const start = inside(WANDER_AREA, saved.x, saved.y)
      ? { x: saved.x as number, y: saved.y as number }
      : { x: (WANDER_AREA.minX + WANDER_AREA.maxX) / 2, y: (WANDER_AREA.minY + WANDER_AREA.maxY) / 2 };
    this.view = new MungchiView(scene, start.x, start.y);
    this.brain = initialBrain(ctx.clock.now());
    this.syncView();

    const c = this.view.container;
    c.on('pointerdown', () => this.stroke());
    c.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown) this.stroke();
    });

    ctx.bus.on('sparkle:changed', ({ delta, reason }) => {
      if (delta > 0 && reason === 'first-pet-of-day') this.view.burstSparkles();
    });
    ctx.bus.on('dev:force-activity', ({ activity }) => this.forceActivity(activity));
  }

  /** 행동 비중 배율을 추가한다. 되돌리는 함수를 돌려준다. */
  addModifier(modifier: WeightModifier): () => void {
    this.modifiers.push(modifier);
    return () => {
      const i = this.modifiers.indexOf(modifier);
      if (i >= 0) this.modifiers.splice(i, 1);
    };
  }

  /** 테스트용: 뭉치를 제자리에 멈춘다. */
  setFrozen(value: boolean): void {
    this.frozen = value;
    const now = this.ctx.clock.now();
    this.brain = value ? { ...initialBrain(now), until: Infinity } : initialBrain(now);
    this.shown = null;
    this.syncView();
  }

  /** 개발·테스트용: 정해진 행동을 바로 시작한다. 멈춤 상태면 그 행동이 끝난 뒤 다시 가만히 멈춘다. */
  forceActivity(activity: AutoActivity): void {
    const now = this.ctx.clock.now();
    this.brain = force(this.brain, activity, now, Math.random, this.position, WANDER_AREA);
    this.syncView();
  }

  get activity(): Activity {
    return this.brain.activity;
  }

  get settling(): boolean {
    return this.brain.settling;
  }

  private get position() {
    return { x: this.view.x, y: this.view.y };
  }

  update(deltaMs: number): void {
    const now = this.ctx.clock.now();
    if (!this.frozen) {
      this.brain = tick(this.brain, now, Math.random, this.position, WANDER_AREA, this.modifiers);
    } else if (now >= this.brain.until) {
      // 테스트용 멈춤: 하던 행동이 끝나면 스스로 고르지 않고 가만히 있는다.
      this.brain = { ...this.brain, activity: 'idle', since: now, until: Infinity, target: null, prop: null, settling: false };
    }

    if (this.brain.activity === 'wander' && this.brain.target) {
      this.walk(deltaMs, now);
    }
    this.syncView();
    this.view.update(deltaMs);
  }

  private walk(deltaMs: number, now: number): void {
    const target = this.brain.target!;
    if (!this.trip || this.trip.since !== this.brain.since) {
      this.trip = { from: this.position, since: this.brain.since };
    }
    const { x, y } = this.view;
    const dx = target.x - x;
    const dy = target.y - y;
    const dist = Math.hypot(dx, dy);
    const total = Math.hypot(target.x - this.trip.from.x, target.y - this.trip.from.y);
    const traveled = Math.max(0, total - dist);
    const speed = walkSpeedFactor(now - this.trip.since, traveled, total);
    const step = (BALANCE.character.walkSpeed * speed * deltaMs) / 1000;
    if (dist < 0.5 || (speed > 0 && dist <= step)) {
      this.view.setPosition(target.x, target.y);
      this.brain = arrived(this.brain, now, Math.random);
      this.ctx.store.update((d) => {
        d.character.x = Math.round(this.view.x);
        d.character.y = Math.round(this.view.y);
      });
    } else {
      this.view.setPosition(x + (dx / dist) * step, y + (dy / dist) * step);
      this.view.walkPose(gaitPose(traveled, speed), dx / dist);
    }
  }

  /** 머리의 행동이 바뀌었으면 그림을 바꾸고 다른 기능에 알린다. */
  private syncView(): void {
    const { activity, settling, prop } = this.brain;
    const prev = this.shown;
    if (prev && prev.activity === activity && prev.settling === settling) return;
    // 계속 쓰다듬는 중(좋아하기 → 좋아하기)에는 다시 그리지 않는다.
    if (!prev || prev.activity !== activity) this.view.setActivity(activity, prop);
    this.shown = { activity, settling };
    this.ctx.bus.emit('mungchi:activity', {
      activity,
      previous: prev?.activity ?? activity,
      settling,
      at: this.ctx.clock.now(),
    });
  }

  private stroke(): void {
    const now = this.ctx.clock.now();
    if (now - this.lastStrokeAt < BALANCE.petting.strokeCooldownMs) return;
    this.lastStrokeAt = now;
    this.brain = petted(this.brain, now);
    this.syncView();
    this.view.playHappy();
    this.ctx.bus.emit('pet:stroked', { at: now });
  }
}
