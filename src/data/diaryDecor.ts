/**
 * 다이어리 꾸미기 목록: 속지, 스티커, 마스킹테이프.
 * [가정] 이름·그림·색은 모두 사용자 확인 전 임시 디자인이다.
 *
 * 새 아이템 추가 방법 (코드 수정 없이 이 파일만):
 * - 속지: PAPERS에 { id, name, color, image, size } 한 줄. image/size는 CSS background-image/size 값.
 * - 스티커: STICKERS에 { id, name, svg, aspect } 한 줄. svg는 viewBox가 있는 그림.
 * - 테이프: TAPES에 { id, name, background, aspect } 한 줄. background는 CSS background 값.
 * id는 저장 파일에 적히므로, 한 번 내보낸 id는 바꾸거나 지우지 않는다.
 * (지운 id가 옛 저장에 있으면 기록은 지우지 않고 화면에만 안 그린다.)
 *
 * 크기 단위 cqw: 속지는 "페이지 너비의 1%", 테이프 무늬는 "테이프 너비의 1%". 그래서 화면이 커지거나
 * 테이프를 늘려도 무늬가 같이 커진다.
 */

export interface PaperDef {
  id: string;
  name: string;
  color: string;
  image: string;
  size: string;
}

export interface StickerDef {
  id: string;
  name: string;
  /** SVG 그림 (viewBox 0 0 100 100) */
  svg: string;
  /** 세로/가로 비율 */
  aspect: number;
}

export interface TapeDef {
  id: string;
  name: string;
  background: string;
  /** 세로/가로 비율 (테이프는 가로로 길다) */
  aspect: number;
}

/** 종이 결 (모든 속지에 깔린다) */
const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.45  0 0 0 0 0.33  0 0 0 0 0.2  0 0 0 0.09 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

export const PAPERS: readonly PaperDef[] = [
  {
    id: 'cream-grid',
    name: '크림 모눈',
    color: '#fbf4e6',
    image: `${GRAIN}, linear-gradient(rgba(214, 190, 160, 0.28) 1px, transparent 1px), linear-gradient(90deg, rgba(214, 190, 160, 0.28) 1px, transparent 1px)`,
    size: '160px 160px, 5cqw 5cqw, 5cqw 5cqw',
  },
  {
    id: 'white-lined',
    name: '하얀 줄지',
    color: '#fffdf8',
    image: `${GRAIN}, linear-gradient(90deg, transparent 10.5%, rgba(236, 160, 160, 0.45) 10.5%, rgba(236, 160, 160, 0.45) calc(10.5% + 1px), transparent calc(10.5% + 1px)), repeating-linear-gradient(transparent 0, transparent calc(6.6cqw - 1px), rgba(150, 180, 205, 0.4) calc(6.6cqw - 1px), rgba(150, 180, 205, 0.4) 6.6cqw)`,
    size: '160px 160px, 100% 100%, 100% 6.6cqw',
  },
  {
    id: 'pink-dot',
    name: '분홍 도트',
    color: '#fdf0ee',
    image: `${GRAIN}, radial-gradient(circle, rgba(224, 150, 160, 0.45) 0 0.45cqw, transparent 0.55cqw)`,
    size: '160px 160px, 4.5cqw 4.5cqw',
  },
];

/** 스티커 테두리: 흰 칼선(스티커를 오려 낸 느낌) */
const CUT = "stroke='#fff' stroke-width='7' stroke-linejoin='round' paint-order='stroke'";
const svg = (body: string) => `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>${body}</svg>`;

