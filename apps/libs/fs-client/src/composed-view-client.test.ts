import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { composeView } from '@taucad/filesystem/composed-view';
import type { ComposedViewOverlay } from '@taucad/filesystem/composed-view';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import { WorkspaceMutationError } from '@taucad/filesystem';
import { createComposedViewClient } from '#composed-view-client.js';
import type { ComposedViewClient, ComposedViewProxy } from '#composed-view-client.js';
import type { WorkspaceAuthorityClient } from '#file-system-client.js';
import { WorkspacePathResolver } from '#workspace-path-resolver.js';

const root = '/projects/abc';
const skillsRoot = '.agents/skills';
const skillPath = `${skillsRoot}/cad-replicad/SKILL.md`;
const identity = 'skill:cad-replicad@1.0.0#fingerprint';
const skillBytes = new TextEncoder().encode('---\nname: cad-replicad\n---\n');

const overlay = (): ComposedViewOverlay => {
  const nodes = new Map<string, 'dir' | 'file'>([
    ['', 'dir'],
    ['.agents', 'dir'],
    [skillsRoot, 'dir'],
    [`${skillsRoot}/cad-replicad`, 'dir'],
    [skillPath, 'file'],
  ]);
  const children = new Map<string, readonly string[]>([
    ['', ['.agents']],
    ['.agents', ['skills']],
    [skillsRoot, ['cad-replicad']],
    [`${skillsRoot}/cad-replicad`, ['SKILL.md']],
  ]);
  return {
    root: skillsRoot,
    source: 'system-skills',
    unit: (path) =>
      path.startsWith(`${skillsRoot}/`) && path.slice(skillsRoot.length + 1).split('/')[0] === 'cad-replicad'
        ? { root: `${skillsRoot}/cad-replicad`, identity }
        : undefined,
    node: (path) => {
      const kind = nodes.get(path);
      if (kind === undefined) {
        return undefined;
      }
      return kind === 'dir'
        ? { type: 'dir', children: children.get(path) ?? [] }
        : {
            type: 'file',
            size: skillBytes.byteLength,
            contentKind: 'text',
            lineCount: 3,
          };
    },
    read: async () => skillBytes,
  };
};

/**
 * What is left of the authority for this client: topology and the change stream
 * (W11). Every per-path member it used to answer is gone from the type, so a
 * test cannot assert the fall-through that no longer exists.
 */
const authorityMock = (): WorkspaceAuthorityClient =>
  mock<WorkspaceAuthorityClient>({ pollExternalChanges: vi.fn().mockResolvedValue(false) });

/** The dependency mount as its own rooted view, in the mount's own namespace. */
const dependenciesMock = (): ComposedViewProxy =>
  mock<ComposedViewProxy>({
    stat: vi.fn().mockResolvedValue({ type: 'dir', size: 0, mtimeMs: 0 }),
    readdir: vi.fn().mockResolvedValue(['three']),
    readdirWithStats: vi.fn().mockResolvedValue([{ name: 'three', type: 'dir', size: 0, mtimeMs: 0 }]),
    readFile: vi.fn().mockResolvedValue('export {};\n'),
  });

/**
 * What the worker adds on top of the composed view (charter D2, D4).
 *
 * `archive`, `search` and `statTree` are the read content operations and the
 * root's index; the rest is the mutation pipeline's porcelain, which a
 * `MemoryProvider` has none of — so the view this harness composes cannot wire
 * them and they are declared here, where the routing assertions can see them.
 */
