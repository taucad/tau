/**
 * The composer plumbing's deferred store, and what it does when the binding it
 * waits for never arrives (blueprint F3, draft-restore side).
 */

import { createActor } from 'xstate';
import { describe, expect, it, vi } from 'vitest';
import type { ComposerRecordMachineEmitted } from '#machines/composer-record.machine.js';
import { composerRecordActors, composerRecordMachine } from '#machines/composer-record.machine.js';
import { deferredRecordStore } from '#services/chat-session-store-composer.js';

/** A binding nothing will ever settle: the chat row never answers, or a predecessor's drain never lands. */
const neverBound = async (): Promise<never> =>
  new Promise<never>(() => {
    /* The project this chat belongs to is never named. */
  });

/** What the bound throws with, whichever call waited it out. */
const timedOut = { name: 'AgentHostWorkerError', code: 'COMPOSER_BINDING_TIMEOUT' };

const stillWaiting = Symbol('stillWaiting');

describe('deferredRecordStore', () => {
  it('should fail a draft read whose binding never lands, rather than wait forever', async () => {
    vi.useFakeTimers();
    try {
      const reading = deferredRecordStore(neverBound()).read();
      const failed = expect(reading).rejects.toMatchObject({
        ...timedOut,
        message: 'This chat never found the project its draft is saved in. Reload the page and try again.',
      });

      await vi.advanceTimersByTimeAsync(29_000);
      expect(await Promise.race([reading, Promise.resolve(stillWaiting)])).toBe(stillWaiting);

      await vi.advanceTimersByTimeAsync(2000);
      await failed;
    } finally {
      vi.useRealTimers();
    }
  });

  it('should fail a draft write whose binding never lands, rather than wait forever', async () => {
    vi.useFakeTimers();
    try {
      const failed = expect(deferredRecordStore(neverBound()).patch({ toolChoice: 'cad' })).rejects.toMatchObject(
        timedOut,
      );
      await vi.advanceTimersByTimeAsync(30_000);
      await failed;
    } finally {
      vi.useRealTimers();
    }
  });

  it('should report a draft it cannot restore through the record actor, leaving the composer usable', async () => {
    vi.useFakeTimers();
    try {
      const store = deferredRecordStore(neverBound());
      const ref = createActor(composerRecordMachine.provide(composerRecordActors(store)), { input: {} });
      const emitted: ComposerRecordMachineEmitted[] = [];
      const record = (event: ComposerRecordMachineEmitted): void => {
        emitted.push(event);
      };
      ref.on('recordUnreadable', record);
      ref.on('recordLoaded', record);
      ref.start();

      await vi.advanceTimersByTimeAsync(30_000);

      // The toast the user sees, and a composer they can keep typing into (D7).
      expect(emitted.map((event) => event.type)).toEqual(['recordUnreadable', 'recordLoaded']);
      expect(emitted[0]).toMatchObject({ error: timedOut });
      expect(emitted[1]).toMatchObject({ record: 'absent' });
      expect(ref.getSnapshot().matches({ lifecycle: 'usable' })).toBe(true);
      ref.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
