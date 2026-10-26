/**
 * The rooted Node shell service (desktop shell blueprint W3; D2, D4–D7, D19, D20, D23, D25, D26; I1, I3–I7, I9, I13).
 *
 * One bounded, noninteractive, contained execution per agent call against the exact admitted checkout of the calling
 * run, and an interactive PTY session API for the human Terminal. Both launch through the one {@link ShellProvider}
 * chosen at composition; neither has an unsandboxed path, a retry with more access, or a replay.
 *
 * An agent call is admitted in a fixed order: the run's checkout (absent or stale is a refusal, never the live
 * project), the working directory, the requested access against the never-grantable set, then the approval: a waiting
 * answer is recalled first, in both modes, and only then is the permission mode read (D25). Just before the launch the
 * checkout and every granted folder are re-identified, so a replaced root is refused (`root-changed`).
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import type { InterruptResolution } from '@taucad/agent-host';
import {
  resolveShellExecutable,
  shellCommandArguments,
  shellInteractiveArguments,
  shellVersionCommand,
} from '@taucad/native-process-core/shell';
import type {
  ShellExecutable,
  ShellExit,
  ShellKind,
  ShellLaunch,
  ShellLaunchOutcome,
  ShellProvider,
  ShellTerminalSize,
} from '@taucad/native-process-core/shell';

import { shellLimits } from '#shell/shell-contract.js';
import type {
  PermissionMode,
  ShellApprovalPayload,
  ShellApprovalRecord,
  ShellNotStartedCode,
  ShellOutput,
  ShellRunRequest,
} from '#shell/shell-contract.js';
import { shellEnvironment } from '#shell/shell-environment.js';
import {
  compileShellFilesystem,
  projectProtected,
  protectedPaths,
  resolveShellAccess,
  resolveShellCwd,
  rootIdentity,
} from '#shell/shell-grant.js';
import type { ShellGrantHost, ShellProjectProtected, ShellResolvedAccess } from '#shell/shell-grant.js';
import { createShellCapture } from '#shell/shell-output.js';

/**
 * Why the shell and Terminal are unavailable on this host. Each code has one designed recovery.
 *
 * @public
 */
export type ShellUnavailableCode =
  | 'platform-unsupported'
  | 'sandbox-unavailable'
  | 'provisioning-required'
  | 'shell-missing'
  | 'pty-unavailable'
  | 'project-not-on-disk';

/** @public */
export type ShellUnavailable = Readonly<{
  status: 'unavailable';
  code: ShellUnavailableCode;
  /** One sentence naming the cause. */
  message: string;
  /** One sentence naming the next action, shown in the Terminal pane. */
  recovery: string;
}>;

/**
 * The shell this host runs, recorded on every receipt (I12).
 *
 * @public
 */
export type ShellIdentity = Readonly<{
  platform: 'darwin' | 'linux' | 'win32';
  kind: ShellKind;
  shellVersion: string;
  /** `sha256:<hex>` of the executable actually launched. */
  shellDigest: string;
  /** The provider's receipt name, such as `srt-0.0.75`. */
  provider: string;
}>;

/**
 * One admitted checkout as the service reads it: the run's root and the admission identity an approval binds.
 * `admission` changes when the host re-admits the root; when the host has none, the root's fingerprint stands in.
 *
 * @public
 */
export type ShellCheckout = Readonly<{ cwd: string; admission?: string | undefined }>;

/** Why a human Terminal session was refused. Unavailable codes match the probe. @public */
export type TerminalRefusalCode =
  | ShellUnavailableCode
  | 'project-not-admitted'
  | 'session-limit'
  | 'access-unsupported';

/** Named extra access for one human session, already allowed by the person in trusted pane chrome (D21). @public */
export type TerminalAccess = Readonly<{
  read: readonly string[];
  write: readonly string[];
  domains: readonly string[];
}>;

/** One human Terminal session's request. The project is the pane's own, never the latest agent run's (F5). @public */
export type TerminalSessionRequest = Readonly<{
  projectRoot: string;
  size: ShellTerminalSize;
  /** Extra access, passed only by the services host after the person allowed its own pending request. */
  access?: TerminalAccess | undefined;
  signal: AbortSignal;
}>;

