// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { EffectiveTelemetryPurposes } from '#hooks/use-telemetry-purposes.js';
import { telemetryPurposes, useTelemetryPurposes } from '#hooks/use-telemetry-purposes.js';

const session = vi.hoisted((): { current: { user: { id: string } } | undefined } => ({
  current: { user: { id: 'user-a' } },
}));
vi.mock('@better-auth-ui/react', () => ({ useSession: () => ({ data: session.current }) }));
vi.mock('#lib/auth-client.js', () => ({ authClient: {} }));

let queryClient: QueryClient;
const wrapper = ({ children }: { readonly children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

const answer = (overrides: Partial<EffectiveTelemetryPurposes> = {}): EffectiveTelemetryPurposes => ({
  epoch: 'user-a:-:notice-1:0',
  noticeVersion: 'notice-1',
  purposes: telemetryPurposes.map((purpose) => ({
    purpose,
    allowed: false,
    decided: false,
    granted: false,
    refusal: 'no-decision',
  })),
  ...overrides,
});

const respond = (...bodies: unknown[]) => {
  const fetchMock = vi.fn<typeof fetch>();
  for (const body of bodies) {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body)));
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

beforeEach(() => {
  session.current = { user: { id: 'user-a' } };
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  queryClient.clear();
  vi.unstubAllGlobals();
});

describe('useTelemetryPurposes', () => {
  it('refuses every purpose while the server has not answered', () => {
    respond(answer());

    const { result } = renderHook(() => useTelemetryPurposes(), { wrapper });

    expect(telemetryPurposes.every((purpose) => !result.current.isAllowed(purpose))).toBe(true);
    expect(result.current.canDecide).toBe(false);
  });

  it('shows the server’s effective answer, not the account’s raw preference', async () => {
    respond(
      answer({
        purposes: [
          { purpose: 'summary', allowed: true, decided: true, granted: true },
          { purpose: 'content', allowed: false, decided: true, granted: true, refusal: 'project-mixed-source' },
          { purpose: 'diagnosis', allowed: false, decided: false, granted: false, refusal: 'no-decision' },
          { purpose: 'reuse', allowed: false, decided: true, granted: true, refusal: 'tier-excluded' },
          { purpose: 'training', allowed: false, decided: true, granted: true, refusal: 'tier-excluded' },
        ],
      }),
    );

    const { result } = renderHook(() => useTelemetryPurposes(), { wrapper });

    await waitFor(() => {
      expect(result.current.isAllowed('summary')).toBe(true);
    });
    /* The account granted content, reuse and training; the server refuses all three. */
    expect(result.current.isAllowed('content')).toBe(false);
    expect(result.current.isAllowed('reuse')).toBe(false);
    expect(result.current.stateOf('reuse')).toMatchObject({ granted: true, allowed: false });
    expect(result.current.canDecide).toBe(true);
  });

  it('caches per principal, so an account switch does not show the previous account’s grants', async () => {
    const fetchMock = respond(
      answer({ purposes: [{ purpose: 'summary', allowed: true, decided: true, granted: true }] }),
      answer({ epoch: 'user-b:-:notice-1:0', purposes: [] }),
    );
    const { result, rerender } = renderHook(() => useTelemetryPurposes(), { wrapper });
    await waitFor(() => {
      expect(result.current.isAllowed('summary')).toBe(true);
    });

    session.current = { user: { id: 'user-b' } };
    rerender();

    expect(result.current.isAllowed('summary')).toBe(false);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    expect(result.current.isAllowed('summary')).toBe(false);
  });

  it('drops every cached answer on sign-out', async () => {
    respond(answer({ purposes: [{ purpose: 'summary', allowed: true, decided: true, granted: true }] }));
    const { result, rerender } = renderHook(() => useTelemetryPurposes(), { wrapper });
    await waitFor(() => {
      expect(result.current.isAllowed('summary')).toBe(true);
    });

    session.current = undefined;
    rerender();

    expect(result.current.isAllowed('summary')).toBe(false);
    expect(queryClient.getQueryData(['telemetry-purposes', 'user-a', null])).toBeUndefined();
  });

  it('sends the notice it displayed with the decision', async () => {
    const decided = answer({ purposes: [{ purpose: 'summary', allowed: true, decided: true, granted: true }] });
    const fetchMock = respond(answer(), decided, decided);
    const { result } = renderHook(() => useTelemetryPurposes(), { wrapper });
    await waitFor(() => {
      expect(result.current.canDecide).toBe(true);
    });

    result.current.decide({ purpose: 'summary', granted: true });

    await waitFor(() => {
      expect(result.current.isAllowed('summary')).toBe(true);
    });
    const [, init] = fetchMock.mock.calls[1] ?? [];
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(typeof init?.body === 'string' ? init.body : '')).toEqual({
      noticeVersion: 'notice-1',
      decisions: [{ purpose: 'summary', granted: true }],
    });
  });

  it('refetches the project-scoped answer instead of caching the account-level PUT answer', async () => {
    const scoped = answer({ projectId: 'project-a' });
    const accountLevel = answer({ purposes: [{ purpose: 'summary', allowed: true, decided: true, granted: true }] });
    const fetchMock = respond(scoped, accountLevel, scoped);
    const { result } = renderHook(() => useTelemetryPurposes({ projectId: 'project-a' }), { wrapper });
    await waitFor(() => {
      expect(result.current.canDecide).toBe(true);
    });

    result.current.decide({ purpose: 'summary', granted: true });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
    await waitFor(() => {
      expect(result.current.effective?.projectId).toBe('project-a');
    });
    expect(result.current.isAllowed('summary')).toBe(false);
  });

  it('refetches the current notice after the server refuses a decision against a stale one', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(answer())))
      .mockResolvedValueOnce(new Response('{}', { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(answer({ noticeVersion: 'notice-2' }))));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useTelemetryPurposes(), { wrapper });
    await waitFor(() => {
      expect(result.current.canDecide).toBe(true);
    });

    result.current.decide({ purpose: 'summary', granted: true });

    await waitFor(() => {
      expect(result.current.effective?.noticeVersion).toBe('notice-2');
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.current.isAllowed('summary')).toBe(false);
  });

  it('cannot decide while no notice is in force', async () => {
    respond(answer({ noticeVersion: undefined }));
    const { result } = renderHook(() => useTelemetryPurposes(), { wrapper });
    await waitFor(() => {
      expect(result.current.effective).toBeDefined();
    });

    expect(result.current.canDecide).toBe(false);
  });
});
