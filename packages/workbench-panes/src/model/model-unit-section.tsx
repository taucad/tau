import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Eye } from 'lucide-react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { PaneviewPanelApi } from 'dockview-react';
import type { GeometryComponentManifest, GeometryComponentNode } from '@taucad/types';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import { PanelEmptyState } from '@taucad/ui/components/panel-empty-state';
import { PaneVirtualList } from '@taucad/ui/components/pane-virtual-list';
import { cn } from '@taucad/ui/utils/cn';
import { PartPropertiesPanel } from '@taucad/viewer/cad/part-properties-panel';
import type { PartThumbnailState } from '@taucad/viewer/cad/part-thumbnail-state';
import { buildGeometryComponentReference } from '@taucad/viewer/graphics/metadata/geometry-component-reference';
import {
  deriveModelInteractionUnitId,
  getModelInteractionUnitState,
} from '@taucad/viewer/machines/model-interaction.machine';
import type { modelInteractionMachine } from '@taucad/viewer/machines/model-interaction.machine';
import type { GraphicsRef } from '#host/workbench-host.jsx';
import { useWorkbenchPanesHost } from '#host/workbench-host.jsx';
import type { ModelComponentTarget, ModelThumbnailRequest, ModelThumbnails } from '#model/model-source.js';
import { ComponentRow } from '#model/component-row.jsx';
import { getVisibleModelComponents } from '#model/visible-components.js';
import {
  PaneviewHeader,
  PaneviewHeaderAction,
  PaneviewHeaderControls,
  paneviewAttachedBodyClassName,
} from '#paneview/paneview-header.jsx';

type ModelInteractionRef = ActorRefFrom<typeof modelInteractionMachine>;

/**
 * A reveal request the pane is acting on; `requestId` makes a repeat of the same component a new request.
 *
 * @internal
 */
export type ModelComponentRevealTarget = ModelComponentTarget & { readonly requestId: number };

/**
 * What each entry section receives through Paneview.
 *
 * @internal
 */
export type ModelPaneviewPanelParams = {
  entryPath: string;
  graphicsRef?: GraphicsRef;
  query: string;
  revealTarget?: ModelComponentRevealTarget;
  onReveal?: (target: ModelComponentTarget) => void;
  onSelectionChange?: (unitId: string, node: GeometryComponentNode | undefined, entryPath: string) => void;
  onPreviewChange?: (change: {
    readonly unitId: string;
    readonly componentId: string;
    readonly preview: PartThumbnailState | undefined;
    readonly retry: () => void;
    readonly decodeError: () => void;
    readonly decoded: () => void;
  }) => void;
};

/**
 * What the Properties section receives through Paneview.
 *
 * @internal
 */
export type ModelPropertiesPanelParams = {
  selected?: { readonly node: GeometryComponentNode; readonly entryPath: string };
  preview?: PartThumbnailState;
  onOpenPreview?: (origin: HTMLElement) => void;
  onRetryPreview?: () => void;
  onPreviewDecodeError?: () => void;
  onPreviewDecoded?: () => void;
};

const emptyPreviews: ReadonlyMap<string, PartThumbnailState> = new Map();
const noThumbnails: ModelThumbnails = {
  previews: emptyPreviews,
  retry() {
    /* No thumbnail renderer. */
  },
  failDecode() {
    /* No thumbnail renderer. */
  },
  markDecoded() {
    /* No thumbnail renderer. */
  },
};
const useNoThumbnails = (_request: ModelThumbnailRequest): ModelThumbnails => noThumbnails;

/**
 * The model-interaction unit a section shows.
 *
 * @param entryPath - The section's entry.
 * @param graphicsRef - The graphics actor showing it.
 * @returns The presented unit when the host follows it, else the entry path's unit.
 */
function useModelUnitId(entryPath: string, graphicsRef: GraphicsRef): string {
  const followsPresented = useWorkbenchPanesHost().model?.unitIdentity === 'presented';
  const presented = useSelector(graphicsRef, (state) =>
    followsPresented ? state.context.modelInteractionUnitId : undefined,
  );
  return presented ?? deriveModelInteractionUnitId({ sourceFile: entryPath });
}