/**
 * A live human Terminal session with one immutable grant (D6). Widening opens a new session; typed input is never
 * replayed into it. Disposal stops every descendant before it resolves.
 *
 * @public
 */
export type TerminalSession = AsyncDisposable &
  Readonly<{
    id: string;
    /** The grant this session runs under, resolved to physical folders. */
    access: TerminalAccess;
    output: AsyncIterable<Uint8Array<ArrayBuffer>>;
    write: (bytes: Uint8Array<ArrayBuffer>) => void;
    resize: (size: ShellTerminalSize) => void;
    /** Settles once the shell and every descendant have stopped and the private roots are gone. */
    exited: Promise<ShellExit>;
  }>;

/** @public */
export type TerminalSessionOutcome =
  | Readonly<{ status: 'opened'; session: TerminalSession }>
  | Readonly<{ status: 'refused'; code: TerminalRefusalCode; message: string; recovery: string }>;

/**
 * The shell service: bounded agent executions and human PTY sessions over one provider. Agent and human never share a
 * grant (D6).
 *
 * @public
 */
export type HostShell = Readonly<{
  identity: ShellIdentity;
  /** Run one agent `shell` call. Settles once; never throws for a command's own failure. */
  run: (request: ShellRunRequest) => Promise<ShellOutput>;
  /** Open one human Terminal session. */
  openTerminal: (request: TerminalSessionRequest) => Promise<TerminalSessionOutcome>;
}>;

/** @public */
export type ShellServiceOptions = Readonly<{
  provider: ShellProvider;
  /** The machine's own shell ({@link resolveShellExecutable}). */
  executable: ShellExecutable;
  identity: ShellIdentity;
  /** The admitted checkout of each live run, read at every call; an absent run is refused, never defaulted (F5). */
  checkouts: ReadonlyMap<string, ShellCheckout>;
  /**
   * The chat's permission mode for a run, read per call after recall (D19, D25). The desktop store fills it (W9); a
   * host without one reads Ask.
   */
  permissionModeOf?: ((runId: string) => Promise<PermissionMode>) | undefined;
  /** Tau's app data roots: denied whole, never grantable. */
  appDataRoots: readonly string[];
  /** Every admitted project root on this device, read per launch: each other one is denied whole (D20). */
  projectRoots: () => readonly string[];
  /** Host-selected toolchain roots (readable) and their `bin` folders (on `PATH`). */
  toolchain?: Readonly<{ roots: readonly string[]; bins: readonly string[] }> | undefined;
  /** Where private HOME and temporary roots are created; the system temporary directory by default. */
  sessionDirectory?: string | undefined;
  /** Agent executions running at once; later calls wait their turn. */
  maxExecutions?: number | undefined;
  /** Human Terminal sessions open at once; more are refused `session-limit`. */
  maxTerminals?: number | undefined;
  platform?: NodeJS.Platform | undefined;
  home?: string | undefined;
  environment?: Readonly<Record<string, string | undefined>> | undefined;
  /** Milliseconds since an arbitrary origin, for durations. */
  now?: (() => number) | undefined;
}>;

/** How long capture may wait for output readers after an unconfirmed cleanup. Milliseconds. */
const drainMilliseconds = 2000;

const delay = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds).unref();
  });

/** One stream left empty, for calls that ended before any output. */
const emptyStream = { text: '', bytes: 0, truncated: false, undecodable: false } as const;

const notStarted = (code: ShellNotStartedCode, message: string): ShellOutput => ({
  status: 'not-started',
  code,
  message,
});

const sha256 = (text: string): string => `sha256:${createHash('sha256').update(text).digest('hex')}`;

