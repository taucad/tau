/** Fetch candidate bytes through a real browser download so macOS applies its own com.apple.quarantine. */
import { rename } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const escapeHtml = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/**
 * Click a link in headed Chromium and keep the file Chromium itself wrote; the bytes are never copied, so the
 * quarantine Chromium applied is exactly what the caller observes. TLS stays strict: the run CA must be trusted.
 */
export const downloadWithBrowser = async (options: {
  url: string;
  directory: string;
  name: string;
}): Promise<{ path: string; browser: string }> => {
  const browser = await chromium.launch({ headless: false, downloadsPath: options.directory });
  try {
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    await page.setContent(`<a id="download" href="${escapeHtml(options.url)}">Download</a>`);
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 600_000 }),
      page.click('#download'),
    ]);
    const failure = await download.failure();
    if (failure) {
      throw new Error(`Browser download failed: ${failure}`);
    }
    const source = await download.path();
    const path = join(options.directory, options.name);
    // Same-directory rename keeps the inode and its extended attributes; Playwright deletes only its own name.
    await rename(source, path);
    return { path, browser: `Chromium ${browser.version()}` };
  } finally {
    await browser.close();
  }
};
