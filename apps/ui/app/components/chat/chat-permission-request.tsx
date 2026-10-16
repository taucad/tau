import { machinesDisabledMessage } from '@taucad/types/constants';
import { useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, CircleX, ShieldQuestion, TriangleAlert } from 'lucide-react';
import { isRecord } from '@taucad/utils/schema';
import { Button } from '@taucad/ui/components/button';
import { Loader } from '@taucad/ui/components/loader';
import { cn } from '@taucad/ui/utils/cn';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import type { ProviderPermissionResolution } from '@taucad/agent-host/wire';
import type { AgentHostApproval } from '#services/agent-host-event-projection.js';
import { useFeature } from '#flags/use-feature.js';

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;

const tauPermissionTitles = new Map<string, string>([
  ['evaluate_model', 'Render model'],
  ['test_model', 'Run tests'],
  ['screenshot', 'Capture screenshots'],
  ['export_model', 'Export model'],
  ['arrange_workbench', 'Arrange workbench'],
  ['get_parameters', 'Read parameters'],
  ['apply_parameter_operation', 'Change parameters'],
  ['list_machines', 'List machines'],
  ['get_machine', 'Inspect machine'],
  ['machine_action', 'Control machine'],
  ['stop_machine', 'Stop machine'],
  ['get_print_profiles', 'Read print profiles'],
  ['request_job', 'Request job'],
  ['check_job', 'Check job'],
  ['ask_questions', 'Ask questions'],
]);

