/**
 * The credential-free supervisor that owns one shell launch's sandbox (blueprint D6, F3, D26).
 *
 * The SRT shell provider starts one of these per launch with an allowlisted environment. It reads one
 * {@link SupervisorJob} as a JSON line on stdin, initializes the pinned sandbox runtime once with that immutable
 * profile, and answers one {@link SupervisorReply} line on stdout: the wrapped spawn vector, or why the sandbox is
 * unavailable. It then holds the runtime, and with it this launch's own network proxy and that proxy's per-process
 * credential, until its stdin closes; then it cleans up and exits. It never spawns the shell itself, so the shell
 * never inherits this control channel. If the channel closes while it owns the launch's process group and before the
 * provider released it, the host died: the supervisor terminates the retained descendant tree first (E11).
 *
 * Nothing runs unsandboxed: a missing prerequisite, a seccomp helper the runtime would only warn about, or a vector
 * that does not start the platform's sandbox is answered as `unavailable`.
 */
import { accessSync, constants } from 'node:fs';
import { createInterface } from 'node:readline';

import { SandboxManager } from '@anthropic-ai/sandbox-runtime';

import { terminateOwnedProcesses, trackDescendants } from '#shell/process-tree.js';
import { startGuardProxy } from '#shell/srt-guard-proxy.js';
import type { GuardProxy } from '#shell/srt-guard-proxy.js';

/** @public */
export type SupervisorJob = Readonly<{
  /** The complete sandbox-runtime configuration for this launch. */
  profile: Record<string, unknown>;
  /** The command the runtime runs under `/bin/sh -c` inside the sandbox. */
  command: string;
  workingDirectory: string;
  commandId: string;
  /** Route granted names through the address guard (D26); set whenever the profile allows any domain. */
  guard: boolean;
}>;

/**
 * A later line from the provider (E11): `own` hands over a started launch's process group; `released` says the
 * launch ended in order. A channel that closes with a group owned and never released means the host died, and the
 * supervisor terminates its retained tree before it exits (the macOS A24 residual remains disclosed).
 *
 * @public
 */
export type SupervisorControl = Readonly<{ own: number }> | Readonly<{ released: true }>;

/** @public */
export type SupervisorReply =
  | Readonly<{ status: 'ready'; argv: readonly string[] }>
  | Readonly<{ status: 'unavailable'; message: string }>;

const reply = async (value: SupervisorReply): Promise<void> =>
  new Promise((resolve) => {
    process.stdout.write(`${JSON.stringify(value)}\n`, () => {
      resolve();
    });
  });

const sandboxMarker = (argv: readonly string[], bwrapPath: string): string | undefined => {
  const [, flag, wrapped] = argv;
  if (argv.length !== 3 || flag !== '-c' || wrapped === undefined) {
    return 'the sandbox runtime returned a vector Tau does not recognise.';
  }
  if (process.platform === 'linux' && !wrapped.startsWith(`${bwrapPath} --new-session --die-with-parent `)) {
    return 'the sandbox runtime did not start bwrap.';
  }
  if (process.platform === 'darwin' && !wrapped.includes(" /usr/bin/sandbox-exec -p '(version 1)")) {
    return 'the sandbox runtime did not start sandbox-exec with one profile.';
  }
  return undefined;
};

let guard: GuardProxy | undefined;

const prepare = async (job: SupervisorJob): Promise<SupervisorReply> => {
  if (process.platform !== 'linux' && process.platform !== 'darwin') {
    return { status: 'unavailable', message: `${process.platform} is not served by this supervisor.` };
  }
  if (!SandboxManager.isSupportedPlatform()) {
    return { status: 'unavailable', message: `${process.platform} has no supported sandbox backend.` };
  }
  const profile = job.profile as Parameters<typeof SandboxManager.initialize>[0];
  const { ripgrep } = profile as { ripgrep?: { command: string } };
  const dependencies = await SandboxManager.checkDependenciesAsync(ripgrep);
  /* The runtime only warns when its seccomp helper is missing; without it Unix sockets are open (D26). */
  const fatal = [...dependencies.errors, ...dependencies.warnings.filter((warning) => /seccomp/iu.test(warning))];
  if (fatal.length > 0) {
    return { status: 'unavailable', message: fatal.join('; ') };
  }
  if (profile.seccomp?.applyPath) {
    accessSync(profile.seccomp.applyPath, constants.X_OK);
  }
  if (job.guard) {
    guard = await startGuardProxy();
    (profile.network as Record<string, unknown>)['parentProxy'] = { http: guard.url, https: guard.url };
  }
  await SandboxManager.initialize(profile);
  const { argv } = await SandboxManager.wrapWithSandboxArgv(
    job.command,
    '/bin/sh',
    undefined,
    undefined,
    job.workingDirectory,
    { commandId: job.commandId },
  );
  const problem = sandboxMarker(argv, String((profile as { bwrapPath?: string }).bwrapPath ?? 'bwrap'));
  return problem === undefined ? { status: 'ready', argv } : { status: 'unavailable', message: problem };
};

const lines = createInterface({ input: process.stdin, crlfDelay: Number.POSITIVE_INFINITY });
const iterator = lines[Symbol.asyncIterator]();
const first = await iterator.next();
let initialized = false;
if (first.done !== true) {
  try {
    const answer = await prepare(JSON.parse(first.value) as SupervisorJob);
    initialized = answer.status === 'ready';
    await reply(answer);
  } catch (error) {
    await reply({ status: 'unavailable', message: error instanceof Error ? error.message : String(error) });
  }
}
/* Hold the runtime, and its proxy, until the provider closes the channel: the launch has ended or the host died. */
let owned: number | undefined;
let released = false;
let tracker: ReturnType<typeof trackDescendants> | undefined;
for (;;) {
  // oxlint-disable-next-line no-await-in-loop -- lines are read until the channel closes.
  const next = await iterator.next();
  if (next.done === true) {
    break;
  }
  try {
    const control = JSON.parse(next.value) as Partial<{ own: number; released: boolean }>;
    if (owned === undefined && Number.isInteger(control.own) && control.own! > 1) {
      owned = control.own;
      if (process.platform === 'darwin') {
        tracker = trackDescendants(owned!);
      }
    } else if (control.released === true) {
      released = true;
    }
  } catch {
    /* Not a control line. */
  }
}
if (owned !== undefined && !released) {
  try {
    await terminateOwnedProcesses({
      root: owned,
      group: owned,
      deadlineMilliseconds: 5000,
      ...(tracker === undefined ? {} : { table: tracker.table }),
    });
  } catch {
    /* The tree helper kills every process already frozen; retain the backstop and runtime cleanup on read failure. */
  } finally {
    /* Keep the group backstop even if reading the process table fails during crash cleanup. */
    try {
      process.kill(-owned, 'SIGKILL');
    } catch {
      /* The group is already gone. */
    }
    await tracker?.stop();
  }
}
await tracker?.stop();
if (initialized) {
  SandboxManager.cleanupAfterCommand();
}
await SandboxManager.reset();
await guard?.[Symbol.asyncDispose]();
/* The runtime's Linux network bridges keep referenced children until the process ends. */
// oxlint-disable-next-line unicorn/no-process-exit -- the supervisor is its own process and must end here.
process.exit(0);
