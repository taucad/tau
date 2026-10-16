import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Box, CopyMinus, CopyPlus, Download, EllipsisVertical, FileCode, X as CloseIcon } from 'lucide-react';
import { useSelector } from '@xstate/react';
import type { PaneviewApi, PaneviewPanelApi } from 'dockview-react';
import type { ParameterManifest, ParameterSetOutcome } from '@taucad/parameters';
import { fileParameterEntrySchema, getActiveGroupValues } from '@taucad/types';
import type { FileParameterEntry } from '@taucad/types';
import { Button } from '@taucad/ui/components/button';
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
import { ModifiedIndicator } from '@taucad/ui/components/modified-indicator';
import { SearchInput } from '@taucad/ui/components/search-input';
import { cn } from '@taucad/ui/utils/cn';
import { hasJsonSchemaObjectProperties } from '@taucad/utils/schema';
import { Parameters } from '@taucad/viewer/parameters/parameters';
import type { ParameterCommit, ParameterEdit } from '@taucad/viewer/parameters/rjsf-context';
import { useWorkbenchPanesHost } from '#host/workbench-host.jsx';
import type { GraphicsRef, WorkbenchUnit } from '#host/workbench-host.jsx';
import { Paneview } from '#paneview/paneview.jsx';
import {
  PaneviewHeader,
  PaneviewHeaderAction,
  PaneviewHeaderActionGroup,
  PaneviewHeaderContentActions,
  PaneviewHeaderControls,
  paneviewAttachedBodyClassName,
  paneviewAttachedSurfaceStyleOverrides,
  paneviewHeaderSize,
} from '#paneview/paneview-header.jsx';
import { createParameterDraftStore } from '#parameters/parameter-drafts.js';
import { ParameterGroupSelector } from '#parameters/parameter-group-selector.jsx';
import type {
  ParametersDrafts,
  ParametersPaneviewPersistence,
  ParametersSource,
} from '#parameters/parameters-source.js';

type ParameterGroupState = FileParameterEntry['groups'][string] | undefined;

/** What every section of one pane shares: the source, where drafts live, and how failures are shown. */
type ParametersPaneContextValue = Readonly<{
  source: ParametersSource;
  drafts: ParametersDrafts;
  run: (operation: () => Promise<void> | void) => void;
}>;

const ParametersPaneContext = createContext<ParametersPaneContextValue | undefined>(undefined);

const useParametersPane = (): ParametersPaneContextValue => {
  const value = useContext(ParametersPaneContext);
  if (value === undefined) {
    throw new Error('A parameters section rendered outside ParametersPane.');
  }
  return value;
};

/** The empty current record shown for an entry that has none yet. */
const defaultEntry: FileParameterEntry = fileParameterEntrySchema.parse({
  activeGroup: 'default',
  groups: { default: { values: {} } },
});

/* The record is re-parsed per snapshot, so the group needs a value comparison to stay
 * identity-stable. ponytail: only the authored unit claims are compared, because this group reaches
 * the form solely as the unit refinement of each field's binding; values travel their own path. */
const sameGroupClaims = (left: ParameterGroupState, right: ParameterGroupState): boolean =>
  left === right ||
  (JSON.stringify(left?.units) === JSON.stringify(right?.units) &&
    JSON.stringify(left?.sourceUnits) === JSON.stringify(right?.sourceUnits));

/**
 * Hold a group until its unit claims change.
 *
 * @param group - The group in the current record.
 * @returns The group as last held, or `group` once its claims differ.
 */
const useStableGroup = (group: ParameterGroupState): ParameterGroupState => {
  const [held, setHeld] = useState(group);
  if (!sameGroupClaims(held, group)) {
    setHeld(group);
    return group;
  }
  return held;
};

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error || error instanceof DOMException ? error.message : fallback;

const operationError = (outcome: Exclude<ParameterSetOutcome, { status: 'committed' }>): Error =>
  Object.assign(new Error('message' in outcome ? outcome.message : 'Parameter operation did not commit.'), {
    code: 'code' in outcome ? outcome.code : outcome.status,
  });

