import Phaser from 'phaser';
import type { GameContext } from '../context';
import { HOTSPOTS, type HotspotId } from '../data/room';
import { MungchiController } from '../features/character';
import { RoomView } from '../features/room/RoomView';
import { WORLD } from '../features/room/perspective';
import type { UiLayer } from '../ui/UiLayer';

/** 그림을 선명하게 그리기 위한 기본 배율 (화면 좌표 390x844를 2배 해상도로). */
export const RENDER_SCALE = 2;
const ZOOM_IN = 1.9;

/** 메인 화면: 현관에서 바라본 원룸 전체. 물건을 누르면 그 부분을 확대해 보여준다. */
export class RoomScene extends Phaser.Scene {
  mungchi!: MungchiController;
  private room!: RoomView;
  private zoomedOn: HotspotId | null = null;
  /** 확대/축소 움직임이 끝나기 전에는 다른 물건을 열지 않는다. */
  private busyUntil = 0;

  constructor(private readonly ctx: GameContext, private readonly ui: UiLayer) {
    super('room');
  }

  create(): void {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD.width, WORLD.height);
    cam.setZoom(RENDER_SCALE);
    cam.centerOn(WORLD.width / 2, WORLD.height / 2);
    cam.setBackgroundColor('#f6efe4');

    this.room = new RoomView(this);
    this.room.createHotspots((id) => this.openHotspot(id));
    this.mungchi = new MungchiController(this, this.ctx);
  }

  update(_time: number, delta: number): void {
    this.mungchi.update(delta);
  }

  /** 테스트용: 뭉치의 현재 위치를 브라우저 화면 좌표로 알려준다. */
  mungchiClientPoint(): { x: number; y: number } {
    return this.worldToClient(this.mungchi.view.x, this.mungchi.view.y);
  }

  hotspotClientPoint(id: HotspotId): { x: number; y: number } | null {
    const shape = this.room.hotspotShapes.get(id);
    if (shape) return this.worldToClient(shape.tap.x, shape.tap.y);
    const b = this.room.hotspotBounds.get(id);
    if (!b) return null;
    return this.worldToClient(b.x + b.width / 2, b.y + b.height / 2);
  }

  get zoomedHotspot(): HotspotId | null {
    return this.zoomedOn;
  }

  private worldToClient(x: number, y: number): { x: number; y: number } {
    const cam = this.cameras.main;
    const sx = (x - cam.worldView.x) * cam.zoom;
    const sy = (y - cam.worldView.y) * cam.zoom;
    const rect = this.game.canvas.getBoundingClientRect();
    return {
      x: rect.left + (sx / this.scale.width) * rect.width,
      y: rect.top + (sy / this.scale.height) * rect.height,
    };
  }

  private openHotspot(id: HotspotId): void {
    if (this.zoomedOn || this.ui.isSheetOpen || this.time.now < this.busyUntil) return;
    const b = this.room.hotspotBounds.get(id);
    if (!b) return;
    this.zoomedOn = id;
    const cam = this.cameras.main;
    cam.pan(b.x + b.width / 2, b.y + b.height / 2 + 60, 450, 'Sine.easeInOut');
    cam.zoomTo(RENDER_SCALE * ZOOM_IN, 450, 'Sine.easeInOut');
    this.ctx.bus.emit('hotspot:opened', { id });
    this.ui.openDetail(HOTSPOTS[id], () => this.closeHotspot());
  }

  private closeHotspot(): void {
    if (!this.zoomedOn) return;
    const id = this.zoomedOn;
    const cam = this.cameras.main;
    cam.pan(WORLD.width / 2, WORLD.height / 2, 400, 'Sine.easeInOut');
    cam.zoomTo(RENDER_SCALE, 400, 'Sine.easeInOut');
    this.zoomedOn = null;
    this.busyUntil = this.time.now + 420;
    this.ctx.bus.emit('hotspot:closed', { id });
  }
}
