import { randomBytes } from 'node:crypto';
import process from 'node:process';
import { z } from 'zod';
import { wireAutoReloadConsentSchema, wirePaymentActionSchema } from '@taucad/billing';
import { baseUrl, createApi, ok } from '#support/api.js';
import type { Api } from '#support/api.js';
import { createMailbox, deleteMailbox, waitForMail } from '#support/mailbox.js';
import type { Mailbox } from '#support/mailbox.js';
import { recordOrphan, runId } from '#support/results.js';

/** A throwaway staging account; nothing here ever reaches a real person's account. */
export type Account = {
  readonly caseId: string;
  readonly email: string;
  readonly password: string;
  readonly userId: string;
  readonly mailbox: Mailbox;
  readonly api: Api;
};

export const hasSession = (account: Account): boolean =>
  [...account.api.jar.keys()].some((name) => name.endsWith('session_token'));

/**
 * The first app link with `path` (`/auth/verify-email`, `/auth/magic-link/verify`) and a token in a mail's text or
 * HTML, with HTML entity ampersands undone.
 *
 * @param bodies - The mail's text and HTML parts.
 * @param path - The app path the link opens.
 * @returns The link, or undefined when the mail carries none.
 */
export const findMailLink = (bodies: readonly string[], path: string): URL | undefined => {
  const escaped = path.replaceAll(/[.*+?^${}()|[\]\\/]/gu, String.raw`\$&`);
  const match = new RegExp(String.raw`https?://[^\s"'<>]+${escaped}\?[^\s"'<>]*token=[^\s"'<>]+`, 'u').exec(
    bodies.join('\n'),
  )?.[0];
  return match === undefined ? undefined : new URL(match.replaceAll('&amp;', '&'));
};

type LinkMail = { readonly id: string; readonly from: string; readonly link: URL };

const linkMail = async (
  account: Account,
  input: { readonly subject: string; readonly path: string; readonly seen: ReadonlySet<string> },
): Promise<LinkMail> => {
  const mail = await waitForMail(
    account.mailbox,
    ({ id, subject }) => !input.seen.has(id) && subject.includes(input.subject),
  );
  const link = findMailLink([mail.text, ...mail.html], input.path);
  if (link === undefined) {
    throw new Error(`The "${input.subject}" mail to ${account.email} carries no ${input.path} link`);
  }
  return { id: mail.id, from: mail.from.address, link };
};

/** The newest unseen "Confirm your email" mail and the link in it (`/auth/verify-email?token=…&redirectTo=/`). */
export const verificationMail = async (account: Account, seen: ReadonlySet<string> = new Set()): Promise<LinkMail> =>
  linkMail(account, { subject: 'Confirm your email', path: '/auth/verify-email', seen });

/** The newest unseen "Your sign-in link for Tau" mail and its `/auth/magic-link/verify?token=…` link. */
export const magicLinkMail = async (account: Account, seen: ReadonlySet<string> = new Set()): Promise<LinkMail> =>
  linkMail(account, { subject: 'Your sign-in link for Tau', path: '/auth/magic-link/verify', seen });

/** Verifies as the emailed link does through the API: `GET /v1/auth/verify-email` answers 302 with the session. */
export const verifyAccount = async (account: Account): Promise<void> => {
  const { link } = await verificationMail(account);
  const query = new URLSearchParams({ token: link.searchParams.get('token') ?? '', callbackURL: `${baseUrl}/` });
  const response = await account.api.request('GET', `/v1/auth/verify-email?${query.toString()}`);
  if (response.status !== 302 || !hasSession(account)) {
    throw new Error(`Verifying ${account.email} answered ${response.status} without a session`);
  }
};

/**
 * Signs the account in with its password, as the sign-in form does; true when a session came back. An unverified
 * account is refused (and sent another verification mail).
 */
export const signIn = async (account: Account): Promise<boolean> => {
  const response = await account.api.request('POST', '/v1/auth/sign-in/email', {
    body: { email: account.email, password: account.password },
  });
  return response.status === 200 && hasSession(account);
};

/**
 * Makes sure the account's client holds a live session: the one it has, a password sign-in (a row may have signed the
 * browser out, which revokes the session the client shares), or the emailed verification link for an account that
 * never verified.
 */
const ensureSession = async (account: Account): Promise<void> => {
  if (hasSession(account)) {
    const current = await account.api.request('GET', '/v1/auth/get-session');
    if (current.status === 200 && current.body !== null) {
      return;
    }
  }
  if (!(await signIn(account))) {
    await verifyAccount(account);
  }
};

/**
 * Deletes the Tau user when a session can. Without one (an unverified sign-up cannot sign in) the user stays, so
 * the run names it for an operator to sweep and keeps its inbox; nothing here may mask the row's own failure.
 */
