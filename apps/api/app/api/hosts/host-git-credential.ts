import { createHash, randomBytes } from 'node:crypto';

import { and, eq, isNotNull, isNull } from 'drizzle-orm';

import type { DatabaseService } from '#database/database.service.js';
import { hostDevice } from '#database/schema.js';

/**
 * A cloud host's repository-scoped push credential (D21, I10): the third
 * credential kind, beside a session and an API key.
 *
 * The prefix is how the git transport tells it from a session token without a
 * lookup, and nothing else reads it: better-auth does not know the format, so
 * every route that authenticates through it refuses this credential by
 * construction, and only `git-transport.ts` resolves it.
 */
export const hostGitCredentialPrefix = 'taugit_';

/**
 * The hash a row stores. Same construction as the device credential's, so a
 * row never holds a secret that could be replayed.
 *
 * @param credential - The credential as the host presents it.
 * @returns Its SHA-256, base64url.
 */
export const hashHostGitCredential = (credential: string): string =>
  createHash('sha256').update(credential).digest('base64url');

/**
 * Mint one push credential. Handed to the provisioner once and never
 * recoverable afterwards: the row keeps only {@link hashHostGitCredential}.
 *
 * @returns A fresh credential carrying {@link hostGitCredentialPrefix}.
 */
export const mintHostGitCredential = (): string => `${hostGitCredentialPrefix}${randomBytes(32).toString('base64url')}`;

/** What a live push credential resolves to: the owner it acts for, via which device, on which project. */
export type HostGitPrincipal = {
  readonly ownerId: string;
  readonly deviceId: string;
  readonly projectId: string;
};

/**
 * Resolve a push credential to its cloud host, or nothing.
 *
 * Nothing for an unknown credential, for a host whose device was revoked
 * (deprovisioning revokes the row, so the next push fails) and for a row that
 * is not a cloud host, whatever it holds.
 *
 * @param databaseService - The API's database.
 * @param credential - The credential as presented, prefix included.
 * @returns The principal, or `undefined`.
 */
export const resolveHostGitCredential = async (
  databaseService: DatabaseService,
  credential: string,
): Promise<HostGitPrincipal | undefined> => {
  const [row] = await databaseService.database
    .select({ id: hostDevice.id, ownerId: hostDevice.ownerId, cloudProjectId: hostDevice.cloudProjectId })
    .from(hostDevice)
    .where(
      and(
        eq(hostDevice.gitCredentialHash, hashHostGitCredential(credential)),
        isNull(hostDevice.revokedAt),
        isNotNull(hostDevice.cloudProjectId),
      ),
    )
    .limit(1);
  if (!row?.cloudProjectId) {
    return undefined;
  }
  return { ownerId: row.ownerId, deviceId: row.id, projectId: row.cloudProjectId };
};
