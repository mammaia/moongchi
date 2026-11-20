import type { GameContext } from '../../context';
import { PHOTO_RECORD_VERSION, type PhotoRecord, type PhotoSummary } from '../../core/photoLibrary';
import { PHOTO } from '../../data/photo';
import { Cropper } from './Cropper';
import { cropToPixels, isFullCrop, type CropRect } from './crop';
import { fitWidth, formatTakenAt, groupByDay, makePhotoId } from './rules';

/** 지금 게임 화면(캔버스)만 그대로 찍어서 돌려준다. HTML로 된 버튼·스파클 표시는 들어가지 않는다. */
export type CaptureFn = () => Promise<CanvasImageSource & { width: number; height: number }>;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const ICON_CAMERA =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.5 9.8 3.8h4.4l1.3 1.7H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-10a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="12.5" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
const ICON_ALBUM =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="9" cy="9.5" r="1.6" fill="currentColor"/><path d="m4.5 17.5 5-5 3.5 3.5 2.5-2.5 4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('사진 만들기 실패'))), 'image/jpeg', quality),
  );
}

type Area = { sx: number; sy: number; sw: number; sh: number };

/** 원본의 area 부분을 잘라 가로 maxWidth 이하의 JPEG로 만든다. */
async function encode(source: CanvasImageSource, area: Area, maxWidth: number) {
  const size = fitWidth(area.sw, area.sh, maxWidth);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#f6efe4'; // JPEG는 투명을 못 담으니 방 바탕색을 깐다
  g.fillRect(0, 0, size.width, size.height);
  g.drawImage(source, area.sx, area.sy, area.sw, area.sh, 0, 0, size.width, size.height);
  return { blob: await toBlob(canvas, PHOTO.jpegQuality), ...size };
}

type Shot = CanvasImageSource & { width: number; height: number };
/** 찍었지만 아직 저장하지 않은 사진 */
interface Taken {
  shot: Shot;
  full: { blob: Blob; width: number; height: number };
  takenAt: number;
  dayKey: string;
  activity?: string;
}

/**
 * 카메라 버튼, 촬영 미리보기(자르기), 앨범(날짜별 목록, 크게 보기, 지우기) 화면.
 * 뭉치의 행동이나 스파클은 건드리지 않고, 게임 화면을 찍어 보관함에 넣기만 한다.
 */
export class PhotoUi {
  private readonly bar: HTMLDivElement;
  private readonly flash: HTMLDivElement;
  private readonly preview: HTMLDivElement;
  private readonly album: HTMLDivElement;
  private readonly viewer: HTMLDivElement;
  private readonly toast: HTMLDivElement;
  private toastTimer?: ReturnType<typeof setTimeout>;
  private busy = false;
  private activity: string | undefined;
  /** 화면을 닫을 때 정리할 사진 주소 (메모리 아끼기) */
  private albumUrls: string[] = [];
  private previewUrl: string | null = null;
  private viewerUrl: string | null = null;

  constructor(root: HTMLElement, private readonly ctx: GameContext, private readonly capture: CaptureFn) {
    this.bar = el('div', 'photo-bar');
    const albumBtn = el('button', 'photo-btn album-btn');
    albumBtn.innerHTML = ICON_ALBUM;
    albumBtn.setAttribute('aria-label', '앨범');
    albumBtn.dataset.testid = 'album-open';
    albumBtn.addEventListener('click', () => void this.openAlbum());
    const cameraBtn = el('button', 'photo-btn camera-btn');
    cameraBtn.innerHTML = ICON_CAMERA;
    cameraBtn.setAttribute('aria-label', '사진 찍기');
    cameraBtn.dataset.testid = 'camera';
    cameraBtn.addEventListener('click', () => void this.shoot());
    this.bar.append(albumBtn, cameraBtn);

    this.flash = el('div', 'photo-flash');
    this.preview = el('div', 'photo-overlay photo-preview');
    this.preview.dataset.testid = 'photo-preview';
    this.album = el('div', 'photo-overlay album');
    this.album.dataset.testid = 'album';
    this.viewer = el('div', 'photo-overlay photo-viewer');
    this.viewer.dataset.testid = 'photo-viewer';
    this.toast = el('div', 'toast photo-toast');
    this.toast.dataset.testid = 'photo-toast';
    for (const overlay of [this.preview, this.album, this.viewer]) overlay.hidden = true;
    root.append(this.bar, this.flash, this.preview, this.album, this.viewer, this.toast);

    // 물건을 눌러 확대해 본 동안에는 카메라를 숨긴다. [가정]
    ctx.bus.on('hotspot:opened', () => this.bar.classList.add('hidden'));
    ctx.bus.on('hotspot:closed', () => this.bar.classList.remove('hidden'));
    ctx.bus.on('mungchi:activity', ({ activity }) => (this.activity = activity));
  }

