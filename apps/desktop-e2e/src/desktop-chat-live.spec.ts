import { readFileSync, statSync } from 'node:fs';
import process from 'node:process';
import { afterEach, expect, test } from 'vitest';
import { authenticatePackagedDesktop, launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { gatewayFixtureModelName, installGatewayFixture } from '#support/gateway-fixture.js';
import type { GatewayFixture } from '#support/gateway-fixture.js';
import { deleteTauTestUser, seedTauTestUser, tauCreditBalanceMicro, tauTestAccount } from '#support/tau-account.js';
import {
  connectPickedFolder,
  declineCookieBanner,
  expectCount,
  expectGeometryFramed,
  expectSignedIn,
  expectVisible,
  selectChatModel,
  selectKernel,
  sendPrompt,
  submitPrompt,
  waitForProjectOnDisk,
  waitForRunToSettle,
} from '#support/scenario.js';

/**
 * Z-live (work item Z4): the same scenario against a real frontier model.
 *
 * The turn under test is driven from **inside the project route**, and the
 * seeding turn the home composer necessarily starts is served by the mocked
 * Anthropic gateway (`#support/gateway-fixture.js`) — that fixture redirects
 * only `/v1/llm/anthropic/`, so the OpenAI row selected afterwards reaches the
 * real gateway and the live turn is the only spend in the test. The retired
 * `tau` replay row used to fill that seeding slot; it cannot, because
 * `admitWorkspace` now refuses a wire the browser agent host cannot speak.
 *
 * Gated on the explicit `TAU_E2E_LIVE_LLM` flag and **never** on key presence:
 * `apps/api/.env.test` ships non-empty mock provider keys, so a
 * `requiresEnv`-style gate would run this lane with a fake key and fail
 * confusingly. Assertions are loosened accordingly — a live run's tool calls,
 * file names and file contents are not deterministic.
 */

const live = process.env['TAU_E2E_LIVE_LLM'] === 'true';
const packaged = process.env['TAU_E2E_PACKAGED'] === 'true';
const modelName = process.env['TAU_E2E_LIVE_MODEL'] ?? 'GPT-5.6 Luna';
const prompt = 'Create a 20 mm cube with a 6 mm centered cylindrical hole through it.';

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

test.skipIf(!live)('builds a model on disk with a live frontier model', async () => {
  const account = tauTestAccount('live');
  seededEmail = account.email;
  const token = await seedTauTestUser(account);
  session = await launchDesktopApp({
    token,
    packaged,
    ...(packaged
      ? {
          env: {
            // eslint-disable-next-line @typescript-eslint/naming-convention -- Environment variables retain their wire names.
            TAU_E2E_DISABLE_CREDENTIAL_PERSISTENCE: '1',
          },
        }
      : {}),
  });
  const { page } = session;
  fixture = await installGatewayFixture(page);

  try {
    await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
    await declineCookieBanner(page);
    if (packaged) {
      await authenticatePackagedDesktop(session, token);
    }
    await expectSignedIn(page);

    await selectKernel(page, 'OpenSCAD');
    await connectPickedFolder(session);
    /* Create the project on the mocked wire, then switch to the live one for
     * the turn that matters. The model has to be picked *before* the submit:
     * the home composer's first turn dispatches itself as soon as the chat
     * loads, and a row whose wire the browser host cannot speak is refused at
     * admission rather than silently downgraded. */
    await selectChatModel(page, gatewayFixtureModelName);
    const slug = await submitPrompt(page, prompt);
    /* Wait for the seeded turn to finish on the mock rather than cancelling it:
     * a cancel races a turn this short, and the deterministic tier measured the
     * race at ~1 run in 6. Two gateway requests is the scripted turn's own
     * completion signal. */
    const scriptedRequestsPerTurn = 2;
    await expect
      .poll(() => fixture!.gatewayRequests.length, { timeout: 120_000 })
      .toBeGreaterThanOrEqual(scriptedRequestsPerTurn);
    await selectChatModel(page, modelName);
    /* Gate the live turn's liveness on the seed's mtime. Ungated, both signals
     * are satisfied by the *mocked* turn: `waitForProjectOnDisk` finds the
     * seed's `main.scad` immediately and `waitForRunToSettle` sees no stop
     * button because the live run has not bound yet, so the credit delta is
     * sampled 188 ms apart and reads zero (measured on the 2026-09-02 live
     * run). The first fix truncated the seed's bytes here through `node:fs`;
     * the revision authority captured that empty file as the live turn's base,
     * faithfully, and it was triaged as a Tau defect for an evening
     * (`chat-revision-mode-local-default-blueprint.md`, FIX-REVGRAPH § B). The
     * harness never writes into the workspace between turns. */
    /** Milliseconds (`mtimeMs`). */
    const seedWritten = statSync(
      await waitForProjectOnDisk(session.pickedDirectory, slug, { extension: '.scad' }),
    ).mtimeMs;
    const creditsBefore = await tauCreditBalanceMicro(token);
    const liveStart = Date.now();
    await sendPrompt(page, prompt);
    /* The file, not the stop button, is the liveness signal: on a stalled run
     * the button is already gone and `waitForRunToSettle` returns instantly. */
    const sourcePath = await waitForProjectOnDisk(session.pickedDirectory, slug, {
      extension: '.scad',
      writtenAfter: seedWritten,
    });
    await waitForRunToSettle(page, 480_000);
    const creditsAfter = await tauCreditBalanceMicro(token);
    const spentMicro = creditsBefore - creditsAfter;
    console.info(
      `[desktop-e2e] live spend: ${String(spentMicro)} micro-dollars ` +
        `(${String(creditsBefore)} → ${String(creditsAfter)}) over ${String(Date.now() - liveStart)} ms`,
    );
    /* Acceptance 6 asks for *real spend recorded*. Without this the lane
     * passes when the run never reached a provider. Live tier only — the whole
     * test is `skipIf(!live)`, and the seeding turn above is mocked, so a
     * non-zero balance delta can only come from the live turn. */
    expect(spentMicro, 'the live run metered no credits — no provider call was made').toBeGreaterThan(0);
    const source = readFileSync(sourcePath, 'utf8');
    console.info(`[desktop-e2e] live model=${modelName} wrote ${sourcePath} (${String(source.length)} bytes)`);
    expect(source.length).toBeGreaterThan(0);

    await expectCount(page.getByText(/ROOT_UNAVAILABLE/u), 0);
    await expectVisible(page.getByTestId('cad-viewer-canvas-region').locator('canvas'), 120_000);
    await expectGeometryFramed(page);
  } catch (error) {
    await session.capture('live-failure');
    throw error;
  }
});
