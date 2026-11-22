import { expect, test, type Page } from '@playwright/test';

type DiaryState = { pages: Record<string, { items: { kind: string; photoId?: string; text?: string }[] }> };
type Api = {
  ready: () => boolean;
  today: () => string;
  photoCount: () => Promise<number>;
  freezeMungchi: (v?: boolean) => void;
  hotspotPoint: (id: string) => { x: number; y: number } | null;
  zoomedHotspot: () => string | null;
  diary: () => DiaryState;
};

async function open(page: Page, query = '') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/${query}`);
  await waitReady(page);
  return errors;
}

async function waitReady(page: Page) {
  await page.waitForFunction(() => (window.__moongchi as Api | undefined)?.ready());
  // 캔버스 위치가 자리 잡을 때까지 (책상을 정확히 누르기 위해)
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
  await page.evaluate(() => (window.__moongchi as Api).freezeMungchi(true));
}

const api = (page: Page) => ({
  diary: () => page.evaluate(() => (window.__moongchi as Api).diary()),
  today: () => page.evaluate(() => (window.__moongchi as Api).today()),
  zoomed: () => page.evaluate(() => (window.__moongchi as Api).zoomedHotspot()),
});

/** 손가락으로 책상을 톡 눌러 다이어리를 연다 */
async function openDiary(page: Page) {
  const p = await page.evaluate(() => (window.__moongchi as Api).hotspotPoint('desk'));
  await page.touchscreen.tap(p!.x, p!.y);
  await expect(page.getByTestId('diary')).toBeVisible();
}

async function shootAndSave(page: Page) {
  await page.getByTestId('camera').tap();
  await expect(page.getByTestId('photo-preview')).toBeVisible();
  await page.getByTestId('photo-save').tap();
  await expect(page.getByTestId('photo-preview')).toBeHidden();
}

/** 진짜 손가락으로 옆으로 밀기 (터치 이벤트) */
async function swipe(page: Page, fromX: number, toX: number, y: number) {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await touch('touchStart', fromX);
  for (let i = 1; i <= 6; i++) await touch('touchMove', fromX + ((toX - fromX) * i) / 6);
  await touch('touchEnd', toX);
  await cdp.detach();
}

const photoImg = (page: Page) => page.getByTestId('diary-photo').locator('img');
async function expectPhotoLoaded(page: Page) {
  await expect(page.getByTestId('diary-photo')).toHaveAttribute('data-state', 'photo');
  await expect.poll(() => photoImg(page).evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBeGreaterThan(0);
  // 사진 틀이 사진 비율에 맞아서 사진이 잘리지 않고 다 보인다
  const [shown, natural] = await photoImg(page).evaluate((i: HTMLImageElement) => [
    i.clientHeight / i.clientWidth,
    i.naturalHeight / i.naturalWidth,
  ]);
  expect(Math.abs(shown - natural) / natural).toBeLessThan(0.04);
}

test('책상을 누르면 바인더 다이어리가 오늘 날짜로 열리고, 닫으면 방으로 돌아온다', async ({ page }) => {
  const errors = await open(page);
  await openDiary(page);
  const today = await api(page).today();
  const [, m, d] = today.split('-').map(Number);
  await expect(page.getByTestId('diary-date')).toContainText(`${m}월 ${d}일`);
  await expect(page.getByTestId('diary-page')).toHaveAttribute('data-day', today);
  await expect(page.getByTestId('diary-photo')).toHaveAttribute('data-state', 'empty');
  expect(await api(page).zoomed()).toBe('desk');
  await expect(page.locator('.photo-bar')).toHaveClass(/hidden/);

  await page.getByTestId('diary-close').tap();
  await expect(page.getByTestId('diary')).toBeHidden();
  await expect.poll(() => api(page).zoomed()).toBeNull();
  await expect(page.locator('.photo-bar')).not.toHaveClass(/hidden/);
  // 다른 물건도 그대로 열린다
  await page.waitForTimeout(700); // 확대가 다 풀릴 때까지
  const p = await page.evaluate(() => (window.__moongchi as Api).hotspotPoint('window'));
  await page.touchscreen.tap(p!.x, p!.y);
  await expect(page.getByTestId('detail-sheet')).toHaveClass(/open/);
  expect(errors).toEqual([]);
});

test('앨범 사진을 골라 붙이고 글을 쓰면, 새로고침해도 그대로 남고 고칠 수 있다', async ({ page }) => {
  const errors = await open(page);
  await shootAndSave(page);
  await shootAndSave(page);
  await openDiary(page);

  // 사진 고르기
  await page.getByTestId('diary-photo').tap();
  await expect(page.getByTestId('diary-picker')).toBeVisible();
  await expect(page.getByTestId('diary-pick')).toHaveCount(2);
  const chosen = await page.getByTestId('diary-pick').nth(1).getAttribute('data-photo-id');
  await page.getByTestId('diary-pick').nth(1).tap();
  await expect(page.getByTestId('diary-picker')).toBeHidden();
  await expectPhotoLoaded(page);

  // 글 쓰기
  const caption = page.getByTestId('diary-caption');
  await caption.tap();
  await caption.fill('뭉치가 양말을 물고 도망갔다');
  await caption.blur();

  const today = await api(page).today();
  let page0 = (await api(page).diary()).pages[today]!;
  expect(page0.items.find((i) => i.kind === 'photo')?.photoId).toBe(chosen);
  expect(page0.items.find((i) => i.kind === 'text')?.text).toBe('뭉치가 양말을 물고 도망갔다');

  // 새로고침 후 복원
  await page.reload();
  await waitReady(page);
  await openDiary(page);
  await expectPhotoLoaded(page);
  await expect(caption).toHaveValue('뭉치가 양말을 물고 도망갔다');

  // 글 고치기 → 다시 새로고침
  await caption.fill('뭉치가 양말을 물고 침대 밑으로!');
  await page.reload();
  await waitReady(page);
  await openDiary(page);
  await expect(caption).toHaveValue('뭉치가 양말을 물고 침대 밑으로!');

  // 사진 바꾸기: 다른 사진을 고르면 그 사진으로
  await page.getByTestId('diary-photo').tap();
  const other = await page.getByTestId('diary-pick').nth(0).getAttribute('data-photo-id');
  await page.getByTestId('diary-pick').nth(0).tap();
  await expectPhotoLoaded(page);
  page0 = (await api(page).diary()).pages[today]!;
  expect(page0.items.filter((i) => i.kind === 'photo').map((i) => i.photoId)).toEqual([other]);
  expect(errors).toEqual([]);
});

test('글자 수는 100자까지만 써진다', async ({ page }) => {
  await open(page);
  await openDiary(page);
  const caption = page.getByTestId('diary-caption');
  await caption.fill('가'.repeat(130));
  await expect(caption).toHaveValue('가'.repeat(100));
  await expect(page.locator('.diary-count')).toHaveText('100 / 100');
});

test('날짜별 페이지를 화살표와 손가락으로 넘긴다', async ({ page }) => {
  const errors = await open(page, '?dev=1');
  await openDiary(page);
  await page.getByTestId('diary-caption').fill('첫째 날');
  await page.getByTestId('diary-close').tap();
  const day1 = await api(page).today();

  // 다음 날로 넘겨서 또 쓰기
  await page.getByRole('button', { name: 'DEV' }).click();
  await page.getByRole('button', { name: /다음 날로/ }).click();
  await page.getByRole('button', { name: 'DEV' }).click();
  await page.waitForTimeout(500);
  await openDiary(page);
  const day2 = await api(page).today();
  expect(day2 > day1).toBe(true);
  await expect(page.getByTestId('diary-caption')).toHaveValue('');
  await page.getByTestId('diary-caption').fill('둘째 날');
  await page.getByTestId('diary-caption').blur();
  await expect(page.getByTestId('diary-pageno')).toHaveText('2 / 2');
  await expect(page.getByTestId('diary-next')).toBeDisabled();

  // 화살표로 이전 날
  await page.getByTestId('diary-prev').tap();
  await expect(page.getByTestId('diary-page')).toHaveAttribute('data-day', day1);
  await expect(page.getByTestId('diary-caption')).toHaveValue('첫째 날');
  await expect(page.getByTestId('diary-prev')).toBeDisabled();

  // 손가락으로 왼쪽으로 밀면 다음 날
  const box = (await page.getByTestId('diary-page').boundingBox())!;
  const y = box.y + box.height * 0.3;
  await swipe(page, box.x + box.width * 0.85, box.x + box.width * 0.15, y);
  await expect(page.getByTestId('diary-page')).toHaveAttribute('data-day', day2);
  await expect(page.getByTestId('diary-caption')).toHaveValue('둘째 날');
  // 오른쪽으로 밀면 이전 날
  await swipe(page, box.x + box.width * 0.15, box.x + box.width * 0.85, y);
  await expect(page.getByTestId('diary-page')).toHaveAttribute('data-day', day1);
  // 사진 고르기 창이 잘못 열리지 않았다
  await expect(page.getByTestId('diary-picker')).toBeHidden();

  // 새로고침해도 두 페이지 모두 남아 있다
  await page.reload();
  await waitReady(page);
  await openDiary(page);
  await expect(page.getByTestId('diary-pageno')).toHaveText('2 / 2');
  expect(errors).toEqual([]);
});

test('앨범에서 원본 사진을 지워도 다이어리는 깨지지 않고, 글은 남고, 다른 사진을 고를 수 있다', async ({ page }) => {
  const errors = await open(page);
  await shootAndSave(page);
  await openDiary(page);
  await page.getByTestId('diary-photo').tap();
  await page.getByTestId('diary-pick').first().tap();
  await expectPhotoLoaded(page);
  await page.getByTestId('diary-caption').fill('지워질 사진');
  await page.getByTestId('diary-close').tap();

  // 앨범에서 지우기
  await page.waitForTimeout(500);
  await page.getByTestId('album-open').tap();
  await page.getByTestId('album-photo').first().tap();
  await page.getByTestId('photo-delete').tap();
  await page.getByTestId('photo-delete-confirm').tap();
  await expect(page.getByTestId('photo-viewer')).toBeHidden();
  await page.getByTestId('album-close').tap();
  expect(await page.evaluate(() => (window.__moongchi as Api).photoCount())).toBe(0);

  // 새로고침 후에도 다이어리는 열리고, 지워진 사진 안내 + 글은 그대로
  await page.reload();
  await waitReady(page);
  await openDiary(page);
  await expect(page.getByTestId('diary-photo')).toHaveAttribute('data-state', 'missing');
  await expect(page.getByTestId('diary-photo')).toContainText('앨범에서 지워진 사진이에요');
  await expect(page.getByTestId('diary-caption')).toHaveValue('지워질 사진');

  // 새 사진을 찍어 다시 붙이기
  await page.getByTestId('diary-close').tap();
  await page.waitForTimeout(500);
  await shootAndSave(page);
  await openDiary(page);
  await page.getByTestId('diary-photo').tap();
  await expect(page.getByTestId('diary-pick')).toHaveCount(1);
  await page.getByTestId('diary-pick').first().tap();
  await expectPhotoLoaded(page);

  // 사진 떼기: 글은 남는다
  await page.getByTestId('diary-photo').tap();
  await page.getByTestId('diary-photo-remove').tap();
  await expect(page.getByTestId('diary-photo')).toHaveAttribute('data-state', 'empty');
  await expect(page.getByTestId('diary-caption')).toHaveValue('지워질 사진');
  expect(errors).toEqual([]);
});

test('다이어리가 생기기 전의 옛 저장(버전 1)도 그대로 열린다', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem(
      'moongchi.save',
      JSON.stringify({
        version: 1,
        wallet: { sparkle: 70 },
        petting: { lastRewardDay: '2026-01-01', totalStrokes: 9 },
        character: { x: null, y: null },
        progress: { createdAt: 1, lastSeenAt: 2 },
      }),
    );
  });
  const errors = await open(page);
  await expect(page.getByTestId('sparkle')).toContainText('70');
  await openDiary(page);
  await page.getByTestId('diary-caption').fill('업데이트 후 첫 기록');
  await page.getByTestId('diary-close').tap();
  await page.reload();
  await waitReady(page);
  await expect(page.getByTestId('sparkle')).toContainText('70');
  await openDiary(page);
  await expect(page.getByTestId('diary-caption')).toHaveValue('업데이트 후 첫 기록');
  expect(errors).toEqual([]);
});
