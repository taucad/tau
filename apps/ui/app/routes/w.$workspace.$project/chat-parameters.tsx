import {
  XIcon,
  ChevronDown,
  CopyMinus,
  CopyPlus,
  Pencil,
  Trash,
  MoreHorizontal,
  X as CloseIcon,
  Download,
  Box,
  FileCode,
} from 'lucide-react';
import { useCallback, memo, useState, useMemo, useRef, useEffect, useId } from 'react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { PaneviewApi, PaneviewPanelApi } from 'dockview-react';
import { PaneviewReact } from 'dockview-react';
import { hasJsonSchemaObjectProperties } from '@taucad/utils/schema';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import { toast } from '#components/ui/sonner.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@taucad/ui/components/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import { ExportSelector } from '#components/files/export-selector.js';
import {
  FloatingPanel,
  FloatingPanelClose,
  FloatingPanelContent,
  FloatingPanelContentBody,
  FloatingPanelContentHeader,
  FloatingPanelContentHeaderActions,
  FloatingPanelContentTitle,
} from '#components/ui/floating-panel.js';
import { SearchInput } from '#components/search-input.js';
import { Button } from '@taucad/ui/components/button';
import { Input } from '@taucad/ui/components/input';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import {
  PaneviewHeader,
  PaneviewHeaderAction,
  PaneviewHeaderActionGroup,
  PaneviewHeaderControls,
  PaneviewHeaderContentActions,
  paneviewAttachedSurfaceStyleOverrides,
  paneviewHeaderSize,
} from '#components/panes/paneview-header.js';
import { ModifiedIndicator } from '#components/ui/modified-indicator.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
import { useProject, useMainGraphics, useParameterSetActor } from '#hooks/use-project.js';
import { Parameters } from '#components/geometry/parameters/parameters.js';
import type { ParameterCommit, ParameterEdit } from '#components/geometry/parameters/rjsf-context.js';
import type { cadMachine } from '#machines/cad.machine.js';
import type { ParameterManifest } from '@taucad/parameters';
import { getActiveGroupValues } from '@taucad/types';
import type { FileParameterEntry } from '@taucad/types';
import type { ParameterSetService } from '#services/parameter-set-service.js';
import { createDefaultEntry } from '#utils/parameter-config.utils.js';
import { sortGeometryUnitEntries } from '#routes/w.$workspace.$project/geometry-unit.utils.js';
import {
  usePaneviewPersistence,
  getInitialPanelOptions,
} from '#routes/w.$workspace.$project/use-chat-interface-state.js';
import { projectWorkspaceKeyCombinations } from '#routes/w.$workspace.$project/project-workspace-context.js';

const toggleParametersKeyCombination = projectWorkspaceKeyCombinations.parameters;

type ParameterSetActor = NonNullable<ReturnType<ParameterSetService['actor']>>;
type ParameterSetState = ReturnType<ParameterSetActor['getSnapshot']>;
type ParameterGroupBindings = FileParameterEntry['groups'][string]['bindings'];

const currentEntryOf = (state: ParameterSetState | undefined): FileParameterEntry | undefined =>
  state?.context.current?.entry;
const activeGroupOf = (state: ParameterSetState | undefined): string | undefined => currentEntryOf(state)?.activeGroup;
const activeGroupValuesOf = (state: ParameterSetState | undefined): Record<string, unknown> =>
  getActiveGroupValues(currentEntryOf(state));
const activeGroupBindingsOf = (state: ParameterSetState | undefined): ParameterGroupBindings => {
  const entry = currentEntryOf(state);
  return entry === undefined ? undefined : entry.groups[entry.activeGroup]?.bindings;
};

/** The record is re-parsed per snapshot, so bindings need a value comparison to stay identity-stable. */
const shallowEqualBindings = (left: ParameterGroupBindings, right: ParameterGroupBindings): boolean => {
  if (left === right) {
    return true;
  }
  if (left === undefined || right === undefined) {
    return false;
  }
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => JSON.stringify(left[key]) === JSON.stringify(right[key]))
  );
};

const sameManifestRevision = (left: ParameterManifest | undefined, right: ParameterManifest | undefined): boolean =>
  left === right || (left?.revision !== undefined && left.revision === right?.revision);

