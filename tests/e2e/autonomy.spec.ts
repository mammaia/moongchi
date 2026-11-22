import { expect, test, type Page } from '@playwright/test';

type Activity = 'idle' | 'wander' | 'play' | 'sleep' | 'happy';
type Api = {
  ready: () => boolean;
  state: () => { wallet: { sparkle: number }; petting: { totalStrokes: number } };
  mungchiPoint: () => { x: number; y: number };
  freezeMungchi: (v?: boolean) => void;
  activity: () => Activity;
  settling: () => boolean;
  forceActivity: (a: Exclude<Activity, 'happy'> | 'climb' | 'hide') => void;
  toys: () => string[];
  onFurniture: () => string | null;
  resume: (awayMs: number) => void;
  hotspotPoint: (id: string) => { x: number; y: number } | null;
};
const api = (page: Page) => ({
  activity: () => page.evaluate(() => (window.__moongchi as Api).activity()),
  point: () => page.evaluate(() => (window.__moongchi as Api).mungchiPoint()),
  force: (a: Exclude<Activity, 'happy'> | 'climb' | 'hide') => page.evaluate((x) => (window.__moongchi as Api).forceActivity(x), a),
  sparkle: () => page.evaluate(() => (window.__moongchi as Api).state().wallet.sparkle),
  toys: () => page.evaluate(() => (window.__moongchi as Api).toys()),
  onFurniture: () => page.evaluate(() => (window.__moongchi as Api).onFurniture()),
  resume: (ms: number) => page.evaluate((x) => (window.__moongchi as Api).resume(x), ms),
});

