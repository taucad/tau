import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { projectToManifest, serializeProjectManifest } from '@taucad/types';
import type { ProjectManifest } from '@taucad/types';
import type { FileContentService } from '@taucad/fs-client/file-content-service';
import { createProjectManifestChangeObserver, resolveScopedProjectManifest } from '#hooks/use-project.js';

const project = (name: string): ProjectManifest =>
  projectToManifest({
    id: 'proj_123456789012345678901',
    name,
    description: '',
    tags: [],
    assets: { main: { entryPath: 'main.ts' } },
  });

describe('createProjectManifestChangeObserver', () => {
  it('does not reload when a local write matches the current project', async () => {
    const current = project('Current');
    const reload = vi.fn();
    const observer = createProjectManifestChangeObserver({
      readManifest: async () => serializeProjectManifest(current),
      getCurrentProject: () => current,
      reload,
    });

    await observer.check();

    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads an externally changed manifest once', async () => {
    const current = project('Current');
    const changed = project('External change');
    const reload = vi.fn();
    const observer = createProjectManifestChangeObserver({
      readManifest: async () => serializeProjectManifest(changed),
      getCurrentProject: () => current,
      reload,
    });

    await observer.check();
    await observer.check();

    expect(reload).toHaveBeenCalledOnce();
  });

  it('ignores invalid manifests and results that arrive after disposal', async () => {
    const reload = vi.fn();
    let resolveRead: ((bytes: Uint8Array<ArrayBuffer>) => void) | undefined;
    const observer = createProjectManifestChangeObserver({
      readManifest: async () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
      getCurrentProject: () => project('Current'),
      reload,
    });

    const pending = observer.check();
    observer.dispose();
    resolveRead?.(serializeProjectManifest(project('External change')));
    await pending;

    expect(reload).not.toHaveBeenCalled();
  });
});

describe('resolveScopedProjectManifest', () => {
  it('should return a valid manifest whose ID matches the scoped project', async () => {
    const contentService = mock<FileContentService>();
    const expected = project('Current');
    contentService.resolve.mockResolvedValue({ kind: 'text', content: serializeProjectManifest(expected) });

    await expect(resolveScopedProjectManifest({ contentService, projectId: expected.id })).resolves.toEqual(expected);
    expect(contentService.resolve).toHaveBeenCalledWith('tau.json', { forceText: true });
  });

  it('should reject malformed manifests', async () => {
    const contentService = mock<FileContentService>();
    contentService.resolve.mockResolvedValue({ kind: 'text', content: new TextEncoder().encode('{') });

    await expect(resolveScopedProjectManifest({ contentService, projectId: project('Current').id })).rejects.toThrow(
      'Invalid tau.json',
    );
  });

  it('should reject a manifest whose ID does not match the scoped project', async () => {
    const contentService = mock<FileContentService>();
    const expectedId = project('Current').id;
    const receivedId = 'proj_abcdefghijklmnopqrstu';
    contentService.resolve.mockResolvedValue({
      kind: 'text',
      content: serializeProjectManifest({ ...project('Other'), id: receivedId }),
    });

    await expect(resolveScopedProjectManifest({ contentService, projectId: expectedId })).rejects.toThrow(
      `expected ${expectedId}, received ${receivedId}`,
    );
  });

  it.each(['orphaned', 'loading'] as const)('should reject a %s manifest outcome', async (kind) => {
    const contentService = mock<FileContentService>();
    contentService.resolve.mockResolvedValue({ kind });

    await expect(resolveScopedProjectManifest({ contentService, projectId: project('Current').id })).rejects.toThrow(
      `Cannot read tau.json`,
    );
  });
});
