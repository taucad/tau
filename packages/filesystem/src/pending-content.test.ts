// oxlint-disable-next-line import/no-unassigned-import -- Side-effect import to polyfill IndexedDB for tests
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangeEventBus } from '#change-event-bus.js';
import { composeView } from '#composed-view.js';
import { withReadContentOps } from '#content-ops/read-ops.js';
import { MountTable } from '#mount-table.js';
import { tauPathPolicy } from '#path-registry.js';
import { PendingContentError, pendingObjectOf } from '#pending-content.js';
import type { PendingObjectSource } from '#pending-content.js';
import { ProviderRegistry } from '#provider-registry.js';
import { ResourceQueue } from '#resource-queue.js';
import { WorkspaceFileService } from '#workspace-file-service.js';

/*
 * Pending entries (D9, W4 slice a): a checkout path whose bytes are a large
 * object not yet on the device holds its git-lfs pointer. Every view but the
 * revision layer's raw one reads it through to the object, fetched on demand
 * and bounded (I10), or refuses with PENDING: no consumer below the revision
 * layer ever sees pointer text.
 */

const projectId = 'proj_ppppppppppppppppppppp';
const route = `/projects/${projectId}`;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const part = encoder.encode('solid part\n');
const oid = 'c'.repeat(64);
const pointer = encoder.encode(
  `version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize ${String(part.byteLength)}\n`,
);

let service: WorkspaceFileService;

const createService = async (pendingStallMilliseconds?: number): Promise<WorkspaceFileService> => {
  const providerRegistry = new ProviderRegistry();
  const scope = { backend: 'memory', storageRootKey: 'memory:pending-content' } as const;
  const provider = await providerRegistry.getProvider(scope);
  const mountTable = new MountTable();
  mountTable.mount('/', provider, { class: 'authored', ...scope });
  const created = new WorkspaceFileService({
    providerRegistry,
    resourceQueue: new ResourceQueue(),
    eventBus: new ChangeEventBus(),
    mountTable,
    ...(pendingStallMilliseconds === undefined ? {} : { pendingStallMilliseconds }),
  });
  await created.configureProjectRoots({ projects: [{ projectId, ...scope, providerBasePath: 'gear' }], roots: [] });
  await created.writeFile(`${route}/main.scad`, 'import("models/part.step");');
  await created.writeFile(`${route}/models/part.step`, pointer);
  return created;
};

beforeEach(async () => {
  service = await createService();
});

afterEach(() => {
  service.dispose();
});

describe('pending entries (D9)', () => {
  it('should parse a git-lfs pointer, and nothing else', () => {
    expect(pendingObjectOf(pointer)).toStrictEqual({ oid, size: part.byteLength });
    expect(pendingObjectOf(part)).toBeUndefined();
    expect(pendingObjectOf(encoder.encode('version https://git-lfs.github.com/spec/v1 is a spec'))).toBeUndefined();
  });

  it('should read a pending entry through to its object on every view but the raw one', async () => {
    const source = vi.fn<PendingObjectSource>(async () => part);
    service.setPendingObjectSource(source);
    const view = service.createRootedFileSystem(route);
    expect(await view.readFile('models/part.step')).toStrictEqual(part);
    expect(await view.readFile('models/part.step', 'utf8')).toBe('solid part\n');
    expect(await view.readFile('main.scad', 'utf8')).toBe('import("models/part.step");');
    expect(source).toHaveBeenCalledWith(
      {
        authorityPath: `${route}/models/part.step`,
        root: route,
        path: 'models/part.step',
        object: { oid, size: part.byteLength },
      },
      expect.any(AbortSignal),
    );
    const streamed = await new Response(view.readFileStream!('models/part.step')).arrayBuffer();
    expect(new Uint8Array(streamed)).toStrictEqual(part);
    source.mockClear();
    expect(await service.readFile(`${route}/models/part.step`)).toStrictEqual(part);
    /* The service's own read asks by mount too, so a host routes it as it routes a view's. */
    expect(source).toHaveBeenCalledWith(
      expect.objectContaining({ root: route, path: 'models/part.step' }),
      expect.any(AbortSignal),
    );
    /* The revision layer owns the pointers and reads them as they are. */
    const raw = service.createRootedFileSystem(route, undefined, { placeholders: 'raw' });
    expect(await raw.readFile('models/part.step')).toStrictEqual(pointer);
  });

  it('should serve contents and archive the object, never the pointer', async () => {
    service.setPendingObjectSource(async () => part);
    const view = withReadContentOps(
      composeView({ filesystem: service.createRootedFileSystem(route) }, { consumer: 'user', policy: tauPathPolicy }),
      tauPathPolicy,
    );
    const files = await view.contents('', { versionedOnly: true });
    expect(files['models/part.step']).toStrictEqual(part);
    const { default: jszip } = await import('jszip');
    const archived = await view.archive('');
    const zip = await jszip.loadAsync(await archived.arrayBuffer());
    expect(await zip.file('models/part.step')?.async('uint8array')).toStrictEqual(part);
  });

  it('should refuse with PENDING when no object can be had within the stall bound, and never answer the pointer', async () => {
    const view = service.createRootedFileSystem(route);
    /* No source: nothing can fetch it. */
    await expect(view.readFile('models/part.step')).rejects.toMatchObject({
      code: 'PENDING',
      path: 'models/part.step',
    });
    /* A source that fails. */
    service.setPendingObjectSource(async () => {
      throw new Error('offline');
    });
    await expect(view.readFile('models/part.step')).rejects.toBeInstanceOf(PendingContentError);
    /* A source that stalls, even one that ignores its signal: the bound answers (I10). */
    const stalling = await createService(30);
    stalling.setPendingObjectSource(
      async () =>
        new Promise<never>(() => {
          /* Never settles. */
        }),
    );
    const stalled = stalling.createRootedFileSystem(route);
    await expect(stalled.readFile('models/part.step')).rejects.toMatchObject({ code: 'PENDING' });
    await expect(new Response(stalled.readFileStream!('models/part.step')).arrayBuffer()).rejects.toMatchObject({
      code: 'PENDING',
    });
    stalling.dispose();
  });

  it('should read a pointer the host says is no placeholder as the text it is', async () => {
    service.setPendingObjectSource(async () => undefined);
    expect(await service.createRootedFileSystem(route).readFile('models/part.step')).toStrictEqual(pointer);
  });

  it('should copy a pending entry as its pointer, fetching nothing until the copy is read (copy-on-write)', async () => {
    const source = vi.fn<PendingObjectSource>(async () => part);
    service.setPendingObjectSource(source);
    const view = service.createRootedFileSystem(route);
    await view.duplicate!('models/part.step', 'models/copy.step');
    expect(source).not.toHaveBeenCalled();
    const raw = service.createRootedFileSystem(route, undefined, { placeholders: 'raw' });
    expect(await raw.readFile('models/copy.step')).toStrictEqual(pointer);
    expect(decoder.decode(await view.readFile('models/copy.step'))).toBe('solid part\n');
    /* A write over a pending entry replaces it. */
    await view.writeFile('models/copy.step', 'mine');
    expect(await view.readFile('models/copy.step', 'utf8')).toBe('mine');
  });
});
