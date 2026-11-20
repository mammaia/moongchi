import Phaser from 'phaser';
import { scaleAtY } from '../room/perspective';
import { BALANCE } from '../../data/balance';
import type { Activity } from './brain';
import type { GaitPose } from './gait';
import type { Face } from './playMotion';

const R = 44; // 기본 반지름
const FUR = 0xffffff;
const FUR_SHADE = 0xeeeae6;
const INK = 0x3b3131;
const BLUSH = 0xf7b8c4;
const MOUTH = 0x8a4a4f;
const TONGUE = 0xf58fa3;

const TEXT_STYLE = {
  fontFamily: 'system-ui, sans-serif',
  resolution: 3,
};

/**
 * 뭉치 그림. 하얀 털뭉치를 도형으로 그린 임시 그림.
 * 행동마다 보이는 모습은 setActivity() 한 곳에서 정한다.
 * 나중에 정식 그림(스프라이트 애니메이션)이 생기면 이 파일만 바꾸면 된다.
 */
export class MungchiView {
  readonly container: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Container;
  /** 걸을 때 뛰고 뒤뚱거리는 층. 숨 쉬기(body)와 따로 움직여 서로 부딪히지 않는다. */
  private readonly gait: Phaser.GameObjects.Container;
  private readonly face: Phaser.GameObjects.Graphics;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private sleeping = false;
  private blinking = false;
  private squishing = false;
  private zzzTimer?: Phaser.Time.TimerEvent;
  /** 눈동자가 보는 방향 (-1 왼쪽 ~ 1 오른쪽). 눈은 lookTarget 쪽으로 부드럽게 옮겨 간다. */
  private look = 0;
  private lookTarget = 0;
  private lookTimer?: Phaser.Time.TimerEvent;
  /** 지금 표정 (놀 때 바뀐다) */
  private faceKind: Face = 'normal';
  private current: Activity = 'idle';

