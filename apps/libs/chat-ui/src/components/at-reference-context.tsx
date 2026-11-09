import { createContext, use, useMemo } from 'react';
import type { ChatRecord } from '@taucad/chat/schemas';
import type { FileTreeService } from '@taucad/fs-client/file-tree-service';

type AtReferenceContextValue = {
  treeService: FileTreeService | undefined;
  chatsById: Map<string, ChatRecord>;
  /** Invocation tokens rendered as skill chips: Tau skills and the chat's agent commands. */
  knownTokens: ReadonlySet<string>;
};

const noTokens: ReadonlySet<string> = new Set();

const AtReferenceContext = createContext<AtReferenceContextValue>({
  treeService: undefined,
  chatsById: new Map(),
  knownTokens: noTokens,
});

type AtReferenceProviderProps = {
  readonly treeService: FileTreeService | undefined;
  readonly chats: ChatRecord[];
  readonly knownTokens?: ReadonlySet<string>;
  readonly children: React.ReactNode;
};

export function AtReferenceProvider({
  treeService,
  chats,
  knownTokens = noTokens,
  children,
}: AtReferenceProviderProps): React.JSX.Element {
  const chatsById = useMemo(() => new Map(chats.map((c) => [c.id, c])), [chats]);
  const contextValue = useMemo(() => ({ treeService, chatsById, knownTokens }), [treeService, chatsById, knownTokens]);

  return <AtReferenceContext value={contextValue}>{children}</AtReferenceContext>;
}

export function useAtReferenceContext(): AtReferenceContextValue {
  return use(AtReferenceContext);
}
