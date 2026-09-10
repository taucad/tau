import { memo, useCallback } from 'react';
import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import type { ChatRevisionMode } from '@taucad/chat/schemas';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { useChatRevisionMode } from '#providers/chat-workspace-authority-provider.js';
import { daemonPlacementOf, placementRevisionModes } from '#lib/agent-host-placement.js';
import { useAgentHostPlacements } from '#hooks/use-cad-agent-config.js';

type RevisionModeConfig = {
  readonly id: ChatRevisionMode;
  readonly label: string;
  readonly description: string;
};

/**
 * The wire says `direct | candidate` (N26). The user reads about folders and
 * branches, which is why the copy does not repeat the wire's words.
 */
const revisionModeConfigs: Record<ChatRevisionMode, RevisionModeConfig> = {
  direct: {
    id: 'direct',
    label: 'Local',
    description: 'Edit files in the project folder directly',
  },
  candidate: {
    id: 'candidate',
    label: 'New branch',
    description: 'Fork an isolated copy; merge back when done',
  },
};

/**
 * The revision modes the host this chat is placed on will record a turn in.
 *
 * Capability, never execution kind (V18): a Codex turn on a capable host picks
 * its mode exactly like a Tau turn does, and a host with no revision port
 * offers nothing — which is what hides the control.
 *
 * @returns The offered modes, the current selection, its setter, and whether
 * the composer must show the control.
 * @public
 */
export const useChatRevisionPlacement = (): {
  readonly modes: readonly ChatRevisionMode[];
  readonly mode: ChatRevisionMode;
  readonly setMode: (mode: ChatRevisionMode) => void;
  /**
   * Whether the composer shows the control at all.
   *
   * More than one mode is the ordinary reason. The other is a chat left in a
   * mode its *current* placement will not accept — switch a chat from the
   * browser worker to a daemon and every turn is refused with
   * `REVISION_MODE_UNSUPPORTED` while the one control that would fix it is
   * hidden for being one item long. The mode is never clamped back silently:
   * that is the downgrade VSC5 forbids, so the user gets a one-item picker and
   * clicks their way out (3-review S3).
   */
  readonly isOffered: boolean;
} => {
  const {
    execution: { execution },
    session,
  } = useChatComposer();
  // Mounted for its discovery pass, which is also what fills the capability
  // book turn admission reads.
  useAgentHostPlacements();
  // No session (the marketing composer) means no chat to hold a selection and
  // no project route to hold the authority: nothing to offer.
  const selection = useChatRevisionMode(session?.activeChatId ?? '');
  const modes =
    session === undefined || selection === undefined ? [] : placementRevisionModes(daemonPlacementOf(execution));
  const mode = selection?.mode ?? 'direct';
  return {
    modes,
    mode,
    setMode: selection?.setMode ?? noSelection,
    isOffered: modes.length > 1 || (modes.length > 0 && !modes.includes(mode)),
  };
};

const noSelection = (): void => undefined;

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
  const { modes, mode, setMode } = useChatRevisionPlacement();
  const currentConfig = revisionModeConfigs[mode];
  const groupedItems = [{ name: 'Work in', items: modes.map((offered) => revisionModeConfigs[offered]) }];

  const handleSelect = useCallback(
    (value: string) => {
      if (value in revisionModeConfigs) {
        setMode(value as ChatRevisionMode);
        onSelect?.();
      }
    },
    [onSelect, setMode],
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
      renderLabel={(item, selectedItem) => (
        <span className='flex w-full min-w-0 items-center justify-between gap-2'>
          <span className='min-w-0'>
            <span className='block truncate'>{item.label}</span>
            <span className='block truncate text-xs text-muted-foreground'>{item.description}</span>
          </span>
          {selectedItem?.id === item.id ? <Check className='size-4 shrink-0' /> : null}
        </span>
      )}
      popoverProperties={{ align: 'start', side: 'bottom', ...properties.popoverProperties }}
    >
      {children({ currentConfig, label: currentConfig.label })}
    </ComboBoxResponsive>
  );
});
