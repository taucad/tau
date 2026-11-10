// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { localization } from '@better-auth-ui/core';
import type { AdditionalField as AdditionalFieldConfig } from '@better-auth-ui/core';
import type * as BetterAuthReact from '@better-auth-ui/react';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignUp } from '#components/auth/sign-up.js';

const state = vi.hoisted(() => ({
  fields: [] as AdditionalFieldConfig[],
  signUp: vi.fn(),
  error: vi.fn(),
  navigate: vi.fn(),
  signUpOptions: undefined as { onSuccess?: (data: unknown, variables: { email: string }) => void } | undefined,
}));
vi.mock('sonner', () => ({ toast: { error: state.error, success: vi.fn() } }));
vi.mock('@tanstack/react-query', () => ({ useIsMutating: () => 0 }));
vi.mock('#components/auth/auth-email-draft.js', () => ({
  useAuthEmailDraft: () => ({ emailDraft: 'person@example.test', setEmailDraft: vi.fn() }),
}));
vi.mock('@better-auth-ui/react', async (importOriginal) => ({
  ...(await importOriginal<typeof BetterAuthReact>()),
  useAuth: () => ({
    additionalFields: state.fields,
    authClient: {},
    basePaths: { auth: '/auth' },
    baseURL: 'https://tau.test',
    emailAndPassword: {
      enabled: true,
      name: false,
      confirmPassword: false,
      requireEmailVerification: true,
    },
    localization,
    plugins: [],
    redirectTo: '/',
    socialProviders: [],
    viewPaths: { auth: { signIn: 'sign-in' } },
    navigate: state.navigate,
    Link: ({ children }: PropsWithChildren) => <span>{children}</span>,
  }),
  useFetchOptions: () => ({ fetchOptions: {}, resetFetchOptions: vi.fn() }),
  useSignUpEmail: (_client: unknown, options: typeof state.signUpOptions) => {
    state.signUpOptions = options;
    return { mutate: state.signUp, isPending: false };
  },
  useSendVerificationEmail: () => ({ mutate: vi.fn(), isPending: false }),
}));
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
});

describe('custom additional field submission boundary', () => {
  it.each([
    ['string', '', false],
    ['string', 'provided', true],
    ['boolean', false, false],
    ['boolean', true, true],
  ] as const)('validates required %s value %s before calling auth', async (type, defaultValue, accepted) => {
    state.fields = [
      {
        name: 'extra',
        label: 'Extra',
        type,
        defaultValue,
        required: true,
        signUp: 'above',
        render: () => null,
      },
    ];
    const { container } = render(<SignUp />);
    const form = container.querySelector('form');
    if (!form) {
      throw new Error('Expected sign-up form');
    }
    fireEvent.submit(form);
    if (accepted) {
      await waitFor(() => {
        expect(state.signUp).toHaveBeenCalledOnce();
      });
      expect(state.signUp).toHaveBeenCalledWith(expect.objectContaining({ extra: defaultValue }));
      expect(state.error).not.toHaveBeenCalled();
    } else {
      await waitFor(() => {
        expect(state.error).toHaveBeenCalledWith(localization.auth.fieldRequired);
      });
      expect(state.signUp).not.toHaveBeenCalled();
    }
  });
});

describe('after a sign-up that needs verification', () => {
  it('names the address and stays on the page instead of going home signed out', async () => {
    state.fields = [];
    render(<SignUp />);

    act(() => {
      state.signUpOptions?.onSuccess?.({ token: null }, { email: 'new@example.test' });
    });

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Check your email',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('new@example.test')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /resend email in/i })).toBeDisabled();
    expect(state.navigate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Use a different email' }));
    expect(screen.queryByRole('heading', { name: 'Check your email' })).not.toBeInTheDocument();
  });
});
