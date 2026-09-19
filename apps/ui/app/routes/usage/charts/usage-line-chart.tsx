import React, { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@taucad/ui/components/chart';
import type { ChartConfig } from '@taucad/ui/components/chart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@taucad/ui/components/card';
import type { WireUsageDayPage } from '@taucad/billing';
import { displayCredits } from '#routes/usage/credits.js';

type UsageLineChartProps = {
  /** Server day groups; the client never re-buckets rows into days. */
  readonly days: WireUsageDayPage['items'];
  readonly title?: string;
  readonly description?: string;
};

const chartConfig: ChartConfig = {
  credits: {
    label: 'Credits',
    color: 'var(--primary)',
  },
};

function UsageLineChartComponent({
  days,
  title = 'Credits over time',
  description,
}: UsageLineChartProps): React.JSX.Element {
  const chartData = useMemo(
    () =>
      [...days]
        .sort((a, b) => a.day.localeCompare(b.day))
        .map((item) => ({
          dateLabel: item.day === 'unknown' ? 'Not reported' : item.day,
          credits: displayCredits(item.netUsedCreditAtoms),
        })),
    [days],
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
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} accessibilityLayer>
            <CartesianGrid strokeDasharray='3 3' vertical={false} />
            <XAxis dataKey='dateLabel' tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis
              tickFormatter={(value: number) => `${value} cr`}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={60}
            />
            {/* @ts-expect-error - ChartTooltipContent types don't match Recharts exactly */}
            <ChartTooltip cursor={false} content={ChartTooltipContent} />
            <Bar dataKey='credits' fill='var(--color-credits)' radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

export const UsageLineChart = React.memo(UsageLineChartComponent);
