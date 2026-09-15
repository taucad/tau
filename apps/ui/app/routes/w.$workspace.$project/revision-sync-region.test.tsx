/**
 * The Sync region, driven by a scripted projection (S26, S35, AC10 client half).
 *
 * The region is presentational, so every row here is what a person would see
 * for a given `RemoteFacet` — no worker, no actor, no network.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { RevisionSyncRegion } from '#routes/w.$workspace.$project/revision-sync-region.js';
import type { RemoteFacet, SyncFacet } from '@taucad/revisions';
import type { RevisionSyncRegionProps } from '#routes/w.$workspace.$project/revision-sync-region.js';

const githubToken = vi.hoisted(() =>
  vi.fn(async () => ({
    accessToken: 'secret',
    expiresAt: '2026-09-14T00:00:00Z',
    generation: 3,
  })),
);

vi.mock('#lib/github-connections.js', () => ({
  githubConnections: { token: githubToken },
}));
vi.mock('#components/github/github-repository-picker.js', () => ({
  GithubRepositoryPicker: ({ onSelect }: { onSelect: (selection: unknown) => void }) => (
    <button
      type='button'
      onClick={() => {
        onSelect({
          connection: { id: '00000000-0000-4000-8000-000000000001' },
          repository: {
            id: 99,
            cloneUrl: 'https://github.com/o/r.git',
            access: 'write',
          },
        });
      }}
    >
      Pick GitHub repository
    </button>
  ),
}));

const facet = (overrides: Partial<RemoteFacet> = {}): RemoteFacet => ({
  kind: 'none',
  url: undefined,
  phase: 'none',
  storage: undefined,
  overQuota: [],
  error: undefined,
  fetchOnly: false,
  provider: undefined,
  repositoryId: undefined,
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
  ...overrides,
});

const renderRegion = (
  remote: RemoteFacet,
  sync: SyncFacet = syncFacet(),
): Readonly<{
  connect: ReturnType<typeof vi.fn<RevisionSyncRegionProps['onConnect']>>;
  disconnect: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  syncNow: ReturnType<typeof vi.fn>;
  setSyncChats: ReturnType<typeof vi.fn>;
}> => {
  const connect = vi.fn<RevisionSyncRegionProps['onConnect']>();
  const disconnect = vi.fn();
  const cancel = vi.fn();
  const syncNow = vi.fn();
  const setSyncChats = vi.fn();
  render(
    <MemoryRouter>
      <RevisionSyncRegion
        remote={remote}
        sync={sync}
        onConnect={connect}
        onDisconnect={disconnect}
        onCancel={cancel}
        onSync={syncNow}
        syncChats
        onSyncChatsChange={setSyncChats}
      />
    </MemoryRouter>,
  );
  return { connect, disconnect, cancel, syncNow, setSyncChats };
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
        error: 'Your GitHub connection needs to be renewed.',
      }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Your GitHub connection needs to be renewed.');
    await user.click(screen.getByRole('button', { name: 'Reconnect GitHub' }));
    expect(screen.getByRole('button', { name: 'Pick GitHub repository' })).toBeInTheDocument();
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
