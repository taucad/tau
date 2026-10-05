import { FileSystemAccessProvider } from '@taucad/filesystem/backend';
/* oxlint-disable no-restricted-imports -- Reuse the real provider's internal test handle; this fixture is intentionally not a public package export. */
// eslint-disable-next-line @nx/enforce-module-boundaries -- Reuse the real provider's internal test handle without publishing a test-only fixture API.
import { createMockRootHandle } from '../../../filesystem/src/testing/mock-handle-factory.js';
/* oxlint-enable no-restricted-imports */
import { describe, expect, it, vi } from 'vitest';
import { createProviderEventLog } from '#browser.js';
import type { AgentLogEvent } from '#log/event-types.js';

const event = (sequence: number): AgentLogEvent => ({
  version: 1,
  leaderEpoch: 'leader-1',
  sequence,
  recordedAt: '2026-09-01T00:00:00.000Z',
  runId: 'run-1',
  type: 'run.lifecycle',
  state: sequence === 0 ? 'admitted' : 'running',
});

const createFileSystem = (initial: Readonly<Record<string, Uint8Array<ArrayBuffer>>> = {}) => {
  const files = new Map(Object.entries(initial).map(([path, bytes]) => [path, new Uint8Array(bytes)]));
  let appendFailure: Error | undefined;
  return {
    files,
    failNextAppend(error: Error) {
      appendFailure = error;
    },
    fileSystem: {
      exists: async (path: string) => files.has(path),
      readFile: async (path: string) => {
        const bytes = files.get(path);
        if (!bytes) {
          throw Object.assign(new Error(`Missing ${path}`), { code: 'ENOENT' });
        }
        return new Uint8Array(bytes);
      },
      writeFile: async (path: string, data: Uint8Array<ArrayBuffer> | string) => {
        files.set(path, typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data));
      },
      appendFile: async (path: string, data: Uint8Array<ArrayBuffer> | string) => {
        if (appendFailure) {
          const error = appendFailure;
          appendFailure = undefined;
          throw error;
        }
        const prior = files.get(path) ?? new Uint8Array();
        const added = typeof data === 'string' ? new TextEncoder().encode(data) : data;
        const next = new Uint8Array(prior.byteLength + added.byteLength);
        next.set(prior);
        next.set(added, prior.byteLength);
        files.set(path, next);
      },
      unlink: async (path: string) => {
        files.delete(path);
      },
    },
  };
};

