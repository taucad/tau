// @vitest-environment node
import { spawn } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, onTestFinished } from 'vitest';
import type { CheckedEntryResult, NodeFsRootScope } from '@taucad/filesystem/backend/node';
import { NodeFsAuthorityHost, serveNodeFsProvider } from '@taucad/filesystem/backend/node';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import type { CheckedFileWriteResult } from '@taucad/types';
import {
  publishShellProjectionEntry,
  publishShellProjectionFile,
  shellProjectionGrantSet,
} from '#shell/shell-projection.js';
import type { ShellProjectionEntryChange, ShellProjectionFile } from '#shell/shell-projection.js';

/** These families are about PP3 spellings, so the launch is granted its whole checkout and the registry decides. */
const wholeCheckout = shellProjectionGrantSet({ writable: [''], readOnly: [], denied: [], masked: [] });

/*
 * G5: the PP3 spelling families reach the rooted authority through a real FUSE mount. The owner below is a
 * test-only harness: an in-memory inode table whose every mutation publishes through one held root claim. It is
 * not the production owner, and nothing here activates the projection. The transport is loaded by file URL
 * because it is internal to its package.
 */
const enabled = process.env['TAU_SHELL_PROJECTION_CONFORMANCE'] === '1';
const nativeRoot = new URL('../../../core/native-process/', import.meta.url);
const binary = fileURLToPath(new URL('dist/native/linux-x64/shell-projection.node', nativeRoot));

type Request = Readonly<{
  id: number;
  operation: string;
  inode: bigint;
  destinationParent: bigint;
  offset: number;
  length: number;
  flags: number;
  attributes: number;
  name?: string;
  destinationName?: string;
  data?: Uint8Array<ArrayBuffer>;
}>;
type Entry = Readonly<{ inode: bigint; mode: number; size: number; links: number }>;
type Reply = Readonly<{
  error?: number;
  entry?: Entry;
  handle?: bigint;
  bytes?: Uint8Array<ArrayBuffer>;
  written?: number;
  entries?: ReadonlyArray<Readonly<{ name: string; inode: bigint; mode: number }>>;
}>;
type Transport = Readonly<{
  openShellProjectionMount: (
    options: Readonly<{
      binary: string;
      mountpoint: string;
      handle: (request: Request, signal: AbortSignal) => Promise<Reply>;
    }>,
  ) => AsyncDisposable;
}>;

/** How the harness reaches the authority: through the classified primitives, or (negative control) around them. */
type Publisher = Readonly<{
  file: (observation: ShellProjectionFile) => Promise<'refused' | CheckedFileWriteResult['status']>;
  entry: (change: ShellProjectionEntryChange) => Promise<'refused' | CheckedEntryResult['status']>;
}>;

const classified = (scope: NodeFsRootScope): Publisher => ({
  file: async (observation) => {
    const outcome = await publishShellProjectionFile(scope, observation, {
      grants: wholeCheckout,
      maximumBytes: 1024 * 1024,
      signal: scope.signal,
    });
    return outcome.status === 'refused' ? 'refused' : outcome.result.status;
  },
  entry: async (change) => {
    const outcome = await publishShellProjectionEntry(scope, change, {
      grants: wholeCheckout,
      signal: scope.signal,
    });
    return outcome.status === 'refused' ? 'refused' : outcome.result.status;
  },
});

/**
 * A harness that under-reports what a directory rename carries: classification must come from the claim's own
 * walk, never from the caller's list (Q11/3h C1).
 */
const forgetful = (scope: NodeFsRootScope): Publisher => {
  const honest = classified(scope);
  return {
    ...honest,
    entry: async (change) => honest.entry(change.kind === 'rename' ? { ...change, descendants: [] } : change),
  };
};

