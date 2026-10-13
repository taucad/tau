import type { Root, Element, ElementContent, RootContent } from 'hast';
import { parseInlineReferences } from '#utils/at-reference.utils.js';

const skipParentTags = new Set(['code', 'pre', 'a']);

/**
 * Rehype plugin that transforms `@path` and invocation-token text patterns into
 * `<mark>` elements for rendering as chips.
 *
 * - `@path` produces `<mark data-at-reference="path">`
 * - `/skill`, `$skill` produce `<mark data-invocation="token">`; the chip renders text unless the chat knows the token
 * - `@cad[<file>#<component>]` produces `<mark data-cad-reference="token">`
 *
 * `<mark>` is used instead of `<span>` because markdown rendering produces
 * hundreds of `<span>` elements (especially in code blocks). Using `<mark>`
 * avoids routing every `<span>` through a custom component check.
 */
export function rehypeAtReferences(): (tree: Root) => void {
  return (tree: Root) => {
    visitTextNodes(tree.children, undefined);
  };
}

function visitTextNodes(children: Array<RootContent | ElementContent>, parentTag: string | undefined): void {
  if (parentTag && skipParentTags.has(parentTag)) {
    return;
  }

  for (let i = children.length - 1; i >= 0; i--) {
    const node = children[i]!;

    if (node.type === 'element') {
      visitTextNodes(node.children, node.tagName);
      continue;
    }

    if (node.type !== 'text') {
      continue;
    }

    const segments = parseInlineReferences(node.value);
    if (segments.length <= 1 && segments[0]?.type === 'text') {
      continue;
    }

    const replacementNodes: ElementContent[] = [];
    for (const segment of segments) {
      switch (segment.type) {
        case 'text': {
          replacementNodes.push({ type: 'text', value: segment.value });
          break;
        }
        case 'cadReference': {
          replacementNodes.push({
            type: 'element',
            tagName: 'mark',
            properties: { 'data-cad-reference': segment.token },
            children: [{ type: 'text', value: segment.token }],
          } satisfies Element);
          break;
        }
        case 'atReference': {
          replacementNodes.push({
            type: 'element',
            tagName: 'mark',
            properties: { 'data-at-reference': segment.path },
            children: [{ type: 'text', value: `@${segment.path}` }],
          } satisfies Element);
          break;
        }
        case 'invocation': {
          replacementNodes.push({
            type: 'element',
            tagName: 'mark',
            properties: { 'data-invocation': segment.token },
            children: [{ type: 'text', value: segment.token }],
          } satisfies Element);
          break;
        }
      }
    }

    children.splice(i, 1, ...replacementNodes);
  }
}
