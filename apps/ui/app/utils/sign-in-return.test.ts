import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { errorCategory } from '@taucad/types/constants';
import type { ChatError as ChatErrorPayload } from '@taucad/types';
import { parseAdmissionFailureForPersistence } from '@taucad/chat-ui/utils/error.utils';
import { chatProjectionLogic } from '#machines/chat-projection.logic.js';
import { lifecycleRow, logRow } from '#machines/chat-projection.fixture.js';
import { refusalOfGesture } from '#utils/run-auto-resume-plan.js';
import type { VisibleFailureSource } from '#utils/run-auto-resume-plan.js';
import { selectAwaitsSignIn, signInReturnStep } from '#utils/sign-in-return.js';
import type { SignInReturnFacts } from '#utils/sign-in-return.js';

/* The caught-up log of one run that failed on its first attempt with `error`. */
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
          },
        }),
      ],
    },
  });
  const { context } = projection.getSnapshot();
  projection.stop();
  return { projection: context, attachmentStatus: 'attached', error: undefined, persistedError: undefined };
};

const unauthenticated: ChatErrorPayload = {
  category: errorCategory.auth,
  title: 'Authentication Required',
  message: 'Authentication is required.',
  code: 'UNAUTHENTICATED',
  httpStatus: 401,
};

const rateLimited: ChatErrorPayload = {
  category: errorCategory.rateLimit,
  title: 'Rate limit exceeded',
  message: 'The model provider asked Tau to wait.',
  code: 'RATE_LIMITED',
  httpStatus: 429,
};

/* A projection before its first answer: it holds no run, and reads as caught up because nothing has told it how long
 * the log is. */
const unreadLog = (): VisibleFailureSource => {
  const projection = createActor(chatProjectionLogic).start();
  const { context } = projection.getSnapshot();
  projection.stop();
  return { projection: context, attachmentStatus: 'unknown', error: undefined, persistedError: undefined };
};

/* The return every fact favours: signed in, the chat shown, its transcript loaded, its run waiting for a sign-in. */
const ready = (): SignInReturnFacts => ({
  identity: 'verified',
  chatShown: true,
  transcript: 'loaded',
  hasRequest: true,
  failure: failedRun(unauthenticated),
});

describe('selectAwaitsSignIn', () => {
  it('should hold for a run the gateway refused for want of a session', () => {
    expect(selectAwaitsSignIn(failedRun(unauthenticated))).toBe(true);
  });

  it('should not hold for another failure, or for a turn the page refused to start', () => {
    const failed = failedRun(rateLimited);
    const refusedSend = refusalOfGesture(
      parseAdmissionFailureForPersistence(new Error(JSON.stringify(unauthenticated))),
      { kind: 'send', projection: failed.projection, createId: () => 'g1' },
    );

    expect(selectAwaitsSignIn(failed)).toBe(false);
    /* The run under the refusal is resumable, but it is not what the sign-in was asked for. */
    expect(selectAwaitsSignIn({ ...failed, persistedError: refusedSend })).toBe(false);
  });
});

describe('signInReturnStep (launch audit N-2)', () => {
  it('should resume once someone is signed in and the chat shows the turn that waits for it', () => {
    expect(signInReturnStep(ready())).toBe('resume');
  });

  it.each(['unknown', 'unverified'] as const)('should wait while the identity is %s', (identity) => {
    expect(signInReturnStep({ ...ready(), identity })).toBe('wait');
  });

  it('should drop the marker for a person who came back without signing in', () => {
    expect(signInReturnStep({ ...ready(), identity: 'signed-out' })).toBe('drop');
  });

  it('should wait for the chat the URL names to be the one shown', () => {
    expect(signInReturnStep({ ...ready(), chatShown: false })).toBe('wait');
  });

  it('should wait for the log to be read before deciding there is nothing to resume', () => {
    expect(signInReturnStep({ ...ready(), failure: unreadLog() })).toBe('wait');
    expect(signInReturnStep({ ...ready(), failure: { ...unreadLog(), projection: undefined } })).toBe('wait');
    expect(signInReturnStep({ ...ready(), failure: { ...unreadLog(), attachmentStatus: 'lost' } })).toBe('wait');
    expect(signInReturnStep({ ...ready(), failure: { ...unreadLog(), attachmentStatus: 'attached' } })).toBe('drop');
  });

  /* The production loop: the card resumed before the transcript was in, and the turn host refused "nothing to
   * continue from yet". */
  it('should wait for the transcript rather than ask for a resume the turn host would refuse', () => {
    expect(signInReturnStep({ ...ready(), transcript: 'loading', hasRequest: false })).toBe('wait');
  });

  it('should drop the marker when the chat holds no turn a sign-in resumes', () => {
    expect(signInReturnStep({ ...ready(), failure: failedRun(rateLimited) })).toBe('drop');
    expect(signInReturnStep({ ...ready(), transcript: 'empty', hasRequest: false })).toBe('drop');
    expect(signInReturnStep({ ...ready(), transcript: 'loaded', hasRequest: false })).toBe('drop');
  });
});