  // ───────── 촬영 ─────────

  async shoot(): Promise<void> {
    if (this.busy || this.bar.classList.contains('hidden')) return;
    this.busy = true;
    const takenAt = this.ctx.clock.now();
    const dayKey = this.ctx.clock.dayKey(takenAt);
    const activity = this.activity;
    try {
      const shot = await this.capture();
      this.playFlash();
      const full = await encode(shot, { sx: 0, sy: 0, sw: shot.width, sh: shot.height }, shot.width);
      this.showPreview({ shot, full, takenAt, dayKey, activity });
    } catch (error) {
      console.error('[photo] 촬영 실패', error);
      this.showToast('사진을 찍지 못했어요. 다시 해 볼까요?');
      this.busy = false;
    }
  }

  private playFlash(): void {
    this.flash.classList.remove('go');
    void this.flash.offsetWidth;
    this.flash.style.animationDuration = `${PHOTO.flashMs}ms`;
    this.flash.classList.add('go');
  }

  /** 찍은 사진과 자르기 틀로 저장할 사진을 만든다. 틀이 전체면 이미 만든 원본을 그대로 쓴다. */
  private async buildPhoto(taken: Taken, crop: CropRect): Promise<PhotoRecord> {
    const { shot, full } = taken;
    const area = cropToPixels(crop, shot.width, shot.height);
    const image = isFullCrop(crop) ? full : await encode(shot, area, area.sw);
    const thumb = await encode(shot, area, PHOTO.thumbWidth);
    return {
      v: PHOTO_RECORD_VERSION,
      id: makePhotoId(taken.takenAt),
      takenAt: taken.takenAt,
      dayKey: taken.dayKey,
      width: image.width,
      height: image.height,
      image: image.blob,
      thumb: thumb.blob,
      meta: taken.activity ? { activity: taken.activity } : {},
    };
  }

  private showPreview(taken: Taken): void {
    this.previewUrl = URL.createObjectURL(taken.full.blob);
    const frame = el('div', 'photo-frame');
    const cropper = new Cropper(this.previewUrl, taken.shot.width, taken.shot.height);
    frame.append(cropper.stage);
    const hint = el('p', 'photo-hint', PHOTO.cropHint);
    const date = el('p', 'photo-date', formatTakenAt(taken.dayKey, taken.takenAt));
    date.dataset.testid = 'photo-date';
    const reset = el('button', 'chip', '전체로');
    reset.dataset.testid = 'crop-reset';
    reset.addEventListener('click', () => cropper.reset());
    const info = el('div', 'photo-info');
    info.append(date, reset);
    const retake = el('button', 'btn ghost', '다시 찍기');
    retake.dataset.testid = 'photo-retake';
    const save = el('button', 'btn', '저장');
    save.dataset.testid = 'photo-save';
    const actions = el('div', 'photo-actions');
    actions.append(retake, save);
    this.preview.replaceChildren(frame, hint, info, actions);
    this.preview.hidden = false;
    const syncReset = () => (reset.hidden = isFullCrop(cropper.crop));
    cropper.onChange = syncReset;
    syncReset();

    retake.addEventListener('click', () => this.closePreview());
    save.addEventListener('click', async () => {
      save.disabled = retake.disabled = true;
      try {
        const photo = await this.buildPhoto(taken, cropper.crop);
        await this.ctx.photos.add(photo);
        this.ctx.bus.emit('photo:saved', { id: photo.id, takenAt: photo.takenAt, dayKey: photo.dayKey });
        const persistent = await this.ctx.photos.isPersistent();
        this.closePreview();
        this.showToast(persistent ? '앨범에 저장했어요' : '이 브라우저에서는 앱을 닫으면 사진이 사라져요', persistent ? 1800 : 3200);
      } catch (error) {
        console.error('[photo] 저장 실패', error);
        save.disabled = retake.disabled = false;
        this.showToast('저장하지 못했어요. 저장 공간을 확인해 주세요.', 3000);
      }
    });
  }

  private closePreview(): void {
    this.preview.hidden = true;
    this.preview.replaceChildren();
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = null;
    this.busy = false;
  }

  // ───────── 앨범 ─────────

  async openAlbum(): Promise<void> {
    if (this.busy) return;
    this.album.hidden = false;
    await this.renderAlbum();
  }

  private closeAlbum(): void {
    this.album.hidden = true;
    this.album.replaceChildren();
    this.revokeAlbumUrls();
  }

  private revokeAlbumUrls(): void {
    for (const url of this.albumUrls) URL.revokeObjectURL(url);
    this.albumUrls = [];
  }

