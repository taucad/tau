import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';
import type postgres from 'postgres';

/**
 * The Postgres logins of Tau's private service apps (tau-cloud change proposal
 * 2026-10-24-hosted-storage-stage1, P2.3). Terraform generates each password and
 * hands it to the API's release command; the protected migration job creates
 * the role, sets its login and refreshes its grants after every migration,
 * because a table or column grant is a snapshot.
 *
 * A password variable that is unset (or empty) never fails the release command:
 * the role still exists as `NOLOGIN` with its grants, and a login set earlier is
 * left as it is.
 *
 * The password itself never reaches Postgres: the job sends a SCRAM-SHA-256
 * verifier computed here, so neither a statement log nor `pg_stat_statements`
 * can hold the value.
 */

/** `tau-mirror`'s role (W13 B3a). */
export const mirrorRoleName = 'tau_mirror';

/** `tau-maintenance`'s role (north star DC4). */
export const maintenanceRoleName = 'tau_maintenance';

/**
 * Terraform generates passwords without special characters (P2.3). Anything
 * else is refused rather than escaped, and the error names the variable only.
 */
const passwordPattern = /^[\w-]{24,128}$/u;

/** A verifier with a salt and iteration count Postgres prints on its own; base64 has no quote. */
const verifierPattern = /^SCRAM-SHA-256\$\d+:[\w+/=]+\$[\w+/=]+:[\w+/=]+$/u;

/**
 * The SCRAM-SHA-256 verifier Postgres stores for `password` (RFC 5802, RFC 7677),
 * in the `rolpassword` format `ALTER ROLE … PASSWORD` accepts as already hashed.
 */
export const scramVerifier = (
  password: string,
  salt: Uint8Array<ArrayBuffer> = new Uint8Array(randomBytes(16)),
  iterations = 4096,
): string => {
  const salted = pbkdf2Sync(password.normalize('NFKC'), salt, iterations, 32, 'sha256');
  const clientKey = createHmac('sha256', salted).update('Client Key').digest();
  const storedKey = createHash('sha256').update(clientKey).digest();
  const serverKey = createHmac('sha256', salted).update('Server Key').digest();
  return `SCRAM-SHA-256$${String(iterations)}:${Buffer.from(salt).toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`;
};

/** The password to set, or `undefined` to leave the login as it is; throws naming `variable` only. */
const checkedPassword = (variable: string, password: string | undefined): string | undefined => {
  if (password === undefined || password === '') {
    return undefined;
  }
  if (!passwordPattern.test(password)) {
    throw new Error(`${variable} must be 24 to 128 letters, digits, underscores or hyphens; its value is not shown`);
  }
  return password;
};

const ensureRole = async (
  transaction: postgres.TransactionSql,
  role: typeof mirrorRoleName | typeof maintenanceRoleName,
  password: string | undefined,
): Promise<void> => {
  // `role` is one of two constants, never input.
  await transaction.unsafe(
    `DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$`,
  );
  if (password !== undefined) {
    const verifier = scramVerifier(password);
    if (!verifierPattern.test(verifier)) {
      throw new Error(`the ${role} password verifier is malformed`);
    }
    await transaction.unsafe(`ALTER ROLE ${role} WITH LOGIN PASSWORD '${verifier}'`);
  }
};

/**
 * `tau_mirror`: reads the copy's work signal and writes only the copy's own
 * columns, so a stolen `tau-mirror` credential can neither read account data nor
 * move a repository's generation.
 *
 * - `SELECT` on `project_git`, `project_git_lfs_object`, `storage_tombstone` and
 *   `mirror_drill_run`, and on the three `project` columns that locate a
 *   repository (`id`, `owner_id`, `storage_account_id`).
 * - `UPDATE` of the copy columns only: `copied_generation`, `copy_pending_since`,
 *   `copy_locked_until`, `copied_manifest_sha256` (and `updated_at`, which Drizzle
 *   sets on every update), `project_git_lfs_object.copied_at` and
 *   `storage_tombstone.copy_marked_at`.
 * - `INSERT` and `UPDATE` on `mirror_drill_run` (W13 B10: the drill records its run).
 * - Read access to the migrator's bookkeeping table, so the copier refuses to run
 *   against a schema it was not built for.
 *
 * @param client - The migration identity's connection.
 * @param password - `TAU_MIRROR_DATABASE_PASSWORD`.
 */
export async function installMirrorRole(client: postgres.Sql, password?: string): Promise<void> {
  const login = checkedPassword('TAU_MIRROR_DATABASE_PASSWORD', password);
  await client.begin(async (transaction) => {
    await ensureRole(transaction, mirrorRoleName, login);
    await transaction`GRANT USAGE ON SCHEMA public TO tau_mirror`;
    await transaction`GRANT SELECT ON public.project_git, public.project_git_lfs_object, public.storage_tombstone, public.mirror_drill_run TO tau_mirror`;
    await transaction`GRANT SELECT (id, owner_id, storage_account_id) ON public.project TO tau_mirror`;
    await transaction`GRANT UPDATE (copied_generation, copy_pending_since, copy_locked_until, copied_manifest_sha256, updated_at) ON public.project_git TO tau_mirror`;
    await transaction`GRANT UPDATE (copied_at) ON public.project_git_lfs_object TO tau_mirror`;
    await transaction`GRANT UPDATE (copy_marked_at) ON public.storage_tombstone TO tau_mirror`;
    await transaction`GRANT INSERT, UPDATE ON public.mirror_drill_run TO tau_mirror`;
    await transaction`GRANT USAGE ON SCHEMA drizzle TO tau_mirror`;
    await transaction`GRANT SELECT ON drizzle.__drizzle_migrations TO tau_mirror`;
  });
}

/**
 * `tau_maintenance`: the login of the private `tau-maintenance` app (DC4), which
 * runs the passes the API's `revisions-maintenance` group runs today: tenant and
 * project purge, project-deletion recovery, `retire-lfs`, blob collection and
 * operator restore. It inherits `tau_api_runtime`, the role those passes already
 * run under, so moving them out of the API grants them nothing new and never
 * less: every `public` table but the two billing-protected ones (reached only
 * through `tau_billing_runtime`'s column grants), the sequences, and the
 * migrator's bookkeeping table. Must run after `installApiRuntimeRole`.
 *
 * @param client - The migration identity's connection.
 * @param password - `TAU_MAINTENANCE_DATABASE_PASSWORD`.
 */
export async function installMaintenanceRole(client: postgres.Sql, password?: string): Promise<void> {
  const login = checkedPassword('TAU_MAINTENANCE_DATABASE_PASSWORD', password);
  await client.begin(async (transaction) => {
    await ensureRole(transaction, maintenanceRoleName, login);
    await transaction`GRANT tau_api_runtime TO tau_maintenance WITH INHERIT TRUE`;
  });
}
