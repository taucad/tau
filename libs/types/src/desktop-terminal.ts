import { z } from 'zod';

/**
 * The desktop `terminal` services concern wire (desktop Bash/Terminal blueprint W5, API guide rev 8).
 *
 * One dedicated MessagePort per pane session. Main validates the sender window and the admitted project root before
 * minting the port, the services host checks the root again, and the preload bridge owns the port: the page sees
 * only validated host frames and sends only validated client frames. A malformed or oversized frame closes the
 * session with a `refused` / `invalid-frame` frame. There is no `approved` field anywhere: a decision names a
 * host-minted request id, never a grant (D21).
 */

/** Fixed IPC routes between preload and main; the renderer never names a channel. @public */
export const desktopTerminalChannels = {
  /** Preload asks main for one session port: `{ requestId, projectRoot }`. */
  open: 'tau:terminal:open',
  /** Main answers with the port, or `{ requestId, refusal }` and no port. */
  port: 'tau:terminal:port',
} as const;

/** @public */
export const terminalLimits = {
  /** UTF-16 code units per `input` frame (a paste larger than this is split by the pane). */
  inputCharacters: 65_536,
  /** UTF-16 code units per `output` frame. */
  outputCharacters: 65_536,
  /** Output the host sends beyond the pane's last acknowledged offset before it pauses the PTY. */
  unacknowledgedBytes: 262_144,
  columns: { min: 2, max: 1000 },
  rows: { min: 1, max: 500 },
  /** Folders or domains one access request may name, per list (`shellLimits.accessEntries` in `@taucad/host`). */
  accessEntries: 8,
  /** Characters in a project root or a host-minted request id. */
  projectRootCharacters: 4096,
  requestIdCharacters: 128,
} as const;

/** @public */
export const terminalSizeSchema = z.strictObject({
  columns: z.number().int().min(terminalLimits.columns.min).max(terminalLimits.columns.max),
  rows: z.number().int().min(terminalLimits.rows.min).max(terminalLimits.rows.max),
});

/** An absolute native folder; the host resolves and revalidates it before spawn. */
const accessRootSchema = z
  .string()
  .min(1)
  .max(terminalLimits.projectRootCharacters)
  .refine((path) => /^(?:\/|[A-Za-z]:\\)/u.test(path) && !path.includes('\u0000'), 'Use an absolute folder path.');

/** An exact host name: no wildcard, no IP literal, no single-label name. */
const accessDomainSchema = z
  .string()
  .max(253)
  .regex(/^(?!-)[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63})+$/u, 'Use an exact host name such as registry.npmjs.org.')
  .refine((name) => !/^[\d.]+$/u.test(name), 'Name a host, not an IP address.');

/** Named extra access for one human session; the agent's `access` grammar, minus `reason`. @public */
export const terminalAccessSchema = z.strictObject({
  read: z.array(accessRootSchema).max(terminalLimits.accessEntries),
  write: z.array(accessRootSchema).max(terminalLimits.accessEntries),
  domains: z.array(accessDomainSchema).max(terminalLimits.accessEntries),
});

/** The project root a pane names when it asks main for a session port. @public */
export const terminalProjectRootSchema = accessRootSchema;

/** Pane → host. @public */
export const terminalClientFrameSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('open'), size: terminalSizeSchema }),
  z.strictObject({ type: z.literal('input'), data: z.string().min(1).max(terminalLimits.inputCharacters) }),
  z.strictObject({ type: z.literal('resize'), size: terminalSizeSchema }),
  /**
   * Cumulative output bytes the pane has painted since `opened`. Must not decrease or exceed what the host sent;
   * either is `invalid-frame`.
   */
  z.strictObject({ type: z.literal('ack'), offset: z.number().int().nonnegative() }),
  /** Ask to replace this session with one that has `access`. The host answers `access-requested`. */
  z.strictObject({ type: z.literal('request-access'), access: terminalAccessSchema }),
  /** The person's answer in trusted pane chrome, bound to the host's request id. Allow starts a new session. */
  z.strictObject({
    type: z.literal('decide-access'),
    requestId: z.string().min(1).max(terminalLimits.requestIdCharacters),
    decision: z.enum(['allow', 'deny']),
  }),
  z.strictObject({ type: z.literal('close') }),
]);

