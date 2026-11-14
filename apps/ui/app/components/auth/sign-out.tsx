import { useAuth, useSignOut } from '@better-auth-ui/react';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { Spinner } from '@taucad/ui-kit/components/spinner';
import { cn } from '@taucad/ui/utils/cn';
import { useCloudFinancialPurge } from '#cloud/financial-purge.js';
import { setEntryPreference } from '@taucad/ui-core/lib/entry-preference';
import { isDesktopTarget } from '#lib/build-target.js';
import { projectListShapeStore } from '#lib/project-list-shape.lib.js';
import { authErrorMessage } from '@taucad/ui-core/utils/auth-error.utils';

export type SignOutProps = {
  className?: string;
};

/**
 * Signs the current user out on mount and renders a centered spinner while the operation completes.
 *
 * @param className - Optional additional class names appended to the root element
 * @returns The spinner shown during sign-out
 */
export function SignOut({ className }: SignOutProps): React.JSX.Element {
  const { authClient, basePaths, localization, navigate, viewPaths } = useAuth();
  const purgeFinancial = useCloudFinancialPurge();

  const { mutate: signOut } = useSignOut(authClient, {
    onError: (error) => {
      toast.error(authErrorMessage(error));

      navigate({
        to: `${basePaths.auth}/${viewPaths.auth.signIn}`,
        replace: true,
      });
    },
    onSuccess: () => {
      /* A13: the listing snapshot's names are cleared, so a shared device draws none of them before its next listing. */
      projectListShapeStore.clear();
      if (!isDesktopTarget()) {
        const prefersWebsite = setEntryPreference('website');
        globalThis.location.replace(prefersWebsite ? '/' : '/?website=1');
        return;
      }
      navigate({
        to: `${basePaths.auth}/${viewPaths.auth.signIn}`,
        replace: true,
      });
    },
  });

  const hasSignedOut = useRef(false);

  useEffect(() => {
    if (hasSignedOut.current) {
      return;
    }
    hasSignedOut.current = true;

    purgeFinancial?.('logout');
    signOut();
  }, [purgeFinancial, signOut]);

  return (
    <>
      {/* The page's one heading: the spinner is all a person sees while the session ends. */}
      <h1 className='sr-only'>{localization.auth.signOut}</h1>
      <Spinner className={cn('mx-auto my-auto', className)} />
    </>
  );
}
