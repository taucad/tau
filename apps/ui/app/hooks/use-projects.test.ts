import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const useQuery = vi.fn((_options: Record<string, unknown>) => ({
  data: undefined,
  isLoading: false,
  error: undefined,
  refetch: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery,
  useQueryClient: () => ({ invalidateQueries: vi.fn(), removeQueries: vi.fn() }),
}));

vi.mock('#hooks/use-project-manager.js', () => ({
  useProjectManager: () => ({
    getProjectListing: vi.fn(),
    updateProject: vi.fn(),
    getProject: vi.fn(),
    deleteProject: vi.fn(),
    restoreProject: vi.fn(),
    permanentlyDeleteProject: vi.fn(),
    duplicateProject: vi.fn(),
    isLoading: false,
  }),
}));

const { useProjects } = await import('#hooks/use-projects.js');

const listingQueryOptions = (): Record<string, unknown> => {
  useQuery.mockClear();
  renderHook(() => useProjects());
  return useQuery.mock.calls[0]![0];
};

describe('useProjects listing query', () => {
  it('does not poll: worker filesystem events and cross-tab broadcasts drive invalidation', () => {
    expect(listingQueryOptions()).not.toHaveProperty('refetchInterval');
  });

  it('keeps a short stale window so rapid navigations reuse the last scan', () => {
    expect(listingQueryOptions()['staleTime']).toBe(3000);
  });

  it('leaves window-focus refetching at its default so a backgrounded tab refreshes on return', () => {
    expect(listingQueryOptions()).not.toHaveProperty('refetchOnWindowFocus');
  });
});
