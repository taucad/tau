/* oxlint-disable no-await-in-loop -- Reading and expanding one transcript activity at a time is the interaction under test. */
/* oxlint-disable typescript/no-unnecessary-condition -- `document.body.textContent` is typed non-nullish but is read back at runtime from a page that may already be torn down. */
import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import type { UsageReceipt } from '#support/live-chat-turn.js';
import {
  billingMounted,
  expandActivities,
  expectAssistantText,
  expectSettledReceipts,
  openLiveChat,
  readActiveProjectTree,
  submitTurn,
} from '#support/live-chat-turn.js';

const modelId = 'google-gemini-3.7-flash';
const providerModelId = 'gemini-3.7-flash';
const isGeminiReceipt = (receipt: UsageReceipt): boolean => receipt.model.id === providerModelId;

const readProjectFiles = async (): Promise<{
  readonly source: string;
  readonly spec: string;
}> => {
  const tree = await readActiveProjectTree();
  const source = tree['/main.scad'];
  const spec = Object.entries(tree).find(([path]) => path.endsWith('.geospec.ts'))?.[1];
  if (source === undefined || spec === undefined) {
    throw new Error('main.scad or its GeoSpec is absent.');
  }
  return { source, spec };
};

const testedButtons = (): ReturnType<typeof selectors.getByRole> =>
  selectors.getByRole('button', { name: /Tested \d+ requirements?/u });

const testedCounts = async (): Promise<readonly number[]> => {
  const buttonState = await target.read(testedButtons());
  const total = buttonState.count;
  const counts: number[] = [];
  for (let index = 0; index < total; index += 1) {
    const state = await target.read(testedButtons().nth(index));
    counts.push(Number(/Tested (?<count>\d+) requirements?/u.exec(state.text ?? '')?.groups?.['count'] ?? 0));
  }
  return counts;
};

const expectLatestGeoSpecPass = async (minimumRequirements: number, previousRunCount: number): Promise<number> => {
  await expandActivities();
  // A turn can run the spec more than once; the acceptance is that one run in it
  // covered every required GeoSpec check, so the best run is the one asserted
  // rather than whichever ran last.
  const counts = await testedCounts();
  const best = Math.max(0, ...counts);
  if (counts.length <= previousRunCount || best < minimumRequirements) {
    const pageText = await target.evaluate(() => document.body.textContent ?? '');
    throw new Error(
      `Gemini ran GeoSpec ${String(counts.length - previousRunCount)} time(s) this turn and tested ${String(best)} of ${String(minimumRequirements)} required requirements. Page text:\n${pageText.slice(-6000)}`,
    );
  }
  // Each run reports one target file, so the best run's card and its result
  // share an index. The result is force-mounted, so it is read by presence
  // rather than by visibility — toggling the card open would race the read.
  const bestIndex = counts.lastIndexOf(best);
  const result = selectors.getByCss('[data-target-file]').nth(bestIndex);
  await target.expectCount(result, 1, 30_000);
  await target.expectCount(result.getByCss('svg.lucide-x'), 0);
  const passes = await target.read(result.getByCss('svg.lucide-check'));
  expect(passes.count).toBeGreaterThan(0);
  return counts.length;
};

const expectGeoSpecContract = (source: string, volume: RegExp): void => {
  expect(source).toMatch(/toHaveBoundingBox/u);
  expect(source).toMatch(/toHaveConnectedComponents/u);
  expect(source).toMatch(/toBeWatertight/u);
  expect(source).toMatch(/toHaveVolume/u);
  expect(source).toMatch(volume);
};

/** Wait until the revision graph lists at least `minimumCount` published revisions. */
const expectRevisionsPublished = async (minimumCount: number): Promise<number> => {
  const revisions = selectors.getByCss('[aria-label="Recent revision history"] > li');
  let published = 0;
  await expect
    .poll(
      async () => {
        const state = await target.read(revisions);
        published = state.count;
        return published;
      },
      { timeout: 60_000 },
    )
    .toBeGreaterThanOrEqual(minimumCount);
  return published;
};

