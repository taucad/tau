import { classifyLogJson, parseLogEvent } from '#log/event-schema.js';
import type { AgentLogEvent } from '#log/event-types.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

/** One row kept by a tolerant read; `opaque` rows are carried but never folded or executed (CL-R1). @internal */
export type ReadRow = { readonly event: AgentLogEvent; readonly opaque: boolean };

type ParsedEventLog = {
  /** Known and opaque rows in file order: exactly what the cursor indexes. */
  readonly rows: readonly ReadRow[];
  readonly events: readonly AgentLogEvent[];
  /** Lines with no valid row envelope: skipped, reported by byte offset and excluded from the cursor (CL-R1). */
  readonly quarantined: readonly number[];
  /** Bytes up to the end of the last complete line; a torn final line lies beyond it. */
  readonly validByteLength: number;
  readonly needsSeparator: boolean;
  readonly discardedTail: boolean;
};

type ByteLine = { readonly start: number; readonly end: number; readonly terminated: boolean };

const splitByteLines = (bytes: Uint8Array<ArrayBuffer>): ByteLine[] => {
  const lines: ByteLine[] = [];
  let start = 0;
  for (let end = bytes.indexOf(10, start); end !== -1; end = bytes.indexOf(10, start)) {
    lines.push({ start, end, terminated: true });
    start = end + 1;
  }
  if (start < bytes.byteLength) {
    lines.push({ start, end: bytes.byteLength, terminated: false });
  }
  return lines;
};

const textOf = (bytes: Uint8Array<ArrayBuffer>, line: ByteLine): string | undefined => {
  const contentEnd = line.end > line.start && bytes[line.end - 1] === 13 ? line.end - 1 : line.end;
  try {
    return decoder.decode(bytes.subarray(line.start, contentEnd));
  } catch {
    return undefined;
  }
};

/**
 * Read a log tolerantly (D16): opening never fails because of a row's content. A torn final line (no newline, not a
 * row) is left beyond `validByteLength` for the writer's first guarded append to repair; any other line without a row
 * envelope is quarantined.
 *
 * @internal
 */
export const parseEventLogBytes = (bytes: Uint8Array<ArrayBuffer>): ParsedEventLog => {
  const lines = splitByteLines(bytes);
  const rows: ReadRow[] = [];
  const quarantined: number[] = [];
  let validByteLength = 0;
  let needsSeparator = false;

  for (const line of lines) {
    const text = textOf(bytes, line);
    const classified = text === undefined ? ({ class: 'quarantined' } as const) : classifyLogJson(text);
    if (classified.class === 'quarantined') {
      if (!line.terminated) {
        return {
          rows,
          events: rows.map((row) => row.event),
          quarantined,
          validByteLength,
          needsSeparator: false,
          discardedTail: true,
        };
      }
      quarantined.push(line.start);
    } else {
      rows.push({ event: classified.event, opaque: classified.class === 'opaque' });
    }
    validByteLength = line.end + (line.terminated ? 1 : 0);
    needsSeparator = !line.terminated;
  }

  return {
    rows,
    events: rows.map((row) => row.event),
    quarantined,
    validByteLength,
    needsSeparator,
    discardedTail: false,
  };
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
 * Parse a JSONL session log tolerantly: a malformed final line is a torn append and is dropped, any other line
 * without a row envelope is skipped, and a row this build cannot interpret is kept as it was written (D16).
 *
 * @param text - Complete UTF-8 event-log text.
 * @returns The kept records in physical line order.
 * @public
 */
export const parseEventLog = (text: string): readonly AgentLogEvent[] =>
  parseEventLogBytes(encoder.encode(text)).events;
