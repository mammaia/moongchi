import Phaser from 'phaser';
import type { GameContext } from '../../context';
import { BALANCE } from '../../data/balance';
import { point } from '../room/perspective';
import { MungchiView } from './MungchiView';
import { arrived, initialBrain, petted, tick, type Area, type BrainState } from './brain';

/** 뭉치가 돌아다닐 수 있는 바닥 범위 (가구와 겹치지 않는 가운데). */
export const WANDER_AREA: Area = (() => {
  const a = point(0.42, 0.34);
  const b = point(0.58, 0.72);
  return { minX: a.x, maxX: b.x, minY: a.y, maxY: b.y };
})();

const inside = (area: Area, x: number | null, y: number | null): boolean =>
  x !== null && y !== null && x >= area.minX && x <= area.maxX && y >= area.minY && y <= area.maxY;

/**
 * 뭉치 기능. 머리(brain)가 정한 행동을 그림(view)에 옮기고,
 * 쓰다듬기를 감지해 'pet:stroked'를 알린다. 스파클 계산은 경제 기능이 한다.
 */
export class MungchiController {
  readonly view: MungchiView;
  private brain: BrainState;
  private lastStrokeAt = -Infinity;
  private walkPhase = 0;
  private frozen = false;

  constructor(scene: Phaser.Scene, private readonly ctx: GameContext) {
    const saved = ctx.store.get().character;
    const start = inside(WANDER_AREA, saved.x, saved.y)
      ? { x: saved.x as number, y: saved.y as number }
      : { x: (WANDER_AREA.minX + WANDER_AREA.maxX) / 2, y: (WANDER_AREA.minY + WANDER_AREA.maxY) / 2 };
    this.view = new MungchiView(scene, start.x, start.y);
    this.brain = initialBrain(ctx.clock.now());

    const c = this.view.container;
    c.on('pointerdown', () => this.stroke());
    c.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown) this.stroke();
    });

    ctx.bus.on('sparkle:changed', ({ delta, reason }) => {
      if (delta > 0 && reason === 'first-pet-of-day') this.view.burstSparkles();
    });
  }

  /** 테스트용: 뭉치를 제자리에 멈춘다. */
  setFrozen(value: boolean): void {
    this.frozen = value;
    if (value) this.brain = { activity: 'idle', until: Infinity, target: null };
    else this.brain = initialBrain(this.ctx.clock.now());
    this.view.setSleeping(false);
  }

  get activity(): BrainState['activity'] {
    return this.brain.activity;
  }

  update(deltaMs: number): void {
    const now = this.ctx.clock.now();
    if (!this.frozen) this.brain = tick(this.brain, now, Math.random, WANDER_AREA);
    this.view.setSleeping(this.brain.activity === 'sleep');

    if (this.brain.activity === 'wander' && this.brain.target) {
      const { x, y } = this.view;
      const dx = this.brain.target.x - x;
      const dy = this.brain.target.y - y;
      const dist = Math.hypot(dx, dy);
      const step = (BALANCE.character.walkSpeed * deltaMs) / 1000;
      if (dist <= step) {
        this.view.setPosition(this.brain.target.x, this.brain.target.y);
        this.view.setWalkBob(0);
        this.brain = arrived(this.brain, now);
        this.ctx.store.update((d) => {
          d.character.x = Math.round(this.view.x);
          d.character.y = Math.round(this.view.y);
        });
      } else {
        this.view.setPosition(x + (dx / dist) * step, y + (dy / dist) * step);
        this.walkPhase += deltaMs / 140;
        this.view.setWalkBob(this.walkPhase);
      }
    } else {
      this.view.setWalkBob(0);
    }
  }

  private stroke(): void {
    const now = this.ctx.clock.now();
    if (now - this.lastStrokeAt < BALANCE.petting.strokeCooldownMs) return;
    this.lastStrokeAt = now;
    this.brain = this.frozen ? { activity: 'idle', until: Infinity, target: null } : petted(this.brain, now);
    this.view.setSleeping(false);
    this.view.playHappy();
    this.ctx.bus.emit('pet:stroked', { at: now });
  }
}
