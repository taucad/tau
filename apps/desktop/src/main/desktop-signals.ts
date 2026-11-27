/**
 * Main-process failure signals sent to Sentry beside the local diagnostics log (browser observability SB11).
 *
 * `@sentry/electron` already reports, from its child-process integration, a renderer or utility that exits
 * `abnormal-exit`, `launch-failed` or `integrity-failure`, and a `crashed` process through its minidump. It only
 * leaves breadcrumbs for `oom` and `killed`, and it does not see renderer hangs, a failed load of the app's own
 * document, or updater failures. Those are the signals here, so none is reported twice.
 *
 * Builders are pure; `error-reporting.ts` sends what they build.
 */

/* eslint-disable @typescript-eslint/naming-convention -- Sentry tag names are snake_case. */

/** One message event, as `Sentry.captureMessage` takes it. */
export type DesktopSignal = {
  readonly message: string;
  readonly level: 'error' | 'warning';
  readonly fingerprint: readonly string[];
  readonly tags: Readonly<Record<string, string>>;
  readonly contexts?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
};

/** Renderer exit reasons this module reports; the SDK reports the others it cares about. */
const reportedGoneReasons: ReadonlySet<string> = new Set(['oom', 'killed']);

/**
 * The event for a renderer that went away, when the SDK would not already report it.
 *
 * @param details - Electron's `render-process-gone` details.
 * @returns The signal, or `undefined` for a clean exit or a reason the SDK reports itself.
 */
export const rendererGoneSignal = (details: unknown): DesktopSignal | undefined => {
  if (typeof details !== 'object' || details === null) {
    return undefined;
  }
  const { reason, exitCode } = details as { reason?: unknown; exitCode?: unknown };
  if (typeof reason !== 'string' || !reportedGoneReasons.has(reason)) {
    return undefined;
  }
  return {
    message: `Renderer gone: ${reason}`,
    level: 'error',
    fingerprint: ['desktop-renderer-gone', reason],
    tags: { reason, ...(typeof exitCode === 'number' ? { exit_code: String(exitCode) } : {}) },
  };
};

/** Milliseconds: a renderer hang this long or shorter is not reported. */
export const rendererHangThreshold = 5000;

/**
 * The event for a renderer hang that ended, once it lasted longer than {@link rendererHangThreshold}.
 *
 * @param duration - Milliseconds the window was unresponsive.
 * @returns The signal, or `undefined` for a short hang.
 */
export const rendererHangSignal = (duration: number): DesktopSignal | undefined =>
  duration <= rendererHangThreshold
    ? undefined
    : {
        message: 'Renderer unresponsive',
        level: 'warning',
        fingerprint: ['desktop-renderer-hang'],
        tags: { hang_seconds: String(Math.round(duration / 1000)) },
        contexts: { hang: { milliseconds: Math.round(duration) } },
      };

/**
 * The event for a renderer hang that has not ended, sent when the hang rule offers its choice (B24). Same fingerprint
 * as the ended one, so both land on one issue.
 *
 * @param duration - Milliseconds the window has been unresponsive so far.
 * @returns The signal.
 */
export const rendererHangOngoingSignal = (duration: number): DesktopSignal => ({
  message: 'Renderer unresponsive',
  level: 'error',
  fingerprint: ['desktop-renderer-hang'],
  tags: { hang_seconds: String(Math.round(duration / 1000)), ongoing: 'true' },
  contexts: { hang: { milliseconds: Math.round(duration) } },
});

/**
 * The event for one step of the renderer reload policy (B11).
 *
 * @param step - What main did: `reload`, `home` or `stop`.
 * @param reason - Electron's `render-process-gone` reason.
 * @param count - Deaths within the last five minutes.
 * @returns The signal.
 */
export const rendererReloadPolicySignal = (step: string, reason: string, count: number): DesktopSignal => ({
  message: `Renderer reload policy: ${step}`,
  level: 'error',
  fingerprint: ['desktop-renderer-reload-policy', step],
  tags: { step, reason, count: String(count) },
});

/** Chromium's `ERR_ABORTED`: a load replaced by another, not a failure. */
const abortedLoad = -3;

/**
 * The event for a failed load of the window's own document.
 *
 * @param load - The `did-fail-load` arguments that matter.
 * @returns The signal, or `undefined` for a subframe or an aborted load.
 */
