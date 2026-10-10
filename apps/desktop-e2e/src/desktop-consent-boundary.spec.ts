import { readFile, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { desktopE2EFrontendUrl } from '#support/config.js';
import { launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { expectDesktopSurfaceBoundary, expectNoDesktopAnalytics, expectVisible } from '#support/scenario.js';

let session: DesktopSession | undefined;
let profileRoot: string | undefined;

const expectStartupNetworkClean = async (path: string | undefined): Promise<void> => {
  if (path === undefined) {
    throw new Error('Startup network logging was not enabled.');
  }
  const source = await readFile(path, 'utf8');
  const log = JSON.parse(source) as {
    readonly events?: ReadonlyArray<{ readonly params?: { readonly url?: string } }>;
  };
  const urls = (log.events ?? []).flatMap(({ params }) => (params?.url ? [params.url] : []));
  expect(urls.length).toBeGreaterThan(0);
  expect(urls.some((url) => /\/api\/ph(?:\/|["?])|posthog\.com/iu.test(url))).toBe(false);
};

afterEach(async ({ task }) => {
  try {
    if (task.result?.state === 'fail') {
      await session?.capture('desktop-consent-boundary-failure');
    }
  } finally {
    try {
      await session?.close();
      session = undefined;
    } finally {
      if (profileRoot) {
        await rm(profileRoot, { recursive: true, force: true });
        profileRoot = undefined;
      }
    }
  }
});

test('keeps fresh and returning desktop profiles free of web consent and analytics', async () => {
  session = await launchDesktopApp({ token: 'unused', preserveProfile: true, captureStartupNetwork: true });
  profileRoot = dirname(session.homeRoot);
  const first = session;
  const { page } = session;
  await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
  await expectDesktopSurfaceBoundary(session);
  await page.getByRole('button', { name: 'Help' }).click();
  await page.getByRole('menuitem', { name: 'Privacy' }).click();
  await expect
    .poll(async () =>
      first.application.evaluate(
        () => (globalThis as typeof globalThis & { __TAU_E2E_EXTERNAL_URL__?: string }).__TAU_E2E_EXTERNAL_URL__,
      ),
    )
    .toBe(`${new URL(desktopE2EFrontendUrl).origin}/legal/privacy`);
  await page.getByRole('button', { name: 'Help' }).click();
  await page.getByRole('menuitem', { name: 'Documentation' }).click();
  await expect
    .poll(async () =>
      first.application.evaluate(
        () => (globalThis as typeof globalThis & { __TAU_E2E_EXTERNAL_URL__?: string }).__TAU_E2E_EXTERNAL_URL__,
      ),
    )
    .toMatch(/^https:\/\/docs\.tau\.new\/?$/u);

  await page.goto('app://tau/community', { waitUntil: 'domcontentloaded' });
  await expectVisible(page.getByText('Community', { exact: true }).first(), 60_000);
  await expectDesktopSurfaceBoundary(session);

  await page.goto('app://tau/projects/new', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Project Name *').fill('Consent Boundary Project');
  await page
    .getByRole('button', { name: /^Create Project/u })
    .first()
    .click();
  await page.waitForURL(/\/w\/[^/]+\/[^/?]+/u, { timeout: 120_000 });
  const projectPath = new URL(page.url()).pathname;
  await expectDesktopSurfaceBoundary(session);

  await page.goto('app://tau/?settings=general', { waitUntil: 'domcontentloaded' });
  await expectVisible(page.getByRole('dialog').first());
  await expectDesktopSurfaceBoundary(session);

  await page.goto('app://tau/legal/cookies', { waitUntil: 'domcontentloaded' });
  await expectVisible(page.getByRole('heading', { name: 'Page Not Found' }));
  await expectDesktopSurfaceBoundary(session);
  expectNoDesktopAnalytics(session);

  const firstLogPath = session.startupNetworkLogPath;
  await session.close();
  await expectStartupNetworkClean(firstLogPath);
  session = undefined;
  session = await launchDesktopApp({
    token: 'unused',
    profileRoot,
    preserveProfile: true,
    captureStartupNetwork: true,
  });
  await session.page.goto(`app://tau${projectPath}`, { waitUntil: 'domcontentloaded' });
  await expectVisible(session.page.getByText('Consent Boundary Project').first(), 120_000);
  await expectDesktopSurfaceBoundary(session);
  expectNoDesktopAnalytics(session);
  expect(session.analyticsRequests).toEqual([]);
  const returningLogPath = session.startupNetworkLogPath;
  await session.close();
  session = undefined;
  await expectStartupNetworkClean(returningLogPath);
});
