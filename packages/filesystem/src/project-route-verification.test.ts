// oxlint-disable-next-line import/no-unassigned-import -- Native IndexedDB provider exercised through the authority.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { projectIdentityPath, serializeProjectIdentity } from '@taucad/project-core/identity';
import { projectToManifest, serializeProjectManifest } from '@taucad/types';
import { createWorkspaceFileService } from '#testing/workspace-service-harness.js';

/** PO02 contract: verification reads only the existing exact binding and never repairs it. */
describe('selected project route verification', () => {
  const projectId = 'proj_aaaaaaaaaaaaaaaaaaaaa';
  const replacementId = 'proj_bbbbbbbbbbbbbbbbbbbbb';
  let context: Awaited<ReturnType<typeof createWorkspaceFileService>>;

  beforeEach(async () => {
    context = await createWorkspaceFileService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    context.service.dispose();
  });

  const seed = async () => {
    const provider = await context.providerRegistry.getProvider({ backend: 'indexeddb' });
    await provider.mkdir('selected');
    await provider.writeFile(
      'selected/tau.json',
      serializeProjectManifest(
        projectToManifest({
          name: 'Selected',
          description: '',
          tags: [],
          assets: { main: { entryPath: 'main.ts' } },
        }),
      ),
    );
    await provider.writeFile(`selected/${projectIdentityPath}`, serializeProjectIdentity({ version: 1, projectId }));
    await context.service.configureProjectRoots({
      roots: [{ backend: 'indexeddb' }],
      projects: [{ projectId, backend: 'indexeddb', providerBasePath: 'selected' }],
    });
    return provider;
  };

  it('should verify a configured target without scanning or writing', async () => {
    const provider = await seed();
    const reads = vi.spyOn(provider, 'readFile');
    const writes = vi.spyOn(provider, 'writeFile');
    const scan = vi.spyOn(context.service, 'listProjectManifests');
    const result = await context.service.verifyProjectRoute({ projectId });
    expect(result).toMatchObject({ status: 'verified', project: { projectId, manifest: { name: 'Selected' } } });
    expect(
      reads.mock.calls.every(([path]) => path === 'selected/tau.json' || path === `selected/${projectIdentityPath}`),
    ).toBe(true);
    expect(writes).not.toHaveBeenCalled();
    expect(scan).not.toHaveBeenCalled();
  });

  it('should require discovery rather than fall through to the parent mount', async () => {
    const read = vi.spyOn(context.provider, 'readFile');
    await expect(context.service.verifyProjectRoute({ projectId })).resolves.toEqual({ status: 'discovery-required' });
    expect(read).not.toHaveBeenCalled();
  });

  it('should preserve mismatched identity bytes without rebinding', async () => {
    const provider = await seed();
    const replacement = serializeProjectIdentity({ version: 1, projectId: replacementId });
    await provider.writeFile(`selected/${projectIdentityPath}`, replacement);
    const writes = vi.spyOn(provider, 'writeFile');
    await expect(context.service.verifyProjectRoute({ projectId })).resolves.toEqual({ status: 'discovery-required' });
    expect(writes).not.toHaveBeenCalled();
    expect(await provider.readFile(`selected/${projectIdentityPath}`)).toEqual(replacement);
  });

  it('should preserve a storage failure as unavailable', async () => {
    const provider = await seed();
    vi.spyOn(provider, 'readFile').mockRejectedValue(new DOMException('Permission revoked', 'NotAllowedError'));
    await expect(context.service.verifyProjectRoute({ projectId })).resolves.toEqual({ status: 'unavailable' });
  });

  it.each(['tau.json', projectIdentityPath])(
    'should require discovery for malformed %s without repair',
    async (path) => {
      const provider = await seed();
      await provider.writeFile(`selected/${path}`, new TextEncoder().encode('{broken'));
      const writes = vi.spyOn(provider, 'writeFile');
      await expect(context.service.verifyProjectRoute({ projectId })).resolves.toEqual({
        status: 'discovery-required',
      });
      expect(writes).not.toHaveBeenCalled();
    },
  );

  it('should reject verification after configuration changes during the read', async () => {
    const provider = await seed();
    const release = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    const originalRead = provider.readFile.bind(provider);
    vi.spyOn(provider, 'readFile').mockImplementationOnce(async (...args) => {
      const bytes = await originalRead(...args);
      started.resolve();
      await release.promise;
      return bytes;
    });
    const pending = context.service.verifyProjectRoute({ projectId });
    try {
      await started.promise;
      await context.service.configureProjectRoots({ roots: [{ backend: 'indexeddb' }], projects: [] });
    } finally {
      release.resolve();
    }
    await expect(pending).resolves.toEqual({ status: 'superseded' });
  });

  it('should report failed configuration as unavailable until a successful configuration', async () => {
    await seed();
    const route = { projectId, backend: 'indexeddb', providerBasePath: 'selected' } as const;
    await expect(
      context.service.configureProjectRoots({ roots: [{ backend: 'indexeddb' }], projects: [route, route] }),
    ).rejects.toThrow();
    await expect(context.service.verifyProjectRoute({ projectId })).resolves.toEqual({ status: 'unavailable' });
    await context.service.configureProjectRoots({
      roots: [{ backend: 'indexeddb' }],
      projects: [{ projectId, backend: 'indexeddb', providerBasePath: 'selected' }],
    });
    await expect(context.service.verifyProjectRoute({ projectId })).resolves.toMatchObject({ status: 'verified' });
  });

  it('should reject a completed read after its exact mount is removed', async () => {
    const provider = await seed();
    const release = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    const originalRead = provider.readFile.bind(provider);
    vi.spyOn(provider, 'readFile').mockImplementation(async (...args) => {
      const bytes = await originalRead(...args);
      started.resolve();
      await release.promise;
      return bytes;
    });
    const pending = context.service.verifyProjectRoute({ projectId });
    try {
      await started.promise;
      context.mountTable.unmount(`/projects/${projectId}`);
    } finally {
      release.resolve();
    }
    await expect(pending).resolves.toEqual({ status: 'superseded' });
  });
});
