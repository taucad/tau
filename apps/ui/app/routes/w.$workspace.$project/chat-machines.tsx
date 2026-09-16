import { useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from '@xstate/react';
import type { RJSFSchema } from '@rjsf/utils';
import {
  Camera,
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  Pause,
  Play,
  Printer,
  Radio,
  RefreshCw,
  ShieldAlert,
  Square,
} from 'lucide-react';
import type {
  MachineCandidate,
  MachineClient,
  MachineControlRunInput,
  MachineDirectoryEntry,
  MachineDirectoryFrame,
  MachineDirectorySnapshot,
  MachineOperationReceipt,
  MachineProvider,
} from '@taucad/runtime/machine';
import type { RuntimeTransportFacet } from '@taucad/runtime/transport';
import { Badge } from '@taucad/ui/components/badge';
import { Button } from '@taucad/ui/components/button';
import { Progress } from '@taucad/ui/components/progress';
import { cn } from '@taucad/ui/utils/cn';
import { randomUuid } from '@taucad/utils/id';
import { Parameters } from '#components/geometry/parameters/parameters.js';
import { PanelEmptyState } from '#components/ui/panel-empty-state.js';
import { useProject } from '#hooks/use-project.js';

type MachinePresentation = Readonly<{
  label: string;
  nextAction: string;
  tone: string;
  rail: string;
}>;

/** Reduce one admitted directory frame without introducing a second machine state authority. @public */
export const projectMachineDirectoryFrame = (
  current: MachineDirectorySnapshot,
  frame: MachineDirectoryFrame,
): MachineDirectorySnapshot => {
  if (frame.type === 'snapshot' || frame.type === 'resync-required') {
    return frame.snapshot;
  }
  if (frame.event.type === 'machine-directory-stale') {
    return {
      ...current,
      cursor: frame.cursor,
      entries: current.entries.map((entry) => ({
        ...entry,
        freshness: 'stale',
      })),
    };
  }
  if (frame.event.type === 'machine-directory-removed') {
    const { machineId } = frame.event;
    return {
      ...current,
      cursor: frame.cursor,
      entries: current.entries.filter((entry) => entry.machineId !== machineId),
    };
  }
  const { entry } = frame.event;
  return {
    ...current,
    cursor: frame.cursor,
    entries: [entry, ...current.entries.filter(({ machineId }) => machineId !== entry.machineId)],
  };
};

/** Derive operator copy and controls solely from the authoritative directory entry. @public */
export const presentMachine = (entry: MachineDirectoryEntry): MachinePresentation => {
  if (entry.freshness === 'stale') {
    return {
      label: 'Stale observation',
      nextAction: 'Wait for a current observation before any physical action.',
      tone: 'border-warning/30 bg-warning/10 text-warning',
      rail: 'before:bg-warning',
    };
  }
  if (entry.snapshot.connection !== 'connected') {
    return {
      label: entry.snapshot.connection === 'unreachable' ? 'Unreachable' : 'Disconnected',
      nextAction: 'Restore the trusted host connection before continuing.',
      tone: 'border-destructive/30 bg-destructive/10 text-destructive',
      rail: 'before:bg-destructive',
    };
  }
  const { run } = entry.snapshot;
  if (run?.state === 'printing') {
    return {
      label: 'Printing',
      nextAction: 'Monitor the exact active run; pause or cancel only if needed.',
      tone: 'border-information/30 bg-information/10 text-information',
      rail: 'before:bg-information',
    };
  }
  if (run?.state === 'paused') {
    return {
      label: 'Paused',
      nextAction: 'Inspect the machine, then resume or cancel this exact run.',
      tone: 'border-warning/30 bg-warning/10 text-warning',
      rail: 'before:bg-warning',
    };
  }
  if (run && ['failed', 'unknown'].includes(run.state)) {
    return {
      label: run.state === 'failed' ? 'Run failed' : 'Run state unknown',
      nextAction: 'Inspect the printer before issuing another physical command.',
      tone: 'border-destructive/30 bg-destructive/10 text-destructive',
      rail: 'before:bg-destructive',
    };
  }
  if (entry.snapshot.readiness === 'idle') {
    return {
      label: 'Ready',
      nextAction: 'Prepare a qualified immutable .gcode.3mf artifact.',
      tone: 'border-success/30 bg-success/10 text-success',
      rail: 'before:bg-success',
    };
  }
  return {
    label: entry.snapshot.readiness === 'busy' ? 'Busy' : 'Not ready',
    nextAction: 'Wait for the machine to report ready.',
    tone: 'border-warning/30 bg-warning/10 text-warning',
    rail: 'before:bg-warning',
  };
};

const useMachineDirectory = (client: MachineClient) => {
  const [generation, setGeneration] = useState(0);
  const [snapshot, setSnapshot] = useState<MachineDirectorySnapshot>();
  const [providers, setProviders] = useState<readonly MachineProvider[]>([]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const abort = new AbortController();
    const observe = async (): Promise<void> => {
      try {
        setError(undefined);
        const [initial, availableProviders] = await Promise.all([
          client.list({ signal: abort.signal }),
          client.listProviders({ signal: abort.signal }),
        ]);
        if (abort.signal.aborted) {
          return;
        }
        setSnapshot(initial);
        setProviders(availableProviders);
        for await (const frame of client.watch({
          cursor: initial.cursor,
          signal: abort.signal,
        })) {
          setSnapshot((current) => projectMachineDirectoryFrame(current ?? initial, frame));
        }
      } catch (error) {
        if (!abort.signal.aborted) {
          setError(error instanceof Error ? error.message : String(error));
        }
      }
    };
    // async-iife: bootstrap -- a React effect cannot await; cleanup aborts the observation loop.
    void observe();
    return () => {
      abort.abort();
    };
  }, [client, generation]);

  return {
    snapshot,
    providers,
    error,
    refresh: () => {
      setGeneration((current) => current + 1);
    },
  };
};