/**
 * One entry's section body: its component tree, or why there is none.
 *
 * @internal
 * @returns The section body.
 */
export function ModelPaneviewPanel({ params }: { readonly params: ModelPaneviewPanelParams }): React.JSX.Element {
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
  readonly graphicsRef: GraphicsRef;
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
  readonly graphicsRef: GraphicsRef;
  readonly modelRef: ModelInteractionRef;
}): React.JSX.Element {
  const source = useWorkbenchPanesHost().model;
  const [scroller, setScroller] = useState<HTMLDivElement>();
  // oxlint-disable-next-line typescript/no-restricted-types -- React passes null when a callback ref detaches.
  const attachScroller = useCallback((element: HTMLDivElement | null) => {
    setScroller(element ?? undefined);
  }, []);
  const unitId = useModelUnitId(params.entryPath, graphicsRef);
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
  const visibleNodes = useMemo(
    () => (manifest ? getVisibleModelComponents(manifest, normalizedQuery) : []),
    [manifest, normalizedQuery],
  );
  const [visiblePreviewIds, setVisiblePreviewIds] = useState<readonly string[]>([]);
  const leafPartIds = useMemo(
    () =>
      manifest?.nodeOrder.filter((id) => {
        const node = manifest.nodesById[id];
        return node?.kind === 'part' && node.childIds.length === 0;
      }) ?? [],
    [manifest],
  );
  const currentSelection = selectedComponentIds.at(-1);
  const hasThumbnails = source?.useThumbnails !== undefined;
  const useThumbnails = source?.useThumbnails ?? useNoThumbnails;
  const thumbnails = useThumbnails({
    entryPath: params.entryPath,
    unitId,
    graphicsRef,
    manifest,
    selectedComponentIds,
    visibleComponentIds: visiblePreviewIds,
  });
  const { previews, retry: retryPreview, failDecode, markDecoded } = thumbnails;
  const selectedPreview = currentSelection ? previews.get(currentSelection) : undefined;

  useEffect(() => {
    if (!scroller || !hasThumbnails) {
      return undefined;
    }
    const visibleIds = new Set(visibleNodes.map((node) => node.id));
    const mounted = new Set<HTMLElement>();
    const inView = new Set<string>();
    let active = true;
    const publishVisible = (): void => {
      if (!active) {
        return;
      }
      const next = [...inView].slice(0, 127);
      setVisiblePreviewIds((current) =>
        current.length === next.length && current.every((id, index) => id === next[index]) ? current : next,
      );
    };
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? undefined
        : new IntersectionObserver(
            (entries) => {
              if (!active) {
                return;
              }
              for (const entry of entries) {
                const row = entry.target as HTMLElement;
                const id = row.dataset['modelComponentId'];
                if (!id || !visibleIds.has(id) || !mounted.has(row)) {
                  continue;
                }
                if (entry.isIntersecting) {
                  inView.add(id);
                } else {
                  inView.delete(id);
                }
              }
              publishVisible();
            },
            { root: scroller, rootMargin: '56px 0px' },
          );
    const syncMountedRows = (): void => {
      if (!active) {
        return;
      }
      const rows = new Set(
        [...scroller.querySelectorAll<HTMLElement>('[data-model-component-row]')].filter((row) =>
          visibleIds.has(row.dataset['modelComponentId'] ?? ''),
        ),
      );
      for (const row of mounted) {
        if (!rows.has(row)) {
          observer?.unobserve(row);
          mounted.delete(row);
          const id = row.dataset['modelComponentId'];
          if (id) {
            inView.delete(id);
          }
        }
      }
      for (const row of rows) {
        if (!mounted.has(row)) {
          mounted.add(row);
          observer?.observe(row);
        }
      }
      if (!observer) {
        inView.clear();
        for (const row of [...rows].slice(0, 32)) {
          const id = row.dataset['modelComponentId'];
          if (id) {
            inView.add(id);
          }
        }
      }
      publishVisible();
    };
    // Virtual rows mount and unmount while the manifest and filter stay unchanged.
    const mountedRows = new MutationObserver(syncMountedRows);
    mountedRows.observe(scroller, { childList: true, subtree: true });
    syncMountedRows();
    return () => {
      active = false;
      mountedRows.disconnect();
      observer?.disconnect();
    };
  }, [hasThumbnails, scroller, visibleNodes]);

  useEffect(() => {
    const selectedId = selectedComponentIds.at(-1);
    params.onSelectionChange?.(unitId, selectedId ? manifest?.nodesById[selectedId] : undefined, params.entryPath);
  }, [manifest, params.entryPath, params.onSelectionChange, selectedComponentIds, unitId]);

  const onSelect = source?.onSelect;
  const reportedSelection = useRef<string | undefined>(undefined);
  useEffect(() => {
    const node = currentSelection ? manifest?.nodesById[currentSelection] : undefined;
    const key = node ? `${unitId}\0${node.id}` : undefined;
    if (!onSelect || key === reportedSelection.current) {
      return;
    }
    reportedSelection.current = key;
    onSelect(manifest && node ? buildGeometryComponentReference(manifest, node) : undefined);
  }, [currentSelection, manifest, onSelect, unitId]);

  useEffect(() => {
    if (currentSelection) {
      params.onPreviewChange?.({
        unitId,
        componentId: currentSelection,
        preview: selectedPreview,
        retry: () => {
          retryPreview();
        },
        decodeError: () => {
          if (selectedPreview?.bytes) {
            failDecode(currentSelection, selectedPreview.bytes);
          }
        },
        decoded: () => {
          if (selectedPreview?.bytes) {
            markDecoded(currentSelection, selectedPreview.bytes);
          }
        },
      });
    }
  }, [currentSelection, failDecode, markDecoded, params.onPreviewChange, retryPreview, selectedPreview, unitId]);

  if (!manifest || !root || childCount === 0) {
    return <ModelPaneviewPanelSurface />;
  }

  return (
    <ModelPaneviewPanelSurface
      contentRef={attachScroller}
      footer={
        <Collapsible>
          <div className='flex min-w-0 items-center justify-between gap-2 border-t px-2 py-1 text-xs text-muted-foreground'>
            <span className='truncate'>Weight · 0 of {leafPartIds.length} parts known</span>
            <span className='shrink-0 font-mono'>Unknown</span>
            {leafPartIds.length > 0 ? (
              <CollapsibleTrigger className='shrink-0 rounded-sm underline-offset-2 hover:underline focus-visible:focus-outline'>
                Missing
              </CollapsibleTrigger>
            ) : undefined}
          </div>
          <CollapsibleContent className='border-t p-1'>
            <MissingPartList
              manifest={manifest}
              ids={leafPartIds}
              graphicsRef={graphicsRef}
              unitId={unitId}
              entryPath={params.entryPath}
              onReveal={params.onReveal}
            />
          </CollapsibleContent>
        </Collapsible>
      }
    >
      {normalizedQuery && visibleNodes.length === 0 ? (
        <ExplorerNoMatchesState />
      ) : (
        <ComponentRows
          ariaLabel={`Model components for ${params.entryPath}`}
          manifest={manifest}
          nodes={visibleNodes}
          query={params.query}
          graphicsRef={graphicsRef}
          unitId={unitId}
          hoveredComponentId={hoveredComponentId}
          selectedComponentIds={selectedComponentIds}
          hiddenComponentIds={hiddenComponentIds}
          isolatedComponentIds={isolatedComponentIds}
          focusedComponentId={focusedComponentId}
          opacityByComponentId={opacityByComponentId}
          rootDepth={root.depth}
          revealTarget={params.revealTarget?.unitId === unitId ? params.revealTarget : undefined}
          previews={previews}
          onRetryPreview={retryPreview}
          onPreviewDecodeError={failDecode}
          onPreviewDecoded={markDecoded}
        />
      )}
    </ModelPaneviewPanelSurface>
  );
}

