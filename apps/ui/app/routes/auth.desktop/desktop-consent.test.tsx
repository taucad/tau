// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/naming-convention -- OAuth wire parameters keep their spelling */

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readDesktopAuthorization, readDesktopSignInResult } from '#lib/desktop-oauth.js';
import type { DesktopAuthorization } from '#lib/desktop-oauth.js';
import { DesktopConsent } from '#routes/auth.desktop/desktop-consent.js';
import { DesktopResult } from '#routes/auth.desktop/desktop-result.js';

const mocks = vi.hoisted(() => ({
  session: { data: undefined as unknown, isPending: false, isError: false, refetch: vi.fn() },
  authFetch: vi.fn(),
}));

vi.mock('@better-auth-ui/react', () => ({
  useSession: () => mocks.session,
}));

vi.mock('#lib/auth-client.js', () => ({
  authClient: {
    // oxlint-disable-next-line @typescript-eslint/no-unsafe-return -- test double
    $fetch: (...args: unknown[]) => mocks.authFetch(...args),
  },
}));

vi.mock('#environment.config.js', () => ({
  requireClientEnvironmentUrl: () => 'https://api.tau.test',
}));

/** A signed query as the provider writes it: the request, `exp`, `ba_iat`, the signed names and `sig`. */
const signedQuery = (overrides: Record<string, string> = {}, extra = ''): string => {
  const request: Record<string, string> = {
    response_type: 'code',
    client_id: 'tau-desktop',
    redirect_uri: 'http://127.0.0.1:49152/cb/AAAAAAAAAAAAAAAAAAAAAAAA',
    scope: 'openid profile email offline_access',
    state: 'state-1',
    code_challenge: 'C'.repeat(43),
    code_challenge_method: 'S256',
    prompt: 'consent',
    exp: String(Math.floor(Date.now() / 1000) + 600),
    ba_iat: String(Date.now()),
    ...overrides,
  };
  const parameters = new URLSearchParams(request);
  for (const name of [...Object.keys(request), 'ba_param'].toSorted()) {
    parameters.append('ba_param', name);
  }
  parameters.set('sig', 'signature');
  return `?${parameters.toString()}${extra}`;
};

const authorizationOf = (search: string): DesktopAuthorization => {
  const authorization = readDesktopAuthorization(search);
  if (authorization === undefined) {
    throw new Error('Expected a signed request');
  }
  return authorization;
};

