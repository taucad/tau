import { useEffect, useState } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import type { ReactNodeViewProps } from '@tiptap/react';
import { ReactNodeViewRenderer, NodeViewWrapper, useEditorState } from '@tiptap/react';
import { FileLink } from '#components/files/file-link.js';
import { ContextChip } from '#components/chat/context-chip.js';
import type { ChipType } from '#components/chat/context-chip.js';
import { useOptionalFileManager } from '#hooks/use-file-manager.js';

/** Whether a referenced file or folder is gone: asked once the tree is ready, and again whenever it changes. */
function usePathMissing(path: string | undefined): boolean {
  const treeService = useOptionalFileManager()?.treeService;
  const [isMissing, setIsMissing] = useState(false);
  useEffect(() => {
    if (!treeService || !path) {
      return undefined;
    }
    let cancelled = false;
    const check = async (): Promise<void> => {
      const entry = await treeService.getEntry(path);
      if (!cancelled) {
        setIsMissing(entry === undefined);
      }
    };
    void check();
    const unsubscribe = treeService.subscribeTree(check);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [treeService, path]);
  return isMissing;
}

/**
 * File-chip labels that name more than one path in the document, one per line
 * (a string, so the selector result compares by value).
 */
function ambiguousFileLabels(editor: Editor): string {
  const pathsByLabel = new Map<string, Set<string>>();
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'contextChip' && node.attrs['chipType'] === 'file' && node.attrs['path']) {
      const label = String(node.attrs['label']);
      pathsByLabel.set(label, (pathsByLabel.get(label) ?? new Set()).add(String(node.attrs['path'])));
    }
    return !node.isInline;
  });
  return [...pathsByLabel].flatMap(([label, paths]) => (paths.size > 1 ? [label] : [])).join('\n');
}

function ContextChipComponent({ node, deleteNode, selected, editor }: ReactNodeViewProps): React.JSX.Element {
  const label = String(node.attrs['label'] ?? '');
  const chipType = String(node.attrs['chipType'] ?? 'file') as ChipType;
  const path = String(node.attrs['path'] ?? '');
  const isLinkable = (chipType === 'file' || chipType === 'chat') && path;
  // ponytail: every file chip rescans the document per transaction; O(chips²), fine for a message's handful.
  const ambiguous = useEditorState({ editor, selector: ({ editor: current }) => ambiguousFileLabels(current) });
  const isAmbiguous = chipType === 'file' && path !== '' && ambiguous.split('\n').includes(label);
  const parent = isAmbiguous ? path.split('/').at(-2) : undefined;
  const isMissing = usePathMissing(chipType === 'file' || chipType === 'folder' ? path : undefined);

  const chip = (
    <ContextChip
      label={label}
      chipType={chipType}
      onRemove={deleteNode}
      isInteractive={Boolean(isLinkable) && !isMissing}
      isSelected={selected}
      isMissing={isMissing}
      detail={parent}
      tooltip={
        (chipType === 'file' || chipType === 'folder') && path
          ? isMissing
            ? `${path} — no longer in the project`
            : path
          : undefined
      }
    />
  );

  return (
    // Middle, not baseline: the wrapper's baseline follows the chip's first child, which swaps
    // from glyph to remove button on hover and would change the line height.
    <NodeViewWrapper as='span' className='inline-flex align-middle'>
      {isLinkable && !isMissing ? (
        <FileLink path={path} asChild>
          {chip}
        </FileLink>
      ) : (
        chip
      )}
    </NodeViewWrapper>
  );
}

export const ContextChipNode = Node.create({
  name: 'contextChip',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      id: { default: undefined },
      label: { default: undefined },
      chipType: { default: 'file' as ChipType },
      path: { default: undefined },
      referenceToken: { default: undefined },
      geometryReference: { default: undefined },
    };
  },

  // eslint-disable-next-line @typescript-eslint/naming-convention -- Tiptap Node API method
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(
        {
          'data-type': 'context-chip',
          'data-id': HTMLAttributes['id'] as string,
          'data-label': HTMLAttributes['label'] as string,
          'data-chip-type': HTMLAttributes['chipType'] as string,
          'data-path': HTMLAttributes['path'] as string,
          'data-reference-token': HTMLAttributes['referenceToken'] as string,
          'data-geometry-reference': HTMLAttributes['geometryReference'] as string,
        },
        HTMLAttributes,
      ),
      HTMLAttributes['label'] as string,
    ];
  },

  // eslint-disable-next-line @typescript-eslint/naming-convention -- Tiptap Node API method
  parseHTML() {
    return [
      {
        tag: 'span[data-type="context-chip"]',
        getAttrs: (element) => ({
          id: element.dataset['id'],
          label: element.dataset['label'],
          chipType: element.dataset['chipType'] ?? 'file',
          path: element.dataset['path'],
          referenceToken: element.dataset['referenceToken'],
          geometryReference: element.dataset['geometryReference'],
        }),
      },
    ];
  },

  renderText({ node }) {
    const path = node.attrs['path'] as string | undefined;
    const referenceToken = node.attrs['referenceToken'] as string | undefined;
    return referenceToken ?? (path ? `@${path}` : String(node.attrs['label'] ?? ''));
  },

  addNodeView() {
    // oxlint-disable-next-line new-cap -- Tiptap's ReactNodeViewRenderer is a factory function
    return ReactNodeViewRenderer(ContextChipComponent);
  },
});
