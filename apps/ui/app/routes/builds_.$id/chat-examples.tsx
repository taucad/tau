import { memo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { getRandomExamples } from '#constants/chat-prompt-examples.js';
import type { ChatExample } from '#constants/chat-prompt-examples.js';
import { Button } from '#components/ui/button.js';
import { useChatActions } from '#components/chat/ai-chat-provider.js';
import { useModels } from '#hooks/use-models.js';
import { createMessage } from '#utils/chat.utils.js';
import { messageRole, messageStatus } from '#types/chat.types.js';
import { EmptyItems } from '#components/ui/empty-items.js';

export const ChatExamples = memo(function () {
  // Use lazy initialization to ensure consistent examples across renders
  const [examples, setExamples] = useState(() => getRandomExamples(3));
  const { append } = useChatActions();
  const { selectedModel } = useModels();

  const handleExampleClick = (example: ChatExample) => {
    const userMessage = createMessage({
      content: example.prompt,
      role: messageRole.user,
      status: messageStatus.pending,
      metadata: { kernel: example.kernel },
      model: selectedModel?.id ?? '',
    });
    append(userMessage);
  };

  const handleRefreshExamples = () => {
    setExamples(getRandomExamples(3));
  };

  return (
    <EmptyItems>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium">Get started with 3D model examples</h3>
        <Button variant="ghost" size="icon" className="size-7" onClick={handleRefreshExamples}>
          <RefreshCw className="size-4" />
        </Button>
      </div>
      <div className="flex w-full flex-wrap justify-between gap-2">
        {examples.map((example) => (
          <Button
            key={example.title}
            variant="outline"
            className="flex-1"
            onClick={() => {
              handleExampleClick(example);
            }}
          >
            {example.title}
          </Button>
        ))}
      </div>
    </EmptyItems>
  );
});
