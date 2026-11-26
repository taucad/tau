import { createContext, memo, useCallback, useContext, useLayoutEffect, useMemo, useRef } from 'react';
import type { PluggableList } from 'unified';
import remend from 'remend';
import { Block, parseMarkdownIntoBlocks } from 'streamdown';
import type { BlockProps } from 'streamdown';
import { createChatStreamingFadePlugin, getStreamingArrivalStart } from '#components/markdown/chat-streaming-fade.js';

type ChatStreamingFadeContextValue = {
  readonly arrivalOffsetsRef: React.RefObject<readonly number[]>;
};

const ChatStreamingFadeContext = createContext<ChatStreamingFadeContextValue | undefined>(undefined);

/* oxlint-disable react/refs, react/immutability -- Stable refs carry arrival and commit frontiers without re-rendering settled Streamdown blocks; blockStart is local to one memo calculation. */
export const ChatStreamingBlock = memo(function (properties: BlockProps): React.JSX.Element {
  'use no memo';
  const fade = useContext(ChatStreamingFadeContext);
  const arrivalOffset = fade?.arrivalOffsetsRef.current[properties.index] ?? properties.content.length;
  const shouldFadeRef = useRef(false);
  const fadeStateRef = useRef<{ committed?: string; pending?: string }>({});
  shouldFadeRef.current = arrivalOffset < properties.content.length;
  const fadePlugin = useMemo(
    () => createChatStreamingFadePlugin(fadeStateRef.current, () => shouldFadeRef.current),
    [],
  );
  const rehypePlugins = useMemo<PluggableList>(
    () => [...(properties.rehypePlugins ?? []), fadePlugin],
    [fadePlugin, properties.rehypePlugins],
  );

  useLayoutEffect(() => {
    fadeStateRef.current.committed = fadeStateRef.current.pending;
  });

  return <Block {...properties} animatePlugin={null} rehypePlugins={rehypePlugins} />;
});

type ChatStreamingFadeProviderProperties = {
  /**
   * Renders the streaming markdown. `markdown` is the content with only its last block repaired; pass it to
   * Streamdown with `parseIncompleteMarkdown={false}` and `parseMarkdownIntoBlocksFn={parseBlocks}`.
   */
  readonly children: (parseBlocks: (markdown: string) => string[], markdown: string) => React.ReactNode;
  readonly content: string;
};

/**
 * Repair only the block still being written (WP-09). Streamdown repairs the whole text before splitting it, which is
 * work proportional to the text on every render, and it can close a marker opened in an earlier, finished block
 * inside the last one (for example a stray `*` closing into a code fence). A finished block needs no repair, so the
 * settled blocks are kept as split and only the source after them is repaired.
 */
export function repairStreamingTail(
  blocks: readonly string[],
  content: string,
): Readonly<{
  markdown: string;
  blocks: string[];
}> {
  const head = blocks.slice(0, -1);
  let offset = 0;
  for (const block of head) {
    offset += block.length;
  }
  if (content.slice(0, offset) !== head.join('')) {
    /* The split does not cover the source exactly (it normalised line endings): repair it whole. */
    const markdown = remend(content);
    return { markdown, blocks: parseMarkdownIntoBlocks(markdown) };
  }
  /* The source after the settled blocks is one block, and repair only appends to it. It is not split again: a second
   * split would replace Streamdown's one remembered split, so the next render's split would start over from the top. */
  const tail = remend(content.slice(offset));
  return { markdown: content.slice(0, offset) + tail, blocks: [...head, tail] };
}

/** Keep settled Streamdown blocks memoized while marking only newly arrived source text. */
export function ChatStreamingFadeProvider({
  children,
  content,
}: ChatStreamingFadeProviderProperties): React.JSX.Element {
  'use no memo';
  const previousContentRef = useRef(content);
  const previousBlocksRef = useRef<readonly string[]>([]);
  const hasCommittedRef = useRef(false);
  const arrivalOffsetsRef = useRef<readonly number[]>([]);
  const blocks = useMemo(() => parseMarkdownIntoBlocks(content), [content]);
  const repaired = useMemo(() => repairStreamingTail(blocks, content), [blocks, content]);
  const arrivalStart = hasCommittedRef.current
    ? getStreamingArrivalStart(previousContentRef.current, content)
    : content.length;
  arrivalOffsetsRef.current = useMemo(() => {
    let blockStart = 0;
    return blocks.map((block, index) => {
      const offset =
        hasCommittedRef.current && previousBlocksRef.current[index] === block
          ? block.length
          : Math.min(block.length, Math.max(0, arrivalStart - blockStart));
      blockStart += block.length;
      return offset;
    });
  }, [arrivalStart, blocks]);
  const parseBlocks = useCallback(
    (markdown: string): string[] =>
      markdown === repaired.markdown ? repaired.blocks : parseMarkdownIntoBlocks(markdown),
    [repaired],
  );

  useLayoutEffect(() => {
    previousContentRef.current = content;
    previousBlocksRef.current = blocks;
    hasCommittedRef.current = true;
  }, [blocks, content]);

  const value = useMemo<ChatStreamingFadeContextValue>(() => ({ arrivalOffsetsRef }), []);
  return (
    <ChatStreamingFadeContext.Provider value={value}>
      {children(parseBlocks, repaired.markdown)}
    </ChatStreamingFadeContext.Provider>
  );
}
/* oxlint-enable react/refs, react/immutability */
