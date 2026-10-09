import { useMemo } from 'react';
import { CircleAlert, CircleCheck, Drill, LoaderCircle, OctagonX, PauseCircle, Printer, RefreshCw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { fffProcessOf, isSimulatedMachine } from '@taucad/runtime/machine';
import type { MachineClient, MachineDirectoryEntry, MachineJob } from '@taucad/runtime/machine';
import type { RuntimeTransportFacet } from '@taucad/runtime/transport';
import { Badge } from '@taucad/ui/components/badge';
import { Button } from '@taucad/ui/components/button';
import { cn } from '@taucad/ui/utils/cn';
import { ParameterSelect } from '#components/geometry/parameters/parameter-select.js';
import { describeOutcome } from '#components/print/machine-facts.js';
import { PrintSetupRow } from '#components/print/print-setup-row.js';
import { ParametersBoolean } from '#components/geometry/parameters/parameters-boolean.js';
import { PanelEmptyState } from '#components/ui/panel-empty-state.js';
import { useMachineControl, usePresence } from '#hooks/use-machine-control.js';
import type { MachineControl, Presence } from '#hooks/use-machine-control.js';
import { useMachineDirectory, useMachinesFacet } from '#hooks/use-machines.js';
import { useMachineApprovalBridge } from '#hooks/use-machines-approvals.js';
import type { MachineApprovalBridge } from '#hooks/use-machines-approvals.js';
import { isOpenJob, useMachinesJobs } from '#hooks/use-machines-jobs.js';
import { useMachinesSelection } from '#hooks/use-machines-selection.js';
import { useProject } from '#hooks/use-project.js';
import { useSettingsDialog } from '#hooks/use-settings-dialog.js';
import {
  Activities,
  ControlStage,
  asksPresenceAtPane,
  isRunOwned,
} from '#routes/w.$workspace.$project/chat-print-controls.js';
import { PressureAdvanceStage } from '#routes/w.$workspace.$project/chat-print-materials.js';
import {
  HistoryStage,
  InspectStage,
  MachineAlerts,
  MonitorStage,
  RunBlock,
} from '#routes/w.$workspace.$project/chat-print-monitor.js';
import {
  PrepareActions,
  PrepareStages,
  prepareAction,
  slicerName,
  usePrintPrepare,
} from '#routes/w.$workspace.$project/chat-print-prepare.js';
import type { PrepareActionFacts } from '#routes/w.$workspace.$project/chat-print-prepare.js';
import { PrintNotice, PrintStages, useNow } from '#routes/w.$workspace.$project/chat-print-section.js';
import { ActionApprovals, JobsSection } from '#routes/w.$workspace.$project/chat-print-send.js';
import { formatAge } from '#routes/w.$workspace.$project/chat-print-summary.js';

/** Plain orientation copy derived solely from the authoritative directory entry. @public */
export type MachinePresentation = Readonly<{
  label: string;
  icon: LucideIcon;
  /** Color for the glyph only; the text stays neutral (DESIGN, color usage law). */
  iconClassName: string;
}>;

const spinning = 'text-information animate-spin motion-reduce:animate-none';

/** How a job in flight reads while the machine's own report still describes the moment before it. */
const inFlightPresentation: Partial<Record<MachineJob['state'], MachinePresentation>> = {
  approved: { label: 'Sending', icon: LoaderCircle, iconClassName: spinning },
  transferring: { label: 'Sending', icon: LoaderCircle, iconClassName: spinning },
  starting: { label: 'Starting', icon: LoaderCircle, iconClassName: spinning },
  confirming: { label: 'Starting', icon: LoaderCircle, iconClassName: spinning },
  'awaiting-start': {
    label: 'Waiting for the start at the machine',
    icon: PauseCircle,
    iconClassName: 'text-information',
  },
};

/**
 * Where the machine is and what it needs, from the entry and the job this pane has in flight. A job in flight speaks
 * first: the machine keeps reporting its previous state until it takes the start.
 *
 * @param entry - The machine as observed.
 * @param openJob - This machine's unsettled job, if any.
 * @returns The status label and glyph.
 * @public
 */
export const presentMachine = (entry: MachineDirectoryEntry, openJob?: MachineJob): MachinePresentation => {
  const inFlight = openJob === undefined ? undefined : inFlightPresentation[openJob.state];
  const { connection, run, state, activities } = entry.snapshot;
  if (inFlight && entry.freshness === 'current' && connection === 'connected') {
    return inFlight;
  }
  if (entry.freshness === 'stale') {
    return { label: 'Stale observation', icon: CircleAlert, iconClassName: 'text-warning' };
  }
  if (connection !== 'connected') {
    return {
      label:
        connection === 'occupied'
          ? 'In use by another app'
          : connection === 'unreachable'
            ? 'Unreachable'
            : 'Disconnected',
      icon: CircleAlert,
      iconClassName: 'text-feature',
    };
  }
  if (state.status === 'alarm') {
    return { label: 'Alarm', icon: CircleAlert, iconClassName: 'text-feature' };
  }
  if (run?.state === 'paused' || state.status === 'held') {
    return { label: 'Paused', icon: PauseCircle, iconClassName: 'text-warning' };
  }
  if (run?.state === 'running' || run?.state === 'starting' || run?.state === 'finishing') {
    return {
      label: fffProcessOf(entry.descriptor.capabilities) === undefined ? 'Running' : 'Printing',
      icon: fffProcessOf(entry.descriptor.capabilities) === undefined ? Drill : Printer,
      iconClassName: 'text-information',
    };
  }
  const busy = activities.find((activity) => activity.state === 'in-progress' || activity.state === 'needs-person');
  if (busy !== undefined) {
    return { label: busy.label, icon: LoaderCircle, iconClassName: spinning };
  }
  if (state.status === 'ready') {
    return { label: 'Ready', icon: CircleCheck, iconClassName: 'text-success' };
  }
  return {
    label: state.status === 'asleep' ? 'Asleep' : state.status === 'active' ? 'Busy' : 'Not ready',
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

/**
 * The next thing to do, from the machine, the open job and the prepare state. Physical steps are never taken from
 * here; the button only brings the gated card into view. A stale machine still slices: only sending waits.
 *
 * @param input - The facts the decision reads.
 * @returns The next action.
 * @public
 */
export const nextAction = ({
  entry,
  openJob,
  prepare,
}: {
  readonly entry: MachineDirectoryEntry;
  readonly openJob: MachineJob | undefined;
  readonly prepare: PrepareActionFacts;
}): NextAction => {
  if (openJob) {
    switch (openJob.state) {
      case 'awaiting-approval': {
        return {
          label: openJob.requestedBy.kind === 'agent' ? 'Review the agent’s job' : 'Confirm and start',
          kind: 'review',
        };
      }
      case 'awaiting-start': {
        return { label: 'Press start at the machine', kind: 'none' };
      }
      case 'confirming': {
        return { label: 'Waiting for the machine to confirm', kind: 'none' };
      }
      case 'unknown': {
        return { label: 'Check the machine', kind: 'review' };
      }
      default: {
        return { label: 'Sending…', kind: 'none' };
      }
    }
  }
  if (isRunOwned(entry)) {
    return { label: 'Monitor the run', kind: 'none' };
  }
  return prepareAction(prepare);
};

/**
 * What Prepare is for while a decision or a run owns the pane: it starts closed behind them and keeps its own actions.
 *
 * @param entry - The selected machine.
 * @param openJob - Its unsettled job.
 * @returns The closed stage's words, or nothing while Prepare leads.
 */
const deferredPrepare = (
  entry: MachineDirectoryEntry | undefined,
  openJob: MachineJob | undefined,
): string | undefined => {
  if (openJob) {
    return 'For a different print';
  }
  return entry !== undefined && isRunOwned(entry) ? 'For the next print' : undefined;
};

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
function NoMachines(): React.JSX.Element {
  const { open } = useSettingsDialog();
  return (
    <PanelEmptyState
      icon={Printer}
      title='No machines yet'
      description='Find a printer on your network or add a simulated machine in Settings. Machines set up there are available in every project on this computer.'
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

/** The observation's age. It ticks every second, so it is no live region: the notice above announces staleness. */
function PrintFooter({ entry }: { readonly entry: MachineDirectoryEntry | undefined }): React.JSX.Element {
  const now = useNow();
  return (
    <p className='flex min-h-8 shrink-0 items-center gap-1.5 border-t border-border/70 px-3 text-xs text-muted-foreground'>
      {entry?.freshness === 'stale' ? <CircleAlert aria-hidden className='size-3.5 shrink-0 text-warning' /> : null}
      <span className='min-w-0 flex-1 truncate'>
        {entry ? `Observed ${formatAge(entry.snapshot.observedAt, now)}` : 'No machine selected'}
      </span>
      {entry?.snapshot.state.native === undefined ? null : (
        <span className='shrink-0 font-mono'>{entry.snapshot.state.native}</span>
      )}
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
      <span id={descriptionId} className='sr-only'>
        {outcome}
      </span>
    </>
  );
}

/** The only place the machine is named and chosen, with its status, the Simulated mark, Stop and a refresh. */
function PrintHeader({
  entries,
  selected,
  openJob,
  select,
  refresh,
  stop,
  isSimulated,
}: {
  readonly entries: readonly MachineDirectoryEntry[];
  readonly selected: MachineDirectoryEntry | undefined;
  readonly openJob: MachineJob | undefined;
  readonly select: ReturnType<typeof useMachinesSelection>['select'];
  readonly refresh: () => void;
  readonly stop: React.ReactNode;
  /** Whether the selected machine's provider runs only on a simulated transport. */
  readonly isSimulated: boolean;
}): React.JSX.Element {
  const presentation = selected ? presentMachine(selected, openJob) : undefined;
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
                  secondary: presentMachine(entry, entry.machineId === selected?.machineId ? openJob : undefined).label,
                })),
              },
            ]}
            onChange={select}
          />
        </div>
      ) : (
        <span className='min-w-0 flex-1'>No machines</span>
      )}
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

