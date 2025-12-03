import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { memo, useState } from 'react';
import { messageRole } from '@taucad/chat/constants';
import type { MyUIMessage } from '@taucad/chat';
import { useChatActions, useChatSelector } from '#hooks/use-chat.js';
import { ChatMessageReasoning } from '#routes/builds_.$id/chat-message-reasoning.js';
import { ChatMessageMetadata } from '#routes/builds_.$id/chat-message-metadata.js';
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
import { ChatMessageToolWebSearch } from '#routes/builds_.$id/chat-message-tool-web-search.js';
import { ChatMessageToolWebBrowser } from '#routes/builds_.$id/chat-message-tool-web-browser.js';
import { ChatMessageToolFileEdit } from '#routes/builds_.$id/chat-message-tool-file-edit.js';
import { ChatMessageToolImageAnalysis } from '#routes/builds_.$id/chat-message-tool-image-analysis.js';
import { ChatMessagePartUnknown } from '#routes/builds_.$id/chat-message-tool-unknown.js';
import { ChatMessageToolTransfer } from '#routes/builds_.$id/chat-message-tool-transfer.js';
import { ChatMessageFile } from '#routes/builds_.$id/chat-message-file.js';

type ChatMessageProperties = {
  readonly messageId: string;
};

const getMessageContent = (message: MyUIMessage): string => {
  const content = [];
  for (const part of message.parts) {
    if (part.type === 'text') {
      content.push(part.text);
    }
  }

  return content.join('\n\n');
};

export const ChatMessage = memo(function ({ messageId }: ChatMessageProperties): React.JSX.Element {
  const message = useChatSelector((state) => state.messagesById.get(messageId));
  const displayMessage = useChatSelector((state) => state.messageEdits[messageId] ?? state.messagesById.get(messageId));
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
              isUser &&
                'max-h-58.5 cursor-pointer overflow-hidden rounded-sm border bg-background px-3 py-2 hover:border-primary',
            )}
            onClick={handleEditClick}
          >
            {displayMessage.parts.map((part, index) => {
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
                  const hasPartsAfter = index < displayMessage.parts.length - 1;
                  return (
                    part.text.trim().length > 0 && (
                      <ChatMessageReasoning
                        // eslint-disable-next-line react/no-array-index-key -- Index is stable
                        key={`${displayMessage.id}-message-part-${index}`}
                        part={part}
                        hasContent={hasPartsAfter}
                      />
                    )
                  );
                }

                case 'step-start': {
                  // We are not rendering step-start parts.

                  return null;
                }

                case 'file': {
                  return <ChatMessageFile key={part.url} part={part} />;
                }

                case 'dynamic-tool': {
                  throw new Error('Dynamic tool rendering is not implemented');
                }

                case 'source-url': {
                  throw new Error('Source URL rendering is not implemented');
                }

                case 'source-document': {
                  throw new Error('Source document rendering is not implemented');
                }

                // TOOLS
                case 'tool-web_search': {
                  return <ChatMessageToolWebSearch key={part.toolCallId} part={part} />;
                }

                case 'tool-web_browser': {
                  return <ChatMessageToolWebBrowser key={part.toolCallId} part={part} />;
                }

                case 'tool-edit_file': {
                  return <ChatMessageToolFileEdit key={part.toolCallId} part={part} />;
                }

                case 'tool-analyze_image': {
                  return <ChatMessageToolImageAnalysis key={part.toolCallId} part={part} />;
                }

                case 'tool-transfer_to_cad_expert': {
                  return <ChatMessageToolTransfer key={part.toolCallId} part={part} />;
                }

                case 'tool-transfer_to_research_expert': {
                  return <ChatMessageToolTransfer key={part.toolCallId} part={part} />;
                }

                case 'tool-transfer_back_to_supervisor': {
                  return <ChatMessageToolTransfer key={part.toolCallId} part={part} />;
                }

                case 'data-test': {
                  // A data part is required to be present to exhaustively match all parts.
                  // This should replace with an actual data part when it becomes available.
                  return <div>Data test</div>;
                }

                default: {
                  const unknownPart: never = part;
                  return <ChatMessagePartUnknown key={String(unknownPart)} part={unknownPart} />;
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
              {displayMessage.metadata ? <ChatMessageMetadata metadata={displayMessage.metadata} /> : null}
            </div>
          </div>
        </When>
      </div>
    </article>
  );
});
