import { createContext, useContext, useReducer, ReactNode, useRef, useEffect } from 'react';
import { Message, MessageRole, MessageStatus } from '@/types/chat';
import { generatePrefixedId } from '@/utils/id';
import { PREFIX_TYPES } from '@/utils/constants';
import { useEventSource } from '@/hooks/use-event-source';
import { useEnvironment } from '@/hooks/use-environment';

export enum ChatEvent {
  OnChatModelStart = 'on_chat_model_start',
  OnChatModelEnd = 'on_chat_model_end',
  OnChatModelStream = 'on_chat_model_stream',
  OnToolStart = 'on_tool_start',
  OnToolEnd = 'on_tool_end',
}

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

interface ChatState {
  messages: Message[];
  status?: string;
  activeStreamId?: string;
  initializing: boolean;
}

type ChatAction =
  | { type: 'SET_MESSAGES'; payload: Message[] }
  | { type: 'ADD_MESSAGE'; payload: Message }
  | { type: 'UPDATE_MESSAGE'; payload: { messageId: string; content: string } }
  | {
      type: 'EDIT_MESSAGE';
      payload: { messageId: string; content: string; toolCalls?: Message['toolCalls']; status?: MessageStatus };
    }
  | { type: 'SET_STATUS'; payload: string }
  | { type: 'SET_ACTIVE_STREAM'; payload: string | undefined }
  | { type: 'SET_INITIALIZING'; payload: boolean };

const initialState: ChatState = {
  messages: [],
  status: undefined,
  activeStreamId: undefined,
  initializing: true,
};

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'SET_MESSAGES': {
      return {
        ...state,
        messages: action.payload,
      };
    }
    case 'ADD_MESSAGE': {
      return {
        ...state,
        messages: [...state.messages, action.payload],
      };
    }
    case 'UPDATE_MESSAGE': {
      const { messageId, content } = action.payload;
      return {
        ...state,
        messages: state.messages.map((message) =>
          message.id === messageId ? { ...message, content: message.content + content } : message,
        ),
      };
    }
    case 'EDIT_MESSAGE': {
      const { messageId, content, toolCalls, status } = action.payload;
      return {
        ...state,
        messages: state.messages.map((message) =>
          message.id === messageId
            ? { ...message, content, toolCalls: toolCalls ?? message.toolCalls, status: status ?? message.status }
            : message,
        ),
      };
    }
    case 'SET_STATUS': {
      return {
        ...state,
        status: action.payload,
      };
    }
    case 'SET_ACTIVE_STREAM': {
      return {
        ...state,
        activeStreamId: action.payload,
      };
    }
    case 'SET_INITIALIZING': {
      return {
        ...state,
        initializing: action.payload,
      };
    }
    default: {
      return state;
    }
  }
}