/** Negative control: the same scope with the PP3 classification removed. */
const unclassified = (scope: NodeFsRootScope): Publisher => ({
  file: async ({ path, baseline, projected }) => {
    const input = { path, preconditions: [{ path, expected: baseline }] };
    const result =
      projected === null
        ? await scope.deleteFileChecked(input)
        : await scope.writeFileChecked({ ...input, data: projected });
    return result.status;
  },
  entry: async (change) => {
    const result =
      change.kind === 'rename'
        ? await scope.renameChecked(change)
        : change.kind === 'mkdir'
          ? await scope.mkdirChecked({ path: change.path })
          : await scope.rmdirChecked({ path: change.path });
    return result.status;
  },
});

type Node = { path: string; directory: boolean; bytes: Uint8Array<ArrayBuffer> };

/** A minimal owner over never-reused inode ids. Every mutation is published before the kernel sees success. */
const createOwner = (publisher: Publisher, seed: ReadonlyArray<Readonly<{ path: string; text?: string }>>) => {
  const nodes = new Map<bigint, Node>([[1n, { path: '', directory: true, bytes: new Uint8Array(0) }]]);
  const children = new Map<string, bigint>();
  let next = 2n;
  const key = (parent: bigint, name: string): string => `${parent}/${name}`;
  const pathOf = (parent: bigint, name: string): string => {
    const base = nodes.get(parent)?.path ?? '';
    return base === '' ? name : `${base}/${name}`;
  };
  const add = (parent: bigint, name: string, node: Node): bigint => {
    const inode = next++;
    nodes.set(inode, node);
    children.set(key(parent, name), inode);
    return inode;
  };
  const entry = (inode: bigint): Entry => {
    const node = nodes.get(inode);
    return {
      inode,
      mode: node?.directory === false ? 0o10_0644 : 0o4_0755,
      size: node?.bytes.length ?? 0,
      links: 1,
    };
  };
  const parentOf = (path: string): bigint => {
    const slash = path.lastIndexOf('/');
    if (slash === -1) {
      return 1n;
    }
    const parentPath = path.slice(0, slash);
    return [...nodes.entries()].find(([, node]) => node.path === parentPath)?.[0] ?? 1n;
  };
  for (const { path, text } of seed) {
    add(parentOf(path), path.split('/').at(-1) ?? path, {
      path,
      directory: text === undefined,
      bytes: new TextEncoder().encode(text ?? ''),
    });
  }
  const refusal = (status: string, conflict: number): Reply | undefined =>
    status === 'refused' ? { error: 13 } : status === 'applied' ? undefined : { error: conflict };
  const replace = async (inode: bigint, projected: Uint8Array<ArrayBuffer>): Promise<Reply | undefined> => {
    const node = nodes.get(inode);
    if (node === undefined) {
      return { error: 2 };
    }
    const failed = refusal(await publisher.file({ path: node.path, baseline: node.bytes, projected }), 5);
    if (failed === undefined) {
      node.bytes = projected;
    }
    return failed;
  };
  const rename = async (request: Request): Promise<Reply> => {
    const inode = children.get(key(request.inode, request.name ?? ''));
    const node = inode === undefined ? undefined : nodes.get(inode);
    const destination = key(request.destinationParent, request.destinationName ?? '');
    if (inode === undefined || node === undefined) {
      return { error: 2 };
    }
    // Plain and NOREPLACE renames need an absent destination here; EXCHANGE is not part of this harness.
    if (request.flags !== 0 && request.flags !== 1) {
      return { error: 22 };
    }
    if (children.has(destination)) {
      return { error: 17 };
    }
    const to = pathOf(request.destinationParent, request.destinationName ?? '');
    const below = [...nodes.values()].filter((other) => other.path.startsWith(`${node.path}/`));
    const files = node.directory ? below.filter((other) => !other.directory) : [node];
    const failed = refusal(
      await publisher.entry({
        kind: 'rename',
        from: node.path,
        to,
        preconditions: [
          ...files.map((file) => ({ path: file.path, expected: file.bytes })),
          { path: to, expected: null },
        ],
        descendants: below.map((other) => other.path.slice(node.path.length + 1)),
      }),
      5,
    );
    if (failed !== undefined) {
      return failed;
    }
    for (const other of below) {
      other.path = `${to}${other.path.slice(node.path.length)}`;
    }
    node.path = to;
    children.delete(key(request.inode, request.name ?? ''));
    children.set(destination, inode);
    return {};
  };
  const create = async (request: Request, directory: boolean): Promise<Reply> => {
    const path = pathOf(request.inode, request.name ?? '');
    if (children.has(key(request.inode, request.name ?? ''))) {
      return { error: 17 };
    }
    const status = directory
      ? await publisher.entry({ kind: 'mkdir', path })
      : await publisher.file({ path, baseline: null, projected: new Uint8Array(0) });
    const failed = refusal(status, 17);
    if (failed !== undefined) {
      return failed;
    }
    const inode = add(request.inode, request.name ?? '', { path, directory, bytes: new Uint8Array(0) });
    return directory ? { entry: entry(inode) } : { entry: entry(inode), handle: inode };
  };
  const remove = async (request: Request): Promise<Reply> => {
    const inode = children.get(key(request.inode, request.name ?? ''));
    const node = inode === undefined ? undefined : nodes.get(inode);
    if (inode === undefined || node === undefined) {
      return { error: 2 };
    }
    const status = node.directory
      ? await publisher.entry({ kind: 'rmdir', path: node.path })
      : await publisher.file({ path: node.path, baseline: node.bytes, projected: null });
    const failed = refusal(status, 5);
    if (failed === undefined) {
      children.delete(key(request.inode, request.name ?? ''));
    }
    return failed ?? {};
  };
  const handle = async (request: Request): Promise<Reply> => {
    switch (request.operation) {
      case 'lookup': {
        const inode = children.get(key(request.inode, request.name ?? ''));
        return inode === undefined ? { error: 2 } : { entry: entry(inode) };
      }
      case 'getattr': {
        return nodes.has(request.inode) ? { entry: entry(request.inode) } : { error: 2 };
      }
      case 'setattr': {
        // FUSE_SET_ATTR_SIZE: a truncation is a publication like any write.
        if (Math.floor(request.attributes / 8) % 2 === 1) {
          const old = nodes.get(request.inode)?.bytes ?? new Uint8Array(0);
          const projected = new Uint8Array(request.offset);
          projected.set(old.subarray(0, request.offset));
          const failed = await replace(request.inode, projected);
          if (failed !== undefined) {
            return failed;
          }
        }
        return { entry: entry(request.inode) };
      }
      case 'open': {
        // The bridge negotiates atomic O_TRUNC, so the truncation arrives here rather than as a setattr.
        if (Math.floor(request.flags / 0o1000) % 2 === 1 && (nodes.get(request.inode)?.bytes.length ?? 0) > 0) {
          const failed = await replace(request.inode, new Uint8Array(0));
          if (failed !== undefined) {
            return failed;
          }
        }
        return { handle: request.inode };
      }
      case 'read': {
        const bytes = nodes.get(request.inode)?.bytes ?? new Uint8Array(0);
        return { bytes: bytes.slice(request.offset, request.offset + request.length) };
      }
      case 'write': {
        const old = nodes.get(request.inode)?.bytes ?? new Uint8Array(0);
        const projected = new Uint8Array(Math.max(old.length, request.offset + request.length));
        projected.set(old);
        projected.set(request.data ?? [], request.offset);
        return (await replace(request.inode, projected)) ?? { written: request.length };
      }
      case 'create': {
        return create(request, false);
      }
      case 'mkdir': {
        return create(request, true);
      }
      case 'unlink':
      case 'rmdir': {
        return remove(request);
      }
      case 'rename': {
        return rename(request);
      }
      case 'readdir': {
        const rows = [...children.entries()]
          .filter(([name]) => name.startsWith(`${request.inode}/`))
          .map(([name, inode]) => ({ name: name.slice(`${request.inode}/`.length), inode, mode: entry(inode).mode }));
        return { entries: rows.slice(request.offset) };
      }
      case 'release':
      case 'fsync':
      case 'forget': {
        return {};
      }
      default: {
        return { error: 38 };
      }
    }
  };
  return { handle };
};

