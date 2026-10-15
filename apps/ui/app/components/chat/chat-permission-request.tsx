import { machinesDisabledMessage } from '@taucad/types/constants';
import { useRef, useState } from 'react';
import { Check, ChevronDown, CircleX, ShieldQuestion, TriangleAlert } from 'lucide-react';
import { isRecord } from '@taucad/utils/schema';
import { Button } from '@taucad/ui/components/button';
import { Loader } from '@taucad/ui/components/loader';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import type { ProviderPermissionResolution } from '@taucad/agent-host/wire';
import type { AgentHostApproval } from '#services/agent-host-event-projection.js';
import { useFeature } from '#flags/use-feature.js';

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;

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
  const title = suppliedTitle ?? (isOpaque ? 'Permission requested · action not described' : prompt);
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
          return `Allowed in ${name} settings`;
        }
        if (observation.stored === 'present' && observation.effective === 'overridden') {
          return `Preference found · another ${name} rule takes precedence`;
        }
        if (observation.stored === 'present') {
          return 'Preference found · effective approval not confirmed';
        }
        if (observation.stored === 'absent') {
          return `Not found in ${name} settings · future requests may ask again`;
        }
        return `Response recorded · ${name} saving could not be checked`;
      }
      if (selected?.requestedScope === 'once') {
        return 'Allowed once · response recorded';
      }
      if (selected?.requestedScope === 'session') {
        return 'Session approval requested · response recorded';
      }
    } else if (selected?.requestedScope === 'once') {
      return 'Denied · response recorded';
    }
    return 'Response recorded · provider saving unverified';
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
      <p className='text-sm/5 font-medium [overflow-wrap:anywhere] wrap-break-word'>{content.title}</p>
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
      {!isSettled && content.facts.length > 0 ? (
        <dl className='space-y-1 text-xs/5'>
          {content.facts.map(([label, value]) => (
            <div key={label} className='min-w-0'>
              <dt className='text-muted-foreground'>{label}</dt>
              <dd className='[overflow-wrap:anywhere] wrap-break-word whitespace-pre-wrap'>{value}</dd>
            </div>
          ))}
        </dl>
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
          Your response was not saved. Try again.{isDebug ? ` ${failure}` : ''}
        </p>
      ) : null}
      {isSending ? (
        <p role='status' className='text-xs/5 text-muted-foreground'>
          Saving response · waiting for confirmation
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
