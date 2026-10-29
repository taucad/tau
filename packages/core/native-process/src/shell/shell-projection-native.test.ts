/* eslint-disable @typescript-eslint/naming-convention -- loader environment variables retain their operating-system names. */
// @vitest-environment node
import { spawn, execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import {
  copyFile,
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  readlink,
  rename,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import type * as NodeFileSystem from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';

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

describe('projection callback ordering (adapter fault injection, no native mount)', () => {
  it('should retain an interrupt delivered before its request without cancelling the following request', async () => {
    // Adapter ordering fault injection only. The G4 test below separately exercises real kernel interruption.
    const mountpoint = await mkdtemp(join(tmpdir(), 'tau-projection-order-'));
    const library = join(mountpoint, 'libfuse3.so.4');
    const fixtureBinary = join(mountpoint, 'shell-projection.node');
    const fixtureBytes = 'adapter fixture only';
    const digest = createHash('sha256').update(fixtureBytes).digest('hex');
    await writeFile(library, fixtureBytes);
    await writeFile(fixtureBinary, fixtureBytes);
    await writeFile(
      join(mountpoint, 'provenance.json'),
      JSON.stringify({
        binary: digest,
        library: digest,
        libfuse: '3.17.2',
        abi: 'linux-x64-napi8-fuse35',
      }),
    );
    let deliver: ((request: ShellProjectionRequest | { id: number; operation: 'interrupt' }) => void) | undefined;
    const replies = new Map<number, ShellProjectionReply>();
    const finished = Promise.withResolvers<void>();
    vi.resetModules();
    vi.stubGlobal('process', { ...process, platform: 'linux', arch: 'x64' });
    vi.doMock('node:fs', async (importOriginal) => ({
      ...(await importOriginal<typeof NodeFileSystem>()),
      readFileSync: (path: string, encoding?: BufferEncoding) =>
        path === '/proc/self/mountinfo' ? '' : readFileSync(path, encoding),
    }));
    vi.doMock('node:module', () => ({
      createRequire: () => () => ({
        libraryIdentity: () => ({ path: library, version: '3.17.2' }),
        mount: (_path: string, callback: typeof deliver) => {
          deliver = callback;
          return {};
        },
        reply: (_mount: Record<string, unknown>, id: number, reply: ShellProjectionReply) => {
          replies.set(id, reply);
          if (replies.size === 2) {
            finished.resolve();
          }
          return true;
        },
        close: () => undefined,
      }),
    }));
    let mount: AsyncDisposable | undefined;
    try {
      const isolated = await import('#shell/shell-projection-native.js');
      mount = isolated.openShellProjectionMount({
        binary: fixtureBinary,
        mountpoint,
        handle: async (_request, signal) => {
          signal.throwIfAborted();
          return { bytes: encoder.encode('live') };
        },
      });
      const request: ShellProjectionRequest = {
        id: 1,
        operation: 'read',
        inode: 2n,
        handle: 2n,
        destinationParent: 0n,
        lookupCount: 0n,
        offset: 0,
        length: 4,
        flags: 0,
        mode: 0,
        attributes: 0,
      };
      expect(deliver).toBeTypeOf('function');
      deliver?.({ id: 1, operation: 'interrupt' });
      deliver?.(request);
      deliver?.({ ...request, id: 2 });
      await finished.promise;
      expect(replies.get(1)).toEqual({ error: 4 });
      expect(replies.get(2)).toEqual({ bytes: encoder.encode('live') });
    } finally {
      await mount?.[Symbol.asyncDispose]();
      vi.doUnmock('node:module');
      vi.doUnmock('node:fs');
      vi.unstubAllGlobals();
      vi.resetModules();
      await rm(mountpoint, { recursive: true, force: true });
    }
  });
});

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
  it('survives a saturated request budget and a forget storm with every lifetime notification accounted', async () => {
    const mountpoint = await mkdtemp(join(tmpdir(), 'tau-projection-pressure-'));
    const saturated = Promise.withResolvers<void>();
    const drain = Promise.withResolvers<void>();
    const released = Promise.withResolvers<void>();
    // A synthetic tree of 40 directories of 100 files; every inode is issued once and never reused.
    type Node = { inode: bigint; directory: boolean; children: Map<string, Node> };
    const nodes = new Map<bigint, Node>();
    const add = (children: Map<string, Node>, name: string, directory: boolean): Node => {
      const node = { inode: BigInt(nodes.size + 2), directory, children: new Map<string, Node>() };
      nodes.set(node.inode, node);
      children.set(name, node);
      return node;
    };
    const root: Node = { inode: 1n, directory: true, children: new Map() };
    nodes.set(1n, root);
    const held = add(root.children, 'held', false);
    const tree = add(root.children, 'tree', true);
    for (let directory = 0; directory < 40; directory++) {
      const parent = add(tree.children, `d${String(directory)}`, true);
      for (let file = 0; file < 100; file++) {
        add(parent.children, `f${String(file)}`, false);
      }
    }
    const lookups = new Map<bigint, bigint>();
    let forgets = 0;
    let lifetimeFailures = 0;
    let references = 0;
    let reads = 0;
    const entry = (node: Node): ShellProjectionEntry => ({
      inode: node.inode,
      mode: node.directory ? 0o4_0700 : 0o10_0600,
      size: node === held ? 64 * 1024 * 1024 : 0,
      links: node.directory ? 2 : 1,
    });
    const lookedUp = (node: Node): ShellProjectionReply => {
      lookups.set(node.inode, (lookups.get(node.inode) ?? 0n) + 1n);
      return { entry: entry(node) };
    };
    const remove = (request: ShellProjectionRequest): ShellProjectionReply => {
      const parent = nodes.get(request.inode);
      const child = parent?.children.get(request.name ?? '');
      if (parent === undefined || child === undefined) {
        return { error: 2 };
      }
      if (child.children.size > 0) {
        return { error: 39 };
      }
      parent.children.delete(request.name ?? '');
      return {};
    };
    const handle = async (request: ShellProjectionRequest): Promise<ShellProjectionReply> => {
      const node = nodes.get(request.inode);
      switch (request.operation) {
        case 'lookup': {
          const child = node?.children.get(request.name ?? '');
          return child === undefined ? { error: 2 } : lookedUp(child);
        }
        case 'getattr': {
          return node === undefined ? { error: 2 } : { entry: entry(node) };
        }
        case 'open': {
          references++;
          return { handle: request.inode };
        }
        case 'release': {
          references--;
          if (request.inode === held.inode) {
            released.resolve();
          }
          return {};
        }
        case 'forget': {
          const remaining = (lookups.get(request.inode) ?? 0n) - request.lookupCount;
          if (remaining < 0n) {
            lifetimeFailures++;
          }
          lookups.set(request.inode, remaining);
          forgets++;
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
        case 'readdir': {
          const rows = [...(node?.children ?? new Map<string, Node>()).entries()].map(([name, child], index) => ({
            name,
            inode: child.inode,
            mode: entry(child).mode,
            cookie: index + 1,
          }));
          return { entries: rows.filter((row) => row.cookie > request.offset) };
        }
        case 'unlink':
        case 'rmdir': {
          return remove(request);
        }
        default: {
          return {};
        }
      }
    };
    const mount = openShellProjectionMount({ binary, mountpoint, handle });
    // 128 blocked reads fill the request budget; the held descriptor's release then arrives while it is full.
    const readers = python(
      `
import os, sys, threading
fd = os.open(sys.argv[1], os.O_RDONLY)
print("open", flush=True)
sys.stdin.readline()
def read(index):
    try: os.pread(fd, 1, index * 256 * 1024)
    except OSError: pass
threads = [threading.Thread(target=read, args=(i,)) for i in range(128)]
for thread in threads: thread.start()
for thread in threads: thread.join()
os.close(fd)
print("done", flush=True)
`,
      join(mountpoint, 'held'),
    );
    const next = lines(readers);
    const deadline = Promise.withResolvers<never>();
    const stallTimeout = setTimeout(() => {
      deadline.reject(new Error(`Pressure test stalled after ${String(reads)} reads`));
    }, 20_000);
    try {
      expect(await Promise.race([next(), deadline.promise])).toBe('open');
      const other = await open(join(mountpoint, 'held'), 'r');
      readers.stdin.end('start\n');
      await Promise.race([saturated.promise, deadline.promise]);
      expect(references).toBe(2);
      await other.close();
      // The release is answered natively and reaches the owner even though every request slot is taken.
      await Promise.race([released.promise, deadline.promise]);
      expect(references).toBe(1);
      expect(mounted(mountpoint)).toBe(true);
      drain.resolve();
      expect(await Promise.race([next(), deadline.promise])).toBe('done');
      // A find over thousands of entries, then rm -rf: every evicted inode produces a forget.
      const walk = await execute('find', [join(mountpoint, 'tree')], { maxBuffer: 16 * 1024 * 1024 });
      expect(walk.stdout.trim().split('\n')).toHaveLength(1 + 40 + 4000);
      await execute('rm', ['-rf', join(mountpoint, 'tree')]);
      expect(root.children.has('tree')).toBe(false);
      expect(mounted(mountpoint)).toBe(true);
      // Forgets are coalesced per inode and delivered after the requests that caused them.
      const removed = [...nodes.keys()].filter((inode) => inode !== 1n && inode !== held.inode);
      const balanced = (): boolean => removed.every((inode) => lookups.get(inode) === 0n);
      const storm = Promise.withResolvers<void>();
      const settled = setInterval(() => {
        if (balanced()) {
          storm.resolve();
        }
      }, 20);
      try {
        await Promise.race([storm.promise, deadline.promise]);
      } finally {
        clearInterval(settled);
      }
      expect(lifetimeFailures).toBe(0);
      expect(forgets).toBeGreaterThanOrEqual(removed.length);
      expect(references).toBe(0);
      expect(await readdir(mountpoint)).toStrictEqual(['held']);
    } finally {
      clearTimeout(stallTimeout);
      drain.resolve();
      readers.kill();
      await exited(readers);
      await mount[Symbol.asyncDispose]();
      await rm(mountpoint, { recursive: true });
    }
  }, 60_000);

  it('should reject missing or substituted libraries and select the adjacent library ahead of LD_LIBRARY_PATH', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tau-projection-loader-'));
    const artifact = join(directory, 'artifact');
    const competitor = join(directory, 'competitor');
    const mountpoint = join(directory, 'mount');
    await mkdir(artifact);
    await mkdir(competitor);
    await mkdir(mountpoint);
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
      const result = await execute(process.execPath, ['--input-type=module', '-e', script, target, mountpoint], {
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
      const dynamic = await execute('readelf', ['-d', target]);
      expect(dynamic.stdout).toMatch(/\(RPATH\).*\$ORIGIN/u);
      expect(dynamic.stdout).not.toContain('(RUNPATH)');
      expect(await run({ ...process.env, LD_LIBRARY_PATH: competitor })).toBe('mounted');
      expect(await run({ ...process.env, LD_PRELOAD: join(competitor, 'libfuse3.so.4') })).toContain(
        'did not load its reviewed adjacent library',
      );
    } finally {
      await rm(directory, { recursive: true });
    }
  }, 15_000);
});

/** A minimal owner over never-reused inode identities. It is a transport fixture, not the rooted authority. */
const createOwner = (): Readonly<{
  names: Map<string, bigint>;
  contents: Map<bigint, Uint8Array<ArrayBuffer>>;
  links: Map<bigint, string>;
  modified: Map<bigint, number>;
  requests: ShellProjectionRequest[];
  handle: (request: ShellProjectionRequest, signal: AbortSignal) => Promise<ShellProjectionReply>;
  override: Map<string, (request: ShellProjectionRequest, signal: AbortSignal) => Promise<ShellProjectionReply>>;
}> => {
  const names = new Map<string, bigint>();
  const contents = new Map<bigint, Uint8Array<ArrayBuffer>>();
  const links = new Map<bigint, string>();
  const modified = new Map<bigint, number>();
  const requests: ShellProjectionRequest[] = [];
  const override = new Map<
    string,
    (request: ShellProjectionRequest, signal: AbortSignal) => Promise<ShellProjectionReply>
  >();
  const entry = (inode: bigint): ShellProjectionEntry => {
    const target = links.get(inode);
    const at = modified.get(inode);
    return {
      inode,
      mode: inode === 1n ? 0o4_0700 : target === undefined ? 0o10_0600 : 0o12_0777,
      size: target?.length ?? contents.get(inode)?.length ?? 0,
      links: 1,
      ...(at === undefined ? {} : { modified: at }),
    };
  };
  const renamed = (request: ShellProjectionRequest): ShellProjectionReply => {
    const source = names.get(request.name ?? '');
    const destination = names.get(request.destinationName ?? '');
    if (source === undefined) {
      return { error: 2 };
    }
    if (request.flags === 1 && destination !== undefined) {
      return { error: 17 };
    }
    names.delete(request.name ?? '');
    names.set(request.destinationName ?? '', source);
    return {};
  };
  const handle = async (request: ShellProjectionRequest, signal: AbortSignal): Promise<ShellProjectionReply> => {
    requests.push(request);
    const special = override.get(request.operation);
    if (special !== undefined) {
      return special(request, signal);
    }
    switch (request.operation) {
      case 'lookup': {
        const inode = names.get(request.name ?? '');
        return inode === undefined ? { error: 2 } : { entry: entry(inode) };
      }
      case 'getattr': {
        return { entry: entry(request.inode) };
      }
      case 'setattr': {
        if (request.modified !== undefined && request.modified > 0) {
          modified.set(request.inode, request.modified);
        }
        return { entry: entry(request.inode) };
      }
      case 'open': {
        return { handle: request.inode };
      }
      case 'read': {
        return {
          bytes:
            contents.get(request.inode)?.slice(request.offset, request.offset + request.length) ?? new Uint8Array(0),
        };
      }
      case 'write': {
        const old = contents.get(request.inode) ?? new Uint8Array(0);
        const next = new Uint8Array(Math.max(old.length, request.offset + request.length));
        next.set(old);
        next.set(request.data ?? [], request.offset);
        contents.set(request.inode, next);
        return { written: request.length };
      }
      case 'readlink': {
        const target = links.get(request.inode);
        return target === undefined ? { error: 22 } : { target };
      }
      case 'rename': {
        return renamed(request);
      }
      case 'readdir': {
        // Cookies are stable and sparse (seven apart), so resuming proves the bridge honours them, not positions.
        const rows = [...names.entries()]
          .map(([name, inode], index) => ({ name, inode, mode: entry(inode).mode, cookie: (index + 1) * 7 }))
          .filter((row) => row.cookie > request.offset);
        return { entries: rows };
      }
      case 'forget':
      case 'release':
      case 'fsync': {
        return {};
      }
      default: {
        return { error: 38 };
      }
    }
  };
  return { names, contents, links, modified, requests, handle, override };
};

const mounted = (mountpoint: string): boolean =>
  readFileSync('/proc/self/mountinfo', 'utf8')
    .split('\n')
    .some((line) => line.split(' ')[4] === mountpoint);

const python = (script: string, ...parameters: string[]): ChildProcessWithoutNullStreams =>
  spawn('python3', ['-I', '-c', script, ...parameters], { stdio: ['pipe', 'pipe', 'pipe'] });

const lines = (child: ChildProcessWithoutNullStreams): (() => Promise<string>) => {
  const queue: string[] = [];
  const waiting: Array<(line: string) => void> = [];
  let buffered = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buffered += chunk;
    let index = buffered.indexOf('\n');
    while (index !== -1) {
      const line = buffered.slice(0, index);
      buffered = buffered.slice(index + 1);
      const next = waiting.shift();
      if (next === undefined) {
        queue.push(line);
      } else {
        next(line);
      }
      index = buffered.indexOf('\n');
    }
  });
  return async () => {
    const line = queue.shift();
    return (
      line ??
      new Promise<string>((resolve) => {
        waiting.push(resolve);
      })
    );
  };
};

