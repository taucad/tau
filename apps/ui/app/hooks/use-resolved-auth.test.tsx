// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ResolvedAuth } from '#hooks/use-resolved-auth.js';

type SessionState = {
  readonly data: unknown;
  readonly isSuccess: boolean;
};

const { mockUseSession } = vi.hoisted(() => ({ mockUseSession: vi.fn<() => SessionState>() }));

vi.mock('@better-auth-ui/react', () => ({ useSession: () => mockUseSession() }));
vi.mock('#lib/auth-client.js', () => ({ authClient: {} }));

const { useResolvedAuth } = await import('#hooks/use-resolved-auth.js');

const session = { user: { id: 'user-1' } };

describe('useResolvedAuth', () => {
  it.each<readonly [string, SessionState, ResolvedAuth]>([
    ['server render without a result', { data: undefined, isSuccess: false }, 'indeterminate'],
    ['initial pending request', { data: undefined, isSuccess: false }, 'indeterminate'],
    ['paused offline-first request', { data: undefined, isSuccess: false }, 'indeterminate'],
    ['cold request error', { data: undefined, isSuccess: false }, 'indeterminate'],
    ['successful signed-out response', { data: null, isSuccess: true }, 'anonymous'],
    ['successful session response', { data: session, isSuccess: true }, 'authed'],
    ['refetch error with a cached session', { data: session, isSuccess: false }, 'authed'],
    ['refetch error with cached null data', { data: null, isSuccess: false }, 'indeterminate'],
  ])('maps %s', (_label, sessionState, expected) => {
    mockUseSession.mockReturnValue(sessionState);

    const { result } = renderHook(() => useResolvedAuth());

    expect(result.current).toBe(expected);
  });
});
