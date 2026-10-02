import { useMemo } from 'react';
import { useLocation } from 'react-router';

type AuthLinks = {
  signIn: string;
  magicLink: string;
  signUp: string;
  signOut: string;
};

/**
 * Hook to generate auth links with proper redirectTo query parameters.
 * Ensures users are redirected back to their original page after authentication.
 *
 * @returns Object containing sign-in, sign-up, and sign-out URLs with redirectTo params
 *
 * @example
 * ```tsx
 * const { signIn, signUp, signOut } = useAuthLinks();
 * return <NavLink to={signIn}>Sign In</NavLink>;
 * ```
 */
export function useAuthLinks(): AuthLinks {
  const { pathname, search } = useLocation();

  return useMemo(() => {
    const redirectTo = encodeURIComponent(pathname + search);

    return {
      signIn: `/auth/sign-in?redirectTo=${redirectTo}`,
      magicLink: `/auth/magic-link?redirectTo=${redirectTo}`,
      signUp: `/auth/sign-up?redirectTo=${redirectTo}`,
      signOut: `/auth/sign-out?redirectTo=${redirectTo}`,
    };
  }, [pathname, search]);
}