/** Human request facts; full provider prose and arguments remain available in Debug. */
export function permissionContent(approval: AgentHostApproval): {
  title: string;
  facts: ReadonlyArray<readonly [string, string]>;
  consequence: string | undefined;
} {
  const input = isRecord(approval.request?.input) ? approval.request.input : undefined;
  const args = isRecord(input?.['arguments']) ? input['arguments'] : input;
  const tool = text(input?.['tool']);
  const suppliedTitle = text(args?.['title']) ?? text(approval.request?.title);
  // Older hosts embedded serialized arguments in prose; never present that payload as a title.
  const prompt = approval.prompt.split(/ with (?=[{[])/u)[0] ?? approval.prompt;
  const isOpaque = /^Allow (?:call_|elicitation:)/u.test(prompt);
  const rawTitle = suppliedTitle ?? (isOpaque ? 'Permission requested · action not described' : prompt);
  const tauName = /^(?:tau__|mcp__tau__)([a-z_]+)$/u.exec(rawTitle)?.[1];
  const title = (tauName === undefined ? undefined : tauPermissionTitles.get(tauName)) ?? rawTitle;
  const facts: Array<[string, string]> = [];
  for (const [label, value] of [
    ['Command', args?.['command'] ?? args?.['cmd']],
    ['Directory', args?.['cwd'] ?? args?.['workdir']],
    ['File', approval.context?.fileName ?? args?.['fileName'] ?? args?.['targetFile'] ?? args?.['file']],
    ['Destination', args?.['destination']],
    ['Recipient', args?.['taskId'] ?? args?.['recipient']],
    ['Message', tool === 'task_send' ? args?.['text'] : undefined],
  ] as const) {
    const valueText = text(value);
    if (valueText !== undefined) {
      facts.push([label, valueText]);
    }
  }
  return {
    title,
    facts,
    consequence:
      approval.context?.machineId === undefined
        ? isOpaque
          ? 'Ask the agent to describe this action before allowing it.'
          : undefined
        : approval.context.jobId === undefined
          ? 'This changes the machine. Review the action before allowing it.'
          : 'Review the job and confirm the work area is clear in the Print pane.',
  };
}

/** Keep exact approval content inspectable without letting provider prose fill the transcript. */
function PermissionContent({
  title,
  facts,
}: Pick<ReturnType<typeof permissionContent>, 'title' | 'facts'>): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const hasDetails = facts.length > 0 || title.length > 160 || /[\r\n]/u.test(title);
  const firstLine = title.split(/[\r\n]/u)[0] ?? title;
  const preview = firstLine.slice(0, 160);
  const visibleFacts = facts.filter(([label, value]) => label !== 'Command' || !title.includes(value));
  return (
    <div className='min-w-0'>
      <p className={cn('text-sm/5 font-medium [overflow-wrap:anywhere]', hasDetails && 'line-clamp-2')}>
        {hasDetails && preview !== title ? `${preview}…` : title}
      </p>
      {hasDetails ? (
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <Button size='xs' variant='ghost' className='group/request mt-1 -ml-1 gap-1 text-muted-foreground'>
              <ChevronRight aria-hidden className='size-3 shrink-0 group-data-[state=open]/request:rotate-90' />
              {isOpen ? 'Hide request' : 'View request'}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div
              role='region'
              aria-label='Request content'
              // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the scrollable request must be keyboard reachable (WCAG 2.1.1)
              tabIndex={0}
              className='mt-2 max-h-48 overflow-auto overscroll-contain rounded-md border bg-muted/30 p-2 text-xs/5 outline-none focus-visible:focus-outline'
            >
              <p className='font-mono [overflow-wrap:anywhere] whitespace-pre-wrap'>{title}</p>
              {visibleFacts.length > 0 ? (
                <dl className='mt-2 space-y-2'>
                  {visibleFacts.map(([label, value]) => (
                    <div key={label} className='min-w-0'>
                      <dt className='text-muted-foreground'>{label}</dt>
                      <dd className='font-mono [overflow-wrap:anywhere] whitespace-pre-wrap'>{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}

/** Read-back describes observed provider settings, not proof of a newly durable write. */
const permissionStatus = ({
  approval,
  outcome,
  resolution,
  name,
}: {
  readonly approval: AgentHostApproval;
  readonly outcome: string | undefined;
  readonly resolution: ProviderPermissionResolution | undefined;
  readonly name: string;
}): string => {
  if (approval.providerPermission && (outcome === 'approved' || outcome === 'denied')) {
    const selected = approval.providerPermission.options.find((option) => option.optionId === resolution?.optionId);
    if (outcome === 'approved') {
      const observation = resolution?.observation;
      if (selected?.requestedScope === 'persistent' && observation?.optionId === selected.optionId) {
        if (observation.stored === 'present' && observation.effective === 'allowed') {
          return `Allowed in ${name} settings when checked`;
        }
        if (observation.stored === 'present' && observation.effective === 'overridden') {
          return `Preference found · overridden when checked`;
        }
        if (observation.stored === 'present') {
          return 'Preference found · approval unverified';
        }
        if (observation.stored === 'absent') {
          return `Preference not found in ${name} settings`;
        }
        return `Response recorded · saving unverified`;
      }
      if (selected?.requestedScope === 'once') {
        return 'Allowed once · response recorded';
      }
      if (selected?.requestedScope === 'session') {
        return 'Session approval requested';
      }
    } else if (selected?.requestedScope === 'once') {
      return 'Denied · response recorded';
    }
    return 'Response recorded · saving unverified';
  }
  return outcome === 'approved'
    ? 'Request allowed'
    : outcome === 'denied'
      ? 'Request denied'
      : outcome === 'cancelled'
        ? 'Request cancelled'
        : 'Request closed';
};

type ChatPermissionRequestProps = {
  readonly approval: AgentHostApproval;
  readonly name: string;
  readonly outcome?: string | undefined;
  readonly resolution?: ProviderPermissionResolution | undefined;
  readonly onReview?: (() => void) | undefined;
  readonly onRespond?: ((approved: boolean, optionId?: string) => Promise<void>) | undefined;
};

/** Compact permission surface; acknowledgement never claims that the operation completed. */
export function ChatPermissionRequest(props: ChatPermissionRequestProps): React.JSX.Element {
  return <PermissionRequest key={props.approval.interruptId} {...props} />;
}

function PermissionRequest({
  approval,
  name,
  outcome: legacyOutcome,
  resolution,
  onRespond,
  onReview,
}: ChatPermissionRequestProps): React.JSX.Element {
  const outcome = resolution?.outcome ?? legacyOutcome;
  const isDebug = useFeature('tauDebug');
  const machinesEnabled = useFeature('machines');
  const machineDisabled = !machinesEnabled && approval.context?.machineId !== undefined;
  const [pendingResponse, setPendingResponse] = useState<string | boolean>();
  const isSending = outcome === undefined && pendingResponse !== undefined;
  const [failure, setFailure] = useState<string>();
  const sending = useRef(false);
  const content = permissionContent(approval);
  const focused = approval.options.find((option) => option.kind === 'allow_once');
  const respond = async (approved: boolean, optionId?: string): Promise<void> => {
    if (sending.current || !onRespond) {
      return;
    }
    sending.current = true;
    setPendingResponse(optionId ?? approved);
    setFailure(undefined);
    try {
      await onRespond(approved, optionId);
      // Keep actions disabled until the durable resolution removes this request.
    } catch (error) {
      sending.current = false;
      setPendingResponse(undefined);
      setFailure(error instanceof Error ? error.message : 'The host did not accept that decision.');
    }
  };
  const isSettled = outcome !== undefined;
  const status = permissionStatus({ approval, outcome, resolution, name });
  const StatusIcon = outcome === 'approved' ? Check : CircleX;
  return (
    <section
      aria-label={isSettled ? status : 'Approval required'}
      className='mb-2 flex min-w-0 flex-col gap-2 rounded-lg border bg-background p-2'
    >
      <div className='flex min-w-0 items-center gap-2 text-xs/5 text-muted-foreground'>
        <ShieldQuestion aria-hidden className='size-4 shrink-0' />
        <span className='min-w-0 wrap-break-word'>{name} · Permission</span>
      </div>
      {isSettled ? (
        <p className='flex items-center gap-2 text-xs/5'>
          <StatusIcon aria-hidden className='size-4 shrink-0' />
          {status}
        </p>
      ) : null}
      <PermissionContent title={content.title} facts={content.facts} />
      {!isSettled && approval.providerPermission?.unsupportedReason === 'unconfigured-mcp-server' ? (
        <p className='text-xs/5 text-muted-foreground'>
          This temporary connection supports approval for this request or session.
        </p>
      ) : null}
      {!isSettled && (machineDisabled || content.consequence) ? (
        <p className='flex items-start gap-2 text-xs/5'>
          <TriangleAlert aria-hidden className='size-4 shrink-0 text-warning' />
          {machineDisabled ? machinesDisabledMessage : content.consequence}
        </p>
      ) : null}
      {isDebug ? (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button size='xs' variant='ghost' className='group/details'>
              Request details
              <ChevronDown aria-hidden className='size-3 group-data-[state=open]/details:rotate-180' />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className='max-h-60 overflow-auto text-xs/5 break-all whitespace-pre-wrap'>
              {JSON.stringify(
                {
                  prompt: approval.prompt,
                  request: approval.request,
                  context: approval.context,
                  options: approval.options,
                },
                null,
                2,
              )}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
      {failure && !isSettled ? (
        <p role='alert' className='text-xs/5'>
          Couldn&apos;t send your response. Try again.{isDebug ? ` ${failure}` : ''}
        </p>
      ) : null}
      {isSending ? (
        <p role='status' className='text-xs/5 text-muted-foreground'>
          Sending response…
        </p>
      ) : null}
      {!isSettled && onRespond ? (
        <div className='flex flex-wrap gap-2'>
          {machineDisabled ? (
            <Button
              size='xs'
              variant='outline'
              disabled={isSending}
              aria-busy={isSending && pendingResponse === false}
              onClick={() => {
                void respond(false);
              }}
            >
              Deny
              {isSending && pendingResponse === false ? <Loader className='motion-reduce:animate-none' /> : null}
            </Button>
          ) : onReview ? (
            <>
              <Button size='xs' disabled={isSending} onClick={onReview}>
                Review in the Print pane
              </Button>
              <Button
                size='xs'
                variant='outline'
                disabled={isSending}
                aria-busy={isSending && pendingResponse === false}
                onClick={() => {
                  void respond(false);
                }}
              >
                Deny
                {isSending && pendingResponse === false ? <Loader className='motion-reduce:animate-none' /> : null}
              </Button>
            </>
          ) : approval.options.length > 0 ? (
            approval.options.map((option) => (
              <Button
                key={option.optionId}
                size='xs'
                className='h-auto min-h-6 max-w-full text-left [overflow-wrap:anywhere] whitespace-normal'
                variant={option.optionId === focused?.optionId ? 'default' : 'outline'}
                autoFocus={option.optionId === focused?.optionId}
                disabled={isSending}
                aria-busy={isSending && pendingResponse === option.optionId}
                onClick={() => {
                  void respond(option.kind?.startsWith('allow') ?? true, option.optionId);
                }}
              >
                {option.name}
                {isSending && pendingResponse === option.optionId ? (
                  <Loader className='motion-reduce:animate-none' />
                ) : null}
              </Button>
            ))
          ) : (
            <>
              <Button
                size='xs'
                autoFocus
                disabled={isSending}
                aria-busy={isSending && pendingResponse === true}
                onClick={() => {
                  void respond(true);
                }}
              >
                Approve
                {isSending && pendingResponse === true ? <Loader className='motion-reduce:animate-none' /> : null}
              </Button>
              <Button
                size='xs'
                variant='outline'
                disabled={isSending}
                aria-busy={isSending && pendingResponse === false}
                onClick={() => {
                  void respond(false);
                }}
              >
                Deny
                {isSending && pendingResponse === false ? <Loader className='motion-reduce:animate-none' /> : null}
              </Button>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
