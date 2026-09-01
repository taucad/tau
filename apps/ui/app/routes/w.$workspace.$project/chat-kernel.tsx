import { XIcon } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ActorRefFrom } from 'xstate';
import type { PaneviewApi, PaneviewPanelApi } from 'dockview-react';
import { PaneviewReact } from 'dockview-react';
import {
  FloatingPanel,
  FloatingPanelClose,
  FloatingPanelContent,
  FloatingPanelContentBody,
  FloatingPanelContentHeader,
  FloatingPanelContentHeaderActions,
  FloatingPanelContentTitle,
} from '#components/ui/floating-panel.js';
import { cn } from '@taucad/ui/utils/cn';
import { SearchInput } from '#components/search-input.js';
import {
  PaneviewHeader,
  PaneviewHeaderControls,
  paneviewAttachedSurfaceStyleOverrides,
  paneviewHeaderSize,
} from '#components/panes/paneview-header.js';
import { useProject } from '#hooks/use-project.js';
import type { cadMachine } from '#machines/cad.machine.js';
import { sortGeometryUnitEntries } from '#routes/w.$workspace.$project/geometry-unit.utils.js';
import { GeometryUnitTiming, GeometryUnitSummary } from '#routes/w.$workspace.$project/chat-kernel-timing.js';
import {
  usePaneviewPersistence,
  getInitialPanelOptions,
} from '#routes/w.$workspace.$project/use-chat-interface-state.js';

// ---------------------------------------------------------------------------
// Paneview panel body: timing for a single geometry unit
// ---------------------------------------------------------------------------

type KernelPanelParams = {
  entryPath: string;
  cadRef: ActorRefFrom<typeof cadMachine>;
  query: string;
};

function KernelPanelBody({ params }: { readonly params: KernelPanelParams }): React.JSX.Element {
  return (
    <div
      data-slot='telemetry-unit-surface'
      className='h-full overflow-hidden rounded-b-xl border border-border bg-card'
    >
      <GeometryUnitTiming cadRef={params.cadRef} query={params.query} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Paneview panel header: entry path name + summary badge
// ---------------------------------------------------------------------------

function KernelPanelHeader({
  api,
  params,
}: {
  readonly api: PaneviewPanelApi;
  readonly params: KernelPanelParams;
}): React.JSX.Element {
  return (
    <PaneviewHeader api={api} title={params.entryPath}>
      <PaneviewHeaderControls>
        <GeometryUnitSummary cadRef={params.cadRef} />
      </PaneviewHeaderControls>
    </PaneviewHeader>
  );
}

const paneviewComponents = { kernelPanel: KernelPanelBody };
const paneviewHeaderComponents = { kernelHeader: KernelPanelHeader };

// ---------------------------------------------------------------------------
// Multi-geometry unit Paneview layout
// ---------------------------------------------------------------------------

function KernelPaneview({
  entries,
  mainEntryPath,
  query,
}: {
  readonly entries: Array<[string, ActorRefFrom<typeof cadMachine>]>;
  readonly mainEntryPath: string;
  readonly query: string;
}): React.JSX.Element {
  const { savedState, connectApi } = usePaneviewPersistence('kernelPaneview');
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
          component: 'kernelPanel',
          headerComponent: 'kernelHeader',
          headerSize: paneviewHeaderSize,
          isExpanded: initial.isExpanded,
          minimumBodySize: 80,
          size: initial.size,
          params: { entryPath, cadRef, query } satisfies KernelPanelParams,
        });
      }
    },
    [sortedEntries, mainEntryPath, query, savedState, connectApi],
  );

  useEffect(() => {
    const api = paneviewApiRef.current;
    if (!api) {
      return;
    }
    for (const [entryPath, cadRef] of sortedEntries) {
      api.getPanel(entryPath)?.api.updateParameters({ entryPath, cadRef, query });
    }
  }, [query, sortedEntries]);

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
// Kernel content
// ---------------------------------------------------------------------------

function TelemetryPaneviewContent({ query }: { readonly query: string }): React.JSX.Element {
  const { geometryUnits, mainEntryPath } = useProject();
  const entries = useMemo(() => [...geometryUnits.entries()], [geometryUnits]);

  if (entries.length === 0) {
    return <p className='p-4 text-center text-xs text-muted-foreground'>No geometry units.</p>;
  }

  return <KernelPaneview entries={entries} mainEntryPath={mainEntryPath} query={query} />;
}

export function TelemetryPanelContent(): React.JSX.Element {
  const [query, setQuery] = useState('');

  return (
    <div data-slot='telemetry-panel-body' className='flex size-full min-h-0 flex-col overflow-hidden bg-sidebar'>
      <div data-slot='telemetry-filter' className='shrink-0 bg-sidebar px-2 pt-2'>
        <SearchInput
          aria-label='Filter telemetry'
          placeholder='Filter telemetry...'
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
        <TelemetryPaneviewContent query={query} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const ChatKernel = memo(
  ({
    isExpanded,
    setIsExpanded,
    className,
  }: {
    readonly isExpanded: boolean;
    readonly setIsExpanded: (isExpanded: boolean | ((previous: boolean) => boolean)) => void;
    readonly className?: string;
  }): React.JSX.Element => (
    <FloatingPanel isOpen={isExpanded} side='right' onOpenChange={setIsExpanded}>
      <FloatingPanelContent className={cn('flex h-full flex-col', className)}>
        <FloatingPanelContentHeader>
          <FloatingPanelContentTitle>Telemetry</FloatingPanelContentTitle>
          <FloatingPanelContentHeaderActions>
            <FloatingPanelClose
              icon={XIcon}
              tooltipContent={(isOpen) => (
                <div className='flex items-center gap-2'>{isOpen ? 'Close' : 'Open'} Telemetry</div>
              )}
            />
          </FloatingPanelContentHeaderActions>
        </FloatingPanelContentHeader>

        <FloatingPanelContentBody className='flex-1 overflow-hidden p-0'>
          <TelemetryPanelContent />
        </FloatingPanelContentBody>
      </FloatingPanelContent>
    </FloatingPanel>
  ),
);
