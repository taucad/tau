import { z } from 'zod';

import { rootedPathSchema } from '#schemas/rooted-path.schema.js';

/**
 * Shared bounds for the `shell` tool (desktop shell API guide rev 8). Output is counted in bytes; the command and
 * reason in UTF-16 code units. `@taucad/host` owns the same table and the host contract test pins the two together.
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

/**
 * Who approves widening (blueprint D19): **Ask** puts each widening in front of the person, **Bypass** grants it without
 * a prompt. Neither changes what contains the command, and there is no unsandboxed mode.
 *
 * @public
 */
export const permissionModes = ['ask', 'bypass'] as const;

/** @public */
export const permissionModeSchema = z.enum(permissionModes);

/** @public */
export type PermissionMode = z.infer<typeof permissionModeSchema>;

/** The mode of a chat with no stored choice, a never-seeded chat and a fresh install (D19). @public */
export const builtInPermissionMode: PermissionMode = 'ask';

/** Who decided a widening: a person, or Bypass. Model or tool output never decides (I9). @public */
export const approvedBySchema = z.enum(['person', 'bypass']);

/** @public */
export type ApprovedBy = z.infer<typeof approvedBySchema>;

/** The shell language a host runs (D14): Bash on macOS and Linux, PowerShell on Windows. @public */
export const shellKinds = ['bash', 'powershell'] as const;

/** @public */
export type ShellKind = (typeof shellKinds)[number];

/**
 * What the model is told about this host's shell: the language and version it writes for. Browser-safe; the desktop
 * host fills it from the probe.
 *
 * @public
 */
export type ShellToolIdentity = Readonly<{
  platform: 'darwin' | 'linux' | 'win32';
  kind: ShellKind;
  /** The version the shell reported inside the sandbox, such as `5.2.21(1)-release`. */
  shellVersion: string;
}>;

const hasNul = (value: string): boolean => value.includes('\u0000');

/** An absolute native folder: POSIX `/…` or Windows `C:\…`. The host resolves and revalidates it before spawn. */
const accessRootSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine((path) => /^(?:\/|[A-Za-z]:\\)/u.test(path) && !hasNul(path), 'Use an absolute folder path.');

const domainLabels = /^[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63})+$/u;

/** An exact host name, lowercased: no wildcard, no IP literal, no single-label or local name. */
const accessDomainSchema = z
  .string()
  .min(1)
  .max(253)
  .toLowerCase()
  .refine(
    (name) =>
      domainLabels.test(name) &&
      !name.split('.').some((label) => label.startsWith('-') || label.endsWith('-')) &&
      !/^[\d.]+$/u.test(name),
    'Use an exact host name such as registry.npmjs.org.',
  );

const accessEntries = <T extends z.ZodType>(item: T) => z.array(item).min(1).max(shellLimits.accessEntries).optional();

/**
 * Extra access for this one command. Its presence always asks the person first (Allow once or Deny) under Ask.
 *
 * @public
 */
export const shellAccessSchema = z
  .strictObject({
    reason: z
      .string()
      .min(1)
      .max(shellLimits.reasonCharacters)
      .describe('Why the command needs this, in one sentence. The person reads it as your words.'),
    read: accessEntries(accessRootSchema).describe('Absolute folders outside the project to read.'),
    write: accessEntries(accessRootSchema).describe('Absolute folders outside the project to write.'),
    domains: accessEntries(accessDomainSchema).describe(
      'Exact host names to reach, such as registry.npmjs.org. Everything else stays blocked.',
    ),
  })
  .refine(
    (access) => access.read !== undefined || access.write !== undefined || access.domains !== undefined,
    'Name at least one folder or domain, or leave access out.',
  );

/** @public */
export const shellInputSchema = z.strictObject({
  command: z
    .string()
    .min(1)
    .max(shellLimits.commandCharacters)
    .refine((command) => !hasNul(command), 'Remove the NUL character from the command.')
    .describe("Script in this host's shell, named in the tool description. Runs in a fresh process with stdin closed."),
  cwd: rootedPathSchema
    .optional()
    .describe("Project-relative working directory. Omit for the project root; '..' and absolute paths are refused."),
  // oxlint-disable-next-line tau-lint/no-time-unit-suffix -- the shell tool's model-facing wire field (API guide rev 8).
  timeoutMs: z
    .number()
    .int()
    .min(shellLimits.minTimeout)
    .max(shellLimits.maxTimeout)
    .optional()
    .describe('Milliseconds before the command and every process it started are stopped. Default 120000.'),
  access: shellAccessSchema
    .optional()
    .describe('Extra folders or host names for this one command. Omit for the project alone with no network.'),
});

/** @public */
export type ShellInput = z.infer<typeof shellInputSchema>;

/** @public */
export type ShellAccess = z.infer<typeof shellAccessSchema>;

