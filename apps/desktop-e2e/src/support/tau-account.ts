import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { localDatabaseName } from '@taucad/utils/worktree-database';
import { desktopE2EApiUrl, desktopE2ECompletedArtifact, desktopE2EFrontendUrl } from '#support/config.js';

/**
 * Test-account seeding (work item Z2, auth blueprint A7).
 *
 * A node-side port of `apps/ui-e2e`'s `uiAuthenticateTauTestUser`: sign up, verify
 * the email straight through the docker postgres, sign in and keep the **bearer**
 * token better-auth returns in `set-auth-token`. The desktop shell takes that token
 * through `TAU_DESKTOP_TOKEN`, which is the seeded alternative to the interactive
 * loopback flow (charter A7).
 *
 * Credits come from the API's own development entry point, which funds by a paid
 * cause on the `billing` schema — the legacy `public.credit_account` table the
 * gateway no longer reads is gone from this file. The same entry point closes the
 * account at teardown, because the billing protections block `DELETE FROM "user"`
 * until financial closure has run.
 */

const execFileAsync = promisify(execFile);

/** The workspace root the API entry point is invoked from. */
const workspaceRoot = resolve(import.meta.dirname, '../../../..');

/** Build the bounded development billing command for one seeded account. */
export const tauBillingAccountArgs = (action: 'fund' | 'close', email: string): readonly string[] => {
  assertTauTestEmail(email);
  return [
    '--env-file-if-exists=apps/api/.env',
    '--import',
    '@oxc-node/core/register',
    'apps/api/app/testing/development-billing-account.ts',
    action,
    '--email',
    email,
  ];
};

/**
 * Read the billing environment this run's API is configured for.
 *
 * `undefined` means the self-host completed-artifact API has no billing
 * environment, so there is nothing to fund or close.
 */
const tauBillingEnvironment = async (token: string): Promise<string | undefined> => {
  const response = await fetch(`${desktopE2EApiUrl}/v1/billing/credits`, {
    headers: { authorization: `Bearer ${token}`, origin: desktopE2EFrontendUrl },
  });
  const selfHostedArtifact = desktopE2ECompletedArtifact && process.env['TAU_E2E_COMPLETED_CLOUD_GATEWAY'] !== 'true';
  if (selfHostedArtifact && response.status === 404) {
    // The self-hosted completed-artifact API does not register billing routes.
    return undefined;
  }
  if (response.status === 503) {
    /* The API answers 503 both without a billing environment (the isolated
     * completed-artifact stack, nothing to fund) and without a usable
     * `BILLING_USAGE_CURSOR_SECRET` (a misconfigured developer API, which must
     * not silently skip funding and fail later as insufficient credit). */
    if (selfHostedArtifact) {
      return undefined;
    }
    throw new Error(
      'The Tau API reports billing unavailable; set BILLING_ENVIRONMENT and BILLING_USAGE_CURSOR_SECRET (see apps/api/.env.example).',
    );
  }
  if (!response.ok) {
    throw new Error(`Reading the Tau billing environment failed with HTTP ${String(response.status)}.`);
  }
  const { environment } = (await response.json()) as { readonly environment?: string };
  if (desktopE2ECompletedArtifact && !selfHostedArtifact && environment !== 'development') {
    throw new Error('Completed-artifact cloud billing requires the disposable development environment.');
  }
  return environment;
};

/** Recheck the exact disposable Compose database before a completed-package billing write. */
const completedArtifactBillingDatabase = async (environment: string): Promise<string> => {
  const databaseUrl = process.env['DATABASE_URL'];
  const project = process.env['TAU_E2E_COMPOSE_PROJECT'];
  const container = process.env['TAU_E2E_POSTGRES_CONTAINER'];
  if (
    process.env['TAU_E2E_COMPLETED_CLOUD_GATEWAY'] !== 'true' ||
    environment !== 'development' ||
    !databaseUrl ||
    process.env['BILLING_DATABASE_URL'] !== databaseUrl ||
    !project ||
    !/^tau-desktop-e2e-[0-9a-f-]{36}$/u.test(project) ||
    !container ||
    !/^[a-f0-9]{12,64}$/u.test(container) ||
    process.env['TAU_E2E_POSTGRES_DATABASE'] !== 'desktop_e2e' ||
    process.env['TAU_E2E_POSTGRES_USER'] !== 'desktop_e2e'
  ) {
    throw new Error('Completed-artifact billing requires the verified disposable development database.');
  }
  const url = new URL(databaseUrl);
  if (
    url.protocol !== 'postgresql:' ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    url.port === '5432' ||
    url.username !== 'desktop_e2e' ||
    url.pathname !== '/desktop_e2e' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error('Completed-artifact billing database must be the owned loopback PostgreSQL instance.');
  }
  const { stdout: publishedPort } = await execFileAsync('docker', ['port', container, '5432/tcp'], {
    encoding: 'utf8',
  });
  if (publishedPort.trim() !== url.host) {
    throw new Error('Completed-artifact billing URL does not match the owned container port.');
  }
  const statement = "select current_setting('cluster_name') || '|' || current_database() || '|' || current_user";
  const { stdout } = await execFileAsync(
    'docker',
    ['exec', container, 'psql', '-U', 'desktop_e2e', '-d', 'desktop_e2e', '-At', '-c', statement],
    { encoding: 'utf8' },
  );
  if (stdout.trim() !== `${project}|desktop_e2e|desktop_e2e`) {
    throw new Error('Completed-artifact billing database ownership changed before the write.');
  }
  return databaseUrl;
};

