import { createHash } from 'node:crypto';
import type { Auth } from 'better-auth';
import { desktopClientId } from '#config/desktop-oauth.js';
import type { AuthSession, AuthUser } from '#auth.type.js';

/**
 * Which kind of client a request authenticated as: a browser (or CLI) Better Auth session, or Tau Desktop's OAuth
 * access token. Account governance stays with `web` (operator ruling D1=A); see `RequireWebSession`.
 */
export type AuthClientKind = 'web' | 'desktop';

type AccessTokenRow = {
  readonly id: string;
  readonly clientId: string;
  readonly userId?: string;
  readonly authorizationCodeId?: unknown;
  readonly expiresAt: Date;
  readonly createdAt: Date;
  readonly revoked?: unknown;
};

/** A verified desktop access token: the account, and a synthetic session that carries no credential. */
export type DesktopGrant = {
  readonly session: AuthSession;
  readonly user: AuthUser;
};

/**
 * Whether a bearer value could be Tau Desktop's opaque access token rather than a signed Better Auth session token
 * (`<token>.<signature>`, which `bearer({ requireSignature: true })` accepts).
 *
 * @param bearer - The value after `Bearer `.
 * @returns `true` for a value with no signature part.
 */
export const isOpaqueBearer = (bearer: string): boolean => bearer.length >= 16 && !bearer.includes('.');

/** The provider's stored form of a token (`storeTokens: 'hashed'`). */
const storedAccessToken = (token: string): string => createHash('sha256').update(token).digest('base64url');

/** How long a client's `disabled` flag is trusted for before it is read again. Milliseconds. */
const clientStatusTrust = 30_000;

/**
 * Verifies Tau Desktop's OAuth access tokens for Tau's own API, gateways and git transport (execution plan E7, E8).
 *
 * The token is checked on its own record: the `tau-desktop` client, not revoked, not expired, an account that still
 * exists, and a client that is not disabled. The browser session that approved the sign-in is deliberately **not**
 * consulted: once issued, a desktop grant is independent of that session, which may expire or sign out (spike
 * finding 3; the provider's own validation would mark the token inactive then, and keep doing so after refresh).
 */
export class DesktopGrantVerifier {
  private clientStatus: { readonly disabled: boolean; readonly readAt: number } | undefined;

  public constructor(private readonly auth: Auth) {}

  /**
   * Verify one bearer value.
   *
   * @param bearer - The value after `Bearer `.
   * @returns The grant, or `undefined` when the value is not a live desktop access token.
   */
  public async verify(bearer: string): Promise<DesktopGrant | undefined> {
    if (!isOpaqueBearer(bearer)) {
      return undefined;
    }
    const context = await this.auth.$context;
    const row = await context.adapter.findOne<AccessTokenRow>({
      model: 'oauthAccessToken',
      where: [{ field: 'token', value: storedAccessToken(bearer) }],
    });
    if (
      row === null ||
      row.clientId !== desktopClientId ||
      (row.revoked !== null && row.revoked !== undefined) ||
      new Date(row.expiresAt).getTime() <= Date.now() ||
      typeof row.userId !== 'string'
    ) {
      return undefined;
    }
    if (await this.isClientDisabled()) {
      return undefined;
    }
    const user = await context.internalAdapter.findUserById(row.userId);
    if (user === null) {
      return undefined;
    }
    const familyId =
      typeof row.authorizationCodeId === 'string' && row.authorizationCodeId !== '' ? row.authorizationCodeId : row.id;
    const session = {
      // One desktop sign-in keeps this id across refreshes: what a GitHub connect attempt binds to.
      id: familyId,
      userId: user.id,
      // Never the bearer: nothing downstream may treat this session as a credential.
      token: '',
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.createdAt),
      expiresAt: new Date(row.expiresAt),
      ipAddress: undefined,
      userAgent: undefined,
    } satisfies AuthSession;
    return { session, user: user as AuthUser };
  }

  private async isClientDisabled(): Promise<boolean> {
    const now = Date.now();
    if (this.clientStatus !== undefined && now - this.clientStatus.readAt < clientStatusTrust) {
      return this.clientStatus.disabled;
    }
    const context = await this.auth.$context;
    const client = await context.adapter.findOne<{ disabled?: unknown }>({
      model: 'oauthClient',
      where: [{ field: 'clientId', value: desktopClientId }],
    });
    const disabled = client === null || client.disabled === true;
    this.clientStatus = { disabled, readAt: now };
    return disabled;
  }
}
