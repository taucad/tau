import { useMemo, useRef } from 'react';
import { AtSign, FolderOpen, House, Paperclip, Plus, Settings, ShieldAlert, Unplug } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { ComboBoxResponsive } from '@taucad/ui/components/combobox-responsive';
import type { ComboBoxSubView } from '@taucad/ui/components/combobox-responsive';
import { KeyShortcut } from '@taucad/ui/components/key-shortcut';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { SvgIcon } from '@taucad/ui-kit/icons/svg-icon';
import { chatComposerAddTriggerClassName } from '@taucad/chat-ui/components/chat-input-styles';
import { projectCreationLocationsEqual } from '@taucad/files-ui/utils/project-creation-location.utils';
import { KernelRow, useKernelChoices } from '#components/chat/chat-kernel-selector.js';
import { kernelPillFace } from '#components/chat/kernel-picker-layout.js';
import type { KernelPickerRow } from '#components/chat/kernel-picker-layout.js';
import { AutoKernelGlyph } from '#components/chat/kernel-pill.js';
import {
  isReadyOption,
  optionValue,
  ProjectLocationOptionRow,
  useProjectLocationActions,
} from '#components/filesystem/workspace-selector.js';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import type {
  ProjectCreationLocationOption,
  ProjectCreationLocationState,
} from '#hooks/use-project-creation-location.js';

type LocationAction = 'recover' | 'connect' | 'manage';

/** A row of the + menu: an action at the top level, or a choice in the kernel or location view. */
type AddMenuRow =
  | { readonly kind: 'attach' }
  | { readonly kind: 'context' }
  | { readonly kind: 'kernel'; readonly row: KernelPickerRow }
  | { readonly kind: 'location'; readonly option: ProjectCreationLocationOption }
  | {
      readonly kind: 'location-action';
      readonly action: LocationAction;
      readonly label: string;
      readonly icon: typeof Plus;
    };

const rowValue = (row: AddMenuRow): string => {
  switch (row.kind) {
    case 'kernel': {
      return `kernel:${row.row.id}`;
    }
    case 'location': {
      return `location:${optionValue(row.option)}`;
    }
    case 'location-action': {
      return `location-action:${row.action}`;
    }
    default: {
      return row.kind;
    }
  }
};

/** A view's row in the + menu: what it sets, and what it is set to now. */
function SettingRowLabel({
  icon,
  name,
  value,
}: {
  readonly icon: React.ReactNode;
  readonly name: string;
  readonly value: string;
}): React.JSX.Element {
  return (
    <span className='flex min-w-0 flex-1 items-center gap-2'>
      {icon}
      <span className='text-foreground'>{name}</span>
      <span className='ml-auto truncate'>{value}</span>
    </span>
  );
}

/**
 * One + for everything a turn can carry and where it goes (F10): attach a file, or — outside Home — add context, which
 * types @ and opens the shipped menu; then the kernel, and on Home the project's location, each as a view of its own.
 * A model that cannot read files keeps the attach row, disabled, saying why (F14).
 */
