/* oxlint-disable no-await-in-loop -- The tour's tips are walked in order: each one is answered on its own tip. */
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { launchDesktopApp, removeDesktopRoot } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { expectGeometryFramed, expectVisible } from '#support/scenario.js';

/** The renderer page, typed through the launch helper so this spec owns no browser driver. */
type Page = DesktopSession['page'];

/*
 * The product tour in the desktop app: a person who asked for the tour opens a project from their folder and walks
 * the five tips in order with Next. Tip 5 carries the desktop's own line about saving to a folder, the tour ends
 * stored as completed, and Help then offers it again as a replay.
 */

let session: DesktopSession | undefined;
const profiles: string[] = [];

afterEach(async ({ task }) => {
  try {
    if (task.result?.state === 'fail') {
      await session?.capture('desktop-onboarding-tour-failure');
    }
  } finally {
    await session?.close();
    session = undefined;
    await Promise.all(profiles.splice(0).map(async (profile) => removeDesktopRoot(profile)));
  }
});

const projectName = 'Tour bracket';

/** A profile holding one OpenSCAD project with a parameter, and a window-state file so setup does not open. */
const newProfile = async (): Promise<string> => {
  const profile = await mkdtemp(join(tmpdir(), 'tau-desktop-tour-'));
  profiles.push(profile);
  await writeFile(join(profile, 'window-state.json'), '{}');
  const project = join(profile, 'home/tour-bracket');
  await mkdir(project, { recursive: true });
  await writeFile(
    join(project, 'tau.json'),
    JSON.stringify({
      $schema: 'https://tau.new/schemas/tau-v1.json',
      name: projectName,
      description: 'A part for the product tour',
      tags: [],
      assets: { main: { entryPath: 'main.scad' } },
    }),
  );
  await writeFile(join(project, 'main.scad'), 'width = 20;\ncube([width, 10, 5]);\n');
  return profile;
};

const tip = (page: Page) => page.getByTestId('tour-tip');
const tipNamed = (page: Page, title: string) =>
  page.getByRole('dialog', { name: new RegExp(`^Tour tip \\d of 5: ${title}$`, 'u') });
const tipButton = (page: Page, name: string) => tip(page).getByRole('button', { name, exact: true });

/** The stored guided tour, as the person record holds it. */
const storedTour = async (page: Page): Promise<unknown> =>
  page.evaluate(() => {
    const raw = globalThis.localStorage.getItem('tau-onboarding');
    return raw === null ? undefined : (JSON.parse(raw) as { value: { tour: unknown } }).value.tour;
  });

test('walks the five tips in a project from the folder, with the desktop’s own export line', async () => {
  session = await launchDesktopApp({
    token: 'unused',
    flagState: 'viewer-controls-onboarding',
    profileRoot: await newProfile(),
    preserveProfile: true,
  });
  const { page } = session;
  const project = page.getByText(projectName, { exact: true }).first();
  await expectVisible(project, 120_000);

  // Ask for the tour as setup's switch does, then open the project.
  await page.evaluate(() => {
    globalThis.localStorage.setItem(
      'tau-onboarding',
      JSON.stringify({ value: { version: 1, setup: { status: 'completed' }, tour: { wanted: true, seen: [] } } }),
    );
    globalThis.localStorage.setItem('tau-device', JSON.stringify({ value: { version: 1 } }));
  });
  await project.click();
  await page.waitForURL((url) => /^\/w\/[^/]+\/[^/]+/u.test(url.pathname), { timeout: 120_000 });

  await expectVisible(tipNamed(page, 'Describe what you want'), 120_000);
  expect(await tip(page).getAttribute('aria-modal')).toBeNull();
  await tipButton(page, 'Next').click();

  await expectGeometryFramed(page);
  await expectVisible(tipNamed(page, 'Look around'), 60_000);
  /* Tips come in order. Parameters is passed over by itself if the kernel reports none for this model, so the walk
   * reads each tip's position rather than expecting every one. */
  const visited: number[] = [];
  for (let position = 2; position < 5; position = visited.at(-1) ?? 5) {
    await tipButton(page, 'Next').click();
    await expect
      .poll(
        async () => {
          const label = (await tip(page).getAttribute('aria-label')) ?? '';
          return Number(/^Tour tip (\d) of 5/u.exec(label)?.[1] ?? 0);
        },
        { timeout: 60_000 },
      )
      .toBeGreaterThan(position);
    const label = (await tip(page).getAttribute('aria-label')) ?? '';
    visited.push(Number(/^Tour tip (\d) of 5/u.exec(label)?.[1] ?? 5));
  }
  expect(visited.at(-1)).toBe(5);

  await expectVisible(tipNamed(page, 'Export and make it'), 60_000);
  await expect.poll(async () => tip(page).textContent()).toMatch(/Save it to a folder or straight into the project\./u);
  await tipButton(page, 'Done').click();
  await expect.poll(async () => tip(page).count()).toBe(0);
  await expect
    .poll(async () => page.getByTestId('tour-announcer').textContent())
    .toBe('Tour finished. Take it again from Help.');
  expect(await storedTour(page)).toMatchObject({
    seen: ['ask', 'look', 'adjust', 'verify', 'build'],
    ended: 'completed',
  });

  // Help offers the tour again, as a replay that stores nothing.
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Take the tour' }).click();
  await expectVisible(tipNamed(page, 'Describe what you want'), 60_000);
  await tipButton(page, 'Close').click();
  await expect.poll(async () => tip(page).count()).toBe(0);
  expect(await storedTour(page)).toMatchObject({ ended: 'completed' });
});
