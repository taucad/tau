import { createContext, useContext, useReducer, ReactNode, useRef, useEffect } from 'react';
import { Message, MessageRole, MessageStatus, MessageContent } from '@/types/chat';
import { generatePrefixedId } from '@/utils/id';
import { PREFIX_TYPES } from '@/utils/constants';
import { useEventSource } from '@/hooks/use-event-source';
import { ENV } from '@/config';
import { useCookie } from '@/utils/cookies';
import { replicadSystemPrompt } from '@/routes/builds_.$id/chat-prompt-replicad';

const CHAT_MODEL_COOKIE_NAME = 'tau-chat-model';
const DEFAULT_CHAT_MODEL = 'gpt-4o-mini';

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
  type?: 'text' | 'thinking';
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
}

type ChatAction =
  | { type: 'SET_MESSAGES'; payload: Message[] }
  | { type: 'ADD_MESSAGE'; payload: Message }
  | {
      type: 'UPDATE_MESSAGE';
      payload: {
        messageId: string;
        content?: string | MessageContent[];
        thinking?: string;
        status?: MessageStatus;
      };
    }
  | {
      type: 'EDIT_MESSAGE';
      payload: {
        messageId: string;
        content: string | MessageContent[];
        thinking?: string;
        toolCalls?: Message['toolCalls'];
        status?: MessageStatus;
      };
    }
  | { type: 'SET_STATUS'; payload: string }
  | { type: 'SET_ACTIVE_STREAM'; payload: string | undefined }
  | { type: 'SET_INITIALIZING'; payload: boolean };

