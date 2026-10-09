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
  | 'peerUnresponsive'
  | 'updateHost'
  | 'switchModel'
  | 'nothingToResume'
  | 'otherTab'
  | 'turnNotStarted'
  | 'otherBuild'
  | 'modelPending'
  | 'update'
  | 'historyInvalid'
  | 'externalRestart'
  | 'fundedLimit'
  | 'billingRecovery';

type CodeCard = Readonly<{
  category: CodeCardCategory;
  /** A gateway code's normalized category, independent of the card a live run shows. */
  normalized?: ErrorCategory;
}>;

/** The page's one typed code-to-card map; retry classes remain the host registry's (§5.8, SC-G3). */
/* eslint-disable @typescript-eslint/naming-convention -- these are the wire's SCREAMING_SNAKE codes. */
const codeCards = {
  RUN_ABANDONED: { category: 'pausedTurn' },
  NETWORK_ERROR: { category: 'pausedTurn' },
  PROVIDER_UNAVAILABLE: { category: 'pausedTurn', normalized: errorCategory.overloaded },
  MALFORMED_RESPONSE: { category: 'pausedTurn' },
  UPSTREAM_REJECTED: { category: 'pausedTurn', normalized: errorCategory.server },
  SESSION_LOG_INTEGRITY: { category: 'historyTidy' },
  SUMMARY_REQUIRED: { category: 'historyTidy' },
  NO_EVICTABLE_HISTORY: { category: 'chatTooLong' },
  CIRCUIT_BREAKER_OPEN: { category: 'chatTooLong' },
  REQUEST_TOO_LARGE: { category: 'chatTooLong' },
  PROVIDER_ACCOUNT_EXHAUSTED: { category: 'providerAccount', normalized: errorCategory.overloaded },
  PEER_UNRESPONSIVE: { category: 'peerUnresponsive' },
  WIRE_VERSION_UNSUPPORTED: { category: 'updateHost' },
  INVALID_REQUEST: { category: 'switchModel' },
  EXTERNAL_AGENT_MODEL_UNAVAILABLE: { category: 'switchModel' },
  RESUME_UNAVAILABLE: { category: 'nothingToResume' },
  LEADERSHIP_LOST: { category: 'otherTab' },
  LEADER_VERSION_MISMATCH: { category: 'otherBuild' },
  MODEL_ATTEMPT_PENDING: { category: 'modelPending' },
  BILLING_RECOVERY_UNAVAILABLE: { category: 'billingRecovery' },
  FUNDED_OPERATION_LIMIT: { category: 'fundedLimit' },
  RUN_UNREADABLE: { category: 'update' },
  HISTORY_INVALID: { category: 'historyInvalid' },
  EXTERNAL_AGENT_RECOVERY_UNKNOWN: { category: 'externalRestart' },
  INSUFFICIENT_CREDIT: { category: errorCategory.credits, normalized: errorCategory.credits },
  RATE_LIMITED: { category: errorCategory.rateLimit, normalized: errorCategory.rateLimit },
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
