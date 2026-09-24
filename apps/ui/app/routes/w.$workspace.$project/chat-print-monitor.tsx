import { useEffect, useRef, useState } from 'react';
import { Camera, Fan, Lightbulb, LoaderCircle, Pause, Play, ShieldAlert, Square, Wifi } from 'lucide-react';
import type {
  MachineClient,
  MachineControlRunInput,
  MachineDirectoryEntry,
  MachineManifest,
  MachineOperationReceipt,
  MachineOperationSnapshot,
  MachineProvider,
  PrintRequest,
} from '@taucad/runtime/machine';
import { Button } from '@taucad/ui/components/button';
import { Progress } from '@taucad/ui/components/progress';
import { cn } from '@taucad/ui/utils/cn';
import { randomUuid } from '@taucad/utils/id';
import {
  PrintDisclosure,
  PrintNotice,
  PrintRow,
  PrintSection,
  StaleBadge,
  useNow,
} from '#routes/w.$workspace.$project/chat-print-section.js';
import {
  formatAge,
  formatQuantity,
  formatRemaining,
  materialSlotLabel,
} from '#routes/w.$workspace.$project/chat-print-summary.js';
import { formatRelativeTime } from '#utils/date.utils.js';

/**
 * Whether one observation group is older than the budget its manifest declares.
 *
 * @param input - The observed machine, the manifest that declares the budgets, the group id and the clock.
 * @returns True when the group should wear a stale badge.
 * @public
 */
export const isObservationStale = ({
  entry,
  manifest,
  group,
  now,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly manifest: MachineManifest | undefined;
  readonly group: string;
  readonly now: number;
}): boolean => {
  if (entry.freshness === 'stale') {
    return true;
  }
  const budget = manifest?.observations.find((candidate) => candidate.group === group)?.staleAfter;
  return budget !== undefined && now - Date.parse(entry.snapshot.observedAt) > budget;
};

/**
 * The run line a person reads first: "Printing layer 42 of 125 · 9 min left".
 *
 * @param entry - The machine as observed.
 * @returns The line, or nothing without a run.
 * @public
 */
export const describeRun = (entry: MachineDirectoryEntry): string | undefined => {
  const { run } = entry.snapshot;
  if (!run) {
    return undefined;
  }
  const verb: Record<typeof run.state, string> = {
    printing: 'Printing',
    paused: 'Paused at',
    preparing: 'Preparing',
    finishing: 'Finishing',
    succeeded: 'Finished',
    failed: 'Failed at',
    idle: 'Idle',
    unknown: 'Run state unknown',
  };
  const layer =
    run.currentLayer === undefined
      ? undefined
      : run.totalLayers === undefined
        ? `layer ${String(run.currentLayer)}`
        : `layer ${String(run.currentLayer)} of ${String(run.totalLayers)}`;
  const parts = [
    [verb[run.state], layer].filter(Boolean).join(' '),
    run.remainingSeconds === undefined || run.state === 'succeeded' ? undefined : formatRemaining(run.remainingSeconds),
  ].filter(Boolean);
  return parts.join(' · ');
};

function GroupHeading({ label, isStale }: { readonly label: string; readonly isStale: boolean }): React.JSX.Element {
  return (
    <div className='flex min-w-0 items-center gap-2'>
      <h4 className='min-w-0 flex-1 truncate text-xs font-medium'>{label}</h4>
      {isStale ? <StaleBadge /> : null}
    </div>
  );
}

const temperature = (
  current: Parameters<typeof formatQuantity>[0] | undefined,
  target: Parameters<typeof formatQuantity>[0] | undefined,
): string =>
  current === undefined
    ? 'Not reported'
    : target === undefined
      ? formatQuantity(current)
      : `${formatQuantity(current)} → ${formatQuantity(target)}`;

