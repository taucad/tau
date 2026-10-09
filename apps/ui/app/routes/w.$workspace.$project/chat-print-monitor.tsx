import { useEffect, useId, useRef, useState } from 'react';
import { Activity, Bot, History, Info, LoaderCircle, OctagonAlert, Play, TriangleAlert } from 'lucide-react';
import { componentValue, fffProcessOf, millingProcessOf } from '@taucad/runtime/machine';
import type {
  ComponentObservation,
  MachineAlert,
  MachineDirectoryEntry,
  MachineJob,
  MachineObservationGroup,
  MachineOperation,
  MachineProvider,
  MachineReading,
} from '@taucad/runtime/machine';
import { Badge } from '@taucad/ui/components/badge';
import { Button } from '@taucad/ui/components/button';
import { Progress } from '@taucad/ui/components/progress';
import { cn } from '@taucad/ui/utils/cn';
import { ExternalLink } from '#components/external-link.js';
import { describeOutcome, formatQuantity, materialSystemOf, toolheadOf } from '#components/print/machine-facts.js';
import type { MachineControl } from '#hooks/use-machine-control.js';
import {
  ActionButton,
  Blocked,
  Consequences,
  RemedyButton,
  declaredAction,
} from '#routes/w.$workspace.$project/chat-print-controls.js';
import { MaterialSlots, materialInUse } from '#routes/w.$workspace.$project/chat-print-materials.js';
import {
  PrintDisclosure,
  PrintRow,
  PrintStage,
  StaleBadge,
  useNow,
} from '#routes/w.$workspace.$project/chat-print-section.js';
import { formatRemaining, readableStage } from '#routes/w.$workspace.$project/chat-print-summary.js';
import { formatRelativeTime } from '#utils/date.utils.js';

/**
 * Whether a component's observation is past the time the host said it stays valid.
 *
 * @param input - The machine, the component, its group and the clock.
 * @returns True when the observation should wear a stale badge.
 * @public
 */
export const isObservationStale = ({
  entry,
  componentId,
  group,
  now,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly componentId: string;
  readonly group: string;
  readonly now: number;
}): boolean => {
  if (entry.freshness === 'stale') {
    return true;
  }
  const observation = entry.snapshot.components.find(
    (candidate) => candidate.componentId === componentId && candidate.group === group,
  );
  return observation?.validUntil !== undefined && Date.parse(observation.validUntil) <= now;
};

const runWords: Readonly<Record<NonNullable<MachineDirectoryEntry['snapshot']['run']>['state'], string>> = {
  starting: 'Starting',
  running: 'Running',
  paused: 'Paused',
  finishing: 'Finishing',
  completed: 'Finished',
  cancelled: 'Cancelled',
  failed: 'Failed',
  unknown: 'Run state unknown',
};

/** What a run's counters are counted from, for the counter's title. */
const basisWords = {
  executed: 'reported by the machine as done',
  queued: 'sent to the machine; it runs a few lines behind',
  estimated: 'estimated from time',
} as const;

/**
 * The run line a person reads first: "Running · layer 42 of 125 · 9 min left".
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
  const stage = readableStage(run.stage);
  const state =
    run.state === 'paused' && run.paused?.reason !== undefined ? `Paused: ${run.paused.reason}` : runWords[run.state];
  const counter = run.progress.counters[0];
  const counted =
    counter === undefined
      ? undefined
      : `${counter.label.toLowerCase()} ${counter.current.toLocaleString()}${counter.total === undefined ? '' : ` of ${counter.total.toLocaleString()}`}`;
  const isEnded = ['completed', 'cancelled', 'failed'].includes(run.state);
  return [
    stage !== undefined && run.state === 'running' ? stage : state,
    counted,
    run.progress.remaining === undefined || isEnded ? undefined : formatRemaining(run.progress.remaining / 1000),
  ]
    .filter((part) => part !== undefined)
    .join(' · ');
};

type AlertTone = 'error' | 'warning' | 'neutral';

const toneOf = ({ severity }: MachineAlert): AlertTone =>
  severity === 'fatal' || severity === 'serious' ? 'error' : severity === 'info' ? 'neutral' : 'warning';

const alertGlyph = { error: OctagonAlert, warning: TriangleAlert, neutral: Info } as const;

const severityLabel: Readonly<Record<NonNullable<MachineAlert['severity']>, string>> = {
  fatal: 'Fatal',
  serious: 'Serious',
  warning: 'Warning',
  info: 'Notice',
};

/**
 * The machine's active alerts, outside every stage: the provider's sentence, the vendor's code, its help page and
 * what clears it. The notice takes the most severe alert's tone.
 *
 * @param properties - The control.
 * @returns The notice, or nothing without alerts.
 * @public
 */