async function open(page: Page, { frozen }: { frozen: boolean }, query = '') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/${query}`);
  await page.waitForFunction(() => (window.__moongchi as Api | undefined)?.ready());
  // 화면 크기 맞추기를 기다리는 동안 스스로 놀기 시작하지 않도록 먼저 멈춘다.
  if (frozen) await page.evaluate(() => (window.__moongchi as Api).freezeMungchi(true));
  // 느린 CI에서는 게임이 켜진 뒤에도 화면 크기 맞추기가 조금 늦게 끝난다.
  // 캔버스 위치가 두 번 연속 같을 때까지 기다려야 뭉치를 정확히 누를 수 있다.
  await page.waitForFunction(
    () => {
      const r = document.querySelector('canvas')!.getBoundingClientRect();
      const w = window as unknown as { __rect?: string };
      const prev = w.__rect;
      w.__rect = `${r.x},${r.y},${r.width},${r.height}`;
      return prev === w.__rect;
    },
    undefined,
    { polling: 150 },
  );
  return errors;
}

async function petOnce(page: Page) {
  const p = await api(page).point();
  await page.mouse.click(p.x, p.y);
}

test('네 가지 자율 행동을 오류 없이 보여 준다', async ({ page }) => {
  const errors = await open(page, { frozen: true });
  const m = api(page);
  for (const a of ['idle', 'play', 'sleep', 'wander'] as const) {
    await m.force(a);
    await page.waitForTimeout(400);
    expect(await m.activity()).toBe(a);
  }
  expect(errors).toEqual([]);
});

test('짧게 이동하기를 하면 실제로 자리가 바뀐다', async ({ page }) => {
  await open(page, { frozen: true });
  const m = api(page);
  const before = await m.point();
  await m.force('wander');
  // 출발 전에 방향을 먼저 보고(0.45초) 천천히 출발하므로, 몇 초 안에 움직이는지 지켜본다.
  await expect
    .poll(async () => {
      const after = await m.point();
      return Math.hypot(after.x - before.x, after.y - before.y);
    }, { timeout: 8000 })
    .toBeGreaterThan(3);
});

test('자는 뭉치를 쓰다듬으면 깨서 좋아하고, 스파클도 그대로 받는다', async ({ page }) => {
  await open(page, { frozen: true });
  const m = api(page);
  await m.force('sleep');
  await page.waitForTimeout(300);
  expect(await m.activity()).toBe('sleep');
  await petOnce(page);
  expect(await m.activity()).toBe('happy');
  expect(await m.sparkle()).toBe(10);
  // 좋아하기가 끝나면 다시 잠들지 않고 깨어 있다
  await page.waitForTimeout(1800);
  expect(await m.activity()).toBe('idle');
});

test('혼자 노는 중에 쓰다듬어도 충돌 없이 좋아하기로 바뀐다', async ({ page }) => {
  const errors = await open(page, { frozen: true });
  const m = api(page);
  await m.force('play');
  await page.waitForTimeout(500);
  await petOnce(page);
  expect(await m.activity()).toBe('happy');
  await page.waitForTimeout(600);
  await petOnce(page);
  expect(await m.activity()).toBe('happy');
  expect(errors).toEqual([]);
});

test('그냥 두면 스스로 행동하고, 그 사이에도 쓰다듬기가 된다', async ({ page }) => {
  const errors = await open(page, { frozen: false });
  const m = api(page);
  expect(['idle', 'wander', 'play', 'sleep', 'climb', 'hide']).toContain(await m.activity());
  // 걷는 중에도 쓰다듬기가 된다
  await m.force('wander');
  await page.waitForTimeout(300);
  await petOnce(page);
  expect(await m.activity()).toBe('happy');
  expect(await m.sparkle()).toBe(10);
  expect(errors).toEqual([]);
});

test('개발자 패널에서 뭉치 행동을 바꿔 볼 수 있다', async ({ page }) => {
  await open(page, { frozen: true }, '?dev=1');
  await page.getByRole('button', { name: 'DEV' }).click();
  await page.getByRole('button', { name: '뭉치: 혼자 놀기' }).click();
  await expect(page.locator('.dev-panel')).toContainText('혼자 놀기');
  expect(await api(page).activity()).toBe('play');
});

test('양말과 휴지심은 처음부터 방바닥에 있고, 놀고 나도 그대로 남는다', async ({ page }) => {
  const errors = await open(page, { frozen: true });
  const m = api(page);
  expect((await m.toys()).sort()).toEqual(['sock', 'tissue-roll']);
  await m.force('play');
  await page.waitForTimeout(1500);
  await petOnce(page); // 놀기를 끊어도
  expect(await m.activity()).toBe('happy');
  await page.waitForTimeout(500);
  expect((await m.toys()).sort()).toEqual(['sock', 'tissue-roll']); // 장난감은 그대로
  expect(errors).toEqual([]);
});

test('앱을 나갔다 들어와도 장난감은 남아 있고, 오래 나가 있었다면 자고 있다', async ({ page }) => {
  await open(page, { frozen: true });
  const m = api(page);
  await m.force('play');
  await page.waitForTimeout(800);
  await m.resume(5_000); // 잠깐 나갔다 옴
  expect((await m.toys()).sort()).toEqual(['sock', 'tissue-roll']);
  expect(await m.activity()).not.toBe('sleep');
  await m.resume(10 * 60_000); // 오래 나갔다 옴
  expect((await m.toys()).sort()).toEqual(['sock', 'tissue-roll']);
  expect(await m.activity()).toBe('sleep');
  await petOnce(page);
  expect(await m.activity()).toBe('happy');
});

test('책상(다이어리)을 열면 뭉치가 잠깐 존다', async ({ page }) => {
  await open(page, { frozen: true });
  const p = await page.evaluate(() => (window.__moongchi as Api).hotspotPoint('desk'));
  await page.mouse.click(p!.x, p!.y);
  await expect(page.getByTestId('diary')).toBeVisible();
  expect(await api(page).activity()).toBe('sleep');
});

test('침대에 올라가서 놀고, 침대 위에서도 쓰다듬을 수 있다', async ({ page }) => {
  const errors = await open(page, { frozen: true });
  const m = api(page);
  const before = await m.point();
  await m.force('climb');
  await expect.poll(() => m.onFurniture(), { timeout: 20000 }).toBe('climb');
  await page.waitForTimeout(900); // 다 올라갈 때까지
  const onBed = await m.point();
  expect(onBed.y).toBeLessThan(before.y); // 침대 위라 화면에서 더 위에 보인다
  await petOnce(page);
  expect(await m.activity()).toBe('happy');
  expect(await m.onFurniture()).toBe('climb'); // 쓰다듬어도 침대 위에 그대로
  // 다른 데로 가려면 먼저 내려온다
  await m.force('wander');
  await expect.poll(() => m.onFurniture(), { timeout: 5000 }).toBeNull();
  expect(errors).toEqual([]);
});

test('책상 뒤에 숨었다가 나온다', async ({ page }) => {
  const errors = await open(page, { frozen: true });
  const m = api(page);
  await m.force('hide');
  await expect.poll(() => m.onFurniture(), { timeout: 20000 }).toBe('hide');
  await m.force('play');
  await expect.poll(() => m.onFurniture(), { timeout: 5000 }).toBeNull();
  expect(errors).toEqual([]);
});