const noScrub: Pick<ParameterCommit, 'scrub' | 'endScrub'> = {};
const useNoScrub = (): Pick<ParameterCommit, 'scrub' | 'endScrub'> => noScrub;
const useEveryEntry = (): readonly string[] | undefined => undefined;
const noPersistence: ParametersPaneviewPersistence = {
  savedState: {},
  connectApi: () => undefined,
};
const useNoPersistence = (): ParametersPaneviewPersistence => noPersistence;

/**
 * Read the entries the pane lists.
 *
 * @returns The host's units the source has parameters for (main first), the main entry, and its graphics, whose display
 * units every section shares.
 */
const useParameterUnits = (): Readonly<{
  units: readonly WorkbenchUnit[];
  mainEntryPath: string | undefined;
  mainGraphics: GraphicsRef | undefined;
}> => {
  const host = useWorkbenchPanesHost();
  const { source } = useParametersPane();
  const units = host.useUnits();
  const useEntryPaths = source.useEntryPaths ?? useEveryEntry;
  const entryPaths = useEntryPaths();
  return useMemo(
    () => ({
      units: entryPaths === undefined ? units : units.filter(({ entryPath }) => entryPaths.includes(entryPath)),
      mainEntryPath: units[0]?.entryPath,
      mainGraphics: units[0]?.graphicsRef,
    }),
    [entryPaths, units],
  );
};

/** The single invalid-record policy refuses every unreadable record with this one code. */
const unreadableRecordCode = 'INVALID_RECORD';

/**
 * A typed load failure with the one recovery that fits it: reset an unreadable record, or retry.
 *
 * @param props - The entry, its manifest and the failure.
 * @returns The alert.
 */
