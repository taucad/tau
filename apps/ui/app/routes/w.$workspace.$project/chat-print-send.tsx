import { useCallback, useRef, useState } from 'react';
import {
  Bot,
  Check,
  CircleAlert,
  Eye,
  Hand,
  Info,
  LoaderCircle,
  Play,
  SearchCheck,
  ShieldCheck,
  X,
} from 'lucide-react';
import { checkMachineAction, fffProcessOf } from '@taucad/runtime/machine';
import type {
  MachineCheck,
  MachineClient,
  MachineDirectoryEntry,
  MachineJob,
  MachineOperation,
  MachineProgramSummary,
} from '@taucad/runtime/machine';
import { Button } from '@taucad/ui/components/button';
import { Checkbox } from '@taucad/ui/components/checkbox';
import { Label } from '@taucad/ui/components/label';
import { randomUuid } from '@taucad/utils/id';
import { describeOutcome } from '#components/print/machine-facts.js';
import { operator } from '#hooks/use-machine-control.js';
import type { MachineControl } from '#hooks/use-machine-control.js';
import { answerMachineAction } from '#components/print/machine-action-approval.js';
import type { PendingMachineAction } from '#components/print/machine-action-approval.js';
import type { MachineApprovalBridge } from '#hooks/use-machines-approvals.js';
import { isOpenJob } from '#hooks/use-machines-jobs.js';
import { useProject } from '#hooks/use-project.js';
import {
  QualificationBadge,
  RemedyButton,
  declaredAction,
  formParameter,
  isRunOwned,
} from '#routes/w.$workspace.$project/chat-print-controls.js';
import { PrintNotice, PrintRow, PrintSteps, useNow } from '#routes/w.$workspace.$project/chat-print-section.js';
import type { PrintStep } from '#routes/w.$workspace.$project/chat-print-section.js';
import {
  formatDuration,
  formatFilament,
  formatProducer,
  shortDigest,
} from '#routes/w.$workspace.$project/chat-print-summary.js';

/**
 * A thrown request failure as the pane shows it: the host's or the provider's own words. What clears a refusal
 * arrives as a check's remedy, never from parsing this text.
 *
 * @param error - What a machine client call rejected with.
 * @returns Plain copy.
 * @public
 */
export const describePrintError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Why the machine cannot take a job right now, or nothing when it can: a current connected observation, no run in
 * progress and a machine that reports ready. The job's own checks say the rest.
 *
 * @param entry - The machine as observed.
 * @returns The first blocker in the person's words.
 * @public
 */
export const startBlocker = (entry: MachineDirectoryEntry): string | undefined => {
  const { name } = entry;
  if (entry.freshness !== 'current' || entry.snapshot.connection !== 'connected') {
    return `Wait for a current observation from ${name} before starting.`;
  }
  const { run, state } = entry.snapshot;
  if (run?.state === 'paused') {
    return `${name} has a paused run. Resume or cancel it before starting another.`;
  }
  if (isRunOwned(entry)) {
    return `${name} has a run in progress. Start another once it ends.`;
  }
  if (state.status !== 'ready') {
    return `${name} is not ready${state.reason === undefined ? '' : `: ${state.reason}`}. Wait until it reports ready.`;
  }
  return undefined;
};

/**
 * What a program will do, in a line: "125 layers · 3.2 m of filament · about 42 min", or "1,240 lines · T1, T3".
 *
 * @param program - The program as the host read it.
 * @returns The facts.
 * @public
 */
export const describeProgram = (program: MachineProgramSummary): string => {
  const { facts } = program;
  const parts =
    facts.process === 'fff'
      ? [
          facts.layers === undefined ? undefined : `${facts.layers.toLocaleString()} layers`,
          facts.filamentLength === undefined ? undefined : `${formatFilament(facts.filamentLength)} of filament`,
        ]
      : facts.process === 'milling'
        ? [
            `${facts.lines.toLocaleString()} lines`,
            facts.tools.length === 0 ? undefined : facts.tools.map((tool) => `T${String(tool.number)}`).join(', '),
            facts.workOffsets.length === 0 ? undefined : facts.workOffsets.join(', '),
          ]
        : [];
  return [
    ...parts,
    program.estimatedDuration === undefined ? undefined : formatDuration(program.estimatedDuration / 1000),
  ]
    .filter((part) => part !== undefined)
    .join(' · ');
};

