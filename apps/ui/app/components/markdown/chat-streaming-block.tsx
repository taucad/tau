import { createContext, memo, useCallback, useContext, useLayoutEffect, useMemo, useRef } from 'react';
import type { PluggableList } from 'unified';
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
  readonly children: (parseBlocks: (markdown: string) => string[]) => React.ReactNode;
  readonly content: string;
};

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
    (markdown: string): string[] => (markdown === content ? blocks : parseMarkdownIntoBlocks(markdown)),
    [blocks, content],
  );

  useLayoutEffect(() => {
    previousContentRef.current = content;
    previousBlocksRef.current = blocks;
    hasCommittedRef.current = true;
  }, [blocks, content]);

  const value = useMemo<ChatStreamingFadeContextValue>(() => ({ arrivalOffsetsRef }), []);
  return <ChatStreamingFadeContext.Provider value={value}>{children(parseBlocks)}</ChatStreamingFadeContext.Provider>;
}
/* oxlint-enable react/refs, react/immutability */
