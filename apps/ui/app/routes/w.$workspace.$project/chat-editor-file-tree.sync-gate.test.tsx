// @vitest-environment jsdom
/**
 * The open pull's first window, in the Files tree (D28, S41, W13 P34).
 *
 * A second device opens a project whose files are still on the remote. The
 * scheduler's facet is the one signal the tree reads: while it says `checking`
 * the pull is inside its own 3 s window and the tree says so; the moment the
 * fetch answers — or that window elapses without one — the tree shows what this
 * device actually has. The three exits stay in `sync.machine`; nothing here is
 * a second copy of them.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import type { FileEntry } from '@taucad/types';
import type { SyncFacet } from '@taucad/revisions/sync-machine';
import { FileTreePanelBody } from '#routes/w.$workspace.$project/chat-file-tree.js';

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
  useFileTreeEntry: () => undefined,
}));
vi.mock('#hooks/use-keyboard.js', () => ({
  useKeybinding: () => ({ formattedKeyCombination: 'Enter' }),
}));
vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ projectRef: actorStub, editorRef: { ...actorStub, send: vi.fn() } }),
}));
vi.mock('#hooks/use-revision-status.js', () => ({
  useRevisionStatus: () => ({ sync: sync.current }),
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
    <TooltipProvider>
      <FileTreePanelBody />
    </TooltipProvider>,
  );
};

beforeEach(() => {
  tree.current = new Map<string, FileEntry>();
  sync.current = facet('backedUp');
});

describe('the Files tree while the open pull is running', () => {
  it('says it is checking rather than claiming the project is empty', () => {
    sync.current = facet('checking');

    renderTree();

    expect(screen.getByText('Checking…')).toBeInTheDocument();
    expect(screen.queryByText('No files available')).not.toBeInTheDocument();
  });

  it('renders the files the pull brought in as soon as it answers', () => {
    sync.current = facet('backedUp');
    tree.current = new Map<string, FileEntry>([arrived]);

    renderTree();

    expect(screen.getByRole('treeitem', { name: /bracket\.scad/u })).toBeInTheDocument();
    expect(screen.queryByText('Checking…')).not.toBeInTheDocument();
  });

  it('renders what this device has when the window elapses without an answer', () => {
    /* The 3 s exit, seen from here: the facet stops saying `checking` while the
     * fetch is still running, and the tree stops waiting with it (F16). */
    sync.current = facet('pending');

    renderTree();

    expect(screen.getByText('No files available')).toBeInTheDocument();
    expect(screen.queryByText('Checking…')).not.toBeInTheDocument();
  });

  it('says nothing about a remote a project does not have', () => {
    sync.current = facet('noRemote');

    renderTree();

    expect(screen.getByText('No files available')).toBeInTheDocument();
  });
});
