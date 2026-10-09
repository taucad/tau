/**
 * The one refusal registry (D11, I17): every code that crosses a seam or ends a run, with its recovery.
 *
 * Producers type a code as {@link RefusalCode}; readers parse it as an open string and resolve it with
 * {@link refusalOf}, so a code a newer build adds reads as `never` instead of failing the reader (D16).
 * Zod-free and import-free: a leaf of `@taucad/agent-host/wire`.
 */

/** How a client recovers from a code. @public */
export type RetryClass =
  /** The same command is refused again until the person changes something: show the card. */
  | 'never'
  /** A condition that clears by itself: re-send the same key later. No run ends with a `wait` code. */
  | 'wait'
  /** The run can continue: offer "Resume" (D21). */
  | 'resume'
  /** The person must sign in first, then resume. */
  | 'reauth';

/** The process that produces a code. Documentation as data. @public */
export type RefusalOwner =
  | 'host'
  | 'log'
  | 'channel'
  | 'gateway'
  | 'transport'
  | 'external'
  | 'browser'
  | 'daemon'
  | 'revisions'
  | 'unknown';

/** One registry entry. The page's card keys live in apps/ui (SC-G3). @public */
export type RefusalEntry = Readonly<{ owner: RefusalOwner; retry: RetryClass }>;

/* eslint-disable @typescript-eslint/naming-convention -- refusal codes are SCREAMING_SNAKE wire strings. */
/**
 * Every code that crosses a seam or ends a run, with its owner and retry class. Each entry's JSDoc is the code's
 * recovery; the page's cards, the resumable set and the code union all derive from this object.
 *
 * @public
 */
