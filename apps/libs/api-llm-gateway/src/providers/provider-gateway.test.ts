/* eslint-disable @typescript-eslint/naming-convention -- Vertex's OpenAI wire uses image_url. */
import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  createVertexAccessTokenCache,
  executeGatewayProviderRequest,
  vertexUpstreamBody,
} from '#providers/provider-gateway.js';
import type { VertexCredentials } from '#providers/provider-gateway.js';

const pdfDataUrl = 'data:application/pdf;base64,JVBERg==';

describe('vertexUpstreamBody', () => {
  it('should send a Vertex PDF as an image_url data URI', () => {
    const body = {
      model: 'google/gemini-3.8-flash',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What hole diameter does the spec require?' },
            { type: 'file', file: { filename: 'bracket-spec.pdf', file_data: pdfDataUrl } },
          ],
        },
      ],
    };

    expect(vertexUpstreamBody(body)).toEqual({
      model: 'google/gemini-3.8-flash',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What hole diameter does the spec require?' },
            { type: 'image_url', image_url: { url: pdfDataUrl } },
          ],
        },
      ],
    });
    expect(body.messages[0]?.content[1]).toEqual({
      type: 'file',
      file: { filename: 'bracket-spec.pdf', file_data: pdfDataUrl },
    });
  });
});

