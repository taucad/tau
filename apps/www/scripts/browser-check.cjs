const { createRequire } = require('node:module');
const { resolve, join } = require('node:path');
const { mkdir, writeFile } = require('node:fs/promises');
const assert = require('node:assert/strict');
const toolRequire = process.env.WWW_RENDER_TOOLS
  ? createRequire(join(resolve(process.env.WWW_RENDER_TOOLS), 'package.json'))
  : require;
const { chromium } = toolRequire('playwright');
const { AxeBuilder } = toolRequire('@axe-core/playwright');
const output = resolve(process.env.WWW_REPORT_DIR || 'out/research/marketing-www/oct2026');
const origin = process.env.WWW_TEST_URL || 'http://127.0.0.1:4173';
(async () => {
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox'],
  });
  const results = [];
  try {
    for (const [name, width, height, colorScheme] of [
      ['desktop', 1440, 1000, 'light'],
      ['mobile', 390, 844, 'light'],
      ['narrow', 320, 844, 'light'],
      ['dark', 1440, 1000, 'dark'],
    ]) {
      const context = await browser.newContext({ viewport: { width, height }, colorScheme, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const routes = [
        '/',
        '/product/',
        '/use-cases/',
        '/use-cases/prototyping/',
        '/use-cases/engineering/',
        '/use-cases/learning/',
        '/vision/',
        '/pricing/',
        '/download/',
        '/blog/',
        '/privacy/',
        '/missing-page',
      ];
      for (const path of routes) {
        const response = await page.goto(origin + path);
        assert.equal(response.status(), path === '/missing-page' ? 404 : 200);
        await page.evaluate(() => document.fonts.ready);
        assert.equal(await page.getByRole('main').count(), 1);
        assert.equal(await page.getByRole('heading', { level: 1 }).count(), 1);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
          `${name} ${path} overflow`,
        );
        const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
        results.push({
          viewport: name,
          path,
          violations: audit.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            nodes: v.nodes.map((n) => n.target),
          })),
        });
        assert.deepEqual(
          audit.violations.map((v) => v.id),
          [],
          `${name} ${path}`,
        );
      }
      await page.goto(origin);
      await page.getByRole('button', { name: 'Assembled', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('#assembly-image').src.endsWith('/assembly.webp'));
      assert.equal(
        await page.getByRole('button', { name: 'Assembled', exact: true }).getAttribute('aria-pressed'),
        'true',
      );
      await page.getByRole('button', { name: 'Exploded', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('#assembly-image').src.endsWith('/exploded.webp'));
      if (width < 760) {
        await page.getByText('Menu', { exact: true }).click();
        assert.equal(await page.getByRole('navigation', { name: 'Mobile navigation' }).isVisible(), true);
        await page.keyboard.press('Escape');
        assert.equal(await page.getByRole('navigation', { name: 'Mobile navigation' }).isVisible(), false);
      }
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 650) {
          scrollTo(0, y);
          await new Promise((done) => setTimeout(done, 80));
        }
        scrollTo(0, 0);
      });
      await page.waitForTimeout(250);
      await page.screenshot({ path: join(output, `${name}.png`), fullPage: true });
      assert.deepEqual(errors, []);
      await context.close();
    }
    const nojs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    const nojsPage = await nojs.newPage();
    await nojsPage.goto(origin);
    await nojsPage.getByText('Menu', { exact: true }).click();
    assert.equal(await nojsPage.getByRole('navigation', { name: 'Mobile navigation' }).isVisible(), true);
    await nojsPage.getByRole('navigation').getByRole('link', { name: 'Pricing', exact: true }).click();
    assert.ok(nojsPage.url().endsWith('/pricing/'));
    await nojs.close();
    const context = await browser.newContext();
    const page = await context.newPage();
    const events = [];
    await page.route('**/api/marketing-events', async (route) => {
      events.push({ body: route.request().postDataJSON(), headers: route.request().headers() });
      await route.fulfill({ status: 204 });
    });
    await page.route('**/*', async (route) => {
      if (route.request().resourceType() !== 'document') {
        await route.fallback();
        return;
      }
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: (await response.text()).replace(
          'data-analytics-endpoint=""',
          'data-analytics-endpoint="/api/marketing-events"',
        ),
      });
    });
    await page.goto(origin + '/?token=secret-bearer&utm_campaign=person@example.com');
    assert.equal(events.length, 0);
    await page.getByRole('button', { name: 'Allow analytics', exact: true }).click();
    await page.waitForTimeout(100);
    assert.equal(events.length, 1);
    assert.equal(events[0].body.event, 'marketing_page_view');
    assert.equal(events[0].headers.referer, undefined);
    assert.equal(JSON.stringify(events[0].body).includes('secret-bearer'), false);
    assert.equal(JSON.stringify(events[0].body).includes('person@example.com'), false);
    await page.getByRole('button', { name: 'Analytics preferences' }).click();
    await page.getByRole('button', { name: 'Allow analytics', exact: true }).click();
    await page.waitForTimeout(100);
    assert.equal(events.length, 1);
    await page
      .getByRole('link', { name: 'Open Tau', exact: true })
      .evaluate((element) => element.addEventListener('click', (event) => event.preventDefault()));
    await page.getByRole('link', { name: 'Open Tau', exact: true }).click();
    await page.getByRole('link', { name: 'Open Tau', exact: true }).click();
    await page.waitForTimeout(100);
    assert.equal(events.filter((item) => item.body.event === 'marketing_cta_click').length, 1);
    await page.goto(origin + '/privacy/');
    await page.getByRole('button', { name: 'Reset analytics preference' }).click();
    assert.equal(await page.evaluate(() => localStorage.getItem('tau-www-analytics-consent-v1')), null);
    assert.equal(await page.evaluate(() => localStorage.getItem('tau-www-visited-v1')), null);
    await context.close();
    const gpc = await browser.newContext();
    await gpc.addInitScript(() => Object.defineProperty(navigator, 'globalPrivacyControl', { value: true }));
    await gpc.addInitScript(() => localStorage.setItem('tau-www-analytics-consent-v1', 'accepted'));
    let gpcEvents = 0;
    await gpc.route('**/api/marketing-events', async (route) => {
      gpcEvents += 1;
      await route.fulfill({ status: 204 });
    });
    await gpc.route('**/*', async (route) => {
      if (route.request().resourceType() !== 'document') {
        await route.fallback();
        return;
      }
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: (await response.text()).replace(
          'data-analytics-endpoint=""',
          'data-analytics-endpoint="/api/marketing-events"',
        ),
      });
    });
    const gpcPage = await gpc.newPage();
    await gpcPage.goto(origin);
    assert.equal(await gpcPage.getByRole('complementary', { name: 'Optional analytics' }).isVisible(), false);
    await gpcPage.waitForTimeout(100);
    assert.equal(gpcEvents, 0);
    await gpc.close();
    await writeFile(
      join(output, 'browser-check.json'),
      JSON.stringify(
        {
          results,
          checks: [
            '48 route/viewport accessibility audits',
            'assembled/exploded view switching',
            'menu and Escape',
            'no-JS navigation',
            'real 404',
            'no overflow at 320/390/1440',
            'consent before transport',
            'secret/query exclusion',
            'referrer omission',
            'pageview dedup',
            'withdrawal storage reset',
            'GPC default suppression',
          ],
        },
        null,
        2,
      ),
    );
    console.log(`PASS: ${results.length} route/viewport audits plus interaction and privacy checks.`);
  } finally {
    await browser.close();
  }
})();
