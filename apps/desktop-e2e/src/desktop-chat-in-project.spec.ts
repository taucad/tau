import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { afterEach, expect, test } from 'vitest';
import type { Page } from 'playwright';
import { launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import {
  gatewayFixtureFinalText,
  gatewayFixtureModelName,
  gatewayFixtureScadSource,
  installGatewayFixture,
  startGatewayFixture,
} from '#support/gateway-fixture.js';
import type { GatewayFixture } from '#support/gateway-fixture.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import {
  activeChatId,
  connectPickedFolder,
  expectDesktopSurfaceBoundary,
  expectNoDesktopAnalytics,
  expectLauncher2Turn,
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

/**
 * Record every label the latest turn's revision marker shows, in order.
 *
 * *Saving revision* lasts as long as the host's settlement takes, which a
 * scripted turn can make shorter than any poll interval, so the marker's own
 * live region is observed rather than sampled. Red-First row 18.
 *
 * @param page - The renderer.
 * @returns A reader for the labels seen so far.
 */
const recordTurnMarker = async (page: Page): Promise<() => Promise<readonly string[]>> => {
  await page.evaluate(() => {
    const seen: string[] = [];
    Object.assign(globalThis, { tauTurnMarkerLabels: seen });
    const sample = (): void => {
      const markers = document.querySelectorAll('[role="status"][aria-label="Turn revision status"]');
      const text = [...markers].at(-1)?.textContent.trim() ?? '';
      if (text !== '' && seen.at(-1) !== text) {
        seen.push(text);
      }
    };
    new MutationObserver(sample).observe(document.body, { characterData: true, childList: true, subtree: true });
    sample();
  });
  return async () =>
    page.evaluate(() => [...((globalThis as { tauTurnMarkerLabels?: string[] }).tauTurnMarkerLabels ?? [])]);
};

/** One `tool_result` block as the provider wire carries it. */
type WireToolResult = {
  readonly content?: unknown;
  readonly is_error?: unknown;
  readonly tool_use_id?: unknown;
  readonly type?: unknown;
};

/**
 * Every failed `tool_result` in one forwarded provider request, bounded so the
 * failure message stays readable.
 *
 * The runtime tool below runs in the services utility against the picked folder,
 * which is the one path the deterministic tier never exercised: a root the
 * services host refuses answers the agent with an *error result*, not with a
 * failed run, so every other assertion in this row still passes. Same check as
 * `desktop-image-geospec.spec.ts:131-138`, which only runs in the packaged tier.
 * Every request carries the whole conversation, so the last one covers both
 * turns.
 *
 * @param request - A forwarded provider request body.
 * @returns One bounded JSON line per failed tool result.
 */
const failedToolResults = (request: unknown): readonly string[] => {
  const messages = (request as { readonly messages?: ReadonlyArray<{ readonly content?: unknown }> }).messages ?? [];
  return messages
    .flatMap((message) => (Array.isArray(message.content) ? (message.content as readonly WireToolResult[]) : []))
    .filter((block) => block.type === 'tool_result' && block.is_error === true)
    .map((block) =>
      JSON.stringify({
        toolUseId: block.tool_use_id,
        content:
          typeof block.content === 'string' ? block.content.slice(0, 2e3) : JSON.stringify(block.content).slice(0, 2e3),
      }),
    );
};

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
  /* The scripted turn runs the kernel as well as writing it: `get_kernel_result`
   * is the only deterministic row that makes the services utility ask the
   * services host for the project's filesystem, which is where a refused root
   * shows up. */
  fixture = await startGatewayFixture({
    toolCalls: [
      { name: 'create_file', input: { targetFile: 'main.scad', content: gatewayFixtureScadSource } },
      { name: 'get_kernel_result', input: { targetFile: 'main.scad' } },
    ],
  });
  await fixture.routeThrough(page);

  try {
    await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
    await expectDesktopSurfaceBoundary(session);
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
     * and a wedged assertion. Three gateway requests is the turn's own
     * completion signal — one per scripted tool call plus the closing message —
     * so waiting on it is exact where the UI affordance is not. `cancelRun`
     * keeps its coverage in the external-write test. */
    const scriptedRequestsPerTurn = 3;
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
    const seedWritten = statSync(await waitForProjectOnDisk(root, slug, { extension: '.scad', page })).mtimeMs;
    const gatewayCallsBefore = fixture.gatewayRequests.length;

    const markerLabels = await recordTurnMarker(page);
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

    /* Every desktop turn is launcher 2 (D18), so this spec witnesses it too:
     * the utility served the channel and the durable log is on real disk. */
    await expectLauncher2Turn(session.logPath, join(root, slug), activeChatId(page));

    await expectModelBuilt({ finalText: gatewayFixtureFinalText, logPath: session.logPath, page, sourcePath });

    /* The runtime tools really ran. Asserted after the closing line, because the
     * request that carries the last turn's results is the one that answers it. */
    const failedTools = failedToolResults(fixture.gatewayRequests.at(-1));
    expect(failedTools, `desktop agent tools failed:\n${failedTools.join('\n')}`).toEqual([]);

    /* Row 18: working → saving → saved, on this turn, in that order. */
    const lastLabel = async (): Promise<string | undefined> => {
      const seen = await markerLabels();
      return seen.at(-1);
    };
    await expect.poll(lastLabel, { timeout: 120_000 }).toMatch(/^Rev \d+ saved/u);
    const labels = await markerLabels();
    const working = labels.findLastIndex((label) => label.endsWith('Working'));
    const saving = labels.lastIndexOf('Saving revision');
    console.info(`[desktop-e2e] in-project turn marker: ${JSON.stringify(labels)}`);
    expect(working, `marker never said Working: ${JSON.stringify(labels)}`).toBeGreaterThanOrEqual(0);
    expect(saving, `marker never said Saving revision after Working: ${JSON.stringify(labels)}`).toBeGreaterThan(
      working,
    );
    expect(labels.length - 1).toBeGreaterThan(saving);
    console.info(`[desktop-e2e] in-project prompt-to-framed-geometry: ${String(Date.now() - promptStart)} ms`);
    console.info(`[desktop-e2e] in-project API chat calls: ${JSON.stringify(fixture.apiChatRequests)}`);
    expectNoDesktopAnalytics(session);
  } catch (error) {
    await session.capture('in-project-failure');
    throw error;
  }
});

