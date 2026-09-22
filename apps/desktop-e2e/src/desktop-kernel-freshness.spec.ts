import { readFileSync } from 'node:fs';
import { afterEach, expect, test } from 'vitest';
import { launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import {
  gatewayFixtureFinalText,
  gatewayFixtureModelName,
  gatewayToolResults,
  startGatewayFixture,
} from '#support/gateway-fixture.js';
import type { GatewayFixture } from '#support/gateway-fixture.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import {
  expectSignedIn,
  expectVisible,
  selectChatModel,
  selectKernel,
  submitPrompt,
  waitForProjectOnDisk,
} from '#support/scenario.js';

/**
 * The reported agent loop, on the reported host (R7 / W2 of
 * `docs/research/agent-stale-kernel-result-elimination-blueprint.md`).
 *
 * One scripted turn writes a broken model, asks the kernel, repairs the model
 * and asks again. Before the fix the second verdict repeated the first error
 * verbatim: the desktop's filesystem bridge advertises `watch`, so
 * `KernelWorker` keeps its bundle and parameter caches across operations
 * (Finding 1, L3), and a request-scoped `evaluate` never arms a watch to
 * invalidate them (L4). The agent then edits, re-checks, sees the same error
 * and loops.
 *
 * Both verdicts are asserted, not only the last one: a spec that pinned only
 * `ready` would pass on a build that never produced the error either, and
 * would stop witnessing the transition this class is about.
 *
 * A **bundled TypeScript** kernel is mandatory here. OpenSCAD re-reads its
 * entry on every call, so no OpenSCAD script can show the defect; the stale
 * artefact is the cached esbuild bundle.
 */

/** Written first. `.notAMethod()` is a hard runtime failure inside the bundle. */
const brokenSource = `import { makeCylinder } from 'replicad';

export default function main() {
  return makeCylinder(5, 20).notAMethod();
}
`;

/** The text `edit_file` removes; also the sentinel the repaired verdict must not carry. */
const staleSentinel = '.notAMethod()';

/** What the file holds after the scripted repair. */
const repairedSource = brokenSource.replace(staleSentinel, '');

/** Requests the scripted turn makes: one per tool call plus the closing message. */
const scriptedRequests = 5;

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

test('answers the repaired source after reporting the broken one', async () => {
  const account = tauTestAccount('freshness');
  seededEmail = account.email;
  const token = await seedTauTestUser(account);
  session = await launchDesktopApp({ token });
  const { page } = session;
  /* The four calls the reported chat made, in order. Scripted as a constant
   * array rather than per turn: this chat has exactly one prompt. The pair is
   * not a `ping_pong` alternation — `edit_file` sits between the two verdicts —
   * and two edits to one file are well under the per-target-edit threshold
   * (`packages/agent-host/src/harness/safeguards.ts`). */
  fixture = await startGatewayFixture({
    toolCalls: [
      { name: 'create_file', input: { targetFile: 'main.ts', content: brokenSource } },
      { name: 'get_kernel_result', input: { targetFile: 'main.ts' } },
      { name: 'edit_file', input: { targetFile: 'main.ts', oldString: staleSentinel, newString: '' } },
      { name: 'get_kernel_result', input: { targetFile: 'main.ts' } },
    ],
  });
  await fixture.routeThrough(page);

  try {
    await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
    await expectSignedIn(page);
    await selectKernel(page, 'Replicad');
    /* Before the submit: the home composer's seeded turn dispatches itself as
     * soon as the project's chat loads. */
    await selectChatModel(page, gatewayFixtureModelName);

    const slug = await submitPrompt(page, 'Create a cylinder and check the kernel result.');
    const sourcePath = await waitForProjectOnDisk(session.homeRoot, slug, { extension: '.ts', page });

    await expectVisible(page.getByText(gatewayFixtureFinalText, { exact: true }), 420_000);
    await expect
      .poll(() => fixture!.gatewayRequests.length, { timeout: 120_000 })
      .toBeGreaterThanOrEqual(scriptedRequests);

    /* The repair reached real disk. Asserted before the verdicts so a failed
     * `edit_file` is named as itself rather than read as a stale verdict. */
    expect(readFileSync(sourcePath, 'utf8')).toBe(repairedSource);

    /* The closing request carries the whole conversation, so one request holds
     * both verdicts. */
    const verdicts = gatewayToolResults(fixture.gatewayRequests.slice(-1)).filter(
      (result) => result.name === 'get_kernel_result',
    );
    const seen = JSON.stringify(verdicts);
    expect(verdicts, `expected two kernel verdicts, saw ${seen}`).toHaveLength(2);
    /* Red half: the broken model really did fail, so the green half below is a
     * transition and not a model that never broke. */
    expect(verdicts[0]!.text, `the first verdict did not report the broken model: ${seen}`).toContain('notAMethod');
    /* Green half. The status enum is `ready | error`
     * (`libs/chat/src/schemas/tools/get-kernel-result.tool.schema.ts`); the
     * sentinel check is what separates "fresh" from "stale", because a stale
     * answer repeats the first error verbatim. */
    expect(verdicts[1]!.text, `the repaired source was not answered as ready: ${seen}`).toMatch(
      /"status"\s*:\s*"ready"/u,
    );
    expect(verdicts[1]!.text, `the second verdict repeated the first error: ${seen}`).not.toContain('notAMethod');
    /* Provenance (R4): the repaired verdict names the digest `edit_file` left at
     * the path, so "fresh" is a digest equality and not only the sentinel's
     * absence. */
    const repair = gatewayToolResults(fixture.gatewayRequests.slice(-1)).find((result) => result.name === 'edit_file');
    expect(repair, 'the scripted turn produced no edit_file result').toBeDefined();
    const { revision } = JSON.parse(repair!.text) as { revision: { path: string; digest: string } };
    const verdict = JSON.parse(verdicts[1]!.text) as { sourceRevision?: { files: Record<string, string> } };
    const named = verdict.sourceRevision?.files[revision.path];
    expect(named, `the repaired verdict does not name the written digest: ${seen}`).toBe(revision.digest);
  } catch (error) {
    await session.capture('kernel-freshness-failure');
    throw error;
  }
});
