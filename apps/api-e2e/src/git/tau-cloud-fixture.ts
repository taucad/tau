/* eslint-disable @typescript-eslint/naming-convention -- E2E is the established project acronym. */
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { localDatabaseName } from '@taucad/utils/worktree-database';
import { gitE2EApiUrl, gitE2EFrontendUrl } from '#git/config.js';

/**
 * One seeded Tau Cloud owner, on real Postgres, for the git-server tier.
 *
 * A node-side sibling of `apps/desktop-e2e/src/support/tau-account.ts` rather
 * than an import of it: the repo's own comment rejects cross-e2e-project source
 * imports, and this file needs two things that one does not have — a **paid**
 * plan (the free tier cannot sync at all: `canSyncFiles` is false and
 * `storageLimitBytesByTier.free` is zero) and a **registered project**, which
 * no production code path creates. Both are stated at their call sites.
 */

const execFileAsync = promisify(execFile);
const workspaceRoot = resolve(import.meta.dirname, '../../../..');

/** Credentials for one throwaway owner. */
export type TauCloudOwner = {
  readonly accountId: string;
  readonly email: string;
  readonly token: string;
  readonly userId: string;
};

const assertTestEmail = (email: string): void => {
  if (!/^tau-git-[a-z\d-]+@example\.test$/u.test(email)) {
    throw new Error('Git E2E account email is outside the tau-git-*@example.test namespace.');
  }
};

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
      localDatabaseName(),
      '-c',
      statement,
    ],
    { encoding: 'utf8' },
  );
  return stdout.trim();
};

/**
 * Sign up, verify, sign in and fund one throwaway owner.
 *
 * @param label - A short name for the account, so a stranded row says which test left it.
 * @returns The owner, with the bearer every git request carries.
 */
export const seedTauCloudOwner = async (label: string): Promise<TauCloudOwner> => {
  const suffix = randomUUID();
  const account = {
    email: `tau-git-${label}-${suffix}@example.test`,
    name: 'Tau Git Server E2E',
    password: `Tau-${suffix}-pass`,
  };
  assertTestEmail(account.email);
  const headers = { 'content-type': 'application/json', origin: gitE2EFrontendUrl };

  /* Better Auth allows three sign-ups per ten seconds per origin, and this file
     seeds three accounts before its first case. Waiting out a `429` here rather
     than spacing the call sites keeps the limit the fixture's problem: the next
     case that needs one more owner does not have to know about it. */
  let signUp = await fetch(`${gitE2EApiUrl}/v1/auth/sign-up/email`, {
    method: 'POST',
    headers,
    body: JSON.stringify(account),
  });
  for (let attempt = 0; signUp.status === 429 && attempt < 6; attempt += 1) {
    // oxlint-disable-next-line no-await-in-loop -- waiting out a rate limit is sequential by definition.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 5000);
    });
    // oxlint-disable-next-line no-await-in-loop -- ditto: one retry at a time.
    signUp = await fetch(`${gitE2EApiUrl}/v1/auth/sign-up/email`, {
      method: 'POST',
      headers,
      body: JSON.stringify(account),
    });
  }
  if (!signUp.ok) {
    throw new Error(`Git E2E sign-up failed with HTTP ${String(signUp.status)}: ${await signUp.text()}`);
  }
  await psql(`UPDATE "user" SET email_verified = true WHERE email = '${account.email}';`);

  const signIn = await fetch(`${gitE2EApiUrl}/v1/auth/sign-in/email`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
  if (!signIn.ok) {
    throw new Error(`Git E2E sign-in failed with HTTP ${String(signIn.status)}: ${await signIn.text()}`);
  }
  const token = signIn.headers.get('set-auth-token') ?? ((await signIn.json()) as { readonly token?: string }).token;
  if (!token) {
    throw new Error('Git E2E sign-in returned no session token.');
  }

  /* Funding is what creates the owner binding every entitlement reads; the
   * credits themselves are incidental here. */
  await execFileAsync(
    process.execPath,
    [
      '--env-file-if-exists=apps/api/.env',
      '--import',
      '@oxc-node/core/register',
      'apps/api/app/testing/development-billing-account.ts',
      'fund',
      '--email',
      account.email,
    ],
    { cwd: workspaceRoot, encoding: 'utf8', env: { ...process.env, BILLING_ENVIRONMENT: 'development' } },
  );

  const userId = await psql(`SELECT id FROM "user" WHERE email = '${account.email}';`);
  const accountId = await psql(
    `SELECT account_id FROM billing.billing_owner_binding WHERE auth_user_id = '${userId}' AND revoked_at IS NULL;`,
  );
  return { accountId, email: account.email, token, userId };
};

/**
 * Put the owner on the Pro plan.
 *
 * Buying a plan is an operator action with a Stripe leg this suite has no
 * business driving, so the rows it would leave are written directly — the same
 * shape `BillingService.projectEntitlements` reads: an owned subscription
 * (`customer_binding_id` and `offer_snapshot` non-null, which the
 * `subscription_financial_state` check also requires `request_id`,
 * `request_hash` and a `slot_state` for) whose `paid_through` is in the future.
 * One hour, not thirty days: `protect_payment_identity` refuses to delete the
 * row or to pull its `paid_through` back, so the shortest horizon that outlives
 * a run is the one that leaves the least behind.
 * Without it every push is `403 GIT_SYNC_NOT_ENTITLED` and every write quota is
 * zero, and nothing about the git server would be under test.
 *
 * @param owner - The seeded owner.
 * @returns Nothing.
 */
