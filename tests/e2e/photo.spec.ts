import { expect, test, type Page } from '@playwright/test';

type Api = {
  ready: () => boolean;
  today: () => string;
  photoCount: () => Promise<number>;
  freezeMungchi: (v?: boolean) => void;
  activity: () => string;
  hotspotPoint: (id: string) => { x: number; y: number } | null;
};

async function open(page: Page, query = '') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/${query}`);
  await page.waitForFunction(() => (window.__moongchi as Api | undefined)?.ready());
  return errors;
}
const photoCount = (page: Page) => page.evaluate(() => (window.__moongchi as Api).photoCount());

async function shootAndSave(page: Page) {
  await page.getByTestId('camera').click();
  await expect(page.getByTestId('photo-preview')).toBeVisible();
  await page.getByTestId('photo-save').click();
  await expect(page.getByTestId('photo-preview')).toBeHidden();
}

test('카메라로 찍으면 미리보기에 사진과 찍은 날짜·시간이 나온다', async ({ page }) => {
  const errors = await open(page);
  await page.getByTestId('camera').click();
  const preview = page.getByTestId('photo-preview');
  await expect(preview).toBeVisible();
  const img = preview.locator('img');
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBeGreaterThan(0);
  // 게임 화면 크기 그대로 (390x700 화면을 2배 해상도로)
  expect(await img.evaluate((i: HTMLImageElement) => [i.naturalWidth, i.naturalHeight])).toEqual([780, 1400]);
  const today = await page.evaluate(() => (window.__moongchi as Api).today());
  const [y, m, d] = today.split('-').map(Number);
  await expect(page.getByTestId('photo-date')).toContainText(`${y}년 ${m}월 ${d}일`);
  await expect(page.getByTestId('photo-date')).toContainText(/오[전후] \d{1,2}:\d{2}/);
  expect(errors).toEqual([]);
});

test('사진을 찍어도 뭉치가 하던 행동은 그대로다', async ({ page }) => {
  await open(page, '?dev=1');
  await page.evaluate(() => (window.__moongchi as Api).freezeMungchi(true));
  const before = await page.evaluate(() => (window.__moongchi as Api).activity());
  await page.getByTestId('camera').click();
  await expect(page.getByTestId('photo-preview')).toBeVisible();
  expect(await page.evaluate(() => (window.__moongchi as Api).activity())).toBe(before);
});

test('다시 찍기를 누르면 저장하지 않고 방으로 돌아간다', async ({ page }) => {
  await open(page);
  await page.getByTestId('camera').click();
  await page.getByTestId('photo-retake').click();
  await expect(page.getByTestId('photo-preview')).toBeHidden();
  expect(await photoCount(page)).toBe(0);
  await expect(page.getByTestId('camera')).toBeVisible();
});

test('저장한 사진은 새로고침해도 앨범에 날짜별로 남아 있고, 지울 수 있다', async ({ page }) => {
  const errors = await open(page);
  await shootAndSave(page);
  await shootAndSave(page);
  expect(await photoCount(page)).toBe(2);

  // 진행 상황 자동 저장(스파클 등)과 함께 있어도 둘 다 남는다
  await page.reload();
  await page.waitForFunction(() => (window.__moongchi as Api | undefined)?.ready());
  expect(await photoCount(page)).toBe(2);
  const today = await page.evaluate(() => (window.__moongchi as Api).today());

  await page.getByTestId('album-open').click();
  await expect(page.getByTestId('album-day')).toHaveCount(1);
  await expect(page.getByTestId('album-day')).toHaveAttribute('data-day', today);
  await expect(page.getByTestId('album-photo')).toHaveCount(2);

  // 크게 보기
  await page.getByTestId('album-photo').first().click();
  const viewer = page.getByTestId('photo-viewer');
  await expect(viewer).toBeVisible();
  await expect.poll(() => viewer.locator('img').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(780);

  // 지우기 (한 번 더 확인)
  await page.getByTestId('photo-delete').click();
  await page.getByTestId('photo-delete-confirm').click();
  await expect(viewer).toBeHidden();
  await expect(page.getByTestId('album-photo')).toHaveCount(1);
  expect(await photoCount(page)).toBe(1);

  await page.reload();
  await page.waitForFunction(() => (window.__moongchi as Api | undefined)?.ready());
  expect(await photoCount(page)).toBe(1);
  expect(errors).toEqual([]);
});

test('날짜를 넘겨 찍으면 앨범에서 날짜별로 나뉜다', async ({ page }) => {
  await open(page, '?dev=1');
  await shootAndSave(page);
  await page.getByRole('button', { name: 'DEV' }).click();
  await page.getByRole('button', { name: /다음 날로/ }).click();
  await page.getByRole('button', { name: 'DEV' }).click();
  await shootAndSave(page);
  await page.getByTestId('album-open').click();
  await expect(page.getByTestId('album-day')).toHaveCount(2);
  // 최근 날짜가 위
  const days = await page.getByTestId('album-day').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.day));
  expect(days[0]! > days[1]!).toBe(true);
  await page.getByTestId('album-close').click();
  await expect(page.getByTestId('album')).toBeHidden();
});

test('사진이 없으면 앨범에 안내 문구가 나온다', async ({ page }) => {
  await open(page);
  await page.getByTestId('album-open').click();
  await expect(page.getByTestId('album')).toContainText('아직 찍은 사진이 없어요');
});

test('물건을 확대해 보는 동안에는 카메라 버튼이 숨는다', async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window.__moongchi as Api).freezeMungchi(true));
  const p = await page.evaluate(() => (window.__moongchi as Api).hotspotPoint('window'));
  await page.mouse.click(p!.x, p!.y);
  await expect(page.getByTestId('detail-sheet')).toHaveClass(/open/);
  await expect(page.locator('.photo-bar')).toHaveClass(/hidden/);
  await page.getByTestId('detail-close').click();
  await expect(page.locator('.photo-bar')).not.toHaveClass(/hidden/);
});

test('카메라·앨범 버튼이 방 물건을 누르는 자리를 가리지 않는다', async ({ page }) => {
  await open(page);
  const bar = await page.locator('.photo-bar').boundingBox();
  for (const id of ['window', 'bed', 'bathroom', 'desk', 'counter', 'fridge', 'entrance']) {
    const p = await page.evaluate((h) => (window.__moongchi as Api).hotspotPoint(h), id);
    const inside = p!.x >= bar!.x && p!.x <= bar!.x + bar!.width && p!.y >= bar!.y && p!.y <= bar!.y + bar!.height;
    expect(inside, `${id} 누르는 자리가 버튼에 가려짐`).toBe(false);
  }
});
