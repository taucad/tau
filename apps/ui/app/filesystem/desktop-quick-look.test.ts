import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { RuntimeFileSystem } from '@taucad/runtime/filesystem';
import { digestContent } from '@taucad/cache-core';
import type { PublishedAssemblyDocument, RuntimeDocument } from '@taucad/runtime/client';
import type { AppRuntimeClient } from '#types/runtime-client.alias.js';
import { previewProjectFileInQuickLook } from '#filesystem/desktop-quick-look.js';

const client = mock<AppRuntimeClient>();
const pinnedDocument = mock<PublishedAssemblyDocument>();
const ordinaryDocument = mock<RuntimeDocument>();
const bridge = vi.hoisted(() => ({
  quickLook: { directPreviewExtensions: ['pdf'], previewPath: vi.fn(), previewUsdz: vi.fn() },
}));
vi.mock('@taucad/runtime/client', () => ({ createRuntimeClient: () => client }));
vi.mock('#filesystem/desktop-bridge.js', () => ({ desktopBridge: () => bridge, nodeHomeRoot: () => '/home' }));
vi.mock('#filesystem/handle-store.js', () => ({
  getProjectFileSystemConfig: async () => ({ backend: 'node', path: '/home', providerBasePath: 'project' }),
}));
vi.mock('#constants/desktop-kernel-options.js', () => ({
  desktopKernelOptions: () => async () => () => ({}),
}));
vi.mock('#lib/compute-reuse-preference.js', () => ({ getComputeReuseMode: () => 'memory' }));

const rootBytes = new TextEncoder().encode(
  JSON.stringify({ schemaVersion: 1, generation: 1, parts: {}, occurrences: [] }),
);
const fileSystem = mock<RuntimeFileSystem>();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(pinnedDocument.exportPublished).mockResolvedValue({
    success: true,
    exportId: 'quick-look',
    issues: [],
    files: [{ name: 'scene.usdz', mimeType: 'model/vnd.usdz+zip', bytes: new Uint8Array([1]) }],
  });
  vi.mocked(client.openAssembly).mockImplementation(async ({ root }) => {
    Object.assign(pinnedDocument, { root });
    return pinnedDocument;
  });
  vi.mocked(client.open).mockReturnValue(ordinaryDocument);
  vi.mocked(ordinaryDocument.export).mockResolvedValue({
    success: true,
    exportId: 'ordinary-quick-look',
    evaluationId: 'ordinary-evaluation',
    issues: [],
    files: [{ name: 'part.usdz', mimeType: 'model/vnd.usdz+zip', bytes: new Uint8Array([1]) }],
  });
  bridge.quickLook.previewUsdz.mockResolvedValue({ success: true });
});

describe('project Quick Look assembly authority', () => {
  it('opens the exact selected root bytes and exports that pin without a source fallback', async () => {
    const root = {
      path: 'scene.json',
      digest: await digestContent({ bytes: rootBytes }),
      byteLength: rootBytes.byteLength,
    };
    await previewProjectFileInQuickLook({
      path: 'scene.json',
      projectId: 'project',
      runtimeFileSystem: fileSystem,
      readFile: async () => rootBytes,
    });
    expect(client.openAssembly).toHaveBeenCalledWith({ root });
    expect(pinnedDocument.exportPublished).toHaveBeenCalledWith({ format: 'usdz', publishedAssembly: { root } });
    expect(client.shutdown).toHaveBeenCalledOnce();
  });

  it('uses the settled authored pin and refuses an authored scene that has no admitted pin', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ schemaVersion: 1, parts: {}, occurrences: [] }));
    const options = {
      path: 'assembly.json',
      projectId: 'project',
      runtimeFileSystem: fileSystem,
      readFile: async () => bytes,
    };
    await expect(previewProjectFileInQuickLook(options)).rejects.toThrow('current admitted pin');
    expect(client.connect).not.toHaveBeenCalled();
    expect(pinnedDocument.exportPublished).not.toHaveBeenCalled();
    const root = {
      path: '.tau/artifacts/reusable-parts/entry/scene.json',
      digest: await digestContent({ bytes: rootBytes }),
      byteLength: rootBytes.byteLength,
    };
    await previewProjectFileInQuickLook({ ...options, publishedAssemblyRoot: root });
    expect(client.openAssembly).toHaveBeenCalledWith({ root });
    expect(pinnedDocument.exportPublished).toHaveBeenCalledWith({ format: 'usdz', publishedAssembly: { root } });
  });

  it('retains the ordinary source converter path for standalone model files', async () => {
    const readFile = vi.fn();
    await previewProjectFileInQuickLook({
      path: 'part.step',
      projectId: 'project',
      runtimeFileSystem: fileSystem,
      readFile,
    });
    expect(readFile).not.toHaveBeenCalled();
    expect(client.openAssembly).not.toHaveBeenCalled();
    expect(client.open).toHaveBeenCalledWith({ source: { path: 'part.step' }, watch: false });
    expect(ordinaryDocument.export).toHaveBeenCalledWith('usdz');
    expect(pinnedDocument.exportPublished).not.toHaveBeenCalled();
  });

  it('denies a changed selected assembly after export and releases the utility client', async () => {
    let current = true;
    vi.mocked(pinnedDocument.exportPublished).mockImplementationOnce(async () => {
      current = false;
      return {
        success: true,
        exportId: 'quick-look',
        issues: [],
        files: [{ name: 'scene.usdz', mimeType: 'model/vnd.usdz+zip', bytes: new Uint8Array([1]) }],
      };
    });
    await expect(
      previewProjectFileInQuickLook({
        path: 'scene.json',
        projectId: 'project',
        runtimeFileSystem: fileSystem,
        readFile: async () => rootBytes,
        assertCurrentSubject: () => {
          if (!current) {
            throw new Error('Selected root changed');
          }
        },
      }),
    ).rejects.toThrow('Selected root changed');
    expect(bridge.quickLook.previewUsdz).not.toHaveBeenCalled();
    expect(client.shutdown).toHaveBeenCalledOnce();
  });

  it('terminates after failed pinned admission without evaluating the source', async () => {
    vi.mocked(client.openAssembly).mockRejectedValueOnce(new Error('Pinned display is invalid'));
    await expect(
      previewProjectFileInQuickLook({
        path: 'scene.json',
        projectId: 'project',
        runtimeFileSystem: fileSystem,
        readFile: async () => rootBytes,
      }),
    ).rejects.toThrow('Pinned display is invalid');
    expect(pinnedDocument.exportPublished).not.toHaveBeenCalled();
    expect(client.shutdown).toHaveBeenCalledOnce();
  });
});
