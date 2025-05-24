import { useChat } from '@ai-sdk/react';
import type { Message } from 'ai';
import { useState, useEffect } from 'react';
import type { JSX } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '~/components/ui/popover.js';
import { Button } from '~/components/ui/button.js';
import { Input } from '~/components/ui/input.js';
import { defaultBuildName } from '~/constants/build-names.js';
import { useBuild } from '~/hooks/use-build.js';
import { useChatConstants } from '~/utils/chat.js';

export function BuildNameEditor(): JSX.Element {
  const { build, updateName, isLoading } = useBuild();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState<string>();
  const [displayName, setDisplayName] = useState<string>(build?.name ?? '');
  const { append } = useChat({
    ...useChatConstants,
    onFinish(message) {
      const textPart = message.parts?.find((part) => part.type === 'text');
      if (textPart) {
        updateName(textPart.text);
        setDisplayName(textPart.text);
      }
    },
  });

  // Set initial name and trigger generation if needed
  useEffect(() => {
    if (isLoading || !build) return;

    const activeChat = build.chats?.find((chat) => chat.id === build.lastChatId);

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
    } else if (!isLoading) {
      setName(build.name);
      setDisplayName(build.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run after loading completes
  }, [build?.name, isLoading]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (name) {
      updateName(name);
      setDisplayName(name);
      setIsEditing(false);
    }
  };

  return (
    <Popover open={isEditing} onOpenChange={setIsEditing}>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="cursor-text justify-start p-2">
          <span
            data-animate={displayName.length > 0 && !(!name || name === build?.name || isEditing)}
            className="data-[animate=true]:animate-typewriter-20"
          >
            {displayName}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 -translate-x-2 p-1">
        <form className="flex items-center gap-2 align-middle" onSubmit={handleSubmit}>
          <Input
            autoFocus
            autoComplete="off"
            value={name}
            className="h-8"
            onChange={(event) => {
              setName(event.target.value);
            }}
            onFocus={(event) => {
              event.target.select();
            }}
          />
          <Button type="submit" size="sm">
            Save
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
