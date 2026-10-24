import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { content as download } from '#app/routes/download.js';
import { loadPlaywright } from '#tools/tooling.js';
import { describe, expect, it } from 'vitest';
import { projection } from '#www/download-catalog.fixture.js';

const markup = `<body>${renderToStaticMarkup(createElement(MemoryRouter, null, download()))}</body>`;

describe('shipping installer catalog browser behavior', () => {
  it('keeps the default off and admits only qualified installers with APT enrollment and archive alternatives', async () => {
    const bundle = await build({
      entryPoints: ['src/download-catalog.client.ts'],
      bundle: true,
      write: false,
      format: 'iife',
      globalName: 'TauDownloads',
      platform: 'browser',
    });
    const { chromium } = await loadPlaywright();
    const browser = await chromium.launch({ channel: 'chromium', headless: true });
    try {
      const page = await browser.newPage();
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'userAgentData', { value: { platform: 'macOS', mobile: false } });
        Object.defineProperty(navigator, 'platform', { value: 'MacIntel' });
      });
      let requests = 0;
      let value: unknown = projection();
      await page.route('https://tau.new/download/', async (route) =>
        route.fulfill({ contentType: 'text/html', body: markup }),
      );
      await page.route('https://downloads.tau.new/latest/installers.json', async (route) => {
        requests += 1;
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify(value),
          headers: { 'Access-Control-Allow-Origin': 'https://tau.new' },
        });
      });
      await page.goto('https://tau.new/download/');
      await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
      await page.evaluate('TauDownloads.initializeInstallerCatalog(new AbortController().signal)');
      expect(requests).toBe(0);
      expect(await page.locator('[data-download-platform="mac"]').getAttribute('href')).toContain('.zip');
      await page.evaluate('document.body.dataset.installerCatalog="true"');
      await page.evaluate('TauDownloads.initializeInstallerCatalog(new AbortController().signal)');
      expect(requests).toBe(1);
      expect(await page.locator('[data-download-detail="host"]').textContent()).toContain('DMG');
      expect(await page.locator('[data-download-platform="mac"]').getAttribute('href')).toContain(
        '/desktop%400.2.0/Tau-macos-arm64.dmg',
      );
      expect(await page.locator('[data-download-platform="macIntel"]').first().getAttribute('href')).toContain(
        'Tau-macos-x64.dmg',
      );
      expect(await page.locator('[data-download-platform="windows"]').getAttribute('href')).toContain('.exe');
      expect(await page.locator('[data-download-platform="linux"]').getAttribute('href')).toBe(
        '/download/#linux-installation',
      );
      await page.locator('[data-download-platform="linux"]').click();
      expect(await page.locator('#linux-installation').getAttribute('open')).not.toBeNull();
      expect(await page.locator('#linux-installation').textContent()).toContain('independently verify');
      expect(await page.locator('[data-qualified-downloads] a[href$=".deb"]').count()).toBe(2);
      expect(await page.locator('[data-qualified-downloads] a[href$=".AppImage"]').count()).toBe(1);
      expect(await page.locator('[data-qualified-downloads] a[href$=".zip"]').count()).toBe(3);
      value = { ...projection(), promoted: false };
      await page.goto('https://tau.new/download/');
      await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
      await page.evaluate('document.body.dataset.installerCatalog="true"');
      await page.evaluate('TauDownloads.initializeInstallerCatalog(new AbortController().signal)');
      expect(await page.locator('[data-download-platform="windows"]').getAttribute('href')).toContain('.zip');
      expect(await page.locator('[data-platform-note]').textContent()).toContain(
        'Windows and Linux builds are updated manually',
      );
      expect(await page.locator('[data-qualified-downloads]').isHidden()).toBe(true);
    } finally {
      await browser.close();
    }
  }, 30_000);
});
