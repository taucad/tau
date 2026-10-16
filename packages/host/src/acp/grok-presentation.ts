/** Pure bounded presentation for Grok's supplemental session notifications. */
import type { GrokNotification, GrokNotificationUpdate } from '#acp/grok-notifications.js';

/** Foreground vendor work, independent of the host run lifecycle. @internal */
export type GrokActivity = {
  kind: 'retry' | 'compaction';
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  label: string;
  detail?: string;
};

/** Latest known attempt of a child session; metrics are observations, not billing. @internal */
export type GrokSubagent = {
  id: string;
  attemptId?: string;
  description?: string;
  model?: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled' | 'unobserved';
  toolCalls?: number;
  turns?: number;
  /** Milliseconds. */
  duration?: number;
  tokensUsed?: number;
  output?: string;
  error?: string;
};

/** Vendor facts suitable for the existing ACP session presentation row. @internal */
export type GrokPresentation = {
  activity?: GrokActivity;
  subagents: GrokSubagent[];
  servedModel?: string;
};

/** Bounded deduplication is session-local and never used as a global event sequence. @internal */
export type GrokNotificationState = {
  presentation: GrokPresentation;
  eventIds: string[];
  retiredAttempts: string[];
};

const historyBound = 256;
const childBound = 64;

/**
 * Start observing a session's vendor updates with optional restored presentation.
 * @internal
 * @param presentation - Previously recorded facts; no old event cursors are assumed.
 * @returns Bounded notification state.
 */
export const initialGrokNotificationState = (presentation?: GrokPresentation): GrokNotificationState => ({
  presentation: presentation ?? { subagents: [] },
  eventIds: [],
  retiredAttempts: [],
});

/**
 * Project only foreground status variants; a terminal hint does not stop the host run.
 * @param update - Validated vendor event.
 * @returns Status replacement, when the event is about foreground work.
 */
const activityOf = (update: GrokNotificationUpdate): GrokActivity | undefined => {
  switch (update.sessionUpdate) {
    case 'retry_state': {
      return update.type === 'retrying'
        ? { kind: 'retry', status: 'running', label: 'Retrying', detail: update.reason }
        : {
            kind: 'retry',
            status: 'failed',
            label: 'Unable to continue',
            detail: update.type === 'failed' ? update.message : update.reason,
          };
    }
    case 'auto_recovery_started': {
      return { kind: 'retry', status: 'running', label: 'Retrying', detail: update.error };
    }
    case 'auto_recovery_exhausted': {
      return { kind: 'retry', status: 'failed', label: 'Unable to continue', detail: update.error };
    }
    case 'auto_compact_started': {
      return { kind: 'compaction', status: 'running', label: 'Compacting context', detail: update.reason };
    }
    case 'auto_compact_completed': {
      return { kind: 'compaction', status: 'completed', label: 'Context compacted' };
    }
    case 'auto_compact_failed': {
      return { kind: 'compaction', status: 'failed', label: 'Context compaction failed', detail: update.error };
    }
    case 'auto_compact_cancelled': {
      return { kind: 'compaction', status: 'cancelled', label: 'Context compaction cancelled' };
    }
    default: {
      return undefined;
    }
  }
};

/**
 * Give attempts an unambiguous key even when vendor IDs contain punctuation.
 * @param child - Child session identity.
 * @param attempt - Vendor attempt identity, when reported.
 * @returns A stable key.
 */
const attemptKey = (child: string, attempt: string | undefined): string => JSON.stringify([child, attempt ?? null]);

/**
 * Begin a child card from the vendor's task description and optional attribution.
 * @param update - A validated spawn notification.
 * @returns The new running attempt.
 */
const spawnedChildOf = (
  update: Extract<GrokNotificationUpdate, { sessionUpdate: 'subagent_spawned' }>,
): GrokSubagent => ({
  id: update.child_session_id,
  ...(update.attempt_id ? { attemptId: update.attempt_id } : {}),
  description: update.description,
  ...(update.model ? { model: update.model } : {}),
  status: 'running',
});

/**
 * Keep vendor completion facts separate from the attempt acceptance decision.
 * @param previous - The matching running child.
 * @param update - Its progress or terminal report.
 * @returns A replacement child card.
 */
const childProgressOf = (
  previous: GrokSubagent,
  update: Extract<GrokNotificationUpdate, { sessionUpdate: 'subagent_progress' | 'subagent_finished' }>,
): GrokSubagent =>
  update.sessionUpdate === 'subagent_progress'
    ? {
        ...previous,
        toolCalls: update.tool_call_count,
        turns: update.turn_count,
        duration: update.duration_ms,
        tokensUsed: update.tokens_used,
      }
    : {
        ...previous,
        status: update.status,
        toolCalls: update.tool_calls,
        turns: update.turns,
        duration: update.duration_ms,
        ...(update.tokens_used === undefined ? {} : { tokensUsed: update.tokens_used }),
        ...(update.output === undefined || update.output === null ? {} : { output: update.output }),
        ...(update.error === undefined || update.error === null ? {} : { error: update.error }),
      };

