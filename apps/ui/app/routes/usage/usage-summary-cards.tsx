import { useMemo } from 'react';
import { DollarSign, Coins, Bot, Folder } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card.js';
import { formatCurrency } from '#utils/currency.utils.js';
import { formatNumberAbbreviation } from '#utils/number.utils.js';
import type { UsageRecord } from '#hooks/use-all-usage.js';

type UsageSummaryCardsProps = {
  readonly records: UsageRecord[];
};

type SummaryStats = {
  totalCost: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  uniqueModels: number;
  uniqueProjects: number;
};

function calculateStats(records: UsageRecord[]): SummaryStats {
  const modelSet = new Set<string>();
  const projectSet = new Set<string>();

  let totalCost = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheTokens = 0;

  for (const record of records) {
    totalCost += record.totalCost;
    inputTokens += record.inputTokens;
    outputTokens += record.outputTokens;
    cacheTokens += record.cacheReadTokens + record.cacheWriteTokens;
    modelSet.add(record.model);
    projectSet.add(record.projectId);
  }

  return {
    totalCost,
    totalTokens: inputTokens + outputTokens + cacheTokens,
    inputTokens,
    outputTokens,
    cacheTokens,
    uniqueModels: modelSet.size,
    uniqueProjects: projectSet.size,
  };
}

export function UsageSummaryCards({ records }: UsageSummaryCardsProps): React.JSX.Element {
  const stats = useMemo(() => calculateStats(records), [records]);

  return (
    <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
          <CardTitle className='text-sm font-medium'>Total Cost</CardTitle>
          <DollarSign className='size-4 text-muted-foreground' />
        </CardHeader>
        <CardContent>
          <div className='text-2xl font-bold'>
            {formatCurrency(stats.totalCost, { significantFigures: 3, minDecimalPlaces: 3 })}
          </div>
          <p className='text-xs text-muted-foreground'>
            From {records.length} usage {records.length === 1 ? 'record' : 'records'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
          <CardTitle className='text-sm font-medium'>Total Tokens</CardTitle>
          <Coins className='size-4 text-muted-foreground' />
        </CardHeader>
        <CardContent>
          <div className='text-2xl font-bold'>{formatNumberAbbreviation(stats.totalTokens)}</div>
          <p className='text-xs text-muted-foreground'>
            {formatNumberAbbreviation(stats.inputTokens + stats.cacheTokens)} in /{' '}
            {formatNumberAbbreviation(stats.outputTokens)} out
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
          <CardTitle className='text-sm font-medium'>Models Used</CardTitle>
          <Bot className='size-4 text-muted-foreground' />
        </CardHeader>
        <CardContent>
          <div className='text-2xl font-bold'>{stats.uniqueModels}</div>
          <p className='text-xs text-muted-foreground'>Unique AI models</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
          <CardTitle className='text-sm font-medium'>Projects</CardTitle>
          <Folder className='size-4 text-muted-foreground' />
        </CardHeader>
        <CardContent>
          <div className='text-2xl font-bold'>{stats.uniqueProjects}</div>
          <p className='text-xs text-muted-foreground'>Projects with usage</p>
        </CardContent>
      </Card>
    </div>
  );
}
