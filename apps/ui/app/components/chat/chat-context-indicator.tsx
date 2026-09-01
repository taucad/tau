import type { ContextUsageData } from '@taucad/chat';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { formatNumberAbbreviation } from '#utils/number.utils.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';

const size = 28;
const strokeWidth = 4;
const radius = (size - strokeWidth) / 2;
const circumference = 2 * Math.PI * radius;

/** @public */
export function getFillColor(
  percent: number,
  status?: ContextUsageData['lastCompactionStatus'],
  scheduleStatus?: ContextUsageData['compactionScheduleStatus'],
): string {
  if (scheduleStatus === 'scheduled_next_turn') {
    return 'stroke-destructive';
  }
  if (status === 'compacted') {
    return 'stroke-success';
  }
  if (status === 'failed' || status === 'overflow_retry_succeeded') {
    return 'stroke-warning';
  }
  if (percent >= 85) {
    return 'stroke-destructive';
  }
  if (percent >= 60) {
    return 'stroke-warning';
  }
  return 'stroke-foreground/50';
}

/** @public */
export function getTrackColor(
  percent: number,
  status?: ContextUsageData['lastCompactionStatus'],
  scheduleStatus?: ContextUsageData['compactionScheduleStatus'],
): string {
  if (scheduleStatus === 'scheduled_next_turn') {
    return 'stroke-destructive/20';
  }
  if (status === 'compacted') {
    return 'stroke-success/20';
  }
  if (status === 'failed' || status === 'overflow_retry_succeeded') {
    return 'stroke-warning/20';
  }
  if (percent >= 85) {
    return 'stroke-destructive/20';
  }
  if (percent >= 60) {
    return 'stroke-warning/20';
  }
  return 'stroke-foreground/10';
}

/**
 * Pure SVG circular gauge icon for context usage.
 * Tooltip on hover shows percentage, token counts, and model.
 */
export function ChatContextIndicatorDisplay({ data }: { readonly data: ContextUsageData }): React.JSX.Element {
  const clamped = Math.min(data.percentUsed, 100);
  const offset = circumference - (clamped / 100) * circumference;
  const used = formatNumberAbbreviation(data.totalInputTokens);
  const total = formatNumberAbbreviation(data.contextWindow);
  const compactionStatus = formatCompactionStatus(data);
  const scheduledStatus = formatScheduledStatus(data);
  const triggerReason = formatTriggerReason(data.triggerReason);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className='flex size-5 cursor-default items-center justify-center'
          role='meter'
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label='Context usage'
        >
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className='-rotate-90'>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill='none'
              strokeWidth={strokeWidth}
              className={getTrackColor(data.percentUsed, data.lastCompactionStatus, data.compactionScheduleStatus)}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill='none'
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap='round'
              className={getFillColor(data.percentUsed, data.lastCompactionStatus, data.compactionScheduleStatus)}
              style={{ transition: 'stroke-dashoffset 300ms ease' }}
            />
          </svg>
        </div>
      </TooltipTrigger>
      <TooltipContent side='top' className='text-xs'>
        <p className='font-medium'>{data.percentUsed.toFixed(1)}% context used</p>
        <p className='opacity-70'>
          {used} / {total} tokens
        </p>
        {scheduledStatus ? <p className='opacity-70'>{scheduledStatus}</p> : null}
        {compactionStatus ? <p className='opacity-70'>{compactionStatus}</p> : null}
        {triggerReason ? <p className='opacity-70'>Trigger: {triggerReason}</p> : null}
      </TooltipContent>
    </Tooltip>
  );
}

function formatScheduledStatus(data: ContextUsageData): string | undefined {
  if (data.compactionScheduleStatus !== 'scheduled_next_turn') {
    return undefined;
  }
  return 'Compaction scheduled next turn';
}

function formatCompactionStatus(data: ContextUsageData): string | undefined {
  switch (data.lastCompactionStatus) {
    case 'compacted':
      return 'Context summarized';
    case 'failed':
      return 'Compaction blocked';
    case 'overflow_retry_succeeded':
      return 'Overflow retry trimmed context';
    case 'skipped':
    case undefined:
      return undefined;
    default:
      return undefined;
  }
}

function formatTriggerReason(reason: ContextUsageData['triggerReason']): string | undefined {
  switch (reason) {
    case 'estimate':
      return 'estimated budget';
    case 'previous_usage':
      return 'previous provider usage';
    case 'overflow':
      return 'provider overflow';
    case 'none':
    case undefined:
      return undefined;
    default:
      return undefined;
  }
}

/**
 * Connected component that reads the latest context-usage data from the
 * unified composer context and renders the indicator. Returns nothing when
 * no usage data is available — the composer provider always reports
 * `contextUsage: undefined` (no session, no message history), so the
 * indicator naturally collapses on marketing routes.
 */
export function ChatContextIndicator(): React.JSX.Element | undefined {
  const { contextUsage } = useChatComposer();
  if (!contextUsage) {
    return undefined;
  }
  return <ChatContextIndicatorDisplay data={contextUsage} />;
}
