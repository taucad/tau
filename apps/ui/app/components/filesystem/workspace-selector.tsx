import { useState } from 'react';
import { Check, ChevronDown, FolderOpen, House, Plus, Settings, ShieldAlert, Unplug } from 'lucide-react';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { Button } from '@taucad/ui/components/button';
import { menuItemVariants } from '@taucad/ui/components/menu.variants';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import type {
  ProjectCreationLocationOption,
  ProjectCreationLocationState,
} from '#hooks/use-project-creation-location.js';
import type { ProjectCreationLocation } from '#types/project-creation-location.types.js';
import {
  projectCreationLocationAccessibleName,
  projectCreationLocationsEqual,
} from '#utils/project-creation-location.utils.js';
import { cn } from '@taucad/ui/utils/cn';

type WorkspaceSelectorProperties = Omit<React.HTMLAttributes<HTMLDivElement>, 'onSelect'> & {
  readonly state: ProjectCreationLocationState;
  readonly variant: 'toolbar' | 'field';
  readonly onSelectionComplete?: () => void;
  readonly onRequestFocus?: () => void;
};

const locationValue = (location: ProjectCreationLocation): string =>
  location.kind === 'home' ? 'home' : `workspace:${location.workspaceId}`;

const optionValue = (option: ProjectCreationLocationOption): string =>
  `${locationValue(option.location)} ${option.label} ${option.detail}`;

const isReadyOption = (option: ProjectCreationLocationOption | undefined): boolean =>
  option?.status === 'ready' || option?.status === 'connected';

/** The trigger's two finishes: the composer's ghost pill, and a form field. */
const triggerStyles = {
  /* The composer's ghost pill (D6): glyph first, its label the first to leave when the bar needs room. */
  toolbar: {
    variant: 'ghost',
    button:
      'h-7 max-w-48 gap-1 rounded-full px-2.5 pr-2 font-normal text-muted-foreground hover:text-foreground group-data-[hide-kernel]/bar:gap-0.5 group-data-[hide-kernel]/bar:px-1.5',
    icon: 'size-4 shrink-0',
    label: 'text-xs group-data-[hide-kernel]/bar:hidden',
    chevron: 'size-3 shrink-0',
  },
  field: {
    variant: 'outline',
    button: 'h-auto w-full justify-start px-2 py-2',
    icon: 'size-3.5',
    label: 'min-w-0 flex-1 text-left',
    chevron: 'ml-auto opacity-60',
  },
} as const;

