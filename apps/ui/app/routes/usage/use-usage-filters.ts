import { useCallback, useMemo, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { addDays, format } from 'date-fns';
import type { FinancialActivityKind, WireUsageSnapshot } from '@taucad/billing';
import type { UsageSnapshotQuery } from '@taucad/billing/hooks/use-usage-snapshot';

/** Every normalized activity the server can report, in presentation order. */
export const usageActivityKinds: readonly FinancialActivityKind[] = [
  'agent',
  'compaction',
  'summary',
  'title',
  'commit',
  'completion',
  'other',
];

export type UsageFilters = {
  /** Inclusive calendar range the reader picked; `undefined` keeps the last 30 days. */
  dateRange: DateRange | undefined;
  models: string[];
  activities: FinancialActivityKind[];
  projects: string[];
};

type UseUsageFiltersReturn = {
  filters: UsageFilters;
  /** Canonical request for `GET /v1/billing/usage`. */
  query: UsageSnapshotQuery;
  setDateRange: (range: DateRange | undefined) => void;
  toggleModel: (model: string) => void;
  toggleActivity: (activity: FinancialActivityKind) => void;
  toggleProject: (project: string) => void;
  clearFilters: () => void;
  hasActiveFilters: boolean;
};

const calendarDate = (value: Date): string => format(value, 'yyyy-MM-dd');
const toggle = <T>(values: readonly T[], value: T): T[] =>
  values.includes(value) ? values.filter((item) => item !== value) : [...values, value];

/**
 * Holds the canonical usage query. Filters are request state, not a local
 * filter over downloaded rows — the server owns range totals and grouping.
 */
export function useUsageFilters(): UseUsageFiltersReturn {
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [models, setModels] = useState<string[]>([]);
  const [activities, setActivities] = useState<FinancialActivityKind[]>([]);
  const [projects, setProjects] = useState<string[]>([]);

  const clearFilters = useCallback(() => {
    setDateRange(undefined);
    setModels([]);
    setActivities([]);
    setProjects([]);
  }, []);

  const filters = useMemo(
    () => ({ dateRange, models, activities, projects }),
    [dateRange, models, activities, projects],
  );

  const query = useMemo((): UsageSnapshotQuery => {
    // The wire `toDate` is exclusive, so an inclusive picked end day is sent as the next day.
    const custom =
      dateRange?.from && dateRange.to
        ? { startDate: calendarDate(dateRange.from), endDate: calendarDate(addDays(dateRange.to, 1)) }
        : undefined;
    return {
      range: custom ? 'custom' : 'last_30_days',
      ...custom,
      timezone: new Intl.DateTimeFormat().resolvedOptions().timeZone,
      models,
      activities,
      projects,
    };
  }, [dateRange, models, activities, projects]);

  return {
    filters,
    query,
    setDateRange,
    toggleModel: useCallback((model: string) => {
      setModels((current) => toggle(current, model));
    }, []),
    toggleActivity: useCallback((activity: FinancialActivityKind) => {
      setActivities((current) => toggle(current, activity));
    }, []),
    toggleProject: useCallback((project: string) => {
      setProjects((current) => toggle(current, project));
    }, []),
    clearFilters,
    hasActiveFilters: models.length > 0 || activities.length > 0 || projects.length > 0,
  };
}

/**
 * Filter options come from the snapshot the server returned. Selected values
 * are always offered so a filter that no longer has usage can be cleared.
 */
export function usageFilterOptions(
  snapshot: WireUsageSnapshot | undefined,
  filters: UsageFilters,
): { models: Array<{ id: string; label: string }>; projects: string[] } {
  const models = new Map<string, string>(filters.models.map((id) => [id, id]));
  for (const item of snapshot?.models?.items ?? []) {
    models.set(item.modelId, item.modelDisplayName ?? item.modelId);
  }
  const projects = new Set<string>(filters.projects);
  for (const row of snapshot?.rows?.items ?? []) {
    if (row.activity.projectHint !== null) {
      projects.add(row.activity.projectHint);
    }
  }
  return {
    models: [...models].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label)),
    projects: [...projects].sort((a, b) => a.localeCompare(b)),
  };
}
