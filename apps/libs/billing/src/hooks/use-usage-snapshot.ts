import { useQuery } from '@tanstack/react-query';
import { useRef } from 'react';
import { wireUsageSnapshotSchema } from '@taucad/billing';
import type { FinancialActivityKind, WireUsageSnapshot } from '@taucad/billing';
// oxlint-disable-next-line no-restricted-imports -- Adjacent TSX provider uses its declared .js import.
import { useBillingSession } from './billing-session.js';

/** Canonical usage query echoed back by `GET /v1/billing/usage`. */
export type UsageSnapshotQuery = {
  readonly range: 'last_30_days' | 'custom' | 'all_time';
  /** `YYYY-MM-DD`; required together with `endDate` for the `custom` range. */
  readonly startDate?: string;
  readonly endDate?: string;
  readonly timezone?: string;
  readonly models?: readonly string[];
  readonly activities?: readonly FinancialActivityKind[];
  readonly projects?: readonly string[];
  readonly pageSize?: number;
  /** Requests one collection; every collection is returned when omitted. */
  readonly collection?: 'rows' | 'days' | 'models' | 'activities';
  /** Server-signed continuation for `collection`; foreign cursors are refused. */
  readonly cursor?: string;
};

/** Freshness of the rendered snapshot; a failed read never renders as zero usage. */
export type UsageSnapshotState =
  | { readonly status: 'signed-out' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly snapshot: WireUsageSnapshot }
  | { readonly status: 'refreshing'; readonly snapshot: WireUsageSnapshot }
  | { readonly status: 'unable-to-refresh'; readonly snapshot: WireUsageSnapshot }
  /** No live billing session, but this device saved a compatible snapshot. */
  | { readonly status: 'saved'; readonly snapshot: WireUsageSnapshot }
  | { readonly status: 'unavailable' };

/** Page state plus the retry the freshness banner offers. */
export type UsageSnapshotResult = UsageSnapshotState & { readonly retry: () => void };

const buildSearch = (query: UsageSnapshotQuery): URLSearchParams => {
  const parameters = new URLSearchParams({ range: query.range });
  for (const [name, value] of [
    ['startDate', query.startDate],
    ['endDate', query.endDate],
    ['timezone', query.timezone],
    ['collection', query.collection],
    ['cursor', query.cursor],
    ['pageSize', query.pageSize?.toString()],
  ] as const) {
    if (value !== undefined) {
      parameters.set(name, value);
    }
  }
  for (const [name, values] of [
    ['models', query.models],
    ['activities', query.activities],
    ['projects', query.projects],
  ] as const) {
    for (const value of values ?? []) {
      parameters.append(name, value);
    }
  }
  return parameters;
};

/**
 * A saved snapshot is untrusted local storage: it passes exactly the checks a
 * network response does before it can reach the page.
 */
const acceptSaved = (
  saved: WireUsageSnapshot | undefined,
  checks: {
    readonly session?: { readonly userId: string; readonly environment: string };
    readonly minimum?: { environment: string; subjectId: string; revision: string };
    readonly served: bigint;
  },
): WireUsageSnapshot | undefined => {
  if (saved === undefined) {
    return undefined;
  }
  const { session, minimum, served } = checks;
  if (session !== undefined && (saved.ownerId !== session.userId || saved.environment !== session.environment)) {
    return undefined;
  }
  if (
    minimum !== undefined &&
    (saved.environment !== minimum.environment ||
      saved.subjectId !== minimum.subjectId ||
      BigInt(saved.snapshotRevision) < BigInt(minimum.revision))
  ) {
    return undefined;
  }
  return BigInt(saved.snapshotRevision) < served ? undefined : saved;
};

/**
 * Reads the authoritative account usage snapshot. Malformed, cross-account and
 * revision-regressing envelopes are refused; a supplied `saved` snapshot keeps
 * the page on its last good data while a refresh fails, and reports `saved`
 * on its own when no live billing session has resolved yet. The `saved`
 * snapshot faces the same owner, environment, `minimum` and session-revision
 * checks as a network response.
 */
export const useUsageSnapshot = (
  query: UsageSnapshotQuery,
  options?: {
    readonly minimum?: { environment: string; subjectId: string; revision: string };
    readonly saved?: WireUsageSnapshot;
  },
): UsageSnapshotResult => {
  const { apiBaseUrl, userId, environment } = useBillingSession();
  const { minimum, saved } = options ?? {};
  const sessionKey = `${apiBaseUrl ?? ''}|${userId ?? ''}|${environment ?? ''}`;
  /* oxlint-disable react/refs -- the highest served revision fences a cached reporting replica, not render state */
  const servedRef = useRef({ key: sessionKey, revision: 0n });
  if (servedRef.current.key !== sessionKey) {
    servedRef.current = { key: sessionKey, revision: 0n };
  }
  const served = servedRef.current;
  /* oxlint-enable react/refs */
  const isEnabled = userId !== undefined && apiBaseUrl !== undefined && environment !== undefined;
  const { data, isError, isFetching, refetch } = useQuery({
    queryKey: ['billing', 'usage', apiBaseUrl, userId, environment, query, minimum],
    enabled: isEnabled,
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async ({ signal }): Promise<WireUsageSnapshot> => {
      const response = await fetch(`${apiBaseUrl}/v1/billing/usage?${buildSearch(query).toString()}`, {
        credentials: 'include',
        signal,
      });
      if (!response.ok) {
        throw new Error(`Usage request failed with ${response.status}`);
      }
      const snapshot = wireUsageSnapshotSchema.parse(await response.json());
      if (snapshot.ownerId !== userId || snapshot.environment !== environment) {
        throw new Error('Usage belongs to a different billing session');
      }
      if (
        minimum !== undefined &&
        (snapshot.environment !== minimum.environment ||
          snapshot.subjectId !== minimum.subjectId ||
          BigInt(snapshot.snapshotRevision) < BigInt(minimum.revision))
      ) {
        throw new Error('Usage does not cover the owned receipt');
      }
      if (BigInt(snapshot.snapshotRevision) < served.revision) {
        throw new Error('Usage regressed to an older account revision');
      }
      served.revision = BigInt(snapshot.snapshotRevision);
      return snapshot;
    },
  });

  const retry = (): void => {
    void refetch();
  };
  const accepted = acceptSaved(saved, {
    session: isEnabled ? { userId, environment } : undefined,
    minimum,
    served: served.revision,
  });
  const snapshot = data ?? accepted;
  if (!isEnabled) {
    return accepted === undefined ? { status: 'signed-out', retry } : { status: 'saved', snapshot: accepted, retry };
  }
  if (snapshot === undefined) {
    return { status: isError ? 'unavailable' : 'loading', retry };
  }
  if (isError) {
    return { status: 'unable-to-refresh', snapshot, retry };
  }
  return { status: isFetching ? 'refreshing' : 'ready', snapshot, retry };
};
