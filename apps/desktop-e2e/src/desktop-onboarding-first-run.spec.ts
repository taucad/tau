import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { launchDesktopApp, removeDesktopRoot } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { composerOf, expectNoDesktopAnalytics, expectVisible } from '#support/scenario.js';

/** The renderer page, typed through the launch helper so this spec owns no browser driver (browser ownership). */
type Page = DesktopSession['page'];

/*
 * The desktop first run. With all three onboarding flags on, a fresh
 * profile (no `window-state.json`, an empty project list, nothing in the launch) opens setup with no account. It does
 * not open when the window-state file exists, even if it does not parse; when the list has a project; on the next
 * launch; or with `onboardingAutoOpen` off. A launch that carries a `tau://` link or a file is covered by
 * `apps/desktop/src/main/first-run.test.ts`: this harness has no way to put either in the launch.
 */

let session: DesktopSession | undefined;
const profiles: string[] = [];

afterEach(async ({ task }) => {
  try {
    if (task.result?.state === 'fail') {
      await session?.capture('desktop-onboarding-first-run-failure');
    }
  } finally {
    await session?.close();
    session = undefined;
    await Promise.all(profiles.splice(0).map(async (profile) => removeDesktopRoot(profile)));
  }
});

const newProfile = async (): Promise<string> => {
  const profile = await mkdtemp(join(tmpdir(), 'tau-desktop-first-run-'));
  profiles.push(profile);
  return profile;
};

const setupHeading = (page: Page) => page.getByRole('heading', { level: 1, name: 'What do you want to make?' });

/** Wait until home has settled with no setup: the composer shows and, a moment later, the page is still home. */
const expectHomeStays = async (page: Page): Promise<void> => {
  await expectVisible(composerOf(page), 120_000);
  await page.waitForTimeout(3000);
  expect(new URL(page.url()).pathname).toBe('/');
  expect(await setupHeading(page).count()).toBe(0);
};

test('opens setup on a first run with no account, and not on the next launch', async () => {
  const profileRoot = await newProfile();
  session = await launchDesktopApp({ token: 'unused', flagState: 'all-on', profileRoot, preserveProfile: true });
  const { page } = session;
  await page.waitForURL((url) => url.pathname === '/welcome' && url.searchParams.get('entry') === 'first_launch', {
    timeout: 120_000,
  });
  await expectVisible(setupHeading(page), 60_000);
  // Step 4 and Finish differ on desktop.
  const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
  await continueButton.click();
  await continueButton.click();
  await continueButton.click();
  await expectVisible(page.getByTestId('concept-desktop'));
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expectVisible(page.getByRole('button', { name: 'Open a folder', exact: true }));
  expectNoDesktopAnalytics(session);
  await session.close();

  session = await launchDesktopApp({ token: 'unused', flagState: 'all-on', profileRoot, preserveProfile: true });
  await expectHomeStays(session.page);
});

test('does not open when the window-state file exists, even if it does not parse', async () => {
  const profileRoot = await newProfile();
  await writeFile(join(profileRoot, 'window-state.json'), '{ not json');
  session = await launchDesktopApp({ token: 'unused', flagState: 'all-on', profileRoot, preserveProfile: true });
  await expectHomeStays(session.page);
});

test('does not open when the project list has a project', async () => {
  const profileRoot = await newProfile();
  const project = join(profileRoot, 'home/first-run-project');
  await mkdir(project, { recursive: true });
  await writeFile(
    join(project, 'tau.json'),
    JSON.stringify({
      $schema: 'https://tau.new/schemas/tau-v1.json',
      name: 'First run project',
      description: 'Seeded before the first launch',
      tags: [],
      assets: { main: { entryPath: 'main.scad' } },
    }),
  );
  await writeFile(join(project, 'main.scad'), 'cube([3, 4, 5]);\n');
  session = await launchDesktopApp({ token: 'unused', flagState: 'all-on', profileRoot, preserveProfile: true });
  await expectHomeStays(session.page);
});

test('does not open with onboardingAutoOpen off, and the invite opens it', async () => {
  const profileRoot = await newProfile();
  session = await launchDesktopApp({
    token: 'unused',
    flagState: 'viewer-controls-onboarding',
    profileRoot,
    preserveProfile: true,
  });
  const { page } = session;
  await expectHomeStays(page);
  await expectVisible(page.getByTestId('setup-invite'));
  await page.getByTestId('setup-invite').getByRole('link', { name: 'Set up', exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/welcome' && url.searchParams.get('entry') === 'invite');
  await expectVisible(setupHeading(page));
});

test('does not open with onboarding off', async () => {
  const profileRoot = await newProfile();
  session = await launchDesktopApp({
    token: 'unused',
    flagState: 'viewer-controls',
    profileRoot,
    preserveProfile: true,
  });
  await expectHomeStays(session.page);
  expect(await session.page.getByTestId('setup-invite').count()).toBe(0);
});