/**
 * Ensure the entry's authority actor exists and follow it. `resolve` is idempotent; a retired actor
 * (rename rollback, delete and recreate, retried close) leaves the store and is resolved again.
 */
const useResolvedParameterActor = (
  entryPath: string,
  manifest: ParameterManifest | undefined,
): ParameterSetActor | undefined => {
  const { resolveParameterEntry } = useProject();
  const actor = useParameterSetActor(entryPath);
  // Resolve once per actor and manifest revision: a failed load stays on screen with its own retry,
  // so re-rendering with an equal manifest must not reload it again.
  const resolved = useRef<Readonly<{ actor: ParameterSetActor | undefined; revision: string }>>(undefined);
  useEffect(() => {
    if (manifest === undefined) {
      return;
    }
    const previous = resolved.current;
    if (actor !== undefined && previous?.actor === actor && previous.revision === manifest.revision) {
      return;
    }
    if (actor?.getSnapshot().context.current?.manifest.revision !== manifest.revision) {
      resolveParameterEntry(entryPath, manifest);
    }
    resolved.current = { actor, revision: manifest.revision };
  }, [actor, entryPath, manifest, resolveParameterEntry]);
  return actor;
};

const authorityFailureOf = (
  state: ParameterSetState | undefined,
): Readonly<{ code: string; message: string }> | undefined =>
  state?.matches({ open: 'disconnected' }) === true ? state.context.diagnostic : undefined;

const unreadableRecordCodes = new Set(['INVALID_RECORD', 'UNSUPPORTED_RECORD']);

/** A typed load failure with the one recovery that fits it: reset an unreadable record, or retry. */
function ParameterAuthorityFailure({
  entryPath,
  manifest,
  actor,
  failure,
}: {
  readonly entryPath: string;
  readonly manifest: ParameterManifest;
  readonly actor: ParameterSetActor;
  readonly failure: Readonly<{ code: string; message: string }>;
}): React.JSX.Element {
  const { parameterService } = useProject();
  const unreadable = unreadableRecordCodes.has(failure.code);
  return (
    <div role='alert' className='flex flex-col items-start gap-2 p-3 text-sm'>
      <p className='text-destructive'>
        {unreadable ? 'Saved parameter values for this model cannot be read.' : 'Parameters could not be loaded.'}
      </p>
      <p className='text-muted-foreground'>{failure.message}</p>
      <Button
        size='sm'
        variant='outline'
        onClick={async () => {
          if (!unreadable) {
            actor.send({ type: 'resolve', resolution: manifest.identity.resolution });
            return;
          }
          try {
            await parameterService.resetRecord(entryPath);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Parameters could not be reset.');
          }
        }}
      >
        {unreadable ? 'Reset to model defaults' : 'Retry'}
      </Button>
    </div>
  );
}

type ParameterGroupItem = {
  name: string;
  parameterCount: number;
  isActive: boolean;
};

// ---------------------------------------------------------------------------
// Parameter group selector: VS Code branch-selector-style dropdown
// ---------------------------------------------------------------------------

const createNewGroupValue = '__create_new_group__';

type ParameterGroupSelectorItem =
  | ParameterGroupItem
  | { name: typeof createNewGroupValue; parameterCount: 0; isActive: false };

