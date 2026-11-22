import { expect, test, type Page } from '@playwright/test';

type Layout = { x: number; y: number; w: number; h: number; rot: number; z: number };
type Item = { id: string; kind: string; photoId?: string; text?: string; stickerId?: string; tapeId?: string; layout: Layout };
type DiaryState = { pages: Record<string, { paper: string; items: Item[] }> };
type Api = {
  ready: () => boolean;
  today: () => string;
  photoCount: () => Promise<number>;
  freezeMungchi: (v?: boolean) => void;
  hotspotPoint: (id: string) => { x: number; y: number } | null;
  zoomedHotspot: () => string | null;
  diary: () => DiaryState;
  state: () => { wallet: { sparkle: number }; diaryReward: { lastRewardDay: string | null } };
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
  state: () => page.evaluate(() => (window.__moongchi as Api).state()),
  today: () => page.evaluate(() => (window.__moongchi as Api).today()),
  zoomed: () => page.evaluate(() => (window.__moongchi as Api).zoomedHotspot()),
});

/** 오늘 페이지의 물건들 */
async function todayItems(page: Page): Promise<Item[]> {
  const [d, today] = await Promise.all([api(page).diary(), api(page).today()]);
  return d.pages[today]?.items ?? [];
}

/** 손가락으로 책상을 톡 눌러 다이어리를 연다 */
async function openDiary(page: Page) {
  const p = await page.evaluate(() => (window.__moongchi as Api).hotspotPoint('desk'));
  await page.touchscreen.tap(p!.x, p!.y);
  await expect(page.getByTestId('diary')).toBeVisible();
}

async function reopen(page: Page) {
  await page.reload();
  await waitReady(page);
  await openDiary(page);
}

async function shootAndSave(page: Page) {
  await page.getByTestId('camera').tap();
  await page.getByTestId('frame-full').tap(); // 방 전체를 찍는다
  await page.getByTestId('shutter').tap();
  await expect(page.getByTestId('photo-preview')).toBeVisible();
  await page.getByTestId('photo-save').tap();
  await expect(page.getByTestId('photo-preview')).toBeHidden();
}

const tool = (page: Page, name: string) => page.getByTestId(`diary-tool-${name}`);
const items = (page: Page, kind?: string) =>
  kind ? page.locator(`[data-testid="diary-item"][data-kind="${kind}"]`) : page.getByTestId('diary-item');

/** 글 칸을 새로 만들어 쓰고 "완료" */
async function writeText(page: Page, text: string) {
  await tool(page, 'text').tap();
  const input = page.getByTestId('diary-text-input');
  await expect(input).toBeFocused();
  await input.fill(text);
  await tool(page, 'done').tap();
  await expect(input).toHaveCount(0);
}

/** 사진 붙이기 (앨범의 n번째) */
async function attachPhoto(page: Page, nth = 0) {
  await tool(page, 'photo').tap();
  await expect(page.getByTestId('diary-picker')).toBeVisible();
  const photoId = await page.getByTestId('diary-pick').nth(nth).getAttribute('data-photo-id');
  await page.getByTestId('diary-pick').nth(nth).tap();
  await expect(page.getByTestId('diary-picker')).toBeHidden();
  return photoId!;
}

async function expectPhotoLoaded(page: Page, nth = 0) {
  const node = items(page, 'photo').nth(nth);
  await expect(node).toHaveAttribute('data-state', 'photo');
  const img = node.locator('img');
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBeGreaterThan(0);
  // 사진 틀이 사진 비율에 맞아서 사진이 잘리지 않고 다 보인다
  const [shown, natural] = await img.evaluate((i: HTMLImageElement) => [i.clientHeight / i.clientWidth, i.naturalHeight / i.naturalWidth]);
  expect(Math.abs(shown - natural) / natural).toBeLessThan(0.04);
}

