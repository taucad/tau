import { join, resolve } from 'node:path';

import type { Locator, Page } from 'playwright';
import { afterEach, expect, test } from 'vitest';

import { launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { expectVisible } from '#support/scenario.js';

/**
 * Community previews of memory-mounted projects on the packaged desktop shell
 * (community-page-refresh audit, Finding 1; blueprint W0.2).
 *
 * Three surfaces put a project's bytes into a renderer memory mount and then
 * ask a kernel to render it by path: the community card eye and the import
 * review preview (`CadPreviewProvider files`, ephemeral utility) and the
 * builtin example page (`SharedProjectWorkbench`). The browser build's kernel
 * reads that mount through the file-manager bridge; the desktop utility owns
 * its own filesystem and only sees the bytes the renderer stages for it. Red
 * before the fix: the card and import alerts read
 * `ENOENT: no such file: main.ts` and the example page alert reads
 * `Project … is not on disk, so no host path can root the desktop kernel.`
 *
 * No account and no API: `/community`, `/s/builtin~…` and `/import` resolve
 * their bytes from the builtin catalog or the picked files, so the shell boots
 * with production endpoint defaults and a throwaway profile.
 */

const workspaceRoot = resolve(import.meta.dirname, '../../..');
const birdhouse = join(workspaceRoot, 'libs/tau-examples/src/kernels/replicad/birdhouse');

/** One Community card per catalog kernel. */
const cards = [
  { name: 'Cycloidal Gear', kernel: 'replicad' },
  { name: 'Planetary Gear Stage', kernel: 'jscad' },
  { name: 'Fluted Vase', kernel: 'openscad' },
] as const;

let session: DesktopSession | undefined;

afterEach(async (context) => {
  if (context.task.result?.state === 'fail') {
    await session?.capture(`community-preview-failure-${context.task.id}`);
  }
  await session?.close();
  session = undefined;
});

const launch = async (): Promise<DesktopSession> => {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error('The packaged desktop app is built for macOS arm64 only.');
  }
  session = await launchDesktopApp({
    token: 'unused',
    packaged: true,
    useProductionEndpointDefaults: true,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Environment variables retain their wire names.
    env: { TAU_E2E_DISABLE_CREDENTIAL_PERSISTENCE: '1' },
  });
  return session;
};

const openCommunity = async (page: Page): Promise<void> => {
  await page.goto('app://tau/community', { waitUntil: 'domcontentloaded' });
  await expectVisible(page.getByRole('link', { name: `Open ${cards[0].name}`, exact: true }), 60_000);
};

const cardOf = (page: Page, name: string): Locator =>
  page.getByRole('listitem').filter({ has: page.getByRole('link', { name: `Open ${name}`, exact: true }) });

/**
 * Whether a three.js viewer has framed geometry. Every stage mounts one
 * `SectionViewTestBridge` under `tauDebug` (`stage.tsx`), a card preview
 * included; the Community shows one live preview at a time, so any framed
 * bridge with a viewer canvas in scope is that scope's viewer.
 */
const isAnyViewerFramed = async (page: Page): Promise<boolean> =>
  page.evaluate(() =>
    (
      (
        globalThis as typeof globalThis & {
          __TAU_SECTION_VIEW_TEST_BRIDGES__?: ReadonlyArray<{ isGeometryFramed(): boolean }>;
        }
      ).__TAU_SECTION_VIEW_TEST_BRIDGES__ ?? []
    ).some((bridge) => bridge.isGeometryFramed()),
  );

/**
 * Wait for a framed viewer canvas inside `scope`, or for the runtime alert the
 * failing render shows instead. The alert's full text (its runtime message
 * sits in a closed `<details>`, so `textContent` rather than `innerText`) is
 * the assertion's report, so a red run names the failure rather than timing
 * out on the frame.
 */
const settleRender = async (page: Page, scope: Locator): Promise<string> => {
  const alert = scope.getByRole('alert', { name: 'CAD runtime error' });
  /* The viewer mounts its canvas only once geometry arrives: a card's preview
   * inside `ModelViewer`'s `role='img'`, the workbench's without one. */
  const canvas = scope.locator('canvas');
  let outcome = 'pending';
  await expect
    .poll(
      async () => {
        if ((await alert.count()) > 0) {
          outcome = ((await alert.first().textContent()) ?? '').trim();
        } else if ((await canvas.count()) > 0 && (await isAnyViewerFramed(page))) {
          outcome = 'framed';
        }
        return outcome;
      },
      { timeout: 120_000 },
    )
    .not.toBe('pending');
  return outcome;
};

test('[completed-artifact] the community card eye renders every catalog kernel', async () => {
  const { page } = await launch();
  await openCommunity(page);
  const outcomes: Record<string, string> = {};
  for (const { name, kernel } of cards) {
    const card = cardOf(page, name);
    // oxlint-disable-next-line no-await-in-loop -- one card at a time: each fork is observed before the next eye is clicked.
    await card.scrollIntoViewIfNeeded();
    // oxlint-disable-next-line no-await-in-loop -- sequential by design.
    await card.getByRole('button', { name: 'Preview model' }).click();
    // oxlint-disable-next-line no-await-in-loop -- sequential by design.
    outcomes[`${name} (${kernel})`] = await settleRender(page, card);
  }
  expect(outcomes).toEqual(Object.fromEntries(cards.map(({ name, kernel }) => [`${name} (${kernel})`, 'framed'])));
});

test('[completed-artifact] the builtin example page renders geometry and loads its parameters', async () => {
  const { page } = await launch();
  await openCommunity(page);
  /* Through the card's own link, as a person reaches it; the document load of
   * `app://tau/s/builtin~…` is pinned by `desktop-share-link-copy.spec.ts`. */
  const card = cardOf(page, 'Cycloidal Gear');
  await card.scrollIntoViewIfNeeded();
  await card.getByRole('link', { name: 'Open Cycloidal Gear', exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/s/builtin~replicad.cycloidal-gear', { timeout: 60_000 });
  expect(await settleRender(page, page.locator('body'))).toBe('framed');
  await expectVisible(page.getByLabel('Input for Twist Angle').first(), 120_000);
});

test('[completed-artifact] the import review preview renders a disk upload', async () => {
  const { page } = await launch();
  await page.goto('app://tau/import', { waitUntil: 'domcontentloaded' });
  await page
    .locator('input[type="file"][accept]')
    .last()
    .setInputFiles([join(birdhouse, 'main.ts'), join(birdhouse, 'tau.json')]);
  await expectVisible(page.getByText('Review import', { exact: true }), 60_000);
  const placeholder = page.getByText('Select a file to preview', { exact: true });
  if ((await placeholder.count()) > 0) {
    await page
      .getByRole('combobox')
      .filter({ hasText: /Select main file/u })
      .first()
      .click();
    await page
      .getByRole('option', { name: /main\.ts/u })
      .first()
      .click();
  }
  expect(await settleRender(page, page.locator('body'))).toBe('framed');
});
