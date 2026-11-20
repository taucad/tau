import { describe, it, expect } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { act, render, screen, waitFor } from '@testing-library/react';
import { Document } from '@tiptap/extension-document';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Text } from '@tiptap/extension-text';
import type { Editor, JSONContent } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import type { FileTreeService } from '@taucad/fs-client/file-tree-service';
import { FileServicesProvider } from '#hooks/use-file-services.js';
import type { FileServices } from '#hooks/use-file-services.js';
import { ContextChipNode } from '#components/chat/context-chip-node.js';

const existing = new Set(['src/parts/index.ts', 'src/assemblies/index.ts', 'models/bracket.scad']);
const treeListeners = new Set<() => void>();

const treeService = mock<FileTreeService>({
  getEntry: async (path: string) =>
    existing.has(path)
      ? { path, name: path.split('/').pop()!, type: 'file', size: 0, isLoaded: true, mtimeMs: 0 }
      : undefined,
  subscribeTree: (listener: () => void) => {
    treeListeners.add(listener);
    return () => treeListeners.delete(listener);
  },
});
const services: FileServices = { contentService: undefined, treeService };

const file = (path: string): JSONContent => ({
  type: 'contextChip',
  attrs: { id: path, label: path.split('/').pop(), chipType: 'file', path },
});

function Composer({
  content,
  onEditor,
}: {
  readonly content: JSONContent;
  readonly onEditor: (editor: Editor) => void;
}): React.JSX.Element {
  const editor = useEditor({
    extensions: [Document, Paragraph, Text, ContextChipNode],
    content,
    immediatelyRender: true,
  });
  onEditor(editor);
  return <EditorContent editor={editor} />;
}

const renderComposer = (chips: JSONContent[]): { readonly editor: () => Editor } => {
  let current: Editor | undefined;
  render(
    <FileServicesProvider value={services}>
      <TooltipProvider>
        <Composer
          content={{
            type: 'doc',
            content: [{ type: 'paragraph', content: chips.flatMap((chip) => [chip, { type: 'text', text: ' ' }]) }],
          }}
          onEditor={(editor) => {
            current = editor;
          }}
        />
      </TooltipProvider>
    </FileServicesProvider>,
  );
  return { editor: () => current! };
};

describe('ContextChipNode view', () => {
  it('adds the parent folder only to chips whose file names collide', async () => {
    renderComposer([file('src/parts/index.ts'), file('src/assemblies/index.ts'), file('models/bracket.scad')]);

    expect(await screen.findByText('parts/')).toBeInTheDocument();
    expect(screen.getByText('assemblies/')).toBeInTheDocument();
    expect(screen.queryByText('models/')).not.toBeInTheDocument();
  });

  it('drops the hint once the collision is gone', async () => {
    const { editor } = renderComposer([file('src/parts/index.ts'), file('src/assemblies/index.ts')]);
    await screen.findByText('parts/');

    act(() => {
      let second: number | undefined;
      editor().state.doc.descendants((node, position) => {
        if (node.attrs['path'] === 'src/assemblies/index.ts') {
          second = position;
        }
      });
      editor().chain().setNodeSelection(second!).deleteSelection().run();
    });

    await waitFor(() => {
      expect(screen.queryByText('parts/')).not.toBeInTheDocument();
    });
  });

  it('draws the node selection', async () => {
    const { editor } = renderComposer([file('models/bracket.scad')]);
    await screen.findByText('bracket.scad');

    act(() => {
      editor().commands.setNodeSelection(1);
    });

    await waitFor(() => {
      expect(screen.getByText('bracket.scad').closest('[data-selected]')).toHaveClass('ring-1');
    });
  });

  it('marks a chip whose file is no longer in the project', async () => {
    renderComposer([file('models/old-bracket.scad'), file('models/bracket.scad')]);

    await waitFor(() => {
      expect(screen.getByText('old-bracket.scad')).toHaveClass('line-through');
    });
    expect(screen.getByText('bracket.scad')).not.toHaveClass('line-through');
  });
});
