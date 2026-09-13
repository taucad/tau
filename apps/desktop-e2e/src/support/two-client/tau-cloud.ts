/* eslint-disable @typescript-eslint/naming-convention -- E2E is the established project acronym. */
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { desktopE2EApiUrl, desktopE2EFrontendUrl } from '#support/config.js';

/**
 * What one Tau Cloud owner needs before a project can sync at all (charter W18).
 *
 * `#support/tau-account.js` already signs up, verifies, signs in and funds; it
 * is not edited here. This module adds the two things a *sync* run needs on top
 * and says plainly why each one is seeded rather than driven:
 *
 *  - a **paid plan**, because `storageLimitBytesByTier.free` is zero and
 *    `canSyncFiles` is false, so a free owner's every push is
 *    `403 GIT_SYNC_NOT_ENTITLED` and nothing about sync would be observable;
 *    buying one has a Stripe leg this suite must not drive;
 *  - a **registered project**, which stands in for a product path that does not
 *    exist (W18 defect DEF-1) and is pinned red separately.
 */

const execFileAsync = promisify(execFile);
const workspaceRoot = resolve(import.meta.dirname, '../../../../..');

/** Run one statement against the development Postgres and return its trimmed output. */
const psql = async (statement: string): Promise<string> => {
  const { stdout } = await execFileAsync(
    'docker',
    [
      'exec',
      'tau-postgres',
      'psql',
      '-qtAX',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'dev_user',
      '-d',
      'tau_dev',
      '-c',
      statement,
    ],
    { encoding: 'utf8' },
  );
  return stdout.trim();
};

/** The identifiers a seeded owner is addressed by on the billing side. */
export type TauCloudOwnerIds = Readonly<{ accountId: string; userId: string }>;

/**
 * Read the owner and credit-account ids `seedTauTestUser` left behind.
 *
 * @param email - The seeded address.
 * @returns The auth user id and the credit account its funding bound.
 */
export const tauCloudOwnerIds = async (email: string): Promise<TauCloudOwnerIds> => {
  const userId = await psql(`SELECT id FROM "user" WHERE email = '${email}';`);
  if (!userId) {
    throw new Error(`No Tau user exists for ${email}.`);
  }
  const accountId = await psql(
    `SELECT account_id FROM billing.billing_owner_binding WHERE auth_user_id = '${userId}' AND revoked_at IS NULL;`,
  );
  if (!accountId) {
    throw new Error(`${email} has no billing owner binding; fund the account before seeding a plan.`);
  }
  return { accountId, userId };
};

/**
 * Put the owner on the Pro plan for an hour.
 *
 * The rows are the shape `BillingService.projectEntitlements` reads: an owned
 * subscription — `customer_binding_id` and `offer_snapshot` non-null, which the
 * `subscription_financial_state` check also wants `request_id`, `request_hash`
 * and a `slot_state` for — whose `paid_through` is in the future. One hour
 * rather than a month because `billing.protect_payment_identity` refuses to
 * delete the row or to pull its `paid_through` back, so the shortest horizon
 * that outlives a run leaves the least behind.
 *
 * @param owner - The seeded owner's ids.
 * @returns Nothing.
 */
export const seedProPlan = async (owner: TauCloudOwnerIds): Promise<void> => {
  const id = `w18-${owner.userId}`;
  await psql(
    `INSERT INTO billing.billing_stripe_customer (id, account_id, environment, stripe_account_id, livemode) ` +
      `VALUES ('${id}', '${owner.accountId}', 'development', 'acct_tau_two_client', false) ` +
      `ON CONFLICT (id) DO NOTHING;`,
  );
  await psql(
    `INSERT INTO subscription (id, plan, reference_id, status, account_id, environment, customer_binding_id, ` +
      `offer_snapshot, request_id, request_hash, slot_state, paid_through, period_start, period_end, updated_at) ` +
      `VALUES ('${id}', 'pro', '${owner.userId}', 'active', '${owner.accountId}', 'development', '${id}', ` +
      `'{"plan":"pro"}'::jsonb, '${id}-request', '${id}-hash', 'current', now() + interval '1 hour', now(), ` +
      `now() + interval '1 hour', now()) ON CONFLICT (id) DO NOTHING;`,
  );
};

