/**
 * The desktop shell over a real sandbox provider that already holds custody (a prepared execution, as a recovered
 * receipt is held) and whose probe fails: the shell drops that provider. Every unreachable object is then collected.
 * Node 26 makes a FileHandle garbage collection closes an uncaught `ERR_INVALID_STATE`, so this process exits nonzero
 * when the dropped provider still held its lock file. Run with `--expose-gc`; `argv[2]` is an empty working folder.
 */
import { mkdir, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';

import { createSandboxShellProvider } from '@taucad/native-process-core/shell';
import type { ShellProvider } from '@taucad/native-process-core/shell';

import { createDesktopShell } from '#services-host-shell.js';

const base = process.argv[2] ?? '';
const sessions = join(base, 'sessions');
const home = join(base, 'home');
await mkdir(sessions, { recursive: true });
await mkdir(home, { recursive: true });
/* Built in a scope of its own, so only the desktop shell ever references the real provider. */
const heldProvider = async (): Promise<ShellProvider> => {
  const real = createSandboxShellProvider({
    custody: { directory: join(base, 'app-data', 'shell-custody'), sessionDirectory: sessions },
  });
  const held = await real.prepare({ privateRoot: await mkdtemp(join(sessions, 'tau-shell-')), resource: undefined });
  process.stdout.write(`${held.executionId}\n`);
  /* The probe's launch fails, as a missing or broken sandbox does. */
  return { ...real, launch: async () => ({ status: 'sandbox-unavailable', message: 'bwrap is missing' }) };
};
let provider: ShellProvider | undefined = await heldProvider();
let shell: ReturnType<typeof createDesktopShell> | undefined = createDesktopShell({
  appDataRoots: [join(base, 'app-data')],
  provider,
  home,
});
const outcome = await shell.probe();
process.stdout.write(`${outcome.status}\n`);
provider = undefined;
shell = undefined;
for (let round = 0; round < 5; round++) {
  globalThis.gc?.();
  // oxlint-disable-next-line no-await-in-loop -- each round lets the collector's cleanup callbacks run.
  await sleep(50);
}
