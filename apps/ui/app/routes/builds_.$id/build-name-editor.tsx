import { useChat } from '@ai-sdk/react';
import { useState, useEffect, useCallback } from 'react';
import { useSelector } from '@xstate/react';
import type { MyUIMessage } from '@taucad/chat';
import { defaultBuildName } from '#constants/build-names.js';
import { useBuild } from '#hooks/use-build.js';
import { useChatManager } from '#hooks/use-chat-manager.js';
import { useChatConstants } from '#utils/chat.utils.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { LoadingSpinner } from '#components/ui/loading-spinner.js';
import { InlineTextEditor } from '#components/inline-text-editor.js';

const animationDuration = 2000;

export function BuildNameEditor(): React.JSX.Element {
  const { buildRef, updateName } = useBuild();
  const buildName = useSelector(buildRef, (state) => state.context.build?.name) ?? '';
  const isLoading = useSelector(buildRef, (state) => state.context.isLoading);
  const activeChatId = useSelector(buildRef, (state) => state.context.build?.lastChatId);
  const { getChat } = useChatManager();

  const [displayName, setDisplayName] = useState<string>(buildName);
  const [isNameAnimating, setIsNameAnimating] = useState(false);
  const [activeChatFirstMessage, setActiveChatFirstMessage] = useState<MyUIMessage | undefined>(undefined);

  const { sendMessage } = useChat({
    ...useChatConstants,
    onFinish({ message }) {
      const textPart = message.parts.find((part) => part.type === 'text');
      if (textPart) {
        updateName(textPart.text);
        setDisplayName(textPart.text);
        setIsNameAnimating(true);
        // Reset the animation flag after animation completes
        setTimeout(() => {
          setIsNameAnimating(false);
        }, animationDuration);
      }
    },
  });

  // Load active chat's first message for name generation
  const loadActiveChatFirstMessage = useCallback(async () => {
    if (!activeChatId) {
      setActiveChatFirstMessage(undefined);
      return;
    }

    const chat = await getChat(activeChatId);
    setActiveChatFirstMessage(chat?.messages[0]);
  }, [activeChatId, getChat]);

  useEffect(() => {
    void loadActiveChatFirstMessage();
  }, [loadActiveChatFirstMessage]);

  // Set initial name and trigger generation if needed
  useEffect(() => {
    if (isLoading || !buildName) {
      return;
    }

    if (buildName === defaultBuildName && activeChatFirstMessage) {
      // Create and send message for name generation
      const message = {
        ...activeChatFirstMessage,
        metadata: {
          model: 'name-generator',
        },
      } as const satisfies MyUIMessage;
      void sendMessage(message);
    } else {
      setDisplayName(buildName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run after loading completes
  }, [buildName, isLoading, activeChatFirstMessage]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <InlineTextEditor
          value={displayName}
          className="h-7 [&_[data-slot=button]]:w-auto [&_[data-slot=button]]:max-w-48"
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
