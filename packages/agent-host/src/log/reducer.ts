// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { EventLogError } from '#log/event-log-error.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { parseLogEvent } from '#log/event-schema.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { createEventSequence } from '#log/event-sequence.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { AgentLogEvent, ProviderMessage } from '#log/event-types.js';

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

/** Incremental reducer used to validate a transition before it reaches storage. @internal */
export const createEventLogReducer = (): {
  prepare(candidate: AgentLogEvent): EventLogTransition;
  messages(): readonly ProviderMessage[];
} => {
  const sequence = createEventSequence();
  const knownMessageIds = new Set<string>();
  let messages: ProviderMessage[] = [];

  const prepare = (candidate: AgentLogEvent): EventLogTransition => {
    const event = parseLogEvent(candidate);
    const sequenceCheck = sequence.check(event);
    if (sequenceCheck.duplicate) {
      return { duplicate: true };
    }

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
      case 'run.lifecycle': {
        apply = () => undefined;
        break;
      }
    }

    return {
      duplicate: false,
      event,
      commit: () => {
        sequence.commit(event, sequenceCheck.fingerprint);
        apply();
      },
    };
  };

  return { prepare, messages: () => [...messages] };
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
