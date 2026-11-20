import Phaser from 'phaser';
import { HOTSPOTS, type HotspotId } from '../../data/room';
import { BACK_WALL, WORLD, ceilY, floorY, leftEdge, point, type Pt } from './perspective';

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const COLOR = {
  ceiling: 0xf3e9da,
  backWall: 0xfaf4ea,
  sideWall: 0xf0e5d3,
  floor: 0xdfc5a0,
  floorLine: 0xcfb28a,
  line: 0xb79d7c,
  wood: 0xc9a27c,
  woodDark: 0xa98260,
  white: 0xffffff,
  blanket: 0xbcd9e8,
    sky: 0xc4e6f6,
  curtain: 0xf5cfcf,
  monitor: 0x4b4a55,
  screen: 0xa6d8ea,
  chair: 0xeab08a,
  counterTop: 0xf4f0ea,
  counter: 0xdcd4c6,
  counterSide: 0xcac1b1,
  door: 0xeadcc6,
  mat: 0xd9b7d9,
} as const;

const boundsOf = (pts: Pt[], pad = 6): Bounds => {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  return { x, y, width: Math.max(...xs) + pad - x, height: Math.max(...ys) + pad - y };
};

/**
 * 원룸 그림. 지금은 도형으로 그린 임시 그림이며, 최종 그림으로 바꿔도
 * 물건 위치(Bounds)와 이름표 로직은 그대로 쓸 수 있다.
 */
export class RoomView {
  readonly hotspotBounds = new Map<HotspotId, Bounds>();
  private readonly g: Phaser.GameObjects.Graphics;

  constructor(private readonly scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(0);
    this.drawShell();
    this.drawWindow();
    this.drawBathroomDoor();
    this.drawBed();
    this.drawDesk();
    this.drawCounter();
    this.drawShoes();
    this.drawEntrance();
  }

  /** 각 물건 위에 작은 이름표와 누를 수 있는 영역을 만든다. */
  createHotspots(onTap: (id: HotspotId) => void): Phaser.GameObjects.Zone[] {
    const zones: Phaser.GameObjects.Zone[] = [];
    for (const [id, b] of this.hotspotBounds) {
      const zone = this.scene.add
        .zone(b.x + b.width / 2, b.y + b.height / 2, b.width, b.height)
        .setInteractive({ useHandCursor: true })
        .setDepth(1)
        .setName(`hotspot-${id}`);
      // 같은 물건 위에서 눌렀다 뗐을 때만 '탭'으로 본다. (문지르다 지나가는 것은 무시)
      let pressed = false;
      zone.on('pointerdown', () => (pressed = true));
      zone.on('pointerout', () => (pressed = false));
      zone.on('pointerup', () => {
        if (pressed) onTap(id);
        pressed = false;
      });
      zones.push(zone);

      const labelY = id === 'entrance' ? b.y + b.height / 2 : b.y + 4;
      this.scene.add
        .text(b.x + b.width / 2, labelY, HOTSPOTS[id].label, {
          fontFamily: 'system-ui, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
          fontSize: '11px',
          color: '#6b5440',
          backgroundColor: 'rgba(255,255,255,0.82)',
          padding: { x: 6, y: 3 },
          resolution: 3,
        })
        .setOrigin(0.5)
        .setDepth(2);
    }
    return zones;
  }

  private poly(pts: Pt[], color: number, alpha = 1, stroke = true): void {
    this.g.fillStyle(color, alpha);
    this.g.fillPoints(pts, true);
    if (stroke) {
      this.g.lineStyle(1, COLOR.line, 0.45);
      this.g.strokePoints(pts, true);
    }
  }

