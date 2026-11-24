// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type SessionState = {
  readonly data: unknown;
  readonly isSuccess: boolean;
  readonly error?: unknown;
};

const { mockUseSession } = vi.hoisted(() => ({
  mockUseSession: vi.fn<() => SessionState>(),
}));

vi.mock('@better-auth-ui/react', () => ({
  useSession: () => mockUseSession(),
}));
vi.mock('#lib/auth-client.js', () => ({ authClient: {} }));

const { identityRecordPrefix, readIdentityRecord, resolveIdentity, useIdentity, writeIdentityRecord } =
  await import('#hooks/use-identity.js');

const recordKey = `${identityRecordPrefix}http://localhost:4000`;
const one = {
  id: 'user-1',
  name: 'One',
  email: 'one@example.test',
  image: null,
};
const offline: SessionState = { data: undefined, isSuccess: false };
const failed = {
  data: undefined,
  isSuccess: false,
  error: new TypeError('Failed to fetch'),
} as const;

describe('resolveIdentity', () => {
  it.each([
    {
      label: 'a session answer with a user',
      expected: 'verified',
      session: { data: { user: one }, isSuccess: true, error: null },
      record: undefined,
    },
    {
      label: 'a cached user whose refetch failed',
      expected: 'verified',
      session: { data: { user: one }, isSuccess: false, error: failed.error },
      record: undefined,
    },
    {
      label: 'a signed-out answer, over a record',
      expected: 'signed-out',
      session: { data: null, isSuccess: true, error: null },
      record: one,
    },
    {
      label: 'an explicit 401, over a record',
      expected: 'signed-out',
      session: { data: undefined, isSuccess: false, error: { status: 401 } },
      record: one,
    },
    {
      label: 'a paused check with a record',
      expected: 'unverified',
      session: { ...offline, error: null },
      record: one,
    },
    {
      label: 'a network failure with a record',
      expected: 'unverified',
      session: failed,
      record: one,
    },
    {
      label: 'a 503 with a record',
      expected: 'unverified',
      session: { data: undefined, isSuccess: false, error: { status: 503 } },
      record: one,
    },
    {
      label: 'a paused check with no record',
      expected: 'unknown',
      session: { ...offline, error: null },
      record: undefined,
    },
  ] as const)('reads $label as $expected', ({ expected, session, record }) => {
    expect(resolveIdentity(session, record).state).toBe(expected);
  });
});

describe('useIdentity', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows the recorded identity on an offline launch, before any answer', () => {
    writeIdentityRecord(one);
    mockUseSession.mockReturnValue(offline);

    const { result } = renderHook(() => useIdentity());

    expect(result.current).toEqual({ state: 'unverified', user: one });
  });

  it('records a verified identity, never a token, and keeps it through a failed check', () => {
    mockUseSession.mockReturnValue({
      data: {
        user: { ...one, emailVerified: true },
        session: { token: 'secret-token' },
      },
      isSuccess: true,
    });
    const { rerender, result } = renderHook(() => useIdentity());
    expect(result.current.state).toBe('verified');
    expect(JSON.parse(localStorage.getItem(recordKey) ?? 'null')).toEqual(one);
    expect(localStorage.getItem(recordKey)).not.toContain('secret-token');

    mockUseSession.mockReturnValue(failed);
    rerender();
    expect(result.current).toEqual({ state: 'unverified', user: one });
    expect(readIdentityRecord()).toEqual(one);
  });

  it('updates without a reload when the network returns and the session verifies', () => {
    writeIdentityRecord(one);
    mockUseSession.mockReturnValue(offline);
    const { rerender, result } = renderHook(() => useIdentity());
    expect(result.current.state).toBe('unverified');

    mockUseSession.mockReturnValue({
      data: { user: { ...one, name: 'One renamed' } },
      isSuccess: true,
    });
    rerender();
    expect(result.current).toEqual({
      state: 'verified',
      user: { ...one, name: 'One renamed' },
    });
    expect(readIdentityRecord()?.name).toBe('One renamed');
  });

  it('clears the record only on a confirmed sign-out', () => {
    writeIdentityRecord(one);
    mockUseSession.mockReturnValue({ data: null, isSuccess: true });

    const { result } = renderHook(() => useIdentity());

    expect(result.current.state).toBe('signed-out');
    expect(localStorage.getItem(recordKey)).toBeNull();
  });

  it('reads a corrupt record as none', () => {
    localStorage.setItem(recordKey, '{not json');
    mockUseSession.mockReturnValue(offline);

    const { result } = renderHook(() => useIdentity());

    expect(result.current.state).toBe('unknown');
  });

  it('follows a record another window writes', () => {
    mockUseSession.mockReturnValue(offline);
    const { result } = renderHook(() => useIdentity());
    expect(result.current.state).toBe('unknown');

    act(() => {
      localStorage.setItem(recordKey, JSON.stringify(one));
      globalThis.dispatchEvent(new StorageEvent('storage', { key: recordKey }));
    });
    expect(result.current).toEqual({ state: 'unverified', user: one });
  });
});
