import Phaser from 'phaser';
import type { GameContext } from './context';
import { Clock } from './core/clock';
import { EventBus } from './core/events';
import { createBrowserPhotoLibrary } from './core/photoLibrary';
import { SaveSystem } from './core/saveSystem';
import { GameStore } from './core/store';
import { createBrowserStorage } from './core/storage';
import { installDiary } from './features/diary';
import { installEconomy } from './features/economy';
import { installPhoto } from './features/photo';
import { WORLD } from './features/room/perspective';
import { RENDER_SCALE, RoomScene } from './scenes/RoomScene';
import { installDevPanel } from './ui/devPanel';
import { UiLayer } from './ui/UiLayer';

// 1) 공통 기반
const storage = createBrowserStorage();
const clock = new Clock(storage);
const saves = new SaveSystem(storage);
const store = new GameStore(saves.load(clock.now()), (state) => saves.write(state));
const bus = new EventBus();
const photos = createBrowserPhotoLibrary();
const ctx: GameContext = { bus, store, clock, saves, photos };

// 2) 기능 끼우기. 새 기능은 여기에 한 줄씩 추가한다.
installEconomy(ctx);

// 3) 화면
const uiRoot = document.getElementById('ui')!;
const ui = new UiLayer(uiRoot, ctx);
const params = new URLSearchParams(window.location.search);
if (params.has('dev')) installDevPanel(uiRoot, ctx);

const scene = new RoomScene(ctx, ui);
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#f6efe4',
  width: WORLD.width * RENDER_SCALE,
  height: WORLD.height * RENDER_SCALE,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  // HTML 버튼을 누를 때 그 아래 방 물건까지 눌리지 않도록 캔버스 밖 입력은 무시한다.
  input: { activePointers: 2, windowEvents: false },
  scene: [scene],
});
installPhoto(ctx, uiRoot, () => scene.takePhoto());
installDiary(ctx, uiRoot);

// 4) 앱을 닫거나 뒤로 보낼 때 바로 저장
const saveNow = () => {
  store.update((d) => void (d.progress.lastSeenAt = clock.now()));
  store.flush();
};
let hiddenAt: number | null = null;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    hiddenAt = clock.now();
    saveNow();
  } else if (hiddenAt !== null) {
    bus.emit('app:resumed', { awayMs: clock.now() - hiddenAt });
    hiddenAt = null;
  }
});
window.addEventListener('pagehide', saveNow);

// 5) 자동 테스트가 게임 상태를 들여다볼 수 있는 창구 (읽기 위주)
declare global {
  interface Window {
    __moongchi?: unknown;
  }
}
window.__moongchi = {
  ready: () => game.isBooted && scene.sys?.isActive() === true && !!scene.mungchi,
  state: () => store.get(),
  today: () => clock.dayKey(),
  mungchiPoint: () => scene.mungchiClientPoint(),
  hotspotPoint: (id: Parameters<RoomScene['hotspotClientPoint']>[0]) => scene.hotspotClientPoint(id),
  zoomedHotspot: () => scene.zoomedHotspot,
  freezeMungchi: (value = true) => scene.mungchi.setFrozen(value),
  activity: () => scene.mungchi.activity,
  settling: () => scene.mungchi.settling,
  toys: () => scene.mungchi.toysInRoom,
  onFurniture: () => scene.mungchi.onFurniture,
  resume: (awayMs: number) => bus.emit('app:resumed', { awayMs }),
  openHotspotEvent: (id: string) => bus.emit('hotspot:opened', { id }),
  photoCount: async () => (await photos.list()).length,
  photoSizes: async () => (await photos.list()).map((p) => [p.width, p.height]),
  diary: () => store.get().diary,
  forceActivity: (a: Parameters<RoomScene['mungchi']['forceActivity']>[0]) => scene.mungchi.forceActivity(a),
};