const rootedConnectionMembers = () => ({
  archive: vi.fn<ComposedViewProxy['archive']>().mockResolvedValue(new Blob(['view'])),
  search: vi.fn<ComposedViewProxy['search']>().mockResolvedValue([]),
  statTree: vi.fn<ComposedViewProxy['statTree']>().mockResolvedValue([]),
  writeFileChecked: vi
    .fn<ComposedViewProxy['writeFileChecked']>()
    .mockResolvedValue({ status: 'applied', content: new Uint8Array() }),
  writeFiles: vi.fn<ComposedViewProxy['writeFiles']>().mockResolvedValue(undefined),
  move: vi
    .fn<ComposedViewProxy['move']>()
    .mockResolvedValue({ type: 'file', size: 0, mtimeMs: 0, contentKind: 'binary' }),
  bulkMove: vi.fn<ComposedViewProxy['bulkMove']>().mockResolvedValue({ moved: [], failed: [] }),
  duplicate: vi.fn<ComposedViewProxy['duplicate']>().mockResolvedValue(undefined),
  copyTree: vi.fn<ComposedViewProxy['copyTree']>().mockResolvedValue(undefined),
  canMove: vi.fn<ComposedViewProxy['canMove']>().mockResolvedValue(true),
  canRename: vi.fn<ComposedViewProxy['canRename']>().mockResolvedValue(true),
  canCreate: vi.fn<ComposedViewProxy['canCreate']>().mockResolvedValue(true),
  canDelete: vi.fn<ComposedViewProxy['canDelete']>().mockResolvedValue(true),
});

const harness = async (
  seed?: (provider: MemoryProvider) => Promise<void>,
  /** The root the client is composed at; `'/'` is the always-mounted Home file manager. */
  clientRoot: string = root,
): Promise<{
  client: ComposedViewClient;
  authority: WorkspaceAuthorityClient;
  dependencies: ComposedViewProxy;
  view: ComposedViewProxy;
  provider: MemoryProvider;
}> => {
  const provider = new MemoryProvider();
  await provider.writeFile('main.ts', 'export {};\n');
  await seed?.(provider);
  const authority = authorityMock();
  const dependencies = dependenciesMock();
  /* The rooted connection serves the read content operations over the same
   * composition (charter D2); the worker builds them from `@taucad/filesystem/content-ops`,
   * so what this package owns is the routing, not the archive bytes. */
  const view: ComposedViewProxy = Object.assign(
    composeView({ filesystem: provider }, { consumer: 'user', overlays: [overlay()], policy: tauPathPolicy }),
    rootedConnectionMembers(),
  );
  return {
    authority,
    dependencies,
    view,
    provider,
    client: createComposedViewClient({
      workspace: authority,
      view,
      dependencies,
      paths: new WorkspacePathResolver(clientRoot),
    }),
  };
};

/*
 * The Files pane issues these, not just the editor (a1 review R1): a rename,
 * delete, duplicate or drag-drop must get the view's answer, not the
 * authority's `NOT_FOUND` for a path the authority has never heard of.
 */
