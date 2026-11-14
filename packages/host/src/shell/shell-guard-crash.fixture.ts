/**
 * The host the E14-guard-lifecycle row kills (Linux Terminal git parity blueprint, LP3; E11's shape): the shell service
 * over the real sandbox provider with the store guard, which opens one Terminal over a project and keeps it open until
 * the process is killed. The row SIGKILLs this process while the guard serves the store and judges, from outside, that
 * no guard, bubblewrap or mount survives it and the store is untouched.
 *
 * Configuration arrives in `TAU_GUARD_CRASH_*` variables set by the row; this process never exits on its own.
 */
import { join } from 'node:path';

import { createSandboxShellProvider } from '@taucad/native-process-core/shell';
import { probeHostShell } from '@taucad/shell-service';

const required = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is required.`);
  }
  return value;
};

const project = required('TAU_GUARD_CRASH_PROJECT');
const appData = required('TAU_GUARD_CRASH_APP_DATA');
const sessions = required('TAU_GUARD_CRASH_SESSIONS');
const home = required('TAU_GUARD_CRASH_HOME');
const probe = await probeHostShell({
  provider: createSandboxShellProvider({
    bwrapPath: required('TAU_GUARD_CRASH_BWRAP'),
    storeGuardPath: required('TAU_GUARD_CRASH_GUARD'),
    home,
    custody: { directory: join(appData, 'shell-custody'), sessionDirectory: sessions },
  }),
  checkouts: new Map(),
  appDataRoots: [appData],
  projectRoots: () => [project],
  home,
  sessionDirectory: sessions,
});
if (probe.status !== 'available') {
  throw new Error(`the probe refused the shell: ${JSON.stringify(probe)}`);
}
const opened = await probe.shell.openTerminal({
  projectRoot: project,
  size: { columns: 120, rows: 40 },
  account: { id: 'user_e14guardcrash', name: 'Guard Crash' },
  signal: new AbortController().signal,
});
if (opened.status !== 'opened') {
  throw new Error(`the Terminal did not open: ${JSON.stringify(opened)}`);
}
process.stdout.write('guard crash fixture opened\n');
for await (const _chunk of opened.session.output) {
  /* Drained so the terminal never blocks, until the row kills this process. */
}
