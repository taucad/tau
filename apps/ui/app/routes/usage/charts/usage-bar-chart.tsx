import React, { useMemo } from 'react';
import { Bar, BarChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@taucad/ui/components/chart';
import type { ChartConfig } from '@taucad/ui/components/chart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@taucad/ui/components/card';
import type { WireUsageModelPage } from '@taucad/billing';
import { getUsageColor } from '#routes/usage/provider-colors.js';
import { displayCredits } from '#routes/usage/credits.js';

type UsageBarChartProps = {
  /** Server model groups for the whole range. */
  readonly models: WireUsageModelPage['items'];
  readonly title?: string;
  readonly description?: string;
  readonly maxBars?: number;
};

const chartConfig: ChartConfig = {
  credits: {
    label: 'Credits',
    color: 'var(--primary)',
  },
};

function UsageBarChartComponent({
  models,
  title = 'Credits by model',
  description,
  maxBars = 10,
}: UsageBarChartProps): React.JSX.Element {
  const chartData = useMemo(
    () =>
      [...models]
        .map((item) => ({
          model: item.modelDisplayName ?? item.modelId,
          credits: displayCredits(item.netUsedCreditAtoms),
          fill: getUsageColor(item.modelId),
        }))
        .sort((a, b) => b.credits - a.credits)
        .slice(0, maxBars),
    [models, maxBars],
  );

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : undefined}
        </CardHeader>
        <CardContent className='flex h-[300px] items-center justify-center'>
          <p className='text-sm text-muted-foreground'>No usage in this range</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className='min-w-0 overflow-hidden'>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : undefined}
      </CardHeader>
      <CardContent className='min-w-0'>
        <ChartContainer config={chartConfig} className='h-[300px] w-full min-w-0'>
          <BarChart data={chartData} layout='vertical' margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <XAxis type='number' tickFormatter={(value: number) => `${value} cr`} tickLine={false} axisLine={false} />
            <YAxis
              dataKey='model'
              type='category'
              tickLine={false}
              axisLine={false}
              width={120}
              tick={{ fontSize: 14 }}
            />
            {/* @ts-expect-error - ChartTooltipContent types don't match Recharts exactly */}
            <ChartTooltip cursor={false} content={ChartTooltipContent} />
            <Bar
              dataKey='credits'
              // Discard `radius` and `ref` props as they are not used and cause type errors
              shape={({ radius, ref, ...props }) => (
                <rect
                  {...props}
                  // oxlint-disable-next-line react/prop-types -- Recharts typing limitation
                  fill={(props.payload as { fill: string } | undefined)?.fill ?? 'var(--primary)'}
                  rx={8}
                  ry={8}
                />
              )}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

export const UsageBarChart = React.memo(UsageBarChartComponent);
