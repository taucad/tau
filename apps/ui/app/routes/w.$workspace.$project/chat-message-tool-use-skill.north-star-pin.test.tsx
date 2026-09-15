// @vitest-environment jsdom
/**
 * Red pin for the workspace-filesystem north star, wave W0 — **green in W4**.
 *
 * The pin reproduced the click that rendered "File not found": a skill row
 * linked a system skill bundle path that only the agent's overlay could serve, and
 * dispatched it as an ordinary writable project file.
 *
 * W2 made the bytes resolvable through the composed view
 * (`apps/libs/fs-client/src/file-content-service.test.ts`) and W4 owns the
 * dispatch. Widened per the W0 review's F3 from "the event the click sends" to
 * the outcome a user sees: the pane can list the path the link names, it is
 * described read-only there, and the click opens it read-only and reveals it.
 *
 * The editor pane's own "File not found" is not asserted here — the Files pane
 * never renders that string, so the clause was vacuous (a1 review R10); the
 * bytes half is W2's `file-content-service.test.ts` and the rendered editor is
 * in `evidence/browser-check.md`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { systemSkillBundles } from '@taucad/skills/resources';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import type { ToolInvocation } from '@taucad/chat';
import type { toolName } from '@taucad/chat/constants';
import type { FileEntry, FileProvenance } from '@taucad/types';
import { ChatMessageToolUseSkill } from '#routes/w.$workspace.$project/chat-message-tool-use-skill.js';
import { FileTreePanelBody } from '#routes/w.$workspace.$project/chat-file-tree.js';

type UseSkillInvocation = ToolInvocation<typeof toolName.useSkill>;

const editorSend = vi.hoisted(() => vi.fn());
const treeSnapshot = vi.hoisted(() => ({ current: new Map<string, FileEntry>() }));

const actorStub = vi.hoisted(() => {
  const snapshot = { context: { project: { id: 'project-1' }, openFiles: [] as unknown[], activePaneId: undefined } };
  return {
    getSnapshot: () => snapshot,
    subscribe: () => ({ unsubscribe: () => undefined }),
    on: () => ({ unsubscribe: () => undefined }),
  };
});

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ projectRef: actorStub, editorRef: { ...actorStub, send: editorSend } }),
}));
vi.mock('#hooks/use-cookie.js', () => ({ useCookie: () => [true, vi.fn(), vi.fn()] }));
vi.mock('#hooks/use-file-tree.js', () => ({
  useFileTreeMap: () => treeSnapshot.current,
  useFileTreeEntry: () => undefined,
}));
vi.mock('#hooks/use-keyboard.js', () => ({ useKeybinding: () => ({ formattedKeyCombination: 'Enter' }) }));
vi.mock('#hooks/use-revision-status.js', () => ({ useRevisionStatus: () => undefined }));
vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({
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

/** The bundle the `use_skill` tool advertises, and the path it advertises for it. */
const bundle = systemSkillBundles[0]!;
const skillPath = `.agents/skills/${bundle.slug}/${bundle.files[0]!.path}`;

/** What the composed view answers for every byte the overlay serves (W2). */
const overlayProvenance: FileProvenance = {
  source: 'system-skills',
  versioned: false,
  agentAccess: 'read-only',
  identity: `skill:${bundle.slug}@${bundle.version}#${bundle.fingerprint}`,
};

const readSkillPart = (): UseSkillInvocation => ({
  toolCallId: 'skill',
  state: 'output-available',
  input: { skillName: bundle.slug },
  output: {
    skillName: bundle.slug,
    resourceUri: `system:skills/${bundle.slug}/SKILL.md`,
    skillPath,
    source: 'system',
    fingerprint: bundle.fingerprint,
    frontmatter: {},
    content: bundle.body,
    supportingFiles: [],
  },
});

const composedRow = (path: string, type: 'dir' | 'file'): [string, FileEntry] => [
  path,
  type === 'dir'
    ? {
        path,
        name: path.split('/').pop() ?? path,
        type: 'dir',
        size: 0,
        mtimeMs: 0,
        isLoaded: true,
        isDirectoryResolved: true,
        provenance: path.startsWith(`.agents/skills/${bundle.slug}`)
          ? overlayProvenance
          : { source: 'project', versioned: true, agentAccess: 'read-write' },
      }
    : {
        path,
        name: path.split('/').pop() ?? path,
        type: 'file',
        size: bundle.body.length,
        mtimeMs: 0,
        isLoaded: true,
        contentKind: 'text',
        lineCount: 1,
        provenance: overlayProvenance,
      },
];

beforeEach(() => {
  editorSend.mockClear();
  treeSnapshot.current = new Map<string, FileEntry>([
    composedRow('.agents', 'dir'),
    composedRow('.agents/skills', 'dir'),
    composedRow(`.agents/skills/${bundle.slug}`, 'dir'),
    composedRow(skillPath, 'file'),
  ]);
});

describe('system skill row links (north star W0, green in W4)', () => {
  it('opens a system skill bundle file as a read-only entry and reveals it', async () => {
    render(<ChatMessageToolUseSkill part={readSkillPart()} />);

    await userEvent.click(screen.getByRole('button', { name: bundle.slug }));

    expect(editorSend).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'openFile', path: skillPath, readOnly: true }),
    );
    expect(editorSend).toHaveBeenCalledWith(expect.objectContaining({ type: 'revealFileInTree', path: skillPath }));
  });

  it('lists the linked bundle file in the Files pane, described read-only', async () => {
    render(
      <TooltipProvider>
        <FileTreePanelBody />
      </TooltipProvider>,
    );

    await userEvent.click(screen.getByRole('treeitem', { name: '.agents' }));
    await userEvent.click(screen.getByRole('treeitem', { name: 'skills' }));
    await userEvent.click(screen.getByRole('treeitem', { name: bundle.slug }));

    const bundleRoot = screen.getByRole('treeitem', { name: bundle.slug });
    expect(within(bundleRoot).getByText('system')).toBeInTheDocument();

    const fileRow = screen.getByRole('treeitem', { name: skillPath.split('/').pop()! });
    expect(fileRow).toHaveAccessibleDescription('system skill · read-only');
  });
});
