/* eslint-disable @typescript-eslint/naming-convention -- OIDC wire fields and environment keys keep their own case */
import { createSign, generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import type { ConfigService } from '@nestjs/config';
import {
  chatgptProviderId,
  chatgptUserInfo,
  getBetterAuthConfig,
  getChatgptProviderConfig,
  resolveChatgptProvider,
} from '#config/better-auth.config.js';
import type { Environment } from '#config/environment.config.js';
import type { DatabaseService } from '#database/database.service.js';
import type { EmailService } from '#email/email.service.js';

const issuer = 'https://auth.openai.com';
const discoveryUrl = `${issuer}/.well-known/openid-configuration`;
const jwksUrl = `${issuer}/.well-known/jwks.json`;
const tokenUrl = `${issuer}/api/accounts/oauth/token`;
const clientId = 'oaiapp_test';
const clientSecret = 'test-chatgpt-secret';
const frontendUrl = 'http://localhost:3000';
const discoveryDocument = {
  issuer,
  authorization_endpoint: `${issuer}/api/accounts/authorize`,
  token_endpoint: tokenUrl,
  userinfo_endpoint: `${issuer}/api/accounts/oauth/userinfo`,
  jwks_uri: jwksUrl,
  id_token_signing_alg_values_supported: ['RS256'],
  code_challenge_methods_supported: ['S256'],
};

const createConfigService = (values: Record<string, string>): ConfigService<Environment, true> => {
  const all = new Map(
    Object.entries({
      AUTH_SECRET: 'test-secret-test-secret-test-secret',
      AUTH_URL: 'http://localhost:4000',
      TAU_FRONTEND_URL: frontendUrl,
      GITHUB_CLIENT_ID: 'github-id',
      GITHUB_CLIENT_SECRET: 'github-secret',
      ...values,
    }),
  );
  // The real ConfigService answers `undefined` for an unset key; the schema has already turned '' into unset.
  return { get: (key: string) => all.get(key) } as unknown as ConfigService<Environment, true>;
};

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const kid = 'test-key';

const base64url = (value: string): string => Buffer.from(value).toString('base64url');

/** An RS256 JWT signed with the test key, as OpenAI's token endpoint would return it. */
const signIdToken = (claims: Record<string, unknown>): string => {
  const header = base64url(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' }));
  const payload = base64url(JSON.stringify(claims));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${signer.sign(privateKey).toString('base64url')}`;
};

type TokenRequest = {
  readonly authorization: string | undefined;
  readonly body: URLSearchParams;
};

/**
 * Stands in for auth.openai.com: discovery, JWKS and the token endpoint. The token endpoint answers with
 * whatever ID token `idToken` builds from the nonce the authorization request carried.
 */
const stubOpenAi = (idToken: (nonce: string) => string) => {
  const tokenRequests: TokenRequest[] = [];
  let nonce = '';
  const realFetch = globalThis.fetch;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    if (request.url === discoveryUrl) {
      return Response.json(discoveryDocument);
    }
    if (request.url === jwksUrl) {
      return Response.json({
        keys: [
          {
            ...publicKey.export({ format: 'jwk' }),
            kid,
            alg: 'RS256',
            use: 'sig',
          },
        ],
      });
    }
    if (request.url === tokenUrl) {
      const body = new URLSearchParams(await request.text());
      tokenRequests.push({
        authorization: request.headers.get('authorization') ?? undefined,
        body,
      });
      return Response.json({
        access_token: 'chatgpt-access-token',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'openid profile email',
        id_token: idToken(nonce),
      });
    }
    return realFetch(request);
  });
  return {
    tokenRequests,
    rememberNonce: (value: string) => {
      nonce = value;
    },
  };
};

const verifiedClaims = (nonce: string): Record<string, unknown> => {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: issuer,
    aud: clientId,
    sub: 'user-chatgpt-1',
    iat: now,
    exp: now + 300,
    nonce,
    email: 'chatgpt-user@example.test',
    email_verified: true,
    name: 'ChatGPT User',
  };
};

const createAuth = (values: Record<string, string>) => {
  const store: Record<string, Array<Record<string, unknown>>> = {
    user: [],
    session: [],
    account: [],
    verification: [],
    apikey: [],
  };
  const configService = createConfigService(values);
  const config = getBetterAuthConfig({
    databaseService: {} as unknown as DatabaseService,
    configService,
    chatgptProvider: getChatgptProviderConfig(configService),
    emailService: {
      sendVerification: vi.fn().mockResolvedValue(undefined),
    } as unknown as EmailService,
  });
  return {
    store,
    auth: betterAuth({ ...config, database: memoryAdapter(store) }),
  };
};

/** Every `name=value` pair a response set, ready to send back as a Cookie header. */
const cookiesFrom = (response: Response): string =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');

/*
 * Better Auth's in-memory limiter is shared by every instance in the process, so each sign-in below comes
 * from its own documentation address.
 */
let clients = 0;

/** Runs the browser half: start sign-in, then return to the callback with OpenAI's code. */
const signInWithChatgpt = async (
  auth: { handler: (input: Request) => Promise<Response> },
  rememberNonce: (nonce: string) => void,
) => {
  clients += 1;
  const client = `198.51.100.${clients}`;
  const start = await auth.handler(
    new Request('http://localhost:4000/v1/auth/sign-in/social', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: frontendUrl,
        'x-forwarded-for': client,
      },
      body: JSON.stringify({
        provider: chatgptProviderId,
        callbackURL: `${frontendUrl}/`,
      }),
    }),
  );
  expect(start.status).toBe(200);
  const { url } = (await start.json()) as { url: string };
  const authorize = new URL(url);
  rememberNonce(authorize.searchParams.get('nonce') ?? '');

  const callback = await auth.handler(
    new Request(
      `http://localhost:4000/v1/auth/callback/chatgpt?code=test-code&state=${authorize.searchParams.get('state') ?? ''}`,
      { headers: { cookie: cookiesFrom(start), 'x-forwarded-for': client } },
    ),
  );
  return { authorize, callback };
};

