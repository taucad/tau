import { isResumableRun } from '@taucad/agent-host';
import type { ChatError as NormalizedChatError } from '@taucad/types';
import { parseErrorForPersistence } from '@taucad/chat-ui/utils/error.utils';
import { cardOf } from '@taucad/chat-ui/utils/chat-error-card';
import type { ChatProjection } from '#machines/chat-projection.logic.js';
import { selectCaughtUp, selectCurrentRun, selectRunFailure } from '#machines/chat-projection.logic.js';
import {
  autoResumableProviderUnavailableCode,
  autoResumableRateLimitCode,
  canAutoResumeModelPending,
  modelPendingPollMilliseconds,
  modelPendingResumeBy,
  nextProviderUnavailableRetry,
  nextRateLimitRetry,
  providerUnavailableRetryDelayMilliseconds,
  rateLimitRetryDelayMilliseconds,
} from '#utils/run-auto-resume.js';

/**
 * Which failure the chat shows, and whether it resumes on its own (audit R5).
 *
 * The chat's failure card is presentation. Whether a failure resumes without a click, when, and how often, is the
 * chat's own workflow: `ChatSessionStore` reads {@link autoResumePlanOf} from the same facts the card reads, and the
 * chat's session machine holds the wait as an `after` delay. Closing the pane, scrolling the card out of the virtual
 * window, or a remount no longer stops or restarts it.
 */

/** The facts a chat's visible failure is read from: the host log's projection and the SDK's live and saved errors. */
export type VisibleFailureSource = Readonly<{
  projection?: ChatProjection | undefined;
  attachmentStatus?: 'unknown' | 'attached' | 'lost' | 'refused' | undefined;
  error?: Error | undefined;
  persistedError?: NormalizedChatError | undefined;
}>;

type VisibleChatError = Readonly<{
  error: NormalizedChatError;
  /**
   * The failure's identity from durable data, the same across a rerender, a remount and a projection rebuild: the
   * failed run's attempt, or the refused command's request. Only a live error with neither falls back to the error
   * object's own identity.
   */
  id: string;
}>;

const projectedFailureErrors = new WeakMap<Readonly<{ runId: string; text: string }>, NormalizedChatError>();
const liveErrorIds = new WeakMap<Error | NormalizedChatError, string>();
let lastLiveErrorId = 0;

/** A live error's identity for as long as the chat holds that error object. */
function liveErrorId(error: Error | NormalizedChatError): string {
  let id = liveErrorIds.get(error);
  if (id === undefined) {
    lastLiveErrorId += 1;
    id = `live:${String(lastLiveErrorId)}`;
    liveErrorIds.set(error, id);
  }
  return id;
}

const refusalId = (refusal: NormalizedChatError): string | undefined =>
  refusal.requestId === undefined ? undefined : `refusal:${refusal.requestId}`;

/**
 * The chat's visible failure and its durable identity. Only the caught-up host log can retire a legacy chat-wide error.
 *
 * @param state - The chat's projection, attachment and errors.
 * @returns The failure the chat shows, or `undefined`.
 * @public
 */
export function selectVisibleChatErrorEntry(state: VisibleFailureSource): VisibleChatError | undefined {
  const { projection } = state;
  const caughtUp = projection !== undefined && selectCaughtUp(projection);
  const run = projection === undefined || !caughtUp ? undefined : selectCurrentRun(projection);
  if (
    projection !== undefined &&
    (run?.lifecycle === 'failed' || (run?.lifecycle === 'cancelled' && run.failure?.code === 'USER_STOPPED'))
  ) {
    const failure = selectRunFailure(projection, run.runId);
    if (failure !== undefined) {
      const key = projection.failure;
      if (key !== undefined) {
        let parsed = projectedFailureErrors.get(key);
        if (parsed === undefined) {
          parsed = parseErrorForPersistence(new Error(failure));
          projectedFailureErrors.set(key, parsed);
        }
        // A resumed run that fails again is a new failure: its attempt is part of the identity.
        return { error: parsed, id: `run:${key.runId}:${String(run.attempt)}` };
      }
    }
  }
  if (caughtUp && state.attachmentStatus === 'attached') {
    // A command refusal carries its command identity. A chat-wide legacy error
    // does not. A later healthy run also retires a prior refused Start, even
    // when a different page admitted that run and this page never cleared the
    // old chat record. A refused Resume still belongs to the same paused run;
    // the persisted command records that run identity, not just its command ID.
    const refusal = state.persistedError;
    if (refusal?.requestId === undefined) {
      return undefined;
    }
    const refusedRunId = refusal.details?.['runId'];
    const refusedCommandType = refusal.details?.['commandType'];
    if (
      run !== undefined &&
      (run.lifecycle !== 'paused' || refusedRunId !== run.runId || refusedCommandType !== 'resume')
    ) {
      return undefined;
    }
    return { error: refusal, id: `refusal:${refusal.requestId}` };
  }
  if (state.error) {
    const error = parseErrorForPersistence(state.error);
    return { error, id: refusalId(error) ?? liveErrorId(state.error) };
  }
  const persisted = state.persistedError;
  return persisted === undefined ? undefined : { error: persisted, id: refusalId(persisted) ?? liveErrorId(persisted) };
}

/**
 * Whether the turn host will continue the chat's current run: the caught-up log's current run, never the error text,
 * which can outlive the run it names.
 *
 * @param projection - The chat's projection.
 * @returns `true` where a `continue` gesture will be admitted.
 * @public
 */
export const selectRunResumable = (projection: ChatProjection | undefined): boolean =>
  projection !== undefined && selectCaughtUp(projection) && isResumableRun(selectCurrentRun(projection));

