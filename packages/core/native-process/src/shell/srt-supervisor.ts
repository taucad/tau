/**
 * The credential-free supervisor that owns one shell launch's sandbox (blueprint D6, F3, D26).
 *
 * The SRT shell provider starts one of these per launch with an allowlisted environment. It reads one
 * {@link SupervisorJob} as a JSON line on stdin, initializes the pinned sandbox runtime once with that immutable
 * profile, and answers one {@link SupervisorReply} line on stdout: the wrapped spawn vector, or why the sandbox is
 * unavailable. It then holds the runtime, and with it this launch's own network proxy and that proxy's per-process
 * credential, until its stdin closes; then it cleans up and exits. It never spawns the shell itself, so the shell
 * never inherits this control channel.
 *
 * Nothing runs unsandboxed: a missing prerequisite, a seccomp helper the runtime would only warn about, or a vector
 * that does not start the platform's sandbox is answered as `unavailable`.
 */
import { createInterface } from 'node:readline';

import { SandboxManager } from '@anthropic-ai/sandbox-runtime';

/** @internal */
export type SupervisorJob = Readonly<{
  /** The complete sandbox-runtime configuration for this launch. */
  profile: Record<string, unknown>;
  /** The command the runtime runs under `/bin/sh -c` inside the sandbox. */
  command: string;
  workingDirectory: string;
  commandId: string;
}>;

/** @internal */
export type SupervisorReply =
  | Readonly<{ status: 'ready'; argv: readonly string[] }>
  | Readonly<{ status: 'unavailable'; message: string }>;

const reply = async (value: SupervisorReply): Promise<void> =>
  new Promise((resolve) => {
    process.stdout.write(`${JSON.stringify(value)}\n`, () => {
      resolve();
    });
  });

const sandboxMarker = (argv: readonly string[]): string | undefined => {
  const [, flag, wrapped] = argv;
  if (argv.length !== 3 || flag !== '-c' || wrapped === undefined) {
    return 'the sandbox runtime returned a vector Tau does not recognise.';
  }
  if (process.platform === 'linux' && !wrapped.startsWith('bwrap ')) {
    return 'the sandbox runtime did not start bwrap.';
  }
  if (process.platform === 'darwin' && !wrapped.includes(" /usr/bin/sandbox-exec -p '(version 1)")) {
    return 'the sandbox runtime did not start sandbox-exec with one profile.';
  }
  return undefined;
};

const prepare = async (job: SupervisorJob): Promise<SupervisorReply> => {
  if (process.platform !== 'linux' && process.platform !== 'darwin') {
    return { status: 'unavailable', message: `${process.platform} is not served by this supervisor.` };
  }
  if (!SandboxManager.isSupportedPlatform()) {
    return { status: 'unavailable', message: `${process.platform} has no supported sandbox backend.` };
  }
  const profile = job.profile as Parameters<typeof SandboxManager.initialize>[0];
  const ripgrep = (profile as { ripgrep?: { command: string } }).ripgrep;
  const dependencies = await SandboxManager.checkDependenciesAsync(ripgrep);
  /* The runtime only warns when its seccomp helper is missing; without it Unix sockets are open (D26). */
  const fatal = [...dependencies.errors, ...dependencies.warnings.filter((warning) => /seccomp/iu.test(warning))];
  if (fatal.length > 0) {
    return { status: 'unavailable', message: fatal.join('; ') };
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
  const problem = sandboxMarker(argv);
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
for (;;) {
  // oxlint-disable-next-line no-await-in-loop -- lines are drained only to observe the channel closing.
  const next = await iterator.next();
  if (next.done === true) {
    break;
  }
}
if (initialized) {
  SandboxManager.cleanupAfterCommand();
}
await SandboxManager.reset();
process.exit(0);
