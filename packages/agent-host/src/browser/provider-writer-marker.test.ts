/**
 * HA-I10: a provider open on a folder shared with `tau serve` honours a fresh Node writer's marker, takes a stale one
 * over after the XD3 bound, and always takes a provider marker (H51).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBrowserChatStore } from '#browser.js';
import { chatStoreBinding } from '#launchers/chat-store.js';
import { foreignRunStaleMilliseconds } from '#log/foreign-runs.js';

const logPath = '.tau/chats/chat/events.jsonl';
const lockPath = `${logPath}.lock`;
const now = Date.parse('2026-11-26T12:00:00.000Z');
const encode = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);
const row = (recordedAt: number): string =>
  `${JSON.stringify({
    version: 1,
    leaderEpoch: 'node-term',
    sequence: 0,
    recordedAt: new Date(recordedAt).toISOString(),
    runId: 'run-1',
    type: 'run.lifecycle',
    state: 'admitted',
  })}\n`;

/** A `webaccess`-like provider: `stat` answers `File.lastModified` as `mtimeMs`. */
const createFileSystem = (files: Map<string, Uint8Array<ArrayBuffer>>, mtimes: Map<string, number>) => ({
  exists: async (path: string) => files.has(path),
  readFile: async (path: string) => {
    const bytes = files.get(path);
    if (bytes === undefined) {
      throw Object.assign(new Error(`Missing ${path}`), { code: 'ENOENT' });
    }
    return new Uint8Array(bytes);
  },
  writeFile: async (path: string, data: Uint8Array<ArrayBuffer> | string) => {
    files.set(path, typeof data === 'string' ? encode(data) : new Uint8Array(data));
  },
  appendFile: async (path: string, data: Uint8Array<ArrayBuffer> | string) => {
    const prior = files.get(path) ?? new Uint8Array();
    const added = typeof data === 'string' ? encode(data) : data;
    const next = new Uint8Array(prior.byteLength + added.byteLength);
    next.set(prior);
    next.set(added, prior.byteLength);
    files.set(path, next);
  },
  unlink: async (path: string) => {
    files.delete(path);
  },
  stat: async (path: string) => {
    const bytes = files.get(path);
    if (bytes === undefined) {
      throw Object.assign(new Error(`Missing ${path}`), { code: 'ENOENT' });
    }
    return { size: bytes.byteLength, mtimeMs: mtimes.get(path) ?? 0 };
  },
});

const open = async (files: Map<string, Uint8Array<ArrayBuffer>>, mtimes: Map<string, number>) =>
  chatStoreBinding(
    createBrowserChatStore({
      projectId: 'project',
      tabId: 'tab',
      build: 'build',
      log: { kind: 'provider', fileSystem: createFileSystem(files, mtimes) },
    }),
  ).openWriter('chat');

const nodeMarker = encode('4242\n/projects/p/.tau/chats/chat/events.jsonl\n');

describe('provider open and a Node writer marker (HA-I10)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now, toFake: ['Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('refuses WRITER_LOCKED while a just-opened Node writer on an idle chat is fresh by its marker mtime', async () => {
    const files = new Map([
      [logPath, encode(row(now - 3 * 60 * 60 * 1000))],
      [lockPath, nodeMarker],
    ]);
    const mtimes = new Map([[lockPath, now - 1000]]);

    await expect(open(files, mtimes)).rejects.toMatchObject({ code: 'WRITER_LOCKED' });
    expect(files.get(lockPath)).toEqual(nodeMarker);
  });

  it('refuses while the newest row is fresh, even with an old marker mtime', async () => {
    const files = new Map([
      [logPath, encode(row(now - 60_000))],
      [lockPath, nodeMarker],
    ]);

    await expect(open(files, new Map([[lockPath, now - foreignRunStaleMilliseconds * 2]]))).rejects.toMatchObject({
      code: 'WRITER_LOCKED',
    });
  });

  it('takes a stale Node marker over once both its row and its mtime are past the XD3 bound', async () => {
    const stale = now - foreignRunStaleMilliseconds - 1;
    const files = new Map([
      [logPath, encode(row(stale))],
      [lockPath, nodeMarker],
    ]);

    const writer = await open(files, new Map([[lockPath, stale]]));

    expect(new TextDecoder().decode(files.get(lockPath))).toMatch(/^\d+\n$/u);
    await writer.close();
  });

  it('treats a non-numeric marker as Node format and honours it while fresh', async () => {
    const files = new Map([[lockPath, encode('not a number\n')]]);

    await expect(open(files, new Map([[lockPath, now]]))).rejects.toMatchObject({ code: 'WRITER_LOCKED' });
  });

  it('always takes a provider marker (one numeric line), however fresh', async () => {
    const files = new Map([[lockPath, encode(`${String(now)}\n`)]]);

    const writer = await open(files, new Map([[lockPath, now]]));

    await writer.close();
    expect(files.has(lockPath)).toBe(false);
  });

  it('takes a paused run past its hold over: no touch and no row for longer than the bound', async () => {
    /* Heartbeats stop past `pausedRunHoldMilliseconds`, so the marker and the newest row age together. */
    const pausedAt = now - foreignRunStaleMilliseconds - 60_000;
    const files = new Map([
      [logPath, encode(row(pausedAt))],
      [lockPath, nodeMarker],
    ]);

    const writer = await open(files, new Map([[lockPath, pausedAt]]));

    await writer.close();
  });
});
