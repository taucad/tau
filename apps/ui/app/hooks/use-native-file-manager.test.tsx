// @vitest-environment jsdom
import { act, render, renderHook } from '@testing-library/react';
import { mock } from 'vitest-mock-extended';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopBridge } from '#filesystem/desktop-bridge.js';
import type { ProjectFileSystemConfig } from '#filesystem/handle-store.js';
import { toast } from '#components/ui/sonner.js';
import {
  NativeFileManagerIcon,
  revealProjectPathInFileManager,
  useOpenProjectInFileManager,
  useRevealInFileManager,
} from '#hooks/use-native-file-manager.js';

let bridge: DesktopBridge | undefined;
let config: ProjectFileSystemConfig | undefined;
const mockOpen = vi.fn(async (_path: string) => undefined);
const mockReveal = vi.fn(async (_path: string) => undefined);
const mockWorkspaceRoot = vi.fn(async (projectId: string) => `/home/${projectId}`);

vi.mock('#filesystem/desktop-bridge.js', () => ({
  desktopBridge: () => bridge,
  nodeHomeRoot: () => '/home',
}));
vi.mock('#filesystem/handle-store.js', () => ({
  getProjectFileSystemConfig: async () => config,
}));
vi.mock('#lib/agent-host-placement.js', () => ({
  desktopWorkspaceRoot: async (projectId: string) => mockWorkspaceRoot(projectId),
}));
vi.mock('#components/ui/sonner.js', () => ({ toast: { error: vi.fn() } }));

const directories = {
  openLabel: 'Open in Finder',
  openIcon: 'finder',
  revealLabel: 'Reveal in Finder',
  open: mockOpen,
  reveal: mockReveal,
} as const;

const project: Parameters<typeof useOpenProjectInFileManager>[0] = {
  id: 'proj_one',
  name: 'One',
  locator: {
    backend: 'node',
    storageRootKey: 'node:/picked',
    path: '/picked',
    relativeDirectory: 'one',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  bridge = mock<DesktopBridge>({ directories });
  config = {
    projectId: 'proj_one',
    backend: 'node',
    path: '/picked',
    providerBasePath: 'One',
  };
});

describe('revealProjectPathInFileManager', () => {
  it('should reveal a project-relative path under the project folder on disk', async () => {
    await revealProjectPathInFileManager('proj_one', 'src/./main.ts');
    expect(mockReveal).toHaveBeenCalledWith('/picked/One/src/main.ts');
  });

  it('should reveal the project folder itself for the root path and resolve Home projects', async () => {
    config = {
      projectId: 'proj_one',
      backend: 'node',
      providerBasePath: 'projects/One',
    };
    await revealProjectPathInFileManager('proj_one', '');
    expect(mockReveal).toHaveBeenCalledWith('/home/projects/One');
  });

  it('should refuse browser-stored projects, escaping paths and hosts without a file manager', async () => {
    await expect(revealProjectPathInFileManager('proj_one', '../outside')).rejects.toThrow();
    config = {
      projectId: 'proj_one',
      backend: 'indexeddb',
      providerBasePath: 'one',
    };
    await expect(revealProjectPathInFileManager('proj_one', 'main.ts')).rejects.toThrow('stored in the browser');
    bridge = undefined;
    await expect(revealProjectPathInFileManager('proj_one', 'main.ts')).rejects.toThrow('cannot open');
    expect(mockReveal).not.toHaveBeenCalled();
  });
});

describe('useRevealInFileManager', () => {
  it('should be absent without a native file manager or an open project', () => {
    expect(renderHook(() => useRevealInFileManager(undefined)).result.current).toBeUndefined();
    bridge = undefined;
    expect(renderHook(() => useRevealInFileManager('proj_one')).result.current).toBeUndefined();
  });

  it('should use the host label and report failures by file name', async () => {
    const { result } = renderHook(() => useRevealInFileManager('proj_one'));
    expect(result.current).toMatchObject({
      label: 'Reveal in Finder',
      icon: 'finder',
    });
    mockReveal.mockRejectedValueOnce(new Error('ENOENT'));
    await result.current?.reveal('src/main.ts');
    expect(toast.error).toHaveBeenCalledWith('Could not reveal main.ts', {
      description: 'ENOENT',
    });
  });
});

describe('useOpenProjectInFileManager', () => {
  it('should open a disk-backed project folder and report failures', async () => {
    const { result } = renderHook(() => useOpenProjectInFileManager(project));
    expect(result.current).toMatchObject({
      label: 'Open in Finder',
      icon: 'finder',
      isOpening: false,
    });
    await act(async () => result.current?.open());
    expect(mockOpen).toHaveBeenCalledWith('/home/proj_one');
    mockOpen.mockRejectedValueOnce(new Error('Folder is unavailable'));
    await act(async () => result.current?.open());
    expect(toast.error).toHaveBeenCalledWith('Could not open One', {
      description: 'Folder is unavailable',
    });
  });

  it('should be absent for browser-stored projects', () => {
    const stored: typeof project = {
      ...project,
      locator: {
        backend: 'indexeddb',
        storageRootKey: 'indexeddb:tau',
        relativeDirectory: 'one',
      },
    };
    expect(renderHook(() => useOpenProjectInFileManager(stored)).result.current).toBeUndefined();
  });
});

describe('NativeFileManagerIcon', () => {
  it.each([
    ['finder', 'use[href="#finder"]'],
    ['file-explorer', '.lucide-panels-top-left'],
    ['folder', '.lucide-folder-open'],
  ] as const)('should draw the %s glyph', (icon, selector) => {
    const { container } = render(<NativeFileManagerIcon icon={icon} />);
    expect(container.querySelector(selector)).toBeInTheDocument();
  });
});