/* Row 18's other half: a turn whose provider call is refused must not claim a
 * save it never made. */
test('says Save not confirmed when the gateway refuses the turn', async () => {
  const account = tauTestAccount('in-project-failure');
  seededEmail = account.email;
  const token = await seedTauTestUser(account);
  session = await launchDesktopApp({ token });
  const { page } = session;
  fixture = await installGatewayFixture(page);

  try {
    await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
    await selectKernel(page, 'OpenSCAD');
    await selectChatModel(page, gatewayFixtureModelName);
    await submitPrompt(page, prompt);
    await expect.poll(() => fixture!.gatewayRequests.length, { timeout: 120_000 }).toBeGreaterThanOrEqual(2);

    fixture.setFailure({ status: 500, message: 'Provider unavailable for this test.' });
    const markerLabels = await recordTurnMarker(page);
    await sendPrompt(page, prompt);
    await expect
      .poll(
        async () => {
          const seen = await markerLabels();
          return seen.at(-1);
        },
        {
          message: 'the refused turn must end on Save not confirmed',
          timeout: 300_000,
        },
      )
      .toBe('Save not confirmed');
    console.info(`[desktop-e2e] refused turn marker: ${JSON.stringify(await markerLabels())}`);
  } catch (error) {
    console.info(
      `[desktop-e2e] refused turn marker: ${JSON.stringify(await page.evaluate(() => (globalThis as { tauTurnMarkerLabels?: string[] }).tauTurnMarkerLabels).catch(() => []))}`,
    );
    await session.capture('in-project-refused-turn');
    throw error;
  }
});
