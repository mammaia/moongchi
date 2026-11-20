import Phaser from 'phaser';
import { scaleAtY } from '../room/perspective';
import type { Activity, PlayProp } from './brain';

const R = 44; // 기본 반지름
const FUR = 0xffffff;
const FUR_SHADE = 0xeeeae6;
const INK = 0x3b3131;
const BLUSH = 0xf7b8c4;

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
  private readonly face: Phaser.GameObjects.Graphics;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private sleeping = false;
  private blinking = false;
  private squishing = false;
  private zzzTimer?: Phaser.Time.TimerEvent;
  /** 눈동자가 보는 방향 (-1 왼쪽 ~ 1 오른쪽) */
  private look = 0;
  private lookTimer?: Phaser.Time.TimerEvent;
  private walkPhase = 0;
  /** 혼자 놀기 중에 쓰는 임시 소품과 움직임 */
  private prop?: Phaser.GameObjects.Graphics;
  private playTweens: Phaser.Tweens.Tween[] = [];
  private current: Activity = 'idle';

  constructor(private readonly scene: Phaser.Scene, x: number, y: number) {
    this.shadow = scene.add.ellipse(0, R * 0.92, R * 1.7, R * 0.42, 0x8c7058, 0.18);
    const fur = scene.add.graphics();
    this.drawFur(fur);
    this.face = scene.add.graphics();
    this.body = scene.add.container(0, 0, [fur, this.face]);
    this.container = scene.add.container(x, y, [this.shadow, this.body]).setDepth(10).setName('mungchi');
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
  setActivity(activity: Activity, prop: PlayProp | null = null): void {
    this.stopPlay();
    this.lookTimer?.remove();
    this.lookTimer = undefined;
    this.body.y = 0;
    this.walkPhase = 0;
    this.current = activity;
    this.setSleeping(activity === 'sleep');
    if (activity === 'idle') {
      // 가만히 있기: 가끔 두리번거린다.
      this.setLook(0);
      this.lookTimer = this.scene.time.addEvent({
        delay: 1800,
        loop: true,
        callback: () => {
          if (Math.random() < 0.5) this.setLook([-1, 0, 1][Math.floor(Math.random() * 3)]);
        },
      });
    } else if (activity === 'play' && prop) {
      this.startPlay(prop);
    } else {
      this.setLook(0);
    }
  }

  /** 짧게 이동하기: 가는 방향을 보며 통통 튄다. */
  walkStep(deltaMs: number, dirX: number): void {
    if (this.current !== 'wander') return;
    this.walkPhase += deltaMs / 140;
    this.body.y = -Math.abs(Math.sin(this.walkPhase)) * 5;
    this.setLook(dirX > 0.2 ? 1 : dirX < -0.2 ? -1 : 0);
  }

  private setLook(value: number): void {
    if (this.look === value) return;
    this.look = value;
    this.drawFace();
  }

  /** [임시 그림] 혼자 놀기: 옆에 소품이 나타나고, 뭉치가 소품을 툭툭 치며 들썩인다. */
  private startPlay(prop: PlayProp): void {
    const g = this.scene.add.graphics();
    this.drawProp(g, prop);
    g.setPosition(R * 1.25, R * 0.62);
    this.container.add(g);
    this.prop = g;
    this.setLook(1);
    this.playTweens = [
      // 소품 쪽으로 몸을 기울이며 통통
      this.scene.tweens.add({ targets: this.body, angle: 9, y: -7, duration: 260, yoyo: true, repeat: -1, repeatDelay: 380, ease: 'Sine.easeOut' }),
      // 소품이 굴러갔다 돌아온다
      this.scene.tweens.add({ targets: g, x: R * 1.7, angle: 70, duration: 520, yoyo: true, repeat: -1, repeatDelay: 120, ease: 'Sine.easeInOut' }),
    ];
  }

  private stopPlay(): void {
    for (const t of this.playTweens) t.remove();
    this.playTweens = [];
    this.body.angle = 0;
    this.prop?.destroy();
    this.prop = undefined;
  }

  private drawProp(g: Phaser.GameObjects.Graphics, prop: PlayProp): void {
    if (prop === 'tissue-roll') {
      // 휴지심: 옆으로 누운 갈색 원통
      g.fillStyle(0xd9b48a, 1).fillRoundedRect(-12, -8, 24, 16, 4);
      g.fillStyle(0xc39a6b, 1).fillEllipse(12, 0, 8, 16);
      g.fillStyle(0x8f6d4b, 1).fillEllipse(12, 0, 4, 10);
    } else {
      // 양말: 줄무늬 양말 한 짝
      g.fillStyle(0xf4a7b9, 1).fillRoundedRect(-6, -14, 11, 20, 3).fillRoundedRect(-6, 0, 18, 9, 4);
      g.fillStyle(0xffffff, 1).fillRect(-6, -9, 11, 3).fillRect(-6, -3, 11, 3);
    }
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
    if (this.sleeping || this.blinking || happy) {
      // 감은 눈 (자는 중: ‿ / 기쁨: ^)
      const curve = this.sleeping || this.blinking ? 1 : -1;
      for (const ex of [-13, 13]) {
        g.beginPath();
        g.arc(ex, eyeY + (curve > 0 ? -2 : 3), 5, curve > 0 ? 0.15 * Math.PI : 1.15 * Math.PI, curve > 0 ? 0.85 * Math.PI : 1.85 * Math.PI);
        g.strokePath();
      }
    } else {
      const lx = this.look * 3;
      g.fillStyle(INK, 1);
      g.fillEllipse(-13 + lx, eyeY, 6, 8).fillEllipse(13 + lx, eyeY, 6, 8);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(-12 + lx, eyeY - 2, 1.4).fillCircle(14 + lx, eyeY - 2, 1.4);
    }
    // 작은 입
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
