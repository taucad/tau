/**
 * The `shell` tool's host-side contract (desktop shell blueprint, API guide rev 8): bounds, the result union, the
 * approval payload and the permission mode the shell service reads per call.
 *
 * `@taucad/host` is published and cannot import the private `@taucad/chat`, so these are the host's own shapes; the
 * chat schema (W4) mirrors them and its contract test pins the two together.
 *
 * @module
 */
import type { HostToolInvocation, JsonObject } from '@taucad/agent-host';
import type { ShellKind } from '@taucad/native-process-core/shell';

/**
 * Shared bounds for the `shell` tool. Output is counted in bytes; the command and reason in UTF-16 code units.
 *
 * @public
 */
export const shellLimits = {
  commandCharacters: 16_384,
  /** Milliseconds. */
  defaultTimeout: 120_000,
  /** Milliseconds. */
  minTimeout: 1000,
  /** Milliseconds. */
  maxTimeout: 600_000,
  /** Combined stdout and stderr shown inline. */
  inlineOutputBytes: 65_536,
  /** Full output kept in the run's records when inline output is truncated. */
  retainedOutputBytes: 16_777_216,
  reasonCharacters: 500,
  /** Characters of the command shown in the approval prompt; the full text is in the payload. */
  promptCommandCharacters: 2000,
  /** Folders or domains one access request may name, per list. */
  accessEntries: 8,
} as const;

/** Where a saved shell log lives: the host-written, agent read-only, unversioned records row. @public */
export const shellLogDirectory = '.tau/offloaded-tool-results/shell';

/**
 * Who approves widening (blueprint D19): **Ask** puts each widening in front of the person, **Bypass** grants it without
 * a prompt. Neither changes what contains the command.
 *
 * @public
 */
export type PermissionMode = 'ask' | 'bypass';

/** Who decided a widening, recorded on the call's output (D19). @public */
export type ApprovedBy = 'person' | 'bypass';

/** Extra folders and domains for one command, beyond the baseline project view. @public */
export type ShellAccess = Readonly<{
  /** Why the command needs this, in the agent's own words; shown labelled as such, never as Tau's description. */
  reason: string;
  read?: readonly string[] | undefined;
  write?: readonly string[] | undefined;
  domains?: readonly string[] | undefined;
}>;

/** One `shell` call's validated input. @public */
export type ShellInput = Readonly<{
  command: string;
  /** Project-relative working directory; `''` or absent is the checkout root. */
  cwd?: string | undefined;
  /** Milliseconds, clamped to the limits. */
  // oxlint-disable-next-line tau-lint/no-time-unit-suffix -- the Bash tool's model-facing wire field (blueprint API).
  timeoutMs?: number | undefined;
  access?: ShellAccess | undefined;
}>;

/** One output stream as the model sees it. @public */
export type ShellStream = Readonly<{
  /** Output decoded as UTF-8; the tail when truncated. */
  text: string;
  /** Every byte the command wrote to this stream. */
  bytes: number;
  truncated: boolean;
  /** Invalid UTF-8 was replaced with U+FFFD; a saved log keeps the exact bytes. */
  undecodable: boolean;
}>;

/**
 * The full output, present whenever a stream was truncated. A log is referenced only after it was persisted; when that
 * fails the result says so instead of pointing at nothing (A08).
 *
 * @public
 */
export type ShellLog =
  | Readonly<{
      status: 'saved';
      /** Project-relative path; read it with `read_file`. */
      path: string;
      bytes: number;
      /** Bytes beyond the retention limit that were drained and dropped. */
      discardedBytes: number;
    }>
  | Readonly<{ status: 'unavailable'; message: string; discardedBytes: number }>;

/** The durable decision behind a widening: who approved it, under which mode (D19, D25). @public */
export type ShellApprovalRecord = Readonly<{ approvedBy: ApprovedBy; mode: PermissionMode }>;

type ShellRan = Readonly<{
  stdout: ShellStream;
  stderr: ShellStream;
  durationMs: number;
  log?: ShellLog | undefined;
  /** Present when the call widened access. */
  approval?: ShellApprovalRecord | undefined;
}>;

/** Nothing ran. Every code's `message` names its recovery. @public */
export const shellNotStartedCodes = [
  'shell-unavailable',
  'invalid-cwd',
  'checkout-unavailable',
  'root-changed',
  'access-denied',
  'access-unsupported',
  'approval-unavailable',
  'launch-failed',
] as const;

/** @public */
export type ShellNotStartedCode = (typeof shellNotStartedCodes)[number];

/**
 * One `shell` call's result (I6): it settles once, with bounded output and a truthful ending.
 *
 * @public
 */
export type ShellOutput =
  /** A nonzero exit is a completed command; the tool result is an error for anything but exit 0. */
  | (ShellRan & Readonly<{ status: 'completed'; exitCode: number }>)
  /** Ended by a signal Tau did not send, such as a crash. */
  | (ShellRan & Readonly<{ status: 'signalled'; signal: string }>)
  // oxlint-disable-next-line tau-lint/no-time-unit-suffix -- the Bash tool's wire field, echoed (blueprint API).
  | (ShellRan & Readonly<{ status: 'timed-out'; timeoutMs: number }>)
  | (ShellRan & Readonly<{ status: 'cancelled' }>)
  /**
   * The host stopped while the command ran. Recovery writes this from the durable start marker; the command is never
   * run again and the approval it used stays spent.
   */
  | Readonly<{ status: 'interrupted'; message: string; log?: ShellLog | undefined }>
  | Readonly<{ status: 'not-started'; code: ShellNotStartedCode; message: string }>;

/**
 * The one rule for `HostToolResult.isError`.
 *
 * @public
 * @param output - The call's result.
 * @returns Whether the model sees a failed call.
 */
export const isShellError = (output: ShellOutput): boolean => !(output.status === 'completed' && output.exitCode === 0);

/**
 * What the person approves, carried as the durable interrupt's payload (A12). The recall key is `shell:` plus the
 * digest of every field but `toolCallId`, so a retried call with the same request recalls the answer once, and any
 * change to the command, cwd, checkout or access asks again.
 *
 * @public
 */
export type ShellApprovalPayload = JsonObject & {
  readonly kind: 'shell';
  /** The host's shell, so the card names the language the person is approving. */
  readonly shell: ShellKind;
  readonly toolCallId: string;
  readonly command: string;
  /** `sha256:<hex>` of the exact command text. */
  readonly commandDigest: string;
  /** Project-relative; `''` is the checkout root. */
  readonly cwd: string;
  /** The checkout and the admission it was approved against; a re-admitted root asks again. */
  readonly checkout: { readonly runId: string; readonly admission: string; readonly fingerprint: string };
  /** Resolved physical folders and lowercase host names, exactly as they will be granted. */
  readonly access: {
    readonly reason: string;
    readonly read: string[];
    readonly write: string[];
    readonly domains: string[];
  };
  /** An approval covers this one call, never a session (D25). */
  // oxlint-disable-next-line tau-lint/no-bare-time-identifier -- the approval card's wire field (blueprint API).
  readonly lifetime: 'invocation';
};

/**
 * One call, as the tool registry hands it to the shell service. Every field comes from the trusted invocation or the
 * host, never from model input. `runId` is required: an unknown run never falls back to the live project (F5).
 *
 * @public
 */
export type ShellRunRequest = Pick<HostToolInvocation, 'toolCallId' | 'signal' | 'approve'> &
  Readonly<{
    runId: string;
    input: ShellInput;
  }>;
