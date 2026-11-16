import { Inject, Injectable } from '@nestjs/common';
import type { betterAuth } from 'better-auth';
import { authInstanceKey } from '#auth.constant.js';
import { sessionDataNameOf, stripSessionSnapshot } from '#session-snapshot.js';

type AuthInstance = ReturnType<typeof betterAuth>;

/** The body Better Auth's `getAccessToken` takes. */
export type AccessTokenBody = NonNullable<Parameters<AuthInstance['api']['getAccessToken']>[0]>['body'];

/**
 * The second and last way Tau code reaches Better Auth with request headers (the resolver is the first).
 * It exposes named methods only, and each removes the session snapshot from the headers it is handed, so
 * an endpoint that accepts a cached session never sees one through Tau code.
 */
@Injectable()
export class BetterAuthService {
  public constructor(@Inject(authInstanceKey) private readonly auth: AuthInstance) {}

  /**
   * A linked provider's access token for the signed-in user.
   *
   * @param headers - The request's headers; copied, never changed.
   * @param body - The account to read the token for.
   * @returns Better Auth's answer.
   */
  public async getAccessToken(
    headers: Headers,
    body: AccessTokenBody,
  ): Promise<Awaited<ReturnType<AuthInstance['api']['getAccessToken']>>> {
    const copy = new Headers(headers);
    const cookie = copy.get('cookie');
    if (cookie !== null) {
      copy.set('cookie', stripSessionSnapshot(cookie, await sessionDataNameOf(this.auth)));
    }
    return this.auth.api.getAccessToken({ headers: copy, body });
  }
}
