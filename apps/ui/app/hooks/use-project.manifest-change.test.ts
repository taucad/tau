import { createProjectFixture } from '#lib/project.fixture.js';
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { projectToManifest, readProjectManifestBytes, serializeProjectManifest } from '@taucad/types';
import type { Project, ProjectManifestParseIssue } from '@taucad/types';
import type { FileContentService } from '@taucad/fs-client/file-content-service';
import { FileNotFoundError } from '@taucad/fs-client/file-content-errors';
import {
  createProjectManifestChangeObserver,
  parameterStageForSettlement,
  resolveScopedProjectManifest,
  shouldDispatchParameterSettlement,
} from '#hooks/use-project.js';

const project = (name: string): Project =>
  createProjectFixture({
    id: 'proj_123456789012345678901',
    name,
    description: '',
    tags: [],
    assets: { main: { entryPath: 'main.ts' } },
  });

const encode = (value: unknown): Uint8Array<ArrayBuffer> => new TextEncoder().encode(JSON.stringify(value));

const observe = ({
  current,
  issue,
  readManifest,
}: {
  readonly current: Project;
  readonly issue?: ProjectManifestParseIssue;
  readonly readManifest: () => Promise<Uint8Array<ArrayBuffer>>;
}) => {
  const reload = vi.fn();
  const report = vi.fn();
  const observer = createProjectManifestChangeObserver({
    projectId: current.id,
    getCurrent: () => ({ project: current, issue }),
    reload,
    report,
  });
  return { observer, readManifest, reload, report };
};

