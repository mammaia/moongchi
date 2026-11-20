/**
 * 사진 자르기 규칙 (Phaser·브라우저 없이 계산만). tests/unit/photo.test.ts에서 테스트한다.
 * 자르는 틀은 사진 크기에 대한 비율(0~1)로 적는다: x, y = 왼쪽 위, w, h = 너비, 높이.
 * [가정] 찍은 다음 미리보기에서 자른다 (찍는 순간과 뭉치 자세를 그대로 남기기 위해).
 */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Corner = 'nw' | 'ne' | 'sw' | 'se';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 처음 상태: 사진 전체 */
export const FULL_CROP: Readonly<CropRect> = Object.freeze({ x: 0, y: 0, w: 1, h: 1 });

export const isFullCrop = (r: CropRect, eps = 0.002) =>
  r.x <= eps && r.y <= eps && r.x + r.w >= 1 - eps && r.y + r.h >= 1 - eps;

/** 틀을 통째로 옮긴다. 사진 밖으로는 못 나간다. */
export function moveCrop(r: CropRect, dx: number, dy: number): CropRect {
  return { x: clamp(r.x + dx, 0, 1 - r.w), y: clamp(r.y + dy, 0, 1 - r.h), w: r.w, h: r.h };
}

/**
 * 모서리 하나를 끌어 크기를 바꾼다. 반대쪽 모서리는 그대로 있다.
 * minW, minH = 가장 작게 줄일 수 있는 크기 (비율)
 */
export function resizeCrop(r: CropRect, corner: Corner, dx: number, dy: number, minW: number, minH: number): CropRect {
  let left = r.x;
  let top = r.y;
  let right = r.x + r.w;
  let bottom = r.y + r.h;
  if (corner === 'nw' || corner === 'sw') left = clamp(left + dx, 0, right - minW);
  else right = clamp(right + dx, left + minW, 1);
  if (corner === 'nw' || corner === 'ne') top = clamp(top + dy, 0, bottom - minH);
  else bottom = clamp(bottom + dy, top + minH, 1);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** 비율 틀을 실제 픽셀 영역으로 바꾼다 (최소 1픽셀, 사진 안쪽). */
export function cropToPixels(r: CropRect, width: number, height: number): { sx: number; sy: number; sw: number; sh: number } {
  const sx = clamp(Math.round(r.x * width), 0, Math.max(0, width - 1));
  const sy = clamp(Math.round(r.y * height), 0, Math.max(0, height - 1));
  const sw = clamp(Math.round(r.w * width), 1, width - sx);
  const sh = clamp(Math.round(r.h * height), 1, height - sy);
  return { sx, sy, sw, sh };
}
