import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { composeView } from '@taucad/filesystem/composed-view';
import type { ComposedViewOverlay } from '@taucad/filesystem/composed-view';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import { createComposedViewClient } from '#composed-view-client.js';
import type { ComposedViewClient, ComposedViewProxy } from '#composed-view-client.js';
import type { FileSystemClient } from '#file-system-client.js';
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

const authorityMock = (): FileSystemClient =>
  mock<FileSystemClient>({
    getZippedDirectory: vi.fn().mockResolvedValue(new Blob(['authority'])),
    getDirectoryStat: vi.fn().mockResolvedValue([]),
    searchFiles: vi.fn().mockResolvedValue([]),
    writeFile: vi.fn().mockResolvedValue(undefined),
    writeFileChecked: vi.fn().mockResolvedValue({ status: 'applied', content: new Uint8Array() }),
    writeFiles: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    rmdir: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    move: vi.fn().mockResolvedValue({ type: 'file', size: 0, mtimeMs: 0 }),
    bulkMove: vi.fn().mockResolvedValue({ moved: [], failed: [] }),
    duplicateFile: vi.fn().mockResolvedValue(undefined),
    copyDirectory: vi.fn().mockResolvedValue(undefined),
    canMove: vi.fn().mockResolvedValue(true),
    canRename: vi.fn().mockResolvedValue(true),
    canCreate: vi.fn().mockResolvedValue(true),
    canDelete: vi.fn().mockResolvedValue(true),
    stat: vi.fn().mockResolvedValue({ type: 'dir', size: 0, mtimeMs: 0 }),
    readDirectory: vi.fn().mockResolvedValue([{ id: 'three', name: 'three', size: 0, mtimeMs: 0, children: [] }]),
  });

