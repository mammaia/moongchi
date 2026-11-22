import type { GameContext } from '../../context';
import type { DiaryPage, ItemLayout } from '../../core/diarySchema';
import type { PhotoSummary } from '../../core/photoLibrary';
import { DIARY } from '../../data/diary';
import { HOTSPOTS, type HotspotId } from '../../data/room';
import {
  formatDiaryDate,
  groupForPicker,
  pageCaption,
  pageDays,
  pagePhoto,
  removePagePhoto,
  setPageCaption,
  setPagePhoto,
  stepDay,
  swipeDirection,
  type PageDefaults,
} from './rules';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const DEFAULTS: PageDefaults = {
  paper: DIARY.defaultPaper,
  photoLayout: DIARY.photoLayout,
  captionLayout: DIARY.captionLayout,
  captionMaxLength: DIARY.captionMaxLength,
  pageAspect: DIARY.pageAspect,
  photoMax: DIARY.photoMax,
  photoFrame: DIARY.photoFrame,
};

/** 저장된 자리(페이지 비율)를 화면 위치로. 휴대폰 크기가 달라도 같은 모양. */
function place(node: HTMLElement, layout: Omit<ItemLayout, 'z'> & { z?: number }): void {
  node.style.left = `${layout.x * 100}%`;
  node.style.top = `${layout.y * 100}%`;
  node.style.width = `${layout.w * 100}%`;
  node.style.height = `${layout.h * 100}%`;
  node.style.transform = layout.rot ? `rotate(${layout.rot}deg)` : '';
  if (layout.z !== undefined) node.style.zIndex = String(layout.z);
}

/**
 * 바인더 다이어리 화면. 컴퓨터 책상을 누르면 열린다.
 * 하루 한 페이지: 앨범 사진 한 장 + 사진 아래 짧은 글. 앞뒤로 넘겨볼 수 있다.
 * 기록은 진행 상황 저장(diary 서랍)에 바로바로 들어가 자동 저장된다.
 */
export class DiaryUi {
  private readonly root: HTMLDivElement;
  private readonly page: HTMLDivElement;
  private readonly items: HTMLDivElement;
  private readonly dateLine: HTMLDivElement;
  private readonly prevBtn: HTMLButtonElement;
  private readonly nextBtn: HTMLButtonElement;
  private readonly pageNo: HTMLSpanElement;
  private readonly picker: HTMLDivElement;
  private readonly toast: HTMLDivElement;
  private toastTimer?: ReturnType<typeof setTimeout>;
  private openedFrom: HotspotId | null = null;
  private day = '';
  /** 사진을 비동기로 불러오는 동안 페이지가 바뀌면 늦게 온 사진은 버린다. */
  private renderToken = 0;
  private photoUrl: string | null = null;
  private pickerUrls: string[] = [];

