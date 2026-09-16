import { useState } from 'react';
import { Link } from 'react-router';
import type { MetaFunction } from 'react-router';
import { Filter, RefreshCw, X } from 'lucide-react';
import { Badge } from '@taucad/ui/components/badge';
import { Button } from '@taucad/ui/components/button';
import { DateRangePicker } from '#components/ui/date-range-picker.js';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import { Loader } from '#components/ui/loader.js';
import { useCredits } from '@taucad/billing/hooks/use-credits';
import { useUsageSnapshot } from '@taucad/billing/hooks/use-usage-snapshot';
import type { UsageSnapshotResult } from '@taucad/billing/hooks/use-usage-snapshot';
import type { WireUsageSnapshot } from '@taucad/billing';
import { UsageBarChart } from '#routes/usage/charts/usage-bar-chart.js';
import { UsageLineChart } from '#routes/usage/charts/usage-line-chart.js';
import { UsagePieChart } from '#routes/usage/charts/usage-pie-chart.js';
import { ReservedTable } from '#routes/usage/reserved-table.js';
import { UsageSummaryCards } from '#routes/usage/usage-summary-cards.js';
import { UsageTable } from '#routes/usage/usage-table.js';
import { usageActivityKinds, usageFilterOptions, useUsageFilters } from '#routes/usage/use-usage-filters.js';
import { useBillingRevisionMinimum, usePersistSavedUsage, useSavedUsage } from '#db/billing-snapshot-store.js';
import type { SavedUsageOutcome } from '#db/billing-snapshot-store.js';
import type { Handle } from '#types/matches.types.js';

/**
 * The usage document is prerendered as a neutral offline shell (B5 R2), so it
 * is reachable without a session and must never be indexed. `robots.txt`
 * disallows crawling; only this meta tag keeps an already-known URL out of the
 * index.
 */
export const meta: MetaFunction = () => [{ title: 'Tau usage' }, { name: 'robots', content: 'noindex, nofollow' }];

export const handle: Handle = {
  breadcrumb() {
    return (
      <Button asChild variant='ghost'>
        <Link to='/usage'>Usage</Link>
      </Button>
    );
  },
  enableOverflowY: true,
};

const formatInstant = (value: string): string => new Date(value).toLocaleString();

/** The exclusive wire `toDate` is shown as the inclusive last day the reader picked. */
const appliedRange = (query: WireUsageSnapshot['query']): string => {
  if (query.fromDate === null || query.toDate === null) {
    return 'All time';
  }
  const lastDay = new Date(`${query.toDate}T00:00:00.000Z`);
  lastDay.setUTCDate(lastDay.getUTCDate() - 1);
  return `${query.fromDate} to ${lastDay.toISOString().slice(0, 10)} (${query.timeZone})`;
};

/**
 * Freshness and failure (B4 R6): every state is labelled, a failed read keeps
 * the last good snapshot, and nothing is ever rendered as zero usage.
 */
function UsageFreshness({
  usage,
  savedLabel,
  saveOutcome,
}: {
  readonly usage: UsageSnapshotResult;
  readonly savedLabel: string | undefined;
  readonly saveOutcome: SavedUsageOutcome | undefined;
}): React.JSX.Element {
  const labels: Record<UsageSnapshotResult['status'], string> = {
    'signed-out': 'Sign in to see your Tau usage.',
    loading: 'Loading your Tau usage…',
    refreshing: 'Refreshing…',
    ready: 'snapshot' in usage ? `Updated ${formatInstant(usage.snapshot.asOf)}` : '',
    'unable-to-refresh': 'Showing saved usage; unable to refresh',
    saved:
      'snapshot' in usage
        ? `Offline — saved usage for ${savedLabel ?? 'this account'}, last updated ${formatInstant(usage.snapshot.asOf)}. Reconnect for the latest usage.`
        : '',
    unavailable: 'No saved usage for this view',
  };
  const isFailed = usage.status === 'unable-to-refresh' || usage.status === 'unavailable';
  return (
    <div className='flex flex-wrap items-center gap-3 text-sm' data-testid='usage-freshness'>
      {usage.status === 'loading' ? <Loader className='size-4' /> : undefined}
      <span className={isFailed ? 'text-warning' : 'text-muted-foreground'}>{labels[usage.status]}</span>
      {isFailed ? (
        <Button variant='outline' size='sm' className='gap-2' onClick={usage.retry}>
          <RefreshCw className='size-3.5' />
          Retry
        </Button>
      ) : undefined}
      {saveOutcome === 'quota-exceeded' || saveOutcome === 'unavailable' ? (
        <span className='text-muted-foreground' data-testid='usage-offline-saving'>
          {saveOutcome === 'quota-exceeded'
            ? 'Not enough storage to keep this usage for offline viewing.'
            : 'Saving usage for offline viewing is unavailable on this device.'}
        </span>
      ) : undefined}
    </div>
  );
}

/** Filters are request state the server applies; offline there is nothing to re-request. */
const hidesFilters = (status: UsageSnapshotResult['status']): boolean => status === 'signed-out' || status === 'saved';