const runTauBillingAccount = async (action: 'fund' | 'close', email: string, environment: string): Promise<void> => {
  const ownedDatabaseUrl = desktopE2ECompletedArtifact
    ? await completedArtifactBillingDatabase(environment)
    : undefined;
  const arguments_ = tauBillingAccountArgs(action, email);
  await execFileAsync(process.execPath, ownedDatabaseUrl ? arguments_.slice(1) : arguments_, {
    cwd: workspaceRoot,
    encoding: 'utf8',
    /* eslint-disable @typescript-eslint/naming-convention -- process environment contract */
    env: ownedDatabaseUrl
      ? {
          PATH: process.env['PATH'],
          HOME: process.env['HOME'],
          DATABASE_URL: ownedDatabaseUrl,
          BILLING_DATABASE_URL: ownedDatabaseUrl,
          BILLING_ENVIRONMENT: environment,
          NODE_ENV: 'development',
        }
      : { ...process.env, BILLING_ENVIRONMENT: environment },
    /* eslint-enable @typescript-eslint/naming-convention -- process environment contract */
  });
};

/** Credentials for one throwaway account. */
export type TauTestAccount = {
  readonly email: string;
  readonly name: string;
  readonly password: string;
};

const assertTauTestEmail = (email: string): void => {
  if (!/^tau-desktop-[a-z0-9-]+@example\.test$/u.test(email)) {
    throw new Error('Desktop E2E test-account email is outside the tau-desktop-*@example.test namespace.');
  }
};

