/*
 * WP-17: a file is written compactly and restored as it is parsed. Every committed corpus log, written through the
 * writer's encoding, must parse back to the same rows, in the same key order, and fold to the same ledger and the same
 * provider history. The ledger fold never sees a compact key: restoration happens before classification.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { emptyChatLedger, foldChatLedger } from '#log/chat-ledger.js';
import { LogFileDictionary, compactLogRow, restoreLogRow } from '#log/compact-rows.js';
import { createEventLogAppender } from '#log/event-log-appender.js';
import { memoryEventLogStorage } from '#log/event-log-storage.fixture.js';
import { parseSegmentFrom } from '#log/foreign-runs.js';
import { reduceEventLog } from '#log/reducer.js';
import {
  parseEventLogBytes,
  parseReplayEventLogBytes,
  serializeCompactLogEventBytes,
  serializeParsedLogEventBytes,
} from '#log/serialization.js';
import { canonicalJson } from '#log/canonical-json.js';
import type { AgentLogEvent } from '#log/event-types.js';

const corpus = path.resolve(import.meta.dirname, '../../specs/ChatLog');
const logs = ['recorded', 'seeded'].flatMap((folder) =>
  readdirSync(path.join(corpus, folder))
    .filter((name) => name.endsWith('.jsonl'))
    .map((name) => path.join(folder, name)),
);

const encoder = new TextEncoder();
const bytesOf = (text: string): Uint8Array<ArrayBuffer> => encoder.encode(text);
const concat = (parts: ReadonlyArray<Uint8Array<ArrayBuffer>>): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(new ArrayBuffer(parts.reduce((total, part) => total + part.byteLength, 0)));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
};

/** The file the writer would have written for these rows: known rows compacted, opaque rows as they are. */
const encode = (
  rows: ReadonlyArray<{ readonly event: AgentLogEvent; readonly opaque: boolean }>,
): Uint8Array<ArrayBuffer> => {
  const dictionary = LogFileDictionary.empty();
  return concat(
    rows.map(({ event, opaque }) => {
      const line = opaque ? event : compactLogRow(event, dictionary);
      dictionary.note(line, event);
      return line === event ? serializeParsedLogEventBytes(event) : serializeCompactLogEventBytes(line);
    }),
  );
};

/** The provider history, or the code the strict reducer refuses the rows with (seeded logs break rules on purpose). */
const historyOf = (events: readonly AgentLogEvent[]): unknown => {
  try {
    return reduceEventLog(events);
  } catch (error) {
    return { refused: (error as { readonly code?: unknown }).code };
  }
};

const read = (file: string): Uint8Array<ArrayBuffer> => bytesOf(readFileSync(path.join(corpus, file), 'utf8'));

describe('compact rows (WP-17)', () => {
  it('should cover the committed corpus', () => {
    expect(logs.length).toBeGreaterThan(20);
  });

  it.each(logs)('should restore %s, written compactly, to the same rows and ledger', (file) => {
    const original = parseEventLogBytes(read(file));
    const compact = encode(original.rows);
    const restored = parseEventLogBytes(compact);
    expect(restored.quarantined).toEqual([]);
    expect(JSON.stringify(restored.events)).toBe(JSON.stringify(original.events));
    expect(restored.rows.map((row) => row.opaque)).toEqual(original.rows.map((row) => row.opaque));
    expect(foldChatLedger(emptyChatLedger, restored.events)).toEqual(foldChatLedger(emptyChatLedger, original.events));
    expect(historyOf(restored.events)).toEqual(historyOf(original.events));
    /* Replay identities are the rows', not the lines'. */
    const replay = parseReplayEventLogBytes(compact);
    expect(replay.rows.map((row) => row.identity.canonical())).toEqual(
      original.events.map((event) => canonicalJson(event)),
    );
  });

  it('should restore every compact line when the file is parsed a line at a time', () => {
    for (const file of logs) {
      const original = parseEventLogBytes(read(file));
      const compact = encode(original.rows);
      let parse = parseSegmentFrom(undefined, compact.slice(0, compact.indexOf(10) + 1));
      for (let end = compact.indexOf(10, parse.validByteLength); end !== -1; end = compact.indexOf(10, end + 1)) {
        parse = parseSegmentFrom(parse, compact.slice(0, end + 1));
      }
      expect(JSON.stringify(parse.events), file).toBe(JSON.stringify(original.events));
    }
  });

  it('should write a recorded chat smaller', () => {
    const file = 'recorded/daemon-reattach-hexnut-4runs.jsonl';
    const bytes = read(file);
    const compact = encode(parseEventLogBytes(bytes).rows);
    /* Its four commits carry two distinct prompts; its tool output is content and stays. */
    expect(compact.byteLength).toBeLessThan(bytes.byteLength * 0.9);
  });

  it('should match the compact fixture the formal model validates', () => {
    const recorded = parseEventLogBytes(read('recorded/in-project-ping-pong-turn.jsonl'));
    expect(new TextDecoder().decode(encode(recorded.rows))).toBe(
      readFileSync(path.join(corpus, 'seeded/compact-in-project-ping-pong-turn.jsonl'), 'utf8'),
    );
  });

  it('should write through the appender compactly, and keep compacting after a reopen', async () => {
    const rows = parseEventLogBytes(read('recorded/daemon-reattach-hexnut-4runs.jsonl')).events;
    const half = Math.floor(rows.length / 2);
    const file = memoryEventLogStorage();
    const first = await createEventLogAppender(file.storage);
    for (const row of rows.slice(0, half)) {
      // oxlint-disable-next-line no-await-in-loop -- rows are appended in order.
      await first.append(row);
    }
    await first.close();
    const second = await createEventLogAppender(file.storage);
    for (const row of rows.slice(half)) {
      // oxlint-disable-next-line no-await-in-loop -- rows are appended in order.
      await second.append(row);
    }
    expect(JSON.stringify(await second.read())).toBe(JSON.stringify(rows));
    await second.close();
    expect(file.bytes()).toEqual(encode(parseEventLogBytes(read('recorded/daemon-reattach-hexnut-4runs.jsonl')).rows));
    const reopened = parseEventLogBytes(file.bytes());
    expect(JSON.stringify(reopened.events)).toBe(JSON.stringify(rows));
  });

  it('should quarantine a line that names a value no earlier line of its file wrote', () => {
    const empty = LogFileDictionary.empty();
    expect(restoreLogRow({ type: 'turn.history-projection-committed', contextDigest: 'sha256:00' }, empty)).toEqual({
      status: 'unresolved',
    });
    expect(
      restoreLogRow(
        { type: 'message.envelope-replaced', messageId: 'a1', replacement: { id: 'a1', contentKept: true } },
        empty,
      ),
    ).toEqual({ status: 'unresolved' });
    for (const name of ['context-unresolved', 'prompt-unresolved', 'content-kept-unresolved']) {
      const parsed = parseEventLogBytes(read(`seeded/${name}.jsonl`));
      expect(parsed.quarantined, name).toHaveLength(1);
    }
  });

  it('should leave a row with nothing to name as it is', () => {
    const row = { type: 'message.appended', message: { id: 'a1', role: 'assistant', content: 'x' } };
    expect(restoreLogRow(row, LogFileDictionary.empty())).toEqual({ status: 'plain', value: row });
  });
});
