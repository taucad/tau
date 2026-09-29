import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { projectToManifest, serializeProjectManifest } from '@taucad/types';
import type { GithubRepositorySelection } from '#components/github/github-repository-picker.js';
import ImportRoute from '#routes/import.$/route.js';
import type * as ReactRouterModule from 'react-router';

const existingProjectId = 'proj_existing0000000000000';
const picker = vi.hoisted(() => ({ available: true as boolean | undefined }));
const slugs = vi.hoisted(() => ({
  byId: new Map<string, { workspaceSlug: string; projectSlug: string }>(),
}));
const linkedImport = vi.hoisted(() => ({ prepare: vi.fn() }));
const getRepository = vi.hoisted(() =>
  vi.fn(async () => {
    throw Object.assign(new Error('Not Found - https://docs.github.com/rest/repos/repos'), { status: 404 });
  }),
);

/* The route's `clientLoader`, evaluated against the router's own location so navigation re-derives it. */
vi.mock('react-router', async (importOriginal) => {
  const router = await importOriginal<typeof ReactRouterModule>();
  const { resolveGitHubImportTarget } = await import('#routes/import.$/import.utils.js');
  return {
    ...router,
    useLoaderData: () => {
      const location = router.useLocation();
      return resolveGitHubImportTarget(location.pathname.replace(/^\/import\/?/u, ''), location.search);
    },
  };
});
vi.mock('#lib/github-api.js', () => ({
  getGitHubClient: () => ({
    getRepository,
    listBranches: vi.fn(async () => ({ branches: [], hasMore: false, endCursor: undefined })),
    listFiles: vi.fn(async () => []),
  }),
}));
vi.mock('#hooks/use-project-manager.js', () => ({ useProjectManager: () => ({ createProject: vi.fn() }) }));
vi.mock('#hooks/use-project-creation-location-error.js', () => ({ useProjectCreationLocationError: () => vi.fn() }));
vi.mock('#hooks/use-project-slug-route.js', () => ({
  useProjectSlugs: (projectId: string | undefined) => {
    const found = projectId === undefined ? undefined : slugs.byId.get(projectId);
    return found === undefined ? { status: 'not-found' } : { status: 'resolved', value: found };
  },
}));
vi.mock('#components/desktop/open-in-desktop.js', () => ({
  OpenInDesktop: () => <p>Desktop handoff offer</p>,
}));
vi.mock('#routes/import.$/suggested-clones.js', () => ({ SuggestedClones: () => undefined }));
vi.mock('#routes/import.$/upload-card.js', () => ({ UploadCard: () => undefined }));
vi.mock('#lib/github-linked-import.js', () => ({ prepareLinkedGithubImport: linkedImport.prepare }));
vi.mock('#components/github/github-repository-picker.js', () => ({
  useGithubConnectionAvailable: () => picker.available,
  GithubRepositoryPicker: ({ onSelect }: { onSelect: (selection: GithubRepositorySelection) => void }) => (
    <button
      type='button'
      onClick={() => {
        onSelect(selection);
      }}
    >
      Pick linked repository
    </button>
  ),
}));

const manifest = serializeProjectManifest(
  projectToManifest({
    id: existingProjectId,
    name: 'Part',
    description: '',
    tags: [],
    assets: { main: { entryPath: 'main.scad' } },
  }),
);
const selection = {
  connection: { id: 'connection-1', subject: 7, login: 'octo', generation: 1 },
  installation: {
    id: 10,
    owner: { id: 10, login: 'octo', avatarUrl: null, type: 'User' },
    repositorySelection: 'all',
    suspended: false,
    permissions: { contents: 'write' },
  },
  repository: {
    id: 30,
    name: 'part',
    fullName: 'octo/part',
    owner: { id: 10, login: 'octo', avatarUrl: null, type: 'User' },
    visibility: 'private',
    access: 'write',
    archived: false,
    disabled: false,
    description: null,
    defaultBranch: 'main',
    htmlUrl: 'https://github.com/octo/part',
    cloneUrl: 'https://github.com/octo/part.git',
  },
  branch: { name: 'main', head: 'a'.repeat(40) },
  files: [
    { path: 'main.scad', mode: '100644', size: 10, oid: 'b'.repeat(40) },
    { path: 'tau.json', mode: '100644', size: 10, oid: 'c'.repeat(40) },
  ],
  manifest,
} satisfies GithubRepositorySelection;

const renderImport = async (url = '/import'): Promise<void> => {
  await act(async () => {
    render(
      <TooltipProvider>
        <MemoryRouter initialEntries={[url]}>
          <ImportRoute />
        </MemoryRouter>
      </TooltipProvider>,
    );
  });
};

