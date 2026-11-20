import { expect, test, type Page } from '@playwright/test';

type Activity = 'idle' | 'wander' | 'play' | 'sleep' | 'happy';
type Api = {
  ready: () => boolean;
  state: () => { wallet: { sparkle: number }; petting: { totalStrokes: number } };
  mungchiPoint: () => { x: number; y: number };
  freezeMungchi: (v?: boolean) => void;
  activity: () => Activity;
  settling: () => boolean;
  forceActivity: (a: Exclude<Activity, 'happy'>) => void;
};
const api = (page: Page) => ({
  activity: () => page.evaluate(() => (window.__moongchi as Api).activity()),
  point: () => page.evaluate(() => (window.__moongchi as Api).mungchiPoint()),
  force: (a: Exclude<Activity, 'happy'>) => page.evaluate((x) => (window.__moongchi as Api).forceActivity(x), a),
  sparkle: () => page.evaluate(() => (window.__moongchi as Api).state().wallet.sparkle),
});

async function open(page: Page, { frozen }: { frozen: boolean }, query = '') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/${query}`);
  await page.waitForFunction(() => (window.__moongchi as Api | undefined)?.ready());
  if (frozen) await page.evaluate(() => (window.__moongchi as Api).freezeMungchi(true));
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
  await page.waitForTimeout(1500);
  const after = await m.point();
  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(3);
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
  expect(['idle', 'wander', 'play', 'sleep']).toContain(await m.activity());
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
