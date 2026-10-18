import { afterEach, describe, it, expect, vi } from 'vitest';
import { JWT } from 'google-auth-library';
import type { ConfigService } from '@nestjs/config';
import { ChatVertexAI } from '@langchain/google-vertexai';
import { ProviderService } from '#api/providers/provider.service.js';
import type { Environment } from '#config/environment.config.js';

describe('ProviderService vertexai', () => {
  /**
   * `streamFunctionCallArguments` is the native-wire twin of the
   * `extra_body.google` flag the funded gateway refuses: the Google client
   * turns it into `toolConfig.functionCallingConfig.streamFunctionCallArguments`
   * on `generateContent`, and emits that `toolConfig` even for a tool-free turn.
   * Vertex sheds requests carrying it with a pre-stream 499 under shared-quota
   * pressure, so the API's own helper turns must not construct it either
   * (blueprint Finding 1; review finding 3).
   */
  it('should construct the Vertex model without the streamed tool-argument flag', () => {
    const configService: Pick<ConfigService, 'get'> = {
      get: (key: string) =>
        key === 'GOOGLE_VERTEX_AI_CREDENTIALS'
          ? /* eslint-disable-next-line @typescript-eslint/naming-convention -- Google's service-account JSON keys. */
            {
              type: 'service_account',
              client_email: 'test@example.com',
              private_key: 'synthetic-not-a-signing-key',
              project_id: 'test-project',
            }
          : undefined,
    };

    const providerService = new ProviderService(configService as unknown as ConfigService<Environment, true>);
    const model = providerService.createModelClass('vertexai', { model: 'gemini-3.8-flash' }) as ChatVertexAI;

    expect(model.invocationParams({}).streamFunctionCallArguments).toBeUndefined();
  });
});

describe('ProviderService Vertex service-account ownership', () => {
  // Google's published service-account JSON uses these field names.
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Google's service-account JSON keys.
  const credentials = {
    type: 'service_account',
    client_email: 'synthetic@example.invalid',
    private_key: 'synthetic-not-a-signing-key',
    private_key_id: 'synthetic-key-id',
    project_id: 'synthetic-project',
    universe_domain: 'googleapis.com',
    token_uri: 'https://untrusted.invalid/token',
  };

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function construct(input: typeof credentials | undefined) {
    const config: Pick<ConfigService, 'get'> = {
      get: (key: string) => (key === 'GOOGLE_VERTEX_AI_CREDENTIALS' ? input : undefined),
    };
    return new ProviderService(config as unknown as ConfigService<Environment, true>).createModelClass('vertexai', {
      model: 'gemini-3.8-flash',
      maxOutputTokens: 128,
    });
  }

  it('should keep explicit JWT ownership, scope, project and native fetch without credential-directed endpoints', () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error('Unexpected provider network'));
    vi.stubGlobal('fetch', fetch);
    const build = vi.spyOn(ChatVertexAI.prototype, 'buildAbstractedClient');
    const model = construct(credentials);
    if (!(model instanceof ChatVertexAI)) {
      throw new Error('Expected the actual Vertex model');
    }
    const fields = build.mock.calls[0]?.[0];
    const auth = fields?.authOptions?.authClient;
    expect(auth).toBeInstanceOf(JWT);
    if (!(auth instanceof JWT)) {
      throw new Error('Expected the actual service-account JWT client');
    }
    expect(auth.email).toBe(credentials.client_email);
    expect(auth.keyId).toBe(credentials.private_key_id);
    expect(auth.projectId).toBe(credentials.project_id);
    expect(auth.universeDomain).toBe(credentials.universe_domain);
    expect(auth.scopes).toEqual(['https://www.googleapis.com/auth/cloud-platform']);
    expect(auth.transporter.defaults.fetchImplementation).toBe(fetch);
    expect(auth.endpoints.oauth2TokenUrl).toBe('https://oauth2.googleapis.com/token');
    expect(fields?.authOptions?.projectId).toBe(credentials.project_id);
    expect(fields?.authOptions).not.toHaveProperty('credentials');
    expect(fields?.location).toBe('global');
    expect(fields?.maxOutputTokens).toBe(128);
    expect(model.streamUsage).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('should propagate abort through the actual JWT transporter using only a synthetic fetch', async () => {
    let enteredFetch: (() => void) | undefined;
    const entered = new Promise<void>((resolve) => {
      enteredFetch = resolve;
    });
    const fetch = vi.fn<typeof globalThis.fetch>(
      async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) {
            reject(new Error('Missing propagated abort signal'));
            return;
          }
          signal.addEventListener(
            'abort',
            () => {
              reject(new Error('synthetic-abort'));
            },
            { once: true },
          );
          enteredFetch?.();
        }),
    );
    vi.stubGlobal('fetch', fetch);
    const build = vi.spyOn(ChatVertexAI.prototype, 'buildAbstractedClient');
    construct(credentials);
    const auth = build.mock.calls[0]?.[0]?.authOptions?.authClient;
    if (!(auth instanceof JWT)) {
      throw new Error('Expected the actual service-account JWT client');
    }
    const controller = new AbortController();
    const request = auth.transporter.request({
      url: 'https://synthetic.invalid/abort',
      signal: controller.signal,
      retry: false,
    });
    const rejected = expect(request).rejects.toThrow('synthetic-abort');
    await entered;
    controller.abort();
    await rejected;
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each(['external_account', 'authorized_user', ''])(
    'should reject credential type %s before constructing a transport',
    (type) => {
      const build = vi.spyOn(ChatVertexAI.prototype, 'buildAbstractedClient');
      expect(() => construct({ ...credentials, type })).toThrow('Vertex AI requires service-account credentials');
      expect(build).not.toHaveBeenCalled();
    },
  );

  it('should retain the missing-credential error', () => {
    expect(() => construct(undefined)).toThrow('GOOGLE_VERTEX_AI_CREDENTIALS is required for Vertex AI');
  });

  it.each(['client_email', 'private_key'] as const)(
    'should reject empty %s through the actual JWT validator',
    (field) => {
      expect(() => construct({ ...credentials, [field]: '' })).toThrow(field);
    },
  );
});
