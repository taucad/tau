import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useProjectManager } from '#hooks/use-project-manager.js';
import type { AppUiPreferences } from '#types/storage.types.js';

export const appUiPreferencesQueryKey = ['app-ui-preferences'] as const;

type AppUiPreferencesResult = {
  readonly preferences: AppUiPreferences;
  readonly isProjectExpanded: (projectId: string, isActive: boolean) => boolean;
  readonly setProjectDisclosure: (
    projectId: string,
    expanded: boolean | undefined,
  ) => Promise<AppUiPreferences | undefined>;
  readonly isLoading: boolean;
  readonly error: Error | undefined;
};

/** Browser-local app chrome preferences backed by the existing object-store worker. */
export function useAppUiPreferences(): AppUiPreferencesResult {
  const queryClient = useQueryClient();
  const {
    getAppUiPreferences,
    setProjectDisclosure: setProjectDisclosureInManager,
    isLoading: isWorkerLoading,
  } = useProjectManager();
  const { data, isLoading, error } = useQuery({
    queryKey: appUiPreferencesQueryKey,
    queryFn: getAppUiPreferences,
    enabled: !isWorkerLoading,
  });
  const preferences: AppUiPreferences = data ?? { id: 'singleton', projectDisclosure: {} };

  const isProjectExpanded = useCallback(
    (projectId: string, isActive: boolean): boolean => preferences.projectDisclosure[projectId] ?? isActive,
    [preferences.projectDisclosure],
  );

  const setProjectDisclosure = useCallback(
    async (projectId: string, expanded: boolean | undefined): Promise<AppUiPreferences | undefined> => {
      const updated = await setProjectDisclosureInManager(projectId, expanded);
      if (updated) {
        void queryClient.invalidateQueries({ queryKey: appUiPreferencesQueryKey });
      }
      return updated;
    },
    [queryClient, setProjectDisclosureInManager],
  );

  return {
    preferences,
    isProjectExpanded,
    setProjectDisclosure,
    isLoading: isWorkerLoading || isLoading,
    error: error instanceof Error ? error : undefined,
  };
}
