import { describe, expect, it } from 'vitest';
import { refusalOf, refusals } from '@taucad/agent-host/wire';
import { errorCategory } from '@taucad/types/constants';
import { cardOf, normalizedErrorCategoryOf } from '#utils/chat-error-card.js';

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
    ['LEADER_VERSION_MISMATCH', 'otherBuild'],
    ['MODEL_ATTEMPT_PENDING', 'modelPending'],
    ['RUN_UNREADABLE', 'update'],
    ['HISTORY_INVALID', 'historyInvalid'],
    ['EXTERNAL_AGENT_RECOVERY_UNKNOWN', 'externalRestart'],
    ['RESUME_UNAVAILABLE', 'nothingToResume'],
    ['RUN_ABANDONED', 'pausedTurn'],
    ['EXTERNAL_AGENT_MODEL_UNAVAILABLE', 'switchModel'],
  ] as const)('routes %s to the approved %s card', (code, category) => {
    expect(cardOf(code, errorCategory.generic).category).toBe(category);
  });

  it('uses one code category for gateway failures even when the HTTP status is 200', () => {
    expect(cardOf('RATE_LIMITED', errorCategory.generic).category).toBe(errorCategory.rateLimit);
    expect(normalizedErrorCategoryOf('PROVIDER_UNAVAILABLE')).toBe(errorCategory.overloaded);
    expect(cardOf('INSUFFICIENT_CREDIT', errorCategory.generic).category).toBe(errorCategory.credits);
  });
});