const checkIcon = (state: MachineCheck['state']): React.JSX.Element =>
  state === 'passed' ? (
    <Check aria-hidden className='mt-0.5 size-3.5 shrink-0 text-success' />
  ) : state === 'blocked' ? (
    <CircleAlert aria-hidden className='mt-0.5 size-3.5 shrink-0 text-feature' />
  ) : (
    <Info aria-hidden className='mt-0.5 size-3.5 shrink-0 text-information' />
  );

const checkWords = {
  passed: 'passed',
  attention: 'needs attention',
  blocked: 'blocked',
  unknown: 'not known',
} as const;

/**
 * A machine's checks of a job, each with its state and, while it is not passed, what clears it.
 *
 * @param properties - The control remedies are sent through, and the checks.
 * @returns The list.
 * @public
 */
export function JobChecks({
  control,
  checks,
}: {
  readonly control: MachineControl;
  readonly checks: readonly MachineCheck[];
}): React.JSX.Element {
  return (
    <ul aria-label='Checks' className='flex flex-col gap-1.5 text-xs'>
      {checks.map((check) => (
        <li key={check.id} className='flex min-w-0 items-start gap-1.5'>
          {checkIcon(check.state)}
          <div className='flex min-w-0 flex-1 flex-col gap-1'>
            <span>
              {check.label}
              <span className='sr-only'> ({checkWords[check.state]})</span>
            </span>
            {check.detail === undefined ? null : <span className='text-muted-foreground'>{check.detail}</span>}
            {check.remedy === undefined || check.state === 'passed' ? null : (
              <div>
                <RemedyButton control={control} remedy={check.remedy} />
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * A job waiting for the person: the program, the machine's checks with their remedies, what the person vouches for,
 * presence, then one Start (or "Send, then press Play" where the machine starts at its own button).
 *
 * @param properties - The client, control, job, chat bridge and the preview.
 * @returns The card.
 */
function JobReview({
  client,
  control,
  job,
  bridge,
  onPreview,
}: {
  readonly client: MachineClient;
  readonly control: MachineControl;
  readonly job: MachineJob;
  readonly bridge: MachineApprovalBridge;
  readonly onPreview: (() => void) | undefined;
}): React.JSX.Element {
  const { entry, attended } = control;
  const { jobs } = entry.descriptor.capabilities;
  const [vouched, setVouched] = useState<ReadonlySet<string>>(new Set());
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string>();
  const ids = useRef<Readonly<{ transferOperationId: string; startOperationId: string }>>(undefined);
  const isAgent = job.requestedBy.kind === 'agent';
  const pending = bridge.pendingForJob(job);
  const attestations = jobs.type === 'supported' ? jobs.attestations : [];
  const needsPresence = jobs.type === 'supported' && jobs.safety.attended && !attended;
  const blocked = job.checks.filter((check) => check.state === 'blocked');
  const missing = attestations.filter((attestation) => !vouched.has(attestation.id));
  const blocker = startBlocker(entry);
  const canStart = blocked.length === 0 && missing.length === 0 && !needsPresence && blocker === undefined && !isBusy;
  const isFff = fffProcessOf(entry.descriptor.capabilities) !== undefined;
  const startLabel =
    jobs.type === 'supported' && jobs.start === 'at-machine'
      ? 'Send, then press Play'
      : isFff
        ? 'Start print'
        : 'Start job';

  const run = async (action: () => Promise<void>): Promise<void> => {
    setIsBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (error_) {
      setError(describePrintError(error_));
    } finally {
      setIsBusy(false);
    }
  };
  const start = async (): Promise<void> =>
    run(async () => {
      ids.current ??= { transferOperationId: randomUuid(), startOperationId: randomUuid() };
      // The person's attestations and presence travel only with their own approval. The host answers once the start
      // settles, so the paused agent tool then finds the job resolved and reports it.
      await client.resolveJob({
        jobId: job.jobId,
        decision: 'approve',
        resolvedBy: operator,
        attestations: attestations.map((attestation) => attestation.id),
        attended,
        ...ids.current,
      });
      if (pending) {
        await bridge.respond(pending.approvalId, true);
      }
    });
  /* An agent's job is denied on the person's own session first, so the host records `denied` with the person as its
   * resolver; then the paused chat is answered (R16). A person's own request is withdrawn. */
  const decline = async (): Promise<void> =>
    run(async () => {
      await (isAgent
        ? client.resolveJob({ jobId: job.jobId, decision: 'deny', resolvedBy: operator })
        : client.withdrawJob({ jobId: job.jobId, resolvedBy: operator }));
      if (pending) {
        await bridge.respond(pending.approvalId, false);
      }
    });

  return (
    <section
      aria-label={`Job awaiting you: ${job.program.name}`}
      className='flex min-w-0 flex-col gap-3 rounded-lg border border-border/70 bg-card p-3'
    >
      <div className='flex min-w-0 items-start gap-2'>
        {isAgent ? (
          <Bot aria-hidden className='mt-0.5 size-4 shrink-0 text-information' />
        ) : (
          <ShieldCheck aria-hidden className='mt-0.5 size-4 shrink-0 text-muted-foreground' />
        )}
        <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
          <h4 className='truncate text-sm font-medium'>{job.program.name}</h4>
          <p className='text-xs text-muted-foreground'>
            {[
              describeProgram(job.program),
              jobs.type === 'supported'
                ? jobs.delivery === 'stored'
                  ? 'stored on the machine'
                  : 'fed by Tau line by line'
                : undefined,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p className='text-xs text-muted-foreground'>
            Requested by {job.requestedBy.label}
            {job.program.producer ? ` · sliced by ${formatProducer(job.program.producer)}` : ''}
          </p>
          {pending === undefined ? null : <p className='text-xs'>{pending.prompt}</p>}
        </div>
      </div>
      {job.checks.length === 0 ? null : <JobChecks control={control} checks={job.checks} />}
      {attestations.length === 0 ? null : (
        <fieldset className='flex min-w-0 flex-col gap-1.5'>
          <legend className='mb-1.5 text-xs font-medium text-muted-foreground'>You confirm</legend>
          {attestations.map(({ id, label }) => {
            const inputId = `job-${job.jobId}-${id}`;
            return (
              <div key={id} className='flex min-w-0 items-start gap-2'>
                <Checkbox
                  id={inputId}
                  checked={vouched.has(id)}
                  disabled={isBusy}
                  onCheckedChange={(checked) => {
                    setVouched((current) => {
                      const next = new Set(current);
                      if (checked === true) {
                        next.add(id);
                      } else {
                        next.delete(id);
                      }
                      return next;
                    });
                  }}
                />
                <Label htmlFor={inputId} className='min-w-0 text-xs leading-4 font-normal wrap-break-word'>
                  {label}
                </Label>
              </div>
            );
          })}
        </fieldset>
      )}
      {needsPresence ? (
        <p className='text-xs text-muted-foreground'>
          Starting needs someone at the machine: switch on “I am at the machine” above.
        </p>
      ) : null}
      {blocker === undefined ? null : (
        <PrintNotice tone='warning' role='status'>
          {blocker}
        </PrintNotice>
      )}
      {error ? <PrintNotice tone='error'>{error}</PrintNotice> : null}
      <div className='flex flex-wrap items-center gap-2'>
        <Button
          type='button'
          size='sm'
          disabled={!canStart}
          onClick={() => {
            void start();
          }}
        >
          {isBusy ? (
            <LoaderCircle aria-hidden className='animate-spin motion-reduce:animate-none' />
          ) : (
            <Play aria-hidden />
          )}
          {startLabel}
        </Button>
        <Button
          type='button'
          size='sm'
          variant='outline'
          disabled={isBusy}
          onClick={() => {
            void decline();
          }}
        >
          <X aria-hidden />
          {isAgent ? 'Deny' : 'Withdraw'}
        </Button>
        {onPreview === undefined ? (
          <span className='text-xs text-muted-foreground'>From another project</span>
        ) : (
          <Button type='button' size='sm' variant='ghost' onClick={onPreview}>
            <Eye aria-hidden />
            Preview
          </Button>
        )}
      </div>
      {pending === undefined ? null : (
        <p className='text-xs text-muted-foreground'>Answering here also answers the chat.</p>
      )}
    </section>
  );
}

const progressStates = ['approved', 'transferring', 'starting', 'confirming'] as const;

/**
 * The steps from approval to the machine's own report of the run.
 *
 * @param job - The job in flight.
 * @param delivery - How the program reaches the machine.
 * @returns The steps.
 */
const progressSteps = (job: MachineJob, delivery: 'stored' | 'streamed'): readonly PrintStep[] => {
  const position = progressStates.indexOf(job.state as (typeof progressStates)[number]);
  const step = (at: number): PrintStep['state'] => (position > at ? 'done' : position === at ? 'active' : 'todo');
  return [
    { label: `Approved by ${job.resolvedBy?.label ?? 'you'}`, state: 'done' },
    { label: delivery === 'stored' ? 'Upload' : 'Stream', state: step(1), actor: 'machine' },
    { label: 'Start', state: step(2), actor: 'machine' },
    { label: 'Confirmed by the machine’s own report', state: step(3), actor: 'machine' },
  ];
};

/**
 * A job in flight, from approval to the machine's confirmation, or loaded and waiting for the person to press start
 * at the machine.
 *
 * @param properties - The client, the machine and the job.
 * @returns The card.
 */
function JobProgress({
  client,
  entry,
  job,
}: {
  readonly client: MachineClient;
  readonly entry: MachineDirectoryEntry;
  readonly job: MachineJob;
}): React.JSX.Element {
  const { jobs } = entry.descriptor.capabilities;
  const delivery = jobs.type === 'supported' ? jobs.delivery : 'stored';
  const [error, setError] = useState<string>();
  if (job.state === 'awaiting-start') {
    return (
      <section
        aria-label='Job'
        className='flex min-w-0 flex-col gap-2 rounded-lg border border-information/40 bg-card p-3'
      >
        <p role='status' className='flex min-w-0 items-center gap-2 text-sm'>
          <Hand aria-hidden className='size-4 shrink-0 text-information' />
          <span className='min-w-0'>
            Press start on {entry.name} to begin {job.program.name}
          </span>
        </p>
        <PrintSteps
          layout='list'
          steps={[
            { label: `Approved by ${job.resolvedBy?.label ?? 'you'}`, state: 'done' },
            { label: 'Loaded on the machine', state: 'done', actor: 'machine' },
            { label: 'Start pressed at the machine', state: 'active', actor: 'person' },
            { label: delivery === 'streamed' ? 'Streaming the rest' : 'Running', state: 'todo', actor: 'machine' },
          ]}
        />
        <p className='text-xs text-muted-foreground'>
          The press at the machine is the proof someone is there.
          {delivery === 'streamed' ? ' Keep this computer awake: Tau feeds the program for the whole run.' : ''}
        </p>
        {error ? <PrintNotice tone='error'>{error}</PrintNotice> : null}
        <div>
          <Button
            type='button'
            size='sm'
            variant='outline'
            onClick={() => {
              const withdraw = async (): Promise<void> => {
                try {
                  await client.withdrawJob({ jobId: job.jobId, resolvedBy: operator });
                } catch (error_) {
                  setError(describePrintError(error_));
                }
              };
              // async-iife: press -- the card shows a refusal itself.
              void withdraw();
            }}
          >
            Withdraw
          </Button>
        </div>
      </section>
    );
  }
  const label =
    job.state === 'preparing'
      ? `Checking ${job.program.name} against ${entry.name}…`
      : job.state === 'transferring'
        ? `${delivery === 'stored' ? 'Uploading' : 'Streaming'} ${job.program.name} to ${entry.name}…`
        : job.state === 'starting'
          ? `Starting on ${entry.name}…`
          : job.state === 'confirming'
            ? `Waiting for ${entry.name} to confirm the start…`
            : `Sending ${job.program.name} to ${entry.name}…`;
  return (
    <div
      role='status'
      aria-busy='true'
      aria-label={label}
      className='flex min-w-0 flex-col gap-2 rounded-lg border border-border/70 bg-card p-3'
    >
      <p className='flex min-w-0 items-center gap-2 text-sm'>
        <LoaderCircle aria-hidden className='size-4 shrink-0 animate-spin motion-reduce:animate-none' />
        <span className='min-w-0 truncate'>{label}</span>
      </p>
      {job.state === 'preparing' ? null : <PrintSteps steps={progressSteps(job, delivery)} />}
      {job.state === 'confirming' ? (
        <p className='text-xs text-muted-foreground'>
          The start was sent. Tau confirms it from the machine&apos;s own report, usually within a minute; nothing more
          is sent.
        </p>
      ) : null}
    </div>
  );
}

/**
 * A start the machine has not proven. Tau keeps watching the machine's reports, so this card clears itself when the
 * run shows up; "Check again" reads the operation at once. Nothing is resent.
 *
 * @param properties - The client and the job.
 * @returns The card.
 */
function UnknownCard({ client, job }: { readonly client: MachineClient; readonly job: MachineJob }): React.JSX.Element {
  const [isBusy, setIsBusy] = useState(false);
  const [reconciled, setReconciled] = useState<MachineOperation>();
  const [error, setError] = useState<string>();
  const operationId = job.startOperationId ?? job.transferOperationId;
  const reconcile = async (): Promise<void> => {
    if (operationId === undefined) {
      return;
    }
    setIsBusy(true);
    setError(undefined);
    try {
      setReconciled(await client.reconcileOperation({ machineId: job.machineId, operationId }));
    } catch (error_) {
      setError(describePrintError(error_));
    } finally {
      setIsBusy(false);
    }
  };
  return (
    <div role='alert' className='flex min-w-0 flex-col gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3'>
      <p className='text-sm font-medium'>The machine hasn&apos;t confirmed the start of {job.program.name}.</p>
      <p className='text-xs text-muted-foreground'>
        Check the machine. Tau keeps watching and moves this to the run as soon as the machine reports it. Nothing is
        resent.
      </p>
      <p className='text-xs text-muted-foreground'>
        Artifact <span className='font-mono'>{shortDigest(job.artifact.digest)}</span>
      </p>
      {reconciled ? (
        <p className='text-xs' role='status'>
          {reconciled.state === 'accepted' ? 'Checked: the machine took it' : `Checked: ${reconciled.state}`}
        </p>
      ) : null}
      {error ? <PrintNotice tone='error'>{error}</PrintNotice> : null}
      {operationId === undefined ? null : (
        <div>
          <Button
            type='button'
            size='sm'
            variant='outline'
            disabled={isBusy}
            onClick={() => {
              void reconcile();
            }}
          >
            {isBusy ? (
              <LoaderCircle aria-hidden className='animate-spin motion-reduce:animate-none' />
            ) : (
              <SearchCheck aria-hidden />
            )}
            Check again
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * A job that ended without running: the machine refused the start, or the host refused the job first.
 *
 * @param properties - The job and its dismissal.
 * @returns The notice.
 */
function FailureCard({
  job,
  onDismiss,
}: {
  readonly job: MachineJob;
  readonly onDismiss: () => void;
}): React.JSX.Element {
  const failure =
    job.failure ??
    (job.receipt?.status === 'rejected' ? { code: job.receipt.code, message: job.receipt.message } : undefined);
  return (
    <PrintNotice tone='error'>
      <p className='font-medium'>
        {job.state === 'rejected' ? 'The machine rejected the start' : 'The job was refused before anything was sent'}
        {failure ? ` (${failure.code})` : ''}
      </p>
      {failure ? <p>{failure.message}</p> : null}
      <p className='text-muted-foreground'>{job.program.name}. Prepare it again to start a new job.</p>
      <Button type='button' size='xs' variant='outline' className='mt-1' onClick={onDismiss}>
        Dismiss
      </Button>
    </PrintNotice>
  );
}

/**
 * Jobs: every job that still needs the person or the host, and the last failure until it is dismissed.
 *
 * @param properties - The client, control, this machine's jobs and the chat bridge.
 * @returns The section, or nothing while no job is open.
 * @public
 */
export function JobsSection({
  client,
  control,
  jobs,
  bridge,
}: {
  readonly client: MachineClient;
  readonly control: MachineControl;
  readonly jobs: readonly MachineJob[];
  readonly bridge: MachineApprovalBridge;
}): React.JSX.Element | undefined {
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const { projectId, editorRef } = useProject();
  const preview = useCallback(
    (job: MachineJob): void => {
      editorRef.send({ type: 'openFile', path: job.artifact.path, source: 'user' });
    },
    [editorRef],
  );
  const open = jobs.filter((job) => isOpenJob(job));
  const latest = jobs[0];
  const failure =
    open.length === 0 &&
    latest &&
    (latest.state === 'rejected' || latest.state === 'failed') &&
    !dismissed.has(latest.jobId)
      ? latest
      : undefined;
  if (open.length === 0 && failure === undefined) {
    return undefined;
  }
  return (
    <section aria-label='Jobs' className='flex min-w-0 flex-col gap-2'>
      {open.map((job) =>
        job.state === 'awaiting-approval' ? (
          <JobReview
            key={job.jobId}
            client={client}
            control={control}
            job={job}
            bridge={bridge}
            onPreview={
              job.artifact.projectId === projectId
                ? () => {
                    preview(job);
                  }
                : undefined
            }
          />
        ) : job.state === 'unknown' ? (
          <UnknownCard key={job.jobId} client={client} job={job} />
        ) : (
          <JobProgress key={job.jobId} client={client} entry={control.entry} job={job} />
        ),
      )}
      {failure ? (
        <FailureCard
          job={failure}
          onDismiss={() => {
            setDismissed((current) => new Set(current).add(failure.jobId));
          }}
        />
      ) : null}
    </section>
  );
}

/**
 * One action an agent asks to apply: what it does on this machine, the values it would send, whether it could be
 * sent now, and Approve or Decline. The decision is recorded on the host through the person's own session, then the
 * chat is answered; the paused tool sends exactly this intent once.
 *
 * @param properties - The person's machines client, the control, the pending action and the bridge.
 * @returns The card.
 */
function ActionApproval({
  client,
  control,
  pending,
  bridge,
}: {
  readonly client: MachineClient;
  readonly control: MachineControl;
  readonly pending: PendingMachineAction;
  readonly bridge: MachineApprovalBridge;
}): React.JSX.Element {
  const { entry } = control;
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string>();
  const now = useNow();
  const descriptor = declaredAction(entry, pending.componentId, pending.action);
  const parameters = Object.entries(pending.parameters);
  const check = checkMachineAction({
    entry,
    componentId: pending.componentId,
    action: pending.action,
    caller: 'agent',
    attended: false,
    now,
  });
  const answer = async (approved: boolean): Promise<void> => {
    setIsBusy(true);
    setError(undefined);
    try {
      await answerMachineAction({ client, pending, approved, respond: bridge.respond });
    } catch (error_) {
      setError(describePrintError(error_));
    } finally {
      setIsBusy(false);
    }
  };
  return (
    <section
      aria-label='Agent request'
      className='flex min-w-0 flex-col gap-2 rounded-lg border border-information/40 bg-card p-3'
    >
      <p className='flex min-w-0 items-center gap-2 text-sm'>
        <Bot aria-hidden className='size-4 shrink-0 text-information' />
        <span className='min-w-0'>The agent asks to: {pending.label}</span>
        <QualificationBadge descriptor={descriptor} />
      </p>
      {descriptor?.consequence === undefined && descriptor?.outcome === undefined ? null : (
        <p className='text-xs text-muted-foreground'>
          {[descriptor.consequence, descriptor.outcome === undefined ? undefined : describeOutcome(descriptor.outcome)]
            .filter(Boolean)
            .join(' ')}
        </p>
      )}
      {parameters.length === 0 ? null : (
        <dl aria-label='Parameters' className='flex flex-col gap-0.5'>
          {parameters.map(([name, value]) => {
            const title = formParameter(descriptor, name)?.['title'];
            return (
              <PrintRow key={name} label={typeof title === 'string' ? title : name}>
                {typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)}
              </PrintRow>
            );
          })}
        </dl>
      )}
      <p className='text-xs text-muted-foreground'>
        Approving sends exactly this action once, with these values, to {entry.name}. The agent cannot change it after
        you approve.
      </p>
      {check.status === 'unavailable' ? (
        <PrintNotice tone='warning' role='status'>
          {check.message}
        </PrintNotice>
      ) : null}
      {error ? <PrintNotice tone='error'>{error}</PrintNotice> : null}
      <div className='flex flex-wrap gap-2'>
        <Button
          type='button'
          size='sm'
          disabled={isBusy || check.status === 'unavailable'}
          onClick={() => {
            void answer(true);
          }}
        >
          Approve
        </Button>
        <Button
          type='button'
          size='sm'
          variant='outline'
          disabled={isBusy}
          onClick={() => {
            void answer(false);
          }}
        >
          Decline
        </Button>
      </div>
    </section>
  );
}

/**
 * Every machine action a paused agent waits on for this machine.
 *
 * @param properties - The person's machines client, the control and the chat bridge.
 * @returns The cards, or nothing.
 * @public
 */
export function ActionApprovals({
  client,
  control,
  bridge,
}: {
  readonly client: MachineClient;
  readonly control: MachineControl;
  readonly bridge: MachineApprovalBridge;
}): React.JSX.Element | undefined {
  const pending = bridge.pendingActions(control.entry.machineId);
  if (pending.length === 0) {
    return undefined;
  }
  return (
    <>
      {pending.map((item) => (
        <ActionApproval
          key={item.approval.approvalId}
          client={client}
          control={control}
          pending={item}
          bridge={bridge}
        />
      ))}
    </>
  );
}
