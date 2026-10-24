import { describe, expect, it, vi } from 'vitest';

import { createChatSegmentsReader, segmentDeviceIdOf } from '#launchers/chat-store.js';
import { foreignRunStaleMilliseconds } from '#log/foreign-runs.js';

const encoder = new TextEncoder();

/** A chat's `events/` directory: each entry's bytes and a fingerprint that moves when they do. */
const directory = (files: Map<string, Readonly<{ bytes: string; version: string | undefined }>>) => {
  const read = vi.fn(async (name: string) => {
    const file = files.get(name);
    return file === undefined ? undefined : encoder.encode(file.bytes);
  });
  return {
    read,
    reader: createChatSegmentsReader({
      list: async () => [...files.keys()],
      version: async (name) => files.get(name)?.version,
      read,
    }),
  };
};

describe('a chat’s segments, read again on each refresh (XD1)', () => {
  it('should name each segment by its device, without the file’s extension', () => {
    expect(segmentDeviceIdOf('device-desktop.jsonl')).toBe('device-desktop');
    expect(segmentDeviceIdOf('notes.txt')).toBeUndefined();
  });

  it('should answer an unchanged segment with the same bytes, read once', async () => {
    const files = new Map([
      ['device-desktop.jsonl', { bytes: 'a\n', version: '2:1' }],
      ['device-laptop.jsonl', { bytes: 'b\n', version: '2:1' }],
    ]);
    const { read, reader } = directory(files);

    const first = await reader();
    files.set('device-laptop.jsonl', { bytes: 'b\nc\n', version: '4:2' });
    const second = await reader();

    expect(second.map((segment) => segment.deviceId)).toEqual(['device-desktop', 'device-laptop']);
    expect(second[0]!.bytes).toBe(first[0]!.bytes);
    expect(second[1]!.bytes).not.toBe(first[1]!.bytes);
    expect(read.mock.calls.map(([name]) => name).toSorted()).toEqual([
      'device-desktop.jsonl',
      'device-laptop.jsonl',
      'device-laptop.jsonl',
    ]);
  });

  /* A provider that reports no modification time gives no fingerprint: a same-length rewrite must still be seen. */
  it('should read a segment again whenever it has no fingerprint to trust', async () => {
    const files = new Map<string, Readonly<{ bytes: string; version: string | undefined }>>([
      ['device-desktop.jsonl', { bytes: 'a\n', version: undefined }],
    ]);
    const { read, reader } = directory(files);
    await reader();

    files.set('device-desktop.jsonl', { bytes: 'b\n', version: undefined });
    const [segment] = await reader();

    expect(new TextDecoder().decode(segment!.bytes)).toBe('b\n');
    expect(read).toHaveBeenCalledTimes(2);
  });

  /* No fingerprint means a read, but bytes that did not change keep their identity, so the history does not refold. */
  it('should keep an unfingerprinted segment’s identity while its bytes do not change', async () => {
    const files = new Map<string, Readonly<{ bytes: string; version: string | undefined }>>([
      ['device-desktop.jsonl', { bytes: 'a\n', version: undefined }],
    ]);
    const { reader } = directory(files);
    const [first] = await reader();

    const [second] = await reader();

    expect(second).toBe(first);
  });

  it('should drop a segment whose file went away', async () => {
    const files = new Map([['device-desktop.jsonl', { bytes: 'a\n', version: '2:1' }]]);
    const { reader } = directory(files);
    await reader();

    files.delete('device-desktop.jsonl');

    expect(await reader()).toEqual([]);
  });

  it('should answer the segments in device-id order, which is not always their file names’ order', async () => {
    const files = new Map([
      ['a.jsonl', { bytes: 'a\n', version: '2:1' }],
      ['a-b.jsonl', { bytes: 'b\n', version: '2:1' }],
    ]);
    const { reader } = directory(files);

    const segments = await reader();

    expect(segments.map((segment) => segment.deviceId)).toEqual(['a', 'a-b']);
  });

  /*
   * XD3: a segment that is there but cannot be read may hold a live run, so the read fails while that can still be so.
   * A live run keeps its device's segment changing (heartbeats and publishes), so one that has not changed and has
   * not read for a whole staleness bound holds no live run: it is left out, and says why, instead of locking the chat.
   */
  describe('a segment that cannot be read', () => {
    const unreadable = (version: () => string | undefined) => {
      let clock = 1_000_000;
      const reader = createChatSegmentsReader(
        {
          list: async () => ['device-desktop.jsonl'],
          version: async () => version(),
          read: async () => {
            throw Object.assign(new Error('EISDIR: illegal operation on a directory'), { code: 'EISDIR' });
          },
        },
        { now: () => clock },
      );
      return {
        reader,
        advance: (milliseconds: number) => {
          clock += milliseconds;
        },
      };
    };

    it('should fail the read for a staleness bound, then leave the segment out and say why', async () => {
      const { reader, advance } = unreadable(() => '0:1');

      await expect(reader()).rejects.toThrow('EISDIR');
      advance(foreignRunStaleMilliseconds - 1);
      await expect(reader()).rejects.toThrow('EISDIR');
      advance(2);
      const [segment] = await reader();

      expect(segment?.deviceId).toBe('device-desktop');
      expect(segment?.unreadable).toContain('EISDIR');
      expect(segment!.bytes.byteLength).toBe(0);
      const [again] = await reader();
      expect(again).toBe(segment);
    });

    it('should start the bound again whenever the unreadable segment changes', async () => {
      let version = '0:1';
      const { reader, advance } = unreadable(() => version);

      await expect(reader()).rejects.toThrow('EISDIR');
      advance(foreignRunStaleMilliseconds - 1);
      version = '0:2';
      await expect(reader()).rejects.toThrow('EISDIR');
      advance(foreignRunStaleMilliseconds - 1);

      await expect(reader()).rejects.toThrow('EISDIR');
    });
  });
});
