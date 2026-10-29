import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { NodeFsChannel, NodeFsProviderClient } from '@taucad/filesystem/backend';
import { NodeFsAuthorityHost, serveNodeFsProvider } from '@taucad/filesystem/backend/node';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import { publishShellProjectionEntry, publishShellProjectionFile } from '#shell/shell-projection.js';
import type { ShellProjectionEntryChange, ShellProjectionFile } from '#shell/shell-projection.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    // oxlint-disable-next-line no-await-in-loop -- Close authority before deleting its owned fixture.
    await cleanup();
  }
});

/**
 * One served checkout. Publication goes only through the server's held root claim; the wire client
 * stands in for a concurrent editor and for test setup, never for the projection owner (PO-Q5).
 */
const connect = () => {
  const sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'tau-shell-projection-')));
  const root = join(sandbox, 'project');
  const authorityRoot = join(sandbox, 'authority');
  mkdirSync(root);
  mkdirSync(authorityRoot);
  const { port1, port2 } = new MessageChannel();
  const server = serveNodeFsProvider(port2, {
    policy: tauPathPolicy,
    allowRoot: (candidate) => candidate === root,
    authority: new NodeFsAuthorityHost({ authorityDirectory: () => authorityRoot, authorityIdentity: () => root }),
  });
  const channel = new NodeFsChannel(port1);
  const editor = new NodeFsProviderClient(channel, root);
  cleanups.push(async () => {
    channel.close();
    await server.close();
    port2.close();
    rmSync(sandbox, { recursive: true, force: true });
  });
  const publish = async (
    observation: ShellProjectionFile,
    options: Readonly<{ maximumBytes?: number; signal?: AbortSignal }> = {},
  ) => {
    const signal = options.signal ?? new AbortController().signal;
    return server.run({ root, signal }, async (scope) =>
      publishShellProjectionFile(scope, observation, {
        maximumBytes: options.maximumBytes ?? 1024,
        signal: AbortSignal.any([signal, scope.signal]),
      }),
    );
  };
  const publishEntry = async (change: ShellProjectionEntryChange) =>
    server.run({ root }, async (scope) => publishShellProjectionEntry(scope, change, { signal: scope.signal }));
  return { editor, publish, publishEntry, root, server };
};

