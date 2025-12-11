import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { useLoaderData } from 'react-router';
import { useConversation } from '@elevenlabs/react';
import { AudioLinesIcon, CheckIcon, CopyIcon, PhoneOffIcon, SendIcon } from 'lucide-react';
import type { Route } from './+types/route.js';
import { cn } from '#utils/ui.utils.js';
import { Button } from '#components/ui/button.js';
import { Card, CardContent, CardFooter, CardHeader } from '#components/ui/card.js';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '#components/elevenlabs/ui/conversation.js';
import { Input } from '#components/ui/input.js';
import { Message, MessageContent } from '#components/elevenlabs/ui/message.js';
import { Orb } from '#components/elevenlabs/ui/orb.js';
import { Response } from '#components/elevenlabs/ui/response.js';
import { ShimmeringText } from '#components/elevenlabs/ui/shimmering-text.js';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '#components/ui/tooltip.js';

type SystemMessageType = 'initial' | 'connecting' | 'connected' | 'error';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
  type?: SystemMessageType;
};

type ChatActionsProps = ComponentProps<'div'>;

function ChatActions({ className, children, ...props }: ChatActionsProps): React.JSX.Element {
  return (
    <div className={cn('flex items-center gap-1', className)} {...props}>
      {children}
    </div>
  );
}

type ChatActionProps = ComponentProps<typeof Button> & {
  readonly tooltip?: string;
  readonly label?: string;
};

