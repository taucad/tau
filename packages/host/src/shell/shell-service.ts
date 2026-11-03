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
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import type { InterruptResolution } from '@taucad/agent-host';
import {
  resolveShellExecutable,
  resolveTerminalZsh,
  shellCommandArguments,
  shellInteractiveArguments,
  shellVersionCommand,
  terminalZshArguments,
} from '@taucad/native-process-core/shell';
import type {
  ShellExecutable,
  ShellExecution,
  ShellExit,
  ShellKind,
  ShellLaunch,
  ShellLaunchOutcome,
  ShellProvider,
  ShellTerminalSize,
  TerminalZsh,
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
  /**
   * What the sandbox itself reported, for the host log and a support bundle only. Never rendered: the pane shows
   * `message` and `recovery`, which stay free of paths and command output.
   */
  diagnostic?: string | undefined;
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
export type ShellCheckout = Readonly<{
  cwd: string;
  admission?: string | undefined;
  /**
   * The run's revision execution holds (I7), present exactly when the run has a turn lease to protect: a command holds
   * its execution there before it launches, and releases it only after its stop is confirmed and its roots are gone.
   */
  executions?: ShellExecutionHolds | undefined;
}>;

/** A revision store's answer to a hold or release. @public */
export type ShellHoldAnswer =
  | Readonly<{ status: 'applied' | 'replayed' }>
  | Readonly<{ status: 'refused'; message: string }>;

/** One run's revision execution holds (I7). @public */
export type ShellExecutionHolds = Readonly<{
  hold: (executionId: string) => Promise<ShellHoldAnswer>;
  release: (executionId: string) => Promise<ShellHoldAnswer>;
}>;

/**
 * One open project's side of startup recovery (I7): which checkout roots are its own, and every execution its turn
 * store still holds, read completely now. An earlier host's command receipt on one of its roots is released only
 * after that read: through the hold's own release when the store still holds it, directly when it no longer does.
 *
 * @public
 */
export type ShellProjectExecutions = Readonly<{
  /** Whether a physical checkout root belongs to this project. */
  owns: (root: string) => Promise<boolean>;
  /** Every held execution id and the release of its hold; rejects when any run record cannot be read. */
  held: () => Promise<ReadonlyMap<string, () => Promise<ShellHoldAnswer>>>;
}>;

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
  /**
   * Retry startup recovery against the projects open now ({@link ShellServiceOptions.projectExecutions}). A project
   * host calls it once it can answer for its runs; nothing else needs it. Absent on a shell with no custody to recover.
   */
  reconcile?: (() => Promise<void>) | undefined;
}>;

