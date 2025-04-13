import { memo } from 'react';
import { useChat } from '@ai-sdk/react';
import { useChatConstants } from '@/contexts/use-chat';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';

type ChatErrorProperties = {
  readonly id?: string;
};

export const ChatError = memo(({ id }: ChatErrorProperties) => {
  const { reload, error } = useChat({
    ...useChatConstants,
    id,
    onError() {
      toast.error('Unable to send the message');
    },
  });

  if (!error) return null;

  return (
    <div className="flex w-full flex-wrap items-center justify-center gap-1 rounded-md bg-destructive/5 p-2 text-center text-sm">
      <p className="my-1">Unable to send the message. {error.message}.</p>
      <Button variant="link" className="inline-block h-auto p-0" onClick={async () => reload()}>
        Retry
      </Button>
    </div>
  );
});