const user = {
  id: 'usr_1',
  email: 'person@example.test',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('readDesktopAuthorization', () => {
  it('keeps only the signed names in the query it answers the provider with', () => {
    const authorization = authorizationOf(`${signedQuery()}&redirectTo=%2Fx&continue=1`);

    const answered = new URLSearchParams(authorization.oauthQuery);
    expect(answered.get('redirectTo')).toBeNull();
    expect(answered.get('continue')).toBeNull();
    expect(answered.get('sig')).toBe('signature');
    expect(authorization.request.get('sig')).toBeNull();
    expect(authorization.request.get('client_id')).toBe('tau-desktop');
    expect(authorization.isContinuation).toBe(true);
  });

  it.each([
    ['another client', signedQuery({ client_id: 'other' })],
    ['no signature', '?client_id=tau-desktop&exp=1'],
    ['the legacy hand-off', '?state=abcd1234efgh'],
  ])('should not read %s as a desktop request', (_label, search) => {
    expect(readDesktopAuthorization(search)).toBeUndefined();
  });

  it('should treat prompt=login as a continuation', () => {
    expect(authorizationOf(signedQuery({ prompt: 'login consent' })).isContinuation).toBe(true);
    expect(authorizationOf(signedQuery()).isContinuation).toBe(false);
  });
});

describe('readDesktopSignInResult', () => {
  it.each([
    ['?result=signed-in', { kind: 'signed-in' }],
    ['?result=failed&reason=canceled', { kind: 'failed', reason: 'canceled' }],
    ['?result=failed&reason=expired', { kind: 'failed', reason: 'expired' }],
    ['?result=failed&reason=<script>', { kind: 'failed', reason: 'error' }],
    ['?state=x', undefined],
  ])('should read %s', (search, expected) => {
    expect(readDesktopSignInResult(search)).toEqual(expected);
  });
});

describe('DesktopConsent', () => {
  const assign = vi.fn();
  const replace = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('location', { assign, replace, search: '' });
    mocks.session = {
      data: { user, session: { createdAt: new Date() } },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    };
    mocks.authFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    assign.mockReset();
    replace.mockReset();
  });

  it('should name the account and the app, and send nothing before a click', async () => {
    render(<DesktopConsent authorization={authorizationOf(signedQuery())} />);

    expect(await screen.findByRole('heading', { name: 'Sign in to Tau Desktop?' })).toBeInTheDocument();
    expect(screen.getByText('person@example.test')).toBeInTheDocument();
    expect(screen.getByText('App: Tau Desktop')).toBeInTheDocument();
    expect(screen.queryByText('New account, created just now')).not.toBeInTheDocument();
    expect(mocks.authFetch).not.toHaveBeenCalled();
  });

  it('should keep Continue disabled for half a second, then answer the provider and follow its redirect', async () => {
    mocks.authFetch.mockResolvedValue({
      data: { url: 'http://127.0.0.1:49152/cb/A?code=c&state=state-1' },
      error: null,
    });
    render(<DesktopConsent authorization={authorizationOf(signedQuery())} />);
    const continueButton = await screen.findByRole('button', { name: 'Continue as person@example.test' });
    expect(continueButton).toBeDisabled();

    await waitFor(() => {
      expect(continueButton).toBeEnabled();
    });
    await userEvent.click(continueButton);

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith('http://127.0.0.1:49152/cb/A?code=c&state=state-1');
    });
    const [path, init] = mocks.authFetch.mock.calls[0] as [string, { body: { accept: boolean; oauth_query: string } }];
    expect(path).toBe('/oauth2/consent');
    expect(init.body.accept).toBe(true);
    expect(new URLSearchParams(init.body.oauth_query).get('sig')).toBe('signature');
  });

  it('should answer a cancel as a refusal', async () => {
    mocks.authFetch.mockResolvedValue({
      data: { url: 'http://127.0.0.1:49152/cb/A?error=access_denied' },
      error: null,
    });
    render(<DesktopConsent authorization={authorizationOf(signedQuery())} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel sign-in' }));

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith('http://127.0.0.1:49152/cb/A?error=access_denied');
    });
    expect((mocks.authFetch.mock.calls[0] as [string, { body: { accept: boolean } }])[1].body.accept).toBe(false);
  });

  it('should send "Use a different account" back to the provider with prompt=login', async () => {
    render(<DesktopConsent authorization={authorizationOf(signedQuery())} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Use a different account' }));

    const target = new URL(assign.mock.calls[0]?.[0] as string);
    expect(`${target.origin}${target.pathname}`).toBe('https://api.tau.test/v1/auth/oauth2/authorize');
    expect(target.searchParams.get('prompt')).toBe('login consent');
    expect(target.searchParams.get('sig')).toBeNull();
    expect(target.searchParams.get('client_id')).toBe('tau-desktop');
  });

  it('should say when the answer could not be sent, and offer Try again', async () => {
    mocks.authFetch.mockResolvedValue({ data: null, error: { status: 500 } });
    render(<DesktopConsent authorization={authorizationOf(signedQuery())} />);
    const continueButton = await screen.findByRole('button', { name: 'Continue as person@example.test' });
    await waitFor(() => {
      expect(continueButton).toBeEnabled();
    });

    await userEvent.click(continueButton);

    expect(await screen.findByRole('heading', { name: 'Couldn’t send your answer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
  });

  it('should mark an account created minutes ago', async () => {
    mocks.session = {
      data: { user: { ...user, createdAt: new Date() }, session: { createdAt: new Date() } },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    };
    render(<DesktopConsent authorization={authorizationOf(signedQuery())} />);

    expect(await screen.findByText('New account, created just now')).toBeInTheDocument();
  });

  it('should continue to the provider for consent only after a sign-in on the sign-in page', async () => {
    render(<DesktopConsent authorization={authorizationOf(signedQuery({}, '&continue=1'))} />);

    await waitFor(() => {
      expect(replace).toHaveBeenCalled();
    });
    const target = new URL(replace.mock.calls[0]?.[0] as string);
    expect(target.searchParams.get('prompt')).toBe('consent');
  });

  it('should say an expired request expired', async () => {
    render(
      <DesktopConsent
        authorization={authorizationOf(signedQuery({ exp: String(Math.floor(Date.now() / 1000) - 1) }))}
      />,
    );

    expect(await screen.findByRole('heading', { name: 'This sign-in link expired' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Continue/u })).not.toBeInTheDocument();
  });

  it('should offer Sign in to a signed-out browser', async () => {
    mocks.session = { data: null, isPending: false, isError: false, refetch: vi.fn() };
    render(<DesktopConsent authorization={authorizationOf(signedQuery())} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));

    expect(new URL(assign.mock.calls[0]?.[0] as string).searchParams.get('prompt')).toBe('consent');
  });

  it('should stop showing progress after ten seconds when the session never answers', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mocks.session = { data: undefined, isPending: true, isError: false, refetch: vi.fn() };
    render(<DesktopConsent authorization={authorizationOf(signedQuery())} />);
    expect(screen.getByRole('heading', { name: 'Checking this sign-in' })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_001);
    });

    expect(screen.getByRole('heading', { name: 'Couldn’t check this sign-in' })).toBeInTheDocument();
  });
});

describe('DesktopResult', () => {
  it.each([
    [{ kind: 'signed-in' } as const, 'You’re signed in to Tau Desktop'],
    [{ kind: 'failed', reason: 'canceled' } as const, 'Sign-in canceled'],
    [{ kind: 'failed', reason: 'expired' } as const, 'This sign-in expired'],
    [{ kind: 'failed', reason: 'error' } as const, 'Couldn’t sign in to Tau Desktop'],
  ])('should show %j as its title', (result, title) => {
    render(<DesktopResult result={result} />);

    expect(screen.getByText(title)).toBeInTheDocument();
  });
});
