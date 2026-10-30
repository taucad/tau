'use client';

import {
  useAuth,
  useChangePassword,
  useListAccounts,
  useRequestPasswordReset,
  useSession,
} from '@better-auth-ui/react';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import type { SyntheticEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@taucad/ui/components/button';
import { Field, FieldError } from '@taucad/ui/components/field';
import { Input } from '@taucad/ui/components/input';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@taucad/ui/components/input-group';
import { Label } from '@taucad/ui/components/label';
import { Skeleton } from '@taucad/ui/components/skeleton';
import { Spinner } from '#components/ui/spinner.js';
import { SettingsGroup, SettingsRow } from '#components/settings/settings-item.js';
import { authErrorMessage } from '#utils/auth-error.utils.js';

export type ChangePasswordProps = {
  className?: string;
};

/**
 * Render the password group: a form for changing the authenticated user's password.
 *
 * When the user has a credential account, displays fields for current password,
 * new password, and optionally confirm password. When the user only has social
 * accounts, displays a prompt to set a password via the reset flow.
 *
 * @returns A JSX element containing the change-password or set-password group
 */
export function ChangePassword({ className }: ChangePasswordProps): React.JSX.Element {
  const { authClient, emailAndPassword, localization } = useAuth();
  const { data: session } = useSession(authClient);
  const { data: accounts, isPending: isAccountsPending } = useListAccounts(authClient);

  const hasCredentialAccount = accounts?.some((account) => account.providerId === 'credential');

  if (!isAccountsPending && !hasCredentialAccount) {
    return <SetPassword className={className} />;
  }

  return (
    <ChangePasswordForm
      className={className}
      emailAndPassword={emailAndPassword}
      localization={localization}
      session={isAccountsPending ? undefined : session}
    />
  );
}

function SetPassword({ className }: { className?: string }) {
  const { authClient, localization } = useAuth();
  const { data: session } = useSession(authClient);

  const { mutate: requestPasswordReset, isPending } = useRequestPasswordReset(authClient, {
    onSuccess: () => toast.success(localization.auth.passwordResetEmailSent),
  });

  const handleSetPassword = () => {
    if (!session) {
      return;
    }

    requestPasswordReset({ email: session.user.email });
  };

  return (
    <SettingsGroup title='Password' className={className}>
      <SettingsRow
        title={localization.settings.setPassword}
        description={localization.settings.setPasswordDescription}
        control={
          <Button variant='outline' size='sm' disabled={isPending || !session} onClick={handleSetPassword}>
            {isPending && <Spinner />}
            {localization.auth.sendResetLink}
          </Button>
        }
      />
    </SettingsGroup>
  );
}

function ChangePasswordForm({
  className,
  emailAndPassword,
  localization,
  session,
}: {
  className?: string;
  emailAndPassword: ReturnType<typeof useAuth>['emailAndPassword'];
  localization: ReturnType<typeof useAuth>['localization'];
  session: ReturnType<typeof useSession>['data'];
}) {
  const { authClient } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const { mutate: changePassword, isPending } = useChangePassword(authClient, {
    onError: (error) => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.error(authErrorMessage(error));
    },
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success(localization.settings.changePasswordSuccess);
    },
  });

  const [isNewPasswordVisible, setIsNewPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<{
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  }>({});

  const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (emailAndPassword.confirmPassword && newPassword !== confirmPassword) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.error(localization.auth.passwordsDoNotMatch);
      return;
    }

    changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
  };

  return (
    <SettingsGroup title='Password' className={className}>
      <form onSubmit={handleSubmit} className='flex flex-col gap-4 py-4'>
        <Field data-invalid={Boolean(fieldErrors.currentPassword)}>
          <Label htmlFor='currentPassword'>{localization.settings.currentPassword}</Label>

          {session ? (
            <Input
              id='currentPassword'
              name='currentPassword'
              type='password'
              autoComplete='current-password'
              placeholder={localization.settings.currentPasswordPlaceholder}
              value={currentPassword}
              onChange={(event) => {
                setCurrentPassword(event.target.value);

                setFieldErrors((previous) => ({
                  ...previous,
                  currentPassword: undefined,
                }));
              }}
              disabled={isPending}
              required
              onInvalid={(event) => {
                event.preventDefault();

                setFieldErrors((previous) => ({
                  ...previous,
                  currentPassword: (event.target as HTMLInputElement).validationMessage,
                }));
              }}
              aria-invalid={Boolean(fieldErrors.currentPassword)}
            />
          ) : (
            <Skeleton>
              <Input className='invisible' />
            </Skeleton>
          )}

          <FieldError>{fieldErrors.currentPassword}</FieldError>
        </Field>

        <Field data-invalid={Boolean(fieldErrors.newPassword)}>
          <Label htmlFor='newPassword'>{localization.auth.newPassword}</Label>

          {session ? (
            <InputGroup>
              <InputGroupInput
                id='newPassword'
                name='newPassword'
                type={isNewPasswordVisible ? 'text' : 'password'}
                autoComplete='new-password'
                placeholder={localization.auth.newPasswordPlaceholder}
                value={newPassword}
                onChange={(event) => {
                  setNewPassword(event.target.value);

                  setFieldErrors((previous) => ({
                    ...previous,
                    newPassword: undefined,
                  }));
                }}
                minLength={emailAndPassword.minPasswordLength}
                maxLength={emailAndPassword.maxPasswordLength}
                disabled={isPending}
                required
                onInvalid={(event) => {
                  event.preventDefault();
                  setFieldErrors((previous) => ({
                    ...previous,
                    newPassword: (event.target as HTMLInputElement).validationMessage,
                  }));
                }}
                aria-invalid={Boolean(fieldErrors.newPassword)}
              />

              <InputGroupAddon align='inline-end'>
                <InputGroupButton
                  size='icon-xs'
                  aria-label={isNewPasswordVisible ? localization.auth.hidePassword : localization.auth.showPassword}
                  onClick={() => {
                    setIsNewPasswordVisible(!isNewPasswordVisible);
                  }}
                  disabled={isPending}
                >
                  {isNewPasswordVisible ? <EyeOff /> : <Eye />}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          ) : (
            <Skeleton>
              <Input className='invisible' />
            </Skeleton>
          )}

          <FieldError>{fieldErrors.newPassword}</FieldError>
        </Field>

        {emailAndPassword.confirmPassword && (
          <Field data-invalid={Boolean(fieldErrors.confirmPassword)}>
            <Label htmlFor='confirmPassword'>{localization.auth.confirmPassword}</Label>

            {session ? (
              <InputGroup>
                <InputGroupInput
                  id='confirmPassword'
                  name='confirmPassword'
                  type={isConfirmPasswordVisible ? 'text' : 'password'}
                  autoComplete='new-password'
                  placeholder={localization.auth.confirmPasswordPlaceholder}
                  value={confirmPassword}
                  onChange={(event) => {
                    setConfirmPassword(event.target.value);

                    setFieldErrors((previous) => ({
                      ...previous,
                      confirmPassword: undefined,
                    }));
                  }}
                  minLength={emailAndPassword.minPasswordLength}
                  maxLength={emailAndPassword.maxPasswordLength}
                  disabled={isPending}
                  required
                  onInvalid={(event) => {
                    event.preventDefault();

                    setFieldErrors((previous) => ({
                      ...previous,
                      confirmPassword: (event.target as HTMLInputElement).validationMessage,
                    }));
                  }}
                  aria-invalid={Boolean(fieldErrors.confirmPassword)}
                />

                <InputGroupAddon align='inline-end'>
                  <InputGroupButton
                    size='icon-xs'
                    aria-label={
                      isConfirmPasswordVisible ? localization.auth.hidePassword : localization.auth.showPassword
                    }
                    onClick={() => {
                      setIsConfirmPasswordVisible(!isConfirmPasswordVisible);
                    }}
                    disabled={isPending}
                  >
                    {isConfirmPasswordVisible ? <EyeOff /> : <Eye />}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            ) : (
              <Skeleton>
                <Input className='invisible' />
              </Skeleton>
            )}

            <FieldError>{fieldErrors.confirmPassword}</FieldError>
          </Field>
        )}
        <div className='flex justify-end'>
          <Button type='submit' size='sm' disabled={isPending || !session}>
            {isPending && <Spinner />}

            {localization.settings.updatePassword}
          </Button>
        </div>
      </form>
    </SettingsGroup>
  );
}