function ParameterAuthorityFailure({
  entryPath,
  manifest,
  failure,
}: {
  readonly entryPath: string;
  readonly manifest: ParameterManifest | undefined;
  readonly failure: Readonly<{ code: string; message: string }>;
}): React.JSX.Element {
  const { source, run } = useParametersPane();
  const unreadable = failure.code === unreadableRecordCode;
  const { resetRecord, retry } = source;
  const canReset = unreadable && resetRecord !== undefined;
  let action: ReactNode = null;
  if (canReset) {
    action = (
      <Button
        size='sm'
        variant='outline'
        onClick={() => {
          run(async () => {
            try {
              await resetRecord(entryPath);
            } catch (error) {
              throw new Error(errorMessage(error, 'Parameters could not be reset.'), { cause: error });
            }
          });
        }}
      >
        Reset to model defaults
      </Button>
    );
  } else if (retry !== undefined) {
    action = (
      <Button
        size='sm'
        variant='outline'
        onClick={() => {
          retry(entryPath, manifest);
        }}
      >
        Retry
      </Button>
    );
  }
  return (
    <div role='alert' className='flex flex-col items-start gap-2 p-3 text-sm'>
      <p className='text-feature'>
        {unreadable ? 'Saved parameter values for this model cannot be read.' : 'Parameters could not be loaded.'}
      </p>
      <p className='text-muted-foreground'>{failure.message}</p>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One entry's parameters (a section body)
// ---------------------------------------------------------------------------

function EntryParameters({
  entryPath,
  filterTerm,
  isAllExpanded,
}: {
  readonly entryPath: string;
  readonly filterTerm: string;
  readonly isAllExpanded: boolean;
}): React.JSX.Element {
  const { source, drafts, run } = useParametersPane();
  const { mainGraphics } = useParameterUnits();
  const { manifest: parameterManifest, entry, failure } = source.useEntry(entryPath);
  const useScrub = source.useScrub ?? useNoScrub;
  const scrub = useScrub(entryPath);
  const defaultParameters = parameterManifest?.defaults ?? {};
  const jsonSchema =
    parameterManifest?.legacyProjection.status === 'usable' ? parameterManifest.legacyProjection.schema : undefined;
  const activeGroup = entry?.activeGroup;
  const parameters = useMemo(() => getActiveGroupValues(entry), [entry]);
  const parameterGroup = useStableGroup(entry === undefined ? undefined : entry.groups[entry.activeGroup]);
  const { commitValue, target } = source;
  const parameterCommit = useMemo((): ParameterCommit | undefined => {
    if (parameterManifest === undefined || activeGroup === undefined) {
      return undefined;
    }
    const commit = async (field: Parameters<ParameterCommit['commit']>[0]): Promise<ParameterSetOutcome> =>
      commitValue(entryPath, parameterManifest, { group: activeGroup, ...field });
    return {
      target: target?.(entryPath) ?? { authority: 'workbench-panes', root: '', entry: entryPath },
      group: activeGroup,
      draft: (pointer: string) => drafts.draft({ entryPath, group: activeGroup, pointer }),
      setDraft: (pointer, draft) => {
        drafts.setDraft({ entryPath, group: activeGroup, pointer }, draft);
      },
      subscribeDrafts: drafts.subscribe,
      commit,
      setValue: async (field) => {
        const outcome = await commit(field);
        if (outcome.status !== 'committed') {
          throw operationError(outcome);
        }
      },
      ...scrub,
    };
  }, [activeGroup, commitValue, drafts, entryPath, parameterManifest, scrub, target]);
  const displaySymbol = useSelector(mainGraphics, (state) => state?.context.displayUnits.length.symbol) ?? 'mm';
  // `units` and `parameterEdit` feed the RJSF form context; rebuilding either per render would
  // re-render every field template on an edit that changed one row.
  const units = useMemo(() => ({ length: { displaySymbol } }) as const, [displaySymbol]);
  const parameterEdit = useMemo<ParameterEdit | undefined>(
    () => (parameterCommit === undefined ? undefined : { kind: 'authoritative', commit: parameterCommit }),
    [parameterCommit],
  );

  const { replaceValues } = source;
  const handleParametersChange = useCallback(
    (newParams: Record<string, unknown>) => {
      if (parameterManifest !== undefined) {
        run(async () => replaceValues(entryPath, parameterManifest, newParams));
      }
    },
    [replaceValues, run, entryPath, parameterManifest],
  );

  if (failure !== undefined) {
    return (
      <div className={cn(paneviewAttachedBodyClassName, 'max-h-full overflow-y-auto')}>
        <ParameterAuthorityFailure entryPath={entryPath} manifest={parameterManifest} failure={failure} />
      </div>
    );
  }
  if (parameterManifest === undefined || parameterEdit === undefined) {
    return (
      <div className={cn(paneviewAttachedBodyClassName, 'p-3 text-sm text-muted-foreground')}>
        Loading parameter metadata…
      </div>
    );
  }

  return (
    <Parameters
      parameters={parameters}
      defaultParameters={defaultParameters}
      jsonSchema={jsonSchema}
      parameterManifest={parameterManifest}
      parameterGroup={parameterGroup}
      parameterEdit={parameterEdit}
      units={units}
      className={cn(
        paneviewAttachedBodyClassName,
        '[&_[data-slot=parameter-catalog]]:m-0 [&_[data-slot=parameter-catalog]]:rounded-none [&_[data-slot=parameter-catalog]]:border-0 [&_[data-slot=parameter-catalog]]:bg-transparent [&_[data-slot=parameter-catalog]]:p-2',
      )}
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
  filterTerm: string;
  isAllExpanded: boolean;
};

function ParametersEntryPanel({ params }: { readonly params: ParametersPanelParams }): React.JSX.Element {
  return (
    <EntryParameters entryPath={params.entryPath} filterTerm={params.filterTerm} isAllExpanded={params.isAllExpanded} />
  );
}

// ---------------------------------------------------------------------------
// Paneview panel header: file name, modified mark, group selector and entry actions
// ---------------------------------------------------------------------------

type EntryMenuItems = Readonly<{
  onOpenInViewer: (() => void) | undefined;
  onOpenInEditor: (() => void) | undefined;
  quickExport: ReactNode;
  onClose: (() => void) | undefined;
  isCloseDisabled: boolean;
}>;

/**
 * List the entry menu's groups in order.
 *
 * @param items - The actions the source offers.
 * @returns The groups to draw; a group the source cannot fill is left out with its separator.
 */
const entryMenuGroups = (items: EntryMenuItems): ReadonlyArray<'open' | 'export' | 'close'> => [
  ...(items.onOpenInViewer === undefined && items.onOpenInEditor === undefined ? [] : (['open'] as const)),
  ...(items.quickExport === null ? [] : (['export'] as const)),
  ...(items.onClose === undefined ? [] : (['close'] as const)),
];

function EntryDropdownMenuItems({ items }: { readonly items: EntryMenuItems }): ReactNode {
  return entryMenuGroups(items).map((group, index) => (
    <EntryMenuGroup key={group} separator={index > 0 ? <DropdownMenuSeparator /> : null}>
      {group === 'open' ? (
        <>
          {items.onOpenInViewer === undefined ? null : (
            <DropdownMenuItem onSelect={items.onOpenInViewer}>
              <Box />
              <span>Open in viewer</span>
            </DropdownMenuItem>
          )}
          {items.onOpenInEditor === undefined ? null : (
            <DropdownMenuItem onSelect={items.onOpenInEditor}>
              <FileCode />
              <span>Open in editor</span>
            </DropdownMenuItem>
          )}
        </>
      ) : null}
      {group === 'export' ? (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Download />
            <span>Quick export</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className='p-0'>{items.quickExport}</DropdownMenuSubContent>
        </DropdownMenuSub>
      ) : null}
      {group === 'close' ? (
        <DropdownMenuItem variant='destructive' disabled={items.isCloseDisabled} onSelect={items.onClose}>
          <CloseIcon />
          <span>Close renderer</span>
        </DropdownMenuItem>
      ) : null}
    </EntryMenuGroup>
  ));
}

function EntryContextMenuItems({ items }: { readonly items: EntryMenuItems }): ReactNode {
  return entryMenuGroups(items).map((group, index) => (
    <EntryMenuGroup key={group} separator={index > 0 ? <ContextMenuSeparator /> : null}>
      {group === 'open' ? (
        <>
          {items.onOpenInViewer === undefined ? null : (
            <ContextMenuItem onSelect={items.onOpenInViewer}>
              <Box />
              <span>Open in viewer</span>
            </ContextMenuItem>
          )}
          {items.onOpenInEditor === undefined ? null : (
            <ContextMenuItem onSelect={items.onOpenInEditor}>
              <FileCode />
              <span>Open in editor</span>
            </ContextMenuItem>
          )}
        </>
      ) : null}
      {group === 'export' ? (
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Download />
            <span>Quick export</span>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className='p-0'>{items.quickExport}</ContextMenuSubContent>
        </ContextMenuSub>
      ) : null}
      {group === 'close' ? (
        <ContextMenuItem variant='destructive' disabled={items.isCloseDisabled} onSelect={items.onClose}>
          <CloseIcon />
          <span>Close renderer</span>
        </ContextMenuItem>
      ) : null}
    </EntryMenuGroup>
  ));
}

function EntryMenuGroup({
  separator,
  children,
}: {
  readonly separator: ReactNode;
  readonly children: ReactNode;
}): React.JSX.Element {
  return (
    <>
      {separator}
      {children}
    </>
  );
}

function ParametersPanelHeader({
  api,
  params,
}: {
  readonly api: PaneviewPanelApi;
  readonly params: ParametersPanelParams;
}): React.JSX.Element {
  const { source, run } = useParametersPane();
  const { units } = useParameterUnits();
  const { manifest: parameterManifest, entry } = source.useEntry(params.entryPath);
  const displayEntry = entry ?? defaultEntry;
  const { entryPath } = params;

  const showCollapseToggle = Boolean(
    parameterManifest?.legacyProjection.status === 'usable' &&
    hasJsonSchemaObjectProperties(parameterManifest.legacyProjection.schema),
  );

  const hasModifiedParameters = useMemo(() => {
    return Object.keys(getActiveGroupValues(entry)).length > 0;
  }, [entry]);

  const isLastEntry = units.length <= 1;

  const { replaceValues, openInViewer, openInEditor, closeEntry, QuickExport, groups } = source;
  const handleReset = useCallback(() => {
    if (parameterManifest !== undefined) {
      run(async () => replaceValues(entryPath, parameterManifest, {}));
    }
  }, [replaceValues, run, entryPath, parameterManifest]);

  const handleToggleAllExpanded = useCallback(() => {
    api.updateParameters({ isAllExpanded: !params.isAllExpanded });
  }, [api, params.isAllExpanded]);

  const items = useMemo(
    (): EntryMenuItems => ({
      onOpenInViewer:
        openInViewer === undefined
          ? undefined
          : () => {
              openInViewer(entryPath);
            },
      onOpenInEditor:
        openInEditor === undefined
          ? undefined
          : () => {
              openInEditor(entryPath);
            },
      quickExport: QuickExport === undefined ? null : <QuickExport entryPath={entryPath} />,
      onClose:
        closeEntry === undefined
          ? undefined
          : () => {
              if (!isLastEntry) {
                closeEntry(entryPath);
              }
            },
      isCloseDisabled: isLastEntry,
    }),
    [QuickExport, closeEntry, entryPath, isLastEntry, openInEditor, openInViewer],
  );
  const hasMenu = entryMenuGroups(items).length > 0;

  const header = (
    <PaneviewHeader api={api} title={entryPath}>
      {hasModifiedParameters ? (
        /* Status sits beside the file name, as a parameter's mark sits beside its label. */
        <PaneviewHeaderControls className='ml-0'>
          <ModifiedIndicator
            tooltip='Reset parameters'
            className='size-6 group-hover/paneview-header:**:data-[slot=dot]:opacity-0 group-hover/paneview-header:**:data-[slot=icon]:opacity-100'
            onReset={handleReset}
          />
        </PaneviewHeaderControls>
      ) : null}
      <PaneviewHeaderControls data-testid='paneview-header-controls'>
        <PaneviewHeaderActionGroup
          data-testid='paneview-header-actions'
          className='opacity-0 transition-opacity duration-150 group-focus-within/paneview-header:opacity-100 group-hover/paneview-header:opacity-100 motion-reduce:transition-none [&:has([data-state=open])]:opacity-100 [@media(hover:none)]:opacity-100'
        >
          {/* Choosing a group is an action, not status: it is revealed with the others. */}
          {groups === undefined ? null : (
            <ParameterGroupSelector
              filePath={entryPath}
              manifest={parameterManifest}
              groups={displayEntry.groups}
              activeGroup={displayEntry.activeGroup}
              operations={groups}
              run={run}
            />
          )}
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
          {hasMenu ? (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <PaneviewHeaderAction aria-label='Compilation unit actions' tooltip='More actions'>
                  <EllipsisVertical />
                </PaneviewHeaderAction>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end' side='bottom'>
                <EntryDropdownMenuItems items={items} />
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </PaneviewHeaderActionGroup>
      </PaneviewHeaderControls>
    </PaneviewHeader>
  );

  if (!hasMenu) {
    return header;
  }
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className='contents'>{header}</div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <EntryContextMenuItems items={items} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

const paneviewComponents = { parametersPanel: ParametersEntryPanel };
const paneviewHeaderComponents = { parametersHeader: ParametersPanelHeader };

// ---------------------------------------------------------------------------
// One Paneview section per entry
// ---------------------------------------------------------------------------

function ParametersPaneview({
  units,
  mainEntryPath,
  filterTerm,
}: {
  readonly units: readonly WorkbenchUnit[];
  readonly mainEntryPath: string | undefined;
  readonly filterTerm: string;
}): React.JSX.Element {
  const { source } = useParametersPane();
  const usePersistence = source.usePaneviewPersistence ?? useNoPersistence;
  const { savedState, connectApi } = usePersistence();
  const paneviewApiRef = useRef<PaneviewApi | undefined>(undefined);

  const paneviewKey = useMemo(() => units.map(({ entryPath }) => entryPath).join('\0'), [units]);

  const handleReady = useCallback(
    (event: { api: PaneviewApi }) => {
      paneviewApiRef.current = event.api;
      connectApi(event.api);

      for (const { entryPath } of units) {
        const isMain = entryPath === mainEntryPath;
        const initial = savedState[entryPath] ?? { isExpanded: isMain, size: isMain ? 200 : undefined };

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
            filterTerm,
            isAllExpanded: true,
          } satisfies ParametersPanelParams,
        });
      }
    },
    [units, mainEntryPath, filterTerm, savedState, connectApi],
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
    <Paneview
      key={paneviewKey}
      className={paneviewAttachedSurfaceStyleOverrides}
      components={paneviewComponents}
      headerComponents={paneviewHeaderComponents}
      onReady={handleReady}
    />
  );
}

function ParametersContent({ filterTerm }: { readonly filterTerm: string }): React.JSX.Element {
  const { units, mainEntryPath } = useParameterUnits();

  if (units.length === 0) {
    return <p className='p-4 text-center text-xs text-muted-foreground'>No geometry units.</p>;
  }

  return <ParametersPaneview units={units} mainEntryPath={mainEntryPath} filterTerm={filterTerm} />;
}

/**
 * The Parameters pane body, drawn from the host's units and its {@link ParametersSource}: a filter over every entry and
 * one section per entry with its file name, modified mark, group selector, expand/collapse all and entry menu.
 *
 * @returns The pane, or nothing when the host offers no parameters source.
 * @public
 */
export function ParametersPane(): React.JSX.Element | undefined {
  const { parameters: source } = useWorkbenchPanesHost();
  const [filterTerm, setFilterTerm] = useState('');
  const [operationError, setOperationError] = useState<string | undefined>(undefined);
  const [localDrafts] = useState(createParameterDraftStore);
  const reportError = source?.reportError ?? setOperationError;
  const run = useCallback(
    (operation: () => Promise<void> | void): void => {
      const settle = async (): Promise<void> => {
        try {
          await operation();
        } catch (error) {
          reportError(errorMessage(error, 'Parameter operation failed.'));
        }
      };
      if (source?.reportError === undefined) {
        setOperationError(undefined);
      }
      // async-iife: bootstrap -- UI event callbacks cannot return the operation promise.
      void settle();
    },
    [reportError, source?.reportError],
  );
  const context = useMemo(
    () => (source === undefined ? undefined : { source, drafts: source.drafts ?? localDrafts, run }),
    [localDrafts, run, source],
  );

  if (context === undefined) {
    return undefined;
  }

  return (
    <ParametersPaneContext.Provider value={context}>
      <div data-slot='parameters-panel-body' className='flex size-full min-h-0 flex-col overflow-hidden bg-sidebar'>
        <div data-slot='parameters-filter' className='shrink-0 bg-sidebar px-2 pt-2'>
          <SearchInput
            aria-label='Filter parameters'
            placeholder='Filter parameters…'
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
        {operationError === undefined ? null : (
          <p role='alert' className='shrink-0 px-3 pt-2 text-xs text-destructive'>
            {operationError}
          </p>
        )}
        <div className='min-h-0 flex-1 overflow-hidden'>
          <ParametersContent filterTerm={filterTerm} />
        </div>
      </div>
    </ParametersPaneContext.Provider>
  );
}