export const refusals = {
  // ── host: admission, run and command answers (W7 owns the producers) ─────────────────────────
  /** Another run holds the chat; `details.state` names it. Re-send the same key once it settles. */
  CHAT_RUN_LIVE: { owner: 'host', retry: 'wait' },
  /** A different command id reused this run id; mint a new run id. A re-send with the original key answers `replayed`. */
  RUN_ID_TAKEN: { owner: 'host', retry: 'never' },
  /** Nothing on this chat can be continued; the card offers "Try again" (a re-send or a rewind). */
  RESUME_UNAVAILABLE: { owner: 'host', retry: 'never' },
  /** A run whose executing host is gone, recorded by a takeover. Offer "Resume". */
  RUN_ABANDONED: { owner: 'host', retry: 'resume' },
  /** This chat admitted no run. */
  NO_RUN_ADMITTED: { owner: 'host', retry: 'never' },
  /** A rewinding trigger did not retain an unchanged strict history prefix. */
  HISTORY_PREFIX_INVALID: { owner: 'host', retry: 'never' },
  /** A second, differing settlement for one attempt. */
  SETTLEMENT_CONFLICT: { owner: 'host', retry: 'never' },
  /** A settlement for a run nothing admitted. */
  SETTLEMENT_WITHOUT_RUN: { owner: 'host', retry: 'never' },
  /** The revision root refused a lease this run already holds; re-send once it is released. */
  TURN_ALREADY_LEASED: { owner: 'host', retry: 'wait' },
  /** Another tab or process leads this chat now; address only a newer generation (SC-R10). */
  LEADERSHIP_LOST: { owner: 'host', retry: 'wait' },
  /** A newer build wrote a row of this run; only an update reads it. */
  RUN_UNREADABLE: { owner: 'host', retry: 'never' },
  /** The gateway has not finished the step's last attempt; Tau waits and continues by itself (EQ1). */
  MODEL_ATTEMPT_PENDING: { owner: 'host', retry: 'wait' },
  /** The attempt belongs to another account; sign in as it, then resume (W11 GI-Q6). */
  MODEL_ATTEMPT_OTHER_ACCOUNT: { owner: 'host', retry: 'reauth' },
  /** The model stream went silent past its stall bound (T9 E9). */
  MODEL_STREAM_STALLED: { owner: 'host', retry: 'resume' },
  /** A prepared model invocation has no recorded resolution; Resume reconciles it first (W3, RV1-F3). */
  INVOCATION_UNRESOLVED: { owner: 'host', retry: 'resume' },
  /** The host is closing (was `LAUNCHER_CLOSED`); re-send to its successor. */
  HOST_CLOSED: { owner: 'host', retry: 'wait' },
  /** The host configures no model and the admission named none. */
  HOST_MODEL_UNAVAILABLE: { owner: 'host', retry: 'never' },
  /** The interrupt is not awaiting a resolution (was `INTERRUPT_NOT_FOUND` on the worker leg). */
  INTERRUPT_NOT_PENDING: { owner: 'host', retry: 'never' },
  /** This interrupt already has a durable resolution; a second resolution cannot be appended. */
  INTERRUPT_ALREADY_RESOLVED: { owner: 'host', retry: 'never' },
  /** The run is paused on an interrupt; resolve it first. */
  INTERRUPT_PENDING: { owner: 'host', retry: 'never' },
  /** The steer reached a run that ended before it could deliver it. */
  STEER_NOT_DELIVERED: { owner: 'host', retry: 'never' },
  /** The command names a run that is not live. */
  RUN_NOT_LIVE: { owner: 'host', retry: 'never' },
  /** The owner read `commandId` but not the payload (SC-R4); nothing was applied. */
  COMMAND_UNREADABLE: { owner: 'host', retry: 'never' },
  /** A verb this owner does not implement yet (the browser's `interrupt` until W7). */
  COMMAND_UNSUPPORTED: { owner: 'host', retry: 'never' },
  /** A chat id that is not one storage path segment. */
  STORAGE_PATH_INVALID: { owner: 'host', retry: 'never' },
  /** A parameter file could not be resolved for a tool. */
  PARAMETER_RESOLUTION_FAILED: { owner: 'host', retry: 'never' },

  // ── host: compaction (today `HostCompactionError`) ──────────────────────────────────────────
  SUMMARY_REQUIRED: { owner: 'host', retry: 'resume' },
  NO_EVICTABLE_HISTORY: { owner: 'host', retry: 'resume' },
  SESSION_LOG_INTEGRITY: { owner: 'host', retry: 'resume' },
  CIRCUIT_BREAKER_OPEN: { owner: 'host', retry: 'resume' },

  // ── log: the chat log (W3; today `EventLogErrorCode`) ───────────────────────────────────────
  EVENT_INVALID: { owner: 'log', retry: 'never' },
  LINE_INVALID: { owner: 'log', retry: 'never' },
  EVENT_OUT_OF_ORDER: { owner: 'log', retry: 'never' },
  EVENT_MUTATED: { owner: 'log', retry: 'never' },
  /** The chat's history cannot be replayed: start a new chat; the log is kept (CL-R2). */
  HISTORY_INVALID: { owner: 'log', retry: 'never' },
  LOG_CLOSED: { owner: 'log', retry: 'wait' },
  /** A newer writer moved the fence; the stale append was refused and the log reopens (D5). */
  LOG_FENCED: { owner: 'log', retry: 'wait' },
  LOG_POISONED: { owner: 'log', retry: 'never' },
  STORAGE_NOT_WRITABLE: { owner: 'log', retry: 'never' },
  STORAGE_SHORT_READ: { owner: 'log', retry: 'never' },
  STORAGE_SHORT_WRITE: { owner: 'log', retry: 'never' },
  /** Another writer holds the log; the OPFS open failure moves here from `STORAGE_NOT_WRITABLE`. */
  WRITER_LOCKED: { owner: 'log', retry: 'wait' },

  // ── channel: `@taucad/rpc` ──────────────────────────────────────────────────────────────────
  /** Closed here. On a command: effect unknown, re-send the same key. */
  CHANNEL_CLOSED: { owner: 'channel', retry: 'wait' },
  /** The owner said goodbye. */
  PEER_CLOSED: { owner: 'channel', retry: 'wait' },
  /** The port reported the owner's death (Node only). */
  PEER_GONE: { owner: 'channel', retry: 'wait' },
  /** The owner stopped answering; in a browser this is how death shows (was `LEADER_RESPONSE_TIMEOUT`, `WORKER_CRASHED`). */
  PEER_UNRESPONSIVE: { owner: 'channel', retry: 'wait' },
  /** A request or subscribe frame the receiver could not read, with a readable id. */
  FRAME_UNREADABLE: { owner: 'channel', retry: 'never' },
  /** A frame of another rpc wire version, with a readable id. */
  WIRE_VERSION_UNSUPPORTED: { owner: 'channel', retry: 'never' },
  /** Arguments that fail the protocol schema. */
  WIRE_VALIDATION_FAILED: { owner: 'channel', retry: 'never' },

  // ── browser: the resident worker and its leadership (W6) ────────────────────────────────────
  /** The addressed leader generation was replaced; address only a newer one (SC-R10). */
  LEADER_GENERATION_STALE: { owner: 'browser', retry: 'wait' },
  /** Another build leads this chat; the chat waits until its holder releases (EQ4). */
  LEADER_VERSION_MISMATCH: { owner: 'browser', retry: 'wait' },
  /** A leader of another project answered. */
  LEADER_WORKSPACE_MISMATCH: { owner: 'browser', retry: 'never' },
  /** The worker session is not initialized. */
  SESSION_NOT_INITIALIZED: { owner: 'browser', retry: 'never' },
  WORKER_UNAVAILABLE: { owner: 'browser', retry: 'never' },
  WEB_LOCKS_UNAVAILABLE: { owner: 'browser', retry: 'never' },
  BROADCAST_CHANNEL_UNAVAILABLE: { owner: 'browser', retry: 'never' },
  SYNC_ACCESS_HANDLE_UNAVAILABLE: { owner: 'browser', retry: 'never' },
  COMPUTE_AUTHORITY_UNAVAILABLE: { owner: 'browser', retry: 'never' },
  PROMPT_BLOCKS_REQUIRED: { owner: 'browser', retry: 'never' },

  // ── daemon: `tau host` and its placement ────────────────────────────────────────────────────
  /** The daemon is not paired with this account (W6 RH-R13). */
  HOST_NOT_PAIRED: { owner: 'daemon', retry: 'reauth' },
  /** The daemon's revision surface is not served on this connection. */
  REVISIONS_UNAVAILABLE: { owner: 'daemon', retry: 'wait' },
  /** A parameter watch was reset under its observer. */
  WATCH_RESET: { owner: 'daemon', retry: 'wait' },

  // ── gateway: apps/api's LLM gateway (`gatewayErrorCodes`) ───────────────────────────────────
  BILLING_RECOVERY_UNAVAILABLE: { owner: 'gateway', retry: 'never' },
  FUNDED_HELPER_LIMIT: { owner: 'gateway', retry: 'never' },
  FUNDED_OPERATION_LIMIT: { owner: 'gateway', retry: 'never' },
  /** The customer's Tau balance cannot fund the call; top up, then resume. */
  INSUFFICIENT_CREDIT: { owner: 'gateway', retry: 'resume' },
  INVALID_REQUEST: { owner: 'gateway', retry: 'resume' },
  MODEL_NOT_IN_CATALOG: { owner: 'gateway', retry: 'never' },
  ORIGIN_NOT_ALLOWED: { owner: 'gateway', retry: 'never' },
  /**
   * The provider account behind the key Tau spent against has no credit, is not billable, or (on Cloud) refused the
   * credential itself, `providerCode: 'credential_rejected'`. Distinct from `INSUFFICIENT_CREDIT`, which is the
   * customer's own Tau balance. `details` carries `providerId`, the provider's own `providerCode` when it sent one, and
   * `accountOwner`: `operator` on a self-hosted API, whose message is the provider's own sentence, or `tau` on Cloud,
   * whose message never names the supplier's state.
   */
  PROVIDER_ACCOUNT_EXHAUSTED: { owner: 'gateway', retry: 'never' },
  PROVIDER_UNAVAILABLE: { owner: 'gateway', retry: 'resume' },
  RATE_LIMITED: { owner: 'gateway', retry: 'resume' },
  /**
   * The serialized request is past the funded request contract's byte bound (or the object count its digest walks).
   * A 413: resending the same history meets the same refusal, and no model choice changes it. `details` carries
   * `maximumBytes`.
   */
  REQUEST_TOO_LARGE: { owner: 'gateway', retry: 'never' },
  UNAUTHENTICATED: { owner: 'gateway', retry: 'reauth' },
  /**
   * The upstream provider refused the relayed request (a non-429 4xx). Distinct from `PROVIDER_UNAVAILABLE` so a
   * malformed or unsupported request is not reported as a provider outage. The message names the upstream status only;
   * the upstream body is never forwarded.
   */
  UPSTREAM_REJECTED: { owner: 'gateway', retry: 'resume' },
  /** The gateway voided a key it never admitted (HTTP 409); the host continues under a new key (W11). */
  ATTEMPT_VOIDED: { owner: 'gateway', retry: 'never' },
  /**
   * The account an attempt lookup names is closing, closed or restricted (HTTP 403), so the attempt cannot be resolved
   * and nothing new can be charged to it. Signing in again does not change it; the card points to account support (W11).
   */
  BILLING_ACCOUNT_CLOSED: { owner: 'gateway', retry: 'never' },
  /**
   * Tau's operators paused this model route (HTTP 503, `details.routeId`). Resuming re-sends to the same paused route,
   * so the card offers another model instead; its copy is the page's, never the gateway's sentence.
   */
  MODEL_ROUTE_PAUSED: { owner: 'gateway', retry: 'never' },
  /**
   * Admission refused spending on this account (HTTP 403): the account is restricted, or a billing case puts its own
   * balance in question. Neither another model nor signing in changes it; the card points to support.
   */
  BILLING_ACCOUNT_RESTRICTED: { owner: 'gateway', retry: 'never' },

  // ── transport: the host's gateway client ────────────────────────────────────────────────────
  MODEL_PROVIDER_UNSUPPORTED: { owner: 'transport', retry: 'never' },
  MALFORMED_RESPONSE: { owner: 'transport', retry: 'resume' },
  NETWORK_ERROR: { owner: 'transport', retry: 'resume' },
  UNKNOWN_GATEWAY_ERROR: { owner: 'transport', retry: 'never' },

  // ── external: ACP agents (W10) ──────────────────────────────────────────────────────────────
  /** Log in to the agent's own CLI. `never` until W10's login flow classes it `reauth` (keeps today's resumability). */
  EXTERNAL_AGENT_AUTH_REQUIRED: { owner: 'external', retry: 'never' },
  EXTERNAL_AGENT_MODEL_UNAVAILABLE: { owner: 'external', retry: 'never' },
  EXTERNAL_AGENT_UNAVAILABLE: { owner: 'external', retry: 'never' },
  EXTERNAL_AGENT_CONTENT_UNSUPPORTED: { owner: 'external', retry: 'never' },
  EXTERNAL_AGENT_UNSUPPORTED: { owner: 'external', retry: 'never' },
  EXTERNAL_AGENT_CONFIG_UNAVAILABLE: { owner: 'external', retry: 'never' },
  EXTERNAL_AGENT_INVALID_SESSION: { owner: 'external', retry: 'never' },
  EXTERNAL_AGENT_RECOVERY_UNKNOWN: { owner: 'external', retry: 'never' },
  EXTERNAL_AGENT_CANCELLED: { owner: 'external', retry: 'never' },
  /** Resumability is the stop's own `actions` (`externalStopIsResumable`, W10). */
  EXTERNAL_AGENT_LIMIT_REACHED: { owner: 'external', retry: 'never' },
  /** Resumability is the stop's own `actions` (`externalStopIsResumable`, W10). */
  EXTERNAL_AGENT_FAILED: { owner: 'external', retry: 'never' },
  CLI_TOO_OLD: { owner: 'external', retry: 'never' },
  CLI_NOT_FOUND: { owner: 'external', retry: 'never' },
  ADAPTER_NOT_INSTALLED: { owner: 'external', retry: 'never' },
  ADAPTER_NO_BIN: { owner: 'external', retry: 'never' },
  MCP_RUN_INACTIVE: { owner: 'external', retry: 'never' },
  TOOL_NOT_ALLOWED: { owner: 'external', retry: 'never' },

  // ── revisions (type-tested in packages/host; W5, W8) ────────────────────────────────────────
  BRANCH_NEEDS_REVISION: { owner: 'revisions', retry: 'never' },
  /** A branch name under a namespace Tau keeps for itself (`conflicts/`, D14). */
  BRANCH_NAME_RESERVED: { owner: 'revisions', retry: 'never' },
  CHECKOUT_CONFLICT: { owner: 'revisions', retry: 'never' },
  ENGINE_FAILED: { owner: 'revisions', retry: 'never' },
  ENGINE_UNAVAILABLE: { owner: 'revisions', retry: 'never' },
  INVALID_REPOSITORY: { owner: 'revisions', retry: 'never' },
  INVALID_TRANSPORT: { owner: 'revisions', retry: 'never' },
  /** The remote transfer exceeded its byte bound; change the requested scope before retrying. */
  FETCH_LIMIT_EXCEEDED: { owner: 'revisions', retry: 'never' },
  LFS_REMOTE_UNSUPPORTED: { owner: 'revisions', retry: 'never' },
  MISSING_LARGE_OBJECT: { owner: 'revisions', retry: 'never' },
  /** The remote's copy is damaged: terminal after one attempt (D22). */
  REMOTE_DAMAGED: { owner: 'revisions', retry: 'never' },
  REMOTE_FORBIDDEN: { owner: 'revisions', retry: 'never' },
  REMOTE_NOT_ENTITLED: { owner: 'revisions', retry: 'never' },
  REMOTE_NOT_FOUND: { owner: 'revisions', retry: 'never' },
  REMOTE_MOVED: { owner: 'revisions', retry: 'never' },
  REMOTE_QUOTA_EXCEEDED: { owner: 'revisions', retry: 'never' },
  REMOTE_REAUTHORIZATION_REQUIRED: { owner: 'revisions', retry: 'never' },
  REMOTE_REF_CONFLICT: { owner: 'revisions', retry: 'never' },
  REMOTE_REJECTED: { owner: 'revisions', retry: 'never' },
  REMOTE_UNAUTHORIZED: { owner: 'revisions', retry: 'never' },
  REMOTE_UNAVAILABLE: { owner: 'revisions', retry: 'never' },
  UNKNOWN_REVISION: { owner: 'revisions', retry: 'never' },
  UNSUPPORTED_OPERATION: { owner: 'revisions', retry: 'never' },
  BASE_CUT_FAILED: { owner: 'revisions', retry: 'never' },
  /** A lost compare-and-swap on the head; the checkout re-reads and retries. */
  CAS_LOST: { owner: 'revisions', retry: 'wait' },
  LEASE_UNAVAILABLE: { owner: 'revisions', retry: 'never' },
  CHECKOUT_UNKNOWN: { owner: 'revisions', retry: 'never' },
  /** The branch or publish machine is busy with another verb (W5 RM-S8). */
  REVISIONS_BUSY: { owner: 'revisions', retry: 'wait' },
  /** Another root holds the turn's lease (W5, RV2-F1). */
  LEASE_HELD_ELSEWHERE: { owner: 'revisions', retry: 'wait' },
  // W8 placement (TS-S4 types `TurnPlacementRefusalCode` against these)
  PLACEMENT_REFUSED: { owner: 'revisions', retry: 'never' },
  TURN_UNKNOWN: { owner: 'revisions', retry: 'never' },
  PROJECT_MISMATCH: { owner: 'revisions', retry: 'never' },
  SESSION_FENCED: { owner: 'revisions', retry: 'never' },
  TOOL_PORT_REVOKED: { owner: 'revisions', retry: 'never' },
  CUT_FAILED: { owner: 'revisions', retry: 'wait' },
  TURN_RELEASED: { owner: 'revisions', retry: 'never' },
} as const satisfies Record<string, RefusalEntry>;
/* eslint-enable @typescript-eslint/naming-convention -- end refusal registry. */

/** A code a producer may emit. @public */
export type RefusalCode = keyof typeof refusals;

const isRefusalCode = (code: string): code is RefusalCode => Object.hasOwn(refusals, code);

const unknownEntry: RefusalEntry = Object.freeze({ owner: 'unknown', retry: 'never' });

/**
 * Resolve a code read from the wire or the log; an unknown code never fails a reader (D11, D16).
 *
 * @param code - Any code, typed or read as an open string.
 * @returns Its registry entry, or `{ owner: 'unknown', retry: 'never' }`.
 * @public
 */
export const refusalOf = (code: string): RefusalEntry => (isRefusalCode(code) ? refusals[code] : unknownEntry);

/**
 * Whether a run that ended with this code can be continued by "Resume" (D21). A `wait` code never ends a run.
 *
 * @param code - The run's failure code.
 * @returns `true` for retry class `resume` or `reauth`.
 * @public
 */
export const isResumable = (code: string): boolean => {
  const { retry } = refusalOf(code);
  return retry === 'resume' || retry === 'reauth';
};
