import { useCallback } from 'react';
import type { CadAgentExecution } from '@taucad/chat';
import type { ChatExecutionTarget } from '@taucad/chat/schemas';
import { awaitAgentHostAvailability } from '#hooks/use-cad-agent-config.js';
import { useCreditPreflight } from '#hooks/use-credit-preflight.js';
import { useActiveChatSession } from '#hooks/active-chat-provider.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { parseAdmissionFailureForPersistence } from '@taucad/chat-ui/utils/error.utils';
import { useProject } from '#hooks/use-project.js';
import { isBrowserAgentHostProviderKind } from '#services/agent-host-client.js';
import { daemonPlacementOf, unplaceableExecutionReason } from '#lib/agent-host-placement.js';
import { useModels } from '#hooks/use-models.js';
import { tauModelReadiness, tauModelRefusal } from '@taucad/chat-ui/utils/new-chat-execution';
import { randomUuid } from '@taucad/utils/id';
import {
  canOpenCloudProject,
  cloudOpenAccountReason,
  isCloudProjectPending,
  tauCloudIntent,
} from '#lib/tau-cloud-intent.js';
import { peekRevisionClient, subscribeRevisionClients } from '@taucad/revisions-ui/services/revision-client-registry';
import { subscribeRevisionSessionUser } from '@taucad/revisions-ui/lib/revision-actor';
import type { RevisionClient } from '@taucad/revisions-ui/types/revision-client.types';
import { isFailedOpen } from '#hooks/use-project-availability.js';

/**
 * This document's resident agent host, as a CAD turn's execution target names it. The host places the turn itself,
 * so the target names no checkout and no base (W8 TS-S5; `chatExecutionTargetSchema`).
 */
export const browserHostId = `host_${randomUuid()}`;

/* A refusal on the banner a placement refusal uses. */
const placementRefusal = (message: string): Error =>
  Object.assign(new Error(message), { code: 'CHAT_PLACEMENT_UNAVAILABLE' });

/**
 * Wait until a project's Tau Cloud open has written its files (SP2h): the chats open before they land, and a turn this
 * document hosts runs in that checkout, where its reads would find files not yet there and a write to one would make
 * the apply's own write of it refuse. It is held rather than refused, so a seeded or linked prompt sent as the chat
 * opens still runs. The wait ends with a refusal when the open fails (on whichever client the project has, one that
 * arrives later or replaces it included), at once when this account may not continue the open, and with the stop's
 * reason when its dispatch stops. No timer: the open's own bounds end it.
 *
 * @param projectId - The project.
 * @param signal - The dispatch's stop: Stop, the chat's disposal, or its turn host's unmount.
 * @returns Once the open's intent has cleared.
 */
const awaitCloudOpenWritten = async (projectId: string, signal?: AbortSignal): Promise<void> => {
  if (!isCloudProjectPending(projectId)) {
    return;
  }
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  let client: RevisionClient | undefined;
  let stopStatus: (() => void) | undefined;
  const check = (): void => {
    if (signal?.aborted === true) {
      reject(signal.reason instanceof Error ? signal.reason : new Error('This turn was stopped before it started.'));
      return;
    }
    if (!isCloudProjectPending(projectId)) {
      resolve();
      return;
    }
    if (!canOpenCloudProject(projectId)) {
      reject(placementRefusal(cloudOpenAccountReason));
      return;
    }
    const current = peekRevisionClient(projectId);
    if (current !== client) {
      stopStatus?.();
      client = current;
      stopStatus = current?.subscribe(check);
    }
    if (isFailedOpen(current?.status())) {
      reject(
        placementRefusal('This project’s files could not finish arriving, so the agent did not start. Try again.'),
      );
    }
  };
  const stopIntent = tauCloudIntent.subscribe(check);
  const stopClients = subscribeRevisionClients(check);
  /* An account switch can refuse the open before any client exists. */
  const stopSession = subscribeRevisionSessionUser(check);
  signal?.addEventListener('abort', check);
  try {
    check();
    await promise;
  } finally {
    stopIntent();
    stopClients();
    stopSession();
    stopStatus?.();
    signal?.removeEventListener('abort', check);
  }
};

/** The single admission path every verb of one chat goes through. @public */
export type TurnAdmission = Readonly<{
  /**
   * Check that this turn can run where it is placed: the host is available, the model resolves and the account can
   * fund it. The host places the attempt itself when it runs it (W8 TS-S5).
   *
   * @param turnExecution - The execution this dispatch runs, when not the live one.
   * @returns The daemon a daemon-placed turn runs on; nothing for a browser-hosted one.
   */
  admitExecution: (turnExecution?: CadAgentExecution, signal?: AbortSignal) => Promise<ChatExecutionTarget>;
  /** Surface a dropped dispatch on the same banner the transport errors use. */
  surfaceDispatchFailure: (error: unknown) => void;
}>;

