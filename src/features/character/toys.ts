import Phaser from 'phaser';
import { scaleAtY } from '../room/perspective';
import type { PlayProp, Point } from './brain';

/**
 * 방바닥에 놓인 장난감(휴지심, 양말). [임시 그림] 장난감 시스템이 생기면 교체.
 * 놀고 나도 그 자리에 남아 있고, 앱을 나갔다 들어오면 clear()로 치운다.
 * 저장하지 않으므로 새로고침해도 치워진다.
 */
export class ToyView {
  readonly node: Phaser.GameObjects.Container;
  private readonly art: Phaser.GameObjects.Graphics;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  /** 바닥 위치 (그림자 자리) */
  private ground: Point;
  private lift = 0;
  /** 기본 회전 (동작이 끝날 때마다 굳는다) */
  angle = 0;

  constructor(scene: Phaser.Scene, readonly prop: PlayProp, at: Point) {
    this.ground = { ...at };
    this.shadow = scene.add.ellipse(0, 7, 24, 7, 0x8c7058, 0.18);
    this.art = scene.add.graphics();
    drawProp(this.art, prop);
    this.node = scene.add.container(at.x, at.y, [this.shadow, this.art]).setName(`toy-${prop}`);
    this.apply(0);
    // 처음 나타날 때 통 하고 떨어진다
    this.node.setAlpha(0);
    scene.tweens.add({ targets: this.node, alpha: 1, duration: 160 });
  }

  get position(): Point {
    return { ...this.ground };
  }

  /** 바닥 위치, 뜬 높이, 추가 회전을 정한다. */
  place(at: Point, lift: number, spin: number): void {
    this.ground = { ...at };
    this.lift = lift;
    this.apply(spin);
  }

  /** 지금 회전을 기본 회전으로 굳힌다 (동작 하나가 끝났을 때). */
  settle(spin: number): void {
    this.angle = (this.angle + spin) % 360;
    this.lift = 0;
    this.apply(0);
  }

  destroy(): void {
    this.node.destroy();
  }

  private apply(spin: number): void {
    const s = scaleAtY(this.ground.y);
    this.node.setPosition(this.ground.x, this.ground.y).setScale(s);
    this.node.setDepth(10 + this.ground.y / 1000 + 0.0005);
    this.art.setPosition(0, -this.lift).setAngle(this.angle + spin);
    this.shadow.setScale(Math.max(0.5, 1 - this.lift * 0.012));
  }
}

function drawProp(g: Phaser.GameObjects.Graphics, prop: PlayProp): void {
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
