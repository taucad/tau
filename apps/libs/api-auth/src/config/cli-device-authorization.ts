import type { BetterAuthPlugin } from 'better-auth';
import { deviceAuthorization } from 'better-auth/plugins';
import { APIError, createAuthEndpoint, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { z } from 'zod';

/** The pending-state predicate makes approval and denial mutually exclusive across tabs. */
const decisionEndpoint = (decision: 'approve' | 'deny') =>
  createAuthEndpoint(
    `/device/${decision}`,
    {
      method: 'POST',
      requireHeaders: true,
      body: z.object({ userCode: z.string().min(4).max(32) }),
    },
    async (context) => {
      const session = await getSessionFromCtx(context);
      if (!session) {
        throw new APIError('UNAUTHORIZED', { message: 'Sign in before reviewing a CLI request.' });
      }
      const changed = await context.context.adapter.incrementOne({
        model: 'deviceCode',
        where: [
          { field: 'userCode', value: context.body.userCode.replaceAll(/[^a-zA-Z0-9]/gu, '').toUpperCase() },
          { field: 'userId', value: session.user.id },
          { field: 'clientId', value: 'tau-cli' },
          { field: 'status', value: 'pending' },
          { field: 'expiresAt', operator: 'gt', value: new Date() },
        ],
        increment: {},
        set: { status: decision === 'approve' ? 'approved' : 'denied' },
      });
      if (!changed) {
        throw new APIError('FORBIDDEN', {
          message: 'This request is expired, already processed, or belongs to another account.',
        });
      }
      return context.json({ success: true });
    },
  );

/** Creates independent first-party CLI sessions after explicit browser approval. */
export const cliDeviceAuthorization = (frontendUrl: string): BetterAuthPlugin => {
  const plugin = deviceAuthorization({
    verificationUri: new URL('/auth/cli', frontendUrl).href,
    expiresIn: '10m',
    interval: '5s',
    validateClient: (clientId) => clientId === 'tau-cli',
    onDeviceAuthRequest(_clientId, scope) {
      if (scope) {
        throw new APIError('BAD_REQUEST', { message: 'Tau CLI uses account sessions, not OAuth scopes.' });
      }
    },
  });
  return {
    ...plugin,
    endpoints: {
      ...plugin.endpoints,
      deviceApprove: decisionEndpoint('approve'),
      deviceDeny: decisionEndpoint('deny'),
    },
    rateLimit: [...plugin.rateLimit, { pathMatcher: (path) => path === '/device/code', window: 60, max: 5 }],
    hooks: {
      before: [
        {
          matcher: (context) => context.path === '/device/code',
          handler: createAuthMiddleware(async (context) => {
            // Bounded, indexed collection on issuance prevents abandoned requests accumulating indefinitely.
            const expired = await context.context.adapter.findMany<{ id: string }>({
              model: 'deviceCode',
              where: [{ field: 'expiresAt', operator: 'lt', value: new Date() }],
              sortBy: { field: 'expiresAt', direction: 'asc' },
              limit: 100,
            });
            if (expired.length > 0) {
              await context.context.adapter.deleteMany({
                model: 'deviceCode',
                where: [{ field: 'id', operator: 'in', value: expired.map((row) => row.id) }],
              });
            }
          }),
        },
      ],
    },
  };
};
