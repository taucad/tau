import { XIcon, Box, Eye, EyeOff, Target } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { PaneviewApi, PaneviewPanelApi } from 'dockview-react';
import { Paneview } from '#components/panes/paneview.js';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import type { GeometryComponentManifest, GeometryComponentNode } from '@taucad/types';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import { PanelEmptyState } from '#components/ui/panel-empty-state.js';
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
import { ContextMenu, ContextMenuTrigger } from '@taucad/ui/components/context-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import {
  ModelComponentActionContextContent,
  ModelComponentActionDropdown,
} from '#components/geometry/cad/model-component-action-menu.js';
import { MaterialSwatch } from '#components/geometry/cad/material-swatch.js';
import { PartPropertiesPanel } from '#components/geometry/cad/part-properties-panel.js';
import { PartPreviewImage } from '#components/geometry/cad/part-preview-image.js';
import { useOptionalHeadlessImageService } from '#providers/headless-image-provider.js';
import { useOptionalPartThumbnailService } from '#providers/part-thumbnail-provider.js';
import { PartThumbnailService } from '#services/part-thumbnail.service.js';
import type { PartThumbnailRequest, PartThumbnailState } from '#services/part-thumbnail.service.js';
import { canonicalPartPreviews, sourceGlbDigest } from '#services/part-thumbnail-visual.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
import { useProject } from '#hooks/use-project.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import { deriveModelInteractionUnitId, getModelInteractionUnitState } from '#machines/model-interaction.machine.js';
import type { modelInteractionMachine } from '#machines/model-interaction.machine.js';
import { cn } from '@taucad/ui/utils/cn';
import { nestedActionVariants } from '@taucad/ui/components/nested-action.variants';
import { findEntryGraphics, listGeometryEntryPaths } from '#routes/w.$workspace.$project/geometry-unit.utils.js';
import {
  PaneviewHeader,
  PaneviewHeaderAction,
  PaneviewHeaderControls,
  paneviewAttachedBodyClassName,
  paneviewAttachedSurfaceStyleOverrides,
  paneviewHeaderSize,
} from '#components/panes/paneview-header.js';
import {
  getInitialPanelOptions,
  usePaneviewPersistence,
} from '#routes/w.$workspace.$project/use-chat-interface-state.js';
import { PaneVirtualList } from '#components/panes/pane-virtual-list.js';
import { projectWorkspaceKeyCombinations } from '#routes/w.$workspace.$project/project-workspace-context.js';

