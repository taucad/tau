import type { Transferable } from 'node:worker_threads';
import { Worker } from 'node:worker_threads';
import { describe, expect, it, vi } from 'vitest';

import { slotIndex, syncState } from '#sync/sync-fs-protocol.js';
import type { SyncFsProbe } from '#sync/sync-fs-client.js';
import { createSyncFsClient } from '#sync/sync-fs-client.js';
import { attachSyncFsServer } from '#sync/sync-fs-server.js';

describe('createSyncFsClient', () => {
  it('round-trips readFile, listDirectories, and statMtimeVersion via Tier 2 (worker + Atomics.wait)', async () => {
    const root = '/root';
    const { port1, port2 } = new MessageChannel();
    const slotSab = new SharedArrayBuffer(16);
    const arenaSab = new SharedArrayBuffer(512);

    const workspace = {
      readFileBytes: async (path: string) => {
        expect(path).toBe('nested/deep.ts');
        return new TextEncoder().encode('export const ok = true;');
      },
      stat: async (path: string) => {
        if (path === 'nested/deep.ts') {
          return { mtimeMs: 4242, isDirectory: false };
        }
        if (path === 'nested') {
          return { mtimeMs: 1, isDirectory: true };
        }
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      },
      listDirectories: async (path: string) => {
        expect(path).toBe('nested');
        return ['deep.ts', 'other.ts'];
      },
    };

    attachSyncFsServer({ port: port2, slotSab, arenaSab, workspace });

    const result = await new Promise<{
      text: string | undefined;
      directories: string[];
      version: string | undefined;
    }>((resolve, reject) => {
      const worker = new Worker(new URL('sync-fs-client.tier2.worker.ts', import.meta.url), {
        workerData: { workspaceRootAbsolute: root },
        execArgv: ['--import', '@oxc-node/core/register'],
      });
      worker.once('message', resolve);
      worker.once('error', reject);
      worker.once('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`tier2 worker exited ${String(code)}`));
        }
      });
      worker.postMessage(
        {
          port: port1,
          slotSab,
          arenaSab,
        },
        [port1 as unknown as Transferable],
      );
    });

    expect(result.text).toBe('export const ok = true;');
    expect(result.directories).toEqual(['deep.ts', 'other.ts']);
    expect(result.version).toBe('4242');
    expect(Atomics.load(new Int32Array(slotSab), slotIndex.state)).toBe(syncState.idle);
  });

  it('decodes slot-tier payloads from SharedArrayBuffer arena without probe exception', async () => {
    const root = '/root';
    const { port1, port2 } = new MessageChannel();
    const slotSab = new SharedArrayBuffer(16);
    const arenaSab = new SharedArrayBuffer(512);

    const workspace = {
      readFileBytes: async (path: string) => {
        expect(path).toBe('lib/a.ts');
        return new TextEncoder().encode('export const x = 1;');
      },
      stat: async (path: string) => {
        if (path === 'lib/a.ts') {
          return { mtimeMs: 99, isDirectory: false };
        }
        if (path === 'lib') {
          return { mtimeMs: 1, isDirectory: true };
        }
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      },
      listDirectories: async (path: string) => {
        expect(path).toBe('lib');
        return ['a.ts'];
      },
    };

    attachSyncFsServer({ port: port2, slotSab, arenaSab, workspace });

    const result = await new Promise<{
      text: string | undefined;
      directories: string[];
      version: string | undefined;
      probes: SyncFsProbe[];
    }>((resolve, reject) => {
      const worker = new Worker(new URL('sync-fs-client.sab-decode.worker.ts', import.meta.url), {
        execArgv: ['--import', '@oxc-node/core/register'],
      });
      worker.once('message', resolve);
      worker.once('error', reject);
      worker.postMessage(
        {
          port: port1,
          slotSab,
          arenaSab,
          workspaceRootAbsolute: root,
        },
        [port1 as unknown as Transferable],
      );
    });

    expect(result.text).toBe('export const x = 1;');
    expect(result.version).toBe('99');
    expect(result.directories).toEqual(['a.ts']);

    const slotProbes = result.probes.filter((p) => p.tier === 'slot');
    expect(slotProbes.every((p) => p.outcome !== 'exception')).toBe(true);
    expect(slotProbes.some((p) => p.op === 'readFile' && p.outcome === 'ok')).toBe(true);
    expect(slotProbes.some((p) => p.op === 'statMtimeVersion' && p.outcome === 'ok')).toBe(true);
    expect(slotProbes.some((p) => p.op === 'listDirectories' && p.outcome === 'ok')).toBe(true);
  });

  it('emits a translation-failure probe when the URI scheme is not file:', () => {
    const onProbe = vi.fn();
    const { port1 } = new MessageChannel();
    const client = createSyncFsClient({
      port: port1,
      slotSab: new SharedArrayBuffer(16),
      arenaSab: new SharedArrayBuffer(64),
      workspaceRootAbsolute: '/w',
      onProbe,
    });

    expect(client.readFileText('inmemory://model/1')).toBeUndefined();
    expect(onProbe).toHaveBeenCalledTimes(1);
    expect(onProbe.mock.calls[0]?.[0]).toMatchObject({
      op: 'readFile',
      tier: 'translation',
      outcome: 'exception',
      fileName: 'inmemory://model/1',
      relativePath: undefined,
      absolutePath: undefined,
    });
  });
});
