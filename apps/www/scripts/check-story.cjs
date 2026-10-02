/** Real-browser checks for the lazy scene and its public reading path. */
const { createRequire } = require('node:module');
const { join, resolve } = require('node:path');
const { mkdir, writeFile } = require('node:fs/promises');
const assert = require('node:assert/strict');
const requireTools = createRequire(join(resolve(process.env.WWW_RENDER_TOOLS), 'package.json'));
const { chromium } = requireTools('playwright');
const { AxeBuilder } = requireTools('@axe-core/playwright');
const origin = process.env.WWW_TEST_URL || 'http://127.0.0.1:4173';
const output = resolve(process.env.WWW_REPORT_DIR || 'out/research/marketing-www/oct2026-refresh/story');
(async () => {
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const evidence = [];
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      const errors = [],
        requests = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('request', (r) => requests.push(r.url()));
      const response = await page.goto(origin);
      assert.match(response.headers()['x-robots-tag'], /noindex/u);
      await page.waitForTimeout(250);
      assert.equal(
        requests.some((url) => /story-scene|planetary/u.test(url)),
        false,
        '3D must not load with hero',
      );
      assert.equal(
        requests.some((url) => /marketing-events|posthog/u.test(url)),
        false,
      );
      const stage = page.locator('[data-story-stage]');
      const chapters = page.locator('[data-story-chapter]');
      for (let index = 0; index < 8; index++) {
        await chapters.nth(index).evaluate(
          (element, { index, width }) => {
            const anchor = innerHeight * (width <= 760 ? 0.76 : 0.52);
            scrollTo({
              top: scrollY + element.getBoundingClientRect().top + element.offsetHeight * 0.35 - anchor,
              behavior: 'instant',
            });
          },
          { index, width },
        );
        await page.waitForFunction(() => document.querySelector('[data-story-stage]').classList.contains('is-live'));
        await page.waitForTimeout(150);
        assert.equal(await stage.getAttribute('data-chapter'), String(index));
        assert.equal(await page.locator('.story-surface canvas').count(), 1);
        const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
        assert.deepEqual(
          audit.violations.map((v) => v.id),
          [],
        );
        await page.screenshot({ path: join(output, `${width}-chapter-${index}.png`) });
      }
      const before = await stage.getAttribute('data-frames');
      await page.waitForTimeout(400);
      assert.equal(await stage.getAttribute('data-frames'), before, 'Idle should render no frames');
      await page.getByRole('button', { name: 'Pause motion' }).click();
      const paused = await stage.getAttribute('data-frames');
      await page.mouse.wheel(0, -300);
      await page.waitForTimeout(200);
      assert.equal(await stage.getAttribute('data-frames'), paused);
      await page.getByRole('button', { name: 'Resume motion' }).click();
      await page.waitForTimeout(200);
      assert.notEqual(await stage.getAttribute('data-frames'), paused);
      await page.evaluate(() => {
        scrollTo({ top: document.body.scrollHeight, behavior: 'instant' });
      });
      await page.waitForTimeout(200);
      const offscreen = await stage.getAttribute('data-frames');
      await page.waitForTimeout(400);
      assert.equal(await stage.getAttribute('data-frames'), offscreen);
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      const hiddenFrames = await stage.getAttribute('data-frames');
      await chapters.nth(3).scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      assert.equal(await stage.getAttribute('data-frames'), hiddenFrames, 'Visibility gate should suppress frames');
      await page.evaluate(() => {
        delete document.hidden;
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.waitForTimeout(200);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      assert.equal(await page.locator('.story-surface canvas').count(), 0);
      assert.equal(await page.locator('.story-poster').isVisible(), true);
      assert.deepEqual(errors, []);
      evidence.push({
        width,
        chapters: 8,
        idleFrames: 0,
        pause: true,
        offscreenFrames: 0,
        reducedMotionDisposal: true,
        errors,
      });
      await context.close();
    }
    const reduced = await browser.newContext({ reducedMotion: 'reduce' });
    const rp = await reduced.newPage();
    const requests = [];
    rp.on('request', (r) => requests.push(r.url()));
    await rp.goto(origin);
    await rp.locator('[data-story-stage]').scrollIntoViewIfNeeded();
    await rp.waitForTimeout(300);
    assert.equal(
      requests.some((url) => /story-scene|planetary/u.test(url)),
      false,
    );
    assert.equal(await rp.locator('[data-story-chapter]').count(), 8);
    await reduced.close();
    const fail = await browser.newContext();
    const fp = await fail.newPage();
    await fp.route('**/planetary.bin.gz', (route) => route.abort());
    await fp.goto(origin);
    await fp.locator('[data-story-stage]').scrollIntoViewIfNeeded();
    await fp.waitForFunction(() => document.querySelector('[data-story-stage]').dataset.fallback === 'true');
    assert.equal(await fp.locator('.story-poster').isVisible(), true);
    assert.equal(await fp.locator('[data-story-chapter]').count(), 8);
    await fail.close();
    const loss = await browser.newContext();
    const lp = await loss.newPage();
    await lp.goto(origin);
    await lp.locator('[data-story-stage]').scrollIntoViewIfNeeded();
    await lp.waitForFunction(() => document.querySelector('[data-story-stage]').classList.contains('is-live'));
    await lp
      .locator('canvas')
      .evaluate((canvas) => canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
    await lp.waitForTimeout(200);
    assert.equal(await lp.locator('canvas').count(), 0);
    assert.equal(await lp.locator('.story-poster').isVisible(), true);
    await loss.close();
    await writeFile(
      join(output, 'results.json'),
      JSON.stringify(
        {
          evidence,
          reducedMotionNoLoad: true,
          syntheticHiddenVisibilityGate: true,
          networkFailureFallback: true,
          contextLossFallback: true,
        },
        null,
        2,
      ),
    );
    console.log(
      'PASS: 16 rendered chapters, motion gates, pause/resume, reduced motion, network and context-loss fallback.',
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
