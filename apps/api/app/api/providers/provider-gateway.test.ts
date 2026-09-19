import { generateKeyPairSync } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { executeGatewayProviderRequest } from '#api/providers/provider-gateway.js';

/**
 * Vertex credentials whose private key is generated here and never leaves the
 * process: the gateway signs a JWT with it before every dispatch, and the token
 * exchange is answered by the stub below rather than by Google.
 */
let credentials: { client_email: string; private_key: string; project_id: string };

beforeAll(() => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  credentials = {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Google's service-account JSON keys.
    client_email: 'fixture@tau.test.iam.gserviceaccount.com',
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Google's service-account JSON keys.
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Google's service-account JSON keys.
    project_id: 'tau-fixture',
  };
});

const tokenUrl = 'https://oauth2.googleapis.com/token';

const configFor = (providerId: string) => ({
  get: (key: string): unknown =>
    key === 'GOOGLE_VERTEX_AI_CREDENTIALS' ? credentials : `${providerId.toUpperCase()}-fixture-key`,
});

/**
 * A stub upstream that answers the Vertex token exchange, then the queued
 * provider responses in order, recording every dispatched body.
 *
 * @param statuses - Status for each provider dispatch, in order.
 * @returns The stub fetch and the bodies it was called with.
 */
const stubUpstream = (statuses: readonly number[]) => {
  const bodies: unknown[] = [];
  const fetchOnce = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    // Like the real one: an abandoned request is never put on the wire.
    if (init?.signal?.aborted === true) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }
    if (url === tokenUrl) {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- OAuth2 token response field.
      return new Response(JSON.stringify({ access_token: 'fixture-token' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (typeof init?.body !== 'string') {
      throw new TypeError('Expected a JSON string body');
    }
    bodies.push(JSON.parse(init.body));
    return new Response('', { status: statuses[bodies.length - 1] ?? 500 });
  });
  return { fetchOnce, bodies };
};

/* eslint-disable @typescript-eslint/naming-convention -- Upstream Gemini wire keys use snake_case. */
const vertexBody = (google: Record<string, unknown>) => ({
  model: 'google/gemini-3.7-flash',
  messages: [{ role: 'user', content: 'fixture' }],
  stream: true,
  extra_body: { google },
});

const streamedArguments = {
  stream_function_call_arguments: true,
  thinking_config: { include_thoughts: true, thinking_level: 'HIGH' },
  thought_tag_marker: 'think',
};
/* eslint-enable @typescript-eslint/naming-convention -- End upstream Gemini payload. */

describe('executeGatewayProviderRequest', () => {
  it('should re-dispatch a cancelled Gemini request once without the streamed-arguments flag', async () => {
    const { fetchOnce, bodies } = stubUpstream([499, 200]);

    const response = await executeGatewayProviderRequest({
      config: configFor('vertexai'),
      providerId: 'vertexai',
      body: vertexBody(streamedArguments),
      headers: {},
      signal: new AbortController().signal,
      fetch: fetchOnce,
    });

    expect(response.status).toBe(200);
    expect(bodies).toHaveLength(2);
    // The flag is the only difference; everything else, thinking included, is byte-equal.
    expect(bodies[0]).toEqual(vertexBody(streamedArguments));
    expect(bodies[1]).toEqual(
      vertexBody({
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Upstream Gemini wire keys use snake_case.
        thinking_config: { include_thoughts: true, thinking_level: 'HIGH' },
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Upstream Gemini wire keys use snake_case.
        thought_tag_marker: 'think',
      }),
    );
  });

  it('should answer a second cancellation with the upstream response it got', async () => {
    const { fetchOnce, bodies } = stubUpstream([499, 499]);

    const response = await executeGatewayProviderRequest({
      config: configFor('vertexai'),
      providerId: 'vertexai',
      body: vertexBody(streamedArguments),
      headers: {},
      signal: new AbortController().signal,
      fetch: fetchOnce,
    });

    // Classification is the caller's; one re-dispatch is the whole recovery.
    expect(response.status).toBe(499);
    expect(bodies).toHaveLength(2);
  });

  it('should dispatch once for a cancelled Gemini request that carries no flag', async () => {
    const { fetchOnce, bodies } = stubUpstream([499, 200]);

    const response = await executeGatewayProviderRequest({
      config: configFor('vertexai'),
      providerId: 'vertexai',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Upstream Gemini wire keys use snake_case.
      body: vertexBody({ thought_tag_marker: 'think' }),
      headers: {},
      signal: new AbortController().signal,
      fetch: fetchOnce,
    });

    expect(response.status).toBe(499);
    expect(bodies).toHaveLength(1);
  });

  it('should dispatch once when another provider answers 499', async () => {
    const { fetchOnce, bodies } = stubUpstream([499, 200]);

    const response = await executeGatewayProviderRequest({
      config: configFor('together'),
      providerId: 'together',
      body: { model: 'fixture', stream: true },
      headers: {},
      signal: new AbortController().signal,
      fetch: fetchOnce,
    });

    expect(response.status).toBe(499);
    expect(bodies).toHaveLength(1);
  });

  it('should carry the abort signal into the re-dispatch', async () => {
    /* The retry is a second real dispatch, so a person who pressed Stop between
     * the cancellation and it must not have their request put back on the wire. */
    const { fetchOnce, bodies } = stubUpstream([499, 200]);
    const operation = new AbortController();

    await expect(
      executeGatewayProviderRequest({
        config: configFor('vertexai'),
        providerId: 'vertexai',
        body: vertexBody(streamedArguments),
        headers: {},
        signal: operation.signal,
        fetch: vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
          const first = bodies.length === 0;
          const response = await fetchOnce(input, init);
          if (first && response.status === 499) {
            // The person presses Stop while the gateway is deciding to retry.
            operation.abort();
          }
          return response;
        }),
      }),
    ).rejects.toThrow(/abort/iu);

    expect(bodies).toHaveLength(1);
  });
});