/** One canonical filter dimension; the server, not the table, applies it. */
function FilterMenu<Value extends string>({
  label,
  options,
  selected,
  onToggle,
}: {
  readonly label: string;
  readonly options: ReadonlyArray<{ id: Value; label: string }>;
  readonly selected: readonly Value[];
  readonly onToggle: (value: Value) => void;
}): React.JSX.Element | undefined {
  if (options.length === 0) {
    return undefined;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='outline' className='gap-2'>
          <Filter className='size-3.5' />
          {label}
          {selected.length > 0 ? (
            <Badge variant='secondary' className='ml-1 rounded-full px-1.5 py-0.5 text-xs'>
              {selected.length}
            </Badge>
          ) : undefined}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='start' className='max-h-[300px] w-56 overflow-y-auto'>
        <DropdownMenuLabel>Filter by {label.toLowerCase()}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.id}
            checked={selected.includes(option.id)}
            onSelect={(event) => {
              event.preventDefault();
            }}
            onCheckedChange={() => {
              onToggle(option.id);
            }}
          >
            <span className='max-w-[180px] truncate'>{option.label}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function UsagePage(): React.JSX.Element {
  const { filters, query, setDateRange, toggleModel, toggleActivity, toggleProject, clearFilters, hasActiveFilters } =
    useUsageFilters();
  const minimum = useBillingRevisionMinimum();
  const saved = useSavedUsage(query);
  const result = useUsageSnapshot(query, { minimum, saved: saved?.snapshot });
  const usage: UsageSnapshotResult =
    result.status === 'signed-out' && minimum !== undefined ? { status: 'unavailable', retry: result.retry } : result;
  const saveOutcome = usePersistSavedUsage(query, usage);
  const balance = useCredits(minimum);
  const [openEventId, setOpenEventId] = useState<string>();
  const snapshot = 'snapshot' in usage ? usage.snapshot : undefined;
  const options = usageFilterOptions(snapshot, filters);

  return (
    <div className='container mx-auto space-y-6 px-4 py-8'>
      <div className='flex flex-col gap-1'>
        <h1 className='text-3xl font-bold'>Tau usage</h1>
        <p className='text-muted-foreground'>
          Usage through the Tau LLM provider across your devices. Local and connected external providers are billed by
          them, not by Tau, and are not shown here.
        </p>
      </div>

      <UsageFreshness usage={usage} savedLabel={saved?.label} saveOutcome={saveOutcome} />

      {hidesFilters(usage.status) ? undefined : (
        <div className='flex flex-wrap items-center gap-2'>
          <DateRangePicker withPresets value={filters.dateRange} onChange={setDateRange} />
          <FilterMenu label='Models' options={options.models} selected={filters.models} onToggle={toggleModel} />
          <FilterMenu
            label='Activities'
            options={usageActivityKinds.map((activity) => ({ id: activity, label: activity }))}
            selected={filters.activities}
            onToggle={toggleActivity}
          />
          <FilterMenu
            label='Projects'
            options={options.projects.map((project) => ({ id: project, label: project }))}
            selected={filters.projects}
            onToggle={toggleProject}
          />
          {hasActiveFilters ? (
            <Button variant='ghost' size='sm' className='gap-2' onClick={clearFilters}>
              <X className='size-3.5' />
              Clear filters
            </Button>
          ) : undefined}
        </div>
      )}

      {snapshot ? (
        <>
          <p className='text-sm text-muted-foreground'>{appliedRange(snapshot.query)}</p>

          {snapshot.availability.state === 'available' ? undefined : (
            <p className='text-sm text-warning' data-testid='usage-availability'>
              {snapshot.availability.state === 'unavailable'
                ? 'Usage is unavailable for this view'
                : 'Partial usage for this view'}{' '}
              ({snapshot.availability.reason})
            </p>
          )}
          {snapshot.coverage.complete ? undefined : (
            <p className='text-sm text-muted-foreground'>
              Some earlier history is outside this account&apos;s recorded coverage.
            </p>
          )}

          <UsageSummaryCards snapshot={snapshot} balance={balance} />

          <ReservedTable />

          <div className='grid gap-4 lg:grid-cols-2'>
            <UsageLineChart days={snapshot.days?.items ?? []} description='Credits per day' />
            <UsageBarChart models={snapshot.models?.items ?? []} description='Top models by credits' />
            {snapshot.totals ? (
              <UsagePieChart
                activities={snapshot.activities?.items ?? []}
                totalCreditAtoms={snapshot.totals.netUsedCreditAtoms}
                description='Credits by activity'
              />
            ) : undefined}
          </div>

          <UsageTable
            rows={snapshot.rows?.items ?? []}
            hasMore={snapshot.rows?.complete === false}
            description='Select an action to see its credit explanation'
            openEventId={openEventId}
            onOpenEventChange={setOpenEventId}
          />
        </>
      ) : undefined}
    </div>
  );
}
