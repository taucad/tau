import React, { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@taucad/ui/components/chart';
import type { ChartConfig } from '@taucad/ui/components/chart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@taucad/ui/components/card';
import { formatCurrency } from '#utils/currency.utils.js';
import type { UsageRecord } from '@taucad/billing/usage';
import type { TimeBucket } from '#routes/usage/time-bucket.utils.js';
import { formatBucketLabel, getBucketInterval, getBucketKey, roundToBucket } from '#routes/usage/time-bucket.utils.js';

type UsageLineChartProps = {
  readonly records: UsageRecord[];
  readonly title?: string;
  readonly description?: string;
  readonly timeBucket?: TimeBucket;
};

type BucketedData = {
  date: string;
  dateLabel: string;
  cost: number;
};

const chartConfig: ChartConfig = {
  cost: {
    label: 'Cost',
    color: 'var(--primary)',
  },
};

/**
 * Aggregate records by time bucket, filling in empty buckets.
 */
function aggregateByBucket(records: UsageRecord[], bucket: TimeBucket): BucketedData[] {
  if (records.length === 0) {
    return [];
  }

  const bucketMap = new Map<string, number>();

  // Find the min and max dates
  let minDate = records[0]?.date ?? new Date();
  let maxDate = records[0]?.date ?? new Date();

  for (const record of records) {
    const bucketKey = getBucketKey(record.date, bucket);
    const currentCost = bucketMap.get(bucketKey) ?? 0;
    bucketMap.set(bucketKey, currentCost + record.totalCost);

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
  const result: BucketedData[] = [];
  let currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    const bucketKey = getBucketKey(currentDate, bucket);
    const cost = bucketMap.get(bucketKey) ?? 0;

    result.push({
      date: bucketKey,
      dateLabel: formatBucketLabel(bucketKey, bucket),
      cost,
    });

    currentDate = new Date(currentDate.getTime() + bucketInterval);
  }

  return result;
}

function UsageLineChartComponent({
  records,
  title = 'Cost Over Time',
  description,
  timeBucket = '1d',
}: UsageLineChartProps): React.JSX.Element {
  const chartData = useMemo(() => aggregateByBucket(records, timeBucket), [records, timeBucket]);

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
              tickFormatter={(value: number) => formatCurrency(value, { significantFigures: 1 })}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={60}
            />
            {/* @ts-expect-error - ChartTooltipContent types don't match Recharts exactly */}
            <ChartTooltip cursor={false} content={ChartTooltipContent} />
            <Bar dataKey='cost' fill='var(--color-cost)' radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

export const UsageLineChart = React.memo(UsageLineChartComponent);
