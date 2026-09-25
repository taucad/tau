/**
 * The Sync region, driven by a scripted projection (S26, S35, AC10 client half).
 *
 * The region is presentational, so every row here is what a person would see
 * for a given `RemoteFacet` — no worker, no actor, no network.
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { RevisionSyncRegion } from '#routes/w.$workspace.$project/revision-sync-region.js';
import type { RemoteFacet, SyncFacet } from '@taucad/revisions';
import type { RevisionSyncRegionProps } from '#routes/w.$workspace.$project/revision-sync-region.js';
import { GithubRequestError } from '#lib/github-connections.js';
import type * as GithubConnectionsModule from '#lib/github-connections.js';
import { githubProjectBinding } from '#lib/github-project-binding.js';

const githubToken = vi.hoisted(() =>
  vi.fn(async () => ({
    accessToken: 'secret',
    expiresAt: '2026-09-14T00:00:00Z',
    generation: 3,
  })),
);

const githubRepository = vi.hoisted(() => vi.fn());
/* No connected account unless a test lists one. */
const githubList = vi.hoisted(() => vi.fn(async (): Promise<ReadonlyArray<{ id: string }>> => []));

const configureAccess = vi.hoisted(() => vi.fn((_installUrl: string, _returnTo: string) => undefined));

vi.mock('#lib/github-connections.js', async (importOriginal) => ({
  ...(await importOriginal<typeof GithubConnectionsModule>()),
  githubConnections: {
    token: githubToken,
    repository: githubRepository,
    list: githubList,
    configuration: async () => ({ installUrl: 'https://github.com/apps/tau/installations/new' }),
  },
  configureGithubAccess: configureAccess,
}));
/* eslint-disable @typescript-eslint/naming-convention -- `window.ENV`'s keys are the deployment's own environment variable names. */
vi.mock('#environment.config.js', () => ({
  ENV: { TAU_API_URL: 'https://api.test', TAU_GIT_REMOTE_ALLOW_PRIVATE: false },
}));
/* eslint-enable @typescript-eslint/naming-convention -- back to the workspace rule for the rest of the file. */
const githubAvailable = vi.hoisted(() => vi.fn<() => boolean | undefined>(() => true));
vi.mock('#components/github/github-repository-picker.js', () => ({
  useGithubConnectionAvailable: githubAvailable,
  GithubRepositoryPicker: ({
    onSelect,
    shouldConnect,
  }: {
    onSelect: (selection: unknown) => void;
    shouldConnect?: boolean;
  }) => (
    <>
      <button
        type='button'
        onClick={() => {
          onSelect({
            connection: { id: '00000000-0000-4000-8000-000000000001' },
            repository: {
              id: 99,
              fullName: 'o/r',
              cloneUrl: 'https://github.com/o/r.git',
              access: 'write',
            },
          });
        }}
      >
        Pick GitHub repository
      </button>
      {shouldConnect === true ? <p>GitHub connect started</p> : null}
    </>
  ),
}));

const facet = (overrides: Partial<RemoteFacet> = {}): RemoteFacet => ({
  kind: 'none',
  url: undefined,
  phase: 'none',
  storage: undefined,
  overQuota: [],
  error: undefined,
  reason: undefined,
  fetchOnly: false,
  provider: undefined,
  repositoryId: undefined,
  quota: undefined,
  ...overrides,
});

/* W13's half of the region: whether this project is backed up. A project with
 * no remote has nothing to say, which is what every remote-facing row below
 * renders against. */
const syncFacet = (overrides: Partial<SyncFacet> = {}): SyncFacet => ({
  state: 'noRemote',
  pendingCount: 0,
  online: true,
  conflictRef: undefined,
  error: undefined,
  reason: undefined,
  ...overrides,
});

