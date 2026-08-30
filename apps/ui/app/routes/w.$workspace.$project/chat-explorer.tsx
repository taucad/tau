import { XIcon, Box, Eye, EyeOff, Target } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { PaneviewApi, PaneviewPanelApi } from 'dockview-react';
import { PaneviewReact } from 'dockview-react';
import type { GeometryComponentManifest, GeometryComponentNode } from '@taucad/types';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import { CollectionEmptyState } from '#components/ui/collection-empty-state.js';
import { SearchInput } from '#components/search-input.js';
import { HighlightText } from '#components/highlight-text.js';
import {
  FloatingPanel,
  FloatingPanelClose,
  FloatingPanelContent,
  FloatingPanelContentHeader,
  FloatingPanelContentHeaderActions,
  FloatingPanelContentTitle,
  FloatingPanelContentBody,
} from '#components/ui/floating-panel.js';
import { ContextMenu, ContextMenuTrigger } from '#components/ui/context-menu.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import {
  ModelComponentActionContextContent,
  ModelComponentActionDropdown,
} from '#components/geometry/cad/model-component-action-menu.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
import { useProject } from '#hooks/use-project.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import { deriveModelInteractionUnitId, getModelInteractionUnitState } from '#machines/model-interaction.machine.js';
import type { modelInteractionMachine } from '#machines/model-interaction.machine.js';
import { cn } from '#utils/ui.utils.js';
import { sortGeometryUnitEntries } from '#routes/w.$workspace.$project/geometry-unit.utils.js';
import {
  PaneviewHeader,
  PaneviewHeaderAction,
  PaneviewHeaderControls,
  paneviewAttachedSurfaceStyleOverrides,
  paneviewHeaderSize,
} from '#components/panes/paneview-header.js';
import {
  getInitialPanelOptions,
  usePaneviewPersistence,
} from '#routes/w.$workspace.$project/use-chat-interface-state.js';
import { projectWorkspaceKeyCombinations } from '#routes/w.$workspace.$project/project-workspace-context.js';

const keyCombinationEditor = projectWorkspaceKeyCombinations.model;

type GraphicsActorRef = ActorRefFrom<typeof graphicsMachine>;
type ModelInteractionRef = ActorRefFrom<typeof modelInteractionMachine>;

type ModelComponentRevealTarget = {
  readonly entryPath: string;
  readonly unitId: string;
  readonly componentId: string;
  readonly requestId: number;
};

export function getComponentRowPaddingLeft({
  depth,
  rootDepth,
}: {
  readonly depth: number;
  readonly rootDepth: number;
}): number {
  return 8 + Math.max(0, depth - rootDepth - 1) * 12;
}

function getVisibilityAction({
  isHidden,
  nodeName,
  unitId,
  componentId,
}: {
  readonly isHidden: boolean;
  readonly nodeName: string;
  readonly unitId: string;
  readonly componentId: string;
}) {
  if (isHidden) {
    return {
      Icon: EyeOff,
      ariaLabel: `Show ${nodeName}`,
      event: { type: 'showModelComponent', unitId, componentId, source: 'explorer' } as const,
      tooltip: 'Show part',
    };
  }

  return {
    Icon: Eye,
    ariaLabel: `Hide ${nodeName}`,
    event: { type: 'hideModelComponent', unitId, componentId, source: 'explorer' } as const,
    tooltip: 'Hide part',
  };
}

function getIsolationAction({
  isIsolated,
  nodeName,
  unitId,
  componentId,
}: {
  readonly isIsolated: boolean;
  readonly nodeName: string;
  readonly unitId: string;
  readonly componentId: string;
}) {
  if (isIsolated) {
    return {
      ariaLabel: `Remove isolation for ${nodeName}`,
      className: 'bg-muted-foreground/15 text-foreground',
      event: { type: 'clearModelComponentIsolation', unitId, source: 'explorer' } as const,
      pressed: true,
      tooltip: 'Remove isolation',
    };
  }

  return {
    ariaLabel: `Isolate ${nodeName}`,
    className: undefined,
    event: { type: 'isolateModelComponent', unitId, componentId, source: 'explorer' } as const,
    pressed: false,
    tooltip: 'Isolate part',
  };
}

