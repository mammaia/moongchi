import { BALANCE } from '../../data/balance';

/**
 * 걸음걸이 계산. 화면 없이 숫자만 계산해서 테스트할 수 있게 따로 뺐다.
 * 자연스럽게 보이도록
 * 1) 출발 전에 갈 방향을 먼저 보고,
 * 2) 천천히 출발해서 천천히 멈추고,
 * 3) 걸음은 시간 대신 실제로 간 거리에 맞춰 통통 뛰며 좌우로 살짝 뒤뚱거린다.
 */
const W = BALANCE.character.walk;

/** 지금 속도 배율 (0 ~ 1). since = 걷기 시작한 뒤 지난 시간, traveled/total = 간 거리/전체 거리. */
export function walkSpeedFactor(sinceMs: number, traveled: number, total: number): number {
  if (sinceMs < W.lookFirstMs) return 0;
  const remaining = Math.max(0, total - traveled);
  const up = Math.min(1, 0.2 + (0.8 * (sinceMs - W.lookFirstMs)) / W.accelMs);
  const down = Math.min(1, 0.2 + (0.8 * remaining) / W.easePx);
  return Math.min(up, down);
}

export interface GaitPose {
  /** 위로 뜬 높이 (px) */
  hop: number;
  /** 몸이 기울어진 각도 (도) */
  tilt: number;
  scaleX: number;
  scaleY: number;
}

/** 간 거리에 맞는 몸 모양. speed(0~1)가 작을수록 동작도 작아진다. */
export function gaitPose(traveled: number, speed: number): GaitPose {
  const phase = (traveled / W.stepPx) * Math.PI;
  const air = Math.abs(Math.sin(phase)); // 0 = 땅, 1 = 가장 높이
  const ground = Math.pow(1 - air, 3);
  const amount = Math.max(0, Math.min(1, speed));
  const scaleY = 1 + amount * (W.squash * 0.5 * air - W.squash * ground);
  return {
    hop: air * W.hopPx * amount,
    tilt: Math.sin(phase) * W.tiltDeg * amount,
    scaleY,
    scaleX: 1 / Math.sqrt(scaleY),
  };
}
