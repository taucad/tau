// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import -- registers DOM matchers for this test module
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GithubPermissions } from '#components/auth/settings/security/github-permissions.js';

const accounts = vi.hoisted(() => ({ data: undefined as unknown }));

vi.mock('@better-auth-ui/react', () => ({
  providerIcons: { github: (properties: React.ComponentProps<'svg'>) => <svg {...properties} /> },
  useAuth: () => ({ authClient: {} }),
  useListAccounts: () => ({ data: accounts.data, isPending: false }),
}));

describe('GithubPermissions (R9)', () => {
  beforeEach(() => {
    accounts.data = undefined;
  });

  it('should link to the GitHub grant behind sign-in and Gist access', () => {
    accounts.data = [{ id: 'account-1', providerId: 'github', accountId: '1', scopes: ['read:user', 'gist'] }];

    render(<GithubPermissions />);

    expect(screen.getByRole('region', { name: 'GitHub permissions' })).toMatchTextContent('Sign-in and Gist access');
    expect(screen.getByRole('link', { name: 'Review GitHub permissions' })).toHaveAttribute(
      'href',
      'https://github.com/settings/applications',
    );
    expect(screen.getByRole('link', { name: 'Review GitHub permissions' })).toHaveAttribute('target', '_blank');
  });

  it('should name only sign-in before Gist access is allowed', () => {
    accounts.data = [{ id: 'account-1', providerId: 'github', accountId: '1', scopes: ['read:user'] }];

    render(<GithubPermissions />);

    expect(screen.getByText('Sign-in access')).toBeInTheDocument();
  });

  it('should stay out of the way without a linked GitHub account', () => {
    accounts.data = [{ id: 'account-2', providerId: 'google', accountId: '2', scopes: [] }];

    render(<GithubPermissions />);

    expect(screen.queryByRole('link', { name: 'Review GitHub permissions' })).not.toBeInTheDocument();
  });
});
