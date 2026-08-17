import { createMiddleware } from 'langchain';
import type { AgentMiddleware } from 'langchain';
import { AIMessage } from '@langchain/core/messages';

type ToolCallIdentity = {
  id?: string;
  name?: string;
};

export const assertValidToolCallIds = (toolCalls: readonly ToolCallIdentity[]): void => {
  const seen = new Set<string>();

  for (const [index, toolCall] of toolCalls.entries()) {
    const id = toolCall.id?.trim();
    const name = toolCall.name ?? `tool call ${index}`;
    if (!id) {
      throw new Error(`Invalid model tool-call ids: ${name} is missing a tool-call id.`);
    }
    if (seen.has(id)) {
      throw new Error(`Invalid model tool-call ids: duplicate tool-call id "${id}".`);
    }
    seen.add(id);
  }
};

export const createToolCallIdentityMiddleware = (): AgentMiddleware =>
  createMiddleware({
    name: 'ToolCallIdentity',

    afterModel(state) {
      const { messages } = state;
      const lastMessage = messages.at(-1);
      if (!lastMessage || !AIMessage.isInstance(lastMessage)) {
        return undefined;
      }

      assertValidToolCallIds(lastMessage.tool_calls ?? []);
      return undefined;
    },
  });
