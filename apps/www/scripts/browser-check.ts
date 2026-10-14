import type { ImpactValue, UnlabelledFrameSelector } from 'axe-core';
import { loadPlaywright, loadAxe, auditPage, serial } from '#tools/tooling.js';
import { resolve, join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium } = await loadPlaywright();
const axe = await loadAxe();
const output = resolve(process.env['WWW_REPORT_DIR'] ?? 'out/research/marketing-www/oct2026');
const origin = process.env['WWW_TEST_URL'] ?? 'http://127.0.0.1:4173';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  ...(process.env['CHROME_CHANNEL']
    ? { channel: process.env['CHROME_CHANNEL'] }
    : { executablePath: process.env['CHROME_PATH'] }),
  args: ['--no-sandbox'],
});
const results: Array<{
  viewport: string;
  path: string;
  violations: Array<{
    id: string;
    impact: ImpactValue | undefined;
    nodes: UnlabelledFrameSelector[];
  }>;
}> = [];
try {
  const viewports: Array<{
    name: string;
    width: number;
    height: number;
    colorScheme: 'light' | 'dark';
  }> = [
    { name: 'desktop', width: 1440, height: 1000, colorScheme: 'light' },
    { name: 'mobile', width: 390, height: 844, colorScheme: 'light' },
    { name: 'narrow', width: 320, height: 844, colorScheme: 'light' },
    { name: 'dark', width: 1440, height: 1000, colorScheme: 'dark' },
  ];
  await serial(viewports, async ({ name, width, height, colorScheme }) => {
    const context = await browser.newContext({
      viewport: { width, height },
      colorScheme,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const errors: string[] = [];
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
      '/contact/',
      '/download/',
      '/blog/',
      '/privacy/',
      '/missing-page',
    ];
    await serial(routes, async (path) => {
      const response = await page.goto(origin + path);
      assert.ok(response);
      assert.equal(response.status(), path === '/missing-page' ? 404 : 200);
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      assert.equal(await page.getByRole('main').count(), 1);
      assert.equal(await page.getByRole('heading', { level: 1 }).count(), 1);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
        `${name} ${path} overflow`,
      );
      // Axe cannot infer text contrast over the metallic gradient; verify token composition directly.
      const primaryForegroundsMatch = await page.evaluate(() => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--primary-action-foreground)';
        document.body.append(probe);
        const expected = getComputedStyle(probe).color;
        const matches = [...document.querySelectorAll('.primary-action')].every(
          (button) => getComputedStyle(button).color === expected,
        );
        probe.remove();
        return matches;
      });
      assert.equal(primaryForegroundsMatch, true, `${name} ${path} primary action foreground`);
      const audit = await auditPage(page, axe, ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']);
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
    });
    await page.goto(origin);
    if (width < 1080) {
      await page.locator('.mobile-menu summary').click();
      assert.equal(await page.getByRole('navigation', { name: 'Mobile navigation' }).isVisible(), true);
      await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('navigation', { name: 'Mobile navigation' }).isVisible(), false);
    }
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 650) {
        scrollTo(0, y);
        // oxlint-disable-next-line eslint/no-await-in-loop -- A single browser viewport must visit scroll positions sequentially to load lazy imagery.
        await new Promise((resolve) => {
          setTimeout(resolve, 80);
        });
      }
      scrollTo(0, 0);
    });
    await page.waitForTimeout(250);
    await page.screenshot({
      path: join(output, `${name}.png`),
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    await context.close();
  });
  const navigationContext = await browser.newContext({ reducedMotion: 'reduce' });
  const navigationPage = await navigationContext.newPage();
  const navigationErrors: string[] = [];
  const dataRequests: string[] = [];
  navigationPage.on('pageerror', (error) => navigationErrors.push(error.message));
  navigationPage.on('request', (request) => {
    if (request.url().includes('.data')) {
      dataRequests.push(request.url());
    }
  });
  await navigationPage.goto(origin);
  await navigationPage.evaluate(() => {
    document.documentElement.dataset['navigationProbe'] = 'retained';
  });
  await navigationPage
    .getByRole('navigation', { name: 'Main navigation', exact: true })
    .getByRole('link', { name: 'Pricing' })
    .click();
  await navigationPage.waitForURL(`${origin}/pricing/`);
  // React Router updates history before React commits the destination metadata.
  await navigationPage.waitForFunction(() => /Pricing/u.test(document.title));
  assert.match(await navigationPage.title(), /Pricing/u);
  await navigationPage.getByRole('link', { name: 'Tau home' }).first().click();
  await navigationPage.waitForURL(`${origin}/`);
  assert.equal(await navigationPage.evaluate(() => document.documentElement.dataset['navigationProbe']), 'retained');
  assert.ok(dataRequests.some((url) => url.includes('/pricing.data?_routes=www-pricing')));
  assert.ok(dataRequests.some((url) => url.includes('/_root.data?_routes=www-home')));
  assert.equal(await navigationPage.locator('#main:focus').count(), 1);
  assert.deepEqual(navigationErrors, []);
  await navigationContext.close();
  await serial(
    [
      { platform: 'MacIntel', label: 'Mac', file: 'Tau-macos-arm64.zip', intel: true },
      { platform: 'Win32', label: 'Windows', file: 'Tau-win32-x64.zip', intel: false },
      { platform: 'Linux x86_64', label: 'Linux', file: 'Tau-linux-x64.tar.gz', intel: false },
    ],
    async ({ platform, label, file, intel }) => {
      const downloadContext = await browser.newContext({ reducedMotion: 'reduce' });
      await downloadContext.addInitScript((hostPlatform: string) => {
        Object.defineProperty(navigator, 'platform', { value: hostPlatform });
        Object.defineProperty(navigator, 'userAgentData', { value: undefined });
        Object.defineProperty(navigator, 'userAgent', { value: hostPlatform });
      }, platform);
      const downloadPage = await downloadContext.newPage();
      const errors: string[] = [];
      downloadPage.on('pageerror', (error) => errors.push(error.message));
      await downloadPage.goto(origin);
      await downloadPage
        .locator('[data-placement="hero"]')
        .filter({ hasText: `Download for ${label}` })
        .waitFor();
      await downloadPage.locator('[data-placement="hero"]').click();
      await downloadPage.waitForURL(`${origin}/download/`);
      const primaryDownload = downloadPage.locator('[data-host-download="direct"]');
      await primaryDownload.filter({ hasText: `Download for ${label}` }).waitFor();
      assert.equal(await primaryDownload.getAttribute('href'), `https://downloads.tau.new/latest/${file}`);
      assert.equal(await downloadPage.locator('[data-mac-intel]').isVisible(), intel);
      await downloadPage.getByRole('link', { name: 'Tau home' }).first().click();
      await downloadPage.waitForURL(`${origin}/`);
      await downloadPage
        .locator('[data-placement="hero"]')
        .filter({ hasText: `Download for ${label}` })
        .waitFor();
      assert.deepEqual(errors, []);
      await downloadContext.close();
    },
  );
  const nojs = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  const nojsPage = await nojs.newPage();
  await nojsPage.goto(origin);
  await nojsPage.locator('.mobile-menu summary').click();
  assert.equal(await nojsPage.getByRole('navigation', { name: 'Mobile navigation' }).isVisible(), true);
  await nojsPage
    .getByRole('navigation', { name: 'Mobile navigation' })
    .getByRole('link', { name: 'Pricing', exact: true })
    .click();
  assert.ok(nojsPage.url().endsWith('/pricing/'));
  await nojsPage.goto(origin + '/download/');
  for (const file of ['Tau-macos-arm64.zip', 'Tau-macos-x64.zip', 'Tau-win32-x64.zip', 'Tau-linux-x64.tar.gz']) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Inspect all four SSR archive links in this one browser document.
    assert.equal(await nojsPage.locator(`#downloads a[href="https://downloads.tau.new/latest/${file}"]`).count(), 1);
  }
  await nojsPage.goto(origin + '/privacy/');
  assert.equal(await nojsPage.getByRole('button', { name: 'Reset analytics preference' }).isDisabled(), true);
  await nojs.close();
  const context = await browser.newContext();
  const page = await context.newPage();
  // Exercise the shared UUID helper's plain-HTTP fallback without changing navigation.
  await page.addInitScript(() => {
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      value: undefined,
    });
  });

  const events: Array<{
    body: Record<string, unknown>;
    headers: Record<string, string>;
  }> = [];
  await page.route('**/api/marketing-events', async (route) => {
    const rawBody = route.request().postData();
    assert.ok(rawBody);

    const body: unknown = JSON.parse(rawBody);
    assert.ok(typeof body === 'object' && body !== null && !Array.isArray(body));
    events.push({
      body: Object.fromEntries(Object.entries(body)),
      headers: route.request().headers(),
    });
    await route.fulfill({ status: 204 });
  });
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') {
      await route.fallback();
      return;
    }
    const response = await route.fetch();
    const html = await response.text();
    await route.fulfill({
      response,
      body: html.replace('data-analytics-endpoint=""', 'data-analytics-endpoint="/api/marketing-events"'),
    });
  });
  await page.goto(origin + '/?token=secret-bearer&utm_campaign=person@example.com');
  assert.equal(events.length, 0);
  await page.getByRole('button', { name: 'Allow analytics', exact: true }).click();
  await page.waitForTimeout(100);
  assert.equal(events.length, 1);
  assert.ok(events[0]);
  assert.equal(events[0].body['event'], 'marketing_page_view');
  assert.equal(typeof events[0].body['event_id'], 'string');
  assert.match(String(events[0].body['event_id']), /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/u);
  assert.equal(events[0].headers['referer'], undefined);
  assert.equal(JSON.stringify(events[0].body).includes('secret-bearer'), false);
  assert.equal(JSON.stringify(events[0].body).includes('person@example.com'), false);
  await page.getByRole('button', { name: 'Analytics preferences' }).click();
  await page.getByRole('button', { name: 'Allow analytics', exact: true }).click();
  await page.waitForTimeout(100);
  assert.equal(events.length, 1);
  await page.locator('a[data-placement="header"]').evaluate((element) => {
    element.addEventListener('click', (event) => {
      event.preventDefault();
    });
  });
  await page.locator('a[data-placement="header"]').click();
  await page.locator('a[data-placement="header"]').click();
  await page.waitForTimeout(100);
  assert.equal(events.filter((item) => item.body['event'] === 'marketing_cta_click').length, 1);
  await page.goto(origin + '/privacy/');
  await page.getByRole('button', { name: 'Reset analytics preference' }).click();
  assert.equal(await page.evaluate(() => localStorage.getItem('tau-www-analytics-consent-v1')), null);
  assert.equal(await page.evaluate(() => localStorage.getItem('tau-www-visited-v1')), null);
  await context.close();
  const gpc = await browser.newContext();
  await gpc.addInitScript(() => Object.defineProperty(navigator, 'globalPrivacyControl', { value: true }));
  await gpc.addInitScript(() => {
    localStorage.setItem('tau-www-analytics-consent-v1', 'accepted');
  });
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
    const html = await response.text();
    await route.fulfill({
      response,
      body: html.replace('data-analytics-endpoint=""', 'data-analytics-endpoint="/api/marketing-events"'),
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
          `${results.length} route/viewport accessibility audits`,
          'mobile menu open/close',
          'menu and Escape',
          'no-JS navigation and desktop archive links',
          'Mac, Windows and Linux download recommendations across client navigation',
          'client navigation, data-route ownership and focus restoration',
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
