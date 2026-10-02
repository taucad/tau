import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { SharedProjectHydrator, SharedProjectWorkbench } from '#components/share/shared-project-workbench.js';
import type { ParsedPublication } from '#components/share/parsed-publication.js';

const fileManager = vi.hoisted(() => {
  let visiblePaths: string[] = [];
  let pendingPaths: string[] = [];
  let releaseRootListing: (() => void) | undefined;
  let rootListing: Promise<void> = Promise.resolve();

  const mount = vi.fn();
  const unmount = vi.fn();
  const clientWriteFiles = vi.fn();
  const writeFiles = vi.fn();
  const listDirectory = vi.fn();
  const whenServicesReady = vi.fn();

  const reset = (): void => {
    visiblePaths = ['node_modules'];
    pendingPaths = [];
    rootListing = new Promise<void>((resolve) => {
      releaseRootListing = resolve;
    });

    mount.mockReset().mockResolvedValue(undefined);
    unmount.mockReset();
    clientWriteFiles.mockReset().mockResolvedValue(undefined);
    writeFiles.mockReset().mockImplementation(async (files: Record<string, unknown>) => {
      pendingPaths = Object.keys(files);
    });
    listDirectory.mockReset().mockImplementation(async () => {
      await rootListing;
      visiblePaths = [...new Set([...visiblePaths, ...pendingPaths])].sort();
      return [];
    });
    whenServicesReady.mockReset().mockResolvedValue({ treeService: { listDirectory } });
  };

  return {
    clientWriteFiles,
    listDirectory,
    mount,
    releaseRootListing: () => {
      releaseRootListing?.();
    },
    reset,
    unmount,
    visiblePaths: () => visiblePaths,
    whenServicesReady,
    writeFiles,
  };
});

vi.mock('#hooks/use-file-manager.js', () => ({
  FileManagerProvider: ({ children }: { readonly children: React.JSX.Element }): React.JSX.Element => children,
  useFileManager: () => ({
    client: { writeFiles: fileManager.clientWriteFiles },
    workspace: { mount: fileManager.mount, unmount: fileManager.unmount },
    whenServicesReady: fileManager.whenServicesReady,
    writeFiles: fileManager.writeFiles,
  }),
}));

// Stands in for the provider that creates the kernel and its runtime worker.
const projectProvider = vi.hoisted(() => vi.fn());

vi.mock('#hooks/use-project.js', () => ({
  ProjectProvider: (props: { readonly children: React.JSX.Element; readonly profile: string }): React.JSX.Element => {
    projectProvider(props);
    return props.children;
  },
  useProject: vi.fn(),
  useParameterSetActor: () => undefined,
}));

vi.mock('@taucad/ui/hooks/use-mobile', () => ({
  useIsMobile: () => true,
}));

vi.mock('#hooks/use-monaco-model-service.js', () => ({
  MonacoModelServiceProvider: ({ children }: { readonly children: React.JSX.Element }): React.JSX.Element => children,
}));

vi.mock('#hooks/use-webgl-context-tracker.js', () => ({
  WebglContextTrackerProvider: ({ children }: { readonly children: React.JSX.Element }): React.JSX.Element => children,
}));

vi.mock('#routes/w.$workspace.$project/revision-provider.js', () => ({
  RevisionProvider: ({ children }: { readonly children: React.JSX.Element }): React.JSX.Element => children,
}));

vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', () => ({
  ProjectWorkspaceProvider: ({ children }: { readonly children: React.JSX.Element }): React.JSX.Element => children,
}));

vi.mock('#routes/w.$workspace.$project/chat-viewer-dockview.js', () => ({
  ViewerDockview: () => null,
}));

vi.mock('#routes/w.$workspace.$project/chat-workbench-dockview.js', () => ({
  WorkbenchDockview: () => <p>Workbench panes</p>,
}));

vi.mock('#components/share/fork-action.js', () => ({
  ForkAction: () => <button type='button'>Remix</button>,
}));

vi.mock('#routes/w.$workspace.$project/project-export-action.js', () => ({
  ProjectExportAction: () => <button type='button'>Export</button>,
}));

const sharedFiles = {
  'main.ts': { content: new Uint8Array([1]) },
  'lib/profile.ts': { content: new Uint8Array([2]) },
  'tau.json': { content: new Uint8Array([3]) },
  'package.json': { content: new Uint8Array([4]) },
  '.tau/parameters/main.ts.json': { content: new Uint8Array([5]) },
};

