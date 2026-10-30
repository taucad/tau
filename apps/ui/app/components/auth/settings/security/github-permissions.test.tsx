import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GithubPermissions } from '#components/auth/settings/security/github-permissions.js';

const fixture = vi.hoisted(() => ({ capability: vi.fn(), use: vi.fn() }));
vi.mock('@better-auth-ui/react', () => ({
  useAuth: () => ({ authClient: {} }),
  useListAccounts: () => ({ data: [{ id: 'account', providerId: 'github', scopes: ['gist'] }], isPending: false }),
}));
vi.mock('#components/auth/settings/security/linked-account.js', () => ({
  LinkedAccount: () => <div>Connected sign-in account</div>,
}));
vi.mock('#lib/share-providers.js', () => ({
  getGithubGistCapability: fixture.capability,
  setGithubGistEnabled: fixture.use,
}));
const renderSettings = () =>
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}
      >
        <GithubPermissions />
      </QueryClientProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  fixture.capability.mockResolvedValue({
    status: 'permission-required',
    enabled: true,
    grantedScopes: ['read:user'],
    authorizationUrl: 'https://github.com/settings/connections/applications/client-id',
  });
  fixture.use.mockResolvedValue(undefined);
});
describe('GitHub sign-in and Gist sharing in Security', () => {
  it('should show the sign-in row and the exact OAuth authorization without repository controls', async () => {
    renderSettings();
    expect(await screen.findByRole('link', { name: 'Review on GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/settings/connections/applications/client-id',
    );
    expect(screen.getByText('Connected sign-in account')).toBeVisible();
    expect(screen.getByText(/Not granted yet/u)).toBeVisible();
    expect(screen.queryByRole('switch', { name: 'Gist sharing' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'GitHub repositories' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enable writes' })).not.toBeInTheDocument();
  });
  it('should turn off Gist sharing from its switch', async () => {
    fixture.capability.mockResolvedValue({
      status: 'connected',
      enabled: true,
      grantedScopes: ['gist'],
      authorizationUrl: 'https://github.com/settings/connections/applications/client-id',
    });
    renderSettings();
    const toggle = await screen.findByRole('switch', { name: 'Gist sharing' });
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);
    expect(fixture.use).toHaveBeenCalledWith(false, expect.anything());
  });
  it('should show verification failures without claiming a grant from the stored account', async () => {
    fixture.capability.mockRejectedValue(new Error('unavailable'));
    renderSettings();
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be checked');
    expect(screen.queryByRole('switch', { name: 'Gist sharing' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });
});
