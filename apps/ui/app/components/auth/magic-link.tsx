'use client';

import { authMutationKeys } from '@better-auth-ui/core';
import { useAuth, useAuthPlugin, useSignInMagicLink } from '@better-auth-ui/react';
import type { MagicLinkAuthClient } from '@better-auth-ui/react';
import { useIsMutating } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { SyntheticEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '#components/ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card.js';
import { Field, FieldDescription, FieldError, FieldGroup, FieldSeparator } from '#components/ui/field.js';
import { Input } from '#components/ui/input.js';
import { Spinner } from '#components/ui/spinner.js';
import { magicLinkPlugin } from '#utils/magic-link-plugin.js';
import { cn } from '#utils/ui.utils.js';
import { Label } from '#components/ui/label.js';
import { ProviderButtons } from '#components/auth/provider-buttons.js';
import type { SocialLayout } from '#components/auth/provider-buttons.js';
import { useAuthEmailDraft } from '#components/auth/auth-email-draft.js';

export type MagicLinkProps = {
  className?: string;
  socialLayout?: SocialLayout;
  socialPosition?: 'top' | 'bottom';
};

/**
 * Render a card-based sign-in form that sends an email magic link and optionally shows social provider buttons.
 *
 * @param props - Magic-link form rendering options.
 * @returns The magic-link sign-in UI as a JSX element
 */
export function MagicLink({ className, socialLayout, socialPosition = 'bottom' }: MagicLinkProps): React.JSX.Element {
  const {
    authClient,
    basePaths,
    baseURL,
    emailAndPassword,
    localization,
    plugins,
    redirectTo,
    socialProviders,
    viewPaths,
    Link,
  } = useAuth();
  const { localization: magicLinkLocalization } = useAuthPlugin(magicLinkPlugin);
  const { emailDraft, setEmailDraft } = useAuthEmailDraft();

  const [email, setEmail] = useState(emailDraft);
  const [isMagicLinkSubmitActive, setIsMagicLinkSubmitActive] = useState(false);

  useEffect(() => {
    if (!email && emailDraft) {
      setEmail(emailDraft);
    }
  }, [email, emailDraft]);

  const { mutate: signInMagicLink, isPending: signInMagicLinkPending } = useSignInMagicLink(
    authClient as MagicLinkAuthClient,
    {
      onSuccess: () => {
        toast.success(magicLinkLocalization.magicLinkSent);
        globalThis.setTimeout(() => {
          setIsMagicLinkSubmitActive(false);
        }, 250);
      },
      onError: () => {
        globalThis.setTimeout(() => {
          setIsMagicLinkSubmitActive(false);
        }, 250);
      },
    },
  );

  const signInMutating = useIsMutating({
    mutationKey: authMutationKeys.signIn.all,
  });
  const signUpMutating = useIsMutating({
    mutationKey: authMutationKeys.signUp.all,
  });
  const isPending = signInMutating + signUpMutating > 0;

  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
  }>({});

  const handleSubmit = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setIsMagicLinkSubmitActive(true);
    signInMagicLink({ email, callbackURL: `${baseURL}${redirectTo}` });
  };

  const showSeparator = socialProviders && socialProviders.length > 0;

  return (
    <Card className={cn('w-full max-w-sm', className)}>
      <CardHeader>
        <CardTitle className='text-xl'>{localization.auth.signIn}</CardTitle>
      </CardHeader>

      <CardContent>
        <div className='flex flex-col gap-6'>
          {socialPosition === 'top' && (
            <>
              {socialProviders && socialProviders.length > 0 && <ProviderButtons socialLayout={socialLayout} />}

              {showSeparator && (
                <FieldSeparator className='m-0 flex items-center text-xs *:data-[slot=field-separator-content]:bg-card'>
                  {localization.auth.or}
                </FieldSeparator>
              )}
            </>
          )}

          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field data-invalid={Boolean(fieldErrors.email)}>
                <Label htmlFor='email'>{localization.auth.email}</Label>

                <Input
                  id='email'
                  name='email'
                  type='email'
                  autoComplete='email'
                  value={email}
                  onChange={(event) => {
                    setEmail(event.currentTarget.value);
                    setEmailDraft(event.currentTarget.value);

                    setFieldErrors((previous) => ({
                      ...previous,
                      email: undefined,
                    }));
                  }}
                  placeholder={localization.auth.emailPlaceholder}
                  required
                  disabled={isPending}
                  onInvalid={(event) => {
                    event.preventDefault();

                    setFieldErrors((previous) => ({
                      ...previous,
                      email: event.currentTarget.validationMessage,
                    }));
                  }}
                  aria-invalid={Boolean(fieldErrors.email)}
                />

                <FieldError>{fieldErrors.email}</FieldError>
              </Field>

              <div className='flex flex-col gap-3'>
                <Button type='submit' disabled={isPending} aria-busy={isMagicLinkSubmitActive}>
                  {(isMagicLinkSubmitActive || signInMagicLinkPending) && <Spinner />}

                  {magicLinkLocalization.sendMagicLink}
                </Button>

                {plugins.flatMap((plugin) =>
                  (plugin.authButtons ?? []).map((AuthButton, index) => (
                    <AuthButton key={`${plugin.id}-${index.toString()}`} view='magicLink' />
                  )),
                )}
              </div>
            </FieldGroup>
          </form>

          {socialPosition === 'bottom' && (
            <>
              {showSeparator && (
                <FieldSeparator className='flex items-center text-xs *:data-[slot=field-separator-content]:bg-card'>
                  {localization.auth.or}
                </FieldSeparator>
              )}

              {socialProviders && socialProviders.length > 0 && <ProviderButtons socialLayout={socialLayout} />}
            </>
          )}
        </div>

        {emailAndPassword.enabled && (
          <div className='mt-4 flex w-full flex-col items-center gap-3'>
            <FieldDescription className='text-center'>
              {localization.auth.needToCreateAnAccount}{' '}
              <Link href={`${basePaths.auth}/${viewPaths.auth.signUp}`} className='underline underline-offset-4'>
                {localization.auth.signUp}
              </Link>
            </FieldDescription>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
