import { act, render, screen } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { GithubRepositoryPicker } from '#components/github/github-repository-picker.js';
import { GithubRequestError } from '#lib/github-connections.js';
import type * as GithubConnectionsModule from '#lib/github-connections.js';

const github = vi.hoisted(() => ({
  list: vi.fn(),
  installations: vi.fn(),
  repositories: vi.fn(),
  branches: vi.fn(),
  tree: vi.fn(),
  token: vi.fn(),
  start: vi.fn(),
  complete: vi.fn(),
  cancel: vi.fn(),
  configuration: vi.fn(),
  remove: vi.fn(),
  branch: vi.fn(),
}));
const desktop = vi.hoisted(() => ({ current: false }));
const plan = vi.hoisted(() => ({ canConnectGitHub: true, isResolved: true, requestUpgrade: vi.fn() }));
const session = vi.hoisted((): { current: { user: { id: string } } | undefined } => ({
  current: { user: { id: 'tau-user' } },
}));

vi.mock('#lib/github-connections.js', async (importOriginal) => ({
  ...(await importOriginal<typeof GithubConnectionsModule>()),
  githubConnections: github,
}));
vi.mock('#filesystem/desktop-bridge.js', () => ({
  get isDesktopTarget() {
    return desktop.current;
  },
}));
vi.mock('#cloud/commercial-features.js', () => ({
  CommercialUpgradeLabel: () => 'Upgrade',
  useCommercialFeatures: () => plan,
}));

const renderPicker = (ui: React.JSX.Element): RenderResult =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );

const repositoryOf = (overrides: Partial<{ id: number; name: string; access: string }> = {}) => ({
  id: 30,
  name: 'part',
  fullName: `octo/${overrides.name ?? 'part'}`,
  owner: { id: 10, login: 'octo', avatarUrl: null, type: 'User' },
  visibility: 'private',
  access: 'write',
  archived: false,
  disabled: false,
  description: null,
  defaultBranch: 'main',
  htmlUrl: 'https://github.com/octo/part',
  cloneUrl: 'https://github.com/octo/part.git',
  ...overrides,
});
vi.mock('#lib/auth-client.js', () => ({ authClient: {} }));
vi.mock('@better-auth-ui/react', () => ({ useSession: () => ({ data: session.current, isPending: false }) }));

