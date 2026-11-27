import { sql } from 'drizzle-orm';
import type { DatabaseService } from '@taucad/api-database';
import { desktopClientId, desktopTokenLifetimes } from '#config/desktop-oauth.js';

/** How long a family must have looked dead before it is deleted: longer than any refresh is in flight. */
const deadFamilySettleMilliseconds = 24 * 60 * 60 * 1000;

/**
 * Prunes Tau Desktop's refresh tokens (desktop sign-in DSI-10). Each refresh rotates the token and leaves the old row
 * behind, revoked, so a family grows by a row an hour while the desktop runs.
 *
 * - **A dead family goes whole**, in one statement per batch so its rows never go one at a time: one whose sign-in
 *   began more than 90 days ago (the absolute cap refuses it anyway), or one with no usable row (each revoked or
 *   expired) for a day. Its access tokens go with it (`refresh_id` cascades).
 * - **A live family loses only expired rows, never its earliest.** The 90-day cap counts from the family's earliest
 *   row (`desktopTokenPolicy`), and so does the signed-in list's "signed in" time: delete that row and the family
 *   would get a fresh 90 days. A rotated row that has not expired stays too, so replaying it still revokes the
 *   account's desktop sign-ins rather than meeting an unknown token.
 *
 * Bounded so a backlog never holds long locks; the next daily maintenance pass takes the rest.
 *
 * @param database - The API database.
 * @param input - The clock and the batch size (families for the first step, rows for the second).
 * @returns How many families and rows were deleted.
 */
export const pruneDesktopRefreshTokens = async (
  database: DatabaseService['database'],
  input: Readonly<{ now: Date; limit: number }>,
): Promise<{ readonly deadFamilies: number; readonly deadFamilyRows: number; readonly expiredRows: number }> => {
  // Written as Drizzle writes these `timestamp` columns: the ISO instant, read without its zone.
  const at = (instant: Date) => sql`${instant.toISOString()}::timestamp`;
  const now = at(input.now);
  const capStart = at(new Date(input.now.getTime() - desktopTokenLifetimes.signIn * 1000));
  const settled = at(new Date(input.now.getTime() - deadFamilySettleMilliseconds));

  const dead = await database.execute<{ family_id: string }>(sql`
    with family as (
      select authorization_code_id as family_id
      from oauth_refresh_token
      where client_id = ${desktopClientId} and authorization_code_id is not null
      group by authorization_code_id
      having min(created_at) <= ${capStart}
        or (
          not bool_or(revoked is null and expires_at > ${now})
          and max(greatest(created_at, coalesce(revoked, created_at))) <= ${settled}
        )
      limit ${input.limit}
    )
    delete from oauth_refresh_token
    where client_id = ${desktopClientId} and authorization_code_id in (select family_id from family)
    returning authorization_code_id as family_id
  `);

  const expired = await database.execute<{ id: string }>(sql`
    with family as (
      select authorization_code_id as family_id, min(created_at) as started_at
      from oauth_refresh_token
      where client_id = ${desktopClientId} and authorization_code_id is not null
      group by authorization_code_id
    ),
    doomed as (
      select token.id
      from oauth_refresh_token token
      join family on family.family_id = token.authorization_code_id
      where token.client_id = ${desktopClientId}
        and token.expires_at <= ${now}
        and token.created_at > family.started_at
      limit ${input.limit}
    )
    delete from oauth_refresh_token where id in (select id from doomed)
    returning id
  `);

  const deadRows = [...dead];
  return {
    deadFamilies: new Set(deadRows.map((row) => row.family_id)).size,
    deadFamilyRows: deadRows.length,
    expiredRows: [...expired].length,
  };
};
