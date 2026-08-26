import { useEffect } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { projectToManifest } from '@taucad/types';
import type { ProjectRouteAccess } from '#hooks/use-project-manager.js';

const projectA = 'proj_aaaaaaaaaaaaaaaaaaaaa';
const projectB = 'proj_bbbbbbbbbbbbbbbbbbbbb';
const projectC = 'proj_ccccccccccccccccccccc';

let currentProjectId = projectA;
const getProjectRouteAccess = vi.fn<(projectId: string) => Promise<ProjectRouteAccess>>();
const restoreProject = vi.fn<(projectId: string) => Promise<void>>();
const projectManager = {
  getProjectRouteAccess,
  restoreProject,
};
const mounts: string[] = [];
const unmounts: string[] = [];
const fileManagerInputs: Array<{ projectId: string; rootDirectory: string }> = [];
const projectProviderInputs: string[] = [];

vi.mock('#hooks/use-project-manager.js', () => ({
  useProjectManager: () => projectManager,
}));

vi.mock('#hooks/use-file-manager.js', () => ({
  SharedWorkerGate: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  HomeFileManagerProvider: ({
    children,
    projectId,
    rootDirectory,
  }: React.PropsWithChildren<{ projectId: string; rootDirectory: string }>) => {
    fileManagerInputs.push({ projectId, rootDirectory });
    useEffect(() => {
      mounts.push(projectId);
      return () => {
        unmounts.push(projectId);
      };
    }, [projectId]);
    return (
      <div data-testid='project-session' data-project-id={projectId}>
        {children}
      </div>
    );
  },
}));

