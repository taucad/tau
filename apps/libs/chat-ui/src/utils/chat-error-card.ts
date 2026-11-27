import { refusalOf } from '@taucad/agent-host/wire';
import type { RefusalCode, RetryClass } from '@taucad/agent-host/wire';
import { errorCategory } from '@taucad/types/constants';
import type { ErrorCategory } from '@taucad/types';
import type { chatTurnNotStartedCode } from '#utils/error.utils.js';

/** A card the page can show for a coded refusal. @public */
export type CodeCardCategory =
  | ErrorCategory
  | 'pausedTurn'
  | 'historyTidy'
  | 'chatTooLong'
  | 'providerAccount'
  | 'updateHost'
  | 'switchModel'
  | 'nothingToResume'
  | 'otherDevice'
  | 'waitingOnSync'
  | 'turnNotStarted'
  | 'waitLine'
  | 'modelPending'
  | 'update'
  | 'historyInvalid'
  | 'externalRestart'
  | 'fundedLimit'
  | 'billingRecovery'
  | 'deploymentUnknown'
  | 'accountRestricted'
  | 'reload'
  | 'storageUnwritable'
  | 'browserStorage'
  | 'pair'
  | 'hostFault'
  | 'quiet';

type CodeCard = Readonly<{
  category: CodeCardCategory;
  /** A gateway code's normalized category, independent of the card a live run shows. */
  normalized?: ErrorCategory;
  /**
   * The card's own title, for a refusal whose sentence the page never renders (IS3). Every surface that names the
   * failure (the card, the sidebar's row) says these words, so the gateway's sentence stays in Tau Debug.
   */
  headline?: string;
  /**
   * A `wait` code's own line (HA5 code→copy table): what the chat says while a send waits on it, once it has waited
   * its bound, and the words of its card. The send stays queued, so the line offers nothing to press.
   */
  waitLine?: string;
}>;