describe('createProjectManifestChangeObserver', () => {
  it('should retain the mounted manifest through malformed JSON and clear its issue when identical valid bytes return', async () => {
    const retained = createProjectFixture({
      ...project('Retained details'),
      assets: { main: { entryPath: 'assembly.scad' } },
    });
    const validBytes = serializeProjectManifest(projectToManifest(retained));
    let bytes = validBytes;
    const current: { project: Project; issue: ProjectManifestParseIssue | undefined } = {
      project: retained,
      issue: undefined,
    };
    const reload = vi.fn(() => {
      const read = readProjectManifestBytes(bytes);
      if (!read.success) {
        throw new Error('Expected a scoped manifest reading');
      }
      current.project = { ...read.data, id: retained.id };
      current.issue = read.issue;
    });
    const report = vi.fn((issue: ProjectManifestParseIssue) => {
      current.issue = issue;
    });
    const observer = createProjectManifestChangeObserver({
      projectId: retained.id,
      getCurrent: () => current,
      reload,
      report,
    });
    const readManifest = async (): Promise<Uint8Array<ArrayBuffer>> => bytes;
    try {
      await observer.check({ readManifest });
      expect(reload).not.toHaveBeenCalled();
      bytes = new TextEncoder().encode('{');
      await observer.check({ readManifest });
      expect.soft(current.project).toBe(retained);
      expect.soft(current.issue?.code).toBe('manifest-invalid-json');
      expect.soft(report).toHaveBeenCalledOnce();
      expect.soft(reload).not.toHaveBeenCalled();

      bytes = validBytes;
      await observer.check({ readManifest });
      expect(current.project).toEqual(retained);
      expect(current.issue).toBeUndefined();
      expect(reload).toHaveBeenCalledOnce();
      await observer.check({ readManifest });
      expect(reload).toHaveBeenCalledOnce();
    } finally {
      observer.dispose();
    }
  });

  it('does not report or reload a read invalidated before it resolves', async () => {
    const gate = Promise.withResolvers<Uint8Array<ArrayBuffer>>();
    const {
      observer,
      reload,
      report,
      readManifest: readObservedManifest,
    } = observe({
      current: project('Current'),
      readManifest: async () => gate.promise,
    });
    const pending = observer.check({ readManifest: readObservedManifest });
    observer.invalidate();
    gate.resolve(serializeProjectManifest(projectToManifest(project('Obsolete'))));
    await pending;
    expect(reload).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });

  it('does not reload when a local write matches the current project', async () => {
    const current = project('Current');
    const {
      observer,
      reload,
      report,
      readManifest: readObservedManifest,
    } = observe({
      current,
      readManifest: async () => serializeProjectManifest(projectToManifest(current)),
    });

    await observer.check({ readManifest: readObservedManifest });

    expect(reload).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });

  it('acknowledges first-open readiness only after the mounted manifest is reconciled', async () => {
    let current = project('Local placeholder');
    const remote = project('Remote project');
    const reload = vi.fn();
    const onSettled = vi.fn();
    const observer = createProjectManifestChangeObserver({
      projectId: current.id,
      getCurrent: () => ({ project: current, issue: undefined }),
      reload,
      report: vi.fn(),
      onSettled,
    });
    const readManifest = async (): Promise<Uint8Array<ArrayBuffer>> =>
      serializeProjectManifest(projectToManifest(remote));
    await observer.check({ readManifest });
    expect(reload).toHaveBeenCalledOnce();
    expect(onSettled).not.toHaveBeenCalled();
    current = remote;
    await observer.check({ readManifest });
    expect(onSettled).toHaveBeenCalledOnce();
    observer.dispose();
  });

  it('reloads an externally changed manifest once', async () => {
    const current = project('Current');
    const changed = project('External change');
    const {
      observer,
      reload,
      readManifest: readObservedManifest,
    } = observe({ current, readManifest: async () => serializeProjectManifest(projectToManifest(changed)) });

    await observer.check({ readManifest: readObservedManifest });
    await observer.check({ readManifest: readObservedManifest });

    expect(reload).toHaveBeenCalledOnce();
  });

  /* The incident: an agent added a second asset key while the project was
   * open, and the workspace carried on as if nothing had happened. */
  it('reloads a degraded write so its issue shows while the project is open', async () => {
    const current = project('Current');
    const degraded = encode({ ...current, assets: { ...current.assets, second: { entryPath: 'second.cs' } } });
    const {
      observer,
      reload,
      report,
      readManifest: readObservedManifest,
    } = observe({ current, readManifest: async () => degraded });

    await observer.check({ readManifest: readObservedManifest });

    expect(reload).toHaveBeenCalledOnce();
    expect(report).not.toHaveBeenCalled();
  });

  it.each([
    [
      'deleted',
      async () => {
        throw Object.assign(new Error('gone'), { code: 'ENOENT' });
      },
      'manifest-missing',
    ],
    [
      'deleted, as the file manager reports it',
      async () => {
        throw new FileNotFoundError("File 'tau.json' was not found", { path: 'tau.json' });
      },
      'manifest-missing',
    ],
    [
      'given a foreign $schema',
      async () => encode({ ...project('Current'), $schema: 'https://tau.new/schemas/tau-schema-v2.json' }),
      'manifest-unknown-schema',
    ],
  ] as const)('reports a manifest %s instead of reloading into an error', async (_case, readManifest, code) => {
    const {
      observer,
      reload,
      report,
      readManifest: readObservedManifest,
    } = observe({ current: project('Current'), readManifest });

    await observer.check({ readManifest: readObservedManifest });

    expect(reload).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ code }));
  });

  it('reloads to clear a report when the last good bytes return', async () => {
    const current = project('Current');
    const {
      observer,
      reload,
      readManifest: readObservedManifest,
    } = observe({
      current,
      issue: { code: 'manifest-missing' },
      readManifest: async () => serializeProjectManifest(projectToManifest(current)),
    });

    await observer.check({ readManifest: readObservedManifest });

    expect(reload).toHaveBeenCalledOnce();
  });

  it('ignores results that arrive after disposal', async () => {
    let resolveRead: ((bytes: Uint8Array<ArrayBuffer>) => void) | undefined;
    const {
      observer,
      reload,
      report,
      readManifest: readObservedManifest,
    } = observe({
      current: project('Current'),
      readManifest: async () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    });

    const pending = observer.check({ readManifest: readObservedManifest });
    observer.dispose();
    resolveRead?.(serializeProjectManifest(projectToManifest(project('External change'))));
    await pending;

    expect(reload).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });
});

