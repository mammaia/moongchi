import { expect, test, type Page } from '@playwright/test';

type Api = {
  ready: () => boolean;
  state: () => { wallet: { sparkle: number }; petting: { totalStrokes: number; lastRewardDay: string | null } };
  mungchiPoint: () => { x: number; y: number };
  hotspotPoint: (id: string) => { x: number; y: number } | null;
  zoomedHotspot: () => string | null;
  freezeMungchi: (v?: boolean) => void;
};
declare global {
  interface Window {
    __moongchi?: unknown;
  }
}
async function open(page: Page, query = '') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/${query}`);
  await page.waitForFunction(() => (window.__moongchi as Api | undefined)?.ready());
  await page.evaluate(() => (window.__moongchi as Api).freezeMungchi(true));
  return errors;
}

async function petOnce(page: Page) {
  const p = await page.evaluate(() => (window.__moongchi as Api).mungchiPoint());
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(500); // 쓰다듬기 간격(450ms)보다 길게
}

const sparkle = (page: Page) => page.evaluate(() => (window.__moongchi as Api).state().wallet.sparkle);
const strokes = (page: Page) => page.evaluate(() => (window.__moongchi as Api).state().petting.totalStrokes);

test.beforeEach(async ({ context }) => {
  await context.clearCookies();
});

test('게임이 열리고 원룸과 스파클 표시가 보인다', async ({ page }) => {
  const errors = await open(page);
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByTestId('sparkle')).toHaveText(/0/);
  expect(errors).toEqual([]);
});

test('하루 첫 쓰다듬기만 스파클을 주고, 쓰다듬기는 계속된다', async ({ page }) => {
  await open(page);
  await petOnce(page);
  expect(await sparkle(page)).toBe(10);
  await expect(page.getByTestId('toast')).toContainText('+10');
  await petOnce(page);
  await petOnce(page);
  expect(await strokes(page)).toBe(3);
  expect(await sparkle(page)).toBe(10);
  await expect(page.getByTestId('sparkle')).toHaveText(/10/);
});

test('문지르기도 쓰다듬기로 센다', async ({ page }) => {
  await open(page);
  const p = await page.evaluate(() => (window.__moongchi as Api).mungchiPoint());
  await page.mouse.move(p.x - 15, p.y);
  await page.mouse.down();
  // 쓰다듬기 간격(450ms)보다 길게 쉬면서 몇 번만 문지른다. (느린 CI에서도 끝나도록 움직임 수를 적게)
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(500);
    await page.mouse.move(p.x + (i % 2 ? 15 : -15), p.y);
  }
  await page.mouse.up();
  expect(await strokes(page)).toBeGreaterThanOrEqual(2);
});

test('새로고침해도 스파클이 남아 있다', async ({ page }) => {
  await open(page);
  await petOnce(page);
  await page.waitForTimeout(400); // 자동 저장 대기
  await page.reload();
  await page.waitForFunction(() => (window.__moongchi as Api | undefined)?.ready());
  expect(await sparkle(page)).toBe(10);
});

test('다음 날로 넘기면 다시 첫 보상을 받는다 (개발자 패널)', async ({ page }) => {
  await open(page, '?dev=1');
  await petOnce(page);
  await page.getByRole('button', { name: 'DEV' }).click();
  await page.getByRole('button', { name: /다음 날로/ }).click();
  await page.getByRole('button', { name: 'DEV' }).click();
  await petOnce(page);
  expect(await sparkle(page)).toBe(20);
});

for (const id of ['window', 'bed', 'bathroom', 'desk', 'counter', 'shoes', 'entrance']) {
  test(`'${id}'을 누르면 확대되고 돌아올 수 있다`, async ({ page }) => {
    const errors = await open(page);
    const p = await page.evaluate((h) => (window.__moongchi as Api).hotspotPoint(h), id);
    await page.mouse.click(p!.x, p!.y);
    await expect(page.getByTestId('detail-sheet')).toHaveClass(/open/);
    expect(await page.evaluate(() => (window.__moongchi as Api).zoomedHotspot())).toBe(id);
    await page.getByTestId('detail-close').click();
    await expect(page.getByTestId('detail-sheet')).not.toHaveClass(/open/);
    expect(await page.evaluate(() => (window.__moongchi as Api).zoomedHotspot())).toBeNull();
    expect(errors).toEqual([]);
  });
}