  constructor(host: HTMLElement, private readonly ctx: GameContext) {
    this.root = el('div', 'diary');
    this.root.dataset.testid = 'diary';
    this.root.hidden = true;

    const head = el('div', 'diary-head');
    head.append(el('h2', undefined, '다이어리'));
    const close = el('button', 'icon-btn', '✕');
    close.setAttribute('aria-label', '다이어리 닫기');
    close.dataset.testid = 'diary-close';
    close.addEventListener('click', () => this.close());
    head.append(close);

    const stage = el('div', 'diary-stage');
    const binder = el('div', 'diary-binder');
    const rings = el('div', 'diary-rings');
    for (let i = 0; i < 6; i++) rings.append(el('span'));
    this.page = el('div', 'diary-page');
    this.page.dataset.testid = 'diary-page';
    this.dateLine = el('div', 'diary-date');
    this.dateLine.dataset.testid = 'diary-date';
    this.items = el('div', 'diary-items');
    this.page.append(this.dateLine, this.items);
    binder.append(this.page, rings);
    stage.append(binder);
    this.bindSwipe(stage);

    const nav = el('div', 'diary-nav');
    this.prevBtn = el('button', 'diary-arrow', '◀');
    this.prevBtn.setAttribute('aria-label', '이전 날짜');
    this.prevBtn.dataset.testid = 'diary-prev';
    this.prevBtn.addEventListener('click', () => this.flip(-1));
    this.nextBtn = el('button', 'diary-arrow', '▶');
    this.nextBtn.setAttribute('aria-label', '다음 날짜');
    this.nextBtn.dataset.testid = 'diary-next';
    this.nextBtn.addEventListener('click', () => this.flip(1));
    this.pageNo = el('span', 'diary-pageno');
    this.pageNo.dataset.testid = 'diary-pageno';
    nav.append(this.prevBtn, this.pageNo, this.nextBtn);

    this.picker = el('div', 'diary-picker');
    this.picker.dataset.testid = 'diary-picker';
    this.picker.hidden = true;
    this.toast = el('div', 'toast diary-toast');

    this.root.append(head, stage, nav, this.picker, this.toast);
    host.append(this.root);

    ctx.bus.on('hotspot:opened', ({ id }) => {
      if (HOTSPOTS[id as HotspotId]?.screen === 'diary') this.open(id as HotspotId);
    });
    // 앨범에서 사진을 지우면 붙여 둔 자리를 다시 그린다 (지워진 사진 안내로 바뀜). 기록은 지우지 않는다.
    ctx.bus.on('photo:deleted', () => {
      if (this.isOpen) void this.renderPhoto();
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
    // 쓰던 글이 있으면 바로 저장
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.ctx.store.flush();
    this.closePicker();
    this.root.hidden = true;
    this.items.replaceChildren();
    this.revokePhoto();
    const from = this.openedFrom;
    this.openedFrom = null;
    if (from) this.ctx.bus.emit('hotspot:done', { id: from });
  }

  private get currentPage(): DiaryPage | undefined {
    return this.ctx.store.get().diary.pages[this.day];
  }

  private days(): string[] {
    return pageDays(this.ctx.store.get().diary, this.ctx.clock.dayKey());
  }

  // ───────── 페이지 넘기기 ─────────

  private flip(dir: -1 | 1): void {
    const target = stepDay(this.days(), this.day, dir);
    if (!target) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.day = target;
    this.page.classList.remove('flip-prev', 'flip-next');
    void this.page.offsetWidth; // 애니메이션 다시 시작
    this.page.classList.add(dir > 0 ? 'flip-next' : 'flip-prev');
    this.render();
  }

  /** 페이지를 옆으로 밀어서 넘기기 (터치). 글 칸 안에서 시작한 움직임은 글 고르기라서 무시한다. */
  private bindSwipe(stage: HTMLElement): void {
    let start: { x: number; y: number; id: number } | null = null;
    stage.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('textarea')) return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    });
    stage.addEventListener('pointerup', (e) => {
      if (!start || start.id !== e.pointerId) return;
      const dir = swipeDirection(e.clientX - start.x, e.clientY - start.y, DIARY.swipePx);
      start = null;
      if (dir !== 0) this.flip(dir);
    });
    stage.addEventListener('pointercancel', () => (start = null));
  }

  // ───────── 그리기 ─────────

  private render(): void {
    const days = this.days();
    const at = days.indexOf(this.day);
    this.prevBtn.disabled = stepDay(days, this.day, -1) === null;
    this.nextBtn.disabled = stepDay(days, this.day, 1) === null;
    this.pageNo.textContent = at >= 0 ? `${at + 1} / ${days.length}` : '';

    const date = formatDiaryDate(this.day);
    this.dateLine.replaceChildren(el('b', undefined, date.date), el('span', undefined, `${date.weekday} · ${date.year}`));
    this.page.dataset.day = this.day;
    this.page.dataset.paper = this.currentPage?.paper ?? DIARY.defaultPaper;

    this.items.replaceChildren(this.buildPhotoSlot(), this.buildCaption());
    void this.renderPhoto();
  }

  private buildPhotoSlot(): HTMLElement {
    const slot = el('button', 'diary-photo');
    slot.dataset.testid = 'diary-photo';
    place(slot, pagePhoto(this.currentPage)?.layout ?? { ...DIARY.photoLayout, z: 1 });
    slot.addEventListener('click', () => void this.openPicker());
    return slot;
  }

  /** 붙인 사진을 사진 보관함에서 꺼내 그린다. 없으면 빈 자리 또는 "지워진 사진" 안내. */
  private async renderPhoto(): Promise<void> {
    const token = ++this.renderToken;
    const slot = this.items.querySelector<HTMLElement>('.diary-photo');
    if (!slot) return;
    const item = pagePhoto(this.currentPage);
    const setState = (state: 'empty' | 'loading' | 'photo' | 'missing') => (slot.dataset.state = state);

    if (!item) {
      setState('empty');
      slot.setAttribute('aria-label', DIARY.emptyPhotoText);
      slot.replaceChildren(el('span', 'diary-photo-plus', '+'), el('span', 'diary-photo-note', DIARY.emptyPhotoText));
      return;
    }
    setState('loading');
    let record = null;
    try {
      record = await this.ctx.photos.get(item.photoId);
    } catch (error) {
      console.error('[diary] 사진 읽기 실패', error);
    }
    if (token !== this.renderToken) return; // 그새 다른 페이지로 넘어감
    this.revokePhoto();
    if (!record) {
      setState('missing');
      slot.setAttribute('aria-label', '지워진 사진. 눌러서 다른 사진 고르기');
      slot.replaceChildren(
        el('span', 'diary-photo-note', DIARY.missingPhotoText),
        el('span', 'diary-photo-sub', '눌러서 다른 사진 고르기'),
      );
      return;
    }
    setState('photo');
    this.photoUrl = URL.createObjectURL(record.image);
    const img = el('img');
    img.src = this.photoUrl;
    img.alt = '다이어리에 붙인 사진';
    img.draggable = false;
    slot.setAttribute('aria-label', '사진 바꾸기');
    slot.replaceChildren(img);
  }

  private buildCaption(): HTMLElement {
    const box = el('label', 'diary-caption');
    place(box, pageCaption(this.currentPage)?.layout ?? { ...DIARY.captionLayout, z: 2 });
    const area = el('textarea');
    area.dataset.testid = 'diary-caption';
    area.maxLength = DIARY.captionMaxLength;
    area.rows = 3;
    area.placeholder = DIARY.captionPlaceholder;
    area.setAttribute('aria-label', '사진 아래 글');
    area.value = pageCaption(this.currentPage)?.text ?? '';
    const count = el('span', 'diary-count');
    const showCount = () => (count.textContent = `${[...area.value].length} / ${DIARY.captionMaxLength}`);
    showCount();
    const day = this.day;
    // 한 글자 쓸 때마다 저장 서랍에 넣는다. 실제 기기 저장은 GameStore가 잠깐 모아서 한다.
    area.addEventListener('input', () => {
      showCount();
      this.ctx.store.update((d) => setPageCaption(d.diary, day, area.value, this.ctx.clock.now(), DEFAULTS));
      this.ctx.bus.emit('diary:changed', { dayKey: day });
      this.refreshNav();
    });
    area.addEventListener('blur', () => this.ctx.store.flush());
    box.append(area, count);
    return box;
  }

  /** 글을 쓰다가 페이지가 새로 생기거나 없어지면 쪽수·화살표만 다시 맞춘다 (글 칸은 그대로). */
  private refreshNav(): void {
    const days = this.days();
    const at = days.indexOf(this.day);
    this.prevBtn.disabled = stepDay(days, this.day, -1) === null;
    this.nextBtn.disabled = stepDay(days, this.day, 1) === null;
    this.pageNo.textContent = at >= 0 ? `${at + 1} / ${days.length}` : '';
  }

  private revokePhoto(): void {
    if (this.photoUrl) URL.revokeObjectURL(this.photoUrl);
    this.photoUrl = null;
  }

  // ───────── 사진 고르기 ─────────

  private async openPicker(): Promise<void> {
    const day = this.day;
    const head = el('div', 'album-head');
    head.append(el('h2', undefined, '사진 고르기'));
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

    if (pagePhoto(this.currentPage)) {
      const remove = el('button', 'btn ghost-ink', '이 페이지에서 사진 떼기');
      remove.dataset.testid = 'diary-photo-remove';
      remove.addEventListener('click', () => {
        this.ctx.store.update((d) => removePagePhoto(d.diary, day, this.ctx.clock.now()));
        this.ctx.bus.emit('diary:changed', { dayKey: day });
        this.closePicker();
        this.render();
      });
      body.append(remove);
    }
    if (photos.length === 0 && !body.querySelector('.album-empty')) {
      body.append(el('p', 'album-empty', '앨범에 사진이 없어요.\n방에서 카메라 버튼으로 뭉치를 찍어 보세요.'));
    }
    for (const group of groupForPicker(photos, day)) {
      const section = el('section', 'album-day');
      const d = formatDiaryDate(group.dayKey);
      section.append(el('h3', undefined, `${d.date} ${d.weekday}${group.dayKey === day ? ' · 이 날' : ''}`));
      const grid = el('div', 'album-grid');
      for (const photo of group.photos) {
        const url = URL.createObjectURL(photo.thumb);
        this.pickerUrls.push(url);
        const cell = el('button', 'album-cell');
        cell.dataset.testid = 'diary-pick';
        cell.dataset.photoId = photo.id;
        cell.setAttribute('aria-label', `${d.date} 사진 붙이기`);
        const img = el('img');
        img.src = url;
        img.alt = '';
        cell.append(img);
        cell.addEventListener('click', () => {
          this.ctx.store.update((s) => setPagePhoto(s.diary, day, photo.id, this.ctx.clock.now(), DEFAULTS, undefined, photo));
          this.ctx.store.flush();
          this.ctx.bus.emit('diary:changed', { dayKey: day });
          this.closePicker();
          this.render();
          this.showToast('사진을 붙였어요');
        });
        grid.append(cell);
      }
      section.append(grid);
      body.append(section);
    }
    this.picker.replaceChildren(head, body);
    this.picker.hidden = false;
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
