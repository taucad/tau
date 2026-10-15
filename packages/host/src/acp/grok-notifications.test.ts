import { describe, expect, it } from 'vitest';
import { grokFailureOf, grokNotificationOf } from '#acp/grok-notifications.js';
/* eslint-disable @typescript-eslint/naming-convention -- Fixtures pin xAI's exact snake_case wire contract. */

describe('Grok notification boundary', () => {
  it('should preserve native retry names and prompt identity while discarding unknown fields', () => {
    expect(
      grokNotificationOf({
        sessionId: 'session',
        update: {
          sessionUpdate: 'retry_state',
          type: 'retrying',
          attempt: 1,
          max_retries: 3,
          reason: 'Busy',
          debug: 'private',
        },
        _meta: { promptId: 'turn', eventId: 'session-1', isReplay: false, opaque: 'private' },
      }),
    ).toEqual({
      sessionId: 'session',
      update: { sessionUpdate: 'retry_state', type: 'retrying', attempt: 1, max_retries: 3, reason: 'Busy' },
      _meta: { promptId: 'turn', eventId: 'session-1', isReplay: false },
    });
  });

  it('should omit live-only child addresses from durable-ready notifications', () => {
    const update = {
      sessionUpdate: 'subagent_spawned',
      subagent_id: 'child',
      child_session_id: 'child',
      parent_session_id: 'session',
      subagent_type: 'explore',
      description: 'Inspect source',
      attempt_id: 'attempt',
    };
    expect(
      grokNotificationOf({ sessionId: 'session', update: { ...update, agentAddress: 'private-address' } }),
    ).toEqual({ sessionId: 'session', update });
  });

  it.each([
    { sessionUpdate: 'future_update' },
    { sessionUpdate: 'served_model', display_name: 'x'.repeat(257) },
    { sessionUpdate: 'retry_state', type: 'retrying', attempt: -1, max_retries: 3, reason: 'Busy' },
    { sessionUpdate: 'auto_compact_started', tokens_used: 82, context_window: 100, percentage: 256, reason: 'Full' },
  ])('should ignore unsupported or malformed notifications: %j', (update) => {
    expect(grokNotificationOf({ sessionId: 'session', update })).toBeUndefined();
  });

  it('should accept older compaction completion without optional metrics', () => {
    expect(
      grokNotificationOf({
        sessionId: 'session',
        update: { sessionUpdate: 'auto_compact_completed', tokens_after: 12 },
      }),
    ).toEqual({ sessionId: 'session', update: { sessionUpdate: 'auto_compact_completed', tokens_after: 12 } });
  });

  it('should never classify an internal retry or compaction error as a failed turn', () => {
    expect(
      grokFailureOf({ sessionUpdate: 'retry_state', type: 'retrying', attempt: 1, max_retries: 3, reason: 'Busy' }),
    ).toBeUndefined();
    expect(grokFailureOf({ sessionUpdate: 'auto_compact_failed', error: 'Summary failed' })).toBeUndefined();
  });

  it.each([
    ['auth', 'access', ['login']],
    ['legacy_auth', 'access', []],
    ['auth_transient', 'service', ['retry']],
    ['context_length', 'limit', ['new_session']],
    ['rate_limited', 'limit', ['retry']],
    ['encrypted_content_mismatch', 'request', ['new_session']],
    ['unknown_error', 'service', []],
    ['invalid_params', 'request', []],
  ])('should offer the correct action for %s without inventing a reset time', (errorType, category, actions) => {
    expect(
      grokFailureOf({
        sessionUpdate: 'retry_state',
        type: 'failed',
        error_type: String(errorType),
        message: 'Explanation',
      }),
    ).toEqual({ category, actions, title: 'Explanation' });
  });

  it('should classify explicitly rate-limited exhaustion as a limit', () => {
    expect(
      grokFailureOf({
        sessionUpdate: 'retry_state',
        type: 'exhausted',
        attempts: 3,
        reason: 'Try later',
        is_rate_limited: true,
      }),
    ).toEqual({ category: 'limit', title: 'Try later', actions: ['retry'] });
  });
});
/* eslint-enable @typescript-eslint/naming-convention -- End of vendor wire names. */