describe('createProviderEventLog', () => {
  it('creates a missing provider-backed log and replays ordered appends after close', async () => {
    const { fileSystem, files } = createFileSystem();
    const filePath = '/.tau/chats/chat-1/events.jsonl';
    const log = await createProviderEventLog({ fileSystem, filePath, access: 'write' });

    await log.append(event(0));
    await log.append(event(1));
    await log.close();

    expect(new TextDecoder().decode(files.get(filePath))).toContain('"state":"admitted"');
    const reopened = await createProviderEventLog({ fileSystem, filePath, access: 'write' });
    await expect(reopened.read()).resolves.toEqual([event(0), event(1)]);
    await reopened.close();
  });

  it('uses authoritative head stat on warm append and refuses a peer size change', async () => {
    const fixture = createFileSystem();
    const filePath = '/.tau/chats/stat-fence/events.jsonl';
    const readFile = vi.fn(fixture.fileSystem.readFile);
    const stat = vi.fn(async (path: string) => {
      const bytes = fixture.files.get(path);
      if (!bytes) {
        throw Object.assign(new Error('Missing file'), { code: 'ENOENT' });
      }
      return { size: bytes.byteLength };
    });
    const log = await createProviderEventLog({
      fileSystem: { ...fixture.fileSystem, readFile, stat },
      filePath,
      access: 'write',
    });
    await log.append(event(0));
    readFile.mockClear();
    stat.mockClear();
    await log.append(event(1));
    expect(readFile.mock.calls.filter(([path]) => path === filePath)).toHaveLength(0);
    expect(stat).toHaveBeenCalledWith(filePath, { content: 'head' });
    const before = fixture.files.get(filePath)!;
    const changed = new Uint8Array(before.byteLength + 1);
    changed.set(before);
    changed[before.byteLength] = 10;
    fixture.files.set(filePath, changed);
    await expect(log.append(event(2))).rejects.toThrow();
    expect(fixture.files.get(filePath)).toEqual(changed);
    await log.close();
  });

  it('avoids full reads in the real FSA warm fence and preserves stale-size refusal', async () => {
    const provider = new FileSystemAccessProvider(createMockRootHandle() as unknown as FileSystemDirectoryHandle);
    const filePath = 'events.jsonl';
    const log = await createProviderEventLog({ fileSystem: provider, filePath, access: 'write' });
    for (let sequence = 0; sequence < 10; sequence++) {
      // oxlint-disable-next-line no-await-in-loop -- Event-log sequence is causal.
      await log.append(event(sequence));
    }
    const original = File.prototype.arrayBuffer;
    const fullReads: number[] = [];
    const spy = vi.spyOn(File.prototype, 'arrayBuffer').mockImplementation(async function (this: File) {
      if (this.name === filePath && this.size > 512) {
        fullReads.push(this.size);
      }
      return original.call(this);
    });
    try {
      await log.append(event(10));
      expect(fullReads).toEqual([]);
      await provider.appendFile(filePath, '\n');
      await expect(log.append(event(11))).rejects.toThrow();
      expect(fullReads).toEqual([]);
      await expect(log.read()).resolves.toHaveLength(11);
    } finally {
      spy.mockRestore();
      await log.close();
      provider.dispose();
    }
  });

  it('preserves real FSA torn-tail repair and partial-append rollback', async () => {
    const provider = new FileSystemAccessProvider(createMockRootHandle() as unknown as FileSystemDirectoryHandle);
    const filePath = 'events.jsonl';
    const valid = `${JSON.stringify(event(0))}\n`;
    await provider.writeFile(filePath, `${valid}{"version":`);
    const append = provider.appendFile.bind(provider);
    const spy = vi.spyOn(provider, 'appendFile');
    const log = await createProviderEventLog({ fileSystem: provider, filePath, access: 'write' });
    await log.append(event(1));
    const before = await provider.readFile(filePath);
    expect(new TextDecoder().decode(before)).toBe(`${valid}${JSON.stringify(event(1))}\n`);
    spy.mockImplementationOnce(async (path, bytes) => {
      await append(path, bytes.slice(0, 5));
      throw new Error('partial append');
    });
    try {
      await expect(log.append(event(2))).rejects.toThrow('partial append');
      expect(await provider.readFile(filePath)).toEqual(before);
      await expect(log.append(event(2))).resolves.toMatchObject({ appended: true });
      await expect(log.read()).resolves.toEqual([event(0), event(1), event(2)]);
    } finally {
      spy.mockRestore();
      await log.close();
      provider.dispose();
    }
  });

  it.each(['ENOENT', 'ENOTDIR', 'EACCES'])('handles only missing head-stat failures as zero (%s)', async (code) => {
    const fixture = createFileSystem();
    const filePath = 'events.jsonl';
    const stat = vi.fn().mockRejectedValue(Object.assign(new Error(code), { code }));
    const log = await createProviderEventLog({
      fileSystem: { ...fixture.fileSystem, stat },
      filePath,
      access: 'write',
    });
    if (code === 'EACCES') {
      await expect(log.append(event(0))).rejects.toMatchObject({ code });
      expect(fixture.files.has(filePath)).toBe(false);
    } else {
      await expect(log.append(event(0))).resolves.toMatchObject({ appended: true });
    }
    await log.close();
  });

  it('repairs a torn tail inside its first append, not at open', async () => {
    const filePath = '/.tau/chats/chat-1/events.jsonl';
    const valid = `${JSON.stringify(event(0))}\n`;
    const { fileSystem, files } = createFileSystem({
      [filePath]: new TextEncoder().encode(`${valid}{"version":`),
    });

    const log = await createProviderEventLog({ fileSystem, filePath, access: 'write' });
    // Opening writes nothing: the repair is a write, so it happens inside the fence (CL-R11).
    expect(new TextDecoder().decode(files.get(filePath))).toBe(`${valid}{"version":`);
    await log.append(event(1));
    await log.close();

    expect(new TextDecoder().decode(files.get(filePath))).toBe(`${valid}${JSON.stringify(event(1))}\n`);
  });

  it('uses an advisory lock marker and rejects a second writer', async () => {
    const { fileSystem } = createFileSystem();
    const filePath = '/.tau/chats/chat-1/events.jsonl';
    const first = await createProviderEventLog({ fileSystem, filePath, access: 'write' });

    await expect(createProviderEventLog({ fileSystem, filePath, access: 'write' })).rejects.toMatchObject({
      code: 'WRITER_LOCKED',
    });
    await first.close();
    const next = await createProviderEventLog({ fileSystem, filePath, access: 'write' });
    await next.close();
  });

  // CL-A8 (provider leg), S4's steal trace: a second writer takes the lock over; the first writer's local fence refuses
  // its next append, which writes nothing, and the log stays readable.
  it('should fence a writer whose lock was stolen', async () => {
    const { fileSystem, files } = createFileSystem();
    const filePath = '/.tau/chats/chat-1/events.jsonl';
    const first = await createProviderEventLog({ fileSystem, filePath, access: 'write' });
    await first.append(event(0));
    files.delete(`${filePath}.lock`);
    const thief = await createProviderEventLog({ fileSystem, filePath, access: 'write' });
    await thief.append({ ...event(1), leaderEpoch: 'leader-2', sequence: 0 });
    const stolen = files.get(filePath);

    await expect(first.append(event(1))).rejects.toMatchObject({ code: 'LOG_FENCED' });
    expect(files.get(filePath)).toEqual(stolen);
    const reader = await createProviderEventLog({ fileSystem, filePath, access: 'read' });
    await expect(reader.read()).resolves.toHaveLength(2);
    await thief.close();
  });

  it('reports a backend-neutral refusal when append is unavailable', async () => {
    const { fileSystem } = createFileSystem();
    const { appendFile: _appendFile, ...readOnly } = fileSystem;

    await expect(
      createProviderEventLog({ fileSystem: readOnly, filePath: '/.tau/chats/chat-1/events.jsonl', access: 'write' }),
    ).rejects.toMatchObject({ code: 'STORAGE_NOT_WRITABLE' });
  });

  it('remains usable when the first provider append fails before creating the file', async () => {
    const fixture = createFileSystem();
    const filePath = '/.tau/chats/chat-1/events.jsonl';
    const log = await createProviderEventLog({ fileSystem: fixture.fileSystem, filePath, access: 'write' });
    fixture.failNextAppend(new Error('injected append refusal'));

    await expect(log.append(event(0))).rejects.toThrow('injected append refusal');
    await expect(log.append(event(0))).resolves.toMatchObject({ appended: true });
    await log.close();
  });
});
