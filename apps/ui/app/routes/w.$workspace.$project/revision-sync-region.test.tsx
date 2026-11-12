/**
 * The backup line, driven by a scripted projection (C4; S26, S35, AC10 client half).
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
import { githubProjectBinding } from '@taucad/ui-core/lib/github-project-binding';

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

/** The line's *Back up to Tau Cloud*, which opens where to back up on a project on this device only (C2). */
const openBackUp = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
  await user.click(screen.getByRole('button', { name: 'Back up to Tau Cloud' }));
};

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
  upgrade: ReturnType<typeof vi.fn>;
  /** Re-render the same mount with a moved facet, which is where C9 lived. */
  show: (next: RemoteFacet, nextSync?: SyncFacet) => void;
}> => {
  const connect = vi.fn<RevisionSyncRegionProps['onConnect']>();
  const disconnect = vi.fn();
  const cancel = vi.fn();
  const syncNow = vi.fn();
  const setSyncChats = vi.fn();
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
    upgrade,
    show: (next, nextSync = sync) => {
      rerender(element(next, nextSync));
    },
  };
};

/** Change… lives behind the line's Manage (C4, M8). */
const chooseChangeBackup = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
  await user.click(screen.getByRole('button', { name: 'Manage' }));
  await user.click(screen.getByRole('button', { name: 'Change…' }));
};

