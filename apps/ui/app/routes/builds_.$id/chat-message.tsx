import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Edit } from 'lucide-react';
import { CopyButton } from '@/components/copy-button';
import { Button } from '@/components/ui/button';
import { MessageAnnotation, MessageRole } from '@/types/chat';
import { cn } from '@/utils/ui';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card';
import { useState } from 'react';
import { When } from '@/components/ui/utils/when';
import { ChatTextarea, ChatTextareaProperties } from '@/components/chat/chat-textarea';
import { Model } from '@/hooks/use-models';
import { ChatMessageReasoning } from './chat-message-reasoning';
import { ChatMessageTool } from './chat-message-tool';
import { ChatMessageAnnotation } from './chat-message-annotation';
import { ChatMessageText } from './chat-message-text';
import { Message } from '@ai-sdk/react';

type ChatMessageProperties = {
  message: Message;
  onEdit: ChatTextareaProperties['onSubmit'];
  models: Model[];
  onCodeApply?: (code: string) => void;
  conversationId?: string;
};

export function ChatMessage({ message, onEdit, models, onCodeApply, conversationId }: ChatMessageProperties) {
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
          <When condition={isUser && isEditing}>
            <ChatTextarea
              initialContent={message.parts}
              initialAttachments={message.experimental_attachments}
              onSubmit={async (event) => {
                onEdit(event);
                setIsEditing(false);
              }}
              onEscapePressed={() => {
                setIsEditing(false);
              }}
              models={models}
              conversationId={conversationId}
            />
          </When>
          <When condition={!isEditing}>
            <div className={cn('flex flex-col gap-2', isUser && 'p-2')}>
              {message.experimental_attachments?.map((attachment, index) => {
                return (
                  <HoverCard openDelay={100} closeDelay={100} key={`${message.id}-attachment-${index}`}>
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
                  return <ChatMessageText key={`${message.id}-message-part-${index}`} part={part} />;
                }

                if (part.type === 'reasoning') {
                  /* TODO: remove trim when backend is fixed to trim thinking tags */
                  return (
                    part.reasoning.trim().length > 0 && (
                      <ChatMessageReasoning
                        key={`${message.id}-message-part-${index}`}
                        part={part}
                        hasContent={message.content.length > 0}
                      />
                    )
                  );
                }

                if (part.type === 'tool-invocation') {
                  return <ChatMessageTool key={`${message.id}-message-part-${index}`} part={part} />;
                }

                if (part.type === 'source') {
                  // TODO: add source rendering to the message
                  // eslint-disable-next-line unicorn/no-null -- null is required by React
                  return null;
                }

                if (part.type === 'step-start') {
                  // We are not rendering step-start parts.
                  // eslint-disable-next-line unicorn/no-null -- null is required by React
                  return null;
                }

                if (part.type === 'file') {
                  // TODO: add file rendering
                  throw new Error('File rendering is not implemented');
                }

                const exhaustiveCheck: never = part;
                throw new Error(`Unknown part: ${JSON.stringify(exhaustiveCheck)}`);
              })}
              <When condition={!isUser}>
                <div className="mt-2 flex flex-row items-center justify-start gap-2 text-foreground/50">
                  <CopyButton size="xs" text={message.content} tooltip="Copy message" />
                  {message.annotations?.map((annotation, index) => {
                    return (
                      <ChatMessageAnnotation
                        key={`${message.id}-message-annotation-${index}`}
                        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- TODO: fix module augmentation for MessageAnnotation
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
        {isUser && (
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
        )}
      </div>
    </article>
  );
}
