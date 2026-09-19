// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AuthDesktopRoute, { buildDesktopCallbackUrl, parseDesktopHandoffTarget } from '#routes/auth.desktop/route.js';

const mocks = vi.hoisted(() => ({
  search: '?state=abcd1234efgh',
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
  it('accepts the opaque nonce on its own, with no port', () => {
    expect(parseDesktopHandoffTarget('?state=abcd1234efgh')).toEqual({ state: 'abcd1234efgh' });
  });

  /* The loopback listener is gone with R4: the callback goes to the app's own
     scheme, so there is no port for a caller to point somewhere else. */
  it('ignores a port a caller still tries to supply', () => {
    expect(parseDesktopHandoffTarget('?port=51234&state=abcd1234efgh')).toEqual({ state: 'abcd1234efgh' });
  });

  it.each([
    ['a missing state', '?'],
    ['a state with only a port beside it', '?port=51234'],
    ['a too-short state', '?state=abc'],
    ['a state carrying URL separators', '?state=abcd1234%26evil%3D1'],
    ['a state carrying a path traversal', '?state=..%2F..%2Fetc'],
  ])('rejects %s', (_label, search) => {
    expect(parseDesktopHandoffTarget(search)).toBeUndefined();
  });
});

describe('buildDesktopCallbackUrl', () => {
  it('targets the app scheme and echoes the state alongside the token', () => {
    expect(buildDesktopCallbackUrl({ state: 'abcd1234efgh' }, 'ott-value')).toBe(
      'tau://auth/callback?ott=ott-value&state=abcd1234efgh',
    );
  });
});

describe('AuthDesktopRoute', () => {
  const assign = vi.fn();

  beforeEach(() => {
    mocks.search = '?state=abcd1234efgh';
    mocks.session = { user: { id: 'usr_1' } };
    mocks.authFetch.mockResolvedValue({ data: { token: 'ott-value' }, error: null });
    vi.stubGlobal('location', { href: 'http://app.test/auth/desktop', assign });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // MAJOR 2: any site can navigate a signed-in browser here. Minting on mount
  // would hand a session-bearing token to whatever claims `tau://`, with no
  // user in the loop.
  it('mints nothing until the user confirms, even with a valid request', async () => {
    render(<AuthDesktopRoute />);

    expect(screen.getByRole('button', { name: /connect to tau desktop/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(mocks.authFetch).not.toHaveBeenCalled();
    });
    expect(assign).not.toHaveBeenCalled();
  });

  it('says what it is asking for and how long the request lives', () => {
    render(<AuthDesktopRoute />);

    expect(
      screen.getByText('Only continue if you just started sign-in from Tau Desktop on this computer.'),
    ).toBeInTheDocument();
    expect(screen.getByText('This request expires in 5 minutes.')).toBeInTheDocument();
  });

  it('mints a one-time token and navigates to the app scheme on confirmation', async () => {
    render(<AuthDesktopRoute />);

    await userEvent.click(screen.getByRole('button', { name: /connect to tau desktop/i }));

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith('tau://auth/callback?ott=ott-value&state=abcd1234efgh');
    });
    expect(mocks.authFetch).toHaveBeenCalledWith('/one-time-token/generate');
    expect(screen.getByText('Opening Tau Desktop')).toBeInTheDocument();
  });

  /* The fallback is a visible button, never a timer, and sign-in is the one
     flow with no browser continuation to offer instead. */
  it('offers a way out of opening, and re-offers the same unspent token', async () => {
    render(<AuthDesktopRoute />);

    await userEvent.click(screen.getByRole('button', { name: /connect to tau desktop/i }));
    await userEvent.click(await screen.findByRole('button', { name: 'Tau Desktop didn’t open' }));

    expect(screen.getByText('Tau Desktop didn’t open')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Get Tau Desktop' })).toHaveAttribute('href', 'https://docs.tau.new');
    expect(
      screen.getByText('To sign in without the desktop app, close this tab and use Tau in the browser.'),
    ).toBeInTheDocument();

    assign.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(assign).toHaveBeenCalledWith('tau://auth/callback?ott=ott-value&state=abcd1234efgh');
    expect(mocks.authFetch).toHaveBeenCalledTimes(1);
  });

  it('never mints a token for a malformed request', async () => {
    mocks.search = '?state=abc';

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
