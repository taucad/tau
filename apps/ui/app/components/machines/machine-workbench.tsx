import { presentMachine } from '#components/machines/machine-presentation.js';
import { isOpenJob } from '#hooks/use-machines-jobs.js';
import { memo, useMemo } from 'react';
import { Link } from 'react-router';
import { ExternalLink, CircleAlert, LoaderCircle, OctagonX, Printer, RefreshCw } from 'lucide-react';
import {
  FailureEvidence,
  Activities,
  ControlStage,
  asksPresenceAtPane,
  isRunOwned,
  stopControlId,
} from '#components/machines/machine-controls.js';
import { isSimulatedMachine } from '@taucad/runtime/machine';
import type { MachineClient, MachineDirectoryEntry, MachineJob } from '@taucad/runtime/machine';
import { Badge } from '@taucad/ui/components/badge';
import { Button } from '@taucad/ui/components/button';
import { PanelEmptyState } from '@taucad/ui/components/panel-empty-state';
import { cn } from '@taucad/ui/utils/cn';
import { ParameterSelect } from '@taucad/viewer/parameters/parameter-select';
import { describeOutcome } from '#components/print/machine-facts.js';
import { PrintSetupRow } from '#components/print/print-setup-row.js';
import { ParametersBoolean } from '@taucad/viewer/parameters/parameters-boolean';
import { useMachineControl, usePresence } from '#hooks/use-machine-control.js';
import type { MachineControl, Presence } from '#hooks/use-machine-control.js';
import { useMachineDirectory } from '#hooks/use-machines.js';
import type { MachineApprovalBridge } from '#hooks/use-machines-approvals.js';
import { useSettingsDialog } from '#hooks/use-settings-dialog.js';
import { PressureAdvanceStage } from '#components/machines/machine-materials.js';
import {
  HistoryStage,
  InspectStage,
  MachineAlerts,
  MonitorStage,
  RunBlock,
} from '#components/machines/machine-monitor.js';
import { PrintNotice, PrintStages, useNow } from '#components/machines/machine-section.js';
import { ActionApprovals, JobsSection } from '#components/machines/machine-send.js';
import { formatAge } from '#components/machines/machine-summary.js';

/**
 * One notice for a machine the pane cannot currently trust, saying what waits and what still works.
 *
 * @param properties - The machine as observed.
 * @returns The notice, or nothing for a current, connected machine.
 */
function ObservationNotice({ entry }: { readonly entry: MachineDirectoryEntry }): React.JSX.Element | undefined {
  const { connection } = entry.snapshot;
  const resets = entry.descriptor.capabilities.connection.opening === 'resets-controller';
  if (entry.freshness === 'stale') {
    return (
      <PrintNotice tone='warning' role='status'>
        No current observation from {entry.name}. Controls and jobs wait until it reports again; slicing still works.
      </PrintNotice>
    );
  }
  if (connection !== 'connected') {
    return (
      <PrintNotice tone='error' role='status'>
        {connection === 'occupied'
          ? `${entry.name} serves one app at a time and another app holds it. Use its own stop if it is moving.`
          : `${entry.name} is ${connection === 'unreachable' ? 'unreachable' : 'disconnected'}. Controls and jobs wait until the host reconnects${resets ? '; reconnecting restarts its controller, so it will need homing' : ''}. Use its own stop if it is moving.`}
      </PrintNotice>
    );
  }
  return undefined;
}

/**
 * The person's statement that they are at the machine, asked once above everything only where starting a job needs
 * it. Other controls that need it ask beside themselves.
 *
 * @param properties - The control and the presence.
 * @returns The switch, or nothing.
 */
function PresenceRow({
  control,
  presence,
}: {
  readonly control: MachineControl;
  readonly presence: Presence;
}): React.JSX.Element | undefined {
  if (!asksPresenceAtPane(control.entry)) {
    return undefined;
  }
  return (
    <div className='rounded-lg border border-border/70 bg-background px-2.5'>
      <PrintSetupRow
        label='I am at the machine'
        description={
          presence.attended
            ? 'Controls that need someone watching are enabled. Tau asks again after 10 minutes without a control being used.'
            : 'Moving the machine and starting a job need someone who can see it.'
        }
      >
        <ParametersBoolean aria-label='I am at the machine' value={presence.attended} onChange={presence.setAttended} />
      </PrintSetupRow>
    </div>
  );
}

