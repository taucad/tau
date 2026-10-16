import { describe, expect, it } from 'vitest';
import type { GrokNotificationUpdate } from '#acp/grok-notifications.js';
import { finishGrokPresentation, grokNotificationAfter, initialGrokNotificationState } from '#acp/grok-presentation.js';
/* eslint-disable @typescript-eslint/naming-convention -- Fixtures pin xAI's exact snake_case wire contract. */

const owner = { sessionId: 'parent', promptId: 'turn' };
const spawn = (attempt = 'first'): Extract<GrokNotificationUpdate, { sessionUpdate: 'subagent_spawned' }> => ({
  sessionUpdate: 'subagent_spawned',
  parent_session_id: 'parent',
  parent_prompt_id: 'turn',
  child_session_id: 'child',
  subagent_id: 'child',
  attempt_id: attempt,
  subagent_type: 'explore',
  description: 'Inspect source',
  model: 'grok',
});
const progress: GrokNotificationUpdate = {
  sessionUpdate: 'subagent_progress',
  parent_session_id: 'parent',
  child_session_id: 'child',
  subagent_id: 'child',
  attempt_id: 'first',
  duration_ms: 1000,
  turn_count: 1,
  tool_call_count: 2,
  tokens_used: 30,
  context_window_tokens: 100,
  context_usage_pct: 30,
  tools_used: ['grep'],
  error_count: 0,
};
const completed: GrokNotificationUpdate = {
  sessionUpdate: 'subagent_finished',
  child_session_id: 'child',
  subagent_id: 'child',
  attempt_id: 'first',
  status: 'completed',
  tool_calls: 3,
  turns: 2,
  duration_ms: 2000,
  tokens_used: 40,
  output: 'Found it',
};

describe('Grok presentation', () => {
  it('should preserve one child card through progress and final output without counting usage as billing', () => {
    let state = initialGrokNotificationState();
    for (const update of [spawn(), progress, completed]) {
      state = grokNotificationAfter(state, { sessionId: 'parent', update }, owner);
    }
    expect(state.presentation).toEqual({
      subagents: [
        {
          id: 'child',
          attemptId: 'first',
          description: 'Inspect source',
          model: 'grok',
          status: 'completed',
          toolCalls: 3,
          turns: 2,
          duration: 2000,
          tokensUsed: 40,
          output: 'Found it',
        },
      ],
    });
    expect(grokNotificationAfter(state, { sessionId: 'parent', update: progress }, owner).presentation).toEqual(
      state.presentation,
    );
  });

  it('should ignore replay, unrelated sessions, stale turns and duplicate delivery', () => {
    const initial = initialGrokNotificationState();
    const update: GrokNotificationUpdate = { sessionUpdate: 'served_model', display_name: 'Grok Fast' };
    expect(grokNotificationAfter(initial, { sessionId: 'other', update }, owner)).toBe(initial);
    expect(grokNotificationAfter(initial, { sessionId: 'parent', update, _meta: { isReplay: true } }, owner)).toBe(
      initial,
    );
    expect(
      grokNotificationAfter(initial, { sessionId: 'parent', update, _meta: { promptId: 'old-turn' } }, owner),
    ).toBe(initial);
    const notification = { sessionId: 'parent', update, _meta: { eventId: 'parent-4' } };
    const observed = grokNotificationAfter(initial, notification, owner);
    expect(observed.presentation.servedModel).toBe('Grok Fast');
    expect(grokNotificationAfter(observed, notification, owner)).toBe(observed);
    expect(initial.presentation).toEqual({ subagents: [] });
  });

  it('should reject stale child attempts after a resumed child starts', () => {
    let state = initialGrokNotificationState();
    state = grokNotificationAfter(state, { sessionId: 'parent', update: spawn() }, owner);
    state = grokNotificationAfter(state, { sessionId: 'parent', update: spawn('second') }, owner);
    for (const update of [completed, progress, spawn()]) {
      state = grokNotificationAfter(state, { sessionId: 'parent', update }, owner);
    }
    expect(state.presentation.subagents).toEqual([
      { id: 'child', attemptId: 'second', description: 'Inspect source', model: 'grok', status: 'running' },
    ]);
    expect(state.retiredAttempts).toEqual(['["child","first"]']);
  });

  it('should validate both parent session and spawning turn before adding a child', () => {
    const initial = initialGrokNotificationState();
    expect(
      grokNotificationAfter(
        initial,
        { sessionId: 'parent', update: { ...spawn(), parent_session_id: 'other' } },
        owner,
      ),
    ).toBe(initial);
    expect(
      grokNotificationAfter(
        initial,
        { sessionId: 'parent', update: { ...spawn(), parent_prompt_id: 'old-turn' } },
        owner,
      ),
    ).toBe(initial);
  });

  it('should stop foreground animation without inventing a result for a background child', () => {
    let state = initialGrokNotificationState();
    state = grokNotificationAfter(state, { sessionId: 'parent', update: spawn() }, owner);
    state = grokNotificationAfter(
      state,
      {
        sessionId: 'parent',
        update: {
          sessionUpdate: 'auto_compact_started',
          tokens_used: 82,
          context_window: 100,
          percentage: 82,
          reason: 'Full',
        },
      },
      owner,
    );
    expect(state.presentation.activity).toEqual({
      kind: 'compaction',
      status: 'running',
      label: 'Compacting context',
      detail: 'Full',
    });
    expect(finishGrokPresentation(state.presentation)).toEqual({
      subagents: [
        { id: 'child', attemptId: 'first', description: 'Inspect source', model: 'grok', status: 'unobserved' },
      ],
    });
    const failed = grokNotificationAfter(
      state,
      { sessionId: 'parent', update: { sessionUpdate: 'auto_compact_failed', error: 'No summary' } },
      owner,
    );
    expect(finishGrokPresentation(failed.presentation).activity).toEqual({
      kind: 'compaction',
      status: 'failed',
      label: 'Context compaction failed',
      detail: 'No summary',
    });
  });

  it('should bound event history and child cards without dropping observed running children', () => {
    let state = initialGrokNotificationState();
    for (let index = 0; index < 300; index++) {
      state = grokNotificationAfter(
        state,
        {
          sessionId: 'parent',
          update: { ...spawn(), child_session_id: `child-${String(index)}` },
          _meta: { eventId: `parent-${String(index)}` },
        },
        owner,
      );
    }
    expect(state.eventIds).toHaveLength(256);
    expect(state.eventIds[0]).toBe('parent-44');
    expect(state.presentation.subagents).toHaveLength(64);
    expect(state.presentation.subagents[0]?.id).toBe('child-0');
    expect(state.presentation.subagents[63]?.id).toBe('child-63');
  });
});
/* eslint-enable @typescript-eslint/naming-convention -- End of vendor wire names. */
