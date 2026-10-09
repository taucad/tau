// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { MemoryProvider } from '@taucad/filesystem/backend';
import type { FileContentResult } from '@taucad/fs-client/file-content-service';
import { ObservationService } from '@taucad/fs-client/observation-service';
import type { ObservationWatch } from '@taucad/fs-client/observation-service';
import { FileContentService } from '@taucad/fs-client/file-content-service';
import { WorkerChangeChannel } from '@taucad/fs-client/worker-change-channel';
import { WorkspacePathResolver } from '@taucad/fs-client/workspace-path-resolver';
import { RefreshGenerationGuard } from '@taucad/fs-client/refresh-generation-guard';
import type { ComposedViewClient } from '@taucad/fs-client/composed-view-client';
import { projectToManifest, serializeProjectManifest } from '@taucad/types';
import { ProjectProvider, useProject } from '#hooks/use-project.js';

const fixture = vi.hoisted(() => {
  const context = {
    rootDirectory: '',
    geometryUnits: new Map(),
    viewGraphics: new Map(),
    project: undefined,
    manifestIssue: undefined,
  };
  const actor = {
    getSnapshot: () => ({ context, matches: () => true }),
    send: vi.fn(),
    on: () => ({ unsubscribe: () => undefined }),
  };
  return {
    actor,
    watchReady: vi.fn<() => ObservationWatch>(),
    readFile: vi.fn<(path?: string) => Promise<Uint8Array<ArrayBuffer>>>(),
    query: { getQueryData: () => undefined, invalidateQueries: async () => undefined },
    parameter: { subscribeActors: () => () => undefined, actor: () => undefined },
  };
});
vi.mock('@xstate/react', () => ({
  useActorRef: () => fixture.actor,
  useSelector: <S, T>(actor: { getSnapshot(): S }, select: (snapshot: S) => T): T => select(actor.getSnapshot()),
}));
let actualContentService: FileContentService | undefined;
const contentObservations = new Map<string, ObservationService<FileContentResult>>();
const mockContentService = {
  observeContent: (path: string) => {
    let source = contentObservations.get(path);
    if (!source) {
      source = new ObservationService<FileContentResult>({
        resource: path,
        watch: () => fixture.watchReady(),
        read: async () => ({ kind: 'text', content: await fixture.readFile(path) }),
      });
      contentObservations.set(path, source);
    }
    return source;
  },
};
vi.mock('#hooks/use-file-manager.js', () => {
  const manager = {
    fileManagerRef: fixture.actor,
    get contentService() {
      return actualContentService ?? mockContentService;
    },
    readFile: fixture.readFile,
  };
  return { useFileManager: () => manager };
});
vi.mock('#hooks/use-project-manager.js', () => ({ useProjectManager: () => ({}) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => fixture.query }));
vi.mock('#services/parameter-set-service.js', () => ({ createParameterSetService: () => fixture.parameter }));
vi.mock('#lib/compute-reuse-preference.js', () => ({ useComputeReuseMode: () => 'local' }));
vi.mock('#machines/inspector.js', () => ({ inspect: undefined }));

it('should show manifest observation closure and retry without rewriting the healthy manifest', async () => {
  const project = projectToManifest({
    id: 'proj_123456789012345678901',
    name: 'Watch health',
    description: '',
    tags: [],
    assets: { main: { entryPath: 'main.ts' } },
  });
  Object.assign(fixture.actor.getSnapshot().context, { project });
  fixture.readFile.mockResolvedValue(serializeProjectManifest(project));
  const closed = Promise.withResolvers<void>();
  fixture.watchReady
    .mockReturnValueOnce({ ready: Promise.resolve(), closed: closed.promise, dispose: vi.fn() })
    .mockReturnValue({
      ready: Promise.resolve(),
      closed: new Promise<void>(() => {
        /* Keep the acknowledged watch open until disposal. */
      }),
      dispose: vi.fn(),
    });
  function Health(): React.JSX.Element {
    const current = useProject();
    return (
      <>
        <output>{current.manifestObservationError ?? 'healthy'}</output>
        <button
          type='button'
          onClick={() => {
            current.retryManifestObservation();
          }}
        >
          Retry
        </button>
      </>
    );
  }
  const mounted = render(
    <ProjectProvider projectId={project.id} profile='shared'>
      <Health />
    </ProjectProvider>,
  );
  await waitFor(() => {
    expect(fixture.readFile).toHaveBeenCalledTimes(1);
  });
  await act(async () => {
    closed.reject(new Error('Disconnected'));
  });
  await waitFor(() => {
    expect(screen.getByRole('status')).toHaveTextContent('Observation connection closed.');
  });
  act(() => {
    screen.getByRole('button', { name: 'Retry' }).click();
  });
  await waitFor(() => {
    expect(fixture.watchReady).toHaveBeenCalledTimes(2);
  });
  await waitFor(() => {
    expect(screen.getByRole('status')).toHaveTextContent('healthy');
  });
  expect(fixture.actor.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'repairManifest' }));
  mounted.unmount();
});

