import { Edit } from 'lucide-react';
import { memo, useState } from 'react';
import type { JSX } from 'react';
import type { Message } from '@ai-sdk/react';
import { ChatMessageReasoning } from './chat-message-reasoning.js';
import { ChatMessageTool } from './chat-message-tool.js';
import { ChatMessageAnnotation } from './chat-message-annotation.js';
import { ChatMessageText } from './chat-message-text.js';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip.js';
import { CopyButton } from '@/components/copy-button.js';
import { Button } from '@/components/ui/button.js';
import { MessageRole } from '@/types/chat.js';
import type { MessageAnnotation } from '@/types/chat.js';
import { cn } from '@/utils/ui.js';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card.js';
import { When } from '@/components/ui/utils/when.js';
import type { ChatTextareaProperties } from '@/components/chat/chat-textarea.js';
import { ChatTextarea } from '@/components/chat/chat-textarea.js';
import type { Model } from '@/hooks/use-models.js';

type ChatMessageProperties = {
  readonly message: Message;
  readonly onEdit: ChatTextareaProperties['onSubmit'];
  readonly models: Model[];
};

export const ChatMessage = memo(function ({ message, onEdit, models }: ChatMessageProperties): JSX.Element {
  const isUser = message.role === MessageRole.User;
  const [isEditing, setIsEditing] = useState(false);

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
        <div className={cn(isUser ? 'rounded-xl bg-neutral/20' : 'pt-[6px]')}>
          <When shouldRender={isUser ? isEditing : false}>
            <ChatTextarea
              initialContent={message.parts}
              initialAttachments={message.experimental_attachments}
              models={models}
              onSubmit={async (event) => {
                void onEdit(event);
                setIsEditing(false);
              }}
              onEscapePressed={() => {
                setIsEditing(false);
              }}
            />
          </When>
          <When shouldRender={!isEditing}>
            <div className={cn('flex flex-col gap-2', isUser && 'p-2')}>
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
                        className="ml-auto h-8 w-auto cursor-zoom-in rounded-md border bg-muted object-cover"
                      />
                    </HoverCardTrigger>
                    <HoverCardContent className="size-auto max-w-screen overflow-hidden p-0">
                      <img src={attachment.url} alt="Chat message zoomed" className="h-48 md:h-96" />
                    </HoverCardContent>
                  </HoverCard>
                );
              })}
              {message.parts?.map((part, index) => {
                if (part.type === 'text') {
                  return (
                    <ChatMessageText
                      // eslint-disable-next-line react/no-array-index-key -- Index is stable
                      key={`${message.id}-message-part-${index}`}
                      part={part}
                    />
                  );
                }

                if (part.type === 'reasoning') {
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

                if (part.type === 'tool-invocation') {
                  // eslint-disable-next-line react/no-array-index-key -- Index is stable
                  return <ChatMessageTool key={`${message.id}-message-part-${index}`} part={part} />;
                }

                if (part.type === 'source') {
                  // TODO: add source rendering to the message

                  return null;
                }

                if (part.type === 'step-start') {
                  // We are not rendering step-start parts.

                  return null;
                }

                if (part.type === 'file') {
                  // TODO: add file rendering
                  throw new Error('File rendering is not implemented');
                }

                const exhaustiveCheck: never = part;
                throw new Error(`Unknown part: ${JSON.stringify(exhaustiveCheck)}`);
              })}
              <When shouldRender={!isUser}>
                <div className="mt-2 flex flex-row items-center justify-start gap-2 text-foreground/50">
                  <CopyButton size="xs" text={message.content} tooltip="Copy message" />
                  {message.annotations?.map((annotation, index) => {
                    return (
                      <ChatMessageAnnotation
                        // eslint-disable-next-line react/no-array-index-key -- Index is stable
                        key={`${message.id}-message-annotation-${index}`}
                        annotation={annotation as MessageAnnotation}
                      />
                    );
                  })}
                </div>
              </When>
            </div>
          </When>
        </div>
      </div>
      <div className="mt-auto">
        {isUser ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="rounded-full opacity-0 transition-opacity group-hover/message:opacity-100 focus:opacity-100"
                onClick={() => {
                  setIsEditing((editing) => !editing);
                }}
              >
                <Edit className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{isEditing ? 'Stop editing' : 'Edit message'}</p>
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    </article>
  );
});
