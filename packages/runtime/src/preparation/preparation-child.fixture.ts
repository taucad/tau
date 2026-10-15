/**
 * Child process of the preparation kill and contention tests (W2 kill-at-phase, spike S27).
 *
 * `prepare <store> <hostPath> <mirror> [freezePhase]` prepares the fixture plugin through a digest-addressed HTTP
 * mirror with no fallback and prints one `PHASE <phase> <payload>` line per phase change. With `freezePhase`, the
 * process blocks synchronously the first time it enters that phase, so the parent can SIGKILL it in exactly that
 * state. `gc <store> <hostPath>` collects garbage and prints the report. Every result is one `RESULT <json>` line.
 *
 * Run by `preparation-host.kill.test.ts`; not a test file itself.
 */
import { writeSync } from 'node:fs';

import { createPreparationHost } from '#preparation/preparation-host.js';
import type { PreparationPlugin } from '#preparation/preparation-host.types.js';
import type { DependencyPayload } from '#preparation/preparation.types.js';

import {
  linuxHost,
  linuxTarget,
  payloadOf,
  pluginOf,
  pythonPayloadBytes,
  pythonPayloads,
} from '#preparation/preparation.fixture.js';

/** The package the fixture plugin declares. */
export const childPackage = '@taucad/kill-test';

const largeByteLength = 1024 * 1024;

/**
 * Payload bytes of the fixture plugin: the three-payload Python closure and a 1 MiB raw file, so a throttled mirror
 * keeps two racing processes inside the download phase together.
 * @returns Payload name to bytes, deterministic across processes.
 */
export const childPayloadBytes = (): Readonly<Record<string, Uint8Array<ArrayBuffer>>> => {
  const large = new Uint8Array(largeByteLength);
  for (let index = 0; index < large.length; index += 1) {
    large[index] = (index * 31 + 7) % 251;
  }
  return { ...pythonPayloadBytes(), 'large.bin': large };
};

/**
 * The fixture plugin; the parent builds the same one to inspect and repair the store.
 * @returns The plugin and its payloads.
 */
export const childPlugin = (): {
  readonly plugin: PreparationPlugin;
  readonly payloads: readonly DependencyPayload[];
} => {
  const bytes = childPayloadBytes();
  const payloads: [DependencyPayload, ...DependencyPayload[]] = [
    ...pythonPayloads(pythonPayloadBytes()),
    payloadOf({ name: 'large.bin', bytes: bytes['large.bin']!, format: 'raw', destination: 'data' }),
  ];
  return { plugin: pluginOf(childPackage, { engine: [{ target: linuxTarget, payloads }] }), payloads };
};

// Synchronous, so a line is out before a freeze or a kill, on pipes that Node would otherwise write asynchronously.
const line = (text: string): void => {
  writeSync(1, `${text}\n`);
};

const freeze = (): never => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
  throw new Error('unreachable');
};

if (process.argv[1]?.endsWith('preparation-child.fixture.ts') === true) {
  const [command = '', store = '', hostPath = '', mirror = '', freezePhase] = process.argv.slice(2);
  const host = createPreparationHost({
    plugins: [childPlugin().plugin],
    store,
    hostPath,
    indicators: linuxHost,
    tauVersion: '1.0.0',
    ...(mirror === '' ? {} : { mirror: { baseUrl: mirror, noFallback: true } }),
  });
  if (command === 'gc') {
    line(`RESULT ${JSON.stringify(await host.collectGarbage())}`);
  } else {
    let phase: string | undefined;
    host.on('preparation', ({ state }) => {
      if (state.status !== 'preparing' || state.phase === phase) {
        return;
      }
      ({ phase } = state);
      line(`PHASE ${state.phase} ${state.payload}`);
      if (state.phase === freezePhase) {
        line(`FROZEN ${state.phase}`);
        freeze();
      }
    });
    const outcome = await host.prepare({ package: childPackage, signal: AbortSignal.timeout(120_000) });
    line(
      `RESULT ${JSON.stringify(outcome.status === 'ready' ? { status: 'ready', closureIntegrity: outcome.receipts['engine']?.closureIntegrity, treeIntegrity: outcome.receipts['engine']?.treeIntegrity } : outcome)}`,
    );
  }
  host.dispose();
}
