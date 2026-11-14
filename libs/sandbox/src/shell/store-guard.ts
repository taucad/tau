/**
 * The Linux store guard's launch shape and start check (Linux Terminal git parity blueprint, R2 and R3; LP3).
 *
 * A Terminal launch with guarded stores starts inside an outer bubblewrap that holds `CAP_SYS_ADMIN` in its own user
 * namespace only. There `tau-store-guard launch` mounts one FUSE guard over each store, binds the bulk directories
 * past it, drops every capability and execs the sandbox runtime's own bubblewrap command, unchanged. The guard runs
 * outside the sandbox's process namespace, so the shell can neither see nor signal it, and it ends with the outer
 * bubblewrap, which `--die-with-parent` binds to this process.
 */
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ShellGuardedStores } from '#shell/shell-provider.js';

/**
 * The store's bulk directories, bound from the real store over the guard (blueprint OD6). No policy name lives under
 * them, so git's object, ref and log traffic stays native; a bind that is ever detached falls back to the guard, which
 * is slower, never open.
 */
export const storeGuardBypass: readonly string[] = ['objects', 'refs', 'logs', 'lfs'];

const quote = (value: string): string => `'${value.replaceAll("'", String.raw`'\''`)}'`;

/**
 * The outer bubblewrap's arguments: a private user, mount and process namespace keeping `CAP_SYS_ADMIN` inside it,
 * the host's own filesystem and devices, and death with its parent. Its own `/proc` matches its process namespace: the
 * nested bubblewrap finds its child by the number this namespace gives it, and under the host's `/proc` that number
 * names some other process.
 */
const outerArguments = (bwrapPath: string): readonly string[] => [
  bwrapPath,
  '--unshare-user',
  '--unshare-pid',
  '--die-with-parent',
  '--cap-add',
  'CAP_SYS_ADMIN',
  '--dev-bind',
  '/',
  '/',
  '--proc',
  '/proc',
  '--',
];

/**
 * The guard launcher's arguments for one launch: the policy, each store and the bypassed directories.
 *
 * @param guardPath - The `tau-store-guard` executable.
 * @param guarded - The stores and the policy names.
 * @returns The arguments up to and including the `--` before the launched command.
 */
const launcherArguments = (guardPath: string, guarded: ShellGuardedStores): readonly string[] => [
  guardPath,
  'launch',
  ...guarded.protect.flatMap((name) => ['--protect', name]),
  ...guarded.stores.flatMap((store) => ['--store', store]),
  ...storeGuardBypass.flatMap((name) => ['--bypass', name]),
  '--',
];

/**
 * The wrapped shell text for a guarded launch: the outer bubblewrap and the guard launcher, then `/bin/sh -c` running
 * the runtime's own command text. `command` is the text the supervisor's vector runs (`exec <bwrap> …`), so the chain
 * stays one of `exec`s and the runtime's bubblewrap is the launcher's own process.
 *
 * @internal
 * @param input - The guard and bubblewrap paths, the guarded stores and the runtime's command text.
 * @returns Shell text for `sh -c`.
 */
export const storeGuardCommand = (
  input: Readonly<{ guardPath: string; bwrapPath: string; guarded: ShellGuardedStores; command: string }>,
): string =>
  [
    'exec',
    ...[...outerArguments(input.bwrapPath), ...launcherArguments(input.guardPath, input.guarded)].map((part) =>
      quote(part),
    ),
    '/bin/sh',
    '-c',
    quote(input.command),
  ].join(' ');

/** The answer of one start check, with why it failed, for the host log. */
export type StoreGuardProbe = Readonly<{ available: true }> | Readonly<{ available: false; reason: string }>;

/**
 * Whether the guard can start on this host (blueprint R3, OD2): the binary is executable, `/dev/fuse` is usable, and
 * the full shape works once. The outer bubblewrap mounts a guard over a scratch store, and inside a nested bubblewrap,
 * shaped like the runtime's, `tau-store-guard check` writes an ordinary name and is refused the protected one.
 *
 * @internal
 * @param input - The guard and bubblewrap paths and how long the check may take.
 * @returns Available, or the reason it is not.
 */
export const probeStoreGuard = async (
  input: Readonly<{ guardPath: string; bwrapPath: string; timeoutMilliseconds?: number }>,
): Promise<StoreGuardProbe> => {
  if (process.platform !== 'linux') {
    return { available: false, reason: `${process.platform} has no store guard` };
  }
  try {
    await access(input.guardPath, constants.X_OK);
  } catch {
    return { available: false, reason: `${input.guardPath} is not an executable file` };
  }
  try {
    // oxlint-disable-next-line no-bitwise -- POSIX access mode bits.
    await access('/dev/fuse', constants.R_OK | constants.W_OK);
  } catch {
    return { available: false, reason: '/dev/fuse is absent or not readable and writable by this user' };
  }
  const scratch = await mkdtemp(join(tmpdir(), 'tau-store-guard-check-'));
  try {
    const store = join(scratch, 'project', '.git');
    await mkdir(store, { recursive: true });
    await writeFile(join(store, 'config'), '[core]\n');
    const vector = [
      ...outerArguments(input.bwrapPath),
      ...launcherArguments(input.guardPath, { stores: [store], protect: ['config'] }),
      input.bwrapPath,
      '--unshare-user',
      '--unshare-pid',
      '--unshare-net',
      '--die-with-parent',
      '--dev-bind',
      '/',
      '/',
      '--proc',
      '/proc',
      '--',
      input.guardPath,
      'check',
      store,
      'config',
    ];
    const [executable, ...rest] = vector;
    const result = await new Promise<Readonly<{ code: number | undefined; output: string }>>((resolve) => {
      const child = spawn(executable!, rest, {
        cwd: scratch,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables keep their wire names.
        env: { PATH: '/usr/bin:/bin' },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: input.timeoutMilliseconds ?? 15_000,
        killSignal: 'SIGKILL',
      });
      let output = '';
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
        output += chunk;
      });
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
        output += chunk;
      });
      child.once('error', (error) => {
        resolve({ code: undefined, output: error.message });
      });
      child.once('close', (code) => {
        resolve({ code: code ?? undefined, output });
      });
    });
    if (result.code === 0 && result.output.split('\n').includes('ok')) {
      return { available: true };
    }
    return {
      available: false,
      reason: `the store guard did not start (exit ${String(result.code)}): ${result.output.trim().slice(-512)}`,
    };
  } finally {
    await rm(scratch, { recursive: true, force: true }).catch(() => undefined);
  }
};