/** The page's one typed code-to-card map; retry classes remain the host registry's (§5.8, SC-G3). */
/* eslint-disable @typescript-eslint/naming-convention -- these are the wire's SCREAMING_SNAKE codes. */
const codeCards = {
  RUN_ABANDONED: { category: 'pausedTurn' },
  NETWORK_ERROR: { category: 'pausedTurn' },
  PROVIDER_UNAVAILABLE: { category: 'pausedTurn', normalized: errorCategory.overloaded },
  MALFORMED_RESPONSE: { category: 'pausedTurn' },
  MODEL_OUTPUT_LIMIT: { category: 'pausedTurn' },
  MODEL_STREAM_STALLED: { category: 'pausedTurn' },
  INVOCATION_UNRESOLVED: { category: 'pausedTurn' },
  TOOL_RESULT_PERSISTENCE_FAILED: { category: 'pausedTurn' },
  UPSTREAM_REJECTED: { category: 'pausedTurn', normalized: errorCategory.server },
  SESSION_LOG_INTEGRITY: { category: 'historyTidy' },
  SUMMARY_REQUIRED: { category: 'historyTidy' },
  NO_EVICTABLE_HISTORY: { category: 'chatTooLong' },
  CIRCUIT_BREAKER_OPEN: { category: 'chatTooLong' },
  REQUEST_TOO_LARGE: { category: 'chatTooLong' },
  PROVIDER_ACCOUNT_EXHAUSTED: { category: 'providerAccount', normalized: errorCategory.overloaded },
  WIRE_VERSION_UNSUPPORTED: { category: 'updateHost' },
  FRAME_UNREADABLE: { category: 'updateHost' },
  WIRE_VALIDATION_FAILED: { category: 'updateHost' },
  INVALID_REQUEST: { category: 'switchModel' },
  EXTERNAL_AGENT_MODEL_UNAVAILABLE: { category: 'switchModel' },
  MODEL_ROUTE_PAUSED: { category: 'switchModel', headline: 'This model is paused' },
  REASONING_REPLAY_REJECTED: { category: 'switchModel', headline: 'This model cannot continue this chat' },
  BILLING_ACCOUNT_RESTRICTED: { category: 'accountRestricted' },
  RESUME_UNAVAILABLE: { category: 'nothingToResume' },
  RUN_ACTIVE_ON_ANOTHER_DEVICE: { category: 'otherDevice', waitLine: 'This chat is running on your other device.' },
  SEGMENTS_UNREADABLE: { category: 'waitingOnSync', waitLine: 'Tau is checking your other devices.' },
  BRANCH_UNAVAILABLE: { category: 'waitingOnSync' },
  /* Q3: two processes on one computer; past the still-closing bound the chat says where it runs. */
  WRITER_LOCKED: { category: 'waitLine', waitLine: 'This chat is running in Tau on this computer.' },
  CHAT_RUN_LIVE: {
    category: 'waitLine',
    waitLine: 'A turn is still running in this chat. Your message sends when it finishes.',
  },
  LEADER_VERSION_MISMATCH: {
    category: 'waitLine',
    waitLine: 'Another tab has a different version of Tau open on this chat. Reload that tab, and your message sends.',
  },
  REVISIONS_UNAVAILABLE: {
    category: 'waitLine',
    waitLine: "This project's history is still opening. Your message sends when it's ready.",
  },
  /* HA-I8: a transport or handoff code is re-sent by the outbox under "Reconnecting…", never a card of its own. */
  CHANNEL_CLOSED: { category: 'quiet' },
  PEER_CLOSED: { category: 'quiet' },
  PEER_GONE: { category: 'quiet' },
  PEER_UNRESPONSIVE: { category: 'quiet' },
  LEADERSHIP_LOST: { category: 'quiet' },
  LEADER_GENERATION_STALE: { category: 'quiet' },
  LOG_FENCED: { category: 'quiet' },
  HOST_CLOSED: { category: 'quiet' },
  LOG_CLOSED: { category: 'quiet' },
  /* Every other `wait` without a line of its own is re-sent the same way: the revisions and placement waits. */
  TURN_ALREADY_LEASED: { category: 'quiet' },
  WATCH_RESET: { category: 'quiet' },
  CAS_LOST: { category: 'quiet' },
  REVISIONS_BUSY: { category: 'quiet' },
  LEASE_HELD_ELSEWHERE: { category: 'quiet' },
  CUT_FAILED: { category: 'quiet' },
  /* A Stop superseded it: the send ends quietly. */
  COMMAND_SUPERSEDED: { category: 'quiet' },
  MODEL_ATTEMPT_PENDING: { category: 'modelPending' },
  BILLING_RECOVERY_UNAVAILABLE: { category: 'billingRecovery' },
  DEPLOYMENT_UNKNOWN: { category: 'deploymentUnknown' },
  FUNDED_OPERATION_LIMIT: { category: 'fundedLimit' },
  RUN_UNREADABLE: { category: 'update' },
  HISTORY_INVALID: { category: 'historyInvalid' },
  LINE_INVALID: { category: 'historyInvalid' },
  EVENT_INVALID: { category: 'historyInvalid' },
  EVENT_OUT_OF_ORDER: { category: 'historyInvalid' },
  EVENT_MUTATED: { category: 'historyInvalid' },
  STORAGE_NOT_WRITABLE: { category: 'storageUnwritable' },
  STORAGE_SHORT_WRITE: { category: 'storageUnwritable' },
  STORAGE_SHORT_READ: { category: 'storageUnwritable' },
  STORAGE_PATH_INVALID: { category: 'storageUnwritable' },
  LOG_POISONED: { category: 'storageUnwritable' },
  SYNC_ACCESS_HANDLE_UNAVAILABLE: { category: 'browserStorage' },
  WEB_LOCKS_UNAVAILABLE: { category: 'browserStorage' },
  BROADCAST_CHANNEL_UNAVAILABLE: { category: 'browserStorage' },
  WORKER_UNAVAILABLE: { category: 'reload' },
  HOST_NOT_PAIRED: { category: 'pair' },
  HOST_FAULT: { category: 'hostFault' },
  EXTERNAL_AGENT_RECOVERY_UNKNOWN: { category: 'externalRestart' },
  INSUFFICIENT_CREDIT: { category: errorCategory.credits, normalized: errorCategory.credits },
  RATE_LIMITED: { category: errorCategory.rateLimit, normalized: errorCategory.rateLimit },
  UNAUTHENTICATED: { category: errorCategory.auth },
  MODEL_ATTEMPT_OTHER_ACCOUNT: { category: errorCategory.auth },
  CHAT_TURN_NOT_STARTED: { category: 'turnNotStarted' },
} as const satisfies Partial<Record<RefusalCode | typeof chatTurnNotStartedCode, CodeCard>>;
/* eslint-enable @typescript-eslint/naming-convention -- end of the card map. */

const knownCodeCard = (code: string | undefined): CodeCard | undefined =>
  code !== undefined && Object.hasOwn(codeCards, code) ? codeCards[code as keyof typeof codeCards] : undefined;

/** The card category and action class for an open wire code. Unknown codes are never resumable. @public */
export const cardOf = (
  code: string | undefined,
  fallback: ErrorCategory,
): Readonly<{ category: CodeCardCategory; retry: RetryClass }> => ({
  category: knownCodeCard(code)?.category ?? fallback,
  retry: code === undefined ? 'never' : refusalOf(code).retry,
});

/** A gateway's code outranks its HTTP status, including after a 200 stream began. @public */
export const normalizedErrorCategoryOf = (code: string): ErrorCategory | undefined => knownCodeCard(code)?.normalized;

/**
 * The page's own title for a coded refusal whose sentence it never renders (IS3), or `undefined` for a code without one.
 *
 * @param code - The refusal's wire code.
 * @returns The card's title.
 * @public
 */
export const pageHeadlineOf = (code: string | undefined): string | undefined => knownCodeCard(code)?.headline;

/**
 * A `wait` code's own line (HA5 code→copy table), or `undefined` for a code the "Reconnecting…" cue speaks for.
 *
 * @param code - The refusal's wire code.
 * @returns The line.
 * @public
 */
export const waitLineOf = (code: string | undefined): string | undefined => knownCodeCard(code)?.waitLine;
