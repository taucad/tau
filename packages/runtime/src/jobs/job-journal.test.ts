import { describe, expect, it, vi } from 'vitest';

import { createJobJournal } from '#jobs/job-journal.js';
import type { JobJournalOwnerFence, JobJournalStorage } from '#jobs/job-journal.js';

type Event = Readonly<{ type: 'event'; value: number }>;

const parseEvent = (candidate: unknown): Event => {
  if (
    candidate === null ||
    typeof candidate !== 'object' ||
    Array.isArray(candidate) ||
    (candidate as Record<string, unknown>)['type'] !== 'event' ||
    typeof (candidate as Record<string, unknown>)['value'] !== 'number' ||
    Object.keys(candidate).length !== 2
  ) {
    throw new TypeError('INVALID_EVENT');
  }
  return candidate as Event;
};

const concatenate = (left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => {
  const result = new Uint8Array(left.byteLength + right.byteLength);
  result.set(left);
  result.set(right, left.byteLength);
  return result;
};

const controlledStorage = (initial = new Uint8Array(0)) => {
  let bytes = new Uint8Array(initial);
  let failAppend = false;
  let failTruncate = false;
  let partialAppend = false;
  let closeCount = 0;
  let closeFailures = 0;
  let flushCount = 0;
  let readCount = 0;
  const readInputs: Array<Readonly<{ offset: number; maximumBytes: number }>> = [];
  const storage: JobJournalStorage = {
    async read({ offset, maximumBytes }) {
      readCount += 1;
      readInputs.push({ offset, maximumBytes });
      return {
        bytes: bytes.slice(offset, offset + maximumBytes),
        endOfFile: offset + maximumBytes >= bytes.byteLength,
      };
    },
    async append(next) {
      if (failAppend) {
        if (partialAppend) {
          bytes = concatenate(bytes, next.slice(0, Math.max(1, Math.floor(next.byteLength / 2))));
        }
        throw new Error('APPEND_FAILED');
      }
      bytes = concatenate(bytes, next);
    },
    async flush() {
      flushCount += 1;
    },
    async truncate(size) {
      if (failTruncate) {
        throw new Error('TRUNCATE_FAILED');
      }
      bytes = bytes.slice(0, size);
    },
    async close() {
      closeCount += 1;
      if (closeFailures > 0) {
        closeFailures -= 1;
        throw new Error('CLOSE_FAILED');
      }
    },
  };
  return {
    storage,
    bytes: () => new Uint8Array(bytes),
    closeCount: () => closeCount,
    readCount: () => readCount,
    readInputs: () => [...readInputs],
    clearReadInputs() {
      readInputs.length = 0;
    },
    flushCount: () => flushCount,
    setAppendFailure(value: boolean, partial = false) {
      failAppend = value;
      partialAppend = partial;
    },
    setTruncateFailure(value: boolean) {
      failTruncate = value;
    },
    setCloseFailures(value: number) {
      closeFailures = value;
    },
  };
};

const ownerFence = () => {
  let current = true;
  const owner: JobJournalOwnerFence = {
    assertCurrent() {
      if (!current) {
        throw new Error('STALE_OWNER');
      }
    },
  };
  return {
    owner,
    expire() {
      current = false;
    },
  };
};

const open = async (controlled = controlledStorage(), owner = ownerFence()) => ({
  journal: await createJobJournal({ storage: controlled.storage, owner: owner.owner, parseEvent }),
  controlled,
  owner,
});

describe('authority job journal', () => {
  it('serializes concurrent appends and exposes only flushed records', async () => {
    const controlled = controlledStorage();
    let releaseFlush: (() => void) | undefined;
    const flushGate = new Promise<void>((resolve) => {
      releaseFlush = resolve;
    });
    let flushes = 0;
    const storage: JobJournalStorage = {
      ...controlled.storage,
      async flush() {
        flushes += 1;
        if (flushes === 1) {
          await flushGate;
        }
      },
    };
    const fence = ownerFence();
    const journal = await createJobJournal({ storage, owner: fence.owner, parseEvent });

    const first = journal.append({ type: 'event', value: 1 });
    const second = journal.append({ type: 'event', value: 2 });
    const readsBeforeReplay = controlled.readCount();
    const replay = journal.replay({ cursor: 0, limit: 10 });
    await Promise.resolve();
    expect(controlled.readCount()).toBe(readsBeforeReplay);
    releaseFlush?.();

    await expect(Promise.all([first, second])).resolves.toEqual([
      { sequence: 0, event: { type: 'event', value: 1 } },
      { sequence: 1, event: { type: 'event', value: 2 } },
    ]);
    await expect(replay).resolves.toMatchObject({
      records: [{ sequence: 0 }, { sequence: 1 }],
      nextCursor: 2,
      endCursor: 2,
    });
  });

  it('discards every unterminated tail, including valid JSON, then reopens cleanly', async () => {
    const first = await open();
    await first.journal.append({ type: 'event', value: 1 });
    const torn = concatenate(first.controlled.bytes(), new TextEncoder().encode('{"valid":true}'));
    const reopened = await open(controlledStorage(torn));

    await expect(reopened.journal.replay({ cursor: 0, limit: 10 })).resolves.toMatchObject({
      records: [{ sequence: 0, event: { type: 'event', value: 1 } }],
      endCursor: 1,
    });
    expect(new TextDecoder().decode(reopened.controlled.bytes())).not.toContain('valid');
  });

  it.each([
    [
      'sequence',
      (frame: Record<string, unknown>) => {
        frame['sequence'] = 4;
      },
    ],
    [
      'checksum',
      (frame: Record<string, unknown>) => {
        frame['checksum'] = 'sha256:' + '0'.repeat(64);
      },
    ],
  ])('fails closed on a committed %s mismatch', async (_name, corrupt) => {
    const initial = await open();
    await initial.journal.append({ type: 'event', value: 1 });
    const frame = JSON.parse(new TextDecoder().decode(initial.controlled.bytes()).trim()) as Record<string, unknown>;
    corrupt(frame);
    const bytes = new TextEncoder().encode(`${JSON.stringify(frame)}\n`);

    await expect(open(controlledStorage(bytes))).rejects.toThrow('JOB_JOURNAL_CORRUPT_COMMITTED_RECORD');
  });

  it('fails closed on corrupted committed bytes', async () => {
    const initial = await open();
    await initial.journal.append({ type: 'event', value: 1 });
    const bytes = initial.controlled.bytes();
    bytes[2] = 0xff;

    await expect(open(controlledStorage(bytes))).rejects.toThrow('JOB_JOURNAL_CORRUPT_COMMITTED_RECORD');
  });

  it('rolls a failed append back before allowing the next sequence', async () => {
    const opened = await open();
    opened.controlled.setAppendFailure(true, true);
    await expect(opened.journal.append({ type: 'event', value: 1 })).rejects.toThrow('APPEND_FAILED');
    expect(opened.controlled.bytes()).toHaveLength(0);

    opened.controlled.setAppendFailure(false);
    await expect(opened.journal.append({ type: 'event', value: 2 })).resolves.toMatchObject({ sequence: 0 });
  });

  it('poisons the handle when failed bytes cannot be rolled back', async () => {
    const opened = await open();
    opened.controlled.setAppendFailure(true, true);
    opened.controlled.setTruncateFailure(true);

    await expect(opened.journal.append({ type: 'event', value: 1 })).rejects.toThrow('JOB_JOURNAL_POISONED');
    await expect(opened.journal.append({ type: 'event', value: 2 })).rejects.toThrow('JOB_JOURNAL_POISONED');
  });

  it('detects stale ownership after an awaited write and refuses further use', async () => {
    const controlled = controlledStorage();
    const fence = ownerFence();
    const { append } = controlled.storage;
    const storage: JobJournalStorage = {
      ...controlled.storage,
      async append(bytes) {
        await append(bytes);
        fence.expire();
      },
    };
    const journal = await createJobJournal({ storage, owner: fence.owner, parseEvent });

    await expect(journal.append({ type: 'event', value: 1 })).rejects.toThrow('JOB_JOURNAL_POISONED');
    expect(controlled.bytes().byteLength).toBeGreaterThan(0);
    await expect(journal.close()).resolves.toBeUndefined();
    expect(controlled.closeCount()).toBe(1);
  });

  it('awaits an asynchronous owner fence before making storage mutations visible', async () => {
    const controlled = controlledStorage();
    let armed = false;
    let rejectFence: ((error: Error) => void) | undefined;
    const deferredFence = new Promise<void>((_resolve, reject) => {
      rejectFence = reject;
    });
    const owner: JobJournalOwnerFence = {
      assertCurrent(): void | Promise<void> {
        return armed ? deferredFence : undefined;
      },
    };
    const journal = await createJobJournal({ storage: controlled.storage, owner, parseEvent });
    const readsAfterOpen = controlled.readCount();
    armed = true;

    const append = journal.append({ type: 'event', value: 1 });
    await Promise.resolve();
    expect(controlled.bytes()).toHaveLength(0);
    expect(controlled.flushCount()).toBe(0);
    expect(controlled.readCount()).toBe(readsAfterOpen);
    rejectFence?.(new Error('ASYNC_STALE_OWNER'));

    await expect(append).rejects.toThrow('ASYNC_STALE_OWNER');
    expect(controlled.bytes()).toHaveLength(0);
    await expect(journal.close()).resolves.toBeUndefined();
    expect(controlled.closeCount()).toBe(1);
  });

  it('closes idempotently and replays the durable prefix after reopening', async () => {
    const opened = await open();
    await opened.journal.append({ type: 'event', value: 1 });
    await Promise.all([opened.journal.close(), opened.journal.close()]);
    expect(opened.controlled.closeCount()).toBe(1);
    await expect(opened.journal.append({ type: 'event', value: 2 })).rejects.toThrow('JOB_JOURNAL_CLOSED');

    const reopened = await open(controlledStorage(opened.controlled.bytes()));
    await expect(reopened.journal.replay({ cursor: 0, limit: 1 })).resolves.toEqual({
      records: [{ sequence: 0, event: { type: 'event', value: 1 } }],
      nextCursor: 1,
      endCursor: 1,
    });
  });

  it('stops data operations after a failed close and retries physical cleanup', async () => {
    const opened = await open();
    opened.controlled.setCloseFailures(1);

    await expect(opened.journal.close()).rejects.toThrow('CLOSE_FAILED');
    await expect(opened.journal.replay({ cursor: 0, limit: 1 })).rejects.toThrow('JOB_JOURNAL_CLOSED');
    await expect(opened.journal.append({ type: 'event', value: 1 })).rejects.toThrow('JOB_JOURNAL_CLOSED');
    await expect(opened.journal.close()).resolves.toBeUndefined();
    await expect(opened.journal.close()).resolves.toBeUndefined();
    expect(opened.controlled.closeCount()).toBe(2);
  });

  it('closes transferred storage ownership when initialization fails', async () => {
    const controlled = controlledStorage(new TextEncoder().encode('{"committed":false}\n'));

    await expect(open(controlled)).rejects.toThrow('JOB_JOURNAL_CORRUPT_COMMITTED_RECORD');
    expect(controlled.closeCount()).toBe(1);
  });

  it('uses startup offsets to read only the requested replay page', async () => {
    const opened = await open();
    await opened.journal.append({ type: 'event', value: 1 });
    await opened.journal.append({ type: 'event', value: 2 });
    await opened.journal.append({ type: 'event', value: 3 });
    opened.controlled.clearReadInputs();

    await expect(opened.journal.replay({ cursor: 2, limit: 1 })).resolves.toMatchObject({
      records: [{ sequence: 2, event: { type: 'event', value: 3 } }],
      nextCursor: 3,
      endCursor: 3,
    });
    expect(opened.controlled.readInputs()[0]?.offset).toBeGreaterThan(0);
    expect(opened.controlled.readInputs()).toHaveLength(1);
  });

  it('applies the event parser before append and during replay', async () => {
    const parser = vi.fn(parseEvent);
    const controlled = controlledStorage();
    const fence = ownerFence();
    const journal = await createJobJournal({ storage: controlled.storage, owner: fence.owner, parseEvent: parser });
    await expect(journal.append({ type: 'event', value: 'bad' })).rejects.toThrow('INVALID_EVENT');
    await journal.append({ type: 'event', value: 1 });
    await journal.replay({ cursor: 0, limit: 1 });
    expect(parser).toHaveBeenCalledTimes(3);
  });
});
