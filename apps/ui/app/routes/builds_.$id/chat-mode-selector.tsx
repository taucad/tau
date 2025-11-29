import { memo, useState } from 'react';
import { Box, Brain, Upload } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu.js';
import { Button } from '#components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';

export type ChatMode = 'agent' | 'editor' | 'publish';

type ChatModeSelectorProps = {
  readonly defaultMode?: ChatMode;
  readonly onModeChange?: (mode: ChatMode) => void;
};

const chatModes = [
  {
    id: 'agent' as const,
    label: 'Agent',
    icon: Brain,
    description: 'Create and edit with AI',
  },
  {
    id: 'editor' as const,
    label: 'Editor',
    icon: Box,
    description: 'Create and edit 3D models',
  },
  {
    id: 'publish' as const,
    label: 'Publish',
    icon: Upload,
    description: 'Share and export models',
  },
] as const satisfies Array<{
  readonly id: ChatMode;
  readonly label: string;
  readonly icon: React.ElementType;
  readonly description: string;
}>;

export const ChatModeSelector = memo(function ({
  defaultMode = 'editor',
  onModeChange,
}: ChatModeSelectorProps): React.JSX.Element {
  const [selectedMode, setSelectedMode] = useState<ChatMode>(defaultMode);

  const handleModeChange = (value: string): void => {
    const mode = value as ChatMode;
    setSelectedMode(mode);
    onModeChange?.(mode);
  };

  const currentMode = chatModes.find((mode) => mode.id === selectedMode);

  return (
    <DropdownMenu>
      <Tooltip>
        <Button asChild variant="ghost" className="gap-2">
          <TooltipTrigger asChild>
            <DropdownMenuTrigger>
              {currentMode?.icon ? <currentMode.icon className="size-4" /> : null}
              <span>{currentMode?.label}</span>
            </DropdownMenuTrigger>
          </TooltipTrigger>
        </Button>
        <TooltipContent side="bottom">Select mode</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Mode</DropdownMenuLabel>
        <DropdownMenuRadioGroup className="flex flex-col gap-1" value={selectedMode} onValueChange={handleModeChange}>
          {chatModes.map((mode) => {
            const Icon = mode.icon;
            return (
              <DropdownMenuRadioItem
                key={mode.id}
                className="h-10 pl-2 data-[state=checked]:bg-accent data-[state=checked]:text-primary [&_[data-slot='dropdown-menu-radio-item-indicator']]:hidden"
                value={mode.id}
              >
                <Icon className="size-4" />
                <div className="flex flex-col">
                  <span className="font-medium">{mode.label}</span>
                  <span className="text-xs text-muted-foreground">{mode.description}</span>
                </div>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