export function ChatAddMenu({
  enableContextActions,
  enableKernelSelector,
  creationLocation,
  isAttachmentSupported,
  handleAtButtonClick,
  handleFileSelect,
  focusEditor,
}: {
  readonly enableContextActions: boolean;
  readonly enableKernelSelector: boolean;
  /** Home's creation location; omitted where the composer creates nothing. */
  readonly creationLocation?: ProjectCreationLocationState;
  readonly isAttachmentSupported: boolean;
  readonly handleAtButtonClick: () => void;
  readonly handleFileSelect: () => void;
  readonly focusEditor: () => void;
}): React.JSX.Element {
  /* A chosen action moves focus itself: to the file picker, or to the editor at a typed @. */
  const isFocusMoved = useRef(false);
  /* A kernel or location pick closes the menu by selection, which skips `onClose`: the surface would hand focus to +. */
  const isEditorRefocused = useRef(false);
  const refocusEditor = (event: Event): void => {
    if (isEditorRefocused.current) {
      isEditorRefocused.current = false;
      event.preventDefault();
      focusEditor();
    }
  };
  const {
    kernel: { preference, owner },
  } = useChatComposer();
  const kernels = useKernelChoices();
  const location = useProjectLocationActions(creationLocation ?? noLocation, focusEditor);
  const ready = creationLocation?.phase === 'ready' && creationLocation.shouldShowPicker ? creationLocation : undefined;
  const face = kernelPillFace({ preference, ...(owner === undefined ? {} : { owner }) });

  const topLevel: AddMenuRow[] = enableContextActions
    ? [{ kind: 'attach' }, { kind: 'context' }]
    : [{ kind: 'attach' }];
  const subViews = useMemo(() => {
    const views: Array<ComboBoxSubView<AddMenuRow>> = [];
    if (enableKernelSelector) {
      views.push({
        id: 'kernel',
        title: 'Kernel',
        label: (
          <SettingRowLabel
            icon={
              face.glyph === 'auto' ? (
                <AutoKernelGlyph className='size-3.5' />
              ) : (
                <SvgIcon id={face.glyph} aria-hidden className='size-3.5 shrink-0 grayscale' />
              )
            }
            name='Kernel'
            value={face.text}
          />
        ),
        groupedItems: kernels.groups.map((group) => ({
          name: group.name,
          items: group.items.map((row) => ({ kind: 'kernel', row }) as const),
        })),
      });
    }
    if (ready) {
      const actions: AddMenuRow[] = [
        ...(location.recovery
          ? [
              {
                kind: 'location-action',
                action: 'recover',
                label: location.recoveryLabel,
                icon: location.recovery.kind === 'grant' ? ShieldAlert : Unplug,
              } as const,
            ]
          : []),
        { kind: 'location-action', action: 'connect', label: 'Connect a folder…', icon: Plus },
        { kind: 'location-action', action: 'manage', label: 'Manage locations…', icon: Settings },
      ];
      views.push({
        id: 'location',
        title: 'Location',
        label: (
          <SettingRowLabel
            icon={ready.value.kind === 'home' ? <House /> : <FolderOpen />}
            name='Location'
            value={ready.selectedOption.label}
          />
        ),
        groupedItems: [
          { name: 'Create in', items: ready.options.map((option) => ({ kind: 'location', option }) as const) },
          { name: 'Folders', items: actions },
        ],
      });
    }
    return views;
  }, [enableKernelSelector, face, kernels.groups, location.recovery, location.recoveryLabel, ready]);

  const rows = [...topLevel, ...subViews.flatMap((view) => view.groupedItems.flatMap((group) => group.items))];
  const rowFor = (value: string): AddMenuRow | undefined => rows.find((row) => rowValue(row) === value);

  const select = (value: string): void => {
    const row = rowFor(value);
    switch (row?.kind) {
      case 'attach': {
        isFocusMoved.current = true;
        handleFileSelect();
        break;
      }
      case 'context': {
        isFocusMoved.current = true;
        handleAtButtonClick();
        break;
      }
      case 'kernel': {
        isEditorRefocused.current = kernels.choose(row.row.id);
        break;
      }
      case 'location': {
        isEditorRefocused.current = isReadyOption(row.option);
        location.select(optionValue(row.option));
        break;
      }
      case 'location-action': {
        isFocusMoved.current = true;
        void location[row.action]();
        break;
      }
      default: {
        break;
      }
    }
  };

  return (
    <Tooltip>
      <ComboBoxResponsive<AddMenuRow>
        data-chat-textarea-focustrap
        className="data-[slot='popover-content']:w-72"
        popoverProperties={{ align: 'start', onCloseAutoFocus: refocusEditor }}
        drawerProperties={{ onCloseAutoFocus: refocusEditor }}
        title='Add'
        description='Attach files or context, or choose the kernel and where the project is saved.'
        isSearchEnabled={false}
        groupedItems={[{ name: '', items: topLevel }]}
        subViews={subViews}
        getValue={rowValue}
        isDisabled={(row) => row.kind === 'attach' && !isAttachmentSupported}
        shouldCloseOnSelect={(value) => {
          const row = rowFor(value);
          if (row?.kind === 'kernel') {
            return row.row.unavailable === undefined;
          }
          return row?.kind === 'location' ? isReadyOption(row.option) : true;
        }}
        renderLabel={(row) => (
          <AddMenuRowLabel
            row={row}
            isAttachmentSupported={isAttachmentSupported}
            kernelPreference={preference}
            location={ready?.selectedOption}
          />
        )}
        onSelect={select}
        onClose={() => {
          if (!isFocusMoved.current) {
            focusEditor();
          }
          isFocusMoved.current = false;
        }}
      >
        <TooltipTrigger asChild>
          <Button variant='ghost' size='sm' aria-label='Add' className={chatComposerAddTriggerClassName}>
            <Plus className='size-4' aria-hidden='true' />
          </Button>
        </TooltipTrigger>
      </ComboBoxResponsive>
      {/* The same word as its name (I6); the menu says what it adds. */}
      <TooltipContent>Add</TooltipContent>
    </Tooltip>
  );
}

/** Where the composer creates nothing, the location actions have no location to act on. */
const noLocation: ProjectCreationLocationState = {
  phase: 'loading',
  hasWebAccessCapability: true,
  shouldShowPicker: true,
  options: [],
  canCreate: false,
};

function AddMenuRowLabel({
  row,
  isAttachmentSupported,
  kernelPreference,
  location,
}: {
  readonly row: AddMenuRow;
  readonly isAttachmentSupported: boolean;
  readonly kernelPreference: string;
  readonly location: ProjectCreationLocationOption | undefined;
}): React.JSX.Element {
  switch (row.kind) {
    case 'attach': {
      return (
        <span className='flex items-start gap-2'>
          <Paperclip aria-hidden='true' className='mt-0.5' />
          <span className='flex flex-col'>
            Attach image or PDF
            {isAttachmentSupported ? null : (
              <span className='text-xs text-muted-foreground'>This model can&apos;t read images or PDFs</span>
            )}
          </span>
        </span>
      );
    }
    case 'context': {
      return (
        <span className='flex w-full items-center gap-2'>
          <AtSign aria-hidden='true' />
          Add context
          <KeyShortcut className='ml-auto pointer-coarse:hidden'>@</KeyShortcut>
        </span>
      );
    }
    case 'kernel': {
      return <KernelRow row={row.row} isSelected={row.row.id === kernelPreference} />;
    }
    case 'location': {
      return (
        <ProjectLocationOptionRow
          option={row.option}
          isSelected={location !== undefined && projectCreationLocationsEqual(row.option.location, location.location)}
        />
      );
    }
    case 'location-action': {
      const Icon = row.icon;
      return (
        <span className='flex items-center gap-2'>
          <Icon aria-hidden='true' />
          {row.label}
        </span>
      );
    }
  }
}