/** The failed run attempt a failure resumes on its own. @public */
export type AutoResumeTarget = Readonly<{ runId: string; attempt: number }>;

/**
 * The current run's failed attempt, when the projection knows it.
 *
 * @param projection - The chat's projection.
 * @returns The attempt, or `undefined`.
 * @public
 */
export const selectAutoResumeTarget = (projection: ChatProjection | undefined): AutoResumeTarget | undefined => {
  const run = projection === undefined ? undefined : selectCurrentRun(projection);
  return run === undefined ? undefined : { runId: run.runId, attempt: run.attempt };
};

/**
 * The gateway attempt key a run abandoned around `MODEL_ATTEMPT_PENDING` waits on, read through the one card map.
 *
 * @param error - The parsed failure.
 * @returns The attempt key, or `undefined` for any other failure.
 * @public
 */
export function pendingAttemptOf(error: NormalizedChatError): string | undefined {
  const abandonedCode = error.code === 'RUN_ABANDONED' ? error.details?.['code'] : undefined;
  const attemptId = error.details?.['attemptId'];
  return typeof abandonedCode === 'string' &&
    cardOf(abandonedCode, error.category).category === 'modelPending' &&
    typeof attemptId === 'string'
    ? attemptId
    : undefined;
}

/** What resumes on its own, after a wait. @public */
export type AutoResumeKind = 'rateLimit' | 'providerUnavailable' | 'modelPending';

/**
 * One automatic resume the chat's session machine waits out: a countdown for a rate limit or a provider outage, or the
 * attempt route asked until the gateway settles a pending model attempt. JSON-safe, because it is an event payload.
 *
 * @public
 */
export type AutoResumePlan = AutoResumeTarget &
  Readonly<{ key: string }> &
  (
    | Readonly<{
        kind: 'rateLimit' | 'providerUnavailable';
        /** The wait, jitter included, chosen when the failure was first offered (N9). Milliseconds. */
        delayMilliseconds: number;
        /** When the countdown ends, in epoch milliseconds, for the card's label. */
        resumeAt: number;
      }>
    | Readonly<{
        kind: 'modelPending';
        attemptId: string;
        /** What is left of the run's bound (`modelPendingResumeBy`). Milliseconds. */
        boundMilliseconds: number;
        /** The pause between two lookups. Milliseconds. */
        pollMilliseconds: number;
      }>
  );

/**
 * The identity of one automatic resume: one kind, one failed attempt.
 *
 * @param kind - What resumes.
 * @param target - The failed attempt.
 * @returns The key.
 * @public
 */
export const autoResumeKeyOf = (kind: AutoResumeKind, target: AutoResumeTarget): string =>
  `${kind}:${target.runId}:${String(target.attempt)}`;

/**
 * The automatic resume the chat's visible failure offers, routed exactly as the failure card routes it: a resumable
 * `RATE_LIMITED` until the run's retries are spent, a resumable `PROVIDER_UNAVAILABLE` once, and a resumable run
 * abandoned around `MODEL_ATTEMPT_PENDING` within the run's bound. Each is offered at most once per failed attempt by
 * the page-wide ledgers in `#utils/run-auto-resume`.
 *
 * @param state - The chat's projection, attachment and errors.
 * @param now - The current time, in epoch milliseconds.
 * @param random - A source in [0, 1) for the backoff's jitter, injected for deterministic tests.
 * @returns The plan, or `undefined` when nothing resumes on its own.
 * @public
 */
export function autoResumePlanOf(
  state: VisibleFailureSource,
  now: number,
  random: () => number = Math.random,
): AutoResumePlan | undefined {
  const error = selectVisibleChatErrorEntry(state)?.error;
  const target = selectAutoResumeTarget(state.projection);
  if (error === undefined || target === undefined || !selectRunResumable(state.projection)) {
    return undefined;
  }
  const { code } = error;
  if (code === autoResumableRateLimitCode) {
    const retry = nextRateLimitRetry(target.runId, target.attempt);
    if (retry === undefined) {
      return undefined;
    }
    const retryAfterSeconds = error.details?.['retryAfterSeconds'];
    const delayMilliseconds = rateLimitRetryDelayMilliseconds({
      retry,
      ...(typeof retryAfterSeconds === 'number' ? { retryAfterSeconds } : {}),
      random,
    });
    return {
      ...target,
      key: autoResumeKeyOf('rateLimit', target),
      kind: 'rateLimit',
      delayMilliseconds,
      resumeAt: now + delayMilliseconds,
    };
  }
  const { category, retry } = cardOf(code, error.category);
  if (category !== 'pausedTurn' || retry !== 'resume') {
    return undefined;
  }
  const attemptId = pendingAttemptOf(error);
  if (attemptId !== undefined) {
    return canAutoResumeModelPending(target.runId, target.attempt, now)
      ? {
          ...target,
          key: autoResumeKeyOf('modelPending', target),
          kind: 'modelPending',
          attemptId,
          boundMilliseconds: Math.max(modelPendingResumeBy(target.runId, now) - now, 0),
          pollMilliseconds: modelPendingPollMilliseconds,
        }
      : undefined;
  }
  if (
    code === autoResumableProviderUnavailableCode &&
    nextProviderUnavailableRetry(target.runId, target.attempt) !== undefined
  ) {
    return {
      ...target,
      key: autoResumeKeyOf('providerUnavailable', target),
      kind: 'providerUnavailable',
      delayMilliseconds: providerUnavailableRetryDelayMilliseconds,
      resumeAt: now + providerUnavailableRetryDelayMilliseconds,
    };
  }
  return undefined;
}
