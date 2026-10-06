/** Compose one focused chat's explicit Start/Resume command from its live selection and transcript. */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { isResumableRun } from '@taucad/agent-host';
import { useCadAgentConfig } from '#hooks/use-cad-agent-config.js';
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
import { commandOf, turnIntentOf, turnTriggerOf } from '#chat-clients/turn-intent.js';
import { externalAdmissionConfig, wireAdmissionConfig } from '#services/agent-host-client.js';
import { buildUserMessage } from '#utils/chat.utils.js';
import { selectCaughtUp, selectCurrentRun } from '#machines/chat-projection.logic.js';
import { createAgentUsageTelemetry } from '#chat-clients/_internal/agent-usage-telemetry.js';

/** The route publishes command composition; project-scoped host observation lives in ProjectSessionBinding. */
export function ChatTurnHost(): ReactNode {
  const agent = useCadAgentConfig();
  const { activeChatId } = useActiveChatSession();
  const chat = useActiveChatInstance();
  const store = useChatSessionStore();
  const { resolveModel } = useModels();
  const {
    execution: { setActiveExecution },
  } = useChatComposer();
  const { admitExecution, surfaceDispatchFailure } = useTurnAdmission(agent.execution);
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
    resolveModelRef.current = resolveModel;
    setActiveExecutionRef.current = setActiveExecution;
  }, [agent, resolveModel, setActiveExecution]);

  const admit = useCallback(
    async (gesture: ChatTurnGesture): Promise<ChatTurn> => {
      const liveAgent = agentRef.current;
      const execution = gesture.kind === 'regenerate' && gesture.execution ? gesture.execution : liveAgent.execution;
      const turnAgent = execution === liveAgent.execution ? liveAgent : { ...liveAgent, execution };
      const projection = store.getProjection(activeChatId);
      const projectedRun =
        projection !== undefined && selectCaughtUp(projection) ? selectCurrentRun(projection) : undefined;
      const messages = Array.isArray(chat.messages) ? chat.messages : [];
      const turnTelemetry = telemetry.begin(execution);
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
        await admitExecution(execution);
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
          gesture.kind === 'regenerate' && gesture.requestId !== undefined
            ? gesture.requestId
            : generatePrefixedId(idPrefix.request);
        const browserHost = hostAdmission({
          agent: turnAgent,
          chatId: activeChatId,
          resolveModel: resolveModelRef.current,
          trigger: turnTriggerOf(intent),
        })!(runId);
        const transcript =
          gesture.kind === 'send'
            ? [...messages, gesture.message]
            : gesture.kind === 'edit'
              ? (() => {
                  const index = messages.findIndex((message) => message.id === gesture.messageId);
                  if (index === -1) {
                    throw new Error('That message is no longer in this chat, so it cannot be edited.');
                  }
                  const original = messages[index]!;
                  const rebuilt = buildUserMessage({ text: gesture.text, attachments: gesture.attachments });
                  return [
                    ...messages.slice(0, index),
                    { ...rebuilt, id: original.id, metadata: { ...original.metadata, ...rebuilt.metadata } },
                  ];
                })()
              : messages;
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
            ? { kind: 'send', message: gesture.message, command }
            : gesture.kind === 'edit'
              ? {
                  kind: 'edit',
                  messageId: gesture.messageId,
                  content: gesture.text,
                  ...(gesture.attachments === undefined ? {} : { attachments: gesture.attachments }),
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
