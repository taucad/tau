/* oxlint-disable no-await-in-loop -- Browser navigation, audits, and screenshots must run in order on the same page. */
/**
 * Exercise the built docs on desktop/mobile, including search and WCAG A/AA checks.
 * Usage: pnpm nx run docs:verify-browser
 * DOCS_BASE_URL checks a deployed site instead of serving the local build.
 * CHROMIUM_EXECUTABLE_PATH selects an installed browser; otherwise use Playwright's.
 * Writes screenshots to out/reports/docs-browser. Exits 1 on failed acceptance.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, join, resolve as resolvePath } from 'node:path';
import { chromium } from 'playwright';
import type axeCore from 'axe-core';

declare global {
  // Injected by the audit through Playwright before each accessibility check.
  var axe: typeof axeCore;
}

const root = resolvePath(import.meta.dirname, '../../..');
const output = join(root, 'apps/docs/build/client');
const reports = join(root, 'out/reports/docs-browser');
const require = createRequire(import.meta.url);
const mime: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.data': 'text/x-script',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
};

const main = async (): Promise<void> => {
  await mkdir(reports, { recursive: true });
  const server = createServer((request, response) => {
    const serve = async (): Promise<void> => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      let path = resolvePath(output, `.${decodeURIComponent(url.pathname)}`);
      assert.ok(path === output || path.startsWith(`${output}/`), 'Path outside static artifact');
      const info = await stat(path);
      if (info.isDirectory()) {
        path = join(path, 'index.html');
      }
      response.setHeader('Content-Type', mime[extname(path)] ?? 'application/octet-stream');
      response.end(await readFile(path));
    };
    // oxlint-disable-next-line promise/prefer-await-to-then -- HTTP request listeners do not await returned promises.
    serve().catch(() => {
      response.statusCode = 404;
      response.end('Not found');
    });
  });
  let baseUrl = process.env['DOCS_BASE_URL'];
  if (!baseUrl) {
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    baseUrl = `http://127.0.0.1:${address.port}`;
  }
  const browser = await chromium.launch({ executablePath: process.env['CHROMIUM_EXECUTABLE_PATH'] });
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      const failures: string[] = [];
      page.on('pageerror', (error) => failures.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') {
          failures.push(message.text());
        }
      });
      page.on('response', (response) => {
        if (response.url().startsWith(baseUrl) && response.status() >= 400) {
          failures.push(`${response.status()} ${response.url()}`);
        }
      });
      for (const path of ['/', '/runtime/getting-started/quick-start', '/runtime/api/machines']) {
        const response = await page.goto(new URL(path, baseUrl).href, { waitUntil: 'networkidle' });
        assert.ok(response?.ok(), `Document failed: ${path}`);
        const heading = page.getByRole('heading', { level: 1 }).first();
        assert.ok(await heading.isVisible(), `Heading hidden: ${path}`);
        assert.notEqual(
          await heading.textContent(),
          'This page is not in the documentation.',
          `Hydrated document failed: ${path}`,
        );
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
          `Horizontal overflow: ${width} ${path}`,
        );
        await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
        const violations = await page.evaluate(async () => {
          // Axe is installed by the audit, not part of the site's browser bundle.
          const result = await globalThis.axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
          });
          return result.violations.map((violation) => ({
            id: violation.id,
            impact: violation.impact,
            targets: violation.nodes.map((node) => node.target),
          }));
        });
        assert.deepEqual(violations, [], `Accessibility failures: ${width} ${path}`);
        await page.screenshot({
          path: join(reports, `${width}-${path.replaceAll('/', '_') || 'home'}.png`),
          fullPage: true,
        });
      }
      assert.deepEqual(failures, [], 'Document hydration errors or missing resources');
      const searchButton = page
        .getByRole('button', { name: /Search/u })
        .filter({ visible: true })
        .first();
      await searchButton.focus();
      await searchButton.press('Enter');

      const dialog = page.getByRole('dialog');
      await dialog.getByRole('textbox').fill('Replicad');
      const result = dialog.getByRole('button', { name: /Replicad$/u }).first();
      await result.waitFor({ state: 'visible' });
      await result.click();
      await page.waitForURL((url) => url.pathname !== '/runtime/api/machines');
      await page.getByRole('heading', { level: 1 }).first().waitFor({ state: 'visible' });
      assert.deepEqual(failures, [], 'Browser errors or missing resources');
      await context.close();
    }
    console.log('Desktop/mobile documents, accessibility, assets, and search passed.');
  } finally {
    await browser.close();
    if (server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    }
  }
};

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
