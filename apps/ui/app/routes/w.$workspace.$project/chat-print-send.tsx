import { useCallback, useRef, useState } from 'react';
import { Bot, Check, Eye, LoaderCircle, Play, SearchCheck, ShieldCheck, X } from 'lucide-react';
import type {
  MachineClient,
  MachineDirectoryEntry,
  MachineManifest,
  MachineOperationSnapshot,
  PrintRequest,
} from '@taucad/runtime/machine';
import { Button } from '@taucad/ui/components/button';
import { Checkbox } from '@taucad/ui/components/checkbox';
import { Label } from '@taucad/ui/components/label';
import { randomUuid } from '@taucad/utils/id';
import { isRecord } from '@taucad/utils/schema';
import type { PrintApprovalBridge } from '#hooks/use-machines-approvals.js';
import { isOpenPrintRequest } from '#hooks/use-machines-print-requests.js';
import { useProject } from '#hooks/use-project.js';
import { PrintNotice, PrintSteps, operator } from '#routes/w.$workspace.$project/chat-print-section.js';
import type { PrintStep } from '#routes/w.$workspace.$project/chat-print-section.js';
import {
  formatDuration,
  formatProducer,
  formatQuantity,
  materialSlotPlace,
  shortDigest,
} from '#routes/w.$workspace.$project/chat-print-summary.js';

/**
 * Why the real Bambu printer will not take a file, in the person's words (blueprint P3).
 * @public
 */
export const bambuStudioRequired =
  'This printer only accepts files sliced by Bambu Studio, which was not found at its default install location. Install Bambu Studio and use the Tau desktop app.';

/**
 * What to do when the printer refuses an unsigned command, in the person's words.
 * @public
 */
export const developerModeRequired =
  'The printer refused an unsigned command. On the printer, turn on LAN Only mode and Developer Mode, then send again.';

const unqualifiedCode = 'ARTIFACT_UNQUALIFIED';

/** The X1C's reason when it refuses a command it cannot verify; Developer Mode being off is the likely cause. */
const unsignedCommandReason = 'mqtt message verify failed';

/**
 * A refusal as the pane shows it: the host's message, except that a file the
 * printer refuses for its producer says how to slice one it accepts, and an
 * unsigned-command refusal keeps the printer's reason and adds how to allow it.
 *
 * @param code - The refusal code, when there is one.
 * @param message - The host's message.
 * @returns Plain copy.
 * @public
 */
export const describePrintFailure = (code: string | undefined, message: string): string => {
  if (code === unqualifiedCode) {
    return bambuStudioRequired;
  }
  return message.trim().toLowerCase() === unsignedCommandReason ? `${message}. ${developerModeRequired}` : message;
};

/**
 * A thrown request failure as the pane shows it, mapped like {@link describePrintFailure}.
 *
 * @param error - What a machine client call rejected with.
 * @returns Plain copy.
 * @public
 */
export const describePrintError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  const code = isRecord(error) && typeof error['code'] === 'string' ? error['code'] : undefined;
  return describePrintFailure(code ?? (message.includes(unqualifiedCode) ? unqualifiedCode : undefined), message);
};

/** One physical fact the person confirms before a start. @public */
export type StartConfirmation = Readonly<{ id: 'plate' | 'material' | 'nozzle'; label: string }>;

type MaterialMapping = Readonly<{ slot: number; materialId: string }>;

const isMaterialMapping = (value: unknown): value is MaterialMapping =>
  isRecord(value) && typeof value['slot'] === 'number' && typeof value['materialId'] === 'string';

const expectedMaterials = (configuration: unknown): readonly MaterialMapping[] => {
  const record = isRecord(configuration) ? configuration : {};
  const materials = record['expectedMaterials'];
  return Array.isArray(materials)
    ? materials.filter((candidate): candidate is MaterialMapping => isMaterialMapping(candidate))
    : [];
};

