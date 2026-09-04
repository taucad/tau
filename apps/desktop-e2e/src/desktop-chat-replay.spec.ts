import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { afterEach, expect, test } from 'vitest';
import { launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { gatewayFixtureFinalText, gatewayFixtureModelName, installGatewayFixture } from '#support/gateway-fixture.js';
import type { GatewayFixture } from '#support/gateway-fixture.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import {
  cancelRun,
  connectPickedFolder,
  declineCookieBanner,
  expectCount,
  expectGeometryFramed,
  expectKernelReparsed,
  expectModelBuilt,
  expectNativeKernelEngine,
  expectSignedIn,
  expectVisible,
  geometryCacheSnapshot,
  selectChatModel,
  selectKernel,
  submitPrompt,
  waitForProjectOnDisk,
} from '#support/scenario.js';

/**
 * Z-replay (work item Z3): the deterministic desktop smoke.
 *
 * Launches the built Electron shell against a dedicated API in `TAU_TEST_MODE`,
 * creates a model from the composer into a disk location and asserts the whole
 * POC chain — chat, disk, native kernel, viewer — including the one assertion
 * no browser suite can make: the bytes exist on real disk.
 *
 * The chat itself runs in the renderer's **browser agent host** against the
 * mocked gateway (`#support/gateway-fixture.js`), never against the API's
 * deleted chat plane and never against the retired `tau` replay wire. The
 * **home-page first turn** is the arm under test here: the seeded turn the home
 * composer dispatches at chat load is the operator's primary flow, and it is
 * what residual R3 claimed could never publish.
 */

const prompt = 'Create a cube with a centered cylindrical cutout and verify it.';
/**
 * Which disk location the composer creates into. Both are "the file exists on
 * real disk" (charter acceptance 2); `picked` additionally exercises the
 * native directory dialog and the granted-root path, and is the in-project
 * spec's default.
 */
const location = process.env['TAU_E2E_DESKTOP_LOCATION'] ?? 'home';

let session: DesktopSession | undefined;
let fixture: GatewayFixture | undefined;
let seededEmail: string | undefined;

afterEach(async () => {
  await session?.close();
  session = undefined;
  await fixture?.close();
  fixture = undefined;
  if (seededEmail) {
    await deleteTauTestUser(seededEmail);
    seededEmail = undefined;
  }
});

test('builds an openrscad-native model on disk from the desktop composer', async () => {
  const account = tauTestAccount('replay');
  seededEmail = account.email;
  const token = await seedTauTestUser(account);
  session = await launchDesktopApp({ token });
  const { page } = session;
  fixture = await installGatewayFixture(page);

  try {
    await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
    await declineCookieBanner(page);
    await expectSignedIn(page);

    await selectKernel(page, 'OpenSCAD');
    if (location === 'picked') {
      await connectPickedFolder(session);
    }
    /* Before the submit: the seeded first turn dispatches itself as soon as the
     * project's chat loads, so switching models afterwards is too late. */
    await selectChatModel(page, gatewayFixtureModelName);

    const geometryStart = Date.now();
    const slug = await submitPrompt(page, prompt);
    // --- the desktop-only assertion: real bytes, real path, raw node:fs ---
    const sourcePath = await waitForProjectOnDisk(
      location === 'picked' ? session.pickedDirectory : session.homeRoot,
      slug,
      { extension: '.scad' },
    );
    expect(readFileSync(sourcePath, 'utf8').length).toBeGreaterThan(0);
    // O9: the desktop numbers are their own baseline (G23) — in-process bench
    // figures do not transfer across the copy-only utility wire.
    console.info(`[desktop-e2e] prompt-to-file-on-disk: ${String(Date.now() - geometryStart)} ms (${sourcePath})`);

    await expectModelBuilt({ finalText: gatewayFixtureFinalText, logPath: session.logPath, page, sourcePath });
    console.info(`[desktop-e2e] prompt-to-framed-geometry: ${String(Date.now() - geometryStart)} ms`);
    console.info(`[desktop-e2e] seeded-turn API chat calls: ${JSON.stringify(fixture.apiChatRequests)}`);
  } catch (error) {
    await session.capture('replay-failure');
    throw error;
  }
});

/**
 * Acceptance 1 and 2 on their own, in ~13 s.
 *
 * Signs in with the A7-seeded credential, drives the composer's location
 * toggle, and asserts the project's bytes land on **real disk** — the
 * assertion no browser suite can make. What the chat run does afterwards is
 * deliberately not asserted here; that is the strict spec above. Kept separate
 * because it stays green through every chat-side defect and is the fastest
 * signal that the shell itself still boots, authenticates, loads the native
 * kernel and writes to disk.
 */