describe('resolveScopedProjectManifest', () => {
  it('should attach the established route identity to an id-free declaration', async () => {
    const contentService = mock<FileContentService>();
    const expected = project('Current');
    contentService.resolve.mockResolvedValue({
      kind: 'text',
      content: serializeProjectManifest(projectToManifest(expected)),
    });

    await expect(resolveScopedProjectManifest({ contentService, projectId: expected.id })).resolves.toEqual({
      project: expected,
    });
    expect(contentService.resolve).toHaveBeenCalledWith('tau.json', { forceText: true });
  });

  it('should open a degraded manifest with its issue', async () => {
    const contentService = mock<FileContentService>();
    const current = project('Current');
    contentService.resolve.mockResolvedValue({
      kind: 'text',
      content: encode({ ...current, assets: { ...current.assets, second: { entryPath: 'second.cs' } } }),
    });

    await expect(resolveScopedProjectManifest({ contentService, projectId: current.id })).resolves.toEqual({
      project: current,
      /* oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vitest types asymmetric matchers as `any`. */
      issue: expect.objectContaining({ code: 'manifest-invalid' }),
    });
  });

  it('should open malformed JSON under the route id so the file can be fixed in place', async () => {
    const contentService = mock<FileContentService>();
    contentService.resolve.mockResolvedValue({ kind: 'text', content: new TextEncoder().encode('{') });

    await expect(
      resolveScopedProjectManifest({ contentService, projectId: project('Current').id }),
    ).resolves.toMatchObject({ project: { id: project('Current').id }, issue: { code: 'manifest-invalid-json' } });
  });

  it('should reject a manifest with a foreign $schema', async () => {
    const contentService = mock<FileContentService>();
    contentService.resolve.mockResolvedValue({
      kind: 'text',
      content: encode({ ...project('Current'), $schema: 'https://tau.new/schemas/tau-schema-v2.json' }),
    });

    await expect(resolveScopedProjectManifest({ contentService, projectId: project('Current').id })).rejects.toThrow(
      'Invalid tau.json',
    );
  });

  it('should keep route identity when reading a declaration serialized from another runtime project', async () => {
    const contentService = mock<FileContentService>();
    const expectedId = project('Current').id;
    contentService.resolve.mockResolvedValue({
      kind: 'text',
      content: serializeProjectManifest(projectToManifest({ ...project('Other'), id: 'proj_abcdefghijklmnopqrstu' })),
    });

    await expect(resolveScopedProjectManifest({ contentService, projectId: expectedId })).resolves.toEqual({
      project: { ...project('Other'), id: expectedId },
    });
  });

  it.each(['orphaned', 'loading'] as const)('should reject a %s manifest outcome', async (kind) => {
    const contentService = mock<FileContentService>();
    contentService.resolve.mockResolvedValue({ kind });

    await expect(resolveScopedProjectManifest({ contentService, projectId: project('Current').id })).rejects.toThrow(
      `Cannot read tau.json`,
    );
  });
});

describe('parameter record dispatch', () => {
  it('should stage a record whose bytes changed and whose values did not', () => {
    const encoder = new TextEncoder();
    const millimetres = encoder.encode(
      JSON.stringify({
        activeGroup: 'default',
        groups: { default: { values: { width: 21 }, units: { '/width': 'mm' } } },
      }),
    );
    const inches = encoder.encode(
      JSON.stringify({
        activeGroup: 'default',
        groups: { default: { values: { width: 21 }, units: { '/width': 'in' } } },
      }),
    );

    const outcome = {
      status: 'committed',
      requestId: 'own-write',
      revision: { manifestRevision: 'manifest' },
      write: 'applied',
    } as const;

    expect(parameterStageForSettlement({ entryPath: 'main.ts', outcome, bytes: millimetres })).not.toEqual(
      parameterStageForSettlement({ entryPath: 'main.ts', outcome, bytes: inches }),
    );
  });

  it('should not dispatch for a foreign record change', () => {
    expect(shouldDispatchParameterSettlement(undefined)).toBe(false);
    expect(
      shouldDispatchParameterSettlement({
        status: 'committed',
        requestId: 'no-op',
        revision: { manifestRevision: 'manifest' },
        write: 'authority-no-op',
      }),
    ).toBe(false);
    expect(
      shouldDispatchParameterSettlement({
        status: 'committed',
        requestId: 'own-write',
        revision: { manifestRevision: 'manifest' },
        write: 'applied',
      }),
    ).toBe(true);
  });

  it('should stage an own write that restores bytes seen before a foreign change', () => {
    const bytesA = new TextEncoder().encode('{"value":"A"}');
    const bytesB = new TextEncoder().encode('{"value":"B"}');
    const ownWrite = {
      status: 'committed',
      requestId: 'own-write',
      revision: { manifestRevision: 'manifest' },
      write: 'applied',
    } as const;

    expect(parameterStageForSettlement({ entryPath: 'main.ts', outcome: undefined, bytes: bytesB })).toBeUndefined();
    expect(parameterStageForSettlement({ entryPath: 'main.ts', outcome: ownWrite, bytes: bytesA })).toEqual({
      '.tau/parameters/main.ts.json': bytesA,
    });
  });
});
