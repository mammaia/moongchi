import type { GameContext } from '../../context';
import { PhotoUi, type CaptureFn } from './PhotoUi';

export type { CaptureFn };

/**
 * 사진 기능을 게임에 끼운다: 카메라 버튼 → 미리보기 → 저장/다시 찍기, 앨범.
 * capture는 main.ts가 게임 화면에서 찍는 방법을 넘겨준다 (이 기능은 Phaser를 직접 모른다).
 */
export function installPhoto(ctx: GameContext, root: HTMLElement, capture: CaptureFn): PhotoUi {
  return new PhotoUi(root, ctx, capture);
}
