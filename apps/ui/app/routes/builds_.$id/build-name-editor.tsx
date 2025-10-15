import { useChat } from '@ai-sdk/react';
import type { Message } from 'ai';
import { useState, useEffect } from 'react';
import { Button } from '#components/ui/button.js';
import { Input } from '#components/ui/input.js';
import { defaultBuildName } from '#constants/build-names.js';
import { useBuild } from '#hooks/use-build.js';
import { useChatConstants } from '#utils/chat.utils.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { LoadingSpinner } from '#components/ui/loading-spinner.js';

const animationDuration = 2000;

export function BuildNameEditor(): React.JSX.Element {
  const { build, updateName, isLoading } = useBuild();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState<string>('');
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

  const handleEdit = () => {
    setEditValue(displayName);
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (editValue.trim()) {
      updateName(editValue.trim());
      setDisplayName(editValue.trim());
      // Don't trigger animation for manual edits
    }

    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(displayName);
    setIsEditing(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void handleSave();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      handleCancel();
    }
  };

  const handleBlur = () => {
    void handleSave();
  };

  const handleInputClick = (event: React.MouseEvent) => {
    event.stopPropagation();
  };

  const handleInputFocus = (event: React.FocusEvent<HTMLInputElement>) => {
    event.target.select();
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void handleSave();
  };

  if (isEditing) {
    return (
      <form className="flex items-center gap-1" onSubmit={handleSubmit}>
        <Input
          autoFocus
          autoComplete="off"
          type="text"
          value={editValue}
          className="bg-background px-2 focus-visible:ring-0"
          onChange={(event) => {
            setEditValue(event.target.value);
          }}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onFocus={handleInputFocus}
          onClick={handleInputClick}
        />
        <Button type="submit" size="sm">
          Save
        </Button>
      </form>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" className="cursor-text justify-start" onClick={handleEdit}>
          <span data-animate={isNameAnimating} className="truncate data-[animate=true]:animate-typewriter-20">
            {displayName === '' ? <LoadingSpinner /> : displayName}
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Edit name</TooltipContent>
    </Tooltip>
  );
}
