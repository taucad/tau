import { act, render, screen } from '@testing-library/react';
import type React from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VerifyEmail, sanitizeVerifyEmailRedirectTo } from '#components/auth/verify-email.js';

const authMocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  verifyEmail: vi.fn(),
}));

vi.mock('@better-auth-ui/react', () => ({
  useAuth: () => ({
    authClient: {
      verifyEmail: authMocks.verifyEmail,
    },
    basePaths: { auth: '/auth' },
    viewPaths: { auth: { signIn: 'sign-in' } },
    navigate: authMocks.navigate,
    Link: ({ children, href, ...properties }: React.ComponentProps<'a'>) => (
      <a {...properties} href={href} rel='noreferrer'>
        {children}
      </a>
    ),
  }),
}));

const renderVerifyEmail = (path: string): ReturnType<typeof render> => {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <VerifyEmail />
    </MemoryRouter>,
  );
};

const flushAsyncEffects = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve();
  });
};

describe('VerifyEmail', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    authMocks.navigate.mockReset();
    authMocks.verifyEmail.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('verifies the token and redirects to a sanitized app path', async () => {
    authMocks.verifyEmail.mockResolvedValue({ data: {}, error: null });

    renderVerifyEmail('/auth/verify-email?token=abc&redirectTo=%2Fv%2Fpub_123');

    await flushAsyncEffects();

    expect(authMocks.verifyEmail).toHaveBeenCalledWith({ query: { token: 'abc' } });
    expect(screen.getByText('Email verified')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(900);
    });

    expect(authMocks.navigate).toHaveBeenCalledWith({ to: '/v/pub_123', replace: true });
  });

  it('shows a recovery state when the token is missing', () => {
    renderVerifyEmail('/auth/verify-email');

    expect(screen.getByText('Verification link is missing')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/auth/sign-in');
    expect(authMocks.verifyEmail).not.toHaveBeenCalled();
  });

  it('shows a recovery state when verification fails', async () => {
    authMocks.verifyEmail.mockResolvedValue({ data: null, error: { message: 'expired' } });

    renderVerifyEmail('/auth/verify-email?token=abc&redirectTo=%2Fv%2Fpub_123');

    await flushAsyncEffects();

    expect(screen.getByText("We couldn't verify your email")).toBeInTheDocument();
    expect(authMocks.navigate).not.toHaveBeenCalled();
  });
});

describe('sanitizeVerifyEmailRedirectTo', () => {
  it('keeps relative app paths and rejects external URLs', () => {
    expect(sanitizeVerifyEmailRedirectTo('/v/pub_123?pane=share')).toBe('/v/pub_123?pane=share');
    expect(sanitizeVerifyEmailRedirectTo('https://example.com/steal')).toBe('/');
    expect(sanitizeVerifyEmailRedirectTo('//example.com/steal')).toBe('/');
  });
});
