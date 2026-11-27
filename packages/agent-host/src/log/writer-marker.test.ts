/**
 * AR4-6: HA1's fresh and stale Node marker cases on a provider open, re-run with the marker a real Node writer writes
 * now that it records its boot (H33).
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createBrowserChatStore } from '#browser.js';
import { chatStoreBinding } from '#launchers/chat-store.js';
import { foreignRunStaleMilliseconds } from '#log/foreign-runs.js';
import { isProviderMarker } from '#log/writer-marker.js';
import { createNodeEventLog } from '#node.js';

const logPath = '.tau/chats/chat/events.jsonl';
const lockPath = `${logPath}.lock`;
const encode = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);
const row = (recordedAt: number): Uint8Array<ArrayBuffer> =>
  encode(
    `${JSON.stringify({
      version: 1,
      leaderEpoch: 'node-term',
      sequence: 0,
      recordedAt: new Date(recordedAt).toISOString(),
      runId: 'run-1',
      type: 'run.lifecycle',
      state: 'admitted',
    })}\n`,
  );

/** A `webaccess`-like provider over a map: `stat` answers `File.lastModified` as `mtimeMs`. */
const open = async (files: Map<string, Uint8Array<ArrayBuffer>>, mtimes: Map<string, number>) => {
  const missing = (path: string): Error => Object.assign(new Error(`Missing ${path}`), { code: 'ENOENT' });
  const fileSystem = {
    exists: async (path: string) => files.has(path),
    readFile: async (path: string) => {
      const bytes = files.get(path);
      if (bytes === undefined) {
        throw missing(path);
      }
      return new Uint8Array(bytes);
    },
    writeFile: async (path: string, data: Uint8Array<ArrayBuffer> | string) => {
      files.set(path, typeof data === 'string' ? encode(data) : new Uint8Array(data));
    },
    appendFile: async (path: string, data: Uint8Array<ArrayBuffer> | string) => {
      const added = typeof data === 'string' ? encode(data) : data;
      files.set(path, new Uint8Array([...(files.get(path) ?? []), ...added]));
    },
    unlink: async (path: string) => {
      files.delete(path);
    },
    stat: async (path: string) => {
      const bytes = files.get(path);
      if (bytes === undefined) {
        throw missing(path);
      }
      return { size: bytes.byteLength, mtimeMs: mtimes.get(path) ?? 0 };
    },
  };
  return chatStoreBinding(
    createBrowserChatStore({
      projectId: 'project',
      tabId: 'tab',
      build: 'build',
      log: { kind: 'provider', fileSystem },
    }),
  ).openWriter('chat');
};

describe('a boot-stamped Node marker on a provider open (HA-I10, AR4-6)', () => {
  let directory: string;
  let nodeMarker: Uint8Array<ArrayBuffer>;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'tau-writer-marker-'));
    const filePath = join(directory, logPath);
    const log = await createNodeEventLog({ filePath, access: 'write' });
    nodeMarker = new Uint8Array(await readFile(`${filePath}.lock`));
    await log.close();
  });
  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('should carry a boot line and stay a Node marker', () => {
    const text = new TextDecoder().decode(nodeMarker);
    expect(text.split('\n')).toHaveLength(4);
    expect(isProviderMarker(text)).toBe(false);
  });

  it('should refuse WRITER_LOCKED while a just-opened writer on an idle chat is fresh by its mtime', async () => {
    const now = Date.now();
    const files = new Map([
      [logPath, row(now - 3 * 60 * 60 * 1000)],
      [lockPath, nodeMarker],
    ]);
    await expect(open(files, new Map([[lockPath, now - 1000]]))).rejects.toMatchObject({ code: 'WRITER_LOCKED' });
    expect(files.get(lockPath)).toEqual(nodeMarker);
  });

  it('should take the marker over once both its row and its mtime are past the XD3 bound', async () => {
    const stale = Date.now() - foreignRunStaleMilliseconds - 1;
    const files = new Map([
      [logPath, row(stale)],
      [lockPath, nodeMarker],
    ]);
    const writer = await open(files, new Map([[lockPath, stale]]));
    expect(isProviderMarker(new TextDecoder().decode(files.get(lockPath)))).toBe(true);
    await writer.close();
  });
});
