import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { afterEach, expect, test } from 'vitest';
import { launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { gatewayFixtureFinalText, gatewayFixtureModelName, installGatewayFixture } from '#support/gateway-fixture.js';
import type { GatewayFixture } from '#support/gateway-fixture.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import {
  activeChatId,
  cancelRun,
  connectPickedFolder,
  expectCount,
  expectGeometryFramed,
  expectKernelReparsed,
  expectLauncher2Turn,
  expectModelBuilt,
  expectNativeKernelEngine,
  expectSignedIn,
  expectVisible,
  selectChatModel,
  selectKernel,
  sendPrompt,
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

test('builds an openrscad model on disk from the desktop composer', async () => {
  const account = tauTestAccount('replay');
  seededEmail = account.email;
  const token = await seedTauTestUser(account);
  session = await launchDesktopApp({ token });
  const { page } = session;
  fixture = await installGatewayFixture(page);

  try {
    await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
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

    /* Every desktop turn is launcher 2 (D18): the seeded home-composer turn was
     * served by the utility and left its durable log on real disk. */
    await expectLauncher2Turn(
      session.logPath,
      join(location === 'picked' ? session.pickedDirectory : session.homeRoot, slug),
      activeChatId(page),
    );

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
 * watcher → re-parse → `openrscadKernel()` re-render → framed geometry in the
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
    await selectKernel(page, 'OpenSCAD');
    if (location === 'picked') {
      await connectPickedFolder(session);
    }
    await selectChatModel(page, gatewayFixtureModelName);
    const slug = await submitPrompt(page, prompt);
    /* Cancel the seeding turn: while a run is live the viewport follows the
     * isolated workspace overlay, not the project's own files. */
    await cancelRun(page, () => fixture!.gatewayRequests.length >= 2);

    const sourcePath = join(location === 'picked' ? session.pickedDirectory : session.homeRoot, slug, 'main.scad');
    await expect.poll(() => existsSync(sourcePath), { timeout: 120_000 }).toBe(true);

    const renderStart = Date.now();
    writeFileSync(
      sourcePath,
      'tauSmokeDepth = 7;\ndifference() {\n  cube([20, 20, tauSmokeDepth], center = true);\n  cylinder(h = 40, r = 3, center = true, $fn = 64);\n}\n',
      'utf8',
    );
    await expectKernelReparsed(page, 'Tau Smoke Depth');
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

/**
 * W15 (D14): a chat whose durable log inlines base64 still renders and replays.
 *
 * Every log written before this wave holds `{ type: 'image', mimeType, data }`
 * rows, and there is no migration: the reducer, the projection, the materialiser
 * and the provider mapper all keep that arm forever. The legacy chat is built by
 * copying the settled chat's own directory and rewriting one user row, so the
 * only difference from a live chat is the block shape under test.
 */
test('renders and replays a legacy log that inlines base64 image bytes', async () => {
  const account = tauTestAccount('legacy-inline');
  seededEmail = account.email;
  const token = await seedTauTestUser(account);
  session = await launchDesktopApp({ token });
  const { page } = session;
  fixture = await installGatewayFixture(page);
  const legacyChatId = 'chat_legacyInlineImage000';
  const imageBase64 = readFileSync(resolve(import.meta.dirname, '../fixtures/bracket-photo.jpg')).toString('base64');

  try {
    await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
    await expectSignedIn(page);
    await selectKernel(page, 'OpenSCAD');
    await selectChatModel(page, gatewayFixtureModelName);

    const slug = await submitPrompt(page, prompt);
    await expect.poll(() => fixture!.gatewayRequests.length, { timeout: 120_000 }).toBeGreaterThanOrEqual(2);
    await waitForProjectOnDisk(session.homeRoot, slug, { extension: '.scad' });
    const chatId = activeChatId(page);
    const chatsRoot = join(session.homeRoot, slug, '.tau/chats');

    /* One chat directory, copied and rewritten: same ids everywhere, and the
     * first user row carries an inline image block instead of a `file-ref`.
     *
     * Everything but the live writer lock. The settled chat's log is still open,
     * so its `events.jsonl.lock` names *this* Electron services process
     * (`packages/agent-host/src/node.ts:70-107`); copied along, the legacy chat
     * starts life holding a lock no one will ever release — its attach refuses
     * with `WRITER_LOCKED` ("already has an active Node writer") and no turn
     * ever reaches the gateway. */
    cpSync(join(chatsRoot, chatId), join(chatsRoot, legacyChatId), {
      recursive: true,
      filter: (source) => !source.endsWith('.lock'),
    });
    const legacyLog = join(chatsRoot, legacyChatId, 'events.jsonl');
    let inlined = false;
    const rewritten = readFileSync(legacyLog, 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => {
        const event = JSON.parse(line.split(chatId).join(legacyChatId)) as {
          type?: string;
          message?: { role?: string; content?: unknown };
        };
        /* Both shapes carry the user turn on `message`, and a Tau run's log now
         * only writes the second: `session.ts:1423-1428` commits the prompt as
         * `turn.history-projection-committed`, while `message.appended` remains
         * the row an ACP/external launcher writes. Matching only the old one
         * left nothing to rewrite. */
        if (
          !inlined &&
          (event.type === 'message.appended' || event.type === 'turn.history-projection-committed') &&
          event.message?.role === 'user'
        ) {
          const { content } = event.message;
          const legacyBlock = { type: 'image', mimeType: 'image/jpeg', data: imageBase64 };
          const blocks = Array.isArray(content) ? [...(content as unknown[])] : [{ type: 'text', text: content }];
          Object.assign(event.message, { content: [legacyBlock, ...blocks] });
          inlined = true;
        }
        return JSON.stringify(event);
      })
      .join('\n');
    expect(inlined, 'the settled chat has no user row to rewrite').toBe(true);
    writeFileSync(legacyLog, `${rewritten}\n`);
    const chatRecord = join(chatsRoot, legacyChatId, 'chat.json');
    writeFileSync(
      chatRecord,
      readFileSync(chatRecord, 'utf8').split(chatId).join(legacyChatId).split(`"${prompt}"`).join('"Legacy chat"'),
    );

    const url = new URL(page.url());
    url.searchParams.set('chat', legacyChatId);
    await page.goto(url.href, { waitUntil: 'domcontentloaded' });

    // Renders: the legacy block projects to a `data:` file part, not a reference.
    const legacyImage = page.getByRole('button', { name: /^Open image 1$/u }).first();
    await expectVisible(legacyImage, 120_000);
    await expect
      .poll(async () => legacyImage.locator('img').first().getAttribute('src'), { timeout: 60_000 })
      .toMatch(/^data:image\/jpeg/u);

    // Replays: the next turn puts the same inline bytes on the provider wire.
    const requestsBefore = fixture.gatewayRequests.length;
    await sendPrompt(page, 'Continue from the legacy history.');
    await expect.poll(() => fixture!.gatewayRequests.length, { timeout: 180_000 }).toBeGreaterThan(requestsBefore);
    const replayed = JSON.stringify(fixture.gatewayRequests.slice(requestsBefore));
    expect(replayed, 'the legacy inline image never reached the provider').toContain(imageBase64);
  } catch (error) {
    await session.capture('legacy-inline-failure');
    throw error;
  }
}, 900_000);
