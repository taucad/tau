// @vitest-environment jsdom
/** First-open intent keeps Files pending until authored checkout readiness is acknowledged. */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { render, screen } from '@testing-library/react';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import type { FileEntry } from '@taucad/types';
import type { SyncFacet } from '@taucad/revisions';
import { FileTreePanelBody } from '#routes/w.$workspace.$project/chat-file-tree.js';

const pending = vi.hoisted(() => ({ current: false }));
const tree = vi.hoisted(() => ({ current: new Map<string, FileEntry>() }));
const sync = vi.hoisted(() => {
  const initial: SyncFacet = {
    state: 'backedUp',
    pendingCount: 0,
    online: true,
    conflictRef: undefined,
    error: undefined,
    reason: undefined,
  };
  return { current: initial };
});

const actorStub = vi.hoisted(() => {
  const snapshot = {
    context: { project: { id: 'project-1' }, openFiles: [] as unknown[], activePaneId: undefined },
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: () => ({ unsubscribe: () => undefined }),
    on: () => ({ unsubscribe: () => undefined }),
  };
});

vi.mock('#hooks/use-file-tree.js', () => ({
  useFileTreeMap: () => tree.current,
  useFileTreeSelector: <T,>(select: (snapshot: typeof tree.current) => T): T => select(tree.current),
  useFileTreeEntry: () => undefined,
}));
vi.mock('@taucad/ui/components/keyboard', () => ({
  useKeybinding: () => ({ formattedKeyCombination: 'Enter' }),
}));
vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({
    projectId: 'project-1',
    projectRef: actorStub,
    editorRef: { ...actorStub, send: vi.fn() },
    viewRecords: new Map(),
    changeEntryPaths: async () => true,
  }),
}));
vi.mock('#workbench-records/view-actions.js', () => ({
  useWorkbenchViewCommands: () => ({
    edit: async () => true,
    remove: async () => true,
  }),
}));
vi.mock('#hooks/use-cloud-projects.js', () => ({
  useTauCloudIntent: () => (pending.current ? 'open' : undefined),
  canOpenCloudProject: () => true,
}));
vi.mock('#hooks/use-revision-status.js', () => ({
  useRevisionCommands: () => ({ connectRemote: vi.fn(), syncNow: vi.fn() }),
  useRevisionClient: () => undefined,
  useRevisionStatus: () => ({ sync: sync.current, remote: { phase: 'connected' } }),
}));
vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({
    client: { overrideUnit: vi.fn() },
    contentService: undefined,
    treeService: undefined,
    runtimeFileSystem: undefined,
    readFile: vi.fn(),
    writeFile: vi.fn(),
    renameFile: vi.fn(),
    duplicateFile: vi.fn(),
    deleteFile: vi.fn(),
    getZippedDirectory: vi.fn(),
    createDirectory: vi.fn(),
    deleteDirectory: vi.fn(),
    bulkMove: vi.fn(),
    canMove: vi.fn(),
    canRename: vi.fn(),
    canCreate: vi.fn(),
    canDelete: vi.fn(),
  }),
}));

const facet = (state: SyncFacet['state']): SyncFacet => ({
  state,
  pendingCount: 0,
  online: true,
  conflictRef: undefined,
  error: undefined,
  reason: undefined,
});

const arrived: [string, FileEntry] = [
  'bracket.scad',
  {
    path: 'bracket.scad',
    name: 'bracket.scad',
    type: 'file',
    size: 12,
    mtimeMs: 0,
    isLoaded: true,
    contentKind: 'text',
    lineCount: 1,
  },
];

const renderTree = (): void => {
  render(
    <MemoryRouter>
      <TooltipProvider>
        <FileTreePanelBody />
      </TooltipProvider>
    </MemoryRouter>,
  );
};

beforeEach(() => {
  tree.current = new Map<string, FileEntry>();
  sync.current = facet('backedUp');
  pending.current = false;
});

describe('the Files tree while the open pull is running', () => {
  it('should keep connecting rather than claim the project is empty', () => {
    pending.current = true;
    sync.current = facet('checking');

    renderTree();

    expect(screen.getByRole('region', { name: 'Connecting to Tau Cloud' })).toBeInTheDocument();
    expect(screen.queryByText('No files available')).not.toBeInTheDocument();
  });

  it('renders the files the pull brought in as soon as it answers', () => {
    sync.current = facet('backedUp');
    tree.current = new Map<string, FileEntry>([arrived]);

    renderTree();

    expect(screen.getByRole('treeitem', { name: /bracket\.scad/u })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Connecting to Tau Cloud' })).not.toBeInTheDocument();
  });

  it('should keep waiting after checking expires while the first download remains pending', () => {
    pending.current = true;
    sync.current = { ...facet('pending'), pullPhase: 'fetching' };

    renderTree();

    expect(screen.getByRole('region', { name: 'Downloading project files' })).toBeInTheDocument();
    expect(screen.queryByText('No files available')).not.toBeInTheDocument();
  });

  it('says nothing about a remote a project does not have', () => {
    sync.current = facet('noRemote');

    renderTree();

    expect(screen.getByText('No files available')).toBeInTheDocument();
  });
});
