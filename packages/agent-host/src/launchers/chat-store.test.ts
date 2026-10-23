import { describe, expect, it, vi } from 'vitest';

import { createChatSegmentsReader, segmentDeviceIdOf } from '#launchers/chat-store.js';

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

  it('should drop a segment whose file went away', async () => {
    const files = new Map([['device-desktop.jsonl', { bytes: 'a\n', version: '2:1' }]]);
    const { reader } = directory(files);
    await reader();

    files.delete('device-desktop.jsonl');

    expect(await reader()).toEqual([]);
  });
});
