import { and, eq, isNull } from 'drizzle-orm';
import type { DatabaseService } from '@taucad/api-database';
import { oauthAccessToken, oauthRefreshToken } from '@taucad/api-database/schema';
import { desktopClientId } from '#config/desktop-oauth.js';

/**
 * Ends every Tau Desktop sign-in an account holds: its refresh tokens are revoked and its access tokens deleted, so
 * each desktop is refused on its next request and cannot refresh.
 *
 * A password reset or change calls it. Better Auth ends the account's sessions then, but a desktop sign-in is not a
 * session: its `offline_access` refresh token outlives the browser session that approved it, by design (spike finding
 * 3). A new password is the moment the owner takes the account back, so the desktops sign in again too.
 *
 * @param database - The API's Drizzle database.
 * @param userId - The account.
 */
export const revokeDesktopSignIns = async (database: DatabaseService['database'], userId: string): Promise<void> => {
  await database
    .update(oauthRefreshToken)
    .set({ revoked: new Date() })
    .where(
      and(
        eq(oauthRefreshToken.userId, userId),
        eq(oauthRefreshToken.clientId, desktopClientId),
        isNull(oauthRefreshToken.revoked),
      ),
    );
  await database
    .delete(oauthAccessToken)
    .where(and(eq(oauthAccessToken.userId, userId), eq(oauthAccessToken.clientId, desktopClientId)));
};
