/**
 * Kill-test child for the native compute store (U14).
 *
 * Commits fixed-size batches in a loop and announces each committed round, so
 * the parent can SIGKILL it at an arbitrary point and then assert that the
 * reopened store shows whole batches only — never a partial one, and never a
 * hit on partial bytes.
 *
 * Run by `sqlite-compute-engine.kill.test.ts`; not a test file itself.
 */

/* oxlint-disable no-await-in-loop, unicorn/no-await-expression-member -- the kill sequence is inherently ordered: each child runs, is killed and has its store verified before the next kill point is tried. */

import { digestAction, digestContent } from '@taucad/cache-core';
import type { ComputeAction } from '@taucad/cache-core';
import { createSqliteComputeEngine } from '#cache/sqlite-compute-engine.js';
import type { ComputeStoreEntry } from '#types/runtime-compute.types.js';

/** The parent rebuilds these identities independently, so they must be deterministic. */
export const killTestAction = (round: number, index: number): ComputeAction => ({
  schemaVersion: 1,
  namespace: 'kill-test',
  producer: { id: 'kill-test', version: '1.0.0', implementationAssets: [] },
  operation: `round-${round}-entry-${index}`,
  inputs: [],
  arguments: { round, index },
  environment: { platform: 'test' },
  codec: { id: 'raw', version: '1' },
});

/** Deterministic payload bytes for one identity. */
export const killTestBytes = (round: number, index: number, size: number): Uint8Array<ArrayBuffer> => {
  const bytes = new Uint8Array(size);
  for (let position = 0; position < size; position += 1) {
    bytes[position] = (round * 31 + index * 17 + position) % 256;
  }
  return bytes;
};

export const killTestEntry = async (round: number, index: number, size: number): Promise<ComputeStoreEntry> => {
  const action = killTestAction(round, index);
  const bytes = killTestBytes(round, index, size);
  return {
    action,
    actionDigest: await digestAction({ action }),
    contentDigest: await digestContent({ bytes }),
    mediaType: 'application/octet-stream',
    bytes,
    determinism: 'byte-exact',
  };
};

/** Only the spawned child runs the loop; the test imports the helpers above. */
if (process.argv[1]?.endsWith('sqlite-kill-child.fixture.ts') === true) {
  const [directory = '', roundsArgument = '12', batchArgument = '16', payloadArgument = '65536'] =
    process.argv.slice(2);
  const store = createSqliteComputeEngine({ directory });
  const session = await store.engine.open({ workspace: 'kill-test' });
  if (roundsArgument === 'metadata-put') {
    const entry = await killTestEntry(99, 0, 32);
    process.stdout.write(
      `${JSON.stringify(await session.put({ entries: [entry], generation: session.generation, durability: 'disposable' }))}\n`,
    );
  } else if (roundsArgument === 'metadata-clear') {
    process.stdout.write(`${JSON.stringify(await (await store.control({ workspace: 'kill-test' })).clear({}))}\n`);
  } else {
    process.stdout.write('READY\n');

    for (let round = 0; round < Number(roundsArgument); round += 1) {
      const entries = await Promise.all(
        Array.from({ length: Number(batchArgument) }, async (_unused, index) =>
          killTestEntry(round, index, Number(payloadArgument)),
        ),
      );
      const put = await session.put({ entries, generation: session.generation, durability: 'disposable' });
      if (put.status !== 'committed') {
        process.stdout.write(`REFUSED ${round} ${put.status}\n`);
        break;
      }
      process.stdout.write(`COMMITTED ${round}\n`);
    }
    process.stdout.write('DONE\n');
  }

  await session.close();
  await store.dispose();
}