const publication: ParsedPublication = {
  id: 'pub_workbench',
  title: 'Workbench fixture',
  visibility: 'public',
  viewerRole: 'public',
  entryPath: 'main.ts',
  ownerSnapshot: null,
  forkCount: 0,
  viewCount: 0,
  createdAt: '2025-01-01T00:00:00.000Z',
};

const TreeProbe = (): React.JSX.Element => (
  <output data-testid='shared-tree'>{fileManager.visiblePaths().join('|')}</output>
);

describe('SharedProjectHydrator', () => {
  beforeEach(() => {
    fileManager.reset();
  });

  it('should expose every hydrated project file before rendering the shared workbench', async () => {
    const rendered = render(
      <SharedProjectHydrator
        files={sharedFiles}
        rootDirectory='/previews/shared-test'
        storageRootKey='memory:preview:shared-test'
      >
        <TreeProbe />
      </SharedProjectHydrator>,
    );

    expect(screen.getByRole('main', { name: 'Opening shared files' })).toBeInTheDocument();
    await waitFor(() => {
      expect(fileManager.listDirectory).toHaveBeenCalledWith('');
    });
    expect(screen.queryByTestId('shared-tree')).not.toBeInTheDocument();

    await act(async () => {
      fileManager.releaseRootListing();
    });

    expect(await screen.findByTestId('shared-tree')).toHaveTextContent(
      ['.tau/parameters/main.ts.json', 'lib/profile.ts', 'main.ts', 'node_modules', 'package.json', 'tau.json'].join(
        '|',
      ),
    );
    expect(fileManager.mount).toHaveBeenCalledWith('/previews/shared-test', {
      backend: 'memory',
      storageRootKey: 'memory:preview:shared-test',
      // RC6: the shared project's own files, hydrated into a throwaway root.
      class: 'authored',
    });
    expect(fileManager.writeFiles).toHaveBeenCalledWith(sharedFiles);
    expect(fileManager.clientWriteFiles).not.toHaveBeenCalled();

    rendered.unmount();
    expect(fileManager.unmount).toHaveBeenCalledWith('/previews/shared-test');
  });
});

const renderWorkbench = (viewedPublication: ParsedPublication = publication): ReturnType<typeof render> =>
  render(
    <TooltipProvider>
      <MemoryRouter>
        <SharedProjectWorkbench projectId='shared-test' publication={viewedPublication} hydratedFiles={sharedFiles} />
      </MemoryRouter>
    </TooltipProvider>,
  );

describe('SharedProjectWorkbench', () => {
  beforeEach(() => {
    fileManager.reset();
    projectProvider.mockReset();
    globalThis.sessionStorage.clear();
  });

  it('should not start a kernel for a shared model until the viewer chooses to run it', async () => {
    renderWorkbench();

    expect(screen.getByRole('main', { name: publication.title })).toBeInTheDocument();
    expect(screen.getByText(/executes that code in this browser/)).toBeInTheDocument();
    expect(projectProvider).not.toHaveBeenCalled();
    expect(fileManager.mount).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Run this model' }));
    await act(async () => {
      fileManager.releaseRootListing();
    });

    await waitFor(() => {
      expect(projectProvider).toHaveBeenCalledWith(expect.objectContaining({ profile: 'shared' }));
    });
  });

  it('should run the same shared model again in this session without asking', async () => {
    const first = renderWorkbench();
    await userEvent.click(screen.getByRole('button', { name: 'Run this model' }));
    first.unmount();
    projectProvider.mockReset();
    fileManager.reset();

    renderWorkbench();
    await act(async () => {
      fileManager.releaseRootListing();
    });

    expect(screen.queryByRole('button', { name: 'Run this model' })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(projectProvider).toHaveBeenCalled();
    });
  });

  it('should run a publication for its owner without asking', async () => {
    renderWorkbench({ ...publication, viewerRole: 'owner' });
    await act(async () => {
      fileManager.releaseRootListing();
    });

    expect(screen.queryByRole('button', { name: 'Run this model' })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(projectProvider).toHaveBeenCalled();
    });
  });

  it('should open the workbench drawer from a trigger in the top bar on phones', async () => {
    renderWorkbench();
    await userEvent.click(screen.getByRole('button', { name: 'Run this model' }));
    await act(async () => {
      fileManager.releaseRootListing();
    });

    // The viewer's bottom edge belongs to its controls, so the trigger sits in the top bar.
    await userEvent.click(within(await screen.findByRole('banner')).getByRole('button', { name: 'Workbench' }));

    const drawer = await screen.findByRole('dialog', { name: 'Project workbench' });
    expect(within(drawer).getByText('Workbench panes')).toBeInTheDocument();
  });
});