  /** 바닥에 놓인 상자: 윗면, 앞면, 안쪽 옆면을 그린다. */
  private box(
    u0: number, u1: number, t0: number, t1: number, h: number,
    colors: { top: number; front: number; side: number },
    visibleSide: 'left' | 'right',
  ): Pt[] {
    const sideU = visibleSide === 'left' ? u0 : u1;
    const side = [point(sideU, t0), point(sideU, t1), point(sideU, t1, h), point(sideU, t0, h)];
    const front = [point(u0, t1), point(u1, t1), point(u1, t1, h), point(u0, t1, h)];
    const top = [point(u0, t0, h), point(u1, t0, h), point(u1, t1, h), point(u0, t1, h)];
    this.poly(side, colors.side);
    this.poly(front, colors.front);
    this.poly(top, colors.top);
    return [...side, ...front, ...top];
  }

  private drawShell(): void {
    const { width: W, height: H } = WORLD;
    const B = BACK_WALL;
    this.poly([{ x: 0, y: 0 }, { x: W, y: 0 }, { x: B.right, y: B.ceilY }, { x: B.left, y: B.ceilY }], COLOR.ceiling);
    this.poly([{ x: 0, y: 0 }, { x: B.left, y: B.ceilY }, { x: B.left, y: B.floorY }, { x: 0, y: H }], COLOR.sideWall);
    this.poly([{ x: W, y: 0 }, { x: B.right, y: B.ceilY }, { x: B.right, y: B.floorY }, { x: W, y: H }], COLOR.sideWall);
    this.poly([{ x: B.left, y: B.ceilY }, { x: B.right, y: B.ceilY }, { x: B.right, y: B.floorY }, { x: B.left, y: B.floorY }], COLOR.backWall);
    this.poly([{ x: B.left, y: B.floorY }, { x: B.right, y: B.floorY }, { x: W, y: H }, { x: 0, y: H }], COLOR.floor);
    // 마룻바닥 줄
    this.g.lineStyle(1, COLOR.floorLine, 0.7);
    for (let i = 1; i < 8; i++) {
      const u = i / 8;
      this.g.lineBetween(point(u, 0).x, point(u, 0).y, point(u, 1).x, point(u, 1).y);
    }
  }

  private drawWindow(): void {
    const frame = { x: 140, y: 196, w: 110, h: 132 };
    this.g.fillStyle(COLOR.white, 1).fillRoundedRect(frame.x - 6, frame.y - 6, frame.w + 12, frame.h + 12, 6);
    this.g.fillStyle(COLOR.sky, 1).fillRect(frame.x, frame.y, frame.w, frame.h);
    // 구름 한 조각 (날씨는 4단계에서 연결)
    this.g.fillStyle(COLOR.white, 0.9);
    this.g.fillEllipse(frame.x + 38, frame.y + 40, 34, 16).fillEllipse(frame.x + 52, frame.y + 34, 28, 18);
    this.g.lineStyle(3, COLOR.white, 1);
    this.g.lineBetween(frame.x + frame.w / 2, frame.y, frame.x + frame.w / 2, frame.y + frame.h);
    this.g.lineBetween(frame.x, frame.y + frame.h / 2, frame.x + frame.w, frame.y + frame.h / 2);
    // 커튼
    this.g.fillStyle(COLOR.curtain, 1);
    this.g.fillRoundedRect(frame.x - 22, frame.y - 14, 22, frame.h + 34, 8);
    this.g.fillRoundedRect(frame.x + frame.w, frame.y - 14, 22, frame.h + 34, 8);
    this.hotspotBounds.set('window', { x: frame.x - 22, y: frame.y - 14, width: frame.w + 44, height: frame.h + 34 });
  }

  private drawBathroomDoor(): void {
    // 왼쪽 벽, 현관 가까운 쪽
    const t0 = 0.42, t1 = 0.74, hTop = 0.62;
    const at = (t: number, h: number): Pt => ({ x: leftEdge(t), y: floorY(t) - h * (floorY(t) - ceilY(t)) });
    const door = [at(t0, 0), at(t1, 0), at(t1, hTop), at(t0, hTop)];
    this.poly(door, COLOR.door);
    this.g.lineStyle(3, COLOR.woodDark, 0.8);
    this.g.strokePoints(door, true);
    const knob = at(t0 + 0.05, 0.3);
    this.g.fillStyle(COLOR.woodDark, 1).fillCircle(knob.x - 2, knob.y, 3);
    this.hotspotBounds.set('bathroom', boundsOf(door, 10));
  }

