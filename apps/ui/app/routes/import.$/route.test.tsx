import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { projectToManifest, serializeProjectManifest } from '@taucad/types';
import type { GithubRepositorySelection } from '#components/github/github-repository-picker.js';
import type { getGitHubClient } from '#lib/github-api.js';
import type { ImportWorkerRequest, ImportWorkerResponse } from '#workers/import.worker.js';
import ImportRoute from '#routes/import.$/route.js';
import type * as ReactRouterModule from 'react-router';

const existingProjectId = 'proj_existing0000000000000';
const picker = vi.hoisted(() => ({ available: true as boolean | undefined }));
const slugs = vi.hoisted(() => ({
  byId: new Map<string, { workspaceSlug: string; projectSlug: string }>(),
}));
const linkedImport = vi.hoisted(() => ({ prepare: vi.fn() }));
type RepositoryMetadata = Awaited<ReturnType<ReturnType<typeof getGitHubClient>['getRepository']>>;
const getRepository = vi.hoisted(() =>
  vi.fn(async (): Promise<RepositoryMetadata> => {
    throw Object.assign(new Error('Not Found - https://docs.github.com/rest/repos/repos'), { status: 404 });
  }),
);
const listFiles = vi.hoisted(() => vi.fn(async (): Promise<Array<{ path: string; size: number }>> => []));
const workerRequests = vi.hoisted((): ImportWorkerRequest[] => []);
const listBranches = vi.hoisted(() =>
  vi.fn(async () => ({ branches: [] as Array<{ name: string; sha: string; updatedAt: number }>, hasMore: false })),
);
const repositoryMetadata: RepositoryMetadata = {
  avatarUrl: undefined,
  description: undefined,
  stars: 1,
  forks: 0,
  watchers: 0,
  license: undefined,
  defaultBranch: 'main',
  isPrivate: false,
  lastUpdated: '2026-10-01T00:00:00Z',
};

/** Stands in for the import worker: every download answers with the archive route's size refusal. */
class TooLargeArchiveWorker {
  #listener: ((event: MessageEvent<ImportWorkerResponse>) => void) | undefined;

  public addEventListener(type: string, listener: (event: MessageEvent<ImportWorkerResponse>) => void): void {
    if (type === 'message') {
      this.#listener = listener;
    }
  }

  public postMessage(request: ImportWorkerRequest): void {
    if (request.type === 'startDownload') {
      queueMicrotask(() => {
        this.#listener?.(
          new MessageEvent('message', {
            data: {
              type: 'error',
              message: 'The repository download is larger than the 256 MB import limit.',
              phase: 'download',
              reason: 'tooLarge',
            } satisfies ImportWorkerResponse,
          }),
        );
      });
    }
  }

  public terminate(): void {
    this.#listener = undefined;
  }
}

/** Stands in for the import worker and records what it was asked to download. */
class RecordingWorker {
  public addEventListener(): void {
    // The recorded request is what the test reads; no response is needed.
  }

  public postMessage(request: ImportWorkerRequest): void {
    workerRequests.push(request);
  }

