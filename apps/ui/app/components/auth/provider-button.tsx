'use client';

import type React from 'react';
import { authMutationKeys } from '@better-auth-ui/core';
import { useAuth, useSignInSocial } from '@better-auth-ui/react';
import { useIsMutating } from '@tanstack/react-query';
import type { ComponentProps } from 'react';

import { Button } from '@taucad/ui/components/button';
import { Spinner } from '#components/ui/spinner.js';
import { getSocialProviderDisplay } from '#components/auth/social-providers.js';

export type ProviderButtonProps = {
  /** Better Auth provider id, built-in or registered by the API (such as `chatgpt`). */
  provider: string;
  activeProvider?: string;
  onActiveProviderChange: (provider?: string) => void;
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

  const { name: providerName, Icon: ProviderIcon } = getSocialProviderDisplay(provider);

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
      aria-label={providerName}
      aria-busy={isActiveProvider}
    >
      {isActiveProvider ? <Spinner /> : ProviderIcon ? <ProviderIcon /> : null}

      {display === 'full'
        ? localization.auth.continueWith.replace('{{provider}}', providerName)
        : display === 'name'
          ? providerName
          : null}
    </Button>
  );
}
