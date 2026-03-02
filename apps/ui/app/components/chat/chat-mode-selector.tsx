import { Bot, FileText } from 'lucide-react';
import type { ChatMode } from '@taucad/chat/constants';
import { chatMode } from '@taucad/chat/constants';
import { Button } from '#components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { cn } from '#utils/ui.utils.js';

const modeConfig = {
  [chatMode.agent]: {
    label: 'Agent',
    icon: Bot,
    shortLabel: 'Agent',
  },
  [chatMode.plan]: {
    label: 'Plan',
    icon: FileText,
    shortLabel: 'Plan',
  },
} as const satisfies Record<ChatMode, { label: string; icon: typeof Bot; shortLabel: string }>;

type ChatModeSelectorProperties = {
  readonly mode: ChatMode;
  readonly onModeChange: (mode: ChatMode) => void;
};

export function ChatModeSelector({ mode, onModeChange }: ChatModeSelectorProperties): React.JSX.Element {
  const effectiveMode = mode in modeConfig ? mode : chatMode.agent;
  const currentConfig = modeConfig[effectiveMode];
  const nextMode: ChatMode = effectiveMode === chatMode.agent ? chatMode.plan : chatMode.agent;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-7 cursor-pointer! rounded-full text-muted-foreground hover:text-foreground @max-[22rem]:w-7 @xs:max-w-fit @[22rem]:pr-2',
            mode === chatMode.plan && 'border-primary/50 text-primary',
          )}
          onClick={() => {
            onModeChange(nextMode);
          }}
        >
          <currentConfig.icon className="size-4" />
          <span className="hidden text-xs @[22rem]:block">{currentConfig.shortLabel}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <span>{currentConfig.label} mode (Shift+Tab to toggle)</span>
      </TooltipContent>
    </Tooltip>
  );
}
