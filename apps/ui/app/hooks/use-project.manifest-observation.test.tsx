// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
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
    watchReady: vi.fn(),
    readFile: vi.fn(),
    query: { getQueryData: () => undefined, invalidateQueries: async () => undefined },
    parameter: { subscribeActors: () => () => undefined, actor: () => undefined },
  };
});
vi.mock('@xstate/react', () => ({
  useActorRef: () => fixture.actor,
  useSelector: <S, T>(actor: { getSnapshot(): S }, select: (snapshot: S) => T): T => select(actor.getSnapshot()),
}));
vi.mock('#hooks/use-file-manager.js', () => {
  const manager = {
    fileManagerRef: fixture.actor,
    contentService: { watchReady: fixture.watchReady },
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
