/**
 * The host the C12 conformance row kills (E11): this process starts one sandboxed launch through the real provider, a
 * command that keeps a background writer beating, prints `started` and then waits to be killed. The row SIGKILLs it and
 * judges from outside that nothing it started survives.
 *
 * Configuration: `TAU_HOST_DEATH_BWRAP`, `TAU_HOST_DEATH_WORK` (the writable folder) and `TAU_HOST_DEATH_MARKER`.
 */
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createSandboxShellProvider } from '#shell/srt-shell-provider.js';

const work = process.env['TAU_HOST_DEATH_WORK'] ?? '';
const marker = process.env['TAU_HOST_DEATH_MARKER'] ?? '';
const provider = createSandboxShellProvider({ bwrapPath: process.env['TAU_HOST_DEATH_BWRAP'] ?? '/usr/bin/bwrap' });
/* Prepared like every launch (I7); the killed host leaves its receipt armed, as a crashed host would. */
const { executionId } = await provider.prepare({
  privateRoot: await mkdtemp(join(tmpdir(), 'tau-shell-')),
  resource: undefined,
});
const outcome = await provider.launch({
  executionId,
  executablePath: '/bin/bash',
  arguments: [
    '--noprofile',
    '--norc',
    '-c',
    `set -m; echo $$ > shell.pid; /bin/bash --noprofile --norc -c 'echo $$ > writer.pid; while :; do date >> beat.txt; sleep 0.1; done # ${marker}' & wait`,
  ],
  workingDirectory: work,
  commandId: 'host-death',
  filesystem: { readable: [], writable: [work], denied: [] },
  network: { domains: [] },
  // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables keep their wire names.
  environment: { PATH: '/usr/bin:/bin', HOME: work, TMPDIR: work, LANG: 'C' },
  stdio: { kind: 'pipes' },
  signal: new AbortController().signal,
});
process.stdout.write(`${outcome.status}\n`);
setInterval(() => undefined, 60_000);
