// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { localization } from '@better-auth-ui/core';
import type * as BetterAuthReact from '@better-auth-ui/react';
import type { PropsWithChildren } from 'react';
import type * as ReactRouter from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ResetPassword } from '#components/auth/reset-password.js';
import { passwordResetSignInState } from '#components/auth/sign-in.js';

const state = vi.hoisted(() => ({
  authNavigate: vi.fn(),
  routerNavigate: vi.fn(),
  success: vi.fn(),
  resetOptions: undefined as { onSuccess?: () => void } | undefined,
  resetPassword: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: state.success } }));
vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  useNavigate: () => state.routerNavigate,
}));
vi.mock('@better-auth-ui/react', async (importOriginal) => ({
  ...(await importOriginal<typeof BetterAuthReact>()),
  useAuth: () => ({
    authClient: {},
    basePaths: { auth: '/auth' },
    emailAndPassword: { enabled: true, confirmPassword: false },
    localization,
    viewPaths: { auth: { signIn: 'sign-in' } },
    navigate: state.authNavigate,
    Link: ({ children }: PropsWithChildren) => <span>{children}</span>,
  }),
  useResetPassword: (_client: unknown, options: typeof state.resetOptions) => {
    state.resetOptions = options;
    return { mutate: state.resetPassword, isPending: false };
  },
}));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  globalThis.history.replaceState(null, '', '/');
});
beforeEach(() => {
  vi.clearAllMocks();
  globalThis.history.replaceState(null, '', '/auth/reset-password?token=reset-token');
});

describe('ResetPassword', () => {
  it('hands sign-in the reset confirmation through router state, not the URL', async () => {
    const user = userEvent.setup();
    render(<ResetPassword />);

    await user.type(screen.getByLabelText(localization.auth.password), 'a-new-password');
    await user.click(screen.getByRole('button', { name: localization.auth.resetPassword }));
    expect(state.resetPassword).toHaveBeenCalledWith({ token: 'reset-token', newPassword: 'a-new-password' });

    state.resetOptions?.onSuccess?.();

    expect(state.routerNavigate).toHaveBeenCalledWith('/auth/sign-in', {
      replace: true,
      state: passwordResetSignInState,
    });
    expect(state.success).not.toHaveBeenCalled();
    expect(state.authNavigate).not.toHaveBeenCalled();
  });

  it('keeps the toast when the desktop shell owns sign-in', () => {
    vi.stubEnv('TAU_TARGET', 'desktop');
    render(<ResetPassword />);

    state.resetOptions?.onSuccess?.();

    expect(state.success).toHaveBeenCalledWith(localization.auth.passwordResetSuccess);
    expect(state.authNavigate).toHaveBeenCalledWith({ to: '/auth/sign-in' });
    expect(state.routerNavigate).not.toHaveBeenCalled();
  });
});
