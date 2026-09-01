import React, { useMemo } from 'react';
import { Bar, BarChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@taucad/ui/components/chart';
import type { ChartConfig } from '@taucad/ui/components/chart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@taucad/ui/components/card';
import { formatCurrency } from '#utils/currency.utils.js';
import type { UsageRecord } from '@taucad/billing/usage';
import { getModelColor } from '#routes/usage/provider-colors.js';

type UsageBarChartProps = {
  readonly records: UsageRecord[];
  readonly title?: string;
  readonly description?: string;
  readonly maxBars?: number;
};

type ModelData = {
  model: string;
  cost: number;
  fill: string;
};

const chartConfig: ChartConfig = {
  cost: {
    label: 'Cost',
    color: 'var(--primary)',
  },
};

/**
 * Aggregate records by model.
 */
function aggregateByModel(records: UsageRecord[], maxBars: number): ModelData[] {
  const modelMap = new Map<string, number>();

  for (const record of records) {
    const currentCost = modelMap.get(record.modelName) ?? 0;
    modelMap.set(record.modelName, currentCost + record.totalCost);
  }

  // Sort by cost descending and limit to maxBars
  return [...modelMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxBars)
    .map(([model, cost]) => ({ model, cost, fill: getModelColor(model) }));
}

function UsageBarChartComponent({
  records,
  title = 'Cost by Model',
  description,
  maxBars = 10,
}: UsageBarChartProps): React.JSX.Element {
  const chartData = useMemo(() => aggregateByModel(records, maxBars), [records, maxBars]);

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : undefined}
        </CardHeader>
        <CardContent className='flex h-[300px] items-center justify-center'>
          <p className='text-sm text-muted-foreground'>No data available</p>
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
            <XAxis
              type='number'
              tickFormatter={(value: number) => formatCurrency(value, { significantFigures: 1 })}
              tickLine={false}
              axisLine={false}
            />
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
              dataKey='cost'
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
