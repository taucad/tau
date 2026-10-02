'use client';

import { authMutationKeys, parseAdditionalFieldValue } from '@better-auth-ui/core';
import { useAuth, useFetchOptions, useSignUpEmail } from '@better-auth-ui/react';
import { useIsMutating } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { SyntheticEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '#components/ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card.js';
import { Field, FieldDescription, FieldError, FieldGroup, FieldSeparator } from '#components/ui/field.js';
import { Input } from '#components/ui/input.js';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '#components/ui/input-group.js';
import { Spinner } from '#components/ui/spinner.js';
import { cn } from '#utils/ui.utils.js';
import { getCaptchaComponentFromPlugins } from '#utils/auth-plugin.js';
import { Label } from '#components/ui/label.js';
import { AdditionalField } from '#components/auth/additional-field.js';
import { ProviderButtons } from '#components/auth/provider-buttons.js';
import type { SocialLayout } from '#components/auth/provider-buttons.js';
import { useAuthEmailDraft } from '#components/auth/auth-email-draft.js';

export type SignUpProps = {
  className?: string;
  socialLayout?: SocialLayout;
  socialPosition?: 'top' | 'bottom';
};

/**
 * Renders a sign-up form with name, email, and password fields, optional social provider buttons, and submission handling.
 *
 * Submits credentials to the configured auth client and handles the response:
 * - If email verification is required, shows a notification and navigates to sign-in
 * - On success, refreshes the session and navigates to the configured redirect path
 * - On failure, displays error toasts
 * - Manages a pending state while the request is in-flight
 *
 * @param className - Additional CSS classes applied to the outer container
 * @param socialLayout - Social layout to apply to the component
 * @param socialPosition - Social position to apply to the component
 * @returns The sign-up form React element.
 */
export function SignUp({ className, socialLayout, socialPosition = 'bottom' }: SignUpProps) {
  const {
    additionalFields,
    authClient,
    basePaths,
    baseURL,
    emailAndPassword,
    localization,
    plugins,
    redirectTo,
    socialProviders,
    viewPaths,
    navigate,
    Link,
  } = useAuth();

  const { fetchOptions, resetFetchOptions } = useFetchOptions();
  const { emailDraft, setEmailDraft } = useAuthEmailDraft();

  const [email, setEmail] = useState(emailDraft);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (!email && emailDraft) {
      setEmail(emailDraft);
    }
  }, [email, emailDraft]);

  const { mutate: signUpEmail, isPending: signUpEmailPending } = useSignUpEmail(authClient, {
    onError: (error) => {
      setPassword('');
      setConfirmPassword('');
      toast.error(error.error?.message ?? error.message);
      resetFetchOptions();
    },
    onSuccess: () => {
      if (emailAndPassword?.requireEmailVerification) {
        toast.success(localization.auth.verifyYourEmail);
        navigate({ to: `${basePaths.auth}/${viewPaths.auth.signIn}` });
      } else {
        navigate({ to: redirectTo });
      }
    },
  });

  const signInMutating = useIsMutating({
    mutationKey: authMutationKeys.signIn.all,
  });
  const signUpMutating = useIsMutating({
    mutationKey: authMutationKeys.signUp.all,
  });
  const isPending = signInMutating + signUpMutating > 0;

  const Captcha = getCaptchaComponentFromPlugins(plugins);

  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});

  const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);
    // `emailAndPassword.name === false` hides the name field and submits "".
    const name = (formData.get('name') as string | undefined) ?? '';

    if (emailAndPassword?.confirmPassword && password !== confirmPassword) {
      toast.error(localization.auth.passwordsDoNotMatch);
      setPassword('');
      setConfirmPassword('');
      return;
    }

    const additionalFieldValues: Record<string, unknown> = {};

    for (const field of additionalFields ?? []) {
      if (!field.signUp || field.readOnly) {
        continue;
      }
      const value = parseAdditionalFieldValue(field, formData.get(field.name) as string | undefined);

      if (field.validate) {
        try {
          // oxlint-disable-next-line no-await-in-loop -- stop on first validation failure; order matters for UX
          await field.validate(value);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : String(error));
          return;
        }
      }

      if (value !== undefined) {
        additionalFieldValues[field.name] = value;
      }
    }

    signUpEmail({
      name,
      email,
      password,
      callbackURL: `${baseURL}${redirectTo}`,
      ...additionalFieldValues,
      fetchOptions,
    });
  };

  const showSeparator = emailAndPassword?.enabled && socialProviders && socialProviders.length > 0;

  return (
    <Card className={cn('w-full max-w-sm', className)}>
      <CardHeader>
        <CardTitle className='text-xl font-semibold'>{localization.auth.signUp}</CardTitle>
      </CardHeader>

      <CardContent>
        <div className='flex flex-col gap-6'>
          {socialPosition === 'top' && (
            <>
              {socialProviders && socialProviders.length > 0 && <ProviderButtons socialLayout={socialLayout} />}

              {showSeparator && (
                <FieldSeparator className='flex items-center text-xs *:data-[slot=field-separator-content]:bg-card'>
                  {localization.auth.or}
                </FieldSeparator>
              )}
            </>
          )}

          {emailAndPassword?.enabled && (
            <form onSubmit={handleSubmit}>
              <FieldGroup>
                {emailAndPassword.name !== false && (
                  <Field data-invalid={Boolean(fieldErrors.name)}>
                    <Label htmlFor='name'>{localization.auth.name}</Label>

                    <Input
                      id='name'
                      name='name'
                      type='text'
                      autoComplete='name'
                      placeholder={localization.auth.namePlaceholder}
                      required
                      disabled={isPending}
                      onChange={() => {
                        setFieldErrors((previous) => ({
                          ...previous,
                          name: undefined,
                        }));
                      }}
                      onInvalid={(e) => {
                        e.preventDefault();

                        setFieldErrors((previous) => ({
                          ...previous,
                          name: (e.target as HTMLInputElement).validationMessage,
                        }));
                      }}
                      aria-invalid={Boolean(fieldErrors.name)}
                    />

                    <FieldError>{fieldErrors.name}</FieldError>
                  </Field>
                )}

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
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setEmailDraft(e.target.value);
                      setFieldErrors((previous) => ({
                        ...previous,
                        email: undefined,
                      }));
                    }}
                    onInvalid={(e) => {
                      e.preventDefault();

                      setFieldErrors((previous) => ({
                        ...previous,
                        email: (e.target as HTMLInputElement).validationMessage,
                      }));
                    }}
                    aria-invalid={Boolean(fieldErrors.email)}
                  />

                  <FieldError>{fieldErrors.email}</FieldError>
                </Field>

                {additionalFields?.map(
                  (field) =>
                    field.signUp === 'above' && (
                      <AdditionalField key={field.name} name={field.name} field={field} isPending={isPending} />
                    ),
                )}

                <Field data-invalid={Boolean(fieldErrors.password)}>
                  <Label htmlFor='password'>{localization.auth.password}</Label>

                  <InputGroup>
                    <InputGroupInput
                      id='password'
                      name='password'
                      type={isPasswordVisible ? 'text' : 'password'}
                      autoComplete='new-password'
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setFieldErrors((previous) => ({
                          ...previous,
                          password: undefined,
                        }));
                      }}
                      placeholder={localization.auth.passwordPlaceholder}
                      required
                      minLength={emailAndPassword?.minPasswordLength}
                      maxLength={emailAndPassword?.maxPasswordLength}
                      disabled={isPending}
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
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);

                          setFieldErrors((previous) => ({
                            ...previous,
                            confirmPassword: undefined,
                          }));
                        }}
                        placeholder={localization.auth.confirmPasswordPlaceholder}
                        required
                        minLength={emailAndPassword?.minPasswordLength}
                        maxLength={emailAndPassword?.maxPasswordLength}
                        disabled={isPending}
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
                          title={
                            isConfirmPasswordVisible ? localization.auth.hidePassword : localization.auth.showPassword
                          }
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

                {additionalFields?.map(
                  (field) =>
                    field.signUp &&
                    field.signUp !== 'above' && (
                      <AdditionalField key={field.name} name={field.name} field={field} isPending={isPending} />
                    ),
                )}

                {Captcha && <div className='flex justify-center'>{Captcha}</div>}

                <div className='flex flex-col gap-3'>
                  <Button type='submit' disabled={isPending}>
                    {signUpEmailPending && <Spinner />}

                    {localization.auth.signUp}
                  </Button>

                  {plugins.flatMap((plugin) =>
                    (plugin.authButtons ?? []).map((AuthButton, index) => (
                      <AuthButton key={`${plugin.id}-${index.toString()}`} view='signUp' />
                    )),
                  )}
                </div>
              </FieldGroup>
            </form>
          )}

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

        {emailAndPassword?.enabled && (
          <div className='mt-4 flex w-full flex-col items-center gap-3'>
            <FieldDescription className='text-center'>
              {localization.auth.alreadyHaveAnAccount}{' '}
              <Link href={`${basePaths.auth}/${viewPaths.auth.signIn}`} className='underline underline-offset-4'>
                {localization.auth.signIn}
              </Link>
            </FieldDescription>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