vi.mock('#hooks/use-project.js', () => ({
  ProjectProvider: ({ children, projectId }: React.PropsWithChildren<{ projectId: string }>) => {
    projectProviderInputs.push(projectId);
    return <div>{children}</div>;
  },
  useProject: vi.fn(),
}));
vi.mock('#hooks/use-chat-rpc-socket.js', () => ({
  ChatRpcSocketProvider: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('#hooks/use-monaco-model-service.js', () => ({
  MonacoModelServiceProvider: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('#hooks/use-webgl-context-tracker.js', () => ({
  WebglContextTrackerProvider: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('#routes/w.$workspace.$project/revision-provider.js', () => ({
  RevisionProvider: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('#routes/w.$workspace.$project/project-chat-rpc-bindings.js', () => ({ ProjectChatRpcBindings: () => null }));
vi.mock('#routes/w.$workspace.$project/project-name-editor.js', () => ({ ProjectNameEditor: () => null }));
vi.mock('#routes/w.$workspace.$project/project-command-items.js', () => ({ ProjectCommandPaletteItems: () => null }));
vi.mock('#routes/w.$workspace.$project/project-export-action.js', () => ({ ProjectExportAction: () => null }));
vi.mock('#routes/w.$workspace.$project/project-share-action.js', () => ({ ProjectShareAction: () => null }));
vi.mock('#routes/w.$workspace.$project/active-revision-indicator.js', () => ({ RevisionChip: () => null }));
vi.mock('#routes/w.$workspace.$project/chat-interface.js', () => ({ ChatInterface: () => null }));
vi.mock('#routes/w.$workspace.$project/project-not-found.js', () => ({
  ProjectNotFound: () => <div>Project Not Found</div>,
}));
vi.mock('#routes/w.$workspace.$project/project-load-error.js', () => ({
  ProjectLoadError: ({ onReload }: { readonly onReload: () => void }) => (
    <div>
      Project access failed
      <button type='button' onClick={onReload}>
        Retry project
      </button>
    </div>
  ),
}));

const routeModulePromise = import('./project-route.js');

const project = (id: string) =>
  projectToManifest({
    id,
    name: id,
    description: '',
    tags: [],
    assets: { main: { entryPath: 'main.ts' } },
  });

const ready = (id: string): ProjectRouteAccess => ({
  status: 'ready',
  project: project(id),
});

const trashed = (id: string): ProjectRouteAccess => ({
  status: 'trashed',
  project: project(id),
});

const deferred = <T,>(): { promise: Promise<T>; resolve: (value: T) => void } => {
  let resolveDeferred!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    resolveDeferred = resolve;
  });
  return { promise, resolve: resolveDeferred };
};

/**
 * Both route shapes render `<ProjectRouteProviders>`: `/w/{workspace}/{project}`
 * after slug resolution and the legacy id resolver after its redirect. The gate
 * is therefore exercised through the shared component, parameterised by id.
 */
const renderRouteProvider = async (): Promise<{
  Provider: React.JSXElementConstructor<React.PropsWithChildren>;
  view: ReturnType<typeof render>;
}> => {
  const route = await routeModulePromise;
  const Provider = ({ children }: React.PropsWithChildren): React.JSX.Element => (
    <route.ProjectRouteProviders projectId={currentProjectId}>{children}</route.ProjectRouteProviders>
  );
  return {
    Provider,
    view: render(
      <Provider>
        <div>content</div>
      </Provider>,
    ),
  };
};

beforeEach(() => {
  currentProjectId = projectA;
  getProjectRouteAccess.mockReset();
  restoreProject.mockReset();
  mounts.length = 0;
  unmounts.length = 0;
  fileManagerInputs.length = 0;
  projectProviderInputs.length = 0;
});

describe('project route session identity', () => {
  it('should render only the route status while initial access is unresolved', async () => {
    const pendingA = deferred<ProjectRouteAccess>();
    getProjectRouteAccess.mockReturnValue(pendingA.promise);
    const { view } = await renderRouteProvider();

    expect(screen.getByRole('status', { name: 'Opening project' })).toBeInTheDocument();
    expect(screen.queryByTestId('project-session')).not.toBeInTheDocument();

    await act(async () => {
      pendingA.resolve(ready(projectA));
      await pendingA.promise;
    });
    await screen.findByTestId('project-session');
    expect(view.getByTestId('project-session')).toHaveAttribute('data-project-id', projectA);
  });

  it('should leave the initial loader for a retryable access error', async () => {
    getProjectRouteAccess.mockRejectedValueOnce(new Error('discovery failed')).mockResolvedValueOnce(ready(projectA));
    await renderRouteProvider();

    expect(await screen.findByText('Project access failed')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Opening project' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry project' }));
    expect(await screen.findByTestId('project-session')).toHaveAttribute('data-project-id', projectA);
  });

  it('should retain project A inertly until project B access commits', async () => {
    const pendingA = deferred<ProjectRouteAccess>();
    const pendingB = deferred<ProjectRouteAccess>();
    getProjectRouteAccess.mockImplementation(async (id) => (id === projectA ? pendingA.promise : pendingB.promise));
    const { Provider, view } = await renderRouteProvider();

    await act(async () => {
      pendingA.resolve(ready(projectA));
      await pendingA.promise;
    });
    expect(screen.getByTestId('project-session')).toHaveAttribute('data-project-id', projectA);

    currentProjectId = projectB;
    view.rerender(
      <Provider>
        <div>content</div>
      </Provider>,
    );

    const retainedSession = screen.getByTestId('project-session');
    const pendingOutcome = retainedSession.closest('[aria-busy="true"]');
    expect(retainedSession).toHaveAttribute('data-project-id', projectA);
    expect(pendingOutcome).toHaveAttribute('inert');
    expect(screen.getByRole('status', { name: 'Opening project' })).toBeInTheDocument();
    expect(unmounts).not.toContain(projectA);
    expect(fileManagerInputs.every((input) => input.projectId === projectA)).toBe(true);
    expect(fileManagerInputs.every((input) => input.rootDirectory === `/projects/${projectA}`)).toBe(true);
    expect(projectProviderInputs.every((id) => id === projectA)).toBe(true);

    await act(async () => {
      pendingB.resolve(ready(projectB));
      await pendingB.promise;
    });
    expect(screen.getByTestId('project-session')).toHaveAttribute('data-project-id', projectB);
    expect(unmounts.filter((id) => id === projectA)).toHaveLength(1);
    expect(mounts.filter((id) => id === projectB)).toHaveLength(1);
  });

  it('should commit only project C during rapid A to B to C navigation', async () => {
    const pendingB = deferred<ProjectRouteAccess>();
    const pendingC = deferred<ProjectRouteAccess>();
    getProjectRouteAccess.mockImplementation(async (id) => {
      if (id === projectA) {
        return ready(projectA);
      }
      return id === projectB ? pendingB.promise : pendingC.promise;
    });
    const { Provider, view } = await renderRouteProvider();
    await screen.findByTestId('project-session');

    await act(async () => {
      currentProjectId = projectB;
      view.rerender(<Provider>content</Provider>);
    });
    await act(async () => {
      currentProjectId = projectC;
      view.rerender(<Provider>content</Provider>);
    });

    expect(screen.getByTestId('project-session')).toHaveAttribute('data-project-id', projectA);

    await act(async () => {
      pendingC.resolve(ready(projectC));
      await pendingC.promise;
    });
    expect(screen.getByTestId('project-session')).toHaveAttribute('data-project-id', projectC);
    await act(async () => {
      pendingB.resolve(ready(projectB));
      await pendingB.promise;
    });

    expect(screen.getByTestId('project-session')).toHaveAttribute('data-project-id', projectC);
    expect(mounts).not.toContain(projectB);
  });

  it.each([
    ['missing', 'Project Not Found'],
    ['conflict', 'This project ID exists in more than one directory.'],
    ['unavailable', 'The project storage location is currently unavailable.'],
  ] as const)('should render %s access without mounting project B resources', async (status, message) => {
    const pendingB = deferred<ProjectRouteAccess>();
    getProjectRouteAccess.mockImplementation(async (id) => (id === projectA ? ready(projectA) : pendingB.promise));
    const { Provider, view } = await renderRouteProvider();
    await screen.findByTestId('project-session');

    currentProjectId = projectB;
    view.rerender(<Provider>content</Provider>);

    await act(async () => {
      pendingB.resolve({ status });
      await pendingB.promise;
    });
    expect(screen.getByText(message, { exact: false })).toBeInTheDocument();
    expect(screen.queryByTestId('project-session')).not.toBeInTheDocument();
    expect(fileManagerInputs.some((input) => input.projectId === projectB)).toBe(false);
    expect(projectProviderInputs).not.toContain(projectB);
  });

  it.each([
    [
      {
        status: 'recovering',
        recovery: {
          operationId: 'req_recovery',
          projectId: projectB,
          kind: 'create',
          storage: { backend: 'opfs', providerBasePath: '/pending' },
          status: 'recovering',
        },
      } satisfies ProjectRouteAccess,
      'Tau is finishing this project.',
    ],
    [
      {
        status: 'recovery-failed',
        recovery: {
          operationId: 'req_recovery',
          projectId: projectB,
          kind: 'create',
          storage: { backend: 'opfs', providerBasePath: '/pending' },
          status: 'failed',
          reason: 'filesystem-error',
        },
      } satisfies ProjectRouteAccess,
      'Tau could not finish writing the project files.',
    ],
  ])('should render pending-operation access without mounting project resources', async (access, message) => {
    getProjectRouteAccess.mockResolvedValue(access);
    await renderRouteProvider();

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByTestId('project-session')).not.toBeInTheDocument();
  });

  it('should retain project A inertly when project B access rejects', async () => {
    getProjectRouteAccess.mockImplementation(async (id) => {
      if (id === projectA) {
        return ready(projectA);
      }
      throw new Error('discovery failed');
    });
    const { Provider, view } = await renderRouteProvider();
    await screen.findByTestId('project-session');

    currentProjectId = projectB;
    view.rerender(
      <Provider>
        <div>content</div>
      </Provider>,
    );

    expect(await screen.findByText('Project access failed')).toBeInTheDocument();
    expect(screen.getByTestId('project-session')).toHaveAttribute('data-project-id', projectA);
    expect(screen.getByTestId('project-session').closest('[inert]')).not.toBeNull();
    expect(unmounts).not.toContain(projectA);
  });

  it('should restore the project ID carried by the trashed result', async () => {
    getProjectRouteAccess.mockImplementation(async (id) => (id === projectA ? ready(projectA) : trashed(projectB)));
    restoreProject.mockResolvedValue();
    const { Provider, view } = await renderRouteProvider();
    await screen.findByTestId('project-session');

    currentProjectId = projectB;
    view.rerender(<Provider>content</Provider>);
    fireEvent.click(await screen.findByRole('button', { name: 'Restore Project' }));

    await waitFor(() => {
      expect(restoreProject).toHaveBeenCalledWith(projectB);
      expect(screen.getByTestId('project-session')).toHaveAttribute('data-project-id', projectB);
    });
  });

  it('should ignore pending access after the route gate unmounts', async () => {
    const pendingA = deferred<ProjectRouteAccess>();
    getProjectRouteAccess.mockReturnValue(pendingA.promise);
    const { view } = await renderRouteProvider();

    view.unmount();
    pendingA.resolve(ready(projectA));
    await act(async () => {
      await pendingA.promise;
    });

    expect(mounts).toEqual([]);
  });
});