const harness = async (
  seed?: (provider: MemoryProvider) => Promise<void>,
): Promise<{ client: ComposedViewClient; authority: FileSystemClient; view: ComposedViewProxy }> => {
  const provider = new MemoryProvider();
  await provider.writeFile('main.ts', 'export {};\n');
  await seed?.(provider);
  const authority = authorityMock();
  /* The rooted connection serves the read content operations over the same
   * composition (charter D2); the worker builds them from `@taucad/filesystem/content-ops`,
   * so what this package owns is the routing, not the archive bytes. */
  const view: ComposedViewProxy = Object.assign(
    composeView({ filesystem: provider }, { consumer: 'user', overlays: [overlay()], policy: tauPathPolicy }),
    {
      archive: vi.fn<ComposedViewProxy['archive']>().mockResolvedValue(new Blob(['view'])),
      search: vi.fn<ComposedViewProxy['search']>().mockResolvedValue([]),
      statTree: vi.fn<ComposedViewProxy['statTree']>().mockResolvedValue([]),
    },
  );
  return {
    authority,
    view,
    client: createComposedViewClient({
      workspace: authority,
      view,
      paths: new WorkspacePathResolver(root),
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
    const { client, authority } = await harness();

    await expect(client.canDelete(`${root}/${skillPath}`)).resolves.toMatchObject({ code: 'READ_ONLY_MOUNT' });
    expect(authority.canDelete).not.toHaveBeenCalled();
  });

  it('should refuse every preflight that would write into an overlay', async () => {
    const { client, authority } = await harness();

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
    expect(authority.canRename).not.toHaveBeenCalled();
    expect(authority.canCreate).not.toHaveBeenCalled();
    expect(authority.canMove).not.toHaveBeenCalled();
  });

  /* A2 re-review R11: the preflight must not accept what the move refuses —
   * a rename's target is a name in the source's own parent, which can still
   * land on a bundle slug. */
  it('should refuse a rename whose new name lands on an overlay unit', async () => {
    const { client, authority } = await harness();

    await expect(client.canRename(`${root}/${skillsRoot}/notes.md`, 'cad-replicad')).resolves.toMatchObject({
      code: 'READ_ONLY_MOUNT',
    });
    /* The same two paths through the mutation the dialog would then issue. */
    await expect(
      client.move(`${root}/${skillsRoot}/notes.md`, `${root}/${skillsRoot}/cad-replicad`),
    ).rejects.toMatchObject({ code: 'EROFS' });
    expect(authority.canRename).not.toHaveBeenCalled();
  });

  /* V8: a bundle is replaced by placing a whole bundle, never by moving one
   * file onto it, so the destination end is refused like any overlay write. */
  it('should refuse a move of a project file onto an overlay path', async () => {
    const { client, authority } = await harness();

    await expect(client.move(`${root}/main.ts`, `${root}/${skillPath}`)).rejects.toMatchObject({ code: 'EROFS' });
    expect(authority.move).not.toHaveBeenCalled();
  });

  it('should refuse the remaining mutating members that reach an overlay', async () => {
    const { client, authority } = await harness();

    await expect(client.duplicateFile(`${root}/main.ts`, `${root}/${skillPath}`)).rejects.toMatchObject({
      code: 'EROFS',
    });
    await expect(client.copyDirectory(`${root}/src`, `${root}/${skillsRoot}/cad-replicad`)).rejects.toMatchObject({
      code: 'EROFS',
    });
    await expect(client.writeFiles({ [`${root}/${skillPath}`]: { content: skillBytes } })).rejects.toMatchObject({
      code: 'EROFS',
    });
    await expect(
      client.bulkMove([{ source: `${root}/main.ts`, target: `${root}/${skillPath}` }]),
    ).rejects.toMatchObject({ code: 'EROFS' });
    expect(authority.duplicateFile).not.toHaveBeenCalled();
    expect(authority.copyDirectory).not.toHaveBeenCalled();
    expect(authority.writeFiles).not.toHaveBeenCalled();
    expect(authority.bulkMove).not.toHaveBeenCalled();
  });

  it('should leave every project-only mutation on the authority', async () => {
    const { client, authority } = await harness();

    await expect(client.canDelete(`${root}/main.ts`)).resolves.toBe(true);
    await client.move(`${root}/main.ts`, `${root}/renamed.ts`);
    await client.writeFiles({ [`${root}/a.ts`]: { content: skillBytes } });
    await client.writeFileChecked({
      path: `${root}/parameters.json`,
      data: '{}',
      preconditions: [{ path: `${root}/parameters.json`, expected: null }],
    });
    await client.duplicateFile(`${root}/main.ts`, `${root}/copy.ts`);
    expect(authority.canDelete).toHaveBeenCalledWith(`${root}/main.ts`);
    expect(authority.move).toHaveBeenCalledWith(`${root}/main.ts`, `${root}/renamed.ts`);
    expect(authority.writeFiles).toHaveBeenCalledOnce();
    expect(authority.writeFileChecked).toHaveBeenCalledOnce();
    expect(authority.duplicateFile).toHaveBeenCalledWith(`${root}/main.ts`, `${root}/copy.ts`);
  });

  it('should refuse a checked write when its target or any precondition is read-only', async () => {
    const { client, authority } = await harness();

    await expect(
      client.writeFileChecked({
        path: `${root}/parameters.json`,
        data: '{}',
        preconditions: [{ path: `${root}/${skillPath}`, expected: skillBytes }],
      }),
    ).rejects.toMatchObject({ code: 'EROFS' });
    expect(authority.writeFileChecked).not.toHaveBeenCalled();
  });

  /* `/node_modules` is a mount, not an overlay: it never reaches the view. */
  it('should leave a path outside the project root on the authority', async () => {
    const { client, authority } = await harness();

    await expect(client.canDelete('/node_modules/three/package.json')).resolves.toBe(true);
    expect(authority.canDelete).toHaveBeenCalledWith('/node_modules/three/package.json');
  });

  /*
   * C2: the alias is a mount outside the checkout, so it is the authority's —
   * and the authority stamps nothing. One producer here is what lets the Files
   * pane stop deciding read-only from the word `node_modules`.
   */
  it('should serve the dependency mount from the authority with dependency provenance', async () => {
    const { client, authority } = await harness();

    const rows = await client.readDirectory('/node_modules');

    expect(authority.readDirectory).toHaveBeenCalledWith('/node_modules');
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
});

/*
 * C1 (ruling P11): placing a whole bundle is the only override gesture, so it
 * is the only path allowed past the guard — and the guard, not the caller,
 * keeps it whole.
 */
describe('createComposedViewClient overrideUnit (north star W4 attempt a2)', () => {
  it('should write every file of the unit under the project and nothing else', async () => {
    const { client, authority } = await harness();

    await client.overrideUnit(`${skillsRoot}/cad-replicad`);

    expect(authority.writeFiles).toHaveBeenCalledOnce();
    const written = vi.mocked(authority.writeFiles).mock.calls[0]![0];
    expect(Object.keys(written)).toEqual([`${root}/${skillPath}`]);
    expect(written[`${root}/${skillPath}`]!.content).toEqual(skillBytes);
  });

  it('should refuse a unit the project already owns', async () => {
    const { client, authority } = await harness(async (provider) => {
      await provider.mkdir(`${skillsRoot}/cad-replicad`, { recursive: true });
      await provider.writeFile(`${skillsRoot}/cad-replicad/SKILL.md`, 'mine\n');
    });

    await expect(client.overrideUnit(`${skillsRoot}/cad-replicad`)).rejects.toMatchObject({ code: 'EEXIST' });
    expect(authority.writeFiles).not.toHaveBeenCalled();
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
    const { client, authority, view } = await harness();

    await expect(client.getZippedDirectory(root, { versionedOnly: true })).resolves.toBeInstanceOf(Blob);

    expect(view.archive).toHaveBeenCalledWith('', { versionedOnly: true });
    expect(authority.getZippedDirectory).not.toHaveBeenCalled();
  });

  it('should archive a subfolder at its view-relative path', async () => {
    const { client, view } = await harness();

    await client.getZippedDirectory(`${root}/exports`);

    expect(view.archive).toHaveBeenCalledWith('exports', undefined);
  });

  it('should archive an explicit workspace scope on the authority even inside the project root', async () => {
    const { client, authority, view } = await harness();
    const scope = { backend: 'memory', storageRootKey: 'memory:scope' } as const;

    await client.getZippedDirectory(root, { scope });

    expect(authority.getZippedDirectory).toHaveBeenCalledWith(root, { scope });
    expect(view.archive).not.toHaveBeenCalled();
  });

  it('should refuse an archive outside the project root that names no scope', async () => {
    const { client, authority, view } = await harness();

    await expect(client.getZippedDirectory('/node_modules/three')).rejects.toThrow(/No rooted view serves/u);

    expect(authority.getZippedDirectory).not.toHaveBeenCalled();
    expect(view.archive).not.toHaveBeenCalled();
  });

  /*
   * Charter D3: search and recursive stat are the view's, read from the root's
   * own index, so the Files pane and the agent see the same masked rows.
   */
  it('should search the project through the view, never the authority', async () => {
    const { client, authority, view } = await harness();

    await client.searchFiles(root, 'main', { maxResults: 5 });

    expect(view.search).toHaveBeenCalledWith('main', { maxResults: 5 });
    expect(authority.searchFiles).not.toHaveBeenCalled();
  });

  it('should recursively stat a project directory through the view', async () => {
    const { client, authority, view } = await harness();

    await client.getDirectoryStat(`${root}/exports`);

    expect(view.statTree).toHaveBeenCalledWith('exports');
    expect(authority.getDirectoryStat).not.toHaveBeenCalled();
  });

  /* The global `/node_modules` alias has no rooted handle until W12 (D12). */
  it('should leave a recursive stat outside the project root on the authority', async () => {
    const { client, authority, view } = await harness();

    await client.getDirectoryStat('/node_modules/three');

    expect(authority.getDirectoryStat).toHaveBeenCalledWith('/node_modules/three');
    expect(view.statTree).not.toHaveBeenCalled();
  });
});