function StillCapture({
  client,
  entry,
}: {
  readonly client: MachineClient;
  readonly entry: MachineDirectoryEntry;
}): React.JSX.Element {
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [still, setStill] = useState<Readonly<{ url: string; capturedAt: string; expiresAt: string }>>();
  const captureAbort = useRef<AbortController | undefined>(undefined);
  const now = useNow();
  const isSupported = entry.descriptor.operations.includes('still');

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
    const stillExpiry = globalThis.setTimeout(
      () => {
        setStill((current) => (current?.url === still.url ? undefined : current));
      },
      Math.max(0, remaining),
    );
    return () => {
      globalThis.clearTimeout(stillExpiry);
      URL.revokeObjectURL(still.url);
    };
  }, [still]);

  const capture = async (): Promise<void> => {
    const abort = new AbortController();
    captureAbort.current = abort;
    setIsBusy(true);
    setError(undefined);
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
        setError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (captureAbort.current === abort) {
        captureAbort.current = undefined;
        setIsBusy(false);
      }
    }
  };

  return (
    <div className='flex min-w-0 flex-col gap-1.5'>
      <div className='flex min-w-0 items-center gap-2'>
        <h4 className='min-w-0 flex-1 truncate text-xs font-medium'>Camera</h4>
        {isSupported ? (
          <Button type='button' size='xs' variant='outline' disabled={isBusy} onClick={capture}>
            {isBusy ? (
              <LoaderCircle aria-hidden className='animate-spin motion-reduce:animate-none' />
            ) : (
              <Camera aria-hidden />
            )}
            Capture still
          </Button>
        ) : null}
      </div>
      {still ? (
        <figure className='overflow-hidden rounded-lg border border-border/70 bg-muted/30'>
          <img
            src={still.url}
            alt={`Latest still from ${entry.descriptor.name}`}
            className='aspect-video w-full object-contain'
          />
          <figcaption className='px-2 py-1 text-xs text-muted-foreground'>
            Captured <time dateTime={still.capturedAt}>{formatAge(still.capturedAt, now)}</time>
          </figcaption>
        </figure>
      ) : (
        <p className='text-xs text-muted-foreground'>
          {isSupported ? 'No still captured.' : 'Still capture is unavailable for this machine.'}
        </p>
      )}
      {error ? <PrintNotice tone='destructive'>{error}</PrintNotice> : null}
    </div>
  );
}

function RunGroup({
  entry,
  isStale,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly isStale: boolean;
}): React.JSX.Element {
  const { run } = entry.snapshot;
  const speed = run
    ? [run.speedProfile, run.speedPercent === undefined ? undefined : `${String(run.speedPercent)} %`]
        .filter((part) => part !== undefined)
        .join(' · ')
    : '';
  return (
    <div className='flex min-w-0 flex-col gap-1.5'>
      <GroupHeading label='Run' isStale={isStale} />
      {run ? (
        <>
          <p className='text-xs'>{describeRun(entry)}</p>
          {run.progress === undefined ? null : (
            <Progress
              aria-label={`${entry.descriptor.name} print progress`}
              aria-valuenow={run.progress}
              aria-valuetext={`${String(Math.round(run.progress))} percent`}
              value={run.progress}
            />
          )}
          <dl className='flex flex-col gap-0.5'>
            {(run.file ?? run.name) === undefined ? null : <PrintRow label='File'>{run.file ?? run.name}</PrintRow>}
            {run.stage === undefined ? null : <PrintRow label='Stage'>{run.stage}</PrintRow>}
            {speed === '' ? null : <PrintRow label='Speed'>{speed}</PrintRow>}
          </dl>
        </>
      ) : (
        <p className='text-xs text-muted-foreground'>No run in progress.</p>
      )}
    </div>
  );
}

function TemperatureGroup({
  entry,
  manifest,
  isStale,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly manifest: MachineManifest | undefined;
  readonly isStale: boolean;
}): React.JSX.Element {
  const { temperatures } = entry.snapshot;
  return (
    <div className='flex min-w-0 flex-col gap-1.5'>
      <GroupHeading label='Temperatures' isStale={isStale} />
      <dl className='flex flex-col gap-0.5'>
        <PrintRow label='Nozzle'>{temperature(temperatures?.nozzle, temperatures?.nozzleTarget)}</PrintRow>
        <PrintRow label='Bed'>{temperature(temperatures?.bed, temperatures?.bedTarget)}</PrintRow>
        {manifest?.chamber.enclosed === false && temperatures?.chamber === undefined ? null : (
          <PrintRow label='Chamber'>{temperature(temperatures?.chamber, undefined)}</PrintRow>
        )}
      </dl>
    </div>
  );
}

