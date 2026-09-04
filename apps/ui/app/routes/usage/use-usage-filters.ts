import { useState, useMemo, useCallback } from 'react';
import type { DateRange } from 'react-day-picker';
import { subDays, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import type { UsageRecord } from '@taucad/billing/usage';

export type UsageFilters = {
  dateRange: DateRange | undefined;
  models: string[];
  providers: string[];
  projects: string[];
};

type UseUsageFiltersReturn = {
  filters: UsageFilters;
  setDateRange: (range: DateRange | undefined) => void;
  setModels: (models: string[]) => void;
  setProviders: (providers: string[]) => void;
  setProjects: (projects: string[]) => void;
  clearFilters: () => void;
  applyFilters: (records: UsageRecord[]) => UsageRecord[];
  availableModels: string[];
  availableProviders: string[];
  availableProjects: Array<{ id: string; name: string }>;
};

const defaultDateRange: DateRange = {
  from: subDays(new Date(), 30),
  to: new Date(),
};

/**
 * Hook to manage usage filter state and apply filters to usage records.
 */
export function useUsageFilters(records: UsageRecord[]): UseUsageFiltersReturn {
  const [dateRange, setDateRange] = useState<DateRange | undefined>(defaultDateRange);
  const [models, setModels] = useState<string[]>([]);
  const [providers, setProviders] = useState<string[]>([]);
  const [projects, setProjects] = useState<string[]>([]);

  // Extract available filter options from records
  const availableModels = useMemo(() => {
    const modelSet = new Set<string>();
    for (const record of records) {
      modelSet.add(record.modelName);
    }

    return [...modelSet].sort();
  }, [records]);

  const availableProviders = useMemo(() => {
    const providerSet = new Set<string>();
    for (const record of records) {
      providerSet.add(record.provider);
    }

    return [...providerSet].sort();
  }, [records]);

  const availableProjects = useMemo(() => {
    const projectMap = new Map<string, string>();
    for (const record of records) {
      projectMap.set(record.projectId, record.projectName);
    }

    return [...projectMap.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [records]);

  const clearFilters = useCallback(() => {
    setDateRange(defaultDateRange);
    setModels([]);
    setProviders([]);
    setProjects([]);
  }, []);

  const applyFilters = useCallback(
    (inputRecords: UsageRecord[]): UsageRecord[] => {
      return inputRecords.filter((record) => {
        // Date range filter
        if (dateRange?.from && dateRange.to) {
          const recordDate = record.date;
          const isInRange = isWithinInterval(recordDate, {
            start: startOfDay(dateRange.from),
            end: endOfDay(dateRange.to),
          });
          if (!isInRange) {
            return false;
          }
        }

        // Model filter
        if (models.length > 0 && !models.includes(record.modelName)) {
          return false;
        }

        // Provider filter
        if (providers.length > 0 && !providers.includes(record.provider)) {
          return false;
        }

        // Project filter
        if (projects.length > 0 && !projects.includes(record.projectId)) {
          return false;
        }

        return true;
      });
    },
    [dateRange, models, providers, projects],
  );

  const filters: UsageFilters = useMemo(
    () => ({
      dateRange,
      models,
      providers,
      projects,
    }),
    [dateRange, models, providers, projects],
  );

  return {
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
  };
}
