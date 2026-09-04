import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { desktopE2EApiUrl, desktopE2EFrontendUrl } from '#support/config.js';

/**
 * Test-account seeding (work item Z2, auth blueprint A7).
 *
 * A node-side port of `apps/ui-e2e`'s `uiAuthenticateTauTestUser`: sign up,
 * verify the email and grant credits straight through the docker postgres, then
 * sign in and keep the **bearer** token better-auth returns in `set-auth-token`.
 * The desktop shell takes that token through `TAU_DESKTOP_TOKEN`, which is the
 * seeded alternative to the interactive loopback flow (charter A7).
 */

const execFileAsync = promisify(execFile);

/** Credentials for one throwaway account. */
export type TauTestAccount = {
  readonly email: string;
  readonly name: string;
  readonly password: string;
};

const assertTauTestEmail = (email: string): void => {
  if (!/^[a-z0-9._@-]+$/u.test(email)) {
    throw new Error('Desktop E2E test-account email contains unsupported characters.');
  }
};

const executeTauDatabase = async (statement: string): Promise<void> => {
  await execFileAsync(
    'docker',
    ['exec', 'tau-postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'dev_user', '-d', 'tau_dev', '-c', statement],
    { encoding: 'utf8' },
  );
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

  const signUp = await fetch(`${desktopE2EApiUrl}/v1/auth/sign-up/email`, {
    method: 'POST',
    headers,
    body: JSON.stringify(account),
  });
  if (!signUp.ok) {
    throw new Error(`Tau test-account sign-up failed with HTTP ${String(signUp.status)}: ${await signUp.text()}`);
  }

  await executeTauDatabase(`
    WITH target_user AS (
      UPDATE "user"
      SET email_verified = true
      WHERE email = '${account.email}'
      RETURNING id
    ), inserted_account AS (
      INSERT INTO credit_account (user_id, topup_balance_micro)
      SELECT id, 5000000 FROM target_user
      ON CONFLICT (user_id) DO NOTHING
      RETURNING user_id
    )
    INSERT INTO credit_transaction (id, user_id, delta_micro, balance_after_micro, reason)
    SELECT 'ctx_e2e_' || user_id, user_id, 5000000, 5000000, 'topup'
    FROM inserted_account;
  `);

  const signIn = await fetch(`${desktopE2EApiUrl}/v1/auth/sign-in/email`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
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
  return token;
};

/** Remove a seeded account so a second run starts from the same state. */
export const deleteTauTestUser = async (email: string): Promise<void> => {
  assertTauTestEmail(email);
  await executeTauDatabase(`DELETE FROM "user" WHERE email = '${email}';`);
};

/**
 * Read the seeded account's credit balance, in micro-dollars.
 *
 * The only spend evidence that survives a run: the account is deleted at
 * teardown, so the ledger rows go with it. Sampled either side of a live turn
 * this is the exact cost of that turn.
 *
 * @param token - The account's bearer.
 * @returns The balance in micro-dollars.
 */
export const tauCreditBalanceMicro = async (token: string): Promise<number> => {
  const response = await fetch(`${desktopE2EApiUrl}/v1/billing/credits`, {
    headers: { authorization: `Bearer ${token}`, origin: desktopE2EFrontendUrl },
  });
  if (!response.ok) {
    throw new Error(`Reading Tau credits failed with HTTP ${String(response.status)}.`);
  }
  const credits = (await response.json()) as { readonly balanceMicro?: string };
  return Number(credits.balanceMicro ?? 0);
};