export const appLoadFailureSignal = (load: {
  readonly errorCode: unknown;
  readonly errorDescription: unknown;
  readonly url: unknown;
  readonly isMainFrame: unknown;
}): DesktopSignal | undefined => {
  if (load.isMainFrame !== true || load.errorCode === abortedLoad) {
    return undefined;
  }
  const code = typeof load.errorCode === 'number' ? String(load.errorCode) : 'unknown';
  const description = typeof load.errorDescription === 'string' ? load.errorDescription : 'unknown';
  let scheme = 'unknown';
  try {
    scheme = new URL(String(load.url)).protocol.replace(/:$/u, '');
  } catch {
    // The URL is only used for its scheme; a malformed one is reported without it.
  }
  return {
    message: `App document failed to load: ${description}`,
    level: 'error',
    fingerprint: ['desktop-app-load-failed', code],
    tags: { error_code: code, url_scheme: scheme },
  };
};

/** Longest updater failure text an event carries. */
const failureTextLimit = 200;

/**
 * An updater failure's text as an event may carry it: a home directory replaced by `~`, so no account name leaves
 * the machine, and cut to {@link failureTextLimit} characters.
 *
 * @param text - The failure text.
 * @returns The scrubbed text.
 */
export const scrubFailureText = (text: string): string =>
  text.replaceAll(/(?:[a-z]:)?[\\/](?:users|home)[\\/][^\\/:'"\r\n]+/giu, '~').slice(0, failureTextLimit);

/** The updater log events that are failures worth an event. */
const updaterFailureEvents: Readonly<Record<string, 'check-or-download' | 'restart'>> = {
  'updater.error': 'check-or-download',
  'updater.restart-failed': 'restart',
};

/**
 * The event for an updater failure the updater logged.
 *
 * @param event - The updater's log event name.
 * @param detail - Its log detail (`{ message }`).
 * @param update - The channel and version that were updating.
 * @returns The signal, or `undefined` for any other log line.
 */
export const updaterFailureSignal = (
  event: string,
  detail: unknown,
  update: { readonly channel: string; readonly version: string },
): DesktopSignal | undefined => {
  const stage = updaterFailureEvents[event];
  if (stage === undefined) {
    return undefined;
  }
  const message =
    typeof detail === 'object' && detail !== null && typeof (detail as { message?: unknown }).message === 'string'
      ? scrubFailureText((detail as { message: string }).message)
      : 'unknown';
  return {
    message: `Update failed (${stage}): ${message}`,
    level: 'error',
    fingerprint: ['desktop-update-failed', stage],
    tags: { update_stage: stage, update_channel: update.channel, update_from_version: update.version },
  };
};

/**
 * The git and git-lfs failures an event can name, each as a fixed sentence. A line of git's error is matched against
 * them and only the sentence leaves the machine: a file, branch, remote or host name in git's error has no shape a
 * pattern can reliably remove (`unable to create file work tree`), so none of git's own text is forwarded.
 */
const gitErrorTemplates: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bnot a git repository\b/iu, 'not a git repository'],
  [/\bgitfile does not point to a valid repository\b/iu, 'gitfile does not point to a valid repository'],
  [/\bis already checked out at\b/iu, 'branch is already checked out in another worktree'],
  [/\balready exists\b/iu, 'path already exists'],
  [/\bis not (?:an )?empty\b/iu, 'path is not empty'],
  [/\b(?:unable to create|could not create)\b.*\bpermission denied\b/iu, 'unable to create a file: permission denied'],
  [/\bno space left on device\b/iu, 'no space left on device'],
  [/\bpermission denied\b/iu, 'permission denied'],
  [/\bunable to (?:create|write)\b|\bcould not (?:create|write)\b/iu, 'unable to write a file'],
  [/\bindex\.lock\b|\bunable to create .*\.lock\b|\bcould not lock\b|\bcannot lock ref\b/iu, 'a git lock file is held'],
  [/\bsmudge (?:filter|error)\b/iu, 'git-lfs smudge failed'],
  [/\bclean filter\b/iu, 'git-lfs clean filter failed'],
  [/\berror downloading object\b|\bobject does not exist on the server\b/iu, 'git-lfs could not download an object'],
  [/\berror uploading object\b|\bbatch (?:request|response)\b/iu, 'git-lfs batch request failed'],
  [/\bgit-lfs\b.*\b(?:not found|command not found)\b|\bis not a git command\b/iu, 'git-lfs is not available'],
  [/\bcould not resolve host\b/iu, 'could not resolve host'],
  [/\bauthentication failed\b|\b(?:401|403)\b/iu, 'remote refused the credentials'],
  [/\brepository\b.*\bnot found\b|\b404\b/iu, 'remote repository not found'],
  [
    /\bunable to access\b|\bcould not read from\b|\bfailed to connect\b|\bconnection (?:reset|refused|timed out)\b|\btimed out\b/iu,
    'remote could not be reached',
  ],
  [/\b(?:rejected|non-fast-forward)\b/iu, 'push was rejected'],
  [/\b(?:invalid reference|not a valid (?:object|ref)|unknown revision|bad revision)\b/iu, 'reference not found'],
  [
    /\b(?:bad object|missing object|loose object .* is corrupt|object file .* is empty|did not receive expected object)\b/iu,
    'object missing or corrupt',
  ],
  [/\bconflict\b|\bunmerged\b|\bwould be overwritten\b/iu, 'local changes or conflicts block the operation'],
  [/\bdetached head\b|\bnot on a branch\b/iu, 'detached head'],
  [/\bout of memory\b|\bcannot allocate\b/iu, 'out of memory'],
];

