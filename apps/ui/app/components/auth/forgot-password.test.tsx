// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ForgotPassword } from '#components/auth/forgot-password.js';

const authMocks = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
  resetFetchOptions: vi.fn(),
  setEmailDraft: vi.fn(),
}));

vi.mock('@better-auth-ui/react', () => ({
  useAuth: () => ({
    authClient: {},
    basePaths: { auth: '/auth' },
    baseURL: 'https://tau.new',
    localization: {
      auth: {
        email: 'Email',
        emailPlaceholder: 'you@example.com',
        forgotPassword: 'Forgot password',
        passwordResetEmailSent: 'Reset sent',
        rememberYourPassword: 'Remember your password?',
        sendResetLink: 'Send reset link',
        signIn: 'Sign in',
      },
    },
    plugins: [],
    viewPaths: { auth: { resetPassword: 'reset-password', signIn: 'sign-in' } },
    Link: ({ children, href, ...properties }: React.ComponentProps<'a'>) => (
      <a {...properties} href={href} rel='noreferrer'>
        {children}
      </a>
    ),
  }),
  useFetchOptions: () => ({
    fetchOptions: { headers: { 'x-test': 'true' } },
    resetFetchOptions: authMocks.resetFetchOptions,
  }),
  useRequestPasswordReset: () => ({
    mutate: authMocks.requestPasswordReset,
    isPending: false,
  }),
}));

vi.mock('#components/auth/auth-email-draft.js', () => ({
  useAuthEmailDraft: () => ({
    emailDraft: '',
    setEmailDraft: authMocks.setEmailDraft,
  }),
}));

describe('ForgotPassword', () => {
  beforeEach(() => {
    authMocks.requestPasswordReset.mockReset();
    authMocks.resetFetchOptions.mockReset();
    authMocks.setEmailDraft.mockReset();
  });

  it('requests password reset with the frontend reset route as redirectTo', async () => {
    const user = userEvent.setup();
    render(<ForgotPassword />);

    await user.type(screen.getByLabelText('Email'), 'richard@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(authMocks.requestPasswordReset).toHaveBeenCalledWith({
      email: 'richard@example.com',
      redirectTo: 'https://tau.new/auth/reset-password',
      fetchOptions: { headers: { 'x-test': 'true' } },
    });
  });
});
