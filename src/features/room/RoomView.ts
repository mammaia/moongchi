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
  steel: 0xc9d3d8,
  steelDark: 0x9aa6ad,
  burner: 0x3d3a3a,
  fridge: 0xf1f5f4,
  fridgeSide: 0xdfe7e6,
  paper: 0xfffdf6,
  pen: 0x6c8fd6,
  mug: 0xf6d4a8,
  door: 0xeadcc6,
  mat: 0xd9b7d9,
} as const;

/** 점들을 감싸는 볼록 다각형 (물건 모양대로 누를 수 있게). */
const hullOf = (pts: Pt[]): Pt[] => {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Pt[] = [];
  for (const q of [...p].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
};

const centroidOf = (poly: Pt[]): Pt => {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const f = p.x * q.y - q.x * p.y;
    a += f;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  return a === 0 ? poly[0] : { x: cx / (3 * a), y: cy / (3 * a) };
};

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
  /** 물건 모양 그대로의 누르는 영역과, 그 안의 대표 지점 */
  readonly hotspotShapes = new Map<HotspotId, { hull: Pt[]; tap: Pt }>();
  private readonly g: Phaser.GameObjects.Graphics;

  constructor(private readonly scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(0);
    this.drawShell();
    this.drawWindow();
    this.drawBathroomDoor();
    this.drawBed();
    this.drawDesk();
    this.drawCounter();
    this.drawFridge();
    this.drawEntrance();
  }

  /** 각 물건 위에 작은 이름표와 누를 수 있는 영역을 만든다. */
  createHotspots(onTap: (id: HotspotId) => void): Phaser.GameObjects.Zone[] {
    const zones: Phaser.GameObjects.Zone[] = [];
    for (const [id, b] of this.hotspotBounds) {
      const shape = this.hotspotShapes.get(id);
      const zone = this.scene.add
        .zone(b.x + b.width / 2, b.y + b.height / 2, b.width, b.height)
        .setDepth(1)
        .setName(`hotspot-${id}`);
      if (shape) {
        const local = new Phaser.Geom.Polygon(shape.hull.map((p) => new Phaser.Geom.Point(p.x - b.x, p.y - b.y)));
        zone.setInteractive({ hitArea: local, hitAreaCallback: Phaser.Geom.Polygon.Contains, useHandCursor: true });
      } else {
        zone.setInteractive({ useHandCursor: true });
      }
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
      const label = this.scene.add
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
      // 화면 가장자리에서 이름표가 잘리지 않게 안쪽으로 당긴다.
      const half = label.width / 2 + 4;
      label.x = Phaser.Math.Clamp(label.x, half, WORLD.width - half);
    }
    return zones;
  }

  /** tap: 물건이 겹칠 때 확실히 그 물건이 눌리는 대표 지점 (없으면 모양의 중심). */
  private register(id: HotspotId, pts: Pt[], tap?: Pt): void {
    const hull = hullOf(pts);
    this.hotspotBounds.set(id, boundsOf(pts));
    this.hotspotShapes.set(id, { hull, tap: tap ?? centroidOf(hull) });
  }

  private poly(pts: Pt[], color: number, alpha = 1, stroke = true): void {
    this.g.fillStyle(color, alpha);
    this.g.fillPoints(pts, true);
    if (stroke) {
      this.g.lineStyle(1, COLOR.line, 0.45);
      this.g.strokePoints(pts, true);
    }
  }

  /** 바닥(또는 h0 높이)에 놓인 상자: 윗면, 앞면, 안쪽 옆면을 그린다. */
  private box(
    u0: number, u1: number, t0: number, t1: number, h: number,
    colors: { top: number; front: number; side: number },
    visibleSide: 'left' | 'right',
    h0 = 0,
  ): Pt[] {
    const sideU = visibleSide === 'left' ? u0 : u1;
    const side = [point(sideU, t0, h0), point(sideU, t1, h0), point(sideU, t1, h), point(sideU, t0, h)];
    const front = [point(u0, t1, h0), point(u1, t1, h0), point(u1, t1, h), point(u0, t1, h)];
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
    const frame = { x: 135, y: 165, w: 120, h: 130 };
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
    // 문이 비스듬해서 가늘게 보이므로, 누르는 영역은 오른쪽(화살표 쪽)으로 넉넉히 넓힌다.
    this.register('bathroom', [...door, ...door.map((p) => ({ x: p.x + 22, y: p.y }))]);
  }

  private drawBed(): void {
    // 왼쪽 안쪽. 머리판을 먼저 그리고 그 앞에 매트리스, 이불, 베개.
    const head = [point(0.02, 0, 0), point(0.34, 0, 0), point(0.34, 0, 0.2), point(0.02, 0, 0.2)];
    this.poly(head, COLOR.wood);
    const pts = this.box(0.02, 0.34, 0.0, 0.32, 0.1, { top: COLOR.white, front: COLOR.wood, side: COLOR.woodDark }, 'right');
    const blanket = [point(0.02, 0.1, 0.1), point(0.34, 0.1, 0.1), point(0.34, 0.32, 0.1), point(0.02, 0.32, 0.1)];
    this.poly(blanket, COLOR.blanket);
    const pillow = point(0.18, 0.04, 0.11);
    this.g.fillStyle(COLOR.white, 1).fillEllipse(pillow.x, pillow.y, 52, 14);
    this.g.lineStyle(1, COLOR.line, 0.5).strokeEllipse(pillow.x, pillow.y, 52, 14);
    this.register('bed', [...pts, ...head]);
  }

  private drawDesk(): void {
    // 오른쪽 안쪽, 창문 옆. 모니터는 침대(왼쪽)를 향하고, 의자는 책상 왼쪽에서 모니터를 바라본다.
    const H = 0.2; // 책상 높이
    const desk = this.box(0.68, 0.98, 0.0, 0.16, H, { top: COLOR.wood, front: COLOR.woodDark, side: COLOR.woodDark }, 'left');
    // 모니터: 책상 오른쪽 안 모서리에서 비스듬히 놓아 화면이 왼쪽 앞(침대 쪽)을 보게 한다.
    const m0 = { u: 0.84, t: 0.01 };
    const m1 = { u: 0.96, t: 0.1 };
    const lerp = (k: number) => ({ u: m0.u + (m1.u - m0.u) * k, t: m0.t + (m1.t - m0.t) * k });
    const quad = (k0: number, k1: number, h0: number, h1: number) => {
      const a = lerp(k0);
      const b = lerp(k1);
      return [point(a.u, a.t, h0), point(b.u, b.t, h0), point(b.u, b.t, h1), point(a.u, a.t, h1)];
    };
    this.poly(quad(0.45, 0.55, H, H + 0.05), COLOR.monitor);
    const bezel = quad(0, 1, H + 0.05, H + 0.19);
    this.poly(bezel, COLOR.monitor);
    this.poly(quad(0.06, 0.94, H + 0.062, H + 0.178), COLOR.screen, 1, false);
    // 모니터 아래 책상 위: 펼친 노트, 펜, 머그컵
    // 의자(책상 왼쪽)에 앉아 오른쪽을 보며 쓰는 방향으로 펼친 노트.
    // 앉은 사람 기준 왼쪽 페이지가 안쪽(t 작음), 오른쪽 페이지가 앞쪽이고, 줄은 앞뒤 방향으로 그어진다.
    const nu0 = 0.69, nu1 = 0.8, nt0 = 0.03, nt1 = 0.14, ntMid = (nt0 + nt1) / 2;
    const note = [point(nu0, nt0, H), point(nu1, nt0, H), point(nu1, nt1, H), point(nu0, nt1, H)];
    this.poly(note, COLOR.paper);
    const spineA = point(nu0, ntMid, H);
    const spineB = point(nu1, ntMid, H);
    this.g.lineStyle(1, COLOR.line, 0.8).lineBetween(spineA.x, spineA.y, spineB.x, spineB.y);
    this.g.lineStyle(1, COLOR.screen, 0.9);
    for (const u of [0.715, 0.74, 0.765]) {
      for (const [ta, tb] of [[nt0 + 0.012, ntMid - 0.01], [ntMid + 0.01, nt1 - 0.012]] as const) {
        const a = point(u, ta, H);
        const b = point(u, tb, H);
        this.g.lineBetween(a.x, a.y, b.x, b.y);
      }
    }
    // 오른손 쪽(앞쪽 페이지 옆)에 펜, 노트 위쪽에 연필
    const penA = point(0.72, nt1 + 0.012, H);
    const penB = point(0.79, nt1 + 0.018, H);
    this.g.lineStyle(2, COLOR.pen, 1).lineBetween(penA.x, penA.y, penB.x, penB.y);
    const pencilA = point(0.83, 0.04, H);
    const pencilB = point(0.83, 0.1, H);
    this.g.lineStyle(2, 0xf2c14e, 1).lineBetween(pencilA.x, pencilA.y, pencilB.x, pencilB.y);
    const mug = point(0.88, 0.13, H);
    this.g.fillStyle(COLOR.mug, 1).fillRoundedRect(mug.x - 5, mug.y - 11, 10, 11, 2);
    this.g.lineStyle(1.5, COLOR.mug, 1).strokeCircle(mug.x + 6, mug.y - 6, 3);
    // 의자: 책상 왼쪽에서 모니터를 바라본다. 다리 4개 + 방석 + 등받이
    const legs: [number, number][] = [[0.585, 0.045], [0.645, 0.045], [0.585, 0.115], [0.645, 0.115]];
    this.g.lineStyle(2, COLOR.woodDark, 1);
    for (const [u, t] of legs) {
      const a = point(u, t, 0);
      const b = point(u, t, 0.085);
      this.g.lineBetween(a.x, a.y, b.x, b.y);
    }
    const seat = this.box(0.58, 0.65, 0.04, 0.12, 0.1, { top: COLOR.chair, front: 0xd99a74, side: 0xd99a74 }, 'left', 0.085);
    const back = this.box(0.575, 0.59, 0.045, 0.115, 0.2, { top: COLOR.chair, front: 0xd99a74, side: COLOR.chair }, 'left', 0.1);
    this.register('desk', [...desk, ...bezel, ...seat, ...back]);
  }

  private drawCounter(): void {
    // 한국 원룸식 조리대: 안쪽에 2구 가스레인지, 앞쪽에 싱크대, 옆면에 수납장과 레인지 손잡이
    const H = 0.26;
    const pts = this.box(0.8, 1.0, 0.3, 0.62, H, { top: COLOR.counterTop, front: COLOR.counter, side: COLOR.counterSide }, 'left');
    // 수납장 문
    this.g.lineStyle(1, COLOR.line, 0.7);
    for (const t of [0.4, 0.51]) {
      const a = point(0.8, t, 0.02);
      const b = point(0.8, t, H - 0.05);
      this.g.lineBetween(a.x, a.y, b.x, b.y);
    }
    const knobRow = (t: number) => point(0.8, t, H - 0.025);
    this.g.fillStyle(COLOR.burner, 1);
    for (const t of [0.33, 0.37]) {
      const k = knobRow(t);
      this.g.fillCircle(k.x, k.y, 2.2);
    }
    // 가스레인지 판과 화구 2개
    const range = [point(0.82, 0.31, H), point(0.98, 0.31, H), point(0.98, 0.44, H), point(0.82, 0.44, H)];
    this.poly(range, 0x2f2d2d, 1, false);
    for (const [u, t] of [[0.87, 0.36], [0.93, 0.4]] as const) {
      const c = point(u, t, H);
      this.g.lineStyle(2, 0x8a8a8a, 1).strokeEllipse(c.x, c.y, 16, 6);
      this.g.lineStyle(1, 0x8a8a8a, 1).lineBetween(c.x - 9, c.y, c.x + 9, c.y);
    }
    // 싱크대와 수도꼭지
    const sink = [point(0.83, 0.48, H), point(0.96, 0.48, H), point(0.96, 0.59, H), point(0.83, 0.59, H)];
    this.poly(sink, COLOR.steel);
    const inner = [point(0.85, 0.5, H), point(0.94, 0.5, H), point(0.94, 0.57, H), point(0.85, 0.57, H)];
    this.poly(inner, COLOR.steelDark, 1, false);
    const tapBase = point(0.985, 0.53, H);
    const tapTop = point(0.985, 0.53, H + 0.06);
    this.g.lineStyle(3, COLOR.steelDark, 1).lineBetween(tapBase.x, tapBase.y, tapTop.x, tapTop.y);
    const spout = point(0.95, 0.53, H + 0.06);
    this.g.lineBetween(tapTop.x, tapTop.y, spout.x, spout.y);
    // 앞쪽 아랫부분은 냉장고에 가려지므로 대표 지점은 조리대 윗면 가운데.
    this.register('counter', [...pts, tapTop], point(0.9, 0.46, H));
  }

  private drawFridge(): void {
    // [확정] 신발장 대신 1인 가구용 작은 냉장고. 오른쪽 벽에 반듯하게 붙이고 문은 화장실(왼쪽 벽) 쪽을 향한다.
    // 현관에서 보면 냉장고의 옆판(현관 쪽 면)이 크게 보이고, 문은 비스듬히 좁게 보인다.
    // 그래서 문 두께, 문 쪽으로 튀어나온 손잡이, 냉동/냉장칸 틈을 옆판 가장자리에 그려 냉장고로 보이게 한다.
    const u0 = 0.8, u1 = 1.0, t0 = 0.66, t1 = 0.86, H = 0.3, base = 0.015, split = 0.21;
    const pts = this.box(u0, u1, t0, t1, H, { top: COLOR.fridgeSide, front: COLOR.fridgeSide, side: COLOR.fridge }, 'left', base);
    // 바닥과 닿는 받침(앞쪽 옆판 아래 + 문 아래)
    this.poly([point(u0, t1, 0), point(u1, t1, 0), point(u1, t1, base), point(u0, t1, base)], COLOR.steelDark, 1, false);
    this.poly([point(u0, t0, 0), point(u0, t1, 0), point(u0, t1, base), point(u0, t0, base)], COLOR.steelDark, 1, false);
    // 문 두께: 옆판의 왼쪽(문 쪽) 가장자리를 문 색으로 칠한다.
    const doorU = u0 + 0.025;
    this.poly([point(u0, t1, base), point(doorU, t1, base), point(doorU, t1, H), point(u0, t1, H)], COLOR.fridge);
    // 냉동칸/냉장칸 사이 틈: 문 면과 문 두께에 모두 보이게
    this.g.lineStyle(1.5, COLOR.line, 0.9);
    const sa = point(u0, t0 + 0.01, split), sb = point(u0, t1, split), sc = point(doorU, t1, split);
    this.g.lineBetween(sa.x, sa.y, sb.x, sb.y);
    this.g.lineBetween(sb.x, sb.y, sc.x, sc.y);
    // 문과 몸통 사이 고무 패킹 선
    const ga = point(doorU, t1, base), gb = point(doorU, t1, H);
    this.g.lineStyle(1, COLOR.line, 0.6).lineBetween(ga.x, ga.y, gb.x, gb.y);
    // 손잡이: 문 앞쪽(현관 쪽) 끝에서 화장실 쪽으로 튀어나온 막대
    const handleT = t1 - 0.03, out = 0.035;
    for (const [h0, h1] of [[0.225, 0.275], [0.13, 0.19]] as const) {
      const bar = [point(u0 - out, handleT, h0), point(u0 - out, handleT, h1)];
      this.g.lineStyle(3, COLOR.steelDark, 1).lineBetween(bar[0].x, bar[0].y, bar[1].x, bar[1].y);
      for (const h of [h0, h1]) {
        const a = point(u0, handleT, h), b = point(u0 - out, handleT, h);
        this.g.lineStyle(2, COLOR.steelDark, 1).lineBetween(a.x, a.y, b.x, b.y);
      }
    }
    // 위쪽 모서리 하이라이트와 옆판 아래 통풍구
    const ha = point(doorU + 0.01, t1, H - 0.01), hb = point(u1 - 0.01, t1, H - 0.01);
    this.g.lineStyle(2, COLOR.white, 0.5).lineBetween(ha.x, ha.y, hb.x, hb.y);
    this.g.lineStyle(1, COLOR.line, 0.5);
    for (const h of [0.03, 0.045]) {
      const a = point(0.88, t1, h), b = point(0.96, t1, h);
      this.g.lineBetween(a.x, a.y, b.x, b.y);
    }
    // 옆판에 붙인 자석과 메모들 (냉장고임을 티내는 장식)
    const on = (u: number, h: number) => point(u, t1, h);
    // 노란 메모 + 분홍 동그라미 자석
    const memo = on(0.87, 0.2);
    this.g.fillStyle(0xfbe7a1, 1).fillRect(memo.x - 7, memo.y - 9, 14, 15);
    this.g.lineStyle(1, 0xd9b45a, 0.8).lineBetween(memo.x - 4, memo.y - 2, memo.x + 4, memo.y - 2).lineBetween(memo.x - 4, memo.y + 2, memo.x + 3, memo.y + 2);
    this.g.fillStyle(0xf28aa5, 1).fillCircle(memo.x, memo.y - 9, 2.4);
    // 폴라로이드 사진 (하늘색 배경 + 하얀 동그라미) + 노란 자석
    const photo = on(0.94, 0.23);
    this.g.fillStyle(COLOR.white, 1).fillRect(photo.x - 7, photo.y - 8, 14, 17);
    this.g.lineStyle(1, COLOR.line, 0.4).strokeRect(photo.x - 7, photo.y - 8, 14, 17);
    this.g.fillStyle(COLOR.sky, 1).fillRect(photo.x - 5, photo.y - 6, 10, 9);
    this.g.fillStyle(COLOR.white, 1).fillCircle(photo.x, photo.y - 1, 3);
    this.g.fillStyle(0xf2c14e, 1).fillCircle(photo.x, photo.y - 8, 2.2);
    // 하트 자석
    const heart = on(0.95, 0.14);
    this.g.fillStyle(0xe8607a, 1).fillCircle(heart.x - 2, heart.y, 2.6).fillCircle(heart.x + 2, heart.y, 2.6);
    this.g.fillTriangle(heart.x - 4.5, heart.y + 1, heart.x + 4.5, heart.y + 1, heart.x, heart.y + 6);
    // 딸기 자석
    const berry = on(0.86, 0.12);
    this.g.fillStyle(0xe8504f, 1).fillTriangle(berry.x - 4, berry.y - 2, berry.x + 4, berry.y - 2, berry.x, berry.y + 5);
    this.g.fillCircle(berry.x, berry.y - 2, 4);
    this.g.fillStyle(0x6fbf73, 1).fillTriangle(berry.x - 3, berry.y - 6, berry.x + 3, berry.y - 6, berry.x, berry.y - 3);
    // 작은 장보기 목록 + 초록 자석
    const list = on(0.91, 0.08);
    this.g.fillStyle(COLOR.white, 1).fillRect(list.x - 5, list.y - 7, 10, 13);
    this.g.lineStyle(1, COLOR.screen, 0.9);
    for (const dy of [-3, 0, 3]) this.g.lineBetween(list.x - 3, list.y + dy, list.x + 3, list.y + dy);
    this.g.fillStyle(0x6fbf73, 1).fillCircle(list.x, list.y - 7, 2);
    const handlePts = [point(u0 - out, handleT, 0.13), point(u0 - out, handleT, 0.275)];
    this.register('fridge', [...pts, ...handlePts], point(0.9, t1, 0.12));
  }

  private drawEntrance(): void {
    const mat = [point(0.32, 0.9), point(0.68, 0.9), point(0.7, 0.99), point(0.3, 0.99)];
    this.poly(mat, COLOR.mat, 0.9);
    // 화면 맨 아래가 현관(보는 사람이 서 있는 곳)이다.
    this.register('entrance', mat);
  }
}