function EnvironmentGroup({
  entry,
  manifest,
  isStale,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly manifest: MachineManifest | undefined;
  readonly isStale: boolean;
}): React.JSX.Element {
  const { fans, lights, network, removableStorage } = entry.snapshot;
  return (
    <div className='flex min-w-0 flex-col gap-1.5'>
      <GroupHeading label='Fans and environment' isStale={isStale} />
      <ul className='flex flex-wrap gap-x-4 gap-y-1 text-xs'>
        {(manifest?.chamber.fans ?? [{ id: 'part', label: 'Part fan' }]).map((fan) => (
          <li key={fan.id} className='flex items-center gap-1.5 tabular-nums'>
            <Fan aria-hidden className='size-3.5 text-muted-foreground' />
            {fan.label} {fans?.[fan.id] === undefined ? 'not reported' : `${String(fans[fan.id])} %`}
          </li>
        ))}
        <li className='flex items-center gap-1.5'>
          <Lightbulb
            aria-hidden
            className={cn('size-3.5', lights?.chamber === 'on' ? 'text-warning' : 'text-muted-foreground')}
          />
          Light {lights?.chamber ?? 'not reported'}
        </li>
        <li className='flex items-center gap-1.5 tabular-nums'>
          <Wifi aria-hidden className='size-3.5 text-muted-foreground' />
          Wi-Fi {network?.wifiSignalDbm === undefined ? 'not reported' : `${String(network.wifiSignalDbm)} dBm`}
        </li>
        {removableStorage === undefined ? null : <li>Storage {removableStorage}</li>}
      </ul>
    </div>
  );
}

