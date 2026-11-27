import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { desktopClientId } from '@taucad/api-auth';
import { DatabaseService } from '@taucad/api-database';
import { oauthAccessToken, oauthRefreshToken } from '@taucad/api-database/schema';
import { Span } from '@taucad/api-observability';

/** Days after the first sign-in at which a desktop sign-in ends however often it refreshes (ruling D3=B, P1). */
const desktopSignInDays = 90;

/** One Tau Desktop sign-in, as the web's Security settings list it. */
export type DesktopSignIn = {
  /** The refresh family: the same for every token one sign-in rotates through. */
  readonly id: string;
  readonly client: 'Tau Desktop';
  readonly signedInAt: string;
  /** When it last refreshed: about hourly while the app is in use. */
  readonly lastActiveAt: string;
  /** When it ends whatever happens: 90 days after `signedInAt`. */
  readonly endsAt: string;
};

/**
 * The account's Tau Desktop sign-ins, listed and revoked by refresh family. The provider keeps one consent per account
 * and client, and deleting it revokes nothing, so the family is the unit a person can see and end (spike finding 4).
 */
@Injectable()
export class AccountService {
  public constructor(private readonly databaseService: DatabaseService) {}

  /**
   * The live sign-ins: a family with an unrevoked, unexpired refresh token, inside its 90 days.
   *
   * @param userId - The signed-in account.
   * @returns Newest activity first.
   */
  @Span()
  public async listDesktopSignIns(userId: string): Promise<DesktopSignIn[]> {
    const signedInAt = sql<Date>`min(${oauthRefreshToken.createdAt})`;
    const lastActiveAt = sql<Date>`max(${oauthRefreshToken.createdAt})`;
    const rows = await this.databaseService.database
      .select({ id: oauthRefreshToken.authorizationCodeId, signedInAt, lastActiveAt })
      .from(oauthRefreshToken)
      .where(
        and(
          eq(oauthRefreshToken.userId, userId),
          eq(oauthRefreshToken.clientId, desktopClientId),
          isNotNull(oauthRefreshToken.authorizationCodeId),
        ),
      )
      .groupBy(oauthRefreshToken.authorizationCodeId)
      .having(
        and(
          sql`bool_or(${oauthRefreshToken.revoked} is null and ${oauthRefreshToken.expiresAt} > now())`,
          sql`min(${oauthRefreshToken.createdAt}) > now() - make_interval(days => ${desktopSignInDays})`,
        ),
      )
      .orderBy(desc(lastActiveAt));
    return rows.flatMap((row): DesktopSignIn[] => {
      if (row.id === null) {
        return [];
      }
      const started = new Date(row.signedInAt);
      return [
        {
          id: row.id,
          client: 'Tau Desktop',
          signedInAt: started.toISOString(),
          lastActiveAt: new Date(row.lastActiveAt).toISOString(),
          endsAt: new Date(started.getTime() + desktopSignInDays * 24 * 60 * 60 * 1000).toISOString(),
        },
      ];
    });
  }

  /**
   * End one sign-in: its refresh tokens are revoked and its access tokens deleted, so the desktop is refused on its
   * next request and cannot refresh.
   *
   * @param userId - The signed-in account; another account's family is not found.
   * @param signInId - The family id from {@link listDesktopSignIns}.
   * @returns `false` when the account has no such sign-in.
   */
  @Span()
  public async revokeDesktopSignIn(userId: string, signInId: string): Promise<boolean> {
    const family = and(
      eq(oauthRefreshToken.userId, userId),
      eq(oauthRefreshToken.clientId, desktopClientId),
      eq(oauthRefreshToken.authorizationCodeId, signInId),
    );
    return this.databaseService.database.transaction(async (tx) => {
      const found = await tx.select({ id: oauthRefreshToken.id }).from(oauthRefreshToken).where(family).limit(1);
      if (found.length === 0) {
        return false;
      }
      await tx
        .update(oauthRefreshToken)
        .set({ revoked: new Date() })
        .where(and(family, isNull(oauthRefreshToken.revoked)));
      await tx
        .delete(oauthAccessToken)
        .where(
          and(
            eq(oauthAccessToken.userId, userId),
            eq(oauthAccessToken.clientId, desktopClientId),
            eq(oauthAccessToken.authorizationCodeId, signInId),
          ),
        );
      return true;
    });
  }
}
