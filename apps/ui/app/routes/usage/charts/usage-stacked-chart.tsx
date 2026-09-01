import React, { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import type { ChartConfig } from '@taucad/ui/components/chart';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@taucad/ui/components/chart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@taucad/ui/components/card';
import { formatNumberAbbreviation } from '#utils/number.utils.js';
import type { UsageRecord } from '@taucad/billing/usage';
import type { TimeBucket } from '#routes/usage/time-bucket.utils.js';
import { formatBucketLabel, getBucketInterval, getBucketKey, roundToBucket } from '#routes/usage/time-bucket.utils.js';

type UsageStackedChartProps = {
  readonly records: UsageRecord[];
  readonly title?: string;
  readonly description?: string;
  readonly timeBucket?: TimeBucket;
};

type BucketedTokenData = {
  date: string;
  dateLabel: string;
  input: number;
  output: number;
  cache: number;
};

const chartConfig: ChartConfig = {
  input: {
    label: 'Input',
    color: 'var(--chart-1)',
  },
  output: {
    label: 'Output',
    color: 'var(--chart-2)',
  },
  cache: {
    label: 'Cache',
    color: 'var(--chart-3)',
  },
};

/**
 * Aggregate token types by time bucket, filling in empty buckets.
 */
function aggregateTokensByBucket(records: UsageRecord[], bucket: TimeBucket): BucketedTokenData[] {
  if (records.length === 0) {
    return [];
  }

  const bucketMap = new Map<string, { input: number; output: number; cache: number }>();

  // Find the min and max dates
  let minDate = records[0]?.date ?? new Date();
  let maxDate = records[0]?.date ?? new Date();

  for (const record of records) {
    const bucketKey = getBucketKey(record.date, bucket);
    const current = bucketMap.get(bucketKey) ?? { input: 0, output: 0, cache: 0 };
    bucketMap.set(bucketKey, {
      input: current.input + record.inputTokens,
      output: current.output + record.outputTokens,
      cache: current.cache + record.cacheReadTokens + record.cacheWriteTokens,
    });

    if (record.date < minDate) {
      minDate = record.date;
    }

    if (record.date > maxDate) {
      maxDate = record.date;
    }
  }

  // Round to bucket boundaries
  const startDate = roundToBucket(minDate, bucket);
  const endDate = roundToBucket(maxDate, bucket);

  // Generate all bucket keys between start and end
  const bucketInterval = getBucketInterval(bucket);
  const result: BucketedTokenData[] = [];
  let currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    const bucketKey = getBucketKey(currentDate, bucket);
    const tokens = bucketMap.get(bucketKey) ?? { input: 0, output: 0, cache: 0 };

    result.push({
      date: bucketKey,
      dateLabel: formatBucketLabel(bucketKey, bucket),
      ...tokens,
    });

    currentDate = new Date(currentDate.getTime() + bucketInterval);
  }

  return result;
}

function UsageStackedChartComponent({
  records,
  title = 'Token Usage Over Time',
  description,
  timeBucket = '1d',
}: UsageStackedChartProps): React.JSX.Element {
  const chartData = useMemo(() => aggregateTokensByBucket(records, timeBucket), [records, timeBucket]);

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
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray='3 3' vertical={false} />
            <XAxis dataKey='dateLabel' tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis
              tickFormatter={(value: number) => formatNumberAbbreviation(value)}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={60}
            />
            {/* @ts-expect-error - ChartTooltipContent types don't match Recharts exactly */}
            <ChartTooltip cursor={false} content={ChartTooltipContent} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey='cache' stackId='1' fill='var(--color-cache)' radius={[0, 0, 0, 0]} />
            <Bar dataKey='input' stackId='1' fill='var(--color-input)' radius={[0, 0, 0, 0]} />
            <Bar dataKey='output' stackId='1' fill='var(--color-output)' radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

export const UsageStackedChart = React.memo(UsageStackedChartComponent);
