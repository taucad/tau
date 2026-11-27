import { describe, expect, it } from 'vitest';
import { refusalOf, refusals } from '@taucad/agent-host/wire';
import { errorCategory } from '@taucad/types/constants';
import { cardOf, normalizedErrorCategoryOf, waitLineOf } from '#utils/chat-error-card.js';

describe('cardOf', () => {
  it('takes every known code’s recovery class from the host registry', () => {
    for (const code of Object.keys(refusals)) {
      expect(cardOf(code, errorCategory.generic).retry).toBe(refusalOf(code).retry);
    }
    expect(cardOf('A_CODE_FROM_A_NEWER_BUILD', errorCategory.generic)).toEqual({
      category: errorCategory.generic,
      retry: 'never',
    });
    expect(cardOf('toString', errorCategory.generic)).toEqual({ category: errorCategory.generic, retry: 'never' });
  });

  it.each([
    ['LEADER_VERSION_MISMATCH', 'waitLine'],
    ['PEER_UNRESPONSIVE', 'quiet'],
    ['HOST_FAULT', 'hostFault'],
    ['MODEL_ATTEMPT_PENDING', 'modelPending'],
    ['RUN_UNREADABLE', 'update'],
    ['HISTORY_INVALID', 'historyInvalid'],
    ['EXTERNAL_AGENT_RECOVERY_UNKNOWN', 'externalRestart'],
    ['RESUME_UNAVAILABLE', 'nothingToResume'],
    ['RUN_ABANDONED', 'pausedTurn'],
    ['MODEL_OUTPUT_LIMIT', 'pausedTurn'],
    ['TOOL_RESULT_PERSISTENCE_FAILED', 'pausedTurn'],
    ['EXTERNAL_AGENT_MODEL_UNAVAILABLE', 'switchModel'],
    ['MODEL_ROUTE_PAUSED', 'switchModel'],
    ['BILLING_ACCOUNT_RESTRICTED', 'accountRestricted'],
    ['DEPLOYMENT_UNKNOWN', 'deploymentUnknown'],
  ] as const)('routes %s to the approved %s card', (code, category) => {
    expect(cardOf(code, errorCategory.generic).category).toBe(category);
  });

  /* I1: a run whose server's billing mode is unknown made no model call, so it resumes once the server answers. */
  it('should route DEPLOYMENT_UNKNOWN to its own resumable card', () => {
    expect(cardOf('DEPLOYMENT_UNKNOWN', errorCategory.generic)).toEqual({
      category: 'deploymentUnknown',
      retry: 'resume',
    });
  });

  it('uses one code category for gateway failures even when the HTTP status is 200', () => {
    expect(cardOf('RATE_LIMITED', errorCategory.generic).category).toBe(errorCategory.rateLimit);
    expect(normalizedErrorCategoryOf('PROVIDER_UNAVAILABLE')).toBe(errorCategory.overloaded);
    expect(cardOf('INSUFFICIENT_CREDIT', errorCategory.generic).category).toBe(errorCategory.credits);
  });

  /* A paused route and a restricted account are the gateway's to name and the page's to word (W6, W11a): neither is
   * resumable, and neither falls back to its status's card (a 503's outage card, a 403's generic block). */
  it.each([
    ['MODEL_ROUTE_PAUSED', errorCategory.overloaded, 'switchModel'],
    ['REASONING_REPLAY_REJECTED', errorCategory.server, 'switchModel'],
    ['BILLING_ACCOUNT_RESTRICTED', errorCategory.generic, 'accountRestricted'],
  ] as const)('should route %s to its own card that never offers Resume', (code, statusCategory, category) => {
    expect(cardOf(code, statusCategory)).toEqual({ category, retry: 'never' });
  });

  /* HA5: a `wait` code with a line of its own says it while the send stays queued; a transport code says nothing. */
  it('should give a lined wait code its line and a transport code none', () => {
    expect(waitLineOf('WRITER_LOCKED')).toBe('This chat is running in Tau on this computer.');
    expect(waitLineOf('CHAT_RUN_LIVE')).toBe(
      'A turn is still running in this chat. Your message sends when it finishes.',
    );
    expect(waitLineOf('PEER_UNRESPONSIVE')).toBeUndefined();
    expect(waitLineOf(undefined)).toBeUndefined();
  });
});
