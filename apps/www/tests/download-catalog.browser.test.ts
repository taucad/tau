import { build } from 'esbuild';
import tailwindcss from '@tailwindcss/vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { createServer } from 'vite';
import { content as download } from '#app/routes/download.js';
import { loadPlaywright } from '#tools/tooling.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { projection } from '#www/download-catalog.fixture.js';

// Driver types come through the tooling boundary, which owns the only runtime driver import.
type Browser = Awaited<ReturnType<Awaited<ReturnType<typeof loadPlaywright>>['chromium']['launch']>>;
type Page = Awaited<ReturnType<Browser['newPage']>>;

const appRoot = new URL('../', import.meta.url).pathname;

/** The page's own stylesheet, compiled as the build compiles it, so layout assertions see the shipped CSS. */
const compileSiteCss = async (): Promise<string> => {
  const server = await createServer({
    configFile: false,
    root: appRoot,
    logLevel: 'silent',
    plugins: [tailwindcss()],
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const css = (await server.ssrLoadModule('/src/site.css?inline')) as { default: string };
    return css.default;
  } finally {
    await server.close();
  }
};

/** A separately qualified Mac-only staging catalog, as the Mac-only publisher writes it. */
const macOnlyStaging = () => {
  const value = projection();
  return {
    ...value,
    tag: 'desktop-staging@0.1.0-staging.455',
    version: '1.4.55',
    channel: 'staging',
    routes: value.routes.slice(0, 2),
  };
};

type Visit = {
  readonly origin?: 'https://tau.new' | 'https://taucad.dev';
  readonly enabled?: boolean;
  readonly platform?: string;
  readonly viewport?: { width: number; height: number };
  /** The catalog response: a JSON value, raw text, an HTTP status or a network failure. */
  readonly catalog?: unknown;
};

/** What a visitor reads and follows on one rendered download page. */
type Surface = {
  readonly links: ReadonlyArray<{ text: string; href: string; visible: boolean }>;
  readonly text: string;
};

const surface = async (page: Page): Promise<Surface> => ({
  links: await page.locator('a').evaluateAll((anchors) =>
    anchors.map((anchor) => ({
      text: anchor.textContent.trim(),
      href: (anchor as HTMLAnchorElement).href,
      visible: anchor.checkVisibility(),
    })),
  ),
  text: (await page.locator('body').textContent()) ?? '',
});

describe('shipping installer catalog browser behavior', () => {
  let browser: Browser;
  let script: string;
  let css: string;
  const markup = `<body>${renderToStaticMarkup(createElement(MemoryRouter, null, download()))}</body>`;

  beforeAll(async () => {
    const bundle = await build({
      entryPoints: ['src/download-catalog.client.ts'],
      bundle: true,
      write: false,
      format: 'iife',
      globalName: 'TauDownloads',
      platform: 'browser',
    });
    script = bundle.outputFiles[0]!.text;
    css = await compileSiteCss();
    const { chromium } = await loadPlaywright();
    browser = await chromium.launch({ channel: 'chromium', headless: true });
  }, 60_000);
  afterAll(async () => {
    await browser.close();
  });

  /**
   * Open a fresh browser session on the download page and run the page's download enhancement.
   * @param visit - Host, configuration and catalog response for this session.
   * @returns The page, the catalog request count and the pre-catalog surface.
   */
  const open = async (visit: Visit = {}) => {
    const origin = visit.origin ?? 'https://tau.new';
    const downloads = origin === 'https://taucad.dev' ? 'https://downloads.taucad.dev' : 'https://downloads.tau.new';
    const context = await browser.newContext({ viewport: visit.viewport ?? { width: 1280, height: 900 } });
    await context.addInitScript((platform: string) => {
      Object.defineProperty(navigator, 'userAgentData', {
        value: { platform: platform === 'MacIntel' ? 'macOS' : platform, mobile: false },
      });
      Object.defineProperty(navigator, 'platform', { value: platform });
    }, visit.platform ?? 'MacIntel');
    const page = await context.newPage();
    const requests: string[] = [];
    await page.route('**/*', async (route) => route.abort());
    await page.route(`${origin}/download/`, async (route) =>
      route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: `<!doctype html><html lang="en">${markup}</html>`,
      }),
    );
    await page.route(`${downloads}/latest/installers.json`, async (route) => {
      requests.push(route.request().url());
      const { catalog } = visit;
      if (catalog === 'network-failure') {
        await route.abort('internetdisconnected');
      } else if (typeof catalog === 'number') {
        await route.fulfill({ status: catalog, body: 'unavailable' });
      } else {
        await route.fulfill({
          contentType: 'application/json',
          body: typeof catalog === 'string' ? catalog : JSON.stringify(catalog ?? projection()),
          headers: { 'Access-Control-Allow-Origin': origin },
        });
      }
    });
    await page.goto(`${origin}/download/`);
    await page.addStyleTag({ content: css });
    await page.addScriptTag({ content: script });
    await page.evaluate(`TauDownloads.initializeHostDownload(location.hostname)`);
    const before = await surface(page);
    if (visit.enabled ?? true) {
      await page.evaluate('document.body.dataset.installerCatalog="true"');
    }
    await page.evaluate('TauDownloads.initializeInstallerCatalog(new AbortController().signal)');
    return { page, requests, before, close: async () => context.close() };
  };

  /** Every visible Mac file link names the format its URL serves, and no DMG is claimed over a ZIP. */
  const expectTruthfulMacLabels = (links: Surface['links'], format: 'DMG' | 'ZIP'): void => {
    const mac = links.filter((link) => /Apple silicon|Intel Mac/u.test(link.text) && link.text.startsWith('Download'));
    expect(mac.length).toBeGreaterThanOrEqual(3);
    for (const link of mac) {
      expect(link.text).toMatch(new RegExp(`^Download ${format} for (?:Apple silicon|Intel Mac)$`, 'u'));
      expect(new URL(link.href).pathname).toMatch(format === 'DMG' ? /\.dmg$/u : /\.zip$/u);
    }
    for (const link of links) {
      if (/DMG/u.test(link.text)) {
        expect(new URL(link.href).pathname).toMatch(/\.dmg$/u);
      }
    }
  };

  it('keeps the default off and admits only qualified installers with APT enrollment and archive alternatives', async () => {
    const off = await open({ enabled: false });
    expect(off.requests).toHaveLength(0);
    expect(await off.page.locator('[data-download-platform="mac"]').getAttribute('href')).toContain('.zip');
    const disabled = await surface(off.page);
    expectTruthfulMacLabels(disabled.links, 'ZIP');
    expect(disabled.text).not.toContain('DMG');
    await off.close();

    const { page, requests, close } = await open();
    expect(requests).toHaveLength(1);
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
    await close();

    const unpromoted = await open({ catalog: { ...projection(), promoted: false } });
    expect(await unpromoted.page.locator('[data-download-platform="windows"]').getAttribute('href')).toContain('.zip');
    expect(await unpromoted.page.locator('[data-platform-note]').textContent()).toContain('Tau asks before restarting');
    expect(await unpromoted.page.locator('[data-qualified-downloads]').isHidden()).toBe(true);
    await unpromoted.close();
  }, 60_000);

  it('makes every Mac button a labelled DMG with its ZIP visible beside it and disk-image instructions', async () => {
    const { page, close } = await open();
    const host = page.locator('a[data-host-download="direct"]');
    expect(await host.textContent()).toBe('Download DMG for Apple silicon');
    expect(await host.getAttribute('href')).toBe(
      'https://downloads.tau.new/releases/desktop%400.2.0/Tau-macos-arm64.dmg',
    );
    expect(await page.locator('[data-mac-intel]').isVisible()).toBe(true);
    const read = async (selector: string) =>
      page.locator(selector).evaluateAll((links) =>
        links.map((link) => ({
          text: link.textContent.trim(),
          href: link.getAttribute('href'),
          // A visible accessible name matches its text: no stale ZIP aria-label survives the upgrade.
          ariaLabel: link.getAttribute('aria-label') ?? 'none',
          visible: link.checkVisibility(),
        })),
      );
    const base = 'https://downloads.tau.new/releases/desktop%400.2.0';
    const [apple, intel, appleZip, intelZip] = await Promise.all([
      read('a[data-download-platform="mac"]'),
      read('a[data-download-platform="macIntel"]'),
      read('[data-download-alternative="mac"]'),
      read('[data-download-alternative="macIntel"]'),
    ]);
    const visible = (text: string, href: string) => ({ text, href, ariaLabel: 'none', visible: true });
    expect(apple).toEqual([visible('Download DMG for Apple silicon', `${base}/Tau-macos-arm64.dmg`)]);
    expect(intel).toEqual([
      visible('Download DMG for Intel Mac', `${base}/Tau-macos-x64.dmg`),
      visible('Download DMG for Intel Mac', `${base}/Tau-macos-x64.dmg`),
    ]);
    // The host line and the list line each offer the Apple silicon ZIP; both Intel lines offer the Intel ZIP.
    expect(appleZip).toEqual([
      visible('Tau-macos-arm64.zip', `${base}/Tau-macos-arm64.zip`),
      visible('Tau-macos-arm64.zip', `${base}/Tau-macos-arm64.zip`),
    ]);
    expect(intelZip).toEqual([
      visible('Tau-macos-x64.zip', `${base}/Tau-macos-x64.zip`),
      visible('Tau-macos-x64.zip', `${base}/Tau-macos-x64.zip`),
    ]);
    const upgraded = await surface(page);
    expectTruthfulMacLabels(upgraded.links, 'DMG');
    const instructions = await page.locator('[data-install-instructions]').textContent();
    expect(instructions).toMatch(
      /Open the DMG to mount it, drag Tau to Applications, eject the disk image, then launch/u,
    );
    expect(await page.locator('[data-platform-note]').textContent()).toContain('Tau asks before restarting');
    await close();
  }, 60_000);

  it('upgrades only the Mac choices for a Mac-only staging catalog and keeps the staging note truthful', async () => {
    const { page, requests, before, close } = await open({ origin: 'https://taucad.dev', catalog: macOnlyStaging() });
    expect(requests).toEqual(['https://downloads.taucad.dev/latest/installers.json']);
    const after = await surface(page);
    expectTruthfulMacLabels(after.links, 'DMG');
    expect(await page.locator('a[data-host-download="direct"]').getAttribute('href')).toBe(
      'https://downloads.taucad.dev/releases/desktop-staging%400.1.0-staging.455/Tau-macos-arm64.dmg',
    );
    const others = (links: Surface['links']) =>
      links.filter((link) => /Windows|Linux/u.test(link.text) || /win32|linux/u.test(link.href));
    expect(others(after.links)).toEqual(others(before.links));
    const unchanged = await page
      .locator('[data-download-detail="windows"], [data-download-detail="linux"]')
      .evaluateAll((details) => details.map((detail) => detail.textContent));
    expect(unchanged).toEqual(['Windows x64 · ZIP download', 'Linux x64 · tar.gz download']);
    expect(await page.locator('[data-qualified-downloads] details').count()).toBe(2);
    const note = await page.locator('[data-platform-note]').textContent();
    expect(note).toContain('staging channel');
    expect(note).not.toMatch(/notari[sz]|without/iu);
    await close();
  }, 60_000);

  it.each([
    ['a failed request', 503],
    ['a network failure', 'network-failure'],
    ['malformed JSON', '{"schemaVersion":1,'],
    // Valid and qualified, but past the 64 KiB bound: only the size limit rejects it.
    ['an oversized catalog', `${JSON.stringify(macOnlyStaging())}${' '.repeat(70_000)}`],
    ['a catalog for another channel', projection()],
    [
      'an unqualified Mac route',
      {
        ...macOnlyStaging(),
        routes: [{ ...macOnlyStaging().routes[0]!, qualification: { ci: true, vm: false, trust: 'release' } }],
      },
    ],
  ])(
    'keeps truthful ZIP labels and links after %s',
    async (_name, catalog) => {
      const { page, requests, before, close } = await open({ origin: 'https://taucad.dev', catalog });
      expect(requests).toHaveLength(1);
      const after = await surface(page);
      expect(after).toEqual(before);
      expectTruthfulMacLabels(after.links, 'ZIP');
      expect(after.text).not.toContain('DMG');
      expect(await page.locator('[data-qualified-downloads]').isHidden()).toBe(true);
      await close();
    },
    60_000,
  );

  it('fits a phone screen with every Mac choice and ZIP alternative readable', async () => {
    const { page, close } = await open({ viewport: { width: 390, height: 844 } });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    const selectors = [
      'a[data-host-download="direct"]',
      '[data-mac-intel] a[data-download-platform="macIntel"]',
      '#downloads a[data-download-platform="mac"]',
      '#downloads a[data-download-platform="macIntel"]',
      '#downloads [data-download-alternative="mac"]',
      '#downloads [data-download-alternative="macIntel"]',
    ];
    const boxes = await page.evaluate(
      (list) =>
        list.map((selector) => {
          const node = document.querySelector(selector);
          const rect = node?.getBoundingClientRect();
          return {
            selector,
            visible: node?.checkVisibility() ?? false,
            inside: rect !== undefined && rect.left >= 0 && rect.right <= innerWidth && rect.width > 0,
            // Labels wrap rather than clip.
            unclipped: node !== null && node.scrollWidth <= node.clientWidth + 1,
          };
        }),
      selectors,
    );
    expect(boxes).toEqual(selectors.map((selector) => ({ selector, visible: true, inside: true, unclipped: true })));
    await close();
  }, 60_000);

  it('reaches every Mac DMG and ZIP by keyboard and downloads the focused DMG with Enter', async () => {
    const { page, close } = await open();
    const reached: string[] = [];
    for (let step = 0; step < 40; step += 1) {
      // oxlint-disable-next-line no-await-in-loop -- Tab order is sequential by definition.
      await page.keyboard.press('Tab');
      // oxlint-disable-next-line no-await-in-loop -- Read each focus stop before moving on.
      const href = await page.evaluate(() =>
        document.activeElement instanceof HTMLAnchorElement ? document.activeElement.href : '',
      );
      reached.push(href);
    }
    const base = 'https://downloads.tau.new/releases/desktop%400.2.0';
    for (const file of ['Tau-macos-arm64.dmg', 'Tau-macos-x64.dmg', 'Tau-macos-arm64.zip', 'Tau-macos-x64.zip']) {
      expect(reached).toContain(`${base}/${file}`);
    }
    // Each DMG button is followed directly by its own ZIP in the reading and focus order.
    const dmg = reached.indexOf(`${base}/Tau-macos-x64.dmg`);
    expect(reached[dmg + 1]).toBe(`${base}/Tau-macos-x64.zip`);
    await page.route(`${base}/*`, async (route) =>
      route.fulfill({
        body: 'disk image',
        headers: {
          'Content-Type': 'application/x-apple-diskimage',
          'Content-Disposition': 'attachment; filename="Tau-macos-arm64.dmg"',
        },
      }),
    );
    await page.locator('a[data-host-download="direct"]').focus();
    const [downloaded] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
    expect(downloaded.url()).toBe(`${base}/Tau-macos-arm64.dmg`);
    expect(downloaded.suggestedFilename()).toBe('Tau-macos-arm64.dmg');
    await close();
  }, 60_000);
});