function MaterialGroup({
  entry,
  manifest,
  isStale,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly manifest: MachineManifest | undefined;
  readonly isStale: boolean;
}): React.JSX.Element {
  const { materialSystem, setup } = entry.snapshot;
  return (
    <div className='flex min-w-0 flex-col gap-1.5'>
      <GroupHeading label='Material' isStale={isStale} />
      {setup.materials.length === 0 ? (
        <p className='text-xs text-muted-foreground'>No material slots observed.</p>
      ) : (
        <ul aria-label='Material slots' className='flex flex-wrap gap-1.5 text-xs'>
          {setup.materials.map((material) => {
            const isCurrent = materialSystem?.currentSlot === material.slot;
            return (
              <li
                key={material.slot}
                className={cn(
                  'flex items-center gap-1.5 rounded-md border border-border/70 px-1.5 py-0.5',
                  isCurrent && 'border-border bg-accent',
                )}
              >
                <span className='font-mono'>{materialSlotLabel(material.slot, manifest)}</span>
                <span className={cn(material.state !== 'loaded' && 'text-muted-foreground')}>
                  {material.state === 'loaded'
                    ? (material.materialId ?? 'Loaded')
                    : material.state === 'empty'
                      ? 'Empty'
                      : 'Unknown'}
                </span>
                {material.remainingPercent === undefined ? null : (
                  <span className='text-muted-foreground tabular-nums'>{material.remainingPercent} %</span>
                )}
                {isCurrent ? <span className='sr-only'>, in use</span> : null}
              </li>
            );
          })}
        </ul>
      )}
      {materialSystem && materialSystem.units.length > 0 ? (
        <dl className='flex flex-col gap-0.5'>
          {materialSystem.units.map((unit) => (
            <PrintRow key={unit.unit} label={`Unit ${String.fromCodePoint(65 + unit.unit)}`}>
              {[
                unit.humidityIndex === undefined ? undefined : `humidity ${String(unit.humidityIndex)}`,
                unit.temperature === undefined ? undefined : formatQuantity(unit.temperature),
              ]
                .filter((part) => part !== undefined)
                .join(' · ') || 'not reported'}
            </PrintRow>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

/**
 * Monitor: the run, temperatures, environment, material slots and the camera,
 * each group wearing a stale badge past its manifest budget.
 *
 * @param properties - The client, machine and manifest.
 * @returns The section.
 * @public
 */
export function MonitorSection({
  client,
  entry,
  manifest,
}: {
  readonly client: MachineClient;
  readonly entry: MachineDirectoryEntry;
  readonly manifest: MachineManifest | undefined;
}): React.JSX.Element {
  const now = useNow();
  const { alerts } = entry.snapshot;
  const stale = (group: string): boolean => isObservationStale({ entry, manifest, group, now });

  return (
    <PrintSection title='Monitor'>
      {alerts && alerts.length > 0 ? (
        <PrintNotice tone='warning'>
          {alerts.length === 1 ? 'Active alert: ' : 'Active alerts: '}
          <span className='font-mono'>{alerts.map(({ code }) => code).join(', ')}</span>
        </PrintNotice>
      ) : null}
      <RunGroup entry={entry} isStale={stale('run')} />
      <TemperatureGroup entry={entry} manifest={manifest} isStale={stale('thermal')} />
      <EnvironmentGroup
        entry={entry}
        manifest={manifest}
        isStale={stale('fans') || stale('light') || stale('network')}
      />
      <MaterialGroup entry={entry} manifest={manifest} isStale={stale('material')} />
      {manifest?.camera.stills === false ? null : <StillCapture client={client} entry={entry} />}
    </PrintSection>
  );
}

const commandIcon = { pause: Pause, resume: Play, cancel: Square, 'urgent-stop': ShieldAlert } as const;
const commandLabel: Record<MachineControlRunInput['command'], string> = {
  pause: 'Pause',
  resume: 'Resume',
  cancel: 'Cancel run',
  'urgent-stop': 'Urgent stop',
};
const commandVerb: Record<MachineControlRunInput['command'], string> = {
  pause: 'Pause',
  resume: 'Resume',
  cancel: 'Cancel',
  'urgent-stop': 'Urgently stop',
};
/** Manifest actions the pane implements through the run controls, Send and the camera. */
const implementedActions = new Set([
  'print.start',
  'run.pause',
  'run.resume',
  'run.cancel',
  'run.urgent-stop',
  'camera.still',
]);

/**
 * The run commands the observed run admits, in the order they are offered.
 * Urgent stop is always offered while a run is active (coordinator ruling 11);
 * the section disables every command while the observation is stale.
 *
 * @param entry - The machine as observed.
 * @returns The commands, empty without an active run.
 * @public
 */
export const availableRunCommands = (
  entry: MachineDirectoryEntry,
): ReadonlyArray<MachineControlRunInput['command']> => {
  if (!entry.snapshot.activeRunId) {
    return [];
  }
  const state = entry.snapshot.run?.state;
  const byState: ReadonlyArray<MachineControlRunInput['command']> =
    state === 'printing' ? ['pause', 'cancel'] : state === 'paused' ? ['resume', 'cancel'] : [];
  return [...byState, 'urgent-stop'];
};

const qualificationReason: Record<MachineManifest['actions'][number]['qualification'], string> = {
  qualified: 'Not available in this pane yet',
  designed: 'Designed, not yet qualified on this machine',
  unsupported: 'Not supported',
};

/**
 * Controls: pause, resume, cancel and urgent stop for the exact observed run,
 * each behind a named confirmation, plus every other manifest action shown
 * disabled with its qualification (blueprint R3, R7).
 *
 * @param properties - The client, machine, manifest and receipt sink.
 * @returns The section.
 * @public
 */
export function ControlsSection({
  client,
  entry,
  manifest,
  onReceipt,
}: {
  readonly client: MachineClient;
  readonly entry: MachineDirectoryEntry;
  readonly manifest: MachineManifest | undefined;
  readonly onReceipt: (receipt: MachineOperationReceipt) => void;
}): React.JSX.Element {
  const [isBusy, setIsBusy] = useState(false);
  const [confirming, setConfirming] = useState<MachineControlRunInput['command']>();
  const [error, setError] = useState<string>();
  const commands = availableRunCommands(entry);
  const isCurrent = entry.freshness === 'current' && entry.snapshot.connection === 'connected';
  const otherActions = (manifest?.actions ?? []).filter((action) => !implementedActions.has(action.id));

  const issue = async (command: MachineControlRunInput['command']): Promise<void> => {
    const expectedProviderRunId = entry.snapshot.activeRunId;
    if (!expectedProviderRunId) {
      return;
    }
    setIsBusy(true);
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
      setIsBusy(false);
    }
  };

  return (
    <PrintSection title='Controls'>
      {commands.length > 0 ? (
        <div role='group' aria-label={`Controls for ${entry.descriptor.name}`} className='flex flex-wrap gap-2'>
          {commands.map((command) => {
            const Icon = commandIcon[command];
            return (
              <Button
                key={command}
                type='button'
                size='sm'
                variant='outline'
                className={
                  command === 'urgent-stop'
                    ? 'border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive'
                    : undefined
                }
                disabled={!isCurrent || isBusy || confirming !== undefined}
                onClick={() => {
                  setConfirming(command);
                }}
              >
                <Icon aria-hidden />
                {commandLabel[command]}
              </Button>
            );
          })}
        </div>
      ) : (
        <p className='text-xs text-muted-foreground'>No run to control.</p>
      )}
      {isCurrent ? null : (
        <p role='status' className='text-xs text-muted-foreground'>
          Run controls wait for a current observation from the machine.
        </p>
      )}
      {confirming ? (
        <div
          role='alertdialog'
          aria-label={`Confirm ${commandLabel[confirming].toLowerCase()}`}
          className='rounded-lg border border-warning/30 bg-warning/10 p-2 text-xs'
        >
          <p>
            {commandVerb[confirming]} {entry.descriptor.name}
            ’s current run{entry.snapshot.run?.file ? ` (${entry.snapshot.run.file})` : ''}?
            {confirming === 'urgent-stop'
              ? ' This is a priority stop of the current run, not a certified emergency stop.'
              : ''}
          </p>
          <div className='mt-2 flex flex-wrap gap-2'>
            <Button
              type='button'
              size='sm'
              variant={confirming === 'cancel' || confirming === 'urgent-stop' ? 'destructive' : 'default'}
              disabled={isBusy}
              autoFocus
              onClick={() => {
                const command = confirming;
                setConfirming(undefined);
                void issue(command);
              }}
            >
              {isBusy ? <LoaderCircle aria-hidden className='animate-spin motion-reduce:animate-none' /> : null}
              Confirm {commandLabel[confirming].toLowerCase()}
            </Button>
            <Button
              type='button'
              size='sm'
              variant='outline'
              onClick={() => {
                setConfirming(undefined);
              }}
            >
              Keep going
            </Button>
          </div>
        </div>
      ) : null}
      {error ? <PrintNotice tone='destructive'>{error}</PrintNotice> : null}
      {otherActions.length > 0 ? (
        <PrintDisclosure title='Other actions' summary={`${String(otherActions.length)} declared`}>
          <ul className='flex flex-col gap-1'>
            {otherActions.map((action) => (
              <li key={action.id} className='flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs'>
                <Button
                  type='button'
                  size='xs'
                  variant='outline'
                  disabled
                  aria-describedby={`print-action-${action.id}`}
                >
                  {action.label}
                </Button>
                <span id={`print-action-${action.id}`} className='min-w-0 text-muted-foreground'>
                  {qualificationReason[action.qualification]}
                  {action.description ? ` · ${action.description}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </PrintDisclosure>
      ) : null}
    </PrintSection>
  );
}

const requestStateLabel: Record<PrintRequest['state'], string> = {
  preparing: 'Checking',
  'awaiting-approval': 'Waiting for approval',
  approved: 'Approved',
  uploading: 'Uploading',
  starting: 'Starting',
  started: 'Started',
  denied: 'Denied',
  withdrawn: 'Cancelled',
  rejected: 'Rejected',
  unknown: 'Start unconfirmed',
  failed: 'Refused',
};

/** One journaled effect the pane observed this session, receipt or reconciliation. @public */
export type LedgerEntry =
  | Readonly<{ kind: 'receipt'; receipt: MachineOperationReceipt }>
  | Readonly<{ kind: 'reconciled'; snapshot: MachineOperationSnapshot }>;

const activeRunLabel: Readonly<Partial<Record<string, string>>> = {
  preparing: 'Preparing',
  printing: 'Printing',
  paused: 'Paused',
  finishing: 'Finishing',
};

/**
 * What a started request's run is doing now. A request ends at "started" by
 * contract; the run's outcome lives in the machine's observation and the
 * session's receipts, so a started request is read against them rather than
 * saying "Started" after the run has gone.
 *
 * @param request - A request in the `started` state.
 * @param entry - The machine as observed, when the pane shows it.
 * @param ledger - The receipts the pane saw this session.
 * @returns The label for the request's run.
 * @public
 */
export const startedRunLabel = (
  request: PrintRequest,
  entry: MachineDirectoryEntry | undefined,
  ledger: readonly LedgerEntry[],
): string => {
  const { receipt } = request;
  const runId = receipt !== undefined && 'providerRunId' in receipt ? receipt.providerRunId : undefined;
  // Only a current observation of this machine made after the start can say the run moved on.
  if (
    entry?.machineId !== request.machineId ||
    entry.freshness !== 'current' ||
    Date.parse(entry.snapshot.observedAt) <= Date.parse(receipt?.observedAt ?? request.updatedAt)
  ) {
    return 'Started';
  }
  const { activeRunId, run } = entry.snapshot;
  if (activeRunId !== undefined) {
    // Without the start's run id the active run may be another one, so say no more than "Started".
    return activeRunId === runId ? (activeRunLabel[run?.state ?? 'unknown'] ?? 'Started') : 'Started';
  }
  const stop = ledger.find(
    (item) =>
      item.kind === 'receipt' &&
      item.receipt.status === 'accepted' &&
      (item.receipt.kind === 'urgent-stop' || item.receipt.kind === 'cancel') &&
      runId !== undefined &&
      'providerRunId' in item.receipt &&
      item.receipt.providerRunId === runId,
  );
  if (stop?.kind === 'receipt') {
    return stop.receipt.kind === 'urgent-stop' ? 'Stopped' : 'Run cancelled';
  }
  return 'Run ended';
};

/**
 * Activity: the print requests and the operation receipts, newest first.
 *
 * @param properties - The requests, the session ledger and the observed machine.
 * @returns The disclosure.
 * @public
 */
export function ActivitySection({
  requests,
  ledger,
  entry,
}: {
  readonly requests: readonly PrintRequest[];
  readonly ledger: readonly LedgerEntry[];
  /** The machine as observed, so a started request reads against its run. */
  readonly entry?: MachineDirectoryEntry;
}): React.JSX.Element {
  const count = requests.length + ledger.length;
  return (
    <PrintDisclosure title='Activity' summary={count === 0 ? 'Nothing yet' : `${String(count)} entries`}>
      {count === 0 ? <p className='text-xs text-muted-foreground'>Requests and receipts appear here.</p> : null}
      {requests.length > 0 ? (
        <ul aria-label='Print requests' className='flex flex-col gap-1 text-xs'>
          {requests.map((request) => (
            <li key={request.requestId} className='flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5'>
              <span className='font-medium'>
                {request.state === 'started'
                  ? startedRunLabel(request, entry, ledger)
                  : requestStateLabel[request.state]}
              </span>
              <span className='min-w-0 truncate'>{request.summary.fileName}</span>
              <span className='text-muted-foreground'>
                by {request.requestedBy.label} ·{' '}
                <time dateTime={request.updatedAt}>{formatRelativeTime(Date.parse(request.updatedAt))}</time>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {ledger.length > 0 ? (
        <ul aria-label='Operation receipts' className='flex flex-col gap-1 text-xs'>
          {ledger.map((entry) => {
            const record = entry.kind === 'receipt' ? entry.receipt : entry.snapshot;
            return (
              <li
                key={`${entry.kind}-${record.operationId}`}
                className='flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5'
              >
                <span className='font-medium'>
                  {record.kind} {record.status}
                </span>
                {entry.kind === 'reconciled' ? <span className='text-muted-foreground'>reconciled</span> : null}
                <span className='min-w-0 truncate font-mono text-muted-foreground'>{record.operationId}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </PrintDisclosure>
  );
}

/**
 * Inspect: identity, firmware and its qualification, geometry, tooling,
 * coverage and provider ids. Engineering detail on request.
 *
 * @param properties - The machine, its provider and manifest.
 * @returns The disclosure.
 * @public
 */
export function InspectSection({
  entry,
  provider,
  manifest,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly provider: MachineProvider | undefined;
  readonly manifest: MachineManifest | undefined;
}): React.JSX.Element {
  const { descriptor } = entry;
  const isQualifiedFirmware = manifest?.identity.qualifiedFirmware.includes(descriptor.firmware);
  return (
    <PrintDisclosure title='Inspect'>
      <dl className='grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs'>
        <dt className='text-muted-foreground'>Machine</dt>
        <dd>
          {descriptor.vendor} {descriptor.model}
          {manifest?.identity.family ? ` · ${manifest.identity.family}` : ''}
        </dd>
        <dt className='text-muted-foreground'>Firmware</dt>
        <dd>
          {descriptor.firmware}
          {manifest ? (isQualifiedFirmware ? ' · qualified' : ' · not on the qualified list') : ''}
        </dd>
        {manifest ? (
          <>
            <dt className='text-muted-foreground'>Build volume</dt>
            <dd className='tabular-nums'>
              {manifest.geometry.buildVolume.x} × {manifest.geometry.buildVolume.y} × {manifest.geometry.buildVolume.z}{' '}
              mm · {manifest.geometry.kinematics}
            </dd>
            <dt className='text-muted-foreground'>Nozzles</dt>
            <dd>
              {manifest.toolhead.nozzles
                .map(
                  (nozzle) =>
                    `${formatQuantity(nozzle.diameter)} ${nozzle.material} to ${formatQuantity(nozzle.maximumTemperature)}`,
                )
                .join(', ')}
            </dd>
            <dt className='text-muted-foreground'>Plates</dt>
            <dd>{manifest.bed.plates.map((plate) => plate.label).join(', ')}</dd>
            <dt className='text-muted-foreground'>Material system</dt>
            <dd>
              {manifest.materialSystem.units} × {manifest.materialSystem.slotsPerUnit} slots
              {manifest.materialSystem.externalSpool ? ', external spool' : ''}
            </dd>
          </>
        ) : null}
        <dt className='text-muted-foreground'>Observed tool</dt>
        <dd>{entry.snapshot.setup.toolId ?? 'Not reported'}</dd>
        <dt className='text-muted-foreground'>Operations</dt>
        <dd className='break-words'>{descriptor.operations.join(', ')}</dd>
        <dt className='text-muted-foreground'>Provider</dt>
        <dd className='break-all'>
          {entry.providerId}
          {provider ? ` ${provider.version}` : ''}
        </dd>
        <dt className='text-muted-foreground'>Machine id</dt>
        <dd className='font-mono break-all'>{entry.machineId}</dd>
        <dt className='text-muted-foreground'>Physical id</dt>
        <dd className='font-mono break-all'>{descriptor.id}</dd>
        <dt className='text-muted-foreground'>Observed</dt>
        <dd>
          <time dateTime={entry.snapshot.observedAt}>{new Date(entry.snapshot.observedAt).toLocaleString()}</time> ·{' '}
          {entry.freshness}
        </dd>
        {manifest ? (
          <>
            <dt className='text-muted-foreground'>Staleness budgets</dt>
            <dd className='break-words'>
              {manifest.observations
                .map((group) => `${group.label} ${String(Math.round(group.staleAfter / 1000))} s`)
                .join(', ')}
            </dd>
          </>
        ) : null}
      </dl>
    </PrintDisclosure>
  );
}
