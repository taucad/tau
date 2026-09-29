/*
 * Differential test of the owner's applied-set path against `handle` in `specs/lean/CommandIdempotency.lean` (SC
 * T14): for every delivery sequence over three keys up to length five, and several arbitrary `decide` functions, the
 * owner answers what the proved model answers and writes the same log.
 */

import { describe, expect, it } from 'vitest';

import { createCommandOwner } from '#channel/command-owner.js';
import { emptyChatLedger } from '#log/chat-ledger.js';
import type { ChatLedger } from '#log/chat-ledger.js';

type Status = 'applied' | 'replayed' | 'refused';
type Decide = (log: readonly string[], key: string) => boolean;

/** The Lean model's `handle`, transcribed. */
const handle = (decide: Decide, log: readonly string[], key: string): [readonly string[], Status] => {
  if (log.includes(key)) {
    return [log, 'replayed'];
  }
  return decide(log, key) ? [[...log, key], 'applied'] : [log, 'refused'];
};

const keys = ['k1', 'k2', 'k3'] as const;

const sequences = (length: number): string[][] =>
  length === 0 ? [[]] : sequences(length - 1).flatMap((prefix) => keys.map((key) => [...prefix, key]));

const decisions: Readonly<Record<string, Decide>> = {
  always: () => true,
  never: () => false,
  parity: (log, key) => (log.length + key.length) % 2 === 0,
  notK2: (_log, key) => key !== 'k2',
  shortLog: (log) => log.length < 2,
};

const ownerRun = async (decide: Decide, deliveries: readonly string[]): Promise<[readonly string[], Status[]]> => {
  const log: string[] = [];
  const ledger = (): ChatLedger => ({
    ...emptyChatLedger,
    applied: Object.fromEntries(log.map((key, cursor) => [key, { cursor }])),
  });
  const execute = createCommandOwner({
    ledger: async () => ledger(),
    effect: async (command) => {
      if (!decide(log, command.commandId)) {
        throw Object.assign(new Error('refused by decision'), { code: 'CHAT_RUN_LIVE' });
      }
      log.push(command.commandId);
      return undefined;
    },
  });
  const statuses: Status[] = [];
  for (const key of deliveries) {
    // oxlint-disable-next-line no-await-in-loop -- deliveries are sequential by definition.
    const answer = await execute({ type: 'cancel', commandId: key, payload: { chatId: 'c', runId: 'r' } });
    statuses.push(answer.status);
  }
  return [log, statuses];
};

describe('the owner against CommandIdempotency.handle', () => {
  it.each(Object.keys(decisions))('should answer as the model for every sequence with decide %s', async (name) => {
    const decide = decisions[name]!;
    for (const length of [1, 2, 3, 4, 5]) {
      for (const deliveries of sequences(length)) {
        let modelLog: readonly string[] = [];
        const modelStatuses: Status[] = [];
        for (const key of deliveries) {
          const [next, status] = handle(decide, modelLog, key);
          modelLog = next;
          modelStatuses.push(status);
        }
        // oxlint-disable-next-line no-await-in-loop -- each sequence runs a fresh owner.
        const [ownerLog, ownerStatuses] = await ownerRun(decide, deliveries);
        expect({ deliveries, log: ownerLog, statuses: ownerStatuses }).toEqual({
          deliveries,
          log: modelLog,
          statuses: modelStatuses,
        });
      }
    }
  });
});