describe('Vertex access token reuse', () => {
  const credentialsFor = (clientEmail = 'fixture@test.invalid'): VertexCredentials => ({
    clientEmail,
    privateKey: generateKeyPairSync('rsa', { modulusLength: 1024 })
      .privateKey.export({ type: 'pkcs8', format: 'pem' })
      .toString(),
    projectId: 'fixture-project',
  });
  const tokenResponse = (token: string, expiresIn?: number): Response =>
    new Response(
      JSON.stringify({ access_token: token, ...(expiresIn === undefined ? {} : { expires_in: expiresIn }) }),
      {
        headers: { 'content-type': 'application/json' },
      },
    );
  const urlOf = (input: Parameters<typeof fetch>[0]): string =>
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const isExchange = (input: Parameters<typeof fetch>[0]): boolean =>
    urlOf(input) === 'https://oauth2.googleapis.com/token';
  const exchanges = (fetchOnce: ReturnType<typeof vi.fn<typeof fetch>>): number =>
    fetchOnce.mock.calls.filter(([input]) => isExchange(input)).length;
  const signal = (): AbortSignal => new AbortController().signal;

  it('should mint once for sequential requests on one account', async () => {
    const cache = createVertexAccessTokenCache();
    const credentials = credentialsFor();
    const fetchOnce = vi.fn<typeof fetch>(async () => tokenResponse('token-1', 3599));

    await expect(cache.token(credentials, fetchOnce, signal())).resolves.toBe('token-1');
    await expect(cache.token(credentials, fetchOnce, signal())).resolves.toBe('token-1');

    expect(exchanges(fetchOnce)).toBe(1);
  });

  it('should share one exchange between concurrent requests', async () => {
    const cache = createVertexAccessTokenCache();
    const credentials = credentialsFor();
    const fetchOnce = vi.fn<typeof fetch>(async () => tokenResponse('token-1', 3599));

    const tokens = await Promise.all(
      Array.from({ length: 10 }, async () => cache.token(credentials, fetchOnce, signal())),
    );

    expect(new Set(tokens)).toEqual(new Set(['token-1']));
    expect(exchanges(fetchOnce)).toBe(1);
  });

  it('should mint again once the token is within five minutes of expiry', async () => {
    let clock = 1_000_000;
    const cache = createVertexAccessTokenCache({ now: () => clock });
    const credentials = credentialsFor();
    const fetchOnce = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse('token-1', 3600))
      .mockResolvedValueOnce(tokenResponse('token-2', 3600));

    await cache.token(credentials, fetchOnce, signal());
    clock += 54 * 60 * 1000;
    await expect(cache.token(credentials, fetchOnce, signal())).resolves.toBe('token-1');
    clock += 2 * 60 * 1000;
    await expect(cache.token(credentials, fetchOnce, signal())).resolves.toBe('token-2');

    expect(exchanges(fetchOnce)).toBe(2);
  });

  it('should not keep a failed exchange', async () => {
    const cache = createVertexAccessTokenCache();
    const credentials = credentialsFor();
    const fetchOnce = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('denied', { status: 400 }))
      .mockResolvedValueOnce(tokenResponse('token-2', 3599));

    await expect(cache.token(credentials, fetchOnce, signal())).rejects.toThrow('Vertex credential exchange failed');
    await expect(cache.token(credentials, fetchOnce, signal())).resolves.toBe('token-2');
  });

  it('should let one caller stop waiting without cancelling the shared exchange', async () => {
    const cache = createVertexAccessTokenCache();
    const credentials = credentialsFor();
    let release!: (response: Response) => void;
    const fetchOnce = vi.fn<typeof fetch>(
      async () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    const leaving = new AbortController();

    const abandoned = cache.token(credentials, fetchOnce, leaving.signal);
    const staying = cache.token(credentials, fetchOnce, signal());
    leaving.abort(new Error('caller left'));
    release(tokenResponse('token-1', 3599));

    await expect(abandoned).rejects.toThrow('caller left');
    await expect(staying).resolves.toBe('token-1');
    expect(exchanges(fetchOnce)).toBe(1);
  });

  it('should treat a rotated key as a different account', async () => {
    const cache = createVertexAccessTokenCache();
    const fetchOnce = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse('token-1', 3599))
      .mockResolvedValueOnce(tokenResponse('token-2', 3599));

    await expect(cache.token(credentialsFor(), fetchOnce, signal())).resolves.toBe('token-1');
    await expect(cache.token(credentialsFor(), fetchOnce, signal())).resolves.toBe('token-2');
  });

  it('should evict only the refused token', async () => {
    const cache = createVertexAccessTokenCache();
    const credentials = credentialsFor();
    const fetchOnce = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse('token-1', 3599))
      .mockResolvedValueOnce(tokenResponse('token-2', 3599));

    await cache.token(credentials, fetchOnce, signal());
    cache.evict(credentials, 'stale-token');
    await expect(cache.token(credentials, fetchOnce, signal())).resolves.toBe('token-1');
    cache.evict(credentials, 'token-1');
    await expect(cache.token(credentials, fetchOnce, signal())).resolves.toBe('token-2');
  });

  it('should reuse the token across gateway requests and mint anew after Vertex answers 401', async () => {
    const credentials = credentialsFor('gateway@test.invalid');
    const config = {
      get: (key: string) =>
        key === 'GOOGLE_VERTEX_AI_CREDENTIALS'
          ? {
              client_email: credentials.clientEmail,
              private_key: credentials.privateKey,
              project_id: credentials.projectId,
            }
          : undefined,
    };
    let minted = 0;
    const authorizations: string[] = [];
    const statuses = [200, 401, 200];
    const fetchOnce = vi.fn<typeof fetch>(async (input, init) => {
      if (isExchange(input)) {
        minted += 1;
        return tokenResponse(`token-${minted}`, 3599);
      }
      authorizations.push(new Headers(init?.headers).get('authorization') ?? '');
      return new Response('{}', { status: statuses.shift() });
    });
    const request = async (): Promise<Response> =>
      executeGatewayProviderRequest({
        config,
        providerId: 'vertexai',
        body: { model: 'google/gemini-3.8-flash', messages: [] },
        headers: {},
        signal: signal(),
        fetch: fetchOnce,
      });

    await request();
    await request();
    await request();

    expect(authorizations).toEqual(['Bearer token-1', 'Bearer token-1', 'Bearer token-2']);
    expect(exchanges(fetchOnce)).toBe(2);
  });
});
