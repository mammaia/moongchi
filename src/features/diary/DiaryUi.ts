import type { GameContext } from '../../context';
import type { DiaryData, DiaryItem, DiaryItemKind, DiaryPage, ItemLayout } from '../../core/diarySchema';
import type { PhotoSummary } from '../../core/photoLibrary';
import { DIARY } from '../../data/diary';
import { PAPERS, STICKERS, TAPES, findPaper, findSticker, findTape, svgUrl } from '../../data/diaryDecor';
import { HOTSPOTS, type HotspotId } from '../../data/room';
import * as R from './rules';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** 저장된 자리(페이지 비율)를 화면 위치로. 휴대폰 크기가 달라도 같은 모양. 글은 높이를 글 길이에 맡긴다. */
function place(node: HTMLElement, layout: ItemLayout, kind: DiaryItemKind): void {
  node.style.left = `${layout.x * 100}%`;
  node.style.top = `${layout.y * 100}%`;
  node.style.width = `${layout.w * 100}%`;
  node.style.height = kind === 'text' ? '' : `${layout.h * 100}%`;
  node.style.transform = layout.rot ? `rotate(${layout.rot}deg)` : '';
  node.style.zIndex = String(Math.round(layout.z));
}

type Point = { x: number; y: number };
type Tray = 'sticker' | 'tape' | 'paper';

/** 손가락으로 물건을 옮기거나 키우는 중인 상태 */
interface Gesture {
  day: string;
  id: string;
  kind: DiaryItemKind;
  node: HTMLElement;
  mode: 'move' | 'handle' | 'pinch';
  /** 지금 모드를 시작할 때의 자리와 손가락 위치 */
  base: ItemLayout;
  origin: Map<number, Point>;
  pointers: Map<number, Point>;
  current: ItemLayout;
  /** 크기 손잡이: 물건 가운데(화면 픽셀) */
  center?: Point;
  moved: boolean;
  wasSelected: boolean;
}

/** 글 쓰는 중인 칸. id가 없으면 아직 한 글자도 안 쓴 새 칸 */
interface Editing {
  day: string;
  id: string | null;
  node: HTMLElement;
  area: HTMLTextAreaElement;
}

/**
 * 바인더 다이어리 화면. 컴퓨터 책상을 누르면 열린다.
 * 하루 한 페이지에 사진·글·스티커·마스킹테이프를 자유롭게 붙이고, 옮기고, 키우고, 돌린다.
 * 기록은 손을 뗄 때마다 진행 상황 저장(diary 서랍)에 들어가 자동 저장된다.
 */
export class DiaryUi {
  private readonly root: HTMLDivElement;
  private readonly page: HTMLDivElement;
  private readonly items: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private readonly dateLine: HTMLDivElement;
  private readonly prevBtn: HTMLButtonElement;
  private readonly nextBtn: HTMLButtonElement;
  private readonly pageNo: HTMLSpanElement;
  private readonly sparkle: HTMLSpanElement;
  private readonly tools: HTMLDivElement;
  private readonly selBar: HTMLDivElement;
  private readonly tray: HTMLDivElement;
  private readonly picker: HTMLDivElement;
  private readonly toast: HTMLDivElement;
  private toastTimer?: ReturnType<typeof setTimeout>;
  private openedFrom: HotspotId | null = null;
  private day = '';
  private selectedId: string | null = null;
  private gesture: Gesture | null = null;
  private editing: Editing | null = null;
  private trayKind: Tray | null = null;
  /** 사진 id → 화면에 쓸 주소 (null = 앨범에서 지워짐). 다이어리를 닫을 때 정리한다. */
  private photoUrls = new Map<string, string | null>();
  private pickerUrls: string[] = [];

