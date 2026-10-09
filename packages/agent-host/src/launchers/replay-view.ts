import { createPortableId } from '#harness/session-record.js';
import { emptyChatLedger, foldClassifiedChatLedger } from '#log/chat-ledger.js';
import type { ChatLedger } from '#log/chat-ledger.js';
import { readEventLogBatch } from '#log/event-log-appender.js';
import type { EventLogAppender } from '#log/event-log-appender.js';
import type { AgentLogEvent } from '#log/event-types.js';
import { createEventLogReducer } from '#log/reducer.js';
import { projectLogRow } from '#log/projection-facts.js';
import type { ProjectionBatch, ProjectionFact, ProjectionSourceHealth } from '#log/projection-facts.js';
import { parseEventLogBytes } from '#log/serialization.js';

/** Immutable published view over a privately maintained tolerant replay. @internal */
export type ReplayView = Readonly<{
  bytes: Uint8Array<ArrayBuffer>;
  generation: string;
  ledger: ChatLedger;
  sourceHealth: ProjectionSourceHealth;
  log: Pick<EventLogAppender, 'read' | 'readBatch' | 'messages'>;
  projectionBatch(
    input: Readonly<{ chatId: string; cursor: number; limit: number; maxBytes: number }>,
  ): ProjectionBatch;
  extend(bytes: Uint8Array<ArrayBuffer>): ReplayView;
}>;

/**
 * Compare current authoritative bytes before reusing any decoded history.
 * @param prefix - Previously acquired bytes.
 * @param bytes - Current authoritative bytes.
 * @returns Whether every prior byte is unchanged.
 * @internal
 */
export const isBytePrefix = (prefix: Uint8Array<ArrayBuffer>, bytes: Uint8Array<ArrayBuffer>): boolean => {
  if (prefix === bytes) {
    return true;
  }
  if (prefix.byteLength > bytes.byteLength) {
    return false;
  }
  let index = 0;
  if (prefix.byteOffset % 4 === 0 && bytes.byteOffset % 4 === 0) {
    const wordCount = Math.floor(prefix.byteLength / 4);
    const prefixWords = new Uint32Array(prefix.buffer, prefix.byteOffset, wordCount);
    const sourceWords = new Uint32Array(bytes.buffer, bytes.byteOffset, wordCount);
    for (let word = 0; word < wordCount; word++) {
      if (prefixWords[word] !== sourceWords[word]) {
        return false;
      }
    }
    index = wordCount * 4;
  }
  for (; index < prefix.byteLength; index++) {
    if (prefix[index] !== bytes[index]) {
      return false;
    }
  }
  return true;
};

/**
 * Build one read-only replay; no writer, lock, persisted rows or metadata authority.
 * @param bytes - Current authoritative bytes.
 * @param generation - Opaque identity of this source incarnation.
 * @returns The decoded view with private append-only reduction state.
 * @internal
 */
export const createReplayView = (bytes: Uint8Array<ArrayBuffer>, generation: string): ReplayView => {
  const reducer = createEventLogReducer();
  const opaque = new Set<AgentLogEvent>();
  let events: readonly AgentLogEvent[] = [];
  let ledger = emptyChatLedger;
  let facts: readonly ProjectionFact[] = [];
  let factBytes: readonly number[] = [];
  const encoder = new TextEncoder();
  let offset = 0;
  let quarantined = false;
  let unterminated = false;

  const extend = (current: Uint8Array<ArrayBuffer>): ReplayView => {
    const parsed = parseEventLogBytes(current.subarray(offset));
    for (const row of parsed.rows) {
      if (row.opaque) {
        opaque.add(row.event);
      }
      reducer.replayClassified(row);
    }
    events = [...events, ...parsed.events];
    ledger = foldClassifiedChatLedger(ledger, parsed.rows);
    const addedFacts = parsed.rows.map((row) => projectLogRow(row));
    facts = [...facts, ...addedFacts];
    factBytes = [...factBytes, ...addedFacts.map((fact) => encoder.encode(JSON.stringify(fact) + '\n').byteLength)];
    quarantined ||= parsed.quarantined.length > 0;
    if (quarantined || !reducer.historyIntact()) {
      ledger = { ...ledger, historyIntact: false };
    }
    offset += parsed.validByteLength;
    unterminated = parsed.needsSeparator;
    const rows = events;
    const messages = reducer.messages();
    const capturedFacts = facts;
    const capturedSizes = factBytes;
    return {
      bytes: new Uint8Array(current),
      generation,
      ledger,
      sourceHealth: { historyIntact: ledger.historyIntact, newerHistory: ledger.newerHistory, quarantined },
      projectionBatch: ({ chatId, cursor, limit, maxBytes }) => {
        let nextCursor = cursor;
        let pageBytes = 0;
        const frameBaseBytes = encoder.encode(
          JSON.stringify({
            type: 'page',
            answer: {
              status: 'batch',
              chatId,
              cursor,
              nextCursor: cursor,
              endCursor: capturedFacts.length,
              sourceGeneration: generation,
              facts: [],
            },
          }),
        ).byteLength;
        const cursorDigits = String(cursor).length;
        const end = Math.min(cursor + limit, capturedFacts.length);
        while (nextCursor < end) {
          const size = capturedSizes[nextCursor]!;
          // Cached fact sizes include one newline: array commas replace those bytes except the final one.
          const framedBytes = frameBaseBytes + String(nextCursor + 1).length - cursorDigits + pageBytes + size - 1;
          if (nextCursor > cursor && framedBytes > maxBytes) {
            break;
          }
          pageBytes += size;
          nextCursor++;
        }
        return {
          status: 'batch',
          chatId,
          cursor,
          nextCursor,
          endCursor: capturedFacts.length,
          sourceGeneration: generation,
          facts: capturedFacts.slice(cursor, nextCursor),
        };
      },
      log: {
        read: async () => rows,
        readBatch: async (input) => readEventLogBatch(rows, opaque, input),
        messages: async () => messages,
      },
      extend: (next) => {
        // A complete unterminated row may change when more bytes arrive; it was already published.
        if (unterminated) {
          return createReplayView(next, createPortableId());
        }
        return extend(next);
      },
    };
  };
  return extend(bytes);
};
