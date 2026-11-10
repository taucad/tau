// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import { localization } from '@better-auth-ui/core';
import type * as BetterAuthReact from '@better-auth-ui/react';
import type { PropsWithChildren } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignIn, socialSignInErrorMessage } from '#components/auth/sign-in.js';

const state = vi.hoisted(() => ({
  error: vi.fn(),
  sendVerification: vi.fn(),
  signInOptions: undefined as { onError?: (error: unknown, variables: { email: string }) => void } | undefined,
}));
vi.mock('sonner', () => ({ toast: { error: state.error, success: vi.fn() } }));
vi.mock('@tanstack/react-query', () => ({ useIsMutating: () => 0 }));
vi.mock('#components/auth/auth-email-draft.js', () => ({
  useAuthEmailDraft: () => ({ emailDraft: '', setEmailDraft: vi.fn() }),
}));
vi.mock('@better-auth-ui/react', async (importOriginal) => ({
  ...(await importOriginal<typeof BetterAuthReact>()),
  useAuth: () => ({
    authClient: {},
    basePaths: { auth: '/auth' },
    baseURL: 'https://tau.test',
    emailAndPassword: { enabled: true, forgotPassword: true },
    localization,
    plugins: [],
    redirectTo: '/',
    socialProviders: [],
    viewPaths: { auth: { signIn: 'sign-in', signUp: 'sign-up', forgotPassword: 'forgot-password' } },
    navigate: vi.fn(),
    Link: ({ children }: PropsWithChildren) => <span>{children}</span>,
  }),
  useFetchOptions: () => ({ fetchOptions: {}, resetFetchOptions: vi.fn() }),
  useSignInEmail: (_client: unknown, options: typeof state.signInOptions) => {
    state.signInOptions = options;
    return { mutate: vi.fn(), isPending: false };
  },
  useSendVerificationEmail: () => ({ mutate: state.sendVerification, isPending: false }),
}));
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
});

const renderAt = (path: string): void => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <SignIn />
    </MemoryRouter>,
  );
};

describe('SignIn', () => {
  it('shows "Check your email" for an unverified address instead of offering a second send', async () => {
    renderAt('/auth/sign-in');

    act(() => {
      state.signInOptions?.onError?.(
        { error: { code: 'EMAIL_NOT_VERIFIED', message: 'Email not verified' } },
        { email: 'pending@example.test' },
      );
    });

    expect(await screen.findByRole('heading', { level: 1, name: 'Check your email' })).toBeInTheDocument();
    expect(screen.getByText('pending@example.test')).toBeInTheDocument();
    // The API sent a link with the refusal, so another cannot be requested straight away.
    expect(screen.getByRole('button', { name: /resend email in/i })).toBeDisabled();
    expect(state.error).not.toHaveBeenCalled();
    expect(state.sendVerification).not.toHaveBeenCalled();
  });

  it('explains a social sign-in refused for an unverified password account', () => {
    renderAt('/auth/sign-in?error=account_not_linked');

    expect(state.error).toHaveBeenCalledWith(socialSignInErrorMessage('account_not_linked'), {
      id: 'social-sign-in-error',
    });
    expect(socialSignInErrorMessage('account_not_linked')).toContain('not verified yet');
  });

  it('falls back to a generic line for an unknown social error', () => {
    expect(socialSignInErrorMessage('something_else')).toBe(
      "We couldn't sign you in with that provider. Please try again.",
    );
  });
});
