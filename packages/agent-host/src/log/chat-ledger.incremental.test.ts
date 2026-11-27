/*
 * WP-11 (F-4): a model step reads the host's incrementally folded ledger instead of folding the log from empty. The
 * host folds a log it opens physically, then each row it appends; the session used to fold every row from empty. This
 * folds every committed log both ways, at every prefix where the host could have opened it, and compares what a step
 * reads. The fold is a left fold, so the two agree (`replayLog_append`, ChatLedgerProofs.lean).
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { emptyChatLedger, foldChatLedger, foldPhysicalChatLedger, unresolvedInvocations } from '#log/chat-ledger.js';
import type { ChatLedger } from '#log/chat-ledger.js';

const corpus = path.resolve(import.meta.dirname, '../../specs/ChatLog');
const logs = ['recorded', 'seeded'].flatMap((folder) =>
  readdirSync(path.join(corpus, folder))
    .filter((name) => name.endsWith('.jsonl'))
    .map((name) => path.join(folder, name)),
);

const rowsOf = (file: string): unknown[] =>
  readFileSync(path.join(corpus, file), 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .flatMap((line): unknown[] => {
      try {
        return [JSON.parse(line) as unknown];
      } catch {
        return [];
      }
    });

describe('the host ledger a model step reads (WP-11)', () => {
  it('should cover the committed corpus', () => {
    expect(logs.length).toBeGreaterThan(20);
  });

  /* Every opening point times every later read: quadratic in rows, so the largest recorded log takes a few seconds. */
  it.each(logs)('should equal the fold from empty at every prefix of %s', { timeout: 60_000 }, (file) => {
    const rows = rowsOf(file);
    /* What a step reads: the invocations and the unresolved ones (`prepareInvocation`, `bindInvocation`). */
    const read = (ledger: ChatLedger): string =>
      JSON.stringify({ invocations: ledger.invocations, unresolved: unresolvedInvocations(ledger) });
    const scratch = [...rows.keys(), rows.length].map((at) => read(foldChatLedger(emptyChatLedger, rows.slice(0, at))));
    for (let opened = 0; opened <= rows.length; opened += 1) {
      let host = foldPhysicalChatLedger(emptyChatLedger, rows.slice(0, opened));
      for (let at = opened; at <= rows.length; at += 1) {
        expect(read(host), `opened at ${String(opened)}, read at ${String(at)}`).toBe(scratch[at]);
        if (at < rows.length) {
          host = foldChatLedger(host, [rows[at]]);
        }
      }
    }
  });
});
