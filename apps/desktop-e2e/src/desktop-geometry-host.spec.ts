import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { afterEach, expect, test } from 'vitest';
import { testModelOutputSchema } from '@taucad/chat/schemas/tools/test-model';

import { authenticatePackagedDesktop, launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { durableMessages, latestCompletedRun, toolResult } from '#support/acp-evidence.js';
import { gatewayFixtureFinalText, gatewayFixtureModelName, startGatewayFixture } from '#support/gateway-fixture.js';
import type { GatewayFixture, GatewayFixtureToolCall } from '#support/gateway-fixture.js';
import {
  geometryHostEvents,
  geometryHostCpuSeconds,
  observeGeometryHost,
  probeServicesHost,
  restoreGeometryHost,
} from '#support/geometry-host-observation.js';
import type { GeometryHostEvent } from '#support/geometry-host-observation.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import {
  activeChatId,
  connectPickedFolder,
  expectVisible,
  selectChatModel,
  selectKernel,
  sendPrompt,
  stopButtonOf,
  submitPrompt,
} from '#support/scenario.js';

const solidSource = `import { drawCircle } from 'replicad';
export default function main() {
  return drawCircle(10).sketchOnPlane().extrude(10);
}
`;
const quickSpec = `import { it, expectGeo } from 'geospec';
import { loadModel } from 'geospec/model';
it('checks the product Runtime mesh', async () => {
  const model = await loadModel({ file: 'main.ts', format: 'glb' });
  expectGeo(model).toBeWatertight();
});
`;
const slowSpec = `import { it, expectGeo } from 'geospec';
import { loadModel } from 'geospec/model';
it('enters the synchronous AP242 claim', async () => {
  const model = await loadModel({ source: 'gearbox.step', format: 'step' });
  expectGeo(model).toHaveConnectedComponents({ count: 5, toleranceMm: 0.001 });
});
`;
const stepFixture = new URL(
  '../../../packages/geospec-engine-native/bench/fixtures/performance-lab/generated/planetary-gearbox-cad.step',
  import.meta.url,
);
const stepSha256 = 'a4294f8fbb1e65c57489d2b358dc6db42225323a2f2d2790baf3f739048b7c6c';
const disableCredentialPersistenceVariable = 'TAU_E2E_DISABLE_CREDENTIAL_PERSISTENCE';
const quickCalls: readonly GatewayFixtureToolCall[] = [
  { name: 'create_file', input: { targetFile: 'main.ts', content: solidSource } },
  { name: 'create_file', input: { targetFile: 'quick.geospec.ts', content: quickSpec } },
  { name: 'test_model', input: { files: ['quick.geospec.ts'] } },
];
const slowCalls: readonly GatewayFixtureToolCall[] = [
  { name: 'create_file', input: { targetFile: 'slow.geospec.ts', content: slowSpec } },
  { name: 'test_model', input: { files: ['slow.geospec.ts'] } },
];
const restartPrompt = 'Run the native quick check again after cancellation.';
const secondProjectPrompt = 'Create a second product mesh and check it with native GeoSpec.';
const returnPrompt = 'Run the native quick check on the first project again.';

/** A run belongs either to the project or to one of its turn checkouts. */
const expectProjectRun = async (run: GeometryHostEvent | undefined, projectRoot: string): Promise<void> => {
  expect(run?.kind).toBe('run');
  expect(run?.root).toBeTypeOf('string');
  const manifest = JSON.parse(await readFile(join(projectRoot, 'tau.json'), 'utf8')) as { id: string };
  const canonicalProjectRoot = await realpath(projectRoot);
  const checkoutRoot = join(dirname(canonicalProjectRoot), '.tau', 'checkouts', manifest.id);
  const within = (parent: string): boolean => {
    const child = relative(parent, resolve(run!.root!));
    return child === '' || (child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child));
  };
  expect(within(canonicalProjectRoot) || within(checkoutRoot), `unowned geometry root ${String(run?.root)}`).toBe(true);
};

/** A quick claim completed through the packaged native-engine route. */
const expectNativeQuick = async (desktop: DesktopSession, runIndex: number): Promise<void> => {
  const initial = await geometryHostEvents(desktop);
  expect(initial[runIndex]?.engine).toBe('native');
  await expect
    .poll(
      async () => {
        const events = await geometryHostEvents(desktop);
        const run = events[runIndex];
        return events
          .slice(runIndex + 1)
          .some((event) => event.pid === run?.pid && event.kind === 'event' && event.eventType === 'file-progress');
      },
      { timeout: 90_000 },
    )
    .toBe(true);
  await expect
    .poll(
      async () => {
        const events = await geometryHostEvents(desktop);
        const run = events[runIndex];
        return events.slice(runIndex + 1).some((event) => event.pid === run?.pid && event.kind === 'result');
      },
      { timeout: 90_000 },
    )
    .toBe(true);
};