describe('GithubRepositoryPicker', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    desktop.current = false;
    plan.canConnectGitHub = true;
    plan.isResolved = true;
    session.current = { user: { id: 'tau-user' } };
    github.configuration.mockResolvedValue({ installUrl: 'https://github.com/apps/tau/installations/new' });
    HTMLElement.prototype.scrollIntoView = vi.fn();
    github.list.mockResolvedValue([
      { id: 'connection-1', subject: 7, login: 'octo', avatarUrl: undefined, generation: 1 },
    ]);
    github.installations.mockResolvedValue({
      totalCount: 2,
      page: 1,
      installations: [
        {
          id: 20,
          owner: { id: 20, login: 'acme', avatarUrl: null, type: 'Organization' },
          repositorySelection: 'selected',
          suspended: false,
          permissions: { contents: 'write' },
        },
        {
          id: 10,
          owner: { id: 10, login: 'octo', avatarUrl: null, type: 'User' },
          repositorySelection: 'all',
          suspended: false,
          permissions: { contents: 'write' },
        },
      ],
    });
    github.repositories.mockResolvedValue({ totalCount: 0, page: 1, repositories: [] });
    github.branches.mockResolvedValue({ page: 1, branches: [] });
  });

  it('groups personal and organization installations and switches the repository catalog by installation id', async () => {
    await act(async () => {
      renderPicker(<GithubRepositoryPicker onSelect={vi.fn()} />);
    });

    await vi.waitFor(() => {
      expect(github.repositories).toHaveBeenCalledWith('connection-1', 10);
    });
    const octoButtons = await screen.findAllByRole('button', { name: /octo/i });
    expect(octoButtons).toHaveLength(2);
    await userEvent.click(octoButtons[1]!);
    expect(await screen.findByText('Personal')).toBeInTheDocument();
    expect(screen.getByText('Organizations')).toBeInTheDocument();
    await userEvent.click(screen.getByText('acme'));

    await vi.waitFor(() => {
      expect(github.repositories).toHaveBeenLastCalledWith('connection-1', 20);
    });
  });

  it('allows an archived repository to be imported with read-only access', async () => {
    github.repositories.mockResolvedValue({
      totalCount: 1,
      page: 1,
      repositories: [
        {
          id: 30,
          name: 'archive',
          fullName: 'octo/archive',
          owner: { id: 10, login: 'octo', avatarUrl: null, type: 'User' },
          visibility: 'private',
          access: 'read',
          archived: true,
          disabled: false,
          description: 'Archived design',
          defaultBranch: 'main',
          htmlUrl: 'https://github.com/octo/archive',
          cloneUrl: 'https://github.com/octo/archive.git',
        },
      ],
    });

    await act(async () => {
      renderPicker(<GithubRepositoryPicker onSelect={vi.fn()} />);
    });
    await vi.waitFor(() => {
      expect(github.repositories).toHaveBeenCalledWith('connection-1', 10);
    });
    await userEvent.click(screen.getByRole('button', { name: /select repository/i }));
    const archived = await screen.findByRole('option', { name: /octo\/archive.*archived/i });
    expect(archived).not.toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(archived);
    await vi.waitFor(() => {
      expect(github.branches).toHaveBeenCalledWith('connection-1', 30);
    });
  });

  it('asks a signed-out user to sign in before starting GitHub discovery', () => {
    session.current = undefined;
    renderPicker(<GithubRepositoryPicker onSelect={vi.fn()} returnTo='/import' />);

    expect(screen.getByRole('link', { name: 'Sign in to connect GitHub' })).toHaveAttribute(
      'href',
      '/auth/sign-in?redirectTo=%2Fimport',
    );
    expect(github.list).not.toHaveBeenCalled();
  });

  it('should show a disabled, honest state when the deployment has no GitHub App', async () => {
    github.configuration.mockRejectedValue(new GithubRequestError(503, 'GITHUB_CONNECTION_UNAVAILABLE'));

    renderPicker(<GithubRepositoryPicker onSelect={vi.fn()} />);

    expect(await screen.findByText(/GitHub connection isn’t set up on this deployment/u)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect GitHub' })).toBeDisabled();
  });

  it('should offer the upgrade instead of the picker when the plan cannot connect GitHub', async () => {
    plan.canConnectGitHub = false;

    renderPicker(<GithubRepositoryPicker onSelect={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Upgrade' }));

    expect(screen.getByText(/available on Pro/u)).toBeInTheDocument();
    expect(plan.requestUpgrade).toHaveBeenCalledOnce();
    expect(github.list).not.toHaveBeenCalled();
  });

  it('should stop the desktop poll on a failed callback and say why', async () => {
    desktop.current = true;
    vi.stubGlobal('location', { ...globalThis.location, assign: vi.fn() });
    github.list.mockResolvedValue([]);
    github.start.mockResolvedValue({ attemptId: 'attempt-1', authorizationUrl: 'https://github.com/login' });
    github.complete
      .mockRejectedValueOnce(new GithubRequestError(409, 'GITHUB_COMPLETION_PENDING'))
      .mockRejectedValueOnce(new GithubRequestError(400, 'GITHUB_CONSENT_DENIED'));

    renderPicker(<GithubRepositoryPicker onSelect={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Connect GitHub' }));

    expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toHaveTextContent(
      'GitHub access was not granted. Connect GitHub again to continue.',
    );
    expect(github.complete).toHaveBeenCalledTimes(2);
  });

  it('should disconnect an account after confirmation and reload the accounts', async () => {
    github.remove.mockResolvedValue(undefined);
    await act(async () => {
      renderPicker(<GithubRepositoryPicker onSelect={vi.fn()} />);
    });
    await vi.waitFor(() => {
      expect(github.repositories).toHaveBeenCalled();
    });

    await userEvent.click(screen.getByRole('button', { name: 'GitHub account options' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Disconnect octo…' }));
    expect(github.remove).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole('button', { name: 'Disconnect' }));

    expect(github.remove).toHaveBeenCalledWith('connection-1');
    await vi.waitFor(() => {
      expect(github.list).toHaveBeenCalledTimes(2);
    });
  });

  it('should return to the page after Configure GitHub access in the browser', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...globalThis.location, assign });
    await act(async () => {
      renderPicker(<GithubRepositoryPicker onSelect={vi.fn()} returnTo='/w/home/part' />);
    });
    await vi.waitFor(() => {
      expect(github.repositories).toHaveBeenCalled();
    });

    await userEvent.click(screen.getByRole('button', { name: 'GitHub account options' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Configure GitHub access' }));

    await vi.waitFor(() => {
      expect(assign).toHaveBeenCalledWith('https://github.com/apps/tau/installations/new');
    });
    expect(globalThis.sessionStorage.getItem('tau:github-setup-return')).toBe('/w/home/part');
  });

  it('should resolve a default branch that is not on the first branch page', async () => {
    github.repositories.mockResolvedValue({ totalCount: 1, page: 1, repositories: [repositoryOf()] });
    github.branches.mockResolvedValue({
      page: 1,
      branches: Array.from({ length: 100 }, (_, index) => ({ name: `a-${String(index).padStart(3, '0')}` })),
    });
    github.branch.mockResolvedValue({ name: 'main', head: 'b'.repeat(40) });

    await act(async () => {
      renderPicker(<GithubRepositoryPicker onSelect={vi.fn()} />);
    });
    await vi.waitFor(() => {
      expect(github.repositories).toHaveBeenCalled();
    });
    await userEvent.click(screen.getByRole('button', { name: /^Repository /u }));
    await userEvent.click(await screen.findByRole('option', { name: /octo\/part/u }));

    await vi.waitFor(() => {
      expect(github.branch).toHaveBeenCalledWith('connection-1', 30, 'main');
    });
    expect(await screen.findByRole('button', { name: 'Branch main' })).toBeInTheDocument();
  });

  it('should name each picker by its label and explain a repository that cannot be chosen', async () => {
    github.repositories.mockResolvedValue({
      totalCount: 1,
      page: 1,
      repositories: [repositoryOf({ name: 'hidden', access: 'unknown' })],
    });

    await act(async () => {
      renderPicker(<GithubRepositoryPicker onSelect={vi.fn()} />);
    });
    await vi.waitFor(() => {
      expect(github.repositories).toHaveBeenCalled();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Repository Select repository…' }));

    const option = await screen.findByRole('option', { name: /octo\/hidden/u });
    expect(option).toHaveAttribute('aria-disabled', 'true');
    expect(option).toHaveTextContent("Your GitHub account can't read this repository.");
  });
});
