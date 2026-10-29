// @vitest-environment node
import { spawn } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, onTestFinished } from 'vitest';
import { NodeFsChannel, NodeFsProviderClient } from '@taucad/filesystem/backend';
import { NodeFsAuthorityHost, serveNodeFsProvider } from '@taucad/filesystem/backend/node';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import { openShellProjectionOwner } from '#shell/shell-projection-owner.js';
import type { ShellProjectionGrants } from '#shell/shell-projection.js';
import type {
  ShellProjectionConflict,
  ShellProjectionOwner,
  ShellProjectionOwnerReply,
  ShellProjectionOwnerRequest,
} from '#shell/shell-projection-owner.js';

/*
 * Inbound convergence, the conflict journal and quota through a real FUSE mount. The owner is the unactivated
 * module under test; the editor is an ordinary wire client of the same served authority. The transport is
 * loaded by file URL because it is internal to its package.
 */
const enabled = process.env['TAU_SHELL_PROJECTION_CONFORMANCE'] === '1';

/** Every case below but the grant-composition ones is about convergence, so the launch holds its whole checkout. */
const wholeCheckout = { writable: [''], readOnly: [], denied: [], masked: [] } as const;
const nativeRoot = new URL('../../../core/native-process/', import.meta.url);
const binary = fileURLToPath(new URL('dist/native/linux-x64/shell-projection.node', nativeRoot));

type Transport = Readonly<{
  openShellProjectionMount: (
    options: Readonly<{
      binary: string;
      mountpoint: string;
      handle: (request: ShellProjectionOwnerRequest) => Promise<ShellProjectionOwnerReply>;
    }>,
  ) => AsyncDisposable;
}>;

/** A shell stand-in that holds descriptors across steps; each command prints one line. */
const driver = `
import mmap, os, sys
fds = {}
maps = {}
def answer(work):
    try:
        print(work(), flush=True)
    except OSError as error:
        print("errno %d" % error.errno, flush=True)
def cat(path):
    with open(path, "rb") as handle:
        return handle.read().decode()
for line in sys.stdin:
    command, _, rest = line.rstrip("\\n").partition(" ")
    if command == "open":
        name, path, flags = rest.split(" ")
        answer(lambda: fds.__setitem__(name, os.open(path, os.O_RDWR if flags == "rw" else os.O_RDONLY)) or "ok")
    elif command == "read":
        answer(lambda: os.pread(fds[rest], 1 << 20, 0).decode())
    elif command == "write":
        name, _, text = rest.partition(" ")
        answer(lambda: "wrote %d" % os.pwrite(fds[name], text.encode(), 0))
    elif command == "cat":
        answer(lambda: cat(rest))
    elif command == "ls":
        answer(lambda: " ".join(sorted(os.listdir(rest))))
    elif command == "fill":
        path, _, size = rest.partition(" ")
        def fill():
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            try:
                return "wrote %d" % os.write(fd, b"x" * int(size))
            finally:
                os.close(fd)
        answer(fill)
    elif command == "map":
        name, path = rest.split(" ")
        def mapped():
            fd = os.open(path, os.O_RDWR)
            maps[name] = (fd, mmap.mmap(fd, os.fstat(fd).st_size, mmap.MAP_SHARED, mmap.PROT_READ | mmap.PROT_WRITE))
            return "ok"
        answer(mapped)
    elif command == "poke":
        name, _, text = rest.partition(" ")
        def poke():
            view = maps[name][1]
            view[0:len(text)] = text.encode()
            view.flush()
            return "flushed"
        answer(poke)
    elif command == "view":
        name, _, expected = rest.partition(" ")
        def view():
            import time
            deadline = time.monotonic() + 2
            value = maps[name][1][:].decode()
            while value != expected and time.monotonic() < deadline:
                time.sleep(0.02)
                value = maps[name][1][:].decode()
            return value
        answer(view)
    elif command == "close":
        answer(lambda: os.close(fds.pop(rest)) or "ok")
`;