it('reloads the physical project manifest after held retry without accepting its cached predecessor', async () => {
  const project = projectToManifest({
    id: 'proj_123456789012345678901',
    name: 'Cached project',
    description: '',
    tags: [],
    assets: { main: { entryPath: 'main.ts' } },
  });
  Object.assign(fixture.actor.getSnapshot().context, { project, manifestIssue: undefined });
  fixture.actor.send.mockClear();
  const provider = new MemoryProvider();
  const oldBytes = serializeProjectManifest(project);
  await provider.writeFile('tau.json', oldBytes);
  const paths = new WorkspacePathResolver('/project');
  const proxy = mock<ComposedViewClient>();
  proxy.readFile.mockImplementation(async (path) => {
    const relative = paths.toRelativePath(path);
    if (relative === undefined) {
      throw new Error(`Unexpected project read: ${path}`);
    }
    return provider.readFile(relative);
  });
  const closed = Promise.withResolvers<void>();
  const ready = Promise.withResolvers<void>();
  let held = false;
  const channel = new WorkerChangeChannel({
    transport: {
      listen: () => () => undefined,
      watchReady: () => ({
        ready: held ? ready.promise : Promise.resolve(),
        closed: held
          ? new Promise<void>(() => {
              /* Remain open until the fixture owner releases its source. */
            })
          : closed.promise,
        unsubscribe: () => undefined,
      }),
    },
  });
  const content = new FileContentService({ proxy, paths, channel, refreshGuard: new RefreshGenerationGuard() });
  actualContentService = content;
  fixture.readFile.mockImplementation(async () => content.resolveBytes('tau.json'));
  expect(await content.resolveBytes('tau.json')).toEqual(oldBytes);
  expect(proxy.readFile).toHaveBeenCalledOnce();
  function Health(): React.JSX.Element {
    const current = useProject();
    return (
      <>
        <output>{current.manifestObservationError ?? 'healthy'}</output>
        <button type='button' onClick={current.retryManifestObservation}>
          Retry physical manifest
        </button>
      </>
    );
  }
  const mounted = render(
    <ProjectProvider projectId={project.id} profile='shared'>
      <Health />
    </ProjectProvider>,
  );
  try {
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('healthy');
      expect(proxy.readFile).toHaveBeenCalledTimes(2);
    });
    await act(async () => {
      closed.resolve();
    });
    await waitFor(() => {
      expect(screen.getByRole('status')).not.toHaveTextContent('healthy');
    });
    held = true;
    act(() => {
      screen.getByRole('button', { name: 'Retry physical manifest' }).click();
    });
    const freshBytes = serializeProjectManifest({ ...project, name: 'Physical project changed' });
    await provider.writeFile('tau.json', freshBytes);
    expect(await provider.readFile('tau.json')).toEqual(freshBytes);
    expect(await content.resolveBytes('tau.json')).toEqual(oldBytes);
    expect(fixture.actor.send).not.toHaveBeenCalledWith({ type: 'reloadProject' });
    await act(async () => {
      ready.resolve();
    });
    await waitFor(() => {
      expect(fixture.actor.send).toHaveBeenCalledWith({ type: 'reloadProject' });
    });
    expect(fixture.actor.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'repairManifest' }));
  } finally {
    mounted.unmount();
    actualContentService = undefined;
    content.dispose();
  }
});
