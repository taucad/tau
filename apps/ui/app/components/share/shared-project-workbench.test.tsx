import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SharedProjectHydrator } from '#components/share/shared-project-workbench.js';

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

vi.mock('#hooks/use-project.js', () => ({
  ProjectProvider: ({ children }: { readonly children: React.JSX.Element }): React.JSX.Element => children,
  useProject: vi.fn(),
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
  WorkbenchDockview: () => null,
}));

vi.mock('#components/share/publication-topbar.js', () => ({
  PublicationTopbar: () => null,
}));

const sharedFiles = {
  'main.ts': { content: new Uint8Array([1]) },
  'lib/profile.ts': { content: new Uint8Array([2]) },
  'tau.json': { content: new Uint8Array([3]) },
  'package.json': { content: new Uint8Array([4]) },
  '.tau/parameters/main.ts.json': { content: new Uint8Array([5]) },
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
    });
    expect(fileManager.writeFiles).toHaveBeenCalledWith(sharedFiles);
    expect(fileManager.clientWriteFiles).not.toHaveBeenCalled();

    rendered.unmount();
    expect(fileManager.unmount).toHaveBeenCalledWith('/previews/shared-test');
  });
});
