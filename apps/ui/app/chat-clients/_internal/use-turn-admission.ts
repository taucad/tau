import { useCallback, useEffect, useRef } from 'react';
import type { CadAgentExecution } from '@taucad/chat';
import type { ChatExecutionTarget } from '@taucad/chat/schemas';
import { awaitAgentHostAvailability } from '#hooks/use-cad-agent-config.js';
import { useCreditPreflight } from '#hooks/use-credit-preflight.js';
import { useActiveChatSession } from '#hooks/active-chat-provider.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { parseErrorForPersistence } from '#utils/error.utils.js';
import { useProject } from '#hooks/use-project.js';
import { useOptionalChatWorkspaceAuthority } from '#providers/chat-workspace-authority-provider.js';
import { isBrowserAgentHostProviderKind } from '#services/agent-host-client.js';
import { daemonPlacementOf } from '#lib/agent-host-placement.js';
import { useModels } from '#hooks/use-models.js';
import type { ResolvedModel } from '#hooks/use-models.js';

/** Upper bound on waiting for a conflicting admitted claim to clear. Milliseconds. */
const admissionWaitTimeout = 15_000;
/** Upper bound on waiting for `GET /v1/models` to answer before a turn composes. Milliseconds. */
const modelCatalogWaitTimeout = 20_000;

/** The single admission path every verb of one chat goes through. @public */
export type TurnAdmission = Readonly<{
  /**
   * Prepare (or reuse) this chat's workspace and mark it admitted.
   *
   * @param turnId - The user message this turn leases.
   * @param turnExecution - The execution this dispatch runs, when not the live one.
   * @returns The turn's execution target and the run id its claim carries.
   */
  admitWorkspace: (
    turnId: string | undefined,
    turnExecution?: CadAgentExecution,
  ) => Promise<readonly [ChatExecutionTarget, string | undefined]>;
  /** Surface a dropped dispatch on the same banner the transport errors use. */
  surfaceDispatchFailure: (error: unknown) => void;
  /** The catalog row for one model, waiting out a cold `GET /v1/models`. */
  awaitResolvedModel: (modelId: string) => Promise<ResolvedModel>;
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
  const workspaceAuthority = useOptionalChatWorkspaceAuthority();
  // Always the current resolver: a dispatch composed before `GET /v1/models`
  // answers must read the catalog row that arrives *while* it waits, not the
  // unresolved one its render closed over.
  const resolveModelRef = useRef(resolveModel);
  useEffect(() => {
    resolveModelRef.current = resolveModel;
  }, [resolveModel]);

  const awaitResolvedModel = useCallback(async (modelId: string): Promise<ResolvedModel> => {
    const deadline = Date.now() + modelCatalogWaitTimeout;
    let resolved = resolveModelRef.current(modelId);
    while (!resolved.isResolved && Date.now() < deadline) {
      // oxlint-disable-next-line no-await-in-loop -- polling the catalog is inherently serial
      await new Promise<void>((resolve) => {
        globalThis.setTimeout(resolve, 100);
      });
      resolved = resolveModelRef.current(modelId);
    }
    return resolved;
  }, []);

  const admitWorkspace = useCallback(
    async (
      turnId: string | undefined,
      turnExecution: CadAgentExecution = liveExecution,
    ): Promise<readonly [ChatExecutionTarget, string | undefined]> => {
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
        // The host config is built from the model's catalog row (provider wire,
        // context window, rates). The seeded first turn composes before
        // `GET /v1/models` answers, and reading an unresolved row threw the
        // turn away instead of waiting the moment out.
        const resolved = await awaitResolvedModel(turnExecution.model);
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
         * workspace is prepared or admitted, with the same credits payload the
         * gateway's own 402 would have carried. An unavailable balance or a
         * route with no published estimate returns silently — the server's
         * admission stays the authority, and a failed read never blocks a turn. */
        creditPreflight(turnExecution.model, resolved.name);
      }
      if (daemonHostId !== undefined) {
        /* No browser turn: the daemon owns the files, mints its own base and
         * records its own revision, so placing one here would lease a checkout
         * nothing writes to. */
        return [{ hostId: daemonHostId }, undefined];
      }
      if (!workspaceAuthority) {
        throw new Error('The durable workspace authority is unavailable for this chat.');
      }
      const current = workspaceAuthority.get(activeChatId);
      if (current?.admitted) {
        await new Promise<void>((resolve, reject) => {
          let unsubscribe = (): void => undefined;
          // A claim whose run died leaves `admitted` set forever; an
          // unbounded wait here silently swallowed the submit. Bound it and
          // let the rejection reach the chat error banner — the stale claim
          // itself is retired by `ProjectChatRunSettlement` on the next mount.
          const admissionExpiry = globalThis.setTimeout(() => {
            unsubscribe();
            reject(
              new Error('This chat is still holding a workspace from an earlier run. Reload the page to release it.'),
            );
          }, admissionWaitTimeout);
          const settle = (): void => {
            if (workspaceAuthority.get(activeChatId)?.admitted) {
              return;
            }
            globalThis.clearTimeout(admissionExpiry);
            unsubscribe();
            resolve();
          };
          unsubscribe = workspaceAuthority.subscribe(settle);
          settle();
        });
      }
      const prepared =
        workspaceAuthority.get(activeChatId) ??
        (await workspaceAuthority.prepare(activeChatId, turnId === undefined ? undefined : { turnId }));
      await workspaceAuthority.markAdmitted(activeChatId, turnId);
      return [prepared.execution, prepared.runId];
    },
    [activeChatId, awaitResolvedModel, creditPreflight, liveExecution, projectId, workspaceAuthority],
  );

  const surfaceDispatchFailure = useCallback(
    (error: unknown): void => {
      console.error('[useTurnAdmission] durable workspace admission failed', error);
      store.get(activeChatId)?.persistenceActorRef.send({
        type: 'setPersistedError',
        error: parseErrorForPersistence(
          error instanceof Error ? error : new Error('Durable workspace admission failed', { cause: error }),
        ),
      });
    },
    [activeChatId, store],
  );

  return { admitWorkspace, surfaceDispatchFailure, awaitResolvedModel };
};
