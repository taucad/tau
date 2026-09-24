import { useCallback, useMemo, useRef, useState } from 'react';
import type { RJSFSchema } from '@rjsf/utils';
import type { JSONSchema7 } from '@taucad/json-schema';
import {
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  PauseCircle,
  Printer,
  Radio,
  RefreshCw,
  ScanSearch,
  Send,
  Scissors,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type {
  MachineCandidate,
  MachineClient,
  MachineDirectoryEntry,
  MachineOperationReceipt,
  MachineOperationSnapshot,
  MachineProvider,
  PrintRequest,
} from '@taucad/runtime/machine';
import type { RuntimeTransportFacet } from '@taucad/runtime/transport';
import { Badge } from '@taucad/ui/components/badge';
import { Button } from '@taucad/ui/components/button';
import { Progress } from '@taucad/ui/components/progress';
import { cn } from '@taucad/ui/utils/cn';
import { Parameters } from '#components/geometry/parameters/parameters.js';
import { PanelEmptyState } from '#components/ui/panel-empty-state.js';
import { useMachineDirectory, useMachinesFacet } from '#hooks/use-machines.js';
import { usePrintApprovalBridge } from '#hooks/use-machines-approvals.js';
import type { PrintApprovalBridge } from '#hooks/use-machines-approvals.js';
import { isOpenPrintRequest, useMachinesPrintRequests } from '#hooks/use-machines-print-requests.js';
import { useMachinesSelection } from '#hooks/use-machines-selection.js';
import { useProject } from '#hooks/use-project.js';
import {
  ActivitySection,
  ControlsSection,
  InspectSection,
  MonitorSection,
  describeRun,
} from '#routes/w.$workspace.$project/chat-print-monitor.js';
import type { LedgerEntry } from '#routes/w.$workspace.$project/chat-print-monitor.js';
import {
  PrepareSection,
  useCompiledConfigurationManifest,
  usePrintPrepare,
} from '#routes/w.$workspace.$project/chat-print-prepare.js';
import type { PrintPrepare, ResolvedSchema } from '#routes/w.$workspace.$project/chat-print-prepare.js';
import { PrintNotice, useNow } from '#routes/w.$workspace.$project/chat-print-section.js';
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
 * Where the machine is and what it needs, from the entry alone.
 *
 * @param entry - The machine as observed.
 * @returns The status label, glyph and the next safe step.
 * @public
 */
export const presentMachine = (entry: MachineDirectoryEntry): MachinePresentation => {
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
      case 'unknown': {
        return { label: 'Reconcile the start', kind: 'review' };
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
      ? { label: `Send to ${entry.descriptor.name}`, kind: 'send' }
      : { label: prepare.sendBlocker, kind: 'none' };
  }
  if (prepare.route === undefined) {
    return { label: 'Slicing unavailable', kind: 'none' };
  }
  return { label: prepare.slice ? 'Slice again' : 'Slice and preview', kind: 'slice' };
};

const nextActionIcon: Record<NextAction['kind'], LucideIcon | undefined> = {
  slice: Scissors,
  send: Send,
  review: ScanSearch,
  none: undefined,
};

function MachineCard({
  entry,
  openRequest,
  prepare,
  onReview,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly openRequest: PrintRequest | undefined;
  readonly prepare: PrintPrepare;
  readonly onReview: () => void;
}): React.JSX.Element {
  const presentation = presentMachine(entry);
  const action = nextAction({ entry, openRequest, prepare });
  const { run } = entry.snapshot;
  const runLine = describeRun(entry);
  const model = run && (run.state === 'printing' || run.state === 'paused') ? (run.file ?? run.name) : undefined;
  const Icon = presentation.icon;
  const ActionIcon = nextActionIcon[action.kind];
  const act = (): void => {
    switch (action.kind) {
      case 'slice': {
        void prepare.sliceNow();
        break;
      }
      case 'send': {
        prepare.confirmSend();
        break;
      }
      case 'review': {
        onReview();
        break;
      }
      default: {
        break;
      }
    }
  };

  return (
    <article aria-label={`${entry.descriptor.name}, ${presentation.label}`} className='flex min-w-0 flex-col gap-2'>
      <div className='flex min-w-0 items-start gap-2'>
        <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', presentation.iconClassName)} />
        <div className='min-w-0 flex-1'>
          <div className='flex min-w-0 items-center gap-2'>
            <h2 className='min-w-0 truncate text-sm font-medium'>{entry.descriptor.name}</h2>
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
              aria-label={`${entry.descriptor.name} print progress`}
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
      {action.kind === 'none' ? (
        <p className='text-xs text-muted-foreground' role='status'>
          {action.label}
        </p>
      ) : (
        <Button type='button' size='sm' className='self-start' onClick={act}>
          {ActionIcon ? <ActionIcon aria-hidden /> : null}
          {action.label}
        </Button>
      )}
    </article>
  );
}

const bindingDefaults = (provider: MachineProvider): Record<string, unknown> => {
  const projection = provider.bindingConfiguration.parameters.input;
  return projection.status === 'usable' ? { ...projection.declaration.defaults } : {};
};

const printUnits = { length: { displaySymbol: 'mm' } } as const;

function Discovery({
  client,
  providers,
}: {
  readonly client: MachineClient;
  readonly providers: readonly MachineProvider[];
}): React.JSX.Element {
  const [providerId, setProviderId] = useState<string>();
  const [configurationByProvider, setConfigurationByProvider] = useState<
    Readonly<Record<string, Record<string, unknown>>>
  >({});
  const [candidates, setCandidates] = useState<readonly MachineCandidate[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState('');
  const selected = providers.find(({ id }) => id === providerId) ?? providers[0];
  const configuration = selected ? (configurationByProvider[selected.id] ?? {}) : {};
  const resolved = useMemo<ResolvedSchema | undefined>(
    () =>
      selected
        ? {
            schema: selected.bindingConfiguration.legacyProjection.inputSchema as JSONSchema7,
            defaults: bindingDefaults(selected),
          }
        : undefined,
    [selected],
  );
  const manifest = useCompiledConfigurationManifest(selected?.id, 'print/binding', resolved);

  const discover = async (): Promise<void> => {
    if (!selected) {
      return;
    }
    setIsBusy(true);
    setMessage('Discovering machines…');
    setCandidates([]);
    try {
      for await (const event of client.discover({
        providerId: selected.id,
        configuration: configuration as Parameters<MachineClient['discover']>[0]['configuration'],
      })) {
        setCandidates((current) =>
          event.type === 'lost'
            ? current.filter(({ id }) => id !== event.candidateId)
            : [event.candidate, ...current.filter(({ id }) => id !== event.candidate.id)],
        );
      }
      setMessage('Discovery finished.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsBusy(false);
    }
  };

  const bind = async (candidate: MachineCandidate): Promise<void> => {
    setIsBusy(true);
    try {
      const outcome = await client.beginBinding({ candidate, name: candidate.name });
      setMessage(
        outcome.status === 'bound'
          ? `${candidate.name} is bound as ${outcome.machineId}.`
          : `Continue ceremony ${outcome.ceremonyId} in the trusted host prompt.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsBusy(false);
    }
  };

  if (!selected || !resolved) {
    return (
      <PanelEmptyState
        icon={Printer}
        title='No machine providers'
        description='Install a machine provider on the host.'
      />
    );
  }
  return (
    <section aria-labelledby='print-discovery-heading' className='flex min-w-0 flex-col gap-3'>
      <div>
        <h2 id='print-discovery-heading' className='text-sm font-medium'>
          Find a printer
        </h2>
        <p className='mt-1 text-xs text-muted-foreground'>
          Search is bounded and starts only when you ask. Credentials stay in the trusted host ceremony.
        </p>
      </div>
      {providers.length > 1 ? (
        <label className='flex flex-col gap-1 text-xs font-medium'>
          Provider
          <select
            className='h-8 rounded-md border border-input bg-background px-2 font-normal'
            value={selected.id}
            onChange={(event) => {
              setProviderId(event.target.value);
            }}
          >
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className='min-h-40 overflow-hidden rounded-xl border border-border/70 bg-card'>
        {manifest ? (
          <Parameters
            parameters={configuration}
            defaultParameters={resolved.defaults}
            jsonSchema={resolved.schema as RJSFSchema}
            onParametersChange={(value) => {
              setConfigurationByProvider((current) => ({ ...current, [selected.id]: value }));
            }}
            enableSearch={false}
            units={printUnits}
            parameterManifest={manifest}
            parameterEdit={{ kind: 'transient' }}
            emptyMessage='No discovery settings'
          />
        ) : (
          <p role='status' aria-busy='true' className='p-2 text-xs text-muted-foreground'>
            Preparing discovery settings…
          </p>
        )}
      </div>
      <Button type='button' size='sm' disabled={isBusy} className='self-start' onClick={discover}>
        {isBusy ? (
          <LoaderCircle aria-hidden className='animate-spin motion-reduce:animate-none' />
        ) : (
          <Radio aria-hidden />
        )}
        Discover
      </Button>
      <p aria-live='polite' role='status' className='min-h-4 text-xs text-muted-foreground'>
        {message}
      </p>
      {candidates.length > 0 ? (
        <ul aria-label='Discovered machines' className='flex list-none flex-col gap-2'>
          {candidates.map((candidate) => (
            <li
              key={candidate.id}
              className='flex min-w-0 items-center gap-2 rounded-xl border border-border/70 bg-card p-3'
            >
              <span className='min-w-0 flex-1'>
                <strong className='block truncate text-sm font-medium'>{candidate.name}</strong>
                <span className='block truncate text-xs text-muted-foreground'>
                  {candidate.claimedIdentity.model ?? 'Unknown model'} · {candidate.endpoint.address}
                </span>
              </span>
              <Button type='button' size='sm' variant='outline' disabled={isBusy} onClick={async () => bind(candidate)}>
                Bind
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
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
}: {
  readonly client: MachineClient;
  readonly bridge: PrintApprovalBridge;
}): React.JSX.Element {
  const { projectId } = useProject();
  const { snapshot, providers, error, refresh } = useMachineDirectory(client);
  const entries = useMemo(
    () => snapshot?.entries.toSorted((a, b) => a.descriptor.name.localeCompare(b.descriptor.name)) ?? [],
    [snapshot],
  );
  const { selected, select } = useMachinesSelection(projectId, entries);
  const provider = providers.find(({ id }) => id === selected?.providerId);
  const manifest = provider?.manifest;
  const { requests, error: requestsError } = useMachinesPrintRequests(client, selected?.machineId);
  const openRequest = requests.find((request) => isOpenPrintRequest(request));
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
  const sendRef = useRef<HTMLElement>(null);
  const review = useCallback(() => {
    sendRef.current?.scrollIntoView({ block: 'nearest' });
    sendRef.current?.focus();
  }, []);
  const prepare = usePrintPrepare({ client, entry: selected, provider, manifest, cursor: snapshot?.cursor });
  const latestReceipt = ledger.find((entry) => entry.kind === 'receipt');

  return (
    <div data-slot='print-panel-body' className='flex size-full min-h-0 min-w-0 flex-col overflow-hidden bg-sidebar'>
      <div className='flex min-h-10 shrink-0 items-center gap-2 border-b border-border/70 px-3 text-xs text-muted-foreground'>
        <Printer aria-hidden className='size-3.5 shrink-0' />
        {entries.length > 1 ? (
          <label className='flex min-w-0 flex-1 items-center gap-2'>
            <span className='sr-only'>Machine</span>
            <select
              aria-label='Machine'
              className='h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground'
              value={selected?.machineId ?? ''}
              onChange={(event) => {
                select(event.target.value);
              }}
            >
              {entries.map((entry) => (
                <option key={entry.machineId} value={entry.machineId}>
                  {entry.descriptor.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className='min-w-0 flex-1 truncate'>
            <strong className='font-medium text-foreground'>{entries.length}</strong>{' '}
            {entries.length === 1 ? 'machine' : 'machines'}
          </span>
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
        {snapshot && entries.length === 0 ? <Discovery client={client} providers={providers} /> : null}
        {selected ? (
          <div className='flex min-w-0 flex-col gap-3'>
            <MachineCard entry={selected} openRequest={openRequest} prepare={prepare} onReview={review} />
            <SendSection
              ref={sendRef}
              client={client}
              entry={selected}
              manifest={manifest}
              requests={requests}
              bridge={bridge}
              onReconciled={recordReconciled}
            />
            <PrepareSection entry={selected} provider={provider} manifest={manifest} prepare={prepare} />
            <MonitorSection client={client} entry={selected} manifest={manifest} requests={requests} />
            <ControlsSection
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
}: {
  readonly machines: RuntimeTransportFacet<MachineClient>;
  readonly bridge: PrintApprovalBridge;
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
  return <ConnectedPrintPanel client={machines} bridge={bridge} />;
};

/**
 * Workbench adapter: the main geometry unit's negotiated facet and the focused chat's interrupts.
 *
 * @returns The Print pane.
 * @public
 */
export const PrintPanelBody = (): React.JSX.Element => {
  const machines = useMachinesFacet();
  const bridge = usePrintApprovalBridge();
  return <PrintPanel machines={machines} bridge={bridge} />;
};
