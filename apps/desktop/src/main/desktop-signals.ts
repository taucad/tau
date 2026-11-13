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

/** Longest line of git's error an event carries. */
const gitErrorLineLimit = 200;

/**
 * The redactions a line of git's error goes through, in order. Each removes a kind of text that can name the person,
 * their machine, their project or a credential; what is left is git's own wording, which is what groups and explains
 * the failure.
 */
const gitErrorRedactions: ReadonlyArray<readonly [RegExp, string]> = [
  // A header, with everything after its name: `Authorization: Bearer …`, `Cookie: …`, `X-Request-Id: …`.
  [/\b(?:proxy-)?authorization\s*[:=].*$|\b(?:set-)?cookie\s*[:=].*$|\bx-[a-z\d-]+\s*[:=].*$/giu, '<header>'],
  // A credential named by its scheme.
  [/\b(?:bearer|basic|token)\s+\S+/giu, '<credential>'],
  // Quoted text: git and git-lfs quote paths, refs, remotes and filter commands.
  [/'[^']*'|"[^"]*"|`[^`]*`/gu, '<redacted>'],
  // A URL, with any userinfo, host, path or query it carries.
  [/\b[a-z][a-z\d+.-]*:\/\/\S*/giu, '<url>'],
  // An scp-style remote or an address: `git@host:owner/repo`, `someone@example.com`.
  [/\S*@\S+/gu, '<remote>'],
  // The object git-lfs names right after it says what it is moving.
  [/\b(downloading|uploading)(\s+object)?(:?)\s+(?!<)\S+/giu, '$1$2$3 <file>'],
  // Anything with a path separator, absolute or relative, POSIX or Windows.
  [/\S*[\\/]\S*/gu, '<path>'],
  // A file or host name: a dot between two name characters.
  [/\S*[\p{L}\d_-]\.[\p{L}\d_-]\S*/gu, '<name>'],
  // Object ids, LFS oids, and long tokens that could be a key.
  [/\b[\da-f]{7,}\b|\b[\w+=-]{24,}/giu, '<id>'],
];

/**
 * The first line of git's error, as an event may carry it.
 *
 * The line is git's first `fatal:` or `error:` line, else its first line at all, since git-lfs writes progress such
 * as `Downloading …` before its error. Paths, file and host names, remote addresses, headers, credentials and ids are
 * replaced by a placeholder, control characters are dropped, and the line is cut to {@link gitErrorLineLimit}.
 *
 * @param stderr - Everything the git command wrote to its error stream.
 * @returns The redacted line, or an empty string when git wrote nothing.
 */
export const redactGitErrorLine = (stderr: string): string => {
  const lines = stderr
    .split(/\r?\n/u)
    .map((line) => line.replaceAll(/\p{Cc}/gu, ' ').trim())
    .filter((line) => line !== '');
  const line = lines.find((candidate) => /^(?:fatal|error)\b/iu.test(candidate)) ?? lines[0] ?? '';
  let redacted = line;
  for (const [pattern, replacement] of gitErrorRedactions) {
    redacted = redacted.replaceAll(pattern, replacement);
  }
  return redacted.replaceAll(/\s+/gu, ' ').trim().slice(0, gitErrorLineLimit);
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