/**
 * The failure a git error names, as one fixed sentence an event may carry.
 *
 * The line read is git's first `fatal:` or `error:` line, else its first line at all, since git-lfs writes progress
 * such as `Downloading …` before its error. It is matched against {@link gitErrorTemplates}, and only the matching
 * sentence is returned, prefixed by git's own `fatal` or `error`; a line no template matches gives `unclassified`.
 *
 * @param stderr - Everything the git command wrote to its error stream.
 * @returns The sentence, or an empty string when git wrote nothing.
 */
export const redactGitErrorLine = (stderr: string): string => {
  const lines = stderr
    .split(/\r?\n/u)
    .map((line) => line.replaceAll(/\p{Cc}/gu, ' ').trim())
    .filter((line) => line !== '');
  const line = lines.find((candidate) => /^(?:fatal|error)\b/iu.test(candidate)) ?? lines[0];
  if (line === undefined) {
    return '';
  }
  const prefix = /^(fatal|error)\b/iu.exec(line)?.[1]?.toLowerCase();
  const sentence = gitErrorTemplates.find(([pattern]) => pattern.test(line))?.[1] ?? 'unclassified';
  return prefix === undefined ? sentence : `${prefix}: ${sentence}`;
};

/** The engine codes the services utility reports; anything else in a frame is ignored. */
const revisionEngineCodes: ReadonlySet<string> = new Set(['ENGINE_FAILED', 'ENGINE_UNAVAILABLE']);

/**
 * The git subcommand a port's sentence names: `Native Git failed worktree.`, `Native Git stopped fetch: …`,
 * `Native Git could not start lfs.`, or the adapter's `Native Git failed the worktree operation.`
 *
 * @param message - The port's sentence.
 * @returns The subcommand, or `unknown` when the sentence names none a git subcommand could be.
 */
export const gitSubcommandOf = (message: string): string =>
  /^Native Git (?:failed|stopped|could not start) (?:the )?([a-z][a-z\d-]{0,31})\b/u.exec(message)?.[1] ?? 'unknown';

/**
 * The event for a revision-engine failure the services utility reported (`revision-engine-failed`).
 *
 * It carries the code, the git subcommand and the first line of git's error after {@link redactGitErrorLine}, and
 * groups by code and subcommand alone, so one failure seen with many paths or remotes is one issue.
 *
 * @param frame - The utility's frame.
 * @returns The signal, or `undefined` for any other frame.
 */
export const revisionEngineFailureSignal = (frame: unknown): DesktopSignal | undefined => {
  if (typeof frame !== 'object' || frame === null) {
    return undefined;
  }
  const { type, code, message, detail } = frame as {
    type?: unknown;
    code?: unknown;
    message?: unknown;
    detail?: unknown;
  };
  if (type !== 'revision-engine-failed' || typeof code !== 'string' || !revisionEngineCodes.has(code)) {
    return undefined;
  }
  const subcommand = typeof message === 'string' ? gitSubcommandOf(message) : 'unknown';
  const gitError = typeof detail === 'string' ? redactGitErrorLine(detail) : '';
  return {
    message: `Revision engine ${code} (git ${subcommand})${gitError === '' ? '' : `: ${gitError}`}`,
    level: 'error',
    fingerprint: ['desktop-revision-engine-failed', code, subcommand],
    tags: { error_code: code, git_subcommand: subcommand },
    contexts: { revision_engine: { code, subcommand, ...(gitError === '' ? {} : { git_error: gitError }) } },
  };
};