export const STICKERS: readonly StickerDef[] = [
  {
    id: 'mungchi',
    name: '뭉치',
    aspect: 1,
    svg: svg(
      `<g fill='#fffdf8' ${CUT}><circle cx='50' cy='54' r='34'/><circle cx='22' cy='40' r='12'/><circle cx='34' cy='24' r='12'/><circle cx='52' cy='18' r='12'/><circle cx='70' cy='24' r='12'/><circle cx='80' cy='40' r='12'/><circle cx='84' cy='60' r='12'/><circle cx='74' cy='78' r='12'/><circle cx='52' cy='86' r='12'/><circle cx='30' cy='80' r='12'/><circle cx='18' cy='60' r='12'/></g>` +
        `<circle cx='50' cy='54' r='33' fill='#fffdf8'/><ellipse cx='39' cy='52' rx='3.6' ry='4.6' fill='#4a3b30'/><ellipse cx='61' cy='52' rx='3.6' ry='4.6' fill='#4a3b30'/><circle cx='32' cy='62' r='5' fill='#f6c3c9' opacity='0.8'/><circle cx='68' cy='62' r='5' fill='#f6c3c9' opacity='0.8'/><path d='M45 61 q2.5 3 5 0 q2.5 3 5 0' fill='none' stroke='#4a3b30' stroke-width='2' stroke-linecap='round'/>`,
    ),
  },
  {
    id: 'heart',
    name: '하트',
    aspect: 1,
    svg: svg(
      `<path ${CUT} fill='#f4a6b4' d='M50 86C22 66 8 48 14 31C20 14 42 12 50 28C58 12 80 14 86 31C92 48 78 66 50 86Z'/><path d='M26 30q6-8 14-4' fill='none' stroke='#fff' stroke-width='4' stroke-linecap='round' opacity='0.7'/>`,
    ),
  },
  {
    id: 'star',
    name: '별',
    aspect: 1,
    svg: svg(
      `<path ${CUT} fill='#f7d774' d='M50 10L61 37L90 39L68 58L75 87L50 71L25 87L32 58L10 39L39 37Z'/><circle cx='42' cy='52' r='2.5' fill='#7a5a2a'/><circle cx='58' cy='52' r='2.5' fill='#7a5a2a'/>`,
    ),
  },
  {
    id: 'sparkle',
    name: '반짝',
    aspect: 1,
    svg: svg(
      `<path ${CUT} fill='#ffe08a' d='M42 12Q46 42 74 46Q46 50 42 80Q38 50 10 46Q38 42 42 12Z'/><path ${CUT} fill='#bfe0f0' d='M76 58Q78 72 90 74Q78 76 76 90Q74 76 62 74Q74 72 76 58Z'/>`,
    ),
  },
  {
    id: 'sock',
    name: '양말',
    aspect: 1,
    svg: svg(
      `<path ${CUT} fill='#f6c3c9' d='M36 10H66V54Q66 60 72 64L80 70Q90 78 84 88Q78 96 66 90L38 74Q30 70 32 60L36 50Z'/><path d='M36 18H66M36 28H66' stroke='#e58a9a' stroke-width='5'/><circle cx='74' cy='80' r='4' fill='#fff' opacity='0.8'/>`,
    ),
  },
  {
    id: 'tissue-roll',
    name: '휴지심',
    aspect: 1,
    svg: svg(
      `<g ${CUT}><rect x='22' y='26' width='56' height='52' rx='6' fill='#e8d2b4'/><ellipse cx='50' cy='26' rx='28' ry='10' fill='#f3e3cc'/></g><ellipse cx='50' cy='26' rx='12' ry='4.5' fill='#b48a62'/><path d='M30 44Q50 52 70 44M30 60Q50 68 70 60' fill='none' stroke='#c9a57e' stroke-width='2.5'/>`,
    ),
  },
  {
    id: 'cloud',
    name: '구름',
    aspect: 1,
    svg: svg(
      `<path ${CUT} fill='#eef6fb' d='M24 70Q8 70 10 56Q12 44 26 44Q28 28 44 28Q56 28 62 38Q66 32 74 34Q86 38 84 50Q94 54 90 64Q86 72 76 70Z'/><path d='M32 80l-3 8M50 80l-3 8M68 80l-3 8' stroke='#9cc9e6' stroke-width='4' stroke-linecap='round'/>`,
    ),
  },
  {
    id: 'sun',
    name: '해',
    aspect: 1,
    svg: svg(
      `<g stroke='#f5b94a' stroke-width='6' stroke-linecap='round'><path d='M50 6v12M50 82v12M6 50h12M82 50h12M19 19l8 8M73 73l8 8M19 81l8-8M73 27l8-8'/></g><circle ${CUT} cx='50' cy='50' r='24' fill='#ffd36e'/><path d='M42 54q8 7 16 0' fill='none' stroke='#9a6a2a' stroke-width='2.5' stroke-linecap='round'/>`,
    ),
  },
  {
    id: 'flower',
    name: '꽃',
    aspect: 1,
    svg: svg(
      `<g fill='#f9c6d0' ${CUT}><circle cx='50' cy='26' r='16'/><circle cx='73' cy='43' r='16'/><circle cx='64' cy='70' r='16'/><circle cx='36' cy='70' r='16'/><circle cx='27' cy='43' r='16'/></g><g fill='#f9c6d0'><circle cx='50' cy='26' r='15'/><circle cx='73' cy='43' r='15'/><circle cx='64' cy='70' r='15'/><circle cx='36' cy='70' r='15'/><circle cx='27' cy='43' r='15'/></g><circle cx='50' cy='50' r='11' fill='#ffd36e'/>`,
    ),
  },
  {
    id: 'camera',
    name: '카메라',
    aspect: 1,
    svg: svg(
      `<path d='M24 34Q30 10 50 12Q70 10 76 34' fill='none' stroke='#6b4f3e' stroke-width='3'/><g ${CUT}><rect x='12' y='32' width='76' height='50' rx='9' fill='#8b6f5c'/></g><rect x='12' y='44' width='76' height='8' fill='#6b4f3e'/><rect x='22' y='26' width='16' height='8' rx='2' fill='#6b4f3e'/><circle cx='54' cy='58' r='17' fill='#f3ece2'/><circle cx='54' cy='58' r='11' fill='#4a3b30'/><circle cx='50' cy='54' r='3.5' fill='#fff' opacity='0.8'/><circle cx='78' cy='40' r='3' fill='#ffd36e'/>`,
    ),
  },
];

