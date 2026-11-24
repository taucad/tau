// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedAuth } from '#hooks/use-resolved-auth.js';

type SessionState = {
  readonly data: unknown;
  readonly isSuccess: boolean;
  readonly error?: unknown;
};

const { mockUseSession } = vi.hoisted(() => ({ mockUseSession: vi.fn<() => SessionState>() }));

vi.mock('@better-auth-ui/react', () => ({ useSession: () => mockUseSession() }));
vi.mock('#lib/auth-client.js', () => ({ authClient: {} }));

const { useResolvedAuth } = await import('#hooks/use-resolved-auth.js');
const { writeIdentityRecord } = await import('#hooks/use-identity.js');

const session = { user: { id: 'user-1' } };

describe('useResolvedAuth', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it.each<readonly [string, SessionState, ResolvedAuth]>([
    ['server render without a result', { data: undefined, isSuccess: false }, 'indeterminate'],
    ['initial pending request', { data: undefined, isSuccess: false }, 'indeterminate'],
    ['paused offline-first request', { data: undefined, isSuccess: false }, 'indeterminate'],
    [
      'cold request error',
      {
        data: undefined,
        isSuccess: false,
        error: new TypeError('Failed to fetch'),
      },
      'indeterminate',
    ],
    ['server error', { data: undefined, isSuccess: false, error: { status: 503 } }, 'indeterminate'],
    ['explicit 401', { data: undefined, isSuccess: false, error: { status: 401 } }, 'anonymous'],
    ['successful signed-out response', { data: null, isSuccess: true }, 'anonymous'],
    ['successful session response', { data: session, isSuccess: true }, 'authed'],
    ['refetch error with a cached session', { data: session, isSuccess: false }, 'authed'],
    ['refetch error with cached null data', { data: null, isSuccess: false }, 'indeterminate'],
  ])('maps %s', (_label, sessionState, expected) => {
    mockUseSession.mockReturnValue(sessionState);

    const { result } = renderHook(() => useResolvedAuth());

    expect(result.current).toBe(expected);
  });

  /* D17: an offline launch with a recorded identity is never a sign-out, so `AnonymousSessionPurge` never purges. */
  it.each<readonly [string, SessionState]>([
    ['paused offline', { data: undefined, isSuccess: false }],
    [
      'failed for a network reason',
      {
        data: undefined,
        isSuccess: false,
        error: new TypeError('Failed to fetch'),
      },
    ],
  ])('stays indeterminate, never anonymous, for a recorded identity whose check is %s', (_label, sessionState) => {
    writeIdentityRecord({
      id: 'user-1',
      name: 'One',
      email: 'one@example.test',
    });
    mockUseSession.mockReturnValue(sessionState);

    const { result } = renderHook(() => useResolvedAuth());

    expect(result.current).toBe('indeterminate');
  });
});