describe('createComposedViewClient mutation guard (north star W2 attempt a2)', () => {
  it('should refuse deleting an overlay file as read-only instead of asking the authority', async () => {
    const { client } = await harness();

    await expect(client.canDelete(`${root}/${skillPath}`)).resolves.toMatchObject({ code: 'READ_ONLY_MOUNT' });
  });

  it('should refuse every preflight that would write into an overlay', async () => {
    const { client } = await harness();

    await expect(client.canRename(`${root}/${skillPath}`, 'other.md')).resolves.toMatchObject({
      code: 'READ_ONLY_MOUNT',
    });
    await expect(client.canCreate(`${root}/${skillsRoot}/cad-replicad/new.md`, 'file')).resolves.toMatchObject({
      code: 'READ_ONLY_MOUNT',
    });
    /* Both ends of a two-path operation: the source is the project's own. */
    await expect(client.canMove(`${root}/main.ts`, `${root}/${skillPath}`)).resolves.toMatchObject({
      code: 'READ_ONLY_MOUNT',
    });
  });

  /* A2 re-review R11: the preflight must not accept what the move refuses —
   * a rename's target is a name in the source's own parent, which can still
   * land on a bundle slug. */
  it('should refuse a rename whose new name lands on an overlay unit', async () => {
    const { client } = await harness();

    await expect(client.canRename(`${root}/${skillsRoot}/notes.md`, 'cad-replicad')).resolves.toMatchObject({
      code: 'READ_ONLY_MOUNT',
    });
    /* The same two paths through the mutation the dialog would then issue. */
    await expect(
      client.move(`${root}/${skillsRoot}/notes.md`, `${root}/${skillsRoot}/cad-replicad`),
    ).rejects.toMatchObject({ code: 'EROFS' });
  });

  /* V8: a bundle is replaced by placing a whole bundle, never by moving one
   * file onto it, so the destination end is refused like any overlay write. */
  it('should refuse a move of a project file onto an overlay path', async () => {
    const { client } = await harness();

    await expect(client.move(`${root}/main.ts`, `${root}/${skillPath}`)).rejects.toMatchObject({ code: 'EROFS' });
  });

  it('should refuse the remaining mutating members that reach an overlay', async () => {
    const { client } = await harness();

    await expect(client.duplicateFile(`${root}/main.ts`, `${root}/${skillPath}`)).rejects.toMatchObject({
      code: 'EROFS',
    });
    await expect(client.writeFiles({ [`${root}/${skillPath}`]: { content: skillBytes } })).rejects.toMatchObject({
      code: 'EROFS',
    });
    await expect(
      client.bulkMove([{ source: `${root}/main.ts`, target: `${root}/${skillPath}` }]),
    ).rejects.toMatchObject({ code: 'EROFS' });
  });

  /*
   * Charter D12: the writes ride the connection the reads ride. The authority
   * suppresses a port's own change events by port identity, so a write issued on
   * the workspace port would come back to this client as somebody else's edit —
   * which is why the whole guarded surface moves together, not method by method.
   */
  it('should issue every project mutation on the view in its own namespace', async () => {
    const { client, view, provider } = await harness();

    await expect(client.canDelete(`${root}/main.ts`)).resolves.toBe(true);
    await client.move(`${root}/main.ts`, `${root}/renamed.ts`);
    await client.writeFiles({ [`${root}/a.ts`]: { content: skillBytes } });
    await client.writeFileChecked({
      path: `${root}/parameters.json`,
      data: '{}',
      preconditions: [{ path: `${root}/parameters.json`, expected: null }],
    });
    await client.duplicateFile(`${root}/main.ts`, `${root}/copy.ts`);
    await client.bulkMove([{ source: `${root}/a.ts`, target: `${root}/b/a.ts` }]);
    await client.writeFile(`${root}/written.ts`, 'export {};\n');
    await client.mkdir(`${root}/made`, { recursive: true });
    await client.rmdir(`${root}/made`, { recursive: true });

    expect(view.canDelete).toHaveBeenCalledWith('main.ts');
    expect(view.move).toHaveBeenCalledWith('main.ts', 'renamed.ts');
    expect(view.writeFiles).toHaveBeenCalledWith({ 'a.ts': { content: skillBytes } });
    expect(view.writeFileChecked).toHaveBeenCalledWith({
      path: 'parameters.json',
      data: '{}',
      preconditions: [{ path: 'parameters.json', expected: null }],
    });
    expect(view.duplicate).toHaveBeenCalledWith('main.ts', 'copy.ts');
    expect(view.bulkMove).toHaveBeenCalledWith([{ source: 'a.ts', target: 'b/a.ts' }]);
    /* `writeFile`, `mkdir` and `rmdir` are the view's own, so the bytes are the
     * proof: the composed view wrote through to the checkout. */
    await expect(provider.readFile('written.ts', 'utf8')).resolves.toBe('export {};\n');
    await expect(provider.exists('made')).resolves.toBe(false);
  });

  /*
   * Callers match a batch's outcomes to the edits they sent, so the answer has
   * to come back in the namespace the question was asked in.
   */
  it('should answer a routed bulk move in the absolute paths it was asked in', async () => {
    const { client, view } = await harness();
    const error = new WorkspaceMutationError('NAME_EXISTS', 'c.ts', { target: 'b/c.ts' });
    vi.mocked(view.bulkMove).mockResolvedValueOnce({
      moved: [
        {
          edit: { source: 'a.ts', target: 'b/a.ts' },
          stat: { type: 'file', size: 0, mtimeMs: 0, contentKind: 'binary' },
        },
      ],
      failed: [{ edit: { source: 'c.ts', target: 'b/c.ts' }, error }],
    });

    const result = await client.bulkMove([
      { source: `${root}/a.ts`, target: `${root}/b/a.ts` },
      { source: `${root}/c.ts`, target: `${root}/b/c.ts` },
    ]);

    expect(result.moved.map(({ edit }) => edit)).toEqual([{ source: `${root}/a.ts`, target: `${root}/b/a.ts` }]);
    expect(result.failed.map(({ edit }) => edit)).toEqual([{ source: `${root}/c.ts`, target: `${root}/b/c.ts` }]);
    /* The toast names the path, and the path it names is the one the caller
     * asked about (gate G-D, H4). */
    expect(result.failed[0]?.error).toMatchObject({
      code: 'NAME_EXISTS',
      path: `${root}/c.ts`,
      target: `${root}/b/c.ts`,
    });
  });

  it('should answer a routed preflight refusal in the absolute paths it was asked in', async () => {
    const { client, view } = await harness();
    vi.mocked(view.canMove).mockResolvedValueOnce(
      new WorkspaceMutationError('NAME_EXISTS', 'c.ts', { target: 'b/c.ts' }),
    );

    const answer = await client.canMove(`${root}/c.ts`, `${root}/b/c.ts`);

    expect(answer).toMatchObject({ code: 'NAME_EXISTS', path: `${root}/c.ts`, target: `${root}/b/c.ts` });
    /* Still the wire contract, so the refusal survives another clone. */
    expect(answer).toBeInstanceOf(WorkspaceMutationError);
  });

  /* An operand the resolver cannot spell as a path — `canRename` refuses a bare
   * `..` before it resolves anything — stays the refusal it already is. */
  it('should leave a refusal whose operand is not a path alone', async () => {
    const { client, view } = await harness();
    vi.mocked(view.canRename).mockResolvedValueOnce(new WorkspaceMutationError('INVALID_NAME', '..'));

    await expect(client.canRename(`${root}/c.ts`, '..')).resolves.toMatchObject({
      code: 'INVALID_NAME',
      path: '..',
    });
  });

  /*
   * A batch is one operation: half of it on the view and half somewhere else
   * would take two lock sets and two origins. Since W11 there is no second
   * surface to send the whole call to, and the path outside the root is read-only
   * by construction — so the batch is refused whole instead.
   */
  it('should refuse a batch that reaches outside the project root, whole', async () => {
    const { client, view } = await harness();

    await expect(
      client.writeFiles({
        [`${root}/a.ts`]: { content: skillBytes },
        '/node_modules/three/index.d.ts': { content: skillBytes },
      }),
    ).rejects.toMatchObject({ code: 'EROFS' });

    expect(view.writeFiles).not.toHaveBeenCalled();
  });

  it('should refuse a checked write when its target or any precondition is read-only', async () => {
    const { client } = await harness();

    await expect(
      client.writeFileChecked({
        path: `${root}/parameters.json`,
        data: '{}',
        preconditions: [{ path: `${root}/${skillPath}`, expected: skillBytes }],
      }),
    ).rejects.toMatchObject({ code: 'EROFS' });
  });

  /* `/node_modules` is a mount, not an overlay: it never reaches the checkout's
   * view, and a dependency is read-only to everyone — so the preflight answers
   * rather than looking for a surface that would write it (W11). */
  it('should refuse a mutation of the dependency mount as read-only', async () => {
    const { client, dependencies } = await harness();

    await expect(client.canDelete('/node_modules/three/package.json')).resolves.toMatchObject({
      code: 'READ_ONLY_MOUNT',
    });
    await expect(client.unlink('/node_modules/three/package.json')).rejects.toMatchObject({ code: 'EROFS' });
    expect(dependencies.unlink).not.toHaveBeenCalled();
  });

  /*
   * The Home file manager is rooted at `/` on every route, where the root prefix
   * claims every path — including the dependency mount, which no view rooted at
   * Home's own provider can serve (gate G-D, H1 and H9).
   */
  it('should route a Home-rooted read to the view and the dependency mount to its own view', async () => {
    const { client, dependencies, view } = await harness(undefined, '/');
    const viewReaddir = vi.spyOn(view, 'readdir');

    await expect(client.readFile('/main.ts', 'utf8')).resolves.toBe('export {};\n');
    await client.readdir('/node_modules/three');

    expect(dependencies.readdir).toHaveBeenCalledWith('three');
    expect(viewReaddir).not.toHaveBeenCalled();
  });

  /*
   * Home's root prefix is `/`, which every path starts with — but a project is
   * its own route on its own mount, and the view at `/` is confined to Home's
   * provider. Since W11 the authority has no per-path call to fall through to,
   * so a path another route owns is refused here instead of being walked raw.
   */
  it('should refuse a path another route owns at a Home root', async () => {
    const { client, view } = await harness(undefined, '/');
    const viewReadFile = vi.spyOn(view, 'readFile');

    await expect(client.readFile('/projects/proj_a/main.ts', 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });

    expect(viewReadFile).not.toHaveBeenCalled();
  });

  /*
   * C2: the alias is a mount outside the checkout, so it is its own root with its
   * own `'user'` view (W11) — and that view classifies its root as if it were a
   * checkout, so the mount's own class is stamped here. One producer is what lets
   * the Files pane stop deciding read-only from the word `node_modules`.
   */
  it('should serve the dependency mount from its own view with dependency provenance', async () => {
    const { client, dependencies } = await harness();

    const rows = await client.readDirectory('/node_modules');

    expect(dependencies.readdirWithStats).toHaveBeenCalledWith('');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.provenance).toEqual({
      source: 'dependencies',
      versioned: false,
      agentAccess: 'read-only',
    });
    await expect(client.stat('/node_modules/three/package.json')).resolves.toMatchObject({
      provenance: {
        source: 'dependencies',
        versioned: false,
        agentAccess: 'read-only',
      },
    });
  });

  /*
   * CI3, Finding 4: the root listing is what the file tree treats as
   * authoritative over the root's children, so a root listing without the mount
   * deletes the `node_modules` row on every re-list. The mount is the root's
   * sibling and this client is what owns "what the root contains", so the row is
   * appended here rather than taught to the tree.
   */
  it('should list the dependency mount as one root row with dependency provenance', async () => {
    const { client } = await harness();

    const rows = await client.readDirectory(root);

    expect(rows.filter(({ name }) => name === 'node_modules')).toHaveLength(1);
    const mount = rows.find(({ name }) => name === 'node_modules');
    expect(mount?.children).toStrictEqual([]);
    expect(mount?.provenance).toEqual({
      source: 'dependencies',
      versioned: false,
      agentAccess: 'read-only',
    });
  });

  /* G0b-7: only a resolved row is remembered. The first root listing now runs
   * inside `initializeServicesActor`, so one transient authority error there — or
   * one listing that raced the mount — used to cost the session its
   * `node_modules` row for good, with no recovery path. */
  it('should list the dependency mount on a later listing when the first probe failed', async () => {
    const { client, dependencies } = await harness();
    vi.mocked(dependencies.stat).mockRejectedValueOnce(new Error('the mount is not ready'));

    const first = await client.readDirectory(root);
    const second = await client.readDirectory(root);

    expect(first.map(({ name }) => name)).not.toContain('node_modules');
    expect(second.filter(({ name }) => name === 'node_modules')).toHaveLength(1);
  });

  /* The OPFS mount is fail-soft: a profile where it never came up must not grow
   * a row for a directory nothing serves. */
  it('should omit the dependency mount row when the mount is not there', async () => {
    const { client, dependencies } = await harness();
    vi.mocked(dependencies.stat).mockRejectedValue(
      Object.assign(new Error('ENOENT: /node_modules'), { code: 'ENOENT' }),
    );

    const rows = await client.readDirectory(root);

    expect(rows.map(({ name }) => name)).not.toContain('node_modules');
  });

  /*
   * A checkout can hold a `node_modules` of its own — the registry classes it as
   * cache for every consumer, so the view lists it. The listed row is the one
   * that stands: two rows of the same name would fight over one tree key.
   */
  it('should keep the checkout its own node_modules row instead of adding the mount', async () => {
    const { client } = await harness(async (provider) => {
      await provider.mkdir('node_modules/three', { recursive: true });
      await provider.writeFile('node_modules/three/index.d.ts', 'export {};\n');
    });

    const rows = await client.readDirectory(root);

    expect(rows.filter(({ name }) => name === 'node_modules')).toHaveLength(1);
    expect(rows.find(({ name }) => name === 'node_modules')?.provenance).toMatchObject({
      source: 'project',
      versioned: false,
    });
  });
});

