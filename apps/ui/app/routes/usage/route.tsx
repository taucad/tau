import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Clock, Filter, RefreshCw, X } from 'lucide-react';
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
import { ToggleGroup, ToggleGroupItem } from '@taucad/ui/components/toggle-group';
import { useAllUsage } from '#hooks/use-all-usage.js';
import { UsageBarChart } from '#routes/usage/charts/usage-bar-chart.js';
import { UsageLineChart } from '#routes/usage/charts/usage-line-chart.js';
import { UsagePieChart } from '#routes/usage/charts/usage-pie-chart.js';
import { UsageStackedChart } from '#routes/usage/charts/usage-stacked-chart.js';
import type { TimeBucket } from '#routes/usage/time-bucket.utils.js';
import { UsageSummaryCards } from '#routes/usage/usage-summary-cards.js';
import { UsageTable } from '#routes/usage/usage-table.js';
import { useUsageFilters } from '#routes/usage/use-usage-filters.js';
import type { Handle } from '#types/matches.types.js';

const timeBucketOptions: Array<{ value: TimeBucket; label: string }> = [
  { value: '5m', label: '5M' },
  { value: '1h', label: '1H' },
  { value: '6h', label: '6H' },
  { value: '1d', label: '1D' },
];

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

export default function UsageDashboard(): React.JSX.Element {
  const { records: allRecords, isLoading, error, refetch } = useAllUsage();
  const [timeBucket, setTimeBucket] = useState<TimeBucket>('1d');
  const {
    filters,
    setDateRange,
    setModels,
    setProviders,
    setProjects,
    clearFilters,
    applyFilters,
    availableModels,
    availableProviders,
    availableProjects,
  } = useUsageFilters(allRecords);

  // Apply filters to get filtered records
  const filteredRecords = useMemo(() => applyFilters(allRecords), [applyFilters, allRecords]);

  // Check if any dropdown filters are active (excludes date range which is always set)
  const hasActiveFilters = useMemo(
    () => filters.models.length > 0 || filters.providers.length > 0 || filters.projects.length > 0,
    [filters.models, filters.providers, filters.projects],
  );

  const handleModelToggle = (model: string): void => {
    const newModels = filters.models.includes(model)
      ? filters.models.filter((m) => m !== model)
      : [...filters.models, model];
    setModels(newModels);
  };

  const handleProviderToggle = (provider: string): void => {
    const newProviders = filters.providers.includes(provider)
      ? filters.providers.filter((p) => p !== provider)
      : [...filters.providers, provider];
    setProviders(newProviders);
  };

  const handleProjectToggle = (projectId: string): void => {
    const newProjects = filters.projects.includes(projectId)
      ? filters.projects.filter((p) => p !== projectId)
      : [...filters.projects, projectId];
    setProjects(newProjects);
  };

  if (isLoading) {
    return (
      <div className='container flex h-full flex-col items-center justify-center gap-4 px-4 py-8'>
        <Loader className='size-8' />
        <p className='text-muted-foreground'>Loading usage data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className='container flex h-full flex-col items-center justify-center gap-4 px-4 py-8'>
        <p className='text-destructive'>Error loading usage data: {error.message}</p>
      </div>
    );
  }

  return (
    <div className='container mx-auto space-y-6 px-4 py-8'>
      {/* Header */}
      <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h1 className='text-3xl font-bold'>Usage Dashboard</h1>
          <p className='mt-1 text-muted-foreground'>Track AI model usage and costs across all your projects.</p>
        </div>
      </div>

      {/* Filters */}
      <div className='flex flex-wrap items-center gap-2'>
        <DateRangePicker withPresets value={filters.dateRange} onChange={setDateRange} />

        {/* Model Filter */}
        {availableModels.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='outline' className='gap-2'>
                <Filter className='size-3.5' />
                Models
                {filters.models.length > 0 ? (
                  <Badge variant='secondary' className='ml-1 rounded-full px-1.5 py-0.5 text-xs'>
                    {filters.models.length}
                  </Badge>
                ) : undefined}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='start' className='max-h-[300px] w-56 overflow-y-auto'>
              <DropdownMenuLabel>Filter by Model</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {availableModels.map((model) => (
                <DropdownMenuCheckboxItem
                  key={model}
                  checked={filters.models.includes(model)}
                  onSelect={(event) => {
                    event.preventDefault();
                  }}
                  onCheckedChange={() => {
                    handleModelToggle(model);
                  }}
                >
                  {model}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : undefined}

        {/* Provider Filter */}
        {availableProviders.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='outline' className='gap-2'>
                <Filter className='size-3.5' />
                Providers
                {filters.providers.length > 0 ? (
                  <Badge variant='secondary' className='ml-1 rounded-full px-1.5 py-0.5 text-xs'>
                    {filters.providers.length}
                  </Badge>
                ) : undefined}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='start' className='w-56'>
              <DropdownMenuLabel>Filter by Provider</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {availableProviders.map((provider) => (
                <DropdownMenuCheckboxItem
                  key={provider}
                  checked={filters.providers.includes(provider)}
                  onSelect={(event) => {
                    event.preventDefault();
                  }}
                  onCheckedChange={() => {
                    handleProviderToggle(provider);
                  }}
                >
                  {provider}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : undefined}

        {/* Project Filter */}
        {availableProjects.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='outline' className='gap-2'>
                <Filter className='size-3.5' />
                Projects
                {filters.projects.length > 0 ? (
                  <Badge variant='secondary' className='ml-1 rounded-full px-1.5 py-0.5 text-xs'>
                    {filters.projects.length}
                  </Badge>
                ) : undefined}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='start' className='max-h-[300px] w-56 overflow-y-auto'>
              <DropdownMenuLabel>Filter by Project</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {availableProjects.map((project) => (
                <DropdownMenuCheckboxItem
                  key={project.id}
                  checked={filters.projects.includes(project.id)}
                  onSelect={(event) => {
                    event.preventDefault();
                  }}
                  onCheckedChange={() => {
                    handleProjectToggle(project.id);
                  }}
                >
                  <span className='max-w-[180px] truncate'>{project.name}</span>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : undefined}

        {/* Clear Filters */}
        {hasActiveFilters ? (
          <Button variant='ghost' size='sm' className='gap-2' onClick={clearFilters}>
            <X className='size-3.5' />
            Clear filters
          </Button>
        ) : undefined}

        {/* Time Bucket Toggle */}
        <div className='ml-auto flex items-center gap-2'>
          <Clock className='size-3.5 text-muted-foreground' />
          <ToggleGroup
            type='single'
            variant='outline'
            value={timeBucket}
            size='sm'
            onValueChange={(value) => {
              if (value) {
                setTimeBucket(value as TimeBucket);
              }
            }}
          >
            {timeBucketOptions.map((option) => (
              <ToggleGroupItem key={option.value} value={option.value} aria-label={`${option.value} bucket`}>
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          {/* Refresh Button */}
          <Button variant='outline' size='sm' className='gap-2' onClick={refetch}>
            <RefreshCw className='size-3.5' />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <UsageSummaryCards records={filteredRecords} />

      {/* Charts Grid */}
      <div className='grid gap-4 lg:grid-cols-2'>
        <UsageLineChart records={filteredRecords} timeBucket={timeBucket} description='Cost trend' />
        <UsageBarChart records={filteredRecords} description='Top models by cost' />
        <UsageStackedChart records={filteredRecords} timeBucket={timeBucket} description='Token composition' />
        <UsagePieChart records={filteredRecords} description='Cost distribution by provider' />
      </div>

      {/* Data Table */}
      <UsageTable records={filteredRecords} description='Detailed usage records' height={500} />
    </div>
  );
}