const keyCombinationEditor = projectWorkspaceKeyCombinations.model;
const emptyPreviewSnapshot: ReadonlyMap<string, PartThumbnailState> = new Map();

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
          placeholder='Filter parts…'
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
  const resolveGraphicsForFile = useCallback(
    (entryPath: string): GraphicsActorRef | undefined => {
      return findEntryGraphics(project.viewGraphics, project.viewEntryPaths, entryPath);
    },
    [project.viewGraphics, project.viewEntryPaths],
  );
  const entries = useMemo(
    () =>
      listGeometryEntryPaths(project.geometryUnits, project.viewRecords, project.mainEntryPath).map(
        (entryPath): [string, GraphicsActorRef | undefined] => [entryPath, resolveGraphicsForFile(entryPath)],
      ),
    [project.geometryUnits, project.mainEntryPath, resolveGraphicsForFile, project.viewRecords],
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

type ModelPropertiesPanelParams = {
  selected?: { readonly node: GeometryComponentNode; readonly entryPath: string };
  preview?: PartThumbnailState;
  onRetryPreview?: () => void;
  onPreviewDecodeError?: () => void;
  onPreviewDecoded?: () => void;
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
  const [selected, setSelected] = useState<ModelPropertiesPanelParams['selected'] & { readonly unitId: string }>();
  const [preview, setPreview] = useState<{
    readonly unitId: string;
    readonly componentId: string;
    readonly state: PartThumbnailState | undefined;
    readonly retry: () => void;
    readonly decodeError: () => void;
    readonly decoded: () => void;
  }>();
  const visibleSelection =
    selected && entries.some(([entryPath]) => entryPath === selected.entryPath) ? selected : undefined;
  const onSelectionChange = useCallback(
    (unitId: string, node: GeometryComponentNode | undefined, entryPath: string) => {
      setSelected((current) => (node ? { unitId, node, entryPath } : current?.unitId === unitId ? undefined : current));
    },
    [],
  );
  const onPreviewChange = useCallback(
    ({
      unitId,
      componentId,
      preview: state,
      retry,
      decodeError,
      decoded,
    }: Parameters<NonNullable<ModelPaneviewPanelParams['onPreviewChange']>>[0]) => {
      if (selected?.unitId !== unitId || selected.node.id !== componentId) {
        return;
      }
      setPreview({ unitId, componentId, state, retry, decodeError, decoded });
    },
    [selected],
  );
  const selectedPreview =
    preview?.unitId === visibleSelection?.unitId && preview?.componentId === visibleSelection?.node.id
      ? preview
      : undefined;

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
          minimumBodySize: 144,
          size: initial.size,
          params: {
            entryPath,
            graphicsRef,
            query,
            revealTarget,
            onSelectionChange,
            onPreviewChange,
          } satisfies ModelPaneviewPanelParams,
        });
      }
      const initial = getInitialPanelOptions(savedState, 'properties', { isExpanded: true, size: 392 });
      api.addPanel({
        id: 'properties',
        title: 'Properties',
        component: 'propertiesPanel',
        headerComponent: 'propertiesHeader',
        headerSize: paneviewHeaderSize,
        isExpanded: initial.isExpanded,
        minimumBodySize: 160,
        size: initial.size,
        params: {
          selected: visibleSelection,
          preview: selectedPreview?.state,
          onRetryPreview: selectedPreview?.retry,
          onPreviewDecodeError: selectedPreview?.decodeError,
          onPreviewDecoded: selectedPreview?.decoded,
        } satisfies ModelPropertiesPanelParams,
      });
    },
    [
      connectApi,
      entries,
      onPreviewChange,
      onSelectionChange,
      selectedPreview,
      query,
      revealTarget,
      savedState,
      visibleSelection,
    ],
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
        onSelectionChange,
        onPreviewChange,
      });
    }
  }, [entries, onPreviewChange, onSelectionChange, query, revealTarget]);

  useEffect(() => {
    paneviewApiRef.current?.getPanel('properties')?.api.updateParameters({
      selected: visibleSelection,
      preview: selectedPreview?.state,
      onRetryPreview: selectedPreview?.retry,
      onPreviewDecodeError: selectedPreview?.decodeError,
      onPreviewDecoded: selectedPreview?.decoded,
    });
  }, [selectedPreview, visibleSelection]);

  useEffect(() => {
    if (!revealTarget) {
      return;
    }
    paneviewApiRef.current?.getPanel(revealTarget.entryPath)?.api.setExpanded(true);
  }, [revealTarget]);

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
  const visibleNodes = useMemo(
    () => (manifest ? getVisibleModelComponents(manifest, normalizedQuery) : []),
    [manifest, normalizedQuery],
  );
  const leafPartIds = useMemo(
    () =>
      manifest?.nodeOrder.filter((id) => {
        const node = manifest.nodesById[id];
        return node?.kind === 'part' && node.childIds.length === 0;
      }) ?? [],
    [manifest],
  );
  const project = useProject({ enableNoContext: true });
  const currentSelection = selectedComponentIds.at(-1);
  const imageService = useOptionalHeadlessImageService();
  const sharedThumbnails = useOptionalPartThumbnailService(unitId);
  const [localThumbnails, setLocalThumbnails] = useState<PartThumbnailService>();
  const thumbnails = sharedThumbnails ?? localThumbnails;
  const sourceDigests = useRef(new WeakMap<Uint8Array<ArrayBuffer>, Promise<string>>());
  const subscribePreviews = useCallback(
    (listener: () => void) => thumbnails?.subscribe(listener) ?? (() => undefined),
    [thumbnails],
  );
  const getPreviewSnapshot = useCallback(() => thumbnails?.snapshot() ?? emptyPreviewSnapshot, [thumbnails]);
  const previews = useSyncExternalStore(subscribePreviews, getPreviewSnapshot, getPreviewSnapshot);
  const selectedPreview = currentSelection ? previews.get(currentSelection) : undefined;
  const [previewRetryRevision, setPreviewRetryRevision] = useState(0);
  const manualPreviewRetry = useRef<string | undefined>(undefined);
  const retryPreview = useCallback(
    (id?: string) => {
      manualPreviewRetry.current = id ?? currentSelection;
      setPreviewRetryRevision((value) => value + 1);
    },
    [currentSelection],
  );
  const [visiblePreviewIds, setVisiblePreviewIds] = useState<readonly string[]>([]);
  const artifact = useSelector(graphicsRef, (state) => state.context.artifact);
  const artifactKey = useSelector(graphicsRef, (state) => state.context.artifactKey);
  const presentedKey = useSelector(graphicsRef, (state) => state.context.gltfPresentation.presentedKey);

  useEffect(() => {
    if (!imageService || sharedThumbnails) {
      return undefined;
    }
    const service = new PartThumbnailService(imageService);
    // oxlint-disable-next-line react/set-state-in-effect -- This effect owns the service's StrictMode replay lifecycle.
    setLocalThumbnails(service);
    return () => {
      service.dispose();
      setLocalThumbnails((current) => (current === service ? undefined : current));
    };
  }, [imageService, sharedThumbnails]);

  useEffect(() => () => thumbnails?.releaseOwner('explorer'), [thumbnails]);

  useEffect(() => {
    const scroller = contentRef.current;
    if (!scroller) {
      return undefined;
    }
    const mounted = new Set<HTMLElement>();
    const inView = new Set<string>();
    const publishVisible = (): void => {
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
              for (const entry of entries) {
                const row = entry.target as HTMLElement;
                const id = row.dataset['modelComponentId'];
                if (!id || !mounted.has(row)) {
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
      const rows = new Set(scroller.querySelectorAll<HTMLElement>('[data-model-component-row]'));
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
      mountedRows.disconnect();
      observer?.disconnect();
    };
  }, [manifest, normalizedQuery]);

  useEffect(() => {
    if (!thumbnails) {
      return;
    }
    thumbnails.announcePresentedSource(presentedKey);
    if (artifact?.mimeType !== 'model/gltf-binary' || artifactKey !== presentedKey || !manifest) {
      thumbnails.releaseOwner('explorer');
      return;
    }
    const selected = selectedComponentIds.at(-1);
    const ids = [...new Set([selected, ...visiblePreviewIds].filter((id): id is string => id !== undefined))];
    const parts: PartThumbnailRequest[] = ids.flatMap((id) => {
      const node = manifest.nodesById[id];
      return node?.kind === 'part' && node.primitiveRefs?.length ? [{ id, primitives: node.primitiveRefs }] : [];
    });
    let active = true;
    const { content } = artifact;
    const requestedParts = parts.slice(0, 128);
    const manualPartId = manualPreviewRetry.current;
    manualPreviewRetry.current = undefined;
    if (content.byteLength > 64 * 1024 * 1024) {
      thumbnails.failPreparationForOwner(
        'explorer',
        requestedParts,
        new RangeError('Part thumbnail source exceeds 64 MiB'),
      );
      return;
    }
    let sourceDigest = sourceDigests.current.get(content);
    if (!sourceDigest) {
      sourceDigest = sourceGlbDigest(content);
      sourceDigests.current.set(content, sourceDigest);
    }
    const prepare = async (): Promise<void> => {
      try {
        const [hash, prepared] = await Promise.all([
          sourceDigest,
          canonicalPartPreviews(
            content,
            requestedParts.map((part) => part.primitives),
          ),
        ]);
        if (active) {
          thumbnails.requestForOwner(
            'explorer',
            { sourcePath: params.entryPath, geometryHash: hash, content, renderContent: prepared.renderContent },
            requestedParts.map((part, index) => ({
              ...part,
              visualKey: prepared.previews[index]?.key ?? prepared.visualKey,
            })),
            manualPartId ? { manualPartId } : undefined,
          );
        }
      } catch (error) {
        if (active) {
          if (sourceDigests.current.get(content) === sourceDigest) {
            sourceDigests.current.delete(content);
          }
          thumbnails.failPreparationForOwner('explorer', requestedParts, error);
        }
      }
    };
    void prepare();
    return () => {
      active = false;
    };
  }, [
    artifact,
    artifactKey,
    manifest,
    params.entryPath,
    presentedKey,
    previewRetryRevision,
    selectedComponentIds,
    thumbnails,
    visiblePreviewIds,
  ]);

  useEffect(() => {
    const selectedId = selectedComponentIds.at(-1);
    params.onSelectionChange?.(unitId, selectedId ? manifest?.nodesById[selectedId] : undefined, params.entryPath);
  }, [manifest, params.entryPath, params.onSelectionChange, selectedComponentIds, unitId]);

  useEffect(() => {
    if (currentSelection) {
      params.onPreviewChange?.({
        unitId,
        componentId: currentSelection,
        preview: selectedPreview,
        retry: retryPreview,
        decodeError: () => {
          if (selectedPreview?.bytes) {
            thumbnails?.failDecode(currentSelection, selectedPreview.bytes);
          }
        },
        decoded: () => {
          if (selectedPreview?.bytes) {
            thumbnails?.markDecoded(currentSelection, selectedPreview.bytes);
          }
        },
      });
    }
  }, [currentSelection, params.onPreviewChange, retryPreview, selectedPreview, unitId]);

  if (!manifest || !root || childCount === 0) {
    return <ModelPaneviewPanelSurface />;
  }

  return (
    <ModelPaneviewPanelSurface
      contentRef={contentRef}
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
              onReveal={project?.editorRef}
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
          onPreviewDecodeError={(id, bytes) => thumbnails?.failDecode(id, bytes)}
          onPreviewDecoded={(id, bytes) => thumbnails?.markDecoded(id, bytes)}
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

function ModelPropertiesPaneviewPanel({ params }: { readonly params: ModelPropertiesPanelParams }): React.JSX.Element {
  return (
    <div className={cn('h-full overflow-y-auto! scroll-shadows-y', paneviewAttachedBodyClassName)}>
      <PartPropertiesPanel
        node={params.selected?.node}
        entryPath={params.selected?.entryPath}
        preview={params.preview}
        onRetryPreview={params.onRetryPreview}
        onPreviewDecodeError={params.onPreviewDecodeError}
        onPreviewDecoded={params.onPreviewDecoded}
      />
    </div>
  );
}

function ModelPropertiesPaneviewHeader({ api }: { readonly api: PaneviewPanelApi }): React.JSX.Element {
  return <PaneviewHeader api={api} title='Properties' />;
}

const paneviewComponents = { modelPanel: ModelPaneviewPanel, propertiesPanel: ModelPropertiesPaneviewPanel };
const paneviewHeaderComponents = { modelHeader: ModelPaneviewHeader, propertiesHeader: ModelPropertiesPaneviewHeader };

const componentKey = (node: GeometryComponentNode): string => node.id;
const partKey = (id: string): string => id;

/** Preorder projection retaining matching ancestors, computed once per manifest/search. */
export function getVisibleModelComponents(
  manifest: GeometryComponentManifest,
  normalizedQuery: string,
): GeometryComponentNode[] {
  const root = manifest.nodesById[manifest.rootId];
  if (!root) {
    return [];
  }
  const ordered: GeometryComponentNode[] = [];
  const pending = [...root.childIds].reverse();
  while (pending.length > 0) {
    const node = manifest.nodesById[pending.pop()!];
    if (!node) {
      continue;
    }
    ordered.push(node);
    for (let index = node.childIds.length - 1; index >= 0; index -= 1) {
      pending.push(node.childIds[index]!);
    }
  }
  if (!normalizedQuery) {
    return ordered;
  }
  const matching = new Set<string>();
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const node = ordered[index]!;
    if (
      node.name.toLowerCase().includes(normalizedQuery) ||
      (node.appearance?.materials?.some((material) => material.name?.toLowerCase().includes(normalizedQuery)) ??
        false) ||
      node.childIds.some((id) => matching.has(id))
    ) {
      matching.add(node.id);
    }
  }
  return ordered.filter((node) => matching.has(node.id));
}

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
  readonly graphicsRef: GraphicsActorRef;
  readonly unitId: string;
  readonly entryPath: string;
  readonly onReveal: NonNullable<ReturnType<typeof useProject>>['editorRef'] | undefined;
}): React.JSX.Element {
  const renderItem = useCallback(
    (_index: number, id: string) => (
      <button
        type='button'
        className='block w-full truncate rounded-sm px-2 py-1 text-left text-xs hover:bg-sidebar-accent focus-visible:focus-outline'
        onClick={() => {
          graphicsRef.send({ type: 'selectModelComponent', unitId, componentId: id, source: 'explorer' });
          onReveal?.send({ type: 'revealModelComponentInExplorer', entryPath, unitId, componentId: id });
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
  readonly graphicsRef: GraphicsActorRef;
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

export const ComponentRow = memo(function ComponentRow({
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
  activeRowId,
  onRowFocus,
  preview,
  onRetryPreview,
  onPreviewDecodeError,
  onPreviewDecoded,
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
  readonly activeRowId?: string;
  readonly onRowFocus?: (id: string) => void;
  readonly preview?: PartThumbnailState;
  readonly onRetryPreview?: (id: string) => void;
  readonly onPreviewDecodeError?: (id: string, bytes: Uint8Array<ArrayBuffer>) => void;
  readonly onPreviewDecoded?: (id: string, bytes: Uint8Array<ArrayBuffer>) => void;
}): React.JSX.Element {
  const isHovered = hoveredComponentId === node.id;
  const normalizedQuery = query.trim().toLowerCase();
  const materialMatchName =
    normalizedQuery && !node.name.toLowerCase().includes(normalizedQuery)
      ? node.appearance?.materials?.find(
          (material) => typeof material.name === 'string' && material.name.toLowerCase().includes(normalizedQuery),
        )?.name
      : undefined;
  const visibilityAction = getVisibilityAction({ isHidden, nodeName: node.name, unitId, componentId: node.id });
  const isolationAction = getIsolationAction({ isIsolated, nodeName: node.name, unitId, componentId: node.id });
  const VisibilityIcon = visibilityAction.Icon;
  /* The sidebar row's action: 24 px with the nested-action tone (nested-action surfaces R5). */
  const actionButtonClassName = nestedActionVariants({
    className: cn(
      'flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0',
      'focus-visible:bg-nested-action-hover focus-visible:text-foreground focus-visible:opacity-100 focus-visible:focus-outline',
      'group-hover/part:opacity-100 group-focus-within/part:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100',
      (isHovered || isIsolated) && 'opacity-100',
    ),
  });
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
            // The sidebar row's lit states and inset: `pr-0.5` gives a 24 px action the 2 px it has above and below.
            'group/part relative flex h-7 w-full items-center justify-between rounded-md py-1 pr-0.5 pl-2 text-sm leading-5',
            'focus-within:bg-sidebar-accent focus-within:text-sidebar-accent-foreground has-[[aria-haspopup=menu][data-state=open]]:bg-sidebar-accent',
            isSelected ? 'bg-primary/10 text-foreground' : 'text-sidebar-foreground',
            !isSelected && isFocused
              ? 'bg-sidebar-accent/70 text-foreground ring-1 ring-inset ring-primary/30'
              : undefined,
            !isSelected && !isFocused && isIsolated ? 'text-primary' : undefined,
            !isSelected && !isFocused ? 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground' : undefined,
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
                'pointer-events-none absolute inset-y-0 w-px bg-border/60 group-hover/part:opacity-100 group-focus-within/part:opacity-100',
                isSelected || isFocused ? 'opacity-100' : 'opacity-45',
              )}
              style={{ left: `${8 + depth * 12}px` }}
            />
          ))}
          <button
            type='button'
            data-model-part-button=''
            data-model-component-id={node.id}
            tabIndex={activeRowId === undefined || activeRowId === node.id ? 0 : -1}
            className='flex h-full min-w-0 flex-1 items-center gap-2 rounded-sm text-left outline-none focus-visible:focus-outline'
            aria-label={node.name}
            aria-pressed={isSelected}
            aria-busy={preview?.status === 'pending' || undefined}
            onClick={toggleSelection}
            onFocus={() => {
              onRowFocus?.(node.id);
            }}
            onKeyDown={(event) => {
              if (event.shiftKey && event.key === 'F10') {
                event.preventDefault();
                const row = event.currentTarget.closest('[data-model-component-row]');
                if (row) {
                  const bounds = row.getBoundingClientRect();
                  row.dispatchEvent(
                    new MouseEvent('contextmenu', {
                      bubbles: true,
                      cancelable: true,
                      clientX: bounds.left + bounds.width / 2,
                      clientY: bounds.bottom,
                    }),
                  );
                }
              }
            }}
          >
            {preview?.bytes ? (
              <PartPreviewImage
                bytes={preview.bytes}
                className={cn(
                  'size-5 shrink-0 rounded-sm bg-muted object-contain ring-1 ring-border',
                  preview.status === 'pending' && 'opacity-50',
                )}
                onError={() => onPreviewDecodeError?.(node.id, preview.bytes!)}
                onLoad={() => onPreviewDecoded?.(node.id, preview.bytes!)}
              />
            ) : node.appearance?.materials?.length ? (
              <MaterialSwatch materials={node.appearance.materials} />
            ) : (
              <Box
                aria-hidden='true'
                data-testid='component-color-icon'
                className='size-4 shrink-0'
                style={node.appearance?.color ? { fill: node.appearance.color } : undefined}
              />
            )}
            <span className='truncate'>
              <HighlightText text={node.name} searchTerm={query} />
            </span>
            {preview?.status === 'pending' || preview?.status === 'failed' ? (
              <span className='sr-only'>Preview {preview.status === 'pending' ? 'loading' : 'unavailable'}</span>
            ) : undefined}
            {materialMatchName ? (
              <span className='truncate text-xs text-muted-foreground'>· {materialMatchName}</span>
            ) : undefined}
          </button>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type='button'
                tabIndex={-1}
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
                tabIndex={-1}
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
            preview={preview}
            onRetryPreview={
              onRetryPreview
                ? () => {
                    onRetryPreview(node.id);
                  }
                : undefined
            }
            onPreviewDecodeError={preview?.bytes ? () => onPreviewDecodeError?.(node.id, preview.bytes!) : undefined}
            onPreviewDecoded={preview?.bytes ? () => onPreviewDecoded?.(node.id, preview.bytes!) : undefined}
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
        preview={preview}
        onRetryPreview={
          onRetryPreview
            ? () => {
                onRetryPreview(node.id);
              }
            : undefined
        }
        onPreviewDecodeError={preview?.bytes ? () => onPreviewDecodeError?.(node.id, preview.bytes!) : undefined}
        onPreviewDecoded={preview?.bytes ? () => onPreviewDecoded?.(node.id, preview.bytes!) : undefined}
      />
    </ContextMenu>
  );
});

function ExplorerEmptyState(): React.JSX.Element {
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
