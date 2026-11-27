import type { Element, ElementContent, Parent, Root, Text } from 'hast';

const excludedTags = new Set(['annotation', 'code', 'math', 'pre', 'svg', 'mark']);
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
let pluginId = 0;

/** Find the retained prefix of `current` that was the visible suffix of `previous`. */
export function getStreamingArrivalStart(previous: string, current: string): number {
  if (current.startsWith(previous)) {
    return previous.length;
  }
  if (current.length === 0 || previous.length === 0) {
    return 0;
  }

  const prefixLengths = new Uint32Array(current.length);
  for (let index = 1, matched = 0; index < current.length; index++) {
    while (matched > 0 && current.codePointAt(index) !== current.codePointAt(matched)) {
      matched = prefixLengths[matched - 1]!;
    }
    if (current.codePointAt(index) === current.codePointAt(matched)) {
      matched++;
    }
    prefixLengths[index] = matched;
  }

  let matched = 0;
  for (let index = 0; index < previous.length; index++) {
    while (matched > 0 && previous.codePointAt(index) !== current.codePointAt(matched)) {
      matched = prefixLengths[matched - 1]!;
    }
    if (previous.codePointAt(index) === current.codePointAt(matched)) {
      matched++;
    }
    if (matched === current.length && index < previous.length - 1) {
      matched = prefixLengths[matched - 1]!;
    }
  }
  return matched;
}

function fadeElement(children: ElementContent[]): Element {
  return {
    type: 'element',
    tagName: 'span',
    properties: { 'data-chat-streaming-fade': '' },
    children,
  };
}

function visibleText(parent: Parent, excluded: boolean): string {
  let result = '';
  for (const node of parent.children) {
    if (node.type === 'element') {
      result += visibleText(node, excluded || excludedTags.has(node.tagName));
    } else if (!excluded && node.type === 'text') {
      result += node.value;
    }
  }
  return result;
}

function graphemeBoundaryAtOrBefore(value: string, offset: number): number {
  if (offset <= 0 || offset >= value.length) {
    return Math.max(0, Math.min(value.length, offset));
  }
  let previous = 0;
  for (const segment of graphemeSegmenter.segment(value)) {
    if (segment.index >= offset) {
      return segment.index === offset ? offset : previous;
    }
    previous = segment.index;
  }
  return previous;
}

function wrapArrivingText(
  parent: Parent,
  cursor: { readonly arrivalOffset: number; value: number },
  excluded = false,
): void {
  for (let index = 0; index < parent.children.length; index++) {
    const node = parent.children[index]!;
    if (node.type === 'element') {
      wrapArrivingText(node, cursor, excluded || excludedTags.has(node.tagName));
      continue;
    }
    if (excluded || node.type !== 'text') {
      continue;
    }

    const start = cursor.value;
    const end = start + node.value.length;
    cursor.value = end;
    if (node.value.trim().length === 0 || end <= cursor.arrivalOffset) {
      continue;
    }
    if (start >= cursor.arrivalOffset) {
      parent.children.splice(index, 1, fadeElement([node]));
      continue;
    }

    const splitAt = graphemeBoundaryAtOrBefore(node.value, cursor.arrivalOffset - start);
    const settled: Text = { ...node, value: node.value.slice(0, splitAt) };
    const arriving: Text = { ...node, value: node.value.slice(splitAt) };
    delete settled.position;
    delete arriving.position;
    parent.children.splice(index, 1, settled, fadeElement([arriving]));
    index++;
  }
}

/** Wrap only visible text that arrived after the previous render of this block. */
export function createChatStreamingFadePlugin(
  state: { committed?: string; pending?: string },
  shouldFade: () => boolean,
): () => (tree: Root) => void {
  const plugin =
    () =>
    (tree: Root): void => {
      const currentVisibleText = visibleText(tree, false);
      state.pending = currentVisibleText;
      const previous = state.committed ?? (shouldFade() ? '' : undefined);
      if (!shouldFade() || previous === undefined) {
        return;
      }
      wrapArrivingText(tree, { arrivalOffset: getStreamingArrivalStart(previous, currentVisibleText), value: 0 });
    };

  // Streamdown caches unified processors by plugin function name.
  Object.defineProperty(plugin, 'name', { value: `rehypeChatStreamingFade$${pluginId++}` });
  return plugin;
}
