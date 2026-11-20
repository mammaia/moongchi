/**
 * 기획 수치 표. 숫자를 바꿀 때는 이 파일만 고치면 된다.
 * [확정] = 사용자가 정한 규칙, [가정] = 테스트용 임시값.
 */
export const BALANCE = {
  petting: {
    /** [확정] 하루 첫 쓰다듬기에만 스파클 보상. [가정] 보상 양 10은 임시값. */
    firstPetOfDaySparkle: 10,
    /** [가정] 문지르기를 몇 밀리초마다 한 번의 쓰다듬기로 셀지. */
    strokeCooldownMs: 450,
  },
  character: {
    /** [가정] 뭉치가 다음 행동을 고를 때의 확률과 시간(밀리초). */
    choice: { idle: 0.45, wander: 0.4, sleep: 0.15 },
    idleMs: [2000, 5000] as const,
    sleepMs: [8000, 14000] as const,
    happyMs: 1300,
    /** 화면 좌표 기준 1초에 움직이는 거리. 띨빵하게 느릿느릿. */
    walkSpeed: 38,
  },
} as const;