const shell = (cwd: string) => {
  // The driver enters the mount itself; a spawn cwd inside it would wait on this thread while it is in the spawn.
  const child = spawn('python3', ['-I', '-c', `import os; os.chdir(${JSON.stringify(cwd)})\n${driver}`], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const waiting: Array<(line: string) => void> = [];
  let buffered = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buffered += chunk;
    let index = buffered.indexOf('\n');
    while (index !== -1) {
      waiting.shift()?.(buffered.slice(0, index));
      buffered = buffered.slice(index + 1);
      index = buffered.indexOf('\n');
    }
  });
  const ask = async (command: string): Promise<string> =>
    new Promise((resolve) => {
      waiting.push(resolve);
      child.stdin.write(`${command}\n`);
    });
  return { ask, child };
};

const sizeOf = async (path: string): Promise<number> => {
  const status = await stat(path);
  return status.size;
};

const mountOwner = async (quotaBytes: number) => {
  const sandbox = await realpath(await mkdtemp(join(tmpdir(), 'tau-projection-owner-')));
  const root = join(sandbox, 'project');
  const authority = join(sandbox, 'authority');
  const journalDirectory = join(sandbox, 'run', 'journal');
  const mountpoint = join(sandbox, 'mount');
  await mkdir(join(root, 'docs'), { recursive: true });
  await mkdir(authority);
  await mkdir(mountpoint);
  await writeFile(join(root, 'notes.md'), 'v1');
  await writeFile(join(root, 'big.bin'), Buffer.alloc(1000, 98));
  const { port1, port2 } = new MessageChannel();
  const server = serveNodeFsProvider(port2, {
    policy: tauPathPolicy,
    allowRoot: (candidate) => candidate === root,
    authority: new NodeFsAuthorityHost({ authorityDirectory: () => authority, authorityIdentity: () => root }),
  });
  const channel = new NodeFsChannel(port1);
  const editor = new NodeFsProviderClient(channel, root);
  const owner = await openShellProjectionOwner({
    run: server.run,
    root,
    grants: wholeCheckout,
    quotaBytes,
    journalDirectory,
  });
  const transport = (await import(new URL('src/shell/shell-projection-native.ts', nativeRoot).href)) as Transport;
  const mount = transport.openShellProjectionMount({ binary, mountpoint, handle: owner.handle });
  const { ask, child } = shell(mountpoint);
  onTestFinished(async () => {
    child.stdin.end();
    child.kill();
    await mount[Symbol.asyncDispose]();
    channel.close();
    await server.close();
    port2.close();
    await rm(sandbox, { recursive: true, force: true });
  });
  return { ask, editor, owner, root, journalDirectory };
};

/** Exercise the actual authority and owner on disk without loading the Linux transport. */
const withAuthorityOwner = async (
  operation: (fixture: {
    owner: ShellProjectionOwner;
    editor: NodeFsProviderClient;
    root: string;
    journalDirectory: string;
  }) => Promise<void>,
  seed?: (root: string) => Promise<void>,
  grants?: ShellProjectionGrants,
): Promise<void> => {
  const sandbox = await realpath(await mkdtemp(join(tmpdir(), 'tau-owner-authority-')));
  const root = join(sandbox, 'project');
  const authority = join(sandbox, 'authority');
  const journalDirectory = join(sandbox, 'journal');
  await mkdir(join(root, 'docs'), { recursive: true });
  await mkdir(authority);
  await writeFile(join(root, 'notes.md'), 'v1');
  await seed?.(root);
  const { port1, port2 } = new MessageChannel();
  const server = serveNodeFsProvider(port2, {
    policy: tauPathPolicy,
    allowRoot: (candidate) => candidate === root,
    authority: new NodeFsAuthorityHost({ authorityDirectory: () => authority, authorityIdentity: () => root }),
  });
  const channel = new NodeFsChannel(port1);
  try {
    const owner = await openShellProjectionOwner({
      run: server.run,
      root,
      grants: grants ?? wholeCheckout,
      quotaBytes: 1024 * 1024,
      journalDirectory,
    });
    await operation({ owner, editor: new NodeFsProviderClient(channel, root), root, journalDirectory });
  } finally {
    channel.close();
    await server.close();
    port2.close();
    await rm(sandbox, { recursive: true, force: true });
  }
};

const ownerRequest = (
  input: Pick<ShellProjectionOwnerRequest, 'operation' | 'inode'> & Partial<ShellProjectionOwnerRequest>,
): ShellProjectionOwnerRequest => ({
  destinationParent: 0n,
  lookupCount: 0n,
  offset: 0,
  length: 0,
  flags: 0,
  attributes: 0,
  ...input,
});

