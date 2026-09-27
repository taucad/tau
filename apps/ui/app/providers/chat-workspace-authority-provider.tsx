import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import type { ProviderCapabilities } from '@taucad/filesystem';
import type { FileSystemBridgeConnection } from '@taucad/fs-bridge';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import type { FileManagerRef } from '#machines/file-manager.machine.types.js';
import { useProject } from '#hooks/use-project.js';
import { useRevisionClient } from '#hooks/use-revision-status.js';
import {
  getHostFinalizedTurns,
  subscribeHostTurnSettlements,
} from '#chat-clients/_internal/browser-agent-host-transport.js';
import type { HostTurnSettlement } from '#chat-clients/_internal/browser-agent-host-transport.js';

/**
 * Where one project's chats work, as the page records it.
 *
 * The resident agent host places and settles every turn through the
 * file-manager worker's revision root (W8 TS-S5, TS-S6): it reads the chat's
 * checkout from `Chat.checkoutId`, takes the lease, runs the attempt on that
 * checkout's tools and appends the settlement row. What the page still owns is
 * the person's choice of checkout, written to the chat record here and nowhere
 * else, and the projection's two follow-ups: rereading the chats a fetch
 * projected, and adopting a daemon's recorded head.
 */
type ChatWorkspaceAuthorityContextValue = Readonly<{
  /**
   * Say where this chat's next turn works: write the checkout to the chat's
   * record, which the host's placement reads (TS-R12).
   */
  placeChat: (chatId: string, checkoutId: string) => Promise<void>;
  /**
   * Say this chat exists to resolve one conflicted revision (S33, AC14): its
   * turns land on the conflicted branch's own checkout.
   */
  bindConflict: (
    chatId: string,
    conflict: Readonly<{
      revisionId: string;
      paths: readonly string[];
      checkoutId: string | undefined;
    }>,
  ) => void;
}>;

const ChatWorkspaceAuthorityContext = createContext<ChatWorkspaceAuthorityContextValue | undefined>(undefined);

/** Read the selected provider's capabilities from its rooted bridge hello. */
export const readRootedBridgeCapabilities = async (
  openConnection: () => FileSystemBridgeConnection,
): Promise<ProviderCapabilities> => {
  const { createFileSystemBridgeProxy } = await import('@taucad/fs-bridge');
  const proxy = createFileSystemBridgeProxy(openConnection());
  try {
    await proxy.ready;
    const hello = proxy.hello.payload;
    if (hello.state !== 'ready') {
      throw new Error(`Rooted filesystem bridge is ${hello.state}`);
    }
    return hello.capabilities;
  } finally {
    proxy.dispose();
  }
};

type FileManagerContext = ReturnType<FileManagerRef['getSnapshot']>['context'];
type RootedBridgeReadyContext = FileManagerContext & {
  readonly openFileSystemBridge: NonNullable<FileManagerContext['openFileSystemBridge']>;
};

const hasRootedBridgeOpener = (context: FileManagerContext): context is RootedBridgeReadyContext =>
  context.openFileSystemBridge !== undefined;

/**
 * How long a turn waits for the file manager to mint the rooted bridge opener
 * before giving up. Milliseconds.
 */
const rootedBridgeOpenerTimeout = 30_000;

/**
 * Wait for the file-manager machine to mint the rooted bridge opener.
 *
 * Bounded on purpose: the caller memoizes this connection, so an opener that
 * never arrives used to wedge the chat for the life of the page — the first
 * submit hung in `prepare` and every later one was told a turn was still
 * starting. A failure rejects instead, and reaches the chat's error banner.
 */
export const waitForRootedBridgeOpener = async (fileManagerRef: FileManagerRef): Promise<RootedBridgeReadyContext> => {
  const current = fileManagerRef.getSnapshot().context;
  if (hasRootedBridgeOpener(current)) {
    return current;
  }
  return new Promise((resolve, reject) => {
    const release = (): void => {
      globalThis.clearTimeout(openerExpiry);
      queueMicrotask(() => {
        subscription.unsubscribe();
      });
    };
    const openerExpiry = globalThis.setTimeout(() => {
      release();
      reject(new Error('The project filesystem did not finish starting. Reload the page and try again.'));
    }, rootedBridgeOpenerTimeout);
    const finish = (context: FileManagerContext): void => {
      if (hasRootedBridgeOpener(context)) {
        release();
        resolve(context);
        return;
      }
      if (context.error !== undefined) {
        release();
        reject(context.error);
      }
    };
    const subscription = fileManagerRef.subscribe((state) => {
      finish(state.context);
    });
    finish(fileManagerRef.getSnapshot().context);
  });
};

export function ChatWorkspaceAuthorityProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const { projectId } = useProject();
  const { patchChat, invalidateProjectedChats } = useProjectManager();
  const chatSessions = useChatSessionStore();
  /* This is a passive consumer of the retained project session's connection;
   * `ProjectSessionBinding` owns its lifecycle once for the whole subtree. */
  const revisions = useRevisionClient();
  /* The chat records a remote fetch finished writing are reread, so the page's
   * caches follow the projection rather than guessing from sync timing. */
  useEffect(
    () =>
      revisions?.subscribeEvents((event) => {
        if (event.type !== 'chats.projected') {
          return;
        }
        invalidateProjectedChats(event.projectId, event.chatIds);
        void Promise.all(event.chatIds.map(async (chatId) => chatSessions.refreshFromStorage(chatId)));
      }),
    [chatSessions, invalidateProjectedChats, revisions],
  );
  /* A daemon-hosted turn updates Git outside this worker. Adopt its attested
   * head into the retained projection so the next native or ACP turn starts
   * from the same checkout without requiring a page reload. The worker adopts
   * only a head its own store already names; a cloud host's arrives through
   * the sync fetch instead. */
  useEffect(() => {
    const adopted = new Set<string>();
    const adopt = (event: HostTurnSettlement): void => {
      if (
        revisions === undefined ||
        event.type !== 'turn.finalized' ||
        event.projectId !== projectId ||
        event.checkoutId === undefined ||
        event.revisionId === undefined ||
        event.treeId === undefined ||
        revisions.status()?.headRevisionId === event.revisionId
      ) {
        return;
      }
      if (adopted.has(event.revisionId)) {
        return;
      }
      adopted.add(event.revisionId);
      revisions.send({
        command: 'adoptHostFinalized',
        checkoutId: event.checkoutId,
        revisionId: event.revisionId,
        treeId: event.treeId,
        ...(event.branch === undefined ? {} : { branch: event.branch }),
      });
    };
    const unsubscribe = subscribeHostTurnSettlements(adopt);
    for (const event of getHostFinalizedTurns()) {
      adopt(event);
    }
    return unsubscribe;
  }, [projectId, revisions]);
  const placeChat = useCallback(
    async (chatId: string, checkoutId: string): Promise<void> => {
      await patchChat(chatId, 'checkoutId', checkoutId);
    },
    [patchChat],
  );

  const value = useMemo<ChatWorkspaceAuthorityContextValue>(
    () => ({
      placeChat,
      bindConflict: (chatId, conflict) => {
        if (conflict.checkoutId === undefined) {
          return;
        }
        /* The conflict's checkout is durable: the host's placement reads it from
         * the chat's record, so a reload keeps the chat on the conflicted branch. */
        const { checkoutId } = conflict;
        const record = async (): Promise<void> => {
          try {
            await placeChat(chatId, checkoutId);
          } catch (error) {
            console.error('[chatWorkspaceAuthority] a seeded chat’s checkout was not recorded', error);
          }
        };
        // async-iife: bootstrap
        void record();
      },
    }),
    [placeChat],
  );
  return <ChatWorkspaceAuthorityContext.Provider value={value}>{children}</ChatWorkspaceAuthorityContext.Provider>;
}

export const useChatWorkspaceAuthority = (): ChatWorkspaceAuthorityContextValue => {
  const authority = useContext(ChatWorkspaceAuthorityContext);
  if (!authority) {
    throw new Error('useChatWorkspaceAuthority must be used within ChatWorkspaceAuthorityProvider');
  }
  return authority;
};

/** Optional accessor for generic chat-client tests and non-project profiles. */
export const useOptionalChatWorkspaceAuthority = (): ChatWorkspaceAuthorityContextValue | undefined =>
  useContext(ChatWorkspaceAuthorityContext);
