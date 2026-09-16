/**
 * The composer record lifecycle (blueprint §"The machine: `composer-record.machine`").
 *
 * Every row here is one of the blueprint's named guarantees: no loading stall,
 * no lost edit, no stale overwrite, one timer, visible failure — plus the
 * coordinator's P28 rule that an unrepairable patch drops its offending fields
 * instead of retaining them behind every later write.
 */

/* oxlint-disable no-await-in-loop -- every await here sequences one machine step after another; running them in parallel would defeat the interleaving these rows pin. */

import { createActor } from 'xstate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MyUIMessage } from '@taucad/chat';
import type { ComposerRecord, ComposerRecordPatch, ComposerRecordReadResult } from '#db/composer-record-store.js';
import { ComposerRecordInputError } from '#db/composer-record-store.js';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import * as machineModule from './composer-record.machine.js';
import { composerRecordMachine } from './composer-record.machine.js';
import type { ComposerRecordMachineEmitted } from './composer-record.machine.js';

const isMachine = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && 'getInitialSnapshot' in value && 'transition' in value;

const userMessage = (text: string): MyUIMessage => ({
  id: 'draft',
  role: 'user',
  metadata: { createdAt: 1_789_509_596_464, status: 'pending' },
  parts: [{ type: 'text', text }],
});

type Harness = {
  readonly reads: ComposerRecordReadResult[];
  readonly writes: ComposerRecordPatch[];
  readonly removes: number[];
  /** Resolvers for the writes that have not settled yet, in call order. */
  readonly settle: Array<{ resolve: () => void; reject: (error: unknown) => void }>;
};

type Options = {
  readonly read?: () => Promise<ComposerRecordReadResult>;
  /** Return `undefined` to hold the write open; the test settles it through `harness.settle`. */
  readonly write?: (fields: ComposerRecordPatch, index: number) => Promise<void> | undefined;
  readonly remove?: () => Promise<void>;
  readonly retryMaxAttempts?: number;
};

const createHarness = (
  options: Options = {},
): {
  actor: ReturnType<typeof createActor<typeof composerRecordMachine>>;
  harness: Harness;
  emitted: ComposerRecordMachineEmitted[];
} => {
  const harness: Harness = { reads: [], writes: [], removes: [], settle: [] };
  const emitted: ComposerRecordMachineEmitted[] = [];

  const actor = createActor(
    composerRecordMachine.provide({
      actors: {
        readRecordActor: fromSafeAsync(async () => {
          const result = await (options.read?.() ?? Promise.resolve<ComposerRecordReadResult>({ status: 'absent' }));
          harness.reads.push(result);
          return { type: 'recordRead', result };
        }),
        writePatchActor: fromSafeAsync(async ({ input }: { input: ComposerRecordPatch }) => {
          const index = harness.writes.length;
          harness.writes.push(input);
          const custom = options.write?.(input, index);
          if (custom !== undefined) {
            await custom;
            return;
          }
          await new Promise<void>((resolve, reject) => {
            harness.settle.push({ resolve, reject });
          });
        }),
        removeRecordActor: fromSafeAsync(async () => {
          harness.removes.push(harness.writes.length);
          await (options.remove?.() ?? Promise.resolve());
        }),
      },
    }),
    { input: { retryMaxAttempts: options.retryMaxAttempts } },
  );

  actor.on('*', (event) => {
    emitted.push(event);
  });

  return { actor, harness, emitted };
};

/** Let every already-scheduled microtask run without advancing fake time. */
const flush = async (): Promise<void> => {
  for (let index = 0; index < 20; index += 1) {
    await Promise.resolve();
  }
};

const typesOf = (emitted: readonly ComposerRecordMachineEmitted[]): string[] => emitted.map((event) => event.type);

