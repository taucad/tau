// A runtime child under the daemon's permission flags that asks its daemon to re-verify closures (D8, ruling X35).
// argv[2] is the proof file and argv[3] a JSON list of `{ name, runtimePath }`. The proof records, per request, the
// damage the daemon answered (`null` when it answered none), and whether this child could read the closure itself.
import { readdirSync, writeFileSync } from 'node:fs';

const { createRuntimeChildRuntimeVerifier } = await import('../runtime-child-workers.ts');

const [outputPath = '', requests] = process.argv.slice(2);
const verify = createRuntimeChildRuntimeVerifier();

/** Whether this child may read a closure: the daemon's grants refuse the store. */
const ownRead = (/** @type {string} */ path) => {
  try {
    readdirSync(path);
    return 'read';
  } catch (error) {
    return error instanceof Error && 'code' in error ? String(error.code) : String(error);
  }
};

process.on('message', async (/** @type {{ type?: string } | undefined} */ message) => {
  if (message?.type === 'close') {
    process.exit(0);
  }
  if (message?.type !== 'start') {
    return;
  }
  const checks = /** @type {Array<{ name: string; runtimePath: string }>} */ (JSON.parse(requests ?? '[]'));
  /** @type {Record<string, unknown>} */
  const outcomes = {};
  /* Two of the same at once share one verification in the daemon. */
  const answers = await Promise.all(
    checks.map(async ({ runtimePath }) => verify(runtimePath, AbortSignal.timeout(60_000))),
  );
  for (const [index, { name, runtimePath }] of checks.entries()) {
    outcomes[name] = { damage: answers[index] ?? null, ownRead: ownRead(runtimePath) };
  }
  writeFileSync(outputPath, JSON.stringify({ outcomes }));
  process.send?.({ type: 'ready', url: 'ws://127.0.0.1:9', runtimeVersion: 'native-verify' });
});