/** Machines belong to this computer and are set up once in Settings › Machines. */
export function NoMachines(): React.JSX.Element {
  const { open } = useSettingsDialog();
  return (
    <PanelEmptyState
      icon={Printer}
      title='No machines yet'
      description='Find a machine on your network or add a simulated machine in Settings. Machines set up there are available in every project on this computer.'
    >
      <Button
        type='button'
        size='sm'
        onClick={() => {
          open('machines');
        }}
      >
        Set up a machine
      </Button>
    </PanelEmptyState>
  );
}

/**
 * The observation's age. It ticks every second, so it is no live region: the notice above announces staleness. The
 * controller's own state word is inspection detail: beside the header's state it read as a contradiction.
 */
export function PrintFooter({ entry }: { readonly entry: MachineDirectoryEntry | undefined }): React.JSX.Element {
  const now = useNow();
  return (
    <p className='flex min-h-8 shrink-0 items-center gap-1.5 border-t border-border/70 px-3 text-xs text-muted-foreground'>
      {entry?.freshness === 'stale' ? <CircleAlert aria-hidden className='size-3.5 shrink-0 text-warning' /> : null}
      <span className='min-w-0 flex-1 truncate'>
        {entry ? `Observed ${formatAge(entry.snapshot.observedAt, now)}` : 'No machine selected'}
      </span>
    </p>
  );
}

/**
 * Whether Stop has anything to stop: the machine working or held, a run or an activity in progress, a jog held, or an
 * operation Tau sent still in flight. An idle machine shows no Stop (operator ruling, 2026-10-05). A stale machine
 * whose last report was not idle keeps it: it may be moving now.
 *
 * @param control - The control.
 * @returns True while something could be stopped.
 * @public
 */
export const hasSomethingToStop = (control: MachineControl): boolean => {
  const { state, activities, operations } = control.entry.snapshot;
  return (
    (control.entry.freshness === 'stale' && state.status !== 'ready' && state.status !== 'asleep') ||
    state.status === 'active' ||
    state.status === 'held' ||
    isRunOwned(control.entry) ||
    control.hold !== undefined ||
    control.isStopping ||
    activities.some((activity) => activity.state === 'in-progress' || activity.state === 'needs-person') ||
    operations.some((operation) => operation.state === 'sending' || operation.state === 'confirming')
  );
};

/**
 * Stop, one press away whenever something could be stopped and never waiting for approval or for an earlier Stop:
 * each press is its own operation. What it does on this machine is said beside it.
 *
 * @param properties - The control.
 * @returns The button.
 */
function StopButton({ control }: { readonly control: MachineControl }): React.JSX.Element {
  const { entry } = control;
  const canStop = entry.snapshot.connection === 'connected';
  const outcome = `Stop: ${describeOutcome(entry.descriptor.capabilities.stop)} Not an emergency stop.`;
  const descriptionId = `stop-outcome-${entry.machineId}`;
  return (
    <>
      <Button
        id={stopControlId(entry.machineId)}
        type='button'
        size='xs'
        variant='destructive'
        disabled={!canStop}
        title={canStop ? outcome : 'Not connected: use the machine’s own stop.'}
        aria-describedby={descriptionId}
        onClick={() => {
          void control.stop();
        }}
      >
        {control.isStopping ? (
          <LoaderCircle aria-hidden className='animate-spin motion-reduce:animate-none' />
        ) : (
          <OctagonX aria-hidden />
        )}
        Stop
      </Button>
      {/* Neither done nor failed: the machine has not said yet. Stop stays pressable meanwhile. */}
      {control.isStopping ? (
        <span role='status' className='shrink-0'>
          Stopping…
        </span>
      ) : null}
      <span id={descriptionId} className='sr-only'>
        {outcome}
      </span>
    </>
  );
}