/**
 * Replace one child's current attempt without reviving completed or superseded work.
 * @param state - Current bounded session state.
 * @param update - Validated vendor update.
 * @returns Updated children and retired attempt tombstones.
 */
const childrenAfter = (state: GrokNotificationState, update: GrokNotificationUpdate): GrokNotificationState => {
  if (
    update.sessionUpdate !== 'subagent_spawned' &&
    update.sessionUpdate !== 'subagent_progress' &&
    update.sessionUpdate !== 'subagent_finished'
  ) {
    return state;
  }
  const children = state.presentation.subagents;
  const previous = children.find((child) => child.id === update.child_session_id);
  const key = attemptKey(update.child_session_id, update.attempt_id ?? undefined);
  if (state.retiredAttempts.includes(key)) {
    return state;
  }
  let next: GrokSubagent;
  let { retiredAttempts } = state;
  if (update.sessionUpdate === 'subagent_spawned') {
    const sameAttempt = previous?.attemptId === (update.attempt_id ?? undefined);
    if (previous && sameAttempt) {
      return state;
    }
    if (previous) {
      retiredAttempts = [...retiredAttempts, attemptKey(previous.id, previous.attemptId)].slice(-historyBound);
    }
    next = spawnedChildOf(update);
  } else {
    if (previous?.status !== 'running' || previous.attemptId !== (update.attempt_id ?? undefined)) {
      return state;
    }
    next = childProgressOf(previous, update);
  }
  let remaining = children.filter((child) => child.id !== next.id);
  if (remaining.length >= childBound) {
    const oldestTerminal = remaining.findIndex((child) => child.status !== 'running');
    if (oldestTerminal === -1) {
      return state;
    }
    remaining = remaining.filter((_child, index) => index !== oldestTerminal);
  }
  return {
    ...state,
    retiredAttempts,
    presentation: {
      ...state.presentation,
      subagents: previous ? children.map((child) => (child.id === next.id ? next : child)) : [...remaining, next],
    },
  };
};

/**
 * Check both parent identities supplied with child reports before applying any presentation.
 * @param update - Validated child or foreground event.
 * @param owner - Current parent session and prompt.
 * @returns Whether the additional child ownership fields agree.
 */
const ownsChildUpdate = (update: GrokNotificationUpdate, owner: { sessionId: string; promptId?: string }): boolean => {
  if (
    (update.sessionUpdate === 'subagent_spawned' || update.sessionUpdate === 'subagent_progress') &&
    update.parent_session_id !== owner.sessionId
  ) {
    return false;
  }
  return (
    update.sessionUpdate !== 'subagent_spawned' ||
    owner.promptId === undefined ||
    update.parent_prompt_id === null ||
    update.parent_prompt_id === undefined ||
    update.parent_prompt_id === owner.promptId
  );
};

/**
 * Apply a live update after validating session and turn ownership; replay cannot restart old activity.
 * @internal
 * @param state - Prior bounded state.
 * @param notification - Boundary-validated vendor notification.
 * @param owner - Current ACP session and the prompt ID Tau sent for its active turn.
 * @returns New state, or the same state when the notification is stale or unrelated.
 */
export const grokNotificationAfter = (
  state: GrokNotificationState,
  notification: GrokNotification,
  owner: { sessionId: string; promptId?: string },
): GrokNotificationState => {
  const { update, _meta: meta } = notification;
  if (
    notification.sessionId !== owner.sessionId ||
    meta?.isReplay === true ||
    (owner.promptId !== undefined && meta?.promptId !== undefined && owner.promptId !== meta.promptId) ||
    (meta?.eventId !== undefined && state.eventIds.includes(meta.eventId))
  ) {
    return state;
  }
  if (!ownsChildUpdate(update, owner)) {
    return state;
  }
  const next = childrenAfter(state, update);
  const activity = activityOf(update);
  return {
    ...next,
    eventIds: meta?.eventId === undefined ? next.eventIds : [...next.eventIds, meta.eventId].slice(-historyBound),
    presentation: {
      ...next.presentation,
      ...(activity === undefined ? {} : { activity }),
      ...(update.sessionUpdate === 'served_model' ? { servedModel: update.display_name } : {}),
    },
  };
};

/**
 * End live observation without inventing completion or cancellation for background children.
 * @internal
 * @param presentation - Current observed vendor facts.
 * @returns Settled presentation without claiming that unfinished work succeeded.
 */
export const finishGrokPresentation = (presentation: GrokPresentation): GrokPresentation => {
  const { activity: _activity, ...rest } = presentation;
  return {
    ...rest,
    ...(presentation.activity?.status === 'running' || presentation.activity === undefined
      ? {}
      : { activity: presentation.activity }),
    subagents: presentation.subagents.map((child) =>
      child.status === 'running' ? { ...child, status: 'unobserved' } : child,
    ),
  };
};