/** @public */
export type ShellServiceOptions = Readonly<{
  provider: ShellProvider;
  /** The machine's own shell ({@link resolveShellExecutable}). */
  executable: ShellExecutable;
  /**
   * The verified macOS system Zsh the human Terminal runs instead, loading the person's own Zsh startup files (operator
   * ruling 2026-11-01T18:57Z; {@link resolveTerminalZsh}). Agent launches always run `executable`, clean.
   */
  terminalZsh?: TerminalZsh | undefined;
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
  /** The projects open now, for releasing an earlier host's command receipts ({@link HostShell.reconcile}). */
  projectExecutions?: (() => readonly ShellProjectExecutions[]) | undefined;
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

/** The resource key an agent command's receipt carries; the provider never reads it. */
const agentKey = (runId: string): string => `agent:${runId}`;

/** Delete a receipt's private root, only when it is one of this service's own roots. */
const removePrivateRoot = async (sessionBase: string, privateRoot: string): Promise<boolean> => {
  try {
    if (
      !basename(privateRoot).startsWith('tau-shell-') ||
      (await realpath(dirname(privateRoot))) !== (await realpath(sessionBase))
    ) {
      return false;
    }
    await rm(privateRoot, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
};

/**
 * Finish one execution after its launch outcome (I7): claim its stopped receipt, delete its private roots, release the
 * run's revision hold, then the receipt. `retained` means something could not be confirmed, and the roots, hold or
 * receipt that remain keep custody.
 */
const finishExecution = async (
  provider: ShellProvider,
  execution: Readonly<{
    executionId: string;
    sessionBase: string;
    privateRoot: string;
    holds: ShellExecutionHolds | undefined;
  }>,
): Promise<'released' | 'retained'> => {
  let recoveries: Awaited<ReturnType<ShellProvider['recover']>>;
  try {
    recoveries = await provider.recover({ executionIds: [execution.executionId] });
  } catch {
    return 'retained';
  }
  if (recoveries[0]?.status !== 'stopped') {
    return 'retained';
  }
  if (!(await removePrivateRoot(execution.sessionBase, execution.privateRoot))) {
    return 'retained';
  }
  if (execution.holds !== undefined) {
    let answer: ShellHoldAnswer;
    try {
      answer = await execution.holds.release(execution.executionId);
    } catch (error) {
      answer = { status: 'refused', message: error instanceof Error ? error.message : String(error) };
    }
    if (answer.status === 'refused') {
      return 'retained';
    }
  }
  try {
    await provider.release({ executionId: execution.executionId });
  } catch {
    /* The receipt stays stopped, its processes confirmed gone; the next start releases it. */
  }
  return 'released';
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
   * Physical roots with an execution whose stop, root deletion or hold release is not confirmed (I7), by execution. Their
   * private roots and holds are kept and nothing else launches against them in this host: a survivor may still write.
   */
  const blocked = new Map<string, Set<string>>();
  const block = (root: string | undefined, executionId: string): void => {
    if (root !== undefined) {
      blocked.set(root, new Set([...(blocked.get(root) ?? []), executionId]));
    }
  };
  const unblock = (root: string, executionId: string): void => {
    const ids = blocked.get(root);
    ids?.delete(executionId);
    if (ids?.size === 0) {
      blocked.delete(root);
    }
  };
  /* Set when the provider's custody could not be read: then nothing can be shown free, so nothing runs. */
  let inventoryFailure: string | undefined;
  const isBlocked = (root: string): boolean => inventoryFailure !== undefined || blocked.has(root);
  const uncertainMessage =
    'Tau could not confirm that an earlier command in this project folder stopped, so nothing else runs here. Restart Tau to confirm cleanup.';
  const finish = async (
    execution: Readonly<{ executionId: string; privateRoot: string; root: string; holds?: ShellExecutionHolds }>,
  ): Promise<'released' | 'retained'> => {
    const finished = await finishExecution(provider, {
      executionId: execution.executionId,
      sessionBase,
      privateRoot: execution.privateRoot,
      holds: execution.holds,
    });
    if (finished === 'retained') {
      block(execution.root, execution.executionId);
    }
    return finished;
  };

  /* An earlier host's stopped resource receipts retain their roots until their whole project can be read. */
  const pending = new Map<string, ShellExecution>();
  let reconciling: Promise<void> = Promise.resolve();
  const settledOf = async (promise: Promise<void>): Promise<void> => {
    try {
      await promise;
    } catch {
      /* Each pass reports its own failure; the next one still runs. */
    }
  };
  const reconcileOnce = async (): Promise<void> => {
    for (const [executionId, row] of pending) {
      const { root } = row.resource!;
      const projects = options.projectExecutions?.() ?? [];
      let owner: ShellProjectExecutions | undefined;
      for (const project of projects) {
        // oxlint-disable-next-line no-await-in-loop -- a handful of open projects, asked in order.
        if (await project.owns(root).catch(() => false)) {
          owner = project;
          break;
        }
      }
      if (owner === undefined) {
        continue;
      }
      let held: ReadonlyMap<string, () => Promise<ShellHoldAnswer>>;
      try {
        // oxlint-disable-next-line no-await-in-loop -- one complete read per receipt, never a cached one.
        held = await owner.held();
      } catch {
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- roots are removed only after this project's complete inventory.
      if (!(await removePrivateRoot(sessionBase, row.privateRoot))) {
        continue;
      }
      const release = held.get(executionId);
      if (release !== undefined) {
        // oxlint-disable-next-line no-await-in-loop -- releases are sequential, each before its receipt.
        const answer = await release().catch(
          (error: unknown): ShellHoldAnswer => ({ status: 'refused', message: String(error) }),
        );
        if (answer.status === 'refused') {
          continue;
        }
      }
      try {
        // oxlint-disable-next-line no-await-in-loop -- see above.
        await provider.release({ executionId });
      } catch {
        continue;
      }
      pending.delete(executionId);
      unblock(root, executionId);
    }
  };
  const reconcile = async (): Promise<void> => {
    const next = (async (): Promise<void> => {
      await reconciling;
      await reconcileOnce();
    })();
    reconciling = settledOf(next);
    return next;
  };
  /* Startup recovery (I7): nothing runs until an earlier host's receipts are claimed, or their roots are blocked. */
  const recovered = (async (): Promise<void> => {
    let rows: readonly ShellExecution[];
    try {
      rows = await provider.inventory();
    } catch (error) {
      inventoryFailure = error instanceof Error ? error.message : String(error);
      return;
    }
    for (const row of rows) {
      // oxlint-disable-next-line no-await-in-loop -- each receipt is claimed alone, so one cannot hold the others.
      const [recovery] = await provider.recover({ executionIds: [row.executionId] }).catch(() => []);
      if (recovery?.status !== 'stopped') {
        block(row.resource?.root, row.executionId);
        continue;
      }
      if (row.resource !== undefined) {
        pending.set(row.executionId, row);
        block(row.resource.root, row.executionId);
        continue;
      }
      // Only an explicitly resource-free probe needs no project inventory before its roots are removed.
      // oxlint-disable-next-line no-await-in-loop -- each stopped receipt is cleaned up in order.
      if (!(await removePrivateRoot(sessionBase, row.privateRoot))) {
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- see above.
      await provider.release({ executionId: row.executionId }).catch(() => undefined);
    }
    await reconcile();
  })();

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
    await recovered;
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
    if (isBlocked(root)) {
      return notStarted('checkout-unavailable', inventoryFailure ?? uncertainMessage);
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
    /*
     * A cancellation from the caller outranks every reason the command did not get going: an abort that lands while
     * the launch is still being staged, before any process exists, is still a cancellation from the caller's side and
     * is reported once (I7). `not-started` would be the wrong answer there, because it invites a retry of a command
     * the caller has already withdrawn.
     */
    const didNotStart = (code: ShellNotStartedCode, message: string): ShellOutput =>
      request.signal.aborted
        ? {
            status: 'cancelled',
            stdout: emptyStream,
            stderr: emptyStream,
            durationMs: 0,
            ...(approval === undefined ? {} : { approval }),
          }
        : notStarted(code, message);
    const fingerprints = new Map<string, string>([[admitted.root, admitted.fingerprint]]);
    for (const folder of [...admitted.access.read, ...admitted.access.write]) {
      // oxlint-disable-next-line no-await-in-loop -- a handful of granted folders.
      const identity = await rootIdentity(folder);
      if (identity === undefined || identity.real !== folder) {
        return didNotStart('root-changed', `${folder} changed after it was approved, so the command did not run.`);
      }
      fingerprints.set(folder, identity.fingerprint);
    }
    /* The log's records row exists before the launch, so the provider masks it and the shell cannot plant it. */
    await mkdir(join(admitted.root, '.tau', 'offloaded-tool-results', 'shell'), { recursive: true }).catch(
      () => undefined,
    );
    const session = await createSessionRoots(sessionBase);
    /* Set once custody is prepared: from then on only `finish` may delete the private roots (I7). */
    let custody: Readonly<{ executionId: string; holds: ShellExecutionHolds | undefined }> | undefined;
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
        return didNotStart(
          'root-changed',
          'The project folder or a granted folder was replaced before the command started, so it did not run.',
        );
      }
      let executionId: string;
      try {
        ({ executionId } = await provider.prepare({
          privateRoot: session.root,
          resource: { key: agentKey(request.runId), root: admitted.root },
        }));
      } catch (error) {
        return didNotStart(
          'shell-unavailable',
          `Tau could not record custody for this command, so it did not run: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      const holds = admitted.checkout.executions;
      custody = { executionId, holds: undefined };
      if (holds !== undefined) {
        let answer: ShellHoldAnswer;
        try {
          answer = await holds.hold(executionId);
        } catch (error) {
          /* A hold that failed after it landed is released with the receipt; a release of an absent hold is a replay. */
          custody = { executionId, holds };
          return didNotStart(
            'checkout-unavailable',
            `This run's files could not be held for the command, so it did not run: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        if (answer.status === 'refused') {
          return didNotStart('checkout-unavailable', `${answer.message} The command did not run.`);
        }
        custody = { executionId, holds };
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
        executionId,
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
        return didNotStart(
          'launch-failed',
          `The shell could not start: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (outcome.status !== 'started') {
        request.signal.removeEventListener('abort', onAbort);
        const unavailable = unavailableOf(outcome);
        return didNotStart('shell-unavailable', `${unavailable.message} ${unavailable.recovery}`);
      }
      const { process: child } = outcome;
      if (child.kind !== 'pipes') {
        await child.terminate().catch(() => undefined);
        request.signal.removeEventListener('abort', onAbort);
        return didNotStart('launch-failed', 'The provider started a terminal for a pipe launch.');
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
        /* Unconfirmed cleanup: never report a finished command (I7, D23). `finish` below keeps the roots, the hold
         * and the checkout unless recovery itself confirms the stop. A surviving writer cannot hold the answer open:
         * capture waits a bounded time for the readers to end. */
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
      /* Without custody nothing launched; with it, only a confirmed stopped claim deletes the roots (I7). */
      await (custody === undefined
        ? rm(session.root, { recursive: true, force: true }).catch(() => undefined)
        : finish({
            executionId: custody.executionId,
            privateRoot: session.root,
            root: admitted.root,
            ...(custody.holds === undefined ? {} : { holds: custody.holds }),
          }));
    }
  };

  const openTerminal = async (request: TerminalSessionRequest): Promise<TerminalSessionOutcome> => {
    await recovered;
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
    if (isBlocked(identity.real)) {
      return refuse(
        'sandbox-unavailable',
        inventoryFailure ?? uncertainMessage,
        'Restart Tau, then open the Terminal again.',
      );
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
    const sessionId = randomUUID();
    let executionId: string;
    try {
      ({ executionId } = await provider.prepare({
        privateRoot: session.root,
        resource: { key: `terminal:${sessionId}`, root },
      }));
    } catch (error) {
      uncount();
      await rm(session.root, { recursive: true, force: true }).catch(() => undefined);
      return refuse(
        'sandbox-unavailable',
        `Tau could not record custody for this Terminal session: ${error instanceof Error ? error.message : String(error)}`,
        'Restart Tau, then open the Terminal again.',
      );
    }
    /* Only a confirmed stopped claim deletes the session's roots and erases its receipt (I7). */
    const cleanup = async (): Promise<'released' | 'retained'> => {
      uncount();
      return finish({ executionId, privateRoot: session.root, root });
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
      const { terminalZsh } = options;
      outcome = await provider.launch({
        executionId,
        executablePath: terminalZsh?.path ?? executable.path,
        arguments: terminalZsh === undefined ? shellInteractiveArguments(executable.kind) : terminalZshArguments,
        workingDirectory: root,
        commandId: `terminal:${sessionId}`,
        filesystem,
        network: { domains: access.domains },
        startupFiles: terminalZsh === undefined ? undefined : 'zsh',
        environment: shellEnvironment({
          platform,
          executablePath: terminalZsh?.path ?? executable.path,
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
      await child.terminate().catch(() => undefined);
      await cleanup();
      return refuse('pty-unavailable', 'The provider did not start a terminal.', 'Restart Tau and try again.');
    }
    const exited = (async (): Promise<ShellExit> => {
      let exit: ShellExit;
      try {
        exit = await child.exited;
      } catch (error) {
        /* Unconfirmed cleanup keeps this session's roots and blocks its project unless recovery confirms (I7). */
        await cleanup();
        throw error;
      }
      if ((await cleanup()) === 'retained') {
        throw new Error('Tau could not confirm that this Terminal session stopped, so its project stays blocked.');
      }
      return exit;
    })();
    return {
      status: 'opened',
      session: {
        id: sessionId,
        access,
        output: child.output,
        write: child.write,
        resize: child.resize,
        exited,
        [Symbol.asyncDispose]: async () => {
          await child.terminate().catch(() => undefined);
          await exited;
        },
      },
    };
  };

  return {
    identity: options.identity,
    run,
    openTerminal,
    reconcile: async () => {
      await recovered;
      await reconcile();
    },
  };
};

/** @public */
export type ShellProbe = Readonly<{ status: 'available'; shell: HostShell }> | ShellUnavailable;

/** @public */
export type ProbeHostShellOptions = Omit<ShellServiceOptions, 'executable' | 'identity' | 'terminalZsh'>;

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
  const sessionBase = options.sessionDirectory ?? tmpdir();
  const session = await createSessionRoots(sessionBase);
  /* Set once custody is prepared: then only a confirmed stopped claim deletes the probe's roots (I7). */
  const custody: { executionId?: string } = {};
  try {
    /* A probe is the one launch with no resource: it may run only in its private roots. */
    ({ executionId: custody.executionId } = await options.provider.prepare({
      privateRoot: session.root,
      resource: undefined,
    }));
    const outcome = await options.provider.launch({
      executionId: custody.executionId,
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
      await outcome.process.terminate().catch(() => undefined);
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
    /* Kept only to explain a refusal in the host log; a successful probe never reads it. */
    let failure = '';
    const failureDecoder = new TextDecoder();
    const drain = async (chunks: AsyncIterable<Uint8Array<ArrayBuffer>>, keep: boolean): Promise<void> => {
      for await (const chunk of chunks) {
        if (keep && version.length < 256) {
          version += decoder.decode(chunk, { stream: true });
        }
        if (!keep) {
          /* The last words are the useful ones: a refusal's own message comes after whatever noise preceded it. */
          failure = (failure + failureDecoder.decode(chunk, { stream: true })).slice(-1024);
        }
      }
    };
    const drained = Promise.all([drain(stdout, true), drain(stderr, false)]);
    let exit: ShellExit;
    try {
      exit = await exited;
    } catch (error) {
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
        /* Without this the one failure that means "the sandbox ran, the shell did not" is indistinguishable from
         * every other refusal in a host log, and the probe is the only place the shell's own words exist. */
        diagnostic: `exit ${JSON.stringify(exit)}; stdout ${JSON.stringify(version)}; stderr ${JSON.stringify(failure.slice(-1024))}`,
      };
    }
    const identity: ShellIdentity = {
      platform,
      kind: executable.kind,
      shellVersion: version,
      shellDigest: executable.digest,
      provider: options.provider.name,
    };
    /* On macOS the human Terminal runs the verified system Zsh; without one it keeps the clean Bash. */
    const zsh = platform === 'darwin' ? await resolveTerminalZsh(platform) : undefined;
    const terminalZsh = zsh === undefined || 'status' in zsh ? undefined : zsh;
    return { status: 'available', shell: createShellService({ ...options, executable, terminalZsh, identity }) };
  } catch (error) {
    return {
      status: 'unavailable',
      code: 'sandbox-unavailable',
      message: `The shell sandbox could not start: ${error instanceof Error ? error.message : String(error)}`,
      recovery: 'Reinstall Tau to restore its sandbox components.',
    };
  } finally {
    await (custody.executionId === undefined
      ? rm(session.root, { recursive: true, force: true }).catch(() => undefined)
      : finishExecution(options.provider, {
          executionId: custody.executionId,
          sessionBase,
          privateRoot: session.root,
          holds: undefined,
        }));
  }
};