describe('composerRecordMachine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exports exactly one machine value', () => {
    expect(Object.values(machineModule).filter((value) => isMachine(value))).toEqual([composerRecordMachine]);
  });

  describe('no loading stall', () => {
    it('reaches usable when the record is absent', async () => {
      const { actor, emitted } = createHarness();

      actor.start();
      await flush();

      expect(actor.getSnapshot().matches({ lifecycle: 'usable' })).toBe(true);
      expect(emitted).toEqual([{ type: 'recordLoaded', record: 'absent' }]);
      actor.stop();
    });

    it('reaches usable with the record when the bytes are valid', async () => {
      const record: ComposerRecord = { version: 1, draft: userMessage('bracket'), mode: 'plan' };
      const { actor, emitted } = createHarness({ read: async () => ({ status: 'valid', record }) });

      actor.start();
      await flush();

      expect(actor.getSnapshot().matches({ lifecycle: 'usable' })).toBe(true);
      expect(actor.getSnapshot().context.record).toEqual(record);
      expect(emitted).toEqual([{ type: 'recordLoaded', record }]);
      actor.stop();
    });

    it('reaches usable with an empty record when the bytes are invalid', async () => {
      const error = new Error('unexpected token');
      const { actor, emitted } = createHarness({ read: async () => ({ status: 'invalid', error }) });

      actor.start();
      await flush();

      expect(actor.getSnapshot().matches({ lifecycle: 'usable' })).toBe(true);
      expect(actor.getSnapshot().context.record).toBeUndefined();
      expect(typesOf(emitted)).toEqual(['recordUnreadable', 'recordLoaded']);
      actor.stop();
    });

    it('reaches usable when readRecord rejects — the composer never waits on I/O', async () => {
      const { actor, emitted } = createHarness({
        read: async () => {
          throw new Error('EIO');
        },
      });

      actor.start();
      await flush();

      expect(actor.getSnapshot().matches({ lifecycle: 'usable' })).toBe(true);
      expect(typesOf(emitted)).toEqual(['recordUnreadable', 'recordLoaded']);
      actor.stop();
    });

    it('accepts a patch while the record is still loading', async () => {
      let release = (): void => undefined;
      const { actor, harness } = createHarness({
        read: async () => {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          return { status: 'absent' };
        },
        write: async () => undefined,
      });

      actor.start();
      actor.send({ type: 'patch', fields: { mode: 'plan' } });
      await flush();

      expect(harness.writes).toEqual([{ mode: 'plan' }]);
      expect(actor.getSnapshot().matches({ lifecycle: 'loading' })).toBe(true);

      release();
      await flush();
      expect(actor.getSnapshot().matches({ lifecycle: 'usable' })).toBe(true);
      actor.stop();
    });
  });

  describe('coalescing', () => {
    it('lands a patch that arrives during persisting in the next write', async () => {
      const { actor, harness } = createHarness();

      actor.start();
      await flush();

      actor.send({ type: 'patch', fields: { draft: userMessage('one') } });
      await flush();
      expect(harness.writes).toHaveLength(1);

      actor.send({ type: 'patch', fields: { mode: 'plan' } });
      actor.send({ type: 'patch', fields: { toolChoice: 'auto' } });
      await flush();
      expect(harness.writes).toHaveLength(1);

      harness.settle[0]?.resolve();
      await flush();

      expect(harness.writes[1]).toEqual({ mode: 'plan', toolChoice: 'auto' });
      harness.settle[1]?.resolve();
      await flush();
      expect(actor.getSnapshot().matches({ writes: 'idle' })).toBe(true);
      actor.stop();
    });

    it('merges keyed maps rather than replacing them', async () => {
      const { actor, harness } = createHarness();

      actor.start();
      await flush();

      actor.send({ type: 'patch', fields: { draft: userMessage('one') } });
      await flush();
      actor.send({ type: 'patch', fields: { messageEdits: { a: userMessage('a') }, unread: { chatOne: true } } });
      actor.send({ type: 'patch', fields: { messageEdits: { b: userMessage('b') }, unread: { chatTwo: true } } });
      harness.settle[0]?.resolve();
      await flush();

      expect(Object.keys(harness.writes[1]?.messageEdits ?? {})).toEqual(['a', 'b']);
      expect(harness.writes[1]?.unread).toEqual({ chatOne: true, chatTwo: true });
      actor.stop();
    });

    it('drops nothing across 100 interleavings', async () => {
      const { actor, harness } = createHarness();

      actor.start();
      await flush();

      const sent: string[] = [];
      for (let index = 0; index < 100; index += 1) {
        const id = `msg_${index}`;
        sent.push(id);
        actor.send({ type: 'patch', fields: { messageEdits: { [id]: userMessage(id) } } });
        // Settle whichever write is open on every third turn, so writes and
        // patches interleave instead of queueing behind one another.
        if (index % 3 === 0) {
          harness.settle.shift()?.resolve();
          await flush();
        }
      }

      while (harness.settle.length > 0) {
        harness.settle.shift()?.resolve();
        await flush();
      }

      const written = new Set(harness.writes.flatMap((patch) => Object.keys(patch.messageEdits ?? {})));
      expect([...written].toSorted()).toEqual(sent.toSorted());
      expect(actor.getSnapshot().context.pending).toEqual({});
      actor.stop();
    });
  });

  describe('failure edge', () => {
    it('retains the patch, emits writeFailed, and retries on the backoff curve', async () => {
      const { actor, harness, emitted } = createHarness();

      actor.start();
      await flush();

      actor.send({ type: 'patch', fields: { draft: userMessage('one') } });
      await flush();
      harness.settle.shift()?.reject(new Error('EIO'));
      await flush();

      expect(typesOf(emitted)).toEqual(['recordLoaded', 'writeFailed']);
      expect(emitted.at(-1)).toMatchObject({ type: 'writeFailed', attempt: 1 });
      expect(actor.getSnapshot().matches({ writes: 'retrying' })).toBe(true);
      expect(actor.getSnapshot().context.pending.draft).toEqual(userMessage('one'));

      await vi.advanceTimersByTimeAsync(400);
      expect(harness.writes).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(300);
      expect(harness.writes).toHaveLength(2);
      expect(harness.writes[1]).toEqual({ draft: userMessage('one') });

      harness.settle.shift()?.resolve();
      await flush();
      expect(typesOf(emitted)).toEqual(['recordLoaded', 'writeFailed', 'writeRecovered']);
      expect(actor.getSnapshot().matches({ writes: 'idle' })).toBe(true);
      actor.stop();
    });

    it('short-circuits the retry wait when a fresh patch arrives', async () => {
      const { actor, harness } = createHarness();

      actor.start();
      await flush();

      actor.send({ type: 'patch', fields: { draft: userMessage('one') } });
      await flush();
      harness.settle.shift()?.reject(new Error('EIO'));
      await flush();
      expect(actor.getSnapshot().matches({ writes: 'retrying' })).toBe(true);

      actor.send({ type: 'patch', fields: { draft: userMessage('two') } });
      await flush();

      expect(harness.writes).toHaveLength(2);
      expect(harness.writes[1]).toEqual({ draft: userMessage('two') });
      actor.stop();
    });

    it('retains the patch and emits writeStalled when the budget is exhausted', async () => {
      const { actor, harness, emitted } = createHarness({ retryMaxAttempts: 2 });

      actor.start();
      await flush();

      actor.send({ type: 'patch', fields: { draft: userMessage('one') } });
      await flush();

      for (let index = 0; index < 3; index += 1) {
        harness.settle.shift()?.reject(new Error('EIO'));
        await flush();
        await vi.advanceTimersByTimeAsync(60_000);
      }

      expect(typesOf(emitted)).toEqual(['recordLoaded', 'writeFailed', 'writeFailed', 'writeFailed', 'writeStalled']);
      expect(actor.getSnapshot().matches({ writes: 'idle' })).toBe(true);
      expect(actor.getSnapshot().context.pending.draft).toEqual(userMessage('one'));

      // The retained patch rides out on the next flush, not on a timer.
      actor.send({ type: 'flushNow' });
      await flush();
      expect(harness.writes.at(-1)).toEqual({ draft: userMessage('one') });
      actor.stop();
    });
  });

  describe('unrepairable input (P28)', () => {
    it('drops the offending fields so a later good patch still persists', async () => {
      const { actor, harness, emitted } = createHarness({
        write: async (fields, index) => {
          if (fields.draft !== undefined) {
            throw new ComposerRecordInputError('A composer record cannot be written with a data: URL attachment.');
          }
          expect(index).toBeGreaterThan(0);
        },
      });

      actor.start();
      await flush();

      actor.send({ type: 'patch', fields: { draft: userMessage('bad'), mode: 'plan' } });
      await flush();

      // The unwritable draft is gone; the writable field it travelled with is not.
      expect(harness.writes[1]).toEqual({ mode: 'plan' });
      expect(actor.getSnapshot().context.pending).toEqual({});
      expect(typesOf(emitted)).toEqual(['recordLoaded', 'writeFailed']);

      actor.send({ type: 'patch', fields: { toolChoice: 'auto' } });
      await flush();

      expect(harness.writes.at(-1)).toEqual({ toolChoice: 'auto' });
      expect(actor.getSnapshot().matches({ writes: 'idle' })).toBe(true);
      actor.stop();
    });

    it('spends no retry attempt on a patch that can never succeed', async () => {
      const { actor, harness } = createHarness({
        write: async (fields) => {
          if (fields.draft !== undefined) {
            throw new ComposerRecordInputError('A composer record holds only user messages.');
          }
        },
      });

      actor.start();
      await flush();

      actor.send({ type: 'patch', fields: { draft: userMessage('bad') } });
      await flush();

      expect(actor.getSnapshot().context.attempt).toBe(0);
      expect(actor.getSnapshot().matches({ writes: 'idle' })).toBe(true);
      expect(actor.getSnapshot().context.pending).toEqual({});

      await vi.advanceTimersByTimeAsync(60_000);
      expect(harness.writes).toHaveLength(1);
      actor.stop();
    });
  });

  describe('removal', () => {
    it('drains the in-flight write before removing the record', async () => {
      const { actor, harness, emitted } = createHarness();

      actor.start();
      await flush();

      actor.send({ type: 'patch', fields: { draft: userMessage('one') } });
      await flush();
      expect(harness.writes).toHaveLength(1);

      actor.send({ type: 'remove' });
      await flush();
      expect(harness.removes).toEqual([]);

      harness.settle.shift()?.resolve();
      await flush();

      expect(harness.removes).toEqual([1]);
      expect(actor.getSnapshot().matches({ lifecycle: 'removed' })).toBe(true);
      expect(typesOf(emitted)).toContain('recordRemoved');
      actor.stop();
    });

    it('removes immediately when no write is in flight', async () => {
      const { actor, harness } = createHarness();

      actor.start();
      await flush();
      actor.send({ type: 'remove' });
      await flush();

      expect(harness.removes).toEqual([0]);
      expect(actor.getSnapshot().matches({ lifecycle: 'removed' })).toBe(true);
      actor.stop();
    });

    it('removes a record whose read has not settled', async () => {
      const { actor, harness } = createHarness({
        read: async () =>
          new Promise<ComposerRecordReadResult>(() => {
            /* Never settles. */
          }),
      });

      actor.start();
      actor.send({ type: 'remove' });
      await flush();

      expect(harness.removes).toEqual([0]);
      expect(actor.getSnapshot().matches({ lifecycle: 'removed' })).toBe(true);
      actor.stop();
    });

    it('reaches removed even when the store cannot delete the record', async () => {
      const { actor, emitted } = createHarness({
        remove: async () => {
          throw new Error('EBUSY');
        },
      });

      actor.start();
      await flush();
      actor.send({ type: 'remove' });
      await flush();

      expect(actor.getSnapshot().matches({ lifecycle: 'removed' })).toBe(true);
      expect(typesOf(emitted)).toContain('recordRemoved');
      actor.stop();
    });
  });

  it('keeps the loaded record available to hydration consumers', async () => {
    const record: ComposerRecord = { version: 1, toolChoice: ['cad'], mode: 'agent' };
    const { actor } = createHarness({ read: async () => ({ status: 'valid', record }) });

    actor.start();
    await flush();

    expect(actor.getSnapshot().context.record).toEqual(record);
    expect(actor.getSnapshot().context).toMatchObject({ pending: {}, attempt: 0 });
    actor.stop();
  });

  it('never starts a second timer of its own', () => {
    // The debounce stays in `draftMachine`; the only delay this machine owns is
    // the retry curve, so an idle machine schedules nothing.
    const { actor } = createHarness({
      read: async () => ({ status: 'absent' }),
    });
    const scheduled = vi.getTimerCount();

    actor.start();

    expect(vi.getTimerCount()).toBe(scheduled);
    actor.stop();
  });
});
