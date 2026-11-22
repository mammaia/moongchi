import type { GameContext } from '../context';
import type { MungchiActivity, MungchiAutoActivity } from '../core/events';
import { createNewSave } from '../core/saveSchema';
import { isDiaryRewardAvailable, isPetRewardAvailable } from '../features/economy/sparkle';

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

  const ACTIVITY_NAMES: Record<MungchiActivity, string> = {
    idle: '가만히 있기',
    wander: '짧게 이동하기',
    play: '혼자 놀기',
    sleep: '잠들기',
    climb: '침대에 올라가기',
    hide: '책상 뒤에 숨기',
    happy: '좋아하기 (쓰다듬기 반응)',
  };
  let activityText = '-';
  ctx.bus.on('mungchi:activity', ({ activity, settling }) => {
    activityText = ACTIVITY_NAMES[activity] + (settling ? ' (잠깐 멈춤)' : '');
    render();
  });

  const render = () => {
    const s = ctx.store.get();
    const today = ctx.clock.dayKey();
    const rows: [string, string][] = [
      ['게임 속 오늘', today],
      ['날짜 넘김', `${ctx.clock.getDayOffset()}일`],
      ['마지막 보상일', s.petting.lastRewardDay ?? '없음'],
      ['오늘 보상', isPetRewardAvailable(s, today) ? '받을 수 있음' : '받음'],
      ['쓰다듬은 횟수', String(s.petting.totalStrokes)],
      ['오늘 다이어리 보상', isDiaryRewardAvailable(s, today) ? '받을 수 있음' : '받음'],
      ['스파클', String(s.wallet.sparkle)],
      ['뭉치 행동', activityText],
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

  for (const a of ['idle', 'wander', 'play', 'sleep', 'climb', 'hide'] as MungchiAutoActivity[]) {
    button(`뭉치: ${ACTIVITY_NAMES[a]}`, () => ctx.bus.emit('dev:force-activity', { activity: a }));
  }
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
