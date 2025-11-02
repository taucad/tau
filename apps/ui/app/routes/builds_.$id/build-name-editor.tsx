import { useChat } from '@ai-sdk/react';
import type { Message } from 'ai';
import { useState, useEffect } from 'react';
import { defaultBuildName } from '#constants/build-names.js';
import { useBuild } from '#hooks/use-build.js';
import { useChatConstants } from '#utils/chat.utils.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { LoadingSpinner } from '#components/ui/loading-spinner.js';
import { InlineTextEditor } from '#components/inline-text-editor.js';

const animationDuration = 2000;

export function BuildNameEditor(): React.JSX.Element {
  const { build, updateName, isLoading } = useBuild();
  const [displayName, setDisplayName] = useState<string>(build?.name ?? '');
  const [isNameAnimating, setIsNameAnimating] = useState(false);
  const { append } = useChat({
    ...useChatConstants,
    credentials: 'include',
    onFinish(message) {
      const textPart = message.parts?.find((part) => part.type === 'text');
      if (textPart) {
        updateName(textPart.text);
        setDisplayName(textPart.text);
        setIsNameAnimating(true);
        // Reset the animation flag after animation completes
        setTimeout(() => {
          setIsNameAnimating(false);
        }, animationDuration); // Adjust timing based on your animation duration
      }
    },
  });

  // Set initial name and trigger generation if needed
  useEffect(() => {
    if (isLoading || !build) {
      return;
    }

    const activeChat = build.chats.find((chat) => chat.id === build.lastChatId);

    if (build.name === defaultBuildName && activeChat?.messages[0]) {
      // Create and send message for name generation
      const message = {
        ...activeChat.messages[0],
        model: 'name-generator',
        metadata: {
          toolChoice: 'none',
        },
      } as const satisfies Message;
      void append(message);
    } else {
      setDisplayName(build.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run after loading completes
  }, [build?.name, isLoading]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <InlineTextEditor
          value={displayName}
          className="h-7 [&_[data-slot=display]]:w-auto [&_[data-slot=display]]:max-w-none"
          renderDisplay={(value) => (
            <span data-animate={isNameAnimating} className="truncate data-[animate=true]:animate-typewriter-20">
              {value === '' ? <LoadingSpinner /> : value}
            </span>
          )}
          onSave={(value) => {
            updateName(value);
            setDisplayName(value);
          }}
        />
      </TooltipTrigger>
      <TooltipContent>Edit name</TooltipContent>
    </Tooltip>
  );
}
