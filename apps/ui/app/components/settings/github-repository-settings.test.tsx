import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GithubRepositorySettings } from '#components/settings/github-repository-settings.js';

const fixture = vi.hoisted(() => ({ list: vi.fn(), installations: vi.fn(), repositories: vi.fn() }));
vi.mock('#components/github/github-repository-write-settings.js', () => ({
  GithubRepositoryWriteSettings: () => <div>Write settings</div>,
}));
vi.mock('#lib/github-connections.js', () => ({
  configureGithubAccess: vi.fn(),
  githubConnections: {
    list: fixture.list,
    installations: fixture.installations,
    repositories: fixture.repositories,
  },
  GithubRequestError: class extends Error {},
  githubErrorMessage: () => 'GitHub could not be reached.',
}));

const owner = { id: 7, login: 'designer', avatarUrl: null, type: 'User' };
const renderSettings = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <GithubRepositorySettings />
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  fixture.installations.mockResolvedValue({
    installations: [
      { id: 1, owner, repositorySelection: 'selected', suspended: false, permissions: { contents: 'write' } },
    ],
    totalCount: 1,
    page: 1,
  });
  fixture.repositories.mockResolvedValue({
    repositories: [{ id: 2, fullName: 'designer/bracket', access: 'write', archived: false }],
    totalCount: 1,
    page: 1,
  });
});

describe('GitHub repository settings', () => {
  it('should offer one connect row when no account is connected', async () => {
    fixture.list.mockResolvedValue([]);
    renderSettings();
    expect(await screen.findByText('Connect GitHub')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeEnabled();
    expect(screen.queryByText('Repository access')).not.toBeInTheDocument();
  });

  it('should list the account, repository access and each repository with its permission', async () => {
    fixture.list.mockResolvedValue([{ id: 'connection', subject: 7, login: 'designer', generation: 1 }]);
    renderSettings();
    expect(await screen.findByRole('button', { name: 'Disconnect @designer' })).toBeVisible();
    expect(screen.getByRole('button', { name: /Change on GitHub/u })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add account' })).toBeVisible();
    expect(screen.queryByText('Connect GitHub')).not.toBeInTheDocument();
    const manage = await screen.findByRole('button', { name: 'Manage designer/bracket' });
    expect(screen.getByText('Read and write')).toBeVisible();
    expect(screen.getByText('Selected repositories')).toBeVisible();

    await userEvent.click(manage);
    expect(manage).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Write settings')).toBeVisible();
  });
});
