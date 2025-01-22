import { useState } from 'react';
import { useEventSource } from './use-event-source';
import { MOCK_CHAT_MESSAGES } from './chat-mock';

export type ChatInterfaceProperties = {
  chatId: string;
};

type MessageEventSchema = {
  timestamp: number;
  content: string;
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

export type MessageSchema = {
  role: MessageRole;
  content: string;
  status: MessageStatus;
};

export enum ChatEvent {
  OnChatModelStart = 'on_chat_model_start',
  OnChatModelEnd = 'on_chat_model_end',
  OnChatModelStream = 'on_chat_model_stream',
}

export const useChat = () => {
  const [messages, setMessages] = useState<MessageSchema[]>([]);
  const [status, setStatus] = useState<ChatEvent | undefined>();

  const { stream } = useEventSource<MessageEventSchema, { messages: MessageSchema[] }>({
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
                role: currentMessage.role,
                content: currentMessage.content + event.content,
                status: MessageStatus.Pending,
              },
            ];
          });

          break;
        }
        case ChatEvent.OnChatModelStart: {
          setMessages((previous) => [
            ...previous,
            {
              role: MessageRole.Assistant,
              content: '',
              status: MessageStatus.Pending,
            },
          ]);

          break;
        }
        case ChatEvent.OnChatModelEnd: {
          setMessages((previous) => {
            const lastMessage = previous.at(-1);

            if (!lastMessage) {
              return previous;
            }

            return [...previous.slice(0, -1), { ...lastMessage, status: MessageStatus.Success }];
          });

          break;
        }
        // No default
      }
    },
  });

  const sendMessage = async (message: MessageSchema) => {
    setMessages((messages) => [...messages, message]);
    await stream({ messages: [...messages, message] });
  };

  return {
    status,
    messages,
    // currentMessage,
    sendMessage,
  };
};
