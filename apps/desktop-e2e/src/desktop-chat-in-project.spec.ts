import { readFileSync, statSync } from 'node:fs';
import process from 'node:process';
import { afterEach, expect, test } from 'vitest';
import { launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { gatewayFixtureFinalText, gatewayFixtureModelName, installGatewayFixture } from '#support/gateway-fixture.js';
import type { GatewayFixture } from '#support/gateway-fixture.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import {
  connectPickedFolder,
  declineCookieBanner,
  expectModelBuilt,
  expectSignedIn,
  expectVisible,
  selectChatModel,
  selectKernel,
  sendPrompt,
  submitPrompt,
  waitForProjectOnDisk,
} from '#support/scenario.js';

/**
 * Z-replay, in-project variant — a *second* turn in an existing chat.
 *
 * The sibling spec drives the home composer's seeded first turn; this one seeds
 * a project, cancels that turn, and prompts again from inside the project
 * route. What it adds is the path an operator actually spends their day on: a
 * chat that already has a durable log, a claim that a cancel had to release,
 * and the picked-folder arm (native dialog, granted-root registry).
 *
 * Both turns run in the renderer's **browser agent host** against the mocked
 * gateway (`#support/gateway-fixture.js`) — the API is not in the chat's data
 * path at all (agent-host program W3-CUT, charter ruling C3's re-rule).
 */

const prompt = 'Create a cube with a centered cylindrical cutout and verify it.';
/**
 * **`picked` by default**, and deliberately so: this is the only deterministic
 * test that drives the native directory dialog, the granted-root registry and
 * picked-folder routing. Home is covered by `desktop-chat-replay.spec.ts`, so
 * between them the default suite exercises both arms.
 */
const location = process.env['TAU_E2E_DESKTOP_LOCATION'] ?? 'picked';

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

test('builds an openrscad model on disk from the project chat', async () => {
  const account = tauTestAccount('in-project');
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
    /* Before the submit, not after: the home composer's first turn dispatches
     * itself as soon as the project's chat loads, so the wire it will speak has
     * to be settled by then. */
    await selectChatModel(page, gatewayFixtureModelName);

    const slug = await submitPrompt(page, prompt);
    /* Let the seeding turn finish rather than cancelling it. Cancelling raced:
     * a turn this short can settle before its stop button ever renders, and a
     * seed that published *after* the truncation below left two publications
     * and a wedged assertion. Two gateway requests is the turn's own completion
     * signal — the tool call and the closing message — so waiting on it is
     * exact where the UI affordance is not. `cancelRun` keeps its coverage in
     * the external-write test. */
    const scriptedRequestsPerTurn = 2;
    await expect
      .poll(() => fixture!.gatewayRequests.length, { timeout: 120_000 })
      .toBeGreaterThanOrEqual(scriptedRequestsPerTurn);

    const root = location === 'picked' ? session.pickedDirectory : session.homeRoot;
    /* The seeding turn runs the same scripted `create_file`, so a `main.scad`
     * with content proves nothing about the turn under test: the wait below is
     * gated on the seed's mtime, which is also what keeps the timing honest.
     * Never truncate the seed instead — a harness write into the workspace is
     * captured faithfully as an empty base revision and reads as a Tau defect
     * (FIX-REVGRAPH § B in `chat-revision-mode-local-default-blueprint.md`). */
    /** Milliseconds (`mtimeMs`). */
    const seedWritten = statSync(await waitForProjectOnDisk(root, slug, { extension: '.scad' })).mtimeMs;
    const gatewayCallsBefore = fixture.gatewayRequests.length;

    const promptStart = Date.now();
    await sendPrompt(page, prompt);

    const sourcePath = await waitForProjectOnDisk(root, slug, { extension: '.scad', writtenAfter: seedWritten });
    expect(readFileSync(sourcePath, 'utf8').length).toBeGreaterThan(0);
    /* The second turn reached the gateway on its own — a re-published seed
     * would satisfy the file assertion without ever running. */
    expect(fixture.gatewayRequests.length).toBeGreaterThan(gatewayCallsBefore);
    // O9 (G23): desktop numbers are their own baseline — the in-process native
    // bench does not transfer across the copy-only utility wire.
    console.info(`[desktop-e2e] in-project prompt-to-file-on-disk: ${String(Date.now() - promptStart)} ms`);

    await expectModelBuilt({ finalText: gatewayFixtureFinalText, logPath: session.logPath, page, sourcePath });
    console.info(`[desktop-e2e] in-project prompt-to-framed-geometry: ${String(Date.now() - promptStart)} ms`);
    console.info(`[desktop-e2e] in-project API chat calls: ${JSON.stringify(fixture.apiChatRequests)}`);
  } catch (error) {
    await session.capture('in-project-failure');
    throw error;
  }
});