describe('projection owner through the real authority without FUSE', () => {
  it('should observe removed directories and a file replacing a directory', async () => {
    await withAuthorityOwner(async ({ owner, editor }) => {
      const lookup = ownerRequest({ operation: 'lookup', inode: 1n, name: 'docs' });
      const before = await owner.handle(lookup);
      expect(before.entry?.mode).toBe(0o4_0700);
      await editor.rmdir('docs');
      expect(await owner.handle(lookup)).toEqual({ error: 2 });
      await editor.writeFile('docs', 'replacement');
      const after = await owner.handle(lookup);
      expect(after.entry?.mode).toBe(0o10_0600);
      expect(after.entry?.inode).not.toBe(before.entry?.inode);
      expect(after.entry?.size).toBe(11);
    });
  });

  it('should preserve a read error without retiring the known generation', async () => {
    await withAuthorityOwner(async ({ owner, root }) => {
      const lookup = ownerRequest({ operation: 'lookup', inode: 1n, name: 'notes.md' });
      const before = await owner.handle(lookup);
      await chmod(join(root, 'notes.md'), 0);
      try {
        await expect(owner.handle(lookup)).rejects.toMatchObject({ code: 'EACCES' });
      } finally {
        await chmod(join(root, 'notes.md'), 0o600);
      }
      expect(await owner.handle(lookup)).toEqual(before);
    });
  });

  it('should charge a large checkout once per entry rather than once per entry pair', async () => {
    const entries = 1200;
    await withAuthorityOwner(
      async ({ owner, editor }) => {
        /* The accounts are carried forward, so admitting this checkout is one pass over it. Recomputing the live
         * and retired sums on every entry would make capture, and then every publication, quadratic in entries. */
        expect(owner.usage()).toEqual({ live: 2 + entries * 4, retired: 0, journal: 0, total: 2 + entries * 4 });
        const lookup = ownerRequest({ operation: 'lookup', inode: 1n, name: 'bulk/f0' });
        const before = await owner.handle(ownerRequest({ operation: 'lookup', inode: 1n, name: 'bulk' }));
        const directory = before.entry!.inode;
        const first = await owner.handle(ownerRequest({ ...lookup, inode: directory, name: 'f0' }));
        expect(first.entry?.size).toBe(4);
        // A newer authority version retires the generation the kernel still holds; both are charged, once each.
        await editor.writeFile('bulk/f0', 'wider');
        const next = await owner.handle(ownerRequest({ operation: 'lookup', inode: directory, name: 'f0' }));
        expect(next.entry?.inode).not.toBe(first.entry?.inode);
        expect(owner.usage()).toEqual({
          live: 2 + entries * 4 + 1,
          retired: 4,
          journal: 0,
          total: 2 + entries * 4 + 5,
        });
        // Forgetting the retired generation releases exactly its own bytes.
        await owner.handle(ownerRequest({ operation: 'forget', inode: first.entry!.inode, lookupCount: 1n }));
        expect(owner.usage()).toEqual({
          live: 2 + entries * 4 + 1,
          retired: 0,
          journal: 0,
          total: 2 + entries * 4 + 1,
        });
      },
      async (root) => {
        await mkdir(join(root, 'bulk'));
        for (let index = 0; index < entries; index++) {
          // eslint-disable-next-line no-await-in-loop -- The fixture is seeded one entry at a time.
          await writeFile(join(root, 'bulk', `f${index}`), 'seed');
        }
      },
    );
  });

  it('should remap every moved name without rescanning the generations for each one', async () => {
    await withAuthorityOwner(
      async ({ owner, root }) => {
        const tree = await owner.handle(ownerRequest({ operation: 'lookup', inode: 1n, name: 'tree' }));
        const parent = tree.entry!.inode;
        const leaves = await Promise.all(
          ['a.md', 'b.md'].map(async (name) =>
            owner.handle(ownerRequest({ operation: 'lookup', inode: parent, name })),
          ),
        );
        expect(
          await owner.handle(
            ownerRequest({
              operation: 'rename',
              inode: 1n,
              name: 'tree',
              destinationParent: 1n,
              destinationName: 'moved',
            }),
          ),
        ).toEqual({});
        expect(await readdir(join(root, 'moved'))).toEqual(['a.md', 'b.md']);
        // The moved generations keep their inodes under the new names, and the old names resolve to nothing.
        const moved = await owner.handle(ownerRequest({ operation: 'lookup', inode: 1n, name: 'moved' }));
        expect(moved.entry?.inode).toBe(parent);
        for (const [index, name] of ['a.md', 'b.md'].entries()) {
          // eslint-disable-next-line no-await-in-loop -- One name revalidated at a time under its own claim.
          const again = await owner.handle(ownerRequest({ operation: 'lookup', inode: parent, name }));
          expect(again.entry?.inode).toBe(leaves[index]!.entry?.inode);
        }
        expect(await owner.handle(ownerRequest({ operation: 'lookup', inode: 1n, name: 'tree' }))).toEqual({
          error: 2,
        });
      },
      async (root) => {
        await mkdir(join(root, 'tree'));
        await writeFile(join(root, 'tree', 'a.md'), 'a');
        await writeFile(join(root, 'tree', 'b.md'), 'b');
      },
    );
  });

  it('should retain both conflicting versions on disk before returning ESTALE', async () => {
    await withAuthorityOwner(async ({ owner, editor, root, journalDirectory }) => {
      const before = await owner.handle(ownerRequest({ operation: 'lookup', inode: 1n, name: 'notes.md' }));
      expect(before.entry).toBeDefined();
      const { inode } = before.entry!;
      await editor.writeFile('notes.md', 'editor');
      const data = new TextEncoder().encode('shell');
      expect(await owner.handle(ownerRequest({ operation: 'write', inode, data, length: data.length }))).toEqual({
        error: 116,
        invalidate: [inode],
      });
      expect(await readFile(join(root, 'notes.md'), 'utf8')).toBe('editor');
      expect(await readFile(join(journalDirectory, '1', 'shell'), 'utf8')).toBe('shell');
      expect(await readFile(join(journalDirectory, '1', 'authority'), 'utf8')).toBe('editor');
      expect(JSON.parse(await readFile(join(journalDirectory, '1', 'record.json'), 'utf8'))).toEqual({
        path: 'notes.md',
        shell: 'bytes',
        authority: 'bytes',
      });
    });
  });
});