export const TAPES: readonly TapeDef[] = [
  {
    id: 'pink-stripe',
    name: '분홍 줄무늬',
    aspect: 0.2,
    background: 'repeating-linear-gradient(45deg, #f6bfc8 0 4cqw, #fde6ea 4cqw 8cqw)',
  },
  {
    id: 'mint-dot',
    name: '민트 도트',
    aspect: 0.2,
    background: 'radial-gradient(circle, #fff 0 1.6cqw, transparent 1.9cqw) 0 0 / 7cqw 7cqw, #b9e2d2',
  },
  {
    id: 'beige-check',
    name: '베이지 체크',
    aspect: 0.2,
    background:
      'linear-gradient(90deg, rgba(190, 150, 110, 0.35) 50%, transparent 50%) 0 0 / 8cqw 8cqw, linear-gradient(rgba(190, 150, 110, 0.35) 50%, transparent 50%) 0 0 / 8cqw 8cqw, #f4e7d3',
  },
  {
    id: 'sky-plain',
    name: '하늘 무지',
    aspect: 0.2,
    background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.25), transparent 40%, rgba(255, 255, 255, 0.2)), #b9d7ee',
  },
  {
    id: 'lemon-pen',
    name: '레몬 펜그림',
    aspect: 0.2,
    background:
      'repeating-linear-gradient(90deg, transparent 0 3cqw, #e6a95a 3cqw 9cqw, transparent 9cqw 13cqw, #8fb7d8 13cqw 19cqw, transparent 19cqw 22cqw) 0 45% / 100% 18% no-repeat, #fbeeb6',
  },
];

export const PAPER_IDS = PAPERS.map((p) => p.id);
export const findPaper = (id: string) => PAPERS.find((p) => p.id === id);
export const findSticker = (id: string) => STICKERS.find((s) => s.id === id);
export const findTape = (id: string) => TAPES.find((t) => t.id === id);
export const svgUrl = (body: string) => `data:image/svg+xml;utf8,${encodeURIComponent(body)}`;
