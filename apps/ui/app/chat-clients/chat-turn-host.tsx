/** Compose one focused chat's explicit Start/Resume command from its live selection and transcript. */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { isResumableRun } from '@taucad/agent-host';
import { useCadAgentConfig } from '#hooks/use-cad-agent-config.js';
import { awaitContextPayload } from '#hooks/use-context-payload.js';
import { projectSnapshotKernel } from '#hooks/use-chat-snapshot.js';
import { routingKernelProfile } from '#constants/available-kernel-configurations.js';
import { useKernelRoutingPlan } from '#cloud/kernel-commerce.js';
import { getAllFlags } from '#flags/feature-flags.js';
import { useActiveChatInstance } from '#chat-clients/_internal/use-active-chat-instance.js';
import { useActiveChatSession, useChatComposer } from '#hooks/active-chat-provider.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { useModels } from '#hooks/use-models.js';
import { useTurnAdmission } from '#chat-clients/_internal/use-turn-admission.js';
import { publishChatTurnAdmission } from '#chat-clients/_internal/chat-host-binding.js';
import type { ChatRequest, ChatTurn, ChatTurnGesture } from '#machines/chat-session.machine.js';
import { generatePrefixedId } from '@taucad/utils/id';
import { idPrefix } from '@taucad/types/constants';
import { hostAdmission } from '#chat-clients/_internal/turn-body.js';
import { commandOf, turnIntentOf, turnReferencesOf, turnTriggerOf } from '@taucad/chat-ui/chat-clients/turn-intent';
import { externalAdmissionConfig, wireAdmissionConfig } from '#services/agent-host-client.js';
import { buildEditedUserMessage } from '#utils/chat.utils.js';
import { selectCaughtUp, selectCurrentRun } from '#machines/chat-projection.logic.js';
import { createAgentUsageTelemetry } from '#chat-clients/_internal/agent-usage-telemetry.js';
import { useTelemetryConsent } from '#hooks/use-telemetry-consent.js';

/* One stop for whichever of a dispatch's stop and its host's unmount comes first. */
const eitherStop = (...stops: ReadonlyArray<AbortSignal | undefined>): AbortSignal | undefined => {
  const present = stops.filter((stop) => stop !== undefined);
  return present.length === 0 ? undefined : AbortSignal.any(present);
};