describe('shell projection outbound publication', () => {
  it('should allow only one concurrent publication against the same baseline', async () => {
    const { editor, publish } = connect();
    await editor.writeFile('part.ts', 'baseline');
    const results = await Promise.all(
      ['first', 'second'].map(async (projected) => publish({ path: 'part.ts', baseline: 'baseline', projected })),
    );
    expect(
      results
        .map((result) => (result.status === 'settled' ? result.result.status : result.status))
        .sort((left, right) => left.localeCompare(right)),
    ).toEqual(['applied', 'conflict']);
    expect(['first', 'second']).toContain(await editor.readFile('part.ts', 'utf8'));
  });

  it('should let the rooted authority refuse an authored-looking symlink into protected records', async () => {
    const { publish, root } = connect();
    mkdirSync(join(root, '.git'));
    writeFileSync(join(root, '.git', 'config'), 'protected');
    symlinkSync(join(root, '.git', 'config'), join(root, 'part.ts'));
    await expect(publish({ path: 'part.ts', baseline: 'protected', projected: 'edit' })).rejects.toMatchObject({
      code: 'ELOOP',
    });
    expect(readFileSync(join(root, '.git', 'config'), 'utf8')).toBe('protected');
  });

  it('should publish authored creation and deletion through the held root claim', async () => {
    const { editor, publish } = connect();
    const created = await publish({ path: '.tau/parameters/part.json', baseline: null, projected: '{}' });
    expect(created).toMatchObject({ status: 'settled', result: { status: 'applied' } });
    expect(await editor.readFile('.tau/parameters/part.json', 'utf8')).toBe('{}');
    const removed = await publish({ path: '.tau/parameters/part.json', baseline: '{}', projected: null });
    expect(removed).toMatchObject({ status: 'settled', result: { status: 'applied' } });
    expect(await editor.exists('.tau/parameters/part.json')).toBe(false);
  });

  it.each(['shell edit', null])('should preserve a newer editor save against projected %s', async (projected) => {
    const { editor, publish, root } = connect();
    await editor.writeFile('part.ts', 'baseline');
    await editor.writeFile('part.ts', 'newer editor save');
    const result = await publish({ path: 'part.ts', baseline: 'baseline', projected });
    expect(result).toMatchObject({
      status: 'settled',
      observation: { baseline: 'baseline', projected },
      result: { status: 'conflict' },
    });
    expect(readFileSync(join(root, 'part.ts'), 'utf8')).toBe('newer editor save');
  });

  it.each([
    '.TAU/unknown',
    '.tau./unknown',
    '.tau:alias/unknown',
    '.git/config',
    '.tau/chats/item.json',
    'exportſ/model.step',
  ])('should refuse protected spelling %s before it reaches backing storage', async (path) => {
    const { publish, root } = connect();
    expect(await publish({ path, baseline: null, projected: 'secret' })).toEqual({
      status: 'refused',
      reason: 'protected-path',
    });
    expect(existsSync(join(root, path))).toBe(false);
  });

  it.each([
    '.TAU/chats',
    '.tau./runs',
    '.tau:alias/export',
    'vendor/.Git',
    '.tau/lo\u212Afile.json',
    '.TAU/future',
    '.tau/chatſ',
  ])('should refuse creating protected directory spelling %s', async (path) => {
    const { editor, publishEntry, root } = connect();
    await editor.mkdir(path.split('/').slice(0, -1).join('/') || '.', { recursive: true });
    expect(await publishEntry({ kind: 'mkdir', path })).toEqual({ status: 'refused', reason: 'protected-path' });
    expect(existsSync(join(root, path))).toBe(false);
  });

  it('should refuse a rename whose destination or moved descendant folds onto a reserved path', async () => {
    const { editor, publishEntry, root } = connect();
    await editor.writeFile('notes.md', 'n');
    await editor.writeFile('d/chats', 'c');
    const file = { kind: 'rename', from: 'notes.md', to: '.tau./runs', descendants: [] } as const;
    const preconditions = [
      { path: 'notes.md', expected: 'n' },
      { path: '.tau./runs', expected: null },
    ];
    expect(await publishEntry({ ...file, preconditions })).toEqual({ status: 'refused', reason: 'protected-path' });
    // `.TAU.` itself is an ordinary name; only the child it would carry, `.TAU./chats`, folds onto a reserved row.
    const directory = {
      kind: 'rename',
      from: 'd',
      to: '.TAU.',
      descendants: ['chats'],
      preconditions: [
        { path: 'd/chats', expected: 'c' },
        { path: '.TAU.', expected: null },
      ],
    } as const;
    expect(await publishEntry(directory)).toEqual({ status: 'refused', reason: 'protected-path' });
    expect(readFileSync(join(root, 'notes.md'), 'utf8')).toBe('n');
    expect(readFileSync(join(root, 'd/chats'), 'utf8')).toBe('c');
  });

  it('should derive rename descendants under the claim and refuse a list that does not match them', async () => {
    const { editor, publishEntry, root } = connect();
    await editor.writeFile('d/chats', 'c');
    await editor.writeFile('d/notes/a.md', 'a');
    const preconditions = (to: string) => [
      { path: 'd/chats', expected: 'c' },
      { path: 'd/notes/a.md', expected: 'a' },
      { path: to, expected: null },
    ];
    // The caller's empty list would have let `d/chats` land on the `.Tau/chats` row unclassified.
    expect(
      await publishEntry({
        kind: 'rename',
        from: 'd',
        to: '.Tau',
        preconditions: preconditions('.Tau'),
        descendants: [],
      }),
    ).toEqual({ status: 'refused', reason: 'protected-path' });
    expect(existsSync(join(root, '.Tau'))).toBe(false);
    const move = { kind: 'rename', from: 'd', to: 'archive', preconditions: preconditions('archive') } as const;
    for (const descendants of [[], ['notes', 'notes/a.md'], ['chats', 'notes', 'notes/a.md', 'extra']]) {
      // eslint-disable-next-line no-await-in-loop -- each list is one held claim.
      expect(await publishEntry({ ...move, descendants })).toEqual({
        status: 'refused',
        reason: 'descendant-mismatch',
      });
    }
    expect(readFileSync(join(root, 'd/chats'), 'utf8')).toBe('c');
    expect(existsSync(join(root, 'archive'))).toBe(false);
    // The derived set, in any order, admits the move.
    expect(await publishEntry({ ...move, descendants: ['notes/a.md', 'chats', 'notes'] })).toEqual({
      status: 'settled',
      result: { status: 'applied' },
    });
    expect(readFileSync(join(root, 'archive/notes/a.md'), 'utf8')).toBe('a');
  });

  it.each([
    { container: '.tau', canonical: true },
    { container: '.Tau', canonical: false },
    { container: '.TAU.', canonical: false },
    { container: '.tau:alias', canonical: false },
  ])(
    'should create container spelling $container only when canonical, and never rename or remove it',
    async ({ container, canonical }) => {
      const { editor, publishEntry, root } = connect();
      /* A folded alias is a second name for the one reserved container: admitting it would leave a real second
       * directory in the checkout on any case-sensitive filesystem, and nothing authored ever needs one. */
      expect(await publishEntry({ kind: 'mkdir', path: container })).toEqual(
        canonical
          ? { status: 'settled', result: { status: 'applied' } }
          : { status: 'refused', reason: 'protected-path' },
      );
      expect(existsSync(join(root, container))).toBe(canonical);
      const away = {
        kind: 'rename',
        from: container,
        to: 'elsewhere',
        descendants: [],
        preconditions: [{ path: 'elsewhere', expected: null }],
      } as const;
      expect(await publishEntry(away)).toEqual({ status: 'refused', reason: 'protected-path' });
      expect(await publishEntry({ kind: 'rmdir', path: container })).toEqual({
        status: 'refused',
        reason: 'protected-path',
      });
      await editor.mkdir('empty');
      const onto = {
        kind: 'rename',
        from: 'empty',
        to: container,
        descendants: [],
        preconditions: [{ path: container, expected: null }],
      } as const;
      expect(await publishEntry(onto)).toEqual({ status: 'refused', reason: 'protected-path' });
      expect(existsSync(join(root, 'empty'))).toBe(true);
      expect(existsSync(join(root, 'elsewhere'))).toBe(false);
    },
  );

  it('should publish ordinary directory creation, rename and removal through the held claim', async () => {
    const { editor, publishEntry, root } = connect();
    await editor.writeFile('a.md', 'a');
    expect(await publishEntry({ kind: 'mkdir', path: 'docs' })).toEqual({
      status: 'settled',
      result: { status: 'applied' },
    });
    const preconditions = [
      { path: 'a.md', expected: 'a' },
      { path: 'docs/a.md', expected: null },
    ];
    expect(
      await publishEntry({ kind: 'rename', from: 'a.md', to: 'docs/a.md', descendants: [], preconditions }),
    ).toEqual({ status: 'settled', result: { status: 'applied' } });
    expect(readFileSync(join(root, 'docs/a.md'), 'utf8')).toBe('a');
    expect(await publishEntry({ kind: 'mkdir', path: 'empty' })).toMatchObject({ status: 'settled' });
    expect(await publishEntry({ kind: 'rmdir', path: 'empty' })).toMatchObject({ result: { status: 'applied' } });
    expect(existsSync(join(root, 'empty'))).toBe(false);
  });

  it.each([
    { entries: 4096, reason: 'descendant-mismatch' },
    { entries: 4097, reason: 'size-limit' },
  ])('should refuse a rename of $entries entries with $reason, never a truncated move', async ({ entries, reason }) => {
    const { publishEntry, root } = connect();
    mkdirSync(join(root, 'big'));
    for (let index = 0; index < entries; index++) {
      writeFileSync(join(root, 'big', `f${index}`), 'x');
    }
    /* The bound is a refusal, not a cut: one entry past it the walk reports `size-limit` without naming an entry,
     * and exactly at it the walk still completes and the caller's empty claim is what refuses the move. */
    expect(
      await publishEntry({
        kind: 'rename',
        from: 'big',
        to: 'archive',
        descendants: [],
        preconditions: [{ path: 'archive', expected: null }],
      }),
    ).toEqual({ status: 'refused', reason });
    expect(readdirSync(join(root, 'big')).length).toBe(entries);
    expect(existsSync(join(root, 'archive'))).toBe(false);
  });

  it('should publish a rename of many entries in one walk of the held claim', async () => {
    const { publishEntry, root } = connect();
    const entries = 500;
    mkdirSync(join(root, 'big', 'nested'), { recursive: true });
    const descendants = ['nested'];
    for (let index = 0; index < entries; index++) {
      const relative = index % 2 === 0 ? `f${index}` : `nested/f${index}`;
      writeFileSync(join(root, 'big', relative), 'x');
      descendants.push(relative);
    }
    expect(
      await publishEntry({
        kind: 'rename',
        from: 'big',
        to: 'archive',
        descendants,
        preconditions: [
          ...descendants
            .filter((entry) => entry !== 'nested')
            .map((entry) => ({ path: `big/${entry}`, expected: 'x' })),
          { path: 'archive', expected: null },
        ],
      }),
    ).toEqual({ status: 'settled', result: { status: 'applied' } });
    expect(readFileSync(join(root, 'archive/nested/f1'), 'utf8')).toBe('x');
    expect(existsSync(join(root, 'big'))).toBe(false);
  });

  it.each([
    { kind: 'mkdir', path: '.TAU' },
    { kind: 'rmdir', path: '.tau' },
  ] as const)('should leave the authority untouched when $kind $path is refused', async (change) => {
    const { root, server } = connect();
    mkdirSync(join(root, '.tau'));
    mkdirSync(join(root, 'd', 'chats'), { recursive: true });
    const calls: string[] = [];
    const outcome = await server.run({ root }, async (scope) => {
      const recorded = {
        readdir: scope.readdir.bind(scope),
        stat: scope.stat.bind(scope),
        mkdirChecked: async (input: Parameters<typeof scope.mkdirChecked>[0]) => {
          calls.push('mkdirChecked');
          return scope.mkdirChecked(input);
        },
        rmdirChecked: async (input: Parameters<typeof scope.rmdirChecked>[0]) => {
          calls.push('rmdirChecked');
          return scope.rmdirChecked(input);
        },
        renameChecked: async (input: Parameters<typeof scope.renameChecked>[0]) => {
          calls.push('renameChecked');
          return scope.renameChecked(input);
        },
      };
      const refusals = [
        await publishShellProjectionEntry(recorded, change, { signal: scope.signal }),
        // A moved descendant that folds onto a reserved row refuses the whole move before any rename is attempted.
        await publishShellProjectionEntry(
          recorded,
          {
            kind: 'rename',
            from: 'd',
            to: '.TAU.',
            descendants: ['chats'],
            preconditions: [{ path: '.TAU.', expected: null }],
          },
          { signal: scope.signal },
        ),
      ];
      return refusals;
    });
    expect(outcome).toEqual([
      { status: 'refused', reason: 'protected-path' },
      { status: 'refused', reason: 'protected-path' },
    ]);
    // Fail-closed: a refusal is decided before the authority is asked, so no partial entry can be left behind.
    expect(calls).toEqual([]);
    expect(existsSync(join(root, '.TAU'))).toBe(false);
    expect(existsSync(join(root, '.tau'))).toBe(true);
    expect(existsSync(join(root, '.TAU.'))).toBe(false);
    expect(existsSync(join(root, 'd/chats'))).toBe(true);
  });

  it('should reject a noncanonical entry path and a cancelled entry publication', async () => {
    const { server, root } = connect();
    await server.run({ root }, async (scope) => {
      await expect(
        publishShellProjectionEntry(scope, { kind: 'mkdir', path: '' }, { signal: scope.signal }),
      ).rejects.toThrow(TypeError);
      await expect(
        publishShellProjectionEntry(scope, { kind: 'mkdir', path: 'x' }, { signal: AbortSignal.abort() }),
      ).rejects.toThrow();
    });
  });

  it('should reject a publication above the per-root bound without changing backing bytes', async () => {
    const { publish, root } = connect();
    writeFileSync(join(root, 'part.ts'), 'baseline');
    expect(
      await publish({ path: 'part.ts', baseline: 'baseline', projected: 'large shell edit' }, { maximumBytes: 8 }),
    ).toEqual({ status: 'refused', reason: 'size-limit' });
    expect(readFileSync(join(root, 'part.ts'), 'utf8')).toBe('baseline');
  });

  it('should publish a replacement above the 8 MiB wire budget inside the per-root bound', async () => {
    const { publish, root } = connect();
    const baseline = new Uint8Array(12 * 1024 * 1024).fill(1);
    writeFileSync(join(root, 'model.step'), baseline);
    const projected = new Uint8Array(12 * 1024 * 1024).fill(2);
    expect(
      await publish({ path: 'model.step', baseline, projected }, { maximumBytes: 64 * 1024 * 1024 }),
    ).toMatchObject({ status: 'settled', result: { status: 'applied' } });
    expect(readFileSync(join(root, 'model.step')).every((byte) => byte === 2)).toBe(true);
  });

  it('should copy captured bytes before an asynchronous authority mutation', async () => {
    const { editor, root, server } = connect();
    const projected = new TextEncoder().encode('captured');
    const result = await server.run({ root }, async (scope) => {
      const publication = publishShellProjectionFile(
        scope,
        { path: 'part.ts', baseline: null, projected },
        { maximumBytes: 1024, signal: scope.signal },
      );
      projected.fill(0);
      return publication;
    });
    expect(result).toMatchObject({ status: 'settled', result: { status: 'applied' } });
    expect(await editor.readFile('part.ts', 'utf8')).toBe('captured');
  });

  it('should reject noncanonical paths and cancelled publication', async () => {
    const { editor, publish } = connect();
    await expect(publish({ path: '../other/part.ts', baseline: null, projected: 'edit' })).rejects.toMatchObject({
      code: 'PATH_OUTSIDE_ROOT',
    });
    const controller = new AbortController();
    controller.abort(new Error('checkout closed'));
    await expect(
      publish({ path: 'part.ts', baseline: null, projected: 'edit' }, { signal: controller.signal }),
    ).rejects.toThrow('checkout closed');
    expect(await editor.exists('part.ts')).toBe(false);
  });

  it('should stop publishing when the served owner closes', async () => {
    const { publish, server } = connect();
    await server.close();
    await expect(publish({ path: 'part.ts', baseline: null, projected: 'edit' })).rejects.toMatchObject({
      code: 'AUTHORITY_HOST_INACTIVE',
    });
  });
});

