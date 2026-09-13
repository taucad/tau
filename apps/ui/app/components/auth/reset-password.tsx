'use client';

import { useAuth, useResetPassword } from '@better-auth-ui/react';
import { Eye, EyeOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { SyntheticEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '#components/ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card.js';
import { Field, FieldDescription, FieldError, FieldGroup } from '#components/ui/field.js';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '#components/ui/input-group.js';
import { Spinner } from '#components/ui/spinner.js';
import { cn } from '#utils/ui.utils.js';
import { Label } from '#components/ui/label.js';

export type ResetPasswordProps = {
  className?: string;
};

/**
 * Render a password reset form that validates the reset token from the URL, accepts a new password (and optional confirmation), and submits it to the auth client.
 *
 * The component checks for a `token` query parameter on mount and, if missing, shows an error toast and navigates to the sign-in page. It exposes per-field validation messages, toggles for password visibility, and disables inputs while the reset request is pending.
 *
 * @returns The password reset form UI ready to be mounted in the app layout.
 */
export function ResetPassword({ className }: ResetPasswordProps) {
  const { authClient, basePaths, emailAndPassword, localization, viewPaths, navigate, Link } = useAuth();

  const { mutate: resetPassword, isPending } = useResetPassword(authClient, {
    onSuccess: () => {
      toast.success(localization.auth.passwordResetSuccess);
      navigate({ to: `${basePaths.auth}/${viewPaths.auth.signIn}` });
    },
  });

  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<{
    password?: string;
    confirmPassword?: string;
  }>({});

  useEffect(() => {
    const searchParams = new URLSearchParams(globalThis.location.search);
    const token = searchParams.get('token')!;

    if (!token) {
      toast.error(localization.auth.invalidResetPasswordToken);
      navigate({ to: `${basePaths.auth}/${viewPaths.auth.signIn}` });
    }
  }, [basePaths.auth, localization.auth.invalidResetPasswordToken, viewPaths.auth.signIn, navigate]);

  function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();

    const searchParams = new URLSearchParams(globalThis.location.search);
    const token = searchParams.get('token')!;

    if (!token) {
      toast.error(localization.auth.invalidResetPasswordToken);
      navigate({ to: `${basePaths.auth}/${viewPaths.auth.signIn}` });
      return;
    }

    const formData = new FormData(e.currentTarget);
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;

    if (emailAndPassword?.confirmPassword && password !== confirmPassword) {
      toast.error(localization.auth.passwordsDoNotMatch);
      return;
    }

    resetPassword({ token, newPassword: password });
  }

  return (
    <Card className={cn('w-full max-w-sm', className)}>
      <CardHeader>
        <CardTitle className='text-xl font-semibold'>{localization.auth.resetPassword}</CardTitle>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field data-invalid={Boolean(fieldErrors.password)}>
              <Label htmlFor='password'>{localization.auth.password}</Label>

              <InputGroup>
                <InputGroupInput
                  id='password'
                  name='password'
                  type={isPasswordVisible ? 'text' : 'password'}
                  autoComplete='new-password'
                  placeholder={localization.auth.newPasswordPlaceholder}
                  required
                  minLength={emailAndPassword?.minPasswordLength}
                  maxLength={emailAndPassword?.maxPasswordLength}
                  disabled={isPending}
                  onChange={() => {
                    setFieldErrors((previous) => ({
                      ...previous,
                      password: undefined,
                    }));
                  }}
                  onInvalid={(e) => {
                    e.preventDefault();

                    setFieldErrors((previous) => ({
                      ...previous,
                      password: (e.target as HTMLInputElement).validationMessage,
                    }));
                  }}
                  aria-invalid={Boolean(fieldErrors.password)}
                />

                <InputGroupAddon align='inline-end'>
                  <InputGroupButton
                    aria-label={isPasswordVisible ? localization.auth.hidePassword : localization.auth.showPassword}
                    title={isPasswordVisible ? localization.auth.hidePassword : localization.auth.showPassword}
                    onClick={() => {
                      setIsPasswordVisible(!isPasswordVisible);
                    }}
                  >
                    {isPasswordVisible ? <EyeOff /> : <Eye />}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>

              <FieldError>{fieldErrors.password}</FieldError>
            </Field>

            {emailAndPassword?.confirmPassword && (
              <Field data-invalid={Boolean(fieldErrors.confirmPassword)}>
                <Label htmlFor='confirmPassword'>{localization.auth.confirmPassword}</Label>

                <InputGroup>
                  <InputGroupInput
                    id='confirmPassword'
                    name='confirmPassword'
                    type={isConfirmPasswordVisible ? 'text' : 'password'}
                    autoComplete='new-password'
                    placeholder={localization.auth.confirmPasswordPlaceholder}
                    required
                    minLength={emailAndPassword?.minPasswordLength}
                    maxLength={emailAndPassword?.maxPasswordLength}
                    disabled={isPending}
                    onChange={() => {
                      setFieldErrors((previous) => ({
                        ...previous,
                        confirmPassword: undefined,
                      }));
                    }}
                    onInvalid={(e) => {
                      e.preventDefault();

                      setFieldErrors((previous) => ({
                        ...previous,
                        confirmPassword: (e.target as HTMLInputElement).validationMessage,
                      }));
                    }}
                    aria-invalid={Boolean(fieldErrors.confirmPassword)}
                  />

                  <InputGroupAddon align='inline-end'>
                    <InputGroupButton
                      aria-label={
                        isConfirmPasswordVisible ? localization.auth.hidePassword : localization.auth.showPassword
                      }
                      title={isConfirmPasswordVisible ? localization.auth.hidePassword : localization.auth.showPassword}
                      onClick={() => {
                        setIsConfirmPasswordVisible(!isConfirmPasswordVisible);
                      }}
                    >
                      {isConfirmPasswordVisible ? <EyeOff /> : <Eye />}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>

                <FieldError>{fieldErrors.confirmPassword}</FieldError>
              </Field>
            )}

            <div className='flex flex-col gap-3'>
              <Button type='submit' disabled={isPending}>
                {isPending && <Spinner />}

                {localization.auth.resetPassword}
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
