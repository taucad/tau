// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { localization } from '@better-auth-ui/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChangePassword } from '#components/auth/settings/security/change-password.js';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@better-auth-ui/react', () => ({
  useAuth: () => ({
    authClient: {},
    emailAndPassword: { enabled: true, confirmPassword: false },
    localization,
  }),
  useSession: () => ({ data: { session: { id: 'session-id' }, user: { email: 'user@example.test' } } }),
  useListAccounts: () => ({ data: [{ providerId: 'credential' }], isPending: false }),
  useChangePassword: () => ({ mutate: vi.fn(), isPending: false }),
  useRequestPasswordReset: () => ({ mutate: vi.fn(), isPending: false }),
}));

afterEach(cleanup);

describe('ChangePassword', () => {
  it('says beside the submit that other devices will be signed out', () => {
    render(<ChangePassword />);

    expect(screen.getByRole('button', { name: localization.settings.updatePassword })).toHaveAccessibleDescription(
      'Your other devices will be signed out.',
    );
  });
});