function ChatAction({
  tooltip,
  children,
  label,
  className,
  variant = 'ghost',
  size = 'sm',
  ...props
}: ChatActionProps): React.JSX.Element {
  const button = (
    <Button
      className={cn('relative size-9 p-1.5 text-muted-foreground hover:text-foreground', className)}
      size={size}
      type="button"
      variant={variant}
      {...props}
    >
      {children}
      <span className="sr-only">{label ?? tooltip}</span>
    </Button>
  );

  if (tooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
}

export default function ElevenLabsPage(): React.JSX.Element {
  const loaderData = useLoaderData<Route.ComponentProps['loaderData']>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [agentState, setAgentState] = useState<
    'disconnected' | 'connecting' | 'connected' | 'disconnecting' | undefined
  >('disconnected');
  const [textInput, setTextInput] = useState('');
  const [copiedIndex, setCopiedIndex] = useState<number | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const mediaStreamRef = useRef<MediaStream | undefined>(undefined);
  const isTextOnlyModeRef = useRef<boolean>(true);

  const conversation = useConversation({
    onConnect() {
      // Only clear messages for voice mode
      if (!isTextOnlyModeRef.current) {
        setMessages([]);
      }
    },
    onDisconnect() {
      // Only clear messages for voice mode
      if (!isTextOnlyModeRef.current) {
        setMessages([]);
      }
    },
    onMessage(message) {
      if (message.message) {
        const newMessage: ChatMessage = {
          role: message.role === 'user' ? 'user' : 'assistant',
          content: message.message,
        };
        setMessages((previous) => [...previous, newMessage]);
      }
    },
    onError(error: unknown) {
      console.error('Error:', error);
      setAgentState('disconnected');
    },
    onDebug(debug: unknown) {
      console.log('Debug:', debug);
    },
  });

  const getMicStream = useCallback(async (): Promise<MediaStream> => {
    if (mediaStreamRef.current) {
      return mediaStreamRef.current;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      setErrorMessage(undefined);
      return stream;
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        setErrorMessage('Please enable microphone permissions in your browser.');
      }

      throw error;
    }
  }, []);

  const startConversation = useCallback(
    async (textOnly = true, skipConnectingMessage = false): Promise<void> => {
      try {
        isTextOnlyModeRef.current = textOnly;

        if (!skipConnectingMessage) {
          setMessages([]);
        }

        if (!textOnly) {
          await getMicStream();
        }

        if (!loaderData.agentId) {
          throw new Error('Eleven Labs agent ID is not configured');
        }

        const sessionAgentId = loaderData.agentId;
        if (!sessionAgentId) {
          throw new Error('Eleven Labs agent ID is not configured');
        }

        await conversation.startSession({
          agentId: sessionAgentId,
          connectionType: textOnly ? 'websocket' : 'webrtc',
          clientTools: {
            async logMessage({ message }) {
              console.log(message);
            },
          },
          overrides: {
            conversation: {
              textOnly,
            },
            agent: {
              firstMessage: textOnly ? '' : undefined,
            },
          },
          onStatusChange(status) {
            setAgentState(status.status);
          },
        });
      } catch (error: unknown) {
        console.error(error);
        setAgentState('disconnected');
        setMessages([]);
      }
    },
    [conversation, getMicStream, loaderData.agentId],
  );

  const handleCall = useCallback(async (): Promise<void> => {
    if (agentState === 'disconnected' || agentState === undefined) {
      setAgentState('connecting');
      try {
        await startConversation(false);
      } catch {
        setAgentState('disconnected');
      }
    } else if (agentState === 'connected') {
      void conversation.endSession();
      setAgentState('disconnected');

      if (mediaStreamRef.current) {
        for (const track of mediaStreamRef.current.getTracks()) {
          track.stop();
        }

        mediaStreamRef.current = undefined;
      }
    }
  }, [agentState, conversation, startConversation]);

  const handleTextInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>): void => {
    setTextInput(event.target.value);
  }, []);

  const handleSendText = useCallback(async (): Promise<void> => {
    if (!textInput.trim()) {
      return;
    }

    const messageToSend = textInput;

    if (agentState === 'disconnected' || agentState === undefined) {
      const userMessage: ChatMessage = {
        role: 'user',
        content: messageToSend,
      };
      setTextInput('');
      setAgentState('connecting');

      try {
        await startConversation(true, true);
        // Add message once conversation started
        setMessages([userMessage]);
        // Send message after connection is established
        conversation.sendUserMessage(messageToSend);
      } catch (error: unknown) {
        console.error('Failed to start conversation:', error);
      }
    } else if (agentState === 'connected') {
      const newMessage: ChatMessage = {
        role: 'user',
        content: messageToSend,
      };
      setMessages((previous) => [...previous, newMessage]);
      setTextInput('');

      conversation.sendUserMessage(messageToSend);
    }
  }, [textInput, agentState, conversation, startConversation]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>): void => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void handleSendText();
      }
    },
    [handleSendText],
  );

  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) {
        for (const track of mediaStreamRef.current.getTracks()) {
          track.stop();
        }
      }
    };
  }, []);

  const isCallActive = agentState === 'connected';
  const isTransitioning = agentState === 'connecting' || agentState === 'disconnecting';

  const getInputVolume = useCallback((): number => {
    if (typeof conversation.getInputVolume !== 'function') {
      return 0;
    }

    const rawValue = conversation.getInputVolume();
    return Math.min(1, rawValue ** 0.5 * 2.5);
  }, [conversation]);

  const getOutputVolume = useCallback((): number => {
    if (typeof conversation.getOutputVolume !== 'function') {
      return 0;
    }

    const rawValue = conversation.getOutputVolume();
    return Math.min(1, rawValue ** 0.5 * 2.5);
  }, [conversation]);

  return (
    <div className="mx-auto size-full max-w-4xl flex-1 max-md:px-2">
      <Card className={cn('mx-auto flex h-[380px] w-full flex-col gap-0 overflow-hidden')}>
        <CardHeader className="flex shrink-0 flex-row items-center justify-between pb-4">
          <div className="flex items-center gap-4">
            <div className="relative size-10 overflow-hidden rounded-full ring-1 ring-border">
              <Orb
                className="h-full w-full"
                volumeMode="manual"
                getInputVolume={getInputVolume}
                getOutputVolume={getOutputVolume}
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <p className="text-sm leading-none font-medium">{loaderData.name}</p>
              <div className="flex items-center gap-2">
                {errorMessage ? (
                  <p className="xs text-destructive">{errorMessage}</p>
                ) : agentState === 'disconnected' || agentState === undefined ? (
                  <p className="xs text-muted-foreground">Tap to start voice chat</p>
                ) : agentState === 'connected' ? (
                  <p className="text-xs text-success">Connected</p>
                ) : isTransitioning ? (
                  <ShimmeringText text={agentState} className="text-xs capitalize" />
                ) : null}
              </div>
            </div>
          </div>
          <div
            className={cn(
              'flex h-2 w-2 rounded-full transition-all duration-300',
              agentState === 'connected' && 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]',
              isTransitioning && 'animate-pulse bg-white/40',
            )}
          />
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden p-0">
          <Conversation className="h-full">
            <ConversationContent className="flex min-w-0 flex-col gap-2 p-6 pb-2">
              {messages.length === 0 ? (
                <ConversationEmptyState
                  icon={<Orb className="size-12" />}
                  title={
                    agentState === 'connecting' ? (
                      <ShimmeringText text="Starting conversation" />
                    ) : agentState === 'connected' ? (
                      <ShimmeringText text="Start talking or type" />
                    ) : (
                      'Start a conversation'
                    )
                  }
                  description={
                    agentState === 'connecting'
                      ? 'Connecting...'
                      : agentState === 'connected'
                        ? 'Ready to chat'
                        : 'Type a message or tap the voice button'
                  }
                />
              ) : (
                messages.map((message, index) => {
                  const messageId = `message-${index}`;
                  return (
                    <div key={messageId} className="flex w-full flex-col gap-1">
                      <Message from={message.role}>
                        <MessageContent className="max-w-full min-w-0">
                          <Response className="w-auto wrap-anywhere whitespace-pre-wrap">{message.content}</Response>
                        </MessageContent>
                        {message.role === 'assistant' && (
                          <div className="size-6 shrink-0 self-end overflow-hidden rounded-full ring-1 ring-border">
                            <Orb
                              className="h-full w-full"
                              agentState={isCallActive && index === messages.length - 1 ? 'talking' : undefined}
                            />
                          </div>
                        )}
                      </Message>
                      {message.role === 'assistant' && (
                        <ChatActions>
                          <ChatAction
                            size="sm"
                            tooltip={copiedIndex === index ? 'Copied!' : 'Copy'}
                            onClick={() => {
                              void navigator.clipboard.writeText(message.content);
                              setCopiedIndex(index);
                              setTimeout(() => {
                                setCopiedIndex(undefined);
                              }, 2000);
                            }}
                          >
                            {copiedIndex === index ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
                          </ChatAction>
                        </ChatActions>
                      )}
                    </div>
                  );
                })
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
        </CardContent>
        <CardFooter className="shrink-0 border-t">
          <div className="flex w-full items-center gap-2">
            <div className="flex flex-1 items-center gap-2">
              <Input
                className="h-9 focus-visible:ring-0 focus-visible:ring-offset-0"
                disabled={isTransitioning}
                placeholder="Type a message..."
                value={textInput}
                onChange={handleTextInputChange}
                onKeyDown={handleKeyDown}
              />
              <Button
                className="rounded-full"
                disabled={!textInput.trim() || isTransitioning}
                size="icon"
                variant="ghost"
                onClick={handleSendText}
              >
                <SendIcon className="size-4" />
                <span className="sr-only">Send message</span>
              </Button>
              {isCallActive ? (
                <Button
                  className={cn('relative shrink-0 rounded-full transition-all')}
                  disabled={isTransitioning}
                  size="icon"
                  variant="secondary"
                  onClick={handleCall}
                >
                  <PhoneOffIcon className="size-4" />
                  <span className="sr-only">End call</span>
                </Button>
              ) : (
                <Button
                  className={cn('relative shrink-0 rounded-full transition-all')}
                  disabled={isTransitioning}
                  size="icon"
                  variant="ghost"
                  onClick={handleCall}
                >
                  <AudioLinesIcon className="size-4" />
                  <span className="sr-only">Start voice call</span>
                </Button>
              )}
            </div>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
