import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createRemoteHostSession,
  listRemoteHosts,
  provisionCloudHost,
  RemoteHostApiError,
} from '#lib/remote-host-client.js';

/* eslint-disable @typescript-eslint/naming-convention -- mock mirrors the runtime environment contract. */
const environment = vi.hoisted(() => ({ TAU_API_URL: 'https://initial-api.tau.test/' }));

vi.mock('#environment.config.js', () => ({ ENV: environment }));
/* eslint-enable @typescript-eslint/naming-convention -- mock mirrors the runtime environment contract. */

describe('remote host runtime environment', () => {
  afterEach(() => {
    environment.TAU_API_URL = 'https://initial-api.tau.test/';
    vi.restoreAllMocks();
  });

  it('reads TAU_API_URL when the request starts', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json([]));
    environment.TAU_API_URL = 'https://late-api.tau.test/';

    await listRemoteHosts();

    expect(fetch).toHaveBeenCalledWith(
      'https://late-api.tau.test/v1/agents',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  /*
   * The API refuses a session with a `code` and no `message` (`ConflictException
   * ({ code: 'BUSY' })` when the daemon is at capacity). Falling back to "Remote
   * compute request failed" threw that reason away, and the user was left with a
   * card that named nothing they could act on.
   */
  it('phrases the API refusal code instead of a generic failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ code: 'BUSY' }, { status: 409 }));

    const refusal = await createRemoteHostSession('agent_1', '1.0.0').catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(RemoteHostApiError);
    expect(refusal).toMatchObject({ code: 'BUSY' });
    expect((refusal as Error).message).toMatch(/already running/iu);
  });

  /*
   * The provisioner's own line ("no image", "Cannot connect to the Docker
   * daemon") is the only actionable fact in a cloud refusal, and it arrives in
   * the shared envelope's `error` field because `HttpExceptionFilter` maps a
   * string `message` there. Phrasing the code alone threw it away.
   */
  it('phrases a cloud provisioning refusal with the API reason', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json(
        {
          error: "Unable to find image 'tau-host:latest' locally",
          code: 'CLOUD_HOST_UNAVAILABLE',
          statusCode: 503,
        },
        { status: 503 },
      ),
    );

    const refusal = await provisionCloudHost('project-a').catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(RemoteHostApiError);
    expect(refusal).toMatchObject({ code: 'CLOUD_HOST_UNAVAILABLE' });
    expect((refusal as Error).message).toBe(
      "Tau Cloud is unavailable: Unable to find image 'tau-host:latest' locally",
    );
  });

  /* Nest's generic status phrase is not a reason: every other refusal's `error`
   * reads "Conflict Exception", which says nothing the code did not. */
  it('does not append the generic status phrase to a refusal that carries no reason', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ error: 'Conflict Exception', code: 'BUSY', statusCode: 409 }, { status: 409 }),
    );

    const refusal = await createRemoteHostSession('agent_1', '1.0.0').catch((error: unknown) => error);

    expect((refusal as Error).message).not.toContain('Conflict Exception');
  });

  it('names an unknown code rather than hiding it', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ code: 'TEAPOT' }, { status: 418 }));

    const refusal = await createRemoteHostSession('agent_1', '1.0.0').catch((error: unknown) => error);

    expect((refusal as Error).message).toContain('TEAPOT');
  });
});