/**
 * The three confirmations every start asks for (coordinator ruling D12): the
 * plate is clear, the material is loaded, the nozzle matches. Read from the
 * request's submission configuration so an agent's request asks exactly what
 * it will send, falling back to what the machine reports. Every mapped slot
 * is named, by material: "PLA is loaded in A2 and A1", or "PETG is loaded on the external spool".
 *
 * @param configuration - The submission configuration the request carries.
 * @param entry - The machine as observed.
 * @param manifest - The machine's manifest, for plate labels and slot names.
 * @returns Plate, material and nozzle confirmations, in that order.
 * @public
 */
export const describeStartConfirmations = (
  configuration: unknown,
  entry: MachineDirectoryEntry,
  manifest: MachineManifest | undefined,
): readonly StartConfirmation[] => {
  const record = isRecord(configuration) ? configuration : {};
  const plateId =
    typeof record['expectedBedType'] === 'string' ? record['expectedBedType'] : entry.snapshot.setup.bedType;
  const plate =
    plateId === undefined
      ? undefined
      : (manifest?.bed.plates.find(({ id }) => id === plateId)?.label ?? `${plateId} plate`);
  const listFormat = new Intl.ListFormat('en', { type: 'conjunction' });
  const fallback = entry.snapshot.setup.materials.find(
    (candidate): candidate is MaterialMapping & { state: 'loaded' } =>
      candidate.state === 'loaded' && candidate.materialId !== undefined,
  );
  const expected = expectedMaterials(configuration);
  const materials = expected.length > 0 ? expected : fallback === undefined ? [] : [fallback];
  /* Slots by material, in the order the print names them. */
  const slotsByMaterial = new Map<string, number[]>();
  for (const { slot, materialId } of materials) {
    slotsByMaterial.set(materialId, [...(slotsByMaterial.get(materialId) ?? []), slot]);
  }
  const loaded = [...slotsByMaterial].map(
    ([materialId, slots], index) =>
      `${materialId}${index === 0 ? ' is loaded' : ''} ${materialSlotPlace(slots, manifest)}`,
  );
  const nozzleValue = record['expectedNozzleDiameter'];
  const nozzle =
    typeof nozzleValue === 'number' ? { value: nozzleValue, unit: 'mm' } : manifest?.toolhead.nozzles[0]?.diameter;
  return [
    {
      id: 'plate',
      label:
        plate === undefined ? 'The build plate is clear' : `The build plate is clear and the ${plate} is installed`,
    },
    {
      id: 'material',
      label: loaded.length === 0 ? 'The material this print expects is loaded' : listFormat.format(loaded),
    },
    {
      id: 'nozzle',
      label: nozzle === undefined ? 'The nozzle matches this print' : `A ${formatQuantity(nozzle)} nozzle is installed`,
    },
  ];
};

/**
 * Why the observed material system cannot serve a request, or nothing when it can.
 * A mismatch disables sending and accepting, never slicing (coordinator ruling 4).
 *
 * @param configuration - The submission configuration with its expected materials.
 * @param entry - The machine as observed.
 * @param manifest - The machine's manifest, for slot names.
 * @returns The first mismatch in the person's words.
 * @public
 */
export const materialMismatch = (
  configuration: unknown,
  entry: MachineDirectoryEntry,
  manifest: MachineManifest | undefined,
): string | undefined => {
  for (const { slot, materialId } of expectedMaterials(configuration)) {
    const observed = entry.snapshot.setup.materials.find((candidate) => candidate.slot === slot);
    if (observed?.state !== 'loaded' || (observed.materialId !== undefined && observed.materialId !== materialId)) {
      const loaded =
        observed?.state === 'loaded' && observed.materialId !== undefined ? ` (${observed.materialId} is)` : '';
      return `${materialId} is not loaded ${materialSlotPlace([slot], manifest)}${loaded}.`;
    }
  }
  return undefined;
};

/** Run states in which the machine is working on a run and cannot take another start. */
const activeRunStates: ReadonlySet<string> = new Set(['preparing', 'printing', 'finishing']);

