import { describe, expect, it } from 'vitest';
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
    const log = await createProviderEventLog({ fileSystem, filePath });

    await log.append(event(0));
    await log.append(event(1));
    await log.close();

    expect(new TextDecoder().decode(files.get(filePath))).toContain('"state":"admitted"');
    const reopened = await createProviderEventLog({ fileSystem, filePath });
    await expect(reopened.read()).resolves.toEqual([event(0), event(1)]);
    await reopened.close();
  });

  it('repairs a torn tail through the provider rewrite primitive', async () => {
    const filePath = '/.tau/chats/chat-1/events.jsonl';
    const valid = `${JSON.stringify(event(0))}\n`;
    const { fileSystem, files } = createFileSystem({
      [filePath]: new TextEncoder().encode(`${valid}{"version":`),
    });

    const log = await createProviderEventLog({ fileSystem, filePath });
    await log.close();

    expect(new TextDecoder().decode(files.get(filePath))).toBe(valid);
  });

  it('uses an advisory lock marker and rejects a second writer', async () => {
    const { fileSystem } = createFileSystem();
    const filePath = '/.tau/chats/chat-1/events.jsonl';
    const first = await createProviderEventLog({ fileSystem, filePath });

    await expect(createProviderEventLog({ fileSystem, filePath })).rejects.toMatchObject({ code: 'WRITER_LOCKED' });
    await first.close();
    const next = await createProviderEventLog({ fileSystem, filePath });
    await next.close();
  });

  it('reports a backend-neutral refusal when append is unavailable', async () => {
    const { fileSystem } = createFileSystem();
    const { appendFile: _appendFile, ...readOnly } = fileSystem;

    await expect(
      createProviderEventLog({ fileSystem: readOnly, filePath: '/.tau/chats/chat-1/events.jsonl' }),
    ).rejects.toMatchObject({ code: 'STORAGE_NOT_WRITABLE' });
  });

  it('remains usable when the first provider append fails before creating the file', async () => {
    const fixture = createFileSystem();
    const filePath = '/.tau/chats/chat-1/events.jsonl';
    const log = await createProviderEventLog({ fileSystem: fixture.fileSystem, filePath });
    fixture.failNextAppend(new Error('injected append refusal'));

    await expect(log.append(event(0))).rejects.toThrow('injected append refusal');
    await expect(log.append(event(0))).resolves.toEqual({ appended: true });
    await log.close();
  });
});
