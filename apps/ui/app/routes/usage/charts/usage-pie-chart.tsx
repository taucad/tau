import React, { useMemo } from 'react';
import { Label, Pie, PieChart, Cell } from 'recharts';
import type { PieLabelRenderProps } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@taucad/ui/components/chart';
import type { ChartConfig } from '@taucad/ui/components/chart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@taucad/ui/components/card';
import { formatCurrency } from '#utils/currency.utils.js';
import type { UsageRecord } from '@taucad/billing/usage';
import { getProviderColor } from '#routes/usage/provider-colors.js';

// eslint-disable-next-line @typescript-eslint/naming-convention -- RADIAN is a constant
const RADIAN = Math.PI / 180;

/**
 * Custom label renderer for pie chart slices.
 */
function renderCustomLabel(props: PieLabelRenderProps): React.ReactElement | undefined {
  const { cx, cy, midAngle, outerRadius, percent, name } = props;

  // Don't render label for very small slices
  if (typeof percent === 'number' && percent < 0.05) {
    return undefined;
  }

  const cxNumber = Number(cx);
  const cyNumber = Number(cy);
  const outerRadiusNumber = Number(outerRadius);
  const midAngleNumber = Number(midAngle);

  const radius = outerRadiusNumber + 25;
  const x = cxNumber + radius * Math.cos(-midAngleNumber * RADIAN);
  const y = cyNumber + radius * Math.sin(-midAngleNumber * RADIAN);

  return (
    <text
      x={x}
      y={y}
      textAnchor={x > cxNumber ? 'start' : 'end'}
      dominantBaseline='central'
      className='fill-foreground text-xs font-medium'
    >
      {name}
    </text>
  );
}

type UsagePieChartProps = {
  readonly records: UsageRecord[];
  readonly title?: string;
  readonly description?: string;
};

type ProviderData = {
  provider: string;
  cost: number;
  fill: string;
};

/**
 * Aggregate cost by provider.
 */
function aggregateByProvider(records: UsageRecord[]): ProviderData[] {
  const providerMap = new Map<string, number>();

  for (const record of records) {
    const currentCost = providerMap.get(record.provider) ?? 0;
    providerMap.set(record.provider, currentCost + record.totalCost);
  }

  return [...providerMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([provider, cost]) => ({
      provider,
      cost,
      fill: getProviderColor(provider),
    }));
}

function UsagePieChartComponent({
  records,
  title = 'Cost by Provider',
  description,
}: UsagePieChartProps): React.JSX.Element {
  const chartData = useMemo(() => aggregateByProvider(records), [records]);
  const totalCost = useMemo(() => chartData.reduce((sum, item) => sum + item.cost, 0), [chartData]);

  const chartConfig: ChartConfig = useMemo(() => {
    const config: ChartConfig = {};
    for (const item of chartData) {
      config[item.provider] = {
        label: item.provider,
        color: item.fill,
      };
    }

    return config;
  }, [chartData]);

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
          <PieChart>
            {/* @ts-expect-error - ChartTooltipContent types don't match Recharts exactly */}
            <ChartTooltip cursor={false} content={ChartTooltipContent} />
            <Pie
              data={chartData}
              dataKey='cost'
              nameKey='provider'
              cx='50%'
              cy='50%'
              innerRadius='35%'
              outerRadius='55%'
              strokeWidth={2}
              label={renderCustomLabel}
              labelLine={{ stroke: 'var(--border)', strokeWidth: 1 }}
            >
              {chartData.map((entry) => (
                // oxlint-disable-next-line @typescript-eslint/no-deprecated -- todo: fix this
                <Cell key={entry.provider} fill={entry.fill} />
              ))}
              <Label
                content={({ viewBox }) => {
                  if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                    return (
                      <text x={viewBox.cx} y={viewBox.cy} textAnchor='middle' dominantBaseline='middle'>
                        <tspan x={viewBox.cx} y={viewBox.cy} className='fill-foreground text-xl font-bold'>
                          {formatCurrency(totalCost, { significantFigures: 3, minDecimalPlaces: 3 })}
                        </tspan>
                        <tspan x={viewBox.cx} y={viewBox.cy + 20} className='fill-muted-foreground text-xs'>
                          Total
                        </tspan>
                      </text>
                    );
                  }

                  return undefined;
                }}
              />
            </Pie>
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

export const UsagePieChart = React.memo(UsagePieChartComponent);
