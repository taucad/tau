import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { Chat } from '@taucad/chat';
import { summarizeUsage } from '@taucad/billing/usage';
import type { UsageRecord } from '@taucad/billing/usage';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { useModels } from '#hooks/use-models.js';
import type { ProjectLibraryEntry } from '#types/project.types.js';

type ProjectsWithChats = {
  project: ProjectLibraryEntry;
  chats: Chat[];
};

/**
 * Hook to aggregate all usage data across all projects and chats.
 * Extracts usage records from data-usage message parts and enriches them
 * with model display names and provider information.
 */
export function useAllUsage(): {
  records: UsageRecord[];
  isLoading: boolean;
  error: Error | undefined;
  refetch: () => void;
} {
  const { getProjects, getChatsForResource, isLoading: isProjectManagerLoading } = useProjectManager();
  const { resolveModel } = useModels();

  // Fetch all projects and their chats in a single query
  const {
    data: projectsWithChats = [],
    isLoading: isDataLoading,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: ['all-usage-data'],
    async queryFn(): Promise<ProjectsWithChats[]> {
      const projects = await getProjects({ includeDeleted: false });
      const results: ProjectsWithChats[] = [];

      // Fetch chats for all projects in parallel
      const chatsPromises = projects.map(async (project) => {
        const chats = await getChatsForResource(project.manifest.id, { includeDeleted: false });
        return { project, chats };
      });

      const settledResults = await Promise.all(chatsPromises);
      results.push(...settledResults);

      return results;
    },
    enabled: !isProjectManagerLoading,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Extract and normalize usage records from all chats
  const records = useMemo(() => summarizeUsage(projectsWithChats, resolveModel), [projectsWithChats, resolveModel]);

  const handleRefetch = (): void => {
    void refetch();
  };

  const isLoading = isProjectManagerLoading || isDataLoading;

  return {
    records,
    isLoading,
    error: queryError instanceof Error ? queryError : undefined,
    refetch: handleRefetch,
  };
}
