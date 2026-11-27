import { useIdentity } from '#hooks/use-identity.js';

export type ResolvedAuth = 'authed' | 'anonymous' | 'indeterminate';

/**
 * Preserve the distinction between a confirmed signed-out answer and a
 * session that cannot currently be determined, read from the one identity
 * owner (W9 R1). The latter, an unverified identity included, is the
 * local-first homepage fallback; it is not an authorization grant, and it
 * never purges (D17).
 */
export function useResolvedAuth(): ResolvedAuth {
  const { state } = useIdentity();
  if (state === 'verified') {
    return 'authed';
  }
  return state === 'signed-out' ? 'anonymous' : 'indeterminate';
}
