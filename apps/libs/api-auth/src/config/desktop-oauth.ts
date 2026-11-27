import { createHash } from 'node:crypto';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { oauthProvider } from '@better-auth/oauth-provider';

/*
 * Tau Desktop signs in as a public native OAuth client (RFC 8252) of `@better-auth/oauth-provider`: PKCE S256, a
 * loopback redirect, a short single-use code, a one-hour opaque access token and a rotating refresh token
 * (desktop sign-in execution plan, decisions E1-E6; operator rulings R1 and D3 of 2026-11-27). The desktop's token
 * is not a Better Auth session, so every Better Auth account route refuses it by construction.
 */

/** The public client seeded by migration `0072_desktop_oauth_provider`, one row per environment database. */
export const desktopClientId = 'tau-desktop';

/** The redirect URI registered for {@link desktopClientId}: the loopback base the desktop's listener lives under. */
export const desktopRegisteredRedirectUri = 'http://127.0.0.1/cb';

/** Scopes the desktop asks for. `offline_access` is what earns a refresh token. */
export const desktopScopes = ['openid', 'profile', 'email', 'offline_access'] as const;

/** Lifetimes, in seconds. */
export const desktopTokenLifetimes = {
  /** The opaque access token. */
  accessToken: 60 * 60,
  /** Sliding: each refresh starts it again (ruling D3=B, 30 days idle). */
  refreshToken: 30 * 24 * 60 * 60,
  /** Absolute: no refresh succeeds this long after the sign-in (ruling D3=B, Principal P1: 90 days). */
  signIn: 90 * 24 * 60 * 60,
  /** The authorization code, enforced at the token endpoint (execution plan E3). */
  code: 60,
  /**
   * The signed query the login and consent pages carry. The provider uses one setting for this and for the code, so
   * it stays at the desktop's ten-minute attempt and the code's 60 seconds are enforced separately.
   */
  signedPage: 10 * 60,
} as const;

/**
 * Provider routes Tau does not use. Disabled so they answer 404, whatever the provider's own checks would decide:
 * client registration and management (the client is seeded by migration), introspection and end-session (no
 * confidential client), consent records (the web lists desktop sign-ins by refresh family instead, because deleting a
 * consent revokes nothing).
 */
export const desktopOauthDisabledPaths = [
  '/oauth2/register',
  '/oauth2/create-client',
  '/oauth2/get-client',
  '/oauth2/get-clients',
  '/oauth2/update-client',
  '/oauth2/delete-client',
  '/oauth2/client/rotate-secret',
  '/oauth2/public-client-prelogin',
  '/oauth2/introspect',
  '/oauth2/end-session',
  '/oauth2/get-consent',
  '/oauth2/get-consents',
  '/oauth2/update-consent',
  '/oauth2/delete-consent',
] as const;

/** `/cb/` then 22 to 64 base64url characters: the random path the desktop opens for one attempt. */
const loopbackPathPattern = /^\/cb\/[\w-]{22,64}$/u;

/**
 * Whether a redirect URI is a Tau Desktop loopback URI: `http://127.0.0.1`, any port, a random `/cb/<id>` path, and
 * nothing else. `localhost` is refused (RFC 8252 §8.3).
 *
 * @param uri - The `redirect_uri` of an authorization request.
 * @returns `true` only for the loopback shape.
 */
export const isDesktopLoopbackRedirect = (uri: string): boolean => {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  return (
    url.protocol === 'http:' &&
    url.hostname === '127.0.0.1' &&
    url.port !== '' &&
    url.username === '' &&
    url.password === '' &&
    url.search === '' &&
    url.hash === '' &&
    loopbackPathPattern.test(url.pathname)
  );
};

/**
 * The provider, configured for the one public desktop client.
 *
 * @param frontendUrl - `TAU_FRONTEND_URL`: the login and consent pages live there.
 * @returns The plugin.
 */
