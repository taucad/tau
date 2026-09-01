import { authMutationKeys } from '@better-auth-ui/core';
import type { AuthView } from '@better-auth-ui/core';
import { useAuth, useAuthPlugin } from '@better-auth-ui/react';
import { useIsMutating } from '@tanstack/react-query';
import { Lock, Mail } from 'lucide-react';

import { Button } from '#components/ui/button.js';
import { magicLinkPlugin } from '#utils/magic-link-plugin.js';
import { cn } from '#utils/ui.utils.js';

export type MagicLinkButtonProps = {
  /** @remarks `AuthView` */
  view?: AuthView;
};

/**
 * Toggle button between the password sign-in and magic-link routes.
 *
 * @param view - Current auth view. On `"magicLink"` this links back to password sign-in.
 */
export function MagicLinkButton({ view }: MagicLinkButtonProps) {
  const { basePaths, emailAndPassword, viewPaths, localization, Link } = useAuth();

  const signInMutating = useIsMutating({
    mutationKey: authMutationKeys.signIn.all,
  });
  const signUpMutating = useIsMutating({
    mutationKey: authMutationKeys.signUp.all,
  });
  const isPending = signInMutating + signUpMutating > 0;

  const { localization: magicLinkLocalization, viewPaths: magicLinkViewPaths } = useAuthPlugin(magicLinkPlugin);

  const isMagicLinkView = view === 'magicLink';

  // On the magic-link view this button switches back to password sign-in.
  // With password auth disabled there's nowhere to switch to, so hide it.
  // (Other views — e.g. a phone-number plugin's surface — still get a
  // "Continue with Magic Link" link.)
  if (isMagicLinkView && !emailAndPassword?.enabled) {
    return null;
  }

  return (
    <Button
      type='button'
      variant='outline'
      disabled={isPending}
      className={cn('w-full', isPending && 'opacity-50 pointer-events-none')}
      asChild
    >
      <Link href={`${basePaths.auth}/${isMagicLinkView ? viewPaths.auth.signIn : magicLinkViewPaths.auth.magicLink}`}>
        {isMagicLinkView ? <Lock /> : <Mail />}

        {localization.auth.continueWith.replace(
          '{{provider}}',
          isMagicLinkView ? localization.auth.password : magicLinkLocalization.magicLink,
        )}
      </Link>
    </Button>
  );
}
