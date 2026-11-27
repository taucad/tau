import { classifyLogJson, classifyLogValue, parseLogEvent } from '#log/event-schema.js';
import { canonicalJson } from '#log/canonical-json.js';
import { LogFileDictionary, restoreLogRow } from '#log/compact-rows.js';
import type { ClassifiedRow } from '#log/event-schema.js';
import type { AgentLogEvent } from '#log/event-types.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

/** One row kept by a tolerant read; `opaque` rows are carried but never folded or executed (CL-R1). @internal */
export type ReadRow = { readonly event: AgentLogEvent; readonly opaque: boolean };

class ParsedReplayIdentity {
  #text: string | undefined;
  #canonical: string | undefined;

  public constructor(text: string) {
    this.#text = text;
  }

  public canonical(): string {
    if (this.#canonical !== undefined) {
      return this.#canonical;
    }
    const text = this.#text;
    if (text === undefined) {
      throw new Error('A replay identity has neither source text nor canonical content.');
    }
    const row = classifyLogJson(text);
    if (row.class === 'quarantined') {
      throw new Error('A parser-owned replay identity no longer classifies.');
    }
    this.#canonical = canonicalJson(row.event);
    this.#text = undefined;
    return this.#canonical;
  }
}

/** Immutable-source identity minted only by this parser; its constructor is not exported. @internal */
export type ReplayIdentity = ParsedReplayIdentity;
/** A kept replay row whose original identity survives later exposed-object mutation. @internal */
export type ReplayReadRow = ReadRow & { readonly identity: ReplayIdentity };

type ParsedEventLog<Row extends ReadRow = ReadRow> = {
  /** Known and opaque rows in file order: exactly what the cursor indexes. */
  readonly rows: readonly Row[];
  readonly events: readonly AgentLogEvent[];
  /** Lines with no valid row envelope: skipped, reported by byte offset and excluded from the cursor (CL-R1). */
  readonly quarantined: readonly number[];
  /** Bytes up to the end of the last complete line; a torn final line lies beyond it. */
  readonly validByteLength: number;
  readonly needsSeparator: boolean;
  readonly discardedTail: boolean;
  /** What the parsed lines wrote that a later line may name (WP-17): pass it on to parse bytes appended after them. */
  readonly dictionary: LogFileDictionary;
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

/** A line's row, restored from the lines before it (WP-17); a compact line naming nothing they wrote is quarantined. */
const classifyLine = (
  text: string | undefined,
  dictionary: LogFileDictionary,
): { readonly classified: ClassifiedRow; readonly restoredText?: string } => {
  if (text === undefined) {
    return { classified: { class: 'quarantined' } };
  }
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    return { classified: { class: 'quarantined' } };
  }
  const restored = restoreLogRow(value, dictionary);
  if (restored.status === 'unresolved') {
    return { classified: { class: 'quarantined' } };
  }
  /* The restored value is the row the writer appended; the dictionary keeps the classified row's values. */
  const restoredText = restored.status === 'restored' ? JSON.stringify(restored.value) : undefined;
  const classified = classifyLogValue(restored.value);
  if (classified.class !== 'quarantined') {
    dictionary.note(value, classified.event);
  }
  return restoredText === undefined ? { classified } : { classified, restoredText };
};

/**
 * Read a log tolerantly (D16): opening never fails because of a row's content. A torn final line (no newline, not a
 * row) is left beyond `validByteLength` for the writer's first guarded append to repair; any other line without a row
 * envelope is quarantined. Compact lines are restored from the file's earlier lines (WP-17): `from` is what the lines
 * before `bytes` wrote, when `bytes` continue a file already parsed.
 *
 * @internal
 */