/**
 * Register a project on the Tau Hosted Remote.
 *
 * **Stands in for a product path that does not exist** (W18 defect DEF-1):
 * `GitRepositoryService.authorize` answers `404 GIT_REPOSITORY_NOT_FOUND` until
 * a `project` row exists, and the only production writer of that table is
 * `PublicationsService`, which runs after a successful push. The red pin in
 * `two-client.spec.ts` keeps the gap failing by name; every case that needs a
 * working remote calls this and says so.
 *
 * @param owner - The project's owner.
 * @param projectId - The project id, which is also the repository id.
 * @param name - The project's name, for a readable row.
 * @returns Nothing.
 */
export const registerProjectOnRemote = async (
  owner: TauCloudOwnerIds,
  projectId: string,
  name = 'Two-client E2E',
): Promise<void> => {
  await psql(
    `INSERT INTO project (id, owner_id, name, origin) ` +
      `VALUES ('${projectId}', '${owner.userId}', '${name.replaceAll("'", "''")}', 'local-mirror') ` +
      `ON CONFLICT (id) DO NOTHING;`,
  );
};

/** Set the storage this project has already spent, so the plan headroom is a known number. */
export const spendProjectStorage = async (projectId: string, bytes: number): Promise<void> => {
  await psql(
    `INSERT INTO project_git (project_id, storage_bytes, lfs_bytes) VALUES ('${projectId}', ${String(bytes)}, 0) ` +
      `ON CONFLICT (project_id) DO UPDATE SET storage_bytes = ${String(bytes)}, lfs_bytes = 0;`,
  );
};

/** Remove the projects one owner registered, so a re-run starts from the same state. */
export const forgetSeededProjects = async (owner: TauCloudOwnerIds): Promise<void> => {
  await psql(`DELETE FROM project WHERE owner_id = '${owner.userId}';`);
};

/**
 * Mint a second session for the same account.
 *
 * One account, two clients: the desktop shell holds the bearer
 * `seedTauTestUser` returned, and the browser gets its session from this rather
 * than from a second `/sign-in/email` — better-auth's default rule for that
 * route is three attempts per ten seconds per address, and the limit is a
 * production protection this suite must not weaken. `/one-time-token/verify`
 * calls `setSessionCookie`, so posting the token from a browser context's own
 * request API puts the session in that context's cookie jar.
 *
 * @param bearer - The desktop session's bearer.
 * @returns A single-use token the browser context exchanges for a session.
 */
export const mintOneTimeToken = async (bearer: string): Promise<string> => {
  const generated = await fetch(`${desktopE2EApiUrl}/v1/auth/one-time-token/generate`, {
    headers: { authorization: `Bearer ${bearer}`, origin: desktopE2EFrontendUrl },
  });
  if (!generated.ok) {
    throw new Error(`One-time token generation failed with HTTP ${String(generated.status)}.`);
  }
  const { token } = (await generated.json()) as { readonly token?: string };
  if (!token) {
    throw new Error('One-time token generation returned no token.');
  }
  return token;
};

/** A fresh project id in the shape `isProjectRepositoryId` accepts. */
export const twoClientProjectId = (): string => `proj_${randomUUID().replaceAll('-', '')}`;

/** Run `git` and return its exit code and output without throwing. */
export const runGit = async (
  args: readonly string[],
  cwd: string,
): Promise<Readonly<{ code: number; stdout: string; stderr: string }>> => {
  try {
    const { stdout, stderr } = await execFileAsync('git', [...args], {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        /* A developer's own global git configuration would otherwise decide
         * what this suite proves. */
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_SYSTEM: '/dev/null',
        GIT_TERMINAL_PROMPT: '0',
      },
      maxBuffer: 64 * 1024 * 1024,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failure.code ?? 1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? String(error) };
  }
};

/** The `Authorization` value stock git sends once the API challenges it. */
export const basicAuthorization = (token: string): string =>
  `Basic ${Buffer.from(`x:${token}`, 'utf8').toString('base64')}`;

/** The workspace root, for the spec's own child processes. */
export const twoClientWorkspaceRoot = workspaceRoot;
