import { Fragment, useState } from 'react';
import {
  Activity,
  History,
  Info,
  LoaderCircle,
  OctagonAlert,
  Pause,
  Play,
  ShieldAlert,
  Square,
  TriangleAlert,
} from 'lucide-react';
import type {
  MachineAlertSnapshot,
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
import { cn } from '@taucad/ui/utils/cn';
import { randomUuid } from '@taucad/utils/id';
import { ExternalLink } from '#components/external-link.js';
import type { ApplyMachineAction } from '#routes/w.$workspace.$project/chat-print-controls.js';
import { MaterialSlots, materialInUse } from '#routes/w.$workspace.$project/chat-print-materials.js';
import {
  PrintNotice,
  PrintRow,
  PrintStage,
  StaleBadge,
  useNow,
} from '#routes/w.$workspace.$project/chat-print-section.js';
import { formatQuantity, formatRemaining, readableStage } from '#routes/w.$workspace.$project/chat-print-summary.js';
import { formatRelativeTime } from '#utils/date.utils.js';
import { startedRunIdOf } from '#hooks/use-machines-print-requests.js';

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
  const stage = readableStage(run.stage);
  // Bambu reports a run as printing while it levels the bed and calibrates at layer 0 (blueprint
  // x1c-start-confirmation F7), so the stage says what it is doing until the first layer starts.
  if (run.state === 'printing' && run.currentLayer === 0 && stage !== undefined) {
    return [
      `Preparing · ${stage}`,
      run.remainingSeconds === undefined ? undefined : formatRemaining(run.remainingSeconds),
    ]
      .filter(Boolean)
      .join(' · ');
  }
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

/** A member of the archive the printer runs, such as `/data/Metadata/plate_1.gcode`: an internal path, not a name. */
const archiveMemberPath = /(?:^|\/)Metadata\/plate_\d+\.gcode$/u;

/**
 * Whether the printer names a run after the file this request uploaded: the upload's own name, or
 * that name without its extensions, which is how a Bambu printer names a Tau start (`tau-<preparedId>`).
 *
 * @param request - Any request; only a prepared one has an upload name.
 * @param runName - The run's name or file as the printer reports it.
 * @returns True when the run is this request's upload.
 */
const namesUpload = (request: PrintRequest, runName: string | undefined): boolean => {
  const remoteName = request.prepared?.remoteName;
  return (
    remoteName !== undefined &&
    runName !== undefined &&
    (remoteName === runName || remoteName.startsWith(`${runName}.`))
  );
};

/**
 * The run's file as the person approved it, else as the printer names it. A Tau print matches its
 * request in any state, by the start's provider run id or by the upload name the printer reports,
 * so an unconfirmed start still shows its file; the printer's archive member path never shows.
 *
 * @param entry - The observed machine.
 * @param requests - Its print requests.
 * @returns The file name, or `undefined` without a run or a showable name.
 */
export const runFileName = (entry: MachineDirectoryEntry, requests: readonly PrintRequest[]): string | undefined => {
  const { activeRunId, run } = entry.snapshot;
  if (!run) {
    return undefined;
  }
  const request = requests.find(
    (candidate) =>
      (activeRunId !== undefined && startedRunIdOf(candidate) === activeRunId) ||
      namesUpload(candidate, run.name) ||
      namesUpload(candidate, run.file),
  );
  return (
    request?.summary.fileName ??
    run.name ??
    (run.file === undefined || archiveMemberPath.test(run.file) ? undefined : run.file)
  );
};

/**
 * What the run block above does not already say during a run: a stage other than the run's own state.
 *
 * @param properties - The machine and whether its run observation is stale.
 * @returns The group, or nothing when it has nothing to add.
 */
function RunGroup({
  entry,
  isStale,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly isStale: boolean;
}): React.JSX.Element | undefined {
  const { run } = entry.snapshot;
  /* Without a run the stage belongs to whatever else the printer does, such as a filament change its slot shows. */
  if (run === undefined || run.state === 'idle' || run.state === 'succeeded') {
    return undefined;
  }
  const stage = readableStage(run.stage);
  /* While calibrating at layer 0 the run line above already names the stage (describeRun). */
  const extraStage =
    stage === undefined || stage.toLowerCase() === run.state || describeRun(entry)?.includes(stage) === true
      ? undefined
      : stage;
  if (extraStage === undefined && !isStale) {
    return undefined;
  }
  return (
    <div className='flex min-w-0 flex-col gap-1.5'>
      <GroupHeading label='Run' isStale={isStale} />
      {extraStage === undefined ? null : (
        <dl className='flex flex-col gap-0.5'>
          <PrintRow label='Stage'>{extraStage}</PrintRow>
        </dl>
      )}
    </div>
  );
}

type Temperature = NonNullable<NonNullable<MachineDirectoryEntry['snapshot']['temperatures']>['nozzle']>;

/** A heater in whole degrees, as the printer's own screen shows it: "24 °C", not "24.34 °C". */
const formatTemperature = (temperature: Temperature): string =>
  formatQuantity({ ...temperature, value: Math.round(temperature.value) });

/**
 * The heaters as three columns a person reads at a glance: where each one is, and where it is heading.
 *
 * @param properties - The machine, its manifest and whether the thermal observation is stale.
 * @returns The group.
 */
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
  const heaters = [
    { label: 'Nozzle', current: temperatures?.nozzle, target: temperatures?.nozzleTarget },
    { label: 'Bed', current: temperatures?.bed, target: temperatures?.bedTarget },
    ...(manifest?.chamber.enclosed === false && temperatures?.chamber === undefined
      ? []
      : [{ label: 'Chamber', current: temperatures?.chamber, target: undefined }]),
  ];
  return (
    <div className='flex min-w-0 flex-col gap-1.5'>
      <GroupHeading label='Temperatures' isStale={isStale} />
      <dl className='grid grid-cols-3 gap-x-3 gap-y-1'>
        {heaters.map(({ label, current, target }) => (
          <div key={label} className='flex min-w-0 flex-col'>
            <dt className='truncate text-xs text-muted-foreground'>{label}</dt>
            <dd className='truncate text-sm font-medium tabular-nums'>
              {current === undefined ? '–' : formatTemperature(current)}
            </dd>
            {/* A target of 0 is a heater that is off, not one heating to 0 °C. */}
            {target === undefined || target.value === 0 ? null : (
              <dd className='truncate text-xs text-muted-foreground tabular-nums'>to {formatTemperature(target)}</dd>
            )}
          </div>
        ))}
      </dl>
    </div>
  );
}

