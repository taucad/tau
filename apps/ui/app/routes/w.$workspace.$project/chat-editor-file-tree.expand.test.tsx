// @vitest-environment jsdom
/**
 * Click-to-expand in the Files tree (close-out W4, Finding 5).
 *
 * The suite's other expansion assertions click a folder whose children are
 * already in the snapshot. Here the clicked folder has never been listed, so the
 * expansion also warms its listing: the row must expand, the warm must run only
 * once that expansion is on screen — never from inside the state updater, where
 * the listing's publication re-enters React mid-update — and the row must stay
 * expanded across the listing's resolution.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import type { FileEntry } from '@taucad/types';
import { FileTreePanelBody } from '#routes/w.$workspace.$project/chat-file-tree.js';

/** What the row already showed when its listing was asked for. */
const ariaExpandedOf = (path: string): string | undefined =>
  document.querySelector(`[data-file-tree-path="${path}"]`)?.getAttribute('aria-expanded') ?? undefined;

/** A `FileTreeService`-shaped store: the real hook reads it through `useSyncExternalStore`. */
const store = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  return {
    snapshot: new Map<string, FileEntry>(),
    loaded: new Set<string>(),
    listed: [] as Array<{ readonly path: string; readonly expandedOnScreen: string | undefined }>,
    pending: [] as Array<() => void>,
    publish(next: Map<string, FileEntry>): void {
      this.snapshot = next;
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe(callback: () => void): () => void {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
  };
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

vi.mock('#hooks/use-keyboard.js', () => ({
  useKeybinding: () => ({ formattedKeyCombination: 'Enter' }),
}));
vi.mock('#hooks/use-revision-status.js', () => ({ useRevisionStatus: () => undefined }));
vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ projectRef: actorStub, editorRef: { ...actorStub, send: vi.fn() } }),
}));
vi.mock('#hooks/use-file-manager.js', () => {
  const treeService = {
    subscribeTree: (callback: () => void) => store.subscribe(callback),
    getTreeSnapshot: () => store.snapshot,
    hasChildrenLoaded: (path: string) => store.loaded.has(path),
    /* The worker answers a listing in its own task, so the resolution is the suite's to release. */
    listDirectory: async (path: string): Promise<undefined> => {
      store.listed.push({ path, expandedOnScreen: ariaExpandedOf(path) });
      await new Promise<void>((resolve) => {
        store.pending.push(resolve);
      });
      store.loaded.add(path);
      store.publish(new Map([...store.snapshot, file(`${path}/part.scad`)]));
      return undefined;
    },
    scheduleRefresh: () => undefined,
  };
  const fileManager = {
    treeService,
    overrideUnit: vi.fn(),
    contentService: undefined,
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
  };
  return { useFileManager: () => fileManager, useOptionalFileManager: () => fileManager };
});

const directory = (path: string): [string, FileEntry] => [
  path,
  {
    path,
    name: path.split('/').pop() ?? path,
    type: 'dir',
    size: 0,
    mtimeMs: 0,
    isLoaded: false,
    isDirectoryResolved: false,
  },
];

function file(path: string): [string, FileEntry] {
  return [
    path,
    {
      path,
      name: path.split('/').pop() ?? path,
      type: 'file',
      size: 12,
      mtimeMs: 0,
      isLoaded: true,
      contentKind: 'text',
      lineCount: 1,
    },
  ];
}

beforeEach(() => {
  store.snapshot = new Map<string, FileEntry>([directory('src'), file('main.scad')]);
  store.loaded = new Set<string>(['']);
  store.listed = [];
  store.pending = [];
});

const releaseListings = async (): Promise<void> => {
  await act(async () => {
    for (const resolve of store.pending.splice(0)) {
      resolve();
    }
  });
};

describe('clicking a folder the tree has never listed', () => {
  it('should warm the listing only once the expansion is on screen', async () => {
    render(
      <TooltipProvider>
        <FileTreePanelBody />
      </TooltipProvider>,
    );

    await userEvent.click(screen.getByRole('treeitem', { name: 'src' }));

    expect(store.listed).toEqual([{ path: 'src', expandedOnScreen: 'true' }]);
  });

  it('should keep the folder expanded across the listing it warms', async () => {
    render(
      <TooltipProvider>
        <FileTreePanelBody />
      </TooltipProvider>,
    );

    await userEvent.click(screen.getByRole('treeitem', { name: 'src' }));
    expect(screen.getByRole('treeitem', { name: 'src' })).toHaveAttribute('aria-expanded', 'true');

    await releaseListings();

    expect(screen.getByRole('treeitem', { name: 'src' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('treeitem', { name: 'part.scad' })).toBeInTheDocument();
  });
});
