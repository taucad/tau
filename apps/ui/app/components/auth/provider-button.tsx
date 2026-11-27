'use client';

import { readDesktopAuthorization } from '#lib/desktop-oauth.js';
import type React from 'react';
import { authMutationKeys, getProviderName } from '@better-auth-ui/core';
import { providerIcons, useAuth, useSignInSocial } from '@better-auth-ui/react';
import { useIsMutating } from '@tanstack/react-query';
import type { SocialProvider } from 'better-auth/social-providers';
import type { ComponentProps } from 'react';

import { Button } from '@taucad/ui/components/button';
import { Spinner } from '@taucad/ui-kit/components/spinner';

export type ProviderButtonProps = {
  provider: SocialProvider;
  activeProvider?: SocialProvider;
  onActiveProviderChange: (provider?: SocialProvider) => void;
  display?: 'full' | 'name' | 'icon';
} & Omit<ComponentProps<typeof Button>, 'onClick' | 'children' | 'disabled'>;

/**
 * Social provider sign-in button.
 *
 * @param props - Social provider button rendering and loading-state options.
 */
/**
 * For Tau Desktop's sign-in page (DSI-3): a refused sign-in returns to the same request rather than a bare sign-in
 * page, and after "Use a different account" (`prompt=login`) GitHub and Google show their own account chooser, or they
 * would silently return the account already signed in there.
 *
 * @param baseURL - The web app's origin.
 * @returns The extra social sign-in options, or none outside a desktop request.
 */
const desktopSignInOptions = (
  baseURL: string,
): { errorCallbackURL?: string; additionalParams?: Record<string, string> } => {
  const authorization = readDesktopAuthorization(globalThis.location.search);
  if (authorization === undefined) {
    return {};
  }
  return {
    errorCallbackURL: `${baseURL}${globalThis.location.pathname}${globalThis.location.search}`,
    ...(authorization.prompts.includes('login') ? { additionalParams: { prompt: 'select_account' } } : {}),
  };
};

export function ProviderButton({
  provider,
  activeProvider,
  onActiveProviderChange,
  display = 'full',
  variant = 'outline',
  ...props
}: ProviderButtonProps): React.JSX.Element {
  const { authClient, baseURL, basePaths, localization, redirectTo, viewPaths } = useAuth();

  const callbackURL = `${baseURL}${redirectTo}`;
  // Without it a refused sign-in (an unverified password account with the same email) ended on the API's JSON 404.
  const errorCallbackURL = `${baseURL}${basePaths.auth}/${viewPaths.auth.signIn}`;

  const { mutate: signInSocial } = useSignInSocial(authClient, {
    onError: () => {
      globalThis.setTimeout(() => {
        onActiveProviderChange();
      }, 250);
    },
  });

  const ProviderIcon = providerIcons[provider] as React.ComponentType<React.ComponentPropsWithRef<'svg'>> | undefined;

  const signInMutating = useIsMutating({
    mutationKey: authMutationKeys.signIn.all,
  });
  const signUpMutating = useIsMutating({
    mutationKey: authMutationKeys.signUp.all,
  });
  const isPending = signInMutating + signUpMutating > 0;
  const isActiveProvider = activeProvider === provider;
  const isDisabled = isPending || activeProvider !== undefined;

  return (
    <Button
      type='button'
      variant={variant}
      disabled={isDisabled}
      onClick={() => {
        onActiveProviderChange(provider);
        signInSocial({ provider, callbackURL, errorCallbackURL, ...desktopSignInOptions(baseURL) });
      }}
      {...props}
      // Only the icon-only layout has no visible text; otherwise the visible text is the name (WCAG 2.5.3).
      aria-label={display === 'icon' ? getProviderName(provider) : undefined}
      aria-busy={isActiveProvider}
    >
      {/* The icon is `role=img` named by its provider: hidden, or the name repeats it. */}
      {isActiveProvider ? <Spinner /> : ProviderIcon ? <ProviderIcon aria-hidden /> : null}

      {display === 'full'
        ? localization.auth.continueWith.replace('{{provider}}', getProviderName(provider))
        : display === 'name'
          ? getProviderName(provider)
          : null}
    </Button>
  );
}
