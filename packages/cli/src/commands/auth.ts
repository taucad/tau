import { defineCommand } from 'citty';
import { authApiOrigin, credentialEntry, deviceLogin, inspectSession, resolveAuthToken, revokeSession } from '#auth.js';
import { withAuthLock } from '#auth-lock.js';
import { launch } from '#commands/open.js';
import { cliError, emit, exitCodes, writeStdout } from '#output.js';

const rollbackLogin = async (origin: string, token: string): Promise<void> => {
  try {
    await revokeSession(origin, token);
  } catch {
    throw cliError(
      'AUTH_CLEANUP_REQUIRED',
      'Could not revoke the new CLI session. Open account Security → Active sessions and revoke it there.',
      exitCodes.refused,
    );
  }
};

// Signals can change while asynchronous credential writes settle.
const wasCancelled = (signal: AbortSignal): boolean => signal.aborted;

const args = {
  json: { type: 'boolean', description: 'Write a JSON result without credentials', default: false },
} as const;
const requireSavedLoginMode = (): void => {
  if (process.env['TAU_AUTH_TOKEN']) {
    throw cliError(
      'AUTH_ENV_OVERRIDE',
      'TAU_AUTH_TOKEN overrides saved logins. Unset it before running login or logout.',
      exitCodes.refused,
    );
  }
};

/** Browser-approved account sessions for cloud operations; local CAD needs no login. */
export const authCommand = defineCommand({
  meta: { name: 'auth', description: 'Sign in to Tau Cloud and manage this CLI’s session' },
  subCommands: {
    login: defineCommand({
      meta: { name: 'login', description: 'Approve a separate CLI session in your browser' },
      args: {
        ...args,
        browser: {
          type: 'boolean',
          description: 'Open the browser (use --no-browser to open the printed link yourself)',
          default: true,
        },
      },
      async run({ args }) {
        requireSavedLoginMode();
        const origin = authApiOrigin();
        return withAuthLock(origin, async () => {
          const entry = await credentialEntry(origin);
          const existing = await entry.getPassword();
          if (existing && (await inspectSession(origin, existing))) {
            throw cliError(
              'AUTH_ALREADY_SIGNED_IN',
              'Already signed in to this API. Run tau auth logout before switching accounts.',
              exitCodes.refused,
            );
          }
          const controller = new AbortController();
          const cancel = (): void => {
            controller.abort();
          };
          process.once('SIGINT', cancel);
          process.once('SIGTERM', cancel);
          try {
            const token = await deviceLogin(
              origin,
              async (url, code) => {
                process.stderr.write(`Sign in to ${origin}\nOpen ${url}\nConfirm this code: ${code}\n`);
                if (args.browser) {
                  await launch(url);
                }
              },
              controller.signal,
            );
            if (wasCancelled(controller.signal)) {
              await rollbackLogin(origin, token);
              throw cliError('AUTH_CANCELLED', 'Sign-in cancelled.', exitCodes.refused);
            }
            try {
              await entry.setPassword(token);
            } catch {
              await rollbackLogin(origin, token);
              throw cliError(
                'AUTH_STORE_UNAVAILABLE',
                'Could not save the CLI session. Unlock the OS credential store and try again.',
                exitCodes.refused,
              );
            }
            if (wasCancelled(controller.signal)) {
              await rollbackLogin(origin, token);
              await entry.deleteCredential();
              throw cliError('AUTH_CANCELLED', 'Sign-in cancelled.', exitCodes.refused);
            }
            await (args.json
              ? emit({ kind: 'auth', ok: true, status: 'signed-in', apiUrl: origin })
              : writeStdout(`Signed in to ${origin}.\n`));
          } finally {
            process.removeListener('SIGINT', cancel);
            process.removeListener('SIGTERM', cancel);
          }
        });
      },
    }),
    status: defineCommand({
      meta: { name: 'status', description: 'Check the selected API session without exposing its token' },
      args,
      async run({ args }) {
        const origin = authApiOrigin();
        const token = await resolveAuthToken(origin, process.env, true);
        const session = token ? await inspectSession(origin, token) : undefined;
        const source = process.env['TAU_AUTH_TOKEN'] ? 'environment' : 'credential-store';
        if (!session) {
          throw cliError('AUTH_REQUIRED', `Not signed in to ${origin}. Run tau auth login.`, exitCodes.refused);
        }
        await (args.json
          ? emit({
              kind: 'auth',
              ok: true,
              apiUrl: origin,
              source,
              email: session.user.email,
              expiresAt: session.session.expiresAt,
            })
          : writeStdout(`Signed in as ${session.user.email} to ${origin} (${source}).\n`));
      },
    }),
    logout: defineCommand({
      meta: { name: 'logout', description: 'Revoke and remove this API’s saved CLI session' },
      args,
      async run({ args }) {
        requireSavedLoginMode();
        const origin = authApiOrigin();
        return withAuthLock(origin, async () => {
          const entry = await credentialEntry(origin);
          const token = await entry.getPassword();
          if (token) {
            await revokeSession(origin, token);
          }
          await entry.deleteCredential();
          await (args.json
            ? emit({ kind: 'auth', ok: true, status: 'signed-out', apiUrl: origin })
            : writeStdout(`Signed out of ${origin}.\n`));
        });
      },
    }),
  },
});