/** Manage's popover, opened. */
const openManage = async (user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> => {
  await user.click(screen.getByRole('button', { name: 'Manage' }));
  return screen.getByRole('dialog', { name: 'Manage backup' });
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

  it('says This device only with Back up to Tau Cloud, which opens the three remote kinds (C2)', async () => {
    const user = userEvent.setup();
    renderRegion(facet());

    const line = screen.getByRole('region', { name: 'Backup' });
    expect(line).toHaveTextContent('This device only');
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    await openBackUp(user);

    expect(screen.getByRole('radio', { name: 'This device only' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Tau Cloud' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'GitHub or another Git host' })).not.toBeChecked();
    expect(screen.getAllByRole('button', { name: 'Back up to Tau Cloud' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Back up to Tau Cloud' })).toHaveFocus();
    });
  });

  it('offers no Back up to a viewer who cannot change the backup', () => {
    renderRegion(facet(), syncFacet(), { role: 'read' });

    expect(screen.getByRole('region', { name: 'Backup' })).toHaveTextContent('This device only');
    expect(screen.queryByRole('button', { name: 'Back up to Tau Cloud' })).not.toBeInTheDocument();
  });

  it('asks to connect when Tau Cloud is picked', async () => {
    const user = userEvent.setup();
    const { connect, setSyncChats } = renderRegion(facet());
    await openBackUp(user);

    await user.click(screen.getByRole('radio', { name: 'Tau Cloud' }));

    expect(connect).not.toHaveBeenCalled();
    expect(screen.getByText('Files and history are backed up to your Tau account.')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Include chats' })).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Include chats' }));
    expect(setSyncChats).toHaveBeenCalledWith(false);
    await user.click(screen.getByRole('button', { name: 'Back up to Tau Cloud' }));
    expect(connect).toHaveBeenCalledWith('tau');
  });

  it('shows the connection in flight with a way out', async () => {
    const user = userEvent.setup();
    const { cancel } = renderRegion(facet({ kind: 'tau', phase: 'connecting' }));

    expect(screen.getByRole('status')).toHaveTextContent('Connecting to Tau Cloud…');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('renders storage against the plan in Manage, and the remote on the line', async () => {
    const user = userEvent.setup();
    renderRegion(
      facet({
        kind: 'tau',
        phase: 'connected',
        url: 'https://api.tau.new/v1/git/p1.git',
        storage: { used: 2_254_857_830, quota: 10_737_418_240 },
      }),
    );

    expect(within(screen.getByRole('status', { name: 'Backup status' })).getByText('Tau Cloud')).toBeInTheDocument();
    expect(screen.queryByText('https://api.tau.new/v1/git/p1.git')).not.toBeInTheDocument();
    /* M8: the figure moved off the line into Manage; the meter waits until storage is worth watching. */
    expect(screen.queryByText(/2\.1 GB of 10 GB/u)).not.toBeInTheDocument();
    const manage = await openManage(user);
    expect(manage).toHaveTextContent('2.1 GB of 10 GB');
    expect(within(manage).queryByRole('meter', { name: 'Storage used against your plan' })).not.toBeInTheDocument();
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
    expect(screen.getByText('Read-only')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('fetches a GitHub project while changes wait to go, and opens its GitHub page from Manage', async () => {
    const user = userEvent.setup();
    const remote = facet({
      kind: 'git',
      phase: 'connected',
      url: 'https://github.com/o/design.git',
      provider: 'github',
    });
    const { syncNow, show } = renderRegion(remote, syncFacet({ state: 'backedUp' }));

    /* A1 item 6: nothing waits, so there is nothing for Fetch latest to do. */
    expect(within(await openManage(user)).queryByRole('button', { name: 'Fetch latest' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    show(remote, syncFacet({ state: 'queued', pendingCount: 2 }));
    await user.click(within(await openManage(user)).getByRole('button', { name: 'Fetch latest' }));
    expect(syncNow).toHaveBeenCalledTimes(1);
    expect(screen.getByText('o/design')).toBeInTheDocument();
    expect(within(await openManage(user)).getByRole('link', { name: 'Open on GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/o/design',
    );
  });

  it('should open the branch on GitHub when the pane is on one (D92)', async () => {
    const user = userEvent.setup();
    renderRegion(
      facet({ kind: 'git', phase: 'connected', url: 'https://github.com/o/design.git', provider: 'github' }),
      syncFacet({ state: 'backedUp' }),
      { branch: 'audit/g1#2' },
    );

    const manage = await openManage(user);

    /* Each segment encoded, the separators kept: GitHub reads `/tree/<ref>` greedily. */
    expect(within(manage).getByRole('link', { name: 'Open on GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/o/design/tree/audit/g1%232',
    );
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

    await chooseChangeBackup(user);
    expect(screen.getByRole('button', { name: 'Pick GitHub repository' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
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

    await chooseChangeBackup(user);
    await user.click(screen.getByRole('radio', { name: 'GitHub or another Git host' }));
    await user.click(screen.getByRole('button', { name: 'Pick GitHub repository' }));

    expect(connect).not.toHaveBeenCalled();
    expect(screen.getByText('Replace Tau Cloud with o/r? Your history stays on this device.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Replace backup' }));
    await waitFor(() => {
      expect(connect).toHaveBeenCalledWith(
        'git',
        'https://github.com/o/r.git',
        expect.objectContaining({ provider: 'github', repositoryId: '99' }),
      );
    });
  });

  /* R2: the platform probes the new remote first; a refusal leaves the old one, and says so. */
  it('should keep the current backup in view with the new repository’s refusal and one way back (R2)', async () => {
    const user = userEvent.setup();
    renderRegion(
      facet({
        kind: 'git',
        phase: 'connected',
        url: 'https://github.com/o/design.git',
        provider: 'github',
        refusedReplacement: {
          kind: 'git',
          url: 'https://github.com/o/r.git',
          error: 'This remote has no repository at this address for your account.',
          reason: 'notFound',
          attempt: 1,
        },
      }),
      syncFacet({ state: 'backedUp' }),
    );

    const alert = screen.getByRole('alert', { name: 'Backup change refused' });
    expect(alert).toHaveTextContent(
      'This remote has no repository at this address for your account. o/design is still this project’s backup.',
    );
    /* One action: picking a backup again, not the kept repository's *Reconnect GitHub*. */
    expect(within(alert).getAllByRole('button')).toHaveLength(1);
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(screen.getByRole('button', { name: 'Pick GitHub repository' })).toBeInTheDocument();
    expect(screen.queryByRole('alert', { name: 'Backup change refused' })).not.toBeInTheDocument();
  });

  it('should offer the plan when Tau Cloud refuses to replace a Git backup on the owner’s plan (R2)', async () => {
    const user = userEvent.setup();
    const { upgrade } = renderRegion(
      facet({
        kind: 'git',
        phase: 'connected',
        url: 'https://gitlab.example.com/o/r.git',
        refusedReplacement: {
          kind: 'tau',
          error: 'Syncing files to Tau Cloud is a paid plan feature.',
          reason: 'notEntitled',
          attempt: 1,
        },
      }),
      syncFacet({ state: 'backedUp' }),
    );

    const alert = screen.getByRole('alert', { name: 'Backup change refused' });
    expect(alert).toHaveTextContent(
      'Syncing files to Tau Cloud is a paid plan feature. gitlab.example.com/o/r is still this project’s backup.',
    );
    expect(within(alert).getAllByRole('button')).toHaveLength(1);
    expect(within(alert).queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    await user.click(within(alert).getByRole('button'));
    expect(upgrade).toHaveBeenCalledTimes(1);
  });

  /*
   * R2: the binding and credential across a replacement's answer belong to the
   * hook's `connectRemote` (`use-revision-status.github-credential.test.tsx`,
   * "replacing a backup with another remote"), which outlives this region. The
   * region sends the pick once and never rebinds the kept repository itself.
   */
  it('should send a refused replacement once and leave the kept binding to the hook (R2)', async () => {
    const user = userEvent.setup();
    const kept = {
      connectionId: '00000000-0000-4000-8000-000000000002',
      repositoryId: 12,
      repositoryUrl: 'https://github.com/o/design.git',
      generation: 2,
    } as const;
    githubProjectBinding.set('p1', kept);
    onTestFinished(() => {
      githubProjectBinding.remove('p1');
    });
    const remote = facet({
      kind: 'git',
      phase: 'connected',
      url: kept.repositoryUrl,
      provider: 'github',
      repositoryId: '12',
    });
    const { connect, show } = renderRegion(remote, syncFacet({ state: 'backedUp' }), { projectId: 'p1' });

    await chooseChangeBackup(user);
    await user.click(screen.getByRole('button', { name: 'Pick GitHub repository' }));
    await user.click(screen.getByRole('button', { name: 'Replace backup' }));
    await waitFor(() => {
      expect(connect).toHaveBeenCalledTimes(1);
    });
    expect(connect).toHaveBeenLastCalledWith(
      'git',
      'https://github.com/o/r.git',
      expect.objectContaining({ provider: 'github', repositoryId: '99' }),
    );

    show({
      ...remote,
      refusedReplacement: {
        kind: 'git',
        url: 'https://github.com/o/r.git',
        error: 'Repository not found.',
        reason: 'notFound',
        attempt: 1,
      },
    });

    expect(await screen.findByRole('alert', { name: 'Backup change refused' })).toHaveTextContent(
      'Repository not found. o/design is still this project’s backup.',
    );
    expect(connect).toHaveBeenCalledTimes(1);
    expect(githubToken).not.toHaveBeenCalledWith(kept.connectionId);
    expect(githubProjectBinding.get('p1')).toStrictEqual(kept);
  });

  /* R3: the confirmation names the repository on both sides, never the bare host. */
  it.each([
    { from: 'https://github.com/o/old.git', to: 'https://github.com/o/new.git', names: 'o/old with o/new' },
    {
      from: 'https://gitlab.example.com/o/old.git',
      to: 'https://gitlab.example.com/o/new.git',
      names: 'gitlab.example.com/o/old with gitlab.example.com/o/new',
    },
  ])('should name both repositories when an address replaces $from (R3)', async ({ from, to, names }) => {
    const user = userEvent.setup();
    const { connect } = renderRegion(facet({ kind: 'git', phase: 'connected', url: from }));

    await chooseChangeBackup(user);
    await user.click(screen.getByText('Another Git host'));
    const address = screen.getByRole('textbox', { name: 'Repository address' });
    await user.clear(address);
    await user.type(address, to);
    await user.click(screen.getByRole('button', { name: 'Connect' }));

    expect(screen.getByText(`Replace ${names}? Your history stays on this device.`)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Replace backup' }));
    expect(connect).toHaveBeenCalledWith('git', to);
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

    await chooseChangeBackup(user);
    await user.click(screen.getByRole('radio', { name: 'This device only' }));
    await user.click(screen.getByRole('button', { name: 'Change backup' }));

    // The first press asks; nothing has happened yet (I11).
    expect(disconnect).not.toHaveBeenCalled();
    const dialog = screen.getByRole('alertdialog', { name: 'Disconnect Tau Cloud?' });
    expect(dialog).toHaveTextContent('Your history stays on this device.');

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(disconnect).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    await chooseChangeBackup(user);
    await user.click(screen.getByRole('radio', { name: 'This device only' }));
    await user.click(screen.getByRole('button', { name: 'Change backup' }));
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
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

    expect(screen.getByText('These files don’t fit in your plan and aren’t backed up:')).toBeInTheDocument();
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
    await openBackUp(user);

    await user.click(screen.getByRole('radio', { name: 'GitHub or another Git host' }));

    expect(connect).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Pick GitHub repository' })).toBeInTheDocument();
    await user.click(screen.getByText('Another Git host'));
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
      await openBackUp(user);

      await user.click(screen.getByRole('radio', { name: 'GitHub or another Git host' }));
      await user.click(screen.getByText('Another Git host'));

      const authority = screen.getByText(/^Advanced HTTPS remotes are anonymous/u);
      expect(authority).toHaveTextContent('a GitHub address here is linked read-only');
      expect(authority.textContent.includes('GitHub picker above')).toBe(pointsAtPicker);
    },
  );

  it('refuses an address the proxy would refuse, while the person is still typing', async () => {
    const user = userEvent.setup();
    renderRegion(facet());
    await openBackUp(user);
    await user.click(screen.getByRole('radio', { name: 'GitHub or another Git host' }));
    await user.click(screen.getByText('Another Git host'));

    await user.type(screen.getByRole('textbox', { name: 'Repository address' }), 'http://github.com/o/r.git');

    expect(screen.getByRole('alert')).toHaveTextContent('Only https addresses can be connected.');
    expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled();
  });

  it('explains that GitHub selections use Git LFS', async () => {
    const user = userEvent.setup();
    renderRegion(facet());
    await openBackUp(user);

    await user.click(screen.getByRole('radio', { name: 'GitHub or another Git host' }));
    await user.click(screen.getByText('Another Git host'));

    expect(
      screen.getByText(
        'GitHub repositories selected above use their Git LFS storage. Other hosts may reject large files.',
      ),
    ).toBeInTheDocument();
  });

  it('connects a repository selected through the shared GitHub picker', async () => {
    const user = userEvent.setup();
    const { connect } = renderRegion(facet());
    await openBackUp(user);
    await user.click(screen.getByRole('radio', { name: 'GitHub or another Git host' }));
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

    /* D94: a connected GitHub account did save a credential, so its sentence stands. */
    expect(screen.getByRole('alert', { name: 'GitHub connection' })).toHaveTextContent(
      'The remote rejected the saved credentials.',
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
    expect(githubToken).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', {
      repositoryId: 99,
      operation: 'read',
    });
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
    await chooseChangeBackup(user);
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

    await chooseChangeBackup(user);
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

  /* D18: a host that is not GitHub is offered neither GitHub nor Tau copy.
   * D94: and, being anonymous, is never told it had saved credentials.
   * R11: nor is the alert named for credentials it does not hold. */
  it('should say the remote asked for a sign-in Tau does not have, and retry, for a host that is not GitHub', async () => {
    const user = userEvent.setup();
    const region = renderRegion(
      facet({ kind: 'git', phase: 'reconnectRequired', url: 'https://gitlab.example.com/o/r.git' }),
    );

    const alert = screen.getByRole('alert', { name: 'Remote sign-in' });
    expect(alert).toHaveTextContent(
      'This remote asked for a sign-in Tau does not have, or has no repository at this address.',
    );
    expect(alert).not.toHaveTextContent(/saved credentials/u);
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

    await chooseChangeBackup(user);
    await user.click(screen.getByRole('radio', { name: 'This device only' }));
    await user.click(screen.getByRole('button', { name: 'Change backup' }));

    // The button the click came from unmounted; focus must not fall to <body>.
    expect(screen.getByRole('alertdialog', { name: 'Disconnect Tau Cloud?' })).toContainElement(
      document.activeElement as HTMLElement,
    );
  });

  /*
   * The Sync row's four states (S26, S41, AC21).
   *
   * One row per line of copy a person can actually read, because "Not backed
   * up" is the sentence this whole lane exists to be able to say honestly.
   */
  const rows: ReadonlyArray<readonly [SyncFacet['state'], number, string]> = [
    ['checking', 0, 'Checking for changes…'],
    ['backedUp', 0, 'Backed up'],
    ['pending', 1, 'Backing up 1 change…'],
    ['pending', 2, 'Backing up 2 changes…'],
    ['queued', 1, 'Not backed up · 1 change'],
    ['failed', 3, 'Not backed up · 3 changes'],
    ['conflicted', 0, 'Needs your decision'],
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

  /*
   * D68: *Not backed up* is for revisions the server has not acknowledged. A
   * repository removed from the app refuses access with nothing waiting; a
   * deleted one answers not-found, which cannot be told from an unshared one.
   */
  it.each([
    ['forbidden', 'Backed up · GitHub refused access'],
    ['unauthorized', 'Backed up · GitHub refused access'],
    ['notFound', 'Not backed up'],
  ] as const)('should say a %s refusal with nothing waiting as “%s”', (reason, copy) => {
    renderRegion(
      facet({
        kind: 'git',
        provider: 'github',
        phase: 'connected',
        url: 'https://github.com/rifont/example.git',
      }),
      syncFacet({ state: 'failed', reason, pendingCount: 0 }),
    );

    expect(screen.getByText(copy, { exact: true })).toBeInTheDocument();
  });

  /* D100: signed out, this device withholds its GitHub credential; GitHub refused nothing. */
  it.each([
    [0, 'Backed up'],
    [1, 'Not backed up · 1 change'],
  ] as const)('should ask a signed-out viewer to sign in when %i changes wait, saying “%s”', (pendingCount, copy) => {
    renderRegion(
      facet({ kind: 'git', provider: 'github', phase: 'connected', url: 'https://github.com/rifont/example.git' }),
      syncFacet({
        state: 'failed',
        reason: 'unauthorized',
        pendingCount,
        error: 'Sign in to Tau to sync with GitHub.',
      }),
      { isSignedOut: true },
    );

    const row = screen.getByRole('status', { name: 'Backup status' });
    expect(within(row).getByText(copy, { exact: true })).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/auth/sign-in');
    expect(row).not.toHaveTextContent('refused access');
    expect(screen.queryByRole('button', { name: 'Reconnect GitHub' })).not.toBeInTheDocument();
  });

  it('should offer a signed-in viewer Reconnect GitHub for the same refusal (D68)', () => {
    renderRegion(
      facet({ kind: 'git', provider: 'github', phase: 'connected', url: 'https://github.com/rifont/example.git' }),
      syncFacet({ state: 'failed', reason: 'unauthorized', pendingCount: 0, error: 'GitHub refused the credential.' }),
      { isSignedOut: false },
    );

    const row = screen.getByRole('status', { name: 'Backup status' });
    expect(within(row).getByText('Backed up · GitHub refused access', { exact: true })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Reconnect GitHub' })).toBeInTheDocument();
    expect(within(row).queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
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

    expect(screen.getByRole('status')).toHaveTextContent('Not backed up · 1 change');
    expect(screen.getByRole('status')).toHaveTextContent('Offline · backs up when you reconnect');
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
    expect(screen.getByText(/Back up to octo\/renamed from now on\?/u)).toBeInTheDocument();

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
    expect(githubToken).toHaveBeenCalledWith(connectionId, { repositoryId: 99, operation: 'read' });
  });

  it('should keep the remote when the person declines, and return focus to the offer', async () => {
    const user = userEvent.setup();
    githubRepository.mockResolvedValue(renamed);
    const region = renderRegion(bound, refused, { projectId: 'p1' });

    await user.click(await screen.findByRole('button', { name: 'Update remote' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

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

  /* D99: GitHub serves a renamed repository's old address without redirecting, so no sync ever fails. */
  it('should offer the new address on a backed-up row when GitHub reports the repository renamed (D99)', async () => {
    githubRepository.mockResolvedValue(renamed);
    renderRegion(bound, syncFacet({ state: 'backedUp' }), { projectId: 'p1' });

    const row = screen.getByRole('status', { name: 'Backup status' });
    expect(await within(row).findByText('This repository moved to octo/renamed.')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Update remote' })).toBeInTheDocument();
  });

  it('should add nothing to a backed-up row whose address still holds (D99)', async () => {
    githubRepository.mockResolvedValue({ ...renamed, cloneUrl: 'https://github.com/o/r.git' });
    renderRegion(bound, syncFacet({ state: 'backedUp' }), { projectId: 'p1' });

    await waitFor(() => {
      expect(githubRepository).toHaveBeenCalledOnce();
    });
    const row = screen.getByRole('status', { name: 'Backup status' });
    expect(within(row).queryByText(/moved/u)).not.toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'Update remote' })).not.toBeInTheDocument();
  });
});

describe('RevisionSyncRegion refusals and plan gates', () => {
  const connected = facet({ kind: 'tau', phase: 'connected', url: 'https://api.tau.new/v1/git/p1.git' });

  it('keeps a commit affordance when a live connection leaves connected (C9)', () => {
    const region = renderRegion(connected);
    expect(screen.getByRole('button', { name: 'Manage' })).toBeInTheDocument();

    region.show(facet({ kind: 'tau', phase: 'failed', error: 'Sign in to back this project up to Tau Cloud.' }));

    /* Before the fix this rendered three radios and *zero* buttons, so the
     * region was an inert dead end and focus fell to `<body>`. */
    expect(screen.getByRole('button', { name: 'Change backup' })).toBeInTheDocument();
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
    { reason: 'rejected', action: 'Try again' },
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
    { reason: 'largeFiles', role: 'button', action: 'Try again', state: 'failed' },
    { reason: 'rejected', role: 'button', action: 'Try again', state: 'failed' },
    { reason: 'unknown', role: 'button', action: 'Retry', state: 'failed' },
    /* W2: a `queued` refusal reads the same sentence and offers the same one
       verb as a `failed` one — the difference is only whether this device will
       retry by itself, which the row's *Offline* line says. */
    { reason: 'offline', role: 'button', action: 'Try again', state: 'queued' },
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
    await openBackUp(user);

    expect(screen.getByRole('radio', { name: 'Tau Cloud' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'GitHub or another Git host' })).toBeEnabled();
    const upgrades = screen.getAllByRole('button', { name: /Available on Pro/u });
    expect(upgrades).toHaveLength(1);

    await user.click(upgrades[0]!);
    expect(region.upgrade).toHaveBeenCalled();
    /* The whole point of the gate: nothing is registered on the server. */
    expect(region.connect).not.toHaveBeenCalled();
  });

  /* D16: an entitled account is told what its plan includes, not what it withholds. */
  it('should name the included allowance on the Tau Cloud choice instead of a plan gate', async () => {
    renderRegion(facet(), syncFacet(), { storageLimitBytes: 1024 ** 3 });
    await openBackUp(userEvent.setup());

    expect(screen.getByRole('radio', { name: 'Tau Cloud' })).toBeEnabled();
    expect(screen.getByText('1 GB included')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Available on Pro/u })).not.toBeInTheDocument();
  });

  /* D18: the figure the usage route answered, in the words a later 413 quotes. */
  it('should show a free account’s usage as x of 1 GB', async () => {
    const user = userEvent.setup();
    renderRegion(facet({ kind: 'tau', phase: 'connected', storage: { used: 340 * 1024 ** 2, quota: 1024 ** 3 } }));

    expect(await openManage(user)).toHaveTextContent('340 MB of 1 GB');
  });

  /* RV-W8 F12: the used figure trims its zeros like the allowance does. */
  it('should read a full free plan as 1 GB of 1 GB', async () => {
    const user = userEvent.setup();
    renderRegion(facet({ kind: 'tau', phase: 'connected', storage: { used: 1024 ** 3 + 1, quota: 1024 ** 3 } }));

    const manage = await openManage(user);
    expect(manage).toHaveTextContent('1 GB of 1 GB');
    expect(within(manage).getByRole('meter', { name: 'Storage used against your plan' })).toHaveAttribute(
      'aria-valuenow',
      '100',
    );
  });

  /* M8: retained packs were a debug figure; the line and Manage say nothing of them. */
  it('should draw no retained figure, even when packs are retained', async () => {
    const user = userEvent.setup();
    renderRegion(
      facet({
        kind: 'tau',
        phase: 'connected',
        storage: { used: 340 * 1024 ** 2, quota: 1024 ** 3, retained: 12 * 1024 ** 2 },
      }),
    );

    expect(await openManage(user)).not.toHaveTextContent(/kept for recovery/u);
  });

  /*
   * D17: the quota refusal's one action follows the viewer's relationship. The
   * owner who can grow the plan is offered Upgrade; an owner with no larger
   * plan (the pane withholds `onUpgrade`) and a collaborator get the sentence
   * and the file list alone.
   */
  describe('quota refusal by relationship (D17)', () => {
    const overQuota = facet({
      kind: 'tau',
      phase: 'connected',
      storage: { used: 1024 ** 3, quota: 1024 ** 3 },
      overQuota: ['inputs/enclosure-scan.step', 'inputs/reference.stl'],
    });
    const refused = (error: string): SyncFacet =>
      syncFacet({ state: 'failed', pendingCount: 1, error, reason: 'quota' });

    it('should offer the owner on Free exactly one action, Upgrade', () => {
      renderRegion(
        overQuota,
        refused('This push needs more room than your 1 GB storage plan has left, so it was not backed up.'),
        { role: 'owner' },
      );

      const row = screen.getByRole('status', { name: 'Backup status' });
      expect(row).toHaveTextContent('your 1 GB storage plan');
      expect(
        within(row)
          .getAllByRole('button')
          .map((button) => button.textContent.trim()),
      ).toStrictEqual(['Pro Upgrade']);
      expect(screen.getByText('These files don’t fit in your plan and aren’t backed up:')).toBeInTheDocument();
    });

    it('should give an owner on the top tier the file list and no plan action', () => {
      renderRegion(
        overQuota,
        refused(
          'This push needs more room than your 100 GB storage plan has left, so it was not backed up. Remove or stop tracking the largest files to make room.',
        ),
        { role: 'owner', onUpgrade: undefined },
      );

      const row = screen.getByRole('status', { name: 'Backup status' });
      expect(within(row).queryByRole('button')).not.toBeInTheDocument();
      expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toStrictEqual([
        'inputs/enclosure-scan.step',
        'inputs/reference.stl',
      ]);
    });

    /* RV-W8 F2: D20's ceiling is the same on every plan, so even an owner who could upgrade gets the list alone. */
    it('should give the repository ceiling the file list and no plan action, even for an owner on Free', () => {
      const region = renderRegion(
        overQuota,
        refused(
          'Tau: repository size limit exceeded — this push needs 5242880 bytes more than this repository may hold.',
        ),
        { role: 'owner' },
      );

      const row = screen.getByRole('status', { name: 'Backup status' });
      expect(within(row).queryByRole('button')).not.toBeInTheDocument();
      expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toStrictEqual([
        'inputs/enclosure-scan.step',
        'inputs/reference.stl',
      ]);
      expect(region.upgrade).not.toHaveBeenCalled();
    });

    it('should direct a write collaborator to the owner with no plan action', () => {
      const region = renderRegion(
        overQuota,
        refused(
          "This push needs more room than the project owner's storage plan has left, so it was not backed up. Ask the owner to make room.",
        ),
        { role: 'write' },
      );

      const row = screen.getByRole('status', { name: 'Backup status' });
      expect(row).toHaveTextContent('Ask the owner to make room.');
      expect(within(row).queryByRole('button', { name: /Upgrade/u })).not.toBeInTheDocument();
      expect(
        screen.getByText('These files don’t fit in the project owner’s plan and aren’t backed up:'),
      ).toBeInTheDocument();
      expect(region.upgrade).not.toHaveBeenCalled();
    });
  });

  it('should offer only Include chats in Manage', async () => {
    const user = userEvent.setup();
    const region = renderRegion(connected);

    const manage = await openManage(user);
    expect(within(manage).getAllByRole('switch')).toHaveLength(1);
    const chats = within(manage).getByRole('switch', { name: 'Include chats' });
    expect(chats).toBeChecked();
    expect(manage).not.toHaveTextContent(/Sync exports|GeoSpec/u);
    await user.click(chats);
    expect(region.setSyncChats).toHaveBeenCalledWith(false);
  });

  it('should omit export and candidate sharing options from Git backup settings', async () => {
    const user = userEvent.setup();
    renderRegion(facet({ kind: 'git', phase: 'connected', url: 'https://example.test/model.git' }));

    const manage = await openManage(user);
    expect(within(manage).queryByRole('switch')).not.toBeInTheDocument();
    expect(manage).not.toHaveTextContent(/Sync exports|GeoSpec/u);
    expect(within(manage).getByRole('button', { name: 'Change…' })).toBeInTheDocument();
  });
});

/**
 * People with access moved to Share (C4, Q5). The line keeps one fact about
 * them, for the owner who can see the listing: how many people share it.
 */
describe('RevisionSyncRegion people with access', () => {
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
  });

  it('says how many people the owner shares the project with, and leaves the invite form to Share', async () => {
    const fetchMock = answer([
      { email: 'maya@example.test', role: 'write', status: 'accepted', expiresAt: '2026-10-02T00:00:00.000Z' },
      { email: 'sam@example.test', role: 'read', status: 'pending', expiresAt: '2026-10-02T00:00:00.000Z' },
      { email: 'old@example.test', role: 'read', status: 'revoked', expiresAt: '2026-10-02T00:00:00.000Z' },
    ]);
    renderRegion(connected, syncFacet({ state: 'backedUp' }), { role: 'owner', projectId: 'proj_1' });

    const backup = screen.getByRole('status', { name: 'Backup status' });
    expect(await within(backup).findByText('Shared with 2 people')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('https://api.test/v1/projects/proj_1/collaborators', expect.anything());
    expect(screen.queryByRole('textbox', { name: 'Invite by email' })).toBeNull();
    expect(screen.queryByText('People with access')).toBeNull();
  });

  it('says nothing about sharing when nobody else has access', async () => {
    const fetchMock = answer([]);
    renderRegion(connected, syncFacet({ state: 'backedUp' }), { role: 'owner', projectId: 'proj_1' });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(screen.queryByText(/^Shared with/u)).toBeNull();
  });

  /* N4: collaboration is a Tau Cloud fact, and the listing is the owner's. */
  it.each([
    {
      name: 'a GitHub backup',
      remote: facet({ kind: 'git', phase: 'connected', url: 'https://github.com/o/r.git', provider: 'github' }),
      role: 'owner',
    },
    { name: 'a write collaborator', remote: connected, role: 'write' },
    { name: 'a view-only collaborator', remote: connected, role: 'read' },
  ] as const)('reads no listing for $name', ({ remote, role }) => {
    const fetchMock = answer([]);
    renderRegion(remote, syncFacet({ state: 'backedUp' }), { role, projectId: 'proj_1' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/^Shared with/u)).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Invite by email' })).toBeNull();
  });

  /* N1: the listing answered and did not name this project, which is what an
     owner's revoke looks like to a tab that is still open. */
  it('says so when access was revoked while the project was open', () => {
    renderRegion(connected, syncFacet({ state: 'backedUp' }), { role: 'revoked', projectId: 'proj_1' });

    /* A missing listing proves neither deletion nor an owner revocation. */
    const backup = screen.getByRole('status', { name: 'Backup status' });
    expect(backup).toHaveTextContent('Cloud copy unavailable');
    expect(backup).toHaveTextContent(
      'The cloud copy was deleted or your access changed. Your history is still on this device.',
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Manage' })).toBeNull();
  });

  it('should preserve the deletion refusal when the cloud listing no longer names the project', () => {
    renderRegion(
      connected,
      syncFacet({
        state: 'failed',
        reason: 'notFound',
        error: 'This project has been deleted from Tau Cloud.',
        pendingCount: 1,
      }),
      { role: 'revoked', projectId: 'proj_1' },
    );

    const backup = screen.getByRole('status', { name: 'Backup status' });
    expect(backup).toHaveTextContent('Cloud copy unavailable');
    expect(backup).toHaveTextContent('This project has been deleted from Tau Cloud.');
    expect(backup).toHaveTextContent('Your history is still on this device.');
    expect(backup).not.toHaveTextContent('The owner removed');
    expect(backup).not.toHaveTextContent('Ask them to add you again');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Manage' })).toBeNull();
  });

  it('never offers a view-only collaborator a push', () => {
    renderRegion(connected, syncFacet({ state: 'backedUp' }), { role: 'read', projectId: 'proj_1' });

    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Manage' })).toBeNull();
    expect(screen.getByText('View only')).toBeDefined();
  });
});

/** The round 19 layout and the W2a / HQ7 rows. */
describe('RevisionSyncRegion backup line', () => {
  const tau = facet({ kind: 'tau', phase: 'connected', url: 'https://api.tau.new/v1/git/p1.git' });

  /* W2a, I12: a damaged cloud copy is terminal; the one honest thing to offer is the truth. */
  it('says a damaged Tau Cloud copy stopped backing up, and offers no action it cannot keep', () => {
    renderRegion(
      tau,
      syncFacet({ state: 'failed', pendingCount: 2, reason: 'damaged', error: 'GIT_REPOSITORY_INCOMPLETE' }),
    );

    const backup = screen.getByRole('status', { name: 'Backup status' });
    expect(backup).toHaveTextContent(
      'Tau has to repair this project’s copy on Tau Cloud before it can back it up again. Nothing on this device is lost.',
    );
    expect(backup).not.toHaveTextContent('GIT_REPOSITORY_INCOMPLETE');
    expect(within(backup).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sync now' })).toBeNull();
  });

  /* C4: the pane's last line, with no card, no heading and no Details (M8). */
  it('is one line with Manage, and no card, heading or Details', () => {
    renderRegion(tau, syncFacet({ state: 'backedUp' }));

    const line = screen.getByRole('region', { name: 'Backup' });
    expect(line).toHaveAttribute('data-slot', 'backup-line');
    expect(within(line).queryByRole('heading')).toBeNull();
    expect(line.querySelector('.bg-card, [data-slot="card"], section section')).toBeNull();
    expect(within(line).queryByRole('button', { name: 'Details' })).toBeNull();
    expect(within(line).getByRole('status', { name: 'Backup status' })).toHaveTextContent('Tau Cloud·Backed up');
    expect(
      within(line)
        .getAllByRole('button')
        .map((button) => button.textContent.trim()),
    ).toStrictEqual(['Manage']);
  });

  it.each([
    { state: 'pending', online: true, says: 'Backing up…' },
    { state: 'queued', online: false, says: 'Offline · backs up when you reconnect' },
  ] as const)('offers no manual sync while $state: backup is continuous', ({ state, online, says }) => {
    renderRegion(tau, syncFacet({ state, online }));

    expect(screen.getByRole('status', { name: 'Backup status' })).toHaveTextContent(says);
    expect(screen.queryByRole('button', { name: /Sync now|Try again/u })).toBeNull();
  });

  it('opens Manage with the place, its state, Include chats, Change… and Disconnect…', async () => {
    const user = userEvent.setup();
    renderRegion(tau, syncFacet({ state: 'backedUp' }));

    const manage = await openManage(user);
    expect(manage).toHaveTextContent('Tau Cloud');
    expect(manage).toHaveTextContent('Backed up');
    expect(within(manage).getByRole('switch', { name: 'Include chats' })).toBeInTheDocument();
    expect(
      within(manage)
        .getAllByRole('button')
        .map((button) => button.textContent.trim()),
    ).toStrictEqual(['Change…', 'Disconnect…']);
  });

  it('disconnects from Manage only after the dialog confirms, then hands focus back (I11, A1 item 2)', async () => {
    const user = userEvent.setup();
    const { disconnect } = renderRegion(tau, syncFacet({ state: 'backedUp' }));

    await user.click(within(await openManage(user)).getByRole('button', { name: 'Disconnect…' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Disconnect Tau Cloud?' });
    expect(dialog).toHaveTextContent('Your history stays on this device.');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(disconnect).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Manage' })).toHaveFocus();
    });

    await user.click(within(await openManage(user)).getByRole('button', { name: 'Disconnect…' }));
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  /* HQ7: before the projection names the line, a backup verb could only fail after the gesture. */
  it('defers Change… and Disconnect… until the line is known', async () => {
    const user = userEvent.setup();
    renderRegion(
      facet({ kind: 'git', phase: 'connected', url: 'https://github.com/o/design.git', provider: 'github' }),
      syncFacet({ state: 'backedUp' }),
      { isLineKnown: false },
    );

    const manage = await openManage(user);
    expect(within(manage).getByRole('link', { name: 'Open on GitHub' })).toBeInTheDocument();
    expect(within(manage).queryByRole('button', { name: 'Change…' })).toBeNull();
    expect(within(manage).queryByRole('button', { name: /^Disconnect/u })).toBeNull();
  });
});