const renderRegion = (
  remote: RemoteFacet,
  sync: SyncFacet = syncFacet(),
  overrides: Partial<RevisionSyncRegionProps> = {},
): Readonly<{
  connect: ReturnType<typeof vi.fn<RevisionSyncRegionProps['onConnect']>>;
  disconnect: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  syncNow: ReturnType<typeof vi.fn>;
  setSyncChats: ReturnType<typeof vi.fn>;
  setSyncLargeExports: ReturnType<typeof vi.fn>;
  upgrade: ReturnType<typeof vi.fn>;
  /** Re-render the same mount with a moved facet, which is where C9 lived. */
  show: (next: RemoteFacet, nextSync?: SyncFacet) => void;
}> => {
  const connect = vi.fn<RevisionSyncRegionProps['onConnect']>();
  const disconnect = vi.fn();
  const cancel = vi.fn();
  const syncNow = vi.fn();
  const setSyncChats = vi.fn();
  const setSyncLargeExports = vi.fn();
  const upgrade = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const element = (nextRemote: RemoteFacet, nextSync: SyncFacet): React.JSX.Element => (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter>
          <RevisionSyncRegion
            remote={nextRemote}
            sync={nextSync}
            onConnect={connect}
            onDisconnect={disconnect}
            onCancel={cancel}
            onSync={syncNow}
            syncChats
            onSyncChatsChange={setSyncChats}
            syncLargeExports={false}
            onSyncLargeExportsChange={setSyncLargeExports}
            onUpgrade={upgrade}
            signInHref='/auth/sign-in'
            {...overrides}
          />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
  const { rerender } = render(element(remote, sync));
  return {
    connect,
    disconnect,
    cancel,
    syncNow,
    setSyncChats,
    setSyncLargeExports,
    upgrade,
    show: (next, nextSync = sync) => {
      rerender(element(next, nextSync));
    },
  };
};

describe('RevisionSyncRegion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    githubToken.mockResolvedValue({
      accessToken: 'secret',
      expiresAt: '2026-09-14T00:00:00Z',
      generation: 3,
    });
  });

  it('offers the three remote kinds and says what connecting asks for', () => {
    renderRegion(facet());

    expect(screen.getByRole('radio', { name: 'No remote' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Tau Cloud' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Git remote' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Connect backup' })).toBeInTheDocument();
  });

  it('asks to connect when Tau Cloud is picked', async () => {
    const user = userEvent.setup();
    const { connect, setSyncChats } = renderRegion(facet());

    await user.click(screen.getByRole('radio', { name: 'Tau Cloud' }));

    expect(connect).not.toHaveBeenCalled();
    expect(screen.getByText('Files and history are backed up to your Tau account.')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Sync chats' })).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Sync chats' }));
    expect(setSyncChats).toHaveBeenCalledWith(false);
    await user.click(screen.getByRole('button', { name: 'Connect backup' }));
    expect(connect).toHaveBeenCalledWith('tau');
  });

  it('shows the connection in flight with a way out', async () => {
    const user = userEvent.setup();
    const { cancel } = renderRegion(facet({ kind: 'tau', phase: 'connecting' }));

    expect(screen.getByRole('status')).toHaveTextContent('Connecting to Tau Cloud…');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('renders storage against the plan and the remote it is connected to', () => {
    renderRegion(
      facet({
        kind: 'tau',
        phase: 'connected',
        url: 'https://api.tau.new/v1/git/p1.git',
        storage: { used: 2_254_857_830, quota: 10_737_418_240 },
      }),
    );

    expect(screen.getByText('2.1 GB of 10.0 GB')).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Storage used against your plan' })).toHaveAttribute(
      'aria-valuenow',
      '21',
    );
    expect(screen.getByText('Tau Cloud')).toBeInTheDocument();
    expect(screen.queryByText('https://api.tau.new/v1/git/p1.git')).not.toBeInTheDocument();
  });

  it('states when a linked GitHub repository is fetch-only', () => {
    renderRegion(
      facet({
        kind: 'git',
        phase: 'connected',
        url: 'https://github.com/o/read-only.git',
        fetchOnly: true,
        provider: 'github',
      }),
    );
    expect(screen.getByText('Read-only link · Tau will not push')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sync now' })).not.toBeInTheDocument();
  });

  it('syncs a writable project through the existing scheduler and opens its GitHub page', async () => {
    const user = userEvent.setup();
    const { syncNow } = renderRegion(
      facet({
        kind: 'git',
        phase: 'connected',
        url: 'https://github.com/o/design.git',
        provider: 'github',
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Sync now' }));
    expect(syncNow).toHaveBeenCalledTimes(1);
    expect(screen.getByText('o/design')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open GitHub' })).toHaveAttribute('href', 'https://github.com/o/design');
  });

  it('can change the linked repository or GitHub account without disconnecting first', async () => {
    const user = userEvent.setup();
    renderRegion(
      facet({
        kind: 'git',
        phase: 'connected',
        url: 'https://github.com/o/design.git',
        provider: 'github',
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Change backup' }));
    expect(screen.getByRole('button', { name: 'Pick GitHub repository' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Keep current repository' }));
    expect(screen.queryByRole('button', { name: 'Pick GitHub repository' })).not.toBeInTheDocument();
  });

  it('asks before replacing the connected backup', async () => {
    const user = userEvent.setup();
    const { connect } = renderRegion(
      facet({
        kind: 'tau',
        phase: 'connected',
        url: 'https://api.tau.new/v1/git/p1.git',
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Change backup' }));
    await user.click(screen.getByRole('radio', { name: 'Git remote' }));
    await user.click(screen.getByRole('button', { name: 'Pick GitHub repository' }));

    expect(connect).not.toHaveBeenCalled();
    expect(screen.getByText('Replace Tau Cloud with o/r? Every revision stays on this device.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Replace backup' }));
    await waitFor(() => {
      expect(connect).toHaveBeenCalledWith(
        'git',
        'https://github.com/o/r.git',
        expect.objectContaining({ provider: 'github', repositoryId: '99' }),
      );
    });
  });

  it('asks before disconnecting, and says what disconnecting costs', async () => {
    const user = userEvent.setup();
    const { disconnect } = renderRegion(
      facet({
        kind: 'tau',
        phase: 'connected',
        url: 'https://example.test/p1.git',
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Change backup' }));
    await user.click(screen.getByRole('radio', { name: 'No remote' }));
    await user.click(screen.getByRole('button', { name: 'Apply backup change' }));

    // The first press asks; nothing has happened yet.
    expect(disconnect).not.toHaveBeenCalled();
    expect(screen.getByText('Disconnect Tau Cloud? Every revision stays on this device.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(disconnect).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Change backup' }));
    await user.click(screen.getByRole('radio', { name: 'No remote' }));
    await user.click(screen.getByRole('button', { name: 'Apply backup change' }));
    await user.click(screen.getByRole('button', { name: 'Disconnect Tau Cloud' }));
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('names the files a refused push could not fit', () => {
    renderRegion(
      facet({
        kind: 'tau',
        phase: 'connected',
        storage: { used: 10_737_418_240, quota: 10_737_418_240 },
        overQuota: ['models/bracket.step', 'models/housing.step'],
      }),
    );

    expect(screen.getByText('These files are over your plan and were not backed up:')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toStrictEqual([
      'models/bracket.step',
      'models/housing.step',
    ]);
  });

  it('reports a failed connection as an alert, not as silence', () => {
    renderRegion(
      facet({
        kind: 'tau',
        phase: 'failed',
        error: 'The remote did not answer.',
      }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent('The remote did not answer.');
  });

  /*
   * The Git remote dialog (charter W12, S34, A18).
   *
   * Picking the kind is not connecting: there is no remote until an address has
   * been typed, and the sentence under the field says which authority the
   * connection will ask for *before* it asks.
   */
  it('asks for an address rather than connecting when Git remote is picked', async () => {
    const user = userEvent.setup();
    const { connect } = renderRegion(facet());

    await user.click(screen.getByRole('radio', { name: 'Git remote' }));

    expect(connect).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Pick GitHub repository' })).toBeInTheDocument();
    await user.click(screen.getByText('Advanced HTTPS remote'));
    expect(screen.getByRole('textbox', { name: 'Repository address' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled();
  });

  /* G2: the form's own promise, kept; D8: no picker to point at on a
   * deployment without a GitHub connection. */
  it.each([
    { available: true, pointsAtPicker: true },
    { available: false, pointsAtPicker: false },
  ])(
    'should say a GitHub address is linked read-only, naming the picker only when GitHub is set up ($available)',
    async ({ available, pointsAtPicker }) => {
      githubAvailable.mockReturnValue(available);
      onTestFinished(() => {
        githubAvailable.mockReturnValue(true);
      });
      const user = userEvent.setup();
      renderRegion(facet());

      await user.click(screen.getByRole('radio', { name: 'Git remote' }));
      await user.click(screen.getByText('Advanced HTTPS remote'));

      const authority = screen.getByText(/^Advanced HTTPS remotes are anonymous/u);
      expect(authority).toHaveTextContent('a GitHub address here is linked read-only');
      expect(authority.textContent.includes('GitHub picker above')).toBe(pointsAtPicker);
    },
  );

  it('refuses an address the proxy would refuse, while the person is still typing', async () => {
    const user = userEvent.setup();
    renderRegion(facet());
    await user.click(screen.getByRole('radio', { name: 'Git remote' }));
    await user.click(screen.getByText('Advanced HTTPS remote'));

    await user.type(screen.getByRole('textbox', { name: 'Repository address' }), 'http://github.com/o/r.git');

    expect(screen.getByRole('alert')).toHaveTextContent('Only https addresses can be connected.');
    expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled();
  });

  it('explains that GitHub selections use Git LFS', async () => {
    const user = userEvent.setup();
    renderRegion(facet());

    await user.click(screen.getByRole('radio', { name: 'Git remote' }));
    await user.click(screen.getByText('Advanced HTTPS remote'));

    expect(
      screen.getByText(
        'GitHub repositories selected above use their Git LFS storage. Other hosts may reject large files.',
      ),
    ).toBeInTheDocument();
  });

  it('connects a repository selected through the shared GitHub picker', async () => {
    const user = userEvent.setup();
    const { connect } = renderRegion(facet());
    await user.click(screen.getByRole('radio', { name: 'Git remote' }));
    await user.click(screen.getByRole('button', { name: 'Pick GitHub repository' }));

    const options = connect.mock.calls[0]?.[2];
    expect(options?.authorization).toMatch(/^Basic /u);
    expect(options).toEqual({
      authorization: options?.authorization,
      provider: 'github',
      repositoryId: '99',
      connectionId: '00000000-0000-4000-8000-000000000001',
      generation: 3,
      expiresAt: '2026-09-14T00:00:00Z',
      fetchOnly: false,
    });
  });

  /*
   * *Reconnect GitHub* (charter W12): an `AUTH_SECRET` rotation is not a failed
   * push, so the row asks again for the grant rather than reporting an error
   * nobody can act on.
   */
  it('keeps the shared GitHub picker available when the credential has to be renewed', async () => {
    const user = userEvent.setup();
    renderRegion(
      facet({
        kind: 'git',
        phase: 'reconnectRequired',
        url: 'https://github.com/o/r.git',
        provider: 'github',
        repositoryId: '99',
        error: 'Your GitHub connection needs to be renewed.',
      }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Your GitHub connection needs to be renewed.');
    await user.click(screen.getByRole('button', { name: 'Reconnect GitHub' }));
    expect(screen.getByRole('button', { name: 'Pick GitHub repository' })).toBeInTheDocument();
  });

  /*
   * D3: picking the repository the remote already records is the reconnect.
   * It used to return early as "the same remote", so no token was minted, no
   * frame was sent and `remote.machine` stayed in `reconnectRequired`.
   */
  it('should re-mint and reconnect when the same repository is picked while reconnect is required', async () => {
    const user = userEvent.setup();
    const region = renderRegion(
      facet({
        kind: 'git',
        phase: 'reconnectRequired',
        url: 'https://github.com/o/r.git',
        provider: 'github',
        repositoryId: '99',
        error: 'The remote rejected the saved credentials.',
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Reconnect GitHub' }));
    await user.click(screen.getByRole('button', { name: 'Pick GitHub repository' }));

    await waitFor(() => {
      expect(region.connect).toHaveBeenCalledWith(
        'git',
        'https://github.com/o/r.git',
        expect.objectContaining({
          provider: 'github',
          repositoryId: '99',
          generation: 3,
          expiresAt: '2026-09-14T00:00:00Z',
          authorization: expect.stringMatching(/^Basic /u) as unknown as string,
        }),
      );
    });
    expect(githubToken).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001');
    expect(screen.queryByText(/^Replace /u)).not.toBeInTheDocument();
  });

  it('should re-mint when the same repository is picked from a push GitHub refused', async () => {
    const user = userEvent.setup();
    const region = renderRegion(
      facet({
        kind: 'git',
        phase: 'connected',
        url: 'https://github.com/o/r.git',
        provider: 'github',
        repositoryId: '99',
      }),
      syncFacet({
        state: 'failed',
        pendingCount: 1,
        error: 'The remote rejected the saved credentials.',
        reason: 'unauthorized',
      }),
    );

    await user.click(
      within(screen.getByRole('status', { name: 'Backup status' })).getByRole('button', { name: 'Reconnect GitHub' }),
    );
    await user.click(screen.getByRole('button', { name: 'Pick GitHub repository' }));

    await waitFor(() => {
      expect(region.connect).toHaveBeenCalledWith(
        'git',
        'https://github.com/o/r.git',
        expect.objectContaining({ provider: 'github', repositoryId: '99' }),
      );
    });
  });

  /*
   * D48: *Reconnect GitHub* only opened the picker, so with the picker already
   * open — where a disconnect leaves it — the click did nothing.
   */
  it('reconnects in one click through an account that still reaches the repository (D48)', async () => {
    const user = userEvent.setup();
    githubList.mockResolvedValueOnce([{ id: '00000000-0000-4000-8000-000000000001' }]);
    githubRepository.mockResolvedValueOnce({
      id: 99,
      fullName: 'o/r',
      cloneUrl: 'https://github.com/o/r.git',
      access: 'write',
    });
    const region = renderRegion(
      facet({
        kind: 'git',
        phase: 'reconnectRequired',
        url: 'https://github.com/o/r.git',
        provider: 'github',
        repositoryId: '99',
        error: 'The remote rejected the saved credentials.',
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Reconnect GitHub' }));

    await waitFor(() => {
      expect(region.connect).toHaveBeenCalledWith(
        'git',
        'https://github.com/o/r.git',
        expect.objectContaining({ provider: 'github', repositoryId: '99' }),
      );
    });
    expect(githubRepository).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', 99);
  });

  it('starts GitHub connect from Reconnect GitHub when no account reaches the repository, picker open or not (D48)', async () => {
    const user = userEvent.setup();
    const region = renderRegion(
      facet({
        kind: 'git',
        phase: 'connected',
        url: 'https://github.com/o/r.git',
        provider: 'github',
        repositoryId: '99',
      }),
      syncFacet({
        state: 'failed',
        pendingCount: 1,
        error: 'The remote rejected the saved credentials.',
        reason: 'unauthorized',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Change backup' }));
    expect(screen.queryByText('GitHub connect started')).not.toBeInTheDocument();

    await user.click(
      within(screen.getByRole('status', { name: 'Backup status' })).getByRole('button', { name: 'Reconnect GitHub' }),
    );

    expect(await screen.findByText('GitHub connect started')).toBeInTheDocument();
    expect(region.connect).not.toHaveBeenCalled();
  });

  /* D67: a repository transferred out of the app's reach, or removed from its
   * installation, answered GitHub consent — which returned to the same refusal. */
  it('sends Reconnect GitHub to the app’s repository access when a working account cannot see the repository', async () => {
    const user = userEvent.setup();
    githubList.mockResolvedValueOnce([{ id: '00000000-0000-4000-8000-000000000001' }]);
    githubRepository.mockRejectedValueOnce(new GithubRequestError(404, 'GITHUB_NOT_FOUND_OR_DENIED'));
    const region = renderRegion(
      facet({
        kind: 'git',
        phase: 'connected',
        url: 'https://github.com/o/r.git',
        provider: 'github',
        repositoryId: '99',
      }),
      syncFacet({
        state: 'failed',
        pendingCount: 1,
        error: 'Write access to repository not granted.',
        reason: 'unauthorized',
      }),
    );

    await user.click(
      within(screen.getByRole('status', { name: 'Backup status' })).getByRole('button', { name: 'Reconnect GitHub' }),
    );

    await waitFor(() => {
      expect(configureAccess).toHaveBeenCalledExactlyOnceWith(
        'https://github.com/apps/tau/installations/new',
        expect.any(String),
      );
    });
    expect(screen.queryByText('GitHub connect started')).not.toBeInTheDocument();
    expect(region.connect).not.toHaveBeenCalled();
  });

  /* R-U6: the same repository with changed access is re-sent, not skipped as "the same remote". */
  it('should re-send the same repository when its access changed', async () => {
    const user = userEvent.setup();
    const region = renderRegion(
      facet({
        kind: 'git',
        phase: 'connected',
        url: 'https://github.com/o/r.git',
        provider: 'github',
        repositoryId: '99',
        fetchOnly: true,
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Change backup' }));
    await user.click(screen.getByRole('button', { name: 'Pick GitHub repository' }));

    await waitFor(() => {
      expect(region.connect).toHaveBeenCalledWith(
        'git',
        'https://github.com/o/r.git',
        expect.objectContaining({ provider: 'github', repositoryId: '99', fetchOnly: false }),
      );
    });
    expect(screen.queryByText(/^Replace /u)).not.toBeInTheDocument();
  });

  /* D18: a host that is not GitHub is offered neither GitHub nor Tau copy. */
  it('should say the remote rejected the credentials, and retry, for a host that is not GitHub', async () => {
    const user = userEvent.setup();
    const region = renderRegion(
      facet({ kind: 'git', phase: 'reconnectRequired', url: 'https://gitlab.example.com/o/r.git' }),
    );

    const alert = screen.getByRole('alert', { name: 'Remote credentials' });
    expect(alert).toHaveTextContent('The remote rejected the saved credentials.');
    expect(screen.queryByRole('button', { name: 'Reconnect GitHub' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(region.connect).toHaveBeenCalledWith('git', 'https://gitlab.example.com/o/r.git');
  });

  /* Ruling G2: an anonymous github.com link has no connection to renew. */
  it('should point an anonymous GitHub link GitHub refused at connecting GitHub', () => {
    renderRegion(
      facet({
        kind: 'git',
        phase: 'reconnectRequired',
        url: 'https://github.com/o/private.git',
        fetchOnly: true,
        error: 'The remote rejected the saved credentials.',
      }),
    );

    expect(screen.getByRole('alert', { name: 'GitHub connection' })).toHaveTextContent(
      'GitHub needs a connected account to reach this repository.',
    );
    expect(screen.getByRole('button', { name: 'Reconnect GitHub' })).toBeInTheDocument();
  });

  it('should offer a non-GitHub remote Retry rather than a Tau sign-in on a refused push', () => {
    renderRegion(
      facet({ kind: 'git', phase: 'connected', url: 'https://gitlab.example.com/o/r.git' }),
      syncFacet({
        state: 'failed',
        pendingCount: 1,
        error: 'The remote rejected the saved credentials.',
        reason: 'unauthorized',
      }),
    );

    const row = screen.getByRole('status', { name: 'Backup status' });
    expect(within(row).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(within(row).queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  /*
   * P20: the port refuses the push by name before anything is offered, and the
   * region is where the person reads which files stopped it (D16, AC16).
   */
  it('names the large files a Git remote refused, rather than a code', () => {
    renderRegion(
      facet({
        kind: 'git',
        phase: 'failed',
        url: 'https://github.com/o/r.git',
        error:
          'Large files cannot be backed up to a Git remote: models/housing.step. Connect Tau Cloud instead, or remove them from the project.',
      }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent('models/housing.step');
    expect(screen.getByRole('alert')).toHaveTextContent('Connect Tau Cloud instead');
  });

  it('moves focus onto the disconnect confirmation, not to the document', async () => {
    const user = userEvent.setup();
    renderRegion(
      facet({
        kind: 'tau',
        phase: 'connected',
        url: 'https://example.test/p1.git',
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Change backup' }));
    await user.click(screen.getByRole('radio', { name: 'No remote' }));
    await user.click(screen.getByRole('button', { name: 'Apply backup change' }));

    // The button the click came from unmounted; focus must not fall to <body>.
    expect(screen.getByRole('button', { name: 'Disconnect Tau Cloud' })).toHaveFocus();
  });

  /*
   * The Sync row's four states (S26, S41, AC21).
   *
   * One row per line of copy a person can actually read, because "Not backed
   * up" is the sentence this whole lane exists to be able to say honestly.
   */
  const rows: ReadonlyArray<readonly [SyncFacet['state'], number, string]> = [
    ['checking', 0, 'Checking…'],
    ['backedUp', 0, 'Backed up'],
    ['pending', 1, 'Backing up… 1 revision'],
    ['pending', 2, 'Backing up… 2 revisions'],
    ['queued', 1, 'Not backed up · 1 revision'],
    ['failed', 3, 'Not backed up · 3 revisions'],
    ['conflicted', 0, 'Needs resolution'],
  ];

  it.each(rows)('should say %s as “%s”', (state, pendingCount, copy) => {
    renderRegion(
      facet({
        kind: 'tau',
        phase: 'connected',
        url: 'https://api.tau.new/v1/git/p1.git',
      }),
      syncFacet({ state, pendingCount }),
    );

    expect(screen.getByRole('status')).toHaveTextContent(copy);
  });

  it('says nothing about backup when the project has no remote', () => {
    renderRegion(facet());

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('says the device is offline beside a queue it cannot send', () => {
    renderRegion(
      facet({
        kind: 'tau',
        phase: 'connected',
        url: 'https://api.tau.new/v1/git/p1.git',
      }),
      syncFacet({ state: 'queued', pendingCount: 1, online: false }),
    );

    expect(screen.getByRole('status')).toHaveTextContent('Not backed up · 1 revision');
    expect(screen.getByRole('status')).toHaveTextContent('Offline');
  });
});

/*
 * The three closeout pins for this region: a connection that leaves `connected`
 * keeps its verbs (C9), a refusal reaches a person with its reason and exactly
 * one action (C4/N3), and a plan that cannot sync is never offered a connect
 * (C5/N4).
 */
describe('RevisionSyncRegion with a moved GitHub repository (D11)', () => {
  const connectionId = '00000000-0000-4000-8000-000000000001';
  const bound = facet({
    kind: 'git',
    phase: 'connected',
    url: 'https://github.com/o/r.git',
    provider: 'github',
    repositoryId: '99',
  });
  const refused = syncFacet({
    state: 'failed',
    pendingCount: 1,
    error: 'The repository moved; confirm its new location before sending the credential there',
    reason: 'moved',
  });
  const renamed = {
    id: 99,
    name: 'renamed',
    fullName: 'octo/renamed',
    owner: { id: 10, login: 'octo', avatarUrl: null, type: 'User' },
    visibility: 'private',
    access: 'write',
    archived: false,
    disabled: false,
    description: null,
    defaultBranch: 'main',
    htmlUrl: 'https://github.com/octo/renamed',
    cloneUrl: 'https://github.com/octo/renamed.git',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    githubToken.mockResolvedValue({ accessToken: 'secret', expiresAt: '2026-09-14T00:00:00Z', generation: 3 });
    githubProjectBinding.set('p1', {
      connectionId,
      repositoryId: 99,
      repositoryUrl: 'https://github.com/o/r.git',
      generation: 3,
    });
    onTestFinished(() => {
      githubProjectBinding.remove('p1');
    });
  });

  it('should look the repository up by its id and re-point the remote only once the person confirms', async () => {
    const user = userEvent.setup();
    githubRepository.mockResolvedValue(renamed);
    const region = renderRegion(bound, refused, { projectId: 'p1' });

    const row = screen.getByRole('status', { name: 'Backup status' });
    expect(await within(row).findByText('This repository moved to octo/renamed.')).toBeInTheDocument();
    expect(githubRepository).toHaveBeenCalledWith(connectionId, 99);

    await user.click(within(row).getByRole('button', { name: 'Update remote' }));
    expect(region.connect).not.toHaveBeenCalled();
    expect(screen.getByText(/Update this project's remote to octo\/renamed\?/u)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Update remote' }));

    await waitFor(() => {
      expect(region.connect).toHaveBeenCalledWith('git', 'https://github.com/octo/renamed.git', {
        authorization: expect.stringMatching(/^Basic /u) as unknown as string,
        provider: 'github',
        repositoryId: '99',
        connectionId,
        generation: 3,
        expiresAt: '2026-09-14T00:00:00Z',
        fetchOnly: false,
      });
    });
    /* The same connection, with a fresh token. */
    expect(githubToken).toHaveBeenCalledWith(connectionId);
  });

  it('should keep the remote when the person declines, and return focus to the offer', async () => {
    const user = userEvent.setup();
    githubRepository.mockResolvedValue(renamed);
    const region = renderRegion(bound, refused, { projectId: 'p1' });

    await user.click(await screen.findByRole('button', { name: 'Update remote' }));
    await user.click(screen.getByRole('button', { name: 'Keep current remote' }));

    expect(region.connect).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Update remote' })).toHaveFocus();
  });

  it('should say why when the repository cannot be looked up, and offer picking it again', async () => {
    githubRepository.mockRejectedValue(new GithubRequestError(404, 'GITHUB_NOT_FOUND_OR_DENIED'));
    renderRegion(bound, refused, { projectId: 'p1' });

    const row = screen.getByRole('status', { name: 'Backup status' });
    expect(
      await within(row).findByText(
        "GitHub didn't find this repository, or this connection can't access it. Check the Tau app's repository access on GitHub.",
      ),
    ).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Reconnect GitHub' })).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'Update remote' })).not.toBeInTheDocument();
  });

  it('should offer no move when GitHub still reports the bound address', async () => {
    githubRepository.mockResolvedValue({ ...renamed, cloneUrl: 'https://github.com/o/r.git' });
    renderRegion(bound, refused, { projectId: 'p1' });

    await waitFor(() => {
      expect(githubRepository).toHaveBeenCalledOnce();
    });
    const row = screen.getByRole('status', { name: 'Backup status' });
    expect(within(row).getByText(refused.error ?? '')).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'Update remote' })).not.toBeInTheDocument();
  });
});

describe('RevisionSyncRegion refusals and plan gates', () => {
  const connected = facet({ kind: 'tau', phase: 'connected', url: 'https://api.tau.new/v1/git/p1.git' });

  it('keeps a commit affordance when a live connection leaves connected (C9)', () => {
    const region = renderRegion(connected);
    expect(screen.getByRole('button', { name: 'Change backup' })).toBeInTheDocument();

    region.show(facet({ kind: 'tau', phase: 'failed', error: 'Sign in to back this project up to Tau Cloud.' }));

    /* Before the fix this rendered three radios and *zero* buttons, so the
     * region was an inert dead end and focus fell to `<body>`. */
    expect(screen.getByRole('button', { name: 'Apply backup change' })).toBeInTheDocument();
    /* Policy rule 19 names six actions and *Retry* is the one for a failure with
       no class; *Try again* was a seventh word for the same verb, in the same
       region that already renders *Retry* from `syncFailureAction`. */
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  /*
   * Rule 19 asks for one action matching the failure's class on *every* surface
   * showing a remote failure, and a refused connect is one of them. Before
   * `RemoteFacet.reason` this block had only a sentence, so the `403
   * GIT_SYNC_NOT_ENTITLED` this closeout began with offered *Retry* on connect
   * and *Upgrade* on a push — the same refusal, two answers.
   */
  it.each([
    { reason: 'notEntitled', action: 'Pro Upgrade' },
    { reason: 'quota', action: 'Pro Upgrade' },
    { reason: 'unauthorized', action: 'Sign in' },
    { reason: 'rejected', action: 'Sync now' },
    { reason: 'unknown', action: 'Retry' },
  ] as const)('classifies a refused connect as $reason and offers $action (rule 19)', ({ reason, action }) => {
    renderRegion(
      facet({ kind: 'tau', phase: 'failed', error: 'Syncing files to Tau Cloud is a paid plan feature.', reason }),
    );

    const alert = screen.getByRole('alert', { name: 'Backup connection error' });
    expect(alert).toHaveTextContent('Syncing files to Tau Cloud is a paid plan feature.');
    const actions = within(alert)
      .getAllByRole(action === 'Sign in' ? 'link' : 'button')
      .map((element) => element.textContent.trim());
    expect(actions).toStrictEqual([action]);
  });

  it('answers a failed connect in the vocabulary rule 19 allows (C4)', () => {
    renderRegion(facet({ kind: 'tau', phase: 'failed', error: 'Tau Cloud has no project with this id.' }));

    const alert = screen.getByRole('alert', { name: 'Backup connection error' });
    expect(alert).toHaveTextContent('Tau Cloud has no project with this id.');
    const actions = within(alert)
      .getAllByRole('button')
      .map((button) => button.textContent.trim());
    expect(actions).toStrictEqual(['Retry']);
  });

  it.each([
    { reason: 'unauthorized', role: 'link', action: 'Sign in', state: 'failed' },
    { reason: 'notEntitled', role: 'button', action: 'Pro Upgrade', state: 'failed' },
    { reason: 'quota', role: 'button', action: 'Pro Upgrade', state: 'failed' },
    /* D18: large files on a Git remote are not a plan problem. */
    { reason: 'largeFiles', role: 'button', action: 'Sync now', state: 'failed' },
    { reason: 'rejected', role: 'button', action: 'Sync now', state: 'failed' },
    { reason: 'unknown', role: 'button', action: 'Retry', state: 'failed' },
    /* W2: a `queued` refusal reads the same sentence and offers the same one
       verb as a `failed` one — the difference is only whether this device will
       retry by itself, which the row's *Offline* line says. */
    { reason: 'offline', role: 'button', action: 'Sync now', state: 'queued' },
  ] as const)('renders the $reason reason with its one action (C4, N3)', ({ reason, role, action, state }) => {
    renderRegion(connected, syncFacet({ state, pendingCount: 2, error: 'The plan does not allow it.', reason }));

    const row = screen.getByRole('status', { name: 'Backup status' });
    expect(row).toHaveTextContent('The plan does not allow it.');
    expect(within(row).getByRole(role, { name: action })).toBeInTheDocument();
  });

  it('never parses the sentence: no reason means no invented action (C4)', () => {
    renderRegion(connected, syncFacet({ state: 'failed', pendingCount: 1, error: 'Something went wrong.' }));

    const row = screen.getByRole('status', { name: 'Backup status' });
    expect(row).toHaveTextContent('Something went wrong.');
    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers Available on Pro for Tau Cloud and a Git remote on every plan (C5, N4)', async () => {
    const user = userEvent.setup();
    const region = renderRegion(facet(), syncFacet(), { canSyncFiles: false });

    expect(screen.getByRole('radio', { name: 'Tau Cloud' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Git remote' })).toBeEnabled();
    const upgrades = screen.getAllByRole('button', { name: /Available on Pro/u });
    expect(upgrades).toHaveLength(1);

    await user.click(upgrades[0]!);
    expect(region.upgrade).toHaveBeenCalled();
    /* The whole point of the gate: nothing is registered on the server. */
    expect(region.connect).not.toHaveBeenCalled();
  });

  it('offers Sync exports beside Sync chats on a connected project (C14, EQ7)', async () => {
    const user = userEvent.setup();
    const region = renderRegion(connected);

    const exports = screen.getByRole('switch', { name: 'Sync exports' });
    expect(exports).toBeInTheDocument();
    await user.click(exports);
    expect(region.setSyncLargeExports).toHaveBeenCalledWith(true);
  });
});

/**
 * The collaborator half of the Sync region (charter W5, D27).
 *
 * The owner alone manages this surface, and there is no invitation email — so
 * the one-time link the API answers with *is* the product: if this region does
 * not show it, the invitation cannot reach anybody.
 */
describe('RevisionSyncRegion collaborators', () => {
  const connected = facet({ kind: 'tau', phase: 'connected' });

  const answer = (
    rows: readonly unknown[],
    invite?: { status: number; body: unknown },
    listing?: { status: number },
  ): ReturnType<typeof vi.fn> => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        return { ok: true, status: 200, json: async () => ({ email: 'teammate@example.test', role: 'read' }) };
      }
      if (init?.method === 'POST') {
        const reply = invite ?? {
          status: 201,
          body: {
            email: 'teammate@example.test',
            role: 'write',
            token: 'tok_abcdef',
            expiresAt: '2026-10-02T00:00:00.000Z',
          },
        };
        return { ok: reply.status < 400, status: reply.status, json: async () => reply.body };
      }
      if (init?.method === 'DELETE') {
        return { ok: true, status: 204, json: async () => ({}) };
      }
      const status = listing?.status ?? 200;
      return { ok: status < 400, status, json: async () => rows };
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  beforeEach(() => {
    answer([]);
    /* Radix's Select asks for pointer capture before it opens, and jsdom has
       none — the same four shims `project-share-panel.test.tsx` installs. */
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  });

  it('offers the invite form to the owner alone', async () => {
    renderRegion(connected, syncFacet({ state: 'backedUp' }), { role: 'owner', projectId: 'proj_1' });

    expect(await screen.findByRole('textbox', { name: 'Invite by email' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Create invitation' })).toBeDefined();
  });

  /* N4: collaboration is a Tau Cloud fact. A GitHub-backed project has an owner
     but no cloud project to invite anybody to, so the panel is not offered. */
  it('shows the owner no panel when the remote is not Tau Cloud', () => {
    renderRegion(
      facet({ kind: 'git', phase: 'connected', url: 'https://github.com/o/r.git', provider: 'github' }),
      syncFacet({ state: 'backedUp' }),
      {
        role: 'owner',
        projectId: 'proj_1',
      },
    );

    expect(screen.queryByRole('textbox', { name: 'Invite by email' })).toBeNull();
  });

  /* N1: the listing answered and did not name this project, which is what an
     owner's revoke looks like to a tab that is still open. */
  it('says so when access was revoked while the project was open', () => {
    renderRegion(connected, syncFacet({ state: 'backedUp' }), { role: 'revoked', projectId: 'proj_1' });

    expect(screen.getByText("You no longer have access to this project's cloud copy.")).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Sync now' })).toBeNull();
  });

  /* F4: an unread list is not an empty one. */
  it('reports a listing it could not read instead of saying nobody has access', async () => {
    answer([], undefined, { status: 500 });
    renderRegion(connected, syncFacet({ state: 'backedUp' }), { role: 'owner', projectId: 'proj_1' });

    expect(await screen.findByRole('alert')).toHaveTextContent('The list of people with access could not be loaded.');
    expect(screen.queryByText('Nobody else has access to this project.')).toBeNull();
  });

  /* W3 a2: a role change is `PATCH`, not a re-invite — the invitee keeps the
     link they were already sent and no new token is minted. */
  it('changes a role in place without issuing a token', async () => {
    const fetchMock = answer([
      { email: 'teammate@example.test', role: 'write', status: 'accepted', expiresAt: '2026-10-02T00:00:00.000Z' },
    ]);
    renderRegion(connected, syncFacet({ state: 'backedUp' }), { role: 'owner', projectId: 'proj_1' });

    await userEvent.click(await screen.findByRole('combobox', { name: 'Role for teammate@example.test' }));
    await userEvent.click(screen.getByRole('option', { name: 'Can view' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.test/v1/projects/proj_1/collaborators/teammate%40example.test',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ role: 'read' }) }),
      );
    });
    expect(screen.queryByRole('textbox', { name: /Invitation link for/u })).toBeNull();
  });

  it('shows a collaborator no invite form at all', () => {
    renderRegion(connected, syncFacet({ state: 'backedUp' }), { role: 'write', projectId: 'proj_1' });

    expect(screen.queryByRole('textbox', { name: 'Invite by email' })).toBeNull();
    expect(screen.queryByText('People with access')).toBeNull();
  });

  it('never offers a view-only collaborator a push', () => {
    renderRegion(connected, syncFacet({ state: 'backedUp' }), { role: 'read', projectId: 'proj_1' });

    expect(screen.queryByRole('button', { name: 'Sync now' })).toBeNull();
    expect(screen.getByText('Read only')).toBeDefined();
  });

  it('surfaces the one-time link, its expiry and who it is for', async () => {
    renderRegion(connected, syncFacet({ state: 'backedUp' }), { role: 'owner', projectId: 'proj_1' });

    await userEvent.type(await screen.findByRole('textbox', { name: 'Invite by email' }), 'teammate@example.test');
    await userEvent.click(screen.getByRole('button', { name: 'Create invitation' }));

    const link = await screen.findByRole('textbox', { name: 'Invitation link for teammate@example.test' });
    expect((link as HTMLInputElement).value).toContain('/invitations/tok_abcdef');
    expect(screen.getByText('Tau does not email this link. Send it to them yourself.')).toBeDefined();
    expect(screen.getByRole('button', { name: /Copy link/u })).toBeDefined();
    /* F5: the link is the whole product of the gesture, so it is announced and
       it takes focus — a keyboard person must not have to hunt for it. */
    expect(screen.getByRole('status', { name: 'Invitation created' })).toBeDefined();
    await waitFor(() => {
      expect(document.activeElement).toBe(link);
    });
  });

  it('says plainly when the owner is over the daily invite budget', async () => {
    answer([], { status: 429, body: { code: 'PROJECT_INVITE_RATE_LIMITED' } });
    renderRegion(connected, syncFacet({ state: 'backedUp' }), { role: 'owner', projectId: 'proj_1' });

    await userEvent.type(await screen.findByRole('textbox', { name: 'Invite by email' }), 'teammate@example.test');
    await userEvent.click(screen.getByRole('button', { name: 'Create invitation' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many invitations today. Try again tomorrow.');
  });

  it('revokes an address the owner has already invited', async () => {
    const fetchMock = answer([
      { email: 'teammate@example.test', role: 'write', status: 'accepted', expiresAt: '2026-10-02T00:00:00.000Z' },
    ]);
    renderRegion(connected, syncFacet({ state: 'backedUp' }), { role: 'owner', projectId: 'proj_1' });

    expect(await screen.findByText('teammate@example.test')).toBeDefined();
    await userEvent.click(screen.getByRole('button', { name: 'Revoke teammate@example.test' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.test/v1/projects/proj_1/collaborators/teammate%40example.test',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
    /* F5: the button the click came from is gone, so focus would fall to
       `<body>` — the same defect review R15 fixed on the disconnect confirm. */
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'People with access' }));
    });
  });
});
