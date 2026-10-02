import type { Transferable } from 'node:worker_threads';
import { Worker } from 'node:worker_threads';
import { describe, expect, it, vi } from 'vitest';

import { SharedPool } from '@taucad/memory';
import { joinPath } from '@taucad/utils/path';

import { slotIndex, syncState } from '#sync/sync-fs-protocol.js';
import type { SyncFsProbe } from '#sync/sync-fs-client.js';
import { createSyncFsClient } from '#sync/sync-fs-client.js';
import { attachSyncFsServer } from '#sync/sync-fs-server.js';

describe('createSyncFsClient', () => {
  it('short-circuits readFileText when bytes are in the file pool (Tier 0)', () => {
    const root = '/projects/p1';
    const relativePath = 'lib/hidden.ts';
    const abs = joinPath(root, relativePath);
    const poolBuffer = new SharedArrayBuffer(256 * 1024);
    const poolWriter = new SharedPool(poolBuffer, { maxEntries: 32 });
    const bytes = new TextEncoder().encode('export const x = 1;\n');
    expect(poolWriter.store(abs, bytes)).toBe(true);

    const { port1 } = new MessageChannel();
    const client = createSyncFsClient({
      port: port1,
      slotSab: new SharedArrayBuffer(16),
      arenaSab: new SharedArrayBuffer(64),
      filePoolBuffer: poolBuffer,
      workspaceRootAbsolute: root,
    });

    expect(client.readFileText(`file:///${relativePath}`)).toBe('export const x = 1;\n');
  });

  it('short-circuits fileExists for Tier 0 pool hits', () => {
    const root = '/w';
    const relativePath = 'a.ts';
    const abs = joinPath(root, relativePath);
    const poolBuffer = new SharedArrayBuffer(256 * 1024);
    const poolWriter = new SharedPool(poolBuffer, { maxEntries: 8 });
    expect(poolWriter.store(abs, new Uint8Array([32]))).toBe(true);

    const { port1 } = new MessageChannel();
    const client = createSyncFsClient({
      port: port1,
      slotSab: new SharedArrayBuffer(16),
      arenaSab: new SharedArrayBuffer(64),
      filePoolBuffer: poolBuffer,
      workspaceRootAbsolute: root,
    });

    expect(client.fileExists(`file:///${relativePath}`)).toBe(true);
  });

  it('round-trips readFile, readdir, and statMtimeVersion via Tier 2 (worker + Atomics.wait)', async () => {
    const root = '/root';
    const nestedDeepAbs = joinPath(root, 'nested/deep.ts');

    const { port1, port2 } = new MessageChannel();
    const slotSab = new SharedArrayBuffer(16);
    const arenaSab = new SharedArrayBuffer(512);

    const workspace = {
      readFileBytes: async (path: string) => {
        expect(path).toBe(nestedDeepAbs);
        return new TextEncoder().encode('export const ok = true;');
      },
      stat: async (path: string) => {
        if (path === nestedDeepAbs) {
          return { mtimeMs: 4242, isDirectory: false };
        }
        if (path === joinPath(root, 'nested')) {
          return { mtimeMs: 1, isDirectory: true };
        }
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      },
      readdir: async (path: string) => {
        expect(path).toBe(joinPath(root, 'nested'));
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
    const fileAbs = joinPath(root, 'lib/a.ts');
    const directoryAbs = joinPath(root, 'lib');

    const { port1, port2 } = new MessageChannel();
    const slotSab = new SharedArrayBuffer(16);
    const arenaSab = new SharedArrayBuffer(512);

    const workspace = {
      readFileBytes: async (path: string) => {
        expect(path).toBe(fileAbs);
        return new TextEncoder().encode('export const x = 1;');
      },
      stat: async (path: string) => {
        if (path === fileAbs) {
          return { mtimeMs: 99, isDirectory: false };
        }
        if (path === directoryAbs) {
          return { mtimeMs: 1, isDirectory: true };
        }
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      },
      readdir: async (path: string) => {
        expect(path).toBe(directoryAbs);
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
    expect(slotProbes.some((p) => p.op === 'readdir' && p.outcome === 'ok')).toBe(true);
  });

  it('emits onProbe with raw -> relative -> absolute path translation for pool hits', () => {
    const root = '/projects/p1';
    const relativePath = 'lib/cube.ts';
    const abs = joinPath(root, relativePath);
    const poolBuffer = new SharedArrayBuffer(256 * 1024);
    const poolWriter = new SharedPool(poolBuffer, { maxEntries: 8 });
    expect(poolWriter.store(abs, new TextEncoder().encode('hi'))).toBe(true);

    const probes: SyncFsProbe[] = [];
    const { port1 } = new MessageChannel();
    const client = createSyncFsClient({
      port: port1,
      slotSab: new SharedArrayBuffer(16),
      arenaSab: new SharedArrayBuffer(64),
      filePoolBuffer: poolBuffer,
      workspaceRootAbsolute: root,
      onProbe: (probe) => probes.push(probe),
    });

    client.readFileText(`file:///${relativePath}`);
    expect(probes).toHaveLength(1);
    expect(probes[0]).toMatchObject({
      op: 'readFile',
      tier: 'pool',
      outcome: 'ok',
      fileName: 'file:///lib/cube.ts',
      relativePath: 'lib/cube.ts',
      absolutePath: abs,
    });
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