export function WorkspaceSelector({
  state,
  variant,
  onSelectionComplete,
  onRequestFocus,
  className,
  ...properties
}: WorkspaceSelectorProperties): React.JSX.Element | undefined {
  const [open, setOpen] = useState(false);

  if (!state.shouldShowPicker) {
    return undefined;
  }

  if (state.phase === 'loading') {
    return (
      <Button
        type='button'
        variant={variant === 'field' ? 'outline' : 'ghost'}
        size='sm'
        className={cn(
          variant === 'toolbar' && 'h-7 max-w-48 rounded-full',
          variant === 'field' && 'h-auto w-full justify-start py-2',
        )}
        disabled
        aria-label='Loading project locations'
      >
        <FolderOpen className='size-3.5' />
        Loading locations…
      </Button>
    );
  }

  const tooltipCopy =
    state.value.kind === 'home'
      ? 'Home uses browser storage, which can be cleared. Select to change location.'
      : 'Projects are saved directly to this folder on your disk. Select to change location.';
  const recovery = state.selectedWorkspaceRecovery;
  const recoveryLabel = recovery?.kind === 'grant' ? 'Grant access' : 'Reconnect folder';

  const optionForValue = (value: string): ProjectCreationLocationOption | undefined =>
    state.options.find((candidate) => optionValue(candidate) === value);

  const select = (value: string): void => {
    const option = optionForValue(value);
    if (!option) {
      return;
    }
    state.select(option.location);
    if (isReadyOption(option)) {
      onSelectionComplete?.();
    }
  };

  const completeAction = (): void => {
    setOpen(false);
    onSelectionComplete?.();
  };

  const recover = async (): Promise<void> => {
    await recovery?.run();
    completeAction();
  };

  const connect = async (): Promise<void> => {
    await state.connectWorkspace();
    completeAction();
  };

  const manage = (): void => {
    globalThis.window.open('/files', '_blank', 'noopener,noreferrer');
    completeAction();
  };

  const styles = triggerStyles[variant];
  const LocationIcon = state.value.kind === 'home' ? House : FolderOpen;
  const trigger = (
    <Button
      type='button'
      variant={styles.variant}
      size='sm'
      className={cn('min-w-0', styles.button)}
      aria-label={projectCreationLocationAccessibleName(state.selectedOption)}
    >
      <LocationIcon className={styles.icon} />
      <span className={cn('truncate', styles.label)}>{state.selectedOption.label}</span>
      <ChevronDown className={styles.chevron} />
    </Button>
  );

  const picker = (
    <ComboBoxResponsive<ProjectCreationLocationOption>
      {...properties}
      className={cn("data-[slot='popover-content']:w-64", className)}
      popoverProperties={{ align: 'start' }}
      groupedItems={[{ name: 'Create in', items: [...state.options] }]}
      renderLabel={(option, selectedOption) => {
        const selected =
          selectedOption !== undefined && projectCreationLocationsEqual(option.location, selectedOption.location);
        return (
          <span className='-mx-3 -my-1 flex min-h-0 w-[calc(100%+1.5rem)] shrink-0 items-center justify-between gap-2 px-3 py-1'>
            <span className='flex min-w-0 flex-1 items-center gap-2'>
              {option.location.kind === 'home' ? <House /> : <FolderOpen />}
              <span className='flex min-w-0 flex-1 items-baseline gap-2 overflow-hidden'>
                <span className='truncate'>{option.label}</span>
                <span className='shrink-0 text-xs text-muted-foreground'>{option.detail}</span>
              </span>
            </span>
            <span className='flex shrink-0 items-center gap-2'>
              {option.status === 'permission' ? <ShieldAlert aria-label='Access required' /> : null}
              {option.status === 'disconnected' ? <Unplug aria-label='Disconnected' /> : null}
              {selected ? <Check aria-label='Selected location' /> : null}
            </span>
          </span>
        );
      }}
      getValue={optionValue}
      value={state.selectedOption}
      emptyListMessage='No locations found.'
      searchPlaceHolder='Search locations...'
      isSearchEnabled={state.options.length >= 5}
      title='Select a project location'
      description='Choose where new project files are stored.'
      isOpen={open}
      onOpenChange={setOpen}
      onSelect={select}
      onClose={onRequestFocus}
      shouldCloseOnSelect={(value) => isReadyOption(optionForValue(value))}
      footer={
        <>
          <div className='border-t' />
          <div className='flex flex-col gap-0.5 p-1'>
            {recovery ? (
              <>
                <button
                  type='button'
                  className={cn(menuItemVariants({ highlight: 'selected' }), 'h-auto w-full')}
                  onClick={() => {
                    void recover();
                  }}
                >
                  {recovery.kind === 'grant' ? <ShieldAlert /> : <Unplug />}
                  {recoveryLabel}
                </button>
                <div className='my-1 border-t' />
              </>
            ) : null}
            <button
              type='button'
              className={cn(menuItemVariants({ highlight: 'selected' }), 'h-auto w-full')}
              onClick={() => {
                void connect();
              }}
            >
              <Plus />
              Connect a folder…
            </button>
            <button
              type='button'
              className={cn(menuItemVariants({ highlight: 'selected' }), 'h-auto w-full')}
              onClick={manage}
            >
              <Settings />
              Manage locations…
            </button>
          </div>
        </>
      }
    >
      {variant === 'toolbar' ? <TooltipTrigger asChild>{trigger}</TooltipTrigger> : trigger}
    </ComboBoxResponsive>
  );

  return (
    <div className={cn('flex min-w-0 items-center gap-1', variant === 'field' && 'w-full')}>
      {variant === 'toolbar' ? (
        <Tooltip>
          {picker}
          <TooltipContent className='max-w-64 text-pretty'>{tooltipCopy}</TooltipContent>
        </Tooltip>
      ) : (
        picker
      )}
    </div>
  );
}
