import { memo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { getRandomExamples } from '#constants/chat-prompt-examples.js';
import type { ChatExample } from '#constants/chat-prompt-examples.js';
import { Button } from '@taucad/ui/components/button';
import { useCadChatClient } from '#chat-clients/use-cad-chat-client.js';
import { CollectionEmptyState } from '#components/ui/collection-empty-state.js';

export const ChatExamples = memo(function () {
  // Lazy initialization to ensure consistent examples across renders.
  const [examples, setExamples] = useState(() => getRandomExamples(3));
  // The chat-client composes the per-request `agent` payload (model, kernel,
  // mode, toolChoice, testingEnabled, snapshot, contextPayload) from
  // `useCadAgentConfig`. The originally-broken kernel / testingEnabled fields
  // now flow through the same chat-client all submit sites use, so this
  // quick-start path can no longer drift from the chat-history textarea path.
  const cadChat = useCadChatClient();

  const handleExampleClick = (example: ChatExample) => {
    cadChat.submit({ text: example.prompt });
  };

  const handleRefreshExamples = () => {
    setExamples(getRandomExamples(3));
  };

  return (
    <CollectionEmptyState>
      <div className='mb-2 flex items-center justify-between'>
        <h3 className='text-sm font-medium'>Get started with 3D model examples</h3>
        <Button variant='ghost' size='icon' className='size-7' onClick={handleRefreshExamples}>
          <RefreshCw className='size-4' />
        </Button>
      </div>
      <div className='flex w-full flex-wrap justify-between gap-2'>
        {examples.map((example) => (
          <Button
            key={example.title}
            variant='outline'
            className='flex-1'
            onClick={() => {
              handleExampleClick(example);
            }}
          >
            {example.title}
          </Button>
        ))}
      </div>
    </CollectionEmptyState>
  );
});
