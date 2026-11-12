import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { launchDesktopApp, removeDesktopRoot } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { expectNoDesktopAnalytics, expectVisible } from '#support/scenario.js';

/*
 * DT3: with the network off, setup runs to the end on desktop, its live preview included, and nothing is requested
 * from a remote origin. The renderer's own `app://tau` pages and assets are served by main and stay reachable; the
 * tour (PR 8) adds its own steps to this spec when it lands.
 */

let session: DesktopSession | undefined;
let profileRoot: string | undefined;

afterEach(async ({ task }) => {
  try {
    if (task.result?.state === 'fail') {
      await session?.capture('desktop-onboarding-offline-failure');
    }
  } finally {
    await session?.close();
    session = undefined;
    if (profileRoot !== undefined) {
      await removeDesktopRoot(profileRoot);
      profileRoot = undefined;
    }
  }
});

/** The origins the renderer is served from: `app://tau`, or the dev server when the suite runs against one. */
const isLocalRequest = (url: URL, pageOrigin: string): boolean =>
  url.protocol === 'app:' ||
  url.protocol === 'data:' ||
  url.protocol === 'blob:' ||
  url.protocol === 'devtools:' ||
  url.origin === pageOrigin;

test('runs setup to the end, preview included, with the network off and no remote request (DT3)', async () => {
  profileRoot = await mkdtemp(join(tmpdir(), 'tau-desktop-offline-setup-'));
  session = await launchDesktopApp({ token: 'unused', flagState: 'all-on', profileRoot, preserveProfile: true });
  const { application, page } = session;
  await page.waitForURL((url) => url.pathname === '/welcome', { timeout: 120_000 });

  await application.evaluate(async ({ session: electronSession }) => {
    electronSession.defaultSession.enableNetworkEmulation({ offline: true });
  });
  const pageOrigin = new URL(page.url()).origin;
  const remote: string[] = [];
  application.context().on('request', (request) => {
    const url = new URL(request.url());
    if (!isLocalRequest(url, pageOrigin)) {
      remote.push(`${url.protocol}//${url.host}${url.pathname}`);
    }
  });
  try {
    await page.reload({ waitUntil: 'load' });
    await expectVisible(page.getByRole('heading', { level: 1, name: 'What do you want to make?' }), 60_000);

    await page.getByRole('checkbox', { name: /Mechanical parts/u }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('radio', { name: 'SolidWorks', exact: true }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expectVisible(page.getByRole('heading', { level: 1, name: 'Make the viewer feel like home' }));
    // The live preview renders from its bundled model: no fallback diagram is needed offline.
    await expectVisible(page.locator('[data-testid="setup-live-preview"] canvas'), 120_000);
    expect(await page.getByTestId('setup-preview-fallback').count()).toBe(0);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expectVisible(page.getByRole('heading', { level: 1, name: 'Design, verify, build' }));
    await page.getByRole('button', { name: 'Finish', exact: true }).click();
    await expectVisible(page.getByRole('heading', { level: 1, name: 'You’re set' }));
    await page.getByRole('link', { name: 'Start building', exact: true }).click();
    await page.waitForURL((url) => url.pathname === '/');
  } finally {
    await application.evaluate(async ({ session: electronSession }) => {
      electronSession.defaultSession.enableNetworkEmulation({ offline: false });
    });
  }

  expect(remote).toStrictEqual([]);
  expectNoDesktopAnalytics(session);
});