function ModelPaneviewPanelSurface({
  children,
  footer,
  contentRef,
}: {
  readonly children?: React.ReactNode;
  readonly footer?: React.ReactNode;
  readonly contentRef?: React.Ref<HTMLDivElement>;
}): React.JSX.Element {
  return (
    <div data-slot='model-unit-surface' className={cn('flex h-full flex-col', paneviewAttachedBodyClassName)}>
      <div ref={contentRef} data-slot='model-unit-scroller' className='min-h-0 flex-1 overflow-hidden p-2'>
        {children ?? <ExplorerUnavailableState />}
      </div>
      {footer}
    </div>
  );
}

/**
 * One entry's section header: the entry path, its component count and a show-hidden action.
 *
 * @internal
 * @returns The Paneview header element.
 */
export function ModelPaneviewHeader({
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
  readonly graphicsRef: GraphicsRef;
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
  readonly graphicsRef: GraphicsRef;
  readonly modelRef: ModelInteractionRef;
}): React.JSX.Element {
  const unitId = useModelUnitId(entryPath, graphicsRef);
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

/**
 * The Properties section body: the selected part's facts and preview.
 *
 * @internal
 * @returns The section body.
 */
export function ModelPropertiesPaneviewPanel({
  params,
}: {
  readonly params: ModelPropertiesPanelParams;
}): React.JSX.Element {
  return (
    <div className={cn('h-full overflow-y-auto! scroll-shadows-y', paneviewAttachedBodyClassName)}>
      <PartPropertiesPanel
        node={params.selected?.node}
        entryPath={params.selected?.entryPath}
        preview={params.preview}
        onOpenPreview={params.onOpenPreview}
        onRetryPreview={params.onRetryPreview}
        onPreviewDecodeError={params.onPreviewDecodeError}
        onPreviewDecoded={params.onPreviewDecoded}
      />
    </div>
  );
}

/**
 * The Properties section header.
 *
 * @internal
 * @returns The Paneview header element.
 */
export function ModelPropertiesPaneviewHeader({ api }: { readonly api: PaneviewPanelApi }): React.JSX.Element {
  return <PaneviewHeader api={api} title='Properties' />;
}

const componentKey = (node: GeometryComponentNode): string => node.id;
const partKey = (id: string): string => id;

function MissingPartList({
  manifest,
  ids,
  graphicsRef,
  unitId,
  entryPath,
  onReveal,
}: {
  readonly manifest: GeometryComponentManifest;
  readonly ids: readonly string[];
  readonly graphicsRef: GraphicsRef;
  readonly unitId: string;
  readonly entryPath: string;
  readonly onReveal: ((target: ModelComponentTarget) => void) | undefined;
}): React.JSX.Element {
  const renderItem = useCallback(
    (_index: number, id: string) => (
      <button
        type='button'
        className='block w-full truncate rounded-sm px-2 py-1 text-left text-xs hover:bg-sidebar-accent focus-visible:focus-outline'
        onClick={() => {
          graphicsRef.send({ type: 'selectModelComponent', unitId, componentId: id, source: 'explorer' });
          onReveal?.({ entryPath, unitId, componentId: id });
        }}
      >
        {manifest.nodesById[id]?.name ?? id}
      </button>
    ),
    [entryPath, graphicsRef, manifest, onReveal, unitId],
  );
  return (
    <PaneVirtualList
      data={ids}
      getItemKey={partKey}
      itemContent={renderItem}
      ariaLabel='Parts with unknown weight'
      className='h-32'
    />
  );
}

function ComponentRows({
  ariaLabel,
  manifest,
  nodes,
  query,
  graphicsRef,
  unitId,
  hoveredComponentId,
  selectedComponentIds,
  hiddenComponentIds,
  isolatedComponentIds,
  focusedComponentId,
  opacityByComponentId,
  rootDepth,
  revealTarget,
  previews,
  onRetryPreview,
  onPreviewDecodeError,
  onPreviewDecoded,
}: {
  readonly ariaLabel: string;
  readonly manifest: GeometryComponentManifest;
  readonly nodes: GeometryComponentNode[];
  readonly query: string;
  readonly graphicsRef: GraphicsRef;
  readonly unitId: string;
  readonly hoveredComponentId: string | undefined;
  readonly selectedComponentIds: readonly string[];
  readonly hiddenComponentIds: readonly string[];
  readonly isolatedComponentIds: readonly string[];
  readonly focusedComponentId: string | undefined;
  readonly opacityByComponentId: Readonly<Record<string, number>>;
  readonly rootDepth: number;
  readonly revealTarget: ModelComponentRevealTarget | undefined;
  readonly previews: ReadonlyMap<string, PartThumbnailState>;
  readonly onRetryPreview?: (id: string) => void;
  readonly onPreviewDecodeError?: (id: string, bytes: Uint8Array<ArrayBuffer>) => void;
  readonly onPreviewDecoded?: (id: string, bytes: Uint8Array<ArrayBuffer>) => void;
}): React.JSX.Element {
  const selected = useMemo(() => new Set(selectedComponentIds), [selectedComponentIds]);
  const hidden = useMemo(() => new Set(hiddenComponentIds), [hiddenComponentIds]);
  const isolated = useMemo(() => new Set(isolatedComponentIds), [isolatedComponentIds]);
  const hasOpacityOverrides = Object.keys(opacityByComponentId).length > 0;
  const reveal = useMemo(
    () => (revealTarget ? { key: revealTarget.componentId, requestId: revealTarget.requestId } : undefined),
    [revealTarget],
  );
  const renderItem = useCallback(
    (_index: number, node: GeometryComponentNode) => (
      <ComponentRow
        manifest={manifest}
        node={node}
        query={query}
        graphicsRef={graphicsRef}
        unitId={unitId}
        rootDepth={rootDepth}
        hoveredComponentId={hoveredComponentId}
        isSelected={selected.has(node.id)}
        isHidden={hidden.has(node.id)}
        isIsolated={isolated.has(node.id)}
        isFocused={focusedComponentId === node.id}
        hasHiddenComponents={hidden.size > 0}
        hasOpacityOverrides={hasOpacityOverrides}
        opacity={opacityByComponentId[node.id] ?? 1}
        preview={previews.get(node.id)}
        onRetryPreview={onRetryPreview}
        onPreviewDecodeError={onPreviewDecodeError}
        onPreviewDecoded={onPreviewDecoded}
      />
    ),
    [
      focusedComponentId,
      graphicsRef,
      hasOpacityOverrides,
      hidden,
      hoveredComponentId,
      isolated,
      manifest,
      opacityByComponentId,
      query,
      rootDepth,
      selected,
      previews,
      onRetryPreview,
      onPreviewDecodeError,
      onPreviewDecoded,
      unitId,
    ],
  );
  return (
    <PaneVirtualList
      enableKeyboardNavigation
      data={nodes}
      getItemKey={componentKey}
      itemContent={renderItem}
      ariaLabel={ariaLabel}
      itemSpacing='compact'
      className='h-full'
      reveal={reveal}
      focusSelector='[data-model-part-button]'
    />
  );
}

/**
 * The pane's state when no entry renders components.
 *
 * @internal
 * @returns A bordered panel empty state.
 */
export function ExplorerEmptyState(): React.JSX.Element {
  return (
    <div className='size-full p-2'>
      <PanelEmptyState icon={Box} title='No model components available' className='rounded-xl border bg-card' />
    </div>
  );
}

function ExplorerUnavailableState(): React.JSX.Element {
  return <PanelEmptyState icon={Box} title='Open renderer to inspect components' className='min-h-16 break-all' />;
}

function ExplorerNoMatchesState(): React.JSX.Element {
  return <PanelEmptyState icon={Box} title='No matching parts' className='min-h-16 break-all' />;
}
