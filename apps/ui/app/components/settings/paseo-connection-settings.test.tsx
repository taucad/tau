// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const listConnections = vi.fn();
const pairConnection = vi.fn();
const revokeConnection = vi.fn();

vi.mock('#lib/paseo-connection-client.js', () => ({
  listPaseoConnections: listConnections,
  pairPaseoConnection: pairConnection,
  revokePaseoConnection: revokeConnection,
}));

const { PaseoConnectionSettings } = await import('#components/settings/paseo-connection-settings.js');

const connection = {
  id: 'connection-1',
  label: 'Workstation',
  serverId: 'server-1',
  relayEndpoint: 'wss://relay.invalid',
  lastConnectedAt: null,
  lastError: null,
  createdAt: '2026-08-28T00:00:00.000Z',
  updatedAt: '2026-08-28T00:00:00.000Z',
};

describe('PaseoConnectionSettings', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    listConnections.mockResolvedValue([]);
    pairConnection.mockResolvedValue(connection);
    vi.spyOn(Storage.prototype, 'setItem');
  });

  it('keeps pairing material request-local and clears it after pairing', async () => {
    const user = userEvent.setup();
    render(<PaseoConnectionSettings />);

    const offer = screen.getByLabelText('Pairing link');
    const password = screen.getByLabelText('Password (optional)');
    await user.type(offer, 'paseo://secret-offer');
    await user.type(password, 'secret-password');
    await user.click(screen.getByRole('button', { name: 'Pair daemon' }));

    await waitFor(() => {
      expect(pairConnection).toHaveBeenCalledWith({ offer: 'paseo://secret-offer', password: 'secret-password' });
    });
    expect(offer).toHaveValue('');
    expect(password).toHaveValue('');
    expect(Storage.prototype.setItem).not.toHaveBeenCalled();
    expect(screen.getByText('Workstation paired')).toBeInTheDocument();
  });

  it('explains the upstream revocation limit before disconnecting Tau', async () => {
    listConnections.mockResolvedValue([connection]);
    revokeConnection.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<PaseoConnectionSettings />);

    await user.click(await screen.findByRole('button', { name: 'Disconnect Tau' }));

    expect(revokeConnection).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog', { name: 'Disconnect Workstation from Tau?' })).toHaveTextContent(
      'hard revocation requires rotating the daemon key or server identity',
    );
    await user.click(screen.getByRole('button', { name: 'Confirm disconnect Tau' }));
    await waitFor(() => {
      expect(revokeConnection).toHaveBeenCalledWith('connection-1');
    });
  });
});
