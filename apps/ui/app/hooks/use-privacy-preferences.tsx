import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import { ENV } from '#environment.config.js';

export type PrivacyPreferences = {
  allowsAiTraining: boolean;
};

const queryKey = ['privacy-preferences'] as const;

const getPrivacyPreferences = async (): Promise<PrivacyPreferences> => {
  const response = await fetch(`${ENV.TAU_API_URL}/v1/privacy`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch privacy preferences: ${response.status}`);
  }

  return response.json() as Promise<PrivacyPreferences>;
};

const updatePrivacyPreferences = async (updates: Partial<PrivacyPreferences>): Promise<PrivacyPreferences> => {
  const response = await fetch(`${ENV.TAU_API_URL}/v1/privacy`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    throw new Error(`Failed to update privacy preferences: ${response.status}`);
  }

  return response.json() as Promise<PrivacyPreferences>;
};

type UsePrivacyPreferencesReturn = {
  preferences: PrivacyPreferences | undefined;
  isLoading: boolean;
  error: unknown;
  updatePreferences: UseMutationResult<PrivacyPreferences, unknown, Partial<PrivacyPreferences>>['mutate'];
  isUpdating: boolean;
};

/**
 * Hook to manage user privacy preferences.
 * Fetches and updates privacy settings via the API using react-query.
 */
export function usePrivacyPreferences(): UsePrivacyPreferencesReturn {
  const queryClient = useQueryClient();

  const {
    data: preferences,
    isLoading,
    error,
  } = useQuery({
    queryKey,
    queryFn: getPrivacyPreferences,
    retry: 1,
    retryDelay: 1000,
  });

  const mutation = useMutation({
    mutationFn: updatePrivacyPreferences,
    onSuccess(data) {
      queryClient.setQueryData(queryKey, data);
    },
  });

  return {
    preferences,
    isLoading,
    error,
    updatePreferences: mutation.mutate,
    isUpdating: mutation.isPending,
  };
}
