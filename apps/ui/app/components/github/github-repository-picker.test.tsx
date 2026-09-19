import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { GithubRepositoryPicker } from '#components/github/github-repository-picker.js';

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
}));
const session = vi.hoisted((): { current: { user: { id: string } } | undefined } => ({
  current: { user: { id: 'tau-user' } },
}));

vi.mock('#lib/github-connections.js', () => ({ githubConnections: github }));
vi.mock('#filesystem/desktop-bridge.js', () => ({ isDesktopTarget: false }));
vi.mock('#lib/auth-client.js', () => ({ authClient: {} }));
vi.mock('@better-auth-ui/react', () => ({ useSession: () => ({ data: session.current, isPending: false }) }));

describe('GithubRepositoryPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.current = { user: { id: 'tau-user' } };
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
      render(<GithubRepositoryPicker onSelect={vi.fn()} />);
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
      render(<GithubRepositoryPicker onSelect={vi.fn()} />);
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
    render(
      <MemoryRouter>
        <GithubRepositoryPicker onSelect={vi.fn()} returnTo='/import' />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Sign in to connect GitHub' })).toHaveAttribute(
      'href',
      '/auth/sign-in?redirectTo=%2Fimport',
    );
    expect(github.list).not.toHaveBeenCalled();
  });
});