describe('projection owner under its launch grant set', () => {
  it('should hide a name the grant set denies even where the registry leaves it read-write', async () => {
    await withAuthorityOwner(
      async ({ owner }) => {
        // The registry leaves both read-write; only the launch's grant set tells them apart (D8).
        expect(await owner.handle(ownerRequest({ operation: 'lookup', inode: 1n, name: 'secrets' }))).toEqual({
          error: 2,
        });
        expect(await owner.handle(ownerRequest({ operation: 'lookup', inode: 1n, name: 'notes.md' }))).toMatchObject({
          entry: { mode: 0o10_0600 },
        });
        const listing = await owner.handle(ownerRequest({ operation: 'readdir', inode: 1n }));
        expect(listing.entries?.map((row) => row.name).toSorted()).toEqual(['docs', 'notes.md']);
      },
      async (root) => {
        await mkdir(join(root, 'secrets'));
        await writeFile(join(root, 'secrets', 'key.txt'), 'secret');
      },
      { writable: [''], readOnly: [], denied: ['secrets'], masked: [] },
    );
  });

  it('should report a read-only grant root as read-only and refuse the shell write that follows', async () => {
    await withAuthorityOwner(
      async ({ owner, root }) => {
        const found = await owner.handle(ownerRequest({ operation: 'lookup', inode: 1n, name: 'docs' }));
        expect(found.entry?.mode).toBe(0o4_0500);
        const file = await owner.handle(
          ownerRequest({ operation: 'lookup', inode: found.entry!.inode, name: 'notes.md' }),
        );
        expect(file.entry?.mode).toBe(0o10_0400);
        const written = await owner.handle(
          ownerRequest({
            operation: 'write',
            inode: file.entry!.inode,
            length: 4,
            data: new TextEncoder().encode('leak'),
          }),
        );
        // EACCES, with the inode's cached pages dropped, and the authority's bytes untouched.
        expect(written).toEqual({ error: 13, invalidate: [file.entry!.inode] });
        expect(await readFile(join(root, 'docs', 'notes.md'), 'utf8')).toBe('v1');
      },
      async (root) => {
        await writeFile(join(root, 'docs', 'notes.md'), 'v1');
      },
      { writable: [''], readOnly: ['docs'], denied: [], masked: [] },
    );
  });

  it('should refuse the shell creating a name below a masked container the grant set did not grant back', async () => {
    await withAuthorityOwner(
      async ({ owner, root }) => {
        const container = await owner.handle(ownerRequest({ operation: 'lookup', inode: 1n, name: '.tau' }));
        // The container is reachable so the grants inside it are, and is never writable.
        expect(container.entry?.mode).toBe(0o4_0500);
        const parameters = await owner.handle(
          ownerRequest({ operation: 'lookup', inode: container.entry!.inode, name: 'parameters' }),
        );
        expect(parameters.entry?.mode).toBe(0o4_0700);
        // C13: the granted child inside the masked container still accepts the shell's creation.
        expect(
          await owner.handle(ownerRequest({ operation: 'create', inode: parameters.entry!.inode, name: 'part.json' })),
        ).toMatchObject({ entry: { mode: 0o10_0600 } });
        // NESTED-CANARY: the denied child inside the same granted root is absent, and stays unwritable.
        expect(
          await owner.handle(ownerRequest({ operation: 'lookup', inode: parameters.entry!.inode, name: 'private' })),
        ).toEqual({ error: 2 });
        expect(
          await owner.handle(ownerRequest({ operation: 'create', inode: container.entry!.inode, name: 'cache' })),
        ).toEqual({ error: 13, invalidate: undefined });
        expect(await readdir(join(root, '.tau', 'parameters'))).toContain('private');
        expect(await readdir(join(root, '.tau'))).not.toContain('cache');
        expect(await readFile(join(root, '.tau', 'parameters', 'private', 'canary'), 'utf8')).toBe('secret');
      },
      async (root) => {
        await mkdir(join(root, '.tau', 'parameters', 'private'), { recursive: true });
        await writeFile(join(root, '.tau', 'parameters', 'private', 'canary'), 'secret');
      },
      {
        writable: ['', '.tau/parameters'],
        readOnly: [],
        denied: ['.tau/parameters/private'],
        masked: ['.tau'],
      },
    );
  });

  it('should refuse to open at all on a grant root that is not a canonical root-relative path', async () => {
    await expect(
      withAuthorityOwner(async () => expect.unreachable('the owner must not open'), undefined, {
        writable: ['/etc'],
        readOnly: [],
        denied: [],
        masked: [],
      }),
    ).rejects.toThrow();
  });
});

