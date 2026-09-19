// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { wireUsageSnapshotSchema } from '#financial-wire.js';
// oxlint-disable-next-line no-restricted-imports -- test wrapper targets the adjacent TSX provider.
import { BillingSessionProvider } from './billing-session.js';
import { useUsageSnapshot } from '#hooks/use-usage-snapshot.js';

const timestamp = '2026-09-12T00:00:00.000Z';
const groupTotals = { accountDeltaCreditAtoms: '-12345', netUsedCreditAtoms: '12345', eventCount: '1' };
const receipt = {
  schemaVersion: 1,
  environment: 'development',
  ownerId: 'user',
  subjectId: 'account',
  operationId: 'op_1',
  baseTransactionId: 'txn_1',
  terminalRevision: '7',
  policyVersion: 'policy_1',
  activationId: 'activation_1',
  meterContractId: 'meter_1',
  category: 'llm',
  model: { id: 'openai-gpt-5.6-luna', displayName: 'Luna', providerId: 'openai' },
  activity: { kind: 'agent', projectHint: 'project-a', chatHint: 'chat-a', parentAttemptKey: null },
  historyVersion: 1,
  admittedAt: timestamp,
  dispatchIntentAt: timestamp,
  usageOccurredAt: timestamp,
  evidenceOccurredAt: timestamp,
  timingStatus: 'dispatch_intent',
  kind: 'base',
  resolvedAt: timestamp,
  executionStatus: 'succeeded',
  customerState: 'settled',
  authorizedMaxCreditAtoms: '20000',
  chargedCreditAtoms: '12345',
  accountDeltaCreditAtoms: '-12345',
  meteringStatus: 'complete',
  meterItems: [],
  tokens: {
    status: 'complete',
    uncachedInput: '1000',
    cacheRead: '0',
    cacheWrite: '0',
    inputTotal: '1000',
    output: '50',
    reasoning: '10',
  },
};
const snapshot = wireUsageSnapshotSchema.parse({
  schemaVersion: 1,
  environment: 'development',
  ownerId: 'user',
  subjectId: 'account',
  snapshotRevision: '7',
  asOf: timestamp,
  query: {
    preset: 'last_30_days',
    fromDate: '2026-08-13',
    toDate: '2026-09-12',
    timeZone: 'UTC',
    models: [],
    activities: [],
    projects: [],
  },
  coverage: {
    historyStart: null,
    legacyBefore: null,
    complete: true,
    detailComplete: true,
    excludedUnknownTimeCount: '0',
  },
  availability: { state: 'available', reason: null },
  totals: groupTotals,
  rows: { items: [receipt], nextCursor: null, complete: true },
  days: { items: [{ day: '2026-09-12', ...groupTotals }], nextCursor: null, complete: true },
  models: {
    items: [{ modelId: 'openai-gpt-5.6-luna', modelDisplayName: 'Luna', ...groupTotals }],
    nextCursor: null,
    complete: true,
  },
  activities: { items: [{ activity: 'agent', ...groupTotals }], nextCursor: null, complete: true },
});

