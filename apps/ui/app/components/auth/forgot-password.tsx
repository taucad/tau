'use client';

import { useAuth, useFetchOptions, useRequestPasswordReset } from '@better-auth-ui/react';
import { useEffect, useState } from 'react';
import type { SyntheticEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '#components/ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card.js';
import { Field, FieldDescription, FieldError, FieldGroup } from '#components/ui/field.js';
import { Input } from '#components/ui/input.js';
import { Spinner } from '#components/ui/spinner.js';
import { cn } from '#utils/ui.utils.js';
import { getCaptchaComponentFromPlugins } from '#utils/auth-plugin.js';
import { Label } from '#components/ui/label.js';
import { useAuthEmailDraft } from '#components/auth/auth-email-draft.js';

export type ForgotPasswordProps = {
  className?: string;
};

const toPasswordResetErrorMessage = (error: unknown): string => {
  if (typeof error !== 'object' || error === null) {
    return 'Could not send reset link';
  }

  const candidate = error as { error?: { message?: unknown }; message?: unknown };
  if (typeof candidate.error?.message === 'string') {
    return candidate.error.message;
  }

  if (typeof candidate.message === 'string') {
    return candidate.message;
  }

  return 'Could not send reset link';
};

/**
 * Render a card-based "Forgot Password" form that sends a password-reset email.
 *
 * The form displays an email input, submit button, and a link back to sign-in.
 * Toasts are displayed on success or error via the `useForgotPassword` hook.
 *
 * @param className - Optional additional CSS class names applied to the card
 * @returns The forgot-password form UI as a JSX element
 */
export function ForgotPassword({ className }: ForgotPasswordProps): React.JSX.Element {
  const { authClient, basePaths, baseURL, localization, plugins, viewPaths, Link } = useAuth();
  const { emailDraft, setEmailDraft } = useAuthEmailDraft();

  const { fetchOptions, resetFetchOptions } = useFetchOptions();
  const [email, setEmail] = useState(emailDraft);

  useEffect(() => {
    if (!email && emailDraft) {
      setEmail(emailDraft);
    }
  }, [email, emailDraft]);

  const { mutate: requestPasswordReset, isPending } = useRequestPasswordReset(authClient, {
    onError: (error: unknown) => {
      toast.error(toPasswordResetErrorMessage(error));
      resetFetchOptions();
    },
    onSuccess: () => toast.success(localization.auth.passwordResetEmailSent),
  });

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    requestPasswordReset({
      email,
      redirectTo: `${baseURL}${basePaths.auth}/${viewPaths.auth.resetPassword}`,
      fetchOptions,
    });
  }

  const Captcha = getCaptchaComponentFromPlugins(plugins);

  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
  }>({});

  return (
    <Card className={cn('w-full max-w-sm', className)}>
      <CardHeader>
        <CardTitle className='text-xl font-semibold'>{localization.auth.forgotPassword}</CardTitle>
      </CardHeader>

      <CardContent>
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
                placeholder={localization.auth.emailPlaceholder}
                required
                disabled={isPending}
                onChange={(event) => {
                  setEmail(event.currentTarget.value);
                  setEmailDraft(event.currentTarget.value);
                  setFieldErrors((previous) => ({
                    ...previous,
                    email: undefined,
                  }));
                }}
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

            {Captcha && <div className='flex justify-center'>{Captcha}</div>}

            <div className='flex flex-col gap-3'>
              <Button type='submit' disabled={isPending}>
                {isPending && <Spinner />}

                {localization.auth.sendResetLink}
              </Button>
            </div>
          </FieldGroup>
        </form>

        <div className='mt-4 flex w-full flex-col items-center gap-3'>
          <FieldDescription className='text-center'>
            {localization.auth.rememberYourPassword}{' '}
            <Link href={`${basePaths.auth}/${viewPaths.auth.signIn}`} className='underline underline-offset-4'>
              {localization.auth.signIn}
            </Link>
          </FieldDescription>
        </div>
      </CardContent>
    </Card>
  );
}