/** Build the bounded Docker exec command for this run's verified Postgres identity. */
export const tauDatabaseExecArgs = (
  statement: string,
  environment: NodeJS.ProcessEnv = process.env,
): readonly string[] => {
  const completedArtifact = environment['TAU_E2E_COMPLETED_ARTIFACT'] === 'true';
  const completedIdentity = [
    environment['TAU_E2E_POSTGRES_CONTAINER'],
    environment['TAU_E2E_POSTGRES_USER'],
    environment['TAU_E2E_POSTGRES_DATABASE'],
  ];
  if (completedArtifact && completedIdentity.some((value) => !value)) {
    throw new Error('Completed-artifact E2E requires every run-owned database identity.');
  }
  const container = environment['TAU_E2E_POSTGRES_CONTAINER'] ?? 'tau-postgres';
  const user = environment['TAU_E2E_POSTGRES_USER'] ?? 'dev_user';
  const database = environment['TAU_E2E_POSTGRES_DATABASE'] ?? localDatabaseName();
  if (![container, user, database].every((value) => /^[a-zA-Z0-9_.-]+$/u.test(value))) {
    throw new Error('Desktop E2E database identity contains unsupported characters.');
  }
  return ['exec', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', user, '-d', database, '-c', statement];
};

const executeTauDatabase = async (statement: string): Promise<void> => {
  await execFileAsync('docker', tauDatabaseExecArgs(statement), { encoding: 'utf8' });
};

/**
 * Post to a better-auth email route, waiting out its per-route limit.
 *
 * Its default rule for `/sign-in/email` and `/sign-up/email` is three attempts
 * per ten seconds per address, and the suite's specs seed back to back from one
 * address, so a spec that starts within ten seconds of the previous one is
 * refused with 429. The limit is a production protection the suite must not
 * weaken; waiting the window out is the honest alternative.
 *
 * @param route - `sign-in` or `sign-up`.
 * @param headers - The seeding request headers.
 * @param body - The JSON request body.
 * @returns The final response, refused or not.
 */
const postAuthWithBackoff = async (
  route: 'sign-in' | 'sign-up',
  headers: Record<string, string>,
  body: string,
): Promise<Response> => {
  const url = `${desktopE2EApiUrl}/v1/auth/${route}/email`;
  let response = await fetch(url, { method: 'POST', headers, body });
  // oxlint-disable-next-line eslint/no-await-in-loop -- sequential by design: each retry waits out the window the previous refusal named
  for (let attempt = 0; response.status === 429 && attempt < 3; attempt += 1) {
    const retryAfter = Number(response.headers.get('retry-after'));
    // oxlint-disable-next-line eslint/no-await-in-loop -- see above
    await new Promise((_resolve) => {
      setTimeout(_resolve, (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 10) * 1000);
    });
    // oxlint-disable-next-line eslint/no-await-in-loop -- see above
    response = await fetch(url, { method: 'POST', headers, body });
  }
  return response;
};

/** A fresh, uniquely named account for one test. */
export const tauTestAccount = (label: string): TauTestAccount => {
  const suffix = randomUUID();
  return {
    email: `tau-desktop-${label}-${suffix}@example.test`,
    name: 'Tau Desktop Smoke',
    password: `Tau-${suffix}-pass`,
  };
};

/**
 * Seed a verified, credited account and return its bearer token.
 *
 * @param account - The credentials to create.
 * @returns The bearer the desktop shell is handed through `TAU_DESKTOP_TOKEN`.
 */
export const seedTauTestUser = async (account: TauTestAccount): Promise<string> => {
  assertTauTestEmail(account.email);
  /* The API's better-auth `trustedOrigins` is exactly `TAU_FRONTEND_URL`, and
   * these are node-side calls where CORS does not apply — so seed from the web
   * frontend origin, not the shell's `app://tau`. */
  const headers = { 'content-type': 'application/json', origin: desktopE2EFrontendUrl };

  const signUp = await postAuthWithBackoff('sign-up', headers, JSON.stringify(account));
  if (!signUp.ok) {
    throw new Error(`Tau test-account sign-up failed with HTTP ${String(signUp.status)}: ${await signUp.text()}`);
  }

  await executeTauDatabase(`UPDATE "user" SET email_verified = true WHERE email = '${account.email}';`);

  const signIn = await postAuthWithBackoff(
    'sign-in',
    headers,
    JSON.stringify({ email: account.email, password: account.password }),
  );
  if (!signIn.ok) {
    throw new Error(`Tau test-account sign-in failed with HTTP ${String(signIn.status)}: ${await signIn.text()}`);
  }
  /* Better Auth's `bearer()` plugin sets `set-auth-token`; the same session
   * token is in the JSON body, and the plugin accepts that unsigned form
   * because it re-signs before verifying. Either is a usable bearer. */
  const token = signIn.headers.get('set-auth-token') ?? ((await signIn.json()) as { readonly token?: string }).token;
  if (!token) {
    throw new Error('Tau test-account sign-in returned no session token.');
  }
  const environment = await tauBillingEnvironment(token);
  if (environment === 'development') {
    await runTauBillingAccount('fund', account.email, environment);
  }
  return token;
};

/** Remove a seeded account so a second run starts from the same state. */
export const deleteTauTestUser = async (email: string): Promise<void> => {
  assertTauTestEmail(email);
  const statement = `DELETE FROM "user" WHERE email = '${email}';`;
  try {
    await executeTauDatabase(statement);
  } catch (error) {
    /* `billing.require_financial_closure` rejects the delete while a funded owner
     * binding is retained. Only then is the production closure owed, so an
     * unfunded run never needs the API's database URL to tear itself down. */
    if (!String(error).includes('financial closure must precede auth deletion')) {
      throw error;
    }
    /* Only the development bootstrap installs the closure trigger, so a refused delete implies development. */
    await runTauBillingAccount('close', email, 'development');
    await executeTauDatabase(statement);
  }
};

/**
 * Read the seeded account's net credit balance, in credit atoms.
 *
 * The only spend evidence that survives a run: the account is closed and deleted at
 * teardown. Sampled either side of a live turn this is the exact cost of that turn.
 * An unavailable snapshot (`balance: null`) reports zero rather than a partial cost.
 *
 * @param token - The account's bearer.
 * @returns `netBalanceCreditAtoms` from `/v1/billing/credits`.
 */
export const tauCreditBalanceAtoms = async (token: string): Promise<number> => {
  const response = await fetch(`${desktopE2EApiUrl}/v1/billing/credits`, {
    headers: { authorization: `Bearer ${token}`, origin: desktopE2EFrontendUrl },
  });
  if (!response.ok) {
    throw new Error(`Reading Tau credits failed with HTTP ${String(response.status)}.`);
  }
  const credits = (await response.json()) as {
    // oxlint-disable-next-line typescript/no-restricted-types -- the wire sends null for an unavailable snapshot
    readonly balance: { readonly netBalanceCreditAtoms: string } | null;
  };
  return Number(credits.balance?.netBalanceCreditAtoms ?? 0);
};
