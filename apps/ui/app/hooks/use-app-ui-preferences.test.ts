import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const invalidateQueries = vi.fn();
const getAppUiPreferences = vi.fn();
const setProjectDisclosure = vi.fn();
const useQuery = vi.fn();
const activeProjectId = 'proj_active';
const inactiveProjectId = 'proj_inactive';
const projectOneId = 'proj_one';

vi.mock('@tanstack/react-query', () => ({
  useQuery,
  useQueryClient: () => ({ invalidateQueries }),
}));

vi.mock('#hooks/use-project-manager.js', () => ({
  useProjectManager: () => ({
    getAppUiPreferences,
    setProjectDisclosure,
    isLoading: false,
  }),
}));

const { appUiPreferencesQueryKey, useAppUiPreferences } = await import('#hooks/use-app-ui-preferences.js');

describe('useAppUiPreferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQuery.mockReturnValue({ data: undefined, isLoading: false, error: undefined });
  });

  it('derives sparse disclosure defaults from active project state', () => {
    const { result } = renderHook(() => useAppUiPreferences());

    expect(result.current.isProjectExpanded(activeProjectId, true)).toBe(true);
    expect(result.current.isProjectExpanded(inactiveProjectId, false)).toBe(false);
  });

  it('lets an explicit preference override active project state', () => {
    useQuery.mockReturnValue({
      data: {
        id: 'singleton',
        projectDisclosure: { [activeProjectId]: false, [inactiveProjectId]: true },
      },
      isLoading: false,
      error: undefined,
    });
    const { result } = renderHook(() => useAppUiPreferences());

    expect(result.current.isProjectExpanded(activeProjectId, true)).toBe(false);
    expect(result.current.isProjectExpanded(inactiveProjectId, false)).toBe(true);
  });

  it('invalidates only after a material field-scoped write', async () => {
    setProjectDisclosure.mockResolvedValueOnce(undefined).mockResolvedValueOnce({
      id: 'singleton',
      projectDisclosure: { [projectOneId]: true },
    });
    const { result } = renderHook(() => useAppUiPreferences());

    await result.current.setProjectDisclosure(projectOneId, undefined);
    expect(invalidateQueries).not.toHaveBeenCalled();
    await result.current.setProjectDisclosure(projectOneId, true);
    expect(invalidateQueries).toHaveBeenCalledOnce();
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: appUiPreferencesQueryKey });
  });
});