function ParameterGroupSelector({
  filePath,
  manifest,
  groups,
  activeGroup,
}: {
  readonly filePath: string;
  readonly manifest: ParameterManifest | undefined;
  readonly groups: Record<string, { values: Record<string, unknown> }>;
  readonly activeGroup: string;
}): React.JSX.Element {
  const { switchParameterGroup, createParameterGroup, deleteParameterGroup, renameParameterGroup } = useProject();

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
        switchParameterGroup(filePath, manifest, value);
      }
    },
    [switchParameterGroup, filePath, activeGroup, manifest],
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
    createParameterGroup(filePath, manifest, {
      groupName: trimmed,
      values: currentValues,
    });
    switchParameterGroup(filePath, manifest, trimmed);
    setIsCreating(false);
  }, [createValue, groups, activeGroup, filePath, createParameterGroup, switchParameterGroup, manifest]);

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
      renameParameterGroup(filePath, manifest, {
        oldName: renamingGroup,
        newName: trimmed,
      });
    }
    setRenamingGroup(undefined);
  }, [renameValue, renamingGroup, groups, filePath, renameParameterGroup, manifest]);

  const handleCancelRename = useCallback(() => {
    setRenamingGroup(undefined);
  }, []);

  const handleDelete = useCallback(
    (groupName: string) => {
      if (manifest !== undefined) {
        deleteParameterGroup(filePath, manifest, groupName);
      }
    },
    [deleteParameterGroup, filePath, manifest],
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
              variant='ghost'
              size='icon'
              className='size-6 hover:bg-destructive/20!'
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
        searchPlaceHolder='Search groups...'
        title='Parameter Groups'
        description='Select a parameter group to apply.'
        isSearchEnabled={groupItems.length > 5}
        shouldCloseOnSelect={shouldCloseOnSelect}
        popoverProperties={{
          align: 'end',
          className: 'w-[260px]',
        }}
        onSelect={handleSelect}
      >
        <TooltipTrigger asChild>
          <button
            type='button'
            aria-label='Parameter groups'
            className='flex h-6 max-w-28 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors duration-150 motion-reduce:transition-none'
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

// ---------------------------------------------------------------------------
// geometry unit parameters panel body (used in both flat and paneview modes)
// ---------------------------------------------------------------------------

function GeometryUnitParameters({
  entryPath,
  cadRef,
  filterTerm,
  isAllExpanded,
}: {
  readonly entryPath: string;
  readonly cadRef: ActorRefFrom<typeof cadMachine>;
  readonly filterTerm: string;
  readonly isAllExpanded: boolean;
}): React.JSX.Element {
  const { parameterService, setGeometryUnitParameters } = useProject();
  const graphicsActor = useMainGraphics();

  // The kernel republishes an equal manifest after every render; comparing revisions keeps this
  // panel (and every row under it) from re-rendering on that notification.
  const parameterManifest = useSelector(cadRef, (state) => state.context.parameterManifest, sameManifestRevision);
  const defaultParameters = parameterManifest?.defaults ?? {};
  const jsonSchema =
    parameterManifest?.legacyProjection.status === 'usable' ? parameterManifest.legacyProjection.schema : undefined;
  const parameterActor = useResolvedParameterActor(entryPath, parameterManifest);
  const authorityFailure = useSelector(parameterActor, authorityFailureOf);
  const activeGroup = useSelector(parameterActor, activeGroupOf);
  const parameters = useSelector(parameterActor, activeGroupValuesOf);
  const parameterBindings = useSelector(parameterActor, activeGroupBindingsOf, shallowEqualBindings);
  const parameterEditorInstance = useId();
  const parameterCommit = useMemo(
    () =>
      parameterManifest === undefined || activeGroup === undefined
        ? undefined
        : {
            target: parameterService.target(entryPath),
            group: activeGroup,
            editorInstance: parameterEditorInstance,
            input: parameterService.input,
            setValue: async (field: Parameters<ParameterCommit['setValue']>[0]) =>
              parameterService.submitValue(parameterService.target(entryPath), parameterManifest, {
                group: activeGroup,
                ...field,
              }),
          },
    [activeGroup, entryPath, parameterEditorInstance, parameterManifest, parameterService],
  );
  const displaySymbol = useSelector(graphicsActor, (state) => state?.context.displayUnits.length.symbol) ?? 'mm';
  // `units` and `parameterEdit` feed the RJSF form context; rebuilding either per render would
  // re-render every field template on an edit that changed one row.
  const units = useMemo(() => ({ length: { displaySymbol } }) as const, [displaySymbol]);
  const parameterEdit = useMemo<ParameterEdit | undefined>(
    () => (parameterCommit === undefined ? undefined : { kind: 'authoritative', commit: parameterCommit }),
    [parameterCommit],
  );

  const handleParametersChange = useCallback(
    (newParams: Record<string, unknown>) => {
      if (parameterManifest !== undefined) {
        setGeometryUnitParameters(entryPath, parameterManifest, newParams);
      }
    },
    [setGeometryUnitParameters, entryPath, parameterManifest],
  );

  if (parameterManifest !== undefined && parameterActor !== undefined && authorityFailure !== undefined) {
    return (
      <ParameterAuthorityFailure
        entryPath={entryPath}
        manifest={parameterManifest}
        actor={parameterActor}
        failure={authorityFailure}
      />
    );
  }
  if (parameterManifest === undefined || parameterEdit === undefined) {
    return <div className='p-3 text-sm text-muted-foreground'>Loading parameter metadata…</div>;
  }

  return (
    <Parameters
      parameters={parameters}
      defaultParameters={defaultParameters}
      jsonSchema={jsonSchema}
      parameterManifest={parameterManifest}
      parameterBindings={parameterBindings}
      parameterEdit={parameterEdit}
      units={units}
      className='overflow-hidden rounded-b-xl border border-border bg-card [&_[data-slot=parameter-catalog]]:m-0 [&_[data-slot=parameter-catalog]]:rounded-none [&_[data-slot=parameter-catalog]]:border-0 [&_[data-slot=parameter-catalog]]:bg-transparent [&_[data-slot=parameter-catalog]]:p-2'
      enableSearch={false}
      filterTerm={filterTerm}
      isAllExpanded={isAllExpanded}
      onParametersChange={handleParametersChange}
    />
  );
}

// ---------------------------------------------------------------------------
// Paneview panel body
// ---------------------------------------------------------------------------

type ParametersPanelParams = {
  entryPath: string;
  cadRef: ActorRefFrom<typeof cadMachine>;
  filterTerm: string;
  isAllExpanded: boolean;
};

function ParametersGeometryUnitPanel({ params }: { readonly params: ParametersPanelParams }): React.JSX.Element {
  return (
    <GeometryUnitParameters
      entryPath={params.entryPath}
      cadRef={params.cadRef}
      filterTerm={params.filterTerm}
      isAllExpanded={params.isAllExpanded}
    />
  );
}

// ---------------------------------------------------------------------------
// Paneview panel header: file name + set selector
// ---------------------------------------------------------------------------

function ParametersPanelHeader({
  api,
  params,
}: {
  readonly api: PaneviewPanelApi;
  readonly params: ParametersPanelParams;
}): React.JSX.Element {
  const { setGeometryUnitParameters, projectRef, geometryUnits, editorRef } = useProject();
  const parameterManifest = useSelector(
    params.cadRef,
    (state) => state.context.parameterManifest,
    sameManifestRevision,
  );
  const parameterActor = useResolvedParameterActor(params.entryPath, parameterManifest);
  const entry = useSelector(parameterActor, currentEntryOf);
  const displayEntry = entry ?? createDefaultEntry();
  const projectName = useSelector(projectRef, (state) => state.context.project?.name) ?? 'model';

  const showCollapseToggle = Boolean(
    parameterManifest?.legacyProjection.status === 'usable' &&
    hasJsonSchemaObjectProperties(parameterManifest.legacyProjection.schema),
  );

  const hasModifiedParameters = useMemo(() => {
    return Object.keys(getActiveGroupValues(entry)).length > 0;
  }, [entry]);

  const isLastGeometryUnit = geometryUnits.size <= 1;

  const handleReset = useCallback(() => {
    if (parameterManifest !== undefined) {
      setGeometryUnitParameters(params.entryPath, parameterManifest, {});
    }
  }, [setGeometryUnitParameters, params.entryPath, parameterManifest]);

  const handleToggleAllExpanded = useCallback(() => {
    api.updateParameters({ isAllExpanded: !params.isAllExpanded });
  }, [api, params.isAllExpanded]);

  const handleCloseGeometryUnit = useCallback(() => {
    if (isLastGeometryUnit) {
      return;
    }
    projectRef.send({
      type: 'destroyGeometryUnit',
      entryPath: params.entryPath,
    });
  }, [projectRef, params.entryPath, isLastGeometryUnit]);

  const handleOpenInViewer = useCallback(() => {
    projectRef.send({ type: 'openInViewer', entryPath: params.entryPath });
  }, [projectRef, params.entryPath]);

  const handleOpenInEditor = useCallback(() => {
    editorRef.send({
      type: 'openFile',
      path: params.entryPath,
      source: 'user',
    });
  }, [editorRef, params.entryPath]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className='contents'>
          <PaneviewHeader api={api} title={params.entryPath}>
            <PaneviewHeaderControls data-testid='paneview-header-controls'>
              {hasModifiedParameters ? (
                <ModifiedIndicator
                  onReset={handleReset}
                  tooltip='Reset parameters'
                  className='size-6 [.dv-pane:hover_&]:**:data-[slot=dot]:opacity-0 [.dv-pane:hover_&]:**:data-[slot=icon]:opacity-100'
                />
              ) : null}
              <ParameterGroupSelector
                filePath={params.entryPath}
                manifest={parameterManifest}
                groups={displayEntry.groups}
                activeGroup={displayEntry.activeGroup}
              />
              <PaneviewHeaderActionGroup
                data-testid='paneview-header-actions'
                className='opacity-0 transition-opacity duration-150 group-focus-within/paneview-header:opacity-100 group-hover/paneview-header:opacity-100 motion-reduce:transition-none [&:has([data-state=open])]:opacity-100 [@media(hover:none)]:opacity-100'
              >
                <PaneviewHeaderContentActions>
                  {showCollapseToggle ? (
                    <PaneviewHeaderAction
                      aria-expanded={params.isAllExpanded}
                      aria-label={params.isAllExpanded ? 'Collapse all' : 'Expand all'}
                      tooltip={params.isAllExpanded ? 'Collapse all' : 'Expand all'}
                      onClick={handleToggleAllExpanded}
                    >
                      {params.isAllExpanded ? <CopyMinus /> : <CopyPlus />}
                    </PaneviewHeaderAction>
                  ) : null}
                </PaneviewHeaderContentActions>
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <PaneviewHeaderAction aria-label='Compilation unit actions' tooltip='More actions'>
                      <MoreHorizontal />
                    </PaneviewHeaderAction>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align='end' side='bottom'>
                    <DropdownMenuItem onSelect={handleOpenInViewer}>
                      <Box />
                      <span>Open in viewer</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={handleOpenInEditor}>
                      <FileCode />
                      <span>Open in editor</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <Download />
                        <span>Quick export</span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className='p-0'>
                        <ExportSelector
                          cadActor={params.cadRef}
                          filenameBase={projectName}
                          defaultEntryPath={params.entryPath}
                          variant='sub'
                        />
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant='destructive'
                      disabled={isLastGeometryUnit}
                      onSelect={handleCloseGeometryUnit}
                    >
                      <CloseIcon />
                      <span>Close renderer</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </PaneviewHeaderActionGroup>
            </PaneviewHeaderControls>
          </PaneviewHeader>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={handleOpenInViewer}>
          <Box />
          <span>Open in viewer</span>
        </ContextMenuItem>
        <ContextMenuItem onSelect={handleOpenInEditor}>
          <FileCode />
          <span>Open in editor</span>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Download />
            <span>Quick export</span>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className='p-0'>
            <ExportSelector
              cadActor={params.cadRef}
              filenameBase={projectName}
              defaultEntryPath={params.entryPath}
              variant='sub'
            />
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem variant='destructive' disabled={isLastGeometryUnit} onSelect={handleCloseGeometryUnit}>
          <CloseIcon />
          <span>Close renderer</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

const paneviewComponents = { parametersPanel: ParametersGeometryUnitPanel };
const paneviewHeaderComponents = { parametersHeader: ParametersPanelHeader };

// ---------------------------------------------------------------------------
// Multi-geometry unit Paneview layout
// ---------------------------------------------------------------------------

function ParametersPaneview({
  entries,
  mainEntryPath,
  filterTerm,
}: {
  readonly entries: Array<[string, ActorRefFrom<typeof cadMachine>]>;
  readonly mainEntryPath: string;
  readonly filterTerm: string;
}): React.JSX.Element {
  const { savedState, connectApi } = usePaneviewPersistence('parametersPaneview');
  const paneviewApiRef = useRef<PaneviewApi | undefined>(undefined);

  const sortedEntries = useMemo(() => sortGeometryUnitEntries(entries, mainEntryPath), [entries, mainEntryPath]);

  const paneviewKey = useMemo(() => sortedEntries.map(([file]) => file).join('\0'), [sortedEntries]);

  const handleReady = useCallback(
    (event: { api: PaneviewApi }) => {
      paneviewApiRef.current = event.api;
      connectApi(event.api);

      for (const [entryPath, cadRef] of sortedEntries) {
        const isMain = entryPath === mainEntryPath;
        const initial = getInitialPanelOptions(savedState, entryPath, {
          isExpanded: isMain,
          size: isMain ? 200 : undefined,
        });

        event.api.addPanel({
          id: entryPath,
          title: entryPath,
          component: 'parametersPanel',
          headerComponent: 'parametersHeader',
          headerSize: paneviewHeaderSize,
          isExpanded: initial.isExpanded,
          minimumBodySize: 80,
          size: initial.size,
          params: {
            entryPath,
            cadRef,
            filterTerm,
            isAllExpanded: true,
          } satisfies ParametersPanelParams,
        });
      }
    },
    [sortedEntries, mainEntryPath, filterTerm, savedState, connectApi],
  );

  useEffect(() => {
    const api = paneviewApiRef.current;
    if (!api) {
      return;
    }
    for (const panel of api.panels) {
      panel.api.updateParameters({ filterTerm });
    }
  }, [filterTerm]);

  return (
    <PaneviewReact
      key={paneviewKey}
      className={paneviewAttachedSurfaceStyleOverrides}
      components={paneviewComponents}
      headerComponents={paneviewHeaderComponents}
      onReady={handleReady}
    />
  );
}

// ---------------------------------------------------------------------------
// Parameters content: single vs multi geometry unit
// ---------------------------------------------------------------------------

function ParametersContent({ filterTerm }: { readonly filterTerm: string }): React.JSX.Element {
  const { geometryUnits, mainEntryPath } = useProject();
  const entries = useMemo(() => [...geometryUnits.entries()], [geometryUnits]);

  if (entries.length === 0) {
    return <p className='p-4 text-center text-xs text-muted-foreground'>No geometry units.</p>;
  }

  return <ParametersPaneview entries={entries} mainEntryPath={mainEntryPath} filterTerm={filterTerm} />;
}

export function ParametersPanelBody(): React.JSX.Element {
  const [filterTerm, setFilterTerm] = useState('');

  return (
    <div data-slot='parameters-panel-body' className='flex size-full min-h-0 flex-col overflow-hidden bg-sidebar'>
      <div data-slot='parameters-filter' className='shrink-0 bg-sidebar px-2 pt-2'>
        <SearchInput
          aria-label='Filter parameters'
          placeholder='Filter parameters...'
          value={filterTerm}
          className='h-7 min-w-0 bg-background'
          onChange={(event) => {
            setFilterTerm(event.target.value);
          }}
          onClear={() => {
            setFilterTerm('');
          }}
        />
      </div>
      <div className='min-h-0 flex-1 overflow-hidden'>
        <ParametersContent filterTerm={filterTerm} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const ChatParameters = memo(function (props: {
  readonly className?: string;
  readonly isExpanded?: boolean;
  readonly setIsExpanded?: (value: boolean | ((current: boolean) => boolean)) => void;
}) {
  const { className, isExpanded = true, setIsExpanded } = props;

  const toggleParametersOpen = useCallback(() => {
    setIsExpanded?.((current) => !current);
  }, [setIsExpanded]);

  const { formattedKeyCombination: formattedParametersKeyCombination } = useKeybinding(
    toggleParametersKeyCombination,
    toggleParametersOpen,
  );

  return (
    <FloatingPanel isOpen={isExpanded} side='right' className={className} onOpenChange={setIsExpanded}>
      <FloatingPanelContent>
        <FloatingPanelContentHeader>
          <FloatingPanelContentTitle>Parameters</FloatingPanelContentTitle>
          <FloatingPanelContentHeaderActions>
            <FloatingPanelClose
              icon={XIcon}
              tooltipContent={(isOpen) => (
                <div className='flex items-center gap-2'>
                  {isOpen ? 'Close' : 'Open'} Parameters
                  <KeyShortcut variant='tooltip'>{formattedParametersKeyCombination}</KeyShortcut>
                </div>
              )}
            />
          </FloatingPanelContentHeaderActions>
        </FloatingPanelContentHeader>

        <FloatingPanelContentBody className='overflow-y-hidden'>
          <ParametersPanelBody />
        </FloatingPanelContentBody>
      </FloatingPanelContent>
    </FloatingPanel>
  );
});
