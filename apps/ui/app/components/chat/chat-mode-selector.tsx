import { memo, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { Bot, Check, FileText } from 'lucide-react';
import type { ChatMode } from '@taucad/chat/constants';
import { chatMode, chatModes } from '@taucad/chat/constants';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '#components/ui/hover-card.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
import type { KeyCombination } from '#utils/keys.utils.js';
import { cn } from '#utils/ui.utils.js';

export type ModeConfig = {
  id: ChatMode;
  label: string;
  description: string;
  icon: typeof Bot;
  activeClass: string;
};

export const modeConfigs: Record<ChatMode, ModeConfig> = {
  [chatMode.agent]: {
    id: chatMode.agent,
    label: 'Agent',
    description: 'Execute code and make changes',
    icon: Bot,
    activeClass: 'border-primary/50 text-primary hover:text-primary',
  },
  [chatMode.plan]: {
    id: chatMode.plan,
    label: 'Plan',
    description: 'Design an approach before coding',
    icon: FileText,
    activeClass: 'border-feature/50 text-feature hover:text-feature',
  },
};

const modeItems = chatModes.map((id) => modeConfigs[id]);

export const toggleModeKeyCombination = {
  key: '.',
  modKey: true,
} satisfies KeyCombination;

type ChatAgentSelectorProperties = Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'onSelect'> & {
  readonly mode: ChatMode;
  readonly onModeChange: (mode: ChatMode) => void;
  readonly onSelect?: () => void;
  readonly onClose?: () => void;
  readonly children: (props: { currentConfig: ModeConfig; formattedKeyCombination: string }) => ReactNode;
  readonly popoverProperties?: React.ComponentProps<typeof ComboBoxResponsive>['popoverProperties'];
};

export const ChatAgentSelector = memo(function ({
  mode,
  onModeChange,
  onSelect,
  onClose,
  children,
  ...properties
}: ChatAgentSelectorProperties): React.JSX.Element {
  const effectiveMode = mode in modeConfigs ? mode : chatMode.agent;
  const currentConfig = modeConfigs[effectiveMode];
  const nextMode: ChatMode = effectiveMode === chatMode.agent ? chatMode.plan : chatMode.agent;

  const toggleMode = useCallback(() => {
    onModeChange(nextMode);
  }, [onModeChange, nextMode]);

  const { formattedKeyCombination } = useKeybinding(toggleModeKeyCombination, toggleMode);

  const handleSelect = useCallback(
    (value: string) => {
      if (value in modeConfigs) {
        onModeChange(value as ChatMode);
        onSelect?.();
      }
    },
    [onModeChange, onSelect],
  );

  const groupedItems = useMemo(() => [{ name: 'Agent Mode', items: modeItems }], []);

  return (
    <ComboBoxResponsive
      {...properties}
      groupedItems={groupedItems}
      renderLabel={(item, selectedItem) => {
        const Icon = item.icon;
        const config = modeConfigs[item.id];

        return (
          <HoverCard>
            <HoverCardTrigger asChild>
              <span className='flex w-full items-center justify-between'>
                <div className='flex items-center gap-2'>
                  <Icon className={cn('size-4', config.activeClass)} />
                  <span>{item.label}</span>
                </div>
                {selectedItem?.id === item.id ? <Check className='size-4' /> : null}
              </span>
            </HoverCardTrigger>
            <HoverCardContent side='right' align='start' sideOffset={12} alignOffset={-4} className='w-44 p-3'>
              <div className='space-y-1'>
                <div className='flex items-center gap-1.5'>
                  <Icon className={cn('size-3.5 shrink-0', config.activeClass)} />
                  <span className='text-xs font-medium'>{item.label}</span>
                </div>
                <p className='text-xs text-muted-foreground'>{item.description}</p>
              </div>
            </HoverCardContent>
          </HoverCard>
        );
      }}
      getValue={(item) => item.id}
      value={modeConfigs[effectiveMode]}
      onSelect={handleSelect}
      onClose={onClose}
      title='Switch agent mode'
      description='Select the agent mode for this chat.'
      isSearchEnabled={false}
      className='w-40'
      popoverProperties={{ align: 'start', side: 'bottom', ...properties.popoverProperties }}
    >
      {children({ currentConfig, formattedKeyCombination })}
    </ComboBoxResponsive>
  );
});
