import { useSession } from '@better-auth-ui/react';
import { authClient } from '#lib/auth-client.js';

export type ResolvedAuth = 'authed' | 'anonymous' | 'indeterminate';

/**
 * Preserve the distinction between a confirmed signed-out response and a
 * session that cannot currently be determined. The latter is the local-first
 * homepage fallback; it is not an authorization grant.
 */
export function useResolvedAuth(): ResolvedAuth {
  const { data: session, isSuccess } = useSession(authClient);

  if (session) {
    return 'authed';
  }

  return isSuccess ? 'anonymous' : 'indeterminate';
}
