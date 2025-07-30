import { ChevronDown, ChevronRight, Edit, RefreshCw } from 'lucide-react';
import { memo, useState } from 'react';
import type { Message } from '@ai-sdk/react';
import { useChatActions, useChatSelector } from '#components/chat/ai-chat-provider.js';
import { ChatMessageReasoning } from '#routes/builds_.$id/chat-message-reasoning.js';
import { ChatMessageTool } from '#routes/builds_.$id/chat-message-tool.js';
import { ChatMessageAnnotations } from '#routes/builds_.$id/chat-message-annotation.js';
import { ChatMessageText } from '#routes/builds_.$id/chat-message-text.js';
import { Tooltip, TooltipTrigger, TooltipContent } from '#components/ui/tooltip.js';
import { CopyButton } from '#components/copy-button.js';
import { Button } from '#components/ui/button.js';
import { messageRole } from '#types/chat.types.js';
import type { MessageAnnotation } from '#types/chat.types.js';
import { cn } from '#utils/ui.js';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '#components/ui/hover-card.js';
import { When } from '#components/ui/utils/when.js';
import { ChatTextarea } from '#components/chat/chat-textarea.js';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '#components/ui/dropdown-menu.js';
import { ChatModelSelector } from '#components/chat/chat-model-selector.js';

type ChatMessageProperties = {
  readonly messageId: string;
};

const getMessageContent = (message: Message): string => {
  const content = [];
  for (const part of message.parts ?? []) {
    if (part.type === 'text') {
      content.push(part.text);
    }
  }

  return content.join('\n\n');
};