/**
 * Why the machine cannot take a physical start right now, or nothing when it
 * can. Send in Prepare and Accept on a request both start a print, so both wait
 * for the same facts: a current observation, no run in progress, a machine that
 * reports ready, and the material the request expects loaded.
 *
 * @param configuration - The submission configuration with its expected materials.
 * @param entry - The machine as observed.
 * @param manifest - The machine's manifest, for slot names.
 * @returns The first blocker in the person's words.
 * @public
 */
export const startBlocker = (
  configuration: unknown,
  entry: MachineDirectoryEntry,
  manifest: MachineManifest | undefined,
): string | undefined => {
  const { name } = entry;
  if (entry.freshness !== 'current' || entry.snapshot.connection !== 'connected') {
    return `Wait for a current observation from ${name} before starting.`;
  }
  const { run, readiness, activeRunId } = entry.snapshot;
  if (run?.state === 'paused') {
    return `${name} has a paused run. Resume or cancel it before starting another print.`;
  }
  if (activeRunId !== undefined || (run !== undefined && activeRunStates.has(run.state))) {
    return `${name} has a run in progress. Start another print once it ends.`;
  }
  if (readiness !== 'idle') {
    return `${name} is ${readiness === 'busy' ? 'busy' : 'not ready'}. Wait until it reports ready.`;
  }
  return materialMismatch(configuration, entry, manifest);
};

/**
 * The approval question in the tool's own words: "Print pyramid.gcode.3mf on
 * Workshop X1C? 125 layers, about 42 min." (coordinator ruling 10).
 *
 * @param request - The request to describe.
 * @param machineName - The machine it targets.
 * @returns The prompt.
 * @public
 */
export const describeApprovalPrompt = (request: PrintRequest, machineName: string): string => {
  const facts = [
    request.summary.layers === undefined ? undefined : `${String(request.summary.layers)} layers`,
    request.summary.estimatedDuration === undefined ? undefined : formatDuration(request.summary.estimatedDuration),
  ].filter((fact) => fact !== undefined);
  return `Print ${request.summary.fileName} on ${machineName}?${facts.length === 0 ? '' : ` ${facts.join(', ')}.`}`;
};

/**
 * The one confirmation every physical start passes through: the exact artifact
 * digest and the three physical facts, then a single start button.
 *
 * @param properties - The digest, confirmations, blockers and the start action.
 * @returns The confirmation group.
 * @public
 */
