/**
 * ProjectChatRunSettlement
 *
 * Project-scoped sibling primitive that reclaims this project's chat workspace
 * claims on mount and settles each terminal run — publishing the revision,
 * discarding a failed or cancelled tree, and releasing the durable hold.
 *
 * It is mounted only inside the project route subtree, where `useProject`,
 * `useFileManager` and the revision actor are present; routes without those
 * providers (homepage, marketing, library) do not mount it, so chat sessions
 * stay universally creatable while settlement stays a project concern.
 *
 * This was `ProjectChatRpcBindings` until W4-PASEO. Its other half — the
 * API-coordinated run directory, the Socket.IO RPC rooms, and the server-minted
 * run id — went with the API chat plane: a run is now owned by the host that
 * executes it and lives in `.tau/chats/<chatId>/events.jsonl` (PH19). What
 * survives is the half that was always browser-host work.
 *
 * Returns `null` — purely a side-effect primitive.
 */

import type { ReactNode } from 'react';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import type { ChatSessionStore } from '#services/chat-session-store.js';
import { useChatWorkspaceAuthority, usePreparedChatWorkspace } from '#providers/chat-workspace-authority-provider.js';
import { useRevisionActor } from '#routes/w.$workspace.$project/revision-provider.js';
import {
  clearBrowserAgentHostRun,
  getBrowserAgentHostRun,
} from '#chat-clients/_internal/browser-agent-host-transport.js';

const missingAuthoritativeTurn = (chatId: string, runId: string): Error =>
  Object.assign(new Error(`Durable run ${runId} has no authoritative user turn for chat ${chatId}.`), {
    code: 'DURABLE_TURN_UNAVAILABLE',
  });

/**
 * A claim whose fenced run no host log owns can never settle: it stays
 * `admitted` forever, and `withWorkspace` blocks every later submit for that
 * chat behind that admission. Retire the claim and release the durable hold —
 * the materialized workspace stays on disk as inspectable evidence, exactly
 * like the merge-conflict retirement.
 */
const retireUnsubstantiatedRun = async (input: {
  readonly chatId: string;
  readonly runId: string;
  readonly store: Pick<ChatSessionStore, 'releaseDurableRun'>;
  readonly retireClaim: (chatId: string) => Promise<void>;
}): Promise<void> => {
  await input.retireClaim(input.chatId);
  input.store.releaseDurableRun({ chatId: input.chatId, runId: input.runId });
};

/**
 * A claim admitted before its run id was ever recorded names no run to
 * substantiate, so it can never settle — and it blocks every later submit for
 * that chat behind the bounded admission wait. It is retirable only once its
 * chat is idle: mount discovery can re-run while a submit is still awaiting the
 * run id its admission has yet to deliver.
 */
const isRetirableUnfencedClaim = (status: ReturnType<ChatSessionStore['getStatus']>): boolean =>
  status !== 'submitted' && status !== 'streaming';

export function ProjectChatRunSettlement(): ReactNode {
  const store = useChatSessionStore();
  const workspaceAuthority = useChatWorkspaceAuthority();
  const chatIds = useSyncExternalStore(
    (listener) => store.subscribeMembership(listener),
    () => store.list(),
    () => store.list(),
  );

  useEffect(() => {
    let cancelled = false;
    const discover = async (): Promise<void> => {
      const reclaimed = await workspaceAuthority.reclaimAll();
      if (cancelled) {
        return;
      }
      for (const workspace of reclaimed) {
        if (!workspace.admitted) {
          continue;
        }
        if (!workspace.runId) {
          if (isRetirableUnfencedClaim(store.getStatus(workspace.chatId))) {
            // oxlint-disable-next-line no-await-in-loop -- retirement belongs to the exact claim just proven unsubstantiable.
            await workspaceAuthority.retireClaim(workspace.chatId);
          }
          continue;
        }
        const browserRun = getBrowserAgentHostRun(workspace.chatId);
        if (browserRun !== undefined && browserRun.runId !== workspace.runId) {
          // The claim names a run this tab's host does not own and no other
          // authority can substantiate any more.
          // oxlint-disable-next-line no-await-in-loop -- retirement belongs to the exact run just proven absent.
          await retireUnsubstantiatedRun({
            chatId: workspace.chatId,
            runId: workspace.runId,
            store,
            retireClaim: workspaceAuthority.retireClaim,
          });
          continue;
        }
        store.retainDurableRun({
          chatId: workspace.chatId,
          runId: workspace.runId,
          state:
            browserRun?.runId === workspace.runId &&
            (browserRun.state === 'completed' || browserRun.state === 'failed' || browserRun.state === 'cancelled')
              ? 'terminal'
              : 'active',
        });
      }
    };
    const reclaim = async (): Promise<void> => {
      try {
        await discover();
      } catch (error) {
        console.error('[ProjectChatRunSettlement] workspace reclamation failed', error);
      }
    };
    // async-iife: route lifetime owns reclamation.
    void reclaim();
    return () => {
      cancelled = true;
    };
  }, [store, workspaceAuthority]);

  return (
    <>
      {chatIds.map((chatId) => (
        <SingleChatRunSettlement key={chatId} chatId={chatId} />
      ))}
    </>
  );
}

