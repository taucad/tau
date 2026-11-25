import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import { errorCategory } from '@taucad/types/constants';
import type { ChatError as ChatErrorPayload } from '@taucad/types';
import { parseAdmissionFailureForPersistence } from '@taucad/chat-ui/utils/error.utils';
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
} from '@taucad/chat-ui/utils/run-auto-resume';
import {
  autoResumePlanOf,
  autoResumeStillAnswers,
  refusalOfGesture,
  selectVisibleChatErrorEntry,
  selectVisibleFailureResumable,
} from '#utils/run-auto-resume-plan.js';
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

/* The auto-resume budgets are module state: every test starts with them unspent, in any order. */
beforeEach(() => {
  resetAutoResumes();
});

describe('autoResumePlanOf (audit R5)', () => {
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

/* A new chat's projection after its first read answer: caught up, no run. */
const caughtUpEmptyProjection = (): NonNullable<VisibleFailureSource['projection']> => {
  const projection = createActor(chatProjectionLogic).start();
  projection.send({ type: 'batch', answer: { status: 'batch', cursor: 0, nextCursor: 0, endCursor: 0, events: [] } });
  const { context } = projection.getSnapshot();
  projection.stop();
  return context;
};

/* The refusal the page's own credit preflight throws for an account that cannot fund the turn: the gateway's 402
 * payload as JSON, with no request id, since no request was made. */
const creditRefusal = (): Error =>
  new Error(
    JSON.stringify({
      category: errorCategory.credits,
      title: 'Credit Limit Reached',
      message: 'Insufficient Tau credit for this model request.',
      code: 'INSUFFICIENT_CREDIT',
      httpStatus: 402,
      details: { requiredCreditAtoms: '470413', availableCreditAtoms: '0', routeId: 'anthropic-claude-opus-5.5' },
    }),
  );

let nextGesture = 0;
const gestureId = (): string => {
  nextGesture += 1;
  return `g${String(nextGesture)}`;
};

describe('a refusal the page makes at admission (launch audit N-1, A-10)', () => {
  it('should show the credit refusal of a first turn on a healthy, attached chat', () => {
    const projection = caughtUpEmptyProjection();
    const persistedError = refusalOfGesture(parseAdmissionFailureForPersistence(creditRefusal()), {
      kind: 'send',
      projection,
      createId: gestureId,
    });

    const visible = selectVisibleChatErrorEntry({ projection, attachmentStatus: 'attached', persistedError });

    expect(visible?.error.code).toBe('INSUFFICIENT_CREDIT');
    expect(visible?.id).toBe(`refusal:${String(persistedError.requestId)}`);
  });

  it('should show a refusal with no code of its own, and a new identity for each gesture', () => {
    const projection = caughtUpEmptyProjection();
    const refusal = (): ChatErrorPayload =>
      refusalOfGesture(parseAdmissionFailureForPersistence(new Error('This chat has nothing to continue from yet.')), {
        kind: 'send',
        projection,
        createId: gestureId,
      });
    const first = selectVisibleChatErrorEntry({ projection, attachmentStatus: 'attached', persistedError: refusal() });
    const second = selectVisibleChatErrorEntry({ projection, attachmentStatus: 'attached', persistedError: refusal() });

    expect(first?.error.code).toBe('CHAT_TURN_NOT_STARTED');
    expect(second?.id).not.toBe(first?.id);
  });

  it('should show the refusal of a follow-up turn over the failure of the run before it', () => {
    const failed = failedRun(rateLimited());
    const persistedError = refusalOfGesture(parseAdmissionFailureForPersistence(creditRefusal()), {
      kind: 'send',
      projection: failed.projection,
      createId: gestureId,
    });

    expect(selectVisibleChatErrorEntry({ ...failed, persistedError })?.error.code).toBe('INSUFFICIENT_CREDIT');
  });

  it('should retire the refusal once the log holds a run that began after it', () => {
    const persistedError = refusalOfGesture(parseAdmissionFailureForPersistence(creditRefusal()), {
      kind: 'send',
      projection: caughtUpEmptyProjection(),
      createId: gestureId,
    });
    const later = failedRun(rateLimited());

    /* Another page ran the chat since: its run, not this page's old refusal, is what the chat shows. */
    expect(selectVisibleChatErrorEntry({ ...later, persistedError })?.error.code).toBe('RATE_LIMITED');
    expect(selectVisibleChatErrorEntry({ ...later, attachmentStatus: 'lost', persistedError })?.error.code).toBe(
      'RATE_LIMITED',
    );
  });

  /* A send refused while the page was still reading the log: no position to tell a later run from an earlier one. */
  it('should retire a refusal made before the log was read once a run admitted after it is in the log', () => {
    const refusedAt = (time: string): ChatErrorPayload => {
      vi.setSystemTime(new Date(time));
      return refusalOfGesture(parseAdmissionFailureForPersistence(creditRefusal()), {
        kind: 'send',
        projection: undefined,
        createId: gestureId,
      });
    };
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      /* The fixture's run was admitted 2026-09-28T00:00:00Z. */
      const before = refusedAt('2026-09-27T23:00:00.000Z');
      const after = refusedAt('2026-09-28T01:00:00.000Z');
      const failed = failedRun(rateLimited());

      expect(selectVisibleChatErrorEntry({ ...failed, persistedError: before })?.error.code).toBe('RATE_LIMITED');
      expect(selectVisibleFailureResumable({ ...failed, persistedError: before })).toBe(true);
      expect(selectVisibleChatErrorEntry({ ...failed, persistedError: after })?.error.code).toBe('INSUFFICIENT_CREDIT');
      expect(
        selectVisibleChatErrorEntry({
          projection: caughtUpEmptyProjection(),
          attachmentStatus: 'attached',
          persistedError: before,
        })?.error.code,
      ).toBe('INSUFFICIENT_CREDIT');
    } finally {
      vi.useRealTimers();
    }
  });

  it('should retire a refusal made before the log was read once the run is resumed after it', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-09-28T01:00:00.000Z'));
      const refusal = refusalOfGesture(parseAdmissionFailureForPersistence(creditRefusal()), {
        kind: 'send',
        projection: undefined,
        createId: gestureId,
      });
      const failed = failedRun(rateLimited());
      const resumed = createActor(chatProjectionLogic).start();
      resumed.send({
        type: 'batch',
        answer: {
          status: 'batch',
          cursor: 0,
          nextCursor: 4,
          endCursor: 4,
          events: [
            lifecycleRow(0, 'admitted'),
            lifecycleRow(1, 'running'),
            logRow(2, { type: 'run.lifecycle', state: 'failed', attempt: 1, detail: { code: 'RATE_LIMITED' } }),
            /* Another device resumes the run an hour after the refusal. */
            logRow(3, { type: 'run.lifecycle', state: 'running', attempt: 2, recordedAt: '2026-09-28T02:00:00.000Z' }),
          ],
        },
      });
      const { context } = resumed.getSnapshot();
      resumed.stop();

      expect(selectVisibleChatErrorEntry({ ...failed, persistedError: refusal })?.error.code).toBe(
        'INSUFFICIENT_CREDIT',
      );
      expect(
        selectVisibleChatErrorEntry({ projection: context, attachmentStatus: 'attached', persistedError: refusal }),
      ).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  /* The run under a refusal is not the refused gesture's: a card for a refused send may not offer to resume it. */
  it('should call the run resumable for its own failure and for a refused Resume, not for a refused send', () => {
    const failed = failedRun(rateLimited());
    const refused = (gesture: 'send' | 'continue'): ChatErrorPayload =>
      refusalOfGesture(parseAdmissionFailureForPersistence(creditRefusal()), {
        kind: gesture,
        projection: failed.projection,
        createId: gestureId,
      });

    expect(selectVisibleFailureResumable(failed)).toBe(true);
    expect(selectVisibleFailureResumable({ ...failed, persistedError: refused('continue') })).toBe(true);
    expect(selectVisibleFailureResumable({ ...failed, persistedError: refused('send') })).toBe(false);
    expect(autoResumePlanOf({ ...failed, persistedError: refused('send') }, 0)).toBeUndefined();
  });

  it('should stop a resumed wait answering once a send is refused over its failure', () => {
    const failed = failedRun(rateLimited());
    const plan = autoResumePlanOf(failed, now, noJitter);
    expect(plan).toBeDefined();
    if (plan === undefined) {
      return;
    }
    const refused = (gesture: 'send' | 'continue'): ChatErrorPayload =>
      refusalOfGesture(parseAdmissionFailureForPersistence(creditRefusal()), {
        kind: gesture,
        projection: failed.projection,
        createId: gestureId,
      });

    expect(autoResumeStillAnswers(plan, { ...failed, persistedError: refused('continue') })).toBe(true);
    expect(autoResumeStillAnswers(plan, { ...failed, persistedError: refused('send') })).toBe(false);
  });

  it('should still retire a legacy chat-wide error that carries no identity', () => {
    const legacy: ChatErrorPayload = {
      category: errorCategory.generic,
      title: 'Something went wrong',
      message: 'Channel closed (local)',
    };

    expect(
      selectVisibleChatErrorEntry({
        projection: caughtUpEmptyProjection(),
        attachmentStatus: 'attached',
        persistedError: legacy,
      }),
    ).toBeUndefined();
  });
});
