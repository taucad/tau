import { useCallback } from 'react';
import type { CadAgentExecution } from '@taucad/chat';
import type { ChatExecutionTarget } from '@taucad/chat/schemas';
import { awaitAgentHostAvailability } from '#hooks/use-cad-agent-config.js';
import { useCreditPreflight } from '#hooks/use-credit-preflight.js';
import { useActiveChatSession } from '#hooks/active-chat-provider.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { parseAdmissionFailureForPersistence } from '#utils/error.utils.js';
import { useProject } from '#hooks/use-project.js';
import { isBrowserAgentHostProviderKind } from '#services/agent-host-client.js';
import { daemonPlacementOf } from '#lib/agent-host-placement.js';
import { useModels } from '#hooks/use-models.js';
import { randomUuid } from '@taucad/utils/id';

/**
 * This document's resident agent host, as a CAD turn's execution target names it. The host places the turn itself,
 * so the target names no checkout and no base (W8 TS-S5; `chatExecutionTargetSchema`).
 */
export const browserHostId = `host_${randomUuid()}`;

/** The single admission path every verb of one chat goes through. @public */
export type TurnAdmission = Readonly<{
  /**
   * Check that this turn can run where it is placed: the host is available, the model resolves and the account can
   * fund it. The host places the attempt itself when it runs it (W8 TS-S5).
   *
   * @param turnExecution - The execution this dispatch runs, when not the live one.
   * @returns The daemon a daemon-placed turn runs on; nothing for a browser-hosted one.
   */
  admitExecution: (turnExecution?: CadAgentExecution) => Promise<ChatExecutionTarget>;
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
  const { resolveModel } = useModels();
  const creditPreflight = useCreditPreflight();
  const admitExecution = useCallback(
    async (turnExecution: CadAgentExecution = liveExecution): Promise<ChatExecutionTarget> => {
      const daemonHostId = daemonPlacementOf(turnExecution);
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
        // Catalog lookup is advisory here: M1 refuses an unknown model, while
        // the picker refreshes from its own subscription. Admission never polls.
        const resolved = resolveModel(turnExecution.model);
        // The availability above is per project; the model's wire is per
        // turn. A resolved catalog row the browser host cannot speak (the
        // `tau` replay row, for one) must refuse here, before a body is
        // composed: its admission fails the host schema, and the transport
        // must never hand a Tau turn to the API, which executes
        // external-agent turns only.
        if (resolved.isResolved && !isBrowserAgentHostProviderKind(resolved.provider.id)) {
          throw Object.assign(
            new Error(
              `Tau cannot run the ${resolved.provider.id} provider wire in your browser. Pick a different model.`,
            ),
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
    [creditPreflight, liveExecution, projectId, resolveModel],
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
