// @vitest-environment jsdom
/**
 * Which role this account holds on the open project (charter W5, D27).
 *
 * `GET /v1/projects` is the only place a client learns it, and every surface
 * needs it before it offers anything: the invite panel belongs to the owner, a
 * `read` collaborator must never be offered a push they would be refused, and a
 * collaborator whose access was revoked while their tab was open has to be told
 * rather than left pressing *Sync now*.
 *
 * The rule is driven through `useProjectAccessRole`, which takes "is this on a
 * Tau remote" as an argument, so no revision worker has to exist for a row here.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RemoteFacet } from '@taucad/revisions';

/* eslint-disable-next-line @typescript-eslint/naming-convention -- `window.ENV`'s keys are the deployment's own environment variable names. */
vi.mock('#environment.config.js', () => ({ ENV: { TAU_API_URL: 'https://api.test' } }));

const { cloudProjectsQueryKey, isSyncReadOnly, useProjectAccessRole } = await import('#hooks/use-cloud-projects.js');

const openProjectId = 'proj_open0000000000000';

const wrapper = ({ children }: { readonly children: React.ReactNode }): React.JSX.Element => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

const answerProjects = (rows: readonly unknown[]): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => rows })),
  );
};

describe('useProjectAccessRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('answers the role the listing carries for this project', async () => {
    answerProjects([
      { id: 'proj_other000000000000', name: 'Other', role: 'owner' },
      { id: openProjectId, name: 'Open', role: 'read' },
    ]);
    const { result } = renderHook(() => useProjectAccessRole(openProjectId, true), { wrapper });

    await waitFor(() => {
      expect(result.current).toBe('read');
    });
  });

  /* N1: a settled listing that does not name the project is the owner's revoke
     arriving at a tab that is still open — not "nothing known". */
  it('answers revoked when a listing that answered does not name the project', async () => {
    answerProjects([{ id: 'proj_other000000000000', name: 'Other', role: 'owner' }]);
    const { result } = renderHook(() => useProjectAccessRole(openProjectId, true), { wrapper });

    await waitFor(() => {
      expect(result.current).toBe('revoked');
    });
  });

  /* Connect Tau Cloud registers the project, so a listing read before it — the
     library's, seconds ago, still fresh in the shared cache — cannot name it.
     That is a stale listing, not a revoke. */
  it('re-reads a cached listing when the project connects, never answering revoked from it', async () => {
    answerProjects([{ id: openProjectId, name: 'Open', role: 'owner' }]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(cloudProjectsQueryKey, []);
    const seen: unknown[] = [];
    const { result, rerender } = renderHook(
      ({ connected }: { readonly connected: boolean }) => {
        const role = useProjectAccessRole(openProjectId, connected);
        seen.push(role);
        return role;
      },
      {
        initialProps: { connected: false },
        wrapper: ({ children }: { readonly children: React.ReactNode }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      },
    );

    rerender({ connected: true });

    await waitFor(() => {
      expect(result.current).toBe('owner');
    });
    expect(seen).not.toContain('revoked');
  });

  it('answers nothing when the API cannot be reached, rather than revoked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })),
    );
    const { result } = renderHook(() => useProjectAccessRole(openProjectId, true), { wrapper });

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });
    expect(result.current).toBeUndefined();
  });

  /* N3: a GitHub-backed or unconnected project has no cloud row, so asking for
     one is a request the library never made on its behalf. */
  it('asks nothing at all when the project is not on a Tau remote', async () => {
    answerProjects([{ id: openProjectId, name: 'Open', role: 'owner' }]);
    const { result } = renderHook(() => useProjectAccessRole(openProjectId, false), { wrapper });

    await new Promise((resolve) => {
      globalThis.setTimeout(resolve, 20);
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result.current).toBeUndefined();
  });
});

/** F1: the one fact both the Sync region and the command palette read. */
describe('isSyncReadOnly', () => {
  const remote = (fetchOnly: boolean): RemoteFacet => ({
    kind: 'tau',
    url: undefined,
    phase: 'connected',
    storage: undefined,
    overQuota: [],
    error: undefined,
    reason: undefined,
    fetchOnly,
    provider: undefined,
    repositoryId: undefined,
    quota: undefined,
  });

  it('refuses a push for a read collaborator, a revoked one and a fetch-only link', () => {
    expect(isSyncReadOnly(remote(false), 'read')).toBe(true);
    expect(isSyncReadOnly(remote(false), 'revoked')).toBe(true);
    expect(isSyncReadOnly(remote(true), 'owner')).toBe(true);
  });

  it('leaves an owner and a write collaborator able to push', () => {
    expect(isSyncReadOnly(remote(false), 'owner')).toBe(false);
    expect(isSyncReadOnly(remote(false), 'write')).toBe(false);
    expect(isSyncReadOnly(remote(false), undefined)).toBe(false);
    expect(isSyncReadOnly(undefined, undefined)).toBe(false);
  });
});