/** A specific turn completed the quick native GeoSpec assertion, not merely tool dispatch. */
const expectQuickResult = async (desktop: DesktopSession, projectRoot: string, prompt: string): Promise<void> => {
  const ledgerPath = join(projectRoot, '.tau/chats', activeChatId(desktop.page), 'events.jsonl');
  await expect
    .poll(
      async () => {
        const snapshot = await readFile(ledgerPath, 'utf8');
        try {
          const currentRunId = latestCompletedRun(snapshot);
          return snapshot
            .split('\n')
            .filter(Boolean)
            .some((line) => {
              const event = JSON.parse(line) as {
                type?: string;
                runId?: string;
                state?: string;
                admission?: { message?: { role?: string; content?: unknown } };
              };
              return (
                event.type === 'run.lifecycle' &&
                event.state === 'admitted' &&
                event.runId === currentRunId &&
                event.admission?.message?.role === 'user' &&
                event.admission.message.content === prompt
              );
            });
        } catch {
          return false;
        }
      },
      { timeout: 120_000 },
    )
    .toBe(true);
  const events = await readFile(ledgerPath, 'utf8');
  const messages = durableMessages(events);
  const runId = latestCompletedRun(events);
  const admission = events
    .split('\n')
    .filter(Boolean)
    .map(
      (line) =>
        JSON.parse(line) as {
          type?: string;
          runId?: string;
          state?: string;
          admission?: { message?: { role?: string; content?: unknown } };
        },
    )
    .find((event) => event.type === 'run.lifecycle' && event.state === 'admitted' && event.runId === runId);
  expect(admission?.admission?.message).toMatchObject({ role: 'user', content: prompt });
  const toolResults = messages.filter((message) => message.runId === runId && message.role === 'tool-output');
  expect(toolResults).toHaveLength(3);
  expect(toolResults.map((result) => result.toolName)).toEqual(['create_file', 'create_file', 'test_model']);
  expect(toolResults.some((result) => result.isError)).toBe(false);
  const result = testModelOutputSchema.parse(
    toolResult(events, {
      runId,
      toolName: 'test_model',
      targetFile: 'quick.geospec.ts',
    }),
  );
  expect(result).toMatchObject({ passed: 1, total: 1 });
  expect(result.passes.map((row) => row.requirement)).toEqual(['checks the product Runtime mesh']);
  expect(result).toMatchObject({
    runStatus: 'passed',
    lineageStatus: 'complete',
    accounting: {
      discovered: 1,
      selected: 1,
      completed: 1,
      passed: 1,
      failed: 0,
      unsupported: 0,
      inconclusive: 0,
      skipped: 0,
      notRun: 0,
      requestedFiles: ['quick.geospec.ts'],
      completedFiles: ['quick.geospec.ts'],
      notRunFiles: [],
      discoveryComplete: true,
      cancelled: false,
      bailed: false,
    },
  });
  expect(result.fullResult?.path).toMatch(/^\.tau\/artifacts\/[\w.-]+\/result\.json$/u);
  const retainedBytes = await readFile(join(projectRoot, result.fullResult!.path));
  expect(retainedBytes.byteLength).toBe(result.fullResult!.byteLength);
  expect(createHash('sha256').update(retainedBytes).digest('hex')).toBe(result.fullResult!.sha256);
  const retained = testModelOutputSchema.parse(JSON.parse(retainedBytes.toString('utf8')));
  expect(retained.accounting).toEqual(result.accounting);
  expect(retained.lineage).toEqual(result.lineage);
  expect(retained.sourceRevisions).toEqual(result.sourceRevisions);
  expect(retained.lineage).toHaveLength(1);
  const { lineage } = retained.lineage![0]!;
  expect(lineage.loads).toHaveLength(1);
  const load = lineage.loads[0]!;
  expect(load).toMatchObject({ status: 'complete', evidence: { loadId: load.loadId, parameters: {} } });
  expect(load.subject?.subjectHash ?? load.subject?.contentHash).toMatch(/^[\da-f]{64}$/u);
  expect(lineage.modules[0]?.files['quick.geospec.ts']).toBe(
    `sha256:${createHash('sha256').update(quickSpec).digest('hex')}`,
  );
  const { reports } = retained.passes[0]!;
  expect(reports).toHaveLength(1);
  expect(reports![0]).toMatchObject({ status: 'passed', loadId: load.loadId });
  expect(JSON.parse(Buffer.from(reports![0]!.canonical!.result).toString('utf8')).results).toEqual([
    reports![0]!.result,
  ]);
};

let session: DesktopSession | undefined;
let fixture: GatewayFixture | undefined;
let seededEmail: string | undefined;

