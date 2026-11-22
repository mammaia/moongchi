import type { GameContext } from '../../context';
import { DiaryUi } from './DiaryUi';

/**
 * 다이어리 기능을 게임에 끼운다. 컴퓨터 책상을 누르면('hotspot:opened') 바인더가 열리고,
 * 닫으면 'hotspot:done'으로 방에 돌아간다. 저장 서랍 diary의 주인.
 * 사진은 사진 보관함(ctx.photos)에서 읽기만 한다.
 */
export function installDiary(ctx: GameContext, root: HTMLElement): DiaryUi {
  return new DiaryUi(root, ctx);
}
