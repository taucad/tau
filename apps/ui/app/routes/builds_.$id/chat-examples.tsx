import { memo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { getRandomExamples } from '~/constants/chat-prompt-examples.js';
import { Button } from '~/components/ui/button.js';
import { useAiChat } from '~/components/chat/ai-chat-provider.js';
import { useModels } from '~/hooks/use-models.js';
import { createMessage } from '~/utils/chat.js';
import { MessageRole, MessageStatus } from '~/types/chat.js';

export const ChatExamples = memo(function () {
  // Use lazy initialization to ensure consistent examples across renders
  const [examples, setExamples] = useState(() => getRandomExamples(3));
  const { append } = useAiChat();
  const { selectedModel } = useModels();

  const handleExampleClick = (prompt: string) => {
    const userMessage = createMessage({
      content: prompt,
      role: MessageRole.User,
      status: MessageStatus.Pending,
      metadata: {},
      model: selectedModel?.id ?? '',
    });
    void append(userMessage);
  };

  const handleRefreshExamples = () => {
    setExamples(getRandomExamples(3));
  };

  return (
    <div className="mx-2 mb-2 rounded-xl border border-dashed border-muted-foreground/50 p-4">
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
              handleExampleClick(example.prompt);
            }}
          >
            {example.title}
          </Button>
        ))}
      </div>
    </div>
  );
});
