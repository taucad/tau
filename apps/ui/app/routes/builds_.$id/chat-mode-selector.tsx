import { memo, useState } from 'react';
import { Box, Eye, Upload } from 'lucide-react';
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

export type ChatMode = 'modeling' | 'visualizer' | 'publish';

type ChatModeSelectorProps = {
  readonly defaultMode?: ChatMode;
  readonly onModeChange?: (mode: ChatMode) => void;
};

const chatModes = [
  {
    id: 'modeling' as const,
    label: 'Modeling',
    icon: Box,
    description: 'Create and edit 3D models',
  },
  {
    id: 'visualizer' as const,
    label: 'Visualizer',
    icon: Eye,
    description: 'View and inspect models',
  },
  {
    id: 'publish' as const,
    label: 'Publish',
    icon: Upload,
    description: 'Share and export models',
  },
] as const;

export const ChatModeSelector = memo(function ({
  defaultMode = 'modeling',
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
              {currentMode?.icon && <currentMode.icon className="size-4" />}
              {currentMode?.label}
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
              <DropdownMenuRadioItem className="pl-2 h-10 data-[state=checked]:bg-accent data-[state=checked]:text-primary [&_[data-slot='dropdown-menu-radio-item-indicator']]:hidden" key={mode.id} value={mode.id}>
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
