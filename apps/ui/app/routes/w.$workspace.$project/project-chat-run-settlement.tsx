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
 * This was `ProjectChatRpcBindings` until the API chat plane was cut. Its other
 * half — the API-coordinated run directory, the Socket.IO RPC rooms, and the
 * server-minted run id — went with that plane: a run is now owned by the host that
 * executes it and lives in `.tau/chats/<chatId>/events.jsonl` (PH19). What
 * survives is the half that was always browser-host work.
 *
 * Returns `null` — purely a side-effect primitive.
 */

import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import type { ChatSessionStore } from '#services/chat-session-store.js';
import { useChatWorkspaceAuthority, usePreparedChatWorkspace } from '#providers/chat-workspace-authority-provider.js';
import { publishChatTurnSettlement } from '#chat-clients/_internal/chat-host-binding.js';
import type { ChatTurnSettlementInput } from '#machines/chat-session.machine.js';
import {
  clearBrowserAgentHostRun,
  getBrowserAgentHostRun,
  getHostFinalizedTurns,
} from '#chat-clients/_internal/browser-agent-host-transport.js';

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
  readonly retireClaim: (chatId: string, runId: string | undefined) => Promise<void>;
}): Promise<void> => {
  await input.retireClaim(input.chatId, input.runId);
  input.store.releaseDurableRun({ chatId: input.chatId, runId: input.runId });
};

/**
 * Whether this chat's claim may be retired at all.
 *
 * A claim is retirable only while its chat is idle. Discovery can re-run at any
 * moment, and a chat that is mid-dispatch holds the claim for the turn being
 * admitted *right now*: retiring it released the lease the revision root was
 * holding for that turn, and the root answered the release with a `turn.failed`
 * recorded under a run the host had not admitted yet — which then made the host
 * refuse the admission outright. Applied to every retire branch, not just the
 * claim that names no run.
 */
const isRetirableClaim = (
  store: Pick<ChatSessionStore, 'getStatus' | 'getDurableRunState' | 'holdsTurn'>,
  chatId: string,
): boolean => {
  /* First, and from the turn's own owner. The AI SDK status is `ready` for the
   * whole admission window — the dispatch is deferred by a microtask and no
   * bytes have flowed — so a claim for the run being admitted *right now* read
   * as retirable, and discovery released its lease under it (T3-D9). */
  if (store.holdsTurn(chatId)) {
    return false;
  }
  const status = store.getStatus(chatId);
  if (status === 'submitted' || status === 'streaming') {
    return false;
  }
  const durableRunState = store.getDurableRunState(chatId);
  return durableRunState !== 'active' && durableRunState !== 'reattaching';
};

export function ProjectChatRunSettlement(): ReactNode {
  const store = useChatSessionStore();
  const workspaceAuthority = useChatWorkspaceAuthority();
  const chatIds = useSyncExternalStore(
    (listener) => store.subscribeMembership(listener),
    () => store.list(),
    () => store.list(),
  );

  /* Discovery is mount-time recovery and is keyed on nothing, by construction.
   * Keying it on the authority value re-ran it on every chats refetch — and a
   * dispatch persists the user's message, which *is* a chats refetch — so a
   * turn being admitted was reclaimed mid-flight and its lease abandoned. Both
   * collaborators are read through refs so no owner can reopen that by
   * changing what its own hook returns. */
  const authorityRef = useRef(workspaceAuthority);
  const storeRef = useRef(store);
  useEffect(() => {
    authorityRef.current = workspaceAuthority;
    storeRef.current = store;
  }, [store, workspaceAuthority]);

  useEffect(() => {
    let cancelled = false;
    const discover = async (): Promise<void> => {
      const workspaceAuthority = authorityRef.current;
      const store = storeRef.current;
      const reclaimed = await workspaceAuthority.reclaimAll();
      if (cancelled) {
        return;
      }
      for (const workspace of reclaimed) {
        if (!workspace.admitted) {
          continue;
        }
        if (!workspace.runId) {
          if (isRetirableClaim(store, workspace.chatId)) {
            // oxlint-disable-next-line no-await-in-loop -- retirement belongs to the exact claim just proven unsubstantiable.
            await workspaceAuthority.retireClaim(workspace.chatId, undefined);
          }
          continue;
        }
        const browserRun = getBrowserAgentHostRun(workspace.chatId);
        if (
          browserRun !== undefined &&
          browserRun.runId !== workspace.runId &&
          isRetirableClaim(store, workspace.chatId)
        ) {
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
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- mount-only by construction; both collaborators are read through refs.
  }, []);

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
  const status = useSyncExternalStore(
    (listener) => store.subscribeStatus(chatId, listener),
    () => store.getStatus(chatId),
    () => store.getStatus(chatId),
  );
  const workspace = usePreparedChatWorkspace(chatId);
  const workspaceAuthority = useChatWorkspaceAuthority();
  useEffect(() => {
    /* Mount-time `reclaimAll` owns recovery. A workspace created by this page
     * appears one microtask before its explicit send changes `ready` to
     * `submitted`; retaining it in that gap starts a read-only reattach stream
     * that serializes the real send behind itself. */
    if (
      workspace?.runId &&
      (status === 'submitted' || status === 'streaming') &&
      store.getDurableRunId(chatId) !== workspace.runId
    ) {
      store.retainDurableRun({
        chatId,
        runId: workspace.runId,
        state: 'active',
      });
    }
  }, [chatId, status, store, workspace?.runId]);

  /**
   * End this chat's turn (C3).
   *
   * Invoked by the chat's session actor from `run.finishing`, once, for the run
   * that actor holds. What it replaced was an effect that had to re-derive
   * *whether* to settle from five reads of status, durable state and page
   * memory, keep its own `completed`/`inFlight`/`failures` locals, and retry on
   * a timer — because nothing owned the turn and any render could re-run it.
   * The owner answers all of that: this is called after the request lifecycle
   * ended, for a turn that took a lease, and never twice.
   */
  const settle = useCallback(
    async ({ runId, outcome }: ChatTurnSettlementInput): Promise<void> => {
      if (!runId) {
        return;
      }
      const localRun = getBrowserAgentHostRun(chatId);
      const attested = getHostFinalizedTurns().some((settlement) => settlement.runId === runId);
      /* Publish only a run this page saw complete and the host has not already
       * attested. Everything else — a refusal, a stop, a run whose host log
       * this tab does not own, and a settlement the host already recorded —
       * releases the hold without asking for a revision over newer live edits. */
      if (!attested && outcome === 'completed' && localRun?.runId === runId && localRun.state === 'completed') {
        if (localRun.userMessage !== undefined) {
          store.reconcileDurableUserMessage({ chatId, runId, message: localRun.userMessage });
        }
        await workspaceAuthority.finalize(chatId, runId);
      } else {
        await workspaceAuthority.discard(chatId, runId);
      }
      store.releaseDurableRun({ chatId, runId });
      clearBrowserAgentHostRun(chatId);
    },
    [chatId, store, workspaceAuthority],
  );
  useEffect(() => publishChatTurnSettlement(chatId, settle), [chatId, settle]);
  return null;
}