export function MachineAlerts({ control }: { readonly control: MachineControl }): React.JSX.Element | undefined {
  const { alerts } = control.entry.snapshot;
  if (alerts.length === 0) {
    return undefined;
  }
  const tones = new Set(alerts.map((alert) => toneOf(alert)));
  const tone: AlertTone = tones.has('error') ? 'error' : tones.has('warning') ? 'warning' : 'neutral';
  return (
    <div
      role='alert'
      aria-label={alerts.length === 1 ? 'Machine alert' : 'Machine alerts'}
      className={cn(
        'min-w-0 rounded-lg border p-2 text-xs',
        tone === 'error' && 'border-feature/30 bg-feature/10',
        tone === 'warning' && 'border-warning/30 bg-warning/10',
        tone === 'neutral' && 'border-border/70 bg-muted/30',
      )}
    >
      <ul className='flex flex-col gap-2'>
        {alerts.map((alert, index) => {
          const alertTone = toneOf(alert);
          const Glyph = alertGlyph[alertTone];
          return (
            // Alerts carry no id and two may share a code; each item is stateless, so its place is its key.
            // oxlint-disable-next-line react/no-array-index-key -- see above.
            <li key={index} className='flex min-w-0 items-start gap-2'>
              <Glyph
                aria-hidden
                className={cn(
                  'mt-0.5 size-3.5 shrink-0',
                  alertTone === 'error' && 'text-feature',
                  alertTone === 'warning' && 'text-warning',
                  alertTone === 'neutral' && 'text-muted-foreground',
                )}
              />
              <div className='flex min-w-0 flex-1 flex-col gap-1 break-words'>
                <p>
                  {alert.severity === undefined ? null : (
                    <span className='sr-only'>{severityLabel[alert.severity]}: </span>
                  )}
                  {alert.message ?? 'The machine reported an alert.'}
                </p>
                <p className='flex flex-wrap items-baseline gap-x-2 text-muted-foreground'>
                  <span className='font-mono'>{alert.code}</span>
                  {alert.reference?.startsWith('https://') ? (
                    <ExternalLink href={alert.reference} className='text-foreground' arrowSize='xs'>
                      Look up<span className='sr-only'> {alert.code}</span>
                    </ExternalLink>
                  ) : null}
                </p>
                {alert.remedies === undefined || alert.remedies.length === 0 ? null : (
                  <div className='flex flex-wrap items-center gap-2'>
                    {alert.remedies.map((remedy) => (
                      <RemedyButton
                        key={remedy.type === 'action' ? `${remedy.componentId}:${remedy.action}` : remedy.instruction}
                        control={control}
                        remedy={remedy}
                      />
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A heater in whole degrees, as a printer's own screen shows it: "24 °C". */
const formatReading = (value: MachineReading['value'] | NonNullable<MachineReading['target']>): string =>
  typeof value === 'object'
    ? formatQuantity(
        typeof value.value === 'number'
          ? { value: Math.round(value.value), unit: typeof value.unit === 'string' ? value.unit : value.unit.code }
          : value,
      )
    : String(value);

type ReadingsObservation = Readonly<{ componentId: string; group: string; readings: readonly MachineReading[] }>;

/* The standard observation groups the Monitor reads by id; every other group's readings show under their component. */
const temperatureGroup: MachineObservationGroup = 'temperature';
const positionGroup: MachineObservationGroup = 'position';
const materialGroup: MachineObservationGroup = 'material';

const readingsOf = (entry: MachineDirectoryEntry): readonly ReadingsObservation[] =>
  entry.snapshot.components.flatMap((observation: ComponentObservation) =>
    observation.knowledge === 'known' && observation.value.kind === 'readings'
      ? [{ componentId: observation.componentId, group: observation.group, readings: observation.value.values }]
      : [],
  );

const readingsIn = (entry: MachineDirectoryEntry, group: string): readonly ReadingsObservation[] =>
  readingsOf(entry).filter((observation) => observation.group === group);

/**
 * Temperatures as columns a person reads at a glance: where each heater is, and where it is heading.
 *
 * @param properties - The machine and the clock.
 * @returns The group, or nothing when the machine reports none.
 */
function TemperatureGroup({
  entry,
  now,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly now: number;
}): React.JSX.Element | undefined {
  const observations = readingsIn(entry, temperatureGroup);
  if (observations.length === 0) {
    return undefined;
  }
  const isStale = observations.some(({ componentId }) =>
    isObservationStale({ entry, componentId, group: temperatureGroup, now }),
  );
  const readings = observations.flatMap(({ componentId, readings: values }) =>
    values.map((reading) => ({ key: `${componentId}:${reading.id}`, reading })),
  );
  /* A heater reads as a number; anything else a heater reports, such as the installed plate, is a fact beside it. */
  const isMeasured = ({ reading }: (typeof readings)[number]): boolean =>
    typeof reading.value === 'number' || typeof reading.value === 'object';
  const plates = fffProcessOf(entry.descriptor.capabilities)?.bed.plates ?? [];
  const facts = readings.filter((candidate) => !isMeasured(candidate));
  return (
    <div className='flex min-w-0 flex-col gap-1.5'>
      <div className='flex min-w-0 items-center gap-2'>
        <h4 className='min-w-0 flex-1 truncate text-xs font-medium'>Temperatures</h4>
        {isStale ? <StaleBadge /> : null}
      </div>
      <dl className='grid grid-cols-3 gap-x-3 gap-y-1'>
        {readings
          .filter((candidate) => isMeasured(candidate))
          .map(({ key, reading }) => (
            <div key={key} className='flex min-w-0 flex-col'>
              <dt className='truncate text-xs text-muted-foreground'>{reading.label}</dt>
              <dd className='truncate text-sm font-medium tabular-nums'>{formatReading(reading.value)}</dd>
              {/* A target of 0 is a heater that is off, not one heating to 0 °C. */}
              {reading.target === undefined ||
              (typeof reading.target === 'number' ? reading.target : reading.target.value) === 0 ? null : (
                <dd className='truncate text-xs text-muted-foreground tabular-nums'>
                  to {formatReading(reading.target)}
                </dd>
              )}
            </div>
          ))}
      </dl>
      {facts.length === 0 ? null : (
        <dl className='flex flex-col gap-1'>
          {facts.map(({ key, reading }) => (
            <PrintRow key={key} label={reading.label}>
              {plates.find((plate) => plate.id === reading.value)?.label ?? formatReading(reading.value)}
            </PrintRow>
          ))}
        </dl>
      )}
    </div>
  );
}

/**
 * Readings in any group other than temperatures, under their component's label: a provider's own group (a vendor's
 * `<vendor>.<name>`, an environment sensor) is shown, not dropped.
 *
 * @param properties - The machine and the clock.
 * @returns The rows, or nothing when every reading is a temperature.
 */
function OtherReadings({
  entry,
  now,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly now: number;
}): React.JSX.Element | undefined {
  const observations = readingsOf(entry).filter((observation) => observation.group !== temperatureGroup);
  if (observations.length === 0) {
    return undefined;
  }
  const { components } = entry.descriptor.capabilities;
  return (
    <>
      {observations.map(({ componentId, group, readings }) => (
        <div key={`${componentId}:${group}`} className='flex min-w-0 flex-col gap-1'>
          <div className='flex min-w-0 items-center gap-2'>
            <h4 className='min-w-0 flex-1 truncate text-xs font-medium'>
              {components.find((component) => component.id === componentId)?.label ?? componentId}
            </h4>
            {isObservationStale({ entry, componentId, group, now }) ? <StaleBadge /> : null}
          </div>
          <dl className='flex flex-col gap-1'>
            {readings.map((reading) => (
              <PrintRow key={reading.id} label={reading.label}>
                {formatReading(reading.value)}
              </PrintRow>
            ))}
          </dl>
        </div>
      ))}
    </>
  );
}

const trustWords = { homed: 'Homed', kept: 'Kept since homing', lost: 'Lost', unknown: 'Not homed' } as const;

/**
 * The position readout: work and machine coordinates per axis, with how far the position can be trusted.
 *
 * @param properties - The machine, its motion component and the clock.
 * @returns The readout.
 */
function Position({
  entry,
  motionId,
  axes,
  now,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly motionId: string;
  readonly axes: readonly string[];
  readonly now: number;
}): React.JSX.Element {
  const motion = componentValue(entry.snapshot.components, motionId, 'motion');
  const trust = motion?.trust ?? 'unknown';
  const isKnown = trust === 'homed' || trust === 'kept';
  const shown = (value: number | undefined): string => (isKnown && value !== undefined ? value.toFixed(3) : '—');
  const declared = entry.descriptor.capabilities.axes.filter((axis) => axes.includes(axis.id));
  return (
    <div className='flex min-w-0 flex-col gap-1.5'>
      <div className='flex items-center justify-between gap-2 text-xs'>
        <h4 className='font-medium'>Position</h4>
        <span className='flex items-center gap-2'>
          {isObservationStale({ entry, componentId: motionId, group: positionGroup, now }) ? <StaleBadge /> : null}
          <Badge
            variant={isKnown ? 'secondary' : 'outline'}
            className={isKnown ? undefined : 'border-transparent bg-feature/10 text-feature'}
          >
            {trustWords[trust]}
          </Badge>
        </span>
      </div>
      <table className='w-full table-fixed text-xs tabular-nums'>
        <caption className='sr-only'>Position; millimetres, degrees for a rotary axis</caption>
        <thead>
          <tr className='text-muted-foreground'>
            <th scope='col' className='w-20 text-left font-normal'>
              <span className='sr-only'>Frame</span>
            </th>
            {declared.map((axis) => (
              <th key={axis.id} scope='col' className='text-right font-medium'>
                {axis.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope='row' className='text-left font-normal text-muted-foreground'>
              Work {motion?.workOffset.id ?? ''}
            </th>
            {declared.map((axis) => (
              <td key={axis.id} className='text-right font-mono text-sm'>
                {shown(motion?.position.work[axis.id])}
              </td>
            ))}
          </tr>
          <tr className='text-muted-foreground'>
            <th scope='row' className='text-left font-normal'>
              Machine
            </th>
            {declared.map((axis) => (
              <td key={axis.id} className='text-right font-mono'>
                {shown(motion?.position.machine[axis.id])}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * What a milling machine reports beside its position: the work offset and its revision, the spindle, the tool, the
 * overrides, the interlocks and the probes.
 *
 * @param properties - The machine.
 * @returns The rows.
 */
function MillingRows({ entry }: { readonly entry: MachineDirectoryEntry }): React.JSX.Element {
  const { components } = entry.descriptor.capabilities;
  const observed = entry.snapshot.components;
  const motion = components.find((component) => component.kind === 'motion');
  const motionValue = motion === undefined ? undefined : componentValue(observed, motion.id, 'motion');
  return (
    <dl className='flex flex-col gap-1'>
      {motionValue === undefined ? null : (
        <>
          <PrintRow label='Work offset'>
            {motionValue.workOffset.id} · revision {motionValue.workOffset.revision}
          </PrintRow>
          {motionValue.mode === 'normal' ? null : (
            <PrintRow label='Mode'>
              {motionValue.mode === 'tool-centre-point' ? 'Tool centre point' : 'Tilted plane'}
            </PrintRow>
          )}
          {motionValue.limits.length === 0 ? null : (
            <PrintRow
              label='Limits'
              badge={
                <Badge variant='outline' className='border-transparent bg-feature/10 text-feature'>
                  Pressed
                </Badge>
              }
            >
              {motionValue.limits.map((axis) => axis.toUpperCase()).join(', ')}
            </PrintRow>
          )}
        </>
      )}
      {components.map((component) => {
        if (component.kind === 'spindle') {
          const value = componentValue(observed, component.id, 'spindle');
          return (
            <PrintRow key={component.id} label={component.label}>
              {value === undefined
                ? 'Not reported'
                : value.mode === 'off'
                  ? 'Off'
                  : component.control === 'switched'
                    ? 'On · speed set on its dial'
                    : `${(value.actual ?? value.commanded).toLocaleString()} rpm${value.load === undefined ? '' : ` · load ${String(Math.round(value.load * 100))} %`}`}
            </PrintRow>
          );
        }
        if (component.kind === 'tools') {
          const value = componentValue(observed, component.id, 'tools');
          const row = value?.table.rows.find((candidate) => candidate.number === value.current);
          return (
            <PrintRow key={component.id} label={component.label}>
              {value?.current === undefined
                ? 'Not reported'
                : [
                    `T${String(value.current)}`,
                    row?.description,
                    row?.lengthOffset === undefined ? undefined : `length ${row.lengthOffset.toFixed(2)} mm`,
                    component.change === 'manual' ? 'as you said' : undefined,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
            </PrintRow>
          );
        }
        if (component.kind === 'override') {
          const value = componentValue(observed, component.id, 'level');
          return (
            <PrintRow key={component.id} label={`${component.label} override`}>
              {value === undefined ? 'Not reported' : `${String(Math.round(value.ratio * 100))} %`}
            </PrintRow>
          );
        }
        if (component.kind === 'interlock') {
          const state = componentValue(observed, component.id, 'interlock')?.state ?? 'unknown';
          return (
            <PrintRow
              key={component.id}
              label={component.label}
              badge={
                state === 'safe' ? undefined : (
                  <Badge variant='outline' className='border-transparent bg-feature/10 text-feature'>
                    {state === 'unsafe' ? 'Not safe' : 'Unknown'}
                  </Badge>
                )
              }
            >
              {state === 'safe' ? 'Safe' : state === 'unsafe' ? 'Not safe' : 'Not reported'}
            </PrintRow>
          );
        }
        if (component.kind === 'probe') {
          const value = componentValue(observed, component.id, 'probe');
          return value === undefined ? null : (
            <PrintRow key={component.id} label={component.label}>
              {[
                value.connected ? 'Connected' : 'Not connected',
                value.triggered ? 'triggered' : undefined,
                value.battery === undefined ? undefined : `battery ${String(Math.round(value.battery))} %`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </PrintRow>
          );
        }
        return null;
      })}
    </dl>
  );
}

/**
 * The closed Monitor's summary: the slot in use and the heaters, or the position trust and the spindle.
 *
 * @param entry - The machine as observed.
 * @returns The summary.
 * @public
 */
export const monitorSummary = (entry: MachineDirectoryEntry): string => {
  const motion = entry.descriptor.capabilities.components.find((component) => component.kind === 'motion');
  const isMilling = millingProcessOf(entry.descriptor.capabilities) !== undefined;
  if (isMilling && motion !== undefined) {
    const trust = componentValue(entry.snapshot.components, motion.id, 'motion')?.trust ?? 'unknown';
    const spindle = entry.descriptor.capabilities.components.find((component) => component.kind === 'spindle');
    const spindleValue =
      spindle === undefined ? undefined : componentValue(entry.snapshot.components, spindle.id, 'spindle');
    return [
      trustWords[trust],
      spindle === undefined
        ? undefined
        : `${spindle.label} ${spindleValue === undefined || spindleValue.mode === 'off' ? 'off' : 'on'}`,
    ]
      .filter(Boolean)
      .join(' · ');
  }
  const readings = readingsIn(entry, temperatureGroup).flatMap((observation) => observation.readings);
  return [
    materialInUse(entry),
    ...readings.slice(0, 2).map((reading) => `${reading.label.toLowerCase()} ${formatReading(reading.value)}`),
  ]
    .filter((part) => part !== undefined)
    .join(' · ');
};

/**
 * Monitor, open by default: temperatures and material slots on a printer; the position, work offset, spindle, tool,
 * overrides and interlocks on a mill. Each group wears a stale badge once its observation is past its validity.
 *
 * @param properties - The control.
 * @returns The stage.
 * @public
 */
export function MonitorStage({ control }: { readonly control: MachineControl }): React.JSX.Element {
  const { entry } = control;
  const now = useNow();
  const motion = entry.descriptor.capabilities.components.find(
    (component): component is Extract<typeof component, { kind: 'motion' }> => component.kind === 'motion',
  );
  const isMilling = millingProcessOf(entry.descriptor.capabilities) !== undefined;
  const system = materialSystemOf(entry.descriptor.capabilities);
  const stage = readableStage(entry.snapshot.run?.stage);
  return (
    <PrintStage icon={Activity} title='Monitor' summary={monitorSummary(entry)} isDefaultOpen>
      {entry.snapshot.state.reason === undefined ? null : (
        <p className='text-xs text-muted-foreground'>{entry.snapshot.state.reason}</p>
      )}
      {isMilling && motion !== undefined ? (
        <Position entry={entry} motionId={motion.id} axes={motion.axes} now={now} />
      ) : null}
      <TemperatureGroup entry={entry} now={now} />
      <OtherReadings entry={entry} now={now} />
      {isMilling ? <MillingRows entry={entry} /> : null}
      {system === undefined ? null : (
        <MaterialSlots
          control={control}
          isStale={isObservationStale({ entry, componentId: system.id, group: materialGroup, now })}
        />
      )}
      {stage === undefined || entry.snapshot.run === undefined ? null : (
        <dl className='flex flex-col gap-0.5'>
          <PrintRow label='Stage'>{stage}</PrintRow>
        </dl>
      )}
    </PrintStage>
  );
}

const minutes = (milliseconds: number): string =>
  `${String(Math.floor(milliseconds / 60_000))}:${String(Math.floor((milliseconds % 60_000) / 1000)).padStart(2, '0')}`;

/**
 * The run in progress: its program and progress with how the counters are known, and the run's own controls with what
 * each does before it is pressed. A run the machine last ended is one quiet line until the next one starts: a printer
 * keeps reporting it, and its counters and progress would read as live.
 *
 * @param properties - The control and this machine's jobs.
 * @returns The run block, or nothing without a run.
 * @public
 */
export function RunBlock({
  control,
  jobs,
}: {
  readonly control: MachineControl;
  readonly jobs: readonly MachineJob[];
}): React.JSX.Element | undefined {
  const { entry } = control;
  const { run } = entry.snapshot;
  const [isConfirmingCancel, setIsConfirmingCancel] = useState(false);
  const confirmTitleId = useId();
  const confirmDescriptionId = useId();
  const confirmRef = useRef<HTMLDivElement>(null);
  /* The confirmation takes focus when it opens, so a keyboard user lands on its first choice. */
  useEffect(() => {
    if (isConfirmingCancel) {
      confirmRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    }
  }, [isConfirmingCancel]);
  if (run === undefined) {
    return undefined;
  }
  const controllerId =
    entry.descriptor.capabilities.components.find((component) => component.kind === 'controller')?.id ?? 'controller';
  const job = jobs.find((candidate) => candidate.jobId === run.jobId || candidate.run?.runId === run.runId);
  const name = job?.program.name ?? run.program?.name;
  if (['completed', 'cancelled', 'failed', 'unknown'].includes(run.state)) {
    return (
      <section aria-label='Run' className='flex min-w-0 flex-col gap-1 text-xs text-muted-foreground'>
        <p className='min-w-0 break-words'>
          Last run: {run.state === 'unknown' ? 'Not reported' : runWords[run.state]}
          {name === undefined ? null : (
            <>
              <span aria-hidden> · </span>
              <span className='font-mono'>{name}</span>
            </>
          )}
        </p>
        {run.state === 'unknown' ? (
          <p>{entry.name} did not report how this run ended, and Tau did not stop it. Check the machine.</p>
        ) : null}
      </section>
    );
  }
  const { progress } = run;
  const cancel = declaredAction(entry, controllerId, 'run.cancel');
  const primary = run.state === 'paused' ? 'run.resume' : 'run.pause';
  /* An attended run control asks for presence beside the run's controls, where it is used. */
  const asking =
    [primary, 'run.cancel'].find((action) => declaredAction(entry, controllerId, action)?.safety.attended === true) ??
    primary;
  return (
    <section aria-label='Run' className='flex min-w-0 flex-col gap-2'>
      <p className='min-w-0 text-xs break-words'>
        {name === undefined ? null : (
          <>
            <span className='font-mono'>{name}</span>
            <span aria-hidden> · </span>
          </>
        )}
        {describeRun(entry)}
        {run.origin === 'external' ? <span className='text-muted-foreground'> · not started from Tau</span> : null}
      </p>
      {progress.fraction === undefined ? null : (
        <Progress
          aria-label={`${entry.name} run progress`}
          aria-valuenow={Math.round(progress.fraction * 100)}
          aria-valuetext={`${String(Math.round(progress.fraction * 100))} percent`}
          value={progress.fraction * 100}
        />
      )}
      {progress.counters.length === 0 && progress.elapsed === undefined ? null : (
        <p className='flex min-w-0 flex-wrap justify-between gap-x-3 text-xs text-muted-foreground tabular-nums'>
          {progress.counters.map((counter) => (
            <span key={counter.id} title={`Counted from work ${basisWords[progress.basis]}`}>
              {counter.label} {counter.current.toLocaleString()}
              {counter.total === undefined ? '' : ` of ${counter.total.toLocaleString()}`}
              <span className='sr-only'> ({basisWords[progress.basis]})</span>
            </span>
          ))}
          {progress.elapsed === undefined ? null : <span>{minutes(progress.elapsed)} elapsed</span>}
        </p>
      )}
      {run.delivery === 'streamed' ? (
        <p className='text-xs text-muted-foreground'>
          Tau feeds this program line by line: keep this computer awake and Tau open until it ends.
        </p>
      ) : null}
      {isConfirmingCancel ? (
        <div
          ref={confirmRef}
          role='alertdialog'
          aria-labelledby={confirmTitleId}
          aria-describedby={confirmDescriptionId}
          className='rounded-lg border border-warning/30 bg-warning/10 p-2 text-xs'
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              setIsConfirmingCancel(false);
            }
          }}
        >
          <p id={confirmTitleId}>
            {cancel?.label ?? 'Cancel'}
            {name === undefined ? '' : ` ${name}`} on {entry.name}?
          </p>
          <p id={confirmDescriptionId} className='text-muted-foreground'>
            {[cancel?.consequence, cancel?.outcome === undefined ? undefined : describeOutcome(cancel.outcome)]
              .filter((part) => part !== undefined)
              .join(' ')}
          </p>
          <div className='mt-2 flex flex-wrap gap-2'>
            <ActionButton
              control={control}
              componentId={controllerId}
              action='run.cancel'
              label={`Confirm ${cancel?.label.toLowerCase() ?? 'cancel'}`}
              variant='destructive'
              onDone={() => {
                setIsConfirmingCancel(false);
              }}
            />
            <Button
              type='button'
              size='sm'
              variant='outline'
              onClick={() => {
                setIsConfirmingCancel(false);
              }}
            >
              Keep going
            </Button>
          </div>
        </div>
      ) : (
        <div className='flex flex-col gap-1.5'>
          <Blocked control={control} componentId={controllerId} action={asking} hasRemedy={false} />
          <div role='group' aria-label={`Controls for ${entry.name}`} className='flex flex-wrap gap-2'>
            {run.state === 'paused' ? (
              <ActionButton
                control={control}
                componentId={controllerId}
                action='run.resume'
                icon={Play}
                variant='default'
              />
            ) : (
              <ActionButton control={control} componentId={controllerId} action='run.pause' />
            )}
            {cancel === undefined ? null : (
              <Button
                type='button'
                size='sm'
                variant='outline'
                disabled={control.check(controllerId, 'run.cancel').status !== 'available'}
                onClick={() => {
                  setIsConfirmingCancel(true);
                }}
              >
                {cancel.label}
              </Button>
            )}
          </div>
          <Consequences
            descriptors={[
              declaredAction(entry, controllerId, run.state === 'paused' ? 'run.resume' : 'run.pause'),
              cancel,
            ]}
          />
        </div>
      )}
    </section>
  );
}

const jobWords: Readonly<Record<MachineJob['state'], string>> = {
  preparing: 'Checking',
  'awaiting-approval': 'Waiting for approval',
  approved: 'Approved',
  transferring: 'Sending',
  starting: 'Starting',
  'awaiting-start': 'Waiting for the start at the machine',
  confirming: 'Confirming the start',
  started: 'Started',
  denied: 'Denied',
  withdrawn: 'Withdrawn',
  rejected: 'Rejected',
  unknown: 'Start not confirmed',
  failed: 'Refused',
};

const outcomeWords = {
  running: 'Running',
  completed: 'Finished',
  cancelled: 'Cancelled',
  failed: 'Failed',
  interrupted: 'Interrupted',
  unknown: 'Ended',
} as const;

const operationWords: Readonly<Record<MachineOperation['state'], string>> = {
  planned: 'Planned',
  sending: 'Sending',
  accepted: 'Done',
  rejected: 'Refused',
  confirming: 'Waiting for the report',
  attention: 'Check the machine',
};

const confirmedWords = { observation: 'seen', acknowledgement: 'acknowledged', none: 'sent' } as const;

/**
 * How one operation stands, with how the machine confirmed it: "Done · seen", "Done · acknowledged", "Done · sent".
 *
 * @param entry - The machine, for the action's declared confirmation.
 * @param operation - The operation.
 * @returns The words.
 * @public
 */
export const describeOperation = (entry: MachineDirectoryEntry, operation: MachineOperation): string => {
  const words = operationWords[operation.state];
  if (operation.state !== 'accepted') {
    return operation.receipt?.status === 'rejected' ? `${words}: ${operation.receipt.message}` : words;
  }
  const confirms =
    operation.action === undefined
      ? undefined
      : declaredAction(entry, operation.action.componentId, operation.action.id)?.confirms;
  return confirms === undefined ? words : `${words} · ${confirmedWords[confirms]}`;
};

const kindWords = { stop: 'Stop', hold: 'Jog while held', transfer: 'Send the program', start: 'Start' } as const;

/**
 * History: this machine's jobs and the operations Tau sent, newest first, each with who asked and how the machine
 * confirmed it.
 *
 * @param properties - The machine and its jobs.
 * @returns The stage.
 * @public
 */
export function HistoryStage({
  entry,
  jobs,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly jobs: readonly MachineJob[];
}): React.JSX.Element {
  const { operations } = entry.snapshot;
  const count = jobs.length + operations.length;
  return (
    <PrintStage
      icon={History}
      title='History'
      summary={count === 0 ? 'Nothing yet' : `${String(count)} ${count === 1 ? 'entry' : 'entries'}`}
    >
      {count === 0 ? (
        <p className='text-xs text-muted-foreground'>
          Jobs and the controls you and the agent use appear here, each with how the machine confirmed it.
        </p>
      ) : null}
      {jobs.length > 0 ? (
        <ul aria-label='Jobs' className='flex flex-col gap-1 text-xs'>
          {jobs.map((job) => (
            <li key={job.jobId} className='flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5'>
              <span className='font-medium'>
                {job.state === 'started' && job.run !== undefined ? outcomeWords[job.run.outcome] : jobWords[job.state]}
              </span>
              <span className='min-w-0 truncate'>{job.program.name}</span>
              <span className='text-muted-foreground'>
                by {job.requestedBy.label}
                {job.attended === true ? ', at the machine' : ''} ·{' '}
                <time dateTime={job.updatedAt}>{formatRelativeTime(Date.parse(job.updatedAt))}</time>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {operations.length > 0 ? (
        <ol aria-label='Operations' className='flex flex-col gap-1 text-xs'>
          {operations
            .toSorted((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
            .map((operation) => (
              <li key={operation.operationId} className='flex min-w-0 items-center gap-2'>
                {operation.requestedBy?.kind === 'agent' ? (
                  <Bot
                    aria-label={`by ${operation.requestedBy.label}`}
                    className='size-3.5 shrink-0 text-information'
                  />
                ) : null}
                {operation.state === 'sending' || operation.state === 'confirming' ? (
                  <LoaderCircle aria-hidden className='size-3.5 shrink-0 animate-spin motion-reduce:animate-none' />
                ) : null}
                <span className='min-w-0 flex-1 truncate'>
                  {operation.action?.label ?? (operation.kind === 'action' ? 'Action' : kindWords[operation.kind])}
                  {operation.attended === true ? (
                    <span className='text-muted-foreground'> · at the machine</span>
                  ) : null}
                </span>
                <span
                  className={cn('shrink-0 text-muted-foreground', operation.state === 'attention' && 'text-foreground')}
                >
                  {describeOperation(entry, operation)}
                </span>
              </li>
            ))}
        </ol>
      ) : null}
    </PrintStage>
  );
}

const authorityWords = { agent: 'Anyone', 'approved-agent': 'Agent with approval', person: 'Person' } as const;
const confirmsWords = { observation: 'Report', acknowledgement: 'Reply', none: 'Nothing' } as const;

/**
 * Inspect: identity and firmware, connection, jobs, stop, travel, the process facts, every declared action with who
 * may use it and how it is confirmed, the open job's artifact and the provider ids. Engineering detail on request.
 *
 * @param properties - The machine, its provider, the slicer and the open job.
 * @returns The stage.
 * @public
 */
export function InspectStage({
  entry,
  provider,
  slicer,
  job,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly provider: MachineProvider | undefined;
  readonly slicer?: string;
  readonly job?: MachineJob;
}): React.JSX.Element {
  const { descriptor } = entry;
  const { capabilities } = descriptor;
  const fff = fffProcessOf(capabilities);
  const milling = millingProcessOf(capabilities);
  const profiles = provider?.manifest.qualifications ?? [];
  const isQualifiedFirmware = profiles.some((profile) => profile.firmware.includes(descriptor.firmware));
  const toolhead = toolheadOf(capabilities);
  const system = materialSystemOf(capabilities);
  const { connection, jobs } = capabilities;
  return (
    <PrintStage icon={Info} title='Inspect' summary={`${descriptor.model} · firmware ${descriptor.firmware}`}>
      <dl className='grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs'>
        <dt className='text-muted-foreground'>Machine</dt>
        <dd>
          {descriptor.vendor} {descriptor.model}
          {provider?.manifest.identity.family ? ` · ${provider.manifest.identity.family}` : ''}
        </dd>
        <dt className='text-muted-foreground'>Firmware</dt>
        <dd>
          {descriptor.firmware}
          {provider ? (isQualifiedFirmware ? ' · qualified' : ' · not on a qualified profile') : ''}
        </dd>
        <dt className='text-muted-foreground'>Connection</dt>
        <dd>
          {connection.transport === 'serial' ? 'USB serial' : 'Network'}
          {connection.exclusive ? ', one app at a time' : ''}
          {connection.opening === 'resets-controller' ? ', connecting resets it' : ''}
          {connection.identity === 'claimed' ? ', identity as the machine claims it' : ''}
        </dd>
        <dt className='text-muted-foreground'>Jobs</dt>
        <dd>
          {jobs.type === 'unsupported'
            ? 'Not from Tau'
            : `${jobs.delivery === 'stored' ? 'Stored on the machine' : 'Fed by Tau'} · started ${jobs.start === 'remote' ? 'from Tau' : 'at the machine'}`}
        </dd>
        <dt className='text-muted-foreground'>Stop</dt>
        <dd>{describeOutcome(capabilities.stop)} Not an emergency stop.</dd>
        {capabilities.axes.length === 0 ? null : (
          <>
            <dt className='text-muted-foreground'>Travel</dt>
            <dd className='tabular-nums'>
              {capabilities.axes
                .map((axis) =>
                  axis.travel === undefined
                    ? axis.label
                    : `${axis.label} ${String(axis.travel.min)}…${String(axis.travel.max)} ${axis.unit === 'deg' ? '°' : 'mm'}`,
                )
                .join(' · ')}
            </dd>
          </>
        )}
        {fff === undefined ? null : (
          <>
            <dt className='text-muted-foreground'>Build volume</dt>
            <dd className='tabular-nums'>
              {fff.geometry.buildVolume.x} × {fff.geometry.buildVolume.y} × {fff.geometry.buildVolume.z} mm ·{' '}
              {fff.geometry.kinematics}
            </dd>
            <dt className='text-muted-foreground'>Plates</dt>
            <dd>{fff.bed.plates.map((plate) => plate.label).join(', ')}</dd>
          </>
        )}
        {toolhead === undefined ? null : (
          <>
            <dt className='text-muted-foreground'>Nozzles</dt>
            <dd>
              {toolhead.nozzles
                .map(
                  (nozzle) =>
                    `${formatQuantity(nozzle.diameter)} ${nozzle.material} to ${formatQuantity(nozzle.maximumTemperature)}`,
                )
                .join(', ')}
            </dd>
          </>
        )}
        {system === undefined ? null : (
          <>
            <dt className='text-muted-foreground'>{system.label}</dt>
            <dd>{system.units.map((unit) => `${unit.label} (${String(unit.slots.length)})`).join(', ')}</dd>
          </>
        )}
        {milling === undefined ? null : (
          <>
            <dt className='text-muted-foreground'>Milling</dt>
            <dd>
              {milling.simultaneousAxes} axes together · {milling.workOffsets.join(', ')}
              {milling.workArea === undefined
                ? ''
                : ` · ${String(milling.workArea.x)} × ${String(milling.workArea.y)} × ${String(milling.workArea.z)} mm`}
            </dd>
          </>
        )}
        {slicer === undefined ? null : (
          <>
            <dt className='text-muted-foreground'>Slicer</dt>
            <dd>{slicer}</dd>
          </>
        )}
        {job === undefined ? null : (
          <>
            <dt className='text-muted-foreground'>Job</dt>
            <dd className='font-mono break-all'>{job.jobId}</dd>
            <dt className='text-muted-foreground'>Artifact</dt>
            <dd className='break-all'>{job.artifact.path}</dd>
            <dt className='text-muted-foreground'>Digest</dt>
            <dd className='font-mono break-all'>{job.artifact.digest}</dd>
          </>
        )}
        <dt className='text-muted-foreground'>Provider</dt>
        <dd className='break-all'>
          {entry.providerId}
          {provider ? ` ${provider.version}` : ''}
        </dd>
        <dt className='text-muted-foreground'>Machine id</dt>
        <dd className='font-mono break-all'>{entry.machineId}</dd>
        <dt className='text-muted-foreground'>Physical id</dt>
        <dd className='font-mono break-all'>{descriptor.id}</dd>
        <dt className='text-muted-foreground'>Capabilities</dt>
        <dd className='font-mono break-all'>
          {capabilities.revision} · {capabilities.incarnation}
        </dd>
        <dt className='text-muted-foreground'>Observed</dt>
        <dd>
          <time dateTime={entry.snapshot.observedAt}>{new Date(entry.snapshot.observedAt).toLocaleString()}</time> ·{' '}
          {entry.freshness}
        </dd>
      </dl>
      <PrintDisclosure
        title='Declared actions'
        summary={String(capabilities.actions.length + capabilities.holds.length)}
      >
        <table className='w-full text-xs'>
          <caption className='sr-only'>Declared actions, who may use them and how each is confirmed</caption>
          <thead>
            <tr className='text-left text-muted-foreground'>
              <th scope='col' className='font-normal'>
                Action
              </th>
              <th scope='col' className='font-normal'>
                Who
              </th>
              <th scope='col' className='font-normal'>
                Confirmed by
              </th>
            </tr>
          </thead>
          <tbody>
            {[...capabilities.actions, ...capabilities.holds].map((action) => (
              <tr
                key={`${action.componentId}:${action.id}:${'scope' in action ? 'action' : 'hold'}`}
                className='align-top'
              >
                <td className='py-0.5 pr-2'>
                  {action.label}
                  <span className='block font-mono text-muted-foreground'>
                    {action.componentId} · {action.id}
                  </span>
                  <span className='block text-muted-foreground'>
                    {action.qualification.status === 'qualified'
                      ? 'Qualified'
                      : action.qualification.status === 'designed'
                        ? `Designed: ${action.qualification.reason}`
                        : `Unsupported: ${action.qualification.reason}`}
                  </span>
                </td>
                <td className='py-0.5 pr-2'>
                  {authorityWords[action.safety.authority]}
                  {action.safety.attended ? ', at the machine' : ''}
                  {action.safety.interlocks.length > 0 ? `, ${action.safety.interlocks.join(' and ')} safe` : ''}
                </td>
                <td className='py-0.5'>{confirmsWords[action.confirms]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </PrintDisclosure>
    </PrintStage>
  );
}
