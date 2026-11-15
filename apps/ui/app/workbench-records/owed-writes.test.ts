/**
 * The page's owed record writes (A7c, D26 as amended): a record store owes from the edit until its write lands, which
 * holds `environment`'s `beforeunload` producer stage, and the `beforeunload` pass and the `hidden` pass that follows it
 * write the edit once.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { StepClock, flush } from '@taucad/xstate-testing/clock';
import { createRecordSync } from '#workbench-records/record-sync.js';
import { createRecordSyncMachine } from '#workbench-records/record-sync.machine.js';
import type { CheckedWriteInput, CheckedWriteOutcome } from '#workbench-records/record-sync.machine.js';
import type { RecordPolicy } from '#workbench-records/record-sync-policy.js';
import { followOwedWrite, owedRecordWrites, oweRecordWrite } from '#workbench-records/owed-writes.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

type Fields = Readonly<Record<string, string>>;
const policy: RecordPolicy<Fields, Fields> = {
  read: (bytes) => ({ status: 'current', record: JSON.parse(decoder.decode(bytes)) as Fields }),
  serialize: (record) => JSON.stringify(record),
  diff: (base, next) => Object.fromEntries(Object.entries(next).filter(([key, value]) => base?.[key] !== value)),
  combine: (earlier, later) => ({ ...earlier, ...later }),
  merge: (current, next, patch) => ({ ...next, ...current, ...patch }),
  isEmpty: (patch) => Object.keys(patch).length === 0,
};

const stops: Array<() => void> = [];
afterEach(() => {
  for (const stop of stops.splice(0)) {
    stop();
  }
});

/** One store over a file whose writes wait until the row lands them. */
const store = () => {
  let bytes = encoder.encode(JSON.stringify({ name: 'seed' }));
  const writes: Array<{ input: CheckedWriteInput; settle: (outcome: CheckedWriteOutcome) => void }> = [];
  const sync = createRecordSync({
    machine: createRecordSyncMachine(policy),
    editDebounce: 500,
    clock: new StepClock(),
    ports: {
      read: async () => ({ status: 'read', bytes }),
      write: async (input) =>
        new Promise<CheckedWriteOutcome>((settle) => {
          writes.push({ input, settle });
        }),
    },
  });
  sync.actor.start();
  stops.push(() => {
    sync.actor.stop();
  });
  return {
    ...sync,
    writes,
    land: async (): Promise<void> => {
      const write = writes.at(-1);
      bytes = encoder.encode(write?.input.data ?? '');
      write?.settle({ status: 'applied', content: bytes });
      await flush();
    },
  };
};

describe('owed record writes (A7c, D26 as amended)', () => {
  it('should owe nothing until a debt is taken, and nothing once every debt is paid', () => {
    expect(owedRecordWrites.owes()).toBe(false);

    const first = oweRecordWrite();
    const second = oweRecordWrite();
    first();
    first();

    expect(owedRecordWrites.owes()).toBe(true);

    second();

    expect(owedRecordWrites.owes()).toBe(false);
  });

  it('should tell its listener when the page starts and stops owing, and not for a second debt', () => {
    const changes: boolean[] = [];
    const stop = owedRecordWrites.subscribe(() => {
      changes.push(owedRecordWrites.owes());
    });
    const follow = followOwedWrite();
    const other = followOwedWrite();

    follow(true);
    other(true);
    follow(true);
    other(false);
    follow(false);
    stop();

    expect(changes).toEqual([true, false]);
  });

  it("should owe a record store's edit from the edit, inside its debounce, until its write lands", async () => {
    const record = store();
    await record.commands.read();

    expect(owedRecordWrites.owes()).toBe(false);

    void record.commands.edit({ name: 'Front' });

    expect(owedRecordWrites.owes()).toBe(true);

    const flushed = record.commands.flush();

    expect(owedRecordWrites.owes()).toBe(true);

    await record.land();

    expect(await flushed).toBe(true);
    expect(owedRecordWrites.owes()).toBe(false);
  });

  it('should write the edit once when the hidden pass flushes again after the beforeunload pass', async () => {
    const record = store();
    await record.commands.read();
    void record.commands.edit({ name: 'Front' });

    /* `beforeunload`'s producer stage, then `hidden`'s while that write is on the wire, then `hidden` once it landed. */
    const early = record.commands.flush();
    const hidden = record.commands.flush();

    expect(record.writes).toHaveLength(1);

    await record.land();
    const later = record.commands.flush();

    expect(await Promise.all([early, hidden, later])).toEqual([true, true, true]);
    expect(record.writes).toHaveLength(1);
  });

  it('should pay the debt of a store that stops with an edit owed', async () => {
    const record = store();
    await record.commands.read();
    void record.commands.edit({ name: 'Front' });

    expect(owedRecordWrites.owes()).toBe(true);

    record.actor.stop();

    expect(owedRecordWrites.owes()).toBe(false);
  });
});