describe.runIf(enabled)('projection owner through the FUSE path', () => {
  it('should preserve an authority read failure rather than report the file as absent', async () => {
    const { owner, root, ask } = await mountOwner(1024 * 1024);
    await chmod(join(root, 'notes.md'), 0);
    try {
      await expect(
        owner.handle({
          operation: 'lookup',
          inode: 1n,
          destinationParent: 0n,
          lookupCount: 0n,
          offset: 0,
          length: 0,
          flags: 0,
          attributes: 0,
          name: 'notes.md',
        }),
      ).rejects.toMatchObject({ code: 'EACCES' });
    } finally {
      await chmod(join(root, 'notes.md'), 0o600);
    }
    expect(await ask('cat notes.md')).toBe('v1');
  }, 30_000);

  it('should retire deleted directory names and replace directory generations with editor files', async () => {
    const { ask, editor } = await mountOwner(1024 * 1024);
    expect(await ask('ls docs')).toBe('');
    await editor.rmdir('docs');
    const listing = await ask('ls .');
    expect(listing.split(' ')).not.toContain('docs');
    await editor.writeFile('docs', 'replacement file');
    expect(await ask('cat docs')).toBe('replacement file');
  }, 30_000);

  it('converges editor saves as new generations while open descriptors keep theirs', async () => {
    const { ask, editor } = await mountOwner(1024 * 1024);
    expect(await ask('open held notes.md ro')).toBe('ok');
    expect(await ask('read held')).toBe('v1');
    await editor.writeFile('notes.md', 'v2 from the editor');
    expect(await ask('cat notes.md')).toBe('v2 from the editor');
    // The old descriptor's generation is never overwritten by inbound bytes.
    expect(await ask('read held')).toBe('v1');
    await editor.writeFile('docs/fresh.md', 'new');
    expect(await ask('ls docs')).toBe('fresh.md');
    expect(await ask('cat docs/fresh.md')).toBe('new');
    await editor.unlink('docs/fresh.md');
    expect(await ask('cat docs/fresh.md')).toBe('errno 2');
  }, 30_000);

  it('journals shell and authority bytes on a stale write, answers ESTALE and never retries', async () => {
    const { ask, editor, owner, root, journalDirectory } = await mountOwner(1024 * 1024);
    // A descriptor whose baseline the editor then moves past.
    expect(await ask('open stale notes.md rw')).toBe('ok');
    await editor.writeFile('notes.md', 'v2 from the editor');
    expect(await ask('write stale shell bytes')).toBe('errno 116');
    expect(await readFile(join(root, 'notes.md'), 'utf8')).toBe('v2 from the editor');
    // A descriptor whose generation a later lookup replaced.
    expect(await ask('open late notes.md rw')).toBe('ok');
    await editor.writeFile('notes.md', 'v3 from the editor');
    expect(await ask('cat notes.md')).toBe('v3 from the editor');
    expect(await ask('write late late shell')).toBe('errno 116');
    expect(await readFile(join(root, 'notes.md'), 'utf8')).toBe('v3 from the editor');
    const decode = (bytes: ShellProjectionConflict['shell'] | 'directory'): string | undefined =>
      bytes === null || bytes === 'directory' ? undefined : new TextDecoder().decode(bytes);
    expect(owner.conflicts().map((item) => [item.path, decode(item.shell), decode(item.authority)])).toStrictEqual([
      ['notes.md', 'shell bytes', 'v2 from the editor'],
      // The replaced generation held 'v2 from the editor'; the shell overwrote its first ten bytes.
      ['notes.md', 'late shelle editor', 'v3 from the editor'],
    ]);
    const records = await readdir(journalDirectory);
    expect(records.sort((left, right) => left.localeCompare(right))).toStrictEqual(['1', '2']);
    expect(await readFile(join(journalDirectory, '1', 'shell'), 'utf8')).toBe('shell bytes');
    expect(await readFile(join(journalDirectory, '1', 'authority'), 'utf8')).toBe('v2 from the editor');
    const journalStatus = await stat(journalDirectory);
    expect(journalStatus.mode % 0o1000).toBe(0o700);
    // A fresh descriptor on the current generation still publishes normally.
    expect(await ask('open fresh notes.md rw')).toBe('ok');
    expect(await ask('write fresh shell v4')).toBe('wrote 8');
    expect(await readFile(join(root, 'notes.md'), 'utf8')).toBe('shell v4the editor');
  }, 30_000);

  it('drops a mapping whose writeback lost to an editor save, journals it and keeps the editor bytes', async () => {
    const { ask, editor, owner, root } = await mountOwner(1024 * 1024);
    expect(await ask('map held notes.md')).toBe('ok');
    await editor.writeFile('notes.md', 'v2 from the editor');
    // The mapping's generation is superseded: its writeback is a conflict, and the rejected page is dropped.
    expect(await ask('poke held XY')).toBe('errno 116');
    expect(await ask('view held v1')).toBe('v1');
    expect(await readFile(join(root, 'notes.md'), 'utf8')).toBe('v2 from the editor');
    expect(owner.conflicts().map((item) => item.path)).toStrictEqual(['notes.md']);
    expect(await ask('cat notes.md')).toBe('v2 from the editor');
  }, 30_000);

  it('charges retired generations and refuses growth past the quota with ENOSPC before it reaches disk', async () => {
    const { ask, editor, owner, root } = await mountOwner(3000);
    expect(owner.usage()).toMatchObject({ live: 1002, retired: 0, journal: 0 });
    expect(await ask('open old big.bin ro')).toBe('ok');
    await editor.writeFile('big.bin', Buffer.alloc(1000, 99));
    expect(await ask('cat big.bin')).toBe('c'.repeat(1000));
    // The replaced generation is still open, so both copies count.
    expect(owner.usage()).toMatchObject({ live: 1002, retired: 1000 });
    expect(await ask('fill extra.bin 1500')).toBe('errno 28');
    expect(await sizeOf(join(root, 'extra.bin'))).toBe(0);
    expect(await ask('fill extra.bin 900')).toBe('wrote 900');
    expect(owner.usage().total).toBeLessThanOrEqual(3000);
    expect(await ask('fill extra.bin 1200')).toBe('errno 28');
    expect(await sizeOf(join(root, 'extra.bin'))).toBe(0);
  }, 30_000);
});