/*
 * C1 (ruling P11): placing a whole bundle is the only override gesture, so it
 * is the only path allowed past the guard — and the guard, not the caller,
 * keeps it whole.
 */
describe('createComposedViewClient overrideUnit (north star W4 attempt a2)', () => {
  it('should write every file of the unit under the project and nothing else', async () => {
    const { client, view } = await harness();

    await client.overrideUnit(`${skillsRoot}/cad-replicad`);

    expect(view.writeFiles).toHaveBeenCalledOnce();
    const written = vi.mocked(view.writeFiles).mock.calls[0]![0];
    expect(Object.keys(written)).toEqual([skillPath]);
    expect(written[skillPath]!.content).toEqual(skillBytes);
  });

  it('should refuse a unit the project already owns', async () => {
    const { client, view } = await harness(async (provider) => {
      await provider.mkdir(`${skillsRoot}/cad-replicad`, { recursive: true });
      await provider.writeFile(`${skillsRoot}/cad-replicad/SKILL.md`, 'mine\n');
    });

    await expect(client.overrideUnit(`${skillsRoot}/cad-replicad`)).rejects.toMatchObject({ code: 'EEXIST' });
    expect(view.writeFiles).not.toHaveBeenCalled();
  });

  it('should report the unit it replaces once the project owns it', async () => {
    const { client } = await harness(async (provider) => {
      await provider.mkdir(`${skillsRoot}/cad-replicad`, { recursive: true });
      await provider.writeFile(`${skillsRoot}/cad-replicad/SKILL.md`, 'mine\n');
    });

    await expect(client.stat(`${root}/${skillPath}`)).resolves.toMatchObject({
      provenance: { source: 'project', overrides: identity },
    });
    /* And the row is writable again: the guard refused it while the overlay served it. */
    await expect(client.canDelete(`${root}/${skillPath}`)).resolves.toBe(true);
  });
});

