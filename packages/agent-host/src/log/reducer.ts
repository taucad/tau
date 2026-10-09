import { EventLogError } from '#log/event-log-error.js';
import { classifyLogRow, historyRowTypes } from '#log/event-schema.js';
import type { ReadRow, ReplayReadRow } from '#log/serialization.js';
import { createEventSequence } from '#log/event-sequence.js';
import type { SequenceAnomaly } from '#log/event-sequence.js';
import type { AgentLogEvent, ProviderMessage } from '#log/event-types.js';

type ReducerRow = { readonly event: AgentLogEvent; readonly opaque: boolean };

// Log events are immutable after append; cached ProviderMessage objects are intentionally shared across reductions.
const parsedEvents = new WeakMap<AgentLogEvent, ReducerRow>();

/*
 * A row this build cannot interpret is opaque (CL-R1): it keeps its place in the term's sequence and applies
 * nothing. A value without a row envelope is not a row at all and fails closed here; the tolerant reader quarantines
 * such a line before it reaches the reducer.
 */
const reducerEvent = (candidate: AgentLogEvent): ReducerRow => {
  const cached = parsedEvents.get(candidate);
  if (cached) {
    return cached;
  }
  const classified = classifyLogRow(candidate);
  if (classified.class === 'quarantined') {
    throw new EventLogError('EVENT_INVALID', 'Invalid agent event-log record: it has no row envelope.');
  }
  const row = { event: classified.event, opaque: classified.class === 'opaque' };
  parsedEvents.set(candidate, row);
  parsedEvents.set(classified.event, row);
  return row;
};

const failHistory = (message: string): never => {
  throw new EventLogError('HISTORY_INVALID', message);
};

const assertNewMessageId = (knownMessageIds: ReadonlySet<string>, message: ProviderMessage): void => {
  if (knownMessageIds.has(message.id)) {
    failHistory(`Message id "${message.id}" cannot be appended or reintroduced twice.`);
  }
};

const messageIndex = (messages: readonly ProviderMessage[], messageId: string): number => {
  const index = messages.findIndex((message) => message.id === messageId);
  if (index === -1) {
    failHistory(`Message id "${messageId}" does not exist in the current provider history.`);
  }
  return index;
};

const assertSameEnvelopeIdentity = (prior: ProviderMessage, replacement: ProviderMessage, messageId: string): void => {
  if (replacement.id !== messageId || replacement.role !== prior.role) {
    failHistory(`Envelope replacement for "${messageId}" must preserve message id and role.`);
  }
  if (
    (prior.role === 'tool-input' || prior.role === 'tool-output') &&
    (replacement.role !== prior.role ||
      replacement.toolCallId !== prior.toolCallId ||
      replacement.toolName !== prior.toolName)
  ) {
    failHistory(`Envelope replacement for "${messageId}" must preserve tool-call identity.`);
  }
};

const indexesFor = (messages: readonly ProviderMessage[], messageIds: readonly string[]): number[] =>
  messageIds.map((id) => messageIndex(messages, id));

type EventLogTransition =
  | { readonly duplicate: true }
  | { readonly duplicate: false; readonly event: AgentLogEvent; commit(): void };

/** What replaying one row of history found; the row is kept either way (CL-R6). @internal */
export type ReplayAnomaly = SequenceAnomaly | { readonly kind: 'history'; readonly message: string };