  public terminate(): void {
    // Nothing to stop.
  }
}

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
    listBranches,
    listFiles,
    getArchiveUrl: () => 'https://api.tau.test/v1/repositories/archive',
    getAuthHeaders: () => ({}),
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

  afterEach(() => {
    vi.unstubAllGlobals();
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
    expect(
      screen.getByText('Check the public repository address or choose a repository from your GitHub account.'),
    ).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Choose a private repository from GitHub' }));

    expect(await screen.findByRole('button', { name: 'Pick linked repository' })).toBeInTheDocument();
    expect(screen.queryByText('Desktop handoff offer')).not.toBeInTheDocument();
  });

  it('should not offer the account picker for a missing repository when the deployment has no GitHub App', async () => {
    picker.available = false;
    await renderImport('/import/github.com/octo/missing');

    expect(
      await screen.findByRole('alert', { name: 'Couldn’t open this repository' }, { timeout: 3000 }),
    ).toHaveTextContent('Check the public repository address.');
    expect(screen.queryByText(/choose a repository from your GitHub account/u)).not.toBeInTheDocument();
  });

  it('should not blame the address when GitHub rate-limits public reads', async () => {
    getRepository.mockRejectedValueOnce(
      Object.assign(new Error('API rate limit exceeded for 203.0.113.7.'), { status: 403 }),
    );
    await renderImport('/import/github.com/octo/part');

    const notice = await screen.findByRole('alert', { name: 'Couldn’t open this repository' }, { timeout: 3000 });

    expect(
      screen.getByText(
        'GitHub’s limit for public reads was reached. Try again in a few minutes, or choose a repository from your GitHub account.',
      ),
    ).toBeVisible();
    expect(notice).not.toHaveTextContent(/repository address/u);
  });

  it('should explain a branch list this server is not configured to provide', async () => {
    getRepository.mockResolvedValueOnce(repositoryMetadata);
    listBranches.mockRejectedValueOnce(
      Object.assign(new Error('GitHub branch listing is not configured on this server.'), {
        status: 503,
        code: 'GITHUB_API_TOKEN_UNAVAILABLE',
      }),
    );
    await renderImport('/import/github.com/octo/part');

    const status = await screen.findByText(/isn’t set up to list branches/u, {}, { timeout: 3000 });

    expect(status).toHaveTextContent(
      'This server isn’t set up to list branches, so import will use the main branch. Its administrator can enable branch listing with GITHUB_API_TOKEN.',
    );
    expect(screen.queryByRole('alert', { name: 'Couldn’t open this repository' })).not.toBeInTheDocument();
    expect(screen.queryByText(/repository address/u)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start import' })).toBeEnabled();
  });

  it('should explain a repository too large to import instead of asking to check the source', async () => {
    vi.stubGlobal('Worker', TooLargeArchiveWorker);
    const user = userEvent.setup();
    getRepository.mockResolvedValueOnce(repositoryMetadata);
    await renderImport('/import/github.com/KittyCAD/modeling-app');
    const start = await screen.findByRole('button', { name: 'Start import' });
    await waitFor(
      () => {
        expect(start).toBeEnabled();
      },
      { timeout: 3000 },
    );

    await user.click(start);

    expect(await screen.findByRole('alert', { name: 'Repository too large' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'This repository exceeds the size limit for GitHub imports. Import one of its folders, choose a smaller branch, or download the repository and import the files you need from your computer.',
      ),
    ).toBeVisible();
    expect(screen.queryByText(/Check the source/u)).not.toBeInTheDocument();
    expect(
      screen.getByText('Import failed (download): The repository download is larger than the 256 MB import limit.'),
    ).toBeInTheDocument();
  });

  it('should import the folder named in the address', async () => {
    vi.stubGlobal('Worker', RecordingWorker);
    workerRequests.length = 0;
    const user = userEvent.setup();
    getRepository.mockResolvedValueOnce(repositoryMetadata);
    listFiles.mockResolvedValueOnce([
      { path: 'README.md', size: 10 },
      { path: 'public/kcl-samples/gear/main.kcl', size: 20 },
      { path: 'rust/kcl-lib/tests/ops.snap', size: 30 },
    ]);
    await renderImport('/import/github.com/KittyCAD/modeling-app?path=public/kcl-samples');
    const start = await screen.findByRole('button', { name: 'Start import' });
    await waitFor(
      () => {
        expect(start).toBeEnabled();
      },
      { timeout: 3000 },
    );

    expect(screen.getByRole('button', { name: 'Folder public/kcl-samples' })).toBeVisible();
    await user.click(start);

    await waitFor(() => {
      expect(workerRequests).toEqual([expect.objectContaining({ type: 'startDownload', root: 'public/kcl-samples' })]);
    });
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
