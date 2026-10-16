import { ChevronDown, Pencil, Trash } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import type { ParameterManifest } from '@taucad/parameters';
import { Button } from '@taucad/ui/components/button';
import { ComboBoxResponsive } from '@taucad/ui/components/combobox-responsive';
import { Input } from '@taucad/ui/components/input';
import { nestedActionVariants } from '@taucad/ui/components/nested-action.variants';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import type { ParameterGroupOperations } from '#parameters/parameters-source.js';

type ParameterGroupItem = {
  name: string;
  parameterCount: number;
  isActive: boolean;
};

const createNewGroupValue = '__create_new_group__';

type ParameterGroupSelectorItem =
  | ParameterGroupItem
  | { name: typeof createNewGroupValue; parameterCount: 0; isActive: false };

/**
 * The entry's group selector: choose, save as, rename and delete groups, like a branch selector.
 *
 * @param props - The entry, its manifest and groups, the host's group operations, and how to run one.
 * @returns The selector.
 */
export function ParameterGroupSelector({
  filePath,
  manifest,
  groups,
  activeGroup,
  operations,
  run,
}: {
  readonly filePath: string;
  readonly manifest: ParameterManifest | undefined;
  readonly groups: Record<string, { values: Record<string, unknown> }>;
  readonly activeGroup: string;
  readonly operations: ParameterGroupOperations;
  /** Runs an operation and shows its failure. */
  readonly run: (operation: () => Promise<void> | void) => void;
}): React.JSX.Element {
  const [isCreating, setIsCreating] = useState(false);
  const [createValue, setCreateValue] = useState('');
  const [renamingGroup, setRenamingGroup] = useState<string | undefined>(undefined);
  const [renameValue, setRenameValue] = useState('');

  const groupItems = useMemo<ParameterGroupItem[]>(
    () =>
      Object.entries(groups).map(([name, group]) => ({
        name,
        parameterCount: Object.keys(group.values).length,
        isActive: name === activeGroup,
      })),
    [groups, activeGroup],
  );

  const selectorItems = useMemo<ParameterGroupSelectorItem[]>(
    () => [...groupItems, { name: createNewGroupValue, parameterCount: 0, isActive: false }],
    [groupItems],
  );

  const groupedItems = useMemo(() => [{ name: 'Parameter Groups', items: selectorItems }], [selectorItems]);

  const handleSelect = useCallback(
    (value: string) => {
      if (value === createNewGroupValue) {
        setCreateValue(`${activeGroup} copy`);
        setIsCreating(true);
        return;
      }
      if (manifest !== undefined) {
        run(async () => operations.select(filePath, manifest, value));
      }
    },
    [operations, run, filePath, activeGroup, manifest],
  );

  const shouldCloseOnSelect = useCallback((value: string) => value !== createNewGroupValue, []);

  const handleCommitCreate = useCallback(() => {
    const trimmed = createValue.trim();
    if (!trimmed || groups[trimmed]) {
      setIsCreating(false);
      return;
    }
    const currentValues = groups[activeGroup]?.values ?? {};
    if (manifest === undefined) {
      return;
    }
    run(async () => operations.create(filePath, manifest, { group: trimmed, values: currentValues }));
    run(async () => operations.select(filePath, manifest, trimmed));
    setIsCreating(false);
  }, [createValue, groups, activeGroup, filePath, operations, run, manifest]);

  const handleCancelCreate = useCallback(() => {
    setIsCreating(false);
  }, []);

  const handleStartRename = useCallback((groupName: string) => {
    setRenamingGroup(groupName);
    setRenameValue(groupName);
  }, []);

  const handleCommitRename = useCallback(() => {
    const trimmed = renameValue.trim();
    if (!renamingGroup || !trimmed || trimmed === renamingGroup || groups[trimmed]) {
      setRenamingGroup(undefined);
      return;
    }
    if (manifest !== undefined) {
      run(async () => operations.rename(filePath, manifest, { group: renamingGroup, nextGroup: trimmed }));
    }
    setRenamingGroup(undefined);
  }, [renameValue, renamingGroup, groups, filePath, operations, run, manifest]);

  const handleCancelRename = useCallback(() => {
    setRenamingGroup(undefined);
  }, []);

  const handleDelete = useCallback(
    (groupName: string) => {
      if (manifest !== undefined) {
        run(async () => operations.delete(filePath, manifest, groupName));
      }
    },
    [operations, run, filePath, manifest],
  );

  const getItemValue = useCallback((item: ParameterGroupSelectorItem) => item.name, []);

  const renderLabel = useCallback(
    (item: ParameterGroupSelectorItem, _selected: ParameterGroupSelectorItem | undefined) => {
      if (item.name === createNewGroupValue) {
        if (isCreating) {
          return (
            <form
              className='flex w-full items-center gap-1'
              onSubmit={(event) => {
                event.preventDefault();
                handleCommitCreate();
              }}
            >
              <Input
                autoFocus
                autoComplete='off'
                value={createValue}
                className='h-6 text-xs'
                onChange={(event) => {
                  setCreateValue(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    // Cmdk's <Command> intercepts Enter on its root and calls preventDefault before
                    // dispatching select to the highlighted item, which (a) cancels the form's implicit
                    // submit and (b) selects whichever group the mouse is hovering over, closing the
                    // popover. Stop propagation so cmdk never sees the key, and commit explicitly.
                    event.preventDefault();
                    event.stopPropagation();
                    handleCommitCreate();
                    return;
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    handleCancelCreate();
                  }
                }}
                onBlur={handleCommitCreate}
                onFocus={(event) => {
                  event.target.select();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                }}
              />
              <Button type='submit' size='xs' disabled={!createValue.trim() || Boolean(groups[createValue.trim()])}>
                Save
              </Button>
            </form>
          );
        }

        return <span className='text-xs text-muted-foreground'>Save as new group&hellip;</span>;
      }

      if (renamingGroup === item.name) {
        return (
          <form
            className='flex w-full items-center gap-1'
            onSubmit={(event) => {
              event.preventDefault();
              handleCommitRename();
            }}
          >
            <Input
              autoFocus
              autoComplete='off'
              value={renameValue}
              className='h-6 text-xs'
              onChange={(event) => {
                setRenameValue(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  // Same cmdk-swallows-Enter problem as the create form above; stop propagation
                  // and commit explicitly so the rename actually applies.
                  event.preventDefault();
                  event.stopPropagation();
                  handleCommitRename();
                  return;
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  event.stopPropagation();
                  handleCancelRename();
                }
              }}
              onBlur={handleCommitRename}
              onFocus={(event) => {
                event.target.select();
              }}
              onClick={(event) => {
                event.stopPropagation();
              }}
            />
            <Button
              type='submit'
              size='sm'
              className='h-6 px-2 text-xs'
              disabled={!renameValue.trim() || renameValue === item.name}
            >
              Save
            </Button>
          </form>
        );
      }

      return (
        <div className='group flex w-full items-start justify-between'>
          <div className='flex min-w-0 flex-col'>
            <span className='text-sm font-medium'>{item.name}</span>
            <span className='text-xs text-muted-foreground'>
              {item.parameterCount} {item.parameterCount === 1 ? 'override' : 'overrides'}
            </span>
          </div>
          <div className='flex gap-1 opacity-0 group-hover:opacity-100'>
            <Button
              variant='ghost'
              size='icon'
              className='size-6 hover:bg-neutral/20!'
              onClick={(event) => {
                event.stopPropagation();
                handleStartRename(item.name);
              }}
            >
              <Pencil className='size-3' />
            </Button>
            <Button
              variant='destructive'
              size='icon-xs'
              aria-label={`Delete ${item.name}`}
              disabled={item.isActive}
              onClick={(event) => {
                event.stopPropagation();
                handleDelete(item.name);
              }}
            >
              <Trash className='size-3' />
            </Button>
          </div>
        </div>
      );
    },
    [
      isCreating,
      createValue,
      renamingGroup,
      renameValue,
      groups,
      handleCommitCreate,
      handleCancelCreate,
      handleCommitRename,
      handleCancelRename,
      handleStartRename,
      handleDelete,
    ],
  );

  const selectedItem = useMemo(() => groupItems.find((item) => item.isActive), [groupItems]);

  return (
    <Tooltip>
      <ComboBoxResponsive
        groupedItems={groupedItems}
        renderLabel={renderLabel}
        getValue={getItemValue}
        value={selectedItem}
        placeholder='Select a parameter group'
        searchPlaceHolder='Search groups…'
        title='Parameter Groups'
        description='Select a parameter group to apply.'
        isSearchEnabled={groupItems.length > 5}
        shouldCloseOnSelect={shouldCloseOnSelect}
        popoverProperties={{
          align: 'end',
          className: 'w-65',
        }}
        onSelect={handleSelect}
      >
        <TooltipTrigger asChild>
          <button
            type='button'
            aria-label='Parameter groups'
            className={nestedActionVariants({
              className:
                'flex h-6 max-w-28 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground duration-150 outline-none focus-visible:focus-outline motion-reduce:transition-none',
            })}
          >
            <span className='truncate'>{activeGroup}</span>
            <ChevronDown className='size-2.5 shrink-0 opacity-60' />
          </button>
        </TooltipTrigger>
      </ComboBoxResponsive>
      <TooltipContent side='top'>Parameter groups</TooltipContent>
    </Tooltip>
  );
}