interface ChatContextValue {
  messages: Message[];
  status?: string;
  sendMessage: (parameters: {
    message: Omit<Message, 'id' | 'createdAt' | 'updatedAt'>;
    model: string;
  }) => Promise<void>;
  editMessage: (messageId: string, content: string) => Promise<void>;
  setMessages: (messages: Message[]) => void;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

interface ChatProviderProperties {
  children: ReactNode;
  initialMessages?: Message[];
}

export function ChatProvider({ children, initialMessages }: ChatProviderProperties) {
  const [state, dispatch] = useReducer(chatReducer, {
    ...initialState,
    messages: initialMessages ?? [],
  });
  const { TAU_API_BASE_URL } = useEnvironment();
  const messagesReference = useRef(state.messages);
  const contentBuffer = useRef('');

  useEffect(() => {
    messagesReference.current = state.messages;
  }, [state.messages]);

  // Handle initial messages loading
  useEffect(() => {
    if (!initialMessages?.length) {
      dispatch({ type: 'SET_INITIALIZING', payload: false });
      return;
    }

    // Find any pending messages that need to be continued
    const pendingMessage = initialMessages.find((message) => message.status === MessageStatus.Pending);

    // Set messages first
    dispatch({ type: 'SET_MESSAGES', payload: initialMessages });

    // Then set active stream if needed
    if (pendingMessage) {
      dispatch({ type: 'SET_ACTIVE_STREAM', payload: pendingMessage.id });
    }

    // Mark initialization as complete
    dispatch({ type: 'SET_INITIALIZING', payload: false });
  }, [initialMessages]);

  const { stream } = useEventSource<MessageEventSchema, { model: string; messages: Message[] }>({
    url: `${TAU_API_BASE_URL}/v1/chat`,
    onStreamEvent: (event) => {
      dispatch({ type: 'SET_STATUS', payload: event.status });

      switch (event.status) {
        case ChatEvent.OnChatModelStart: {
          const lastMessage = messagesReference.current.at(-1);
          if (!lastMessage || lastMessage.role !== MessageRole.Assistant) {
            const newMessage = createMessage({
              content: '',
              role: MessageRole.Assistant,
              status: MessageStatus.Pending,
              model: lastMessage?.model || '',
            });
            dispatch({ type: 'ADD_MESSAGE', payload: newMessage });
          } else {
            // Reset existing message content if it's pending
            if (lastMessage.status === MessageStatus.Pending) {
              dispatch({
                type: 'EDIT_MESSAGE',
                payload: {
                  messageId: lastMessage.id,
                  content: '',
                  status: MessageStatus.Pending,
                },
              });
            }
          }
          // Reset the content buffer
          contentBuffer.current = '';
          break;
        }
        case ChatEvent.OnChatModelStream: {
          if (typeof event.content !== 'string') {
            throw new TypeError('Invalid event content');
          }

          const lastMessage = messagesReference.current.at(-1);
          if (!lastMessage || lastMessage.role !== MessageRole.Assistant) break;

          // Add new content to the buffer
          contentBuffer.current += event.content;

          // Only update the message if we have a complete word or punctuation
          if (/[\s!,.:;?]/.test(event.content)) {
            dispatch({
              type: 'EDIT_MESSAGE',
              payload: {
                messageId: lastMessage.id,
                content: contentBuffer.current,
                status: MessageStatus.Pending,
              },
            });
          }
          break;
        }
        case ChatEvent.OnToolStart: {
          if (typeof event.content === 'string') {
            throw new TypeError('Invalid event content');
          }

          const lastMessage = messagesReference.current.at(-1);
          if (!lastMessage || lastMessage.role !== MessageRole.Assistant) break;

          // Ensure we flush any remaining content from the buffer
          if (contentBuffer.current) {
            dispatch({
              type: 'EDIT_MESSAGE',
              payload: {
                messageId: lastMessage.id,
                content: contentBuffer.current,
                toolCalls: [
                  ...(lastMessage.toolCalls || []),
                  {
                    origin: 'web' as const,
                    description: event.content.description,
                    input: event.content.input,
                    output: [],
                  },
                ],
                status: MessageStatus.Pending,
              },
            });
          } else {
            dispatch({
              type: 'EDIT_MESSAGE',
              payload: {
                messageId: lastMessage.id,
                content: lastMessage.content || '',
                toolCalls: [
                  ...(lastMessage.toolCalls || []),
                  {
                    origin: 'web' as const,
                    description: event.content.description,
                    input: event.content.input,
                    output: [],
                  },
                ],
                status: MessageStatus.Pending,
              },
            });
          }
          break;
        }
        case ChatEvent.OnToolEnd: {
          if (typeof event.content === 'string') {
            throw new TypeError('Invalid event content');
          }

          const lastMessage = messagesReference.current.at(-1);
          if (!lastMessage || lastMessage.role !== MessageRole.Assistant) break;

          const updatedToolCalls = [...(lastMessage.toolCalls || [])];
          const { description, input, output } = event.content;
          const toolCallIndex = updatedToolCalls.findIndex(
            (call) => call.description === description && call.input === input,
          );

          if (toolCallIndex === -1) {
            updatedToolCalls.push({
              origin: 'web' as const,
              description,
              input,
              output,
            });
          } else {
            updatedToolCalls[toolCallIndex] = {
              ...updatedToolCalls[toolCallIndex],
              output,
            };
          }

          dispatch({
            type: 'EDIT_MESSAGE',
            payload: {
              messageId: lastMessage.id,
              content: contentBuffer.current || lastMessage.content || '',
              toolCalls: updatedToolCalls,
              status: MessageStatus.Pending,
            },
          });
          break;
        }
        case ChatEvent.OnChatModelEnd: {
          const lastMessage = messagesReference.current.at(-1);
          if (!lastMessage || lastMessage.role !== MessageRole.Assistant) break;

          // Ensure we flush any remaining content
          dispatch({
            type: 'EDIT_MESSAGE',
            payload: {
              messageId: lastMessage.id,
              content: contentBuffer.current || lastMessage.content || '',
              toolCalls: lastMessage.toolCalls,
              status: MessageStatus.Success,
            },
          });
          // Clear active stream and buffer when complete
          contentBuffer.current = '';
          dispatch({ type: 'SET_ACTIVE_STREAM', payload: undefined });
          break;
        }
        // No default
      }
    },
  });

  const sendMessage = async ({
    message,
    model,
  }: {
    message: Omit<Message, 'id' | 'createdAt' | 'updatedAt'>;
    model: string;
  }) => {
    // Don't send messages while initializing or if already streaming
    if (state.initializing || state.activeStreamId) return;

    // Find any existing pending message with the same content
    const existingMessage = messagesReference.current.find(
      (m) => m.role === message.role && m.content === message.content && m.status === MessageStatus.Pending,
    );

    if (existingMessage) {
      // If we found an existing message, use its ID as the active stream
      dispatch({ type: 'SET_ACTIVE_STREAM', payload: existingMessage.id });
    } else {
      const userMessage = createMessage({
        content: message.content,
        role: message.role,
        model,
        status: message.status,
        metadata: message.metadata,
      });
      dispatch({ type: 'ADD_MESSAGE', payload: userMessage });
      dispatch({ type: 'SET_ACTIVE_STREAM', payload: userMessage.id });
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
    const currentMessages = [...messagesReference.current];
    await stream({ model, messages: currentMessages });
  };

  const editMessage = async (messageId: string, content: string) => {
    // Don't edit messages while initializing or if already streaming
    if (state.initializing || state.activeStreamId) return;

    dispatch({ type: 'EDIT_MESSAGE', payload: { messageId, content } });
    dispatch({ type: 'SET_ACTIVE_STREAM', payload: messageId });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const currentMessages = [...messagesReference.current];
    await stream({ model: 'gpt-4', messages: currentMessages });
  };

  const setMessages = (messages: Message[]) => {
    dispatch({ type: 'SET_MESSAGES', payload: messages });
  };

  return (
    <ChatContext.Provider
      value={{
        messages: state.messages,
        status: state.status,
        sendMessage,
        editMessage,
        setMessages,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}

// Helper function to create a new message
export function createMessage({
  content,
  role,
  model,
  status = MessageStatus.Success,
  metadata = {},
}: {
  content: string;
  role: MessageRole;
  model: string;
  status?: MessageStatus;
  metadata?: Record<string, unknown>;
}): Message {
  return {
    id: generatePrefixedId(PREFIX_TYPES.MESSAGE),
    content,
    role,
    model,
    status,
    metadata,
    toolCalls: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