describe('ImportRoute GitHub card', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    picker.available = true;
    slugs.byId.clear();
  });

  it('should describe the picker and the public copy when GitHub connection is available', async () => {
    await renderImport();

    expect(screen.getByText('Link a repository or import a public copy.')).toBeInTheDocument();
  });

  it('should not promise the picker when the deployment has no GitHub App', async () => {
    picker.available = false;

    await renderImport();

    expect(screen.getByText('Import a copy of a public repository.')).toBeInTheDocument();
  });

  it('should offer to open a repository that is already a project instead of importing it again', async () => {
    slugs.byId.set(existingProjectId, { workspaceSlug: 'home', projectSlug: 'part' });
    await renderImport();

    await userEvent.click(screen.getByRole('button', { name: 'Pick linked repository' }));

    expect(screen.getByText('This repository is already a project on this device.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open project' })).toHaveAttribute('href', '/w/home/part');
    expect(screen.getByRole('button', { name: 'Import and link' })).toBeDisabled();
    expect(linkedImport.prepare).not.toHaveBeenCalled();
  });

  it('should label the linked main file control', async () => {
    await renderImport();

    await userEvent.click(screen.getByRole('button', { name: 'Pick linked repository' }));

    expect(screen.getByRole('group', { name: 'Main file' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import and link' })).toBeEnabled();
  });

  it('should point a repository GitHub cannot show publicly to the account picker', async () => {
    await renderImport('/import/github.com/octo/private');
    expect(screen.getByText('Desktop handoff offer')).toBeInTheDocument();

    expect(
      await screen.findByText("Tau couldn't find a public repository at this address.", {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Choose a private repository from GitHub' }));

    expect(await screen.findByRole('button', { name: 'Pick linked repository' })).toBeInTheDocument();
    expect(screen.queryByText('Desktop handoff offer')).not.toBeInTheDocument();
  });

  it('should review a URL only on submission and restore its draft and focus after cancellation', async () => {
    const user = userEvent.setup();
    await renderImport();
    expect(screen.queryByText('Desktop handoff offer')).not.toBeInTheDocument();
    const url = screen.getByRole('textbox', { name: 'Public repository URL' });
    const review = screen.getByRole('button', { name: 'Review repository' });
    expect(review).toBeDisabled();
    await user.type(url, 'https://example.com/owner/repo');
    expect(review).toBeDisabled();
    await user.clear(url);
    await user.type(url, 'https://github.com/octo/part');
    expect(review).toBeEnabled();
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 600);
      });
    });
    expect(getRepository).not.toHaveBeenCalled();

    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { name: 'Review repository' })).toBeInTheDocument();
    expect(
      await screen.findByText("Tau couldn't find a public repository at this address.", {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(getRepository).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Desktop handoff offer')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start import' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    const restoredUrl = await screen.findByRole('textbox', { name: 'Public repository URL' });
    expect(restoredUrl).toHaveValue('https://github.com/octo/part');
    await waitFor(() => {
      expect(restoredUrl).toHaveFocus();
    });

    await user.click(screen.getByRole('button', { name: 'Review repository' }));
    expect(await screen.findByRole('heading', { name: 'Review repository' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(await screen.findByRole('button', { name: 'Clear URL' }));
    expect(screen.getByRole('textbox', { name: 'Public repository URL' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Public repository URL' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Review repository' })).toBeDisabled();
  });

  it('should review and resubmit a bare GitHub address after cancellation', async () => {
    const user = userEvent.setup();
    await renderImport();
    await user.type(screen.getByRole('textbox', { name: 'Public repository URL' }), 'github.com/octo/part');
    expect(screen.getByRole('button', { name: 'Review repository' })).toBeEnabled();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { name: 'Review repository' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('textbox', { name: 'Public repository URL' })).toHaveValue(
      'https://github.com/octo/part',
    );
    await user.click(screen.getByRole('button', { name: 'Review repository' }));
    expect(await screen.findByRole('heading', { name: 'Review repository' })).toBeInTheDocument();
  });

  it('should keep linked setup consequences visible and require a nonblank branch', async () => {
    const user = userEvent.setup();
    await renderImport();
    await user.click(screen.getByRole('button', { name: 'Pick linked repository' }));
    expect(screen.queryByRole('textbox', { name: 'Public repository URL' })).not.toBeInTheDocument();
    expect(screen.getByText('octo using GitHub’s no-reply address.')).toBeInTheDocument();
    expect(screen.getByText('private')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Sync project chats with this repository' })).toBeChecked();
    await user.clear(screen.getByRole('textbox', { name: 'Local and sync branch' }));
    await user.type(screen.getByRole('textbox', { name: 'Local and sync branch' }), '   ');
    expect(screen.getByRole('button', { name: 'Import and link' })).toBeDisabled();
    expect(linkedImport.prepare).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Public repository URL' })).toHaveFocus();
    });
  });

  it('should show linked import recovery with diagnostics behind details', async () => {
    const user = userEvent.setup();
    linkedImport.prepare.mockRejectedValueOnce(new Error('Git fetch failed: connection reset'));
    await renderImport();
    await user.click(screen.getByRole('button', { name: 'Pick linked repository' }));
    await user.click(screen.getByRole('button', { name: 'Import and link' }));
    expect(await screen.findByRole('alert', { name: 'Import interrupted' })).toBeInTheDocument();
    expect(
      screen.getByText('Import and link did not finish. Review the details, then try Import and link again.'),
    ).toBeVisible();
    expect(screen.getByText('Git fetch failed: connection reset')).not.toBeVisible();
    await user.click(screen.getByText('Details'));
    expect(screen.getByText('Git fetch failed: connection reset')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Import and link' })).toBeEnabled();
  });
});
