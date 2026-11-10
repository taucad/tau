/**
 * `recordSync` over a held file: every read and checked write waits until the row settles it, so each row states one
 * interleaving. The attribution rows are the target rules of `specs/record-sync/README.md` and the counterexamples of
 * its as-built configurations.
 */
/* oxlint-disable typescript/no-restricted-types -- Checked filesystem absence uses null. */
import { describe, expect, it } from 'vitest';
import { StepClock, flush } from '@taucad/xstate-testing/clock';
import { guardActors, recordTransitions } from '@taucad/xstate-testing/inspect';
import { unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';
import type { AnyMachineSnapshot, InspectionEvent } from 'xstate';
import { slowWriteMilliseconds } from '#workbench-records/record-health.js';
import { createRecordSync } from '#workbench-records/record-sync.js';
import * as machineModule from '#workbench-records/record-sync.machine.js';
import {
  createRecordSyncMachine,
  firstRetryDelay,
  maxLostWrites,
  recordSyncIgnoredEvents,
} from '#workbench-records/record-sync.machine.js';
import type {
  CheckedWriteInput,
  CheckedWriteOutcome,
  RecordReadOutcome,
  RecordSyncEmitted,
  RecordSyncEvent,
} from '#workbench-records/record-sync.machine.js';
import type { RecordBytes, RecordPolicy } from '#workbench-records/record-sync-policy.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const bytesOf = (text: string): RecordBytes => encoder.encode(text);

/** A record of `key=value` fields. A patch names the fields a person changed; `!` bytes do not parse. */
type Fields = Readonly<Record<string, string>>;
const parse = (text: string): Fields =>
  Object.fromEntries(
    text
      .split(';')
      .filter(Boolean)
      .map((pair) => pair.split('=') as [string, string]),
  );
const text = (fields: Fields): string =>
  Object.entries(fields)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join(';');

const policy: RecordPolicy<Fields, Fields> = {
  read(bytes) {
    const content = decoder.decode(bytes);
    if (content.startsWith('!')) {
      return { status: 'invalid', code: 'INVALID_RECORD', message: 'The record does not parse.' };
    }
    return content.startsWith('^')
      ? { status: 'newer', code: 'NEWER_RECORD', message: 'A newer Tau wrote the record.' }
      : { status: 'current', record: parse(content) };
  },
  serialize(record) {
    if ('forbidden' in record) {
      throw new Error('The record holds a forbidden key.');
    }
    return text(record);
  },
  diff: (base, next) => Object.fromEntries(Object.entries(next).filter(([key, value]) => base?.[key] !== value)),
  combine: (earlier, later) => ({ ...earlier, ...later }),
  merge: (current, next, patch) => ({ ...next, ...current, ...patch }),
  isEmpty: (patch) => Object.keys(patch).length === 0,
};

type Held<Input, Outcome> = { input: Input; settle: (outcome: Outcome) => void; fail: (error: unknown) => void };

const lostReply = (): RecordReadOutcome & CheckedWriteOutcome => ({
  status: 'failed',
  error: new Error('reply lost'),
  lost: true,
});

/**
 * One `recordSync` actor over a file the row controls.
 *
 * @param options - The file's first content and the edit debounce.
 * @returns The actor's commands, what it emitted, and the held reads and writes.
 */
const harness = (
  options: { file?: string | null; editDebounce?: number; inspect?: (event: InspectionEvent) => void } = {},
) => {
  const guard = guardActors({ ignore: { 'record-sync': recordSyncIgnoredEvents } });
  const clock = new StepClock();
  const file = { bytes: options.file === null ? null : bytesOf(options.file ?? 'name=seed') };
  const reads: Array<Held<undefined, RecordReadOutcome>> = [];
  const writes: Array<Held<CheckedWriteInput, CheckedWriteOutcome>> = [];
  const { actor, commands, context, on } = createRecordSync({
    machine: createRecordSyncMachine(policy),
    editDebounce: options.editDebounce,
    clock,
    inspect(event) {
      guard.inspect(event);
      options.inspect?.(event);
    },
    ports: {
      read: async () =>
        new Promise<RecordReadOutcome>((resolve, reject) => {
          reads.push({ input: undefined, settle: resolve, fail: reject });
        }),
      write: async (input) =>
        new Promise<CheckedWriteOutcome>((resolve, reject) => {
          writes.push({ input, settle: resolve, fail: reject });
        }),
    },
  });
  const emitted: Array<RecordSyncEmitted<Fields, Fields>> = [];
  on('*', (event) => {
    emitted.push(event);
  });
  actor.start();
  const published = (): Array<[origin: string, content: string | null]> =>
    emitted.flatMap((event) =>
      event.type === 'published'
        ? [[event.origin, event.snapshot.bytes === null ? null : decoder.decode(event.snapshot.bytes)]]
        : [],
    );
  return {
    actor,
    commands,
    clock,
    guard,
    emitted,
    published,
    reads,
    writes,
    file,
    context,
    value: () => actor.getSnapshot().value,
    /** The authority serves the latest read with the file's bytes. */
    async serve(index = reads.length - 1): Promise<void> {
      reads[index]?.settle({ status: 'read', bytes: file.bytes });
      await flush();
    },
    /** The authority decides a held write: applied while the file holds the bytes it expects. */
    land(index = writes.length - 1): CheckedWriteOutcome {
      const write = writes[index];
      if (!write) {
        throw new Error(`No write ${index} was issued.`);
      }
      const { expected, data } = write.input;
      const matches =
        expected === null
          ? file.bytes === null
          : file.bytes !== null && decoder.decode(file.bytes) === decoder.decode(expected);
      if (!matches) {
        return { status: 'conflict' };
      }
      file.bytes = bytesOf(data);
      return { status: 'applied', content: file.bytes };
    },
    /** The authority decides the latest write and its reply arrives. */
    async reply(index = writes.length - 1): Promise<void> {
      writes[index]?.settle(this.land(index));
      await flush();
    },
    /** Another party writes the file. */
    foreign(content: string | null): void {
      file.bytes = content === null ? null : bytesOf(content);
    },
    /** The first read: the store is observing `file`. */
    async observe(): Promise<void> {
      void commands.read();
      await this.serve();
    },
  };
};

describe('recordSync', () => {
  describe('composition (MC-R4)', () => {
    it('should export no machine or actor instance from the machine module', () => {
      const instances = Object.entries<unknown>(machineModule).filter(
        ([, value]) => typeof value === 'object' && value !== null && ('getSnapshot' in value || 'transition' in value),
      );

      expect(instances).toEqual([]);
    });

    it('should return an unstarted actor', () => {
      const { actor } = createRecordSync({
        machine: createRecordSyncMachine(policy),
        ports: { read: async () => ({ status: 'read', bytes: null }), write: async () => ({ status: 'conflict' }) },
      });

      expect(actor.getSnapshot().status).toBe('active');
      expect(actor.getSnapshot().context.origin).toBe('none');
      expect(actor.getSnapshot().value).toEqual({ source: 'unread', intent: 'quiet', write: 'idle' });
    });
  });

  describe('reads', () => {
    it('should publish the first read as foreign and answer its request', async () => {
      const store = harness();
      const reading = store.commands.read();
      await store.serve();

      expect(await reading).toBe(true);
      expect(store.published()).toEqual([['foreign', 'name=seed']]);
      expect(store.context().origin).toBe('foreign');
    });

    it('should publish an absent file as no record', async () => {
      const store = harness({ file: null });
      await store.observe();

      expect(store.context().published).toEqual({ record: undefined, bytes: null, refusal: undefined });
      expect(store.published()).toEqual([['foreign', null]]);
    });

    it('should let only the latest read reach the store', async () => {
      const store = harness();
      const first = store.commands.read();
      store.foreign('name=later');
      const second = store.commands.read();
      await store.serve(1);
      store.reads[0]?.settle({ status: 'read', bytes: bytesOf('name=stale') });
      await flush();

      expect(await Promise.all([first, second])).toEqual([true, true]);
      expect(store.published()).toEqual([['foreign', 'name=later']]);
    });

    it('should not publish bytes that are already shown unless the read is forced', async () => {
      const store = harness();
      await store.observe();
      void store.commands.read();
      await store.serve();

      expect(store.published()).toHaveLength(1);

      void store.commands.read(true);
      await store.serve();

      expect(store.published()).toHaveLength(2);
    });

    it('should keep the record and report the refusal when the bytes do not parse', async () => {
      const store = harness();
      await store.observe();
      store.foreign('!broken');
      void store.commands.read();
      await store.serve();

      expect(store.context().published.record).toEqual({ name: 'seed' });
      expect(store.context().published.refusal?.code).toBe('INVALID_RECORD');
      expect(store.value()).toMatchObject({ source: 'refused' });
    });

    it('should drop the read in flight when its source is invalidated', async () => {
      const store = harness();
      const reading = store.commands.read();
      store.commands.invalidate();
      await store.serve();

      expect(await reading).toBe(false);
      expect(store.published()).toEqual([]);
      expect(store.value()).toMatchObject({ source: 'unread' });
    });

    it('should back off a failed read on the clock and stop after four failures', async () => {
      const store = harness();
      const reading = store.commands.read();
      store.reads[0]?.settle({ status: 'failed', error: new Error('disk busy') });
      await flush();

      expect(await reading).toBe(false);
      expect(store.context().health).toMatchObject({ read: 'retrying', error: 'disk busy' });
      expect(store.reads).toHaveLength(1);

      for (const backoffDelay of [250, 500, 1000]) {
        store.clock.advance(backoffDelay - 1);
        expect(store.reads).toHaveLength([250, 500, 1000].indexOf(backoffDelay) + 1);
        store.clock.advance(1);
        store.reads.at(-1)?.settle({ status: 'failed', error: new Error('disk busy') });
        // oxlint-disable-next-line no-await-in-loop -- each failure settles before the next backoff.
        await flush();
      }

      expect(store.reads).toHaveLength(4);
      expect(store.context().health.read).toBe('unavailable');
      expect(store.clock.nextDue()).toBeUndefined();
      expect(store.value()).toMatchObject({ source: 'unavailable' });
    });

    it('should stop at once on a permission failure and start again on Try again', async () => {
      const store = harness();
      void store.commands.read();
      store.reads[0]?.settle({ status: 'failed', error: Object.assign(new Error('denied'), { code: 'EACCES' }) });
      await flush();

      expect(store.context().health.read).toBe('unavailable');

      const retried = store.commands.retryRead();

      expect(store.context().health.read).toBe('retrying');

      await store.serve();

      expect(await retried).toBe(true);
      expect(store.context().health.read).toBe('ok');
      expect(store.published()).toEqual([['foreign', 'name=seed']]);
    });

    it('should treat a read port that rejects as a failed read', async () => {
      const store = harness();
      void store.commands.read();
      store.reads[0]?.fail(new Error('port defect'));
      await flush();

      expect(store.context().health).toMatchObject({ read: 'retrying', error: 'port defect' });
    });
  });

  describe('writes', () => {
    it('should write an edit against the published bytes and publish the reply as its own', async () => {
      const store = harness();
      await store.observe();
      const saved = store.commands.edit({ name: 'Front' });

      expect(store.writes).toHaveLength(1);
      expect(store.writes[0]?.input).toMatchObject({ data: 'name=Front', kind: 'edit' });
      expect(decoder.decode(store.writes[0]?.input.expected ?? undefined)).toBe('name=seed');
      expect(store.context().health.writing).toBe(true);

      await store.reply();

      expect(await saved).toBe(true);
      expect(store.published().at(-1)).toEqual(['own', 'name=Front']);
      expect(store.emitted.findLast((event) => event.type === 'published')).toMatchObject({ patch: { name: 'Front' } });
      expect(store.context().health.writing).toBe(false);
    });

    it('should hold an edit made before the first read until that read completes', async () => {
      const store = harness();
      const saved = store.commands.edit({ name: 'Front' });

      expect(store.writes).toHaveLength(0);
      expect(store.reads).toHaveLength(1);

      await store.serve();
      await store.reply();

      expect(await saved).toBe(true);
      expect(store.file.bytes && decoder.decode(store.file.bytes)).toBe('name=Front');
    });

    it('should write nothing when the edit changes no field', async () => {
      const store = harness();
      await store.observe();

      expect(await store.commands.edit({ name: 'seed' })).toBe(true);
      expect(store.writes).toHaveLength(0);
    });

    it('should issue one checked write at a time, a flush included', async () => {
      const store = harness();
      await store.observe();
      const first = store.commands.edit({ name: 'One' });
      const second = store.commands.edit({ name: 'Two' });
      const flushed = store.commands.flush();
      await flush();

      expect(store.writes).toHaveLength(1);

      await store.reply();

      expect(store.writes).toHaveLength(2);
      expect(store.writes[1]?.input.data).toBe('name=Two');

      await store.reply();

      expect(await Promise.all([first, second, flushed])).toEqual([true, true, true]);
      expect(store.writes).toHaveLength(2);
    });

    it('should coalesce the edits of one debounce window into one write', async () => {
      const store = harness({ editDebounce: 100 });
      await store.observe();
      const first = store.commands.edit({ name: 'One' });
      store.clock.advance(99);
      const second = store.commands.edit({ name: 'One', unit: 'in' });
      store.clock.advance(99);

      expect(store.writes).toHaveLength(0);

      store.clock.advance(1);

      expect(store.writes).toHaveLength(1);
      expect(store.writes[0]?.input.data).toBe('name=One;unit=in');

      await store.reply();

      expect(await Promise.all([first, second])).toEqual([true, true]);
    });

    it('should write the waiting edits at once on a flush', async () => {
      const store = harness({ editDebounce: 100 });
      await store.observe();
      void store.commands.edit({ name: 'One' });
      const flushed = store.commands.flush();

      expect(store.writes).toHaveLength(1);

      await store.reply();

      expect(await flushed).toBe(true);
      expect(store.clock.nextDue()).toBeUndefined();
    });

    it('should answer a flush with nothing owed at once', async () => {
      const store = harness();
      await store.observe();

      expect(await store.commands.flush()).toBe(true);
    });

    it("should carry the person's fields onto the bytes a conflict read returns", async () => {
      const store = harness();
      await store.observe();
      const saved = store.commands.edit({ name: 'Front' });
      store.foreign('name=seed;unit=in');
      await store.reply();

      expect(store.context().ownWrites).toEqual([]);
      expect(store.value()).toMatchObject({ write: 'awaitingBase', source: 'reading' });

      await store.serve();

      expect(store.writes).toHaveLength(2);
      expect(store.writes[1]?.input.data).toBe('name=Front;unit=in');

      await store.reply();

      expect(await saved).toBe(true);
      expect(store.published()).toEqual([
        ['foreign', 'name=seed'],
        ['foreign', 'name=seed;unit=in'],
        ['own', 'name=Front;unit=in'],
      ]);
    });

    it('should report a record that keeps changing after three writes and try again on the clock', async () => {
      const store = harness();
      await store.observe();
      const saved = store.commands.edit({ name: 'Front' });
      for (const round of [1, 2, 3]) {
        store.foreign(`name=seed;round=${round}`);
        // oxlint-disable-next-line no-await-in-loop -- each conflict and its read settle in turn.
        await store.reply();
        // oxlint-disable-next-line no-await-in-loop -- each conflict and its read settle in turn.
        await store.serve();
      }

      expect(await saved).toBe(false);
      expect(store.writes).toHaveLength(3);
      expect(store.emitted.filter((event) => event.type === 'failed')).toHaveLength(1);
      expect(store.context().health.unconfirmed).toBe(true);
      expect(store.value()).toMatchObject({ write: 'retrying' });

      store.clock.advance(firstRetryDelay);

      expect(store.writes).toHaveLength(4);

      await store.reply();

      expect(store.context().health.unconfirmed).toBe(false);
      expect(store.file.bytes && decoder.decode(store.file.bytes)).toBe('name=Front;round=3');
    });

    it('should double the retry delay after each failed timed retry', async () => {
      const store = harness();
      await store.observe();
      void store.commands.edit({ name: 'Front' });
      store.writes[0]?.settle({ status: 'failed', error: new Error('offline'), lost: false });
      await flush();

      expect(store.context().ownWrites).toEqual([]);

      store.clock.advance(firstRetryDelay);
      store.writes[1]?.settle({ status: 'failed', error: new Error('offline'), lost: false });
      await flush();
      store.clock.advance(firstRetryDelay * 2 - 1);

      expect(store.writes).toHaveLength(2);

      store.clock.advance(1);

      expect(store.writes).toHaveLength(3);
    });

    it('should hold no write in flight after a write fails', async () => {
      const store = harness();
      await store.observe();
      void store.commands.edit({ name: 'Front' });
      store.writes[0]?.settle({ status: 'failed', error: new Error('offline'), lost: false });
      await flush();
      void store.commands.read();
      await store.serve();

      expect(store.context().inFlight).toBeUndefined();
      expect(store.context().overlap).toBe(false);
      expect(store.context().health).toMatchObject({ writing: false, unconfirmed: true });
    });

    it('should hold no write in flight after an applied reply', async () => {
      const store = harness();
      await store.observe();
      void store.commands.edit({ name: 'Front' });
      await store.reply();
      void store.commands.read();
      await store.serve();

      expect(store.context().inFlight).toBeUndefined();
      expect(store.context().overlap).toBe(false);
      expect(store.context().health).toMatchObject({ writing: false, unconfirmed: false });
    });

    it('should keep the edit owed when the record cannot be serialized', async () => {
      const store = harness();
      await store.observe();

      expect(await store.commands.edit({ name: 'Front', forbidden: 'yes' })).toBe(false);
      expect(store.writes).toHaveLength(0);
      expect(store.context().deferred).toEqual({ name: 'Front', forbidden: 'yes' });
      expect(store.emitted.filter((event) => event.type === 'failed')).toHaveLength(1);
    });

    it('should report a write outstanding past the slow limit as unconfirmed', async () => {
      const store = harness();
      await store.observe();
      void store.commands.edit({ name: 'Front' });
      store.clock.advance(slowWriteMilliseconds);

      expect(store.context().health).toMatchObject({ unconfirmed: true, writing: true });

      await store.reply();

      expect(store.context().health).toMatchObject({ unconfirmed: false, writing: false });
    });

    it('should not write over a refused record', async () => {
      const store = harness({ file: '^newer' });
      await store.observe();

      expect(await store.commands.edit({ name: 'Front' })).toBe(false);
      expect(await store.commands.flush()).toBe(false);
      expect(store.writes).toHaveLength(0);
      expect(store.context().deferred).toEqual({ name: 'Front' });
    });
  });

  describe('own-write attribution (target rules 1 to 6)', () => {
    it('should attribute a read of the bytes of a write still in flight to this store (rules 1 and 2)', async () => {
      const store = harness();
      await store.observe();
      void store.commands.edit({ name: 'Front' });
      store.land();
      void store.commands.read();
      await store.serve();

      expect(store.published().at(-1)).toEqual(['own', 'name=Front']);
      expect(store.context().ownWrites).toMatchObject([{ state: 'inFlight' }]);
    });

    it('should publish nothing on the reply of an overlapped write and start a refresh read (rule 5)', async () => {
      const store = harness();
      await store.observe();
      const saved = store.commands.edit({ name: 'Front' });
      void store.commands.read();
      await store.serve();
      const before = store.published().length;
      await store.reply();

      expect(store.published()).toHaveLength(before);
      expect(store.reads).toHaveLength(3);
      expect(store.value()).toMatchObject({ write: 'awaitingRefresh', source: 'reading' });

      await store.serve();

      expect(await saved).toBe(true);
      expect(store.published().at(-1)).toEqual(['own', 'name=Front']);
    });

    it('should count a read that completes while a write is in flight as an overlap (rule 5, SnapshotMonotone)', async () => {
      const store = harness();
      await store.observe();
      void store.commands.read();
      void store.commands.edit({ name: 'Front' });
      store.foreign('name=newer');
      await store.serve();

      expect(store.published().at(-1)).toEqual(['foreign', 'name=newer']);
      expect(store.context().overlap).toBe(true);

      await store.reply();

      // The conflict is not published over the newer foreign version; the writer reads again.
      expect(store.published().at(-1)).toEqual(['foreign', 'name=newer']);
    });

    it('should let the reply of a write no read overlapped supersede a read in flight (rule 5)', async () => {
      const store = harness();
      await store.observe();
      const reading = store.commands.read();
      const saved = store.commands.edit({ name: 'Front' });
      await store.reply();

      expect(await saved).toBe(true);
      expect(await reading).toBe(true);
      expect(store.value()).toMatchObject({ source: 'observed' });

      store.reads[1]?.settle({ status: 'read', bytes: bytesOf('name=seed') });
      await flush();

      expect(store.published().at(-1)).toEqual(['own', 'name=Front']);
    });

    it('should attribute a watch read that supersedes the refresh read to this store (today-slots)', async () => {
      const store = harness();
      await store.observe();
      void store.commands.edit({ name: 'Front' });
      void store.commands.read();
      await store.reply();
      void store.commands.read();
      await store.serve();

      expect(store.published().at(-1)).toEqual(['own', 'name=Front']);
    });

    it('should publish a forced read of its own acknowledged bytes as its own (post-1602-forced-read)', async () => {
      const store = harness();
      await store.observe();
      void store.commands.edit({ name: 'Front' });
      await store.reply();
      void store.commands.retryRead();
      await store.serve();

      expect(store.published().slice(-2)).toEqual([
        ['own', 'name=Front'],
        ['own', 'name=Front'],
      ]);
    });

    it('should drop an acknowledged entry when a read returns other bytes (rule 3, I12)', async () => {
      const store = harness();
      await store.observe();
      void store.commands.edit({ name: 'Front' });
      await store.reply();
      store.foreign('name=other');
      void store.commands.read();
      await store.serve();

      expect(store.context().ownWrites).toEqual([]);

      store.foreign('name=Front');
      void store.commands.read();
      await store.serve();

      expect(store.published().at(-1)).toEqual(['foreign', 'name=Front']);
    });

    it('should drop the earlier acknowledged entries on an acknowledgement (rule 4, post-1602-ForeignStaysForeign)', async () => {
      const store = harness();
      await store.observe();
      void store.commands.edit({ name: 'One' });
      await store.reply();
      void store.commands.edit({ name: 'Two' });
      await store.reply();

      expect(store.context().ownWrites).toMatchObject([{ writeId: 2, state: 'acknowledged' }]);

      store.foreign('name=One');
      void store.commands.read();
      await store.serve();

      expect(store.published().at(-1)).toEqual(['foreign', 'name=One']);
    });

    it('should remove only the entry of the write that conflicted (rule 1, digest-keyed-entries)', async () => {
      const store = harness();
      await store.observe();
      void store.commands.edit({ name: 'Front' });
      store.land(0);
      store.writes[0]?.settle(lostReply());
      await flush();
      // The lost write landed. The retry of the same bytes reads back first, and that read is this store's own.
      store.clock.advance(firstRetryDelay);
      await store.serve();

      expect(store.published().at(-1)).toEqual(['own', 'name=Front']);
      expect(store.context().ownWrites).toMatchObject([{ writeId: 1, state: 'lost' }]);
      expect(store.writes).toHaveLength(1);
    });

    it('should wait for the latest read after a conflict (rule 6)', async () => {
      const store = harness();
      await store.observe();
      void store.commands.edit({ name: 'Front' });
      store.foreign('name=seed;unit=in');
      await store.reply();
      store.foreign('name=seed;unit=cm');
      void store.commands.read();
      store.reads.at(-2)?.settle({ status: 'read', bytes: bytesOf('name=seed;unit=in') });
      await flush();

      expect(store.writes).toHaveLength(1);

      await store.serve();

      expect(store.writes[1]?.input.data).toBe('name=Front;unit=cm');
    });
  });

  describe('a lost reply', () => {
    it('should keep the entry of a lost write through a read-back of other bytes (post-1602-lost-reply)', async () => {
      const store = harness();
      await store.observe();
      const saved = store.commands.edit({ name: 'Front' });
      store.writes[0]?.settle(lostReply());
      await flush();

      expect(await saved).toBe(false);
      expect(store.context().ownWrites).toMatchObject([{ writeId: 1, state: 'lost' }]);
      expect(store.context().health.unconfirmed).toBe(true);

      // A watch read supersedes nothing here: it is the read-back, and it returns the old bytes.
      void store.commands.read();
      await store.serve();

      expect(store.context().readBack).toBe('none');
      expect(store.context().ownWrites).toMatchObject([{ writeId: 1, state: 'lost' }]);

      // The lost write lands late; the watch read of its bytes is this store's own.
      store.land(0);
      void store.commands.read();
      await store.serve();

      expect(store.published().at(-1)).toEqual(['own', 'name=Front']);
    });

    it('should read the file back before it writes again', async () => {
      const store = harness();
      await store.observe();
      void store.commands.edit({ name: 'Front' });
      store.writes[0]?.settle(lostReply());
      await flush();
      const flushed = store.commands.flush();

      expect(store.writes).toHaveLength(1);
      expect(store.reads).toHaveLength(2);
      expect(store.value()).toMatchObject({ write: 'awaitingBase' });

      await store.serve();

      expect(store.writes).toHaveLength(2);

      await store.reply();

      expect(await flushed).toBe(true);
      expect(store.context().health.unconfirmed).toBe(false);
    });

    it('should keep a lost entry through a later acknowledgement (rule 4 drops acknowledged entries only)', async () => {
      const store = harness();
      await store.observe();
      void store.commands.edit({ name: 'Front' });
      store.writes[0]?.settle(lostReply());
      await flush();
      store.clock.advance(firstRetryDelay);
      await store.serve();
      await store.reply();

      expect(store.context().ownWrites).toMatchObject([
        { writeId: 1, state: 'lost' },
        { writeId: 2, state: 'acknowledged' },
      ]);
    });

    it(`should keep at most ${maxLostWrites} lost entries`, async () => {
      const store = harness();
      await store.observe();
      void store.commands.edit({ name: 'Front' });
      for (let lost = 0; lost <= maxLostWrites; lost++) {
        store.writes.at(-1)?.settle(lostReply());
        // oxlint-disable-next-line no-await-in-loop -- each lost reply and read-back settle in turn.
        await flush();
        void store.commands.flush();
        // oxlint-disable-next-line no-await-in-loop -- each lost reply and read-back settle in turn.
        await store.serve();
      }

      const lostIds = store
        .context()
        .ownWrites.filter((write) => write.state === 'lost')
        .map((write) => write.writeId);

      expect(lostIds).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('should treat a write port that rejects as a write that reached no authority', async () => {
      const store = harness();
      await store.observe();
      const saved = store.commands.edit({ name: 'Front' });
      store.writes[0]?.fail(new Error('port defect'));
      await flush();

      expect(await saved).toBe(false);
      expect(store.context().ownWrites).toEqual([]);
      expect(store.context().readBack).toBe('none');
    });
  });

  describe('ensure and reset', () => {
    it('should write the seed only while the file is absent', async () => {
      const store = harness({ file: null });
      await store.observe();
      const ensured = store.commands.ensure({ name: 'seed' }, 'ensure-1');

      expect(store.writes[0]?.input).toMatchObject({ kind: 'ensure', requestId: 'ensure-1', expected: null });

      await store.reply();

      expect(await ensured).toBe(true);
      expect(await store.commands.ensure({ name: 'other' })).toBe(true);
      expect(store.writes).toHaveLength(1);
    });

    it('should answer an ensure whose owner no longer wants the file with no', async () => {
      const store = harness({ file: null });
      await store.observe();
      const ensured = store.commands.ensure({ name: 'seed' });
      store.writes[0]?.settle({ status: 'ineligible' });
      await flush();

      expect(await ensured).toBe(false);
      expect(store.context().ownWrites).toEqual([]);
    });

    it('should accept the file another party created when an ensure conflicts', async () => {
      const store = harness({ file: null });
      await store.observe();
      const ensured = store.commands.ensure({ name: 'seed' });
      store.foreign('name=theirs');
      await store.reply();
      await store.serve();

      expect(await ensured).toBe(true);
      expect(store.writes).toHaveLength(1);
    });

    it('should reset an invalid record only against the bytes the person reviewed', async () => {
      const store = harness({ file: '!broken' });
      await store.observe();

      expect(await store.commands.reset({ name: 'fresh' }, bytesOf('!other'))).toBe(false);
      expect(store.writes).toHaveLength(0);

      const reset = store.commands.reset({ name: 'fresh' }, bytesOf('!broken'));

      expect(store.writes[0]?.input).toMatchObject({ kind: 'reset', data: 'name=fresh' });

      await store.reply();

      expect(await reset).toBe(true);
      expect(store.published().at(-1)).toEqual(['own', 'name=fresh']);
      expect(store.context().published.refusal).toBeUndefined();
    });

    it('should refuse to reset a record a newer Tau wrote', async () => {
      const store = harness({ file: '^newer' });
      await store.observe();

      expect(await store.commands.reset({ name: 'fresh' }, bytesOf('^newer'))).toBe(false);
      expect(store.writes).toHaveLength(0);
    });

    it('should refuse the edits that waited behind a reset and owe nothing once the reset is saved', async () => {
      const store = harness({ file: '!broken', editDebounce: 100 });
      await store.observe();
      const edited = store.commands.edit({ name: 'Front' });
      const reset = store.commands.reset({ name: 'fresh' }, bytesOf('!broken'));

      expect(await edited).toBe(false);

      await store.reply();

      expect(await reset).toBe(true);
      expect(store.context().deferred).toBeUndefined();
    });
  });

  describe('the close fence (rule 7)', () => {
    it('should start no write after the close and answer what waited', async () => {
      const store = harness({ editDebounce: 100 });
      await store.observe();
      const edited = store.commands.edit({ name: 'Front' });
      const reading = store.commands.read();
      store.commands.close();

      expect(await edited).toBe(false);
      expect(await reading).toBe(false);
      expect(store.actor.getSnapshot().status).toBe('done');

      store.clock.advance(1000);

      expect(store.writes).toHaveLength(0);
      expect(await store.commands.edit({ name: 'Late' })).toBe(false);
      expect(await store.commands.flush()).toBe(false);
    });

    it('should let the write on the wire answer and publish nothing after the close', async () => {
      const store = harness();
      await store.observe();
      const saved = store.commands.edit({ name: 'Front' });
      store.commands.close();
      const published = store.published().length;

      expect(store.actor.getSnapshot().status).toBe('active');

      await store.reply();

      expect(await saved).toBe(true);
      expect(store.published()).toHaveLength(published);
      expect(store.actor.getSnapshot().status).toBe('done');
      expect(await store.commands.flush()).toBe(true);
    });

    it('should schedule no retry when the write on the wire fails after the close', async () => {
      const store = harness();
      await store.observe();
      const saved = store.commands.edit({ name: 'Front' });
      store.commands.close();
      store.writes[0]?.settle({ status: 'failed', error: new Error('offline'), lost: false });
      await flush();

      expect(await saved).toBe(false);
      expect(store.clock.nextDue()).toBeUndefined();
      expect(store.actor.getSnapshot().status).toBe('done');
    });

    it('should still owe an edit that waited behind the write on the wire when that write is applied after the close', async () => {
      const store = harness();
      await store.observe();
      const saved = store.commands.edit({ name: 'Front' });
      const late = store.commands.edit({ name: 'Late' });
      store.commands.close();

      expect(await late).toBe(false);

      await store.reply();

      expect(await saved).toBe(true);
      expect(store.writes).toHaveLength(1);
      expect(store.actor.getSnapshot().status).toBe('done');
      expect(store.context().deferred).toEqual({ name: 'Late' });
      expect(await store.commands.flush()).toBe(false);
    });

    it('should owe both the failed write and the edit that waited behind it after the close', async () => {
      const store = harness();
      await store.observe();
      const saved = store.commands.edit({ name: 'Front', mode: 'a' });
      const late = store.commands.edit({ name: 'Late' });
      store.commands.close();
      store.writes[0]?.settle({ status: 'failed', error: new Error('offline'), lost: false });
      await flush();

      expect(await saved).toBe(false);
      expect(await late).toBe(false);
      expect(store.context().deferred).toEqual({ name: 'Late', mode: 'a' });
      expect(await store.commands.flush()).toBe(false);
    });
  });

  describe('adversarial review rows', () => {
    it('should keep the edits a reset folded in while a write was on the wire when that write is blocked', async () => {
      const store = harness();
      await store.observe();
      const front = store.commands.edit({ name: 'Front' });
      store.foreign('!x');
      void store.commands.read();
      await store.serve();
      const mode = store.commands.edit({ name: 'Front', mode: 'a' });
      const reset = store.commands.reset({ name: 'fresh' }, bytesOf('!x'));
      await flush();

      expect(store.context().deferred).toEqual({ mode: 'a' });

      store.foreign('!y');
      await store.reply(0);
      await store.serve();

      expect(await front).toBe(false);
      expect(await mode).toBe(false);
      expect(await reset).toBe(false);
      expect(store.context().deferred).toEqual({ name: 'Front', mode: 'a' });
    });

    it('should still owe the edits a reset folded in when the write on the wire is applied after the close', async () => {
      const store = harness();
      await store.observe();
      const front = store.commands.edit({ name: 'Front' });
      store.foreign('!x');
      void store.commands.read();
      await store.serve();
      store.foreign('name=seed');
      void store.commands.edit({ name: 'Front', mode: 'a' });
      void store.commands.reset({ name: 'fresh' }, bytesOf('!x'));
      await flush();
      store.commands.close();
      await store.reply(0);

      expect(await front).toBe(true);
      expect(store.actor.getSnapshot().status).toBe('done');
      expect(store.context().deferred).toEqual({ mode: 'a' });
      expect(await store.commands.flush()).toBe(false);
    });

    it('should keep the retry of a failed edit due when an ensure is served during its backoff', async () => {
      const store = harness();
      await store.observe();
      const front = store.commands.edit({ name: 'Front' });
      store.writes[0]?.settle({ status: 'failed', error: new Error('offline'), lost: false });
      await flush();

      expect(await front).toBe(false);

      const ensured = store.commands.ensure({ name: 'seed' });
      await flush();

      expect(await ensured).toBe(true);
      expect(store.writes).toHaveLength(1);
      expect(store.clock.nextDue()).toBeDefined();

      store.clock.advance(60_000);
      await flush();

      expect(store.writes).toHaveLength(2);
      expect(store.writes[1]?.input.data).toBe('name=Front');
    });

    it('should keep the retry of an edit whose first read failed due when an ensure is served during its backoff', async () => {
      const store = harness();
      const mine = store.commands.edit({ name: 'mine' });
      await flush();
      store.reads[0]?.settle({ status: 'failed', error: new Error('disk busy') });
      await flush();

      expect(await mine).toBe(false);

      const ensured = store.commands.ensure({ name: 'seed' });
      await flush();
      await store.serve();

      expect(await ensured).toBe(true);
      expect(store.context().deferred).toEqual({ name: 'mine' });

      store.clock.advance(60_000);
      await flush();
      await store.serve();

      expect(store.writes.map((write) => write.input.data)).toEqual(['name=mine']);
    });

    it('should write an edit made before a waiting flush before the flush answers, even in a new debounce window', async () => {
      const store = harness({ editDebounce: 100 });
      await store.observe();
      void store.commands.edit({ name: 'zero' });
      store.clock.advance(100);
      await flush();

      expect(store.writes).toHaveLength(1);

      const edited = store.commands.edit({ name: 'A' });
      const flushed = store.commands.flush();
      const later = store.commands.edit({ name: 'A', unit: 'in' });
      await flush();
      await store.reply(0);

      expect(store.writes).toHaveLength(2);

      await store.reply();

      expect(await edited).toBe(true);
      expect(await later).toBe(true);
      expect(await flushed).toBe(true);
      expect(store.file.bytes && decoder.decode(store.file.bytes)).toBe('name=A;unit=in');
    });

    it('should publish the Try again read when a watch read supersedes it', async () => {
      const store = harness();
      await store.observe();
      for (let attempt = 0; attempt < 4; attempt++) {
        void store.commands.read();
        store.reads.at(-1)?.settle({ status: 'failed', error: new Error('disk busy') });
        // oxlint-disable-next-line no-await-in-loop -- each failure settles before the next read.
        await flush();
      }
      const published = store.published().length;
      const retried = store.commands.retryRead();
      void store.commands.read();
      await flush();
      await store.serve();

      expect(await retried).toBe(true);
      expect(store.published()).toHaveLength(published + 1);
    });

    it('should read again before the next write when the refresh read is abandoned (rule 6)', async () => {
      const store = harness();
      await store.observe();
      const one = store.commands.edit({ name: 'one' });
      void store.commands.read();
      await flush();
      await store.reply();

      expect(store.value()).toMatchObject({ write: 'awaitingRefresh' });

      const two = store.commands.edit({ name: 'one', x: '2' });
      store.commands.invalidate();
      await flush();

      expect(store.writes).toHaveLength(1);

      await store.serve();
      await flush();

      expect(await one).toBe(true);
      expect(store.writes).toHaveLength(2);
      expect(store.writes[1]?.input.expected && decoder.decode(store.writes[1].input.expected)).toBe('name=one');

      await store.reply();

      expect(await two).toBe(true);
    });

    it('should answer a flush once the edits made before it are written, while later edits keep arriving', async () => {
      const store = harness({ editDebounce: 500 });
      await store.observe();
      const first = store.commands.edit({ name: 'one' });
      const flushed = store.commands.flush();
      await flush();
      const later = store.commands.edit({ name: 'two' });
      await store.reply();

      expect(await first).toBe(true);
      expect(await flushed).toBe(true);
      expect(store.writes).toHaveLength(1);

      store.clock.advance(500);
      await flush();
      await store.reply();

      expect(await later).toBe(true);
      expect(store.writes).toHaveLength(2);
    });

    it('should publish the Try again read when an invalidate abandons it', async () => {
      const store = harness();
      await store.observe();
      void store.commands.read();
      store.reads.at(-1)?.settle({ status: 'failed', error: Object.assign(new Error('denied'), { code: 'EACCES' }) });
      await flush();
      const published = store.published().length;
      void store.commands.retryRead();
      store.commands.invalidate();
      const read = store.commands.read();
      await flush();
      await store.serve();

      expect(await read).toBe(true);
      expect(store.published()).toHaveLength(published + 1);
    });

    it('should keep the edits a second reset folded in when the first reset is saved', async () => {
      const store = harness({ file: '!bad' });
      await store.observe();
      const first = store.commands.reset({ name: 'fresh' }, bytesOf('!bad'));
      await flush();

      expect(store.writes).toHaveLength(1);

      const edited = store.commands.edit({ name: 'fresh', p: '1' });
      const second = store.commands.reset({ name: 'fresh' }, bytesOf('!bad'));
      await flush();
      await store.reply();

      expect(await first).toBe(true);
      expect(await edited).toBe(false);
      expect(await second).toBe(false);
      expect(store.context().deferred).toEqual({ name: 'fresh', p: '1' });

      const flushed = store.commands.flush();
      await flush();
      await store.reply();

      expect(await flushed).toBe(true);
      expect(store.file.bytes && decoder.decode(store.file.bytes)).toBe('name=fresh;p=1');
    });

    it('should still owe an edit the close folded in when the reset on the wire is saved', async () => {
      const store = harness({ file: '!bad' });
      await store.observe();
      const reset = store.commands.reset({ name: 'fresh' }, bytesOf('!bad'));
      await flush();
      void store.commands.edit({ name: 'fresh', p: '1' });
      store.commands.close();
      await store.reply();

      expect(await reset).toBe(true);
      expect(store.actor.getSnapshot().status).toBe('done');
      expect(store.context().deferred).toEqual({ name: 'fresh', p: '1' });
      expect(await store.commands.flush()).toBe(false);
    });

    it('should keep owing fields when no record is left to carry them onto', async () => {
      const store = harness({ file: 'a=1' });
      await store.observe();
      const first = store.commands.edit({ a: '1', p: '1' });
      void store.commands.read();
      store.foreign('!bad');
      await store.serve();
      // The authority applied the write before the foreign bytes landed.
      store.writes[0]?.settle({ status: 'applied', content: bytesOf('a=1;p=1') });
      await flush();

      expect(store.value()).toMatchObject({ write: 'awaitingRefresh' });

      void store.commands.edit({ a: '1', p: '1', q: '2' });
      const reset = store.commands.reset({ r: '1' }, bytesOf('!bad'));
      await flush();
      store.foreign(null);
      await store.serve();

      expect(await first).toBe(true);
      expect(await reset).toBe(false);

      expect(await store.commands.flush()).toBe(false);
      expect(store.writes).toHaveLength(1);
      expect(store.context().deferred).toBeDefined();
    });

    it('should report the read healthy when a write reply supersedes the read that was retrying', async () => {
      const store = harness();
      await store.observe();
      void store.commands.read();
      store.reads.at(-1)?.settle({ status: 'failed', error: new Error('disk busy') });
      await flush();

      expect(store.context().health.read).toBe('retrying');

      store.clock.advance(60_000);
      await flush();
      void store.commands.edit({ name: 'Front' });
      await flush();
      await store.reply();

      expect(store.context().health.read).toBe('ok');
      expect(store.context().readFailures).toBe(0);
    });
  });

  describe('machine discipline', () => {
    const machine = createRecordSyncMachine(policy);
    const sample = (snapshot: AnyMachineSnapshot): Array<RecordSyncEvent<Fields>> => [
      { type: 'read', requestId: 'r', forced: false },
      { type: 'retryRead', requestId: 'r' },
      { type: 'invalidate' },
      { type: 'edit', requestId: 'e', next: { name: `n${String(snapshot.context.nextWriteId)}` } },
      { type: 'ensure', requestId: 'c', seed: { name: 'seed' } },
      { type: 'reset', requestId: 'c', next: { name: 'fresh' }, reviewed: null },
      { type: 'flush', requestId: 'f' },
      { type: 'close' },
    ];
    const options = {
      input: { editDebounce: 100 },
      events: sample,
      limit: 2000,
      serializeState: (snapshot: AnyMachineSnapshot) => JSON.stringify(snapshot.value),
    };

    it('should answer or declare ignored every public event in every reachable state (MC-R17)', () => {
      expect(unansweredEvents(machine, { ...options, ignore: recordSyncIgnoredEvents })).toEqual([]);
    });

    it('should reach every state but the ones only a port outcome enters', () => {
      // No port answers during enumeration, so the states behind a read or a write reply stay unreached.
      expect(unreachedStates(machine, options).toSorted()).toEqual([
        'record-sync.source.backoff',
        'record-sync.source.observed',
        'record-sync.source.refused',
        'record-sync.source.unavailable',
        'record-sync.write.awaitingRefresh',
        'record-sync.write.retrying',
        'record-sync.write.starting',
        'record-sync.write.writing',
      ]);
    });

    it('should record a transition that throws and answer every request after it false (MC-R12)', async () => {
      const throwing: RecordPolicy<Fields, Fields> = {
        ...policy,
        diff(base, next) {
          if ('explode' in next) {
            throw new Error('diff defect');
          }
          return policy.diff(base, next);
        },
      };
      const { actor, commands } = createRecordSync({
        machine: createRecordSyncMachine(throwing),
        ports: {
          read: async () => ({ status: 'read', bytes: bytesOf('name=seed') }),
          write: async ({ data }) => ({ status: 'applied', content: bytesOf(data) }),
        },
      });
      actor.start();
      expect(await commands.edit({ explode: 'yes' })).toBe(false);
      expect(actor.getSnapshot().context.fault).toBe('diff defect');
      expect(actor.getSnapshot().status).toBe('active');
      expect(await commands.edit({ name: 'Front' })).toBe(false);
      expect(await commands.flush()).toBe(false);
    });

    it('should answer a request waiting when a port reply faults, and every request after (MC-R12)', async () => {
      const throwing: RecordPolicy<Fields, Fields> = {
        ...policy,
        diff(base, next) {
          if ('explode' in next) {
            throw new Error('diff defect');
          }
          return policy.diff(base, next);
        },
      };
      const reads: Array<(outcome: RecordReadOutcome) => void> = [];
      const { actor, commands } = createRecordSync({
        machine: createRecordSyncMachine(throwing),
        ports: {
          read: async () =>
            new Promise<RecordReadOutcome>((resolve) => {
              reads.push(resolve);
            }),
          write: async ({ data }) => ({ status: 'applied', content: bytesOf(data) }),
        },
      });
      actor.start();
      const ensured = commands.ensure({ explode: 'yes' });
      await flush();
      reads.at(-1)?.({ status: 'read', bytes: null });
      await flush();

      expect(actor.getSnapshot().context.fault).toBe('diff defect');
      expect(await ensured).toBe(false);

      expect(await commands.read()).toBe(false);
      expect(await commands.flush()).toBe(false);
      expect(reads).toHaveLength(1);
    });

    it('should hold nothing but data in context at every step (D4)', async () => {
      const recorder = recordTransitions();
      const store = harness({ inspect: recorder.inspect });
      await store.observe();
      void store.commands.edit({ name: 'Front' });
      void store.commands.read();
      await store.serve();
      await store.reply();
      await store.serve();
      store.commands.close();
      const contexts = recorder
        .records()
        .filter((record) => record.machineId === 'record-sync')
        .map((record) => record.context);

      expect(contexts.length).toBeGreaterThan(6);
      for (const context of contexts) {
        // A function or a promise cannot be cloned.
        expect(() => structuredClone(context)).not.toThrow();
      }
    });
  });
});
