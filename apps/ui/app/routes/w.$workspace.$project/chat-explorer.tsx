import { XIcon, FileBox, ChevronRight, Box, Eye, EyeOff, Target, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { GeometryComponentManifest, GeometryComponentNode } from '@taucad/types';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import { EmptyItems } from '#components/ui/empty-items.js';
import { SearchInput } from '#components/search-input.js';
import {
  FloatingPanel,
  FloatingPanelClose,
  FloatingPanelContent,
  FloatingPanelContentHeader,
  FloatingPanelContentHeaderActions,
  FloatingPanelContentTitle,
  FloatingPanelContentBody,
  FloatingPanelTrigger,
  FloatingPanelMenuButton,
  FloatingPanelButtonGroup,
} from '#components/ui/floating-panel.js';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#components/ui/collapsible.js';
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
import { formatKeyCombination } from '#utils/keys.utils.js';
import type { KeyCombination } from '#utils/keys.utils.js';
import { cn } from '#utils/ui.utils.js';
import { sortGeometryUnitEntries } from '#routes/w.$workspace.$project/geometry-unit.utils.js';

const keyCombinationEditor = {
  key: 'a',
  ctrlKey: true,
} as const satisfies KeyCombination;

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

export function shouldShowComponentRowActions({
  isHovered,
  isIsolated,
}: {
  readonly isHovered: boolean;
  readonly isIsolated: boolean;
}): boolean {
  return isHovered || isIsolated;
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

export function ChatExplorerTrigger({
  isOpen,
  onToggle,
}: {
  readonly isOpen: boolean;
  readonly onToggle: () => void;
}): React.JSX.Element {
  return (
    <FloatingPanelTrigger
      icon={FileBox}
      tooltipContent={
        <div className='flex items-center gap-2'>
          {isOpen ? 'Close' : 'Open'} Explorer
          <KeyShortcut variant='tooltip'>{formatKeyCombination(keyCombinationEditor)}</KeyShortcut>
        </div>
      }
      className={isOpen ? 'text-primary' : undefined}
      tooltipSide='right'
      onClick={onToggle}
    />
  );
}

export function ChatExplorerTree({
  className,
  isExpanded = true,
  setIsExpanded,
}: {
  readonly className?: string;
  readonly isExpanded: boolean;
  readonly setIsExpanded?: (value: boolean | ((current: boolean) => boolean)) => void;
}): React.JSX.Element {
  const project = useProject({ enableNoContext: true });
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [revealTarget, setRevealTarget] = useState<ModelComponentRevealTarget>();
  const toggleEditor = () => {
    setIsExpanded?.((current) => !current);
  };
  const { formattedKeyCombination: formattedEditorKeyCombination } = useKeybinding(keyCombinationEditor, toggleEditor);
  const toggleSearch = useCallback(() => {
    setIsSearchVisible((current) => {
      const next = !current;
      if (!next) {
        setQuery('');
      }
      return next;
    });
  }, []);
  useEffect(() => {
    if (!project) {
      return undefined;
    }
    const subscription = project.editorRef.on('modelComponentRevealRequested', (event) => {
      setIsExpanded?.(true);
      setIsSearchVisible(false);
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
  }, [project, setIsExpanded]);

  return (
    <FloatingPanel isOpen={isExpanded} side='right' className={className} onOpenChange={setIsExpanded}>
      <FloatingPanelContent className='text-sm'>
        <FloatingPanelContentHeader>
          <FloatingPanelContentTitle>Explorer</FloatingPanelContentTitle>
          <FloatingPanelContentHeaderActions>
            <FloatingPanelButtonGroup>
              <FloatingPanelMenuButton
                className={cn(isSearchVisible && 'text-primary')}
                aria-label={isSearchVisible ? 'Hide search' : 'Show search'}
                tooltip={isSearchVisible ? 'Hide search' : 'Search parts'}
                onClick={toggleSearch}
              >
                <Search className='size-4' />
              </FloatingPanelMenuButton>
            </FloatingPanelButtonGroup>
            <FloatingPanelClose
              icon={XIcon}
              tooltipContent={(isOpen) => (
                <div className='flex items-center gap-2'>
                  {isOpen ? 'Close' : 'Open'} Explorer
                  <KeyShortcut variant='tooltip'>{formattedEditorKeyCombination}</KeyShortcut>
                </div>
              )}
            />
          </FloatingPanelContentHeaderActions>
        </FloatingPanelContentHeader>
        <FloatingPanelContentBody className='flex flex-col px-0 py-0'>
          {project ? (
            <ChatGeometryExplorerContent
              project={project}
              query={query}
              isSearchVisible={isSearchVisible}
              revealTarget={revealTarget}
              onQueryChange={setQuery}
            />
          ) : (
            <ExplorerEmptyState />
          )}
        </FloatingPanelContentBody>
      </FloatingPanelContent>
    </FloatingPanel>
  );
}

function ChatGeometryExplorerContent({
  project,
  query,
  isSearchVisible,
  revealTarget,
  onQueryChange,
}: {
  readonly project: NonNullable<ReturnType<typeof useProject>>;
  readonly query: string;
  readonly isSearchVisible: boolean;
  readonly revealTarget: ModelComponentRevealTarget | undefined;
  readonly onQueryChange: (query: string) => void;
}): React.JSX.Element {
  const [openByEntryPath, setOpenByEntryPath] = useState<Record<string, boolean>>({});
  const contentRef = useRef<HTMLDivElement>(null);
  const viewSettings = useSelector(project.editorRef, (state) => state.context.viewSettings);
  const entries = useMemo(
    () => sortGeometryUnitEntries([...project.geometryUnits.entries()], project.mainEntryPath),
    [project.geometryUnits, project.mainEntryPath],
  );
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
  const setSectionOpen = useCallback((entryPath: string, isOpen: boolean): void => {
    setOpenByEntryPath((current) => ({ ...current, [entryPath]: isOpen }));
  }, []);
  useEffect(() => {
    if (!revealTarget || !entries.some(([entryPath]) => entryPath === revealTarget.entryPath)) {
      return;
    }
    setOpenByEntryPath((current) =>
      current[revealTarget.entryPath] ? current : { ...current, [revealTarget.entryPath]: true },
    );
  }, [entries, revealTarget]);
  useEffect(() => {
    if (!revealTarget) {
      return;
    }
    const row = [...(contentRef.current?.querySelectorAll<HTMLElement>('[data-model-component-row]') ?? [])].find(
      (candidate) =>
        candidate.dataset['modelComponentUnitId'] === revealTarget.unitId &&
        candidate.dataset['modelComponentId'] === revealTarget.componentId,
    );
    row?.scrollIntoView({ block: 'center' });
  }, [openByEntryPath, query, revealTarget]);

  if (entries.length === 0) {
    return <ExplorerEmptyState />;
  }

  return (
    <>
      {isSearchVisible && (
        <div className='flex w-full shrink-0 flex-row gap-1.5 border-b bg-sidebar px-2 py-1.5'>
          <SearchInput
            value={query}
            placeholder='Search parts...'
            className='h-6 w-full bg-background text-xs placeholder:text-xs'
            onChange={(event) => {
              onQueryChange(event.target.value);
            }}
            onClear={() => {
              onQueryChange('');
            }}
          />
        </div>
      )}
      <div ref={contentRef} className='flex min-h-0 flex-1 flex-col'>
        {entries.map(([entryPath]) => (
          <CompilationUnitExplorerSection
            key={entryPath}
            entryPath={entryPath}
            graphicsRef={resolveGraphicsForFile(entryPath)}
            query={query}
            isMainEntryPath={entryPath === project.mainEntryPath}
            openByEntryPath={openByEntryPath}
            onOpenChange={setSectionOpen}
          />
        ))}
      </div>
    </>
  );
}

function CompilationUnitExplorerSection({
  entryPath,
  graphicsRef,
  query,
  isMainEntryPath,
  openByEntryPath,
  onOpenChange,
}: {
  readonly entryPath: string;
  readonly graphicsRef: GraphicsActorRef | undefined;
  readonly query: string;
  readonly isMainEntryPath: boolean;
  readonly openByEntryPath: Record<string, boolean>;
  readonly onOpenChange: (entryPath: string, isOpen: boolean) => void;
}): React.JSX.Element {
  if (!graphicsRef) {
    return (
      <ExplorerCollapsibleSection
        title={entryPath}
        count={0}
        isOpen={openByEntryPath[entryPath] ?? true}
        onOpenChange={(isOpen) => {
          onOpenChange(entryPath, isOpen);
        }}
      >
        <ExplorerUnavailableState />
      </ExplorerCollapsibleSection>
    );
  }

  return (
    <LiveCompilationUnitTree
      entryPath={entryPath}
      graphicsRef={graphicsRef}
      query={query}
      isMainEntryPath={isMainEntryPath}
      openByEntryPath={openByEntryPath}
      onOpenChange={onOpenChange}
    />
  );
}

function LiveCompilationUnitTree({
  entryPath,
  graphicsRef,
  query,
  isMainEntryPath,
  openByEntryPath,
  onOpenChange,
}: {
  readonly entryPath: string;
  readonly graphicsRef: GraphicsActorRef;
  readonly query: string;
  readonly isMainEntryPath: boolean;
  readonly openByEntryPath: Record<string, boolean>;
  readonly onOpenChange: (entryPath: string, isOpen: boolean) => void;
}): React.JSX.Element {
  const modelRef = useSelector(
    graphicsRef,
    (state) => state.context.modelInteractionRef as ModelInteractionRef | undefined,
  );

  if (!modelRef) {
    return (
      <ExplorerCollapsibleSection
        title={entryPath}
        count={0}
        isOpen={openByEntryPath[entryPath] ?? true}
        onOpenChange={(isOpen) => {
          onOpenChange(entryPath, isOpen);
        }}
      >
        <ExplorerUnavailableState />
      </ExplorerCollapsibleSection>
    );
  }

  return (
    <LiveComponentTree
      entryPath={entryPath}
      graphicsRef={graphicsRef}
      modelRef={modelRef}
      query={query}
      isMainEntryPath={isMainEntryPath}
      openByEntryPath={openByEntryPath}
      onOpenChange={onOpenChange}
    />
  );
}

function LiveComponentTree({
  entryPath,
  graphicsRef,
  modelRef,
  query,
  isMainEntryPath,
  openByEntryPath,
  onOpenChange,
}: {
  readonly entryPath: string;
  readonly graphicsRef: GraphicsActorRef;
  readonly modelRef: ModelInteractionRef;
  readonly query: string;
  readonly isMainEntryPath: boolean;
  readonly openByEntryPath: Record<string, boolean>;
  readonly onOpenChange: (entryPath: string, isOpen: boolean) => void;
}): React.JSX.Element {
  const unitId = deriveModelInteractionUnitId({ sourceFile: entryPath });
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
  const normalizedQuery = query.trim().toLowerCase();
  const matchingChildCount = manifest && root ? countMatchingChildren({ manifest, node: root, normalizedQuery }) : 0;
  const isOpen = openByEntryPath[entryPath] ?? (isMainEntryPath || childCount > 0 || !manifest);

  if (!manifest || !root || childCount === 0) {
    return (
      <ExplorerCollapsibleSection
        title={entryPath}
        count={0}
        hiddenComponentCount={hiddenComponentIds.length}
        onShowHiddenComponents={() => {
          graphicsRef.send({ type: 'showHiddenModelComponents', unitId, source: 'explorer' });
        }}
        isOpen={isOpen}
        onOpenChange={(nextOpen) => {
          onOpenChange(entryPath, nextOpen);
        }}
      >
        <ExplorerUnavailableState />
      </ExplorerCollapsibleSection>
    );
  }

  return (
    <ExplorerCollapsibleSection
      title={entryPath}
      count={childCount}
      hiddenComponentCount={hiddenComponentIds.length}
      onShowHiddenComponents={() => {
        graphicsRef.send({ type: 'showHiddenModelComponents', unitId, source: 'explorer' });
      }}
      isOpen={isOpen}
      onOpenChange={(nextOpen) => {
        onOpenChange(entryPath, nextOpen);
      }}
    >
      {normalizedQuery && matchingChildCount === 0 ? (
        <ExplorerNoMatchesState />
      ) : (
        <ComponentRows
          manifest={manifest}
          node={root}
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
    </ExplorerCollapsibleSection>
  );
}

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
  manifest,
  node,
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
  readonly manifest: GeometryComponentManifest;
  readonly node: GeometryComponentNode;
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
    <div className='flex flex-col'>
      {node.childIds.map((childId) => {
        const child = manifest.nodesById[childId];
        if (!child) {
          return null;
        }
        if (!componentMatchesQuery({ manifest, node: child, normalizedQuery })) {
          return null;
        }
        return (
          <div key={child.id} className='flex flex-col'>
            <ComponentRow
              manifest={manifest}
              node={child}
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
          </div>
        );
      })}
    </div>
  );
}

export function ComponentRow({
  manifest,
  node,
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
  const showActions = shouldShowComponentRowActions({ isHovered, isIsolated });
  const visibilityAction = getVisibilityAction({ isHidden, nodeName: node.name, unitId, componentId: node.id });
  const isolationAction = getIsolationAction({ isIsolated, nodeName: node.name, unitId, componentId: node.id });
  const VisibilityIcon = visibilityAction.Icon;
  const actionButtonClassName = cn(
    'flex size-5 items-center justify-center rounded-sm transition-opacity hover:bg-muted-foreground/15 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
    showActions ? 'opacity-100' : 'opacity-0 group-hover/part:opacity-100',
  );

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
            'group/part flex h-7 w-full cursor-pointer items-center justify-between py-1 pr-1 pl-2 text-sm leading-5 transition-colors',
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
          <button
            type='button'
            className='flex min-w-0 flex-1 items-center gap-2 text-left'
            aria-pressed={isSelected}
            onClick={toggleSelection}
          >
            <Box
              aria-hidden='true'
              data-testid='component-color-icon'
              className='size-3.5 shrink-0'
              style={node.appearance?.color ? { fill: node.appearance.color } : undefined}
            />
            <span className='truncate'>{node.name}</span>
          </button>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type='button'
                tabIndex={showActions ? 0 : -1}
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
                tabIndex={showActions ? 0 : -1}
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
            shouldShowActions={showActions}
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
  return <EmptyItems>No model components available</EmptyItems>;
}

function ExplorerUnavailableState(): React.JSX.Element {
  return <EmptyItems className='min-h-16 break-all'>Open renderer to inspect components</EmptyItems>;
}

function ExplorerNoMatchesState(): React.JSX.Element {
  return <EmptyItems className='min-h-16 break-all'>No matching parts</EmptyItems>;
}

type ExplorerCollapsibleSectionProps = {
  readonly title: string;
  readonly count: number;
  readonly hiddenComponentCount?: number;
  readonly onShowHiddenComponents?: () => void;
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
  readonly children: React.ReactNode;
};

function ExplorerCollapsibleSection({
  title,
  count,
  hiddenComponentCount = 0,
  onShowHiddenComponents,
  isOpen,
  onOpenChange,
  children,
}: ExplorerCollapsibleSectionProps): React.JSX.Element {
  const hasHiddenComponents = hiddenComponentCount > 0;

  return (
    <Collapsible open={isOpen} className='w-full border-b border-border/50 last:border-b-0' onOpenChange={onOpenChange}>
      <div className='group/collapsible flex h-7 w-full items-center gap-1 transition-colors hover:bg-sidebar-accent/50'>
        <CollapsibleTrigger className='flex min-w-0 flex-1 items-center py-1 pl-2 text-left'>
          <span data-testid='explorer-section-title' className='truncate text-[13px] text-foreground' dir='rtl'>
            {title}
          </span>
        </CollapsibleTrigger>
        {hasHiddenComponents ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type='button'
                className='flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted-foreground/15 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none'
                aria-label={`Show hidden components in ${title}`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onShowHiddenComponents?.();
                }}
              >
                <Eye className='size-3.5' />
              </button>
            </TooltipTrigger>
            <TooltipContent>Show hidden components</TooltipContent>
          </Tooltip>
        ) : undefined}
        <span className='shrink-0 text-xs text-muted-foreground/50'>({count})</span>
        <CollapsibleTrigger className='group/section-chevron flex size-6 shrink-0 items-center justify-center pr-1'>
          <ChevronRight className='size-3.5 text-muted-foreground transition-transform duration-200 ease-in-out group-data-[state=open]/section-chevron:rotate-90' />
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent className='px-0 py-0.5'>{children}</CollapsibleContent>
    </Collapsible>
  );
}
