import { memo } from 'react';
import { Button } from '@/components/ui/button.js';
import { useAiChat } from '@/components/chat/ai-chat-provider.js';

export const ChatError = memo(() => {
  const { reload, error } = useAiChat({});

  if (!error) return null;

  return (
    <div className="flex w-full flex-col items-center justify-center gap-1 rounded-md border border-destructive/20 bg-destructive/10 p-2 text-center text-sm">
      <p className="my-1">Unable to send the message.</p>
      <pre className="text-xs">{error.message}</pre>
      <Button variant="link" className="inline-block h-auto p-0" onClick={async () => reload()}>
        Retry
      </Button>
    </div>
  );
});