/** The only place the machine is named and chosen, with its status, the Simulated mark, Stop and a refresh. */
export function PrintHeader({
  entries,
  selected,
  openJob,
  select,
  refresh,
  stop,
  machineLink,
}: {
  readonly entries: readonly MachineDirectoryEntry[];
  readonly selected: MachineDirectoryEntry | undefined;
  readonly openJob: MachineJob | undefined;
  readonly select: (machineId: string) => void;
  readonly refresh: () => void;
  readonly stop: React.ReactNode;
  readonly machineLink?: string | undefined;
}): React.JSX.Element {
  const presentation = selected ? presentMachine(selected, openJob) : undefined;
  /* Read from the host-stamped qualifications on the entry itself, so no machine reads as real while providers load. */
  const isSimulated = selected !== undefined && isSimulatedMachine(selected.descriptor.capabilities);
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
                label: 'Machines on this computer',
                options: entries.map((entry) => ({
                  value: entry.machineId,
                  label: entry.name,
                  secondary: [
                    presentMachine(entry, entry.machineId === selected?.machineId ? openJob : undefined).label,
                    ...(isSimulatedMachine(entry.descriptor.capabilities) ? ['Simulated'] : []),
                  ].join(' · '),
                })),
              },
            ]}
            onChange={select}
          />
        </div>
      ) : (
        <span className='min-w-0 flex-1'>No machines</span>
      )}
      {machineLink ? (
        <Button asChild variant='ghost' size='icon-xs' title='View machine'>
          <Link to={machineLink} aria-label='View machine'>
            <ExternalLink aria-hidden />
          </Link>
        </Button>
      ) : null}
      {isSimulated ? (
        <Badge variant='outline' className='shrink-0'>
          Simulated
        </Badge>
      ) : null}
      {stop}
      <Button
        type='button'
        size='icon-xs'
        variant='ghost'
        aria-label='Refresh machines'
        title='Refresh machines'
        onClick={refresh}
      >
        <RefreshCw aria-hidden />
      </Button>
    </div>
  );
}