function ConnectedPrintPanel({
  client,
  bridge,
  isShown,
}: {
  readonly client: MachineClient;
  readonly bridge: MachineApprovalBridge;
  readonly isShown: boolean;
}): React.JSX.Element {
  const { projectId } = useProject();
  const directory = useMachineDirectory(client);
  const entries = useMemo(
    () => directory.snapshot?.entries.toSorted((a, b) => a.name.localeCompare(b.name)) ?? [],
    [directory.snapshot],
  );
  const { selected, select } = useMachinesSelection(projectId, entries);
  const { jobs, error: jobsError } = useMachinesJobs(client, selected?.machineId);
  const openJob = jobs.find((job) => isOpenJob(job));
  const provider = directory.providers.find(({ id }) => id === selected?.providerId);
  const header = (stop: React.ReactNode): React.JSX.Element => (
    <PrintHeader
      entries={entries}
      selected={selected}
      openJob={openJob}
      select={select}
      refresh={directory.refresh}
      stop={stop}
      isSimulated={provider !== undefined && isSimulatedMachine(provider.manifest)}
    />
  );
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
      {selected ? (
        <MachinePanel
          key={`${projectId}:${selected.machineId}`}
          client={client}
          bridge={bridge}
          isShown={isShown}
          entry={selected}
          provider={provider}
          jobs={jobs}
          openJob={openJob}
          header={header}
          errors={[directory.error, jobsError]}
        />
      ) : (
        <>
          {header(undefined)}
          <div className='relative flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-3'>
            {directory.error ? <PrintNotice tone='error'>{directory.error}</PrintNotice> : null}
            {directory.snapshot ? (
              <NoMachines />
            ) : (
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
          </div>
          <PrintFooter entry={undefined} />
        </>
      )}
    </div>
  );
}

function MachinePanel({
  client,
  bridge,
  isShown,
  entry,
  provider,
  jobs,
  openJob,
  header,
  errors,
}: {
  readonly client: MachineClient;
  readonly bridge: MachineApprovalBridge;
  readonly isShown: boolean;
  readonly entry: MachineDirectoryEntry;
  readonly provider: ReturnType<typeof useMachineDirectory>['providers'][number] | undefined;
  readonly jobs: readonly MachineJob[];
  readonly openJob: MachineJob | undefined;
  readonly header: (stop: React.ReactNode) => React.JSX.Element;
  readonly errors: ReadonlyArray<string | undefined>;
}): React.JSX.Element {
  /* The person's presence is said for this machine only: the panel is keyed by machine, so it starts unattended. */
  const presence = usePresence();
  const control = useMachineControl({
    client,
    entry,
    attended: presence.attended,
    setAttended: presence.setAttended,
    onUsed: presence.touch,
  });
  const isFff = fffProcessOf(entry.descriptor.capabilities) !== undefined;
  const prepare = usePrintPrepare({
    client,
    entry,
    provider,
    manifest: provider?.manifest,
    isShown: isShown && isFff,
  });
  const action = nextAction({ entry, openJob, prepare });
  const prepareDeferred = deferredPrepare(entry, openJob);
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
        {control.error === undefined ? null : (
          <PrintNotice tone='error' role='alert'>
            {control.error}
          </PrintNotice>
        )}
        <ActionApprovals client={client} control={control} bridge={bridge} />
        <PresenceRow control={control} presence={presence} />
        <JobsSection client={client} control={control} jobs={jobs} bridge={bridge} />
        {isFff || entry.descriptor.capabilities.jobs.type === 'unsupported' ? null : (
          /* ponytail: choosing a program file here waits for a program picker; the agent and the machine send one. */
          <PrintNotice tone='neutral' role='status'>
            Send a program to {entry.name} from the agent or at the machine.
          </PrintNotice>
        )}
        <Activities control={control} />
        <RunBlock control={control} jobs={jobs} />
        <PrintStages>
          <MonitorStage control={control} />
          <ControlStage client={client} control={control} />
          {isFff ? (
            <PrepareStages
              entry={entry}
              provider={provider}
              manifest={provider?.manifest}
              prepare={prepare}
              control={control}
              deferred={prepareDeferred}
            />
          ) : null}
          <PressureAdvanceStage control={control} />
          <HistoryStage entry={entry} jobs={jobs} />
          <InspectStage
            entry={entry}
            provider={provider}
            slicer={isFff ? slicerName(prepare.studio) : undefined}
            job={openJob}
          />
        </PrintStages>
      </div>
      {isFff && prepareDeferred === undefined && (action.kind === 'slice' || action.kind === 'send') ? (
        /* One primary action at a fixed place; the job review opens above when Send is pressed. */
        <div
          data-slot='print-action-bar'
          className='flex max-h-[60%] min-w-0 shrink-0 flex-col gap-2 overflow-y-auto border-t border-border/70 px-3 py-2'
        >
          <PrepareActions prepare={prepare} control={control} />
        </div>
      ) : null}
      <PrintFooter entry={entry} />
    </>
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
  readonly bridge: MachineApprovalBridge;
  readonly isShown?: boolean;
}): React.JSX.Element => {
  if (!machines.available) {
    return (
      <PanelEmptyState
        icon={Printer}
        title={machines.reason === 'not-granted' ? 'Machine access not granted' : 'Machines unavailable'}
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
 * Workbench adapter: this computer's machines facet and the focused chat's interrupts.
 *
 * @returns The Print pane.
 * @public
 */
export const PrintPanelBody = ({ isShown = true }: { readonly isShown?: boolean }): React.JSX.Element => {
  const machines = useMachinesFacet();
  const bridge = useMachineApprovalBridge();
  return <PrintPanel machines={machines} bridge={bridge} isShown={isShown} />;
};