  private drawBed(): void {
    // 왼쪽 안쪽. 머리판을 먼저 그리고 그 앞에 매트리스, 이불, 베개.
    const head = [point(0.02, 0, 0), point(0.4, 0, 0), point(0.4, 0, 0.2), point(0.02, 0, 0.2)];
    this.poly(head, COLOR.wood);
    const pts = this.box(0.02, 0.4, 0.0, 0.3, 0.1, { top: COLOR.white, front: COLOR.wood, side: COLOR.woodDark }, 'right');
    const blanket = [point(0.02, 0.1, 0.1), point(0.4, 0.1, 0.1), point(0.4, 0.3, 0.1), point(0.02, 0.3, 0.1)];
    this.poly(blanket, COLOR.blanket);
    const pillow = point(0.21, 0.04, 0.11);
    this.g.fillStyle(COLOR.white, 1).fillEllipse(pillow.x, pillow.y, 52, 14);
    this.g.lineStyle(1, COLOR.line, 0.5).strokeEllipse(pillow.x, pillow.y, 52, 14);
    this.hotspotBounds.set('bed', boundsOf([...pts, ...head]));
  }

  private drawDesk(): void {
    // 오른쪽 안쪽, 창문 옆
    const desk = this.box(0.66, 0.98, 0.0, 0.14, 0.2, { top: COLOR.wood, front: COLOR.woodDark, side: COLOR.woodDark }, 'left');
    const base = point(0.82, 0.04, 0.2);
    this.g.fillStyle(COLOR.monitor, 1).fillRoundedRect(base.x - 26, base.y - 40, 52, 34, 3);
    this.g.fillStyle(COLOR.screen, 1).fillRect(base.x - 22, base.y - 36, 44, 26);
    this.g.fillStyle(COLOR.monitor, 1).fillRect(base.x - 3, base.y - 6, 6, 6);
    // 의자
    const chair = this.box(0.72, 0.88, 0.2, 0.26, 0.09, { top: COLOR.chair, front: 0xd99a74, side: 0xd99a74 }, 'left');
    const back = [point(0.72, 0.26, 0.09), point(0.88, 0.26, 0.09), point(0.88, 0.26, 0.2), point(0.72, 0.26, 0.2)];
    this.poly(back, COLOR.chair);
    this.hotspotBounds.set('desk', boundsOf([...desk, ...chair, ...back, { x: base.x, y: base.y - 40 }]));
  }

  private drawCounter(): void {
    const pts = this.box(0.82, 1.0, 0.34, 0.62, 0.26, { top: COLOR.counterTop, front: COLOR.counter, side: COLOR.counterSide }, 'left');
    // 가스레인지 표시
    const burner = point(0.91, 0.44, 0.26);
    this.g.lineStyle(2, 0x8a8a8a, 0.8).strokeEllipse(burner.x, burner.y, 22, 8);
    this.hotspotBounds.set('counter', boundsOf(pts));
  }

  private drawShoes(): void {
    const pts = this.box(0.84, 1.0, 0.8, 0.97, 0.18, { top: COLOR.wood, front: COLOR.woodDark, side: COLOR.woodDark }, 'left');
    this.hotspotBounds.set('shoes', boundsOf(pts));
  }

  private drawEntrance(): void {
    const mat = [point(0.32, 0.9), point(0.68, 0.9), point(0.7, 0.99), point(0.3, 0.99)];
    this.poly(mat, COLOR.mat, 0.9);
    // 화면 맨 아래가 현관(보는 사람이 서 있는 곳)이다.
    this.hotspotBounds.set('entrance', boundsOf(mat, 4));
  }
}