/* Main boot hardening (desktop resilient startup, D5 and D8). Each carries codes and names only, never a path or an
 * error message: a failing `mkdir` or `realpath` names the profile directory, which holds the account name. */

/**
 * A system error's code (`EACCES`, `ENOSPC`, …), or `none`.
 *
 * @param error - Whatever was thrown.
 * @returns The code, when it has the shape of one.
 */
export const errnoOf = (error: unknown): string => {
  const code: unknown = typeof error === 'object' && error !== null ? Reflect.get(error, 'code') : undefined;
  return typeof code === 'string' && /^E[A-Z\d]{1,31}$/u.test(code) ? code : 'none';
};

/**
 * A thrown value's class name, or its type when it is not an `Error`.
 *
 * @param error - Whatever was thrown.
 * @returns A name that cannot carry a path.
 */
export const errorNameOf = (error: unknown): string => {
  const name = error instanceof Error ? error.name : typeof error;
  return /^[A-Za-z_$][\w$]{0,63}$/u.test(name) ? name : 'unknown';
};

/** The bootstrap steps main names in a report. */
export type BootstrapStep =
  | 'startup'
  | 'home-directory'
  | 'authority-directory'
  | 'app-protocol'
  | 'services'
  | 'menu'
  | 'window'
  | 'probe'
  | 'updater';

/**
 * The event for a bootstrap that threw (B18), sent and flushed before the native dialog.
 *
 * @param step - The step bootstrap was in.
 * @param error - What it threw.
 * @returns The signal.
 */
export const bootstrapFailedSignal = (step: BootstrapStep, error: unknown): DesktopSignal => ({
  message: `Bootstrap failed: ${step}`,
  level: 'error',
  fingerprint: ['desktop-bootstrap-failed', step],
  tags: { step, errno: errnoOf(error) },
});

/** The optional bootstrap steps whose failure is skipped (B18). */
export type OptionalBootstrapStep = 'legacy-machines' | 'machines-directory' | 'quick-look-cleanup' | 'agent-discovery';

/**
 * The event for an optional bootstrap step that failed and was skipped (B18).
 *
 * @param step - The step.
 * @param error - What it threw.
 * @returns The signal.
 */
export const optionalStepFailedSignal = (step: OptionalBootstrapStep, error: unknown): DesktopSignal => ({
  message: `Optional startup step failed: ${step}`,
  level: 'warning',
  fingerprint: ['desktop-optional-step-failed', step],
  tags: { step, errno: errnoOf(error) },
});

/**
 * The event for a main-process fault no caller handled (B18).
 *
 * @param kind - `exception` for `uncaughtException`, `rejection` for `unhandledRejection`.
 * @param error - What was thrown or rejected.
 * @returns The signal.
 */
export const mainUncaughtSignal = (kind: 'exception' | 'rejection', error: unknown): DesktopSignal => {
  const errorName = errorNameOf(error);
  return {
    message: `Main ${kind === 'exception' ? 'uncaught exception' : 'unhandled rejection'}: ${errorName}`,
    level: 'error',
    fingerprint: ['desktop-main-uncaught', kind, errorName],
    tags: { kind, error_name: errorName },
  };
};

/**
 * The event for a probe's leftover state that an ordinary launch ignored (B23, B29).
 *
 * @param probe - Which probe left it.
 * @param error - Why admission refused it.
 * @returns The signal.
 */
export const probeLeftoverIgnoredSignal = (probe: 'route-qualification' | 'ota', error: unknown): DesktopSignal => ({
  message: `Leftover ${probe} probe state ignored`,
  level: 'warning',
  fingerprint: ['desktop-probe-leftover-ignored', probe],
  tags: { probe, error_name: errorNameOf(error) },
});

/**
 * The event for a damaged store that was renamed aside instead of discarded (B10, R14).
 *
 * @param store - The store's name.
 * @returns The signal.
 */
export const storeQuarantinedSignal = (store: 'granted-roots'): DesktopSignal => ({
  message: `Damaged store quarantined: ${store}`,
  level: 'warning',
  fingerprint: ['desktop-store-quarantined', store],
  tags: { store },
});

