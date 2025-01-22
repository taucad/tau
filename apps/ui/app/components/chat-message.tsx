import { Avatar } from '@radix-ui/react-avatar';
import { Tooltip, TooltipTrigger, TooltipContent } from '@radix-ui/react-tooltip';
import { Edit } from 'lucide-react';
import { CopyButton } from '@/components/copy-button';
import { Taucad } from '@/components/icons/taucad';
import { Button } from '@/components/ui/button';
import { MessageSchema, MessageRole, MessageStatus } from '@/hooks/use-chat';
import { cn } from '@/utils/ui';
import { MarkdownViewer } from './markdown-viewer';

export function ChatMessage({ message }: { message: MessageSchema }) {
  const isUser = message.role === MessageRole.User;

  return (
    <article className={cn('group flex flex-row space-x-2 items-start', isUser && 'space-x-reverse flex-row-reverse')}>
      <Avatar className="w-8 h-8 bg-neutral-200 rounded-full flex items-center justify-center">
        {message.role === MessageRole.Assistant ? <Taucad /> : <img src="/avatar-sample.png" alt="User" />}
      </Avatar>
      <div className="flex flex-col space-y-2">
        <div className={cn(isUser ? 'bg-neutral-200 p-2 rounded-xl text-right' : 'pt-[6px]')}>
          <MarkdownViewer>{`${message.content}${message.status === MessageStatus.Pending ? '●' : ''}`}</MarkdownViewer>
        </div>
        {!isUser && message.status === MessageStatus.Success && (
          <div className="flex flex-row justify-start items-center text-foreground-500">
            <CopyButton showText={false} text={message.content} />
          </div>
        )}
      </div>
      {isUser && (
        <Tooltip>
          <TooltipTrigger>
            <Button
              size="icon"
              variant="ghost"
              className="rounded-full transition-opacity group-hover:opacity-100 opacity-0"
            >
              <Edit className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Edit</TooltipContent>
        </Tooltip>
      )}
    </article>
  );
}
