import { useCallback, useMemo, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { addDays, format } from 'date-fns';
import type { FinancialActivityKind, WireUsageSnapshot } from '@taucad/billing';
import type { UsageSnapshotQuery } from '@taucad/billing/hooks/use-usage-snapshot';
import { unresolvedProjectName } from '#routes/usage/activity-names.js';
import type { ProjectNames } from '#routes/usage/activity-names.js';

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
  /** Selects or clears a whole filter option at once, which for unnamed projects is several ids. */
  toggleProjects: (projects: readonly string[]) => void;
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
    toggleProjects: useCallback((projects: readonly string[]) => {
      setProjects((current) =>
        projects.some((project) => current.includes(project))
          ? current.filter((project) => !projects.includes(project))
          : [...current, ...projects.filter((project) => !current.includes(project))],
      );
    }, []),
    clearFilters,
    hasActiveFilters: models.length > 0 || activities.length > 0 || projects.length > 0,
  };
}

/**
 * The single option standing for every project the listing did not name.
 *
 * Nothing stops a real hint from being this exact string — the read wire is
 * `z.string().min(1).max(256)` with no charset, and the charset that would
 * refuse it is enforced one service away, on the write path. So a hint equal to
 * this key is collapsed into the option rather than trusted to be impossible,
 * which keeps option ids unique by construction.
 */
export const unresolvedProjectsOption = 'unresolved projects';

/** One project checkbox, and the project ids selecting it filters by. */
export type ProjectFilterOption = { id: string; label: string; ids: readonly string[] };

/**
 * Filter options come from the snapshot the server returned. Selected values
 * are always offered so a filter that no longer has usage can be cleared.
 *
 * Projects a reader cannot be shown the name of become one option rather than
 * one each: identical checkboxes that each filtered to a different project were
 * indistinguishable, and there was no way to ask for all of them at once.
 *
 * No project option at all is offered until the listing has answered. Offering
 * the collapsed one earlier let a single click filter by every project the
 * account has, and the boxes were then all checked once the names landed.
 */
export function usageFilterOptions(
  snapshot: WireUsageSnapshot | undefined,
  filters: UsageFilters,
  projectNames: ProjectNames,
): { models: Array<{ id: string; label: string }>; projects: ProjectFilterOption[] } {
  const models = new Map<string, string>(filters.models.map((id) => [id, id]));
  for (const item of snapshot?.models?.items ?? []) {
    models.set(item.modelId, item.modelDisplayName ?? item.modelId);
  }
  const modelOptions = [...models].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  if (typeof projectNames === 'string') {
    return { models: modelOptions, projects: [] };
  }
  const projects = new Set<string>(filters.projects);
  for (const row of snapshot?.rows?.items ?? []) {
    if (row.activity.projectHint !== null) {
      projects.add(row.activity.projectHint);
    }
  }
  const named: ProjectFilterOption[] = [];
  const unresolved: string[] = [];
  for (const id of [...projects].sort((a, b) => a.localeCompare(b))) {
    const name = projectNames.get(id);
    // A hint that is the synthetic key itself collapses too, so two options can never share an id.
    if (name === undefined || id === unresolvedProjectsOption) {
      unresolved.push(id);
    } else {
      named.push({ id, label: name, ids: [id] });
    }
  }
  named.sort((a, b) => a.label.localeCompare(b.label));
  return {
    models: modelOptions,
    projects:
      unresolved.length === 0
        ? named
        : [...named, { id: unresolvedProjectsOption, label: unresolvedProjectName, ids: unresolved }],
  };
}
