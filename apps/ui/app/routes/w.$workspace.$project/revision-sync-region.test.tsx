/**
 * The Sync region, driven by a scripted projection (S26, S35, AC10 client half).
 *
 * The region is presentational, so every row here is what a person would see
 * for a given `RemoteFacet` — no worker, no actor, no network.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RevisionSyncRegion } from '#routes/w.$workspace.$project/revision-sync-region.js';
import type { RemoteFacet, SyncFacet } from '@taucad/revisions';

const authorizeGithubRemote = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('#lib/share-providers.js', () => ({ authorizeGithubRemote }));

const facet = (overrides: Partial<RemoteFacet> = {}): RemoteFacet => ({
  kind: 'none',
  url: undefined,
  phase: 'none',
  storage: undefined,
  overQuota: [],
  error: undefined,
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
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
}> => {
  const connect = vi.fn();
  const disconnect = vi.fn();
  const cancel = vi.fn();
  render(
    <RevisionSyncRegion remote={remote} sync={sync} onConnect={connect} onDisconnect={disconnect} onCancel={cancel} />,
  );
  return { connect, disconnect, cancel };
};

describe('RevisionSyncRegion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authorizeGithubRemote.mockResolvedValue(undefined);
  });

  it('offers the three remote kinds and says what connecting asks for', () => {
    renderRegion(facet());

    expect(screen.getByRole('radio', { name: 'No remote' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Tau Cloud' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Git remote' })).not.toBeChecked();
    expect(screen.getByText(/signs this project’s files, history and chats in/u)).toBeInTheDocument();
  });

  it('asks to connect when Tau Cloud is picked', async () => {
    const user = userEvent.setup();
    const { connect } = renderRegion(facet());

    await user.click(screen.getByRole('radio', { name: 'Tau Cloud' }));

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
    expect(screen.getByText('https://api.tau.new/v1/git/p1.git')).toBeInTheDocument();
  });

  it('asks before disconnecting, and says what disconnecting costs', async () => {
    const user = userEvent.setup();
    const { disconnect } = renderRegion(facet({ kind: 'tau', phase: 'connected', url: 'https://example.test/p1.git' }));

    await user.click(screen.getByRole('button', { name: 'Disconnect' }));

    // The first press asks; nothing has happened yet.
    expect(disconnect).not.toHaveBeenCalled();
    expect(screen.getByText('Disconnect this remote? Every revision stays on this device.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(disconnect).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
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

    expect(screen.getByText('These files are over your plan and were not backed up:')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toStrictEqual([
      'models/bracket.step',
      'models/housing.step',
    ]);
  });

  it('reports a failed connection as an alert, not as silence', () => {
    renderRegion(facet({ kind: 'tau', phase: 'failed', error: 'The remote did not answer.' }));

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
    expect(screen.getByRole('textbox', { name: 'Repository address' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled();
  });

  it('names the authority it will ask for, and asks for more only once the repository is private', async () => {
    const user = userEvent.setup();
    renderRegion(facet());
    await user.click(screen.getByRole('radio', { name: 'Git remote' }));

    await user.type(screen.getByRole('textbox', { name: 'Repository address' }), 'https://github.com/o/r.git');

    expect(
      screen.getByText('GitHub will ask you to let Tau read and write your public repositories.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'This repository is private' }));

    expect(
      screen.getByText('GitHub will ask you to let Tau read and write your repositories, including private ones.'),
    ).toBeInTheDocument();
  });

  it('refuses an address the proxy would refuse, while the person is still typing', async () => {
    const user = userEvent.setup();
    renderRegion(facet());
    await user.click(screen.getByRole('radio', { name: 'Git remote' }));

    await user.type(screen.getByRole('textbox', { name: 'Repository address' }), 'http://github.com/o/r.git');

    expect(screen.getByRole('alert')).toHaveTextContent('Only https addresses can be connected.');
    expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled();
  });

  it('says plainly that large files do not cross a third-party wire (S35, P17)', async () => {
    const user = userEvent.setup();
    renderRegion(facet());

    await user.click(screen.getByRole('radio', { name: 'Git remote' }));

    expect(
      screen.getByText('Files over 1 MB stay on this device: Tau transfers large files to Tau Cloud only.'),
    ).toBeInTheDocument();
  });

  it('takes consent before it connects, and connects with what the person said', async () => {
    const user = userEvent.setup();
    const consent = { closed: false, close: vi.fn(), location: { href: '' } };
    vi.spyOn(globalThis, 'open').mockReturnValue(consent as unknown as Window);
    const { connect } = renderRegion(facet());
    await user.click(screen.getByRole('radio', { name: 'Git remote' }));
    await user.type(screen.getByRole('textbox', { name: 'Repository address' }), 'https://github.com/o/r.git');
    await user.click(screen.getByRole('checkbox', { name: 'This repository is private' }));

    await user.click(screen.getByRole('button', { name: 'Connect' }));

    expect(authorizeGithubRemote).toHaveBeenCalledWith({
      visibility: 'private',
      consent,
      reconnect: false,
    });
    expect(connect).toHaveBeenCalledWith('git', 'https://github.com/o/r.git', { visibility: 'private' });
  });

  it('never connects when consent was refused, and says so', async () => {
    const user = userEvent.setup();
    const consent = { closed: false, close: vi.fn(), location: { href: '' } };
    vi.spyOn(globalThis, 'open').mockReturnValue(consent as unknown as Window);
    authorizeGithubRemote.mockRejectedValueOnce(new Error('GitHub permission was not granted.'));
    const { connect } = renderRegion(facet());
    await user.click(screen.getByRole('radio', { name: 'Git remote' }));
    await user.type(screen.getByRole('textbox', { name: 'Repository address' }), 'https://github.com/o/r.git');

    await user.click(screen.getByRole('button', { name: 'Connect' }));

    expect(connect).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('GitHub permission was not granted.');
  });

  /*
   * *Reconnect GitHub* (charter W12): an `AUTH_SECRET` rotation is not a failed
   * push, so the row asks again for the grant rather than reporting an error
   * nobody can act on.
   */
  it('asks GitHub again, and only GitHub, when the credential has to be renewed', async () => {
    const user = userEvent.setup();
    const consent = { closed: false, close: vi.fn(), location: { href: '' } };
    vi.spyOn(globalThis, 'open').mockReturnValue(consent as unknown as Window);
    const { connect } = renderRegion(
      facet({
        kind: 'git',
        phase: 'reconnectRequired',
        url: 'https://github.com/o/r.git',
        error: 'Your GitHub connection needs to be renewed.',
      }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Your GitHub connection needs to be renewed.');
    await user.click(screen.getByRole('button', { name: 'Reconnect GitHub' }));

    expect(authorizeGithubRemote).toHaveBeenCalledWith({
      visibility: 'public',
      consent,
      reconnect: true,
    });
    expect(connect).toHaveBeenCalledWith('git', 'https://github.com/o/r.git', { visibility: 'public' });
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
    renderRegion(facet({ kind: 'tau', phase: 'connected', url: 'https://example.test/p1.git' }));

    await user.click(screen.getByRole('button', { name: 'Disconnect' }));

    // The button the click came from unmounted; focus must not fall to <body>.
    expect(screen.getByRole('button', { name: 'Disconnect' })).toHaveFocus();
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
    ['pending', 2, 'Backing up… 2'],
    ['queued', 1, 'Not backed up · 1'],
    ['failed', 3, 'Not backed up · 3'],
    ['conflicted', 0, 'Needs resolution'],
  ];

  it.each(rows)('says %s as “%s”', (state, pendingCount, copy) => {
    renderRegion(
      facet({ kind: 'tau', phase: 'connected', url: 'https://api.tau.new/v1/git/p1.git' }),
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
      facet({ kind: 'tau', phase: 'connected', url: 'https://api.tau.new/v1/git/p1.git' }),
      syncFacet({ state: 'queued', pendingCount: 1, online: false }),
    );

    expect(screen.getByRole('status')).toHaveTextContent('Not backed up · 1');
    expect(screen.getByRole('status')).toHaveTextContent('Offline');
  });
});
