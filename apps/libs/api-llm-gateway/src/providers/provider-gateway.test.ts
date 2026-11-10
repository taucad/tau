/* eslint-disable @typescript-eslint/naming-convention -- Vertex's OpenAI wire uses image_url. */
import { generateKeyPairSync, verify } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  executeGatewayProviderRequest,
  fundedGatewayProviderIds,
  gatewayModelRoutes,
  isGatewayProviderId,
  signVertexAccessToken,
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

describe('Vertex self-signed access token', () => {
  const keyPair = generateKeyPairSync('rsa', { modulusLength: 1024 });
  const credentials: VertexCredentials = {
    clientEmail: 'fixture@test.invalid',
    privateKey: keyPair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    projectId: 'fixture-project',
    privateKeyId: 'fixture-key-id',
  };
  const config = (privateKey = credentials.privateKey) => ({
    get: (key: string) =>
      key === 'GOOGLE_VERTEX_AI_CREDENTIALS'
        ? {
            client_email: credentials.clientEmail,
            private_key: privateKey,
            private_key_id: credentials.privateKeyId,
            project_id: credentials.projectId,
          }
        : undefined,
  });
  const decode = (segment: string | undefined): unknown =>
    JSON.parse(Buffer.from(segment ?? '', 'base64url').toString('utf8'));
  const urlOf = (input: Parameters<typeof fetch>[0]): string =>
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

  it('should sign an hour-long scoped JWT with the account key', () => {
    const token = signVertexAccessToken(credentials, Date.UTC(2026, 10, 8, 12));
    const [header, payload, signature] = token.split('.');

    expect(decode(header)).toEqual({ alg: 'RS256', typ: 'JWT', kid: 'fixture-key-id' });
    expect(decode(payload)).toEqual({
      iss: 'fixture@test.invalid',
      sub: 'fixture@test.invalid',
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      iat: Date.UTC(2026, 10, 8, 12) / 1000,
      exp: Date.UTC(2026, 10, 8, 13) / 1000,
    });
    expect(
      verify(
        'RSA-SHA256',
        Buffer.from(`${header}.${payload}`),
        keyPair.publicKey,
        Buffer.from(signature ?? '', 'base64url'),
      ),
    ).toBe(true);
  });

  it('should send each Vertex request with its own signed token and never call the token exchange', async () => {
    const urls: string[] = [];
    const authorizations: string[] = [];
    const fetchOnce = vi.fn<typeof fetch>(async (input, init) => {
      urls.push(urlOf(input));
      authorizations.push(new Headers(init?.headers).get('authorization') ?? '');
      return new Response('{}', { status: 200 });
    });
    const request = async (): Promise<Response> =>
      executeGatewayProviderRequest({
        config: config(),
        providerId: 'vertexai',
        body: { model: 'google/gemini-3.8-flash', messages: [] },
        headers: {},
        signal: new AbortController().signal,
        fetch: fetchOnce,
      });

    await request();
    await request();

    expect(urls).toEqual([
      'https://aiplatform.googleapis.com/v1/projects/fixture-project/locations/global/endpoints/openapi/chat/completions',
      'https://aiplatform.googleapis.com/v1/projects/fixture-project/locations/global/endpoints/openapi/chat/completions',
    ]);
    for (const authorization of authorizations) {
      const [, payload] = authorization.replace('Bearer ', '').split('.');
      expect(decode(payload)).toMatchObject({ iss: 'fixture@test.invalid' });
    }
  });

  it('should refuse an unusable key without sending the request or echoing the key', async () => {
    const fetchOnce = vi.fn<typeof fetch>();
    const failure = executeGatewayProviderRequest({
      config: config('fixture-not-a-key'),
      providerId: 'vertexai',
      body: { model: 'google/gemini-3.8-flash', messages: [] },
      headers: {},
      signal: new AbortController().signal,
      fetch: fetchOnce,
    });

    await expect(failure).rejects.toThrow('Vertex credentials cannot sign');
    await expect(failure).rejects.not.toThrow('fixture-not-a-key');
    expect(fetchOnce).not.toHaveBeenCalled();
  });
});

describe('provider targets', () => {
  const signal = (): AbortSignal => new AbortController().signal;
  const sent = (fetchOnce: ReturnType<typeof vi.fn<typeof fetch>>): { url: string; init: RequestInit | undefined } => {
    const [input, init] = fetchOnce.mock.calls[0] ?? [];
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input?.url ?? '');
    return { url, init };
  };

  it.each([
    ['openai', 'https://api.openai.com/v1/responses'],
    ['xai', 'https://api.x.ai/v1/responses'],
    ['together', 'https://api.together.ai/v1/chat/completions'],
    ['morph', 'https://api.morphllm.com/v1/chat/completions'],
    ['moonshot', 'https://api.moonshot.ai/v1/chat/completions'],
    ['cerebras', 'https://api.cerebras.ai/v1/chat/completions'],
  ] as const)('should send %s to its base URL with a bearer key', async (providerId, url) => {
    const fetchOnce = vi.fn<typeof fetch>(async () => new Response('{}'));

    await executeGatewayProviderRequest({
      config: { get: () => 'provider-key' },
      providerId,
      body: { model: 'fixture' },
      headers: {},
      signal: signal(),
      fetch: fetchOnce,
    });

    expect(sent(fetchOnce).url).toBe(url);
    expect(sent(fetchOnce).init?.headers).toEqual({
      'content-type': 'application/json',
      authorization: 'Bearer provider-key',
    });
  });

  it('should send Ollama to the local server without a credential when it is enabled', async () => {
    const fetchOnce = vi.fn<typeof fetch>(async () => new Response('{}'));

    await executeGatewayProviderRequest({
      config: { get: (key) => key === 'OLLAMA_ENABLED' },
      providerId: 'ollama',
      body: { model: 'llama3.2:latest' },
      headers: { 'anthropic-version': 'ignored' },
      signal: signal(),
      fetch: fetchOnce,
    });

    expect(sent(fetchOnce)).toMatchObject({
      url: 'http://localhost:11434/v1/chat/completions',
      init: { method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json' } },
    });
  });

  it('should refuse Ollama when it is not enabled', async () => {
    const fetchOnce = vi.fn<typeof fetch>();

    await expect(
      executeGatewayProviderRequest({
        config: { get: () => 'true' },
        providerId: 'ollama',
        body: {},
        headers: {},
        signal: signal(),
        fetch: fetchOnce,
      }),
    ).rejects.toThrow('Configured provider ollama is unavailable');
    expect(fetchOnce).not.toHaveBeenCalled();
  });

  it('should keep Ollama out of the gateway providers, the funded providers and the catalog routes', () => {
    expect(isGatewayProviderId('ollama')).toBe(false);
    expect(fundedGatewayProviderIds).not.toContain('ollama');
    expect(gatewayModelRoutes().map((route) => route.providerId)).not.toContain('ollama');
  });
});
