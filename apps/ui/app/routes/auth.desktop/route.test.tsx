// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AuthDesktopRoute, { buildDesktopLoopbackUrl, parseDesktopHandoffTarget } from '#routes/auth.desktop/route.js';

const mocks = vi.hoisted(() => ({
  search: '?port=51234&state=abcd1234efgh',
  session: { user: { id: 'usr_1' } } as unknown,
  authenticate: vi.fn(),
  authFetch: vi.fn(),
}));

vi.mock('react-router', () => ({
  useLocation: () => ({ search: mocks.search }),
}));

vi.mock('@better-auth-ui/react', () => ({
  useAuthenticate: () => {
    mocks.authenticate();
    return { data: mocks.session };
  },
}));

vi.mock('#lib/auth-client.js', () => ({
  authClient: {
    // oxlint-disable-next-line @typescript-eslint/no-unsafe-return -- test double
    $fetch: (...args: unknown[]) => mocks.authFetch(...args),
  },
}));

describe('parseDesktopHandoffTarget', () => {
  it('accepts a concrete loopback port and an opaque nonce', () => {
    expect(parseDesktopHandoffTarget('?port=51234&state=abcd1234efgh')).toEqual({
      port: 51_234,
      state: 'abcd1234efgh',
    });
  });

  it.each([
    ['a missing port', '?state=abcd1234efgh'],
    ['a non-numeric port', '?port=80x&state=abcd1234efgh'],
    ['the ephemeral placeholder port', '?port=0&state=abcd1234efgh'],
    ['an out-of-range port', '?port=65536&state=abcd1234efgh'],
    ['a fractional port', '?port=1234.5&state=abcd1234efgh'],
    ['a missing state', '?port=51234'],
    ['a too-short state', '?port=51234&state=abc'],
    ['a state carrying URL separators', '?port=51234&state=abcd1234%26evil%3D1'],
    ['a state carrying a path traversal', '?port=51234&state=..%2F..%2Fetc'],
  ])('rejects %s', (_label, search) => {
    expect(parseDesktopHandoffTarget(search)).toBeUndefined();
  });
});

describe('buildDesktopLoopbackUrl', () => {
  it('targets 127.0.0.1 and echoes the state alongside the token', () => {
    expect(buildDesktopLoopbackUrl({ port: 51_234, state: 'abcd1234efgh' }, 'ott-value')).toBe(
      'http://127.0.0.1:51234/callback?ott=ott-value&state=abcd1234efgh',
    );
  });
});

describe('AuthDesktopRoute', () => {
  const assign = vi.fn();

  beforeEach(() => {
    mocks.search = '?port=51234&state=abcd1234efgh';
    mocks.session = { user: { id: 'usr_1' } };
    mocks.authFetch.mockResolvedValue({ data: { token: 'ott-value' }, error: null });
    vi.stubGlobal('location', { href: 'http://app.test/auth/desktop', assign });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // MAJOR 2: any site can navigate a signed-in browser here. Minting on mount
  // would hand a session-bearing token to whatever is listening on the
  // attacker-chosen loopback port, with no user in the loop.
  it('mints nothing until the user confirms, even with a valid request', async () => {
    render(<AuthDesktopRoute />);

    expect(screen.getByRole('button', { name: /connect to tau desktop/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(mocks.authFetch).not.toHaveBeenCalled();
    });
    expect(assign).not.toHaveBeenCalled();
  });

  it('names the requesting port so the user can refuse an unexpected one', () => {
    render(<AuthDesktopRoute />);

    expect(screen.getByText(/127\.0\.0\.1:51234/)).toBeInTheDocument();
  });

  it('mints a one-time token and navigates to the loopback callback on confirmation', async () => {
    render(<AuthDesktopRoute />);

    await userEvent.click(screen.getByRole('button', { name: /connect to tau desktop/i }));

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith('http://127.0.0.1:51234/callback?ott=ott-value&state=abcd1234efgh');
    });
    expect(mocks.authFetch).toHaveBeenCalledWith('/one-time-token/generate');
    expect(screen.getByText('You can return to the app')).toBeInTheDocument();
  });

  it('never mints a token for a malformed request', async () => {
    mocks.search = '?port=0&state=abc';

    render(<AuthDesktopRoute />);

    expect(screen.getByText('This sign-in link is not valid')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /connect to tau desktop/i })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(mocks.authFetch).not.toHaveBeenCalled();
    });
    expect(assign).not.toHaveBeenCalled();
  });

  it('waits for the session gate rather than minting while signed out', async () => {
    mocks.session = undefined;

    render(<AuthDesktopRoute />);

    // `useAuthenticate` owns the bounce through /auth/sign-in?redirectTo=…
    expect(mocks.authenticate).toHaveBeenCalled();
    await waitFor(() => {
      expect(mocks.authFetch).not.toHaveBeenCalled();
    });
    expect(screen.queryByRole('button', { name: /connect to tau desktop/i })).not.toBeInTheDocument();
    expect(screen.getByText('Signing you in to Tau Desktop')).toBeInTheDocument();
  });

  it('reports a failure instead of navigating when the token cannot be minted', async () => {
    mocks.authFetch.mockResolvedValue({ data: null, error: { status: 401 } });

    render(<AuthDesktopRoute />);
    await userEvent.click(screen.getByRole('button', { name: /connect to tau desktop/i }));

    await waitFor(() => {
      expect(screen.getByText("We couldn't complete the sign-in")).toBeInTheDocument();
    });
    expect(assign).not.toHaveBeenCalled();
  });
});
