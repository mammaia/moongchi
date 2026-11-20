import type { GameContext } from '../context';
import { createNewSave } from '../core/saveSchema';
import { isPetRewardAvailable } from '../features/economy/sparkle';

/**
 * 개발자 패널. 주소 끝에 ?dev=1 을 붙이면 나타난다. 일반 플레이어에게는 보이지 않는다.
 */
export function installDevPanel(root: HTMLElement, ctx: GameContext): void {
  const toggle = document.createElement('button');
  toggle.className = 'dev-toggle';
  toggle.textContent = 'DEV';
  const panel = document.createElement('div');
  panel.className = 'dev-panel';
  panel.hidden = true;
  root.append(toggle, panel);
  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
  });

  const info = document.createElement('dl');
  panel.append(info);
  const button = (label: string, action: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', () => {
      action();
      render();
    });
    panel.append(b);
  };

  const render = () => {
    const s = ctx.store.get();
    const today = ctx.clock.dayKey();
    const rows: [string, string][] = [
      ['게임 속 오늘', today],
      ['날짜 넘김', `${ctx.clock.getDayOffset()}일`],
      ['마지막 보상일', s.petting.lastRewardDay ?? '없음'],
      ['오늘 보상', isPetRewardAvailable(s, today) ? '받을 수 있음' : '받음'],
      ['쓰다듬은 횟수', String(s.petting.totalStrokes)],
      ['스파클', String(s.wallet.sparkle)],
    ];
    info.replaceChildren(
      ...rows.flatMap(([k, v]) => {
        const dt = document.createElement('dt');
        dt.textContent = k;
        const dd = document.createElement('dd');
        dd.textContent = v;
        return [dt, dd];
      }),
    );
  };

  button('다음 날로 넘기기 (+1일)', () => ctx.clock.advanceDays(1));
  button('날짜 원래대로', () => ctx.clock.resetOffset());
  button('스파클 0으로', () => ctx.store.update((d) => void (d.wallet.sparkle = 0)));
  button('저장 지우고 새로 시작', () => {
    ctx.clock.resetOffset();
    ctx.store.replace(createNewSave(ctx.clock.now()));
    ctx.store.flush();
    window.location.reload();
  });

  render();
  ctx.store.subscribe(render);
}