export function StartConfirmationCard({
  digest,
  confirmations,
  machineName,
  blocker,
  isBusy,
  error,
  onConfirm,
  onBack,
}: {
  readonly digest: string;
  readonly confirmations: readonly StartConfirmation[];
  readonly machineName: string;
  readonly blocker: string | undefined;
  readonly isBusy: boolean;
  readonly error: string | undefined;
  readonly onConfirm: () => void;
  readonly onBack: () => void;
}): React.JSX.Element {
  const [confirmed, setConfirmed] = useState<ReadonlySet<StartConfirmation['id']>>(new Set());
  const isReady = blocker === undefined && confirmations.every(({ id }) => confirmed.has(id));
  const toggle = (id: StartConfirmation['id'], checked: boolean | 'indeterminate'): void => {
    setConfirmed((current) => {
      const next = new Set(current);
      if (checked === true) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };
  return (
    <div
      role='group'
      aria-label='Confirm before starting'
      className='flex min-w-0 flex-col gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3'
    >
      <p className='text-xs text-muted-foreground'>
        Artifact <span className='font-mono break-all text-foreground'>{digest}</span>
      </p>
      <fieldset className='flex min-w-0 flex-col gap-1.5'>
        <legend className='mb-1 text-xs text-muted-foreground'>Physical checks</legend>
        {confirmations.map(({ id, label }) => {
          const inputId = `print-confirm-${id}`;
          return (
            <div key={id} className='flex min-w-0 items-start gap-2'>
              <Checkbox
                id={inputId}
                checked={confirmed.has(id)}
                disabled={isBusy}
                onCheckedChange={(checked) => {
                  toggle(id, checked);
                }}
              />
              <Label htmlFor={inputId} className='min-w-0 text-xs leading-4 font-normal wrap-break-word'>
                {label}
              </Label>
            </div>
          );
        })}
      </fieldset>
      {blocker === undefined ? null : (
        <PrintNotice tone='warning' role='status'>
          {blocker}
        </PrintNotice>
      )}
      {error ? <PrintNotice tone='destructive'>{error}</PrintNotice> : null}
      <div className='flex flex-wrap gap-2'>
        <Button type='button' size='sm' disabled={isBusy || !isReady} onClick={onConfirm}>
          {isBusy ? (
            <LoaderCircle aria-hidden className='animate-spin motion-reduce:animate-none' />
          ) : (
            <Play aria-hidden />
          )}
          {`Start print on ${machineName}`}
        </Button>
        <Button type='button' size='sm' variant='outline' disabled={isBusy} onClick={onBack}>
          Back
        </Button>
      </div>
    </div>
  );
}

function ArtifactDetails({ request }: { readonly request: PrintRequest }): React.JSX.Element {
  return (
    <details className='text-xs text-muted-foreground'>
      <summary className='cursor-action select-none'>
        <span className='font-mono'>{shortDigest(request.artifact.digest)}</span>
      </summary>
      <dl className='mt-1 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-2 gap-y-0.5'>
        <dt>Digest</dt>
        <dd className='font-mono break-all'>{request.artifact.digest}</dd>
        <dt>Path</dt>
        <dd className='break-all'>{request.artifact.path}</dd>
        <dt>Request</dt>
        <dd className='font-mono break-all'>{request.requestId}</dd>
      </dl>
    </details>
  );
}

function ApprovalCard({
  request,
  entry,
  manifest,
  pendingPrompt,
  isBusy,
  error,
  onStart,
  onDecline,
  onPreview,
}: {
  readonly request: PrintRequest;
  readonly entry: MachineDirectoryEntry;
  readonly manifest: MachineManifest | undefined;
  /** The chat interrupt's own prompt when a run paused on this request. */
  readonly pendingPrompt: string | undefined;
  readonly isBusy: boolean;
  readonly error: string | undefined;
  readonly onStart: () => void;
  readonly onDecline: () => void;
  /** Open the recorded artifact in the printer viewer; absent for another project's request, whose files are not here. */
  readonly onPreview: (() => void) | undefined;
}): React.JSX.Element {
  const [isConfirming, setIsConfirming] = useState(false);
  const isAgent = request.requestedBy.kind === 'agent';
  const machineName = entry.name;
  const blocker = startBlocker(request.configuration, entry, manifest);

  return (
    <section
      // Distinct from the chat banner's "Approval required": this is one print request awaiting the person.
      aria-label={`Print request awaiting you: ${request.summary.fileName}`}
      className='flex min-w-0 flex-col gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3'
    >
      <div className='flex min-w-0 items-start gap-2'>
        {isAgent ? (
          <Bot aria-hidden className='mt-0.5 size-4 shrink-0 text-warning' />
        ) : (
          <ShieldCheck aria-hidden className='mt-0.5 size-4 shrink-0 text-warning' />
        )}
        <div className='min-w-0 flex-1'>
          <h4 className='text-sm font-medium'>
            {/* Only a Tau turn pauses on a chat interrupt; any other agent is named on the line below. */}
            {isAgent
              ? pendingPrompt === undefined
                ? 'Waiting for your approval'
                : 'Tau is waiting for approval'
              : 'Ready to start'}
          </h4>
          <p className='text-xs'>{pendingPrompt ?? describeApprovalPrompt(request, machineName)}</p>
          <p className='text-xs text-muted-foreground'>Requested by {request.requestedBy.label}</p>
          {request.summary.producer ? (
            <p className='text-xs text-muted-foreground'>Sliced by {formatProducer(request.summary.producer)}</p>
          ) : null}
        </div>
      </div>
      {isConfirming ? (
        <StartConfirmationCard
          digest={request.artifact.digest}
          confirmations={describeStartConfirmations(request.configuration, entry, manifest)}
          machineName={machineName}
          blocker={blocker}
          isBusy={isBusy}
          error={error}
          onConfirm={onStart}
          onBack={() => {
            setIsConfirming(false);
          }}
        />
      ) : (
        <>
          {blocker === undefined ? null : (
            <PrintNotice tone='warning' role='status'>
              {blocker}
            </PrintNotice>
          )}
          {error ? <PrintNotice tone='destructive'>{error}</PrintNotice> : null}
          {/* The decision and its evidence on one row; the digest is in Inspect. */}
          <div className='flex flex-wrap items-center gap-2'>
            <Button
              type='button'
              size='sm'
              disabled={isBusy}
              onClick={() => {
                setIsConfirming(true);
              }}
            >
              <Check aria-hidden />
              {isAgent ? 'Accept' : 'Start'}
            </Button>
            <Button type='button' size='sm' variant='outline' disabled={isBusy} onClick={onDecline}>
              {isBusy ? (
                <LoaderCircle aria-hidden className='animate-spin motion-reduce:animate-none' />
              ) : (
                <X aria-hidden />
              )}
              {isAgent ? 'Deny' : 'Cancel request'}
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
        </>
      )}
      {pendingPrompt === undefined ? null : (
        <p className='text-xs text-muted-foreground'>Answering here also answers the chat.</p>
      )}
    </section>
  );
}

const stepStates = (request: PrintRequest): readonly PrintStep[] => {
  const order = ['preparing', 'approved', 'uploading', 'starting', 'confirming'] as const;
  const position = order.indexOf(request.state as (typeof order)[number]);
  const step = (at: number): 'done' | 'active' | 'todo' =>
    position > at ? 'done' : position === at ? 'active' : 'todo';
  return [
    { label: 'Preflight', state: position >= 1 || request.prepared !== undefined ? 'done' : 'active' },
    { label: 'Upload', state: step(2) },
    { label: 'Start', state: step(3) },
    { label: 'Confirm', state: step(4) },
  ];
};

/**
 * One send in flight: what the host is doing now, and the steps from preflight to the printer's confirmation.
 *
 * @param props - The request and its machine.
 * @param props.request - The request in flight.
 * @param props.entry - The machine it is sent to.
 * @returns The card.
 * @public
 */
export function ProgressCard({
  request,
  entry,
}: {
  readonly request: PrintRequest;
  readonly entry: MachineDirectoryEntry;
}): React.JSX.Element {
  const label =
    request.state === 'preparing'
      ? `Checking ${request.summary.fileName} against ${entry.name}…`
      : request.state === 'uploading'
        ? `Uploading ${request.summary.fileName} to ${entry.name}…`
        : request.state === 'starting'
          ? `Starting on ${entry.name}…`
          : request.state === 'confirming'
            ? `Waiting for ${entry.name} to confirm the start…`
            : `Sending ${request.summary.fileName} to ${entry.name}…`;
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
      <PrintSteps steps={stepStates(request)} />
      {request.state === 'confirming' ? (
        <p className='text-xs text-muted-foreground'>
          The start was sent. Tau confirms it from the printer&apos;s own status, usually within a minute; nothing more
          is sent.
        </p>
      ) : null}
    </div>
  );
}

/**
 * A start the printer has not proven for the whole confirmation window. Tau keeps checking the printer's reports, so
 * this card clears itself when the run shows up; "Check again" runs the same check at once. Nothing is resent.
 *
 * @param props - The request and the last manual check.
 * @param props.request - The unconfirmed request.
 * @param props.isBusy - Whether a check is running.
 * @param props.reconciled - The last manual check's result, if any.
 * @param props.error - Why the last check failed, if it did.
 * @param props.onReconcile - Run the check now.
 * @returns The card.
 * @public
 */
export function UnknownCard({
  request,
  isBusy,
  reconciled,
  error,
  onReconcile,
}: {
  readonly request: PrintRequest;
  readonly isBusy: boolean;
  readonly reconciled: MachineOperationSnapshot | undefined;
  readonly error: string | undefined;
  readonly onReconcile: () => void;
}): React.JSX.Element {
  return (
    <div role='alert' className='flex min-w-0 flex-col gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3'>
      <p className='text-sm font-medium'>The printer hasn&apos;t confirmed the start of {request.summary.fileName}.</p>
      <p className='text-xs text-muted-foreground'>
        Check the printer&apos;s screen. Tau keeps watching and moves this to the Monitor as soon as the printer reports
        the run. Nothing is resent.
      </p>
      <ArtifactDetails request={request} />
      {reconciled ? (
        <p className='text-xs' role='status'>
          {reconciled.status === 'unknown' ? 'Still not confirmed by the printer' : `Checked: ${reconciled.status}`}
          {reconciled.receipt?.status === 'accepted' &&
          reconciled.receipt.kind !== 'upload' &&
          reconciled.receipt.providerRunId
            ? ` · run ${reconciled.receipt.providerRunId}`
            : ''}
        </p>
      ) : null}
      {error ? <PrintNotice tone='destructive'>{error}</PrintNotice> : null}
      <div>
        <Button type='button' size='sm' variant='outline' disabled={isBusy} onClick={onReconcile}>
          {isBusy ? (
            <LoaderCircle aria-hidden className='animate-spin motion-reduce:animate-none' />
          ) : (
            <SearchCheck aria-hidden />
          )}
          Check again
        </Button>
      </div>
    </div>
  );
}

/**
 * A request that ended without printing: the printer refused the start, or the host refused the request first.
 *
 * @param props - The request and its dismissal.
 * @param props.request - The rejected or failed request.
 * @param props.onDismiss - Hide the card.
 * @returns The card.
 * @public
 */
export function FailureCard({
  request,
  onDismiss,
}: {
  readonly request: PrintRequest;
  readonly onDismiss: () => void;
}): React.JSX.Element {
  const failure =
    request.failure ??
    (request.receipt?.status === 'rejected'
      ? { code: request.receipt.code, message: request.receipt.message }
      : undefined);
  return (
    <PrintNotice tone='destructive'>
      <p className='font-medium'>
        {request.state === 'rejected'
          ? 'The printer rejected the start'
          : 'The request was refused before anything was sent'}
        {failure ? ` (${failure.code})` : ''}
      </p>
      {failure ? <p>{describePrintFailure(failure.code, failure.message)}</p> : null}
      <p className='text-muted-foreground'>{request.summary.fileName}. Slice and send again to prepare a new print.</p>
      <Button type='button' size='xs' variant='outline' className='mt-1' onClick={onDismiss}>
        Dismiss
      </Button>
    </PrintNotice>
  );
}

/**
 * Send: every request that still needs the person or the host, and the last
 * failure until it is dismissed. Hidden until there is one.
 *
 * @param properties - The client, machine, requests and the chat bridge.
 * @returns The section, or nothing while no request is open.
 * @public
 */
export function SendSection({
  client,
  entry,
  manifest,
  requests,
  bridge,
  onReconciled,
  ref,
}: {
  readonly client: MachineClient;
  readonly entry: MachineDirectoryEntry;
  readonly manifest: MachineManifest | undefined;
  readonly requests: readonly PrintRequest[];
  readonly bridge: PrintApprovalBridge;
  readonly onReconciled: (snapshot: MachineOperationSnapshot) => void;
  readonly ref?: React.Ref<HTMLElement>;
}): React.JSX.Element | undefined {
  const [busyRequestId, setBusyRequestId] = useState<string>();
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [reconciled, setReconciled] = useState<Readonly<Record<string, MachineOperationSnapshot>>>({});
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const { projectId, editorRef } = useProject();
  const operationIdsRef = useRef(
    new Map<string, { readonly uploadOperationId: string; readonly startOperationId: string }>(),
  );

  const run = useCallback(async (request: PrintRequest, action: () => Promise<void>): Promise<void> => {
    setBusyRequestId(request.requestId);
    setErrors((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== request.requestId)));
    try {
      await action();
    } catch (error) {
      setErrors((current) => ({
        ...current,
        [request.requestId]: describePrintError(error),
      }));
    } finally {
      setBusyRequestId(undefined);
    }
  }, []);

  const start = useCallback(
    async (request: PrintRequest): Promise<void> =>
      run(request, async () => {
        const pending = bridge.pendingFor(request);
        if (pending) {
          await bridge.respond(pending.approvalId, true);
          return;
        }
        const ids = operationIdsRef.current.get(request.requestId) ?? {
          uploadOperationId: randomUuid(),
          startOperationId: randomUuid(),
        };
        operationIdsRef.current.set(request.requestId, ids);
        await client.resolvePrintRequest({
          requestId: request.requestId,
          decision: 'approve',
          resolvedBy: operator,
          ...ids,
        });
      }),
    [bridge, client, run],
  );

  const decline = useCallback(
    async (request: PrintRequest): Promise<void> =>
      run(request, async () => {
        const pending = bridge.pendingFor(request);
        if (pending) {
          await bridge.respond(pending.approvalId, false);
          return;
        }
        await (request.requestedBy.kind === 'agent'
          ? client.resolvePrintRequest({ requestId: request.requestId, decision: 'deny', resolvedBy: operator })
          : client.withdrawPrintRequest({ requestId: request.requestId, resolvedBy: operator }));
      }),
    [bridge, client, run],
  );

  const reconcile = useCallback(
    async (request: PrintRequest): Promise<void> =>
      run(request, async () => {
        const operationId = request.startOperationId ?? request.uploadOperationId;
        if (operationId === undefined) {
          throw new Error('This request has no operation to reconcile.');
        }
        const snapshot = await client.reconcileOperation({ machineId: request.machineId, operationId });
        setReconciled((current) => ({ ...current, [request.requestId]: snapshot }));
        onReconciled(snapshot);
      }),
    [client, onReconciled, run],
  );

  // The same open request the Prepare step sends for a fresh slice, pointed at the recorded artifact.
  const preview = useCallback(
    (request: PrintRequest): void => {
      editorRef.send({ type: 'openFile', path: request.artifact.path, source: 'user' });
    },
    [editorRef],
  );

  const open = requests.filter((request) => isOpenPrintRequest(request));
  const latest = requests[0];
  const failure =
    open.length === 0 &&
    latest &&
    (latest.state === 'rejected' || latest.state === 'failed') &&
    !dismissed.has(latest.requestId)
      ? latest
      : undefined;
  if (open.length === 0 && failure === undefined) {
    return undefined;
  }

  return (
    // The cards carry their own headings; a "Send" heading above them would repeat the decision.
    <section
      ref={ref}
      aria-label='Send'
      tabIndex={-1}
      className='flex min-w-0 flex-col gap-2 outline-none focus-visible:focus-outline'
    >
      {open.map((request) => {
        const isBusy = busyRequestId === request.requestId;
        const error = errors[request.requestId];
        if (request.state === 'awaiting-approval') {
          return (
            <ApprovalCard
              key={request.requestId}
              request={request}
              entry={entry}
              manifest={manifest}
              pendingPrompt={bridge.pendingFor(request)?.prompt}
              isBusy={isBusy}
              error={error}
              onStart={() => {
                void start(request);
              }}
              onDecline={() => {
                void decline(request);
              }}
              onPreview={
                /* The path is this project's to open only when the artifact is (blueprint D5). */
                request.artifact.projectId === projectId
                  ? () => {
                      preview(request);
                    }
                  : undefined
              }
            />
          );
        }
        if (request.state === 'unknown') {
          return (
            <UnknownCard
              key={request.requestId}
              request={request}
              isBusy={isBusy}
              reconciled={reconciled[request.requestId]}
              error={error}
              onReconcile={() => {
                void reconcile(request);
              }}
            />
          );
        }
        return <ProgressCard key={request.requestId} request={request} entry={entry} />;
      })}
      {failure ? (
        <FailureCard
          request={failure}
          onDismiss={() => {
            setDismissed((current) => new Set(current).add(failure.requestId));
          }}
        />
      ) : null}
    </section>
  );
}