function SingleChatRunSettlement({ chatId }: { readonly chatId: string }): ReactNode {
  const store = useChatSessionStore();
  const isLoadingChat = useIsLoadingChat(store, chatId);
  const status = useSyncExternalStore(
    (listener) => store.subscribeStatus(chatId, listener),
    () => store.getStatus(chatId),
    () => store.getStatus(chatId),
  );
  const durableRunState = useSyncExternalStore(
    (listener) => store.subscribeStatus(chatId, listener),
    () => store.getDurableRunState(chatId),
    () => store.getDurableRunState(chatId),
  );
  const durableRunId = useSyncExternalStore(
    (listener) => store.subscribeStatus(chatId, listener),
    () => store.getDurableRunId(chatId),
    () => store.getDurableRunId(chatId),
  );
  const workspace = usePreparedChatWorkspace(chatId);
  const workspaceAuthority = useChatWorkspaceAuthority();
  const revisionActor = useRevisionActor();
  const mutatingRunActive =
    status === 'submitted' ||
    status === 'streaming' ||
    durableRunState === 'reattaching' ||
    durableRunState === 'active';
  useEffect(() => {
    if (workspace?.runId && store.getDurableRunId(chatId) !== workspace.runId) {
      store.retainDurableRun({ chatId, runId: workspace.runId, state: 'active' });
    }
  }, [chatId, store, workspace?.runId]);
  useEffect(() => {
    if (isLoadingChat || !workspace?.admitted || mutatingRunActive || durableRunState !== 'terminal' || !durableRunId) {
      return;
    }
    let completed = false;
    let inFlight = false;
    let failures = 0;
    let retryTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
    let disposed = false;
    const lastUserTurnId = (): string | undefined =>
      store.get(chatId)?.chat.messages.findLast((message) => message.role === 'user')?.id;
    const discardPendingTurn = (turnId: string | undefined): void => {
      if (turnId) {
        revisionActor.send({ type: 'DISCARD_PENDING_TURN', turnId });
      }
    };
    /**
     * Handles every outcome that ends the run without publishing, and returns
     * the completed local run when — and only when — one still needs to be
     * published. Splitting it this way is what keeps the publish path below
     * from having to re-derive which of five states it is in.
     */
    const settleOrTakeCompletedRun = async (
      authoritativeRunId: string,
    ): Promise<ReturnType<typeof getBrowserAgentHostRun>> => {
      if (
        workspaceAuthority
          .listFinalized()
          .some((publication) => publication.workspaceId === workspace.execution.workspaceId)
      ) {
        // Finalization already wrote this workspace's publication and only its
        // discard half failed (see the `.crswap` note in the authority). Never
        // re-merge an already-published agent tree over newer live edits —
        // release the claim and let the run go.
        await workspaceAuthority.discard(chatId);
        store.releaseDurableRun({ chatId, runId: authoritativeRunId });
        clearBrowserAgentHostRun(chatId);
        return undefined;
      }
      const localRun = getBrowserAgentHostRun(chatId);
      if (localRun?.runId !== authoritativeRunId) {
        // No host log owns this run any more: retire the claim rather than
        // leave the chat wedged behind an admission that can never settle.
        await retireUnsubstantiatedRun({
          chatId,
          runId: authoritativeRunId,
          store,
          retireClaim: workspaceAuthority.retireClaim,
        });
        discardPendingTurn(lastUserTurnId());
        return undefined;
      }
      if (localRun.state === 'failed' || localRun.state === 'cancelled') {
        await workspaceAuthority.discard(chatId);
        discardPendingTurn(localRun.turnId ?? workspace.turnId ?? lastUserTurnId());
        store.releaseDurableRun({ chatId, runId: authoritativeRunId });
        clearBrowserAgentHostRun(chatId);
        return undefined;
      }
      if (localRun.state !== 'completed') {
        store.retainDurableRun({ chatId, runId: authoritativeRunId, state: 'active' });
        return undefined;
      }
      return localRun;
    };
    const settleOnce = async (): Promise<void> => {
      const authoritativeRunId = store.getDurableRunId(chatId);
      if (!authoritativeRunId) {
        return;
      }
      const localRun = await settleOrTakeCompletedRun(authoritativeRunId);
      if (!localRun) {
        return;
      }
      if (localRun.userMessage !== undefined) {
        if (localRun.turnId !== undefined && localRun.userMessage.id !== localRun.turnId) {
          throw new TypeError('Browser host snapshot user message does not match its authoritative turn id.');
        }
        store.reconcileDurableUserMessage({ chatId, runId: authoritativeRunId, message: localRun.userMessage });
      }
      const turnId = localRun.turnId ?? workspace.turnId ?? lastUserTurnId();
      if (!turnId) {
        throw missingAuthoritativeTurn(chatId, authoritativeRunId);
      }
      const finalization = await workspaceAuthority.finalize(chatId, {
        actorId: 'tau-browser-agent-host',
        summary: `Completed chat ${chatId}`,
        turnId,
        runId: authoritativeRunId,
      });
      if (finalization === undefined) {
        throw new Error(`Workspace finalization was unavailable for chat ${chatId}.`);
      }
      if (finalization.status === 'conflicted') {
        revisionActor.send({
          type: 'SET_REVISION_CONFLICT',
          turnId: finalization.turnId,
          chatId: finalization.chatId,
          branchName: finalization.branchName,
          conflict: finalization.conflict,
        });
      }
      store.releaseDurableRun({ chatId, runId: authoritativeRunId });
      clearBrowserAgentHostRun(chatId);
    };
    const attemptSettlement = async (): Promise<void> => {
      if (completed || inFlight || disposed) {
        return;
      }
      inFlight = true;
      try {
        await settleOnce();
        completed = true;
      } catch (error) {
        console.error('[ProjectChatRunSettlement] exact run settlement failed', error);
        failures += 1;
        if (failures < 5) {
          retryTimer = globalThis.setTimeout(
            () => {
              // async-iife: bounded settlement retry remains owned by this effect.
              void attemptSettlement();
            },
            Math.min(2000, 100 * 2 ** (failures - 1)),
          );
        }
      } finally {
        inFlight = false;
      }
    };
    const retryWhenOnline = (): void => {
      if (completed) {
        return;
      }
      failures = 0;
      if (retryTimer) {
        globalThis.clearTimeout(retryTimer);
        retryTimer = undefined;
      }
      // async-iife: connectivity wake retries authoritative settlement.
      void attemptSettlement();
    };
    globalThis.addEventListener('online', retryWhenOnline);
    // async-iife: the project-wide settlement owns finalization independently of focus.
    void attemptSettlement();
    return () => {
      disposed = true;
      globalThis.removeEventListener('online', retryWhenOnline);
      if (retryTimer) {
        globalThis.clearTimeout(retryTimer);
      }
    };
  }, [
    chatId,
    durableRunId,
    durableRunState,
    isLoadingChat,
    mutatingRunActive,
    revisionActor,
    status,
    store,
    workspace,
    workspaceAuthority,
  ]);
  return null;
}

