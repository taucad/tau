import { memo } from 'react';
import { RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button.js';
import { useAiChat } from '@/components/chat/ai-chat-provider.js';

export const ChatError = memo(() => {
  const { reload, error } = useAiChat({});

  if (!error) return null;

  let errorMessage = error.message;

  try {
    errorMessage = JSON.stringify(JSON.parse(error.message), null, 2);
  } catch (error) {
    console.error(error);
  }

  return (
    <div className="flex w-full flex-col items-start justify-center gap-1 overflow-hidden rounded-md border border-destructive/20 bg-destructive/10 p-2 text-center text-sm">
      <div className="flex w-full items-start justify-between">
        <p>Unable to send the message.</p>
        <Button variant="outline" size="xs" className="h-auto p-1" onClick={async () => reload()}>
          <RefreshCcw className="size-3" />
          Retry
        </Button>
      </div>
      <pre className="w-full overflow-x-auto text-left text-xs">{errorMessage}</pre>
    </div>
  );
});