  constructor(host: HTMLElement, private readonly ctx: GameContext) {
    this.root = el('div', 'diary');
    this.root.dataset.testid = 'diary';
    this.root.hidden = true;

    // 머리: 제목 · 쪽수 · 스파클 · 닫기
    const head = el('div', 'diary-head');
    this.pageNo = el('span', 'diary-pageno');
    this.pageNo.dataset.testid = 'diary-pageno';
    this.sparkle = el('span', 'diary-sparkle');
    this.sparkle.dataset.testid = 'diary-sparkle';
    const close = el('button', 'icon-btn', '✕');
    close.setAttribute('aria-label', '다이어리 닫기');
    close.dataset.testid = 'diary-close';
    close.addEventListener('click', () => this.close());
    const title = el('div', 'diary-title');
    title.append(el('h2', undefined, '다이어리'), this.pageNo);
    head.append(title, this.sparkle, close);

    // 바인더와 속지
    const stage = el('div', 'diary-stage');
    const binder = el('div', 'diary-binder');
    const rings = el('div', 'diary-rings');
    for (let i = 0; i < 6; i++) rings.append(el('span'));
    this.page = el('div', 'diary-page');
    this.page.dataset.testid = 'diary-page';
    this.dateLine = el('div', 'diary-date');
    this.dateLine.dataset.testid = 'diary-date';
    this.items = el('div', 'diary-items');
    this.hint = el('div', 'diary-hint', DIARY.emptyPageHint);
    this.page.append(this.dateLine, this.hint, this.items);
    binder.append(this.page, rings);
    stage.append(binder);
    this.bindSwipe(stage);
    this.bindGestures();
    // 빈 곳을 누르면 고른 물건 내려놓기, 꾸미기 서랍 닫기
    stage.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('.diary-item, .diary-handle')) return;
      if (this.trayKind) this.closeTray();
      this.select(null);
    });

    // 아래 막대: ◀ [도구들 | 고른 물건 메뉴] ▶
    const bar = el('div', 'diary-bar');
    this.prevBtn = el('button', 'diary-arrow', '◀');
    this.prevBtn.setAttribute('aria-label', '이전 날짜');
    this.prevBtn.dataset.testid = 'diary-prev';
    this.prevBtn.addEventListener('click', () => this.flip(-1));
    this.nextBtn = el('button', 'diary-arrow', '▶');
    this.nextBtn.setAttribute('aria-label', '다음 날짜');
    this.nextBtn.dataset.testid = 'diary-next';
    this.nextBtn.addEventListener('click', () => this.flip(1));
    this.tools = el('div', 'diary-tools');
    this.tools.append(
      this.toolButton('photo', '📷', '사진', () => void this.openPicker(null)),
      this.toolButton('text', '✎', '글', () => this.startEdit(null)),
      this.toolButton('sticker', '★', '스티커', () => this.openTray('sticker')),
      this.toolButton('tape', '▭', '테이프', () => this.openTray('tape')),
      this.toolButton('paper', '▤', '속지', () => this.openTray('paper')),
    );
    this.selBar = el('div', 'diary-tools diary-selbar');
    this.selBar.hidden = true;
    bar.append(this.prevBtn, this.tools, this.selBar, this.nextBtn);

    this.tray = el('div', 'diary-tray');
    this.tray.dataset.testid = 'diary-tray';
    this.tray.hidden = true;

    this.picker = el('div', 'diary-picker');
    this.picker.dataset.testid = 'diary-picker';
    this.picker.hidden = true;
    this.toast = el('div', 'toast diary-toast');
    this.toast.dataset.testid = 'diary-toast';

    this.root.append(head, stage, this.tray, bar, this.picker, this.toast);
    host.append(this.root);

    ctx.bus.on('hotspot:opened', ({ id }) => {
      if (HOTSPOTS[id as HotspotId]?.screen === 'diary') this.open(id as HotspotId);
    });
    // 앨범에서 사진을 지우면 붙여 둔 자리를 다시 그린다 (지워진 사진 안내로 바뀜). 기록은 지우지 않는다.
    ctx.bus.on('photo:deleted', ({ id }) => {
      const url = this.photoUrls.get(id);
      if (url) URL.revokeObjectURL(url);
      this.photoUrls.delete(id);
      if (this.isOpen && !this.editing) this.renderItems();
    });
    ctx.bus.on('sparkle:changed', ({ delta, reason }) => {
      this.renderSparkle();
      if (this.isOpen && reason === 'first-diary-of-day' && delta > 0) this.showToast(`오늘의 첫 기록! ✦ +${delta}`, 2600);
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(from: HotspotId): void {
    if (this.isOpen) return;
    this.openedFrom = from;
    this.day = this.ctx.clock.dayKey();
    this.root.hidden = false;
    this.render();
  }

  close(): void {
    if (!this.isOpen) return;
    this.endEditing();
    this.cancelGesture();
    this.ctx.store.flush();
    this.closePicker();
    this.closeTray();
    this.select(null);
    this.root.hidden = true;
    this.items.replaceChildren();
    this.revokePhotos();
    const from = this.openedFrom;
    this.openedFrom = null;
    if (from) this.ctx.bus.emit('hotspot:done', { id: from });
  }

  private get currentPage(): DiaryPage | undefined {
    return this.ctx.store.get().diary.pages[this.day];
  }

  private days(): string[] {
    return R.pageDays(this.ctx.store.get().diary, this.ctx.clock.dayKey());
  }

  /** 저장 서랍을 고치고, 바로 기기에 저장하고, 다른 기능에 알린다. */
  private commit(day: string, change: (diary: DiaryData) => void): void {
    this.ctx.store.update((d) => change(d.diary));
    this.ctx.store.flush();
    this.ctx.bus.emit('diary:changed', { dayKey: day });
  }

  /** 오늘 사진+글 기록을 마쳤으면 알린다. 보상은 경제 기능이 하루 한 번만 준다. */
  private checkEntry(day: string): void {
    if (R.isEntryComplete(this.ctx.store.get().diary.pages[day], DIARY)) {
      this.ctx.bus.emit('diary:entry-recorded', { dayKey: day });
    }
  }

  // ───────── 페이지 넘기기 ─────────

  private flip(dir: -1 | 1): void {
    const target = R.stepDay(this.days(), this.day, dir);
    if (!target) return;
    this.endEditing();
    this.cancelGesture();
    this.closeTray();
    this.selectedId = null;
    this.day = target;
    this.page.classList.remove('flip-prev', 'flip-next');
    void this.page.offsetWidth; // 애니메이션 다시 시작
    this.page.classList.add(dir > 0 ? 'flip-next' : 'flip-prev');
    this.render();
  }

  /** 페이지를 옆으로 밀어서 넘기기 (터치). 물건이나 글 칸에서 시작한 움직임은 꾸미기라서 무시한다. */
  private bindSwipe(stage: HTMLElement): void {
    let start: { x: number; y: number; id: number } | null = null;
    stage.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('.diary-item, .diary-handle, textarea') || this.editing) return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    });
    stage.addEventListener('pointerup', (e) => {
      if (!start || start.id !== e.pointerId) return;
      const dir = R.swipeDirection(e.clientX - start.x, e.clientY - start.y, DIARY.swipePx);
      start = null;
      if (dir !== 0 && !this.gesture) this.flip(dir);
    });
    stage.addEventListener('pointercancel', () => (start = null));
  }

  // ───────── 그리기 ─────────

  private render(): void {
    this.refreshNav();
    const date = R.formatDiaryDate(this.day);
    this.dateLine.replaceChildren(el('b', undefined, date.date), el('span', undefined, `${date.weekday} · ${date.year}`));
    this.page.dataset.day = this.day;
    this.renderPaper();
    this.renderSparkle();
    this.renderItems();
  }

  private renderPaper(): void {
    const id = this.currentPage?.paper ?? DIARY.defaultPaper;
    const paper = findPaper(id) ?? findPaper(DIARY.defaultPaper)!;
    this.page.dataset.paper = paper.id;
    this.page.style.backgroundColor = paper.color;
    this.page.style.backgroundImage = paper.image;
    this.page.style.backgroundSize = paper.size;
  }

  private renderSparkle(): void {
    this.sparkle.textContent = `✦ ${this.ctx.store.get().wallet.sparkle}`;
  }

  /** 쪽수·화살표만 다시 맞춘다 */
  private refreshNav(): void {
    const days = this.days();
    const at = days.indexOf(this.day);
    this.prevBtn.disabled = R.stepDay(days, this.day, -1) === null;
    this.nextBtn.disabled = R.stepDay(days, this.day, 1) === null;
    this.pageNo.textContent = at >= 0 ? `${at + 1} / ${days.length}` : '';
  }

  /** 페이지의 물건을 모두 다시 그린다 (겹침 순서대로). */
  private renderItems(): void {
    const page = this.currentPage;
    if (this.selectedId && !R.findItem(page, this.selectedId)) this.selectedId = null;
    const nodes = R.sortedItems(page).map((item) => this.buildItem(item));
    this.items.replaceChildren(...nodes.filter((n): n is HTMLElement => n !== null));
    this.hint.hidden = (page?.items.length ?? 0) > 0 || !!this.editing;
    this.renderSelection();
  }

  private buildItem(item: DiaryItem): HTMLElement | null {
    const node = el('div', `diary-item diary-${item.kind}`);
    node.dataset.testid = 'diary-item';
    node.dataset.kind = item.kind;
    node.dataset.id = item.id;
    switch (item.kind) {
      case 'photo': {
        node.setAttribute('aria-label', '붙인 사진');
        const frame = el('div', 'diary-photo-frame');
        node.append(frame);
        void this.fillPhoto(node, frame, item.photoId);
        break;
      }
      case 'text': {
        node.setAttribute('aria-label', '글');
        node.append(el('div', 'diary-text-body', item.text));
        break;
      }
      case 'sticker': {
        const def = findSticker(item.stickerId);
        if (!def) return null; // 목록에서 빠진 스티커: 기록은 두고 그리지만 않는다
        node.setAttribute('aria-label', `${def.name} 스티커`);
        node.dataset.stickerId = def.id;
        const img = el('img');
        img.src = svgUrl(def.svg);
        img.alt = '';
        img.draggable = false;
        node.append(img);
        break;
      }
      case 'tape': {
        const def = findTape(item.tapeId);
        if (!def) return null;
        node.setAttribute('aria-label', `${def.name} 마스킹테이프`);
        node.dataset.tapeId = def.id;
        node.append(el('div', 'diary-tape-body'));
        (node.firstChild as HTMLElement).style.background = def.background;
        break;
      }
    }
    place(node, item.layout, item.kind);
    return node;
  }

  /** 붙인 사진을 사진 보관함에서 꺼내 그린다. 없으면 "지워진 사진" 안내. */
  private async fillPhoto(node: HTMLElement, frame: HTMLElement, photoId: string): Promise<void> {
    node.dataset.state = 'loading';
    let url = this.photoUrls.get(photoId);
    if (url === undefined) {
      let record = null;
      try {
        record = await this.ctx.photos.get(photoId);
      } catch (error) {
        console.error('[diary] 사진 읽기 실패', error);
      }
      // 기다리는 동안 다른 곳에서 같은 사진을 이미 불러왔으면 그것을 쓴다
      url = this.photoUrls.get(photoId);
      if (url === undefined) {
        if (!this.isOpen) return;
        url = record ? URL.createObjectURL(record.image) : null;
        this.photoUrls.set(photoId, url);
      }
    }
    if (!url) {
      node.dataset.state = 'missing';
      frame.replaceChildren(el('span', 'diary-photo-note', DIARY.missingPhotoText), el('span', 'diary-photo-sub', '사진 바꾸기로 다른 사진 고르기'));
      return;
    }
    node.dataset.state = 'photo';
    const img = el('img');
    img.src = url;
    img.alt = '다이어리에 붙인 사진';
    img.draggable = false;
    frame.replaceChildren(img);
  }

  private revokePhotos(): void {
    for (const url of this.photoUrls.values()) if (url) URL.revokeObjectURL(url);
    this.photoUrls.clear();
  }

  // ───────── 고르기 (선택) ─────────

  private select(id: string | null): void {
    if (this.selectedId === id) return;
    this.selectedId = id;
    this.renderSelection();
  }

  /** 고른 물건 표시(점선 + 크기 손잡이)와 아래 막대 메뉴를 맞춘다 */
  private renderSelection(): void {
    for (const node of this.items.querySelectorAll<HTMLElement>('.diary-item')) {
      const on = node.dataset.id === this.selectedId;
      node.classList.toggle('selected', on);
      const handle = node.querySelector('.diary-handle');
      if (on && !handle) {
        const h = el('div', 'diary-handle', '⤡');
        h.dataset.testid = 'diary-handle';
        h.setAttribute('aria-label', '크기·기울기 바꾸기');
        node.append(h);
      } else if (!on) handle?.remove();
    }
    const item = this.selectedId ? R.findItem(this.currentPage, this.selectedId) : undefined;
    this.tools.hidden = !!item;
    this.selBar.hidden = !item;
    if (!item) return;
    const day = this.day;
    const id = item.id;
    const actions: HTMLButtonElement[] = [
      this.toolButton('front', '⬆', '맨 위로', () => {
        this.commit(day, (d) => R.reorderItem(d, day, id, 'front', this.ctx.clock.now()));
        this.renderItems();
      }),
      this.toolButton('back', '⬇', '맨 아래로', () => {
        this.commit(day, (d) => R.reorderItem(d, day, id, 'back', this.ctx.clock.now()));
        this.renderItems();
      }),
    ];
    if (item.kind === 'photo') actions.push(this.toolButton('change', '🖼', '사진 바꾸기', () => void this.openPicker(id)));
    if (item.kind === 'text') actions.push(this.toolButton('edit', '✎', '글 고치기', () => this.startEdit(id)));
    actions.push(
      this.toolButton('delete', '🗑', '떼기', () => {
        this.commit(day, (d) => R.removeItem(d, day, id, this.ctx.clock.now(), DIARY));
        this.selectedId = null;
        this.refreshNav();
        this.renderItems();
      }),
      this.toolButton('done', '✓', '완료', () => this.select(null)),
    );
    this.selBar.replaceChildren(...actions);
  }

  private toolButton(name: string, icon: string, label: string, onTap: () => void): HTMLButtonElement {
    const b = el('button', 'diary-tool');
    b.dataset.testid = `diary-tool-${name}`;
    b.setAttribute('aria-label', label);
    b.append(el('span', 'diary-tool-icon', icon), el('span', 'diary-tool-label', label));
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onTap();
    });
    return b;
  }

  // ───────── 손가락으로 옮기기·키우기·돌리기 ─────────

  private bindGestures(): void {
    this.items.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', (e) => this.onPointerUp(e));
    window.addEventListener('pointercancel', (e) => this.onPointerUp(e, true));
  }

  private onPointerDown(e: PointerEvent): void {
    const target = e.target as HTMLElement;
    if (target.closest('textarea')) return; // 글 쓰는 중: 글자 고르기는 브라우저에 맡긴다
    if (this.editing) {
      // 글을 쓰다가 다른 물건을 누르면 글 쓰기만 마친다
      e.preventDefault();
      this.endEditing();
      return;
    }
    const node = target.closest<HTMLElement>('.diary-item');
    if (!node || !node.dataset.id) return;
    e.preventDefault();
    if (this.trayKind) this.closeTray();
    const p = { x: e.clientX, y: e.clientY };
    const g = this.gesture;
    // 같은 물건에 두 번째 손가락: 두 손가락으로 키우기·돌리기
    if (g && g.id === node.dataset.id && g.pointers.size === 1 && !g.pointers.has(e.pointerId)) {
      g.pointers.set(e.pointerId, p);
      this.restartGesture(g, 'pinch');
      return;
    }
    if (g) return; // 다른 물건을 동시에 만지는 것은 무시
    const item = R.findItem(this.currentPage, node.dataset.id);
    if (!item) return;
    const wasSelected = this.selectedId === item.id;
    this.select(item.id);
    const onHandle = !!target.closest('.diary-handle');
    const gesture: Gesture = {
      day: this.day,
      id: item.id,
      kind: item.kind,
      node,
      mode: onHandle ? 'handle' : 'move',
      base: { ...item.layout },
      origin: new Map(),
      pointers: new Map([[e.pointerId, p]]),
      current: { ...item.layout },
      moved: false,
      wasSelected,
    };
    this.restartGesture(gesture, gesture.mode);
    this.gesture = gesture;
  }

  /** 지금 자리와 손가락 위치를 새 기준으로 삼아 모드를 바꾼다 (손가락 수가 바뀔 때) */
  private restartGesture(g: Gesture, mode: Gesture['mode']): void {
    g.mode = mode;
    g.base = { ...g.current };
    g.origin = new Map([...g.pointers].map(([k, v]) => [k, { ...v }]));
    if (mode === 'handle') {
      const r = this.page.getBoundingClientRect();
      g.center = { x: r.left + (g.base.x + g.base.w / 2) * r.width, y: r.top + (g.base.y + g.base.h / 2) * r.height };
      if (g.kind === 'text') {
        // 글은 높이를 글 길이에 맡기므로 실제 그려진 높이로 가운데를 잡는다
        g.center.y = r.top + g.base.y * r.height + g.node.offsetHeight / 2;
      }
    }
  }

  private onPointerMove(e: PointerEvent): void {
    const g = this.gesture;
    if (!g || !g.pointers.has(e.pointerId)) return;
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = this.page.getBoundingClientRect();
    if (r.width <= 0) return;
    let change: Parameters<typeof R.transformLayout>[1] = {};
    if (g.mode === 'move') {
      const o = g.origin.get(e.pointerId)!;
      const dxPx = e.clientX - o.x;
      const dyPx = e.clientY - o.y;
      if (!g.moved && Math.hypot(dxPx, dyPx) < DIARY.dragStartPx) return;
      change = { dx: dxPx / r.width, dy: dyPx / r.height };
    } else if (g.mode === 'handle') {
      const o = g.origin.get(e.pointerId)!;
      if (!g.moved && Math.hypot(e.clientX - o.x, e.clientY - o.y) < DIARY.dragStartPx) return;
      change = R.pinchChange(g.center!, o, g.center!, { x: e.clientX, y: e.clientY });
    } else {
      const ids = [...g.pointers.keys()];
      const [a0, b0] = ids.map((k) => g.origin.get(k)!);
      const [a1, b1] = ids.map((k) => g.pointers.get(k)!);
      if (!a0 || !b0 || !a1 || !b1) return;
      const pinch = R.pinchChange(a0, b0, a1, b1);
      change = {
        ...pinch,
        dx: ((a1.x + b1.x) / 2 - (a0.x + b0.x) / 2) / r.width,
        dy: ((a1.y + b1.y) / 2 - (a0.y + b0.y) / 2) / r.height,
      };
    }
    g.moved = true;
    g.current = R.transformLayout(g.base, change, g.kind, DIARY);
    g.node.classList.add('dragging');
    place(g.node, g.current, g.kind);
  }

  private onPointerUp(e: PointerEvent, cancelled = false): void {
    const g = this.gesture;
    if (!g || !g.pointers.has(e.pointerId)) return;
    g.pointers.delete(e.pointerId);
    if (g.pointers.size > 0) {
      // 두 손가락 중 하나를 뗐다: 남은 손가락으로 계속 옮기기
      this.restartGesture(g, 'move');
      return;
    }
    this.gesture = null;
    g.node.classList.remove('dragging');
    if (g.moved && !cancelled) {
      this.commit(g.day, (d) => R.setItemLayout(d, g.day, g.id, g.current, this.ctx.clock.now(), DIARY));
      if (g.kind === 'text') this.syncTextHeight(g.day, g.id);
      return;
    }
    if (cancelled) {
      const item = R.findItem(this.ctx.store.get().diary.pages[g.day], g.id);
      if (item) place(g.node, item.layout, item.kind);
      return;
    }
    // 톡 누르기: 이미 고른 글을 한 번 더 누르면 고쳐 쓰기
    if (g.wasSelected && g.kind === 'text') this.startEdit(g.id);
  }

  private cancelGesture(): void {
    if (!this.gesture) return;
    this.gesture.node.classList.remove('dragging');
    this.gesture = null;
  }

  /** 글 칸의 실제 높이를 저장해 둔다 (페이지 밖으로 나가지 않게 계산할 때 쓴다) */
  private syncTextHeight(day: string, id: string): void {
    if (day !== this.day) return;
    const node = this.items.querySelector<HTMLElement>(`.diary-item[data-id="${CSS.escape(id)}"]`);
    const ph = this.page.getBoundingClientRect().height;
    const item = R.findItem(this.currentPage, id);
    if (!node || !item || ph <= 0) return;
    const h = node.offsetHeight / ph;
    if (Math.abs(h - item.layout.h) < 0.003) return;
    this.ctx.store.update((d) => R.setItemLayout(d.diary, day, id, { ...item.layout, h }, this.ctx.clock.now(), DIARY));
    const fixed = R.findItem(this.currentPage, id);
    if (fixed) place(node, fixed.layout, 'text');
  }

  // ───────── 글 쓰기 ─────────

  /** 글 칸을 열어 쓰기 시작한다. id가 null이면 새 글 칸. 휴대폰 자판이 뜨도록 누른 순간 바로 초점을 준다. */
  private startEdit(id: string | null): void {
    this.endEditing();
    this.closeTray();
    const day = this.day;
    let layout: ItemLayout;
    let text = '';
    if (id) {
      const item = R.findItem(this.currentPage, id);
      if (!item || item.kind !== 'text') return;
      layout = item.layout;
      text = item.text;
    } else {
      // 새 글이 놓일 자리를 미리 계산 (실제로 저장하지는 않는다)
      const probe = structuredClone(this.ctx.store.get().diary);
      const pid = R.addText(probe, day, '·', this.ctx.clock.now(), DIARY, () => '__probe__');
      if (!pid) {
        this.showToast('이 페이지는 가득 찼어요');
        return;
      }
      layout = R.findItem(probe.pages[day], pid)!.layout;
      this.select(null);
    }
    this.selectedId = id;
    const node = id
      ? this.items.querySelector<HTMLElement>(`.diary-item[data-id="${CSS.escape(id)}"]`) ?? el('div')
      : el('div', 'diary-item diary-text');
    node.classList.add('editing');
    node.classList.remove('selected');
    node.querySelector('.diary-handle')?.remove();
    if (!node.isConnected) this.items.append(node);
    place(node, layout, 'text');
    node.style.zIndex = '999';

    const area = el('textarea', 'diary-text-input');
    area.dataset.testid = 'diary-text-input';
    area.maxLength = DIARY.textMaxLength;
    area.rows = 3;
    area.placeholder = DIARY.textPlaceholder;
    area.setAttribute('aria-label', '글 쓰기');
    area.value = text;
    const count = el('span', 'diary-count');
    count.dataset.testid = 'diary-count';
    const showCount = () => (count.textContent = `${[...area.value].length} / ${DIARY.textMaxLength}`);
    showCount();
    node.replaceChildren(area, count);
    this.hint.hidden = true;
    this.tools.hidden = true;
    // 쓰는 동안 아래 막대에는 "완료"만 (누르면 글 칸에서 초점이 빠지며 저장된다)
    this.selBar.replaceChildren(this.toolButton('done', '✓', '완료', () => this.endEditing()));
    this.selBar.hidden = false;

    const editing: Editing = { day, id, node, area };
    this.editing = editing;
    const fit = () => {
      area.style.height = 'auto';
      area.style.height = `${area.scrollHeight}px`;
    };
    // 한 글자 쓸 때마다 저장 서랍에 넣는다. 실제 기기 저장은 GameStore가 잠깐 모아서 한다.
    area.addEventListener('input', () => {
      showCount();
      fit();
      const value = area.value;
      if (value.trim() === '') return; // 다 지운 상태는 다 쓰고 나갈 때 정리한다
      const now = this.ctx.clock.now();
      if (editing.id) {
        const eid = editing.id;
        this.ctx.store.update((d) => R.setItemText(d.diary, day, eid, value, now, DIARY));
      } else {
        let newId: string | null = null;
        this.ctx.store.update((d) => void (newId = R.addText(d.diary, day, value, now, DIARY)));
        editing.id = newId;
        if (newId) node.dataset.id = newId;
        this.refreshNav();
      }
    });
    area.addEventListener('blur', () => this.endEditing());
    area.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') area.blur();
    });
    area.focus();
    fit();
  }

  /** 글 쓰기를 마친다: 빈 글이면 칸을 떼고, 아니면 저장하고 보상 조건을 확인한다. */
  private endEditing(): void {
    const editing = this.editing;
    if (!editing) return;
    this.editing = null;
    const { day, id, area } = editing;
    const value = area.value;
    if (id) {
      this.commit(day, (d) => R.setItemText(d, day, id, value, this.ctx.clock.now(), DIARY));
    }
    if (document.activeElement === area) area.blur();
    if (day !== this.day || !this.isOpen) return;
    const stillThere = id ? R.findItem(this.currentPage, id) : undefined;
    this.selectedId = null; // 다 쓰면 내려놓고 도구 막대로 돌아간다
    this.refreshNav();
    this.renderItems();
    if (stillThere && id) {
      this.syncTextHeight(day, id);
      this.checkEntry(day);
    }
  }

  // ───────── 스티커·테이프·속지 서랍 ─────────

  private openTray(kind: Tray): void {
    this.endEditing();
    this.select(null);
    if (this.trayKind === kind) {
      this.closeTray();
      return;
    }
    this.trayKind = kind;
    const day = this.day;
    const head = el('div', 'diary-tray-head');
    head.append(el('b', undefined, kind === 'sticker' ? '스티커' : kind === 'tape' ? '마스킹테이프' : '속지 (이 페이지만)'));
    const close = el('button', 'icon-btn small', '✕');
    close.setAttribute('aria-label', '닫기');
    close.dataset.testid = 'diary-tray-close';
    close.addEventListener('click', () => this.closeTray());
    head.append(close);
    const grid = el('div', `diary-tray-grid ${kind}`);

    if (kind === 'sticker') {
      for (const def of STICKERS) {
        const b = el('button', 'diary-option');
        b.dataset.testid = 'diary-sticker-option';
        b.dataset.stickerId = def.id;
        b.setAttribute('aria-label', `${def.name} 스티커 붙이기`);
        const img = el('img');
        img.src = svgUrl(def.svg);
        img.alt = '';
        b.append(img);
        b.addEventListener('click', () => this.addDecor(day, (d, now) => R.addSticker(d, day, def.id, def.aspect, now, DIARY)));
        grid.append(b);
      }
    } else if (kind === 'tape') {
      for (const def of TAPES) {
        const b = el('button', 'diary-option tape');
        b.dataset.testid = 'diary-tape-option';
        b.dataset.tapeId = def.id;
        b.setAttribute('aria-label', `${def.name} 테이프 붙이기`);
        const swatch = el('span', 'diary-tape-body');
        swatch.style.background = def.background;
        b.append(swatch, el('span', 'diary-option-name', def.name));
        b.addEventListener('click', () => this.addDecor(day, (d, now) => R.addTape(d, day, def.id, def.aspect, now, DIARY)));
        grid.append(b);
      }
    } else {
      const current = this.currentPage?.paper ?? DIARY.defaultPaper;
      for (const def of PAPERS) {
        const b = el('button', 'diary-option paper');
        b.dataset.testid = 'diary-paper-option';
        b.dataset.paperId = def.id;
        b.classList.toggle('on', def.id === current);
        b.setAttribute('aria-label', `${def.name} 속지`);
        const swatch = el('span', 'diary-paper-swatch');
        swatch.style.backgroundColor = def.color;
        swatch.style.backgroundImage = def.image;
        swatch.style.backgroundSize = def.size;
        b.append(swatch, el('span', 'diary-option-name', def.name));
        b.addEventListener('click', () => {
          this.commit(day, (d) => R.setPaper(d, day, def.id, this.ctx.clock.now(), DIARY));
          for (const o of grid.querySelectorAll<HTMLElement>('.diary-option')) o.classList.toggle('on', o === b);
          this.refreshNav();
          this.renderPaper();
        });
        grid.append(b);
      }
    }
    this.tray.replaceChildren(head, grid);
    this.tray.hidden = false;
  }

  private addDecor(day: string, add: (d: DiaryData, now: number) => string | null): void {
    if (day !== this.day) return;
    let id: string | null = null;
    this.commit(day, (d) => void (id = add(d, this.ctx.clock.now())));
    this.closeTray();
    if (!id) {
      this.showToast('이 페이지는 가득 찼어요');
      return;
    }
    this.selectedId = id;
    this.refreshNav();
    this.renderItems();
  }

  private closeTray(): void {
    this.trayKind = null;
    this.tray.hidden = true;
    this.tray.replaceChildren();
  }

  // ───────── 사진 고르기 ─────────

  /** replaceId가 있으면 그 사진을 바꾸고, 없으면 새 사진을 붙인다. */
  private async openPicker(replaceId: string | null): Promise<void> {
    this.endEditing();
    this.closeTray();
    const day = this.day;
    const head = el('div', 'album-head');
    head.append(el('h2', undefined, replaceId ? '사진 바꾸기' : '사진 붙이기'));
    const close = el('button', 'icon-btn', '✕');
    close.setAttribute('aria-label', '사진 고르기 닫기');
    close.dataset.testid = 'diary-picker-close';
    close.addEventListener('click', () => this.closePicker());
    head.append(close);

    const body = el('div', 'album-body');
    let photos: PhotoSummary[] = [];
    try {
      photos = await this.ctx.photos.list();
    } catch (error) {
      console.error('[diary] 앨범 읽기 실패', error);
      body.append(el('p', 'album-empty', '앨범을 불러오지 못했어요.'));
    }
    this.revokePickerUrls();

    if (photos.length === 0 && !body.querySelector('.album-empty')) {
      body.append(el('p', 'album-empty', '앨범에 사진이 없어요.\n방에서 카메라 버튼으로 뭉치를 찍어 보세요.'));
    }
    for (const group of R.groupForPicker(photos, day)) {
      const section = el('section', 'album-day');
      const d = R.formatDiaryDate(group.dayKey);
      section.append(el('h3', undefined, `${d.date} ${d.weekday}${group.dayKey === day ? ' · 이 날' : ''}`));
      const grid = el('div', 'album-grid');
      for (const photo of group.photos) {
        const url = URL.createObjectURL(photo.thumb);
        this.pickerUrls.push(url);
        const cell = el('button', 'album-cell');
        cell.dataset.testid = 'diary-pick';
        cell.dataset.photoId = photo.id;
        cell.setAttribute('aria-label', `${d.date} 사진 고르기`);
        const img = el('img');
        img.src = url;
        img.alt = '';
        cell.append(img);
        cell.addEventListener('click', () => this.pickPhoto(day, replaceId, photo));
        grid.append(cell);
      }
      section.append(grid);
      body.append(section);
    }
    this.picker.replaceChildren(head, body);
    this.picker.hidden = false;
  }

  private pickPhoto(day: string, replaceId: string | null, photo: PhotoSummary): void {
    const now = this.ctx.clock.now();
    let id: string | null = replaceId;
    if (replaceId) this.commit(day, (d) => R.replacePhoto(d, day, replaceId, photo.id, photo, now, DIARY));
    else this.commit(day, (d) => void (id = R.addPhoto(d, day, photo.id, photo, now, DIARY)));
    this.closePicker();
    if (!id) {
      this.showToast('이 페이지는 가득 찼어요');
      return;
    }
    if (day === this.day) {
      this.selectedId = id;
      this.refreshNav();
      this.renderItems();
    }
    this.showToast(replaceId ? '사진을 바꿨어요' : '사진을 붙였어요');
    this.checkEntry(day);
  }

  private closePicker(): void {
    this.picker.hidden = true;
    this.picker.replaceChildren();
    this.revokePickerUrls();
  }

  private revokePickerUrls(): void {
    for (const url of this.pickerUrls) URL.revokeObjectURL(url);
    this.pickerUrls = [];
  }

  private showToast(text: string, ms = 1600): void {
    this.toast.textContent = text;
    this.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.classList.remove('show'), ms);
  }
}