/*
 * Reads are the view's, including the whole-subtree ones (charter D2): the
 * archive a person downloads is composed exactly like the tree they are looking
 * at, so the control plane is absent by construction rather than by a filter the
 * authority reapplies over the raw provider.
 */
describe('createComposedViewClient read content operations (north star W3)', () => {
  it('should archive a directory inside the project through the view', async () => {
    const { client, view } = await harness();

    await expect(client.getZippedDirectory(root, { versionedOnly: true })).resolves.toBeInstanceOf(Blob);

    expect(view.archive).toHaveBeenCalledWith('', { versionedOnly: true });
  });

  it('should archive a subfolder at its view-relative path', async () => {
    const { client, view } = await harness();

    await client.getZippedDirectory(`${root}/exports`);

    expect(view.archive).toHaveBeenCalledWith('exports', undefined);
  });

  it('should refuse an archive outside the project root', async () => {
    const { client, view } = await harness();

    await expect(client.getZippedDirectory('/node_modules/three')).rejects.toThrow(/No rooted view serves/u);

    expect(view.archive).not.toHaveBeenCalled();
  });

  /*
   * Charter D3: search and recursive stat are the view's, read from the root's
   * own index, so the Files pane and the agent see the same masked rows.
   */
  it('should search the project through the view, never the authority', async () => {
    const { client, view } = await harness();

    await client.searchFiles(root, 'main', { maxResults: 5 });

    expect(view.search).toHaveBeenCalledWith('main', { maxResults: 5 });
  });

  it('should recursively stat a project directory through the view', async () => {
    const { client, view } = await harness();

    await client.getDirectoryStat(`${root}/exports`);

    expect(view.statTree).toHaveBeenCalledWith('exports');
  });

  /*
   * W12d removed the authority's unmasked recursive stat with its last consumer,
   * so a path no rooted view serves — the global `/node_modules` alias — is
   * refused here instead of walking the raw provider.
   */
  it('should refuse a recursive stat outside the project root', async () => {
    const { client, view } = await harness();

    await expect(client.getDirectoryStat('/node_modules/three')).rejects.toThrow(/No rooted view serves/u);
    expect(view.statTree).not.toHaveBeenCalled();
  });
});