test('signs in and creates a project on real disk from the composer', async () => {
  const account = tauTestAccount('disk');
  seededEmail = account.email;
  const token = await seedTauTestUser(account);
  session = await launchDesktopApp({ token });
  const { page } = session;
  fixture = await installGatewayFixture(page);

  try {
    const launched = Date.now();
    await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
    // O9 (G23): desktop cold-start baseline.
    console.info(`[desktop-e2e] launch-to-composer: ${String(Date.now() - launched)} ms`);
    await declineCookieBanner(page);
    await expectSignedIn(page);

    await selectKernel(page, 'OpenSCAD');
    if (location === 'picked') {
      await connectPickedFolder(session);
    }
    await selectChatModel(page, gatewayFixtureModelName);

    const created = Date.now();
    const slug = await submitPrompt(page, prompt);
    const projectRoot = join(location === 'picked' ? session.pickedDirectory : session.homeRoot, slug);
    await expect
      .poll(() => ['tau.json', 'package.json', 'main.scad'].every((entry) => existsSync(join(projectRoot, entry))), {
        timeout: 180_000,
      })
      .toBe(true);
    console.info(`[desktop-e2e] submit-to-project-on-disk: ${String(Date.now() - created)} ms (${projectRoot})`);

    /* N6 lives here rather than only in the strict set: the kernel utility
     * forks as soon as the project opens, so this witness is green on every
     * run regardless of what the chat run does. */
    console.info(`[desktop-e2e] kernel engine: ${await expectNativeKernelEngine(session.logPath)}`);

    await expectCount(page.getByText(/ROOT_UNAVAILABLE/u), 0);
    await expectCount(page.getByText('File not found', { exact: true }), 0);
  } catch (error) {
    await session.capture('disk-failure');
    throw error;
  }
});

/**
 * Acceptance 5, and the O9 render-to-frame number, without the chat.
 *
 * Green since the seeding run is cancelled first — while a run is live the
 * viewport follows the isolated workspace overlay, not the project's files,
 * which is what made this look permanently red in the previous pass.
 *
 * Writes a real OpenSCAD source into the project from **outside the app** and
 * asserts the shell renders it: the kernel utility's own `fromNodeFs`
 * watcher → re-parse → `openrscadNative()` re-render → framed geometry in the
 * viewport. That is the *second* of the two authorities over this directory
 * (the renderer's node filesystem provider is the first), which is exactly
 * what "two authorities, one disk" claims.
 */
test('renders an external write through the native kernel utility', async () => {
  const account = tauTestAccount('external');
  seededEmail = account.email;
  const token = await seedTauTestUser(account);
  session = await launchDesktopApp({ token });
  const { page } = session;
  fixture = await installGatewayFixture(page);

  try {
    await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
    await declineCookieBanner(page);
    await selectKernel(page, 'OpenSCAD');
    if (location === 'picked') {
      await connectPickedFolder(session);
    }
    await selectChatModel(page, gatewayFixtureModelName);
    const slug = await submitPrompt(page, prompt);
    /* Cancel the seeding turn: while a run is live the viewport follows the
     * isolated workspace overlay, not the project's own files. */
    await cancelRun(page);

    const sourcePath = join(location === 'picked' ? session.pickedDirectory : session.homeRoot, slug, 'main.scad');
    await expect.poll(() => existsSync(sourcePath), { timeout: 120_000 }).toBe(true);

    const before = geometryCacheSnapshot(sourcePath);
    const renderStart = Date.now();
    writeFileSync(
      sourcePath,
      'tauSmokeDepth = 7;\ndifference() {\n  cube([20, 20, tauSmokeDepth], center = true);\n  cylinder(h = 40, r = 3, center = true, $fn = 64);\n}\n',
      'utf8',
    );
    await expectKernelReparsed(sourcePath, 'tauSmokeDepth', before);
    await expectGeometryFramed(page);
    // O9 (G23): the desktop render-to-frame baseline. In-process native bench
    // figures do not transfer — this crosses the copy-only utility wire.
    console.info(`[desktop-e2e] external-write-to-framed-geometry: ${String(Date.now() - renderStart)} ms`);

    console.info(`[desktop-e2e] kernel engine: ${await expectNativeKernelEngine(session.logPath)}`);
    await expectCount(page.getByText(/ROOT_UNAVAILABLE/u), 0);
  } catch (error) {
    await session.capture('external-write-failure');
    throw error;
  }
});