  constructor(private readonly scene: Phaser.Scene, x: number, y: number) {
    this.shadow = scene.add.ellipse(0, R * 0.92, R * 1.7, R * 0.42, 0x8c7058, 0.18);
    const fur = scene.add.graphics();
    this.drawFur(fur);
    this.face = scene.add.graphics();
    this.body = scene.add.container(0, 0, [fur, this.face]);
    this.gait = scene.add.container(0, 0, [this.body]);
    this.container = scene.add.container(x, y, [this.shadow, this.gait]).setDepth(10).setName('mungchi');
    this.container.setSize(R * 2.6, R * 2.6);
    this.container.setInteractive(new Phaser.Geom.Circle(R * 1.3, R * 1.3, R * 1.3), Phaser.Geom.Circle.Contains);
    this.drawFace();
    this.applyDepthScale();

    // 숨 쉬기: 아주 살짝 부풀었다 줄어든다.
    scene.tweens.add({ targets: this.body, scaleY: 1.04, scaleX: 0.985, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    // 가끔 눈 깜빡이기
    scene.time.addEvent({ delay: 3200, loop: true, callback: () => this.blink() });
  }

  get x(): number {
    return this.container.x;
  }

  get y(): number {
    return this.container.y;
  }

  setPosition(x: number, y: number): void {
    this.container.setPosition(x, y);
    this.applyDepthScale();
  }

  /**
   * 행동에 맞는 모습으로 바꾼다. 행동이 바뀔 때만 부른다.
   * [임시 그림] 놀기·두리번거리기는 도형과 움직임으로만 표현한 임시 애니메이션.
   */
  setActivity(activity: Activity): void {
    this.lookTimer?.remove();
    this.lookTimer = undefined;
    const wasWalking = this.current === 'wander' || this.current === 'play';
    this.faceKind = 'normal';
    this.current = activity;
    this.setSleeping(activity === 'sleep');
    if (wasWalking) this.land();
    if (activity === 'idle') {
      // 가만히 있기: 가끔 한쪽을 잠깐 바라봤다가 다시 앞을 본다.
      const G = BALANCE.character.glance;
      this.setLook(0);
      this.lookTimer = this.scene.time.addEvent({
        delay: G.everyMs,
        loop: true,
        callback: () => {
          if (this.lookTarget !== 0 || Math.random() >= G.chance) return;
          this.setLook(Math.random() < 0.5 ? -1 : 1);
          this.scene.time.delayedCall(Phaser.Math.Between(G.holdMs[0], G.holdMs[1]), () => {
            if (this.current === 'idle') this.setLook(0);
          });
        },
      });
    } else if (activity === 'wander' || activity === 'play') {
      // 방향과 몸짓은 걷기·놀기 계산이 setPose()로 정한다.
    } else {
      this.setLook(0);
    }
  }

  /** 걷기·놀기: 가는(노는) 방향을 보고, 계산된 몸짓(gait.ts, playMotion.ts)대로 몸을 움직인다. */
  setPose(pose: GaitPose, dirX: number): void {
    if (this.current !== 'wander' && this.current !== 'play') return;
    this.setLook(dirX > 0.25 ? 1 : dirX < -0.25 ? -1 : 0);
    this.gait.setPosition(0, -pose.hop);
    this.gait.setAngle(pose.tilt);
    this.gait.setScale(pose.scaleX, pose.scaleY);
    // 높이 뜰수록 그림자가 살짝 작아진다.
    this.shadow.setScale(1 - pose.hop * 0.02);
  }

  /** 표정을 바꾼다. 같은 표정이면 다시 그리지 않는다. */
  setFace(face: Face): void {
    if (this.faceKind === face) return;
    this.faceKind = face;
    this.drawFace();
  }

  /** 매 프레임: 눈동자를 보려는 쪽으로 부드럽게 옮긴다. */
  update(deltaMs: number): void {
    if (this.look === this.lookTarget) return;
    const step = deltaMs / 160;
    const diff = this.lookTarget - this.look;
    this.look = Math.abs(diff) <= step ? this.lookTarget : this.look + Math.sign(diff) * step;
    this.drawFace();
  }

  private setLook(value: number): void {
    this.lookTarget = value;
  }

  /** 걷기를 마치면 살짝 눌렸다 원래 모양으로 돌아온다. */
  private land(): void {
    this.gait.setPosition(0, 0).setAngle(0);
    this.shadow.setScale(1);
    this.gait.setScale(1.05, 0.94);
    this.scene.tweens.add({ targets: this.gait, scaleX: 1, scaleY: 1, duration: 220, ease: 'Back.easeOut' });
  }

  private setSleeping(value: boolean): void {
    if (this.sleeping === value) return;
    this.sleeping = value;
    this.drawFace();
    this.zzzTimer?.remove();
    this.zzzTimer = undefined;
    if (value) {
      this.zzzTimer = this.scene.time.addEvent({ delay: 1100, loop: true, callback: () => this.floatText('z', '#9a8f86', 16) });
    }
  }

  /** 쓰다듬으면 꾹 눌렸다 통 튀어 오르고 하트가 나온다. */
  playHappy(): void {
    this.floatText('♥', '#f28aa5', 18);
    if (this.squishing) return;
    this.squishing = true;
    this.scene.tweens.add({
      targets: this.container,
      scaleX: this.container.scaleX * 1.12,
      scaleY: this.container.scaleY * 0.88,
      duration: 110,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.squishing = false;
        this.applyDepthScale();
      },
    });
    this.drawFace(true);
    this.scene.time.delayedCall(900, () => this.drawFace());
  }

  /** 스파클을 받았을 때 반짝이 터뜨리기 */
  burstSparkles(): void {
    for (let i = 0; i < 7; i++) {
      const angle = (Math.PI * 2 * i) / 7 - Math.PI / 2;
      const star = this.scene.add
        .text(this.x, this.y - R * 0.4, '✦', { ...TEXT_STYLE, fontSize: '18px', color: '#f5c84c' })
        .setOrigin(0.5)
        .setDepth(20);
      this.scene.tweens.add({
        targets: star,
        x: this.x + Math.cos(angle) * 70,
        y: this.y - R * 0.4 + Math.sin(angle) * 70,
        alpha: 0,
        scale: 1.4,
        duration: 800,
        ease: 'Cubic.easeOut',
        onComplete: () => star.destroy(),
      });
    }
  }

  private applyDepthScale(): void {
    const s = scaleAtY(this.container.y);
    this.container.setScale(s);
    this.container.setDepth(10 + this.container.y / 1000);
  }

  private blink(): void {
    if (this.sleeping || this.blinking) return;
    this.blinking = true;
    this.drawFace();
    this.scene.time.delayedCall(130, () => {
      this.blinking = false;
      this.drawFace();
    });
  }

  private drawFur(g: Phaser.GameObjects.Graphics): void {
    // 가장자리 털: 고정된 패턴의 작은 원을 겹쳐 폭신한 윤곽을 만든다.
    g.fillStyle(FUR_SHADE, 1);
    for (let i = 0; i < 30; i++) {
      const a = (Math.PI * 2 * i) / 30;
      const wobble = 1 + 0.06 * Math.sin(i * 2.7);
      g.fillCircle(Math.cos(a) * R * wobble, Math.sin(a) * R * 0.92 * wobble, 11);
    }
    g.fillStyle(FUR, 1);
    for (let i = 0; i < 30; i++) {
      const a = (Math.PI * 2 * i) / 30 + 0.1;
      const wobble = 1 + 0.05 * Math.cos(i * 1.9);
      g.fillCircle(Math.cos(a) * R * 0.92 * wobble, Math.sin(a) * R * 0.85 * wobble, 10);
    }
    g.fillEllipse(0, 0, R * 1.9, R * 1.75);
  }

  private drawFace(happy = false): void {
    const g = this.face;
    g.clear();
    const eyeY = -2;
    g.fillStyle(BLUSH, 0.75);
    g.fillEllipse(-22, 10, 12, 7).fillEllipse(22, 10, 12, 7);
    g.lineStyle(2.2, INK, 1);
    const face = this.sleeping ? 'normal' : this.faceKind;
    if (!this.sleeping && face === 'bite') {
      // 앙 물고 눈 질끈 (> <)
      for (const ex of [-13, 13]) {
        const d = ex < 0 ? 1 : -1;
        g.beginPath();
        g.moveTo(ex - d * 4, eyeY - 4);
        g.lineTo(ex + d * 2, eyeY);
        g.lineTo(ex - d * 4, eyeY + 4);
        g.strokePath();
      }
    } else if (this.sleeping || this.blinking || happy || face === 'joy') {
      // 감은 눈 (자는 중: ‿ / 기쁨: ^)
      const curve = this.sleeping || (this.blinking && face !== 'joy') ? 1 : -1;
      for (const ex of [-13, 13]) {
        g.beginPath();
        g.arc(ex, eyeY + (curve > 0 ? -2 : 3), 5, curve > 0 ? 0.15 * Math.PI : 1.15 * Math.PI, curve > 0 ? 0.85 * Math.PI : 1.85 * Math.PI);
        g.strokePath();
      }
    } else {
      const lx = this.look * 3;
      const big = face === 'open' ? 1.25 : 1; // 놀라서 눈이 동그래짐
      g.fillStyle(INK, 1);
      g.fillEllipse(-13 + lx, eyeY, 6 * big, 8 * big).fillEllipse(13 + lx, eyeY, 6 * big, 8 * big);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(-12 + lx, eyeY - 2, 1.4).fillCircle(14 + lx, eyeY - 2, 1.4);
    }
    this.drawMouth(g, happy && face === 'normal' ? 'normal' : face);
  }

  /** 입 모양. [임시 그림] */
  private drawMouth(g: Phaser.GameObjects.Graphics, face: Face): void {
    if (face === 'grin' || face === 'joy') {
      // 입 벌리고 헤헤: 아래로 둥근 입 + 혀
      g.fillStyle(MOUTH, 1);
      g.slice(0, 6, 6, 0, Math.PI, false).fillPath();
      g.fillStyle(TONGUE, 1).fillEllipse(0, 9.5, 6, 4);
      return;
    }
    if (face === 'open') {
      // 동그랗게 '오!'
      g.fillStyle(MOUTH, 1).fillEllipse(0, 9, 6, 7);
      return;
    }
    if (face === 'bite') {
      // 앙 문 입: 크게 벌림
      g.fillStyle(MOUTH, 1).fillEllipse(0, 9, 13, 9);
      g.fillStyle(TONGUE, 1).fillEllipse(0, 11.5, 7, 3.5);
      return;
    }
    // 평소: 작은 ω 입
    g.lineStyle(1.8, INK, 1);
    g.beginPath();
    g.arc(-2.5, 7, 2.5, 0, Math.PI);
    g.strokePath();
    g.beginPath();
    g.arc(2.5, 7, 2.5, 0, Math.PI);
    g.strokePath();
  }

  private floatText(text: string, color: string, size: number): void {
    const label = this.scene.add
      .text(this.x + Phaser.Math.Between(-18, 18), this.y - R * this.container.scaleY, text, { ...TEXT_STYLE, fontSize: `${size}px`, color })
      .setOrigin(0.5)
      .setDepth(20);
    this.scene.tweens.add({
      targets: label,
      y: label.y - 46,
      alpha: 0,
      duration: 1200,
      ease: 'Sine.easeOut',
      onComplete: () => label.destroy(),
    });
  }
}
