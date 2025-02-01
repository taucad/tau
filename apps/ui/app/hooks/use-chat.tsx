import { useState } from 'react';
import { useEventSource } from './use-event-source';
import { MOCK_CHAT_MESSAGES } from './chat-mock';
// import { MOCK_CHAT_MESSAGES } from './chat-mock';

export type ChatInterfaceProperties = {
  chatId: string;
};

type MessageEventSchema = {
  timestamp: number;
  id: string;
  content:
    | string
    | {
        description: string;
        input: string;
        output: {
          title: string;
          link: string;
          snippet: string;
        }[];
      };
  status: ChatEvent;
};

export enum MessageRole {
  User = 'user',
  Assistant = 'assistant',
}

export enum MessageStatus {
  Pending = 'pending',
  Success = 'success',
  Error = 'error',
}

export type SourceOrigin = 'web' | 'notion' | 'history' | 'projects';

export type MessageSchema = {
  id: string;
  threadId?: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  metadata?: {
    systemHints?: string[];
  };
  toolCalls?: {
    origin: SourceOrigin;
    input: string;
    output: {
      title: string;
      link: string;
      snippet: string;
    }[];
    description: string;
  }[];
};

export enum ChatEvent {
  OnChatModelStart = 'on_chat_model_start',
  OnChatModelEnd = 'on_chat_model_end',
  OnChatModelStream = 'on_chat_model_stream',
  OnToolStart = 'on_tool_start',
  OnToolEnd = 'on_tool_end',
}

export const useChat = () => {
  const [messages, setMessages] = useState<MessageSchema[]>([]);
  const [status, setStatus] = useState<ChatEvent | undefined>();

  const { stream } = useEventSource<MessageEventSchema, { model: string; messages: MessageSchema[] }>({
    url: 'http://localhost:4000/v1/chat',
    onStreamEvent: (event) => {
      setStatus(event.status);
      switch (event.status) {
        case ChatEvent.OnChatModelStream: {
          setMessages((previous) => {
            const currentMessage = previous.at(-1);

            if (!currentMessage) {
              return previous;
            }

            return [
              ...previous.slice(0, -1),
              {
                ...currentMessage,
                content: currentMessage.content + event.content,
              },
            ];
          });

          break;
        }
        case ChatEvent.OnChatModelStart: {
          setMessages((previous) => {
            const lastMessage = previous.at(-1);

            if (lastMessage?.status === MessageStatus.Pending && lastMessage?.content.length === 0) {
              return previous;
            }

            return [
              ...previous,
              {
                ...lastMessage,
                id: event.id,
                role: MessageRole.Assistant,
                content: '',
                status: MessageStatus.Pending,
                toolCalls: [],
              },
            ];
          });

          break;
        }
        case ChatEvent.OnChatModelEnd: {
          setMessages((previous) => {
            const lastMessage = previous.at(-1);

            if (!lastMessage) {
              return previous;
            }

            if (lastMessage.status === MessageStatus.Pending && lastMessage.content.length === 0) {
              return previous;
            }

            return [...previous.slice(0, -1), { ...lastMessage, status: MessageStatus.Success }];
          });

          break;
        }
        case ChatEvent.OnToolStart: {
          setMessages((previous) => {
            if (typeof event.content === 'string') {
              throw new TypeError('Invalid event content');
            }

            const lastMessage = previous.at(-1);

            if (!lastMessage) {
              return previous;
            }

            return [
              ...previous.slice(0, -1),
              {
                ...lastMessage,
                toolCalls: [
                  {
                    origin: 'web',
                    description: event.content.description,
                    input: event.content.input,
                    output: [],
                  },
                ],
              },
            ];
          });

          break;
        }
        case ChatEvent.OnToolEnd: {
          setMessages((previous) => {
            const lastMessage = previous.at(-1);

            if (typeof event.content === 'string') {
              throw new TypeError('Invalid event content');
            }

            if (!lastMessage) {
              return previous;
            }

            return [
              ...previous.slice(0, -1),
              {
                ...lastMessage,
                toolCalls: [
                  {
                    origin: 'web',
                    description: event.content.description,
                    input: event.content.input,
                    output: event.content.output,
                  },
                ],
              },
            ];
          });

          break;
        }
        // No default
      }
    },
  });

  const sendMessage = async ({ message, model }: { message: Omit<MessageSchema, 'id'>; model: string }) => {
    const id = Math.random().toString(36).slice(2, 15) + Math.random().toString(36).slice(2, 15);
    setMessages((messages) => [...messages, { ...message, id }]);
    await stream({ model, messages: [...messages, { ...message, id }] });
  };

  const editMessage = async (messageId: string, content: string) => {
    let newMessages: MessageSchema[] = [];
    setMessages((messages) => {
      const index = messages.findIndex((message) => message.id === messageId);
      if (index === -1) {
        throw new Error('Message not found');
      }

      newMessages = [...messages.slice(0, index), { ...messages[index], content }];
      return newMessages;
    });
    console.log(newMessages);
    await stream({ model: 'gpt-4o', messages: newMessages });
  };

  return {
    status,
    messages,
    sendMessage,
    editMessage,
  };
};