  private async renderAlbum(): Promise<void> {
    const header = el('div', 'album-head');
    header.append(el('h2', undefined, '앨범'));
    const close = el('button', 'icon-btn', '✕');
    close.setAttribute('aria-label', '앨범 닫기');
    close.dataset.testid = 'album-close';
    close.addEventListener('click', () => this.closeAlbum());
    header.append(close);

    const body = el('div', 'album-body');
    let photos: PhotoSummary[] = [];
    try {
      photos = await this.ctx.photos.list();
    } catch (error) {
      console.error('[photo] 앨범 읽기 실패', error);
      body.append(el('p', 'album-empty', '앨범을 불러오지 못했어요.'));
    }
    this.revokeAlbumUrls();
    if (photos.length === 0 && body.childElementCount === 0) {
      body.append(el('p', 'album-empty', '아직 찍은 사진이 없어요.\n카메라 버튼으로 뭉치를 찍어 보세요.'));
    }
    for (const group of groupByDay(photos)) {
      const section = el('section', 'album-day');
      section.dataset.testid = 'album-day';
      section.dataset.day = group.dayKey;
      section.append(el('h3', undefined, group.label));
      const grid = el('div', 'album-grid');
      for (const photo of group.photos) {
        const url = URL.createObjectURL(photo.thumb);
        this.albumUrls.push(url);
        const cell = el('button', 'album-cell');
        cell.dataset.testid = 'album-photo';
        cell.setAttribute('aria-label', formatTakenAt(photo.dayKey, photo.takenAt));
        const img = el('img');
        img.src = url;
        img.alt = '';
        img.loading = 'lazy';
        cell.append(img);
        cell.addEventListener('click', () => void this.openViewer(photo.id));
        grid.append(cell);
      }
      section.append(grid);
      body.append(section);
    }
    this.album.replaceChildren(header, body);
  }

  // ───────── 크게 보기 · 지우기 ─────────

  private async openViewer(id: string): Promise<void> {
    const photo = await this.ctx.photos.get(id);
    if (!photo) {
      this.showToast('사진을 찾을 수 없어요');
      return void this.renderAlbum();
    }
    this.viewerUrl = URL.createObjectURL(photo.image);
    const frame = el('div', 'photo-frame');
    const img = el('img');
    img.src = this.viewerUrl;
    img.alt = formatTakenAt(photo.dayKey, photo.takenAt);
    frame.append(img);
    const date = el('p', 'photo-date', formatTakenAt(photo.dayKey, photo.takenAt));
    date.dataset.testid = 'photo-date';
    const del = el('button', 'btn ghost danger', '지우기');
    del.dataset.testid = 'photo-delete';
    const close = el('button', 'btn', '닫기');
    close.dataset.testid = 'viewer-close';
    const actions = el('div', 'photo-actions');
    actions.append(del, close);
    this.viewer.replaceChildren(frame, date, actions);
    this.viewer.hidden = false;

    close.addEventListener('click', () => this.closeViewer());
    del.addEventListener('click', () => this.confirmDelete(photo.id, photo.dayKey, actions));
  }

  /** 실수로 지우지 않도록 한 번 더 묻는다. (브라우저 확인창 대신 화면 안에서) */
  private confirmDelete(id: string, dayKey: string, actions: HTMLDivElement): void {
    const box = el('div', 'photo-confirm');
    box.append(el('p', undefined, PHOTO.deleteConfirm));
    const no = el('button', 'btn ghost', '취소');
    const yes = el('button', 'btn danger-fill', '지우기');
    yes.dataset.testid = 'photo-delete-confirm';
    const row = el('div', 'photo-actions');
    row.append(no, yes);
    box.append(row);
    actions.replaceWith(box);
    no.addEventListener('click', () => box.replaceWith(actions));
    yes.addEventListener('click', async () => {
      yes.disabled = no.disabled = true;
      try {
        await this.ctx.photos.remove(id);
        this.ctx.bus.emit('photo:deleted', { id, dayKey });
        this.closeViewer();
        this.showToast('사진을 지웠어요');
        await this.renderAlbum();
      } catch (error) {
        console.error('[photo] 지우기 실패', error);
        yes.disabled = no.disabled = false;
        this.showToast('지우지 못했어요. 다시 해 볼까요?');
      }
    });
  }

  private closeViewer(): void {
    this.viewer.hidden = true;
    this.viewer.replaceChildren();
    if (this.viewerUrl) URL.revokeObjectURL(this.viewerUrl);
    this.viewerUrl = null;
  }

  private showToast(text: string, ms = 2000): void {
    this.toast.textContent = text;
    this.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.classList.remove('show'), ms);
  }
}
