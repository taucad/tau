import { Node, mergeAttributes } from '@tiptap/core';
import type { ReactNodeViewProps } from '@tiptap/react';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { FileLink } from '#components/files/file-link.js';
import { ContextChip } from '#components/chat/context-chip.js';
import type { ChipType } from '#components/chat/context-chip.js';

function ContextChipComponent({ node, deleteNode }: ReactNodeViewProps): React.JSX.Element {
  const label = String(node.attrs['label'] ?? '');
  const chipType = String(node.attrs['chipType'] ?? 'file') as ChipType;
  const path = String(node.attrs['path'] ?? '');
  const isLinkable = (chipType === 'file' || chipType === 'chat') && path;

  const chip = (
    <ContextChip label={label} chipType={chipType} onRemove={deleteNode} isInteractive={Boolean(isLinkable)} />
  );

  return (
    <NodeViewWrapper as='span' className='inline-flex align-baseline'>
      {isLinkable ? (
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
