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
      // 사용자 피드백(2026-11-20): 아기·강아지처럼 정신없게. 그래서 가만히 있기는 짧고 드물게, 놀기는 자주.
      idle: { weight: 25, durationMs: [1200, 3000], cooldownMs: 0, maxInARow: 1 },
      wander: { weight: 40, durationMs: [20000, 20000], cooldownMs: 0, maxInARow: 3 },
      play: { weight: 35, durationMs: [7000, 12000], cooldownMs: 5000, maxInARow: 1 },
      // [확정 2026-11-20] 평소에는 스스로 잠들지 않는다 (비중 0). 잠은 아래 nap 규칙으로만.
      sleep: { weight: 0, durationMs: [20000, 45000], cooldownMs: 90000, maxInARow: 1 },
      // 가구 쓰기 (사용자 요청 2026-11-20). durationMs는 다 하고 돌아오기까지의 제한 시간.
      climb: { weight: 12, durationMs: [30000, 30000], cooldownMs: 30000, maxInARow: 1 },
      hide: { weight: 10, durationMs: [30000, 30000], cooldownMs: 40000, maxInARow: 1 },
    },
    /**
     * 가구 쓰기 동작. [가정] 모두 임시값.
     * - climb: 침대 위로 폴짝(jumpMs), 위에서 통통 뛰며 놀기(stayMs), 폴짝 내려오기
     * - hide: 책상 뒤로 살금살금(sneakMs), 숨어서 가끔 빼꼼(stayMs, peekEveryMs), 나오기
     */
    furniture: {
      climb: { jumpMs: 650, stayMs: [3500, 7000] as const, bounceMs: 520, bouncePx: 7 },
      hide: { sneakMs: 1100, stayMs: [4000, 8000] as const, peekEveryMs: 1800, peekMs: 900 },
    },
    /** [가정] 행동 하나가 끝나면 바로 다음 행동으로 넘어가지 않고 잠깐 멈춰 있는 시간. */
    settleMs: [300, 900] as const,
    /**
     * 낮잠. [확정 2026-11-20] 평소엔 깨어 있고, 앱을 나갔다 들어왔을 때와 다이어리 쓸 때·조리할 때만 잠깐 잔다.
     * - afterAwayMs: 앱 밖에 이만큼 있다 돌아오면 자고 있다. [가정]
     * - durationMs: 낮잠 길이. 쓰다듬으면 바로 깬다. [가정]
     * - spots: 이 물건을 열어 둔 동안 낮잠. 지금은 자세히 보기 화면이고,
     *   다이어리·간식 제조 화면이 생기면 그 화면의 열림/닫힘을 같은 이름으로 알리면 된다.
     */
    nap: { afterAwayMs: 30000, durationMs: [6000, 12000] as const, spots: ['desk', 'counter'] as const },
    /** [가정] 게임을 켜고 이 시간 동안은 잠들지 않는다 (켜자마자 자 버리지 않게). */
    noSleepAfterStartMs: 30000,
    /** [가정] 짧게 이동하기: 한 번에 움직이는 최대 거리 (화면 좌표). */
    wanderMaxDistance: 100,
    /** [가정] 짧게 이동하기에서 앞뒤 방향 비중 (1보다 크면 앞뒤로 더 많이 움직인다) */
    wanderDepthFactor: 1.3,
    /**
     * [가정] 혼자 놀기에 쓰는 임시 소품. GDD 3장의 휴지심, 양말. 장난감 시스템이 생기면 교체.
     * [확정 2026-11-20] 놀고 나도 방에 그대로 남고, 앱을 나갔다 들어오면 치워져 있다.
     */
    playProps: ['tissue-roll', 'sock'] as const,
    /** 쓰다듬기에 대한 반응. [가정] 시간 값은 임시값. */
    pet: {
      /** 좋아하는 모습을 보이는 시간. 계속 쓰다듬으면 그만큼 늘어난다. */
      happyMs: 1300,
      /** 쓰다듬기가 끝난 뒤 그 자리에서 주인을 바라보는 시간. */
      attentiveMs: [1200, 2200] as const,
      /** 쓰다듬어진 뒤 이 시간 동안은 잠들지 않는다. */
      noSleepMs: 20000,
    },
    /** 화면 좌표 기준 1초에 움직이는 거리 (가장 빠를 때). 띨빵하게 느릿느릿. */
    walkSpeed: 34,
    /**
     * 걸음걸이. [가정] 모두 자연스러워 보이는지 보기 위한 임시값.
     * - lookFirstMs: 출발 전에 갈 방향을 먼저 바라보는 시간
     * - accelMs: 출발해서 제 속도가 될 때까지 걸리는 시간
     * - easePx: 도착하기 전 천천히 느려지는 구간 길이
     * - stepPx: 한 걸음(한 번 통 뛰기)에 가는 거리
     * - hopPx: 한 걸음에 뜨는 높이
     * - tiltDeg: 걸음마다 좌우로 뒤뚱거리는 각도
     * - squash: 땅에 닿을 때 납작해지는 정도
     */
    walk: { lookFirstMs: 450, accelMs: 600, easePx: 22, stepPx: 15, hopPx: 3, tiltDeg: 5, squash: 0.06 },
    /** [가정] 가만히 있을 때 두리번거리기: 확인 간격, 한쪽을 보는 확률, 보고 있는 시간 */
    glance: { everyMs: 1400, chance: 0.5, holdMs: [500, 1000] as const },
    /**
     * 강아지처럼 놀기. [가정] 모두 임시값.
     * - reachPx: 장난감에 닿는 거리. 이보다 멀면 먼저 쫓아간다(fetch)
     * - runSpeed: 장난감을 쫓아갈 때 속도 (걷기보다 빠름)
     * - moves: 동작별 비중과 길이(밀리초)
     *   bow = 앞으로 엎드려 엉덩이 흔들기, pounce = 폴짝 덮치기(장난감이 튕겨 나감),
     *   toss = 물어서 휙 던지기, shake = 물고 도리도리 흔들기
     * - knockPx / tossPx: 덮치거나 던졌을 때 장난감이 날아가는 거리 [최소, 최대]
     */
    play: {
      reachPx: 55,
      runSpeed: 95,
      moves: {
        bow: { weight: 2, ms: 750 },
        pounce: { weight: 3, ms: 520 },
        toss: { weight: 2, ms: 800 },
        shake: { weight: 2, ms: 950 },
      },
      knockPx: [25, 50] as const,
      tossPx: [45, 80] as const,
      /** 장난감이 바닥 범위 밖으로 이만큼까지는 굴러가도 된다 */
      toyMarginPx: 14,
    },
  },
} as const;