/** Resolves with the child's exit code, or undefined when a signal ended it. */
const exited = async (child: ChildProcessWithoutNullStreams): Promise<number | undefined> => {
  if (child.exitCode !== null) {
    return child.exitCode;
  }
  if (child.signalCode !== null) {
    return undefined;
  }
  return new Promise((resolve) => {
    child.once('exit', (code) => {
      resolve(code ?? undefined);
    });
  });
};
const aborted = async (signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    signal.addEventListener(
      'abort',
      () => {
        resolve();
      },
      { once: true },
    );
  });

describe.runIf(enabled)('private projection D8 core-correctness gates', () => {
  const withMount = async (
    run: (mountpoint: string, owner: ReturnType<typeof createOwner>) => Promise<void>,
    prepare: (owner: ReturnType<typeof createOwner>) => void = () => undefined,
  ): Promise<void> => {
    const mountpoint = await mkdtemp(join(tmpdir(), 'tau-projection-gate-'));
    const owner = createOwner();
    prepare(owner);
    const mount = openShellProjectionMount({ binary, mountpoint, handle: owner.handle });
    try {
      await run(mountpoint, owner);
    } finally {
      await mount[Symbol.asyncDispose]();
      await rm(mountpoint, { recursive: true });
    }
  };

  it('G1 returns stored link targets verbatim and refuses new hard and symbolic links natively', async () => {
    await withMount(
      async (mountpoint, owner) => {
        expect(await readlink(join(mountpoint, 'link'))).toBe('file');
        const linkStat = await lstat(join(mountpoint, 'link'));
        expect(linkStat.isSymbolicLink()).toBe(true);
        expect(await readFile(join(mountpoint, 'link'), 'utf8')).toBe('body');
        await expect(symlink('file', join(mountpoint, 'made'))).rejects.toMatchObject({ code: 'EPERM' });
        await expect(link(join(mountpoint, 'file'), join(mountpoint, 'hard'))).rejects.toMatchObject({ code: 'EPERM' });
        expect([...owner.names.keys()].sort()).toStrictEqual(['file', 'link']);
      },
      (owner) => {
        owner.names.set('file', 2n);
        owner.names.set('link', 3n);
        owner.contents.set(2n, encoder.encode('body'));
        owner.links.set(3n, 'file');
      },
    );
  }, 15_000);

  it('G1 reports owner timestamps and block counts, and forwards requested modification times', async () => {
    const at = Date.UTC(2020, 0, 2, 3, 4, 5, 678);
    await withMount(
      async (mountpoint, owner) => {
        const before = await stat(join(mountpoint, 'file'));
        expect(before.mtimeMs).toBe(at);
        expect(before.size).toBe(1500);
        expect(before.blocks).toBe(3);
        expect(before.blksize).toBe(4096);
        const later = new Date(Date.UTC(2021, 5, 6, 7, 8, 9));
        await utimes(join(mountpoint, 'file'), later, later);
        expect(owner.requests.find((request) => request.operation === 'setattr')?.modified).toBe(later.getTime());
        const after = await stat(join(mountpoint, 'file'));
        expect(after.mtimeMs).toBe(later.getTime());
      },
      (owner) => {
        owner.names.set('file', 2n);
        owner.contents.set(2n, new Uint8Array(1500));
        owner.modified.set(2n, at);
      },
    );
  }, 15_000);

  it('G1 pages a large directory by owner cookies with every entry exactly once', async () => {
    const count = 1500;
    await withMount(
      async (mountpoint, owner) => {
        const listed = await readdir(mountpoint);
        expect(listed).toHaveLength(count);
        expect(new Set(listed).size).toBe(count);
        const pages = owner.requests.filter((request) => request.operation === 'readdir');
        expect(pages.length).toBeGreaterThan(2);
        // Every resume offset is a cookie the owner issued (a multiple of seven), never a bridge-made position.
        expect(pages.every((request) => request.offset % 7 === 0)).toBe(true);
      },
      (owner) => {
        for (let index = 0; index < count; index++) {
          owner.names.set(`entry-${String(index).padStart(5, '0')}-${'x'.repeat(40)}`, BigInt(index + 2));
        }
      },
    );
  }, 30_000);

  it('G1 answers EIO for an error-zero reply and for directory rows that are empty, dot, dot-dot or hold NUL', async () => {
    let listing: Array<Readonly<{ name: string; inode: bigint; mode: number }>> = [];
    await withMount(async (mountpoint, owner) => {
      owner.override.set('lookup', async (request) =>
        request.name === 'zero' ? { error: 0 } : { entry: { inode: 2n, mode: 0o10_0600, size: 0, links: 1 } },
      );
      await expect(stat(join(mountpoint, 'zero'))).rejects.toMatchObject({ code: 'EIO' });
      owner.override.set('readdir', async (request) => ({ entries: request.offset === 0 ? listing : [] }));
      for (const name of ['', '.', '..', 'a\0b']) {
        listing = [{ name, inode: 2n, mode: 0o10_0600 }];
        // eslint-disable-next-line no-await-in-loop -- each listing is a separate kernel request.
        await expect(readdir(mountpoint)).rejects.toMatchObject({ code: 'EIO' });
      }
      listing = [{ name: 'fine', inode: 2n, mode: 0o10_0600 }];
      expect(await readdir(mountpoint)).toStrictEqual(['fine']);
    });
  }, 15_000);

  it('G1 forwards NOREPLACE renames and refuses EXCHANGE, whiteout and combined flags natively', async () => {
    await withMount(
      async (mountpoint, owner) => {
        const child = python(
          `
import ctypes, sys
libc = ctypes.CDLL(None, use_errno=True)
root = sys.argv[1]
for source, target, flags in [("a", "b", 1), ("a", "b", 2), ("a", "c", 1), ("c", "d", 4), ("c", "d", 3)]:
    rc = libc.renameat2(-100, (root + "/" + source).encode(), -100, (root + "/" + target).encode(), flags)
    print(0 if rc == 0 else ctypes.get_errno(), flush=True)
`,
          mountpoint,
        );
        const next = lines(child);
        const results = [await next(), await next(), await next(), await next(), await next()];
        await exited(child);
        // NOREPLACE onto a name the fresh lookup finds is EEXIST; NOREPLACE onto a free name renames. EXCHANGE has no
        // classified publication, so it is EINVAL natively. WHITEOUT is EPERM from the VFS without CAP_MKNOD, else
        // EINVAL natively; NOREPLACE|EXCHANGE is EINVAL from the VFS.
        expect(results).toStrictEqual(['17', '22', '0', expect.stringMatching(/^(?:1|22)$/u), '22']);
        expect(owner.names.has('a')).toBe(false);
        expect(owner.names.get('b')).toBe(3n);
        expect(owner.names.get('c')).toBe(2n);
        expect(owner.names.has('d')).toBe(false);
        const flags = owner.requests
          .filter((request) => request.operation === 'rename')
          .map((request) => request.flags);
        expect(flags).toStrictEqual([1]);
      },
      (owner) => {
        owner.names.set('a', 2n);
        owner.names.set('b', 3n);
      },
    );
  }, 15_000);

  it.each([
    ['drops', true],
    ['without invalidation keeps', false],
  ] as const)(
    'F4 %s the shared mapping of a write the owner refused (the second row is the negative control)',
    async (_label, invalidating) => {
      await withMount(
        async (mountpoint, owner) => {
          owner.override.set('write', async (request) =>
            invalidating ? { error: 116, invalidate: [request.inode] } : { error: 116 },
          );
          const child = python(
            `
import mmap, os, sys, time
fd = os.open(sys.argv[1], os.O_RDWR)
os.pread(fd, 8, 0)
def settle(read, expected):
    deadline = time.monotonic() + 2
    value = read()
    while value != expected and time.monotonic() < deadline:
        time.sleep(0.02)
        value = read()
    return value
try:
    os.pwrite(fd, b"XYZ", 0)
    print("written", flush=True)
except OSError as error:
    print("errno %d" % error.errno, flush=True)
print(settle(lambda: os.pread(fd, 8, 0).decode(), "abcdefgh"), flush=True)
view = mmap.mmap(fd, 8, mmap.MAP_SHARED, mmap.PROT_READ | mmap.PROT_WRITE)
view[0:3] = b"QRS"
try:
    view.flush()
    print("flushed", flush=True)
except OSError as error:
    print("errno %d" % error.errno, flush=True)
print(settle(lambda: view[:8].decode(), "abcdefgh"), flush=True)
view.close()
os.close(fd)
`,
            join(mountpoint, 'file'),
          );
          const next = lines(child);
          const results = [await next(), await next(), await next(), await next()];
          expect(await exited(child)).toBe(0);
          // A refused pwrite never reaches the cache; a refused mapping writeback stays in the mapping until dropped.
          expect(results).toStrictEqual(['errno 116', 'abcdefgh', 'errno 116', invalidating ? 'abcdefgh' : 'QRSdefgh']);
          expect(decoder.decode(owner.contents.get(2n))).toBe('abcdefgh');
        },
        (owner) => {
          owner.names.set('file', 2n);
          owner.contents.set(2n, encoder.encode('abcdefgh'));
        },
      );
    },
    15_000,
  );

  it('G2 writes a shared mapping through to its inode and keeps it on that inode across a new generation', async () => {
    await withMount(
      async (mountpoint, owner) => {
        const child = python(
          `
import mmap, os, sys
path = sys.argv[1]
fd = os.open(path, os.O_RDWR)
view = mmap.mmap(fd, 8, mmap.MAP_SHARED, mmap.PROT_READ | mmap.PROT_WRITE)
view[0:3] = b"XYZ"
view.flush()
print("flushed", flush=True)
sys.stdin.readline()
view[3:4] = b"Q"
view.flush()
with open(path, "rb") as fresh:
    print(fresh.read().decode(), flush=True)
print(view[:].decode(), flush=True)
view.close()
os.close(fd)
`,
          join(mountpoint, 'file'),
        );
        const next = lines(child);
        expect(await next()).toBe('flushed');
        expect(decoder.decode(owner.contents.get(2n)).slice(0, 8)).toBe('XYZdefgh');
        // The owner publishes an incoming version as a fresh inode; the old identity is never reused.
        owner.contents.set(5n, encoder.encode('NEWVERSN'));
        owner.names.set('file', 5n);
        child.stdin.write('swap\n');
        expect(await next()).toBe('NEWVERSN');
        expect(await next()).toBe('XYZQefgh');
        expect(await exited(child)).toBe(0);
        expect(decoder.decode(owner.contents.get(2n)).slice(0, 8)).toBe('XYZQefgh');
        expect(decoder.decode(owner.contents.get(5n))).toBe('NEWVERSN');
        expect(owner.requests.some((request) => request.operation === 'write' && request.inode === 5n)).toBe(false);
      },
      (owner) => {
        owner.names.set('file', 2n);
        owner.contents.set(2n, encoder.encode('abcdefgh'));
      },
    );
  }, 15_000);

  // The owner runs in a child process: if FLUSH ever needs its thread again, uv_spawn blocks that thread while the
  // exec closes the inherited descriptor, and only the external timeout can end the test.
  const ownerProcess = (body: string, mountpoint: string): ChildProcessWithoutNullStreams => {
    const wrapper = fileURLToPath(new URL('shell-projection-native.ts', import.meta.url));
    const script = `import {openShellProjectionMount} from ${JSON.stringify(wrapper)};
import {open} from 'node:fs/promises'; import {spawn} from 'node:child_process';
const [binary, mountpoint] = process.argv.slice(1);
const handle = async (request) => {
  switch (request.operation) {
    case 'lookup': return request.name === 'file' ? {entry:{inode:2n,mode:0o100600,size:4,links:1}} : {error:2};
    case 'getattr': return {entry:{inode:request.inode,mode:request.inode===1n?0o40700:0o100600,size:4,links:1}};
    case 'open': return {handle:2n};
    case 'read': return {bytes:new TextEncoder().encode('data')};
    default: return {};
  }
};
const mount = openShellProjectionMount({binary, mountpoint, handle});
${body}`;
    return spawn(process.execPath, ['--input-type=module', '-e', script, binary, mountpoint], {
      stdio: ['pipe', 'pipe', 'pipe'],
    }) as unknown as ChildProcessWithoutNullStreams;
  };

  it('G3 spawns a child while the owner holds a close-on-exec projection descriptor', async () => {
    const mountpoint = await mkdtemp(join(tmpdir(), 'tau-projection-exec-'));
    const child = ownerProcess(
      `const held = await open(mountpoint + '/file', 'r');
const spawned = spawn('/bin/true', {stdio:'ignore'});
await new Promise((resolve, reject) => { spawned.once('exit', resolve); spawned.once('error', reject); });
process.stdout.write('spawned\\n');
await held.close(); await mount[Symbol.asyncDispose](); process.stdout.write('closed\\n');`,
      mountpoint,
    );
    const timer = setTimeout(() => child.kill('SIGKILL'), 10_000);
    try {
      const next = lines(child);
      expect(await Promise.race([next(), exited(child).then((code) => `exit ${String(code)}`)])).toBe('spawned');
      expect(await next()).toBe('closed');
      expect(await exited(child)).toBe(0);
    } finally {
      clearTimeout(timer);
      child.kill('SIGKILL');
      await exited(child);
      await rm(mountpoint, { recursive: true });
    }
  }, 20_000);

  it('G4 aborts only the interrupted request, answers it EINTR and fails its caller closed', async () => {
    const reading = Promise.withResolvers<void>();
    let reason: unknown;
    let other: AbortSignal | undefined;
    await withMount(
      async (mountpoint, owner) => {
        owner.override.set('read', async (request, signal) => {
          if (request.inode === 3n) {
            other = signal;
            return { bytes: encoder.encode('free') };
          }
          reading.resolve();
          await aborted(signal);
          reason = signal.reason;
          throw signal.reason as Error;
        });
        // Only one SIGUSR1 is ever sent, so exactly one of these clauses sees the handler's Stop: the inner one when
        // the signal lands inside the read, the outer one when the read has already failed by the time Python runs the
        // handler. Delivery is then blocked so nothing can interrupt the report itself.
        const child = python(
          `
import os, signal, sys
class Stop(Exception): pass
def stop(*_): raise Stop()
signal.signal(signal.SIGUSR1, stop)
fd = os.open(sys.argv[1], os.O_RDONLY)
print("ready", flush=True)
outcome = "none"
try:
    try:
        os.pread(fd, 1, 0)
        outcome = "read"
    except Stop:
        outcome = "interrupted"
    except OSError as error:
        outcome = "errno " + str(error.errno)
except Stop:
    outcome = outcome + " then interrupted"
signal.pthread_sigmask(signal.SIG_BLOCK, {signal.SIGUSR1})
print(outcome, flush=True)
`,
          join(mountpoint, 'blocked'),
        );
        const next0 = lines(child);
        const next = async (): Promise<string> => {
          const line = await next0();
          process.stderr.write(`[mark] STDOUT ${JSON.stringify(line)}\n`);
          return line;
        };
        expect(await next()).toBe('ready');
        await reading.promise;
        expect(await readFile(join(mountpoint, 'free'), 'utf8')).toBe('free');
        child.kill('SIGUSR1');
        // The projection's contract is per-request: the interrupt aborts only this request's handler signal, and
        // `settle` answers that request EINTR because the handler rejected without committing (the assertions below
        // prove both). What the caller then observes is a kernel property, not a projection one. The projection keeps
        // the page cache on purpose -- the F4 and G2 rows exercise shared mappings and page-cache invalidation -- so
        // this one-byte pread is served as a 4096-byte folio fill. The kernel retries a folio fill that came back
        // EINTR (a second READ of the same page and offset arrives, and is itself interrupted) and then fails the fill
        // closed, so the caller is handed EIO. Asserting EINTR at the caller would require FOPEN_DIRECT_IO, which
        // would retire the page-cache behaviour those other rows depend on. The invariant that matters here is that
        // the interrupted caller always fails and never reads.
        expect(['interrupted', 'errno 4', 'errno 4 then interrupted', 'errno 5', 'errno 5 then interrupted']).toContain(
          await next(),
        );
        expect(await exited(child)).toBe(0);
        expect((reason as Error).message).toBe('Projection request interrupted.');
        expect(other?.aborted).toBe(false);
      },
      (owner) => {
        owner.names.set('blocked', 2n);
        owner.names.set('free', 3n);
        owner.contents.set(2n, encoder.encode('slow'));
        owner.contents.set(3n, encoder.encode('free'));
      },
    );
  }, 15_000);

  it('G4 shares one disposal between concurrent closers while a request is in flight', async () => {
    const mountpoint = await mkdtemp(join(tmpdir(), 'tau-projection-dispose-'));
    const owner = createOwner();
    owner.names.set('file', 2n);
    owner.contents.set(2n, encoder.encode('slow'));
    const reading = Promise.withResolvers<void>();
    owner.override.set('read', async (_request, signal) => {
      reading.resolve();
      await aborted(signal);
      return { error: 5 };
    });
    const mount = openShellProjectionMount({ binary, mountpoint, handle: owner.handle });
    const child = python(
      `
import os, sys
fd = os.open(sys.argv[1], os.O_RDONLY)
print("ready", flush=True)
try:
    os.pread(fd, 1, 0)
    print("read", flush=True)
except OSError as error:
    print(error.errno, flush=True)
`,
      join(mountpoint, 'file'),
    );
    try {
      const next = lines(child);
      expect(await next()).toBe('ready');
      await reading.promise;
      await Promise.all([mount[Symbol.asyncDispose](), mount[Symbol.asyncDispose]()]);
      expect(mounted(mountpoint)).toBe(false);
      // The in-flight caller fails closed (EIO, ECONNABORTED or ENOTCONN once the connection is gone), never succeeds.
      expect(['5', '103', '107']).toContain(await next());
      await mount[Symbol.asyncDispose]();
    } finally {
      child.kill('SIGKILL');
      await exited(child);
      await Promise.resolve(mount[Symbol.asyncDispose]()).catch(() => undefined);
      await rm(mountpoint, { recursive: true });
    }
  }, 15_000);

  it('G4 removes the mount when its owner process dies without disposing', async () => {
    const mountpoint = await mkdtemp(join(tmpdir(), 'tau-projection-death-'));
    const child = ownerProcess(`process.stdout.write('ready\\n'); setInterval(() => undefined, 1000);`, mountpoint);
    try {
      const next = lines(child);
      expect(await next()).toBe('ready');
      expect(mounted(mountpoint)).toBe(true);
      child.kill('SIGKILL');
      await exited(child);
      const deadline = Date.now() + 5000;
      const gone = async (): Promise<void> => {
        if (mounted(mountpoint) && Date.now() < deadline) {
          await new Promise((resolve) => {
            setTimeout(resolve, 50);
          });
          return gone();
        }
      };
      await gone();
      expect(mounted(mountpoint)).toBe(false);
    } finally {
      child.kill('SIGKILL');
      if (mounted(mountpoint)) {
        await execute('fusermount3', ['-u', '-z', mountpoint]).catch(() => undefined);
      }
      await rm(mountpoint, { recursive: true });
    }
  }, 15_000);
});
