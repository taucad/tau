// oxlint-disable-next-line import/no-unassigned-import -- Side-effect import to polyfill IndexedDB for tests
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangeEvent } from '#types.js';
import { ChangeEventBus } from '#change-event-bus.js';
import { MountTable } from '#mount-table.js';
import { ProviderRegistry } from '#provider-registry.js';
import { ResourceQueue } from '#resource-queue.js';
import { WorkspaceFileService } from '#workspace-file-service.js';
import type { RootedFileSystem } from '#rooted-views.js';
import { WorkspaceMutationError } from '#workspace-errors.js';

/**
 * The mutating porcelain a rooted view serves (charter D4, W5 step 2).
 *
 * Every case here asserts the two properties the authority's own porcelain has
 * and a per-file re-expression would lose: confinement to the captured mount
 * (Rule 15) and batch semantics — one lock set, one summary event, targeted
 * invalidation (Rule 5a). The mask is not here: it belongs to `composeView`
 * above, and `composed-view.test.ts` pins it.
 */

const projectId = 'proj_ppppppppppppppppppppp';
const projectRoute = `/projects/${projectId}`;

let service: WorkspaceFileService;
let events: ChangeEvent[];
const openServices: WorkspaceFileService[] = [];

const createService = async (): Promise<WorkspaceFileService> => {
  const providerRegistry = new ProviderRegistry();
  const scope = { backend: 'memory', storageRootKey: 'memory:rooted-views' } as const;
  const provider = await providerRegistry.getProvider(scope);
  const mountTable = new MountTable();
  mountTable.mount('/', provider, { class: 'authored', ...scope });
  const eventBus = new ChangeEventBus();
  events = [];
  eventBus.subscribe((event) => {
    events.push(event);
  });
  const created = new WorkspaceFileService({
    providerRegistry,
    resourceQueue: new ResourceQueue(),
    eventBus,
    mountTable,
  });
  openServices.push(created);
  await created.configureProjectRoots({
    projects: [{ projectId, ...scope, providerBasePath: 'gear-system' }],
    roots: [],
  });
  return created;
};

const view = (): RootedFileSystem => service.createRootedFileSystem(projectRoute);

beforeEach(async () => {
  service = await createService();
  for (const [path, content] of Object.entries({
    'src/main.ts': 'export const part = 1;',
    'src/lib/helper.ts': 'export const helper = 2;',
    'tau.json': '{}',
  })) {
    // oxlint-disable-next-line no-await-in-loop -- Deterministic seed order keeps the fixture readable.
    await service.writeFile(`${projectRoute}/${path}`, content);
  }
  events = [];
});

afterEach(() => {
  for (const open of openServices.splice(0)) {
    open.dispose();
  }
});

