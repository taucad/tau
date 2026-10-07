import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';

const mailTm = 'https://api.mail.tm';

export type Mailbox = { readonly id: string; readonly address: string; readonly token: string };

const summarySchema = z.object({
  id: z.string(),
  subject: z.string(),
  from: z.object({ address: z.string() }),
  createdAt: z.string(),
});
const mailSchema = summarySchema.extend({ text: z.string().default(''), html: z.array(z.string()).default([]) });
export type MailSummary = z.infer<typeof summarySchema>;
export type Mail = z.infer<typeof mailSchema>;

type CallOptions = { readonly method?: string; readonly token?: string; readonly body?: unknown };

/** One mail.tm call; its 429 (about 8 requests a second per IP) backs off 1, 2, 4, 8 and 16 s. */
const call = async (path: string, options: CallOptions = {}, attempt = 0): Promise<unknown> => {
  const response = await fetch(`${mailTm}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      accept: 'application/json',
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(options.token === undefined ? {} : { authorization: `Bearer ${options.token}` }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (response.status === 429 && attempt < 5) {
    await delay(1000 * 2 ** attempt);
    return call(path, options, attempt + 1);
  }
  if (!response.ok) {
    throw new Error(`mail.tm ${options.method ?? 'GET'} ${path} answered ${response.status}`);
  }
  if (response.status === 204) {
    return undefined;
  }
  return (await response.json()) as unknown;
};

/** A fresh mail.tm inbox on its active domain; the throwaway password never leaves this function. */
export const createMailbox = async (localPart: string): Promise<Mailbox> => {
  const domains = z.array(z.object({ domain: z.string(), isActive: z.boolean() })).parse(await call('/domains'));
  const domain = domains.find(({ isActive }) => isActive)?.domain;
  if (domain === undefined) {
    throw new Error('mail.tm offers no active domain');
  }
  const address = `${localPart}@${domain}`;
  const password = randomBytes(18).toString('base64url');
  const { id } = z
    .object({ id: z.string() })
    .parse(await call('/accounts', { method: 'POST', body: { address, password } }));
  const { token } = z
    .object({ token: z.string() })
    .parse(await call('/token', { method: 'POST', body: { address, password } }));
  return { id, address, token };
};

/** Deletes the inbox; mail.tm expires unused ones, but a nightly cadence should not lean on that. */
export const deleteMailbox = async (mailbox: Mailbox): Promise<void> => {
  await call(`/accounts/${mailbox.id}`, { method: 'DELETE', token: mailbox.token });
};

/** The inbox, newest first. */
export const listMail = async (mailbox: Mailbox): Promise<MailSummary[]> =>
  z.array(summarySchema).parse(await call('/messages', { token: mailbox.token }));

/** Polls every 2 s for up to 90 s and returns the newest mail the predicate accepts. */
export const waitForMail = async (mailbox: Mailbox, predicate: (mail: MailSummary) => boolean): Promise<Mail> => {
  const deadline = Date.now() + 90_000;
  const poll = async (): Promise<Mail> => {
    const inbox = await listMail(mailbox);
    const match = inbox.find((mail) => predicate(mail));
    if (match !== undefined) {
      return mailSchema.parse(await call(`/messages/${match.id}`, { token: mailbox.token }));
    }
    if (Date.now() > deadline) {
      throw new Error(`No matching mail reached ${mailbox.address} within 90 s`);
    }
    await delay(2000);
    return poll();
  };
  return poll();
};