export function MachineWorkbenchContent({
  client,
  bridge,
  entry,
  provider,
  jobs,
  isJobWatchStalled,
  openJob,
  header,
  errors,
  control,
  presence,
  preparation,
  actions,
  slicer,
  projectId,
  onPreview,
  sourceLink,
  selectedJobId,
}: {
  readonly client: MachineClient;
  readonly bridge: MachineApprovalBridge;
  readonly entry: MachineDirectoryEntry;
  readonly provider: ReturnType<typeof useMachineDirectory>['providers'][number] | undefined;
  readonly jobs: readonly MachineJob[];
  /** The jobs watch keeps ending without news. */
  readonly isJobWatchStalled: boolean;
  readonly openJob: MachineJob | undefined;
  readonly header: (stop: React.ReactNode) => React.JSX.Element;
  readonly errors: ReadonlyArray<string | undefined>;
  readonly control: MachineControl;
  readonly presence: Presence;
  readonly preparation?: React.ReactNode;
  readonly actions?: React.ReactNode;
  readonly slicer?: string | undefined;
  readonly projectId?: string | undefined;
  readonly onPreview?: ((job: MachineJob) => void) | undefined;
  readonly sourceLink?: ((job: MachineJob) => React.ReactNode) | undefined;
  readonly selectedJobId?: string | undefined;
}): React.JSX.Element {
  return (
    <>
      {header(hasSomethingToStop(control) ? <StopButton control={control} /> : undefined)}
      <div className='relative flex min-h-0 min-w-0 flex-1 scroll-shadows-y flex-col gap-3 overflow-y-auto p-3 [--scroll-fade-end:transparent] [--scroll-fade-size:28px]'>
        {errors.map((error, index) =>
          error === undefined ? null : (
            // A fixed list: the directory's error, then the jobs'. Two may read the same.
            // oxlint-disable-next-line react/no-array-index-key -- see above.
            <PrintNotice key={index} tone='error'>
              {error}
            </PrintNotice>
          ),
        )}
        {/* What needs the person stays outside the stages: a decision is never folded away. */}
        <ObservationNotice entry={entry} />
        <MachineAlerts control={control} />
        <FailureEvidence client={client} entry={entry} />
        {control.error === undefined ? null : (
          <PrintNotice tone='error' role='alert'>
            {control.error}
          </PrintNotice>
        )}
        <ActionApprovals client={client} control={control} bridge={bridge} />
        <PresenceRow control={control} presence={presence} />
        {isJobWatchStalled ? (
          <PrintNotice tone='neutral' role='status'>
            Job updates from {entry.name} stopped. Tau keeps retrying; the jobs shown here may be out of date.
          </PrintNotice>
        ) : null}
        {selectedJobId && !jobs.some((job) => job.jobId === selectedJobId) ? (
          <PrintNotice tone='warning'>
            The linked job is not in this machine’s current history. Check that this is the expected machine, or open
            its source project.
          </PrintNotice>
        ) : null}
        <JobsSection
          client={client}
          control={control}
          jobs={jobs}
          bridge={bridge}
          projectId={projectId}
          onPreview={onPreview}
          sourceLink={sourceLink}
          selectedJobId={selectedJobId}
        />
        <Activities control={control} />
        <RunBlock control={control} jobs={jobs} />
        <PrintStages>
          <MonitorStage control={control} />
          <ControlStage client={client} control={control} />
          {preparation}
          <PressureAdvanceStage control={control} />
          <HistoryStage
            key={selectedJobId}
            entry={entry}
            jobs={jobs}
            sourceLink={sourceLink}
            selectedJobId={
              jobs.some((job) => job.jobId === selectedJobId && isOpenJob(job)) ? undefined : selectedJobId
            }
          />
          <InspectStage entry={entry} provider={provider} slicer={slicer} job={openJob} />
        </PrintStages>
      </div>
      {actions ? (
        <div
          data-slot='print-action-bar'
          className='flex max-h-[60%] min-w-0 shrink-0 flex-col gap-2 overflow-y-auto border-t border-border/70 px-3 py-2'
        >
          {actions}
        </div>
      ) : null}
      <PrintFooter entry={entry} />
    </>
  );
}

/** Generic machine workbench. Optional project content consumes this same command owner. */
export const MachineWorkbench = memo(function MachineWorkbench({
  children,
  ...properties
}: Omit<React.ComponentProps<typeof MachineWorkbenchContent>, 'control' | 'presence'> & {
  readonly children?: ((owned: { control: MachineControl; presence: Presence }) => React.ReactNode) | undefined;
}): React.ReactNode {
  const presence = usePresence();
  const control = useMachineControl({
    client: properties.client,
    entry: properties.entry,
    attended: presence.attended,
    setAttended: presence.setAttended,
    onUsed: presence.touch,
  });
  return children ? (
    children({ control, presence })
  ) : (
    <MachineWorkbenchContent {...properties} control={control} presence={presence} />
  );
});

/** The selector observes the directory independently from the selected machine's workbench. */
export function ObservedPrintHeader({
  client,
  withMachineLink = false,
  ...properties
}: Omit<React.ComponentProps<typeof PrintHeader>, 'entries' | 'refresh' | 'machineLink'> & {
  readonly client: MachineClient;
  readonly withMachineLink?: boolean;
}): React.JSX.Element {
  const directory = useMachineDirectory(client);
  const entries = useMemo(
    () => directory.snapshot?.entries.toSorted((a, b) => a.name.localeCompare(b.name)) ?? [],
    [directory.snapshot],
  );
  return (
    <PrintHeader
      {...properties}
      entries={entries}
      refresh={directory.refresh}
      machineLink={
        withMachineLink && properties.selected && directory.snapshot
          ? `/machines/${encodeURIComponent(directory.snapshot.cursor.hostId)}/${encodeURIComponent(properties.selected.machineId)}`
          : undefined
      }
    />
  );
}