/**
 * Subscribes to the session's persistence actor (when present) so settlement
 * wakes whenever its `isLoadingChat` flag flips. Returns `true` while no
 * session exists for `chatId` so settlement stays disabled until the chat is
 * actually live.
 */
function useIsLoadingChat(store: ChatSessionStore, chatId: string): boolean {
  const subscribe = useCallback(
    (listener: () => void) => {
      let actorSubscription: { unsubscribe: () => void } | undefined;

      const trySubscribeActor = (): void => {
        if (actorSubscription) {
          return;
        }
        const session = store.get(chatId);
        if (!session) {
          return;
        }
        actorSubscription = session.persistenceActorRef.subscribe(listener);
      };

      trySubscribeActor();

      const unsubscribeMembership = store.subscribeMembership(() => {
        // Membership changed: the session may have just appeared (so we
        // now have an actor to subscribe to) or disappeared (existing
        // subscription is now orphaned and the snapshot getter will
        // return the no-session default). Refresh the actor sub and
        // wake the consumer so it re-reads the snapshot.
        if (store.get(chatId)) {
          trySubscribeActor();
        } else {
          actorSubscription?.unsubscribe();
          actorSubscription = undefined;
        }
        listener();
      });

      return () => {
        unsubscribeMembership();
        actorSubscription?.unsubscribe();
      };
    },
    [store, chatId],
  );

  const getSnapshot = useCallback(() => {
    const session = store.get(chatId);
    if (!session) {
      return true;
    }
    return session.persistenceActorRef.getSnapshot().context.isLoadingChat;
  }, [store, chatId]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
