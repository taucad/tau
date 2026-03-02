import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { memo, useState } from 'react';
import { messageRole } from '@taucad/chat/constants';
import type { UsageData } from '@taucad/chat';
import { useChatActions, useChatSelector } from '#hooks/use-chat.js';
import { serializeMessage } from '#utils/chat.utils.js';
import { ChatMessageReasoning } from '#routes/builds_.$id/chat-message-reasoning.js';
import { ChatMessageDataUsage } from '#routes/builds_.$id/chat-message-data-usage.js';
import { ChatMessageText } from '#routes/builds_.$id/chat-message-text.js';
import { Tooltip, TooltipTrigger, TooltipContent } from '#components/ui/tooltip.js';
import { CopyButton } from '#components/copy-button.js';
import { Button } from '#components/ui/button.js';
import { cn } from '#utils/ui.utils.js';
import { menuItemVariants, menuSubTriggerOpenClass } from '#components/ui/menu.variants.js';
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
import { ChatMessageToolFileEdit } from '#routes/builds_.$id/chat-message-tool-edit-file.js';
import { ChatMessageToolTestModel } from '#routes/builds_.$id/chat-message-tool-test-model.js';
import { ChatMessageToolEditTests } from '#routes/builds_.$id/chat-message-tool-edit-tests.js';
import { ChatMessageToolReadFile } from '#routes/builds_.$id/chat-message-tool-read-file.js';
import { ChatMessageToolListDirectory } from '#routes/builds_.$id/chat-message-tool-list-directory.js';
import { ChatMessageToolCreateFile } from '#routes/builds_.$id/chat-message-tool-create-file.js';
import { ChatMessageToolDeleteFile } from '#routes/builds_.$id/chat-message-tool-delete-file.js';
import { ChatMessageToolGrep } from '#routes/builds_.$id/chat-message-tool-grep.js';
import { ChatMessageToolGlobSearch } from '#routes/builds_.$id/chat-message-tool-glob-search.js';
import { ChatMessageToolGetKernelResult } from '#routes/builds_.$id/chat-message-tool-get-kernel-result.js';
import { ChatMessageToolScreenshot } from '#routes/builds_.$id/chat-message-tool-screenshot.js';
import { ChatMessagePartUnknown } from '#routes/builds_.$id/chat-message-tool-unknown.js';
import { ChatMessageToolTransfer } from '#routes/builds_.$id/chat-message-tool-transfer.js';
import { ChatMessageFile } from '#routes/builds_.$id/chat-message-file.js';
import { ChatMessagePlanning } from '#routes/builds_.$id/chat-message-planning.js';

type ChatMessageProperties = {
  readonly messageId: string;
};

