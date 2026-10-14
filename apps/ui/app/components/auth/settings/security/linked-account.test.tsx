// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import -- registers DOM matchers for this test module
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Account } from 'better-auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LinkedAccount } from '#components/auth/settings/security/linked-account.js';

const authState = vi.hoisted(() => ({
  unlinkAccount: vi.fn(),
  linkSocial: vi.fn(),
}));

vi.mock('@better-auth-ui/react', () => ({
  providerIcons: {},
  useAuth: () => ({
    authClient: {},
    baseURL: 'https://tau.example',
    localization: {
      settings: {
        accountUnlinked: 'Account unlinked',
        cancel: 'Cancel',
        link: 'Link',
        linkProvider: 'Link your {{provider}} account',
        unlinkProvider: 'Unlink {{provider}}',
      },
    },
  }),
  useAccountInfo: () => ({
    data: { user: { id: 'octocat', email: 'octo@example.com', name: 'Octo' } },
    isPending: false,
  }),
  useLinkSocial: () => ({ mutate: authState.linkSocial, isPending: false }),
  useUnlinkAccount: () => ({ mutate: authState.unlinkAccount, isPending: false }),
}));

const githubAccount = {
  id: 'account-1',
  accountId: '583231',
  providerId: 'github',
  userId: 'user-1',
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-01T00:00:00Z'),
} satisfies Account;

describe('LinkedAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('should ask before unlinking and name what the person loses (R7)', async () => {
    render(<LinkedAccount account={githubAccount} provider='github' />);

    await userEvent.click(screen.getByRole('button', { name: 'Unlink GitHub' }));

    expect(authState.unlinkAccount).not.toHaveBeenCalled();
    const dialog = screen.getByRole('alertdialog', { name: 'Unlink GitHub?' });
    expect(dialog).toHaveTextContent(
      'You will no longer be able to sign in to Tau with GitHub (octo@example.com). Tau also uses this account to publish and manage your GitHub Gists.',
    );

    await userEvent.click(within(dialog).getByRole('button', { name: 'Unlink GitHub' }));

    expect(authState.unlinkAccount).toHaveBeenCalledExactlyOnceWith({ providerId: 'github' });
  });

  it('should keep the account linked when the confirmation is cancelled', async () => {
    render(<LinkedAccount account={githubAccount} provider='github' />);

    await userEvent.click(screen.getByRole('button', { name: 'Unlink GitHub' }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(authState.unlinkAccount).not.toHaveBeenCalled();
  });
});
