import { ChartTooltipContent } from '@taucad/ui/components/chart';
import type { CustomTooltipProps } from '@taucad/ui/components/chart';
import { formatCredits } from '#utils/credits.utils.js';

/** Format server atom values without rounding the chart's geometry. */
export function CreditUsageTooltip(props: CustomTooltipProps): React.JSX.Element | undefined {
  return (
    <ChartTooltipContent
      {...props}
      formatter={(options) => {
        if (typeof options !== 'object' || !('item' in options)) {
          return undefined;
        }
        const entry: unknown = options.item.payload;
        if (
          typeof entry !== 'object' ||
          entry === null ||
          !('creditAtoms' in entry) ||
          typeof entry.creditAtoms !== 'string'
        ) {
          return undefined;
        }
        return <span className='font-medium tabular-nums'>{formatCredits(BigInt(entry.creditAtoms))} used</span>;
      }}
    />
  );
}