afterEach(async () => {
  if (session) {
    try {
      await restoreGeometryHost(session);
    } finally {
      await session.close();
    }
  }
  session = undefined;
  await fixture?.close();
  fixture = undefined;
  if (seededEmail) {
    await deleteTauTestUser(seededEmail);
    seededEmail = undefined;
  }
});

/** Actual packaged-product gate with broker/PID evidence, not a direct addon-entry timestamp. */
test('[native-geospec] keeps services responsive and exits the actual geometry utility before restart', async () => {
  const account = tauTestAccount('geometry-host');
  seededEmail = account.email;
  const token = await seedTauTestUser(account);
  let toolPhase: 'quick' | 'slow' = 'quick';
  fixture = await startGatewayFixture({ toolCalls: () => (toolPhase === 'slow' ? slowCalls : quickCalls) });
  session = await launchDesktopApp({
    packaged: true,
    token,
    env: { [disableCredentialPersistenceVariable]: '1' },
  });
  await observeGeometryHost(session);
  await session.page.addInitScript(() => {
    // A retired stored flag cannot opt the qualified desktop out of its automatic binding.
    localStorage.setItem('tau:flags', JSON.stringify({ nativeGeoSpec: false }));
  });
  await session.page.reload({ waitUntil: 'domcontentloaded' });
  await fixture.routeThrough(session.page);
  const { page } = session;
  await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
  await authenticatePackagedDesktop(session, token);
  await selectKernel(page, 'Replicad');
  await connectPickedFolder(session);
  await selectChatModel(page, gatewayFixtureModelName);
  const slug = await submitPrompt(page, 'Create a product mesh and verify it with native GeoSpec.');
  await expectVisible(page.getByText(gatewayFixtureFinalText, { exact: true }), 600_000);
  const rootA = join(session.pickedDirectory, slug);
  await expectQuickResult(session, rootA, 'Create a product mesh and verify it with native GeoSpec.');
  const firstProjectUrl = page.url();
  const fixtureBytes = await readFile(stepFixture);
  expect(createHash('sha256').update(fixtureBytes).digest('hex')).toBe(stepSha256);
  await mkdir(rootA, { recursive: true });
  const nonce = randomUUID();
  const stepWithNonce = Buffer.from(
    fixtureBytes.toString('utf8').replace('ISO-10303-21;\n', `ISO-10303-21;\n/* e2e native claim ${nonce} */\n`),
  );
  expect(stepWithNonce.equals(fixtureBytes)).toBe(false);
  await writeFile(join(rootA, 'gearbox.step'), stepWithNonce);

  const beforeSlow = await geometryHostEvents(session);
  const runsBeforeSlow = beforeSlow.filter((event) => event.kind === 'run').length;
  toolPhase = 'slow';
  await sendPrompt(page, 'Run the AP242 native check.');
  await expect
    .poll(
      async () => {
        const events = await geometryHostEvents(session!);
        return events.filter((event) => event.kind === 'run').length;
      },
      { timeout: 120_000 },
    )
    .toBeGreaterThan(runsBeforeSlow);
  const beforeProbe = await geometryHostEvents(session);
  const slowRunIndex = beforeProbe.findLastIndex((event) => event.kind === 'run');
  const activePid = beforeProbe[slowRunIndex]?.pid;
  expect(activePid).toBeTypeOf('number');
  expect(activePid).toBeGreaterThan(0);
  expect(beforeProbe[slowRunIndex]?.engine).toBe('native');
  await expectProjectRun(beforeProbe[slowRunIndex], rootA);

  /* The packaged utility must be actively computing this exact native-engine run,
   * not merely spawned or still bundling, before we probe the other host. */
  await expect
    .poll(
      async () => {
        const events = await geometryHostEvents(session!);
        return events
          .slice(slowRunIndex + 1)
          .some((event) => event.pid === activePid && event.kind === 'event' && event.eventType === 'file-start');
      },
      { timeout: 90_000 },
    )
    .toBe(true);
  const cpuAtFileStart = await geometryHostCpuSeconds(session, activePid!);
  await expect
    .poll(
      async () => {
        const events = await geometryHostEvents(session!);
        if (
          events
            .slice(slowRunIndex + 1)
            .some((event) => event.pid === activePid && (event.kind === 'result' || event.kind === 'exit'))
        ) {
          return -1;
        }
        const sample = await geometryHostCpuSeconds(session!, activePid!);
        expect(sample.creationTime).toBe(cpuAtFileStart.creationTime);
        return sample.seconds - cpuAtFileStart.seconds;
      },
      { timeout: 90_000 },
    )
    .toBeGreaterThan(5);

  /* This is an independent services-utility answer, not a main-process heartbeat. */
  const mainStarted = Date.now();
  expect(await session.application.evaluate(() => Date.now())).toBeGreaterThan(0);
  expect(Date.now() - mainStarted).toBeLessThan(10_000);
  expect(await probeServicesHost(session)).toBeLessThan(10_000);
  const duringProbe = await geometryHostEvents(session);
  expect(
    duringProbe
      .slice(slowRunIndex + 1)
      .some((event) => event.pid === activePid && (event.kind === 'result' || event.kind === 'exit')),
  ).toBe(false);

  await expectVisible(stopButtonOf(page), 15_000);
  await stopButtonOf(page).click();
  toolPhase = 'quick';
  const requestsBeforeRestart = fixture.gatewayRequests.length;
  /* Request the next turn promptly after cancellation; dispatch must follow actual exit. */
  await sendPrompt(page, restartPrompt);
  await expect
    .poll(
      async () => {
        const events = await geometryHostEvents(session!);
        return events.some((event) => event.pid === activePid && event.kind === 'exit');
      },
      { timeout: 15_000 },
    )
    .toBe(true);

  await expect
    .poll(() => fixture!.gatewayRequests.length, { timeout: 600_000 })
    .toBeGreaterThanOrEqual(requestsBeforeRestart + 4);
  await expectQuickResult(session, rootA, restartPrompt);
  await expect
    .poll(
      async () => {
        const events = await geometryHostEvents(session!);
        return events.filter((event) => event.kind === 'spawn').length;
      },
      { timeout: 120_000 },
    )
    .toBeGreaterThanOrEqual(2);
  const lifecycle = await geometryHostEvents(session);
  const firstExit = lifecycle.findIndex((event) => event.kind === 'exit' && event.pid === activePid);
  const replacementSpawn = lifecycle.findIndex((event) => event.kind === 'spawn' && event.pid !== activePid);
  expect(firstExit).toBeGreaterThanOrEqual(0);
  expect(replacementSpawn).toBeGreaterThan(firstExit);
  const replacementPid = lifecycle[replacementSpawn]!.pid;
  expect(
    lifecycle
      .slice(replacementSpawn + 1)
      .some((event) => event.pid === replacementPid && event.kind === 'event' && event.eventType === 'file-progress'),
  ).toBe(true);
  expect(
    lifecycle.slice(replacementSpawn + 1).some((event) => event.pid === replacementPid && event.kind === 'result'),
  ).toBe(true);

  /* The packaged geometry utility path serves B and then A through distinct rooted turns. */
  const runsBeforeB = lifecycle.filter((event) => event.kind === 'run').length;
  await page
    .getByRole('button', { name: /Search/u })
    .first()
    .click();
  await page.getByPlaceholder('Search projects, chats, and actions…').fill('New project (from chat)');
  await page.getByText('New project (from chat)', { exact: true }).first().click();
  await selectChatModel(page, gatewayFixtureModelName);
  const slugB = await submitPrompt(page, secondProjectPrompt);
  await expectVisible(page.getByText(gatewayFixtureFinalText, { exact: true }), 600_000);
  const rootB = join(session.pickedDirectory, slugB);
  await expectQuickResult(session, rootB, secondProjectPrompt);
  await expect
    .poll(
      async () => {
        const events = await geometryHostEvents(session!);
        return events.filter((event) => event.kind === 'run').length;
      },
      { timeout: 120_000 },
    )
    .toBeGreaterThan(runsBeforeB);
  const afterB = await geometryHostEvents(session);
  const runB = afterB.findLastIndex((event) => event.kind === 'run');
  await expectProjectRun(afterB[runB], rootB);
  await expectNativeQuick(session, runB);

  await page.goto(firstProjectUrl, { waitUntil: 'domcontentloaded' });
  await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
  const runsBeforeReturn = afterB.filter((event) => event.kind === 'run').length;
  const requestsBeforeReturn = fixture.gatewayRequests.length;
  await sendPrompt(page, returnPrompt);
  await expect
    .poll(() => fixture!.gatewayRequests.length, { timeout: 600_000 })
    .toBeGreaterThanOrEqual(requestsBeforeReturn + 4);
  await expect
    .poll(
      async () => {
        const events = await geometryHostEvents(session!);
        return events.filter((event) => event.kind === 'run').length;
      },
      { timeout: 120_000 },
    )
    .toBeGreaterThan(runsBeforeReturn);
  const afterReturn = await geometryHostEvents(session);
  const returnRun = afterReturn.findLastIndex((event) => event.kind === 'run');
  expect(returnRun).toBeGreaterThan(runB);
  await expectProjectRun(afterReturn[returnRun], rootA);
  await expectNativeQuick(session, returnRun);
  await expectQuickResult(session, rootA, returnPrompt);
});
