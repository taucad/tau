import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { memo, useState } from 'react';
import type { Message } from '@ai-sdk/react';
import { messageRole } from '@taucad/types/constants';
import type { MessageAnnotation } from '@taucad/types';
import { useChatActions, useChatSelector } from '#components/chat/ai-chat-provider.js';
import { ChatMessageReasoning } from '#routes/builds_.$id/chat-message-reasoning.js';
import { ChatMessageTool } from '#routes/builds_.$id/chat-message-tool.js';
import { ChatMessageAnnotations } from '#routes/builds_.$id/chat-message-annotation.js';
import { ChatMessageText } from '#routes/builds_.$id/chat-message-text.js';
import { Tooltip, TooltipTrigger, TooltipContent } from '#components/ui/tooltip.js';
import { CopyButton } from '#components/copy-button.js';
import { Button } from '#components/ui/button.js';
import { cn } from '#utils/ui.utils.js';
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
  const displayMessage = useChatSelector(
    (state) => state.context.messageEdits[messageId] ?? state.context.messagesById.get(messageId),
  );
  const { editMessage, retryMessage, startEditingMessage, exitEditMode } = useChatActions();
  const [isEditing, setIsEditing] = useState(false);

  // Early return if message not found (shouldn't happen in normal operation)
  if (!message || !displayMessage) {
    return <div>Message not found</div>;
  }

  const isUser = message.role === messageRole.user;

  const handleEditClick = () => {
    if (!isUser) {
      return;
    }

    if (!isEditing) {
      startEditingMessage(messageId);
    }

    setIsEditing((previous) => !previous);
  };

  return (
    <article
      className={cn('group/chat-message flex w-full flex-row items-start', isUser && 'items-end gap-2 space-x-reverse')}
    >
      <div
        className={cn(
          'flex flex-col space-y-2 overflow-y-auto',
          'w-full',
          // Vary width for user and assistant messages to achieve visual differentiation
          isUser ? 'mx-2' : 'mx-6',
        )}
      >
        <When shouldRender={isUser ? isEditing : false}>
          <ChatTextarea
            mode="edit"
            className="rounded-sm"
            onSubmit={async (event) => {
              editMessage(messageId, event.content, event.model, event.metadata, event.imageUrls);
              exitEditMode();
              setIsEditing(false);
            }}
            onEscapePressed={() => {
              exitEditMode();
              setIsEditing(false);
            }}
            onBlur={() => {
              exitEditMode();
              setIsEditing(false);
            }}
          />
        </When>
        <When shouldRender={!isEditing}>
          <div
            className={cn(
              'flex flex-col gap-2',
              isUser && 'cursor-pointer rounded-sm border bg-background p-2 hover:border-primary',
            )}
            onClick={handleEditClick}
          >
            {displayMessage.parts?.map((part, index) => {
              switch (part.type) {
                case 'text': {
                  return (
                    <ChatMessageText
                      // eslint-disable-next-line react/no-array-index-key -- Index is stable
                      key={`${displayMessage.id}-message-part-${index}`}
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
                        key={`${displayMessage.id}-message-part-${index}`}
                        part={part}
                        hasContent={displayMessage.content.length > 0}
                      />
                    )
                  );
                }

                case 'tool-invocation': {
                  // eslint-disable-next-line react/no-array-index-key -- Index is stable
                  return <ChatMessageTool key={`${displayMessage.id}-message-part-${index}`} part={part} />;
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
              getText={() => getMessageContent(displayMessage)}
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
              {displayMessage.annotations && displayMessage.annotations.length > 0 ? (
                <ChatMessageAnnotations annotations={displayMessage.annotations as MessageAnnotation[]} />
              ) : null}
            </div>
          </div>
        </When>
      </div>
    </article>
  );
});