/**
 * The event for a launch the ledger counted as unhealthy (D0, R12), sent by the launch after it.
 *
 * @param previous - The previous launch's furthest stage, how it ended and its mode.
 * @param count - Consecutive unhealthy launches of this build, this one included.
 * @returns The signal.
 */
export const bootUnhealthySignal = (
  previous: { readonly stage: string; readonly ended?: string | undefined; readonly mode: string },
  count: number,
): DesktopSignal => ({
  message: `Unhealthy launch: ${previous.stage}`,
  level: 'error',
  fingerprint: ['desktop-boot-unhealthy', previous.stage],
  tags: { stage: previous.stage, ended: previous.ended ?? 'none', count: String(count), mode: previous.mode },
});

/**
 * The event for a launch that started in safe mode (D0, R12).
 *
 * @param trigger - `requested` (the switch) or `unhealthy-launches` (the ledger's count).
 * @param count - Consecutive unhealthy launches of this build.
 * @returns The signal.
 */
export const safeModeSignal = (trigger: 'requested' | 'unhealthy-launches', count: number): DesktopSignal => ({
  message: `Safe mode: ${trigger}`,
  level: 'warning',
  fingerprint: ['desktop-safe-mode', trigger],
  tags: { trigger, count: String(count) },
});

/**
 * The event for a recovery surface main showed (D0, R12).
 *
 * @param surface - The recovery window, or the native dialog under it.
 * @param trigger - Why it was shown.
 * @returns The signal.
 */
export const recoveryShownSignal = (surface: 'window' | 'dialog', trigger: string): DesktopSignal => ({
  message: `Recovery shown: ${surface}`,
  level: 'warning',
  fingerprint: ['desktop-recovery-shown', surface, trigger],
  tags: { surface, trigger },
});

/**
 * The event for a reset main applied at startup (D0, R12): the store was moved into the quarantine folder, was not
 * there, or could not be moved.
 *
 * @param store - The store.
 * @param outcome - What happened to it.
 * @returns The signal.
 */
export const storeResetSignal = (store: string, outcome: 'moved' | 'absent' | 'failed'): DesktopSignal => ({
  message: `Store reset: ${store} ${outcome}`,
  level: 'warning',
  fingerprint: ['desktop-store-reset', store, outcome],
  tags: { store, outcome },
});

/**
 * The event for a GPU process that exited (B26).
 *
 * @param reason - Electron's exit reason.
 * @param exitCode - Its exit code.
 * @param safeMode - Whether this launch is in safe mode.
 * @returns The signal.
 */
export const gpuProcessGoneSignal = (reason: string, exitCode: number, safeMode: boolean): DesktopSignal => {
  const safeReason = /^[a-z-]{1,32}$/u.test(reason) ? reason : 'unknown';
  return {
    message: `GPU process gone: ${safeReason}`,
    level: 'error',
    fingerprint: ['desktop-gpu-process-gone', safeReason],
    tags: { reason: safeReason, exit_code: String(exitCode), safe_mode: String(safeMode) },
  };
};

/**
 * The event for an update path blocked for a reason a person can act on (B25, B27), sent once for each launch.
 *
 * @param reason - `clock` or `installation-marker`.
 * @param route - The platform the updater runs on.
 * @returns The signal.
 */
export const updateBlockedSignal = (reason: 'clock' | 'installation-marker', route: string): DesktopSignal => ({
  message: `Update blocked: ${reason}`,
  level: 'warning',
  fingerprint: ['desktop-update-blocked', reason],
  tags: { reason, route },
});

/**
 * The event for the guarded automatic install (decision N1): its countdown ran out and the install started, the person
 * cancelled it, or its target already failed to take once and was skipped.
 *
 * @param outcome - What happened.
 * @param targetVersion - The version it installs.
 * @returns The signal.
 */
export const autoInstallSignal = (
  outcome: 'started' | 'cancelled' | 'skipped-repeat',
  targetVersion: string,
): DesktopSignal => {
  const target = /^[\w.+-]{1,64}$/u.test(targetVersion) ? targetVersion : 'unknown';
  return {
    message: `Automatic update install: ${outcome}`,
    level: 'warning',
    fingerprint: ['desktop-update-auto-install', outcome],
    tags: { outcome, target_version: target },
  };
};
