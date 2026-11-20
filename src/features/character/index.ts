import Phaser from 'phaser';
import type { GameContext } from '../../context';
import type { MungchiActivity } from '../../core/events';
import { BALANCE } from '../../data/balance';
import { MUNGCHI_FLOOR } from '../../data/room';
import { point } from '../room/perspective';
import { MungchiView } from './MungchiView';
import { furnitureFrame, phaseMs, planFurniture, type FurnitureKind, type FurniturePhase, type FurniturePlan } from './furniture';
import { gaitPose, walkSpeedFactor } from './gait';
import { placeNewToy, planPlayMove, playFrame, type PlayFrame, type PlayMove } from './playMotion';
import { ToyView } from './toys';
import {
  arrived,
  calmDown,
  force,
  initialBrain,
  nap,
  petted,
  tick,
  type Activity,
  type Area,
  type AutoActivity,
  type BrainState,
  type PlayProp,
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

const NAP = BALANCE.character.nap;
/** 한 번 그릴 때 움직임을 계산하는 최대 시간 (밀리초) */
const MAX_STEP_MS = 100;

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
  private lastUpdateAt: number | null = null;
  private trip: { from: { x: number; y: number }; since: number; startedAt: number } | null = null;
  /** 지금 하고 있는 가구 쓰기 (침대에 올라가기, 책상 뒤에 숨기) */
  private furn: { since: number; plan: FurniturePlan; phase: 'approach' | FurniturePhase; elapsed: number } | null = null;
  /** 가구 위(또는 뒤)에 있는 중. 다른 곳으로 움직이기 전에 먼저 내려와야 한다. */
  private perch: { plan: FurniturePlan; exitElapsed: number | null } | null = null;
  /** 방바닥에 놓인 장난감. 놀고 나도 남고, 앱을 나갔다 들어오면 치운다. */
  private readonly toys = new Map<PlayProp, ToyView>();
  /** 지금 하고 있는 놀이 동작 */
  private playRun: { since: number; toy: ToyView; move: PlayMove; elapsed: number; frame: PlayFrame | null } | null = null;

  constructor(private readonly scene: Phaser.Scene, private readonly ctx: GameContext) {
    const saved = ctx.store.get().character;
    const start = inside(WANDER_AREA, saved.x, saved.y)
      ? { x: saved.x as number, y: saved.y as number }
      : { x: (WANDER_AREA.minX + WANDER_AREA.maxX) / 2, y: (WANDER_AREA.minY + WANDER_AREA.maxY) / 2 };
    this.view = new MungchiView(scene, start.x, start.y);
    this.brain = initialBrain(ctx.clock.now());
    // 앱을 한동안 안 켜다가 열면 자고 있다.
    const away = ctx.clock.now() - ctx.store.get().progress.lastSeenAt;
    if (away >= NAP.afterAwayMs) this.brain = nap(this.brain, ctx.clock.now(), Math.random);
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
    // 앱을 나갔다 들어오면 장난감은 치워져 있고, 오래 나가 있었다면 자고 있다.
    ctx.bus.on('app:resumed', ({ awayMs }) => {
      if (this.brain.activity === 'play') this.brain = calmDown(this.brain, ctx.clock.now(), Math.random);
      this.syncView();
      this.clearToys();
      if (awayMs >= NAP.afterAwayMs) this.napNow();
    });
    // 다이어리(책상)·조리(조리대)를 하는 동안 잠깐 존다. 지금은 자세히 보기 화면에 연결되어 있다.
    ctx.bus.on('hotspot:opened', ({ id }) => {
      if ((NAP.spots as readonly string[]).includes(id)) this.napNow();
    });
  }

  /** 방에 놓인 장난감 (테스트·개발용) */
  get toysInRoom(): PlayProp[] {
    return [...this.toys.keys()];
  }

  private napNow(): void {
    this.brain = nap(this.brain, this.ctx.clock.now(), Math.random);
    this.syncView();
  }

  private clearToys(): void {
    this.endPlay();
    for (const toy of this.toys.values()) toy.destroy();
    this.toys.clear();
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

  update(frameMs: number): void {
    const now = this.ctx.clock.now();
    // 움직임은 실제 흐른 시간으로 계산한다. 폰이 버벅여 화면이 덜 그려져도 뭉치 속도는 같다.
    // (앱을 뒤로 보냈다 오면 시간이 크게 뛰므로 한 번에 최대 0.1초만 움직인다)
    const deltaMs = this.lastUpdateAt === null ? frameMs : Math.min(MAX_STEP_MS, Math.max(0, now - this.lastUpdateAt));
    this.lastUpdateAt = now;
    if (!this.frozen) {
      this.brain = tick(this.brain, now, Math.random, this.position, WANDER_AREA, this.modifiers);
    } else if (now >= this.brain.until) {
      // 테스트용 멈춤: 하던 행동이 끝나면 스스로 고르지 않고 가만히 있는다.
      this.brain = { ...this.brain, activity: 'idle', since: now, until: Infinity, target: null, prop: null, settling: false };
    }

    this.syncView();
    const activity = this.brain.activity;
    if (this.groundFirst(deltaMs)) {
      if (activity === 'wander' && this.brain.target) this.walk(deltaMs, now);
      else if (activity === 'climb' || activity === 'hide') this.useFurniture(deltaMs, now, activity);
      else if (activity === 'play' && this.brain.prop) this.play(deltaMs, this.brain.prop);
    }
    this.syncView();
    this.view.update(deltaMs);
  }

  /** 지금 올라가(숨어) 있는 가구 (테스트·개발용) */
  get onFurniture(): FurnitureKind | null {
    return this.perch?.plan.kind ?? null;
  }

  /**
   * 가구 위(뒤)에 있는데 다른 곳으로 움직여야 하면 먼저 내려온다(나온다).
   * 쓰다듬기·낮잠·가만히 있기는 그 자리에서 해도 되므로 내려오지 않는다.
   * 다 내려왔으면 true.
   */
  private groundFirst(deltaMs: number): boolean {
    const p = this.perch;
    const a = this.brain.activity;
    if (!p) return true;
    if (this.furn && this.furn.since === this.brain.since) return true; // 가구 쓰기 진행 중
    if (a === 'happy' || a === 'sleep' || a === 'idle') return false;
    p.exitElapsed = (p.exitElapsed ?? 0) + deltaMs;
    const f = furnitureFrame(p.plan, 'exit', p.exitElapsed);
    this.view.setPosition(f.pos.x, f.pos.y, f.lift);
    this.view.setPose(f.pose, f.look);
    this.view.setFace(f.face);
    if (p.exitElapsed < phaseMs(p.plan, 'exit')) return false;
    this.landOnFloor(p.plan);
    return true;
  }

  /**
   * 가구 쓰기가 중간에 끊겼다(쓰다듬기, 낮잠 등). 공중에 멈춰 있지 않도록 가까운 자리에 내려놓는다.
   * 올라가는 중이면 가구 위로, 내려오는 중이면 바닥으로.
   */
  private settleFurniture(): void {
    const f = this.furn;
    if (f && f.since !== this.brain.since) {
      this.furn = null;
      if (f.phase === 'exit') this.landOnFloor(f.plan);
      else if (f.phase !== 'approach') this.view.setPosition(f.plan.spot.x, f.plan.spot.y, f.plan.spotLift);
    }
    const p = this.perch;
    if (p && p.exitElapsed !== null && !this.furn) {
      if (this.brain.activity === 'happy' || this.brain.activity === 'sleep' || this.brain.activity === 'idle') this.landOnFloor(p.plan);
    }
  }

  private landOnFloor(plan: FurniturePlan): void {
    this.perch = null;
    this.furn = null;
    this.trip = null;
    this.view.setPosition(plan.approach.x, plan.approach.y, 0);
    this.view.setFace('normal');
    this.savePosition();
  }

  /** 가구 쓰기: 가구 앞까지 걸어간 뒤, furniture.ts의 동작대로 올라가고(숨고) 머물다 돌아온다. */
  private useFurniture(deltaMs: number, now: number, kind: FurnitureKind): void {
    let f = this.furn;
    if (!f || f.since !== this.brain.since) {
      f = this.furn = { since: this.brain.since, plan: planFurniture(kind, Math.random), phase: 'approach', elapsed: 0 };
      this.trip = null;
    }
    if (f.phase === 'approach') {
      if (this.walkToward(f.plan.approach, deltaMs, now)) {
        f.phase = 'enter';
        f.elapsed = 0;
        this.perch = { plan: f.plan, exitElapsed: null };
      }
      return;
    }
    f.elapsed += deltaMs;
    const frame = furnitureFrame(f.plan, f.phase, f.elapsed);
    this.view.setPosition(frame.pos.x, frame.pos.y, frame.lift);
    this.view.setPose(frame.pose, frame.look);
    this.view.setFace(frame.face);
    if (f.elapsed < phaseMs(f.plan, f.phase)) return;
    f.elapsed = 0;
    if (f.phase === 'enter') f.phase = 'stay';
    else if (f.phase === 'stay') f.phase = 'exit';
    else {
      this.landOnFloor(f.plan);
      this.brain = arrived(this.brain, now, Math.random);
    }
  }

  private walk(deltaMs: number, now: number): void {
    if (this.walkToward(this.brain.target!, deltaMs, now)) {
      this.brain = arrived(this.brain, now, Math.random);
      this.savePosition();
    }
  }

  /** 걸음걸이 계산(gait.ts)대로 target까지 걷는다. 도착하면 true. */
  private walkToward(target: { x: number; y: number }, deltaMs: number, now: number): boolean {
    if (!this.trip || this.trip.since !== this.brain.since) {
      this.trip = { from: this.position, since: this.brain.since, startedAt: now };
    }
    const { x, y } = this.view;
    const dx = target.x - x;
    const dy = target.y - y;
    const dist = Math.hypot(dx, dy);
    const total = Math.hypot(target.x - this.trip.from.x, target.y - this.trip.from.y);
    const traveled = Math.max(0, total - dist);
    const speed = walkSpeedFactor(now - this.trip.startedAt, traveled, total);
    const step = (BALANCE.character.walkSpeed * speed * deltaMs) / 1000;
    if (dist < 0.5 || (speed > 0 && dist <= step)) {
      this.view.setPosition(target.x, target.y);
      return true;
    }
    this.view.setPosition(x + (dx / dist) * step, y + (dy / dist) * step);
    this.view.setPose(gaitPose(traveled, speed), dx / dist);
    return false;
  }

  private savePosition(): void {
    if (this.perch) return; // 가구 위(뒤) 자리는 저장하지 않는다 (다시 열면 바닥에서 시작)
    this.ctx.store.update((d) => {
      d.character.x = Math.round(this.view.x);
      d.character.y = Math.round(this.view.y);
    });
  }

  /** 강아지처럼 놀기: 동작을 하나씩 골라(playMotion.ts) 진행도에 맞춰 그린다. */
  private play(deltaMs: number, prop: PlayProp): void {
    let run = this.playRun;
    if (!run || run.since !== this.brain.since) {
      this.endPlay();
      let toy = this.toys.get(prop);
      if (!toy) {
        toy = new ToyView(this.scene, prop, placeNewToy(this.position, WANDER_AREA));
        this.toys.set(prop, toy);
      }
      const move = planPlayMove(Math.random, this.position, toy.position, WANDER_AREA, prop, null);
      run = this.playRun = { since: this.brain.since, toy, move, elapsed: 0, frame: null };
    }
    run.elapsed += deltaMs;
    const t = run.elapsed / run.move.durationMs;
    const frame = playFrame(run.move, t);
    run.frame = frame;
    this.view.setPosition(frame.mungchi.x, frame.mungchi.y);
    this.view.setPose(frame.pose, run.move.facing);
    this.view.setFace(frame.face);
    run.toy.place(frame.toy, frame.toyLift, frame.toySpin);
    if (t >= 1) {
      run.toy.settle(frame.toySpin);
      run.move = planPlayMove(Math.random, this.position, run.toy.position, WANDER_AREA, prop, run.move.kind);
      run.elapsed = 0;
    }
  }

  /** 놀기가 끝나거나 끊겼다. 물고 있던 장난감은 그 자리에 떨어뜨린다. */
  private endPlay(): void {
    const run = this.playRun;
    if (!run) return;
    this.playRun = null;
    run.toy.settle(run.frame?.toySpin ?? 0);
    this.savePosition();
  }

  /** 머리의 행동이 바뀌었으면 그림을 바꾸고 다른 기능에 알린다. */
  private syncView(): void {
    const { activity, settling } = this.brain;
    const prev = this.shown;
    if (prev && prev.activity === activity && prev.settling === settling) return;
    if (prev?.activity === 'play' && activity !== 'play') this.endPlay();
    if (prev && prev.activity !== activity) this.settleFurniture();
    // 계속 쓰다듬는 중(좋아하기 → 좋아하기)에는 다시 그리지 않는다.
    if (!prev || prev.activity !== activity) this.view.setActivity(activity);
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
