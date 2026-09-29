import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { afterEach, expect, test } from 'vitest';

import { authenticatePackagedDesktop, launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import {
  geometryHostEvents,
  observeGeometryHost,
  probeServicesHost,
  restoreGeometryHost,
} from '#support/geometry-host-observation.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';

const smallFixture = new URL(
  '../../../packages/geospec-engine-native/native/occt/rust/tests/fixtures/two-cube-assembly.step',
  import.meta.url,
);
type NativeReply = {
  readonly id: number;
  readonly result: {
    readonly status: string;
    readonly fact?: {
      readonly source: string;
      readonly assurance: string;
      readonly unit: string;
      readonly coordinateSystem: string;
      readonly algorithmProfile: string;
      readonly distance: number;
      readonly points: ReadonlyArray<readonly number[]>;
    };
  };
};

let session: DesktopSession | undefined;
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
  if (seededEmail) {
    await deleteTauTestUser(seededEmail);
    seededEmail = undefined;
  }
});

/** Send the product measurement frame through the packaged preload and main broker. */
const startExact = async (
  active: DesktopSession,
  input: {
    id: number;
    bytes: Uint8Array<ArrayBuffer>;
    names: readonly [string, string];
  },
): Promise<void> => {
  await active.page.evaluate(
    async ({ id: requestId, encoded, names: occurrenceNames, relayId }) => {
      const scope = globalThis as typeof globalThis & {
        tau: { relayTag: string; requestServicesPort(requestId: string, concern: string): void };
        tauExactProbe?: { port: MessagePort; reply?: NativeReply };
      };
      const { tau: shell } = scope;
      const port = await new Promise<MessagePort>((resolve, reject) => {
        const timer = setTimeout(() => {
          globalThis.removeEventListener('message', onRelay);
          reject(new Error('The packaged exact-measurement port was not relayed.'));
        }, 10_000);
        const onRelay = (event: MessageEvent): void => {
          if (
            event.source !== globalThis.window ||
            event.data?.taucadRelay !== shell.relayTag ||
            event.data?.requestId !== relayId
          ) {
            return;
          }
          clearTimeout(timer);
          globalThis.removeEventListener('message', onRelay);
          const connected = event.ports[0];
          if (connected) {
            resolve(connected);
          } else {
            reject(new Error(`The packaged exact-measurement port was refused: ${String(event.data?.error)}`));
          }
        };
        globalThis.addEventListener('message', onRelay);
        shell.requestServicesPort(relayId, 'exactMeasurement');
      });
      const binary = globalThis.atob(encoded);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) {
        bytes[index] = binary.codePointAt(index)!;
      }
      const probe: { port: MessagePort; reply?: NativeReply } = { port };
      scope.tauExactProbe = probe;
      port.addEventListener('message', (event: MessageEvent<NativeReply>) => {
        probe.reply = event.data;
        port.close();
      });
      port.start();
      port.postMessage({
        id: requestId,
        source: { format: 'ap242', bytes, coordinateSystem: 'y-up' },
        occurrences: [{ name: occurrenceNames[0] }, { name: occurrenceNames[1] }],
      });
    },
    { id: input.id, encoded: Buffer.from(input.bytes).toString('base64'), names: input.names, relayId: randomUUID() },
  );
};

const waitForReply = async (active: DesktopSession): Promise<NativeReply> => {
  let reply: NativeReply | undefined;
  await expect
    .poll(
      async () => {
        reply = await active.page.evaluate(() => {
          const scope = globalThis as typeof globalThis & { tauExactProbe?: { reply?: NativeReply } };
          return scope.tauExactProbe?.reply;
        });
        return reply;
      },
      { timeout: 120_000 },
    )
    .toBeDefined();
  return reply!;
};

