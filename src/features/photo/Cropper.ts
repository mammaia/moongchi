import { PHOTO } from '../../data/photo';
import { FULL_CROP, moveCrop, resizeCrop, type Corner, type CropRect } from './crop';

/**
 * 미리보기 위의 자르기 틀. 틀 안을 끌면 옮기고, 네 모서리를 끌면 크기를 바꾼다.
 * 계산은 crop.ts의 규칙을 쓰고, 여기서는 손가락 움직임을 비율로 바꿔 넘기기만 한다.
 */
export class Cropper {
  readonly stage: HTMLDivElement;
  private readonly box: HTMLDivElement;
  private rect: CropRect = { ...FULL_CROP };
  onChange?: () => void;

  /**
   * src가 없으면 그림 없이 틀만 그린다 (찍기 전에 방 위에 겹쳐서 영역 고르기).
   * imageW·imageH = 자를 그림의 실제 크기 (최소 크기 계산용), initial = 처음 틀 위치,
   * id = 화면 테스트용 이름 앞부분 ('crop' = 미리보기, 'frame' = 찍기 전 틀)
   */
  constructor(
    src: string | null,
    private readonly imageW: number,
    private readonly imageH: number,
    initial: CropRect = FULL_CROP,
    id = 'crop',
  ) {
    this.rect = { ...initial };
    this.stage = document.createElement('div');
    this.stage.className = 'crop-stage';
    this.stage.dataset.testid = `${id}-stage`;
    this.box = document.createElement('div');
    this.box.className = 'crop-box';
    this.box.dataset.testid = `${id}-box`;
    for (const corner of ['nw', 'ne', 'sw', 'se'] as Corner[]) {
      const handle = document.createElement('div');
      handle.className = `crop-handle ${corner}`;
      handle.dataset.testid = `${id}-${corner}`;
      handle.addEventListener('pointerdown', (e) => this.drag(e, corner));
      this.box.append(handle);
    }
    this.box.addEventListener('pointerdown', (e) => this.drag(e, 'move'));
    if (src) {
      const img = document.createElement('img');
      img.src = src;
      img.alt = '방금 찍은 사진';
      img.draggable = false;
      this.stage.append(img);
    }
    this.stage.append(this.box);
    this.render();
  }

  get crop(): CropRect {
    return { ...this.rect };
  }

  /** 틀을 바꾼다 (기본: 사진 전체) */
  reset(rect: CropRect = FULL_CROP): void {
    this.rect = { ...rect };
    this.render();
  }

  private drag(e: PointerEvent, mode: Corner | 'move'): void {
    e.preventDefault();
    e.stopPropagation();
    const bounds = this.stage.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const start = this.rect;
    const minW = Math.min(1, PHOTO.cropMinPx / this.imageW);
    const minH = Math.min(1, PHOTO.cropMinPx / this.imageH);
    this.box.classList.add('dragging');
    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / bounds.width;
      const dy = (ev.clientY - startY) / bounds.height;
      this.rect = mode === 'move' ? moveCrop(start, dx, dy) : resizeCrop(start, mode, dx, dy, minW, minH);
      this.render();
    };
    const onUp = () => {
      this.box.classList.remove('dragging');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  private render(): void {
    const r = this.rect;
    Object.assign(this.box.style, {
      left: `${r.x * 100}%`,
      top: `${r.y * 100}%`,
      width: `${r.w * 100}%`,
      height: `${r.h * 100}%`,
    });
    this.onChange?.();
  }
}