const initialState: ChatState = {
  messages: [],
  status: undefined,
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
      const { messageId, content, thinking, status } = action.payload;
      return {
        ...state,
        messages: state.messages.map((message) => {
          if (message.id === messageId) {
            const updatedContent =
              content === undefined
                ? message.content
                : typeof content === 'string'
                  ? [{ type: 'text' as const, text: content }]
                  : content;

            return {
              ...message,
              content: updatedContent,
              thinking:
                thinking === undefined ? message.thinking : message.thinking ? message.thinking + thinking : thinking,
              status: status ?? message.status,
              updatedAt: Date.now(),
            };
          }
          return message;
        }),
      };
    }
    case 'EDIT_MESSAGE': {
      const { messageId, content, thinking, toolCalls, status } = action.payload;
      return {
        ...state,
        messages: state.messages.map((message) => {
          if (message.id === messageId) {
            const updatedContent = typeof content === 'string' ? [{ type: 'text' as const, text: content }] : content;

            return {
              ...message,
              content: updatedContent,
              thinking: thinking ?? message.thinking,
              toolCalls: toolCalls ?? message.toolCalls,
              status: status ?? message.status,
              updatedAt: Date.now(),
            };
          }
          return message;
        }),
      };
    }
    case 'SET_STATUS': {
      return {
        ...state,
        status: action.payload,
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
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  addMessage: (message: Message) => void;
  editMessage: (message: Message) => void;
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
  const messagesReference = useRef(state.messages);
  const contentBuffer = useRef('');

  const [selectedModel, setSelectedModel] = useCookie(CHAT_MODEL_COOKIE_NAME, DEFAULT_CHAT_MODEL);

  useEffect(() => {
    messagesReference.current = state.messages;
  }, [state.messages]);

  // Handle initial messages loading
  useEffect(() => {
    // Set messages first
    dispatch({ type: 'SET_MESSAGES', payload: initialMessages ?? [] });
  }, [initialMessages]);

  const { stream } = useEventSource<MessageEventSchema, { model: string; messages: Message[] }>({
    url: `${ENV.TAU_API_URL}/v1/chat`,
    onStreamEvent: (event) => {
      dispatch({ type: 'SET_STATUS', payload: event.status });

      switch (event.status) {
        case ChatEvent.OnChatModelStart: {
          const lastMessage = messagesReference.current.at(-1);

          if (!lastMessage) {
            throw new Error('No last message found');
          }

          if (lastMessage.role === MessageRole.User) {
            // After the server responds to the user's message, set it to success
            dispatch({ type: 'UPDATE_MESSAGE', payload: { messageId: lastMessage.id, status: MessageStatus.Success } });

            // Create a new assistant message to append subsequent content to
            const newMessage = createMessage({
              content: '',
              role: MessageRole.Assistant,
              status: MessageStatus.Pending,
              model: lastMessage?.model || '',
            });
            dispatch({ type: 'ADD_MESSAGE', payload: newMessage });
          } else {
            // Reset existing message content if it's pending.
            // This happens when the server responds to a tool call.
            // TODO: revise this logic to ensure that the full assistant message content is shown to the user,
            // currently the tool call content is not shown with this logic.
            if (lastMessage.status === MessageStatus.Pending) {
              // Create a properly formatted empty content array
              const emptyContent: MessageContent[] = [
                {
                  type: 'text',
                  text: '',
                },
              ];

              dispatch({
                type: 'EDIT_MESSAGE',
                payload: {
                  messageId: lastMessage.id,
                  content: emptyContent,
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

          // Handle content based on type (text or thinking)
          const type = event.type;

          if (type === 'text') {
            // Add new content to the buffer
            contentBuffer.current += event.content;

            // Find existing message content
            const currentContent = [...lastMessage.content];

            // Find if there's an existing text content to update
            const textContentIndex = currentContent.findIndex((item) => item.type === 'text');

            if (textContentIndex === -1) {
              // Add new text content
              currentContent.unshift({
                type: 'text',
                text: contentBuffer.current,
              });
            } else {
              // Update existing text content
              currentContent[textContentIndex] = {
                type: 'text',
                text: contentBuffer.current,
              };
            }

            dispatch({
              type: 'EDIT_MESSAGE',
              payload: {
                messageId: lastMessage.id,
                content: currentContent,
                status: MessageStatus.Pending,
              },
            });
          } else if (type === 'thinking') {
            // For thinking type, we update the thinking attribute
            dispatch({
              type: 'UPDATE_MESSAGE',
              payload: {
                messageId: lastMessage.id,
                thinking: event.content,
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

  const sendMessage = async ({ message, model }: { message: Message; model: string }) => {
    const systemMessage = createMessage({
      content: replicadSystemPrompt,
      role: MessageRole.User,
      model: '',
      status: MessageStatus.Success,
    });
    const currentMessages = [systemMessage, ...messagesReference.current, message];
    await stream({ model, messages: currentMessages });
  };

  const addMessage = (message: Message) => {
    dispatch({ type: 'ADD_MESSAGE', payload: message });
    sendMessage({ message, model: message.model });
  };

  const setMessages = (messages: Message[]) => {
    dispatch({ type: 'SET_MESSAGES', payload: messages });

    // Handle any pending messages. Messages are set to pending when they are created,
    // then set to success after the stream has completed. This ensures that when network
    // connectivity is restored, the message is sent again.
    const lastMessage = messages.at(-1);
    if (!lastMessage) return;

    if (lastMessage.status === MessageStatus.Pending) {
      sendMessage({
        message: lastMessage,
        model: lastMessage.model,
      });
    }
  };

  const editMessage = async (message: Message) => {
    const messageIndex = messagesReference.current.findIndex((m) => m.id === message.id);
    if (messageIndex === -1) return;

    const updatedMessages = [...messagesReference.current.slice(0, messageIndex), message];

    // FIXME: tidy this up to route via the `setMessages` function
    dispatch({ type: 'SET_MESSAGES', payload: updatedMessages });

    const systemMessage = createMessage({
      content: replicadSystemPrompt,
      role: MessageRole.User,
      model: '',
      status: MessageStatus.Success,
    });
    const currentMessages = [systemMessage, ...updatedMessages];

    await stream({ model: message.model, messages: currentMessages });
  };

  return (
    <ChatContext.Provider
      value={{
        messages: state.messages,
        status: state.status,
        selectedModel,
        setSelectedModel,
        editMessage,
        addMessage,
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
  id,
  content,
  role,
  model,
  thinking,
  status,
  metadata = {},
  imageUrls = [],
}: {
  id?: string;
  content: string;
  role: MessageRole;
  model: string;
  thinking?: string;
  status: MessageStatus;
  metadata?: {
    systemHints?: string[];
  };
  imageUrls?: string[];
}): Message {
  const contentArray: MessageContent[] = [
    ...imageUrls.map((url) => ({
      type: 'image_url' as const,
      image_url: {
        url,
      },
    })),
    { type: 'text' as const, text: content.trim() },
  ];

  return {
    id: id ?? generatePrefixedId(PREFIX_TYPES.MESSAGE),
    role,
    content: contentArray,
    thinking,
    status,
    model,
    metadata,
    toolCalls: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