/** Incremental reducer used to validate a transition before it reaches storage. @internal */
export const createEventLogReducer = (): {
  prepare(candidate: AgentLogEvent): EventLogTransition;
  /**
   * Fold one row of history as an opening reader does: never throws. A broken term rule or a history the message
   * rules reject is reported, and after the first rejected history row the messages stop changing, so the chat stays
   * readable while the host refuses to run it (`HISTORY_INVALID`, CL-R2).
   */
  replay(candidate: AgentLogEvent): { readonly duplicate: boolean; readonly anomaly?: ReplayAnomaly };
  /** Replay a parser-owned classification without revalidating the row. */
  replayClassified(row: ReadRow): { readonly duplicate: boolean; readonly anomaly?: ReplayAnomaly };
  /** Replay a privately parsed row using its immutable source identity. */
  replayOwned(row: ReplayReadRow): { readonly duplicate: boolean; readonly anomaly?: ReplayAnomaly };
  messages(): readonly ProviderMessage[];
  /** `false` once a history row was rejected at replay. */
  historyIntact(): boolean;
} => {
  const sequence = createEventSequence();
  const knownMessageIds = new Set<string>();
  const preparedInvocations = new Set<string>();
  const invocationBindings = new Map<string, string>();
  const settledInvocations = new Set<string>();
  let messages: ProviderMessage[] = [];
  let intact = true;

  /** The history rules for one known row: returns its effect, or throws `HISTORY_INVALID`. */
  const transitionOf = (event: AgentLogEvent): (() => void) => {
    let apply: () => void;
    switch (event.type) {
      case 'message.appended': {
        assertNewMessageId(knownMessageIds, event.message);
        apply = () => {
          knownMessageIds.add(event.message.id);
          messages.push(event.message);
        };
        break;
      }
      case 'message.envelope-replaced': {
        const index = messageIndex(messages, event.messageId);
        assertSameEnvelopeIdentity(messages[index]!, event.replacement, event.messageId);
        apply = () => {
          messages[index] = event.replacement;
        };
        break;
      }
      case 'history.compacted': {
        const evictedIds = new Set(event.evictedMessageIds);
        if (evictedIds.size !== event.evictedMessageIds.length) {
          failHistory('A compaction event cannot evict the same message id twice.');
        }
        const indexes = indexesFor(messages, event.evictedMessageIds);
        assertNewMessageId(knownMessageIds, event.summary);
        const insertionIndex = Math.min(...indexes);
        apply = () => {
          messages = messages.filter((message) => !evictedIds.has(message.id));
          messages.splice(insertionIndex, 0, event.summary);
          knownMessageIds.add(event.summary.id);
        };
        break;
      }
      case 'history.rewound': {
        if (event.retainedMessageIds.length > messages.length) {
          failHistory('A history rewind cannot retain more messages than current history contains.');
        }
        for (let index = 0; index < event.retainedMessageIds.length; index++) {
          if (messages[index]!.id !== event.retainedMessageIds[index]) {
            failHistory('A history rewind must retain an unchanged, ordered history prefix.');
          }
        }
        apply = () => {
          for (const removed of messages.slice(event.retainedMessageIds.length)) {
            knownMessageIds.delete(removed.id);
          }
          messages = messages.slice(0, event.retainedMessageIds.length);
        };
        break;
      }
      case 'snapshot-context.refreshed': {
        const index = messageIndex(messages, event.messageId);
        apply = () => {
          messages[index] = { ...messages[index]!, content: event.content };
        };
        break;
      }
      case 'turn.history-projection-committed': {
        if (event.retainedMessageIds.length > messages.length) {
          failHistory('A start-of-turn projection cannot retain more messages than current history contains.');
        }
        for (let index = 0; index < event.retainedMessageIds.length; index++) {
          if (messages[index]!.id !== event.retainedMessageIds[index]) {
            failHistory('A start-of-turn projection must retain an unchanged, ordered history prefix.');
          }
        }
        assertNewMessageId(knownMessageIds, event.message);
        const projected = [...messages.slice(0, event.retainedMessageIds.length), event.message];
        apply = () => {
          messages = projected;
          knownMessageIds.add(event.message.id);
        };
        break;
      }
      case 'safeguard.recorded': {
        if (event.action === 'terminate') {
          apply = () => undefined;
          break;
        }
        assertNewMessageId(knownMessageIds, event.message);
        apply = () => {
          knownMessageIds.add(event.message.id);
          messages.push(event.message);
        };
        break;
      }
      case 'interrupt.recorded':
      case 'turn.changed':
      case 'turn.finalized':
      case 'turn.conflicted':
      case 'turn.failed':
      case 'run.lifecycle': {
        apply = () => undefined;
        break;
      }
      case 'model.invocation-prepared': {
        if (preparedInvocations.has(event.attemptId)) {
          failHistory(`Model invocation attempt "${event.attemptId}" cannot be prepared twice.`);
        }
        apply = () => preparedInvocations.add(event.attemptId);
        break;
      }
      case 'model.invocation-bound': {
        if (!preparedInvocations.has(event.attemptId)) {
          failHistory(`Model invocation attempt "${event.attemptId}" must be prepared before binding.`);
        }
        const prior = invocationBindings.get(event.attemptId);
        if (prior !== undefined && prior !== event.operationId) {
          failHistory(`Model invocation attempt "${event.attemptId}" cannot bind to two operations.`);
        }
        apply = () => invocationBindings.set(event.attemptId, event.operationId);
        break;
      }
      /* CL-R17 (W11, readers first): the gateway's answer for a prepared attempt, at most once, naming the operation
       * the attempt was bound to. It renders nothing. */
      case 'model.invocation-settled': {
        if (!preparedInvocations.has(event.attemptId)) {
          failHistory(`Model invocation attempt "${event.attemptId}" must be prepared before it settles.`);
        }
        if (settledInvocations.has(event.attemptId)) {
          failHistory(`Model invocation attempt "${event.attemptId}" cannot settle twice.`);
        }
        const bound = invocationBindings.get(event.attemptId);
        if (event.outcome !== 'voided' && bound !== undefined && bound !== event.operationId) {
          failHistory(`Model invocation attempt "${event.attemptId}" settled a different operation than it bound.`);
        }
        apply = () => settledInvocations.add(event.attemptId);
        break;
      }
      /* A record a newer writer emitted and this reader's vocabulary has no
       * case for (D14). It is ordered, cursored and replayed like any other,
       * and applies nothing: preserved without being executed. */
      default: {
        event satisfies never;
        apply = () => undefined;
      }
    }

    return apply;
  };

  const prepare = (candidate: AgentLogEvent): EventLogTransition => {
    const { event, opaque } = reducerEvent(candidate);
    const sequenceCheck = sequence.check(event);
    if (sequenceCheck.duplicate) {
      return { duplicate: true };
    }
    const apply = opaque ? () => undefined : transitionOf(event);
    return {
      duplicate: false,
      event,
      commit: () => {
        sequence.commit(event, sequenceCheck.fingerprint);
        apply();
      },
    };
  };

  const applyReplay = (
    { event, opaque }: ReadRow,
    replayed: ReturnType<typeof sequence.replay>,
  ): { readonly duplicate: boolean; readonly anomaly?: ReplayAnomaly } => {
    if (!replayed.duplicate && opaque && historyRowTypes.has(event.type)) {
      intact = false;
    }
    if (replayed.duplicate || replayed.anomaly?.kind === 'conflict' || opaque || !intact) {
      return replayed;
    }
    try {
      transitionOf(event)();
    } catch (error) {
      if (!(error instanceof EventLogError) || error.code !== 'HISTORY_INVALID') {
        throw error;
      }
      intact = false;
      return { duplicate: false, anomaly: { kind: 'history', message: error.message } };
    }
    return replayed;
  };

  const replayClassified = (row: ReadRow): { readonly duplicate: boolean; readonly anomaly?: ReplayAnomaly } =>
    applyReplay(row, sequence.replay(row.event));

  return {
    prepare,
    replay: (candidate) => replayClassified(reducerEvent(candidate)),
    replayClassified,
    replayOwned: (row) => applyReplay(row, sequence.replayOwned(row)),
    messages: () => [...messages],
    historyIntact: () => intact,
  };
};

/**
 * Rebuild provider history from ordered durable events with no I/O or ambient state.
 *
 * Exact leader-epoch re-appends are ignored. Cursor gaps, cursor mutation,
 * non-prefix projections, missing replacement targets, and stable-id reuse fail closed.
 *
 * @param events - Event-log records in physical append order.
 * @returns The provider message array represented by the complete log.
 * @public
 */
export const reduceEventLog = (events: readonly AgentLogEvent[]): readonly ProviderMessage[] => {
  const reducer = createEventLogReducer();
  for (const event of events) {
    const transition = reducer.prepare(event);
    if (!transition.duplicate) {
      transition.commit();
    }
  }
  return reducer.messages();
};