/** Canonical JSON: object keys sorted, so equal requests digest equally. */
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonical(entry)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .toSorted(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

/**
 * The recall key of an approval payload: `shell:` plus the digest of everything but the call id (A12).
 *
 * @public
 * @param payload - The approval payload.
 * @returns The key a later identical request recalls under.
 */
export const shellApprovalKey = (payload: ShellApprovalPayload): string => {
  const { toolCallId: _call, ...identity } = payload;
  return `shell:${sha256(canonical(identity)).slice('sha256:'.length)}`;
};

/**
 * The prompt the person sees: the authority being granted, from the structured request, and the agent's reason
 * labelled as its own words, never as Tau's description of the request (A12).
 *
 * @public
 * @param payload - The approval payload.
 * @returns The prompt text.
 */
export const shellApprovalPrompt = (payload: ShellApprovalPayload): string => {
  const language = payload.shell === 'powershell' ? 'PowerShell' : 'Bash';
  const command =
    payload.command.length > shellLimits.promptCommandCharacters
      ? `${payload.command.slice(0, shellLimits.promptCommandCharacters)}…`
      : payload.command;
  const lines = [
    `Run ${language} in ${payload.cwd === '' ? 'the project folder' : payload.cwd}:`,
    command,
    ...(payload.access.read.length > 0 ? [`Read: ${payload.access.read.join(', ')}`] : []),
    ...(payload.access.write.length > 0 ? [`Write: ${payload.access.write.join(', ')}`] : []),
    ...(payload.access.domains.length > 0 ? [`Network: ${payload.access.domains.join(', ')}`] : []),
    `The agent says: ${payload.access.reason}`,
  ];
  return lines.join('\n');
};

/** The error code a host approval rejection carries. */
const errorCode = (error: unknown): string | undefined =>
  error !== null && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;

/** What a provider refusal means to a person: the E20 messages and their one recovery. */
const unavailableOf = (outcome: Exclude<ShellLaunchOutcome, { status: 'started' }>): ShellUnavailable => {
  if (outcome.status === 'sandbox-unavailable') {
    return {
      status: 'unavailable',
      code: 'sandbox-unavailable',
      message: `The shell sandbox is not available on this device: ${outcome.message}`,
      recovery:
        process.platform === 'linux'
          ? "Install your distribution's socat package, or reinstall Tau from its .deb or .rpm package to restore its sandbox."
          : 'Reinstall Tau to restore its sandbox components.',
    };
  }
  switch (outcome.requirement) {
    case 'platform': {
      return {
        status: 'unavailable',
        code: 'platform-unsupported',
        message: `The shell is not available on this platform yet: ${outcome.message}`,
        recovery: 'Use Tau on macOS or Linux for the shell and Terminal.',
      };
    }
    case 'terminal': {
      return {
        status: 'unavailable',
        code: 'pty-unavailable',
        message: `The Terminal cannot start a contained terminal here: ${outcome.message}`,
        recovery: 'The agent shell still works; the Terminal waits for a Tau update on this platform.',
      };
    }
    default: {
      return {
        status: 'unavailable',
        code: 'sandbox-unavailable',
        message: `The shell sandbox cannot enforce this launch: ${outcome.message}`,
        recovery: 'Reinstall Tau to restore its sandbox components.',
      };
    }
  }
};

/** A counting gate: at most `limit` holders, later ones wait in order; a waiter whose signal aborts leaves the line. */
const createGate = (limit: number) => {
  let held = 0;
  const waiting: Array<() => void> = [];
  const release = (): void => {
    held--;
    waiting.shift()?.();
  };
  const enter = async (signal: AbortSignal): Promise<(() => void) | undefined> => {
    if (held < limit) {
      held++;
      return release;
    }
    return new Promise((resolve) => {
      const admit = (): void => {
        signal.removeEventListener('abort', leave);
        held++;
        resolve(release);
      };
      const leave = (): void => {
        const index = waiting.indexOf(admit);
        if (index !== -1) {
          waiting.splice(index, 1);
        }
        resolve(undefined);
      };
      waiting.push(admit);
      signal.addEventListener('abort', leave, { once: true });
    });
  };
  return { enter };
};

/** Private HOME and temporary roots for one launch, outside every project, removed after the launch settles. */
const createSessionRoots = async (
  base: string,
): Promise<Readonly<{ root: string; home: string; temporary: string }>> => {
  const root = await mkdtemp(join(base, 'tau-shell-'));
  const home = join(root, 'home');
  const temporary = join(root, 'tmp');
  await mkdir(home, { mode: 0o700 });
  await mkdir(temporary, { mode: 0o700 });
  return { root, home, temporary };
};

/**
 * Create the shell service over one provider.
 *
 * @public
 * @param options - The provider, the shell, the run→checkout map and what the host knows about this device.
 * @returns The service.
 */
export const createShellService = (options: ShellServiceOptions): HostShell => {
  const platform = options.platform ?? process.platform;
  const environment = options.environment ?? process.env;
  const home = options.home ?? homedir();
  const sessionBase = options.sessionDirectory ?? tmpdir();
  const now = options.now ?? (() => performance.now());
  const { executable, provider } = options;
  const executions = createGate(options.maxExecutions ?? 8);
  const maxTerminals = options.maxTerminals ?? 4;
  let terminals = 0;
  /*
   * Physical roots whose last launch could not confirm that every owned process stopped (I7). Their private roots are
   * kept and nothing else launches against them in this host: a survivor may still write there.
   */
  const uncertain = new Set<string>();
  const uncertainMessage =
    'Tau could not confirm that an earlier command in this project folder stopped, so nothing else runs here. Restart Tau to confirm cleanup.';

  const grantHost = (): ShellGrantHost => ({
    platform,
    home,
    environment,
    appDataRoots: options.appDataRoots,
    projectRoots: options.projectRoots(),
  });

  /** Ask for, or recall, the approval a widening needs. Recall comes before the mode in both modes (D25). */
  const decide = async (
    request: ShellRunRequest,
    payload: ShellApprovalPayload,
  ): Promise<ShellApprovalRecord | ShellNotStartedCode | 'cancelled'> => {
    const key = shellApprovalKey(payload);
    const mode = async (): Promise<PermissionMode> => (await options.permissionModeOf?.(request.runId)) ?? 'ask';
    const outcomeOf = async (
      resolution: InterruptResolution,
    ): Promise<ShellApprovalRecord | ShellNotStartedCode | 'cancelled'> =>
      resolution.outcome === 'approved'
        ? { approvedBy: 'person', mode: await mode() }
        : resolution.outcome === 'denied'
          ? 'access-denied'
          : 'cancelled';
    /* The host spends a recalled answer durably inside `recall`, before it returns (D23). */
    const prior = await request.approve?.recall?.(key);
    if (prior !== undefined) {
      return outcomeOf(prior.resolution);
    }
    const current = await mode();
    if (current === 'bypass') {
      return { approvedBy: 'bypass', mode: current };
    }
    if (request.approve === undefined) {
      return 'approval-unavailable';
    }
    try {
      /* Under a Tau host this records the interrupt and pauses the run; the call rejects as the attempt ends. */
      return await outcomeOf(await request.approve({ key, prompt: shellApprovalPrompt(payload), payload }));
    } catch (error) {
      if (errorCode(error) === 'APPROVAL_UNAVAILABLE') {
        return 'approval-unavailable';
      }
      throw error;
    }
  };

  /** Re-identify the checkout and every granted folder just before the launch (A03). */
  const unchanged = async (
    request: ShellRunRequest,
    checkout: ShellCheckout,
    fingerprints: ReadonlyMap<string, string>,
  ): Promise<boolean> => {
    if (options.checkouts.get(request.runId) !== checkout) {
      return false;
    }
    for (const [path, fingerprint] of fingerprints) {
      // oxlint-disable-next-line no-await-in-loop -- a handful of roots, each compared once.
      const identity = await rootIdentity(path);
      if (identity?.fingerprint !== fingerprint) {
        return false;
      }
    }
    return true;
  };

  const run = async (request: ShellRunRequest): Promise<ShellOutput> => {
    const { input } = request;
    if (
      input.command.length === 0 ||
      input.command.length > shellLimits.commandCharacters ||
      input.command.includes('\0')
    ) {
      return notStarted('launch-failed', 'The command must be 1 to 16384 characters with no NUL character.');
    }
    /** Milliseconds. */
    const commandTimeout = Math.min(
      Math.max(input.timeoutMs ?? shellLimits.defaultTimeout, shellLimits.minTimeout),
      shellLimits.maxTimeout,
    );
    const checkout = options.checkouts.get(request.runId);
    if (checkout === undefined) {
      return notStarted(
        'checkout-unavailable',
        'This run has no admitted project folder, so the command did not run. It never falls back to the live project; ask the person to send the message again.',
      );
    }
    const identity = await rootIdentity(checkout.cwd);
    if (identity === undefined) {
      return notStarted('checkout-unavailable', "The run's project folder is gone, so the command did not run.");
    }
    const { real: root, fingerprint } = identity;
    if (uncertain.has(root)) {
      return notStarted('checkout-unavailable', uncertainMessage);
    }
    const cwd = await resolveShellCwd(root, input.cwd);
    if ('status' in cwd) {
      return notStarted('invalid-cwd', cwd.message);
    }
    const host = grantHost();
    const checkoutProtected = await projectProtected(root);
    const access = await resolveShellAccess(input.access, host, protectedPaths(checkoutProtected));
    if ('status' in access) {
      return notStarted('access-unsupported', `${access.message} Nothing ran and nothing was widened.`);
    }
    let approval: ShellApprovalRecord | undefined;
    if (input.access !== undefined) {
      const payload: ShellApprovalPayload = {
        kind: 'shell',
        shell: executable.kind,
        toolCallId: request.toolCallId,
        command: input.command,
        commandDigest: sha256(input.command),
        cwd: cwd.relative,
        checkout: { runId: request.runId, admission: checkout.admission ?? fingerprint, fingerprint },
        access: {
          reason: input.access.reason,
          read: [...access.read],
          write: [...access.write],
          domains: [...access.domains],
        },
        lifetime: 'invocation',
      };
      const decision = await decide(request, payload);
      if (decision === 'cancelled') {
        return { status: 'cancelled', stdout: emptyStream, stderr: emptyStream, durationMs: 0 };
      }
      if (typeof decision === 'string') {
        return notStarted(
          decision,
          decision === 'access-denied'
            ? 'The person denied this access, so the command did not run. Do not retry it with the same access.'
            : 'No one can approve extra access here, so the command did not run. Run it without access, or ask the person to run it in Tau.',
        );
      }
      approval = decision;
    }
    const release = await executions.enter(request.signal);
    if (release === undefined) {
      return { status: 'cancelled', stdout: emptyStream, stderr: emptyStream, durationMs: 0, approval };
    }
    try {
      return await execute(request, {
        checkout,
        root,
        cwd: cwd.path,
        checkoutProtected,
        access,
        host,
        commandTimeout,
        approval,
        fingerprint,
      });
    } finally {
      release();
    }
  };

  const execute = async (
    request: ShellRunRequest,
    admitted: Readonly<{
      checkout: ShellCheckout;
      root: string;
      cwd: string;
      checkoutProtected: ShellProjectProtected;
      access: ShellResolvedAccess;
      host: ShellGrantHost;
      /** Milliseconds. */
      commandTimeout: number;
      approval: ShellApprovalRecord | undefined;
      fingerprint: string;
    }>,
  ): Promise<ShellOutput> => {
    const { approval } = admitted;
    const fingerprints = new Map<string, string>([[admitted.root, admitted.fingerprint]]);
    for (const folder of [...admitted.access.read, ...admitted.access.write]) {
      // oxlint-disable-next-line no-await-in-loop -- a handful of granted folders.
      const identity = await rootIdentity(folder);
      if (identity === undefined || identity.real !== folder) {
        return notStarted('root-changed', `${folder} changed after it was approved, so the command did not run.`);
      }
      fingerprints.set(folder, identity.fingerprint);
    }
    /* The log's records row exists before the launch, so the provider masks it and the shell cannot plant it. */
    await mkdir(join(admitted.root, '.tau', 'offloaded-tool-results', 'shell'), { recursive: true }).catch(
      () => undefined,
    );
    const session = await createSessionRoots(sessionBase);
    /* Cleared only by an unconfirmed cleanup: its private roots then stay for a later confirmed recovery (I7). */
    let retainRoots = false;
    try {
      const filesystem = await compileShellFilesystem({
        checkout: admitted.root,
        checkoutProtected: admitted.checkoutProtected,
        session: [session.home, session.temporary],
        toolchain: options.toolchain?.roots ?? [],
        access: admitted.access,
        host: admitted.host,
      });
      if (!(await unchanged(request, admitted.checkout, fingerprints))) {
        return notStarted(
          'root-changed',
          'The project folder or a granted folder was replaced before the command started, so it did not run.',
        );
      }
      const controller = new AbortController();
      /* Set by the timer; an object so the check after the awaits reads it live. */
      const deadline = { passed: false };
      const onAbort = (): void => {
        controller.abort();
      };
      // Read live: the signal can abort while any await below is pending.
      const cancelled = (): boolean => request.signal.aborted;
      request.signal.addEventListener('abort', onAbort, { once: true });
      if (request.signal.aborted) {
        onAbort();
      }
      const launch: ShellLaunch = {
        executablePath: executable.path,
        arguments: shellCommandArguments(executable.kind, request.input.command),
        workingDirectory: admitted.cwd,
        commandId: `shell:${request.runId}:${request.toolCallId}`,
        filesystem,
        network: { domains: admitted.access.domains },
        environment: shellEnvironment({
          platform,
          executablePath: executable.path,
          home: session.home,
          temporary: session.temporary,
          toolchainBins: options.toolchain?.bins ?? [],
          host: environment,
          terminal: false,
        }),
        stdio: { kind: 'pipes' },
        signal: controller.signal,
      };
      const started = now();
      let outcome: ShellLaunchOutcome;
      try {
        outcome = await provider.launch(launch);
      } catch (error) {
        request.signal.removeEventListener('abort', onAbort);
        if (cancelled()) {
          return { status: 'cancelled', stdout: emptyStream, stderr: emptyStream, durationMs: 0, approval };
        }
        return notStarted(
          'launch-failed',
          `The shell could not start: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (outcome.status !== 'started') {
        request.signal.removeEventListener('abort', onAbort);
        const unavailable = unavailableOf(outcome);
        return notStarted('shell-unavailable', `${unavailable.message} ${unavailable.recovery}`);
      }
      const { process: child } = outcome;
      if (child.kind !== 'pipes') {
        await child.terminate();
        request.signal.removeEventListener('abort', onAbort);
        return notStarted('launch-failed', 'The provider started a terminal for a pipe launch.');
      }
      const timer = setTimeout(() => {
        deadline.passed = true;
        controller.abort();
      }, admitted.commandTimeout);
      const capture = createShellCapture({
        log: {
          root: admitted.root,
          name: `${request.toolCallId.replaceAll(/[^\w.-]/gu, '_').slice(0, 64)}-${randomUUID()}.log`,
        },
      });
      const drained = Promise.all([capture.drain('stdout', child.stdout), capture.drain('stderr', child.stderr)]);
      let exit: ShellExit;
      try {
        exit = await child.exited;
      } catch (error) {
        /* Unconfirmed cleanup: keep the roots and the checkout, and never report a finished command (I7, D23). A
         * surviving writer cannot hold the answer open: capture waits a bounded time for the readers to end. */
        retainRoots = true;
        uncertain.add(admitted.root);
        await Promise.race([drained.catch(() => undefined), delay(drainMilliseconds)]);
        const { log } = await capture.finish();
        return {
          status: 'interrupted',
          message: `Tau did not confirm that this command stopped, so its result is unknown and it will not be run again: ${error instanceof Error ? error.message : String(error)}`,
          log,
        };
      } finally {
        clearTimeout(timer);
        request.signal.removeEventListener('abort', onAbort);
      }
      await drained;
      const durationMs = Math.max(0, Math.round(now() - started));
      const captured = await capture.finish();
      const ran = { ...captured, durationMs, ...(approval === undefined ? {} : { approval }) };
      if (deadline.passed) {
        // oxlint-disable-next-line tau-lint/no-time-unit-suffix -- the Bash tool's wire field (blueprint API).
        return { status: 'timed-out', timeoutMs: admitted.commandTimeout, ...ran };
      }
      if (cancelled()) {
        return { status: 'cancelled', ...ran };
      }
      return exit.exitCode === undefined
        ? { status: 'signalled', signal: exit.signal, ...ran }
        : { status: 'completed', exitCode: exit.exitCode, ...ran };
    } finally {
      /* After a confirmed `exited`: no descendant can still be writing into the private roots (I7). */
      if (!retainRoots) {
        await rm(session.root, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  };

  const openTerminal = async (request: TerminalSessionRequest): Promise<TerminalSessionOutcome> => {
    const refuse = (code: TerminalRefusalCode, message: string, recovery: string): TerminalSessionOutcome => ({
      status: 'refused',
      code,
      message,
      recovery,
    });
    const host = grantHost();
    const identity = await rootIdentity(request.projectRoot);
    const admitted = await Promise.all(host.projectRoots.map(async (root) => rootIdentity(root)));
    if (identity === undefined) {
      return refuse(
        'project-not-on-disk',
        'This project is not a folder on this device.',
        'Open a project saved on disk.',
      );
    }
    if (!admitted.some((entry) => entry?.fingerprint === identity.fingerprint)) {
      return refuse(
        'project-not-admitted',
        'This project is not open in Tau.',
        'Open the project, then start the Terminal.',
      );
    }
    if (uncertain.has(identity.real)) {
      return refuse('sandbox-unavailable', uncertainMessage, 'Restart Tau, then open the Terminal again.');
    }
    if (terminals >= maxTerminals) {
      return refuse('session-limit', 'Too many Terminal sessions are open.', 'Close another Terminal, then try again.');
    }
    const root = identity.real;
    const checkoutProtected = await projectProtected(root);
    const requested = request.access;
    const access =
      requested === undefined
        ? { read: [], write: [], domains: [] }
        : await resolveShellAccess(
            { reason: 'Terminal access the person allowed', ...requested },
            host,
            protectedPaths(checkoutProtected),
          );
    if ('status' in access) {
      return refuse('access-unsupported', access.message, 'Choose a named folder outside protected locations.');
    }
    terminals++;
    let counted = true;
    const uncount = (): void => {
      if (counted) {
        counted = false;
        terminals--;
      }
    };
    const session = await createSessionRoots(sessionBase);
    const cleanup = async (): Promise<void> => {
      uncount();
      await rm(session.root, { recursive: true, force: true }).catch(() => undefined);
    };
    let outcome: ShellLaunchOutcome;
    try {
      const filesystem = await compileShellFilesystem({
        checkout: root,
        checkoutProtected,
        session: [session.home, session.temporary],
        toolchain: options.toolchain?.roots ?? [],
        access,
        host,
      });
      outcome = await provider.launch({
        executablePath: executable.path,
        arguments: shellInteractiveArguments(executable.kind),
        workingDirectory: root,
        commandId: `terminal:${randomUUID()}`,
        filesystem,
        network: { domains: access.domains },
        environment: shellEnvironment({
          platform,
          executablePath: executable.path,
          home: session.home,
          temporary: session.temporary,
          toolchainBins: options.toolchain?.bins ?? [],
          host: environment,
          terminal: true,
        }),
        stdio: { kind: 'terminal', size: request.size },
        signal: request.signal,
      });
    } catch (error) {
      await cleanup();
      throw error;
    }
    if (outcome.status !== 'started') {
      await cleanup();
      const unavailable = unavailableOf(outcome);
      return refuse(unavailable.code, unavailable.message, unavailable.recovery);
    }
    const { process: child } = outcome;
    if (child.kind !== 'terminal') {
      await child.terminate();
      await cleanup();
      return refuse('pty-unavailable', 'The provider did not start a terminal.', 'Restart Tau and try again.');
    }
    const exited = (async (): Promise<ShellExit> => {
      let exit: ShellExit;
      try {
        exit = await child.exited;
      } catch (error) {
        /* Unconfirmed cleanup keeps this session's roots and blocks its project (I7). */
        uncount();
        uncertain.add(root);
        throw error;
      }
      await cleanup();
      return exit;
    })();
    return {
      status: 'opened',
      session: {
        id: randomUUID(),
        access,
        output: child.output,
        write: child.write,
        resize: child.resize,
        exited,
        [Symbol.asyncDispose]: async () => {
          await child.terminate();
          await exited;
        },
      },
    };
  };

  return { identity: options.identity, run, openTerminal };
};

/** @public */
export type ShellProbe = Readonly<{ status: 'available'; shell: HostShell }> | ShellUnavailable;

/** @public */
export type ProbeHostShellOptions = Omit<ShellServiceOptions, 'executable' | 'identity'>;

/**
 * Prove the provider and the machine's own shell on this host before anything is offered (D1, I2): resolve the shell
 * from its fixed path, then ask it for its version inside an empty sandbox. Never runs project code. Windows has no
 * provider in this delivery and answers `sandbox-unavailable` without starting anything.
 *
 * @public
 * @param options - The service options, less what the probe resolves.
 * @returns The service, or why the shell is unavailable.
 */
export const probeHostShell = async (options: ProbeHostShellOptions): Promise<ShellProbe> => {
  const platform = options.platform ?? process.platform;
  const environment = options.environment ?? process.env;
  if (platform === 'win32') {
    return {
      status: 'unavailable',
      code: 'sandbox-unavailable',
      message: 'The Windows shell sandbox is not part of this Tau build.',
      recovery: 'Use Tau on macOS or Linux for the shell and Terminal until the Windows sandbox ships.',
    };
  }
  if (platform !== 'darwin' && platform !== 'linux') {
    return {
      status: 'unavailable',
      code: 'platform-unsupported',
      message: `${platform} has no supported shell sandbox.`,
      recovery: 'Use Tau on macOS or Linux for the shell and Terminal.',
    };
  }
  const executable = await resolveShellExecutable({ platform, environment });
  if ('status' in executable) {
    return {
      status: 'unavailable',
      code: 'shell-missing',
      message: executable.message,
      recovery: 'Restore the system Bash at /bin/bash; Tau never runs a user-installed copy.',
    };
  }
  const session = await createSessionRoots(options.sessionDirectory ?? tmpdir());
  /* An unconfirmed probe cleanup keeps its private roots, like any launch (I7). Read live in `finally`. */
  const retained = { roots: false };
  try {
    const outcome = await options.provider.launch({
      executablePath: executable.path,
      arguments: shellCommandArguments(executable.kind, shellVersionCommand(executable.kind)),
      workingDirectory: session.home,
      commandId: 'shell:probe',
      filesystem: { readable: [], writable: [session.home, session.temporary], denied: [...options.appDataRoots] },
      network: { domains: [] },
      environment: shellEnvironment({
        platform,
        executablePath: executable.path,
        home: session.home,
        temporary: session.temporary,
        toolchainBins: [],
        host: environment,
        terminal: false,
      }),
      stdio: { kind: 'pipes' },
      signal: AbortSignal.timeout(30_000),
    });
    if (outcome.status !== 'started') {
      return unavailableOf(outcome);
    }
    if (outcome.process.kind !== 'pipes') {
      await outcome.process.terminate();
      return {
        status: 'unavailable',
        code: 'sandbox-unavailable',
        message: 'The sandbox started a terminal for a pipe launch.',
        recovery: 'Reinstall Tau to restore its sandbox components.',
      };
    }
    const { stdout, stderr, exited } = outcome.process;
    const decoder = new TextDecoder();
    let version = '';
    const drain = async (chunks: AsyncIterable<Uint8Array<ArrayBuffer>>, keep: boolean): Promise<void> => {
      for await (const chunk of chunks) {
        if (keep && version.length < 256) {
          version += decoder.decode(chunk, { stream: true });
        }
      }
    };
    const drained = Promise.all([drain(stdout, true), drain(stderr, false)]);
    let exit: ShellExit;
    try {
      exit = await exited;
    } catch (error) {
      retained.roots = true;
      await Promise.race([drained.catch(() => undefined), delay(drainMilliseconds)]);
      throw error;
    }
    await drained;
    version = version.trim();
    if (exit.exitCode !== 0 || version === '') {
      return {
        status: 'unavailable',
        code: 'sandbox-unavailable',
        message: 'The shell did not start inside the sandbox.',
        recovery:
          platform === 'linux'
            ? "Install your distribution's socat package, or reinstall Tau from its .deb or .rpm package to restore its sandbox."
            : 'Reinstall Tau to restore its sandbox components.',
      };
    }
    const identity: ShellIdentity = {
      platform,
      kind: executable.kind,
      shellVersion: version,
      shellDigest: executable.digest,
      provider: options.provider.name,
    };
    return { status: 'available', shell: createShellService({ ...options, executable, identity }) };
  } catch (error) {
    return {
      status: 'unavailable',
      code: 'sandbox-unavailable',
      message: `The shell sandbox could not start: ${error instanceof Error ? error.message : String(error)}`,
      recovery: 'Reinstall Tau to restore its sandbox components.',
    };
  } finally {
    if (!retained.roots) {
      await rm(session.root, { recursive: true, force: true }).catch(() => undefined);
    }
  }
};
