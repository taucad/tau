// @vitest-environment node
import { mkdtemp, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { openShellProjectionMount } from './shell-projection-native.js';
import type { ShellProjectionEntry, ShellProjectionReply, ShellProjectionRequest } from './shell-projection-native.js';

// Selected native lane fails on missing prerequisites. This fixture proves transport, not authority or D8 activation.
const enabled = process.env['TAU_SHELL_PROJECTION_CONFORMANCE'] === '1';
const binary = fileURLToPath(new URL('../../dist/native/linux-x64/shell-projection.node', import.meta.url));

describe.runIf(enabled)('private projection native transport', () => {
  it('preserves renamed inode handles and rejects writes above a synchronous capacity bound', async () => {
    const mountpoint = await mkdtemp(join(tmpdir(), 'tau-projection-'));
    const names = new Map<string, bigint>([['file', 2n], ['replacement', 3n]]);
    const contents = new Map<bigint, Buffer>([[2n, Buffer.from('old')], [3n, Buffer.from('new')]]);
    const entry = (inode: bigint): ShellProjectionEntry => ({
      inode, mode: inode === 1n ? 0o40700 : 0o100600, size: contents.get(inode)?.length ?? 0, links: 1,
    });
    const operations: string[] = [];
    const handle = async (request: ShellProjectionRequest): Promise<ShellProjectionReply> => {
      operations.push(request.operation);
      switch (request.operation) {
        case 'lookup': {
          const inode = names.get(request.name ?? '');
          return inode === undefined ? { error: 2 } : { entry: entry(inode) };
        }
        case 'getattr': return { entry: entry(request.inode) };
        case 'open': return { handle: request.inode };
        case 'read': return { bytes: contents.get(request.inode)?.subarray(request.offset, request.offset + request.length) ?? Buffer.alloc(0) };
        case 'write': {
          const old = contents.get(request.inode) ?? Buffer.alloc(0);
          const size = Math.max(old.length, request.offset + request.length);
          const used = [...contents.values()].reduce((total, bytes) => total + bytes.length, 0);
          if (used - old.length + size > 8192) return { error: 28 };
          const next = Buffer.alloc(size);
          old.copy(next);
          next.set(request.data ?? [], request.offset);
          contents.set(request.inode, next);
          return { written: request.length };
        }
        case 'rename': {
          const inode = names.get(request.name ?? '');
          if (inode === undefined || request.flags !== 0) return { error: 22 };
          names.delete(request.name ?? '');
          names.set(request.destinationName ?? '', inode);
          return {};
        }
        case 'setattr': return { error: 95 };
        case 'forget': case 'flush': case 'release': case 'fsync': return {};
        default: return { error: 38 };
      }
    };
    const mount = openShellProjectionMount({ binary, mountpoint, handle });
    try {
      const old = await open(join(mountpoint, 'file'), 'r+');
      try {
        expect(await old.readFile('utf8')).toBe('old');
        await rename(join(mountpoint, 'replacement'), join(mountpoint, 'file'));
        await old.write(Buffer.from('OLD'), 0, 3, 0);
        expect(contents.get(2n)?.toString()).toBe('OLD');
        expect(await readFile(join(mountpoint, 'file'), 'utf8')).toBe('new');
        await expect(old.write(Buffer.alloc(8192), 0, 8192, 0)).rejects.toMatchObject({ code: 'ENOSPC' });
        expect(contents.get(2n)?.toString()).toBe('OLD');
      } finally { await old.close(); }
      expect(operations).toContain('write');
      expect(operations).toContain('rename');
    } finally {
      await mount[Symbol.asyncDispose]();
      await rm(mountpoint, { recursive: true });
    }
  }, 15_000);

  it('returns EIO and retains callback failure for disposal', async () => {
    const mountpoint = await mkdtemp(join(tmpdir(), 'tau-projection-'));
    const failure = new Error('authority unavailable');
    const mount = openShellProjectionMount({ binary, mountpoint, handle: async () => { throw failure; } });
    try {
      await expect(writeFile(join(mountpoint, 'file'), 'data')).rejects.toMatchObject({ code: 'EIO' });
      await expect(mount[Symbol.asyncDispose]()).rejects.toBeInstanceOf(AggregateError);
    } finally {
      await mount[Symbol.asyncDispose]().catch(() => undefined);
      await rm(mountpoint, { recursive: true });
    }
  }, 15_000);
});