/** 진짜 손가락(터치)으로 끌기. points = 손가락마다 [시작, 끝] */
async function touchDrag(page: Page, fingers: [{ x: number; y: number }, { x: number; y: number }][], steps = 8) {
  const cdp = await page.context().newCDPSession(page);
  const at = (t: number) =>
    fingers.map(([a, b], id) => ({ id, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, radiusX: 2, radiusY: 2, force: 1 }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
  for (let i = 1; i <= steps; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(i / steps) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

const center = async (_page: Page, sel: ReturnType<Page['locator']>) => {
  const b = (await sel.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

/** 화면에서 물건이 페이지 안에 있다 (기울기 때문에 몇 픽셀은 봐준다) */
async function expectInsidePage(page: Page, sel: ReturnType<Page['locator']>) {
  const p = (await page.getByTestId('diary-page').boundingBox())!;
  const b = (await sel.boundingBox())!;
  const slack = 3; // 그림자·반올림 몇 픽셀
  expect(b.x).toBeGreaterThanOrEqual(p.x - slack);
  expect(b.y).toBeGreaterThanOrEqual(p.y - slack);
  expect(b.x + b.width).toBeLessThanOrEqual(p.x + p.width + slack);
  expect(b.y + b.height).toBeLessThanOrEqual(p.y + p.height + slack);
}

test('책상을 누르면 바인더 다이어리가 오늘 날짜로 열리고, 닫으면 방으로 돌아온다', async ({ page }) => {
  const errors = await open(page);
  await openDiary(page);
  const today = await api(page).today();
  const [, m, d] = today.split('-').map(Number);
  await expect(page.getByTestId('diary-date')).toContainText(`${m}월 ${d}일`);
  await expect(page.getByTestId('diary-page')).toHaveAttribute('data-day', today);
  await expect(page.getByTestId('diary-page')).toHaveAttribute('data-paper', 'cream-grid');
  await expect(page.locator('.diary-hint')).toBeVisible();
  await expect(items(page)).toHaveCount(0);
  for (const name of ['photo', 'text', 'sticker', 'tape', 'paper']) await expect(tool(page, name)).toBeVisible();
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

test('사진+글을 처음 기록하면 스파클을 하루 한 번만 받고, 새로고침해도 기록·보상이 그대로다', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = await open(page);
  await shootAndSave(page);
  await shootAndSave(page);
  await openDiary(page);
  const before = (await api(page).state()).wallet.sparkle;

  // 사진만 붙이면 아직 보상 없음
  const chosen = await attachPhoto(page, 1);
  await expectPhotoLoaded(page);
  await tool(page, 'done').tap();
  expect((await api(page).state()).wallet.sparkle).toBe(before);

  // 글을 쓰면 오늘의 첫 기록 보상
  await writeText(page, '뭉치가 양말을 물고 도망갔다');
  await expect(page.getByTestId('diary-toast')).toContainText('오늘의 첫 기록');
  await expect.poll(async () => (await api(page).state()).wallet.sparkle).toBe(before + 10);
  await expect(page.getByTestId('diary-sparkle')).toContainText(String(before + 10));

  // 같은 날 두 번째 기록은 보상 없음
  await attachPhoto(page, 0);
  await tool(page, 'done').tap();
  await writeText(page, '또 찍었다');
  expect((await api(page).state()).wallet.sparkle).toBe(before + 10);

  const saved = await todayItems(page);
  expect(saved.map((i) => i.kind)).toEqual(['photo', 'text', 'photo', 'text']);
  expect(saved[0]!.photoId).toBe(chosen);
  expect(saved[1]!.text).toBe('뭉치가 양말을 물고 도망갔다');

  // 새로고침 후 복원 (보상도 다시 주지 않는다)
  await reopen(page);
  await expect(items(page)).toHaveCount(4);
  await expectPhotoLoaded(page, 0);
  await expect(items(page, 'text').first()).toHaveText('뭉치가 양말을 물고 도망갔다');
  expect(await todayItems(page)).toEqual(saved);
  expect((await api(page).state()).wallet.sparkle).toBe(before + 10);

  // 글 고치기: 한 번 눌러 고르고, 한 번 더 누르면 고쳐 쓰기
  const first = items(page, 'text').first();
  await first.tap();
  await expect(first).toHaveClass(/selected/);
  await first.tap();
  await page.getByTestId('diary-text-input').fill('뭉치가 양말을 물고 침대 밑으로!');
  await tool(page, 'done').tap();
  await reopen(page);
  await expect(items(page, 'text').first()).toHaveText('뭉치가 양말을 물고 침대 밑으로!');
  await expect(items(page, 'text').nth(1)).toHaveText('또 찍었다');
  expect(errors).toEqual([]);
});

test('사진을 손가락으로 옮기고, 손잡이·두 손가락으로 키우고 돌리고, 밖으로 끌어도 페이지 안에 남는다', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = await open(page);
  await shootAndSave(page);
  await openDiary(page);
  await attachPhoto(page);
  await expectPhotoLoaded(page);
  await tool(page, 'done').tap();
  const photo = items(page, 'photo').first();
  const start = (await todayItems(page))[0]!.layout;
  const pageBox = (await page.getByTestId('diary-page').boundingBox())!;

  // 1) 옮기기: 오른쪽 아래로 40px, 30px
  const c = await center(page, photo);
  await touchDrag(page, [[c, { x: c.x - 40, y: c.y + 30 }]]);
  await expect.poll(async () => (await todayItems(page))[0]!.layout.x).toBeCloseTo(start.x - 40 / pageBox.width, 2);
  const moved = (await todayItems(page))[0]!.layout;
  expect(moved.y).toBeCloseTo(start.y + 30 / pageBox.height, 2);
  expect(moved.w).toBeCloseTo(start.w, 5);

  // 2) 손잡이로 줄이기 (고른 상태에서 모서리 손잡이를 가운데 쪽으로)
  const handle = page.getByTestId('diary-handle');
  await expect(handle).toBeVisible();
  const hc = await center(page, handle);
  const pc = await center(page, photo);
  await touchDrag(page, [[hc, { x: pc.x + (hc.x - pc.x) * 0.6, y: pc.y + (hc.y - pc.y) * 0.6 }]]);
  await expect.poll(async () => (await todayItems(page))[0]!.layout.w).toBeLessThan(moved.w * 0.75);
  const shrunk = (await todayItems(page))[0]!.layout;
  await expectPhotoLoaded(page); // 줄여도 사진이 잘리지 않는다

  // 3) 두 손가락으로 벌리며 돌리기
  const pc2 = await center(page, photo);
  await touchDrag(page, [
    [{ x: pc2.x - 20, y: pc2.y }, { x: pc2.x - 40, y: pc2.y - 10 }],
    [{ x: pc2.x + 20, y: pc2.y }, { x: pc2.x + 40, y: pc2.y + 10 }],
  ]);
  await expect.poll(async () => (await todayItems(page))[0]!.layout.w).toBeGreaterThan(shrunk.w * 1.5);
  const pinched = (await todayItems(page))[0]!.layout;
  expect(Math.abs(pinched.rot - shrunk.rot)).toBeGreaterThan(10);

  // 4) 페이지 밖으로 멀리 끌어도 페이지 안에 멈춘다
  const pc3 = await center(page, photo);
  await touchDrag(page, [[pc3, { x: pc3.x + 600, y: pc3.y + 900 }]]);
  await expect.poll(async () => (await todayItems(page))[0]!.layout.x).not.toBeCloseTo(pinched.x, 3);
  const edge = (await todayItems(page))[0]!.layout;
  expect(edge.x + edge.w).toBeLessThanOrEqual(1 + 1e-9);
  expect(edge.y + edge.h).toBeLessThanOrEqual(1 + 1e-9);
  await expectInsidePage(page, photo);

  // 5) 새로고침해도 자리·크기·기울기가 그대로
  await reopen(page);
  expect((await todayItems(page))[0]!.layout).toEqual(edge);
  await expectInsidePage(page, items(page, 'photo').first());
  // 페이지를 넘기지는 않았다
  await expect(page.getByTestId('diary-pageno')).toHaveText('1 / 1');
  expect(errors).toEqual([]);
});

test('스티커·마스킹테이프·속지로 꾸미고, 순서·떼기, 새로고침 복원, 다른 날 페이지는 그대로', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = await open(page, '?dev=1');
  await openDiary(page);

  // 스티커 서랍: 10종
  await tool(page, 'sticker').tap();
  await expect(page.getByTestId('diary-sticker-option')).toHaveCount(10);
  await page.locator('[data-testid="diary-sticker-option"][data-sticker-id="mungchi"]').tap();
  await expect(page.getByTestId('diary-tray')).toBeHidden();
  await expect(items(page, 'sticker')).toHaveCount(1);
  await tool(page, 'done').tap();
  await tool(page, 'sticker').tap();
  await page.locator('[data-testid="diary-sticker-option"][data-sticker-id="heart"]').tap();
  await tool(page, 'done').tap();

  // 테이프 서랍: 5종
  await tool(page, 'tape').tap();
  await expect(page.getByTestId('diary-tape-option')).toHaveCount(5);
  await page.locator('[data-testid="diary-tape-option"][data-tape-id="mint-dot"]').tap();
  await expect(items(page, 'tape')).toHaveCount(1);

  // 테이프를 맨 아래로 → 스티커 아래로 들어간다
  await tool(page, 'back').tap();
  let saved = await todayItems(page);
  const z = (kind: string, id?: string) => saved.find((i) => i.kind === kind && (!id || i.stickerId === id))!.layout.z;
  expect(z('tape')).toBeLessThan(z('sticker', 'mungchi'));

  // 하트 스티커 떼기
  await tool(page, 'done').tap();
  await page.locator('[data-kind="sticker"][data-sticker-id="heart"]').tap();
  await tool(page, 'delete').tap();
  await expect(items(page, 'sticker')).toHaveCount(1);

  // 속지 서랍: 3종, 이 페이지만 바뀐다
  await tool(page, 'paper').tap();
  await expect(page.getByTestId('diary-paper-option')).toHaveCount(3);
  await page.locator('[data-testid="diary-paper-option"][data-paper-id="pink-dot"]').tap();
  await expect(page.getByTestId('diary-page')).toHaveAttribute('data-paper', 'pink-dot');
  await page.getByTestId('diary-tray-close').tap();

  saved = await todayItems(page);
  expect(saved.map((i) => i.kind).sort()).toEqual(['sticker', 'tape']);
  const day1 = await api(page).today();

  // 새로고침 후 복원
  await reopen(page);
  await expect(page.getByTestId('diary-page')).toHaveAttribute('data-paper', 'pink-dot');
  await expect(page.locator('[data-kind="sticker"][data-sticker-id="mungchi"]')).toBeVisible();
  await expect(page.locator('[data-kind="tape"][data-tape-id="mint-dot"]')).toBeVisible();
  expect(await todayItems(page)).toEqual(saved);

  // 다음 날 페이지: 비어 있고 기본 속지. 꾸며도 어제 페이지는 그대로
  await page.getByTestId('diary-close').tap();
  await page.getByRole('button', { name: 'DEV' }).click();
  await page.getByRole('button', { name: /다음 날로/ }).click();
  await page.getByRole('button', { name: 'DEV' }).click();
  await page.waitForTimeout(500);
  await openDiary(page);
  await expect(page.getByTestId('diary-page')).toHaveAttribute('data-paper', 'cream-grid');
  await expect(items(page)).toHaveCount(0);
  await tool(page, 'sticker').tap();
  await page.locator('[data-testid="diary-sticker-option"][data-sticker-id="sun"]').tap();
  const sun = page.locator('[data-kind="sticker"][data-sticker-id="sun"]');
  const sc = await center(page, sun);
  await touchDrag(page, [[sc, { x: sc.x - 80, y: sc.y - 120 }]]);
  await page.getByTestId('diary-prev').tap();
  await expect(page.getByTestId('diary-page')).toHaveAttribute('data-day', day1);
  await expect(page.getByTestId('diary-page')).toHaveAttribute('data-paper', 'pink-dot');
  const d = await api(page).diary();
  expect(d.pages[day1]!.items).toEqual(saved);
  expect(errors).toEqual([]);
});

test('글자 수는 100자까지만 써진다', async ({ page }) => {
  await open(page);
  await openDiary(page);
  await tool(page, 'text').tap();
  const input = page.getByTestId('diary-text-input');
  await input.fill('가'.repeat(130));
  await expect(input).toHaveValue('가'.repeat(100));
  await expect(page.getByTestId('diary-count')).toHaveText('100 / 100');
});

test('빈 글 칸은 남지 않는다', async ({ page }) => {
  await open(page);
  await openDiary(page);
  await tool(page, 'text').tap();
  await tool(page, 'done').tap();
  await expect(items(page)).toHaveCount(0);
  expect(await todayItems(page)).toEqual([]);
});

test('날짜별 페이지를 화살표와 손가락으로 넘긴다', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = await open(page, '?dev=1');
  await openDiary(page);
  await writeText(page, '첫째 날');
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
  await expect(items(page)).toHaveCount(0);
  await writeText(page, '둘째 날');
  await expect(page.getByTestId('diary-pageno')).toHaveText('2 / 2');
  await expect(page.getByTestId('diary-next')).toBeDisabled();

  // 화살표로 이전 날
  await page.getByTestId('diary-prev').tap();
  await expect(page.getByTestId('diary-page')).toHaveAttribute('data-day', day1);
  await expect(items(page, 'text')).toHaveText('첫째 날');
  await expect(page.getByTestId('diary-prev')).toBeDisabled();

  // 손가락으로 빈 곳을 왼쪽으로 밀면 다음 날
  const box = (await page.getByTestId('diary-page').boundingBox())!;
  const y = box.y + box.height * 0.3;
  await touchDrag(page, [[{ x: box.x + box.width * 0.85, y }, { x: box.x + box.width * 0.15, y }]], 6);
  await expect(page.getByTestId('diary-page')).toHaveAttribute('data-day', day2);
  await expect(items(page, 'text')).toHaveText('둘째 날');
  // 오른쪽으로 밀면 이전 날
  await touchDrag(page, [[{ x: box.x + box.width * 0.15, y }, { x: box.x + box.width * 0.85, y }]], 6);
  await expect(page.getByTestId('diary-page')).toHaveAttribute('data-day', day1);
  // 글 칸 위에서 민 것은 페이지 넘기기가 아니라 글 옮기기
  const t = await center(page, items(page, 'text'));
  await touchDrag(page, [[t, { x: t.x + 60, y: t.y }]]);
  await expect(page.getByTestId('diary-page')).toHaveAttribute('data-day', day1);
  await expect(page.getByTestId('diary-picker')).toBeHidden();

  // 새로고침해도 두 페이지 모두 남아 있다
  await reopen(page);
  await expect(page.getByTestId('diary-pageno')).toHaveText('2 / 2');
  expect(errors).toEqual([]);
});

test('앨범에서 원본 사진을 지워도 다이어리는 깨지지 않고, 글은 남고, 다른 사진으로 바꿀 수 있다', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = await open(page);
  await shootAndSave(page);
  await openDiary(page);
  await attachPhoto(page);
  await expectPhotoLoaded(page);
  await tool(page, 'done').tap();
  await writeText(page, '지워질 사진');
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
  await reopen(page);
  const photo = items(page, 'photo').first();
  await expect(photo).toHaveAttribute('data-state', 'missing');
  await expect(photo).toContainText('앨범에서 지워진 사진이에요');
  await expect(items(page, 'text')).toHaveText('지워질 사진');

  // 새 사진을 찍어 그 자리 사진만 바꾸기
  await page.getByTestId('diary-close').tap();
  await page.waitForTimeout(500);
  await shootAndSave(page);
  await openDiary(page);
  const layout = (await todayItems(page))[0]!.layout;
  await items(page, 'photo').first().tap();
  await tool(page, 'change').tap();
  await expect(page.getByTestId('diary-pick')).toHaveCount(1);
  await page.getByTestId('diary-pick').first().tap();
  await expectPhotoLoaded(page);
  expect((await todayItems(page))[0]!.layout.x).toBeCloseTo(layout.x, 5);

  // 사진 떼기: 글은 남는다, 앨범 사진도 남는다
  await tool(page, 'delete').tap();
  await expect(items(page, 'photo')).toHaveCount(0);
  await expect(items(page, 'text')).toHaveText('지워질 사진');
  expect(await page.evaluate(() => (window.__moongchi as Api).photoCount())).toBe(1);
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
  await writeText(page, '업데이트 후 첫 기록');
  await page.getByTestId('diary-close').tap();
  await reopen(page);
  await expect(page.getByTestId('sparkle')).toContainText('70');
  await expect(items(page, 'text')).toHaveText('업데이트 후 첫 기록');
  expect(errors).toEqual([]);
});

test('다이어리 v0.1 저장(버전 2)의 사진·글 페이지가 v0.2에서 그대로 열리고 꾸밀 수 있다', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem(
      'moongchi.save',
      JSON.stringify({
        version: 2,
        wallet: { sparkle: 25 },
        petting: { lastRewardDay: null, totalStrokes: 3 },
        character: { x: null, y: null },
        progress: { createdAt: 1, lastSeenAt: 2 },
        diary: {
          pages: {
            '2026-01-05': {
              dayKey: '2026-01-05',
              createdAt: 1,
              updatedAt: 2,
              paper: 'cream-grid',
              items: [
                { id: 'old-p', kind: 'photo', photoId: 'gone', layout: { x: 0.24, y: 0.11, w: 0.52, h: 0.56, rot: -2, z: 1 } },
                { id: 'old-t', kind: 'text', text: 'v0.1에서 쓴 글', layout: { x: 0.1, y: 0.71, w: 0.8, h: 0.24, rot: 0, z: 2 } },
              ],
            },
          },
        },
      }),
    );
  });
  const errors = await open(page);
  await expect(page.getByTestId('sparkle')).toContainText('25');
  await openDiary(page);
  await page.getByTestId('diary-prev').tap();
  await expect(page.getByTestId('diary-page')).toHaveAttribute('data-day', '2026-01-05');
  await expect(items(page, 'text')).toHaveText('v0.1에서 쓴 글');
  await expect(items(page, 'photo')).toHaveAttribute('data-state', 'missing');
  // 옛 페이지에도 스티커를 붙일 수 있다 (지난 날 기록이라 스파클은 없다 [가정])
  await tool(page, 'sticker').tap();
  await page.locator('[data-testid="diary-sticker-option"][data-sticker-id="star"]').tap();
  const d = await api(page).diary();
  expect(d.pages['2026-01-05']!.items.map((i) => i.id).slice(0, 2)).toEqual(['old-p', 'old-t']);
  expect(d.pages['2026-01-05']!.items.map((i) => i.kind)).toEqual(['photo', 'text', 'sticker']);
  expect((await api(page).state()).wallet.sparkle).toBe(25);
  expect(errors).toEqual([]);
});
