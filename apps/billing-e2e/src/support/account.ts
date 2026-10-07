import { randomBytes } from 'node:crypto';
import process from 'node:process';
import { z } from 'zod';
import { wirePaymentActionSchema } from '@taucad/billing';
import type { WirePaymentAction } from '@taucad/billing';
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

/** The newest unseen "Confirm your email" mail and the link in it (`/auth/verify-email?token=…&redirectTo=/`). */
export const verificationMail = async (
  account: Account,
  seen: ReadonlySet<string> = new Set(),
): Promise<{ readonly id: string; readonly from: string; readonly link: URL }> => {
  const mail = await waitForMail(
    account.mailbox,
    ({ id, subject }) => !seen.has(id) && subject.includes('Confirm your email'),
  );
  const link = /https?:\/\/[^\s"'<>]+\/auth\/verify-email\?token=[^\s"'<>]+/u.exec(
    [mail.text, ...mail.html].join('\n'),
  )?.[0];
  if (link === undefined) {
    throw new Error(`The verification mail to ${account.email} carries no link`);
  }
  return { id: mail.id, from: mail.from.address, link: new URL(link.replaceAll('&amp;', '&')) };
};

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
 * Deletes the Tau user when a session can. Without one (an unverified sign-up cannot sign in) the user stays, so
 * the run names it for an operator to sweep and keeps its inbox; nothing here may mask the row's own failure.
 */
const discardAccount = async (account: Account): Promise<void> => {
  const deleted = hasSession(account)
    ? await account.api.request('POST', '/v1/auth/delete-user', { body: {} }).catch(() => undefined)
    : undefined;
  if (deleted?.status === 200) {
    await deleteMailbox(account.mailbox).catch(() => undefined);
    return;
  }
  await recordOrphan({ caseId: account.caseId, email: account.email, userId: account.userId }).catch(() => undefined);
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

/** Cancels the account's open payment actions and deletes it, unless KEEP_ACCOUNTS=1 keeps it for inspection. */
export const closeAccount = async (account: Account): Promise<void> => {
  if (process.env['KEEP_ACCOUNTS'] === '1') {
    return;
  }
  if (!hasSession(account)) {
    await verifyAccount(account);
  }
  const listed = await account.api.request('GET', '/v1/billing/payment-actions');
  const actions: WirePaymentAction[] = listed.status === 200 ? z.array(wirePaymentActionSchema).parse(listed.body) : [];
  const open = actions.filter(({ state }) => state === 'prepared' || state === 'redirect_required');
  await Promise.all(
    open.map(async ({ actionId }) => account.api.request('POST', `/v1/billing/payment-actions/${actionId}/cancel`)),
  );
  ok(await account.api.request('POST', '/v1/auth/delete-user', { body: {} }), z.object({ success: z.literal(true) }));
  // Inbox housekeeping never overrules a verdict: this runs from afterAll hooks and a row's finally.
  await deleteMailbox(account.mailbox).catch(() => undefined);
};
