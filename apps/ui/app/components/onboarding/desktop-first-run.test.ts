import { createElement } from 'react';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { listing } = vi.hoisted(() => ({
  listing: { pending: [] as Array<(value: unknown) => void> },
}));

vi.mock('#filesystem/desktop-bridge.js', () => ({ desktopBridge: () => ({ firstRun: true }) }));
vi.mock('#hooks/use-project-manager.js', () => ({
  useProjectManager: () => ({
    getProjectListing: async () =>
      new Promise((resolve) => {
        listing.pending.push(resolve);
      }),
    isLoading: false,
  }),
}));
vi.mock('#hooks/use-sessions.js', () => ({ useSessions: () => ({}) }));
vi.mock('#hooks/chat-session-store-provider.js', () => ({ useChatSessionStore: () => ({}) }));

const { isDesktopFirstRun, useIsDesktopFirstRun } = await import('#components/onboarding/desktop-first-run.js');

describe('isDesktopFirstRun', () => {
  it('is the first run when main says so and the workspace has no project', () => {
    expect(isDesktopFirstRun({ isFirstLaunch: true, isListed: true, isListingFailed: false, projectCount: 0 })).toBe(
      true,
    );
  });

  it('waits for a completed project listing', () => {
    expect(isDesktopFirstRun({ isFirstLaunch: true, isListed: false, isListingFailed: false, projectCount: 0 })).toBe(
      false,
    );
  });

  it('is not the first run when the project listing failed', () => {
    expect(isDesktopFirstRun({ isFirstLaunch: true, isListed: false, isListingFailed: true, projectCount: 0 })).toBe(
      false,
    );
  });

  it('is not the first run when the workspace has a project, trashed ones included', () => {
    expect(isDesktopFirstRun({ isFirstLaunch: true, isListed: true, isListingFailed: false, projectCount: 1 })).toBe(
      false,
    );
  });

  it('is not the first run when main found a window-state file or a launch link', () => {
    expect(isDesktopFirstRun({ isFirstLaunch: false, isListed: true, isListingFailed: false, projectCount: 0 })).toBe(
      false,
    );
  });
});

describe('useIsDesktopFirstRun', () => {
  afterEach(() => {
    listing.pending.length = 0;
  });

  const render = () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    return { queryClient, ...renderHook(() => useIsDesktopFirstRun(), { wrapper }) };
  };

  /*
   * A filesystem event cancels the `projects` key before it refetches. TanStack reverts a first fetch it
   * cancels to pending-but-idle: not loading, no error and no rows, so a listing that never finished read as an
   * empty workspace and setup opened over a project the next scan listed.
   */
  it('does not read a first scan cancelled before it answered as an empty workspace', async () => {
    const { queryClient, result } = render();
    await waitFor(() => {
      expect(listing.pending).toHaveLength(1);
    });

    await act(async () => {
      await queryClient.cancelQueries({ queryKey: ['projects'] });
      // Observers hear the revert on the notify manager's next tick.
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });

    expect(queryClient.getQueryState(['projects'])?.fetchStatus).toBe('idle');
    expect(result.current).toBe(false);
  });

  it('is the first run once a completed scan found no project', async () => {
    const { result } = render();
    await waitFor(() => {
      expect(listing.pending).toHaveLength(1);
    });
    expect(result.current).toBe(false);

    act(() => {
      listing.pending[0]!({ projects: [], conflicts: [], recoveries: [], workspaceBindingRepairs: [] });
    });

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });
});
