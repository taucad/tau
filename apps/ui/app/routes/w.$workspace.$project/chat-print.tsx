import { useFeature } from '#flags/use-feature.js';
import { MachinesDisabled } from '#components/machines/machines-disabled.js';
import { memo, useCallback, useMemo } from 'react';
import { Button } from '@taucad/ui/components/button';
import { Link, useSearchParams } from 'react-router';
import { useSearchParameter } from '#hooks/use-search-parameter.js';
import { searchParameterName } from '#constants/search-parameter.constants.js';
import { stringParameter } from '#utils/search-parameter.codecs.js';

import { useSelector } from '@xstate/react';
import { LoaderCircle, Printer } from 'lucide-react';
import { fffProcessOf } from '@taucad/runtime/machine';
import type { MachineClient, MachineDirectoryEntry, MachineJob } from '@taucad/runtime/machine';
import type { RuntimeTransportFacet } from '@taucad/runtime/transport';
import { PanelEmptyState } from '@taucad/ui/components/panel-empty-state';
import { useProjectAvailability } from '#hooks/use-project-availability.js';
import { ProjectSyncPlaceholder } from '#routes/w.$workspace.$project/project-sync-placeholder.js';
import { useMachineDirectory, useMachinesFacet } from '#hooks/use-machines.js';
import { useMachineApprovalBridge } from '#hooks/use-machines-approvals.js';
import type { MachineApprovalBridge } from '#hooks/use-machines-approvals.js';
import { isOpenJob, useMachinesJobs } from '#hooks/use-machines-jobs.js';
import { useMachinesSelection } from '#hooks/use-machines-selection.js';
import { useProject } from '#hooks/use-project.js';
import { isRunOwned } from '#components/machines/machine-controls.js';
import {
  MachineWorkbench,
  MachineWorkbenchContent,
  ObservedPrintHeader,
  PrintFooter,
  NoMachines,
} from '#components/machines/machine-workbench.js';
import { PrintNotice } from '#components/machines/machine-section.js';
import {
  PrepareActions,
  PrepareStages,
  prepareAction,
  slicerName,
  usePrintPrepare,
} from '#routes/w.$workspace.$project/chat-print-prepare.js';
import type { PrepareActionFacts } from '#routes/w.$workspace.$project/chat-print-prepare.js';
import { ProgramStage } from '#routes/w.$workspace.$project/chat-print-program.js';
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

