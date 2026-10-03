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
  ActivitySection,
  InspectSection,
  MonitorSection,
  describeRun,
} from '#routes/w.$workspace.$project/chat-print-monitor.js';
import type { LedgerEntry } from '#routes/w.$workspace.$project/chat-print-monitor.js';
import { PrepareSection, usePrintPrepare } from '#routes/w.$workspace.$project/chat-print-prepare.js';
import type { PrintPrepare } from '#routes/w.$workspace.$project/chat-print-prepare.js';
import { PrintDisclosure, PrintNotice, useNow } from '#routes/w.$workspace.$project/chat-print-section.js';
import { SendSection } from '#routes/w.$workspace.$project/chat-print-send.js';
import { formatAge } from '#routes/w.$workspace.$project/chat-print-summary.js';

/** Plain orientation copy derived solely from the authoritative directory entry. @public */
export type MachinePresentation = Readonly<{
  label: string;
  nextAction: string;
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
    nextAction: 'Tau is sending the file to the printer.',
    icon: LoaderCircle,
    iconClassName: 'text-information animate-spin motion-reduce:animate-none',
  },
  uploading: {
    label: 'Sending',
    nextAction: 'Tau is sending the file to the printer.',
    icon: LoaderCircle,
    iconClassName: 'text-information animate-spin motion-reduce:animate-none',
  },
  starting: {
    label: 'Starting',
    nextAction: 'Wait for the printer to confirm the start.',
    icon: LoaderCircle,
    iconClassName: 'text-information animate-spin motion-reduce:animate-none',
  },
  confirming: {
    label: 'Starting',
    nextAction: 'Wait for the printer to confirm the start.',
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
 * @returns The status label, glyph and the next safe step.
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
      nextAction: 'Wait for a current observation before any physical action.',
      icon: CircleAlert,
      iconClassName: 'text-warning',
    };
  }
  if (entry.snapshot.connection !== 'connected') {
    return {
      label: entry.snapshot.connection === 'unreachable' ? 'Unreachable' : 'Disconnected',
      nextAction: 'Restore the trusted host connection before continuing.',
      icon: CircleAlert,
      iconClassName: 'text-destructive',
    };
  }
  const { run } = entry.snapshot;
  if (run?.state === 'printing') {
    return {
      label: 'Printing',
      nextAction: 'Monitor the run; pause or cancel only if needed.',
      icon: Printer,
      iconClassName: 'text-information',
    };
  }
  if (run?.state === 'paused') {
    return {
      label: 'Paused',
      nextAction: 'Inspect the machine, then resume or cancel this run.',
      icon: PauseCircle,
      iconClassName: 'text-warning',
    };
  }
  if (run && ['failed', 'unknown'].includes(run.state)) {
    return {
      label: run.state === 'failed' ? 'Run failed' : 'Run state unknown',
      nextAction: 'Inspect the printer before issuing another physical command.',
      icon: CircleAlert,
      iconClassName: 'text-destructive',
    };
  }
  if (entry.snapshot.readiness === 'idle') {
    return {
      label: 'Ready',
      nextAction: 'Slice the model, preview the run, then send it.',
      icon: CircleCheck,
      iconClassName: 'text-success',
    };
  }
  return {
    label: entry.snapshot.readiness === 'busy' ? 'Busy' : 'Not ready',
    nextAction: 'Wait for the machine to report ready.',
    icon: CircleAlert,
    iconClassName: 'text-warning',
  };
};

/** The one primary step the orientation card offers. @public */
export type NextAction = Readonly<{
  label: string;
  kind: 'slice' | 'send' | 'review' | 'none';
}>;