function setup(userId = 'user') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <BillingSessionProvider value={{ apiBaseUrl: 'https://api.example', userId, environment: 'development' }}>
        {children}
      </BillingSessionProvider>
    </QueryClientProvider>
  );
  return { client, wrapper };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useUsageSnapshot', () => {
  it('reads the owned snapshot with the canonical query, range, collection and cursor', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => snapshot }));
    const { wrapper } = setup();
    const { result } = renderHook(
      () =>
        useUsageSnapshot(
          {
            range: 'custom',
            startDate: '2026-08-13',
            endDate: '2026-09-12',
            timezone: 'Pacific/Auckland',
            models: ['openai-gpt-5.6-luna'],
            activities: ['agent', 'title'],
            projects: ['project-a'],
            pageSize: 50,
            collection: 'rows',
            cursor: 'v1_cursor',
          },
          { minimum: { environment: 'development', subjectId: 'account', revision: '7' } },
        ),
      { wrapper },
    );
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    expect(result.current).toMatchObject({ status: 'ready', snapshot });
    expect(fetch).toHaveBeenCalledWith(
      'https://api.example/v1/billing/usage?range=custom&startDate=2026-08-13&endDate=2026-09-12&timezone=Pacific%2FAuckland&collection=rows&cursor=v1_cursor&pageSize=50&models=openai-gpt-5.6-luna&activities=agent&activities=title&projects=project-a',
      { credentials: 'include', signal: expect.any(AbortSignal) as AbortSignal },
    );
  });

  it.each([
    { label: 'malformed envelope', wire: { ...snapshot, totals: { netUsedCreditAtoms: '12345' } } },
    { label: 'another owner', wire: { ...snapshot, ownerId: 'other' } },
    { label: 'another environment', wire: { ...snapshot, environment: 'staging' } },
    { label: 'another subject', wire: { ...snapshot, subjectId: 'other' } },
    { label: 'a revision before the owned receipt', wire: { ...snapshot, snapshotRevision: '6' } },
  ])('rejects $label without rendering usage', async ({ wire }) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => wire }));
    const { wrapper } = setup();
    const { result } = renderHook(
      () =>
        useUsageSnapshot(
          { range: 'last_30_days' },
          { minimum: { environment: 'development', subjectId: 'account', revision: '7' } },
        ),
      { wrapper },
    );
    await waitFor(() => {
      expect(result.current.status).toBe('unavailable');
    });
    expect(result.current).not.toHaveProperty('snapshot');
  });

  it('rejects a cursor the server refuses and keeps no usage on screen', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }));
    const { wrapper } = setup();
    const { result } = renderHook(
      () => useUsageSnapshot({ range: 'last_30_days', collection: 'rows', cursor: 'v1_foreign' }),
      { wrapper },
    );
    await waitFor(() => {
      expect(result.current.status).toBe('unavailable');
    });
  });

  it('keeps the last good snapshot when a refresh regresses to an older revision', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => snapshot })
      .mockResolvedValue({ ok: true, json: async () => ({ ...snapshot, snapshotRevision: '6' }) });
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = setup();
    const { result } = renderHook(() => useUsageSnapshot({ range: 'last_30_days' }), { wrapper });
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    act(() => {
      result.current.retry();
    });
    await waitFor(() => {
      expect(result.current.status).toBe('unable-to-refresh');
    });
    expect(result.current).toMatchObject({ snapshot });
  });

  it('reports a saved snapshot as refreshing before the first response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const { wrapper } = setup();
    const { result } = renderHook(() => useUsageSnapshot({ range: 'all_time' }, { saved: snapshot }), { wrapper });
    expect(result.current.status).toBe('refreshing');
    await waitFor(() => {
      expect(result.current.status).toBe('unable-to-refresh');
    });
  });

  // ── Saved snapshots (C10-U4) ─────────────────────────────────────────────
  it('renders a saved snapshot with no live billing session and never fetches', () => {
    vi.stubGlobal('fetch', vi.fn());
    const signedOut = ({ children }: { readonly children: ReactNode }) => (
      <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useUsageSnapshot({ range: 'last_30_days' }, { saved: snapshot }), {
      wrapper: signedOut,
    });
    expect(result.current).toMatchObject({ status: 'saved', snapshot });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'another owner', saved: { ...snapshot, ownerId: 'other' } },
    { label: 'another environment', saved: wireUsageSnapshotSchema.parse({ ...snapshot, environment: 'staging' }) },
  ])('refuses a $label saved snapshot against the live session', async ({ saved }) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const { wrapper } = setup();
    const { result } = renderHook(() => useUsageSnapshot({ range: 'last_30_days' }, { saved }), { wrapper });
    await waitFor(() => {
      expect(result.current.status).toBe('unavailable');
    });
    expect(result.current).not.toHaveProperty('snapshot');
  });

  it('refuses a saved snapshot older than the revision a receipt already confirmed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const { wrapper } = setup();
    const { result } = renderHook(
      () =>
        useUsageSnapshot(
          { range: 'last_30_days' },
          {
            saved: { ...snapshot, snapshotRevision: '6' },
            minimum: { environment: 'development', subjectId: 'account', revision: '7' },
          },
        ),
      { wrapper },
    );
    await waitFor(() => {
      expect(result.current.status).toBe('unavailable');
    });
  });

  it('refuses a saved snapshot older than a revision this session already served', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => snapshot })
      .mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = setup();
    type Props = { range: 'last_30_days' | 'all_time'; saved?: typeof snapshot };
    const initialProps: Props = { range: 'last_30_days' };
    const { result, rerender } = renderHook(({ range, saved }: Props) => useUsageSnapshot({ range }, { saved }), {
      wrapper,
      initialProps,
    });
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    // A different canonical query has no live data, so only the saved snapshot
    // could render it — and revision 6 is behind the 7 this session served.
    rerender({ range: 'all_time', saved: { ...snapshot, snapshotRevision: '6' } });

    await waitFor(() => {
      expect(result.current.status).toBe('unavailable');
    });
  });

  it('does not fetch while signed out', () => {
    vi.stubGlobal('fetch', vi.fn());
    const signedOut = ({ children }: { readonly children: ReactNode }) => (
      <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useUsageSnapshot({ range: 'last_30_days' }), { wrapper: signedOut });
    expect(result.current.status).toBe('signed-out');
    expect(fetch).not.toHaveBeenCalled();
  });
});
