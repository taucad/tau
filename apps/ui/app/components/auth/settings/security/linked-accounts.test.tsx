// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LinkedAccounts } from '#components/auth/settings/security/linked-accounts.js';

vi.mock('@better-auth-ui/react', () => ({
  useAuth: () => ({
    authClient: {},
    localization: { settings: { linkedAccounts: 'Linked accounts' } },
    socialProviders: ['github', { id: 'company-sso', label: 'Company' }, { id: 'other-sso', label: 'Other' }],
  }),
  useListAccounts: () => ({
    data: [{ id: 'row-1', providerId: 'company-sso' }],
    isPending: false,
  }),
}));
vi.mock('#components/auth/settings/security/linked-account.js', () => ({
  LinkedAccount: ({ provider, account }: { provider: string; account?: { id: string } }) => (
    <span data-testid='account'>{`${provider}:${account?.id ?? 'unlinked'}`}</span>
  ),
}));
afterEach(cleanup);

describe('linked provider IDs', () => {
  it('matches custom provider IDs without duplicating an already linked account', () => {
    render(<LinkedAccounts />);
    expect(screen.getAllByTestId('account').map((row) => row.textContent)).toEqual([
      'company-sso:row-1',
      'github:unlinked',
      'other-sso:unlinked',
    ]);
  });
});
