import { beforeEach, describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { errorCategory } from '@taucad/types/constants';
import type { ChatError as ChatErrorPayload } from '@taucad/types';
import { chatProjectionLogic } from '#machines/chat-projection.logic.js';
import { lifecycleRow, logRow } from '#machines/chat-projection.fixture.js';
import {
  maximumRateLimitAutoResumes,
  modelPendingAutoResumeBoundMilliseconds,
  modelPendingPollMilliseconds,
  providerUnavailableRetryDelayMilliseconds,
  recordModelPendingAutoResume,
  recordProviderUnavailableAutoResume,
  recordRateLimitAutoResume,
  resetAutoResumes,
} from '@taucad/ui-core/utils/run-auto-resume';
import { autoResumePlanOf, autoResumeStillAnswers } from '#utils/run-auto-resume-plan.js';
import type { VisibleFailureSource } from '#utils/run-auto-resume-plan.js';

/* The caught-up log of one run that failed on its first attempt with `error`, as the chat's views read it. */
const failedRun = (error: ChatErrorPayload): VisibleFailureSource => {
  const projection = createActor(chatProjectionLogic).start();
  projection.send({
    type: 'batch',
    answer: {
      status: 'batch',
      cursor: 0,
      nextCursor: 3,
      endCursor: 3,
      events: [
        lifecycleRow(0, 'admitted'),
        lifecycleRow(1, 'running'),
        logRow(2, {
          type: 'run.lifecycle',
          state: 'failed',
          attempt: 1,
          detail: {
            code: error.code,
            message: error.message,
            ...(error.httpStatus === undefined ? {} : { status: error.httpStatus }),
            ...(error.details === undefined ? {} : { details: error.details }),
          },
        }),
      ],
    },
  });
  const { context } = projection.getSnapshot();
  projection.stop();
  return { projection: context, attachmentStatus: 'attached', error: undefined, persistedError: error };
};

const rateLimited = (details?: Record<string, unknown>): ChatErrorPayload => ({
  category: errorCategory.rateLimit,
  title: 'Rate limit exceeded',
  message: 'The model provider asked Tau to wait.',
  code: 'RATE_LIMITED',
  httpStatus: 429,
  ...(details === undefined ? {} : { details }),
});

const providerUnavailable: ChatErrorPayload = {
  category: errorCategory.overloaded,
  title: 'Service Temporarily Unavailable',
  message: 'The model provider is temporarily unavailable.',
  code: 'PROVIDER_UNAVAILABLE',
  httpStatus: 503,
};

const abandonedOnPendingAttempt: ChatErrorPayload = {
  category: errorCategory.generic,
  title: 'Error',
  message: 'The gateway has not finished model request req_1:1:5; resume the turn once it has.',
  code: 'RUN_ABANDONED',
  details: { attemptId: 'req_1:1:5', code: 'MODEL_ATTEMPT_PENDING' },
};

const now = 1_000_000;
const noJitter = (): number => 0.5;

describe('autoResumePlanOf (audit R5)', () => {
  beforeEach(() => {
    resetAutoResumes();
  });

  it('should wait out a rate limit for the gateway’s Retry-After', () => {
    expect(autoResumePlanOf(failedRun(rateLimited({ retryAfterSeconds: 30 })), now, noJitter)).toEqual({
      key: 'rateLimit:run_1:1',
      kind: 'rateLimit',
      runId: 'run_1',
      attempt: 1,
      delayMilliseconds: 30_000,
      resumeAt: now + 30_000,
    });
  });

  it('should back off from 200 ms when the gateway sent no Retry-After', () => {
    expect(autoResumePlanOf(failedRun(rateLimited()), now, noJitter)).toMatchObject({
      kind: 'rateLimit',
      delayMilliseconds: 200,
    });
  });

  it('should stop offering a rate limit once the run has spent its automatic resumes', () => {
    for (let attempt = 1; attempt <= maximumRateLimitAutoResumes; attempt += 1) {
      recordRateLimitAutoResume('run_1', attempt + 10);
    }

    expect(autoResumePlanOf(failedRun(rateLimited()), now, noJitter)).toBeUndefined();
  });

  it('should never offer the same failed attempt twice', () => {
    recordRateLimitAutoResume('run_1', 1);

    expect(autoResumePlanOf(failedRun(rateLimited()), now, noJitter)).toBeUndefined();
  });

  it('should wait out a provider outage once', () => {
    expect(autoResumePlanOf(failedRun(providerUnavailable), now)).toEqual({
      key: 'providerUnavailable:run_1:1',
      kind: 'providerUnavailable',
      runId: 'run_1',
      attempt: 1,
      delayMilliseconds: providerUnavailableRetryDelayMilliseconds,
      resumeAt: now + providerUnavailableRetryDelayMilliseconds,
    });

    recordProviderUnavailableAutoResume('run_1', 1);
    expect(autoResumePlanOf(failedRun(providerUnavailable), now)).toBeUndefined();
  });

  it('should wait on a pending model attempt within the run’s bound, measured from when the page first saw it', () => {
    expect(autoResumePlanOf(failedRun(abandonedOnPendingAttempt), now)).toEqual({
      key: 'modelPending:run_1:1',
      kind: 'modelPending',
      runId: 'run_1',
      attempt: 1,
      attemptId: 'req_1:1:5',
      boundMilliseconds: modelPendingAutoResumeBoundMilliseconds,
      pollMilliseconds: modelPendingPollMilliseconds,
    });
    // An offer later in the same run keeps the bound it started with.
    expect(autoResumePlanOf(failedRun(abandonedOnPendingAttempt), now + 60_000)).toMatchObject({
      boundMilliseconds: modelPendingAutoResumeBoundMilliseconds - 60_000,
    });
    expect(
      autoResumePlanOf(failedRun(abandonedOnPendingAttempt), now + modelPendingAutoResumeBoundMilliseconds),
    ).toBeUndefined();
  });

  it('should not wait on a pending model attempt this page already resumed', () => {
    recordModelPendingAutoResume('run_1', 1);

    expect(autoResumePlanOf(failedRun(abandonedOnPendingAttempt), now)).toBeUndefined();
  });

  it('should offer nothing for a failure that does not pass by itself', () => {
    expect(
      autoResumePlanOf(
        failedRun({ category: errorCategory.generic, title: 'Error', message: 'x', code: 'RUN_ABANDONED' }),
        now,
      ),
    ).toBeUndefined();
    expect(
      autoResumePlanOf(
        failedRun({
          category: errorCategory.rateLimit,
          title: 'Funded operation limit reached',
          message: 'The funded-operation failsafe is active.',
          code: 'FUNDED_OPERATION_LIMIT',
        }),
        now,
      ),
    ).toBeUndefined();
  });

  it('should keep a resumed wait answering its failure after the ledger is spent, and only that failure', () => {
    const plan = autoResumePlanOf(failedRun(rateLimited()), now, noJitter);
    expect(plan).toBeDefined();
    if (plan === undefined) {
      return;
    }
    recordRateLimitAutoResume('run_1', 1);

    expect(autoResumeStillAnswers(plan, failedRun(rateLimited()))).toBe(true);
    expect(autoResumeStillAnswers({ ...plan, key: 'rateLimit:run_1:2', attempt: 2 }, failedRun(rateLimited()))).toBe(
      false,
    );
    expect(autoResumeStillAnswers(plan, {})).toBe(false);
  });

  it('should offer nothing before the log is read, or when no failure is visible', () => {
    expect(autoResumePlanOf({ persistedError: rateLimited() }, now)).toBeUndefined();
    expect(autoResumePlanOf({}, now)).toBeUndefined();
  });
});
