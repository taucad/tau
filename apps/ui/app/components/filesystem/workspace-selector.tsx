import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Check, ChevronDown, FolderOpen, House, Plus, Settings, ShieldAlert, Unplug } from 'lucide-react';
import { ComboBoxResponsive } from '@taucad/ui/components/combobox-responsive';
import { Button } from '@taucad/ui/components/button';
import { menuItemVariants } from '@taucad/ui/components/menu.variants';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import type {
  ProjectCreationLocationOption,
  ProjectCreationLocationState,
} from '#hooks/use-project-creation-location.js';
import type { ProjectCreationLocation } from '@taucad/ui-core/types/project-creation-location.types';
import {
  projectCreationLocationAccessibleName,
  projectCreationLocationsEqual,
} from '#utils/project-creation-location.utils.js';
import { cn } from '@taucad/ui/utils/cn';
import { isDesktopTarget } from '#lib/build-target.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '@taucad/ui-core/constants/cookie.constants';

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

/** What the location chip last read, kept so the next load can draw it before the locations are probed (R8). */
export type RememberedProjectLocation = {
  readonly kind: ProjectCreationLocation['kind'];
  readonly label: string;
};

const homeLocation: RememberedProjectLocation = { kind: 'home', label: 'Home' };

const isRememberedLocation = (value: unknown): value is RememberedProjectLocation =>
  typeof value === 'object' &&
  value !== null &&
  'kind' in value &&
  (value.kind === 'home' || value.kind === 'workspace') &&
  'label' in value &&
  typeof value.label === 'string' &&
  value.label !== '';

/**
 * The location the chip last showed, Home until one has been shown.
 *
 * @returns The remembered location, and its setter.
 */
export const useRememberedProjectLocation = (): readonly [
  RememberedProjectLocation,
  (location: RememberedProjectLocation) => void,
] => {
  const [stored, setStored] = useCookie<unknown>(cookieName.projectLocation, homeLocation);
  return [isRememberedLocation(stored) ? stored : homeLocation, setStored] as const;
};

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

type WorkspaceLocationTriggerProperties = Omit<React.ComponentProps<typeof Button>, 'variant'> & {
  readonly location: RememberedProjectLocation;
  readonly variant: 'toolbar' | 'field';
};

/** The chip itself: the location's glyph, its name and a chevron, in the toolbar's or the field's finish. */
export function WorkspaceLocationTrigger({
  location,
  variant,
  className,
  ...properties
}: WorkspaceLocationTriggerProperties): React.JSX.Element {
  const styles = triggerStyles[variant];
  const LocationIcon = location.kind === 'home' ? House : FolderOpen;
  return (
    <Button
      type='button'
      variant={styles.variant}
      size='sm'
      className={cn('min-w-0', styles.button, className)}
      aria-label={projectCreationLocationAccessibleName(location)}
      {...properties}
    >
      <LocationIcon className={styles.icon} />
      <span className={cn('truncate', styles.label)}>{location.label}</span>
      <ChevronDown className={styles.chevron} />
    </Button>
  );
}

/** The box the chip sits in, the same while the locations load and once they are known. */
const selectorClassName = (variant: 'toolbar' | 'field'): string =>
  cn('flex min-w-0 items-center gap-1', variant === 'field' && 'w-full');

/**
 * The chip for the location the person last saw, drawn before the locations are probed. It is inert:
 * there is nothing to choose from yet, and it reads the same once there is, so arriving data does
 * not move the bar (R8).
 */
export function WorkspaceSelectorPlaceholder({
  variant,
}: {
  readonly variant: 'toolbar' | 'field';
}): React.JSX.Element {
  const [remembered] = useRememberedProjectLocation();
  return (
    <div inert className={selectorClassName(variant)}>
      <WorkspaceLocationTrigger location={remembered} variant={variant} />
    </div>
  );
}

export function WorkspaceSelector({
  state,
  variant,
  onSelectionComplete,
  onRequestFocus,
  className,
  ...properties
}: WorkspaceSelectorProperties): React.JSX.Element | undefined {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const [, setRemembered] = useRememberedProjectLocation();
  /* What the chip reads once the locations are known, remembered for the next load's first paint. */
  const shownKind = state.phase === 'ready' && state.shouldShowPicker ? state.value.kind : undefined;
  const shownLabel = state.phase === 'ready' && state.shouldShowPicker ? state.selectedOption.label : undefined;
  /* Written when this chip's own reading changes, never in answer to the stored value: two selectors that read
   * different locations (a connect lands in one first) would otherwise overwrite each other without end. */
  useEffect(() => {
    if (shownKind !== undefined && shownLabel !== undefined) {
      setRemembered({ kind: shownKind, label: shownLabel });
    }
  }, [setRemembered, shownKind, shownLabel]);

  if (!state.shouldShowPicker) {
    return undefined;
  }

  if (state.phase === 'loading') {
    return <WorkspaceSelectorPlaceholder variant={variant} />;
  }

  const tooltipCopy =
    state.value.kind === 'home'
      ? isDesktopTarget()
        ? 'Home keeps projects in a folder on your computer. Select to change location.'
        : 'Home uses browser storage, which can be cleared. Select to change location.'
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
    if (isDesktopTarget()) {
      void navigate('/files');
    } else {
      globalThis.window.open('/files', '_blank', 'noopener,noreferrer');
    }
    completeAction();
  };

  const trigger = (
    <WorkspaceLocationTrigger
      location={{ kind: state.value.kind, label: state.selectedOption.label }}
      variant={variant}
      aria-label={projectCreationLocationAccessibleName(state.selectedOption)}
    />
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
      searchPlaceHolder='Search locations…'
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
    <div className={selectorClassName(variant)}>
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
