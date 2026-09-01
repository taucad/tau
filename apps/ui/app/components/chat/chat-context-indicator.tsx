import type { ContextUsageData } from '@taucad/chat';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { formatNumberAbbreviation } from '#utils/number.utils.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';

const size = 28;
const strokeWidth = 4;
const radius = (size - strokeWidth) / 2;
const circumference = 2 * Math.PI * radius;

/** @public */
export function getFillColor(percent: number): string {
  if (percent >= 85) {
    return 'stroke-destructive';
  }
  if (percent >= 60) {
    return 'stroke-warning';
  }
  return 'stroke-foreground/50';
}

/** @public */
export function getTrackColor(percent: number): string {
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
              className={getTrackColor(data.percentUsed)}
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
              className={getFillColor(data.percentUsed)}
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
      </TooltipContent>
    </Tooltip>
  );
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
