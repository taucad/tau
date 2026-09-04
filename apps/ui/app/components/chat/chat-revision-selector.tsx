import { memo, useCallback } from 'react';
import type { ReactNode } from 'react';
import { Check, FolderOpen, GitBranch } from 'lucide-react';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { getChatRevisionMode, withChatRevisionMode } from '#utils/chat-revision-mode.js';
import type { ChatRevisionMode } from '#utils/chat-revision-mode.js';

type RevisionModeConfig = {
  readonly id: ChatRevisionMode;
  readonly label: string;
  readonly description: string;
  readonly icon: typeof FolderOpen;
};

const revisionModeConfigs: Record<ChatRevisionMode, RevisionModeConfig> = {
  local: {
    id: 'local',
    label: 'Locally',
    description: 'Edit files in the project folder directly',
    icon: FolderOpen,
  },
  branch: {
    id: 'branch',
    label: 'New branch',
    description: 'Fork an isolated copy; merge back when done',
    icon: GitBranch,
  },
};

const revisionModeItems = [revisionModeConfigs.local, revisionModeConfigs.branch];
const groupedItems = [{ name: 'Work in', items: revisionModeItems }];

type ChatRevisionSelectorProperties = Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'onSelect'> & {
  readonly children: (props: { readonly currentConfig: RevisionModeConfig; readonly label: string }) => ReactNode;
  readonly onSelect?: () => void;
  readonly onClose?: () => void;
  readonly popoverProperties?: React.ComponentProps<typeof ComboBoxResponsive>['popoverProperties'];
  readonly isNested?: boolean;
};

/**
 * Picks where this chat's turns write: the live project folder (the default,
 * per the operator ruling that suspends charter D6 until branch porcelain
 * lands) or an isolated revision branch.
 */
export const ChatRevisionSelector = memo(function ({
  children,
  onSelect,
  onClose,
  isNested,
  ...properties
}: ChatRevisionSelectorProperties): React.JSX.Element {
  const {
    execution: { execution, setActiveExecution },
  } = useChatComposer();
  const currentConfig = revisionModeConfigs[getChatRevisionMode(execution)];

  const handleSelect = useCallback(
    (value: string) => {
      if (value in revisionModeConfigs) {
        setActiveExecution(withChatRevisionMode(execution, value as ChatRevisionMode));
        onSelect?.();
      }
    },
    [execution, onSelect, setActiveExecution],
  );

  return (
    <ComboBoxResponsive
      {...properties}
      groupedItems={groupedItems}
      getValue={(item) => item.id}
      value={currentConfig}
      onSelect={handleSelect}
      onClose={onClose}
      isNested={isNested}
      title='Select where to work'
      description='Choose whether this chat edits the project folder or an isolated branch.'
      isSearchEnabled={false}
      className='w-64'
      renderLabel={(item, selectedItem) => {
        const Icon = item.icon;
        return (
          <span className='flex w-full min-w-0 items-center justify-between gap-2'>
            <span className='flex min-w-0 items-center gap-2'>
              <Icon className='size-4 shrink-0' />
              <span className='min-w-0'>
                <span className='block truncate'>{item.label}</span>
                <span className='block truncate text-xs text-muted-foreground'>{item.description}</span>
              </span>
            </span>
            {selectedItem?.id === item.id ? <Check className='size-4 shrink-0' /> : null}
          </span>
        );
      }}
      popoverProperties={{ align: 'start', side: 'bottom', ...properties.popoverProperties }}
    >
      {children({ currentConfig, label: currentConfig.label })}
    </ComboBoxResponsive>
  );
});