describe('rooted porcelain', () => {
  it('should copy a subtree inside the captured mount', async () => {
    const rooted = view();

    await rooted.copyTree!('src', 'backup');

    await expect(rooted.readFile('backup/main.ts', 'utf8')).resolves.toBe('export const part = 1;');
    await expect(rooted.readFile('backup/lib/helper.ts', 'utf8')).resolves.toBe('export const helper = 2;');
  });

  it('should copy a subtree as one batch with one summary event (Rule 5a)', async () => {
    await view().copyTree!('src', 'backup');

    expect(events.filter((event) => event.type === 'directoryCopied')).toStrictEqual([
      {
        type: 'directoryCopied',
        sourcePath: `${projectRoute}/src`,
        targetPath: `${projectRoute}/backup`,
        backend: 'memory',
      },
    ]);
  });

  it('should refuse a copy whose operand leaves the captured mount', async () => {
    const rooted = view();

    await expect(rooted.copyTree!('src', '/projects/other/backup')).rejects.toThrow();
    await expect(rooted.copyTree!('../elsewhere', 'backup')).rejects.toThrow();
  });

  it('should honour the caller filter on every entry of a copy', async () => {
    await view().copyTree!('src', 'backup', { admits: (relativePath) => relativePath !== 'lib' });

    await expect(view().exists('backup/main.ts')).resolves.toBe(true);
    await expect(view().exists('backup/lib')).resolves.toBe(false);
  });

  it('should duplicate one file', async () => {
    await view().duplicate!('src/main.ts', 'src/main.copy.ts');

    await expect(view().readFile('src/main.copy.ts', 'utf8')).resolves.toBe('export const part = 1;');
  });

  it('should move one path and answer with the resulting stat', async () => {
    const stat = await view().move!('src/main.ts', 'src/renamed.ts');

    expect(stat).toMatchObject({ type: 'file' });
    await expect(view().exists('src/main.ts')).resolves.toBe(false);
    expect(events.filter((event) => event.type === 'fileRenamed')).toHaveLength(1);
  });

  it('should report every completed and failed edit of a bulk move', async () => {
    const result = await view().bulkMove!([
      { source: 'src/main.ts', target: 'src/one.ts' },
      { source: 'src/absent.ts', target: 'src/two.ts' },
    ]);

    expect(result.moved.map(({ edit }) => edit.target)).toStrictEqual(['src/one.ts']);
    expect(result.failed.map(({ error }) => error.code)).toStrictEqual(['NOT_FOUND']);
  });

  it('should write a batch of files through the canonical mutation path', async () => {
    await view().writeFiles!({
      'src/a.ts': { content: 'export const a = 1;' },
      'src/b.ts': { content: 'export const b = 2;' },
    });

    await expect(view().readFile('src/a.ts', 'utf8')).resolves.toBe('export const a = 1;');
    await expect(view().readFile('src/b.ts', 'utf8')).resolves.toBe('export const b = 2;');
  });

  it('should refuse a batch write that leaves the captured mount', async () => {
    await expect(view().writeFiles!({ '../escape.ts': { content: 'nope' } })).rejects.toThrow();
  });

  it('should answer the move preflight with the typed refusal', async () => {
    const rooted = view();

    await expect(rooted.canMove!('src/main.ts', 'src/renamed.ts')).resolves.toBe(true);
    await expect(rooted.canMove!('src/absent.ts', 'src/renamed.ts')).resolves.toMatchObject({ code: 'NOT_FOUND' });
    await expect(rooted.canMove!('src/main.ts', 'tau.json')).resolves.toMatchObject({ code: 'NAME_EXISTS' });
    await expect(rooted.canMove!('src/main.ts', '/absolute')).resolves.toMatchObject({ code: 'INVALID_NAME' });
  });

  it('should answer the rename, create and delete preflights', async () => {
    const rooted = view();

    await expect(rooted.canRename!('src/main.ts', 'renamed.ts')).resolves.toBe(true);
    await expect(rooted.canRename!('src/main.ts', 'nested/name.ts')).resolves.toMatchObject({ code: 'INVALID_NAME' });
    await expect(rooted.canCreate!('src/fresh.ts', 'file')).resolves.toBe(true);
    await expect(rooted.canCreate!('tau.json', 'file')).resolves.toMatchObject({ code: 'NAME_EXISTS' });
    await expect(rooted.canDelete!('tau.json')).resolves.toBe(true);
    await expect(rooted.canDelete!('absent.json')).resolves.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('should fail closed once the captured mount is replaced', async () => {
    const rooted = view();
    service.disposeStorageRoot('memory:rooted-views');

    await expect(rooted.copyTree!('src', 'backup')).rejects.toMatchObject({ code: 'ESTALE' });
    await expect(rooted.move!('src/main.ts', 'src/renamed.ts')).rejects.toMatchObject({ code: 'ESTALE' });
    await expect(rooted.writeFiles!({ 'src/a.ts': { content: 'a' } })).rejects.toMatchObject({ code: 'ESTALE' });
  });

  it('should keep the preflight refusal spelled in the rooted namespace', async () => {
    const refusal = await view().canMove!('src/absent.ts', 'src/renamed.ts');

    expect(refusal).toBeInstanceOf(WorkspaceMutationError);
    expect((refusal as WorkspaceMutationError).path).toBe('src/absent.ts');
  });

  it('should acquire the mutation locks once for a whole batch', async () => {
    const queue = new ResourceQueue();
    const claim = vi.spyOn(queue, 'queueForMany');
    const providerRegistry = new ProviderRegistry();
    const scope = { backend: 'memory', storageRootKey: 'memory:rooted-views-locks' } as const;
    const provider = await providerRegistry.getProvider(scope);
    const mountTable = new MountTable();
    mountTable.mount('/', provider, { class: 'authored', ...scope });
    const batched = new WorkspaceFileService({
      providerRegistry,
      resourceQueue: queue,
      eventBus: new ChangeEventBus(),
      mountTable,
    });
    openServices.push(batched);
    await batched.configureProjectRoots({
      projects: [{ projectId, ...scope, providerBasePath: 'gear-system' }],
      roots: [],
    });
    const rooted = batched.createRootedFileSystem(projectRoute);
    await rooted.writeFiles!({ 'a.ts': { content: 'a' } });
    claim.mockClear();

    await rooted.copyTree!('', 'backup');

    expect(claim).toHaveBeenCalledOnce();
  });
});
