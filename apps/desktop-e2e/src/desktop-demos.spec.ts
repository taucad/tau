import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { Locator, Page } from 'playwright';
import { afterEach, expect, test } from 'vitest';
import { getBoundingBoxFromInspect, getInspectReport, validateGlbData } from '@taucad/runtime-testing';

import { captureNextDesktopDownload, launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { declineCookieBanner } from '#support/scenario.js';

let session: DesktopSession | undefined;

afterEach(async (context) => {
  if (context.task.result?.state === 'fail') {
    await session?.capture('desktop-demos-failure');
  }
  await session?.close();
  session = undefined;
});

const revealLazyContent = async (page: Page, target: Locator): Promise<void> => {
  // The target does not exist until its viewport-lazy parent is scrolled in.
  await page.mouse.move(900, 500);
  await expect
    .poll(
      async () => {
        if (await target.isVisible()) {
          return true;
        }
        await page.mouse.wheel(0, 500);
        return false;
      },
      { timeout: 60_000, interval: 500 },
    )
    .toBe(true);
};

const expectQrExport = async (desktop: DesktopSession, downloadButton: Locator): Promise<void> => {
  const downloadPath = join(dirname(desktop.homeRoot), '.e2e-qrcode.glb');
  await downloadButton.waitFor({ state: 'visible', timeout: 180_000 });
  await expect.poll(async () => downloadButton.isEnabled(), { timeout: 120_000 }).toBe(true);
  const download = await captureNextDesktopDownload(desktop, downloadPath, async () => downloadButton.click());
  expect(download.filename).toBe('qrcode.glb');
  const exportedBytes = await readFile(downloadPath);
  expect(exportedBytes.byteLength).toBeGreaterThan(100);
  const bytes = new Uint8Array(exportedBytes);
  validateGlbData(bytes);
  const bounds = getBoundingBoxFromInspect(await getInspectReport(bytes));
  expect(bounds).toBeDefined();
  expect(bounds!.size.every((extent) => Number.isFinite(extent) && extent > 0)).toBe(true);
};

test('[completed-artifact] exports both native QR demos and animates both auth splash geometries', async () => {
  session = await launchDesktopApp({ packaged: true, token: 'desktop-demos-probe' });
  const { page } = session;
  await page.goto('app://tau/', { waitUntil: 'domcontentloaded' });
  await declineCookieBanner(page);
  const legacyDownload = page.getByRole('button', { name: /^Download as /u });
  await revealLazyContent(page, legacyDownload);
  await expectQrExport(session, legacyDownload);

  await page.addInitScript(() => {
    localStorage.setItem('tau:flags', JSON.stringify({ marketingLanding: true }));
  });
  await page.goto('app://tau/', { waitUntil: 'domcontentloaded' });
  const qrTab = page.getByRole('tab', { name: 'QR code', exact: true });
  await revealLazyContent(page, qrTab);
  await qrTab.click();
  const qrPanel = page.getByRole('tabpanel', { name: 'QR code', exact: true });
  await qrPanel.getByText('Scan the QR code with your phone!', { exact: true }).waitFor();
  await qrPanel.getByRole('img', { name: '3D model preview', exact: true }).locator('canvas').waitFor();
  await expectQrExport(session, qrPanel.getByRole('button', { name: /^Download as /u }));

  await page.goto('app://tau/auth/sign-in', { waitUntil: 'domcontentloaded' });
  // The splash only mounts its canvas after both independently rendered gear
  // geometries exist. Its assembly tagline follows the real morph callbacks.
  await page.locator('canvas').waitFor({ state: 'visible', timeout: 120_000 });
  await page.getByText('Iterate instantly', { exact: true }).waitFor({ state: 'visible', timeout: 120_000 });
  await page.getByText('Bring your designs to life', { exact: true }).waitFor({ state: 'visible', timeout: 120_000 });
  expect(await page.locator('canvas').isVisible()).toBe(true);
});