export const ChatMessage = memo(function ({ messageId }: ChatMessageProperties): React.JSX.Element {
  const message = useChatSelector((state) => state.context.messagesById.get(messageId));
  const { editMessage, retryMessage } = useChatActions();
  const [isEditing, setIsEditing] = useState(false);

  // Early return if message not found (shouldn't happen in normal operation)
  if (!message) {
    return <div>Message not found</div>;
  }

  const isUser = message.role === messageRole.user;

  return (
    <article
      className={cn(
        'group/message flex w-full flex-row items-start',
        isUser && 'flex-row-reverse gap-2 space-x-reverse',
      )}
    >
      <div
        className={cn(
          'flex flex-col space-y-2 overflow-y-auto',
          // Only make the text area full when editing.
          isEditing && 'w-full',
          // Only the assistant messages should take up the full width.
          !isUser && 'w-full',
        )}
      >
        <When shouldRender={isUser ? isEditing : false}>
          <ChatTextarea
            initialContent={message.parts}
            initialAttachments={message.experimental_attachments}
            onSubmit={async (event) => {
              editMessage(messageId, event.content, event.model, event.metadata, event.imageUrls);
              setIsEditing(false);
            }}
            onEscapePressed={() => {
              setIsEditing(false);
            }}
          />
        </When>
        <When shouldRender={!isEditing}>
          <div className={cn('flex flex-col gap-2', isUser && 'rounded-xl bg-neutral/20 p-2')}>
            {message.experimental_attachments?.map((attachment, index) => {
              return (
                <HoverCard
                  // eslint-disable-next-line react/no-array-index-key -- Index is stable
                  key={`${message.id}-attachment-${index}`}
                  openDelay={100}
                  closeDelay={100}
                >
                  <HoverCardTrigger asChild>
                    <img
                      src={attachment.url}
                      alt="Chat message"
                      className="ml-auto h-7 w-auto cursor-zoom-in rounded-md border bg-muted object-cover"
                    />
                  </HoverCardTrigger>
                  <HoverCardContent className="size-auto max-w-screen overflow-hidden p-0">
                    <img src={attachment.url} alt="Chat message zoomed" className="h-48 md:h-96" />
                  </HoverCardContent>
                </HoverCard>
              );
            })}
            {message.parts?.map((part, index) => {
              switch (part.type) {
                case 'text': {
                  return (
                    <ChatMessageText
                      // eslint-disable-next-line react/no-array-index-key -- Index is stable
                      key={`${message.id}-message-part-${index}`}
                      part={part}
                    />
                  );
                }

                case 'reasoning': {
                  /* TODO: remove trim when backend is fixed to trim thinking tags */
                  return (
                    part.reasoning.trim().length > 0 && (
                      <ChatMessageReasoning
                        // eslint-disable-next-line react/no-array-index-key -- Index is stable
                        key={`${message.id}-message-part-${index}`}
                        part={part}
                        hasContent={message.content.length > 0}
                      />
                    )
                  );
                }

                case 'tool-invocation': {
                  // eslint-disable-next-line react/no-array-index-key -- Index is stable
                  return <ChatMessageTool key={`${message.id}-message-part-${index}`} part={part} />;
                }

                case 'source': {
                  // TODO: add source rendering to the message

                  return null;
                }

                case 'step-start': {
                  // We are not rendering step-start parts.

                  return null;
                }

                case 'file': {
                  // TODO: add file rendering
                  throw new Error('File rendering is not implemented');
                }

                default: {
                  const exhaustiveCheck: never = part;
                  throw new Error(`Unknown part: ${JSON.stringify(exhaustiveCheck)}`);
                }
              }
            })}
          </div>
        </When>
        <When shouldRender={!isUser}>
          <div className="mt-1 flex flex-row items-start justify-start text-muted-foreground">
            <CopyButton
              tooltipContentProperties={{ side: 'bottom' }}
              size="icon"
              getText={() => getMessageContent(message)}
              tooltip="Copy message"
              className="size-7"
            />
            <Tooltip>
              <DropdownMenu>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button size="xs" variant="ghost" className="h-7 gap-1 has-[>svg]:px-1.5">
                      <RefreshCw className="size-4" />
                      <ChevronDown className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <DropdownMenuContent align="start" side="top" className="min-w-[200px]">
                  <DropdownMenuLabel>Switch model</DropdownMenuLabel>
                  <ChatModelSelector
                    popoverProperties={{ side: 'right', align: 'start' }}
                    className="h-fit w-full p-2"
                    onSelect={(modelId) => {
                      retryMessage(messageId, modelId);
                    }}
                  >
                    {({ selectedModel }) => (
                      <Button variant="ghost" size="sm" className="group w-full justify-start rounded-sm p-2">
                        <div className="flex w-full flex-row items-center justify-between gap-2 text-sm font-normal">
                          <span>{selectedModel?.name ?? 'Offline'}</span>
                          <ChevronRight className="size-4 text-muted-foreground transition-transform duration-200 ease-in-out group-data-[state=open]:rotate-90" />
                        </div>
                      </Button>
                    )}
                  </ChatModelSelector>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="flex justify-between"
                    onClick={() => {
                      retryMessage(messageId);
                    }}
                  >
                    <p>Try again</p>
                    <RefreshCw className="size-4 text-muted-foreground" />
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <TooltipContent side="bottom">Switch model</TooltipContent>
            </Tooltip>
            <div className="mx-1 flex flex-row items-center justify-end gap-1">
              {message.annotations && message.annotations.length > 0 ? (
                <ChatMessageAnnotations annotations={message.annotations as MessageAnnotation[]} />
              ) : null}
            </div>
          </div>
        </When>
        <When shouldRender={isUser}>
          <div className="mt-1 flex flex-row items-center justify-end text-muted-foreground">
            <CopyButton
              tooltipContentProperties={{ side: 'bottom' }}
              size="icon"
              getText={() => getMessageContent(message)}
              tooltip="Copy message"
              className="size-7"
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="xs"
                  variant="ghost"
                  className="size-7"
                  onClick={() => {
                    setIsEditing((previous) => !previous);
                  }}
                >
                  <Edit className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{isEditing ? 'Stop editing' : 'Edit message'}</TooltipContent>
            </Tooltip>
            {message.annotations && message.annotations.length > 0 ? (
              <ChatMessageAnnotations annotations={message.annotations as MessageAnnotation[]} />
            ) : null}
          </div>
        </When>
      </div>
    </article>
  );
});
