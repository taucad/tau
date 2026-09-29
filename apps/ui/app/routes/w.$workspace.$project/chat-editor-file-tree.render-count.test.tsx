// @vitest-environment jsdom
/**
 * Row renders per tree publication in the Files tree.
 *
 * The tree service publishes a new snapshot for every write, including one
 * that only moves a file's size and mtime (a parameter commit, an agent
 * edit). Every row renders with the tree, so such a publication must not reach
 * it; a publication that adds, removes or relabels a row still must.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import type { ComponentProps } from 'react';
import { act, render, screen } from '@testing-library/react';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import type { FileEntry } from '@taucad/types';
import type * as HighlightTextModule from '#components/highlight-text.js';
import { FileTreePanelBody } from '#routes/w.$workspace.$project/chat-file-tree.js';

/** Row renders, counted where each file or folder row draws its name. */
const renders = vi.hoisted(() => ({ row: 0 }));

/** A `FileTreeService`-shaped store: the real hook reads it through `useSyncExternalStore`. */
const store = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  return {
    snapshot: new Map<string, FileEntry>(),
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

vi.mock('#components/highlight-text.js', async (importOriginal) => {
  const actual = await importOriginal<typeof HighlightTextModule>();
  return {
    ...actual,
    HighlightText: (props: ComponentProps<typeof actual.HighlightText>) => {
      renders.row += 1;
      return createElement(actual.HighlightText, props);
    },
  };
});
vi.mock('#hooks/use-keyboard.js', () => ({
  useKeybinding: () => ({ formattedKeyCombination: 'Enter' }),
}));
vi.mock('#hooks/use-revision-status.js', () => ({ useRevisionStatus: () => undefined }));
vi.mock('#workbench-records/view-actions.js', () => ({
  useWorkbenchViewCommands: () => ({
    edit: async () => true,
    remove: async () => true,
  }),
}));
vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ projectRef: actorStub, editorRef: { ...actorStub, send: vi.fn() } }),
}));
vi.mock('#hooks/use-file-manager.js', () => {
  const treeService = {
    subscribeTree: (callback: () => void) => store.subscribe(callback),
    getTreeSnapshot: () => store.snapshot,
    hasChildrenLoaded: () => true,
    listDirectory: async (): Promise<undefined> => undefined,
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

function file(path: string, size = 12): [string, FileEntry] {
  return [
    path,
    {
      path,
      name: path.split('/').pop() ?? path,
      type: 'file',
      size,
      mtimeMs: size,
      isLoaded: true,
      contentKind: 'text',
      lineCount: 1,
      provenance: { source: 'project', versioned: true, agentAccess: 'read-write' },
    },
  ];
}

const rows = ['main.scad', 'box.scad', 'parameters.json'];

function renderTree(): void {
  render(
    <TooltipProvider>
      <FileTreePanelBody />
    </TooltipProvider>,
  );
  expect(screen.getByRole('treeitem', { name: 'parameters.json' })).toBeInTheDocument();
  renders.row = 0;
}

beforeEach(() => {
  store.snapshot = new Map<string, FileEntry>(rows.map((path) => file(path)));
});

describe('Files tree row renders', () => {
  it('should not re-render any row when a listed file only changes content', () => {
    renderTree();

    /* A listing re-read mints new entries and provenance objects with the same facts. */
    act(() => {
      store.publish(new Map([...store.snapshot, file('parameters.json', 40)]));
    });

    expect(renders.row).toBe(0);
  });

  it('should re-render the rows when a file is added', () => {
    renderTree();

    act(() => {
      store.publish(new Map([...store.snapshot, file('part.scad')]));
    });

    expect(screen.getByRole('treeitem', { name: 'part.scad' })).toBeInTheDocument();
    expect(renders.row).toBeGreaterThan(0);
  });

  it('should re-render the rows when a file is removed', () => {
    renderTree();

    act(() => {
      const next = new Map(store.snapshot);
      next.delete('box.scad');
      store.publish(next);
    });

    expect(screen.queryByRole('treeitem', { name: 'box.scad' })).not.toBeInTheDocument();
    expect(renders.row).toBeGreaterThan(0);
  });

  it('should re-render the rows when a listed file changes provenance', () => {
    renderTree();

    act(() => {
      const [path, entry] = file('parameters.json');
      store.publish(
        new Map([
          ...store.snapshot,
          [path, { ...entry, provenance: { source: 'project', versioned: false, agentAccess: 'read-write' } }],
        ]),
      );
    });

    expect(renders.row).toBeGreaterThan(0);
  });
});