const nfd = 'café.md';
/** Each family is one shell attempt in the mount; the shell sees only exit status. */
const families: ReadonlyArray<readonly [label: string, script: string, allowed: boolean]> = [
  ['ordinary edit, nested create', 'printf v2 > notes.md && mkdir -p docs/new && printf a > docs/new/a.md', true],
  ['agent instructions under a case alias', 'mkdir .Tau && printf i > .Tau/AGENTS.md', false],
  ['NFD user file', `printf n > ${nfd}`, true],
  ['case alias .TAU', 'mkdir .TAU && printf x > .TAU/chats', false],
  ['trailing dot .tau.', 'mkdir .tau. && printf x > .tau./runs', false],
  ['stream suffix .tau:alias', 'mkdir .tau:alias && printf x > .tau:alias/export', false],
  ['case-folded row .Tau/CHATS', 'mkdir .Tau/CHATS', false],
  ['control plane at depth vendor/.Git', 'mkdir -p vendor && mkdir vendor/.Git', false],
  ['Unicode Kelvin sign in .tau/locKfile.json', 'mkdir -p .tau && printf x > .tau/loKfile.json', false],
  ['future reserved child .TAU/not-yet-a-row', 'printf x > .TAU/not-yet-a-row', false],
  ['rename a file onto .tau./export', 'printf r > r.md && mv r.md .tau./export', false],
  ['rename a directory onto .TAU.', 'mkdir d && printf c > d/chats && mv d .TAU.', false],
  ['rename a directory with a protected child onto .tAu', 'mkdir e && printf c > e/chats && mv e .tAu', false],
  ['Unicode long s exportſ', 'mkdir exportſ && printf x > exportſ/model.step', false],
  ['rename the container alias .taU away', 'mkdir .taU && mv .taU gone', false],
  ['create the container alias .tau:x', 'mkdir .tau:x && rmdir .tau:x', false],
];
/** Paths that must never exist on the backing checkout when the classifier is in place. */
const protectedLanded = [
  '.Tau/AGENTS.md',
  '.TAU/chats',
  '.tau./runs',
  '.tau:alias/export',
  '.Tau/CHATS',
  'vendor/.Git',
  '.tau/loKfile.json',
  '.TAU/not-yet-a-row',
  '.tau./export',
  '.TAU./chats',
  '.tAu/chats',
  'exportſ',
  'gone',
];