const expectTerminalVertexOperations = async (
  email: string,
  minimumCount: number,
): Promise<Awaited<ReturnType<typeof target.readTauVertexOperations>>> => {
  let operations: Awaited<ReturnType<typeof target.readTauVertexOperations>> = [];
  await expect
    .poll(
      async () => {
        operations = await target.readTauVertexOperations(email);
        return (
          operations.length >= minimumCount && operations.every((operation) => operation.terminalRevision !== null)
        );
      },
      { timeout: 120_000 },
    )
    .toBe(true);
  for (const operation of operations) {
    expect(operation.customerState).toBe('settled');
    expect(operation.executionStatus).toBe('succeeded');
    expect(operation.meteringStatus).toBe('complete');
    // oxlint-disable-next-line typescript/no-non-null-assertion -- A settled operation always carries its token counts.
    expect(BigInt(operation.outputTokens!)).toBeGreaterThanOrEqual(BigInt(operation.reasoningTokens ?? '0'));
  }
  return operations;
};

test('Gemini creates a cube, then adds a vertical cylinder cutout on the next user turn', async () => {
  const email = `gemini-live-${String(Date.now())}@e2e.tau`;
  await openLiveChat({ email, modelId, projectName: 'Gemini Replay Acceptance' });

  await submitTurn(
    'Create one solid 20 mm cube centered at the origin in main.scad. Create main.geospec.ts with all four requirements: watertight, exactly one solid body, 20 x 20 x 20 mm extents, and 8000 mm^3 volume. Then invoke the test_model tool once on the whole main.geospec.ts file, without filtering to a single test. Do not add a hole yet. Finish this turn only after all four requirements pass in that one run, and end your reply with the line CUBE-TURN-DONE.',
  );
  await expectAssistantText(/CUBE-TURN-DONE/u);
  const firstActivityCount = await expectLatestGeoSpecPass(4, 0);
  const cube = await readProjectFiles();
  expect(cube.source).toMatch(/cube\s*\([^)]*20/isu);
  expect(cube.source).toMatch(/center\s*=\s*true/iu);
  expect(cube.source).not.toMatch(/cylinder\s*\(/u);
  expectGeoSpecContract(cube.spec, /8000/u);
  await target.click(selectors.getByText('Revisions', { exact: true }).last());
  // The published revisions are the graph's list items. How many a turn
  // publishes is the model's business — it may save each file separately — so
  // the acceptance is that the first turn published at least one and the second
  // turn published more, not an exact count.
  const firstTurnRevisions = await expectRevisionsPublished(1);

  await submitTurn(
    'Now modify that cube by subtracting one centered vertical cylindrical through-hole of radius 5 mm along the Z axis and through the full cube. Keep the 20 x 20 x 20 mm outer extents. Update main.geospec.ts so it still checks all four requirements: watertight, exactly one solid body, 20 x 20 x 20 mm extents, and volume approximately 6429.2 mm^3. Then invoke the test_model tool once on the whole main.geospec.ts file, without filtering to a single test, finish this second turn only after all four requirements pass in that one run, and end your reply with the line CUTOUT-TURN-DONE.',
  );
  await expectAssistantText(/CUTOUT-TURN-DONE/u);
  await expectLatestGeoSpecPass(4, firstActivityCount);
  const cutout = await readProjectFiles();
  expect(cutout.source).toMatch(/difference\s*\(/u);
  expect(cutout.source).toMatch(/cylinder\s*\([^)]*(?:(?:r|radius)\s*=\s*5|d\s*=\s*10)/isu);
  expect(cutout.source).toMatch(/center\s*=\s*true/iu);
  expectGeoSpecContract(cutout.spec, /6429(?:\.2)?|8000\s*-\s*Math\.PI/iu);
  await expectRevisionsPublished(firstTurnRevisions + 1);
  await target.expectVisible(selectors.getByTestId('cad-viewer-canvas-region').getByCss('canvas').first(), 60_000);

  // Billing evidence last: both turns are already proven by the transcript, the
  // project files and the revision graph, so a receipt assertion failing here
  // names the metering rather than the provider wire. Each turn bills at least
  // its first model call and its post-tool continuation. A self-hosted API
  // mounts no billing, so there the evidence above is the whole proof.
  if (!(await billingMounted())) {
    await target.writeArtifact(
      'gemini-browser-agent-host-live-evidence.json',
      `${JSON.stringify({ modelId, billing: 'not mounted by this API; receipts not asserted' }, null, 2)}\n`,
    );
    return;
  }
  const usage = await expectSettledReceipts(isGeminiReceipt, 4);
  for (const receipt of usage) {
    expect(receipt.model.providerId).toBe('vertexai');
  }
  const operations = await expectTerminalVertexOperations(email, 4);
  await target.writeArtifact(
    'gemini-browser-agent-host-live-evidence.json',
    `${JSON.stringify({ modelId, usage, operations }, null, 2)}\n`,
  );
}, 1_200_000);
