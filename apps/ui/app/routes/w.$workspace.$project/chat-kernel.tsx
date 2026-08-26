import { Activity, XIcon } from 'lucide-react';
import { memo, useCallback, useMemo } from 'react';
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
  FloatingPanelTrigger,
} from '#components/ui/floating-panel.js';
import { cn } from '#utils/ui.utils.js';
import { PaneviewHeader, PaneviewHeaderControls, paneviewStyleOverrides } from '#components/panes/paneview-header.js';
import { useProject } from '#hooks/use-project.js';
import type { cadMachine } from '#machines/cad.machine.js';
import { sortGeometryUnitEntries } from '#routes/w.$workspace.$project/geometry-unit.utils.js';
import { GeometryUnitTiming, GeometryUnitSummary } from '#routes/w.$workspace.$project/chat-kernel-timing.js';
import { GeometryUnitLogs } from '#routes/w.$workspace.$project/chat-kernel-logs.js';
import {
  usePaneviewPersistence,
  getInitialPanelOptions,
} from '#routes/w.$workspace.$project/use-chat-interface-state.js';

// ---------------------------------------------------------------------------
// Paneview panel body: timing + logs for a single geometry unit
// ---------------------------------------------------------------------------

type KernelPanelParams = {
  entryPath: string;
  cadRef: ActorRefFrom<typeof cadMachine>;
};

function KernelPanelBody({ params }: { readonly params: KernelPanelParams }): React.JSX.Element {
  return (
    <div>
      <GeometryUnitTiming cadRef={params.cadRef} />
      <div className='mx-2 border-t border-border/20' />
      <GeometryUnitLogs entryPath={params.entryPath} />
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
}: {
  readonly entries: Array<[string, ActorRefFrom<typeof cadMachine>]>;
  readonly mainEntryPath: string;
}): React.JSX.Element {
  const { savedState, connectApi } = usePaneviewPersistence('kernelPaneview');

  const sortedEntries = useMemo(() => sortGeometryUnitEntries(entries, mainEntryPath), [entries, mainEntryPath]);

  const paneviewKey = useMemo(() => sortedEntries.map(([file]) => file).join('\0'), [sortedEntries]);

  const handleReady = useCallback(
    (event: { api: PaneviewApi }) => {
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
          isExpanded: initial.isExpanded,
          minimumBodySize: 80,
          size: initial.size,
          params: { entryPath, cadRef } satisfies KernelPanelParams,
        });
      }
    },
    [sortedEntries, mainEntryPath, savedState, connectApi],
  );

  return (
    <PaneviewReact
      key={paneviewKey}
      className={paneviewStyleOverrides}
      components={paneviewComponents}
      headerComponents={paneviewHeaderComponents}
      onReady={handleReady}
    />
  );
}

// ---------------------------------------------------------------------------
// Kernel content
// ---------------------------------------------------------------------------

function KernelContent(): React.JSX.Element {
  const { geometryUnits, mainEntryPath } = useProject();
  const entries = useMemo(() => [...geometryUnits.entries()], [geometryUnits]);

  if (entries.length === 0) {
    return <p className='p-4 text-center text-xs text-muted-foreground'>No geometry units.</p>;
  }

  return <KernelPaneview entries={entries} mainEntryPath={mainEntryPath} />;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const ChatKernelTrigger = memo(
  ({ isOpen, onToggle }: { readonly isOpen: boolean; readonly onToggle: () => void }): React.JSX.Element => (
    <FloatingPanelTrigger
      icon={Activity}
      tooltipContent={<div className='flex items-center gap-2'>{isOpen ? 'Close' : 'Open'} Kernel</div>}
      tooltipSide='right'
      className={isOpen ? 'text-primary' : undefined}
      onClick={onToggle}
    />
  ),
);

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
          <FloatingPanelContentTitle>Kernel</FloatingPanelContentTitle>
          <FloatingPanelContentHeaderActions>
            <FloatingPanelClose
              icon={XIcon}
              tooltipContent={(isOpen) => (
                <div className='flex items-center gap-2'>{isOpen ? 'Close' : 'Open'} Kernel</div>
              )}
            />
          </FloatingPanelContentHeaderActions>
        </FloatingPanelContentHeader>

        <FloatingPanelContentBody className='flex-1 overflow-y-auto p-0'>
          <KernelContent />
        </FloatingPanelContentBody>
      </FloatingPanelContent>
    </FloatingPanel>
  ),
);