/**
 * The next thing to do, from the machine, the open request and the prepare state.
 *
 * Physical steps (start, accept, reconcile) are never taken from here; the
 * button only brings the gated card into view.
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
  readonly prepare: Pick<PrintPrepare, 'slice' | 'isSliceStale' | 'isSlicing' | 'route' | 'sendBlocker'>;
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
  const runState = entry.snapshot.run?.state;
  if (entry.freshness === 'stale' || entry.snapshot.connection !== 'connected') {
    return { label: 'Waiting for the machine', kind: 'none' };
  }
  if (runState === 'printing' || runState === 'paused' || runState === 'preparing' || runState === 'finishing') {
    return { label: 'Monitor the run', kind: 'none' };
  }
  if (prepare.isSlicing) {
    return { label: 'Slicing…', kind: 'none' };
  }
  if (prepare.slice && !prepare.isSliceStale) {
    // A fresh slice that cannot be sent says why (a busy machine, the wrong spool), not "slice again".
    return prepare.sendBlocker === undefined
      ? { label: `Send to ${entry.name}`, kind: 'send' }
      : { label: prepare.sendBlocker, kind: 'none' };
  }
  if (prepare.route === undefined) {
    return { label: 'Slicing unavailable', kind: 'none' };
  }
  return { label: prepare.slice ? 'Slice again' : 'Slice and preview', kind: 'slice' };
};

function MachineCard({
  entry,
  openRequest,
  prepare,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly openRequest: PrintRequest | undefined;
  readonly prepare: PrintPrepare;
}): React.JSX.Element {
  const presentation = presentMachine(entry, openRequest);
  const { run } = entry.snapshot;
  const runLine = describeRun(entry);
  const model = run && (run.state === 'printing' || run.state === 'paused') ? (run.file ?? run.name) : undefined;
  const Icon = presentation.icon;

  return (
    <article aria-label={`${entry.name}, ${presentation.label}`} className='flex min-w-0 flex-col gap-2'>
      <div className='flex min-w-0 items-start gap-2'>
        <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', presentation.iconClassName)} />
        <div className='min-w-0 flex-1'>
          <div className='flex min-w-0 items-center gap-2'>
            <h2 className='min-w-0 truncate text-sm font-medium'>{entry.name}</h2>
            {entry.providerId.includes('simulator') ? <Badge variant='outline'>Simulated</Badge> : null}
          </div>
          <p className='truncate text-xs text-muted-foreground'>
            {presentation.label} · {entry.descriptor.vendor} {entry.descriptor.model}
          </p>
        </div>
      </div>
      {runLine && run && run.state !== 'idle' ? (
        <div className='flex min-w-0 flex-col gap-1'>
          <p className='text-xs'>{runLine}</p>
          {run.progress === undefined ? null : (
            <Progress
              aria-label={`${entry.name} print progress`}
              aria-valuenow={run.progress}
              aria-valuetext={`${String(Math.round(run.progress))} percent`}
              value={run.progress}
            />
          )}
        </div>
      ) : null}
      <dl className='flex flex-col gap-0.5 text-xs'>
        <div className='flex min-w-0 gap-2'>
          <dt className='w-24 shrink-0 text-muted-foreground'>{model ? 'Printing' : 'Model'}</dt>
          <dd className='min-w-0 flex-1 truncate font-mono'>{model ?? prepare.slice?.fileName ?? prepare.entryPath}</dd>
        </div>
        <div className='flex min-w-0 gap-2'>
          <dt className='w-24 shrink-0 text-muted-foreground'>Next</dt>
          <dd className='min-w-0 flex-1'>{presentation.nextAction}</dd>
        </div>
      </dl>
    </article>
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

function PrintFooter({ entry }: { readonly entry: MachineDirectoryEntry | undefined }): React.JSX.Element {
  const now = useNow();
  return (
    <p
      aria-live='polite'
      role='status'
      className='flex min-h-8 shrink-0 items-center gap-2 border-t border-border/70 px-3 text-xs text-muted-foreground'
    >
      {entry ? (
        <>
          <span className='min-w-0 truncate'>Observed {formatAge(entry.snapshot.observedAt, now)}</span>
          <span aria-hidden>·</span>
          <span>{entry.freshness}</span>
          <span aria-hidden>·</span>
          <span className='min-w-0 truncate'>{entry.providerId}</span>
        </>
      ) : (
        <span>No machine selected</span>
      )}
    </p>
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
  const headerPresentation = selected ? presentMachine(selected, openRequest) : undefined;
  const HeaderIcon = headerPresentation?.icon ?? Printer;
  const runActive = selected?.snapshot.run?.state === 'printing' || selected?.snapshot.run?.state === 'paused';

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
      <div className='flex min-h-10 shrink-0 items-center gap-2 border-b border-border/70 px-3 text-xs text-muted-foreground'>
        <HeaderIcon aria-hidden className={cn('size-3.5 shrink-0', headerPresentation?.iconClassName)} />
        {entries.length > 0 ? (
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
        ) : (
          <span className='min-w-0 flex-1'>No printers</span>
        )}
        <Button type='button' size='xs' variant='ghost' onClick={refresh}>
          <RefreshCw aria-hidden />
          Refresh
        </Button>
      </div>
      <div className='min-h-0 min-w-0 flex-1 scroll-shadows-y overflow-y-auto p-3 [--scroll-fade-end:transparent] [--scroll-fade-size:28px]'>
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
            <MachineCard entry={selected} openRequest={openRequest} prepare={prepare} />
            <SendSection
              client={client}
              entry={selected}
              manifest={manifest}
              requests={requests}
              bridge={bridge}
              onReconciled={recordReconciled}
            />
            {runActive ? (
              <PrintDisclosure title='Prepare the next print'>
                <PrepareSection entry={selected} provider={provider} manifest={manifest} prepare={prepare} />
              </PrintDisclosure>
            ) : (
              <PrepareSection entry={selected} provider={provider} manifest={manifest} prepare={prepare} />
            )}
            <MonitorSection
              client={client}
              entry={selected}
              manifest={manifest}
              requests={requests}
              onReceipt={recordReceipt}
            />
            <ActivitySection requests={requests} ledger={ledger} entry={selected} />
            <InspectSection entry={selected} provider={provider} manifest={manifest} />
          </div>
        ) : null}
        <p aria-live='assertive' role='status' className='sr-only'>
          {latestReceipt?.kind === 'receipt'
            ? `${latestReceipt.receipt.kind} ${latestReceipt.receipt.status} for ${latestReceipt.receipt.machineId}`
            : ''}
        </p>
      </div>
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
