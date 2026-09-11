import { mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createJobJournal } from '#jobs/job-journal.js';
import { createNodeJournalStorage } from '#jobs/node-journal-storage.js';
import { acquireNodeAuthorityWriter } from '@taucad/filesystem/backend/node';

type Event = Readonly<{ type: 'event'; value: number }>;
const roots: string[] = [];

const parseEvent = (candidate: unknown): Event => {
  if (
    candidate === null ||
    typeof candidate !== 'object' ||
    (candidate as Record<string, unknown>)['type'] !== 'event' ||
    typeof (candidate as Record<string, unknown>)['value'] !== 'number'
  ) {
    throw new TypeError('INVALID_EVENT');
  }
  return candidate as Event;
};

const createPath = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'tau-node-journal-'));
  roots.push(directory);
  return join(directory, 'journal.jsonl');
};

const currentOwner = Object.freeze({
  assertCurrent(): void {
    // This fixture deliberately remains current.
  },
});

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

describe('Node journal storage', () => {
  it('persists journal appends and replays them after close and reopen', async () => {
    const path = await createPath();
    const storage = await createNodeJournalStorage({ file: await open(path, 'a+') });
    const journal = await createJobJournal({ storage, owner: currentOwner, parseEvent });
    await journal.append({ type: 'event', value: 1 });
    await journal.append({ type: 'event', value: 2 });
    await journal.close();

    const reopened = await createJobJournal({
      storage: await createNodeJournalStorage({ file: await open(path, 'r+') }),
      owner: currentOwner,
      parseEvent,
    });
    await expect(reopened.replay({ cursor: 0, limit: 10 })).resolves.toMatchObject({
      records: [{ sequence: 0 }, { sequence: 1 }],
      endCursor: 2,
    });
    await reopened.close();
  });

  it('truncates a torn tail and appends from the recovered offset', async () => {
    const path = await createPath();
    const first = await createJobJournal({
      storage: await createNodeJournalStorage({ file: await open(path, 'a+') }),
      owner: currentOwner,
      parseEvent,
    });
    await first.append({ type: 'event', value: 1 });
    await first.close();
    await writeFile(path, Buffer.concat([await readFile(path), Buffer.from('{"torn":true}')]));

    const recovered = await createJobJournal({
      storage: await createNodeJournalStorage({ file: await open(path, 'r+') }),
      owner: currentOwner,
      parseEvent,
    });
    await recovered.append({ type: 'event', value: 2 });
    await expect(recovered.replay({ cursor: 0, limit: 10 })).resolves.toMatchObject({ endCursor: 2 });
    await recovered.close();
    const recoveredText = await readFile(path, 'utf8');
    expect(recoveredText.includes('torn')).toBe(false);
  });

  it('fails closed on committed corruption and closes transferred storage', async () => {
    const path = await createPath();
    await writeFile(path, '{"sequence":0,"event":{},"checksum":"sha256:bad"}\n');
    const file = await open(path, 'r+');
    const storage = await createNodeJournalStorage({ file });
    await expect(createJobJournal({ storage, owner: currentOwner, parseEvent })).rejects.toThrow(
      'JOB_JOURNAL_CORRUPT_COMMITTED_RECORD',
    );
    await expect(file.stat()).rejects.toThrow();
  });

  it('performs bounded positional reads and follows truncation with append', async () => {
    const path = await createPath();
    await writeFile(path, 'abcdef');
    const storage = await createNodeJournalStorage({ file: await open(path, 'r+') });
    await expect(storage.read({ offset: 2, maximumBytes: 2 })).resolves.toMatchObject({ endOfFile: false });
    const range = await storage.read({ offset: 2, maximumBytes: 2 });
    expect(new TextDecoder().decode(range.bytes)).toBe('cd');
    await storage.truncate(3);
    await storage.append(new TextEncoder().encode('XY'));
    await storage.flush();
    await storage.close();
    expect(await readFile(path, 'utf8')).toBe('abcXY');
  });

  it('completes short positional reads and writes without skipping bytes', async () => {
    let bytes = new TextEncoder().encode('abc');
    const file = {
      async stat() {
        return { size: bytes.byteLength, isFile: () => true };
      },
      // oxlint-disable-next-line eslint/max-params -- mirrors Node's positional FileHandle API.
      async read(buffer: Uint8Array<ArrayBuffer>, offset: number, _length: number, position: number) {
        const available = bytes.slice(position, position + 1);
        buffer.set(available, offset);
        return { bytesRead: available.byteLength, buffer };
      },
      // oxlint-disable-next-line eslint/max-params -- mirrors Node's positional FileHandle API.
      async write(buffer: Uint8Array<ArrayBuffer>, offset: number, _length: number, position: number) {
        const next = new Uint8Array(Math.max(bytes.byteLength, position + 1));
        next.set(bytes);
        next[position] = buffer[offset]!;
        bytes = next;
        return { bytesWritten: 1, buffer };
      },
      async sync() {
        // Memory is immediately durable in this focused stub.
      },
      async truncate(size: number) {
        bytes = bytes.slice(0, size);
      },
      async close() {
        // The focused stub owns no external resource.
      },
    };
    const storage = await createNodeJournalStorage({ file: file as unknown as FileHandle });
    const complete = await storage.read({ offset: 0, maximumBytes: 3 });
    expect(new TextDecoder().decode(complete.bytes)).toBe('abc');
    await storage.append(new TextEncoder().encode('XYZ'));
    expect(new TextDecoder().decode(bytes)).toBe('abcXYZ');
    await storage.close();
  });

  it('closes a transferred handle when initialization stat fails', async () => {
    const path = await createPath();
    const file = await open(path, 'a+');
    const close = vi.spyOn(file, 'close');
    vi.spyOn(file, 'stat').mockRejectedValueOnce(new Error('STAT_FAILED'));

    await expect(createNodeJournalStorage({ file })).rejects.toThrow('STAT_FAILED');
    expect(close).toHaveBeenCalledOnce();
    await expect(file.stat()).rejects.toThrow();
  });

  it('joins concurrent close, rejects new operations, and retries failed cleanup', async () => {
    const path = await createPath();
    const file = await open(path, 'a+');
    const close = vi.spyOn(file, 'close').mockRejectedValueOnce(new Error('CLOSE_FAILED'));
    const storage = await createNodeJournalStorage({ file });

    const results = await Promise.allSettled([storage.close(), storage.close()]);
    expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected']);
    expect(close).toHaveBeenCalledOnce();
    await expect(storage.read({ offset: 0, maximumBytes: 1 })).rejects.toThrow('JOB_JOURNAL_STORAGE_CLOSED');
    await expect(storage.close()).resolves.toBeUndefined();
    expect(close).toHaveBeenCalledTimes(2);
  });

  it.runIf(process.platform === 'darwin' || process.platform === 'linux')(
    'persists under the real authority owner and replays after reacquisition',
    async () => {
      const path = await createPath();
      const authorityRoot = join(path, '..');
      const owner = await acquireNodeAuthorityWriter({ authorityRoot });
      await expect(acquireNodeAuthorityWriter({ authorityRoot })).rejects.toMatchObject({
        code: 'AUTHORITY_ALREADY_OWNED',
      });
      const journalPath = join(authorityRoot, 'events.jsonl');
      const journal = await createJobJournal({
        storage: await createNodeJournalStorage({ file: await open(journalPath, 'a+') }),
        owner,
        parseEvent,
      });
      await journal.append({ type: 'event', value: 1 });
      await journal.close();
      await owner.release();

      const replacement = await acquireNodeAuthorityWriter({ authorityRoot });
      const reopened = await createJobJournal({
        storage: await createNodeJournalStorage({ file: await open(journalPath, 'r+') }),
        owner: replacement,
        parseEvent,
      });
      await expect(reopened.replay({ cursor: 0, limit: 10 })).resolves.toMatchObject({ endCursor: 1 });
      await reopened.close();
      await replacement.release();
    },
  );

  it.runIf(process.platform === 'darwin' || process.platform === 'linux')(
    'refuses append after owner release without adding a record and still closes storage',
    async () => {
      const path = await createPath();
      const authorityRoot = join(path, '..');
      const owner = await acquireNodeAuthorityWriter({ authorityRoot });
      const journalPath = join(authorityRoot, 'events.jsonl');
      const journal = await createJobJournal({
        storage: await createNodeJournalStorage({ file: await open(journalPath, 'a+') }),
        owner,
        parseEvent,
      });
      await owner.release();

      await expect(journal.append({ type: 'event', value: 1 })).rejects.toThrow(
        'Filesystem authority writer unavailable',
      );
      await journal.close();
      expect(await readFile(journalPath)).toHaveLength(0);
    },
  );
});