const shellStreamSchema = z.object({
  text: z.string().describe('Output decoded as UTF-8; the tail when truncated.'),
  bytes: z.number().int().nonnegative().describe('Every byte the command wrote to this stream.'),
  truncated: z.boolean(),
  undecodable: z.boolean().describe('Invalid UTF-8 was replaced with U+FFFD; a saved log keeps the exact bytes.'),
});

/**
 * Present whenever a stream was truncated. A log is referenced only after it was persisted; when that fails the result
 * says so instead of pointing at nothing (A08).
 */
const shellLogSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('saved'),
    path: rootedPathSchema.describe('Read it with read_file.'),
    bytes: z.number().int().nonnegative(),
    discardedBytes: z.number().int().nonnegative(),
  }),
  z.object({ status: z.literal('unavailable'), message: z.string(), discardedBytes: z.number().int().nonnegative() }),
]);

/** The durable decision behind a widening: who approved it, under which mode (D19, D25). @public */
export const shellApprovalRecordSchema = z.object({ approvedBy: approvedBySchema, mode: permissionModeSchema });

/** @public */
export type ShellApprovalRecord = z.infer<typeof shellApprovalRecordSchema>;

const ranFields = {
  stdout: shellStreamSchema,
  stderr: shellStreamSchema,
  durationMs: z.number().int().nonnegative(),
  log: shellLogSchema.optional(),
  approval: shellApprovalRecordSchema.optional(),
};

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
export const shellOutputSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('completed'), exitCode: z.number().int(), ...ranFields }),
  z.object({ status: z.literal('signalled'), signal: z.string(), ...ranFields }),
  // oxlint-disable-next-line tau-lint/no-time-unit-suffix -- the shell tool's wire field, echoed (API guide rev 8).
  z.object({ status: z.literal('timed-out'), timeoutMs: z.number().int(), ...ranFields }),
  z.object({ status: z.literal('cancelled'), ...ranFields }),
  z.object({ status: z.literal('interrupted'), message: z.string(), log: shellLogSchema.optional() }),
  z.object({ status: z.literal('not-started'), code: z.enum(shellNotStartedCodes), message: z.string() }),
]);

/** @public */
export type ShellOutput = z.infer<typeof shellOutputSchema>;

/**
 * The one rule for a `shell` result's `isError`: anything but a completed exit 0.
 *
 * @public
 * @param output - The call's result.
 * @returns Whether the model sees a failed call.
 */
export const isShellError = (output: ShellOutput): boolean => !(output.status === 'completed' && output.exitCode === 0);

/**
 * What the person approves, carried as the durable interrupt's payload and rendered by the shell approval card. The
 * card reads authority from these fields, never from the prompt text, and shows `access.reason` as the agent's words.
 *
 * @public
 */
export const shellApprovalPayloadSchema = z.object({
  kind: z.literal('shell'),
  shell: z.enum(shellKinds),
  toolCallId: z.string(),
  command: z.string(),
  commandDigest: z.string(),
  cwd: z.string(),
  checkout: z.object({ runId: z.string(), admission: z.string(), fingerprint: z.string() }),
  access: z.object({
    reason: z.string(),
    read: z.array(z.string()),
    write: z.array(z.string()),
    domains: z.array(z.string()),
  }),
  // oxlint-disable-next-line tau-lint/no-bare-time-identifier -- the approval card's wire field (API guide rev 8).
  lifetime: z.literal('invocation'),
});

/** @public */
export type ShellApprovalPayload = z.infer<typeof shellApprovalPayloadSchema>;

/**
 * The language name a person and a model read for a shell kind.
 *
 * @public
 * @param kind - The host's shell kind.
 * @returns `Bash` or `PowerShell`.
 */
export const shellLanguageName = (kind: ShellKind): string => (kind === 'powershell' ? 'PowerShell' : 'Bash');

/**
 * The host line appended to the `shell` description, naming the language and major version the model writes for.
 *
 * @public
 * @param identity - The host's probed shell.
 * @returns One sentence.
 */
export const shellHostDescription = (identity: ShellToolIdentity): string => {
  const major = /^\d+(?:\.\d+)?/u.exec(identity.shellVersion)?.[0];
  const platform = identity.platform === 'darwin' ? 'macOS' : identity.platform === 'win32' ? 'Windows' : 'Linux';
  const invocation =
    identity.kind === 'powershell'
      ? '`-NoLogo -NoProfile -NonInteractive -Command`'
      : '`bash --noprofile --norc -c`, so no profile or rc file is read';
  return `On this ${platform} host the shell is ${shellLanguageName(identity.kind)}${major === undefined ? '' : ` ${major}`}, run as ${invocation}. Write ${shellLanguageName(identity.kind)} syntax.`;
};
