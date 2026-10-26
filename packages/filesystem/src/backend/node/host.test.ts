/**
 * The served owner's in-process root claim: `NodeFsServer.run` and its scope.
 *
 * Real `NodeFsAuthorityHost`, real OS writer lock, real files: the claim is the
 * same one wire mutations queue behind, so an editor save over a client on the
 * same server is the concurrent writer these tests race.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { NodeFsChannel, NodeFsProviderClient } from '#backend/node/client.js';
import { checkedRenameLimits, NodeFsAuthorityHost, serveNodeFsProvider } from '#backend/node/host.js';
import type { NodeFsRootScope, NodeFsServer } from '#backend/node/host.js';
import { tauPathPolicy } from '#path-registry.js';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    // oxlint-disable-next-line no-await-in-loop -- Close the authority before deleting the fixture it owns.
    await cleanup();
  }
});

type Served = {
  readonly root: string;
  /** A symbolic link to `root`, admitted too, so a refusal of it is the canonical-root check and not admission. */
  readonly alias: string;
  readonly server: NodeFsServer;
  readonly editor: NodeFsProviderClient;
  admit(value: boolean): void;
};

const serve = (options: { authority?: boolean } = {}): Served => {
  const sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'tau-node-host-')));
  const root = join(sandbox, 'root');
  const alias = join(sandbox, 'alias');
  const authorityRoot = join(sandbox, 'authority');
  mkdirSync(root);
  mkdirSync(authorityRoot);
  symlinkSync(root, alias);
  let admitted = true;
  const { port1, port2 } = new MessageChannel();
  const server = serveNodeFsProvider(port2, {
    policy: tauPathPolicy,
    allowRoot: (candidate) => admitted && (candidate === root || candidate === alias),
    ...(options.authority === false
      ? {}
      : {
          authority: new NodeFsAuthorityHost({
            authorityDirectory: () => authorityRoot,
            authorityIdentity: () => root,
          }),
        }),
  });
  const channel = new NodeFsChannel(port1);
  cleanups.push(async () => {
    channel.close();
    await server.close();
    port2.close();
    rmSync(sandbox, { recursive: true, force: true });
  });
  return {
    root,
    alias,
    server,
    editor: new NodeFsProviderClient(channel, root),
    admit: (value) => {
      admitted = value;
    },
  };
};