describe('Sign in with ChatGPT configuration', () => {
  it('should register no provider when CHATGPT_CLIENT_ID is unset', () => {
    expect(getChatgptProviderConfig(createConfigService({}))).toBeUndefined();
  });

  it('should authenticate a confidential client with HTTP Basic and keep PKCE', () => {
    const config = getChatgptProviderConfig(
      createConfigService({
        CHATGPT_CLIENT_ID: clientId,
        CHATGPT_CLIENT_SECRET: clientSecret,
      }),
    );

    expect(config).toMatchObject({
      providerId: 'chatgpt',
      requireIdTokenVerification: true,
      tokenEndpointAuth: { method: 'client_secret_basic' },
      scopes: ['openid', 'profile', 'email'],
      pkce: true,
      requireEmailVerification: true,
    });
  });

  it('should send no secret for a public client', () => {
    const config = getChatgptProviderConfig(createConfigService({ CHATGPT_CLIENT_ID: clientId }));

    expect(config?.clientSecret).toBeUndefined();
    expect(config?.tokenEndpointAuth).toEqual({ method: 'none' });
  });
});

describe('resolveChatgptProvider', () => {
  const configured = () => createConfigService({ CHATGPT_CLIENT_ID: clientId });

  it('should skip discovery when no client is configured', async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(resolveChatgptProvider(createConfigService({}), fetchImpl)).resolves.toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('should keep the provider when discovery answers with OpenAI metadata', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json(discoveryDocument));

    await expect(resolveChatgptProvider(configured(), fetchImpl)).resolves.toMatchObject({ providerId: 'chatgpt' });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(discoveryUrl);
    expect(fetchImpl.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('should retry a failed attempt and keep the provider once discovery answers', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error('The operation was aborted due to timeout'))
      .mockResolvedValue(Response.json(discoveryDocument));

    await expect(resolveChatgptProvider(configured(), fetchImpl)).resolves.toMatchObject({ providerId: 'chatgpt' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      'times out',
      async (): Promise<Response> => {
        throw new Error('The operation was aborted due to timeout');
      },
    ],
    ['answers with an error status', async (): Promise<Response> => new Response('unavailable', { status: 503 })],
    [
      'names another issuer',
      async (): Promise<Response> => Response.json({ ...discoveryDocument, issuer: 'https://evil.test' }),
    ],
  ])('should boot without the provider when discovery %s every attempt', async (_label, answer) => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(answer);

    await expect(resolveChatgptProvider(configured(), fetchImpl)).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});

describe('chatgptUserInfo', () => {
  const unsigned = (claims: Record<string, unknown>): string =>
    `${base64url('{}')}.${base64url(JSON.stringify(claims))}.signature`;

  it('should map a verified identity to the Better Auth profile', () => {
    expect(
      chatgptUserInfo({
        idToken: unsigned({
          sub: 'user-1',
          email: 'a@example.test',
          email_verified: true,
          picture: 'https://p.test/a',
        }),
      }),
    ).toEqual({
      id: 'user-1',
      sub: 'user-1',
      email: 'a@example.test',
      emailVerified: true,
      name: '',
      image: 'https://p.test/a',
    });
  });

  it.each([
    ['no ID token', {}],
    ['a malformed ID token', { idToken: 'not-a-jwt' }],
    ['an unverified email', { idToken: unsigned({ sub: 'user-1', email: 'a@example.test', email_verified: false }) }],
    ['a missing verification claim', { idToken: unsigned({ sub: 'user-1', email: 'a@example.test' }) }],
    ['no email', { idToken: unsigned({ sub: 'user-1', email_verified: true }) }],
    ['no subject', { idToken: unsigned({ email: 'a@example.test', email_verified: true }) }],
  ])('should refuse %s', (_label, tokens: { idToken?: string }) => {
    expect(chatgptUserInfo(tokens)).toBeNull();
  });
});

describe('Sign in with ChatGPT flow', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should answer an unknown provider when no client is configured', async () => {
    const { auth } = createAuth({});
    const response = await auth.handler(
      new Request('http://localhost:4000/v1/auth/sign-in/social', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: frontendUrl },
        body: JSON.stringify({
          provider: chatgptProviderId,
          callbackURL: `${frontendUrl}/`,
        }),
      }),
    );

    expect(response.status).toBe(404);
  });

  it('should sign a verified ChatGPT user in through the exact callback with PKCE, nonce and Basic auth', async () => {
    const openAi = stubOpenAi((nonce) => signIdToken(verifiedClaims(nonce)));
    const { auth, store } = createAuth({
      CHATGPT_CLIENT_ID: clientId,
      CHATGPT_CLIENT_SECRET: clientSecret,
    });

    const { authorize, callback } = await signInWithChatgpt(auth, openAi.rememberNonce);

    expect(`${authorize.origin}${authorize.pathname}`).toBe(`${issuer}/api/accounts/authorize`);
    expect(authorize.searchParams.get('client_id')).toBe(clientId);
    expect(authorize.searchParams.get('redirect_uri')).toBe('http://localhost:4000/v1/auth/callback/chatgpt');
    expect(authorize.searchParams.get('scope')).toBe('openid profile email');
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorize.searchParams.get('nonce')).toBeTruthy();

    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toBe(`${frontendUrl}/`);
    expect(cookiesFrom(callback)).toContain('tau.session_token=');

    const [tokenRequest] = openAi.tokenRequests;
    expect(tokenRequest?.authorization).toBe(`Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`);
    expect(tokenRequest?.body.get('code_verifier')).toBeTruthy();
    expect(tokenRequest?.body.get('client_secret')).toBeNull();

    expect(store['account']).toEqual([
      expect.objectContaining({
        providerId: 'chatgpt',
        accountId: 'user-chatgpt-1',
      }),
    ]);
    expect(store['user']).toEqual([
      expect.objectContaining({
        email: 'chatgpt-user@example.test',
        emailVerified: true,
        name: 'ChatGPT User',
      }),
    ]);
  });

  it('should keep naming the linked account in settings after its access token has expired', async () => {
    const openAi = stubOpenAi((nonce) => signIdToken(verifiedClaims(nonce)));
    const { auth, store } = createAuth({ CHATGPT_CLIENT_ID: clientId, CHATGPT_CLIENT_SECRET: clientSecret });
    const { callback } = await signInWithChatgpt(auth, openAi.rememberNonce);
    const [account] = store['account'] ?? [];
    if (account) {
      account['accessTokenExpiresAt'] = new Date(Date.now() - 60_000);
    }

    const response = await auth.handler(
      new Request(`http://localhost:4000/v1/auth/account-info?accountId=${String(account?.['id'])}`, {
        headers: { cookie: cookiesFrom(callback), origin: frontendUrl },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      user: { email: 'chatgpt-user@example.test', emailVerified: true },
      account: { providerId: 'chatgpt', accountId: 'user-chatgpt-1' },
    });
  });

  it('should issue no session when the ID token nonce does not match the request', async () => {
    const openAi = stubOpenAi(() => signIdToken(verifiedClaims('another-nonce')));
    const { auth, store } = createAuth({
      CHATGPT_CLIENT_ID: clientId,
      CHATGPT_CLIENT_SECRET: clientSecret,
    });

    const { callback } = await signInWithChatgpt(auth, openAi.rememberNonce);

    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toContain('error=');
    expect(cookiesFrom(callback)).not.toContain('tau.session_token=');
    expect(store['session']).toEqual([]);
  });

  it('should issue no session when the ID token is signed by another key', async () => {
    const { privateKey: otherKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const openAi = stubOpenAi((nonce) => {
      const header = base64url(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' }));
      const payload = base64url(JSON.stringify(verifiedClaims(nonce)));
      const signer = createSign('RSA-SHA256');
      signer.update(`${header}.${payload}`);
      return `${header}.${payload}.${signer.sign(otherKey).toString('base64url')}`;
    });
    const { auth, store } = createAuth({
      CHATGPT_CLIENT_ID: clientId,
      CHATGPT_CLIENT_SECRET: clientSecret,
    });

    const { callback } = await signInWithChatgpt(auth, openAi.rememberNonce);

    expect(callback.headers.get('location')).toContain('error=');
    expect(store['session']).toEqual([]);
  });

  it('should write no user, account or session when OpenAI has not verified the email', async () => {
    const openAi = stubOpenAi((nonce) => signIdToken({ ...verifiedClaims(nonce), email_verified: false }));
    const { auth, store } = createAuth({
      CHATGPT_CLIENT_ID: clientId,
      CHATGPT_CLIENT_SECRET: clientSecret,
    });

    const { callback } = await signInWithChatgpt(auth, openAi.rememberNonce);

    expect(callback.headers.get('location')).toContain('error=');
    expect(cookiesFrom(callback)).not.toContain('tau.session_token=');
    expect(store['user']).toEqual([]);
    expect(store['account']).toEqual([]);
    expect(store['session']).toEqual([]);
  });

  it('should write nothing when the token response carries no ID token', async () => {
    const openAi = stubOpenAi(() => '');
    const { auth, store } = createAuth({
      CHATGPT_CLIENT_ID: clientId,
      CHATGPT_CLIENT_SECRET: clientSecret,
    });

    const { callback } = await signInWithChatgpt(auth, openAi.rememberNonce);

    expect(callback.headers.get('location')).toContain('error=');
    expect(store['user']).toEqual([]);
    expect(store['session']).toEqual([]);
  });

  it('should not attach to an existing account when the ChatGPT email is unverified', async () => {
    const openAi = stubOpenAi((nonce) => signIdToken({ ...verifiedClaims(nonce), email_verified: false }));
    const { auth, store } = createAuth({
      CHATGPT_CLIENT_ID: clientId,
      CHATGPT_CLIENT_SECRET: clientSecret,
    });
    store['user']?.push({
      id: 'user_existing',
      email: 'chatgpt-user@example.test',
      emailVerified: true,
      name: 'Existing',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { callback } = await signInWithChatgpt(auth, openAi.rememberNonce);

    expect(callback.headers.get('location')).toContain('error=');
    expect(store['account']).toEqual([]);
    expect(store['session']).toEqual([]);
  });
});