type AlertTone = 'error' | 'warning' | 'neutral';

/** An alert without a severity reads as a warning, as every alert did before severities. */
const toneOf = ({ severity }: MachineAlertSnapshot): AlertTone =>
  severity === 'fatal' || severity === 'serious' ? 'error' : severity === 'info' ? 'neutral' : 'warning';

/** Each tone keeps its own glyph shape, so severity never rests on colour alone. */
const alertGlyph = { error: OctagonAlert, warning: TriangleAlert, neutral: Info } as const;

const severityLabel: Readonly<Record<NonNullable<MachineAlertSnapshot['severity']>, string>> = {
  fatal: 'Fatal',
  serious: 'Serious',
  warning: 'Warning',
  info: 'Notice',
};

/**
 * The printer's active alerts, one line each in one notice: the provider's sentence, the vendor's
 * code and a link to its help page. The notice takes the most severe alert's tone.
 *
 * @param properties - The alerts, at least one.
 * @returns The notice.
 */
function AlertNotice({ alerts }: { readonly alerts: readonly MachineAlertSnapshot[] }): React.JSX.Element {
  const tones = new Set(alerts.map((alert) => toneOf(alert)));
  const tone: AlertTone = tones.has('error') ? 'error' : tones.has('warning') ? 'warning' : 'neutral';
  return (
    <div
      role='alert'
      aria-label={alerts.length === 1 ? 'Printer alert' : 'Printer alerts'}
      className={cn(
        'min-w-0 rounded-lg border p-2 text-xs',
        tone === 'error' && 'border-feature/30 bg-feature/10',
        tone === 'warning' && 'border-warning/30 bg-warning/10',
        tone === 'neutral' && 'border-border/70 bg-muted/30',
      )}
    >
      <ul className='flex flex-col gap-2'>
        {alerts.map((alert) => {
          const alertTone = toneOf(alert);
          const Glyph = alertGlyph[alertTone];
          return (
            <li key={alert.code} className='flex min-w-0 items-start gap-2'>
              <Glyph
                aria-hidden
                className={cn(
                  'mt-0.5 size-3.5 shrink-0',
                  alertTone === 'error' && 'text-feature',
                  alertTone === 'warning' && 'text-warning',
                  alertTone === 'neutral' && 'text-muted-foreground',
                )}
              />
              <div className='min-w-0 flex-1 break-words'>
                <p>
                  {alert.severity === undefined ? null : (
                    <span className='sr-only'>{severityLabel[alert.severity]}: </span>
                  )}
                  {alert.message ?? 'The printer reported an alert.'}
                </p>
                <p className='flex flex-wrap items-baseline gap-x-2 text-muted-foreground'>
                  <span className='font-mono'>{alert.code}</span>
                  {/* The directory admits only https help pages; anything else is not a link. */}
                  {alert.reference?.startsWith('https://') ? (
                    <ExternalLink href={alert.reference} className='text-foreground' arrowSize='xs'>
                      Look up<span className='sr-only'> {alert.code}</span>
                    </ExternalLink>
                  ) : null}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * The printer's alerts, outside every stage: a decision is never folded away.
 *
 * @param properties - The machine as observed.
 * @returns The notice, or nothing without alerts.
 * @public
 */
export function PrinterAlerts({ entry }: { readonly entry: MachineDirectoryEntry }): React.JSX.Element | undefined {
  const { alerts } = entry.snapshot;
  return alerts && alerts.length > 0 ? <AlertNotice alerts={alerts} /> : undefined;
}

/**
 * The closed Monitor's summary: the slot in use and the heaters, "A1 PETG · nozzle 255 °C · bed 80 °C".
 *
 * @param entry - The machine as observed.
 * @param manifest - Its manifest, for slot names.
 * @returns The summary.
 * @public
 */
export const monitorSummary = (entry: MachineDirectoryEntry, manifest: MachineManifest | undefined): string => {
  const { temperatures } = entry.snapshot;
  return [
    materialInUse(entry, manifest),
    temperatures?.nozzle === undefined ? undefined : `nozzle ${formatTemperature(temperatures.nozzle)}`,
    temperatures?.bed === undefined ? undefined : `bed ${formatTemperature(temperatures.bed)}`,
  ]
    .filter((part) => part !== undefined)
    .join(' · ');
};

/**
 * Monitor, the first stage and open by default: the run's stage, the temperatures and the material
 * slots, each group wearing a stale badge past its manifest budget. A slot opens in place for its
 * filament actions.
 *
 * @param properties - The machine, its manifest and the action seam.
 * @returns The stage.
 * @public
 */
export function MonitorStage({
  entry,
  manifest,
  apply,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly manifest: MachineManifest | undefined;
  readonly apply: ApplyMachineAction | undefined;
}): React.JSX.Element {
  const now = useNow();
  const stale = (group: string): boolean => isObservationStale({ entry, manifest, group, now });
  return (
    <PrintStage icon={Activity} title='Monitor' summary={monitorSummary(entry, manifest)} isDefaultOpen>
      <RunGroup entry={entry} isStale={stale('run')} />
      <TemperatureGroup entry={entry} manifest={manifest} isStale={stale('thermal')} />
      <MaterialSlots entry={entry} manifest={manifest} apply={apply} isStale={stale('material')} />
    </PrintStage>
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
/** Manifest actions the pane offers through Send, the run controls, the Control center and the slots; Inspect lists the rest. */
const implementedActions = new Set([
  'print.start',
  'run.pause',
  'run.resume',
  'run.cancel',
  'run.urgent-stop',
  'camera.still',
  'light.set',
  'speed.set',
  'material.load',
  'material.unload',
  'material.continue',
  'material.set',
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
  qualified: 'Not in this pane yet',
  designed: 'Designed, not yet qualified',
  unsupported: 'Not supported',
};

/**
 * Controls: pause, resume, cancel and urgent stop for the exact observed run,
 * each behind a named confirmation (blueprint R3). They wait for a current
 * observation; the pane's observation notice says so once.
 *
 * @param properties - The client, machine, its requests and the receipt sink.
 * @returns The controls, or nothing without a run to control.
 * @public
 */
export function ControlsSection({
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
  const [isBusy, setIsBusy] = useState(false);
  const [confirming, setConfirming] = useState<MachineControlRunInput['command']>();
  const [error, setError] = useState<string>();
  const commands = availableRunCommands(entry);
  const isCurrent = entry.freshness === 'current' && entry.snapshot.connection === 'connected';
  const fileName = runFileName(entry, requests);

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

  if (commands.length === 0 && confirming === undefined && error === undefined) {
    return undefined;
  }
  return (
    <div className='flex min-w-0 flex-col gap-2'>
      {commands.length > 0 ? (
        <div role='group' aria-label={`Controls for ${entry.name}`} className='flex flex-wrap gap-2'>
          {commands.map((command) => {
            const Icon = commandIcon[command];
            return (
              <Button
                key={command}
                type='button'
                size='sm'
                variant={command === 'urgent-stop' ? 'destructive' : 'outline'}
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
      ) : null}
      {confirming ? (
        <div
          role='alertdialog'
          aria-label={`Confirm ${commandLabel[confirming].toLowerCase()}`}
          className='rounded-lg border border-warning/30 bg-warning/10 p-2 text-xs'
        >
          <p>
            {commandVerb[confirming]} {entry.name}
            ’s current run{fileName === undefined ? '' : ` (${fileName})`}?
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
      {error ? <PrintNotice tone='error'>{error}</PrintNotice> : null}
    </div>
  );
}

const requestStateLabel: Record<PrintRequest['state'], string> = {
  preparing: 'Checking',
  'awaiting-approval': 'Waiting for approval',
  approved: 'Approved',
  uploading: 'Uploading',
  starting: 'Starting',
  confirming: 'Confirming the start',
  started: 'Started',
  denied: 'Denied',
  withdrawn: 'Cancelled',
  rejected: 'Rejected',
  unknown: 'Start not confirmed',
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
  const runId = startedRunIdOf(request);
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
 * History: the print requests and the operation receipts, newest first; nothing while empty.
 *
 * @param properties - The requests, the session ledger and the observed machine.
 * @returns The stage, or nothing without an entry.
 * @public
 */
export function HistoryStage({
  requests,
  ledger,
  entry,
}: {
  readonly requests: readonly PrintRequest[];
  readonly ledger: readonly LedgerEntry[];
  /** The machine as observed, so a started request reads against its run. */
  readonly entry?: MachineDirectoryEntry;
}): React.JSX.Element | undefined {
  const count = requests.length + ledger.length;
  if (count === 0) {
    return undefined;
  }
  return (
    <PrintStage icon={History} title='History' summary={count === 1 ? '1 entry' : `${String(count)} entries`}>
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
    </PrintStage>
  );
}

/**
 * Inspect: identity, firmware and its qualification, geometry, tooling, the slicer, the open
 * request's artifact, actions not yet available, coverage and provider ids. Engineering detail on request.
 *
 * @param properties - The machine, its provider and manifest, the slicer and the open request.
 * @returns The stage.
 * @public
 */
export function InspectStage({
  entry,
  provider,
  manifest,
  slicer,
  request,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly provider: MachineProvider | undefined;
  readonly manifest: MachineManifest | undefined;
  /** The slicer Prepare uses, with its version when known. */
  readonly slicer?: string;
  /** The open print request, whose exact artifact is inspection detail beside its decision. */
  readonly request?: PrintRequest;
}): React.JSX.Element {
  const { descriptor } = entry;
  const isQualifiedFirmware = manifest?.identity.qualifiedFirmware.includes(descriptor.firmware);
  const otherActions = (manifest?.actions ?? []).filter((action) => !implementedActions.has(action.id));
  const unavailable = Object.entries(Object.groupBy(otherActions, (action) => action.qualification));
  return (
    <PrintStage icon={Info} title='Inspect' summary={`${descriptor.model} · firmware ${descriptor.firmware}`}>
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
        {slicer === undefined ? null : (
          <>
            <dt className='text-muted-foreground'>Slicer</dt>
            <dd>{slicer}</dd>
          </>
        )}
        {request === undefined ? null : (
          <>
            <dt className='text-muted-foreground'>Request</dt>
            <dd className='font-mono break-all'>{request.requestId}</dd>
            <dt className='text-muted-foreground'>Artifact</dt>
            <dd className='break-all'>{request.artifact.path}</dd>
            <dt className='text-muted-foreground'>Digest</dt>
            <dd className='font-mono break-all'>{request.artifact.digest}</dd>
          </>
        )}
        {unavailable.map(([qualification, actions]) => (
          <Fragment key={qualification}>
            <dt className='text-muted-foreground'>
              {qualificationReason[qualification as keyof typeof qualificationReason]}
            </dt>
            <dd className='break-words'>{actions.map((action) => action.label).join(', ')}</dd>
          </Fragment>
        ))}
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
    </PrintStage>
  );
}
