/**
 * This is a wrapper around the useChat hook that allows for multiple handlers
 * to be registered for each event.
 *
 * Tool handlers are an exception, where only one handler can be registered for
 * each tool name.
 *
 * @credit https://github.com/soolv/ai-chat-provider
 */

import { useChat } from '@ai-sdk/react';
import { createContext, useContext, useEffect, useRef, useMemo } from 'react';
import type { JSX } from 'react';

type UseChatArgs = NonNullable<Parameters<typeof useChat>[0]>;

const handlerNames = ['onFinish', 'onError', 'onResponse'] as const;
export type UseChatHandlerName = (typeof handlerNames)[number];

export type UseChatHandlers = {
  [key in UseChatHandlerName]: NonNullable<UseChatArgs[key]>;
} & {
  onToolCall: Map<string, NonNullable<UseChatArgs['onToolCall']>>;
};

type HandlersType = {
  onFinish: Set<NonNullable<UseChatArgs['onFinish']>>;
  onError: Set<NonNullable<UseChatArgs['onError']>>;
  onResponse: Set<NonNullable<UseChatArgs['onResponse']>>;
  onToolCall: Map<string, NonNullable<UseChatArgs['onToolCall']>>;
};

function createInitialHandlers(): HandlersType {
  return {
    onFinish: new Set<NonNullable<UseChatArgs['onFinish']>>(),
    onError: new Set<NonNullable<UseChatArgs['onError']>>(),
    onResponse: new Set<NonNullable<UseChatArgs['onResponse']>>(),
    onToolCall: new Map<string, NonNullable<UseChatArgs['onToolCall']>>(),
  };
}

type AiChatProviderValue = {
  chat: ReturnType<typeof useChat>;
  handlers: HandlersType;
};

const AiChatContext = createContext<AiChatProviderValue | undefined>(undefined);

export function useAiChat(args: Partial<UseChatHandlers> = {}): ReturnType<typeof useChat> {
  const context = useContext(AiChatContext);

  if (!context) {
    throw new Error('useAiChat must be used within a AiChatProvider');
  }

  // Biome-ignore lint/correctness/useExhaustiveDependencies: We only run this effect when the handlers themselves change
  useEffect(() => {
    if (args.onFinish) {
      context.handlers.onFinish.add(args.onFinish);
    }

    if (args.onError) {
      context.handlers.onError.add(args.onError);
    }

    if (args.onResponse) {
      context.handlers.onResponse.add(args.onResponse);
    }

    if (args.onToolCall) {
      for (const [key, value] of args.onToolCall) {
        if (context.handlers.onToolCall.has(key)) {
          throw new Error(`Multiple handlers registered for tool "${key}"`);
        }

        context.handlers.onToolCall.set(key, value);
      }
    }

    return () => {
      if (args.onFinish) {
        context.handlers.onFinish.delete(args.onFinish);
      }

      if (args.onError) {
        context.handlers.onError.delete(args.onError);
      }

      if (args.onResponse) {
        context.handlers.onResponse.delete(args.onResponse);
      }

      if (args.onToolCall) {
        for (const [key] of args.onToolCall) {
          context.handlers.onToolCall.delete(key);
        }
      }
    };
  }, [args.onFinish, args.onError, args.onResponse, args.onToolCall, context]);

  return context.chat;
}

export function AiChatProvider({
  children,
  value,
}: {
  readonly children: React.ReactNode;
  readonly value: Omit<UseChatArgs, 'onFinish' | 'onError' | 'onResponse' | 'onToolCall'>;
}): JSX.Element {
  const handlers = useRef<HandlersType>(createInitialHandlers());

  const chat = useChat({
    ...value,
    onError(...args) {
      for (const handler of handlers.current.onError) {
        handler(...args);
      }
    },
    onFinish(...args) {
      for (const handler of handlers.current.onFinish) {
        handler(...args);
      }
    },
    async onResponse(...args) {
      for (const handler of handlers.current.onResponse) {
        void handler(...args);
      }
    },
    async onToolCall({ toolCall, ...args }) {
      const handler = handlers.current.onToolCall.get(toolCall.toolName);
      if (handler) {
        return handler({ toolCall, ...args });
      }

      console.warn(`No handler for tool call ${toolCall.toolName}`);
    },
  });

  const contextValue = useMemo(() => ({ chat, handlers: handlers.current }), [chat]);

  return <AiChatContext.Provider value={contextValue}>{children}</AiChatContext.Provider>;
}
