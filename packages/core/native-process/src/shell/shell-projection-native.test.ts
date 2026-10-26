/* eslint-disable @typescript-eslint/naming-convention -- loader environment variables retain their operating-system names. */
// @vitest-environment node
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile, mkdir, mkdtemp, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { openShellProjectionMount } from '#shell/shell-projection-native.js';
import type {
  ShellProjectionEntry,
  ShellProjectionReply,
  ShellProjectionRequest,
} from '#shell/shell-projection-native.js';

// Selected native lane fails on missing prerequisites. This fixture proves transport, not authority or D8 activation.
const execute = promisify(execFile);
const enabled = process.env['TAU_SHELL_PROJECTION_CONFORMANCE'] === '1';
const binary = fileURLToPath(new URL('../../dist/native/linux-x64/shell-projection.node', import.meta.url));
const encoder = new TextEncoder();
const decoder = new TextDecoder();

describe.runIf(enabled)('private projection native transport', () => {
  it('preserves renamed inode handles and rejects writes above a synchronous capacity bound', async () => {
    const mountpoint = await mkdtemp(join(tmpdir(), 'tau-projection-'));
    const names = new Map<string, bigint>([
      ['file', 2n],
      ['replacement', 3n],
    ]);
    const contents = new Map<bigint, Uint8Array<ArrayBuffer>>([
      [2n, encoder.encode('old')],
      [3n, encoder.encode('new')],
    ]);
    const text = (inode: bigint): string | undefined => {
      const bytes = contents.get(inode);
      return bytes === undefined ? undefined : decoder.decode(bytes);
    };
    const entry = (inode: bigint): ShellProjectionEntry => ({
      inode,
      mode: inode === 1n ? 0o4_0700 : 0o10_0600,
      size: contents.get(inode)?.length ?? 0,
      links: 1,
    });
    const writeAt = (request: ShellProjectionRequest): ShellProjectionReply => {
      const old = contents.get(request.inode) ?? new Uint8Array(0);
      const size = Math.max(old.length, request.offset + request.length);
      const used = [...contents.values()].reduce((total, bytes) => total + bytes.length, 0);
      if (used - old.length + size > 8192) {
        return { error: 28 };
      }
      const next = new Uint8Array(size);
      next.set(old);
      next.set(request.data ?? [], request.offset);
      contents.set(request.inode, next);
      return { written: request.length };
    };
    const renameEntry = (request: ShellProjectionRequest): ShellProjectionReply => {
      const inode = names.get(request.name ?? '');
      if (inode === undefined || request.flags !== 0) {
        return { error: 22 };
      }
      names.delete(request.name ?? '');
      names.set(request.destinationName ?? '', inode);
      return {};
    };
    const operations: string[] = [];
    const handle = async (request: ShellProjectionRequest): Promise<ShellProjectionReply> => {
      operations.push(request.operation);
      switch (request.operation) {
        case 'lookup': {
          const inode = names.get(request.name ?? '');
          return inode === undefined ? { error: 2 } : { entry: entry(inode) };
        }
        case 'getattr': {
          return { entry: entry(request.inode) };
        }
        case 'open': {
          return { handle: request.inode };
        }
        case 'read': {
          return {
            bytes:
              contents.get(request.inode)?.subarray(request.offset, request.offset + request.length) ??
              new Uint8Array(0),
          };
        }
        case 'write': {
          return writeAt(request);
        }
        case 'rename': {
          return renameEntry(request);
        }
        case 'setattr': {
          return { error: 95 };
        }
        case 'forget':
        case 'flush':
        case 'release':
        case 'fsync': {
          return {};
        }
        default: {
          return { error: 38 };
        }
      }
    };
    const mount = openShellProjectionMount({ binary, mountpoint, handle });
    try {
      const old = await open(join(mountpoint, 'file'), 'r+');
      try {
        expect(await old.readFile('utf8')).toBe('old');
        await rename(join(mountpoint, 'replacement'), join(mountpoint, 'file'));
        await old.write(Buffer.from('OLD'), 0, 3, 0);
        expect(text(2n)).toBe('OLD');
        expect(await readFile(join(mountpoint, 'file'), 'utf8')).toBe('new');
        await expect(old.write(Buffer.alloc(8192), 0, 8192, 0)).rejects.toMatchObject({ code: 'ENOSPC' });
        expect(text(2n)).toBe('OLD');
      } finally {
        await old.close();
      }
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
    const mount = openShellProjectionMount({
      binary,
      mountpoint,
      handle: async () => {
        throw failure;
      },
    });
    try {
      await expect(writeFile(join(mountpoint, 'file'), 'data')).rejects.toMatchObject({ code: 'EIO' });
      await expect(mount[Symbol.asyncDispose]()).rejects.toBeInstanceOf(AggregateError);
    } finally {
      await Promise.resolve(mount[Symbol.asyncDispose]()).catch(() => undefined);
      await rm(mountpoint, { recursive: true });
    }
  }, 15_000);
  it('fails and drains the mount when saturated release accounting cannot be delivered', async () => {
    const mountpoint = await mkdtemp(join(tmpdir(), 'tau-projection-pressure-'));
    const saturated = Promise.withResolvers<void>();
    const gone = Promise.withResolvers<void>();
    const drain = Promise.withResolvers<void>();
    let reads = 0;
    let references = 0;
    let observedSignal = false;
    let abortReason: unknown;
    const mount = openShellProjectionMount({
      binary,
      mountpoint,
      handle: async (request, signal) => {
        if (!observedSignal) {
          observedSignal = true;
          signal.addEventListener(
            'abort',
            () => {
              abortReason = signal.reason;
              references = 0;
              drain.resolve();
              gone.resolve();
            },
            { once: true },
          );
        }
        const entry = { inode: 2n, mode: 0o10_0600, size: 64 * 1024 * 1024, links: 1 };
        switch (request.operation) {
          case 'lookup': {
            return { entry };
          }
          case 'getattr': {
            return { entry: request.inode === 1n ? { ...entry, inode: 1n, mode: 0o4_0700 } : entry };
          }
          case 'open': {
            references++;
            return { handle: 2n };
          }
          case 'release': {
            references--;
            return {};
          }
          case 'read': {
            reads++;
            if (reads === 128) {
              saturated.resolve();
            }
            await drain.promise;
            return { error: 5 };
          }
          default: {
            return {};
          }
        }
      },
    });
    const child = spawn(
      'python3',
      [
        '-c',
        `
import os, sys, threading
fd = os.open(sys.argv[1], os.O_RDONLY)
sys.stdin.readline()
def read(index):
    try: os.pread(fd, 1, index * 256 * 1024)
    except OSError: pass
threads = [threading.Thread(target=read, args=(i,)) for i in range(128)]
for thread in threads: thread.start()
for thread in threads: thread.join()
os.close(fd)
`,
        join(mountpoint, 'file'),
      ],
      { stdio: ['pipe', 'ignore', 'ignore'] },
    );
    const exited = new Promise<void>((resolve, reject) => {
      child.once('exit', () => {
        resolve();
      });
      child.once('error', reject);
    });
    const held = await open(join(mountpoint, 'file'), 'r');
    child.stdin.end('start\n');
    const deadline = Promise.withResolvers<void>();
    const stallTimeout = setTimeout(() => {
      deadline.reject(new Error(`Pressure test stalled after ${reads} reads`));
    }, 5000);
    try {
      await Promise.race([saturated.promise, deadline.promise]);
      expect(references).toBe(2);
      await held.close().catch(() => undefined);
      await Promise.race([gone.promise, deadline.promise]);
      expect(references).toBe(0);
      // The owner's abort reason is the fatal lifecycle failure, not the ordinary explicit-close reason.
      expect(abortReason).toBeInstanceOf(Error);
      expect((abortReason as Error).message).toMatch(
        /^Projection mount failed; lifetime accounting requires whole-mount reconciliation\.$/u,
      );
      await exited;
      await expect(mount[Symbol.asyncDispose]()).rejects.toBeInstanceOf(AggregateError);
    } finally {
      clearTimeout(stallTimeout);
      drain.resolve();
      child.kill();
      await held.close().catch(() => undefined);
      await Promise.resolve(mount[Symbol.asyncDispose]()).catch(() => undefined);
      await exited;
      await rm(mountpoint, { recursive: true });
    }
  }, 15_000);

  it('rejects missing, substituted, and competing same-SONAME library resolution before mounting', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tau-projection-loader-'));
    const artifact = join(directory, 'artifact');
    const competitor = join(directory, 'competitor');
    await mkdir(artifact);
    await mkdir(competitor);
    const source = fileURLToPath(new URL('../../dist/native/linux-x64/', import.meta.url));
    const wrapper = fileURLToPath(new URL('shell-projection-native.ts', import.meta.url));
    const target = join(artifact, 'shell-projection.node');
    await copyFile(binary, target);
    await copyFile(join(source, 'provenance.json'), join(artifact, 'provenance.json'));
    const script = `import {openShellProjectionMount} from ${JSON.stringify(wrapper)};
try { const mount = openShellProjectionMount({binary:process.argv[1],mountpoint:process.argv[2],handle:async()=>({error:5})});
await mount[Symbol.asyncDispose](); process.stdout.write('mounted'); }
catch(error) { process.stdout.write(error.message); }`;
    const run = async (environment: NodeJS.ProcessEnv = process.env): Promise<string> => {
      const result = await execute(process.execPath, ['--input-type=module', '-e', script, target, directory], {
        env: environment,
      });
      return result.stdout;
    };
    try {
      expect(await run()).toContain('ENOENT');
      await writeFile(join(artifact, 'libfuse3.so.4'), 'not the reviewed library');
      expect(await run()).toContain('does not match');
      await copyFile(join(source, 'libfuse3.so.4'), join(artifact, 'libfuse3.so.4'));
      await copyFile(join(source, 'libfuse3.so.4'), join(competitor, 'libfuse3.so.4'));
      expect(await run({ ...process.env, LD_LIBRARY_PATH: competitor })).toContain(
        'did not load its reviewed adjacent library',
      );
      expect(await run({ ...process.env, LD_PRELOAD: join(competitor, 'libfuse3.so.4') })).toContain(
        'did not load its reviewed adjacent library',
      );
    } finally {
      await rm(directory, { recursive: true });
    }
  }, 15_000);
});
