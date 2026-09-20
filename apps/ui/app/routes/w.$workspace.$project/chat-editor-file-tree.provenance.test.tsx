// @vitest-environment jsdom
/**
 * Provenance presentation in the Files tree (north star W4).
 *
 * Every row reads `FileEntry.provenance` from the composed view and renders it
 * through one label catalog: no prefix test decides a label or an action.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import type { FileEntry, FileProvenance } from '@taucad/types';
import { FileTreePanelBody } from '#routes/w.$workspace.$project/chat-file-tree.js';

const tree = vi.hoisted(() => ({ current: new Map<string, FileEntry>() }));
const editorSend = vi.hoisted(() => vi.fn());
const overrideUnit = vi.hoisted(() => vi.fn(async () => undefined));

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
/* The tree reads the scheduler's facet for the open pull's first window (W13
 * P34); this suite is about provenance and renders outside a router. */
vi.mock('#hooks/use-revision-status.js', () => ({ useRevisionStatus: () => undefined }));
vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ projectRef: actorStub, editorRef: { ...actorStub, send: editorSend } }),
}));
vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({
    overrideUnit,
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

const overlay = (identity: string): FileProvenance => ({
  source: 'system-skills',
  versioned: false,
  agentAccess: 'read-only',
  identity,
});

const dependency: FileProvenance = { source: 'dependencies', versioned: false, agentAccess: 'read-only' };

const project = (versioned: boolean): FileProvenance => ({
  source: 'project',
  versioned,
  agentAccess: versioned ? 'read-write' : 'read-only',
});

const directory = (path: string, provenance?: FileProvenance): [string, FileEntry] => [
  path,
  {
    path,
    name: path.split('/').pop() ?? path,
    type: 'dir',
    size: 0,
    mtimeMs: 0,
    isLoaded: true,
    isDirectoryResolved: true,
    ...(provenance === undefined ? {} : { provenance }),
  },
];

const file = (path: string, provenance?: FileProvenance): [string, FileEntry] => [
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
    ...(provenance === undefined ? {} : { provenance }),
  },
];

const bundleIdentity = 'skill:cad-openscad@1.4.0#abc123';

beforeEach(() => {
  editorSend.mockClear();
  overrideUnit.mockClear();
  tree.current = new Map<string, FileEntry>([
    directory('.agents', project(true)),
    directory('.agents/skills', project(true)),
    directory('.agents/skills/cad-openscad', overlay(bundleIdentity)),
    file('.agents/skills/cad-openscad/SKILL.md', overlay(bundleIdentity)),
    directory('.tau', project(true)),
    directory('.tau/chats', project(false)),
    /* The root listing carries the mount as one stamped row (close-out W3), so
     * the lock and the dashed rail are anchored by provenance, not by a path. */
    directory('node_modules', dependency),
    directory('node_modules/three', dependency),
    file('node_modules/three/index.d.ts', dependency),
    file('main.scad', project(true)),
  ]);
});

const renderTree = (): void => {
  render(
    <TooltipProvider>
      <FileTreePanelBody />
    </TooltipProvider>,
  );
};

const expand = async (name: string): Promise<void> => {
  await userEvent.click(screen.getByRole('treeitem', { name }));
};

describe('Files tree provenance rows (north star W4)', () => {
  it('right-aligns a lowercase system badge without a redundant lock or mutation verbs', async () => {
    renderTree();
    await expand('.agents');
    await expand('skills');

    const row = screen.getByRole('treeitem', { name: 'cad-openscad' });
    expect(row).toHaveAccessibleDescription('system skill · read-only');
    expect(within(row).getByText('system')).toHaveClass('ml-auto');
    expect(row.querySelector('[data-provenance-glyph="lock"]')).toBeNull();

    await userEvent.pointer({ keys: '[MouseRight]', target: row });
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText('Read-only')).toBeInTheDocument();
    expect(within(menu).queryByText('Rename')).not.toBeInTheDocument();
    expect(within(menu).queryByText('Delete')).not.toBeInTheDocument();
  });

  /* Ruling P11: placing the whole bundle is the only override gesture, and it
   * lives on the unit root — not on a file inside it, and not on the mount. */
  it('offers Copy to project on a system skill bundle root and on nothing else', async () => {
    renderTree();
    await expand('.agents');
    await expand('skills');

    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByRole('treeitem', { name: 'cad-openscad' }) });
    await userEvent.click(within(await screen.findByRole('menu')).getByText('Copy to project'));

    expect(overrideUnit).toHaveBeenCalledWith('.agents/skills/cad-openscad');

    await userEvent.keyboard('{Escape}');
    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByRole('treeitem', { name: 'node_modules' }) });
    expect(within(await screen.findByRole('menu')).queryByText('Copy to project')).not.toBeInTheDocument();
  });

  it('dims a records row, keeps it collapsed and describes why it is not saved', async () => {
    renderTree();
    await expand('.tau');

    const row = screen.getByRole('treeitem', { name: 'chats' });
    expect(row).toHaveAccessibleDescription('Tau records · not saved in revisions');
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(within(row).getByText('chats')).toHaveClass('text-muted-foreground');
  });

  it('describes the dependency mount on its root row and leaves an ordinary project file plain', async () => {
    renderTree();

    const mount = screen.getByRole('treeitem', { name: 'node_modules' });
    expect(mount).toHaveAccessibleDescription('Dependencies · read-only');
    expect(mount.querySelector('[data-provenance-glyph="lock"]')).not.toBeNull();
    expect(screen.getByRole('treeitem', { name: 'main.scad' })).toHaveAccessibleDescription('');

    await expand('node_modules');
    const inside = screen.getByRole('treeitem', { name: 'three' });
    expect(inside).toHaveAccessibleDescription('Dependencies · read-only');
    expect(inside.querySelector('[data-provenance-glyph="lock"]')).toBeNull();
  });
});
