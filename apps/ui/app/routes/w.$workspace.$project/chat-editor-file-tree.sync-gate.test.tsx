// @vitest-environment jsdom
/** First-open intent keeps Files pending until authored checkout readiness is acknowledged. */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { fireEvent, render, screen } from '@testing-library/react';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import type { FileEntry } from '@taucad/types';
import type { ProjectReadiness, SyncFacet } from '@taucad/revisions';
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
const editorSend = vi.hoisted(() => vi.fn());
const readiness = vi.hoisted(() => ({ current: undefined as ProjectReadiness | undefined }));

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

// These fixtures describe an already loaded tree; root readiness has its own cases.
vi.mock('@taucad/fs-client/react/use-directory-listing', () => ({
  useDirectoryListing: () => ({ kind: 'ready', path: '', entries: [] }),
}));

vi.mock('@taucad/files-ui/hooks/use-file-tree', () => ({
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
    editorRef: { ...actorStub, send: editorSend },
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
}));
vi.mock('#lib/tau-cloud-intent.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  canOpenCloudProject: () => true,
}));
vi.mock('#hooks/use-revision-status.js', () => ({
  useRevisionCommands: () => ({ connectRemote: vi.fn(), syncNow: vi.fn() }),
  useRevisionClient: () => undefined,
  useRevisionStatus: () => ({ sync: sync.current, remote: { phase: 'connected' }, readiness: readiness.current }),
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
  readiness.current = undefined;
});

describe('the Files tree while the open pull is running', () => {
  it('should keep connecting rather than claim the project is empty', () => {
    pending.current = true;
    sync.current = facet('checking');

    renderTree();

    expect(screen.getByRole('region', { name: 'Opening project…' })).toBeInTheDocument();
    expect(screen.queryByText('No files available')).not.toBeInTheDocument();
  });

  it('renders the files the pull brought in as soon as it answers', () => {
    sync.current = facet('backedUp');
    tree.current = new Map<string, FileEntry>([arrived]);

    renderTree();

    expect(screen.getByRole('treeitem', { name: /bracket\.scad/u })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Opening project…' })).not.toBeInTheDocument();
  });

  it('should keep waiting after checking expires while the first download remains pending', () => {
    pending.current = true;
    sync.current = { ...facet('pending'), pullPhase: 'fetching' };

    renderTree();

    expect(screen.getByRole('region', { name: 'Downloading project files' })).toBeInTheDocument();
    expect(screen.queryByText('No files available')).not.toBeInTheDocument();
  });

  /* STO-25: the tree opens once the entry closure lands, not when the whole apply ends. */
  it('should list the tree once the entry closure lands, showing a file still to land as arriving (I7)', () => {
    pending.current = true;
    sync.current = { ...facet('pending'), pullPhase: 'applying' };
    readiness.current = 'entryReady';
    const arriving: [string, FileEntry] = [
      'gear.scad',
      { path: 'gear.scad', name: 'gear.scad', type: 'file', size: 300, mtimeMs: 0, isLoaded: false, pending: true },
    ];
    tree.current = new Map<string, FileEntry>([arrived, arriving]);

    renderTree();

    expect(screen.getByRole('treeitem', { name: /bracket\.scad/u })).toBeInTheDocument();
    const row = screen.getByRole('treeitem', { name: /gear\.scad/u });
    expect(row.querySelector('[data-arriving]')).not.toBeNull();
    expect(row).toHaveTextContent('Arriving');
    expect(screen.queryByRole('region', { name: 'Preparing files…' })).not.toBeInTheDocument();
  });

  /* An arriving row is not on disk yet: renaming, moving or making something inside it would act on nothing (I7). */
  it.each([
    [
      'file',
      { path: 'gear.scad', name: 'gear.scad', type: 'file', size: 300, mtimeMs: 0, isLoaded: false, pending: true },
    ],
    ['folder', { path: 'lib', name: 'lib', type: 'dir', size: 0, mtimeMs: 0, isLoaded: false, pending: true }],
  ] as const)('should offer no rename on an arriving %s', (_kind, entry) => {
    pending.current = true;
    sync.current = { ...facet('pending'), pullPhase: 'applying' };
    readiness.current = 'entryReady';
    tree.current = new Map<string, FileEntry>([arrived, [entry.path, { ...entry }]]);

    renderTree();

    const landedRow = screen.getByRole('treeitem', { name: /bracket\.scad/u });
    fireEvent.doubleClick(landedRow.querySelector('[style]') ?? landedRow);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });

    const row = screen.getByRole('treeitem', { name: new RegExp(entry.name, 'u') });
    fireEvent.doubleClick(row.querySelector('[style]') ?? row);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  /* An arriving file is read-only only until it lands: opening it must not pin its editor read-only for good. */
  it('should open an arriving file as an ordinary file, so its editor is writable once it lands', () => {
    pending.current = true;
    sync.current = { ...facet('pending'), pullPhase: 'applying' };
    readiness.current = 'entryReady';
    const arriving: [string, FileEntry] = [
      'gear.scad',
      { path: 'gear.scad', name: 'gear.scad', type: 'file', size: 300, mtimeMs: 0, isLoaded: false, pending: true },
    ];
    tree.current = new Map<string, FileEntry>([arrived, arriving]);
    editorSend.mockClear();

    renderTree();
    const row = screen.getByRole('treeitem', { name: /gear\.scad/u });
    fireEvent.click(row.querySelector('[style]') ?? row);

    expect(editorSend).toHaveBeenCalledWith(expect.objectContaining({ type: 'openFile', path: 'gear.scad' }));
    expect(editorSend).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'openFile', readOnly: true }));
  });

  it('should keep the tree waiting until the write has announced its entries', () => {
    pending.current = true;
    sync.current = { ...facet('pending'), pullPhase: 'applying' };
    readiness.current = 'treeReady';
    tree.current = new Map<string, FileEntry>([arrived]);

    renderTree();

    expect(screen.queryByRole('treeitem', { name: /bracket\.scad/u })).not.toBeInTheDocument();
  });

  it('should never say the project has no files while the apply has files still to land (I7)', () => {
    pending.current = true;
    sync.current = { ...facet('pending'), pullPhase: 'applying' };
    readiness.current = 'entryReady';

    renderTree();

    expect(screen.queryByText('No files available')).not.toBeInTheDocument();
  });

  /* I7: an apply that failed after its entry closure landed left a partial tree; the failure speaks, not the tree. */
  it('should show the failure, not the partial tree, when the open fails after the entry closure landed', () => {
    pending.current = true;
    sync.current = { ...facet('queued'), reason: 'offline' };
    readiness.current = 'entryReady';
    tree.current = new Map<string, FileEntry>([arrived]);

    renderTree();

    expect(screen.queryByRole('treeitem', { name: /bracket\.scad/u })).not.toBeInTheDocument();
    expect(screen.queryByText('No files available')).not.toBeInTheDocument();
  });

  it('says nothing about a remote a project does not have', () => {
    sync.current = facet('noRemote');

    renderTree();

    expect(screen.getByText('No files available')).toBeInTheDocument();
  });
});

describe('the empty Files tree on touch (PN-FIL-3)', () => {
  it('offers Upload files as its one clear action, so an empty project does not depend on dropping files', async () => {
    sync.current = facet('noRemote');
    renderTree();
    const picker = screen.getByLabelText<HTMLInputElement>('Upload files', { selector: 'input' });
    const openPicker = vi.spyOn(picker, 'click');

    screen.getByRole('button', { name: 'Upload files' }).click();

    expect(openPicker).toHaveBeenCalledOnce();
  });
});
