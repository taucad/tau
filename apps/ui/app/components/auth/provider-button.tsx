'use client';

import type React from 'react';
import { authMutationKeys, getProviderName } from '@better-auth-ui/core';
import { providerIcons, useAuth, useSignInSocial } from '@better-auth-ui/react';
import { useIsMutating } from '@tanstack/react-query';
import type { SocialProvider } from 'better-auth/social-providers';
import type { ComponentProps } from 'react';

import { Button } from '#components/ui/button.js';
import { Spinner } from '#components/ui/spinner.js';

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
export function ProviderButton({
  provider,
  activeProvider,
  onActiveProviderChange,
  display = 'full',
  variant = 'outline',
  ...props
}: ProviderButtonProps): React.JSX.Element {
  const { authClient, baseURL, localization, redirectTo } = useAuth();

  const callbackURL = `${baseURL}${redirectTo}`;

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
        signInSocial({ provider, callbackURL });
      }}
      {...props}
      aria-label={getProviderName(provider)}
      aria-busy={isActiveProvider}
    >
      {isActiveProvider ? <Spinner /> : ProviderIcon ? <ProviderIcon /> : null}

      {display === 'full'
        ? localization.auth.continueWith.replace('{{provider}}', getProviderName(provider))
        : display === 'name'
          ? getProviderName(provider)
          : null}
    </Button>
  );
}
