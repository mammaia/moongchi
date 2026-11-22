/**
 * 다이어리 수치 표. [가정] 모두 사용자 확인 전 임시값.
 * 위치·크기는 페이지에 대한 비율(0~1)로 적는다: x, y = 왼쪽 위 모서리, w, h = 너비·높이.
 * 그래서 휴대폰 화면 크기가 달라도 같은 모양으로 보인다.
 * 꾸미기 아이템(속지·스티커·테이프) 목록은 diaryDecor.ts에 있다.
 */
export const DIARY = {
  /** 글 한 칸의 최대 글자 수 [가정] "짧은 글" */
  textMaxLength: 100,
  /** 페이지 하나에 붙일 수 있는 물건 수 (사진+글+스티커+테이프) [가정] 너무 무거워지지 않게 */
  maxItemsPerPage: 40,
  /** 페이지 세로/가로 비율 (A5 바인더 속지 비슷하게) */
  pageAspect: 1.41,
  /** 기본 속지 종이 (diaryDecor.ts PAPERS의 id) */
  defaultPaper: 'cream-grid',
  /** 처음 사진을 붙일 때의 자리. 실제 높이는 사진 비율에 맞춰 다시 계산한다. */
  photoLayout: { x: 0.24, y: 0.11, w: 0.52, h: 0.56, rot: -2 },
  /** 처음 붙일 때 사진 틀이 차지할 수 있는 가장 큰 너비·높이 (페이지 비율) */
  photoMax: { w: 0.62, h: 0.56 },
  /**
   * 폴라로이드 흰 테두리. 사진 틀 너비에 대한 비율이라, 사진을 줄이거나 키워도 모양이 같다.
   * style.css의 .diary-photo-frame padding(cqw)과 같은 값.
   */
  photoFrame: { side: 0.045, top: 0.045, bottom: 0.13 },
  /** 처음 글을 쓸 때의 자리 (높이는 글 길이에 맞춰 바뀐다) */
  textLayout: { x: 0.1, y: 0.71, w: 0.8, h: 0.12, rot: 0 },
  /** 처음 스티커·테이프를 붙일 때의 자리 */
  stickerLayout: { x: 0.62, y: 0.5, w: 0.22, rot: 6 },
  tapeLayout: { x: 0.3, y: 0.085, w: 0.36, rot: -6 },
  /** 같은 종류를 또 붙이면 이만큼 비켜서 놓는다 (겹쳐서 안 보이는 일 방지). 5번마다 처음 자리로. */
  cascadeStep: 0.045,
  /** 종류별로 줄이고 키울 수 있는 너비 범위 (페이지 너비 비율) */
  sizes: {
    photo: { minW: 0.2, maxW: 0.95 },
    text: { minW: 0.35, maxW: 0.95 },
    sticker: { minW: 0.08, maxW: 0.6 },
    tape: { minW: 0.12, maxW: 0.95 },
  },
  /** 이만큼(픽셀) 움직여야 "끌기"로 본다. 그보다 적으면 "톡 누르기" */
  dragStartPx: 6,
  /** 옆으로 이만큼(픽셀) 밀면 페이지를 넘긴다 */
  swipePx: 50,
  /** [가정] 스파클 보상을 받는 "기록 완료" = 사진 1장 이상 + 글자 이만큼 이상 */
  entryMinTextLength: 1,
  /** 앨범에서 지워진 사진 자리에 나오는 안내 */
  missingPhotoText: '앨범에서 지워진 사진이에요',
  textPlaceholder: '오늘 뭉치는 어땠나요?',
  emptyPageHint: '아래 도구로 사진, 글, 스티커를\n붙여 꾸며 보세요',
} as const;

type Widen<T> = T extends string ? string : T extends number ? number : { readonly [K in keyof T]: Widen<T[K]> };
/** 다이어리 규칙이 쓰는 설정의 모양 (테스트에서 숫자를 바꿔 넣을 수 있게) */
export type DiaryConfig = Widen<typeof DIARY>;
