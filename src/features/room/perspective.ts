/**
 * 현관에서 창문 쪽을 바라보는 원근 계산. 화면 크기는 세로 390 x 700 기준.
 * u: 왼쪽(0)~오른쪽(1), t: 안쪽 창문 벽(0)~현관 쪽(1), h: 그 자리 벽 높이 비율.
 */
export const WORLD = { width: 390, height: 700 } as const;

// 안쪽 벽을 넓게 잡아 방이 옆으로 넉넉해 보이게 한다.
const BACK = { left: 40, right: 350, floorY: 420, ceilY: 120 } as const;

export const floorY = (t: number) => BACK.floorY + (WORLD.height - BACK.floorY) * t;
export const ceilY = (t: number) => BACK.ceilY - BACK.ceilY * t;
export const leftEdge = (t: number) => BACK.left - BACK.left * t;
export const rightEdge = (t: number) => BACK.right + (WORLD.width - BACK.right) * t;
export const wallHeight = (t: number) => floorY(t) - ceilY(t);

export interface Pt {
  x: number;
  y: number;
}

export function point(u: number, t: number, h = 0): Pt {
  const l = leftEdge(t);
  const r = rightEdge(t);
  return { x: l + (r - l) * u, y: floorY(t) - h * wallHeight(t) };
}

/** 화면 y 위치에서 바닥 깊이(t)를 거꾸로 구한다. */
export function depthAtY(y: number): number {
  return Math.min(1, Math.max(0, (y - BACK.floorY) / (WORLD.height - BACK.floorY)));
}

/** 멀수록 작게 보이도록 하는 크기 배율. */
export function scaleAtY(y: number): number {
  return 0.55 + 0.75 * depthAtY(y);
}

export const BACK_WALL = BACK;