const text = (value: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(value);

describe('NodeFsServer.run', () => {
  it('should refuse a claim on a server composed without an authority before the operation starts', async () => {
    const { root, server } = serve({ authority: false });
    let started = false;
    await expect(
      server.run({ root }, async () => {
        started = true;
      }),
    ).rejects.toMatchObject({ code: 'AUTHORITY_CLAIM_UNSUPPORTED' });
    expect(started).toBe(false);
  });

  it('should re-decide admission per run and per scope call after the provider is cached', async () => {
    const { root, server, admit } = serve();
    writeFileSync(join(root, 'part.ts'), 'v1');
    await expect(server.run({ root }, async (scope) => scope.readFile('part.ts', 'utf8'))).resolves.toBe('v1');

    await expect(
      server.run({ root }, async (scope) => {
        admit(false);
        return scope.readFile('part.ts', 'utf8');
      }),
    ).rejects.toMatchObject({ code: 'EACCES' });
    await expect(server.run({ root }, async () => undefined)).rejects.toMatchObject({ code: 'EACCES' });
    await expect(server.run({ root: join(root, '..') }, async () => undefined)).rejects.toMatchObject({
      code: 'EACCES',
    });
  });

  it('should hold an editor save behind the claim so a snapshot cannot interleave it', async () => {
    const { root, server, editor } = serve();
    writeFileSync(join(root, 'part.ts'), 'v1');
    writeFileSync(join(root, 'other.ts'), 'other');
    let saved = false;
    let save: Promise<void> | undefined;
    const snapshot = await server.run({ root }, async (scope) => {
      const first = await scope.readFile('part.ts', 'utf8');
      save = (async () => {
        await editor.writeFile('part.ts', 'editor save');
        saved = true;
      })();
      await delay(100);
      const other = await scope.readFile('other.ts', 'utf8');
      return { first, second: await scope.readFile('part.ts', 'utf8'), other, savedDuringClaim: saved };
    });
    expect(snapshot).toEqual({ first: 'v1', second: 'v1', other: 'other', savedDuringClaim: false });
    await save;
    expect(readFileSync(join(root, 'part.ts'), 'utf8')).toBe('editor save');
  });

  it('should abort open scopes on close, wait for the operation, then refuse new runs', async () => {
    const { root, server } = serve();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let reason: unknown;
    const claim = server.run({ root }, async (scope) => {
      scope.signal.addEventListener('abort', () => {
        reason = scope.signal.reason;
      });
      entered.resolve();
      // Ignores the signal until released, so close must still wait for it.
      await release.promise;
      return 'settled';
    });
    await entered.promise;
    let closed = false;
    const closing = (async () => {
      await server.close();
      closed = true;
    })();
    await delay(50);
    expect(reason).toMatchObject({ code: 'AUTHORITY_HOST_INACTIVE' });
    expect(closed).toBe(false);
    release.resolve();
    await expect(claim).resolves.toBe('settled');
    await closing;
    expect(closed).toBe(true);
    await expect(server.run({ root }, async () => undefined)).rejects.toMatchObject({
      code: 'AUTHORITY_HOST_INACTIVE',
    });
  });

  it('should cancel a run still queued for its claim without starting it', async () => {
    const { root, server } = serve();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const holder = server.run({ root }, async () => {
      entered.resolve();
      await release.promise;
    });
    await entered.promise;
    const controller = new AbortController();
    let started = false;
    const queued = server.run({ root, signal: controller.signal }, async () => {
      started = true;
    });
    await delay(20);
    controller.abort(new Error('shell stopped'));
    await expect(queued).rejects.toThrow('shell stopped');
    release.resolve();
    await holder;
    await expect(server.run({ root }, async () => 'next')).resolves.toBe('next');
    expect(started).toBe(false);
  });

  it('should settle scope calls still in flight before the claim is released', async () => {
    const { root, server } = serve();
    writeFileSync(join(root, 'part.ts'), 'baseline');
    let writeSettled = false;
    const written = await server.run({ root }, async (scope) => {
      // async-iife: bootstrap -- deliberately not awaited: the operation settles while the write still runs.
      void (async () => {
        await scope.writeFileChecked({
          path: 'part.ts',
          data: 'drained',
          preconditions: [{ path: 'part.ts', expected: 'baseline' }],
        });
        writeSettled = true;
      })();
      return 'returned';
    });
    expect(written).toBe('returned');
    expect(writeSettled).toBe(true);
    expect(readFileSync(join(root, 'part.ts'), 'utf8')).toBe('drained');
  });

  it('should revoke a retained scope once its operation settles', async () => {
    const { root, server } = serve();
    writeFileSync(join(root, 'part.ts'), 'v1');
    const retained = await server.run({ root }, async (scope) => scope);
    await expect(retained.readFile('part.ts')).rejects.toMatchObject({ code: 'AUTHORITY_SCOPE_CLOSED' });
    await expect(
      retained.writeFileChecked({
        path: 'part.ts',
        data: 'late',
        preconditions: [{ path: 'part.ts', expected: 'v1' }],
      }),
    ).rejects.toMatchObject({ code: 'AUTHORITY_SCOPE_CLOSED' });
    await expect(retained.mkdirChecked({ path: 'late' })).rejects.toMatchObject({ code: 'AUTHORITY_SCOPE_CLOSED' });
    expect(readFileSync(join(root, 'part.ts'), 'utf8')).toBe('v1');
    expect(existsSync(join(root, 'late'))).toBe(false);
  });

  it('should reject a nested run from a live operation but not detached work after it settles', async () => {
    const { root, server } = serve();
    const settled = Promise.withResolvers<void>();
    let detached: Promise<string> | undefined;
    await server.run({ root }, async () => {
      await expect(server.run({ root }, async () => undefined)).rejects.toMatchObject({
        code: 'AUTHORITY_CLAIM_NESTED',
      });
      detached = (async () => {
        await settled.promise;
        return server.run({ root }, async () => 'detached');
      })();
    });
    settled.resolve();
    await expect(detached).resolves.toBe('detached');
  });

  it('should check a method signal before its mutation starts', async () => {
    const { root, server } = serve();
    const controller = new AbortController();
    controller.abort(new Error('publication dropped'));
    await server.run({ root }, async (scope) => {
      await expect(
        scope.writeFileChecked({
          path: 'part.ts',
          data: 'edit',
          preconditions: [{ path: 'part.ts', expected: null }],
          signal: controller.signal,
        }),
      ).rejects.toThrow('publication dropped');
      await expect(scope.mkdirChecked({ path: 'parts', signal: controller.signal })).rejects.toThrow(
        'publication dropped',
      );
    });
    expect(existsSync(join(root, 'part.ts'))).toBe(false);
    expect(existsSync(join(root, 'parts'))).toBe(false);
  });

  it('should refuse a root that is not its canonical spelling before the operation starts', async () => {
    const { alias, root, server } = serve();
    let started = false;
    await expect(
      server.run({ root: alias }, async () => {
        started = true;
      }),
    ).rejects.toMatchObject({ code: 'AUTHORITY_ROOT_NOT_CANONICAL' });
    expect(started).toBe(false);
    await expect(server.run({ root }, async () => 'canonical')).resolves.toBe('canonical');
  });

  it('should refuse close from inside its own run instead of waiting on itself', async () => {
    const { root, server } = serve();
    await expect(server.run({ root }, async () => server.close())).rejects.toMatchObject({
      code: 'AUTHORITY_CLOSE_IN_CLAIM',
    });
    // The refusal leaves the server serving; a close after the run settles still drains it.
    await expect(server.run({ root }, async () => 'still serving')).resolves.toBe('still serving');
    await server.close();
    await expect(server.run({ root }, async () => undefined)).rejects.toMatchObject({
      code: 'AUTHORITY_HOST_INACTIVE',
    });
  });

  it('should start no new mutation once the scope signal aborts while reads still answer', async () => {
    const { root, server } = serve();
    writeFileSync(join(root, 'part.ts'), 'part');
    const entered = Promise.withResolvers<NodeFsRootScope>();
    const release = Promise.withResolvers<void>();
    const claim = server.run({ root }, async (scope) => {
      entered.resolve(scope);
      await release.promise;
      const write = scope.writeFileChecked({
        path: 'late.ts',
        data: 'late',
        preconditions: [{ path: 'late.ts', expected: null }],
      });
      await expect(write).rejects.toMatchObject({ code: 'AUTHORITY_HOST_INACTIVE' });
      await expect(scope.mkdirChecked({ path: 'late' })).rejects.toMatchObject({ code: 'AUTHORITY_HOST_INACTIVE' });
      await expect(
        scope.renameChecked({
          from: 'part.ts',
          to: 'moved.ts',
          preconditions: [
            { path: 'part.ts', expected: 'part' },
            { path: 'moved.ts', expected: null },
          ],
        }),
      ).rejects.toMatchObject({ code: 'AUTHORITY_HOST_INACTIVE' });
      return scope.readFile('part.ts', 'utf8');
    });
    const scope = await entered.promise;
    const closing = server.close();
    expect(scope.signal.aborted).toBe(true);
    release.resolve();
    await expect(claim).resolves.toBe('part');
    await closing;
    expect(existsSync(join(root, 'late.ts'))).toBe(false);
    expect(existsSync(join(root, 'late'))).toBe(false);
    expect(existsSync(join(root, 'moved.ts'))).toBe(false);
  });

  it('should apply a checked replacement above the 8 MiB wire budget in-process only', async () => {
    const { root, server, editor } = serve();
    const baseline = new Uint8Array(12 * 1024 * 1024).fill(1);
    const replacement = new Uint8Array(12 * 1024 * 1024).fill(2);
    writeFileSync(join(root, 'model.step'), baseline);
    await expect(
      editor.writeFileChecked({
        path: 'model.step',
        data: replacement,
        preconditions: [{ path: 'model.step', expected: baseline }],
      }),
    ).rejects.toThrow();
    expect(readFileSync(join(root, 'model.step')).every((byte) => byte === 1)).toBe(true);
    const result = await server.run({ root }, async (scope) =>
      scope.writeFileChecked({
        path: 'model.step',
        data: replacement,
        preconditions: [{ path: 'model.step', expected: baseline }],
      }),
    );
    expect(result.status).toBe('applied');
    expect(readFileSync(join(root, 'model.step')).every((byte) => byte === 2)).toBe(true);
  });
});

describe('NodeFsRootScope checked entry operations', () => {
  const inScope = async <T>(served: Served, operation: (scope: NodeFsRootScope) => Promise<T>): Promise<T> =>
    served.server.run({ root: served.root }, operation);

  it('should apply an atomic save over the observed destination and refuse a stale one', async () => {
    const served = serve();
    const { root } = served;
    writeFileSync(join(root, '.part.ts.tmp'), 'new');
    writeFileSync(join(root, 'part.ts'), 'newer editor save');
    const stale = await inScope(served, async (scope) =>
      scope.renameChecked({
        from: '.part.ts.tmp',
        to: 'part.ts',
        preconditions: [
          { path: '.part.ts.tmp', expected: 'new' },
          { path: 'part.ts', expected: 'old' },
        ],
      }),
    );
    expect(stale).toEqual({ status: 'conflict', conflicts: [{ path: 'part.ts', actual: text('newer editor save') }] });
    expect(readFileSync(join(root, 'part.ts'), 'utf8')).toBe('newer editor save');
    expect(readFileSync(join(root, '.part.ts.tmp'), 'utf8')).toBe('new');

    const saved = await inScope(served, async (scope) =>
      scope.renameChecked({
        from: '.part.ts.tmp',
        to: 'part.ts',
        preconditions: [
          { path: '.part.ts.tmp', expected: 'new' },
          { path: 'part.ts', expected: 'newer editor save' },
        ],
      }),
    );
    expect(saved).toEqual({ status: 'applied' });
    expect(readFileSync(join(root, 'part.ts'), 'utf8')).toBe('new');
    expect(existsSync(join(root, '.part.ts.tmp'))).toBe(false);
  });

  it('should require source and destination observations', async () => {
    const served = serve();
    writeFileSync(join(served.root, 'a.ts'), 'a');
    await inScope(served, async (scope) => {
      await expect(
        scope.renameChecked({ from: 'a.ts', to: 'b.ts', preconditions: [{ path: 'a.ts', expected: 'a' }] }),
      ).rejects.toThrow(TypeError);
      await expect(
        scope.renameChecked({ from: 'a.ts', to: 'b.ts', preconditions: [{ path: 'b.ts', expected: null }] }),
      ).rejects.toThrow(TypeError);
      await expect(
        scope.renameChecked({
          from: 'a.ts',
          to: 'b.ts',
          preconditions: [
            { path: 'a.ts', expected: 'a' },
            { path: 'b.ts', expected: null },
            { path: 'b.ts', expected: 'b' },
          ],
        }),
      ).rejects.toThrow(TypeError);
    });
    expect(readFileSync(join(served.root, 'a.ts'), 'utf8')).toBe('a');
  });

  it('should move a directory only when its membership matches exactly', async () => {
    const served = serve();
    const { root } = served;
    mkdirSync(join(root, 'parts', 'nested'), { recursive: true });
    mkdirSync(join(root, 'archive'));
    writeFileSync(join(root, 'parts', 'a.ts'), 'a');
    writeFileSync(join(root, 'parts', 'nested', 'b.ts'), 'b');
    writeFileSync(join(root, 'parts', 'added-by-editor.ts'), 'unseen');
    const named = [
      { path: 'parts/a.ts', expected: 'a' },
      { path: 'parts/nested/b.ts', expected: 'b' },
      { path: 'archive/parts', expected: null },
    ];
    const conflicted = await inScope(served, async (scope) =>
      scope.renameChecked({ from: 'parts', to: 'archive/parts', preconditions: named }),
    );
    expect(conflicted).toEqual({
      status: 'conflict',
      conflicts: [{ path: 'parts/added-by-editor.ts', actual: text('unseen') }],
    });
    expect(existsSync(join(root, 'parts', 'a.ts'))).toBe(true);
    expect(existsSync(join(root, 'archive', 'parts'))).toBe(false);

    rmSync(join(root, 'parts', 'added-by-editor.ts'));
    rmSync(join(root, 'parts', 'nested', 'b.ts'));
    const missing = await inScope(served, async (scope) =>
      scope.renameChecked({ from: 'parts', to: 'archive/parts', preconditions: named }),
    );
    expect(missing).toEqual({ status: 'conflict', conflicts: [{ path: 'parts/nested/b.ts', actual: null }] });

    writeFileSync(join(root, 'parts', 'nested', 'b.ts'), 'b');
    const moved = await inScope(served, async (scope) =>
      scope.renameChecked({ from: 'parts', to: 'archive/parts', preconditions: named }),
    );
    expect(moved).toEqual({ status: 'applied' });
    expect(readFileSync(join(root, 'archive', 'parts', 'nested', 'b.ts'), 'utf8')).toBe('b');
    expect(existsSync(join(root, 'parts'))).toBe(false);
  });

  it('should refuse with EXDEV a move whose walk or bytes pass the checked rename bound', async () => {
    const served = serve();
    const { root } = served;
    mkdirSync(join(root, 'many'));
    for (let index = 0; index <= checkedRenameLimits.entries; index++) {
      writeFileSync(join(root, 'many', `f${String(index)}`), '');
    }
    const preconditions = (directory: string, names: readonly string[]) => [
      ...names.map((name) => ({ path: `${directory}/${name}`, expected: '' })),
      { path: `moved-${directory}`, expected: null },
    ];
    const everything = Array.from({ length: checkedRenameLimits.entries + 1 }, (_, index) => `f${String(index)}`);
    // Walk: more entries than the bound below the source, whatever the caller names.
    await inScope(served, async (scope) => {
      await expect(
        scope.renameChecked({ from: 'many', to: 'moved-many', preconditions: preconditions('many', []) }),
      ).rejects.toMatchObject({ code: 'EXDEV', applicationState: 'known-not-applied' });
      // Preconditions: more named paths than the bound, refused before any observation.
      await expect(
        scope.renameChecked({ from: 'many', to: 'moved-many', preconditions: preconditions('many', everything) }),
      ).rejects.toMatchObject({ code: 'EXDEV' });
    });
    expect(existsSync(join(root, 'moved-many'))).toBe(false);
    // Bytes: a sparse file past the byte bound is refused from its size, before any read.
    mkdirSync(join(root, 'large'));
    writeFileSync(join(root, 'large', 'model.step'), '');
    truncateSync(join(root, 'large', 'model.step'), checkedRenameLimits.bytes + 1);
    await inScope(served, async (scope) => {
      await expect(
        scope.renameChecked({
          from: 'large',
          to: 'moved-large',
          preconditions: preconditions('large', ['model.step']),
        }),
      ).rejects.toMatchObject({ code: 'EXDEV' });
      await expect(
        scope.renameChecked({ from: 'large', to: 'moved-large', preconditions: preconditions('large', []) }),
      ).rejects.toMatchObject({ code: 'EXDEV' });
    });
    expect(existsSync(join(root, 'moved-large'))).toBe(false);
    expect(existsSync(join(root, 'large', 'model.step'))).toBe(true);
  });

  it('should refuse a rename into its own subtree before touching disk', async () => {
    const served = serve();
    mkdirSync(join(served.root, 'parts'));
    await inScope(served, async (scope) => {
      await expect(
        scope.renameChecked({
          from: 'parts',
          to: 'parts/inner',
          preconditions: [{ path: 'parts/inner', expected: null }],
        }),
      ).rejects.toMatchObject({ code: 'EINVAL' });
    });
    expect(existsSync(join(served.root, 'parts'))).toBe(true);
  });

  it('should create exactly one directory under an existing parent', async () => {
    const served = serve();
    const { root } = served;
    mkdirSync(join(root, 'existing'));
    writeFileSync(join(root, 'file.ts'), 'file');
    await inScope(served, async (scope) => {
      await expect(scope.mkdirChecked({ path: 'existing' })).resolves.toEqual({
        status: 'conflict',
        conflicts: [{ path: 'existing', actual: 'directory' }],
      });
      await expect(scope.mkdirChecked({ path: 'missing/child' })).resolves.toEqual({
        status: 'conflict',
        conflicts: [{ path: 'missing', actual: null }],
      });
      await expect(scope.mkdirChecked({ path: 'file.ts/child' })).resolves.toEqual({
        status: 'conflict',
        conflicts: [{ path: 'file.ts', actual: text('file') }],
      });
      await expect(scope.mkdirChecked({ path: 'existing/empty' })).resolves.toEqual({ status: 'applied' });
    });
    expect(existsSync(join(root, 'existing', 'empty'))).toBe(true);
    expect(existsSync(join(root, 'missing'))).toBe(false);
  });

  it('should remove only an empty directory and report the children of a non-empty one', async () => {
    const served = serve();
    const { root } = served;
    mkdirSync(join(root, 'full', 'inner'), { recursive: true });
    writeFileSync(join(root, 'full', 'part.ts'), 'part');
    mkdirSync(join(root, 'empty'));
    await inScope(served, async (scope) => {
      const full = await scope.rmdirChecked({ path: 'full' });
      expect(full.status).toBe('conflict');
      expect(
        full.status === 'conflict' ? [...full.conflicts].sort((a, b) => a.path.localeCompare(b.path)) : [],
      ).toEqual([
        { path: 'full/inner', actual: 'directory' },
        { path: 'full/part.ts', actual: text('part') },
      ]);
      await expect(scope.rmdirChecked({ path: 'absent' })).resolves.toEqual({
        status: 'conflict',
        conflicts: [{ path: 'absent', actual: null }],
      });
      await expect(scope.rmdirChecked({ path: '' })).rejects.toMatchObject({ code: 'EINVAL' });
      await expect(scope.rmdirChecked({ path: 'empty' })).resolves.toEqual({ status: 'applied' });
    });
    expect(existsSync(join(root, 'empty'))).toBe(false);
    expect(existsSync(join(root, 'full', 'part.ts'))).toBe(true);
  });
});