/**
 * One chat's workspace admission, shared by every route that dispatches a turn.
 *
 * Extracted from `useCadChatClient` so the hook's five mount sites and the
 * chat's single turn host compose the same admission rather than a copy each.
 *
 * @param liveExecution - The live agent selection, used when a verb names none.
 * @returns The chat's admission surface.
 * @public
 */
export const useTurnAdmission = (liveExecution: CadAgentExecution): TurnAdmission => {
  const { activeChatId } = useActiveChatSession();
  const store = useChatSessionStore();
  const { projectId } = useProject();
  const { resolveModel, ensureModelCatalog } = useModels();
  const creditPreflight = useCreditPreflight();
  const admitExecution = useCallback(
    async (turnExecution: CadAgentExecution = liveExecution, signal?: AbortSignal): Promise<ChatExecutionTarget> => {
      /* An external agent pinned to a host this device cannot reach is refused at once: nothing will publish
       * that host here, and the chat keeps its pin rather than moving to Tau. */
      const unplaceable = unplaceableExecutionReason(turnExecution);
      if (unplaceable !== undefined) {
        throw Object.assign(new Error(unplaceable), { code: 'CHAT_PLACEMENT_UNAVAILABLE' });
      }
      const daemonHostId = daemonPlacementOf(turnExecution);
      /* SP2h: a turn this document hosts waits for a Tau Cloud open to write the checkout; a daemon runs on its own tree. */
      if (daemonHostId === undefined) {
        await awaitCloudOpenWritten(projectId, signal);
      }
      // Every host placement waits out its own probe: a turn dispatched before
      // one answers must WAIT for it (the seeded first turn fires at chat load,
      // ahead of the probe), and an answered "unavailable" must refuse with its
      // reason — never a silent downgrade, in either direction.
      const availability = await awaitAgentHostAvailability({
        projectId,
        ...(daemonHostId === undefined ? {} : { hostId: daemonHostId }),
      });
      if (availability.status !== 'available') {
        throw Object.assign(
          new Error(
            availability.status === 'pending'
              ? daemonHostId === undefined
                ? 'Tau is still checking whether this project can run the agent in your browser.'
                : 'Tau is still looking for that agent host.'
              : availability.reason,
          ),
          { code: 'CHAT_PLACEMENT_UNAVAILABLE' },
        );
      }
      /* The model catalog is a *Tau* concern: an external agent runs on its own
       * subscription, so there is no row to resolve and no gateway wire to
       * refuse. */
      if (turnExecution.kind === 'tau') {
        /* A Tau turn's wire is its catalog row: without one there is nothing to
         * run. Wait for the catalog's in-flight answer — a seeded first turn
         * fires at chat load, ahead of it — and refuse here, with the reason,
         * rather than compose a body the host cannot accept. */
        const catalog = await ensureModelCatalog();
        const resolved = resolveModel(turnExecution.model);
        if (!resolved.isResolved) {
          const { model } = turnExecution;
          const reason =
            tauModelRefusal(model, tauModelReadiness(model, catalog)) ?? tauModelRefusal(model, 'not-offered');
          throw Object.assign(new Error(reason), { code: 'CHAT_PLACEMENT_UNAVAILABLE' });
        }
        // The availability above is per project; the model's wire is per
        // turn. A resolved catalog row the browser host cannot speak (the
        // `tau` replay row, for one) must refuse here, before a body is
        // composed: its admission fails the host schema, and the transport
        // must never hand a Tau turn to the API, which executes
        // external-agent turns only.
        if (!isBrowserAgentHostProviderKind(resolved.provider.id)) {
          throw Object.assign(
            new Error(`Tau cannot run the ${resolved.provider.id} provider wire. Pick a different model.`),
            { code: 'CHAT_PLACEMENT_UNAVAILABLE' },
          );
        }
        /* R9: a turn the account cannot fund is refused here, before any
         * turn is dispatched, with the same credits payload the
         * gateway's own 402 would have carried. An unavailable balance or a
         * route with no published estimate returns silently — the server's
         * admission stays the authority, and a failed read never blocks a turn. */
        creditPreflight(turnExecution.model, resolved.name);
      }
      /* Every host places its own turn: the daemon on its tree, the resident agent host through the file-manager
       * worker's revision root (W8 TS-S5). */
      return { hostId: daemonHostId ?? browserHostId };
    },
    [creditPreflight, ensureModelCatalog, liveExecution, projectId, resolveModel],
  );

  const surfaceDispatchFailure = useCallback(
    (error: unknown): void => {
      console.error('[useTurnAdmission] turn admission failed', error);
      store.get(activeChatId)?.persistenceActorRef.send({
        type: 'setPersistedError',
        /* Admission is the one failure with no run behind it, so the card it
         * reaches offers a restart rather than a resume. The distinction is
         * structural and belongs here, where it is a fact rather than a guess
         * at the message. */
        error: parseAdmissionFailureForPersistence(
          error instanceof Error ? error : new Error('Durable workspace admission failed', { cause: error }),
        ),
      });
    },
    [activeChatId, store],
  );

  return { admitExecution, surfaceDispatchFailure };
};
