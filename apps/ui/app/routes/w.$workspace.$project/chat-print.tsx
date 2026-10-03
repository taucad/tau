import { useCallback, useMemo, useState } from 'react';
import { CircleAlert, CircleCheck, LoaderCircle, PauseCircle, Printer, RefreshCw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type {
  MachineClient,
  MachineDirectoryEntry,
  MachineOperationReceipt,
  MachineOperationSnapshot,
  PrintRequest,
} from '@taucad/runtime/machine';
import type { RuntimeTransportFacet } from '@taucad/runtime/transport';
import { Badge } from '@taucad/ui/components/badge';
import { Button } from '@taucad/ui/components/button';
import { Progress } from '@taucad/ui/components/progress';
import { cn } from '@taucad/ui/utils/cn';
import { ParameterSelect } from '#components/geometry/parameters/parameter-select.js';
import { PanelEmptyState } from '#components/ui/panel-empty-state.js';
import { useMachineDirectory, useMachinesFacet } from '#hooks/use-machines.js';
import { usePrintApprovalBridge } from '#hooks/use-machines-approvals.js';
import type { PrintApprovalBridge } from '#hooks/use-machines-approvals.js';
import { isOpenPrintRequest, useMachinesPrintRequests } from '#hooks/use-machines-print-requests.js';
import { useMachinesSelection } from '#hooks/use-machines-selection.js';
import { useProject } from '#hooks/use-project.js';
import { useSettingsDialog } from '#hooks/use-settings-dialog.js';
import {
  ControlsSection,
  HistorySection,
  InspectSection,
  MonitorSection,
  describeRun,
  runFileName,
} from '#routes/w.$workspace.$project/chat-print-monitor.js';
import type { LedgerEntry } from '#routes/w.$workspace.$project/chat-print-monitor.js';
import {
  PrepareActions,
  PrepareSection,
  prepareAction,
  slicerName,
  usePrintPrepare,
} from '#routes/w.$workspace.$project/chat-print-prepare.js';
import type { PrepareActionFacts } from '#routes/w.$workspace.$project/chat-print-prepare.js';
import { PrintNotice, useNow } from '#routes/w.$workspace.$project/chat-print-section.js';
import { SendSection } from '#routes/w.$workspace.$project/chat-print-send.js';
import { formatAge } from '#routes/w.$workspace.$project/chat-print-summary.js';

/** Plain orientation copy derived solely from the authoritative directory entry. @public */
export type MachinePresentation = Readonly<{
  label: string;
  icon: LucideIcon;
  /** Color for the glyph only; the text stays neutral (DESIGN, color usage law). */
  iconClassName: string;
}>;

/**
 * How a send in flight reads while the printer's own report still describes the moment before it. An `unknown` start
 * is past that moment, so the printer's report speaks again and the Send card explains.
 */
const inFlightPresentation: Partial<Record<PrintRequest['state'], MachinePresentation>> = {
  approved: {
    label: 'Sending',
    icon: LoaderCircle,
    iconClassName: 'text-information animate-spin motion-reduce:animate-none',
  },
  uploading: {
    label: 'Sending',
    icon: LoaderCircle,
    iconClassName: 'text-information animate-spin motion-reduce:animate-none',
  },
  starting: {
    label: 'Starting',
    icon: LoaderCircle,
    iconClassName: 'text-information animate-spin motion-reduce:animate-none',
  },
  confirming: {
    label: 'Starting',
    icon: LoaderCircle,
    iconClassName: 'text-information animate-spin motion-reduce:animate-none',
  },
};

/**
 * Where the machine is and what it needs, from the entry and the send this pane has in flight.
 *
 * A send in flight speaks first: the printer keeps reporting its previous state (often idle) until it takes the start,
 * so the entry alone would say "Ready" while Tau waits for it (blueprint x1c-start-confirmation F7).
 *
 * @param entry - The machine as observed.
 * @param openRequest - This machine's unsettled request, if any.
 * @returns The status label and glyph.
 * @public
 */
export const presentMachine = (entry: MachineDirectoryEntry, openRequest?: PrintRequest): MachinePresentation => {
  const inFlight = openRequest === undefined ? undefined : inFlightPresentation[openRequest.state];
  if (inFlight && entry.freshness === 'current' && entry.snapshot.connection === 'connected') {
    return inFlight;
  }
  if (entry.freshness === 'stale') {
    return {
      label: 'Stale observation',
      icon: CircleAlert,
      iconClassName: 'text-warning',
    };
  }
  if (entry.snapshot.connection !== 'connected') {
    return {
      label: entry.snapshot.connection === 'unreachable' ? 'Unreachable' : 'Disconnected',
      icon: CircleAlert,
      iconClassName: 'text-destructive',
    };
  }
  const { run } = entry.snapshot;
  if (run?.state === 'printing') {
    return {
      label: 'Printing',
      icon: Printer,
      iconClassName: 'text-information',
    };
  }
  if (run?.state === 'paused') {
    return {
      label: 'Paused',
      icon: PauseCircle,
      iconClassName: 'text-warning',
    };
  }
  if (run && ['failed', 'unknown'].includes(run.state)) {
    return {
      label: run.state === 'failed' ? 'Run failed' : 'Run state unknown',
      icon: CircleAlert,
      iconClassName: 'text-destructive',
    };
  }
  if (entry.snapshot.readiness === 'idle') {
    return {
      label: 'Ready',
      icon: CircleCheck,
      iconClassName: 'text-success',
    };
  }
  return {
    label: entry.snapshot.readiness === 'busy' ? 'Busy' : 'Not ready',
    icon: CircleAlert,
    iconClassName: 'text-warning',
  };
};

/** The one primary step the pane offers. @public */
export type NextAction = Readonly<{
  label: string;
  kind: 'slice' | 'send' | 'review' | 'none';
  /** Why the step cannot be taken yet, shown under its disabled button. */
  blocker?: string;
}>;

/** Run states the pane treats as a print in progress: Prepare folds and the action bar steps aside. */
const runInProgress: ReadonlySet<string> = new Set(['printing', 'paused', 'preparing', 'finishing']);

/**
 * The next thing to do, from the machine, the open request and the prepare state.
 *
 * Physical steps (start, accept, reconcile) are never taken from here; the
 * button only brings the gated card into view. A stale or disconnected machine
 * still slices: only sending waits, and its blocker says so.
 *
 * @param input - The facts the decision reads.
 * @returns The next action.
 * @public
 */
export const nextAction = ({
  entry,
  openRequest,
  prepare,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly openRequest: PrintRequest | undefined;
  readonly prepare: PrepareActionFacts;
}): NextAction => {
  if (openRequest) {
    switch (openRequest.state) {
      case 'awaiting-approval': {
        return {
          label: openRequest.requestedBy.kind === 'agent' ? 'Review the print request' : 'Confirm and start',
          kind: 'review',
        };
      }
      case 'confirming': {
        return { label: 'Waiting for the printer to confirm', kind: 'none' };
      }
      case 'unknown': {
        return { label: 'Check the printer', kind: 'review' };
      }
      default: {
        return { label: 'Sending…', kind: 'none' };
      }
    }
  }
  if (runInProgress.has(entry.snapshot.run?.state ?? 'idle')) {
    return { label: 'Monitor the run', kind: 'none' };
  }
  return prepareAction(prepare, entry.name);
};

/**
 * One notice for a machine the pane cannot currently trust, saying what waits and what still works.
 *
 * @param properties - The machine as observed.
 * @returns The notice, or nothing for a current, connected machine.
 */
function ObservationNotice({ entry }: { readonly entry: MachineDirectoryEntry }): React.JSX.Element | undefined {
  if (entry.freshness === 'stale') {
    return (
      <PrintNotice tone='warning' role='status'>
        No current observation from {entry.name}. Sending and run controls wait until it reports again; slicing still
        works.
      </PrintNotice>
    );
  }
  if (entry.snapshot.connection !== 'connected') {
    return (
      <PrintNotice tone='destructive' role='status'>
        {entry.name} is {entry.snapshot.connection === 'unreachable' ? 'unreachable' : 'disconnected'}. Sending and run
        controls wait until the host reconnects; slicing still works.
      </PrintNotice>
    );
  }
  return undefined;
}

/**
 * The run in progress: its file and progress with the controls that act on it, together.
 *
 * @param properties - The client, machine, its requests and the receipt sink.
 * @returns The run block, or nothing without a run to show.
 */
function RunBlock({
  client,
  entry,
  requests,
  onReceipt,
}: {
  readonly client: MachineClient;
  readonly entry: MachineDirectoryEntry;
  readonly requests: readonly PrintRequest[];
  readonly onReceipt: (receipt: MachineOperationReceipt) => void;
}): React.JSX.Element | undefined {
  const { run } = entry.snapshot;
  const runLine = describeRun(entry);
  if (!run || run.state === 'idle' || run.state === 'succeeded' || runLine === undefined) {
    return undefined;
  }
  const fileName = runFileName(entry, requests);
  return (
    <section aria-label='Run' className='flex min-w-0 flex-col gap-2'>
      <p className='min-w-0 text-xs break-words'>
        {fileName === undefined ? null : (
          <>
            <span className='font-mono'>{fileName}</span>
            <span aria-hidden> · </span>
          </>
        )}
        {runLine}
      </p>
      {run.progress === undefined ? null : (
        <Progress
          aria-label={`${entry.name} print progress`}
          aria-valuenow={run.progress}
          aria-valuetext={`${String(Math.round(run.progress))} percent`}
          value={run.progress}
        />
      )}
      <ControlsSection client={client} entry={entry} requests={requests} onReceipt={onReceipt} />
    </section>
  );
}

/** Printers belong to this computer and are set up once in Settings › Machines, where the access code stays in the host ceremony. */
function NoMachines(): React.JSX.Element {
  const { open } = useSettingsDialog();
  return (
    <PanelEmptyState
      icon={Printer}
      title='No printers yet'
      description='Find a Bambu Lab printer on your network or add the simulated X1C in Settings. Printers set up there are available in every project on this computer.'
    >
      <Button
        type='button'
        size='sm'
        onClick={() => {
          open('machines');
        }}
      >
        Set up a printer
      </Button>
    </PanelEmptyState>
  );
}

/** The observation's age. It ticks every second, so it is no live region: the notice above announces staleness. */
function PrintFooter({ entry }: { readonly entry: MachineDirectoryEntry | undefined }): React.JSX.Element {
  const now = useNow();
  return (
    <p className='flex min-h-8 shrink-0 items-center gap-1.5 border-t border-border/70 px-3 text-xs text-muted-foreground'>
      {entry?.freshness === 'stale' ? <CircleAlert aria-hidden className='size-3.5 shrink-0 text-warning' /> : null}
      <span className='min-w-0 truncate'>
        {entry ? `Observed ${formatAge(entry.snapshot.observedAt, now)}` : 'No machine selected'}
      </span>
    </p>
  );
}

/** The only place the printer is named and chosen, with its status, the Simulated mark and a refresh. */
function PrintHeader({
  entries,
  selected,
  openRequest,
  select,
  refresh,
}: {
  readonly entries: readonly MachineDirectoryEntry[];
  readonly selected: MachineDirectoryEntry | undefined;
  /** The selected machine's unsettled request, which speaks for it while the printer catches up. */
  readonly openRequest: PrintRequest | undefined;
  readonly select: ReturnType<typeof useMachinesSelection>['select'];
  readonly refresh: () => void;
}): React.JSX.Element {
  const presentation = selected ? presentMachine(selected, openRequest) : undefined;
  const Icon = presentation?.icon ?? Printer;
  return (
    <div className='flex min-h-10 shrink-0 items-center gap-2 border-b border-border/70 px-3 text-xs text-muted-foreground'>
      <Icon aria-hidden className={cn('size-3.5 shrink-0', presentation?.iconClassName)} />
      {entries.length > 0 ? (
        <div className='flex min-w-0 flex-1'>
          <ParameterSelect
            label='Machine'
            value={selected?.machineId ?? ''}
            groups={[
              {
                label: 'Printers on this computer',
                options: entries.map((entry) => ({
                  value: entry.machineId,
                  label: entry.name,
                  secondary: presentMachine(entry, entry.machineId === selected?.machineId ? openRequest : undefined)
                    .label,
                })),
              },
            ]}
            onChange={select}
          />
        </div>
      ) : (
        <span className='min-w-0 flex-1'>No printers</span>
      )}
      {selected?.providerId.includes('simulator') ? (
        <Badge variant='outline' className='shrink-0'>
          Simulated
        </Badge>
      ) : null}
      <Button
        type='button'
        size='icon-xs'
        variant='ghost'
        aria-label='Refresh printers'
        title='Refresh printers'
        onClick={refresh}
      >
        <RefreshCw aria-hidden />
      </Button>
    </div>
  );
}

function ConnectedPrintPanel({
  client,
  bridge,
  isShown,
}: {
  readonly client: MachineClient;
  readonly bridge: PrintApprovalBridge;
  readonly isShown: boolean;
}): React.JSX.Element {
  const { projectId } = useProject();
  const { snapshot, providers, error, refresh } = useMachineDirectory(client);
  const entries = useMemo(() => snapshot?.entries.toSorted((a, b) => a.name.localeCompare(b.name)) ?? [], [snapshot]);
  const { selected, select } = useMachinesSelection(projectId, entries);
  return (
    <MachinePrintPanel
      key={`${projectId}:${selected?.machineId ?? ''}`}
      client={client}
      bridge={bridge}
      isShown={isShown}
      projectId={projectId}
      directory={{ snapshot, providers, error, refresh }}
      entries={entries}
      selected={selected}
      select={select}
    />
  );
}

function MachinePrintPanel({
  client,
  bridge,
  isShown,
  projectId,
  directory,
  entries,
  selected,
  select,
}: {
  readonly client: MachineClient;
  readonly bridge: PrintApprovalBridge;
  readonly isShown: boolean;
  readonly projectId: string;
  readonly directory: ReturnType<typeof useMachineDirectory>;
  readonly entries: readonly MachineDirectoryEntry[];
  readonly selected: MachineDirectoryEntry | undefined;
  readonly select: ReturnType<typeof useMachinesSelection>['select'];
}): React.JSX.Element {
  const { snapshot, providers, error, refresh } = directory;
  const provider = providers.find(({ id }) => id === selected?.providerId);
  const manifest = provider?.manifest;
  /* This project's requests only (blueprint D5): the host filters by the id its artifacts carry. */
  const { requests, error: requestsError } = useMachinesPrintRequests(client, selected?.machineId, projectId);
  const [ledger, setLedger] = useState<readonly LedgerEntry[]>([]);
  const record = useCallback((next: LedgerEntry) => {
    setLedger((current) => [next, ...current].slice(0, 50));
  }, []);
  const recordReceipt = useCallback(
    (receipt: MachineOperationReceipt) => {
      record({ kind: 'receipt', receipt });
    },
    [record],
  );
  const recordReconciled = useCallback(
    (reconciled: MachineOperationSnapshot) => {
      record({ kind: 'reconciled', snapshot: reconciled });
    },
    [record],
  );
  const prepare = usePrintPrepare({
    client,
    entry: selected,
    provider,
    manifest,
    isShown: isShown && selected !== undefined,
  });
  const latestReceipt = ledger.find((entry) => entry.kind === 'receipt');
  const openRequest = requests.find((request) => isOpenPrintRequest(request));
  const action = selected ? nextAction({ entry: selected, openRequest, prepare }) : undefined;
  /* A decision or a run owns the pane; Prepare folds behind it and keeps its own actions. */
  const prepareFold = openRequest
    ? 'Prepare a different print'
    : runInProgress.has(selected?.snapshot.run?.state ?? 'idle')
      ? 'Prepare the next print'
      : undefined;

  return (
    <div
      data-slot='print-panel-body'
      className='flex size-full min-h-0 min-w-0 flex-col overflow-hidden bg-sidebar'
      style={
        {
          '--param-field-h': '1.5rem',
          '--param-field-radius': 'var(--radius-md)',
          '--param-field-color': 'var(--color-muted-foreground)',
          '--param-field-color-focus': 'var(--color-foreground)',
        } as React.CSSProperties
      }
    >
      <PrintHeader entries={entries} selected={selected} openRequest={openRequest} select={select} refresh={refresh} />
      <div className='relative flex min-h-0 min-w-0 flex-1 scroll-shadows-y flex-col gap-3 overflow-y-auto p-3 [--scroll-fade-end:transparent] [--scroll-fade-size:28px]'>
        {error ? <PrintNotice tone='destructive'>{error}</PrintNotice> : null}
        {requestsError ? <PrintNotice tone='destructive'>{requestsError}</PrintNotice> : null}
        {snapshot ? null : (
          <div
            role='status'
            aria-busy='true'
            className='grid min-h-full place-items-center text-sm text-muted-foreground'
          >
            <span className='flex items-center gap-2'>
              <LoaderCircle aria-hidden className='size-4 animate-spin motion-reduce:animate-none' />
              Loading machines
            </span>
          </div>
        )}
        {snapshot && entries.length === 0 ? <NoMachines /> : null}
        {selected ? (
          <div className='flex min-w-0 flex-col gap-3'>
            <ObservationNotice entry={selected} />
            <SendSection
              client={client}
              entry={selected}
              manifest={manifest}
              requests={requests}
              bridge={bridge}
              onReconciled={recordReconciled}
            />
            <RunBlock client={client} entry={selected} requests={requests} onReceipt={recordReceipt} />
            <PrepareSection
              entry={selected}
              provider={provider}
              manifest={manifest}
              prepare={prepare}
              fold={prepareFold}
            />
            <MonitorSection client={client} entry={selected} manifest={manifest} />
            <HistorySection requests={requests} ledger={ledger} entry={selected} />
            <InspectSection
              entry={selected}
              provider={provider}
              manifest={manifest}
              slicer={slicerName(prepare.studio)}
              request={openRequest}
            />
          </div>
        ) : null}
        <p aria-live='assertive' role='status' className='sr-only'>
          {latestReceipt?.kind === 'receipt'
            ? `${latestReceipt.receipt.kind} ${latestReceipt.receipt.status} for ${latestReceipt.receipt.machineId}`
            : ''}
        </p>
      </div>
      {selected && prepareFold === undefined && (action?.kind === 'slice' || action?.kind === 'send') ? (
        /* One primary action at a fixed place; the start confirmation opens where Send was pressed. */
        <div className='flex max-h-[60%] min-w-0 shrink-0 flex-col gap-2 overflow-y-auto border-t border-border/70 px-3 py-2'>
          <PrepareActions entry={selected} manifest={manifest} prepare={prepare} />
        </div>
      ) : null}
      <PrintFooter entry={selected} />
    </div>
  );
}

/**
 * The Print pane over an injectable machines facet and chat bridge, for fixture and host parity checks.
 *
 * @param properties - The negotiated facet and the chat approval bridge.
 * @returns The pane, or the refusal the runtime negotiated.
 * @public
 */
export const PrintPanel = ({
  machines,
  bridge,
  isShown = true,
}: {
  readonly machines: RuntimeTransportFacet<MachineClient>;
  readonly bridge: PrintApprovalBridge;
  readonly isShown?: boolean;
}): React.JSX.Element => {
  if (!machines.available) {
    return (
      <PanelEmptyState
        icon={Printer}
        title={machines.reason === 'not-granted' ? 'Printer access not granted' : 'Printing unavailable'}
        description={
          machines.reason === 'not-granted'
            ? 'Reconnect through a host route with the machines grant.'
            : 'This runtime host does not provide machine control.'
        }
        className='size-full'
      />
    );
  }
  return <ConnectedPrintPanel client={machines} bridge={bridge} isShown={isShown} />;
};

/**
 * Workbench adapter: the main geometry unit's negotiated facet and the focused chat's interrupts.
 *
 * @returns The Print pane.
 * @public
 */
export const PrintPanelBody = ({ isShown = true }: { readonly isShown?: boolean }): React.JSX.Element => {
  const machines = useMachinesFacet();
  const bridge = usePrintApprovalBridge();
  return <PrintPanel machines={machines} bridge={bridge} isShown={isShown} />;
};