export const ChatMessage = memo(function ({ messageId }: ChatMessageProperties): React.JSX.Element {
  const message = useChatSelector((state) => state.messagesById.get(messageId));
  const displayMessage = useChatSelector((state) => state.messageEdits[messageId] ?? state.messagesById.get(messageId));
  const fileParts = useChatSelector(
    (state) => state.messagesById.get(messageId)?.parts.filter((part) => part.type === 'file') ?? [],
  );
  const usageParts = useChatSelector((state) => {
    const message_ = state.messageEdits[messageId] ?? state.messagesById.get(messageId);
    if (!message_) {
      return [];
    }

    const usageDataParts: UsageData[] = [];
    for (const part of message_.parts) {
      if (part.type === 'data-usage') {
        usageDataParts.push(part.data);
      }
    }

    return usageDataParts;
  });
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
          isUser ? 'mx-2' : 'mx-4',
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
              'flex flex-col gap-1',
              isUser &&
                'max-h-58.5 cursor-pointer overflow-hidden rounded-sm border bg-background px-3 py-1 hover:border-primary',
              fileParts.length > 0 && 'pt-3',
            )}
            onClick={handleEditClick}
          >
            {fileParts.length > 0 ? (
              <div className="flex flex-row gap-2">
                {fileParts.map((part) => (
                  <ChatMessageFile key={part.url} part={part} />
                ))}
              </div>
            ) : null}
            {/* eslint-disable-next-line complexity -- This is a complex switch statement, we want to keep it simple. */}
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
                  const hasPartsAfter = index < displayMessage.parts.length - 1;
                  return (
                    <ChatMessageReasoning
                      // eslint-disable-next-line react/no-array-index-key -- Index is stable
                      key={`${displayMessage.id}-message-part-${index}`}
                      part={part}
                      hasContent={hasPartsAfter}
                    />
                  );
                }

                case 'step-start': {
                  // We are not rendering step-start parts.

                  return null;
                }

                case 'file': {
                  // Files are rendered at the top of the message
                  return null;
                }

                case 'dynamic-tool': {
                  return <ChatMessagePartUnknown key={part.toolCallId} part={part} />;
                }

                case 'source-url': {
                  throw new Error('Source URL rendering is not implemented');
                }

                case 'source-document': {
                  throw new Error('Source document rendering is not implemented');
                }

                // TOOLS
                case 'tool-web_search': {
                  const hasPartsAfter = index < displayMessage.parts.length - 1;
                  return <ChatMessageToolWebSearch key={part.toolCallId} part={part} hasContent={hasPartsAfter} />;
                }

                case 'tool-web_browser': {
                  const hasPartsAfter = index < displayMessage.parts.length - 1;
                  return <ChatMessageToolWebBrowser key={part.toolCallId} part={part} hasContent={hasPartsAfter} />;
                }

                case 'tool-edit_file': {
                  return <ChatMessageToolFileEdit key={part.toolCallId} part={part} />;
                }

                case 'tool-test_model': {
                  return <ChatMessageToolTestModel key={part.toolCallId} part={part} />;
                }

                case 'tool-edit_tests': {
                  return <ChatMessageToolEditTests key={part.toolCallId} part={part} />;
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

                // FILESYSTEM TOOLS
                case 'tool-read_file': {
                  return <ChatMessageToolReadFile key={part.toolCallId} part={part} />;
                }

                case 'tool-list_directory': {
                  return <ChatMessageToolListDirectory key={part.toolCallId} part={part} />;
                }

                case 'tool-create_file': {
                  return <ChatMessageToolCreateFile key={part.toolCallId} part={part} />;
                }

                case 'tool-delete_file': {
                  return <ChatMessageToolDeleteFile key={part.toolCallId} part={part} />;
                }

                case 'tool-grep': {
                  return <ChatMessageToolGrep key={part.toolCallId} part={part} />;
                }

                case 'tool-glob_search': {
                  return <ChatMessageToolGlobSearch key={part.toolCallId} part={part} />;
                }

                case 'tool-get_kernel_result': {
                  return <ChatMessageToolGetKernelResult key={part.toolCallId} part={part} />;
                }

                case 'tool-screenshot': {
                  return <ChatMessageToolScreenshot key={part.toolCallId} part={part} />;
                }

                case 'data-usage': {
                  // Usage data parts are rendered separately in the footer
                  return null;
                }

                default: {
                  const unknownPart: never = part;
                  return <ChatMessagePartUnknown key={String(unknownPart)} part={unknownPart} />;
                }
              }
            })}
          </div>
        </When>
        <ChatMessagePlanning messageId={messageId} />
        <When shouldRender={!isUser}>
          <div className="mt-1 flex flex-row items-start justify-start text-muted-foreground">
            <CopyButton
              tooltipContentProperties={{ side: 'bottom' }}
              size="icon"
              getText={() => serializeMessage(displayMessage)}
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
                    className="h-fit w-full"
                    onSelect={(modelId) => {
                      retryMessage(messageId, modelId);
                    }}
                  >
                    {({ selectedModel }) => (
                      <button
                        type="button"
                        className={cn(
                          menuItemVariants(),
                          menuSubTriggerOpenClass,
                          'group w-full hover:bg-neutral/30 hover:text-foreground',
                        )}
                      >
                        <span>{selectedModel?.name ?? 'Offline'}</span>
                        <ChevronRight className="ml-auto size-3.5 text-muted-foreground transition-transform duration-200 ease-in-out group-data-[state=open]:rotate-90" />
                      </button>
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
                    <RefreshCw className="text-muted-foreground" />
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <TooltipContent side="bottom">Switch model</TooltipContent>
            </Tooltip>
            <div className="flex flex-row items-center justify-end gap-1">
              {usageParts.length > 0 ? <ChatMessageDataUsage usageParts={usageParts} /> : null}
            </div>
          </div>
        </When>
      </div>
    </article>
  );
});