const expectTwoCubeFact = (reply: NativeReply, id: number): void => {
  expect(reply.id).toBe(id);
  expect(reply.result).toMatchObject({
    status: 'complete',
    fact: {
      source: 'ap242',
      assurance: 'exact-brep',
      unit: 'mm',
      coordinateSystem: 'z-up',
      algorithmProfile: 'geospec-minimum-distance-v1',
      distance: 20,
    },
  });
  const points = reply.result.fact?.points;
  expect(points).toHaveLength(2);
  expect(points?.[0]?.[0]).toBeCloseTo(5, 6);
  expect(points?.[1]?.[0]).toBeCloseTo(25, 6);
  expect(Math.hypot(...points![0]!.map((value, index) => value - points![1]![index]!))).toBeCloseTo(20, 6);
};

test('[completed-artifact] packaged exact AP242 host first use, held-boundary cancellation and recovery', async () => {
  const small = new Uint8Array(await readFile(smallFixture));
  const account = tauTestAccount('measurement-exact');
  seededEmail = account.email;
  const token = await seedTauTestUser(account);
  session = await launchDesktopApp({ packaged: true, token });
  await observeGeometryHost(session, { holdSecondMinimumDistance: true });
  await authenticatePackagedDesktop(session, token);

  await startExact(session, { id: 1, bytes: small, names: ['cubeA', 'cubeB'] });
  expectTwoCubeFact(await waitForReply(session), 1);
  const firstEvents = await geometryHostEvents(session);
  expect(firstEvents.some((event) => event.kind === 'spawn')).toBe(true);
  expect(firstEvents.some((event) => event.kind === 'native-entry' && event.capability === 'minimumDistance')).toBe(
    true,
  );
  expect(await probeServicesHost(session)).toBeLessThan(10_000);

  const runsBefore = firstEvents.filter((event) => event.kind === 'run').length;
  await startExact(session, { id: 2, bytes: small, names: ['cubeA', 'cubeB'] });
  let activePid: number | undefined;
  let heldRunIndex = -1;
  await expect
    .poll(
      async () => {
        const events = await geometryHostEvents(session!);
        const runs = events.filter((event) => event.kind === 'run');
        heldRunIndex = events.findLastIndex((event) => event.kind === 'run');
        activePid = runs.at(-1)?.pid;
        return (
          runs.length > runsBefore &&
          events
            .slice(heldRunIndex + 1)
            .some(
              (event) =>
                event.pid === activePid &&
                event.kind === 'native-entry' &&
                event.capability === 'minimumDistance' &&
                event.held === true,
            )
        );
      },
      { timeout: 120_000 },
    )
    .toBe(true);
  expect(activePid).toBeTypeOf('number');
  await session.page.evaluate(() => {
    const scope = globalThis as typeof globalThis & { tauExactProbe?: { port: MessagePort } };
    scope.tauExactProbe?.port.close();
  });
  await expect
    .poll(
      async () => {
        const events = await geometryHostEvents(session!);
        return events.slice(heldRunIndex + 1).some((event) => event.pid === activePid && event.kind === 'exit');
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  const afterExit = await geometryHostEvents(session);
  const exitIndex = afterExit.findIndex(
    (event, index) => index > heldRunIndex && event.kind === 'exit' && event.pid === activePid,
  );
  expect(exitIndex).toBeGreaterThan(heldRunIndex);
  const heldQueryEvents = afterExit.slice(heldRunIndex + 1, exitIndex + 1).filter((event) => event.pid === activePid);
  expect(heldQueryEvents.some((event) => event.kind === 'cancel')).toBe(true);
  expect(heldQueryEvents.some((event) => event.kind === 'native-return' || event.kind === 'result')).toBe(false);
  const cancelledReply = await session.page.evaluate(() => {
    const scope = globalThis as typeof globalThis & { tauExactProbe?: { reply?: NativeReply } };
    return scope.tauExactProbe?.reply;
  });
  expect(cancelledReply).toBeUndefined();

  await startExact(session, { id: 3, bytes: small, names: ['cubeA', 'cubeB'] });
  expectTwoCubeFact(await waitForReply(session), 3);
  const recovered = await geometryHostEvents(session);
  expect(
    recovered.findIndex((event, index) => index > exitIndex && event.kind === 'spawn' && event.pid !== activePid),
  ).toBeGreaterThan(exitIndex);
});
