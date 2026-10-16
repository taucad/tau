import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GithubPermissions } from '#components/auth/settings/security/github-permissions.js';

const fixture = vi.hoisted(() => ({ capability: vi.fn(), use: vi.fn(), connections: vi.fn() }));
vi.mock('@better-auth-ui/react', () => ({
  providerIcons: { github: (properties: React.ComponentProps<'svg'>) => <svg {...properties} /> },
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
vi.mock('#lib/github-connections.js', () => ({
  githubConnections: { list: fixture.connections },
  githubErrorMessage: () => 'Access could not be checked.',
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
  fixture.connections.mockResolvedValue([{ id: 'connection', login: 'designer' }]);
  fixture.use.mockResolvedValue(undefined);
});
describe('independent GitHub Security connections', () => {
  it('should show two connections and the exact OAuth authorization without repository write controls', async () => {
    renderSettings();
    expect(await screen.findByRole('link', { name: 'Review authorization on GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/settings/connections/applications/client-id',
    );
    expect(screen.getByRole('region', { name: 'GitHub sign-in and Gists' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'GitHub repositories' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Manage repositories' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Enable writes' })).not.toBeInTheDocument();
    expect(screen.getByText(/Gist access not granted/u)).toBeVisible();
    expect(screen.queryByText('Granted by GitHub')).not.toBeInTheDocument();
  });
  it('should turn off Gist use without disconnecting repository access', async () => {
    fixture.capability.mockResolvedValue({
      status: 'connected',
      enabled: true,
      grantedScopes: ['gist'],
      authorizationUrl: 'https://github.com/settings/connections/applications/client-id',
    });
    renderSettings();
    await userEvent.click(await screen.findByRole('button', { name: 'Turn off Gist sharing' }));
    expect(fixture.use).toHaveBeenCalledWith(false, expect.anything());
    expect(screen.getByRole('button', { name: 'Manage repositories' })).toBeVisible();
  });
  it('should show verification failures without claiming a grant from the stored account', async () => {
    fixture.capability.mockRejectedValue(new Error('unavailable'));
    renderSettings();
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be checked');
    expect(screen.queryByText(/Gist access granted/u)).not.toBeInTheDocument();
  });
});