const machineParameter = stringParameter();

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
  const stored = useMachinesSelection(projectId, entries, directory.snapshot?.cursor.hostId);
  const [, setSearchParams] = useSearchParams();
  const [linkedMachine, setLinkedMachine] = useSearchParameter(searchParameterName.machine, machineParameter);
  const [linkedHost] = useSearchParameter(searchParameterName.machineHost, machineParameter);
  const [linkedJob] = useSearchParameter(searchParameterName.machineJob, machineParameter);
  const selected = linkedMachine
    ? linkedHost === directory.snapshot?.cursor.hostId
      ? entries.find((candidate) => candidate.machineId === linkedMachine)
      : undefined
    : stored.selected;
  const select = useCallback(
    (machineId: string): void => {
      stored.select(machineId);
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.delete(searchParameterName.machine);
          next.delete(searchParameterName.machineHost);
          next.delete(searchParameterName.machineJob);
          return next;
        },
        { replace: true },
      );
    },
    [stored.select, setSearchParams],
  );
  const {
    jobs,
    error: jobsError,
    isStalled: isJobWatchStalled,
  } = useMachinesJobs(client, selected?.machineId, directory.snapshot?.cursor.hostId);
  const openJob = jobs.find((job) => job.jobId === linkedJob && isOpenJob(job)) ?? jobs.find((job) => isOpenJob(job));
  const provider = directory.providers.find(({ id }) => id === selected?.providerId);
  const header = useCallback(
    (stop: React.ReactNode): React.JSX.Element => (
      <ObservedPrintHeader
        client={client}
        selected={selected}
        openJob={openJob}
        select={select}
        stop={stop}
        withMachineLink
      />
    ),
    [client, selected, openJob, select],
  );
  const errors = useMemo(() => [directory.error, jobsError], [directory.error, jobsError]);
  return (
    <div
      data-slot='print-panel-body'
      className='flex size-full min-h-0 min-w-0 flex-col overflow-hidden bg-sidebar'
      style={{
        '--param-field-h': '1.5rem',
        '--param-field-radius': 'var(--radius-md)',
        '--param-field-color': 'var(--color-muted-foreground)',
        '--param-field-color-focus': 'var(--color-foreground)',
      }}
    >
      {selected ? (
        <ProjectMachinePanel
          key={`${projectId}:${directory.snapshot?.cursor.hostId}:${selected.machineId}`}
          client={client}
          bridge={bridge}
          isShown={isShown}
          entry={selected}
          provider={provider}
          jobs={jobs}
          isJobWatchStalled={isJobWatchStalled}
          openJob={openJob}
          header={header}
          errors={errors}
          selectedJobId={linkedJob || undefined}
        />
      ) : (
        <>
          {header(undefined)}
          <div className='relative flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-3'>
            {directory.error ? <PrintNotice tone='error'>{directory.error}</PrintNotice> : null}
            {linkedMachine && directory.snapshot ? (
              <PrintNotice tone='warning'>
                This linked machine is unavailable on this host.{' '}
                <Link to='/machines' className='underline'>
                  View machines
                </Link>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => {
                    setLinkedMachine('');
                  }}
                >
                  Choose another machine
                </Button>
              </PrintNotice>
            ) : directory.snapshot ? (
              <NoMachines />
            ) : (
              <div
                role='status'
                aria-busy='true'
                className='grid min-h-full place-items-center text-sm text-muted-foreground'
              >
                <span className='flex items-center gap-2'>
                  <LoaderCircle aria-hidden className='size-4 spin-glyph' />
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

const ProjectMachinePanel = memo(function ProjectMachinePanel(
  properties: Omit<React.ComponentProps<typeof MachineWorkbenchContent>, 'control' | 'presence'> & {
    readonly isShown: boolean;
  },
): React.JSX.Element {
  return (
    <MachineWorkbench {...properties}>
      {({ control, presence }) => <ProjectPreparation {...properties} control={control} presence={presence} />}
    </MachineWorkbench>
  );
});
function ProjectPreparation(
  properties: React.ComponentProps<typeof MachineWorkbenchContent> & { readonly isShown: boolean },
): React.JSX.Element {
  const { client, entry, provider, openJob, control, isShown } = properties;
  const { projectId, editorRef } = useProject();
  const onPreview = useCallback(
    (job: MachineJob) => {
      editorRef.send({ type: 'openFile', path: job.artifact.path, source: 'user' });
    },
    [editorRef],
  );
  const isFff = fffProcessOf(entry.descriptor.capabilities) !== undefined;
  const prepare = usePrintPrepare({ client, entry, provider, manifest: provider?.manifest, isShown: isShown && isFff });
  const action = nextAction({ entry, openJob, prepare });
  const deferred = deferredPrepare(entry, openJob);
  const preparation = isFff ? (
    <PrepareStages
      entry={entry}
      provider={provider}
      manifest={provider?.manifest}
      prepare={prepare}
      control={control}
      deferred={deferred}
    />
  ) : (
    <ProgramStage client={client} control={control} isDefaultOpen={deferred === undefined} />
  );
  const actions =
    isFff && deferred === undefined && (action.kind === 'slice' || action.kind === 'send') ? (
      <PrepareActions prepare={prepare} control={control} />
    ) : undefined;
  return (
    <MachineWorkbenchContent
      {...properties}
      projectId={projectId}
      onPreview={onPreview}
      preparation={preparation}
      actions={actions}
      slicer={isFff ? slicerName(prepare.studio) : undefined}
    />
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
const noChatApprovalBridge: MachineApprovalBridge = {
  pendingForJob: () => undefined,
  pendingActions: () => [],
  respond: async () => {
    throw new Error('A chat must be loaded before responding to its approval.');
  },
};

function ChatPrintPanel({
  isShown,
  machines,
}: {
  readonly isShown: boolean;
  readonly machines: RuntimeTransportFacet<MachineClient>;
}): React.JSX.Element {
  const bridge = useMachineApprovalBridge();
  return <PrintPanel machines={machines} bridge={bridge} isShown={isShown} />;
}

function AvailablePrintPanel({ isShown }: { readonly isShown: boolean }): React.JSX.Element {
  const { editorRef } = useProject();
  const chatId = useSelector(editorRef, (snapshot) => snapshot.context.focusedChatId);
  const machines = useMachinesFacet();
  return chatId === undefined ? (
    <PrintPanel machines={machines} bridge={noChatApprovalBridge} isShown={isShown} />
  ) : (
    <ChatPrintPanel isShown={isShown} machines={machines} />
  );
}

export const PrintPanelBody = ({ isShown = true }: { readonly isShown?: boolean }): React.JSX.Element => {
  const availability = useProjectAvailability();
  const enabled = useFeature('machines');
  if (!enabled) {
    return <MachinesDisabled />;
  }
  return availability === 'ready' ? (
    <AvailablePrintPanel isShown={isShown} />
  ) : (
    <ProjectSyncPlaceholder state={availability} />
  );
};