const shell = async (cwd: string): Promise<string[]> => {
  const script = families
    .map(
      ([label, body]) =>
        `if (${body}) 2>/dev/null; then echo ${JSON.stringify(`${label}: ok`)}; else echo ${JSON.stringify(`${label}: refused`)}; fi`,
    )
    .join('\n');
  // The shell enters the mount itself: a spawn `cwd` inside the mount would make the forked child's chdir wait
  // on this process's thread, which is blocked in the spawn until that child execs.
  const child = spawn('sh', ['-c', `cd "$1" || exit 1\n${script}`, 'sh', cwd], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let output = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    output += chunk;
  });
  await new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', () => {
      resolve();
    });
  });
  return output.trim().split('\n');
};

const landed = async (root: string, path: string): Promise<boolean> => {
  try {
    await lstat(join(root, path));
    return true;
  } catch {
    return false;
  }
};

describe.runIf(enabled)('G5 PP3 spelling families through the FUSE path', () => {
  const run = async (strategy: (scope: NodeFsRootScope) => Publisher) => {
    const sandbox = await realpath(await mkdtemp(join(tmpdir(), 'tau-projection-pp3-')));
    const root = join(sandbox, 'project');
    const authority = join(sandbox, 'authority');
    const mountpoint = join(sandbox, 'mount');
    await mkdir(join(root, 'docs'), { recursive: true });
    await mkdir(authority);
    await mkdir(mountpoint);
    await writeFile(join(root, 'notes.md'), 'v1');
    const { port2 } = new MessageChannel();
    const server = serveNodeFsProvider(port2, {
      policy: tauPathPolicy,
      allowRoot: (candidate) => candidate === root,
      authority: new NodeFsAuthorityHost({ authorityDirectory: () => authority, authorityIdentity: () => root }),
    });
    const transport = (await import(new URL('src/shell/shell-projection-native.ts', nativeRoot).href)) as Transport;
    try {
      const lines = await server.run({ root }, async (scope) => {
        const owner = createOwner(strategy(scope), [{ path: 'docs' }, { path: 'notes.md', text: 'v1' }]);
        const mount = transport.openShellProjectionMount({ binary, mountpoint, handle: owner.handle });
        try {
          return await shell(mountpoint);
        } finally {
          await mount[Symbol.asyncDispose]();
        }
      });
      return { lines, root, sandbox };
    } finally {
      await server.close();
      port2.close();
    }
  };
  it('publishes ordinary edits and refuses every reserved spelling before it reaches disk', async () => {
    const { lines, root, sandbox } = await run(classified);
    onTestFinished(async () => rm(sandbox, { recursive: true, force: true }));
    expect(lines).toStrictEqual(families.map(([label, , allowed]) => `${label}: ${allowed ? 'ok' : 'refused'}`));
    expect(await readFile(join(root, 'notes.md'), 'utf8')).toBe('v2');
    expect(await readFile(join(root, 'docs/new/a.md'), 'utf8')).toBe('a');
    expect(await readFile(join(root, nfd), 'utf8')).toBe('n');
    expect(await readFile(join(root, 'r.md'), 'utf8')).toBe('r');
    expect(await readFile(join(root, 'd/chats'), 'utf8')).toBe('c');
    for (const path of protectedLanded) {
      // eslint-disable-next-line no-await-in-loop -- Each assertion names the path that leaked.
      expect({ path, landed: await landed(root, path) }).toStrictEqual({ path, landed: false });
    }
    const top = await readdir(root);
    expect(top).not.toContain('.TAU.');
    expect(top).toContain('.tau');
    /* The mkdir is what the classifier refuses, so the alias never becomes visible in the mount and never
     * reaches the checkout; the rmdir that follows fails as a consequence, not as a second refusal. */
    expect(top).not.toContain('.tau:x');
  }, 30_000);

  it('derives what a directory rename carries, so a harness that drops descendants is refused the same', async () => {
    const { lines, root, sandbox } = await run(forgetful);
    onTestFinished(async () => rm(sandbox, { recursive: true, force: true }));
    expect(lines).toStrictEqual(families.map(([label, , allowed]) => `${label}: ${allowed ? 'ok' : 'refused'}`));
    expect(await landed(root, '.tAu/chats')).toBe(false);
    expect(await readFile(join(root, 'e/chats'), 'utf8')).toBe('c');
  }, 30_000);

  it('negative control: the same owner without classification lets every family reach disk', async () => {
    const { lines, root, sandbox } = await run(unclassified);
    onTestFinished(async () => rm(sandbox, { recursive: true, force: true }));
    expect(lines).toStrictEqual(families.map(([label]) => `${label}: ok`));
    for (const path of protectedLanded) {
      // eslint-disable-next-line no-await-in-loop -- Each assertion names the path that should have leaked.
      expect({ path, landed: await landed(root, path) }).toStrictEqual({ path, landed: true });
    }
  }, 30_000);
});
