import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { afterEach, expect, test } from 'vitest';
import { testModelOutputSchema } from '@taucad/chat/schemas/tools/test-model';

import { authenticatePackagedDesktop, launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import {
  gatewayFixtureFinalText,
  gatewayFixtureModelName,
  gatewayToolResults,
  startGatewayFixture,
} from '#support/gateway-fixture.js';
import type { GatewayFixture, GatewayFixtureToolCall } from '#support/gateway-fixture.js';
import {
  geometryHostEvents,
  observeGeometryHost,
  probeServicesHost,
  restoreGeometryHost,
  writeNativeEntryPreload,
} from '#support/geometry-host-observation.js';
import type { GeometryHostEvent } from '#support/geometry-host-observation.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import {
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
const quickSpec = `import { it, expectNativeGeo } from 'geospec';
import { loadNativeModel } from 'geospec/runner/native';
it('checks the product Runtime mesh', async () => {
  const model = await loadNativeModel({ file: 'main.ts', format: 'glb' });
  await expectNativeGeo(model).toBeWatertight();
});
`;
const slowSpec = `import { it, expectNativeGeo } from 'geospec';
import { loadNativeModel } from 'geospec/runner/native';
it('enters the synchronous AP242 claim', async () => {
  const model = await loadNativeModel({ source: 'gearbox.step', format: 'step' });
  await expectNativeGeo(model).toHaveConnectedComponents({ count: 5, toleranceMm: 0.001 });
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
  const checkoutRoot = join(dirname(projectRoot), '.tau', 'checkouts', manifest.id);
  const within = (parent: string): boolean => {
    const child = relative(parent, resolve(run!.root!));
    return child === '' || (child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child));
  };
  expect(within(projectRoot) || within(checkoutRoot), `unowned geometry root ${String(run?.root)}`).toBe(true);
};

/** A completed quick claim reached and returned from the real native addon. */
const expectNativeQuick = async (desktop: DesktopSession, runIndex: number): Promise<void> => {
  await expect
    .poll(
      async () => {
        const events = await geometryHostEvents(desktop);
        const run = events[runIndex];
        return events
          .slice(runIndex + 1)
          .some(
            (event) => event.pid === run?.pid && event.kind === 'native-entry' && event.capability === 'toBeWatertight',
          );
      },
      { timeout: 90_000 },
    )
    .toBe(true);
  await expect
    .poll(
      async () => {
        const events = await geometryHostEvents(desktop);
        const run = events[runIndex];
        return events.slice(runIndex + 1).some((event) => event.pid === run?.pid && event.kind === 'native-return');
      },
      { timeout: 90_000 },
    )
    .toBe(true);
};

/** Only tool results following this exact user turn, never prior/cancelled transcript history. */
const resultsForPrompt = (gateway: GatewayFixture, prompt: string) => {
  const request = gateway.gatewayRequests.at(-1) as
    | {
        readonly messages?: ReadonlyArray<{ readonly role?: string; readonly content?: unknown }>;
      }
    | undefined;
  const messages = request?.messages ?? [];
  const promptIndex = messages.findLastIndex(
    (message) => message.role === 'user' && String(JSON.stringify(message.content)).includes(prompt),
  );
  expect(promptIndex).toBeGreaterThanOrEqual(0);
  return gatewayToolResults([{ messages: messages.slice(promptIndex) }]);
};

/** A specific turn completed the quick native GeoSpec assertion, not merely tool dispatch. */
const expectQuickResult = (gateway: GatewayFixture, prompt: string): void => {
  const toolResults = resultsForPrompt(gateway, prompt);
  expect(toolResults).toHaveLength(3);
  expect(toolResults.map((result) => result.name)).toEqual(['create_file', 'create_file', 'test_model']);
  expect(toolResults.some((result) => result.isError)).toBe(false);
  const outputs = toolResults.flatMap(({ text }) => {
    const parsed = testModelOutputSchema.safeParse(JSON.parse(text));
    return parsed.success ? [parsed.data] : [];
  });
  expect(outputs).toHaveLength(1);
  expect(outputs[0]).toMatchObject({ passed: 1, total: 1 });
  expect(outputs[0]?.passes.map((row) => row.requirement)).toEqual(['checks the product Runtime mesh']);
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

test('[native-geospec] the test-only preload observes the real addon without changing its call', async () => {
  const preload = await writeNativeEntryPreload();
  try {
    const addon = fileURLToPath(
      new URL(
        '../../../packages/geospec-engine-native/bindings/node/generated/geospec-engine-native.darwin-arm64.node',
        import.meta.url,
      ),
    );
    const child = spawnSync(
      process.execPath,
      [
        '--require',
        preload,
        '-e',
        `
      process.parentPort = { postMessage: (frame) => process.stdout.write(JSON.stringify(frame) + '\\n') };
      const { Engine } = require(process.argv[1]);
      const engine = new Engine();
      try {
        engine.evaluateClaim(Buffer.from(JSON.stringify({
          method: 'submitClaims', plan: { claims: [{
            capability: 'toHaveConnectedComponents',
            payload: { arguments: [{ count: 5, toleranceMm: 0.001 }] },
          }] },
        })));
      } catch { /* This intentionally incomplete request must reject before geometry. */ }
      finally { engine.close(); }
    `,
        addon,
      ],
      { encoding: 'utf8', timeout: 10_000 },
    );
    expect(child.status, child.stderr).toBe(0);
    const frames = child.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(frames).toEqual([
      { type: 'tau-e2e-native-entry', capability: 'toHaveConnectedComponents', count: 5, toleranceMm: 0.001 },
      { type: 'tau-e2e-native-return' },
    ]);
  } finally {
    await unlink(preload);
  }
});

/** Actual packaged-product gate; the test-only preload marks the native call boundary. */
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
    localStorage.setItem('tau:flags', JSON.stringify({ nativeGeoSpec: true }));
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
  const initialTools = gatewayToolResults(fixture.gatewayRequests.slice(-1));
  expect(initialTools).toHaveLength(3);
  expect(initialTools.some((result) => result.isError)).toBe(false);
  const rootA = join(session.pickedDirectory, slug);
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
  await expectProjectRun(beforeProbe[slowRunIndex], rootA);

  /* The test-only preload emits immediately before the real synchronous addon call. */
  await expect
    .poll(
      async () => {
        const events = await geometryHostEvents(session!);
        return events
          .slice(slowRunIndex + 1)
          .some(
            (event) =>
              event.pid === activePid &&
              event.kind === 'native-entry' &&
              event.capability === 'toHaveConnectedComponents' &&
              event.count === 5 &&
              event.toleranceMm === 0.001,
          );
      },
      { timeout: 90_000 },
    )
    .toBe(true);

  /* This is an independent services-utility answer, not a main-process heartbeat. */
  const mainStarted = Date.now();
  expect(await session.application.evaluate(() => Date.now())).toBeGreaterThan(0);
  expect(Date.now() - mainStarted).toBeLessThan(10_000);
  expect(await probeServicesHost(session)).toBeLessThan(10_000);
  const duringProbe = await geometryHostEvents(session);
  expect(
    duringProbe
      .slice(slowRunIndex + 1)
      .some(
        (event) =>
          event.pid === activePid &&
          (event.kind === 'native-return' || event.kind === 'result' || event.kind === 'exit'),
      ),
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
  expectQuickResult(fixture, restartPrompt);
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
  const replacementRun = lifecycle.findIndex((event, index) => index > replacementSpawn && event.kind === 'run');
  expect(replacementRun).toBeGreaterThan(replacementSpawn);
  await expectProjectRun(lifecycle[replacementRun], rootA);
  await expectNativeQuick(session, replacementRun);

  /* The packaged geometry utility path serves B and then A through distinct rooted turns. */
  await page
    .getByRole('button', { name: /Search/u })
    .first()
    .click();
  await page.getByPlaceholder('Search projects, chats, and actions…').fill('New project (from chat)');
  await page.getByText('New project (from chat)', { exact: true }).first().click();
  await selectChatModel(page, gatewayFixtureModelName);
  const slugB = await submitPrompt(page, secondProjectPrompt);
  await expectVisible(page.getByText(gatewayFixtureFinalText, { exact: true }), 600_000);
  expectQuickResult(fixture, secondProjectPrompt);
  const rootB = join(session.pickedDirectory, slugB);
  await expect
    .poll(
      async () => {
        const events = await geometryHostEvents(session!);
        return events.filter((event) => event.kind === 'run').length;
      },
      { timeout: 120_000 },
    )
    .toBeGreaterThanOrEqual(4);
  const afterB = await geometryHostEvents(session);
  const runB = afterB.findLastIndex((event) => event.kind === 'run');
  await expectProjectRun(afterB[runB], rootB);
  await expectNativeQuick(session, runB);

  await page.goto(firstProjectUrl, { waitUntil: 'domcontentloaded' });
  await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
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
    .toBeGreaterThanOrEqual(5);
  const afterReturn = await geometryHostEvents(session);
  const returnRun = afterReturn.findLastIndex((event) => event.kind === 'run');
  expect(returnRun).toBeGreaterThan(runB);
  await expectProjectRun(afterReturn[returnRun], rootA);
  await expectNativeQuick(session, returnRun);
  expectQuickResult(fixture, returnPrompt);
});
