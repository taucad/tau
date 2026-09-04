import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import type { FakePaseoDaemonHandle, TargetPaseoConnection } from '#support/external-target.js';

/**
 * The SP-10 vertical: a Paseo agent selected and run entirely from the page.
 *
 * The only thing faked is the daemon behind the socket. The browser opens a
 * real `@getpaseo/client` session — real relay handshake, real ECDH E2EE, real
 * protocol-v2 vocabulary — against `startPaseoFakeDaemon`, and the API serves
 * only the directory: pair, list, the owner-scoped offer, disconnect. If the
 * page ever went back to asking the API to drive the daemon, the offer route
 * would go unused and the daemon would see no session at all.
 */
const pairedAt = '2026-09-03T01:00:00.000Z';
const connection: TargetPaseoConnection = {
  id: 'connection-workstation',
  label: 'Local workstation',
  serverId: 'fake-paseo-daemon',
  relayEndpoint: '127.0.0.1:0',
  createdAt: pairedAt,
  updatedAt: pairedAt,
};

const waitForPersistedPaseoSelection = async (agentId: string): Promise<void> => {
  await target.waitFor(
    ({ connectionId, agent }) => {
      const evidence = document.querySelector('[data-testid="paseo-persisted-execution"]');
      return (
        evidence instanceof HTMLElement &&
        evidence.dataset['kind'] === 'paseo' &&
        evidence.dataset['connectionId'] === connectionId &&
        evidence.dataset['agentId'] === agent
      );
    },
    { connectionId: connection.id, agent: agentId },
    { timeout: 30_000 },
  );
};

test('pairs, lists over the real SDK, selects, restores, and disconnects a Paseo agent', async () => {
  const daemon: FakePaseoDaemonHandle = await target.startPaseoFakeDaemon({
    agents: [{ id: 'fake-claude', title: 'Claude Code', provider: 'anthropic', model: 'claude-sonnet' }],
    turn: { items: [{ type: 'assistant_message', text: 'Ready.' }] },
  });
  try {
    await target.installPaseoRestFixture({
      pairedConnection: { ...connection, relayEndpoint: daemon.endpoint },
      offer: {
        serverId: daemon.serverId,
        daemonPublicKeyB64: daemon.daemonPublicKeyB64,
        relayEndpoint: daemon.endpoint,
      },
    });
    await target.navigate('/__e2e/paseo-connection');
    await target.expectVisible(selectors.getByLabelText('Pairing link'), 60_000);
    await target.expectVisible(selectors.getByRole('button', { name: 'Select agent: Tau' }));

    // Pair: the secret goes up in the request and never comes back down.
    await target.fill(selectors.getByLabelText('Pairing link'), 'paseo://reusable-bearer-secret');
    await target.fill(selectors.getByLabelText('Password (optional)'), 'fixture-password');
    await target.fill(selectors.getByLabelText('Label'), 'Local workstation');
    await target.click(selectors.getByRole('button', { name: 'Pair daemon' }));
    await target.expectVisible(selectors.getByText('Local workstation paired', { exact: true }));
    const pairingLink = await target.read(selectors.getByLabelText('Pairing link'));
    const password = await target.read(selectors.getByLabelText('Password (optional)'));
    expect(pairingLink.value).toBe('');
    expect(password.value).toBe('');

    // The selector lists agents by opening the E2EE session itself.
    await target.click(selectors.getByRole('button', { name: 'Select agent: Tau' }));
    await target.expectVisible(selectors.getByPlaceholder('Search agents...'));
    await target.fill(selectors.getByPlaceholder('Search agents...'), 'Claude Code');
    await target.keyboardPress('ArrowDown');
    await target.keyboardPress('Enter');
    await target.expectVisible(selectors.getByRole('button', { name: 'Select agent: Claude Code' }));
    await waitForPersistedPaseoSelection('fake-claude');

    // The selection survives a reload from durable state, not from memory.
    await target.reload();
    await target.expectVisible(selectors.getByRole('button', { name: 'Select agent: Claude Code' }), 60_000);

    await target.click(selectors.getByRole('button', { name: 'Disconnect Tau' }));
    const dialog = selectors.getByRole('alertdialog', { name: 'Disconnect Local workstation from Tau?' });
    await target.expectVisible(dialog);
    expect(await target.textContent(dialog)).toContain(
      'hard revocation requires rotating the daemon key or server identity',
    );
    await target.click(selectors.getByRole('button', { name: 'Confirm disconnect Tau' }));
    await target.expectVisible(selectors.getByText('Local workstation disconnected from Tau', { exact: true }));
    await target.expectVisible(selectors.getByText('No Paseo daemons paired yet.', { exact: true }));

    /* The page — not the API — held the session: the daemon saw this browser's
     * own hello and its agent enumeration. */
    const seen = await target.stopPaseoFakeDaemon();
    expect(seen).toContain('hello');
    expect(seen).toContain('fetch_agents_request');
  } finally {
    await target.stopPaseoFakeDaemon();
  }
}, 180_000);