export function ModelPanelBody({ onRequestOpen }: { readonly onRequestOpen?: () => void }): React.JSX.Element {
  const project = useProject({ enableNoContext: true });
  const [query, setQuery] = useState('');
  const [revealTarget, setRevealTarget] = useState<ModelComponentRevealTarget>();
  useEffect(() => {
    if (!project) {
      return undefined;
    }
    const subscription = project.editorRef.on('modelComponentRevealRequested', (event) => {
      onRequestOpen?.();
      setQuery('');
      setRevealTarget((current) => ({
        entryPath: event.entryPath,
        unitId: event.unitId,
        componentId: event.componentId,
        requestId: (current?.requestId ?? 0) + 1,
      }));
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [onRequestOpen, project]);

  return (
    <div data-slot='model-panel-body' className='flex size-full min-h-0 flex-col overflow-hidden bg-sidebar text-sm'>
      <div data-slot='model-filter' className='shrink-0 bg-sidebar px-2 pt-2'>
        <SearchInput
          aria-label='Filter parts'
          placeholder='Filter parts...'
          value={query}
          className='h-7 min-w-0 bg-background'
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          onClear={() => {
            setQuery('');
          }}
        />
      </div>
      <div className='min-h-0 flex-1 overflow-hidden'>
        {project ? (
          <ChatGeometryExplorerContent project={project} query={query} revealTarget={revealTarget} />
        ) : (
          <ExplorerEmptyState />
        )}
      </div>
    </div>
  );
}

export function ChatExplorerTree({
  className,
  isExpanded = true,
  setIsExpanded,
}: {
  readonly className?: string;
  readonly isExpanded?: boolean;
  readonly setIsExpanded?: (value: boolean | ((current: boolean) => boolean)) => void;
}): React.JSX.Element {
  const toggleEditor = (): void => {
    setIsExpanded?.((current) => !current);
  };
  const { formattedKeyCombination: formattedEditorKeyCombination } = useKeybinding(keyCombinationEditor, toggleEditor);
  return (
    <FloatingPanel isOpen={isExpanded} side='right' className={className} onOpenChange={setIsExpanded}>
      <FloatingPanelContent className='text-sm'>
        <FloatingPanelContentHeader>
          <FloatingPanelContentTitle>Model</FloatingPanelContentTitle>
          <FloatingPanelContentHeaderActions>
            <FloatingPanelClose
              icon={XIcon}
              tooltipContent={(isOpen) => (
                <div className='flex items-center gap-2'>
                  {isOpen ? 'Close' : 'Open'} Model
                  <KeyShortcut variant='tooltip'>{formattedEditorKeyCombination}</KeyShortcut>
                </div>
              )}
            />
          </FloatingPanelContentHeaderActions>
        </FloatingPanelContentHeader>
        <FloatingPanelContentBody className='p-0'>
          <ModelPanelBody
            onRequestOpen={() => {
              setIsExpanded?.(true);
            }}
          />
        </FloatingPanelContentBody>
      </FloatingPanelContent>
    </FloatingPanel>
  );
}

function ChatGeometryExplorerContent({
  project,
  query,
  revealTarget,
}: {
  readonly project: NonNullable<ReturnType<typeof useProject>>;
  readonly query: string;
  readonly revealTarget: ModelComponentRevealTarget | undefined;
}): React.JSX.Element {
  const viewSettings = useSelector(project.editorRef, (state) => state.context.viewSettings);
  const resolveGraphicsForFile = useCallback(
    (entryPath: string): GraphicsActorRef | undefined => {
      for (const [viewId, graphicsRef] of project.viewGraphics) {
        if (viewSettings[viewId]?.entryPath === entryPath) {
          return graphicsRef;
        }
      }
      return undefined;
    },
    [project.viewGraphics, viewSettings],
  );
  const entries = useMemo(
    () =>
      sortGeometryUnitEntries([...project.geometryUnits.entries()], project.mainEntryPath).map(
        ([entryPath]): [string, GraphicsActorRef | undefined] => [entryPath, resolveGraphicsForFile(entryPath)],
      ),
    [project.geometryUnits, project.mainEntryPath, resolveGraphicsForFile],
  );

  if (entries.length === 0) {
    return <ExplorerEmptyState />;
  }

  return <ModelPaneview entries={entries} query={query} revealTarget={revealTarget} />;
}

type ModelPaneviewPanelParams = {
  entryPath: string;
  graphicsRef?: GraphicsActorRef;
  query: string;
  revealTarget?: ModelComponentRevealTarget;
};

function ModelPaneview({
  entries,
  query,
  revealTarget,
}: {
  readonly entries: Array<[string, GraphicsActorRef | undefined]>;
  readonly query: string;
  readonly revealTarget: ModelComponentRevealTarget | undefined;
}): React.JSX.Element {
  const { savedState, connectApi } = usePaneviewPersistence('modelPaneview');
  const paneviewApiRef = useRef<PaneviewApi | undefined>(undefined);
  const paneviewKey = useMemo(() => entries.map(([entryPath]) => entryPath).join('\0'), [entries]);

  const handleReady = useCallback(
    ({ api }: { api: PaneviewApi }) => {
      paneviewApiRef.current = api;
      connectApi(api);

      for (const [entryPath, graphicsRef] of entries) {
        const initial = getInitialPanelOptions(savedState, entryPath, { isExpanded: true, size: 200 });
        api.addPanel({
          id: entryPath,
          title: entryPath,
          component: 'modelPanel',
          headerComponent: 'modelHeader',
          headerSize: paneviewHeaderSize,
          isExpanded: initial.isExpanded,
          minimumBodySize: 80,
          size: initial.size,
          params: { entryPath, graphicsRef, query, revealTarget } satisfies ModelPaneviewPanelParams,
        });
      }
    },
    [connectApi, entries, query, revealTarget, savedState],
  );

  useEffect(() => {
    const api = paneviewApiRef.current;
    if (!api) {
      return;
    }

    for (const [entryPath, graphicsRef] of entries) {
      api.getPanel(entryPath)?.api.updateParameters({
        entryPath,
        graphicsRef,
        query,
        revealTarget: revealTarget?.entryPath === entryPath ? revealTarget : undefined,
      });
    }
  }, [entries, query, revealTarget]);

  useEffect(() => {
    if (!revealTarget) {
      return;
    }
    paneviewApiRef.current?.getPanel(revealTarget.entryPath)?.api.setExpanded(true);
  }, [revealTarget]);

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

function ModelPaneviewPanel({ params }: { readonly params: ModelPaneviewPanelParams }): React.JSX.Element {
  if (!params.graphicsRef) {
    return <ModelPaneviewPanelSurface />;
  }

  return <LiveModelPaneviewPanel params={params} graphicsRef={params.graphicsRef} />;
}

function LiveModelPaneviewPanel({
  params,
  graphicsRef,
}: {
  readonly params: ModelPaneviewPanelParams;
  readonly graphicsRef: GraphicsActorRef;
}): React.JSX.Element {
  const modelRef = useSelector(
    graphicsRef,
    (state) => state.context.modelInteractionRef as ModelInteractionRef | undefined,
  );

  if (!modelRef) {
    return <ModelPaneviewPanelSurface />;
  }

  return <LiveComponentTree params={params} graphicsRef={graphicsRef} modelRef={modelRef} />;
}

function LiveComponentTree({
  params,
  graphicsRef,
  modelRef,
}: {
  readonly params: ModelPaneviewPanelParams;
  readonly graphicsRef: GraphicsActorRef;
  readonly modelRef: ModelInteractionRef;
}): React.JSX.Element {
  const contentRef = useRef<HTMLDivElement>(null);
  const unitId = deriveModelInteractionUnitId({ sourceFile: params.entryPath });
  const unitState = useSelector(modelRef, (state) => getModelInteractionUnitState(state.context, unitId));
  const {
    manifest,
    hoveredComponentId,
    selectedComponentIds,
    hiddenComponentIds,
    isolatedComponentIds,
    focusedComponentId,
    opacityByComponentId,
  } = unitState;
  const root = manifest ? manifest.nodesById[manifest.rootId] : undefined;
  const childCount = root?.childIds.length ?? 0;
  const normalizedQuery = params.query.trim().toLowerCase();
  const matchingChildCount = manifest && root ? countMatchingChildren({ manifest, node: root, normalizedQuery }) : 0;

  useEffect(() => {
    if (!params.revealTarget || params.revealTarget.unitId !== unitId) {
      return;
    }
    const row = [...(contentRef.current?.querySelectorAll<HTMLElement>('[data-model-component-row]') ?? [])].find(
      (candidate) => candidate.dataset['modelComponentId'] === params.revealTarget?.componentId,
    );
    row?.scrollIntoView({ block: 'center' });
  }, [params.query, params.revealTarget, unitId]);

  if (!manifest || !root || childCount === 0) {
    return <ModelPaneviewPanelSurface />;
  }

  return (
    <ModelPaneviewPanelSurface contentRef={contentRef}>
      {normalizedQuery && matchingChildCount === 0 ? (
        <ExplorerNoMatchesState />
      ) : (
        <ComponentRows
          ariaLabel={`Model components for ${params.entryPath}`}
          manifest={manifest}
          node={root}
          query={params.query}
          normalizedQuery={normalizedQuery}
          graphicsRef={graphicsRef}
          unitId={unitId}
          hoveredComponentId={hoveredComponentId}
          selectedComponentIds={selectedComponentIds}
          hiddenComponentIds={hiddenComponentIds}
          isolatedComponentIds={isolatedComponentIds}
          focusedComponentId={focusedComponentId}
          opacityByComponentId={opacityByComponentId}
          rootDepth={root.depth}
        />
      )}
    </ModelPaneviewPanelSurface>
  );
}

function ModelPaneviewPanelSurface({
  contentRef,
  children,
}: {
  readonly contentRef?: React.Ref<HTMLDivElement>;
  readonly children?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div data-slot='model-unit-surface' className='h-full overflow-hidden rounded-b-xl border border-border bg-card'>
      <div
        ref={contentRef}
        data-slot='model-unit-scroller'
        className='size-full scroll-shadows-y overflow-y-auto p-2 [--scroll-fade-end:transparent] [--scroll-fade-size:28px]'
      >
        {children ?? <ExplorerUnavailableState />}
      </div>
    </div>
  );
}

function ModelPaneviewHeader({
  api,
  params,
}: {
  readonly api: PaneviewPanelApi;
  readonly params: ModelPaneviewPanelParams;
}): React.JSX.Element {
  if (!params.graphicsRef) {
    return <ModelPaneviewHeaderSurface api={api} entryPath={params.entryPath} />;
  }

  return <LiveModelPaneviewHeader api={api} entryPath={params.entryPath} graphicsRef={params.graphicsRef} />;
}

function LiveModelPaneviewHeader({
  api,
  entryPath,
  graphicsRef,
}: {
  readonly api: PaneviewPanelApi;
  readonly entryPath: string;
  readonly graphicsRef: GraphicsActorRef;
}): React.JSX.Element {
  const modelRef = useSelector(
    graphicsRef,
    (state) => state.context.modelInteractionRef as ModelInteractionRef | undefined,
  );

  if (!modelRef) {
    return <ModelPaneviewHeaderSurface api={api} entryPath={entryPath} />;
  }

  return <LiveModelPaneviewHeaderState api={api} entryPath={entryPath} graphicsRef={graphicsRef} modelRef={modelRef} />;
}

function LiveModelPaneviewHeaderState({
  api,
  entryPath,
  graphicsRef,
  modelRef,
}: {
  readonly api: PaneviewPanelApi;
  readonly entryPath: string;
  readonly graphicsRef: GraphicsActorRef;
  readonly modelRef: ModelInteractionRef;
}): React.JSX.Element {
  const unitId = deriveModelInteractionUnitId({ sourceFile: entryPath });
  const unitState = useSelector(modelRef, (state) => getModelInteractionUnitState(state.context, unitId));
  const root = unitState.manifest?.nodesById[unitState.manifest.rootId];

  return (
    <ModelPaneviewHeaderSurface
      api={api}
      entryPath={entryPath}
      count={root?.childIds.length ?? 0}
      hiddenComponentCount={unitState.hiddenComponentIds.length}
      onShowHiddenComponents={() => {
        graphicsRef.send({ type: 'showHiddenModelComponents', unitId, source: 'explorer' });
      }}
    />
  );
}

function ModelPaneviewHeaderSurface({
  api,
  entryPath,
  count = 0,
  hiddenComponentCount = 0,
  onShowHiddenComponents,
}: {
  readonly api: PaneviewPanelApi;
  readonly entryPath: string;
  readonly count?: number;
  readonly hiddenComponentCount?: number;
  readonly onShowHiddenComponents?: () => void;
}): React.JSX.Element {
  return (
    <PaneviewHeader api={api} title={entryPath}>
      <PaneviewHeaderControls>
        <span className='shrink-0 text-xs text-muted-foreground/60'>({count})</span>
        {hiddenComponentCount > 0 ? (
          <PaneviewHeaderAction
            aria-label={`Show hidden components in ${entryPath}`}
            tooltip='Show hidden components'
            onClick={onShowHiddenComponents}
          >
            <Eye />
          </PaneviewHeaderAction>
        ) : undefined}
      </PaneviewHeaderControls>
    </PaneviewHeader>
  );
}

const paneviewComponents = { modelPanel: ModelPaneviewPanel };
const paneviewHeaderComponents = { modelHeader: ModelPaneviewHeader };

function componentMatchesQuery({
  manifest,
  node,
  normalizedQuery,
}: {
  readonly manifest: GeometryComponentManifest;
  readonly node: GeometryComponentNode;
  readonly normalizedQuery: string;
}): boolean {
  if (!normalizedQuery) {
    return true;
  }
  if (node.name.toLowerCase().includes(normalizedQuery)) {
    return true;
  }
  return node.childIds.some((childId) => {
    const child = manifest.nodesById[childId];
    return child ? componentMatchesQuery({ manifest, node: child, normalizedQuery }) : false;
  });
}

function countMatchingChildren({
  manifest,
  node,
  normalizedQuery,
}: {
  readonly manifest: GeometryComponentManifest;
  readonly node: GeometryComponentNode;
  readonly normalizedQuery: string;
}): number {
  return node.childIds.filter((childId) => {
    const child = manifest.nodesById[childId];
    return child ? componentMatchesQuery({ manifest, node: child, normalizedQuery }) : false;
  }).length;
}

function ComponentRows({
  ariaLabel,
  manifest,
  node,
  query,
  normalizedQuery,
  graphicsRef,
  unitId,
  hoveredComponentId,
  selectedComponentIds,
  hiddenComponentIds,
  isolatedComponentIds,
  focusedComponentId,
  opacityByComponentId,
  rootDepth,
}: {
  readonly ariaLabel?: string;
  readonly manifest: GeometryComponentManifest;
  readonly node: GeometryComponentNode;
  readonly query: string;
  readonly normalizedQuery: string;
  readonly graphicsRef: GraphicsActorRef;
  readonly unitId: string;
  readonly hoveredComponentId: string | undefined;
  readonly selectedComponentIds: readonly string[];
  readonly hiddenComponentIds: readonly string[];
  readonly isolatedComponentIds: readonly string[];
  readonly focusedComponentId: string | undefined;
  readonly opacityByComponentId: Readonly<Record<string, number>>;
  readonly rootDepth: number;
}): React.JSX.Element {
  return (
    <ul aria-label={ariaLabel} className='flex list-none flex-col gap-0.5'>
      {node.childIds.map((childId) => {
        const child = manifest.nodesById[childId];
        if (!child) {
          return null;
        }
        if (!componentMatchesQuery({ manifest, node: child, normalizedQuery })) {
          return null;
        }
        return (
          <li key={child.id} className='flex list-none flex-col gap-0.5'>
            <ComponentRow
              manifest={manifest}
              node={child}
              query={query}
              graphicsRef={graphicsRef}
              unitId={unitId}
              rootDepth={rootDepth}
              hoveredComponentId={hoveredComponentId}
              isSelected={selectedComponentIds.includes(child.id)}
              isHidden={hiddenComponentIds.includes(child.id)}
              isIsolated={isolatedComponentIds.includes(child.id)}
              isFocused={focusedComponentId === child.id}
              hasHiddenComponents={hiddenComponentIds.length > 0}
              hasOpacityOverrides={Object.keys(opacityByComponentId).length > 0}
              opacity={opacityByComponentId[child.id] ?? 1}
            />
            {child.childIds.length > 0 ? (
              <ComponentRows
                manifest={manifest}
                node={child}
                query={query}
                normalizedQuery={normalizedQuery}
                graphicsRef={graphicsRef}
                unitId={unitId}
                hoveredComponentId={hoveredComponentId}
                selectedComponentIds={selectedComponentIds}
                hiddenComponentIds={hiddenComponentIds}
                isolatedComponentIds={isolatedComponentIds}
                focusedComponentId={focusedComponentId}
                opacityByComponentId={opacityByComponentId}
                rootDepth={rootDepth}
              />
            ) : undefined}
          </li>
        );
      })}
    </ul>
  );
}

export function ComponentRow({
  manifest,
  node,
  query = '',
  graphicsRef,
  unitId,
  rootDepth,
  hoveredComponentId,
  isSelected,
  isHidden,
  isIsolated,
  isFocused,
  hasHiddenComponents = false,
  hasOpacityOverrides = false,
  opacity,
}: {
  readonly manifest: GeometryComponentManifest;
  readonly node: GeometryComponentNode;
  readonly query?: string;
  readonly graphicsRef: GraphicsActorRef;
  readonly unitId: string;
  readonly rootDepth: number;
  readonly hoveredComponentId: string | undefined;
  readonly isSelected: boolean;
  readonly isHidden: boolean;
  readonly isIsolated: boolean;
  readonly isFocused: boolean;
  readonly hasHiddenComponents?: boolean;
  readonly hasOpacityOverrides?: boolean;
  readonly opacity: number;
}): React.JSX.Element {
  const isHovered = hoveredComponentId === node.id;
  const visibilityAction = getVisibilityAction({ isHidden, nodeName: node.name, unitId, componentId: node.id });
  const isolationAction = getIsolationAction({ isIsolated, nodeName: node.name, unitId, componentId: node.id });
  const VisibilityIcon = visibilityAction.Icon;
  const actionButtonClassName = cn(
    'flex size-5 items-center justify-center rounded-md opacity-0 transition-[opacity,color,background-color] duration-150',
    'hover:bg-muted-foreground/10 hover:text-foreground focus-visible:bg-muted-foreground/10 focus-visible:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
    'group-hover/part:opacity-100 group-focus-within/part:opacity-100 data-[state=open]:bg-muted-foreground/10 data-[state=open]:text-foreground data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100 motion-reduce:transition-none',
    (isHovered || isIsolated) && 'opacity-100',
  );
  const guideCount = Math.max(0, node.depth - rootDepth - 1);

  const onHover = (componentId: string | undefined): void => {
    graphicsRef.send({ type: 'setHoveredModelComponent', unitId, componentId, source: 'explorer' });
  };
  const toggleSelection = (): void => {
    graphicsRef.send({
      type: 'toggleModelComponentSelection',
      unitId,
      componentId: node.id,
      source: 'explorer',
    });
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          data-model-component-row=''
          data-model-component-unit-id={unitId}
          data-model-component-id={node.id}
          className={cn(
            'group/part relative flex h-7 w-full cursor-pointer items-center justify-between rounded-md py-1 pr-1 pl-2 text-sm leading-5 transition-colors',
            'focus-within:bg-sidebar-accent/50 focus-within:text-sidebar-accent-foreground',
            isSelected ? 'bg-primary/10 text-primary' : 'text-sidebar-foreground',
            !isSelected && isFocused
              ? 'bg-sidebar-accent/70 text-foreground ring-1 ring-inset ring-primary/30'
              : undefined,
            !isSelected && !isFocused && isIsolated ? 'text-primary' : undefined,
            !isSelected && !isFocused ? 'hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground' : undefined,
            isHovered && !isSelected ? 'text-foreground' : undefined,
            isHidden ? 'opacity-45' : undefined,
          )}
          style={{ paddingLeft: `${getComponentRowPaddingLeft({ depth: node.depth, rootDepth })}px` }}
          onMouseEnter={() => {
            onHover(node.id);
          }}
          onMouseLeave={() => {
            onHover(undefined);
          }}
        >
          {Array.from({ length: guideCount }, (_, depth) => (
            <span
              // oxlint-disable-next-line react/no-array-index-key -- each position represents a stable ancestor depth
              key={depth}
              aria-hidden='true'
              className={cn(
                'pointer-events-none absolute inset-y-0 w-px bg-border/60 transition-opacity group-hover/part:opacity-100 group-focus-within/part:opacity-100',
                isSelected || isFocused ? 'opacity-100' : 'opacity-45',
              )}
              style={{ left: `${8 + depth * 12}px` }}
            />
          ))}
          <button
            type='button'
            className='flex h-full min-w-0 flex-1 items-center gap-2 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
            aria-label={node.name}
            aria-pressed={isSelected}
            onClick={toggleSelection}
          >
            <Box
              aria-hidden='true'
              data-testid='component-color-icon'
              className='size-3.5 shrink-0'
              style={node.appearance?.color ? { fill: node.appearance.color } : undefined}
            />
            <span className='truncate'>
              <HighlightText text={node.name} searchTerm={query} />
            </span>
          </button>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type='button'
                className={actionButtonClassName}
                aria-label={visibilityAction.ariaLabel}
                onClick={() => {
                  graphicsRef.send(visibilityAction.event);
                }}
              >
                <VisibilityIcon className='size-3.5' />
              </button>
            </TooltipTrigger>
            <TooltipContent>{visibilityAction.tooltip}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type='button'
                className={cn(actionButtonClassName, isolationAction.className)}
                aria-label={isolationAction.ariaLabel}
                aria-pressed={isolationAction.pressed}
                onClick={() => {
                  graphicsRef.send(isolationAction.event);
                }}
              >
                <Target className='size-3.5' />
              </button>
            </TooltipTrigger>
            <TooltipContent>{isolationAction.tooltip}</TooltipContent>
          </Tooltip>
          <ModelComponentActionDropdown
            manifest={manifest}
            node={node}
            graphicsRef={graphicsRef}
            unitId={unitId}
            source='explorer'
            isFocused={isFocused}
            isIsolated={isIsolated}
            hasHiddenComponents={hasHiddenComponents}
            hasOpacityOverrides={hasOpacityOverrides}
            actionButtonClassName={actionButtonClassName}
            opacity={opacity}
          />
        </div>
      </ContextMenuTrigger>
      <ModelComponentActionContextContent
        manifest={manifest}
        node={node}
        graphicsRef={graphicsRef}
        unitId={unitId}
        source='explorer'
        isFocused={isFocused}
        isIsolated={isIsolated}
        hasHiddenComponents={hasHiddenComponents}
        hasOpacityOverrides={hasOpacityOverrides}
        opacity={opacity}
      />
    </ContextMenu>
  );
}

function ExplorerEmptyState(): React.JSX.Element {
  return <CollectionEmptyState>No model components available</CollectionEmptyState>;
}

function ExplorerUnavailableState(): React.JSX.Element {
  return (
    <CollectionEmptyState className='min-h-16 break-all'>Open renderer to inspect components</CollectionEmptyState>
  );
}

function ExplorerNoMatchesState(): React.JSX.Element {
  return <CollectionEmptyState className='min-h-16 break-all'>No matching parts</CollectionEmptyState>;
}