/** The route publishes command composition; project-scoped host observation lives in ProjectSessionBinding. */
export function ChatTurnHost(): ReactNode {
  const agent = useCadAgentConfig();
  const { activeChatId } = useActiveChatSession();
  const chat = useActiveChatInstance();
  const store = useChatSessionStore();
  const { resolveModel } = useModels();
  const {
    execution: { setActiveExecution },
    kernel: { preference: kernelPreference, owner: kernelOwner },
  } = useChatComposer();
  /* Auto turns report how they resolved (blueprint D10); the owner is read again when the turn settles. */
  const kernelOwnerRef = useRef(kernelOwner);
  const isAutoRef = useRef(kernelPreference === 'auto');
  /* Stable in an adaptive build, where it reads the plan when called (I4); a pinned build's follows its render. */
  const isPlanAllowed = useKernelRoutingPlan();
  const isPlanAllowedRef = useRef(isPlanAllowed);
  const { admitExecution, surfaceDispatchFailure } = useTurnAdmission(agent.execution);
  /* Agent usage follows the one switch's resolved consent (AR-W6-02); only `granted` reports, `unknown` does not. */
  const { consent } = useTelemetryConsent();
  const consentRef = useRef(consent);
  const agentRef = useRef(agent);
  const resolveModelRef = useRef(resolveModel);
  const setActiveExecutionRef = useRef(setActiveExecution);
  /* Every agent's turn is admitted here once, in the tab that admits it (W36-C). */
  const telemetry = useMemo(
    () =>
      createAgentUsageTelemetry({
        getProjection: () => store.getProjection(activeChatId),
        subscribe: (listener) => store.subscribeProjection(activeChatId, listener),
      }),
    [activeChatId, store],
  );
  useEffect(() => {
    agentRef.current = agent;
    consentRef.current = consent;
    resolveModelRef.current = resolveModel;
    setActiveExecutionRef.current = setActiveExecution;
    kernelOwnerRef.current = kernelOwner;
    isAutoRef.current = kernelPreference === 'auto';
    isPlanAllowedRef.current = isPlanAllowed;
  }, [agent, consent, resolveModel, setActiveExecution, kernelOwner, kernelPreference, isPlanAllowed]);

  /* Aborted when this turn host unmounts (the chat closes, the project switches): a turn held for a cloud open's files
   * then stops waiting (SP2h review); one already admitted runs on, as a turn outlives its view. */
  const mountedRef = useRef<AbortController | undefined>(undefined);
  useEffect(() => {
    const mounted = new AbortController();
    mountedRef.current = mounted;
    return () => {
      mounted.abort(new Error('This chat closed before its turn started.'));
    };
  }, []);

  const admit = useCallback(
    async (gesture: ChatTurnGesture, signal?: AbortSignal): Promise<ChatTurn> => {
      if (gesture.kind === 'send' && gesture.command !== undefined) {
        return {
          runId: gesture.command.payload.runId,
          leaseTurnId: gesture.message.id,
          request: { kind: 'send', message: gesture.message, command: gesture.command, queueId: gesture.queueId },
        };
      }
      const liveAgent = agentRef.current;
      const execution =
        (gesture.kind === 'regenerate' || gesture.kind === 'send') && gesture.execution
          ? gesture.execution
          : liveAgent.execution;
      const turnAgent = execution === liveAgent.execution ? liveAgent : { ...liveAgent, execution };
      const projection = store.getProjection(activeChatId);
      const projectedRun =
        projection !== undefined && selectCaughtUp(projection) ? selectCurrentRun(projection) : undefined;
      const messages = Array.isArray(chat.messages) ? chat.messages : [];
      const turnTelemetry = telemetry.begin(execution, {
        kernelId: turnAgent.kernel,
        consent: consentRef.current,
        ...(isAutoRef.current
          ? { autoKernel: { ownerAtAdmission: kernelOwnerRef.current, readOwner: () => kernelOwnerRef.current } }
          : {}),
      });
      const track = (turn: ChatTurn & { runId: string }): ChatTurn => {
        turnTelemetry.admitted(turn.runId);
        return turn;
      };
      try {
        /* The same runs the composer offers Resume for: a deliberate Stop that kept committed work, or a resumable failure. */
        if (gesture.kind === 'continue' && !isResumableRun(projectedRun)) {
          throw new Error('This turn cannot be resumed. Choose Try again to replay it.');
        }
        const intent = turnIntentOf(
          messages,
          gesture.kind === 'send'
            ? { kind: 'send', messageId: gesture.message.id }
            : gesture.kind === 'edit'
              ? { kind: 'edit', messageId: gesture.messageId }
              : gesture.kind === 'continue'
                ? { kind: 'continue' }
                : { kind: 'regenerate' },
        );
        await admitExecution(execution, eitherStop(signal, mountedRef.current?.signal));
        /* The skills catalog is pinned into the chat's cached prompt on its first turn, so a turn waits for the
         * catalog the way it waits for the host probe (a seeded first turn fires at chat load, ahead of both). */
        const contextPayload =
          execution.kind === 'tau'
            ? ((await awaitContextPayload()) ?? turnAgent.contextPayload)
            : turnAgent.contextPayload;
        /* A host that unmounted during the catalog wait admits nothing for a closed chat. */
        mountedRef.current?.signal.throwIfAborted();
        const withPayload = contextPayload === turnAgent.contextPayload ? turnAgent : { ...turnAgent, contextPayload };
        /* C6 (adaptive app deployment mode I4): the routing set is read now, at admission, not from the snapshot a
         * passive effect last handed the ref; an unresolved plan leaves Zoo out of automatic routing. */
        const routed = withPayload.snapshot?.kernel;
        const admittedAgent =
          routed === undefined
            ? withPayload
            : {
                ...withPayload,
                snapshot: {
                  ...withPayload.snapshot,
                  kernel: projectSnapshotKernel({
                    preference: routed.preference,
                    owner: routed.owner,
                    profile: routingKernelProfile({
                      isPlanAllowed: isPlanAllowedRef.current,
                      isSupplierOpen: getAllFlags().zooCloudDispatch,
                    }),
                  }),
                },
              };
        /* The chat owns what it ran on from its first turn, so a later default
         * cannot move it — and that choice becomes the next new chat's. */
        if (execution === liveAgent.execution) {
          setActiveExecutionRef.current(execution);
        }
        if (intent.trigger === 'resume') {
          const { runId } = projectedRun!;
          return track({
            runId,
            leaseTurnId: intent.leaseTurnId,
            request: {
              kind: 'continue',
              command: commandOf({ kind: 'continue' }, messages, {
                chatId: activeChatId,
                commandId: generatePrefixedId(idPrefix.request),
                runId,
              }),
            },
          });
        }
        const runId =
          (gesture.kind === 'regenerate' || gesture.kind === 'send') && gesture.requestId !== undefined
            ? gesture.requestId
            : generatePrefixedId(idPrefix.request);
        const transcript =
          gesture.kind === 'send'
            ? [...messages, gesture.message]
            : gesture.kind === 'edit'
              ? (() => {
                  const index = messages.findIndex((message) => message.id === gesture.messageId);
                  if (index === -1) {
                    throw new Error('That message is no longer in this chat, so it cannot be edited.');
                  }
                  return [
                    ...messages.slice(0, index),
                    buildEditedUserMessage(messages[index]!, {
                      text: gesture.text,
                      ...(gesture.attachments === undefined ? {} : { attachments: gesture.attachments }),
                      ...(gesture.references === undefined ? {} : { references: gesture.references }),
                    }),
                  ];
                })()
              : messages;
        const browserHost = hostAdmission({
          agent: admittedAgent,
          chatId: activeChatId,
          resolveModel: resolveModelRef.current,
          trigger: turnTriggerOf(intent),
          /* The turn's own message: the sent one, the edited one, or the one a regenerate re-runs. */
          references: turnReferencesOf(transcript),
        })!(runId);
        const command = commandOf(
          gesture.kind === 'send'
            ? { kind: 'send', messageId: gesture.message.id }
            : gesture.kind === 'edit'
              ? { kind: 'edit', messageId: gesture.messageId }
              : { kind: 'regenerate' },
          transcript,
          {
            chatId: activeChatId,
            commandId: runId,
            config:
              'config' in browserHost
                ? wireAdmissionConfig(browserHost.config)
                : externalAdmissionConfig(browserHost.agent, browserHost.context),
          },
        );
        const request: ChatRequest =
          gesture.kind === 'send'
            ? { kind: 'send', message: gesture.message, command, queueId: gesture.queueId }
            : gesture.kind === 'edit'
              ? {
                  kind: 'edit',
                  messageId: gesture.messageId,
                  content: gesture.text,
                  ...(gesture.attachments === undefined ? {} : { attachments: gesture.attachments }),
                  ...(gesture.references === undefined ? {} : { references: gesture.references }),
                  command,
                }
              : { kind: 'regenerate', command };
        return track({ runId, leaseTurnId: intent.leaseTurnId, request });
      } catch (error) {
        turnTelemetry.refused(error);
        surfaceDispatchFailure(error);
        throw error;
      }
    },
    [activeChatId, admitExecution, chat, store, surfaceDispatchFailure, telemetry],
  );

  /* The admitted turn retains its callback; future seeds need a live focused publisher. */
  useEffect(() => {
    const unpublish = publishChatTurnAdmission(activeChatId, admit);
    store.startPendingSeed(activeChatId);
    store.refreshMessageQueue(activeChatId);
    return unpublish;
  }, [activeChatId, admit, store]);

  /* Leaving the chat ends its agent session. */
  useEffect(
    () => () => {
      telemetry.end();
    },
    [telemetry],
  );

  return null;
}
