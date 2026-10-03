import { loadPlaywright, loadAxe, serial } from '#tools/tooling.js';
/** Real-browser checks for the shared live scene: hero interaction, story chapters and every fallback. */
import { join, resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium } = await loadPlaywright();
const { AxeBuilder } = await loadAxe();
const origin = process.env.WWW_TEST_URL ?? 'http://127.0.0.1:4173';
const output = resolve(process.env.WWW_REPORT_DIR ?? 'out/research/marketing-www/oct2026-redesign/story');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  ...(process.env.CHROME_CHANNEL
    ? { channel: process.env.CHROME_CHANNEL }
    : { executablePath: process.env.CHROME_PATH ?? '/usr/bin/chromium' }),
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const chapterCount = 9;
/** @type {(page: import('playwright').Page, selector: string) => Promise<number>} */
const frames = async (page, selector) => Number((await page.locator(selector).getAttribute('data-frames')) ?? 0);
/** @type {(page: import('playwright').Page, index: number, width: number) => Promise<void>} */
const readChapter = async (page, index, width) => {
  await page.locator('[data-story-chapter]').nth(index).evaluate(
    (element, { width }) => {
      if (!(element instanceof HTMLElement)) throw new Error('Chapter must be HTML');
      const anchor = innerHeight * (width <= 760 ? 0.72 : 0.5);
      scrollTo({ top: scrollY + element.getBoundingClientRect().top + element.offsetHeight * 0.4 - anchor, behavior: 'instant' });
    },
    { width },
  );
  await page.waitForTimeout(250);
};
const evidence = [];
try {
  await serial([1440, 390], async (width) => {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    /** @type {string[]} */
    const errors = [];
    /** @type {string[]} */
    const requests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (r) => requests.push(r.url()));
    const response = await page.goto(origin, { waitUntil: 'domcontentloaded' });
    assert.ok(response);
    assert.match(response.headers()['x-robots-tag'] ?? '', /noindex/u);
    assert.equal(
      requests.some((url) => /live\.|planetary/u.test(url)),
      false,
      '3D must not load before the hero has painted',
    );
    assert.equal(requests.some((url) => /marketing-events|posthog/u.test(url)), false);
    const hero = page.locator('[data-hero-stage]');
    let heroTurns = false;
    if (width > 760) {
      // Desktop upgrades the hero after load and idle; the poster remains until a frame exists.
      await page.waitForFunction(() => document.querySelector('[data-hero-stage]')?.classList.contains('is-live'), undefined, { timeout: 30_000 });
      const slider = page.getByRole('slider', { name: 'Turn the input' });
      await page.waitForTimeout(1600);
      const settled = await frames(page, '[data-hero-stage]');
      await page.waitForTimeout(500);
      assert.equal(await frames(page, '[data-hero-stage]'), settled, 'Idle hero renders no frames');
      await slider.focus();
      await page.keyboard.press('ArrowRight');
      assert.ok((await frames(page, '[data-hero-stage]')) >= settled, 'Keyboard turns the input');
      const box = await hero.locator('.hero-model').boundingBox();
      assert.ok(box);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2, { steps: 8 });
      await page.mouse.up();
      const value = Number(await slider.inputValue());
      assert.ok(value > 150, `Dragging turns the sun (input ${value}°)`);
      assert.match((await page.locator('[data-readout]').textContent()) ?? '', /Output [\d.]+° · 4:1/u);
      heroTurns = true;
    }
    const stage = page.locator('[data-story-stage]');
    await serial(
      Array.from({ length: chapterCount }, (_, index) => index),
      async (index) => {
        await readChapter(page, index, width);
        if (index === 0) {
          await page.waitForFunction(() => document.querySelector('[data-story-stage]')?.classList.contains('is-live'), undefined, { timeout: 30_000 });
        }
        assert.equal(await stage.getAttribute('data-chapter'), String(index));
        assert.equal(await page.locator('[data-story-stage] canvas').count(), 1, 'One shared canvas in the story');
        assert.equal(await page.locator('canvas').count(), 1, 'Exactly one WebGL canvas on the page');
        const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
        assert.deepEqual(audit.violations.map((v) => v.id), [], `chapter ${index}`);
        await page.screenshot({ path: join(output, `${width}-chapter-${index}.png`) });
      },
    );
    const idle = await frames(page, '[data-story-stage]');
    await page.waitForTimeout(500);
    assert.equal(await frames(page, '[data-story-stage]'), idle, 'Idle story renders no frames');
    await page.getByRole('button', { name: 'Show still frames' }).click();
    const paused = await frames(page, '[data-story-stage]');
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(250);
    assert.equal(await frames(page, '[data-story-stage]'), paused, 'Still frames stop rendering');
    assert.equal(await page.locator('[data-story-poster]').isVisible(), true);
    await page.getByRole('button', { name: 'Show live 3D' }).click();
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(250);
    assert.ok((await frames(page, '[data-story-stage]')) > paused, 'Live view resumes');
    await page.evaluate(() => scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
    await page.waitForTimeout(250);
    const offscreen = await frames(page, '[data-story-stage]');
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(300);
    assert.equal(await frames(page, '[data-story-stage]'), offscreen, 'Offscreen story renders no frames');
    await readChapter(page, 4, width);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const hidden = await frames(page, '[data-story-stage]');
    await readChapter(page, 5, width);
    assert.equal(await frames(page, '[data-story-stage]'), hidden, 'Synthetic hidden state suppresses frames');
    await page.evaluate(() => {
      Reflect.deleteProperty(document, 'hidden');
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(200);
    assert.equal(await page.locator('canvas').count(), 0, 'Reduced motion disposes the renderer');
    assert.equal(await page.locator('[data-story-poster]').isVisible(), true);
    assert.deepEqual(errors, []);
    evidence.push({ width, chapters: chapterCount, heroTurns, idleFrames: 0, stillToggle: true, offscreenFrames: 0, reducedMotionDisposal: true, errors });
    await context.close();
  });

  // Reduced motion from the start: no 3D request, still frames follow the reading position.
  const reduced = await browser.newContext({ reducedMotion: 'reduce' });
  const rp = await reduced.newPage();
  /** @type {string[]} */
  const reducedRequests = [];
  rp.on('request', (r) => reducedRequests.push(r.url()));
  await rp.goto(origin);
  await readChapter(rp, 6, 1280);
  assert.equal(reducedRequests.some((url) => /live\.|planetary/u.test(url)), false);
  assert.match((await rp.locator('[data-story-poster]').getAttribute('src')) ?? '', /story-6\.webp$/u);
  assert.equal(await rp.locator('[data-story-chapter]').count(), chapterCount);
  await reduced.close();

  // No WebGL2 at all: same reading path, no 3D download.
  const noGl = await browser.newContext();
  const np = await noGl.newPage();
  await np.addInitScript(() => Reflect.deleteProperty(globalThis, 'WebGL2RenderingContext'));
  /** @type {string[]} */
  const noGlRequests = [];
  np.on('request', (r) => noGlRequests.push(r.url()));
  await np.goto(origin);
  await readChapter(np, 7, 1280);
  assert.equal(noGlRequests.some((url) => /live\.|planetary/u.test(url)), false);
  assert.match((await np.locator('[data-story-poster]').getAttribute('src')) ?? '', /story-7\.webp$/u);
  await np.screenshot({ path: join(output, 'no-webgl-chapter-7.png') });
  await noGl.close();

  const fail = await browser.newContext();
  const fp = await fail.newPage();
  await fp.route('**/planetary.bin.gz', async (route) => route.abort());
  await fp.goto(origin);
  await fp.locator('[data-story-stage]').scrollIntoViewIfNeeded();
  await fp.waitForFunction(() => {
    const stage = document.querySelector('[data-story-stage]');
    return stage instanceof HTMLElement && stage.dataset['fallback'] === 'true';
  });
  assert.equal(await fp.locator('[data-story-poster]').isVisible(), true);
  await fail.close();

  const loss = await browser.newContext();
  const lp = await loss.newPage();
  await lp.goto(origin);
  await lp.locator('[data-story-stage]').scrollIntoViewIfNeeded();
  await lp.waitForFunction(() => document.querySelector('[data-story-stage]')?.classList.contains('is-live') === true, undefined, { timeout: 30_000 });
  await lp.locator('canvas').evaluate((canvas) => {
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Expected canvas');
    const extension = canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('Context loss extension required by this check');
    extension.loseContext();
  });
  await lp.waitForTimeout(250);
  assert.equal(await lp.locator('canvas').count(), 0);
  assert.equal(await lp.locator('[data-story-poster]').isVisible(), true);
  await loss.close();

  const leaving = await browser.newContext();
  const leavingPage = await leaving.newPage();
  /** @type {(() => void) | undefined} */
  let releaseResponse;
  const responseGate = new Promise((done) => {
    releaseResponse = () => done(undefined);
  });
  await leavingPage.route('**/planetary.bin.gz', async (route) => {
    const response = await route.fetch();
    await responseGate;
    await route.fulfill({ response });
  });
  await leavingPage.goto(origin);
  const requestedModel = leavingPage.waitForRequest('**/planetary.bin.gz');
  await leavingPage.locator('[data-story-stage]').scrollIntoViewIfNeeded();
  await requestedModel;
  await leavingPage.evaluate(() => globalThis.dispatchEvent(new PageTransitionEvent('pagehide')));
  assert.ok(releaseResponse);
  releaseResponse();
  await leavingPage.waitForTimeout(300);
  assert.equal(await leavingPage.locator('canvas').count(), 0, 'Page exit during fetch must not allocate a renderer');
  await leaving.close();
  await writeFile(
    join(output, 'results.json'),
    JSON.stringify(
      {
        evidence,
        reducedMotionNoLoad: true,
        noWebglNoLoad: true,
        syntheticHiddenVisibilityGate: true,
        networkFailureFallback: true,
        contextLossFallback: true,
        syntheticPagehideDuringDownload: true,
      },
      null,
      2,
    ),
  );
  console.log('PASS: hero drag/keyboard, 18 live chapters, idle/offscreen/hidden gates, stills, reduced motion, no-WebGL, network, context loss and page exit.');
} finally {
  await browser.close();
}
