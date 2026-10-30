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
import {
  publishShellProjectionEntry,
  publishShellProjectionFile,
  shellProjectionAccess,
  shellProjectionGrantSet,
} from '#shell/shell-projection.js';
import type {
  ShellProjectionEntryChange,
  ShellProjectionFile,
  ShellProjectionGrants,
} from '#shell/shell-projection.js';

/**
 * The grant set of a launch that was granted its whole checkout and nothing else: the registry alone then decides,
 * which is what every publication case below that is not about grants expects.
 */
const wholeCheckout: ShellProjectionGrants = { writable: [''], readOnly: [], denied: [], masked: [] };
const granted = (grants: ShellProjectionGrants = wholeCheckout) => shellProjectionGrantSet(grants);

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
    options: Readonly<{ maximumBytes?: number; signal?: AbortSignal; grants?: ShellProjectionGrants }> = {},
  ) => {
    const signal = options.signal ?? new AbortController().signal;
    return server.run({ root, signal }, async (scope) =>
      publishShellProjectionFile(scope, observation, {
        grants: granted(options.grants),
        maximumBytes: options.maximumBytes ?? 1024,
        signal: AbortSignal.any([signal, scope.signal]),
      }),
    );
  };
  const publishEntry = async (change: ShellProjectionEntryChange, grants?: ShellProjectionGrants) =>
    server.run({ root }, async (scope) =>
      publishShellProjectionEntry(scope, change, { grants: granted(grants), signal: scope.signal }),
    );
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
        await publishShellProjectionEntry(recorded, change, { grants: granted(), signal: scope.signal }),
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
          { grants: granted(), signal: scope.signal },
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
        publishShellProjectionEntry(scope, { kind: 'mkdir', path: '' }, { grants: granted(), signal: scope.signal }),
      ).rejects.toThrow(TypeError);
      await expect(
        publishShellProjectionEntry(
          scope,
          { kind: 'mkdir', path: 'x' },
          { grants: granted(), signal: AbortSignal.abort() },
        ),
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
        { grants: granted(), maximumBytes: 1024, signal: scope.signal },
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

describe('shell projection grant composition', () => {
  /* The shape a launch over an admitted checkout actually has (D8): the checkout writable, its reserved container
   * masked, the authored children inside it granted back one by one, and its control state denied. Bound over a
   * checkout by the registry alone, the projection widened all of this. */
  const launch: ShellProjectionGrants = {
    writable: ['', '.tau/parameters', '.tau/AGENTS.md'],
    readOnly: ['.tau/chats'],
    denied: ['.tau/parameters/private', 'vendor/.git'],
    masked: ['.tau'],
  };

  it('should refuse every path when the launch grant set is unknown', () => {
    for (const path of ['part.ts', '.tau/parameters/part.json', '']) {
      expect(shellProjectionAccess(undefined, path)).toBe('denied');
    }
  });

  it('should deny a path that no grant root covers rather than fall back to the registry', () => {
    const narrow = granted({ writable: ['src'], readOnly: [], denied: [], masked: [] });
    // The registry leaves both read-write; only the grant set tells them apart.
    expect(tauPathPolicy.classify('src/part.ts').agentAccess).toBe('read-write');
    expect(tauPathPolicy.classify('docs/notes.md').agentAccess).toBe('read-write');
    expect(shellProjectionAccess(narrow, 'src/part.ts')).toBe('read-write');
    expect(shellProjectionAccess(narrow, 'docs/notes.md')).toBe('denied');
    expect(shellProjectionAccess(narrow, 'src')).toBe('read-write');
    expect(shellProjectionAccess(narrow, 'srcx/part.ts')).toBe('denied');
  });

  it('should keep the registry answer where the grant set is the broader of the two', () => {
    const whole = granted();
    // A grant of the whole checkout never reopens the registry's own records or hidden control state.
    expect(shellProjectionAccess(whole, '.tau/chats/a.json')).toBe('read-only');
    expect(shellProjectionAccess(whole, '.tau/project.json')).toBe('denied');
    expect(shellProjectionAccess(whole, '.git/config')).toBe('denied');
  });

  it('should keep the grant answer where the grant set is the narrower of the two', () => {
    const narrowed = granted({ writable: [''], readOnly: ['docs'], denied: ['secrets'], masked: [] });
    expect(tauPathPolicy.classify('docs/notes.md').agentAccess).toBe('read-write');
    expect(tauPathPolicy.classify('secrets/key.txt').agentAccess).toBe('read-write');
    expect(shellProjectionAccess(narrowed, 'docs/notes.md')).toBe('read-only');
    expect(shellProjectionAccess(narrowed, 'secrets/key.txt')).toBe('denied');
  });

  it('should never let a grant root widen a path the registry protects', () => {
    // The grant set names the records and the control plane writable; the registry still wins.
    const overreaching = granted({
      writable: ['', '.tau/chats', '.tau/project.json', '.git'],
      readOnly: [],
      denied: [],
      masked: [],
    });
    expect(shellProjectionAccess(overreaching, '.tau/chats/a.json')).toBe('read-only');
    expect(shellProjectionAccess(overreaching, '.tau/project.json')).toBe('denied');
    expect(shellProjectionAccess(overreaching, '.git/config')).toBe('denied');
  });

  it('should let a masked container deny what is below it while the grants inside it stay reachable', () => {
    const set = granted(launch);
    // C13: the authored children the launch was granted inside the masked container.
    expect(shellProjectionAccess(set, '.tau/parameters/part.json')).toBe('read-write');
    expect(shellProjectionAccess(set, '.tau/AGENTS.md')).toBe('read-write');
    // The container itself stays readable so those children are reachable, and is never writable.
    expect(shellProjectionAccess(set, '.tau')).toBe('read-only');
    // NESTED-CANARY: the mask denies everything below it that no deeper grant root names, and a deny root inside
    // a granted one wins however broad the grant above it is.
    expect(tauPathPolicy.classify('.tau/parameters/private/canary').agentAccess).toBe('read-write');
    expect(shellProjectionAccess(set, '.tau/parameters/private/canary')).toBe('denied');
    expect(shellProjectionAccess(set, '.tau/hidden/canary')).toBe('denied');
    expect(shellProjectionAccess(set, '.tau/cache/blob')).toBe('denied');
    // A nested control directory the grant set denied, inside the writable checkout.
    expect(shellProjectionAccess(set, 'vendor/.git/config')).toBe('denied');
    // And the launch's own records grant stays read-only, not denied by the mask above it.
    expect(shellProjectionAccess(set, '.tau/chats/a.json')).toBe('read-only');
  });

  it('should keep the most restrictive list when several name the same grant root', () => {
    const both = granted({ writable: ['shared'], readOnly: ['shared'], denied: ['shared'], masked: [] });
    expect(shellProjectionAccess(both, 'shared/a.ts')).toBe('denied');
    const readable = granted({ writable: ['shared'], readOnly: ['shared'], denied: [], masked: [] });
    expect(shellProjectionAccess(readable, 'shared/a.ts')).toBe('read-only');
  });

  it('should fold a grant root and the path it is asked about as the filesystem folds them', () => {
    const narrowed = granted({ writable: [''], readOnly: [], denied: ['secrets'], masked: [] });
    expect(tauPathPolicy.classify('secrets/key.txt').agentAccess).toBe('read-write');
    /* Every filesystem the projection runs on folds case; Win32 also folds a trailing dot, and NTFS resolves a
     * stream suffix to the entry it hangs off. Compared as spelled, each of these would miss the `secrets` deny
     * root and fall through to the writable checkout root — the one widening this decision point exists to stop. */
    for (const path of ['secrets/key.txt', 'Secrets/key.txt', 'SECRETS/key.txt', 'secrets./key.txt']) {
      expect(shellProjectionAccess(narrowed, path)).toBe('denied');
    }
    expect(shellProjectionAccess(narrowed, 'secrets::$INDEX_ALLOCATION/key.txt')).toBe('denied');
    // The negative control: a name that merely starts the same is a different root and keeps the broad grant.
    expect(shellProjectionAccess(narrowed, 'secretsx/key.txt')).toBe('read-write');
  });

  it('should fold a grant root exactly as the path registry folds its own rows', () => {
    /* The projection carries its own copy of the registry's fold, because `path-registry.ts` is a package entry
     * point and exporting its speller would widen the filesystem package's `@public` surface. This pins the two
     * copies to each other through behaviour: every spelling below must be refused on the grant side, where the
     * copy decides, and on the registry side, where the registry's own fold does, so the copies cannot drift
     * apart without a red row here. */
    const spellings = ['vendor/.git/config', 'vendor/.Git/config', 'vendor/.git./config', 'vendor/.GIT/config'];
    const denying = granted({ writable: [''], readOnly: [], denied: ['vendor/.git'], masked: [] });
    const registryOnly = granted();
    for (const spelling of spellings) {
      expect(shellProjectionAccess(denying, spelling)).toBe('denied');
      expect(shellProjectionAccess(registryOnly, spelling)).toBe('denied');
      expect(shellProjectionAccess(registryOnly, spelling.replace('vendor/', ''))).toBe('denied');
    }
  });

  it('should keep a container readable when the only grant lies below it', () => {
    /* `visible()` is `access() !== 'denied'` and capture prunes a child it cannot see, so a denied container hides
     * every grant below it: granted `a/b/c` alone, a launch would never reach it. */
    const deep = granted({ writable: ['a/b/c'], readOnly: [], denied: [], masked: [] });
    expect(shellProjectionAccess(deep, '')).toBe('read-only');
    expect(shellProjectionAccess(deep, 'a')).toBe('read-only');
    expect(shellProjectionAccess(deep, 'a/b')).toBe('read-only');
    expect(shellProjectionAccess(deep, 'a/b/c')).toBe('read-write');
    expect(shellProjectionAccess(deep, 'a/b/c/part.ts')).toBe('read-write');
    // Only the walk is opened, never a sibling or the container itself.
    expect(shellProjectionAccess(deep, 'a/b/d')).toBe('denied');
    expect(shellProjectionAccess(deep, 'other')).toBe('denied');

    // The same inside a masked container: the mask denies below itself, and the walk to the grant survives it.
    const masked = granted({ writable: ['.tau/parameters/nested'], readOnly: [], denied: [], masked: ['.tau'] });
    expect(shellProjectionAccess(masked, '.tau')).toBe('read-only');
    expect(shellProjectionAccess(masked, '.tau/parameters')).toBe('read-only');
    expect(shellProjectionAccess(masked, '.tau/parameters/nested/part.json')).toBe('read-write');
    expect(shellProjectionAccess(masked, '.tau/parameters/private/canary')).toBe('denied');
    expect(shellProjectionAccess(masked, '.tau/hidden/canary')).toBe('denied');

    // A `denied` root is the one hard boundary: it refuses its container whatever is granted below it.
    const blocked = granted({ writable: ['vendor/.git/hooks'], readOnly: [], denied: ['vendor'], masked: [] });
    expect(shellProjectionAccess(blocked, 'vendor')).toBe('denied');
  });

  it('should refuse a grant root that is not a canonical root-relative path', () => {
    for (const root of ['/abs', 'a/../b', './a', 'a/', 'a//b']) {
      expect(() => granted({ writable: [root], readOnly: [], denied: [], masked: [] })).toThrow();
      expect(() => granted({ writable: [], readOnly: [], denied: [root], masked: [] })).toThrow();
      expect(() => granted({ writable: [], readOnly: [], denied: [], masked: [root] })).toThrow();
    }
  });
});

describe('shell projection publication under a launch grant set', () => {
  it('should refuse a file publication the grant set did not make writable and leave the bytes alone', async () => {
    const { publish, root } = connect();
    mkdirSync(join(root, 'docs'));
    writeFileSync(join(root, 'docs', 'notes.md'), 'baseline');
    const grants: ShellProjectionGrants = { writable: ['src'], readOnly: ['docs'], denied: [], masked: [] };
    expect(await publish({ path: 'docs/notes.md', baseline: 'baseline', projected: 'edit' }, { grants })).toEqual({
      status: 'refused',
      reason: 'protected-path',
    });
    expect(readFileSync(join(root, 'docs', 'notes.md'), 'utf8')).toBe('baseline');
  });

  it('should refuse a file publication below a masked container the grant set did not grant back', async () => {
    const { publish, root } = connect();
    mkdirSync(join(root, '.tau', 'parameters', 'private'), { recursive: true });
    writeFileSync(join(root, '.tau', 'parameters', 'private', 'canary'), 'secret');
    const grants: ShellProjectionGrants = {
      writable: ['', '.tau/parameters'],
      readOnly: [],
      denied: ['.tau/parameters/private'],
      masked: ['.tau'],
    };
    expect(
      await publish({ path: '.tau/parameters/private/canary', baseline: 'secret', projected: 'leak' }, { grants }),
    ).toEqual({ status: 'refused', reason: 'protected-path' });
    expect(readFileSync(join(root, '.tau', 'parameters', 'private', 'canary'), 'utf8')).toBe('secret');
    // The grant the launch does hold inside the same masked container still publishes.
    expect(
      await publish({ path: '.tau/parameters/part.json', baseline: null, projected: '{}' }, { grants }),
    ).toMatchObject({ status: 'settled', result: { status: 'applied' } });
  });

  it('should refuse every file publication when the grant set is unknown', async () => {
    const { root, server } = connect();
    writeFileSync(join(root, 'part.ts'), 'baseline');
    const outcome = await server.run({ root }, async (scope) =>
      publishShellProjectionFile(
        scope,
        { path: 'part.ts', baseline: 'baseline', projected: 'edit' },
        { grants: undefined, maximumBytes: 1024, signal: scope.signal },
      ),
    );
    expect(outcome).toEqual({ status: 'refused', reason: 'protected-path' });
    expect(readFileSync(join(root, 'part.ts'), 'utf8')).toBe('baseline');
  });

  it('should refuse directory creation and removal outside the grant set', async () => {
    const { publishEntry, root } = connect();
    mkdirSync(join(root, 'docs'));
    const grants: ShellProjectionGrants = { writable: ['src'], readOnly: [], denied: [], masked: [] };
    expect(await publishEntry({ kind: 'mkdir', path: 'docs/drafts' }, grants)).toEqual({
      status: 'refused',
      reason: 'protected-path',
    });
    expect(await publishEntry({ kind: 'rmdir', path: 'docs' }, grants)).toEqual({
      status: 'refused',
      reason: 'protected-path',
    });
    expect(existsSync(join(root, 'docs'))).toBe(true);
    expect(existsSync(join(root, 'docs', 'drafts'))).toBe(false);
  });

  it('should refuse the canonical container when the grant set masks it', async () => {
    const { publishEntry, root } = connect();
    const grants: ShellProjectionGrants = { writable: [''], readOnly: [], denied: [], masked: ['.tau'] };
    expect(await publishEntry({ kind: 'mkdir', path: '.tau' }, grants)).toEqual({
      status: 'refused',
      reason: 'protected-path',
    });
    expect(existsSync(join(root, '.tau'))).toBe(false);
    // Without the mask the registry's own canonical-container rule still admits it, unchanged.
    expect(await publishEntry({ kind: 'mkdir', path: '.tau' })).toMatchObject({ status: 'settled' });
  });

  it('should refuse a rename whose destination leaves the grant set', async () => {
    const { publishEntry, root } = connect();
    mkdirSync(join(root, 'src'));
    mkdirSync(join(root, 'src', 'models'));
    const grants: ShellProjectionGrants = { writable: ['src'], readOnly: [], denied: [], masked: [] };
    expect(
      await publishEntry(
        { kind: 'rename', from: 'src/models', to: 'models', descendants: [], preconditions: [] },
        grants,
      ),
    ).toEqual({ status: 'refused', reason: 'protected-path' });
    expect(existsSync(join(root, 'src', 'models'))).toBe(true);
    expect(existsSync(join(root, 'models'))).toBe(false);
  });

  it('should refuse a rename whose moved descendant leaves the grant set', async () => {
    const { publishEntry, root } = connect();
    mkdirSync(join(root, 'src', 'models', 'private'), { recursive: true });
    writeFileSync(join(root, 'src', 'models', 'private', 'canary'), 'secret');
    /* The ends are both granted; only the walk under the held claim sees that one moved descendant is denied, so
     * the move cannot carry it to a name the launch may read. */
    const grants: ShellProjectionGrants = {
      writable: ['src'],
      readOnly: [],
      denied: ['src/models/private'],
      masked: [],
    };
    expect(
      await publishEntry(
        {
          kind: 'rename',
          from: 'src/models',
          to: 'src/moved',
          descendants: ['private', 'private/canary'],
          preconditions: [
            { path: 'src/models/private/canary', expected: 'secret' },
            { path: 'src/moved', expected: null },
          ],
        },
        grants,
      ),
    ).toEqual({ status: 'refused', reason: 'protected-path' });
    expect(readFileSync(join(root, 'src', 'models', 'private', 'canary'), 'utf8')).toBe('secret');
    expect(existsSync(join(root, 'src', 'moved'))).toBe(false);
  });

  it('should refuse every entry publication when the grant set is unknown', async () => {
    const { root, server } = connect();
    mkdirSync(join(root, 'docs'));
    const outcomes = await server.run({ root }, async (scope) => [
      await publishShellProjectionEntry(
        scope,
        { kind: 'mkdir', path: 'src' },
        { grants: undefined, signal: scope.signal },
      ),
      await publishShellProjectionEntry(
        scope,
        { kind: 'rmdir', path: 'docs' },
        { grants: undefined, signal: scope.signal },
      ),
    ]);
    expect(outcomes).toEqual([
      { status: 'refused', reason: 'protected-path' },
      { status: 'refused', reason: 'protected-path' },
    ]);
    expect(existsSync(join(root, 'docs'))).toBe(true);
    expect(existsSync(join(root, 'src'))).toBe(false);
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