/** Why the host refused to open or continue a session. Unavailable codes match the shell probe. @public */
export const terminalRefusalCodes = [
  'platform-unsupported',
  'sandbox-unavailable',
  'provisioning-required',
  'shell-missing',
  'pty-unavailable',
  'project-not-on-disk',
  'project-not-admitted',
  'session-limit',
  'access-unsupported',
  'request-expired',
  'invalid-frame',
] as const;

/** @public */
export const terminalRefusalSchema = z.strictObject({
  code: z.enum(terminalRefusalCodes),
  message: z.string().max(2000),
  recovery: z.string().max(2000),
});

/** Why a session ended. `replaced` when an allowed access request ended it; the pane offers a fresh one. @public */
export const terminalExitReasons = ['shell-exited', 'closed', 'replaced', 'project-changed', 'host-stopped'] as const;

/** Host → pane. `output` carries terminal data for the renderer; it is never interpreted as HTML. @public */
export const terminalHostFrameSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('opened'),
    session: z.strictObject({
      id: z.string().max(terminalLimits.requestIdCharacters),
      projectLabel: z.string().max(terminalLimits.projectRootCharacters),
      access: terminalAccessSchema,
    }),
  }),
  z.strictObject({
    type: z.literal('output'),
    data: z.string().max(terminalLimits.outputCharacters),
    /** Cumulative byte offset after this frame; the pane echoes it in `ack`. */
    offset: z.number().int().nonnegative(),
  }),
  z.strictObject({
    type: z.literal('access-requested'),
    requestId: z.string().max(terminalLimits.requestIdCharacters),
    access: terminalAccessSchema,
    /** When the request lapses; a later decision is refused with `request-expired`. */
    expiresAt: z.string().max(64),
  }),
  z.strictObject({
    type: z.literal('exited'),
    exitCode: z.number().int().nullable(),
    signal: z.string().max(64).nullable(),
    reason: z.enum(terminalExitReasons),
  }),
  z.strictObject({ type: z.literal('refused'), ...terminalRefusalSchema.shape }),
]);

/** @public */
export type TerminalSize = z.infer<typeof terminalSizeSchema>;
/** @public */
export type TerminalAccess = z.infer<typeof terminalAccessSchema>;
/** @public */
export type TerminalClientFrame = z.infer<typeof terminalClientFrameSchema>;
/** @public */
export type TerminalHostFrame = z.infer<typeof terminalHostFrameSchema>;
/** @public */
export type TerminalRefusal = z.infer<typeof terminalRefusalSchema>;
/** @public */
export type TerminalRefusalCode = (typeof terminalRefusalCodes)[number];
/** @public */
export type TerminalExitReason = (typeof terminalExitReasons)[number];

/**
 * One pane session as preload exposes it. Every method returns at once; nothing the page holds is a promise that can
 * be left pending. The outcome of `open`, including a refusal, arrives as host frames on the listener, and the bridge
 * ends every session with exactly one terminal frame (`refused` or `exited`).
 *
 * @public
 */
export type DesktopTerminalSession = {
  input(data: string): void;
  resize(size: TerminalSize): void;
  ack(offset: number): void;
  requestAccess(access: TerminalAccess): void;
  decideAccess(requestId: string, decision: 'allow' | 'deny'): void;
  close(): void;
};

/** The typed terminal seam the desktop preload exposes as `window.tau.terminal`. @public */
export type DesktopTerminalBridge = {
  open(
    request: Readonly<{ projectRoot: string; size: TerminalSize }>,
    listener: (frame: TerminalHostFrame) => void,
  ): DesktopTerminalSession;
};
