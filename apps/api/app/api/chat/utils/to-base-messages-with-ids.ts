import { toBaseMessages } from '@ai-sdk/langchain';
import type { BaseMessage } from '@langchain/core/messages';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import type { MyUIMessage } from '@taucad/chat';

export type BaseMessagesWithIds = Awaited<ReturnType<typeof toBaseMessages>>;

const additionalKwargsKey = 'additional_kwargs';

/**
 * Converts Tau UI messages through the AI SDK's canonical LangChain bridge,
 * then restores the stable UI ids that LangGraph's messages reducer needs for
 * replacement and removal semantics.
 */
export async function toBaseMessagesWithIds(messages: readonly MyUIMessage[]): Promise<BaseMessagesWithIds> {
  const baseMessages = await toBaseMessages(messages as MyUIMessage[]);
  return applyUiMessageIds(baseMessages, messages) as BaseMessagesWithIds;
}

export function applyUiMessageIds(
  baseMessages: readonly BaseMessage[],
  uiMessages: readonly MyUIMessage[],
): BaseMessage[] {
  const cursors: Record<MyUIMessage['role'], number> = {
    assistant: 0,
    system: 0,
    user: 0,
  };
  const byRole = {
    assistant: uiMessages.filter((message) => message.role === 'assistant'),
    system: uiMessages.filter((message) => message.role === 'system'),
    user: uiMessages.filter((message) => message.role === 'user'),
  };

  let activeAssistantId: string | undefined;

  for (const message of baseMessages) {
    if (ToolMessage.isInstance(message)) {
      setBaseMessageId(message, deterministicToolMessageId(activeAssistantId, message.tool_call_id));
      continue;
    }

    const role = baseMessageRole(message);
    if (!role) {
      continue;
    }

    const uiMessage = byRole[role][cursors[role]];
    cursors[role] += 1;
    if (!uiMessage) {
      continue;
    }

    setBaseMessageId(message, uiMessage.id);
    attachTauUiMetadata(message, uiMessage);
    if (role === 'assistant') {
      activeAssistantId = uiMessage.id;
    }
  }

  return [...baseMessages];
}

export function deterministicToolMessageId(assistantMessageId: string | undefined, toolCallId: string): string {
  return assistantMessageId ? `${assistantMessageId}:tool:${toolCallId}` : `tool:${toolCallId}`;
}

function baseMessageRole(message: BaseMessage): MyUIMessage['role'] | undefined {
  if (HumanMessage.isInstance(message)) {
    return 'user';
  }
  if (AIMessage.isInstance(message)) {
    return 'assistant';
  }
  if (SystemMessage.isInstance(message)) {
    return 'system';
  }
  return undefined;
}

function setBaseMessageId(message: BaseMessage, id: string): void {
  const mutable = message as BaseMessage & {
    id?: string;
    lc_kwargs?: Record<string, unknown>;
    kwargs?: Record<string, unknown>;
  };
  mutable.id = id;
  mutable.lc_kwargs = { ...mutable.lc_kwargs, id };
  mutable.kwargs = { ...mutable.kwargs, id };
}

function attachTauUiMetadata(message: BaseMessage, uiMessage: MyUIMessage): void {
  const mutable = message as BaseMessage & {
    additional_kwargs: Record<string, unknown>;
    lc_kwargs?: Record<string, unknown>;
  };
  const existingTau = mutable.additional_kwargs['tau'];
  const additionalKwargs = {
    ...mutable.additional_kwargs,
    tau: {
      ...(isRecord(existingTau) ? existingTau : {}),
      ui: {
        id: uiMessage.id,
        role: uiMessage.role,
      },
    },
  };
  mutable.additional_kwargs = additionalKwargs;
  mutable.lc_kwargs = {
    ...mutable.lc_kwargs,
    [additionalKwargsKey]: additionalKwargs,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