export const desktopOauthProvider = (frontendUrl: string): BetterAuthPlugin =>
  oauthProvider({
    loginPage: new URL('/auth/sign-in', frontendUrl).href,
    consentPage: new URL('/auth/desktop', frontendUrl).href,
    scopes: [...desktopScopes],
    grantTypes: ['authorization_code', 'refresh_token'],
    accessTokenExpiresIn: desktopTokenLifetimes.accessToken,
    refreshTokenExpiresIn: desktopTokenLifetimes.refreshToken,
    codeExpiresIn: desktopTokenLifetimes.signedPage,
    // Opaque access tokens: revocable at once, verified by one indexed read, no signing keys (execution plan E1).
    disableJwtPlugin: true,
    allowDynamicClientRegistration: false,
    allowUnauthenticatedClientRegistration: false,
    // Without this, any signed-in web user could register a client (spike finding 5).
    clientPrivileges: () => false,
    validateRedirectUri(redirectUri, registeredUris, defaultResult) {
      if (registeredUris.includes(desktopRegisteredRedirectUri)) {
        return isDesktopLoopbackRedirect(redirectUri);
      }
      return defaultResult;
    },
  });

/** The provider's stored form of a code or token (`storeTokens: 'hashed'`): unpadded base64url SHA-256. */
const storedTokenOf = (token: string): string => createHash('sha256').update(token).digest('base64url');

/** The token request's wire fields (RFC 6749 §4.1.3, §6). */
type TokenRequestBody = {
  readonly grant_type?: unknown;
  readonly code?: unknown;
  readonly refresh_token?: unknown;
};

/** `authorizationCodeId` is the family id; the adapter answers it as a string, or as an empty value for none. */
type RefreshRow = { readonly id: string; readonly authorizationCodeId?: unknown; readonly createdAt: Date };

const invalidGrant = (description: string): APIError =>
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the OAuth error field (RFC 6749 §5.2)
  new APIError('BAD_REQUEST', { error: 'invalid_grant', error_description: description });

/**
 * The token-endpoint rules the provider has no setting for: a code older than 60 seconds is refused (E3), and no
 * refresh succeeds 90 days after the sign-in that started its family (E4); the family is revoked then.
 *
 * @returns The plugin; it must sit beside {@link desktopOauthProvider} in both plugin arrays.
 */
export const desktopTokenPolicy = (): BetterAuthPlugin => ({
  id: 'tau-desktop-token-policy',
  hooks: {
    before: [
      {
        matcher: (context) => context.path === '/oauth2/token',
        handler: createAuthMiddleware(async (context) => {
          const body = (context.body ?? {}) as TokenRequestBody;
          const { adapter } = context.context;
          if (body.grant_type === 'authorization_code' && typeof body.code === 'string') {
            const row = await adapter.findOne<{ createdAt: Date }>({
              model: 'verification',
              where: [{ field: 'identifier', value: storedTokenOf(body.code) }],
            });
            if (row !== null && Date.now() - new Date(row.createdAt).getTime() > desktopTokenLifetimes.code * 1000) {
              throw invalidGrant('authorization code expired');
            }
            return;
          }
          if (body.grant_type === 'refresh_token' && typeof body.refresh_token === 'string') {
            const row = await adapter.findOne<RefreshRow>({
              model: 'oauthRefreshToken',
              where: [{ field: 'token', value: storedTokenOf(body.refresh_token) }],
            });
            if (row === null) {
              return;
            }
            const familyId =
              typeof row.authorizationCodeId === 'string' && row.authorizationCodeId !== ''
                ? row.authorizationCodeId
                : undefined;
            const [first] =
              familyId === undefined
                ? [row]
                : await adapter.findMany<RefreshRow>({
                    model: 'oauthRefreshToken',
                    where: [{ field: 'authorizationCodeId', value: familyId }],
                    sortBy: { field: 'createdAt', direction: 'asc' },
                    limit: 1,
                  });
            const startedAt = new Date((first ?? row).createdAt).getTime();
            if (Date.now() - startedAt <= desktopTokenLifetimes.signIn * 1000) {
              return;
            }
            const revoked = new Date();
            const where =
              familyId === undefined
                ? [{ field: 'id', value: row.id }]
                : [{ field: 'authorizationCodeId', value: familyId }];
            await adapter.updateMany({ model: 'oauthRefreshToken', where, update: { revoked } });
            await adapter.updateMany({
              model: 'oauthAccessToken',
              where: familyId === undefined ? [{ field: 'refreshId', value: row.id }] : where,
              update: { revoked },
            });
            throw invalidGrant('sign-in ended');
          }
        }),
      },
    ],
  },
});
