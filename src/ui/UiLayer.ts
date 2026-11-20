import type { GameContext } from '../context';
import type { Hotspot } from '../data/room';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/**
 * 게임 화면 위에 겹치는 HTML 화면: 스파클 표시, 안내 문구, 알림, 자세히 보기 시트.
 * 상태는 저장소를 구독해서 그리기만 하고, 직접 바꾸지 않는다.
 */
export class UiLayer {
  private readonly count: HTMLSpanElement;
  private readonly hud: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private readonly toast: HTMLDivElement;
  private readonly sheet: HTMLDivElement;
  private toastTimer?: ReturnType<typeof setTimeout>;
  private onSheetClose?: () => void;

  constructor(root: HTMLElement, ctx: GameContext) {
    this.hud = el('div', 'hud');
    this.hud.dataset.testid = 'sparkle';
    this.hud.append(el('span', 'icon', '✦'));
    this.count = el('span', 'count', '0');
    this.hud.append(this.count);

    this.hint = el('div', 'hint', '뭉치를 톡 누르거나 문질러서 쓰다듬어 보세요');
    this.toast = el('div', 'toast');
    this.toast.dataset.testid = 'toast';
    this.sheet = el('div', 'sheet');
    this.sheet.dataset.testid = 'detail-sheet';
    root.append(this.hud, this.hint, this.toast, this.sheet);

    const render = () => {
      const state = ctx.store.get();
      this.count.textContent = String(state.wallet.sparkle);
      this.hint.classList.toggle('hidden', state.petting.totalStrokes > 0);
    };
    render();
    ctx.store.subscribe(render);

    ctx.bus.on('sparkle:changed', ({ delta, reason }) => {
      if (delta <= 0) return;
      this.hud.classList.remove('bump');
      void this.hud.offsetWidth; // 애니메이션 다시 시작
      this.hud.classList.add('bump');
      if (reason === 'first-pet-of-day') this.showToast(`오늘의 첫 쓰다듬기! ✦ +${delta}`);
    });
  }

  showToast(text: string, ms = 2200): void {
    this.toast.textContent = text;
    this.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.classList.remove('show'), ms);
  }

  get isSheetOpen(): boolean {
    return this.sheet.classList.contains('open');
  }

  openDetail(spot: Hotspot, onClose: () => void): void {
    this.onSheetClose = onClose;
    this.sheet.replaceChildren();
    this.sheet.append(el('h2', undefined, spot.title));
    const badge = spot.feature
      ? el('span', 'badge', `${spot.feature.name} · ${spot.feature.stage}단계에서 만들 예정`)
      : el('span', 'badge none', '기능 미정 (GDD)');
    this.sheet.append(badge, el('p', undefined, spot.body));
    const back = el('button', 'btn', '방으로 돌아가기');
    back.dataset.testid = 'detail-close';
    back.addEventListener('click', () => this.closeDetail());
    this.sheet.append(back);
    this.sheet.classList.add('open');
  }

  closeDetail(): void {
    if (!this.isSheetOpen) return;
    this.sheet.classList.remove('open');
    const cb = this.onSheetClose;
    this.onSheetClose = undefined;
    cb?.();
  }
}
