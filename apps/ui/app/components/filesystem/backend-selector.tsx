/**
 * BackendSelector Component
 *
 * Shared filesystem backend selector used in the Settings pane and the /files route.
 * Renders a ComboBoxResponsive with backend options, feature detection, and icons.
 */

import { useMemo } from 'react';
import { Check, ChevronDown, Database, FolderOpen, HardDrive } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { filesystemBackendMeta } from '@taucad/types/constants';
import { Button } from '#components/ui/button.js';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { Loader } from '#components/ui/loader.js';
import { isFileSystemAccessSupported } from '#constants/browser.constants.js';

/**
 * Subset of `FileSystemBackend` that is user-pickable. The `memory`
 * backend is internal-only — projects must commit to a durable backend
 * (Audit R9), so the selector cannot offer it. `coerceFilesystemBackendCookie`
 * narrows stale cookie values back into this union.
 */
export type SelectableFilesystemBackend = 'indexeddb' | 'opfs' | 'webaccess';

/**
 * Narrow a raw filesystem-backend cookie value to a
 * {@link SelectableFilesystemBackend}. Stale `memory` values written by
 * older builds (when the runtime memory backend was still selectable)
 * coerce back to `indexeddb` — the safest persistent default. Used at
 * every cookie-read site that needs the value to feed back into a
 * selector or a project-creation backend choice.
 */
export function coerceFilesystemBackendCookie(value: string | undefined): SelectableFilesystemBackend {
  if (value === 'opfs' || value === 'webaccess' || value === 'indexeddb') {
    return value;
  }
  return 'indexeddb';
}

/**
 * Backend option for the selector dropdown.
 */
export type BackendOption = {
  value: SelectableFilesystemBackend;
  label: string;
  description: string;
  icon: LucideIcon;
};

/**
 * All user-pickable backend options. `memory` is excluded — the
 * runtime memory backend exists for transient internal mounts (tests
 * and ephemeral helpers) and cannot persist project state across a
 * tab reload.
 */
export const backendOptions: BackendOption[] = [
  {
    value: 'indexeddb',
    ...filesystemBackendMeta.indexeddb,
    icon: Database,
  },
  {
    value: 'opfs',
    ...filesystemBackendMeta.opfs,
    icon: HardDrive,
  },
  {
    value: 'webaccess',
    ...filesystemBackendMeta.webaccess,
    icon: FolderOpen,
  },
];

type BackendSelectorProps = {
  readonly value: SelectableFilesystemBackend;
  readonly onSelect: (backend: string) => void | Promise<void>;
  readonly isLoading?: boolean;
  /**
   * Optional badge appended to the selected-backend label inside the
   * trigger button. Used by `/projects/new` to surface the bound
   * workspace name when `webaccess` is selected ("File System ·
   * MyFolder"). Keep it short — the trigger has limited width.
   */
  readonly badge?: React.ReactNode;
};

/**
 * Filesystem backend selector dropdown.
 *
 * Renders a ComboBoxResponsive with all available backends, feature detection
 * for disabling unsupported ones, and a trigger button showing the current selection.
 */
export function BackendSelector({
  value,
  onSelect,
  isLoading = false,
  badge,
}: BackendSelectorProps): React.JSX.Element {
  const currentOption = useMemo(
    () => backendOptions.find((option) => option.value === value) ?? backendOptions[0]!,
    [value],
  );

  return (
    <ComboBoxResponsive
      groupedItems={[{ name: 'Storage Backends', items: backendOptions }]}
      value={currentOption}
      getValue={(item) => item.value}
      renderLabel={(item, selectedItem) => (
        <span className='flex w-full items-center justify-between gap-4'>
          <div className='flex items-center gap-2'>
            <item.icon className='size-4' />
            <div className='flex flex-col items-start gap-0.5'>
              <span className='font-medium'>{item.label}</span>
              <span className='text-xs text-muted-foreground'>{item.description}</span>
            </div>
          </div>
          {selectedItem?.value === item.value ? <Check className='size-4 shrink-0' /> : undefined}
        </span>
      )}
      popoverProperties={{ className: 'w-[340px]' }}
      isDisabled={(item) => item.value === 'webaccess' && !isFileSystemAccessSupported}
      title='Select Storage Backend'
      description='Choose where to store files'
      isSearchEnabled={false}
      onSelect={onSelect}
    >
      <Button variant='outline' size='sm' className='w-[220px] justify-between' disabled={isLoading}>
        <span className='flex min-w-0 items-center gap-2'>
          {isLoading ? <Loader className='size-3.5' /> : <currentOption.icon className='size-3.5' />}
          <span className='truncate'>{currentOption.label}</span>
          {badge ? <span className='truncate text-xs text-muted-foreground'>· {badge}</span> : undefined}
        </span>
        <ChevronDown className='size-4 shrink-0 opacity-50' />
      </Button>
    </ComboBoxResponsive>
  );
}
