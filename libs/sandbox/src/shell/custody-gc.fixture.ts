/**
 * A provider that took custody of one prepared execution and is then dropped by its owner, closed first or not
 * (`argv[3]`), after which every unreachable object is collected. Node 26 makes a FileHandle that garbage collection
 * closes an uncaught `ERR_INVALID_STATE`, so this process exits nonzero when the provider left its lock to the collector.
 * Run with `--expose-gc`; `argv[2]` is an empty working folder.
 */
import { mkdir, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';

import { createSandboxShellProvider } from '#shell/srt-shell-provider.js';

const base = process.argv[2] ?? '';
const mode = process.argv[3] ?? '';
const sessions = join(base, 'sessions');
await mkdir(sessions, { recursive: true });
let provider: ReturnType<typeof createSandboxShellProvider> | undefined = createSandboxShellProvider({
  custody: { directory: join(base, 'records'), sessionDirectory: sessions },
});
const privateRoot = await mkdtemp(join(sessions, 'tau-shell-'));
const prepared = await provider.prepare({ privateRoot, resource: undefined });
process.stdout.write(`${prepared.executionId}\n`);
if (mode === 'close') {
  await provider.close?.();
}
provider = undefined;
for (let round = 0; round < 5; round++) {
  globalThis.gc?.();
  // oxlint-disable-next-line no-await-in-loop -- each round lets the collector's cleanup callbacks run.
  await sleep(50);
}