const discardAccount = async (account: Account, problem?: string): Promise<void> => {
  const deleted = hasSession(account)
    ? await account.api.request('POST', '/v1/auth/delete-user', { body: {} }).catch(() => undefined)
    : undefined;
  if (deleted?.status === 200) {
    await deleteMailbox(account.mailbox).catch(() => undefined);
    return;
  }
  const reason = [
    problem,
    hasSession(account)
      ? `delete-user answered ${deleted?.status ?? 'nothing'}${
          deleted?.requestId === undefined ? '' : ` (${deleted.requestId})`
        }`
      : 'no session to delete with',
  ]
    .filter((part): part is string => part !== undefined)
    .join('; ');
  await recordOrphan({ caseId: account.caseId, email: account.email, userId: account.userId, reason }).catch(
    () => undefined,
  );
};

/**
 * Signs up `tau-e2e-<runId>-<caseId>-<nonce>@<mail.tm domain>`; verified (signed in) unless asked otherwise. The
 * nonce keeps a re-run with the same BILLING_E2E_RUN_ID off an address mail.tm already knows.
 */
export const createAccount = async (
  caseId: string,
  options: { readonly verified?: boolean } = {},
): Promise<Account> => {
  const mailbox = await createMailbox(`tau-e2e-${runId}-${caseId}-${randomBytes(2).toString('hex')}`);
  // ponytail: throwaway password, never written to evidence.
  const password = `${randomBytes(18).toString('base64url')}-Aa1`;
  const api = createApi();
  let userId: string;
  try {
    userId = ok(
      await api.request('POST', '/v1/auth/sign-up/email', {
        body: { name: `Tau E2E ${caseId}`, email: mailbox.address, password, callbackURL: `${baseUrl}/` },
      }),
      z.object({ user: z.object({ id: z.string() }) }),
    ).user.id;
  } catch (error) {
    // No Tau user was made, so nothing needs the inbox.
    await deleteMailbox(mailbox).catch(() => undefined);
    throw error;
  }
  const account = { caseId, email: mailbox.address, password, userId, mailbox, api };
  if (options.verified !== false) {
    try {
      await verifyAccount(account);
    } catch (error) {
      // A half-made account must not outlive its row; callers only register teardown once this resolves.
      await discardAccount(account);
      throw error;
    }
  }
  return account;
};

/** Open action states the cleanup asks the API to cancel. */
const cancelableStates: ReadonlySet<string> = new Set(['prepared', 'redirect_required', 'attention_required']);

/**
 * Cancels the account's open payment actions, revokes automatic reload and deletes the account, unless KEEP_ACCOUNTS=1
 * keeps it for inspection. It never rejects: it runs from afterAll hooks and a row's finally, where a throw would
 * overrule verdicts already recorded; whatever it could not delete is named in the run's orphan ledger instead.
 */
export const closeAccount = async (account: Account): Promise<void> => {
  if (process.env['KEEP_ACCOUNTS'] === '1') {
    return;
  }
  let problem: string | undefined;
  try {
    await ensureSession(account);
    const actions = ok(
      await account.api.request('GET', '/v1/billing/payment-actions'),
      z.array(wirePaymentActionSchema),
    );
    // An attention_required Checkout can still be open at Stripe (a decline parks it there); cancel expires the session
    // first and refuses (409) a paid one, so trying it on every unpaid-looking action is safe.
    const open = actions.filter(({ state }) => cancelableStates.has(state));
    const cancels = await Promise.all(
      open.map(async ({ actionId }) => {
        const response = await account.api.request('POST', `/v1/billing/payment-actions/${actionId}/cancel`);
        return `cancel ${actionId} answered ${response.status}`;
      }),
    );
    // Automatic reload is revoked before the account goes, so nothing can charge the saved card afterwards.
    const consent = ok(
      await account.api.request('GET', '/v1/billing/reload-consent'),
      wireAutoReloadConsentSchema.nullable(),
    );
    const revokes =
      consent === null || consent.state === 'revoked'
        ? []
        : [
            await account.api
              .request('POST', `/v1/billing/reload-consent/${consent.consentId}/revoke`)
              .then((response) => `revoke ${consent.consentId} answered ${response.status}`),
          ];
    const refused = [...cancels, ...revokes].filter((line) => !line.endsWith(' 200'));
    problem = refused.length === 0 ? undefined : refused.join('; ');
  } catch (error) {
    // No session or no cancel: the deletion below still tries, and the ledger says what stopped the cleanup.
    problem = error instanceof Error ? error.message : String(error);
  }
  await discardAccount(account, problem);
};
