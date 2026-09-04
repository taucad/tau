import { beforeEach, describe, expect, it, vi } from 'vitest';

/* eslint-disable @typescript-eslint/naming-convention -- mock mirrors the runtime environment contract. */
const environment = vi.hoisted(() => ({ TAU_API_URL: 'https://api.tau.test/' }));

vi.mock('#environment.config.js', () => ({ ENV: environment }));
/* eslint-enable @typescript-eslint/naming-convention -- mock mirrors the runtime environment contract. */

const { listPaseoConnections, pairPaseoConnection, revokePaseoConnection } =
  await import('#lib/paseo-connection-client.js');

const connection = {
  id: 'connection-1',
  label: 'Workstation',
  serverId: 'server-1',
  relayEndpoint: 'wss://relay.invalid',
  createdAt: '2026-08-29T00:00:00.000Z',
  updatedAt: '2026-08-29T00:00:00.000Z',
};

describe('Paseo connection client', () => {
  beforeEach(() => {
    environment.TAU_API_URL = 'https://api.tau.test/';
    vi.restoreAllMocks();
  });

  it('reads TAU_API_URL when the request starts', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ connections: [] }));
    environment.TAU_API_URL = 'https://late-api.tau.test/';

    await listPaseoConnections();

    expect(fetch).toHaveBeenCalledWith(
      'https://late-api.tau.test/v1/connectors/paseo',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('uses the exact list envelope for sanitized connections', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ connections: [connection] }));

    await expect(listPaseoConnections()).resolves.toEqual([connection]);
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'https://api.tau.test/v1/connectors/paseo',
      expect.objectContaining({ credentials: 'include' }),
    );
  });
  it('sends pairing secrets only in the request and strips unknown response fields', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        Response.json({ ...connection, offer: 'paseo://must-not-reach-browser-state', password: 'secret' }),
      );

    const result = await pairPaseoConnection({
      offer: 'paseo://bearer-link',
      password: 'secret',
      label: 'Workstation',
    });

    expect(fetch).toHaveBeenCalledWith(
      'https://api.tau.test/v1/connectors/paseo/pair',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ offer: 'paseo://bearer-link', password: 'secret', label: 'Workstation' }),
      }),
    );
    expect(result).toEqual(connection);
    expect(result).not.toHaveProperty('offer');
    expect(result).not.toHaveProperty('password');
  });

  it('disconnects through the directory DELETE', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(undefined, { status: 204 }));

    await revokePaseoConnection('connection-1');

    expect(fetch).toHaveBeenCalledWith(
      'https://api.tau.test/v1/connectors/paseo/connection-1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
