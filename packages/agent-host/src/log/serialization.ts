// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { EventLogError } from '#log/event-log-error.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { parseLogEvent } from '#log/event-schema.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { AgentLogEvent } from '#log/event-types.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

type ParsedEventLog = {
  readonly events: readonly AgentLogEvent[];
  readonly validByteLength: number;
  readonly needsSeparator: boolean;
  readonly discardedTail: boolean;
};

type ByteLine = { readonly start: number; readonly end: number; readonly terminated: boolean };

const splitByteLines = (bytes: Uint8Array<ArrayBuffer>): ByteLine[] => {
  const lines: ByteLine[] = [];
  let start = 0;
  for (let index = 0; index < bytes.byteLength; index++) {
    if (bytes[index] === 10) {
      lines.push({ start, end: index, terminated: true });
      start = index + 1;
    }
  }
  if (start < bytes.byteLength) {
    lines.push({ start, end: bytes.byteLength, terminated: false });
  }
  return lines;
};

export const parseEventLogBytes = (bytes: Uint8Array<ArrayBuffer>): ParsedEventLog => {
  const lines = splitByteLines(bytes);
  const events: AgentLogEvent[] = [];
  let validByteLength = 0;
  let needsSeparator = false;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const contentEnd = line.end > line.start && bytes[line.end - 1] === 13 ? line.end - 1 : line.end;
    try {
      const value: unknown = JSON.parse(decoder.decode(bytes.subarray(line.start, contentEnd)));
      events.push(parseLogEvent(value));
      validByteLength = line.end + (line.terminated ? 1 : 0);
      needsSeparator = !line.terminated;
    } catch (error) {
      if (index === lines.length - 1 && !line.terminated) {
        return { events, validByteLength: line.start, needsSeparator: false, discardedTail: true };
      }
      throw new EventLogError(
        'LINE_INVALID',
        `Invalid event-log line ${index + 1}; only a torn final line may be discarded.`,
        {
          cause: error,
        },
      );
    }
  }

  return { events, validByteLength, needsSeparator, discardedTail: false };
};

/**
 * Serialize one validated event as exactly one newline-terminated JSON object.
 *
 * @param event - Versioned event-log record to serialize.
 * @returns One JSONL line including its trailing newline.
 * @public
 */
export const serializeLogEvent = (event: AgentLogEvent): string => `${JSON.stringify(parseLogEvent(event))}\n`;

export const serializeLogEventBytes = (event: AgentLogEvent, needsSeparator = false): Uint8Array<ArrayBuffer> =>
  encoder.encode(`${needsSeparator ? '\n' : ''}${serializeLogEvent(event)}`);

/**
 * Parse a JSONL session log, discarding a malformed final line as a torn append.
 *
 * @param text - Complete UTF-8 event-log text.
 * @returns Validated records in physical line order.
 * @public
 */
export const parseEventLog = (text: string): readonly AgentLogEvent[] =>
  parseEventLogBytes(encoder.encode(text)).events;