const configurationDefaults = (provider: MachineProvider): Record<string, unknown> => {
  const projection = provider.bindingConfiguration.parameters.input;
  return projection.status === 'usable' ? { ...projection.declaration.defaults } : {};
};

const Discovery = ({
  client,
  providers,
}: {
  readonly client: MachineClient;
  readonly providers: readonly MachineProvider[];
}) => {
  const [providerId, setProviderId] = useState<string>();
  const [configurationByProvider, setConfigurationByProvider] = useState<
    Readonly<Record<string, Record<string, unknown>>>
  >({});
  const [candidates, setCandidates] = useState<readonly MachineCandidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const selected = providers.find(({ id }) => id === providerId) ?? providers[0];
  const configuration = selected ? (configurationByProvider[selected.id] ?? {}) : {};

  const discover = async (): Promise<void> => {
    if (!selected) {
      return;
    }
    setBusy(true);
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
      setBusy(false);
    }
  };

  const bind = async (candidate: MachineCandidate): Promise<void> => {
    setBusy(true);
    try {
      const outcome = await client.beginBinding({
        candidate,
        name: candidate.name,
      });
      setMessage(
        outcome.status === 'bound'
          ? `${candidate.name} is bound as ${outcome.machineId}.`
          : `Continue ceremony ${outcome.ceremonyId} in the trusted host prompt.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  if (!selected) {
    return (
      <PanelEmptyState
        icon={Printer}
        title='No machine providers'
        description='Install a machine provider on the host.'
      />
    );
  }
  const defaults = configurationDefaults(selected);
  return (
    <section aria-labelledby='machine-discovery-heading' className='flex min-w-0 flex-col gap-3'>
      <div>
        <h2 id='machine-discovery-heading' className='text-sm font-medium'>
          Find a machine
        </h2>
        <p className='mt-1 text-xs text-muted-foreground'>
          Discovery is bounded and user-initiated. Credentials stay in the trusted host ceremony.
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
        <Parameters
          parameters={configuration}
          defaultParameters={defaults}
          jsonSchema={selected.bindingConfiguration.legacyProjection.inputSchema as RJSFSchema}
          onParametersChange={(value) => {
            setConfigurationByProvider((current) => ({
              ...current,
              [selected.id]: value,
            }));
          }}
          enableSearch={false}
          units={{ length: { sourceSymbol: 'mm', displaySymbol: 'mm' } }}
          parameterSemantics='configuration'
          emptyMessage='No discovery settings'
        />
      </div>
      <Button type='button' size='sm' disabled={busy} className='self-start' onClick={discover}>
        {busy ? (
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
              <Button type='button' size='sm' variant='outline' disabled={busy} onClick={async () => bind(candidate)}>
                Bind
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
};

const runCommands = (entry: MachineDirectoryEntry): ReadonlyArray<MachineControlRunInput['command']> => {
  if (entry.freshness !== 'current' || entry.snapshot.connection !== 'connected' || !entry.snapshot.activeRunId) {
    return [];
  }
  if (entry.snapshot.run?.state === 'printing') {
    return ['pause', 'cancel', 'urgent-stop'];
  }
  if (entry.snapshot.run?.state === 'paused') {
    return ['resume', 'cancel', 'urgent-stop'];
  }
  return [];
};

const commandIcon = {
  pause: Pause,
  resume: Play,
  cancel: Square,
  'urgent-stop': ShieldAlert,
} as const;

const MachineCard = ({
  client,
  entry,
  onReceipt,
}: {
  readonly client: MachineClient;
  readonly entry: MachineDirectoryEntry;
  readonly onReceipt: (receipt: MachineOperationReceipt) => void;
}) => {
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<MachineControlRunInput['command']>();
  const [error, setError] = useState<string>();
  const [stillBusy, setStillBusy] = useState(false);
  const [stillError, setStillError] = useState<string>();
  const [still, setStill] = useState<Readonly<{ url: string; capturedAt: string; expiresAt: string }>>();
  const captureAbort = useRef<AbortController | undefined>(undefined);
  const presentation = presentMachine(entry);
  const { run } = entry.snapshot;
  const supportsStill = entry.descriptor.operations.includes('still');

  useEffect(
    () => () => {
      captureAbort.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (!still) {
      return;
    }
    const remaining = Date.parse(still.expiresAt) - Date.now();
    const stillExpiryTimer = globalThis.setTimeout(
      () => {
        setStill((current) => (current?.url === still.url ? undefined : current));
      },
      Math.max(0, remaining),
    );
    return () => {
      globalThis.clearTimeout(stillExpiryTimer);
      URL.revokeObjectURL(still.url);
    };
  }, [still]);

  const capture = async (): Promise<void> => {
    const abort = new AbortController();
    captureAbort.current = abort;
    setStillBusy(true);
    setStillError(undefined);
    try {
      const result = await client.captureStill({ machineId: entry.machineId, signal: abort.signal });
      abort.signal.throwIfAborted();
      setStill({
        url: URL.createObjectURL(new Blob([result.bytes], { type: result.mediaType })),
        capturedAt: result.capturedAt,
        expiresAt: result.expiresAt,
      });
    } catch (error) {
      if (!abort.signal.aborted) {
        setStillError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (captureAbort.current === abort) {
        captureAbort.current = undefined;
        setStillBusy(false);
      }
    }
  };
  const issue = async (command: MachineControlRunInput['command']): Promise<void> => {
    const expectedProviderRunId = entry.snapshot.activeRunId;
    if (!expectedProviderRunId) {
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      onReceipt(
        await client.controlRun({
          machineId: entry.machineId,
          operationId: randomUuid(),
          command,
          expectedProviderRunId,
        }),
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const confirmIssue = async (): Promise<void> => {
    const command = confirmation;
    setConfirmation(undefined);
    if (command) {
      await issue(command);
    }
  };

  return (
    <article
      aria-label={`${entry.descriptor.name}, ${presentation.label}`}
      className={cn(
        'relative min-w-0 overflow-hidden rounded-xl border border-border/70 bg-card p-3 before:absolute before:inset-y-0 before:left-0 before:w-0.5',
        presentation.rail,
      )}
    >
      <div className='flex min-w-0 items-start gap-2'>
        <div className='min-w-0 flex-1'>
          <h3 className='truncate text-sm font-medium'>{entry.descriptor.name}</h3>
          <p className='truncate text-xs text-muted-foreground'>
            {entry.descriptor.vendor} {entry.descriptor.model}
          </p>
        </div>
        <Badge
          role='status'
          variant='outline'
          className={cn('h-5 shrink-0 gap-1 px-1.5 text-[10px]', presentation.tone)}
        >
          {presentation.label === 'Ready' ? <CircleCheck aria-hidden /> : <CircleAlert aria-hidden />}
          {presentation.label}
        </Badge>
      </div>
      <p className='mt-3 text-xs'>
        <span className='font-medium'>Next safe action:</span> {presentation.nextAction}
      </p>
      {run?.progress === undefined ? null : (
        <div className='mt-3'>
          <div className='mb-1 flex justify-between text-xs'>
            <span>{run.state}</span>
            <span className='font-mono'>{Math.round(run.progress)}%</span>
          </div>
          <Progress
            aria-label={`${entry.descriptor.name} print progress`}
            aria-valuenow={run.progress}
            aria-valuetext={`${Math.round(run.progress)} percent`}
            value={run.progress}
          />
          {run.remainingSeconds === undefined ? null : (
            <p className='mt-1 text-[11px] text-muted-foreground'>
              {Math.ceil(run.remainingSeconds / 60)} min remaining
            </p>
          )}
        </div>
      )}
      <div className='mt-3 grid grid-cols-2 gap-2 text-xs'>
        <div>
          <span className='block text-muted-foreground'>Tool</span>
          {entry.snapshot.setup.toolId ?? 'Unknown'}
        </div>
        <div>
          <span className='block text-muted-foreground'>Plate</span>
          {entry.snapshot.setup.bedType ?? 'Unknown'}
        </div>
        <div className='col-span-2 min-w-0'>
          <span className='block text-muted-foreground'>Materials</span>
          <span className='break-words'>
            {entry.snapshot.setup.materials
              .map(({ slot, materialId }) => `${String(slot + 1)}: ${materialId ?? 'unknown'}`)
              .join(' · ') || 'None observed'}
          </span>
        </div>
      </div>
      <div className='mt-3 border-t border-border/70 pt-2 text-xs'>
        <div className='flex items-center gap-2'>
          <strong className='font-medium'>Camera still</strong>
          {supportsStill ? (
            <Button
              type='button'
              size='xs'
              variant='outline'
              className='ml-auto'
              disabled={stillBusy}
              onClick={capture}
            >
              {stillBusy ? (
                <LoaderCircle aria-hidden className='animate-spin motion-reduce:animate-none' />
              ) : (
                <Camera aria-hidden />
              )}
              Capture still
            </Button>
          ) : null}
        </div>
        {still ? (
          <figure className='mt-2 overflow-hidden rounded-lg border border-border/70 bg-muted/30'>
            <img
              src={still.url}
              alt={`Latest still from ${entry.descriptor.name}`}
              className='aspect-video w-full object-contain'
            />
            <figcaption className='px-2 py-1 text-[11px] text-muted-foreground'>
              Captured <time dateTime={still.capturedAt}>{new Date(still.capturedAt).toLocaleTimeString()}</time>
            </figcaption>
          </figure>
        ) : (
          <p className='mt-2 text-muted-foreground'>
            {supportsStill ? 'No still captured.' : 'Still capture is unavailable for this machine.'}
          </p>
        )}
        {stillError ? (
          <p role='alert' className='mt-2 text-destructive'>
            {stillError}
          </p>
        ) : null}
      </div>
      {runCommands(entry).length > 0 ? (
        <div
          role='group'
          aria-label={`Controls for ${entry.descriptor.name}`}
          className='mt-3 flex flex-wrap gap-2 border-t border-border/70 pt-2'
        >
          {runCommands(entry).map((command) => {
            const Icon = commandIcon[command];
            return (
              <Button
                key={command}
                type='button'
                size='sm'
                variant={command === 'urgent-stop' ? 'destructive' : 'outline'}
                disabled={busy}
                onClick={async () => {
                  if (command === 'cancel' || command === 'urgent-stop') {
                    setConfirmation(command);
                  } else {
                    await issue(command);
                  }
                }}
              >
                <Icon aria-hidden />
                {command === 'urgent-stop' ? 'Urgent stop' : command[0]!.toUpperCase() + command.slice(1)}
              </Button>
            );
          })}
        </div>
      ) : null}
      {confirmation ? (
        <div role='alert' className='mt-2 rounded-lg border border-warning/30 bg-warning/10 p-2 text-xs'>
          <p>
            Confirm {confirmation === 'urgent-stop' ? 'urgent stop' : confirmation} for {entry.descriptor.name}’s exact
            active run?
          </p>
          <div className='mt-2 flex flex-wrap gap-2'>
            <Button
              type='button'
              size='sm'
              variant='outline'
              onClick={() => {
                setConfirmation(undefined);
              }}
            >
              Keep printing
            </Button>
            <Button type='button' size='sm' variant='destructive' onClick={confirmIssue}>
              Confirm {confirmation === 'urgent-stop' ? 'urgent stop' : confirmation}
            </Button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p role='alert' className='mt-2 text-xs text-destructive'>
          {error}
        </p>
      ) : null}
      <details className='mt-3 border-t border-border/70 pt-2 text-xs text-muted-foreground'>
        <summary className='cursor-pointer select-none'>Engineering details</summary>
        <dl className='mt-2 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-2 gap-y-1'>
          <dt>Machine ID</dt>
          <dd className='font-mono break-all'>{entry.machineId}</dd>
          <dt>Provider</dt>
          <dd className='break-all'>{entry.providerId}</dd>
          <dt>Firmware</dt>
          <dd className='break-all'>{entry.descriptor.firmware}</dd>
          <dt>Observed</dt>
          <dd>
            <time dateTime={entry.snapshot.observedAt}>{new Date(entry.snapshot.observedAt).toLocaleString()}</time>
          </dd>
          <dt>Operations</dt>
          <dd className='break-words'>{entry.descriptor.operations.join(', ')}</dd>
        </dl>
      </details>
    </article>
  );
};

/** Shared-client Machines surface, injectable for fixture and host parity checks. @public */
export const MachinesPanel = ({
  machines,
}: {
  readonly machines: RuntimeTransportFacet<MachineClient>;
}): React.JSX.Element => {
  if (!machines.available) {
    return (
      <PanelEmptyState
        icon={Printer}
        title={machines.reason === 'not-granted' ? 'Machines access not granted' : 'Machines unavailable'}
        description={
          machines.reason === 'not-granted'
            ? 'Reconnect through a host route with the machines grant.'
            : 'This runtime host does not provide machine control.'
        }
        className='size-full'
      />
    );
  }
  return <AvailableMachinesPanel client={machines} />;
};

const AvailableMachinesPanel = ({ client }: { readonly client: MachineClient }) => {
  const { snapshot, providers, error, refresh } = useMachineDirectory(client);
  const [receipt, setReceipt] = useState<MachineOperationReceipt>();
  const entries = useMemo(
    () => snapshot?.entries.toSorted((a, b) => a.descriptor.name.localeCompare(b.descriptor.name)) ?? [],
    [snapshot],
  );

  return (
    <div data-slot='machines-panel-body' className='flex size-full min-h-0 min-w-0 flex-col overflow-hidden bg-sidebar'>
      <div
        aria-label='Machine overview'
        aria-live='polite'
        className='flex min-h-10 shrink-0 items-center gap-3 border-b border-border/70 px-3 text-xs text-muted-foreground'
      >
        <span className='flex items-center gap-1.5'>
          <Printer aria-hidden className='size-3.5' />
          <strong className='font-medium text-foreground'>{entries.length}</strong>{' '}
          {entries.length === 1 ? 'machine' : 'machines'}
        </span>
        <span>{entries.filter(({ freshness }) => freshness === 'stale').length} stale</span>
        <Button type='button' size='xs' variant='ghost' className='ml-auto' onClick={refresh}>
          <RefreshCw aria-hidden />
          Refresh
        </Button>
      </div>
      <div className='min-h-0 min-w-0 flex-1 scroll-shadows-y overflow-y-auto p-2 [--scroll-fade-end:transparent] [--scroll-fade-size:28px]'>
        {error ? (
          <p
            role='alert'
            className='mb-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive'
          >
            {error}
          </p>
        ) : null}
        {snapshot ? null : (
          <div role='status' className='grid min-h-full place-items-center text-sm text-muted-foreground'>
            <span className='flex items-center gap-2'>
              <LoaderCircle aria-hidden className='size-4 animate-spin motion-reduce:animate-none' />
              Loading machines
            </span>
          </div>
        )}
        {snapshot && entries.length === 0 ? <Discovery client={client} providers={providers} /> : null}
        {entries.length > 0 ? (
          <ol
            aria-label='Machines'
            className='grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-2'
          >
            {entries.map((entry) => (
              <li key={entry.machineId} className='min-w-0'>
                <MachineCard client={client} entry={entry} onReceipt={setReceipt} />
              </li>
            ))}
          </ol>
        ) : null}
        <p aria-live='assertive' role='status' className='sr-only'>
          {receipt ? `${receipt.kind} ${receipt.status} for ${receipt.machineId}` : ''}
        </p>
        {receipt ? (
          <div
            className={cn(
              'mt-2 rounded-lg border p-2 text-xs',
              receipt.status === 'accepted'
                ? 'border-success/30 bg-success/10 text-success'
                : receipt.status === 'unknown'
                  ? 'border-warning/30 bg-warning/10 text-warning'
                  : 'border-destructive/30 bg-destructive/10 text-destructive',
            )}
          >
            <strong>
              {receipt.kind} {receipt.status}
            </strong>
            <span className='ml-1'>Operation {receipt.operationId}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
};

/** Workbench adapter for the main geometry unit's negotiated runtime facet. @public */
export const MachinesPanelBody = (): React.JSX.Element => {
  const { geometryUnits, mainEntryPath } = useProject();
  const machines = useSelector(geometryUnits.get(mainEntryPath), (state) => state?.context.kernelClient?.machines);
  return <MachinesPanel machines={machines ?? { available: false, reason: 'unsupported' }} />;
};
