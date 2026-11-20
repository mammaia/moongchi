/**
 * 원룸 배치표. GDD 스케치를 현관에서 창문 쪽으로 바라본 시점으로 옮긴 것.
 * 현관에서 남쪽(창문)을 보면 스케치의 왼쪽(조리대·컴퓨터)이 오른손 쪽,
 * 스케치의 오른쪽(화장실·침대)이 왼손 쪽에 온다.
 * [확정 2026-11-20] 신발장 자리에는 1인 가구용 작은 냉장고를 둔다.
 *
 * 좌표는 "바닥 좌표"로 적는다: u = 왼쪽(0)~오른쪽(1), t = 안쪽 창문 벽(0)~현관(1),
 * h = 그 자리 벽 높이에 대한 비율. 실제 화면 좌표는 RoomView가 계산한다.
 */
export type HotspotId = 'window' | 'bed' | 'bathroom' | 'desk' | 'counter' | 'fridge' | 'entrance';

export interface Hotspot {
  id: HotspotId;
  /** 방에 붙는 이름표 */
  label: string;
  /** 자세히 보기 화면 제목 */
  title: string;
  /** 자세히 보기 화면 설명 */
  body: string;
  /** 연결될 기능과 단계. 없으면 GDD에 기능이 정해지지 않은 물건. */
  feature?: { name: string; stage: number };
}

export const HOTSPOTS: Record<HotspotId, Hotspot> = {
  window: {
    id: 'window',
    label: '창문',
    title: '창문',
    body: '바깥의 현실 날씨가 이 창문에 보일 예정이에요.',
    feature: { name: '날씨', stage: 4 },
  },
  bed: {
    id: 'bed',
    label: '침대',
    title: '침대',
    body: '포근한 침대. 침대를 눌렀을 때의 기능은 아직 GDD에 정해지지 않았어요.',
  },
  bathroom: {
    id: 'bathroom',
    label: '◀ 화장실',
    title: '화장실',
    body: '화살표로 화장실에 들어가 샤워와 미용을 할 예정이에요.',
    feature: { name: '샤워·미용', stage: 7 },
  },
  desk: {
    id: 'desk',
    label: '컴퓨터 책상',
    title: '컴퓨터 책상',
    body: '침대 쪽을 향한 모니터와 노트, 필기구. 여기서 다이어리 바인더를 열고 다꾸를 할 예정이에요.',
    feature: { name: '다이어리', stage: 8 },
  },
  counter: {
    id: 'counter',
    label: '조리대',
    title: '조리대',
    body: '2구 가스레인지와 싱크대가 있는 조리대. 산책에서 모은 재료로 뭉치 간식을 만들 예정이에요.',
    feature: { name: '간식 제조', stage: 5 },
  },
  fridge: {
    id: 'fridge',
    label: '냉장고',
    title: '냉장고',
    body: '현관 옆 1인 가구용 작은 냉장고. 문은 화장실 쪽을 향해요. 눌렀을 때의 기능은 아직 정해지지 않았어요.',
  },
  entrance: {
    id: 'entrance',
    label: '현관',
    title: '현관',
    body: '집 밖으로 나가면 현실 산책과 연동될 예정이에요.',
    feature: { name: '산책', stage: 4 },
  },
};

/**
 * 뭉치가 스스로 돌아다닐 수 있는 바닥 범위 (바닥 좌표 u, t).
 * 침대 앞(t 0.2)부터 현관 매트 앞(t 0.8)까지 앞뒤로 넓게. 침대·책상·조리대·냉장고와 왼쪽 아래 카메라 버튼을 피한다.
 * [가정] 그림을 바꾸면 함께 조정.
 */
export const MUNGCHI_FLOOR = { u: [0.36, 0.74], t: [0.2, 0.8] } as const;

/**
 * 뭉치가 가구를 쓰는 자리 (바닥 좌표 u, t, 높이 h). [가정] 모두 임시 위치.
 * - bed: approach(침대 앞 바닥) → on(이불 위, h = 매트리스 높이)으로 폴짝 올라간다.
 * - desk: approach(책상 앞) → hide(책상 왼쪽 끝 뒤, 책상 앞판에 가려짐), 가끔 peek(왼쪽으로 빼꼼)한다.
 */
export const MUNGCHI_SPOTS = {
  bed: { approach: { u: 0.37, t: 0.4 }, on: { u: 0.24, t: 0.22, h: 0.1 } },
  desk: { approach: { u: 0.66, t: 0.22 }, hide: { u: 0.715, t: 0.07 }, peek: { u: 0.67, t: 0.08 } },
} as const;
