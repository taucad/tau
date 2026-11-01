import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PaneviewPanel } from 'dockview-react';
import type { PaneviewApi } from 'dockview-react';
import type { GeometryComponentNode } from '@taucad/types';
import { SearchInput } from '@taucad/ui/components/search-input';
import { PaneSearchRegion } from '@taucad/ui/components/pane-search';
import type { PartThumbnailState } from '@taucad/viewer/cad/part-thumbnail-state';
import type { WorkbenchUnit } from '#host/workbench-host.jsx';
import { useWorkbenchPanesHost } from '#host/workbench-host.jsx';
import type { ModelComponentTarget, ModelPanelLayout } from '#model/model-source.js';
import type {
  ModelComponentRevealTarget,
  ModelPaneviewPanelParams,
  ModelPropertiesPanelParams,
} from '#model/model-unit-section.jsx';
import {
  ExplorerEmptyState,
  ModelPaneviewHeader,
  ModelPaneviewPanel,
  ModelPropertiesPaneviewHeader,
  ModelPropertiesPaneviewPanel,
} from '#model/model-unit-section.jsx';
import { isPreviewablePart } from '#model/visible-components.js';
import { Paneview } from '#paneview/paneview.jsx';
import { paneviewAttachedSurfaceStyleOverrides, paneviewHeaderSize } from '#paneview/paneview-header.jsx';

const defaultLayout: ModelPanelLayout = {
  savedState: {},
  connectApi() {
    /* The host keeps no layout. */
  },
};
const useDefaultLayout = (): ModelPanelLayout => defaultLayout;

/**
 * The root font size in px; 16 where there is no document (SSR).
 *
 * @returns The root font size, in px.
 */
function readRootFontSize(): number {
  if (typeof document === 'undefined') {
    return 16;
  }
  const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(rootFontSize) && rootFontSize > 0 ? rootFontSize : 16;
}

/**
 * The smallest body of an entry section, in px: one part row whole, with the weight footer under it.
 *
 * The row is its 80 px preview plus `py-1` (0.5rem), inside the scroller's `p-2` (1rem); the footer is one `text-xs`
 * line (1rem) with `py-1` (0.5rem) and a 1 px border. Only the preview is fixed in px, so the floor follows the root
 * font size: at 200% text a 144 px body clips the row.
 *
 * @param rootFontSize - The root font size, in px.
 * @returns The floor, in px.
 */
function unitMinimumBodySize(rootFontSize: number): number {
  return Math.max(144, Math.ceil(81 + 3 * rootFontSize));
}

/**
 * Raise or lower each entry section's floor to {@link unitMinimumBodySize} for the current root font size. Setting a
 * section's size makes the Paneview clamp it again, so a section now under its floor grows and the others give way.
 *
 * @param api - The Paneview, once it is ready.
 * @param entryPaths - The entry sections to fit.
 */
function fitUnitMinimumBodySizes(api: PaneviewApi | undefined, entryPaths: readonly string[]): void {
  if (!api) {
    return;
  }
  const minimumBodySize = unitMinimumBodySize(readRootFontSize());
  for (const entryPath of entryPaths) {
    const panel = api.getPanel(entryPath);
    if (!(panel instanceof PaneviewPanel) || panel.minimumBodySize === minimumBodySize) {
      continue;
    }
    panel.minimumBodySize = minimumBodySize;
    panel.api.setSize({ size: panel.size });
  }
}

function getInitialPanelOptions(
  saved: ModelPanelLayout['savedState'],
  panelId: string,
  defaults: { isExpanded: boolean; size?: number },
): { isExpanded: boolean; size?: number } {
  const entry = saved[panelId];
  if (!entry) {
    return defaults;
  }
  return { isExpanded: entry.isExpanded, size: entry.size };
}

/**
 * The Model pane body: one filter over a section per geometry entry (its component tree) and a Properties section
 * for the selected part. Units come from the host's `useUnits`, everything else from its {@link ModelSource}.
 *
 * @param props - Called when a reveal request needs the pane on screen.
 * @returns The filter over the entry sections and the Properties section.
 * @public
 */