function parseBytes(
  bytes: Uint8Array<ArrayBuffer>,
  replay: true,
  from?: LogFileDictionary,
): ParsedEventLog<ReplayReadRow>;
function parseBytes(bytes: Uint8Array<ArrayBuffer>, replay: false, from?: LogFileDictionary): ParsedEventLog;
function parseBytes(bytes: Uint8Array<ArrayBuffer>, replay: boolean, from?: LogFileDictionary): ParsedEventLog {
  const lines = splitByteLines(bytes);
  const rows: ReadRow[] = [];
  const quarantined: number[] = [];
  const dictionary = from === undefined ? LogFileDictionary.empty() : from.fork();
  let validByteLength = 0;
  let needsSeparator = false;

  for (const line of lines) {
    const text = textOf(bytes, line);
    const { classified, restoredText } = classifyLine(text, dictionary);
    if (classified.class === 'quarantined') {
      if (!line.terminated) {
        return {
          rows,
          events: rows.map((row) => row.event),
          quarantined,
          validByteLength,
          needsSeparator: false,
          discardedTail: true,
          dictionary,
        };
      }
      quarantined.push(line.start);
    } else {
      const row = { event: classified.event, opaque: classified.class === 'opaque' };
      if (replay) {
        const source = restoredText ?? text;
        if (source === undefined) {
          throw new Error('A classified replay row has no decoded source text.');
        }
        const owned: ReplayReadRow = { ...row, identity: new ParsedReplayIdentity(source) };
        rows.push(owned);
      } else {
        rows.push(row);
      }
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
    dictionary,
  };
}

/**
 * Parse ordinary kept rows without retaining private replay identities.
 * @internal
 * @param bytes - Captured log bytes.
 * @param from - The dictionary of the file's lines before `bytes`, when they continue an earlier parse.
 * @returns The tolerant physical rows and byte boundary.
 */
export const parseEventLogBytes = (bytes: Uint8Array<ArrayBuffer>, from?: LogFileDictionary): ParsedEventLog =>
  parseBytes(bytes, false, from);

/**
 * Parse kept rows with immutable source identities for the private captured replay owner.
 * @internal
 * @param bytes - Captured log bytes consumed synchronously before row exposure.
 * @param from - The dictionary of the file's lines before `bytes`, when they continue an earlier parse.
 * @returns Tolerant physical rows carrying their original identity witnesses.
 */
export const parseReplayEventLogBytes = (
  bytes: Uint8Array<ArrayBuffer>,
  from?: LogFileDictionary,
): ParsedEventLog<ReplayReadRow> => parseBytes(bytes, true, from);

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

/* A row's line length without a separator, kept once counted; rows are immutable once in a log. */
const lineSizes = new WeakMap<AgentLogEvent, number>();

/**
 * The bytes of a row {@link parseLogEvent} returned, without parsing it again (WP-10 step A item 5): the appender
 * parses each row once at its boundary. The line's size is kept for {@link serializedLogEventSize}.
 *
 * @internal
 * @param event - A row exactly as `parseLogEvent` returned it.
 * @param needsSeparator - Whether the file's last line lacks its newline.
 * @returns One JSONL line, after a separator when one is needed.
 */
export const serializeParsedLogEventBytes = (event: AgentLogEvent, needsSeparator = false): Uint8Array<ArrayBuffer> => {
  const bytes = encoder.encode(`${needsSeparator ? '\n' : ''}${JSON.stringify(event)}\n`);
  lineSizes.set(event, bytes.byteLength - (needsSeparator ? 1 : 0));
  return bytes;
};

/**
 * The bytes of a row's compact line (WP-17), as `compactLogRow` gave it. The row's own size stays what
 * {@link serializedLogEventSize} counts: a reader receives the row, not the line.
 *
 * @internal
 * @param line - The compact line's value.
 * @param needsSeparator - Whether the file's last line lacks its newline.
 * @returns One JSONL line, after a separator when one is needed.
 */
export const serializeCompactLogEventBytes = (line: unknown, needsSeparator = false): Uint8Array<ArrayBuffer> =>
  encoder.encode(`${needsSeparator ? '\n' : ''}${JSON.stringify(line)}\n`);

/**
 * The byte length of a known row's line as {@link serializeLogEventBytes} writes it, counted once per row (HP-12).
 *
 * @internal
 * @param event - A known row.
 * @returns Its line's bytes, newline included.
 */
export const serializedLogEventSize = (event: AgentLogEvent): number => {
  const known = lineSizes.get(event);
  if (known !== undefined) {
    return known;
  }
  const size = serializeLogEventBytes(event).byteLength;
  lineSizes.set(event, size);
  return size;
};

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
