#!/usr/bin/env node
/**
 * Purpose: Render the Tau DMG window backdrop from its SVG source at 1x and 2x.
 * Environment: Node with Playwright's Chromium; any host (the PNGs are committed, packaging never renders).
 * Usage: pnpm nx run desktop:render-dmg-background
 * Exit: nonzero when Chromium or a font is unavailable.
 */
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const dmgResources = join(root, 'resources/dmg');
const fonts = resolve(root, '../www/public');

const fontFace = async (family: string, file: string): Promise<string> => {
  const bytes = await readFile(join(fonts, file));
  return `@font-face { font-family: '${family}'; src: url(data:font/woff2;base64,${bytes.toString('base64')}) format('woff2'); font-weight: 100 900; }`;
};

const svg = await readFile(join(dmgResources, 'background.svg'), 'utf8');
const html = `<!doctype html><html><head><style>
${await fontFace('Geist', 'geist.woff2')}
${await fontFace('Geist Mono', 'geist-mono.woff2')}
html, body { margin: 0; padding: 0; background: #f7f9f8; }
svg { display: block; }
</style></head><body>${svg}</body></html>`;

// CHROMIUM_PATH points at an installed Chromium when Playwright's own browser is absent.
const browser = await chromium.launch({ executablePath: process.env['CHROMIUM_PATH'] });
try {
  for (const [scale, name] of [
    [1, 'background.png'],
    [2, 'background@2x.png'],
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop -- Two fixed renders; sequential keeps one page alive at a time.
    const page = await browser.newPage({ viewport: { width: 660, height: 400 }, deviceScaleFactor: scale });
    // oxlint-disable-next-line no-await-in-loop -- See above.
    await page.setContent(html);
    // oxlint-disable-next-line no-await-in-loop -- Text must use Geist, not a fallback face.
    await page.evaluate(async () => document.fonts.ready);
    // oxlint-disable-next-line no-await-in-loop -- See above.
    await page.locator('svg').screenshot({ path: join(dmgResources, name), omitBackground: false });
    // oxlint-disable-next-line no-await-in-loop -- See above.
    await page.close();
    console.log(`Rendered ${name} at ${scale}x`);
  }
} finally {
  await browser.close();
}
