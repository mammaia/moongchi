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
    /**
     * 자율 행동표. [가정] 아래 숫자는 모두 자연스러워 보이는지 보기 위한 임시값.
     * - weight: 다음 행동을 고를 때의 비중 (클수록 자주). 합이 100일 필요는 없다.
     * - durationMs: 그 행동을 얼마나 오래 할지 [최소, 최대]. wander는 도착하면 끝나고 이 값은 제한 시간.
     * - cooldownMs: 그 행동이 끝난 뒤 다시 고를 수 있을 때까지 기다리는 시간.
     * - maxInARow: 같은 행동을 연달아 고를 수 있는 최대 횟수.
     */
    behaviors: {
      idle: { weight: 40, durationMs: [4000, 9000], cooldownMs: 0, maxInARow: 2 },
      wander: { weight: 35, durationMs: [20000, 20000], cooldownMs: 0, maxInARow: 3 },
      play: { weight: 15, durationMs: [6000, 10000], cooldownMs: 25000, maxInARow: 1 },
      sleep: { weight: 10, durationMs: [20000, 45000], cooldownMs: 90000, maxInARow: 1 },
    },
    /** [가정] 행동 하나가 끝나면 바로 다음 행동으로 넘어가지 않고 잠깐 멈춰 있는 시간. */
    settleMs: [1500, 3500] as const,
    /** [가정] 게임을 켜고 이 시간 동안은 잠들지 않는다 (켜자마자 자 버리지 않게). */
    noSleepAfterStartMs: 30000,
    /** [가정] 짧게 이동하기: 한 번에 움직이는 최대 거리 (화면 좌표). */
    wanderMaxDistance: 80,
    /** [가정] 혼자 놀기에 쓰는 임시 소품. GDD 3장의 휴지심, 양말. 장난감 시스템이 생기면 교체. */
    playProps: ['tissue-roll', 'sock'] as const,
    /** 쓰다듬기에 대한 반응. [가정] 시간 값은 임시값. */
    pet: {
      /** 좋아하는 모습을 보이는 시간. 계속 쓰다듬으면 그만큼 늘어난다. */
      happyMs: 1300,
      /** 쓰다듬기가 끝난 뒤 그 자리에서 주인을 바라보는 시간. */
      attentiveMs: [2500, 4000] as const,
      /** 쓰다듬어진 뒤 이 시간 동안은 잠들지 않는다. */
      noSleepMs: 20000,
    },
    /** 화면 좌표 기준 1초에 움직이는 거리. 띨빵하게 느릿느릿. */
    walkSpeed: 38,
  },
} as const;
