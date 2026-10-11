import { useId, useMemo } from 'react';
import { ChevronDown, Folder } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';

/** The combobox needs a non-empty value, so the repository root is selected as `/`. */
const rootValue = '/';

type FolderSelectorProperties = {
  /** The visible label's id; the trigger is named by it and its own value. */
  readonly labelId?: string;
  /** Every directory in the repository, relative to its root, without the root itself. */
  readonly folders: readonly string[];
  /** The selected folder; `''` is the whole repository. */
  readonly selectedFolder: string;
  readonly isDisabled?: boolean;
  readonly onSelect: (folder: string) => void;
};

/**
 * Every directory that holds a file, so a folder can be offered before any
 * archive is downloaded.
 *
 * @param filePaths - Repository-relative file paths from the tree listing.
 * @returns The directories, sorted.
 */
export function repositoryFolders(filePaths: readonly string[]): string[] {
  const folders = new Set<string>();
  for (const filePath of filePaths) {
    const segments = filePath.split('/');
    for (let depth = 1; depth < segments.length; depth++) {
      folders.add(segments.slice(0, depth).join('/'));
    }
  }
  return [...folders].toSorted((left, right) => left.localeCompare(right, 'en'));
}

export function FolderSelector(properties: FolderSelectorProperties): React.JSX.Element {
  const { labelId, folders, selectedFolder, isDisabled, onSelect } = properties;
  const triggerId = useId();
  const groupedFolders = useMemo(() => [{ name: 'Folders', items: ['', ...folders] }], [folders]);

  return (
    <ComboBoxResponsive
      groupedItems={groupedFolders}
      renderLabel={(folder) => (
        <div className='flex min-w-0 items-center gap-2'>
          <Folder className='size-4 shrink-0' />
          <span className={folder === selectedFolder ? 'truncate font-medium' : 'truncate'}>
            {folder || 'Whole repository'}
          </span>
        </div>
      )}
      getValue={(folder) => folder || rootValue}
      value={selectedFolder}
      placeholder='Whole repository'
      searchPlaceHolder='Search folders…'
      title='Select folder'
      description='Import the whole repository or one of its folders'
      isDisabled={() => isDisabled ?? false}
      emptyListMessage='No folders found'
      withVirtualization={folders.length > 20}
      virtualizationHeight={300}
      className='w-full'
      onSelect={(value) => {
        onSelect(value === rootValue ? '' : value);
      }}
    >
      <Button
        id={triggerId}
        aria-labelledby={labelId === undefined ? undefined : `${labelId} ${triggerId}`}
        variant='outline'
        className='w-full justify-between'
        disabled={isDisabled}
      >
        <div className='flex min-w-0 items-center gap-2'>
          <Folder className='size-4 shrink-0' />
          <span className='truncate'>{selectedFolder || 'Whole repository'}</span>
        </div>
        <ChevronDown className='size-4 shrink-0' />
      </Button>
    </ComboBoxResponsive>
  );
}