describe('shell projection activation boundary', () => {
  const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
  const sources = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return sources(path);
      }
      return /\.tsx?$/u.test(entry.name) && !/\.test(?:-d)?\.tsx?$/u.test(entry.name) ? [path] : [];
    });

  it('should take only the held scope and import no wire client (PO-Q5)', () => {
    const source = readFileSync(join(sourceRoot, 'shell', 'shell-projection.ts'), 'utf8');
    const imports = [...source.matchAll(/^import\s[^;]*?from\s+'([^']+)';/gmu)].map((match) => match[0]);
    expect(imports.filter((line) => !line.startsWith('import type'))).toEqual([
      "import { classify, reservedTauDirectory } from '@taucad/filesystem/path-registry';",
      "import { assertRootedPath } from '@taucad/utils/path';",
    ]);
    expect(source).not.toMatch(/NodeFsProviderClient|NodeFsChannel|@taucad\/filesystem\/backend'/u);
  });

  it('should stay unactivated: no production module imports the projection or its owner', () => {
    const projection = [join('shell', 'shell-projection.ts'), join('shell', 'shell-projection-owner.ts')];
    const importers = sources(sourceRoot).filter(
      (path) =>
        !projection.some((module) => path.endsWith(module)) &&
        /shell\/shell-projection(?:-owner)?(?:\.js)?'/u.test(readFileSync(path, 'utf8')),
    );
    expect(importers).toEqual([]);
    // The owner reaches the authority only through the held scope, never through a wire client (PO-Q5).
    expect(readFileSync(join(sourceRoot, 'shell', 'shell-projection-owner.ts'), 'utf8')).not.toMatch(
      /NodeFsProviderClient|NodeFsChannel|@taucad\/filesystem\/backend'/u,
    );
  });
});
