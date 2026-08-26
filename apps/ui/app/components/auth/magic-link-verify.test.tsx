// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, render, screen } from '@testing-library/react';
import type React from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MagicLinkVerify } from '#components/auth/magic-link-verify.js';

const authMocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  verifyMagicLink: vi.fn(),
}));

vi.mock('@better-auth-ui/react', () => ({
  useAuth: () => ({
    authClient: {
      magicLink: {
        verify: authMocks.verifyMagicLink,
      },
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

const renderMagicLinkVerify = (path: string): ReturnType<typeof render> => {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MagicLinkVerify />
    </MemoryRouter>,
  );
};

const flushAsyncEffects = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve();
  });
};

describe('MagicLinkVerify', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    authMocks.navigate.mockReset();
    authMocks.verifyMagicLink.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('verifies the token and redirects to a sanitized app path', async () => {
    authMocks.verifyMagicLink.mockResolvedValue({ data: {}, error: null });

    renderMagicLinkVerify('/auth/magic-link/verify?token=abc&redirectTo=%2Fv%2Fpub_123');

    await flushAsyncEffects();

    expect(authMocks.verifyMagicLink).toHaveBeenCalledWith({
      query: { token: 'abc', callbackURL: '/v/pub_123' },
    });
    expect(screen.getByText('Magic link verified')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(900);
    });

    expect(authMocks.navigate).toHaveBeenCalledWith({ to: '/v/pub_123', replace: true });
  });

  it('falls back to home when redirectTo is external', async () => {
    authMocks.verifyMagicLink.mockResolvedValue({ data: {}, error: null });

    renderMagicLinkVerify('/auth/magic-link/verify?token=abc&redirectTo=https%3A%2F%2Fexample.com%2Fsteal');

    await flushAsyncEffects();

    expect(authMocks.verifyMagicLink).toHaveBeenCalledWith({
      query: { token: 'abc', callbackURL: '/' },
    });
  });

  it('shows a recovery state when the token is missing', () => {
    renderMagicLinkVerify('/auth/magic-link/verify');

    expect(screen.getByText('Magic link is missing')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/auth/sign-in');
    expect(authMocks.verifyMagicLink).not.toHaveBeenCalled();
  });

  it('shows a recovery state when verification fails', async () => {
    authMocks.verifyMagicLink.mockResolvedValue({ data: null, error: { message: 'expired' } });

    renderMagicLinkVerify('/auth/magic-link/verify?token=abc&redirectTo=%2Fv%2Fpub_123');

    await flushAsyncEffects();

    expect(screen.getByText("We couldn't verify your magic link")).toBeInTheDocument();
    expect(authMocks.navigate).not.toHaveBeenCalled();
  });
});
