// Offline browser QA. All HTTP requests are intercepted; no listener is started.
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const root = resolve('dist/activity'), output = resolve('dist/previews'); mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url()), file = resolve(root, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
    if (url.origin !== 'http://localhost' || !file.startsWith(root + sep) || !existsSync(file)) return route.abort();
    return route.fulfill({ body: readFileSync(file), contentType: ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' })[extname(file)] || 'application/octet-stream' });
  });
  const load = async (game = false) => { await page.goto(`http://localhost/?preview=1${game ? '&screen=game' : ''}`); await page.locator(game ? '#game' : '#identity').waitFor(); if (!game) await page.getByText('mustacho · Offline preview').waitFor(); await page.evaluate(() => Promise.all(Array.from(document.images, image => image.decode()))); };
  const capture = async name => {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name}: horizontal overflow`);
    const outside = await page.evaluate(() => [...document.querySelectorAll('.scene-heading,.board-frame,#settings,#player-black,#player-white,#status-text,#match-actions,.room-tools,.match-footer,#main-menu-actions>.button')].filter(node => node.checkVisibility()).filter(node => { const r = node.getBoundingClientRect(); return r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1; }).map(node => node.id || node.className));
    assert.deepEqual(outside, [], `${name}: visible controls must stay within the viewport`);
    const logo = await page.locator('.scene-heading .wordmark').boundingBox();
    assert.ok(Math.abs(logo.x + logo.width / 2 - page.viewportSize().width / 2) < 1, 'Logo must be centered over the whole screen');
    if (page.viewportSize().width > 700 && await page.locator('#game').isVisible()) {
      const board = await page.locator('.board-frame').boundingBox(), panel = await page.locator('#game').boundingBox();
      assert.ok(Math.abs((board.x + panel.x + panel.width) / 2 - page.viewportSize().width / 2) < 2, 'Board and match panel must form one centered group');
    }
    await page.screenshot({ path: resolve(output, name + '.png'), fullPage: true });
  };
  await load(); assert.equal(await page.locator('#game').isVisible(), false); await capture('activity-lobby');
  await page.locator('#play-local').click(); await page.getByText('Waiting for a room player…').waitFor();
  assert.equal(await page.locator('#setup').isVisible(), false, 'Room pairing must need no settings dialog');
  await page.getByRole('button', { name: 'Cancel search' }).click();
  await page.locator('#find').click(); await page.locator('#save-setup').click(); await page.locator('#search').waitFor(); assert.equal(await page.locator('#game').isVisible(), false);
  await page.getByRole('button', { name: 'Cancel search' }).click(); assert.equal(await page.locator('#search').isVisible(), false);
  await page.locator('#create').click(); await page.locator('#friend').selectOption('demo-black'); await page.locator('#save-setup').click(); await page.locator('#game').waitFor(); await page.getByText('Waiting for a friend.', { exact: true }).first().waitFor();
  assert.equal(await page.locator('.movable').count(), 0, 'Waiting room must not allow moves');
  await load(true); assert.equal(await page.locator('canvas').count(), 0); assert.equal(await page.locator('.square').count(), 64);
  await page.locator('#flip').click(); assert.equal(await page.locator('.square').first().getAttribute('data-square'), 'h1'); await page.locator('#flip').click();
  const point = async square => { const b = await page.locator(`[data-square="${square}"]`).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const drag = async (from, to) => { const a = await point(from), b = typeof to === 'string' ? await point(to) : to; await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up(); };
  await drag('d2', 'd5'); assert.equal(await page.locator('[data-square="d2"]').getAttribute('data-piece'), 'wp');
  await drag('d2', { x: 2, y: 2 }); assert.equal(await page.locator('[data-square="d2"]').getAttribute('data-piece'), 'wp');
  await drag('d2', 'd4'); assert.equal(await page.locator('[data-square="d4"]').getAttribute('data-piece'), 'wp'); assert.match(await page.locator('#last-move').textContent(), /d4/);
  await load(true); await page.locator('[data-square="d2"]').focus(); await page.keyboard.press('Enter'); await page.locator('[data-square="d4"]').focus(); await page.keyboard.press('Enter'); assert.equal(await page.locator('[data-square="d4"]').getAttribute('data-piece'), 'wp');
  await load(true); await capture('activity-desktop');
  await page.setViewportSize({ width: 1205, height: 705 }); await capture('activity-discord');
  await page.setViewportSize({ width: 960, height: 540 }); await capture('activity-compact');
  await page.setViewportSize({ width: 390, height: 844 }); await capture('activity-mobile');
  const cdp = await page.context().newCDPSession(page), a = await point('d2'), b = await point('d4');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...a, id: 1 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...b, id: 1 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal(await page.locator('[data-square="d4"]').getAttribute('data-piece'), 'wp'); assert.equal(await page.locator('.drag-piece').count(), 0);
  await load(); await capture('activity-lobby-mobile'); assert.deepEqual(errors, []);
  console.log('Activity browser checks passed: lobby, friend selection, search/cancel, waiting-room lock, mouse/touch/keyboard moves, desktop/mobile, no Canvas or browser errors.');
} finally { await browser.close(); }
