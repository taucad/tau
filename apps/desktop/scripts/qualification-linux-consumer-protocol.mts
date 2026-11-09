/**
 * The clean-host consumer agent's Playwright-free boundary: its allowlisted environment, account resolution, serve
 * guard and reply protocol. Kept apart from the agent (which loads the download browser) so the Linux driver tests can
 * bundle and exercise it without Playwright.
 */
/* oxlint-disable no-restricted-imports -- Shares the private qualification error type. */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { z } from 'zod';
import { QualificationUnavailable } from './qualification-platform-types.mjs';
/* oxlint-enable no-restricted-imports */

/** The agent serves only as an ordinary account on a disposable qualification host. */
export const assertConsumerAgentHost = (uid: number | undefined, disposableHost: string | undefined): void => {
  if (uid === undefined || uid === 0 || disposableHost !== '1') {
    throw new Error('The consumer agent runs as an ordinary account on a disposable host');
  }
};
/** The agent's environment: only the consumer's session, display and harness switches, never the job's credentials. */
export const linuxConsumerEnvironment = (account: {
  name: string;
  uid: number;
  home: string;
}): Record<string, string> => ({
  /* eslint-disable @typescript-eslint/naming-convention -- environment variables keep their wire names. */
  HOME: account.home,
  USER: account.name,
  LOGNAME: account.name,
  PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
  LANG: 'C.UTF-8',
  DISPLAY: ':0',
  XAUTHORITY: join(account.home, '.Xauthority'),
  XDG_SESSION_TYPE: 'x11',
  XDG_RUNTIME_DIR: `/run/user/${account.uid}`,
  DBUS_SESSION_BUS_ADDRESS: `unix:path=/run/user/${account.uid}/bus`,
  TAU_QUALIFICATION_DISPOSABLE_HOST: '1',
  // Shared, read-only browser install for the download step (the guest installs it outside every home).
  PLAYWRIGHT_BROWSERS_PATH: '/usr/local/share/ms-playwright',
  /* eslint-enable @typescript-eslint/naming-convention -- End environment variables. */
});
/** Resolve a local account from the system database. */
export const linuxAccount = (name: string): { name: string; uid: number; home: string } => {
  if (!/^[a-z_][a-z\d_-]{0,31}$/u.test(name)) {
    throw new Error('Invalid consumer account name');
  }
  const entry = spawnSync('getent', ['passwd', name], { encoding: 'utf8', timeout: 30_000 });
  const fields = entry.stdout.trim().split(':');
  if (entry.status !== 0 || fields.length < 7 || fields[0] !== name) {
    throw new QualificationUnavailable('Consumer account does not exist');
  }
  return { name, uid: Number(fields[2]), home: fields[5]! };
};
const consumerReplySchema = z.union([
  z.strictObject({ id: z.number().int(), ok: z.literal(true), result: z.unknown() }),
  z.strictObject({ id: z.number().int(), ok: z.literal(false), error: z.string() }),
]);
/**
 * Settle the request one agent reply line answers. A line that is not a well-formed reply (the agent or something it
 * ran wrote to its stdout) fails the whole agent instead of throwing out of the stream's event handler.
 */
export const handleConsumerReply = (
  line: string,
  context: {
    waiting: Map<number, { resolve(value: unknown): void; reject(error: Error): void }>;
    account: string;
    fail(error: Error): void;
  },
): void => {
  let reply: z.infer<typeof consumerReplySchema>;
  try {
    reply = consumerReplySchema.parse(JSON.parse(line));
  } catch (error) {
    context.fail(new Error(`Consumer ${context.account} agent wrote a malformed reply`, { cause: error }));
    return;
  }
  const entry = context.waiting.get(reply.id);
  context.waiting.delete(reply.id);
  if (reply.ok) {
    entry?.resolve(reply.result);
  } else {
    entry?.reject(new Error(`Consumer ${context.account}: ${reply.error}`));
  }
};