export const seedProPlan = async (owner: TauCloudOwner): Promise<void> => {
  const id = `w18-${owner.userId}`;
  await psql(
    `INSERT INTO billing.billing_stripe_customer (id, account_id, environment, stripe_account_id, livemode) ` +
      `VALUES ('${id}', '${owner.accountId}', 'development', 'acct_tau_git_e2e', false);`,
  );
  await psql(
    `INSERT INTO subscription (id, plan, reference_id, status, account_id, environment, customer_binding_id, ` +
      `offer_snapshot, request_id, request_hash, slot_state, paid_through, period_start, period_end, updated_at) ` +
      `VALUES ('${id}', 'pro', '${owner.userId}', 'active', '${owner.accountId}', 'development', '${id}', ` +
      `'{"plan":"pro"}'::jsonb, '${id}-request', '${id}-hash', 'current', now() + interval '1 hour', now(), ` +
      `now() + interval '1 hour', now());`,
  );
};

/**
 * Register a project on the Tau Hosted Remote.
 *
 * **This stands in for a product path that does not exist** (W18 defect DEF-1):
 * `GitRepositoryService.authorize` answers `404 GIT_REPOSITORY_NOT_FOUND` until
 * a `project` row exists, and the only production writer of that table is
 * `PublicationsService`, which runs *after* a successful push. The red pin in
 * `tau-hosted-remote.spec.ts` keeps that gap failing by name; every other case
 * seeds the row here so the server itself is what is under test.
 *
 * @param owner - The project's owner.
 * @param projectId - The repository id, which is the project id.
 * @returns Nothing.
 */
export const registerProject = async (owner: TauCloudOwner, projectId: string): Promise<void> => {
  await psql(
    `INSERT INTO project (id, owner_id, name, origin) ` +
      `VALUES ('${projectId}', '${owner.userId}', 'Git server E2E', 'local-mirror') ON CONFLICT (id) DO NOTHING;`,
  );
};

/**
 * Whether the Tau Hosted Remote holds a row for this project id.
 *
 * @param projectId - The id to look for.
 * @returns True when a `project` row exists.
 */
export const projectExists = async (projectId: string): Promise<boolean> =>
  (await psql(`SELECT count(*) FROM project WHERE id = '${projectId}';`)) !== '0';

/**
 * Forget every storage figure this owner's projects have accumulated.
 *
 * `GitRepositoryService.readOwnerUsage` sums `project_git` **account-wide** and
 * deliberately so — one plan allowance is shared by all owned projects. One
 * owner therefore serves the whole file, and a quota case that spends nearly
 * the whole plan on its own project leaves the account over the limit for every
 * later case: the coarse `authorize` guard then shadows the fine per-file one
 * and three unrelated rows fail (review C57). Called per case, so each one owns
 * the headroom it seeds.
 *
 * @param owner - The owner whose projects are forgotten.
 * @returns Nothing.
 */
export const resetOwnerStorage = async (owner: TauCloudOwner): Promise<void> => {
  await psql(
    `DELETE FROM project_git WHERE project_id IN (SELECT id FROM project WHERE owner_id = '${owner.userId}');`,
  );
};

/** A fresh project id in the shape `isProjectRepositoryId` accepts. */
export const gitE2EProjectId = (): string => `proj_${randomUUID().replaceAll('-', '')}`;

/**
 * Remove everything one owner left behind that may be removed.
 *
 * The seeded plan rows stay, and deliberately: `billing.protect_payment_identity`
 * raises `payment evidence cannot be deleted` on a `DELETE` and
 * `subscription evidence cannot regress or extend grace` on an `UPDATE` that
 * pulls `paid_through` back — two production protections this suite has no
 * business weakening. They are seeded with an hour of paid time instead, so a
 * stranded row stops entitling anything by itself. `require_financial_closure`
 * still decides the user delete.
 *
 * @param owner - The owner to remove.
 * @returns Nothing.
 */
export const deleteTauCloudOwner = async (owner: TauCloudOwner): Promise<void> => {
  assertTestEmail(owner.email);
  await psql(`DELETE FROM project WHERE owner_id = '${owner.userId}';`);

  try {
    await psql(`DELETE FROM "user" WHERE email = '${owner.email}';`);
  } catch (error) {
    if (!String(error).includes('financial closure must precede auth deletion')) {
      throw error;
    }
    await execFileAsync(
      process.execPath,
      [
        '--env-file-if-exists=apps/api/.env',
        '--import',
        '@oxc-node/core/register',
        'apps/api/app/testing/development-billing-account.ts',
        'close',
        '--email',
        owner.email,
      ],
      { cwd: workspaceRoot, encoding: 'utf8', env: { ...process.env, BILLING_ENVIRONMENT: 'development' } },
    );
    await psql(`DELETE FROM "user" WHERE email = '${owner.email}';`);
  }
};

/** The `Authorization` value stock git sends once the API challenges it. */
export const basicAuthorization = (token: string): string =>
  `Basic ${Buffer.from(`x:${token}`, 'utf8').toString('base64')}`;

/** Run `git` and return its exit code, stdout and stderr without throwing. */
export const runGit = async (
  args: readonly string[],
  cwd: string,
  extra: Readonly<Record<string, string>> = {},
): Promise<{ readonly code: number; readonly stdout: string; readonly stderr: string }> => {
  try {
    const { stdout, stderr } = await execFileAsync('git', [...args], {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        /* A developer's own global git configuration — a credential helper, an
         * `insteadOf`, an `http.extraHeader` — would otherwise decide what this
         * suite proves. Pinned the same way the in-process harness pins it. */
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_SYSTEM: '/dev/null',
        GIT_TERMINAL_PROMPT: '0',
        ...extra,
      },
      maxBuffer: 64 * 1024 * 1024,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failure.code ?? 1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? String(error) };
  }
};