export function ModelPane({ onRequestOpen }: { readonly onRequestOpen?: () => void }): React.JSX.Element {
  const host = useWorkbenchPanesHost();
  const units = host.useUnits();
  const reveal = host.model?.reveal;
  const [query, setQuery] = useState('');
  const [revealTarget, setRevealTarget] = useState<ModelComponentRevealTarget>();
  const revealComponent = useCallback(
    (target: ModelComponentTarget) => {
      onRequestOpen?.();
      setQuery('');
      setRevealTarget((current) => ({
        entryPath: target.entryPath,
        unitId: target.unitId,
        componentId: target.componentId,
        requestId: (current?.requestId ?? 0) + 1,
      }));
    },
    [onRequestOpen],
  );
  useEffect(() => reveal?.subscribe(revealComponent), [reveal, revealComponent]);
  const filterRef = useRef<HTMLDivElement>(null);
  const paneviewApiRef = useRef<PaneviewApi | undefined>(undefined);
  // The filter's height is in rem, so it resizes exactly when the root font size does (browser text size, zoom
  // settings): the entry sections' floors follow it in the same frame, before the enlarged rows paint clipped.
  useEffect(() => {
    const filter = filterRef.current;
    if (!filter || typeof ResizeObserver === 'undefined') {
      return;
    }
    const entryPaths = units.map(({ entryPath }) => entryPath);
    const observer = new ResizeObserver(() => {
      fitUnitMinimumBodySizes(paneviewApiRef.current, entryPaths);
    });
    observer.observe(filter);
    return () => {
      observer.disconnect();
    };
  }, [units]);

  return (
    <div data-slot='model-panel-body' className='flex size-full min-h-0 flex-col overflow-hidden bg-sidebar text-sm'>
      <PaneSearchRegion ref={filterRef} data-slot='model-filter' className='shrink-0 bg-sidebar px-2 pt-2'>
        <SearchInput
          aria-label='Filter parts'
          placeholder='Filter parts…'
          value={query}
          className='h-7 min-w-0 bg-background pointer-coarse:h-10'
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          onClear={() => {
            setQuery('');
          }}
        />
      </PaneSearchRegion>
      <div className='min-h-0 flex-1 overflow-hidden'>
        {units.length === 0 ? (
          <ExplorerEmptyState />
        ) : (
          <ModelPaneview
            paneviewApiRef={paneviewApiRef}
            units={units}
            query={query}
            revealTarget={revealTarget}
            onReveal={reveal?.request ?? revealComponent}
          />
        )}
      </div>
    </div>
  );
}

function ModelPaneview({
  paneviewApiRef,
  units,
  query,
  revealTarget,
  onReveal,
}: {
  /** Filled with the Paneview's api once it is ready, for the text-size floors the pane keeps. */
  readonly paneviewApiRef: React.RefObject<PaneviewApi | undefined>;
  readonly units: readonly WorkbenchUnit[];
  readonly query: string;
  readonly revealTarget: ModelComponentRevealTarget | undefined;
  readonly onReveal: (target: ModelComponentTarget) => void;
}): React.JSX.Element {
  const source = useWorkbenchPanesHost().model;
  const usePanelLayout = source?.usePanelLayout ?? useDefaultLayout;
  const { savedState, connectApi } = usePanelLayout();
  const paneviewKey = useMemo(() => units.map(({ entryPath }) => entryPath).join('\0'), [units]);
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
    selected && units.some(({ entryPath }) => entryPath === selected.entryPath) ? selected : undefined;
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
  const openPartGallery = source?.openPartGallery;
  const hasThumbnails = source?.useThumbnails !== undefined;
  const selectedGraphicsRef = units.find(({ entryPath }) => entryPath === visibleSelection?.entryPath)?.graphicsRef;
  const onOpenPreview = useMemo(
    () =>
      openPartGallery &&
      hasThumbnails &&
      selectedGraphicsRef &&
      visibleSelection &&
      isPreviewablePart(visibleSelection.node)
        ? (origin: HTMLElement) => {
            openPartGallery({
              graphicsRef: selectedGraphicsRef,
              unitId: visibleSelection.unitId,
              componentId: visibleSelection.node.id,
              source: 'explorer',
              origin,
            });
          }
        : undefined,
    [hasThumbnails, openPartGallery, selectedGraphicsRef, visibleSelection],
  );

  const handleReady = useCallback(
    ({ api }: { api: PaneviewApi }) => {
      paneviewApiRef.current = api;
      connectApi(api);

      for (const { entryPath, graphicsRef } of units) {
        const initial = getInitialPanelOptions(savedState, entryPath, { isExpanded: true, size: 200 });
        api.addPanel({
          id: entryPath,
          title: entryPath,
          component: 'modelPanel',
          headerComponent: 'modelHeader',
          headerSize: paneviewHeaderSize,
          isExpanded: initial.isExpanded,
          minimumBodySize: unitMinimumBodySize(readRootFontSize()),
          size: initial.size,
          params: {
            entryPath,
            graphicsRef,
            query,
            revealTarget,
            onReveal,
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
          onOpenPreview,
          onRetryPreview: selectedPreview?.retry,
          onPreviewDecodeError: selectedPreview?.decodeError,
          onPreviewDecoded: selectedPreview?.decoded,
        } satisfies ModelPropertiesPanelParams,
      });
    },
    [
      connectApi,
      units,
      onOpenPreview,
      onPreviewChange,
      onReveal,
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

    for (const { entryPath, graphicsRef } of units) {
      api.getPanel(entryPath)?.api.updateParameters({
        entryPath,
        graphicsRef,
        query,
        revealTarget: revealTarget?.entryPath === entryPath ? revealTarget : undefined,
        onReveal,
        onSelectionChange,
        onPreviewChange,
      });
    }
  }, [units, onPreviewChange, onReveal, onSelectionChange, query, revealTarget]);

  useEffect(() => {
    paneviewApiRef.current?.getPanel('properties')?.api.updateParameters({
      selected: visibleSelection,
      preview: selectedPreview?.state,
      onOpenPreview,
      onRetryPreview: selectedPreview?.retry,
      onPreviewDecodeError: selectedPreview?.decodeError,
      onPreviewDecoded: selectedPreview?.decoded,
    });
  }, [onOpenPreview, selectedPreview, visibleSelection]);

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

const paneviewComponents = { modelPanel: ModelPaneviewPanel, propertiesPanel: ModelPropertiesPaneviewPanel };
const paneviewHeaderComponents = { modelHeader: ModelPaneviewHeader, propertiesHeader: ModelPropertiesPaneviewHeader };
